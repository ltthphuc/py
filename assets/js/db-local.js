/* Cơ sở dữ liệu giả lập cho CHẾ ĐỘ THỬ: nhiều tab trong cùng một trình duyệt trao đổi qua BroadcastChannel.
   Giao diện (API) giống lớp FirebaseDB nên toàn bộ phần mềm chạy y hệt, chỉ khác nơi lưu dữ liệu. */
(function (G) {
  'use strict';

  const STORE_KEY = 'pylab_demo_db';
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const parts = (p) => String(p).split('/').filter(Boolean);

  class LocalDB {
    constructor() {
      this.kind = 'local';
      this.listeners = [];
      this.disc = [];
      this.timer = null;
      try { this.store = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { this.store = {}; }
      this.bc = new BroadcastChannel('pylab-demo-db');
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
    _save() { clearTimeout(this.timer); this.timer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.store)); } catch (e) { /* đầy bộ nhớ */ } }, 150); }
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
    async signInTeacher() { this.uid = 'teacher-demo'; return this.uid; }
    async restoreTeacher() { return null; }          // chế độ thử không cần đăng nhập
    async signOut() { this.uid = null; }
    currentUid() { return this.uid; }
    onConnection(cb) { cb(true); return () => {}; }
    onDisconnectSet(path, value) { this.disc = this.disc.filter((d) => d.path !== path); this.disc.push({ path, value }); }
    _runDisc() { for (const d of this.disc) this._write(d.path, d.value); this.disc = []; this._notify(); }
    wipeAll() { this.store = {}; this._save(); this.bc.postMessage({ op: 'set', path: '', value: null }); this._notify(); }
  }

  G.LocalDB = LocalDB;
})(window);
