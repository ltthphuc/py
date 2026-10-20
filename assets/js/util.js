/* Tiện ích dùng chung cho trang học sinh và giáo viên. */
(function (G) {
  'use strict';

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } },
  };

  /* ---------- tên file bài nộp: SốMáy_HọTên_BàiSố.py (giống bản offline) ---------- */
  function cleanPart(s, limit) {
    s = String(s == null ? '' : s).normalize('NFC').trim();
    s = s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, '_').replace(/^[._]+|[._]+$/g, '');
    return s.slice(0, limit || 40);
  }
  function fileNameFor(st) {
    return (cleanPart(st.may, 10) || 'XX') + '_' + (cleanPart(st.name, 40) || 'HocSinh') + '_Bai' + (cleanPart(st.bai, 10) || '0') + '.py';
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp(ms) {
    const d = new Date(ms || Date.now());
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function withHeader(st, code, label, ms) {
    return '# Họ tên: ' + st.name + '\n# Lớp: ' + st.lop + '\n# Số máy/STT: ' + st.may + '\n# Bài số: ' + st.bai + '\n# ' + (label || 'Nộp lúc') + ': ' + stamp(ms) + '\n\n' + code;
  }

  /* ---------- định dạng ---------- */
  const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const fmtTime = (ms) => ms ? new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' }) : '';
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  /* ---------- đọc file văn bản (UTF-8, dự phòng Windows-1258) ---------- */
  async function readTextFile(file, maxBytes) {
    if (file.size > (maxBytes || 1048576)) throw new Error('File quá lớn (tối đa ' + Math.round((maxBytes || 1048576) / 1024) + ' KB)');
    const buf = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1258').decode(buf); }
    return text.replace(/^﻿/, '');
  }
  function bufToB64(buf) {
    const u = new Uint8Array(buf); let s = ''; const CH = 0x8000;
    for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
    return btoa(s);
  }
  function b64ToBytes(b64) {
    const s = atob(b64); const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------- tạo file .zip (không nén, tên file UTF-8) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    let csize = 0; for (const c of central) csize += c.length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  /* ---------- thông báo nhỏ ---------- */
  function toast(text, kind, ms) {
    const box = document.getElementById('toasts'); if (!box) return;
    const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = text;
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms || 4200);
  }

  const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

  function sanitizeRoom(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* Mở bằng cách bấm đúp file (file://) thì Service Worker, Python... không chạy được: báo rõ cho người dùng */
  function guardFile() {
    if (location.protocol !== 'file:') return false;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0b1f36;color:#fff;display:grid;place-items:center;padding:24px;font:16px/1.6 "Segoe UI",system-ui,sans-serif';
    d.innerHTML = '<div style="max-width:560px"><h2 style="margin:0 0 10px">Chưa mở đúng cách</h2><p>Trang này <b>không chạy được khi bấm đúp vào file</b>. Hãy mở qua địa chỉ web, ví dụ <b>https://ltthphuc.github.io/py/</b>, hoặc chạy lệnh <code style="background:#12304f;padding:2px 8px;border-radius:6px">python -m http.server 8000</code> trong thư mục dự án rồi mở <b>http://localhost:8000/</b>.</p></div>';
    document.body.appendChild(d); return true;
  }
  /* Thanh cảnh báo khi đang ở chế độ thử (đặc biệt khi đã đưa lên web) */
  function demoBar(el, isDemo) {
    if (!el || !isDemo) return;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    el.hidden = false;
    if (local) { el.innerHTML = 'Đang ở <b>chế độ thử</b>: chỉ trao đổi được giữa các tab trong cùng một trình duyệt. Để chạy thật trên mạng, làm theo HUONG_DAN_TRIEN_KHAI.md.'; return; }
    el.style.cssText = 'background:#fee2e2;color:#991b1b;border-bottom-color:#fca5a5;font-weight:600';
    el.innerHTML = '⚠ Trang này <b>chưa nối Firebase</b> (đang ở chế độ thử): học sinh và giáo viên ở các máy khác nhau <b>chưa thấy nhau</b>. Giáo viên hãy cấu hình theo mục 3 của HUONG_DAN_TRIEN_KHAI.md, rồi mở <a href="kiemtra.html" style="color:#7f1d1d">trang kiểm tra cấu hình</a>.';
  }

  G.U = { guardFile, demoBar, LS, cleanPart, fileNameFor, withHeader, stamp, fmtSize, fmtTime, hhmm, readTextFile, bufToB64, b64ToBytes, download, makeZip, toast, isMobile, sanitizeRoom, rid, pad };
})(window);
