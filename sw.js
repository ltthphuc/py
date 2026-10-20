/* Service Worker: giúp lệnh input() của Python chạy được trên web tĩnh (GitHub Pages) mà không cần máy chủ.
   Web Worker chạy Python gọi XHR đồng bộ tới "__input?t=<token>"; Service Worker giữ yêu cầu đó
   cho tới khi trang chính gửi chữ học sinh vừa nhập (postMessage). */
const waiters = new Map();   // token -> hàm trả lời
const early = new Map();     // chữ đến trước khi worker kịp hỏi

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const reply = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.t !== 'input') return;
  const w = waiters.get(d.token);
  if (w) { waiters.delete(d.token); w(d.text); } else early.set(d.token, d.text);
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (!u.pathname.endsWith('/__input')) return;
  const tok = u.searchParams.get('t') || '';
  e.respondWith(new Promise((resolve) => {
    if (early.has(tok)) { const v = early.get(tok); early.delete(tok); resolve(reply({ v })); return; }
    // trình duyệt có thể ngắt Service Worker sau ~5 phút: trả "chờ tiếp" sau 3 phút để worker hỏi lại
    const timer = setTimeout(() => { waiters.delete(tok); resolve(reply({ w: 1 })); }, 180000);
    waiters.set(tok, (text) => { clearTimeout(timer); resolve(reply({ v: text })); });
  }));
});
