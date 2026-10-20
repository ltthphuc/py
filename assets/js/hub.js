/* Lớp "Hub": toàn bộ quy ước dữ liệu giữa học sinh và giáo viên, viết một lần trên giao diện db (LocalDB / FirebaseDB).

   Cấu trúc dữ liệu (rooms/<mã lớp>/…):
     meta                      {title, created, owner}          giáo viên tạo lớp
     students/<uid>            trạng thái trực tiếp của học sinh (học sinh ghi)
     ctl/<uid>                 {locked, edit:{code,seq}}         giáo viên khóa / sửa code học sinh
     cmd/<uid>/<id>            lệnh giáo viên → học sinh: run, stop, input, notify
     subs/<uid>/<id>           bài nộp (mỗi lần nộp một mục, giữ cả lịch sử)
     files/<id>, filedata/<id> bài tập giáo viên chia sẻ (thông tin / nội dung base64)                    */
(function (G) {
  'use strict';
  const U = G.U;
  const base = (room) => 'rooms/' + room;
  const safeJSON = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };

  const Hub = {
    config() { return G.PYLAB_CONFIG || {}; },
    createDB() {
      const cfg = Hub.config();
      if (cfg.backend === 'firebase') return new G.FirebaseDB(cfg.firebase);
      return new G.LocalDB();
    },
    isDemo() { return Hub.config().backend !== 'firebase'; },
  };

  /* ===================================================================== HỌC SINH */
  class StudentConn {
    constructor(db, room) { this.db = db; this.room = room; this.b = base(room); this.uid = null; this.offs = []; this.connState = undefined; this._conn = null; }

    async join(meta) {
      const db = this.db;
      this.uid = await db.signInAnonymously();
      const m = await db.get(this.b + '/meta');
      if (!m) throw new Error('Mã lớp “' + this.room + '” chưa tồn tại. Hãy hỏi giáo viên mã lớp chính xác.');
      this.title = m.title || this.room;
      this.me = this.b + '/students/' + this.uid;
      try { await db.remove(this.b + '/cmd/' + this.uid); } catch (e) { /* bỏ qua */ }
      await db.update(this.me, Object.assign({ id: this.uid, online: true, dev: U.isMobile() ? 'mobile' : 'desktop' }, meta));
      this.offs.push(db.onConnection((c) => {
        this.connState = c;
        if (c) { db.onDisconnectSet(this.me + '/online', false); db.update(this.me, { online: true }).catch(() => {}); }
        if (this._conn) this._conn(c);
      }));
      return m;
    }
    onConn(fn) { this._conn = fn; if (this.connState !== undefined) fn(this.connState); }
    setState(patch) { return this.db.update(this.me, patch); }
    onCmd(fn) {
      this.offs.push(this.db.on(this.b + '/cmd/' + this.uid, 'child_added', (v, k) => {
        if (v) fn(v);
        this.db.remove(this.b + '/cmd/' + this.uid + '/' + k).catch(() => {});
      }));
    }
    onCtl(fn) { this.offs.push(this.db.on(this.b + '/ctl/' + this.uid, 'value', (v) => fn(v || {}))); }
    onFiles(fn) {
      this.offs.push(this.db.on(this.b + '/files', 'value', (v) => {
        fn(Object.keys(v || {}).map((id) => Object.assign({ id }, v[id])).sort((a, c) => (a.ts || 0) - (c.ts || 0)));
      }));
    }
    fileData(id) { return this.db.get(this.b + '/filedata/' + id); }
    async submit(sub) {
      const db = this.db, file = U.fileNameFor(sub);
      const key = await db.push(this.b + '/subs/' + this.uid, { may: sub.may, name: sub.name, lop: sub.lop, bai: sub.bai, code: sub.code, ts: db.serverTime(), dev: U.isMobile() ? 'mobile' : 'desktop' });
      await db.update(this.me, { submitted_at: db.serverTime(), submit_file: file });
      return { file, key };
    }
    async leave() {
      this.offs.forEach((f) => { try { f(); } catch (e) { /* bỏ qua */ } });
      this.offs = [];
      try { await this.db.update(this.me, { online: false }); } catch (e) { /* bỏ qua */ }
    }
  }

  /* ===================================================================== GIÁO VIÊN */
  class TeacherConn {
    constructor(db, room) { this.db = db; this.room = room; this.b = base(room); this.offs = []; this.raw = {}; this.ctl = {}; this.typed = {}; this.prevCode = {}; }

    async open(opts) {
      const db = this.db; opts = opts || {};
      this.uid = db.currentUid();
      let m = await db.get(this.b + '/meta');
      if (!m) {
        if (!opts.create) throw new Error('Lớp “' + this.room + '” chưa có. Bấm “Tạo lớp mới” để tạo.');
        m = { title: opts.title || this.room, created: db.serverTime(), owner: this.uid };
        await db.set(this.b + '/meta', m);
      }
      this.meta = m;
      return m;
    }

    _student(id) {
      const v = this.raw[id]; if (!v) return null;
      const c = this.ctl[id] || {};
      return {
        id, may: v.may || '', name: v.name || '', lop: v.lop || '', bai: v.bai || '', code: v.code || '',
        segs: typeof v.segs === 'string' ? safeJSON(v.segs, []) : (v.segs || []),
        status: v.status || 'idle', errLine: v.errLine | 0, waiting: !!v.waiting, online: !!v.online,
        locked: !!c.locked, last_code: this.typed[id] || 0, submitted_at: v.submitted_at || 0, submit_file: v.submit_file || '', dev: v.dev || '',
      };
    }
    onStudents(fn) {
      const emit = (id) => { const s = this._student(id); if (s) fn(id, s); };
      const upsert = (v, k, first) => {
        if (first === false && this.prevCode[k] !== undefined && this.prevCode[k] !== (v && v.code)) this.typed[k] = Date.now();
        this.prevCode[k] = v && v.code; this.raw[k] = v; emit(k);
      };
      let initial = true; setTimeout(() => { initial = false; }, 800);
      this.offs.push(this.db.on(this.b + '/students', 'child_added', (v, k) => upsert(v, k, initial)));
      this.offs.push(this.db.on(this.b + '/students', 'child_changed', (v, k) => upsert(v, k, false)));
      this.offs.push(this.db.on(this.b + '/students', 'child_removed', (v, k) => { delete this.raw[k]; delete this.prevCode[k]; fn(k, null); }));
      this.offs.push(this.db.on(this.b + '/ctl', 'value', (v) => { this.ctl = v || {}; Object.keys(this.raw).forEach(emit); }));
    }
    onSubs(fn) {
      this.offs.push(this.db.on(this.b + '/subs', 'value', (v) => {
        const list = [];
        for (const uid of Object.keys(v || {})) for (const key of Object.keys(v[uid] || {})) list.push(Object.assign({ uid, key }, v[uid][key]));
        list.sort((a, c) => (c.ts || 0) - (a.ts || 0));
        fn(list);
      }));
    }
    onFiles(fn) {
      this.offs.push(this.db.on(this.b + '/files', 'value', (v) => {
        fn(Object.keys(v || {}).map((id) => Object.assign({ id }, v[id])).sort((a, c) => (c.ts || 0) - (a.ts || 0)));
      }));
    }
    cmd(sid, c) { return this.db.push(this.b + '/cmd/' + sid, Object.assign({ ts: this.db.serverTime() }, c)); }
    setLock(sid, on) { return on ? this.db.update(this.b + '/ctl/' + sid, { locked: true }) : this.db.remove(this.b + '/ctl/' + sid); }
    setEdit(sid, code) { return this.db.update(this.b + '/ctl/' + sid, { edit: { code, seq: Date.now() } }); }
    removeStudent(sid) {
      return Promise.all(['students', 'ctl', 'cmd'].map((n) => this.db.remove(this.b + '/' + n + '/' + sid)));
    }
    async notifyMany(ids, text) { for (const id of ids) await this.cmd(id, { t: 'notify', text }); }
    async addFile(name, b64, size) {
      const id = U.rid();
      await this.db.set(this.b + '/filedata/' + id, b64);
      await this.db.set(this.b + '/files/' + id, { name, size, ts: this.db.serverTime() });
      return id;
    }
    delFile(id) { return Promise.all([this.db.remove(this.b + '/files/' + id), this.db.remove(this.b + '/filedata/' + id)]); }
    fileData(id) { return this.db.get(this.b + '/filedata/' + id); }
    deleteSub(uid, key) { return this.db.remove(this.b + '/subs/' + uid + '/' + key); }
    close() { this.offs.forEach((f) => { try { f(); } catch (e) { /* bỏ qua */ } }); this.offs = []; }
  }

  Hub.StudentConn = StudentConn;
  Hub.TeacherConn = TeacherConn;
  G.Hub = Hub;
})(window);
