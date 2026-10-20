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
    /* Danh sách lớp do giáo viên tạo (thư mục chung classes/<mã lớp>) để học sinh CHỌN thay vì tự gõ mã */
    async listClasses(db) {
      const v = (await db.get('classes')) || {};
      return Object.keys(v).map((k) => ({ room: k, title: (v[k] && v[k].title) || k, ts: (v[k] && v[k].ts) || 0 }))
        .sort((a, b) => a.title.localeCompare(b.title, 'vi'));
    },
    async deleteClass(db, room) { await db.remove('rooms/' + room); await db.remove('classes/' + room); },
  };

  /* ===================================================================== HỌC SINH */
  /* File chia sẻ lớn được cắt thành nhiều đoạn (mỗi đoạn ~700 KB gốc) lưu ở filedata/<id>/c0, c1…; file cũ (1 chuỗi) vẫn đọc được. */
  const FILE_CHUNK = 700 * 1024;
  async function readFileBlob(db, base, f, onProgress) {
    const parts = [];
    if (f.chunks) {
      for (let k = 0; k < f.chunks; k++) {
        const b64 = await db.get(base + '/filedata/' + f.id + '/c' + k);
        if (typeof b64 !== 'string') throw new Error('thiếu đoạn ' + (k + 1) + '/' + f.chunks);
        parts.push(U.b64ToBytes(b64)); if (onProgress) onProgress((k + 1) / f.chunks);
      }
    } else {
      const b64 = await db.get(base + '/filedata/' + f.id);
      if (typeof b64 !== 'string') throw new Error('file trống');
      parts.push(U.b64ToBytes(b64));
    }
    return new Blob(parts);
  }
  class StudentConn {
    constructor(db, room) { this.db = db; this.room = room; this.b = base(room); this.uid = null; this.offs = []; this.connState = undefined; this._conn = null; }

    async join(meta) {
      const db = this.db;
      this.uid = await db.signInAnonymously();
      const m = await db.get(this.b + '/meta');
      if (!m) {
        const publicDemo = Hub.isDemo() && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
        throw new Error('Mã lớp “' + this.room + '” chưa tồn tại. Hãy hỏi giáo viên mã lớp chính xác.' +
          (publicDemo ? ' (Lưu ý: trang này đang ở CHẾ ĐỘ THỬ, chưa nối Firebase nên chỉ thấy lớp tạo trên cùng một trình duyệt. Giáo viên cần cấu hình Firebase để học sinh vào được từ máy khác.)' : ''));
      }
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
    fileBlob(f, onProgress) { return readFileBlob(this.db, this.b, f, onProgress); }
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
      /* đăng ký lớp vào danh sách chung để học sinh chọn (cả lớp tạo từ trước) */
      try { if (!(await db.get('classes/' + this.room))) await db.set('classes/' + this.room, { title: m.title || this.room, ts: db.serverTime() }); } catch (e) { /* bỏ qua */ }
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
    async addFile(file, onProgress) {
      const id = U.rid(), n = Math.max(1, Math.ceil(file.size / FILE_CHUNK));
      const put = async (k) => {
        const b64 = U.bufToB64(await file.slice(k * FILE_CHUNK, (k + 1) * FILE_CHUNK).arrayBuffer());
        await this.db.set(this.b + '/filedata/' + id + '/c' + k, b64);
      };
      try {
        let done = 0;
        for (let k = 0; k < n; k += 3) {
          await Promise.all([k, k + 1, k + 2].filter((x) => x < n).map(async (x) => { await put(x); done++; if (onProgress) onProgress(done / n); }));
        }
        await this.db.set(this.b + '/files/' + id, { name: file.name, size: file.size, chunks: n, ts: this.db.serverTime() });
      } catch (e) { this.db.remove(this.b + '/filedata/' + id).catch(() => {}); throw e; }
      return id;
    }
    delFile(id) { return Promise.all([this.db.remove(this.b + '/files/' + id), this.db.remove(this.b + '/filedata/' + id)]); }
    fileBlob(f, onProgress) { return readFileBlob(this.db, this.b, f, onProgress); }
    deleteSub(uid, key) { return this.db.remove(this.b + '/subs/' + uid + '/' + key); }
    close() { this.offs.forEach((f) => { try { f(); } catch (e) { /* bỏ qua */ } }); this.offs = []; }
  }

  /* ===================================================================== QUẢN TRỊ (tạo tài khoản giáo viên) */
  class AdminConn {
    constructor(db) { this.db = db; this.offs = []; }
    async isAdmin() {
      const uid = this.db.currentUid(); if (!uid) return false;
      try { return (await this.db.get('admins/' + uid)) === true; } catch (e) { return false; }
    }
    onTeachers(fn) {
      this.offs.push(this.db.on('teacherInfo', 'value', (v) => {
        fn(Object.keys(v || {}).map((uid) => Object.assign({ uid }, v[uid])).sort((a, b) => (a.created || 0) - (b.created || 0)));
      }));
    }
    async addTeacher(o) {
      const email = String(o.email || '').trim().toLowerCase(), name = String(o.name || '').trim(), pw = String(o.password || '');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Email chưa đúng dạng (ví dụ ten@truong.edu.vn).');
      if (pw.length < 6) throw new Error('Mật khẩu cần ít nhất 6 ký tự.');
      const uid = await this.db.createAccount(email, pw);
      await this.db.set('teachers/' + uid, true);
      await this.db.set('teacherInfo/' + uid, { email, name: name || email, created: this.db.serverTime(), by: this.db.currentUid() });
      return uid;
    }
    async revoke(uid) { await this.db.remove('teachers/' + uid); await this.db.remove('teacherInfo/' + uid); }
    resetPassword(email) { return this.db.resetPassword(email); }
    close() { this.offs.forEach((f) => { try { f(); } catch (e) { /* bỏ qua */ } }); this.offs = []; }
  }

  Hub.AdminConn = AdminConn;
  Hub.StudentConn = StudentConn;
  Hub.TeacherConn = TeacherConn;
  G.Hub = Hub;
})(window);
