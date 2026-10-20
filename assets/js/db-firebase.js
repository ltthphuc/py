/* Cơ sở dữ liệu thật: Firebase Realtime Database + Authentication (gói miễn phí Spark).
   Cùng giao diện với LocalDB. SDK nằm trong thư mục vendor/firebase nên không phụ thuộc CDN. */
(function (G) {
  'use strict';

  class FirebaseDB {
    constructor(cfg) {
      if (typeof firebase === 'undefined') throw new Error('Chưa nạp được thư viện Firebase (vendor/firebase).');
      if (!cfg || !cfg.apiKey || !cfg.databaseURL) throw new Error('Thiếu cấu hình Firebase trong config.js (apiKey, databaseURL…).');
      this.kind = 'firebase';
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      this.auth = firebase.auth();
      this.db = firebase.database();
      this.errHandlers = [];
    }
    onError(fn) { this.errHandlers.push(fn); }
    _err(e) { console.warn('Firebase:', e && e.message); this.errHandlers.forEach((f) => f(e)); }

    async get(path) { const s = await this.db.ref(path).get(); return s.val(); }
    async set(path, value) { await this.db.ref(path).set(value); }
    async update(path, obj) { await this.db.ref(path).update(obj); }
    async remove(path) { await this.db.ref(path).remove(); }
    async push(path, value) { const r = this.db.ref(path).push(); await r.set(value); return r.key; }
    serverTime() { return firebase.database.ServerValue.TIMESTAMP; }

    on(path, ev, cb) {
      const ref = this.db.ref(path);
      const h = ref.on(ev, (snap) => cb(snap.val(), snap.key), (e) => this._err(e));
      return () => ref.off(ev, h);
    }

    _authReady() { return new Promise((res) => { const un = this.auth.onAuthStateChanged((u) => { un(); res(u); }); }); }
    async signInAnonymously() {
      let u = await this._authReady();
      if (!u) { const c = await this.auth.signInAnonymously(); u = c.user; }
      return u.uid;
    }
    async signInTeacher(email, password) {
      const c = await this.auth.signInWithEmailAndPassword(email, password);
      return c.user.uid;
    }
    async restoreTeacher() {
      const u = await this._authReady();
      return u && !u.isAnonymous ? u.uid : null;
    }
    async signOut() { await this.auth.signOut(); }
    async resetPassword(email) { await this.auth.sendPasswordResetEmail(email); }
    currentUid() { return this.auth.currentUser ? this.auth.currentUser.uid : null; }

    onConnection(cb) {
      const ref = this.db.ref('.info/connected');
      const h = ref.on('value', (s) => cb(!!s.val()));
      return () => ref.off('value', h);
    }
    onDisconnectSet(path, value) { this.db.ref(path).onDisconnect().set(value); }
  }

  G.FirebaseDB = FirebaseDB;
})(window);
