/* Cơ sở dữ liệu giả lập cho CHẾ ĐỘ THỬ: nhiều tab trong cùng một trình duyệt trao đổi qua BroadcastChannel.
   Giao diện (API) giống lớp FirebaseDB nên toàn bộ phần mềm chạy y hệt, chỉ khác nơi lưu dữ liệu. */
(function (G) {
  'use strict';

  const DEFAULT_KEY = 'pylab_demo_db';
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const parts = (p) => String(p).split('/').filter(Boolean);

  class LocalDB {
    constructor(opts) {
      opts = opts || {}; this.storeKey = opts.key || DEFAULT_KEY;
      this.kind = 'local';
      this.listeners = [];
      this.disc = [];
      this.timer = null;
      try { this.store = JSON.parse(localStorage.getItem(this.storeKey) || '{}'); } catch (e) { this.store = {}; }
      this.bc = new BroadcastChannel(opts.channel || 'pylab-demo-db');
      this.bc.onmessage = (e) => { const m = e.data; if (m && m.op === 'set') { this._set(m.path, m.value); this._notify(); } };
      window.addEventListener('pagehide', () => this._runDisc());
      this.uid = null;
    }

    /* ---- đọc / ghi ---- */
    _get(path) {
      let cur = this.store;
      for (const k of parts(path)) { if (cur == null || typeof cur !== 'object') return undefined; cur = cur[k]; }
      return cur;
    }
    _set(path, value) {
      const ks = parts(path);
      if (!ks.length) { this.store = value == null ? {} : clone(value); return; }
      let cur = this.store; const chain = [];
      for (let i = 0; i < ks.length - 1; i++) {
        chain.push([cur, ks[i]]);
        if (cur[ks[i]] == null || typeof cur[ks[i]] !== 'object') { if (value == null) return; cur[ks[i]] = {}; }
        cur = cur[ks[i]];
      }
      const last = ks[ks.length - 1];
      if (value == null) delete cur[last]; else cur[last] = clone(value);
      for (let i = chain.length - 1; i >= 0; i--) { const [o, k] = chain[i]; if (o[k] && typeof o[k] === 'object' && !Object.keys(o[k]).length) delete o[k]; else break; }
    }
    _save() { try { localStorage.setItem(this.storeKey, JSON.stringify(this.store)); } catch (e) { /* đầy bộ nhớ */ } }   // ghi ngay: tab khác mở sau đó phải thấy dữ liệu mới
    _write(path, value) {
      this._set(path, value);
      this.bc.postMessage({ op: 'set', path, value: clone(value) });
      this._save();
    }
    async get(path) { return clone(this._get(path)); }
    async set(path, value) { this._write(path, value); this._notify(); }
    async update(path, obj) {
      for (const k of Object.keys(obj)) this._write(path + '/' + k, obj[k]);
      this._notify();
    }
    async remove(path) { this._write(path, null); this._notify(); }
    async push(path, value) { const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); this._write(path + '/' + key, value); this._notify(); return key; }
    serverTime() { return Date.now(); }

    /* ---- lắng nghe ---- */
    on(path, ev, cb) {
      const L = { path, ev, cb, prev: clone(this._get(path)), off: false };
      this.listeners.push(L);
      setTimeout(() => {
        if (L.off) return;
        if (ev === 'value') cb(clone(L.prev), parts(path).pop());
        else if (ev === 'child_added' && L.prev && typeof L.prev === 'object') for (const k of Object.keys(L.prev)) cb(clone(L.prev[k]), k);
      }, 0);
      return () => { L.off = true; this.listeners = this.listeners.filter((x) => x !== L); };
    }
    _notify() {
      for (const L of this.listeners.slice()) {
        if (L.off) continue;
        const cur = clone(this._get(L.path)), a = JSON.stringify(L.prev), b = JSON.stringify(cur);
        if (a === b) continue;
        const prev = L.prev; L.prev = cur;
        if (L.ev === 'value') { L.cb(cur, parts(L.path).pop()); continue; }
        const po = prev && typeof prev === 'object' ? prev : {}, co = cur && typeof cur === 'object' ? cur : {};
        if (L.ev === 'child_added') for (const k of Object.keys(co)) if (!(k in po)) L.cb(clone(co[k]), k);
        if (L.ev === 'child_changed') for (const k of Object.keys(co)) if (k in po && JSON.stringify(po[k]) !== JSON.stringify(co[k])) L.cb(clone(co[k]), k);
        if (L.ev === 'child_removed') for (const k of Object.keys(po)) if (!(k in co)) L.cb(clone(po[k]), k);
      }
    }

    /* ---- tài khoản, kết nối ---- */
    async signInAnonymously() {
      if (this.uid) return this.uid;
      let u = null; try { u = sessionStorage.getItem('pylab_demo_uid'); } catch (e) { /* bỏ qua */ }
      if (!u) { u = 'u' + Math.random().toString(36).slice(2, 12); try { sessionStorage.setItem('pylab_demo_uid', u); } catch (e) { /* bỏ qua */ } }
      this.uid = u; return u;
    }
    /* Chế độ thử: tài khoản giáo viên chỉ lưu trong trình duyệt này (mật khẩu băm SHA-256). Không thay thế Firebase. */
    _accounts() { try { return JSON.parse(localStorage.getItem('pylab_demo_accounts') || '{}'); } catch (e) { return {}; } }
    async _hash(pw, salt) {
      const data = new TextEncoder().encode(salt + ':' + pw);
      if (window.crypto && crypto.subtle) { const h = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join(''); }
      let h = 5381; for (const b of data) h = ((h << 5) + h + b) | 0; return 'x' + h;
    }
    _err(code, msg) { const e = new Error(msg); e.code = code; return e; }
    _session(email) { this.uid = 'teacher-demo-' + email.replace(/[^a-z0-9]/g, '').slice(0, 20); try { sessionStorage.setItem('pylab_demo_teacher', JSON.stringify({ email, uid: this.uid })); } catch (e) { /* bỏ qua */ } return this.uid; }
    async signUpTeacher(email, pw) {
      email = String(email || '').trim().toLowerCase();
      if (!/^\S+@\S+$/.test(email)) throw this._err('auth/invalid-email', 'Email chưa đúng dạng (ví dụ ten@truong.edu.vn).');
      if (String(pw || '').length < 6) throw this._err('auth/weak-password', 'Mật khẩu cần ít nhất 6 ký tự.');
      const acc = this._accounts(); if (acc[email]) throw this._err('auth/email-already-in-use', 'Email này đã có tài khoản, hãy bấm Đăng nhập.');
      const salt = Math.random().toString(36).slice(2, 10); acc[email] = { salt, hash: await this._hash(pw, salt) };
      localStorage.setItem('pylab_demo_accounts', JSON.stringify(acc)); return this._session(email);
    }
    async signInTeacher(email, pw) {
      email = String(email || '').trim().toLowerCase(); const a = this._accounts()[email];
      if (!a || a.hash !== await this._hash(pw, a.salt)) throw this._err('auth/wrong-password', 'Email hoặc mật khẩu chưa đúng. Nếu chưa có tài khoản, bấm “Tạo tài khoản”.');
      return this._session(email);
    }
    async restoreTeacher() { try { const d = JSON.parse(sessionStorage.getItem('pylab_demo_teacher') || 'null'); if (d) { this.uid = d.uid; return d.uid; } } catch (e) { /* bỏ qua */ } return null; }
    async signOut() { this.uid = null; try { sessionStorage.removeItem('pylab_demo_teacher'); } catch (e) { /* bỏ qua */ } }
    async resetPassword() { throw this._err('demo', 'Chế độ thử không gửi được email. Muốn đặt lại, hãy tạo tài khoản với email khác.'); }
    currentUid() { return this.uid; }
    currentEmail() { try { const d = JSON.parse(sessionStorage.getItem('pylab_demo_teacher') || 'null'); return d ? d.email : ''; } catch (e) { return ''; } }
    onConnection(cb) { cb(true); return () => {}; }
    onDisconnectSet(path, value) { this.disc = this.disc.filter((d) => d.path !== path); this.disc.push({ path, value }); }
    _runDisc() { for (const d of this.disc) this._write(d.path, d.value); this.disc = []; this._notify(); }
    wipeAll() { this.store = {}; this._save(); this.bc.postMessage({ op: 'set', path: '', value: null }); this._notify(); }
  }

  G.LocalDB = LocalDB;
})(window);
