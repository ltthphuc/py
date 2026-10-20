(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const { LS, toast, fileNameFor, withHeader, fmtSize, fmtTime, hhmm, download, makeZip, bufToB64, b64ToBytes, sanitizeRoom, stamp } = window.U;
const students = new Map();   // id -> dữ liệu
const cards = new Map();      // id -> {el, r}
let current = null;           // id học sinh đang xem trong cửa sổ chi tiết
let T = null, db = null, room = '', subsList = [], filesList = [];
const cfg = Hub.config();
const ICON_FILE = '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5"/></svg>';
const errText = (e) => {
  const m = (e && (e.code || e.message)) || String(e);
  if (/PERMISSION_DENIED|permission/i.test(m)) return 'Tài khoản này chưa có quyền giáo viên. Hãy thêm UID của tài khoản vào mục teachers trong Realtime Database (xem HUONG_DAN_TRIEN_KHAI.md).';
  if (/wrong-password|invalid-credential|invalid-login|user-not-found|INVALID_PASSWORD/i.test(m)) return 'Email hoặc mật khẩu chưa đúng.';
  if (/network/i.test(m)) return 'Không kết nối được mạng. Hãy kiểm tra internet.';
  if (/email-already-in-use/.test(m)) return 'Email này đã có tài khoản, hãy bấm Đăng nhập.';
  if (/weak-password/.test(m)) return 'Mật khẩu cần ít nhất 6 ký tự.';
  if (/invalid-email/.test(m)) return 'Email chưa đúng dạng (ví dụ ten@truong.edu.vn).';
  if (/too-many-requests/.test(m)) return 'Đăng nhập sai quá nhiều lần, hãy chờ vài phút rồi thử lại.';
  if (/operation-not-allowed|admin-restricted/.test(m)) return 'Chưa bật Email/Password (hoặc Anonymous) trong Firebase → Authentication → Sign-in method.';
  if (/api-key-not-valid|invalid-api-key/.test(m)) return 'apiKey trong config.js chưa đúng. Hãy chép lại từ Firebase.';
  return (e && e.message) || String(e);
};

/* ---------------------------------------------------------------- trạng thái */
const LABEL = { running: 'Đang chạy', error: 'Có lỗi', typing: 'Đang gõ', done: 'Chạy xong', idle: 'Đang chờ', offline: 'Mất kết nối' };
function statusOf(s) {
  if (!s.online) return 'offline';
  if (s.status === 'running') return 'running';
  if (s.status === 'error') return 'error';
  if (Date.now() - s.last_code < 5000) return 'typing';
  return s.status === 'done' ? 'done' : 'idle';
}
const segsText = (s) => (s.segs || []).map((x) => x.s).join('');
const lastLines = (txt, n) => txt.replace(/\n$/, '').split('\n').slice(-n).map((l) => (l.length > 90 ? l.slice(0, 90) + '…' : l)).join('\n');
const devLabel = (d) => d === 'mobile' ? '📱 Điện thoại' : d === 'desktop' ? '💻 Máy tính' : '';

/* ---------------------------------------------------------------- thẻ học sinh */
function makeCard(id) {
  const el = document.createElement('div'); el.className = 'card';
  el.innerHTML = '<div class="card-h"><span class="may"></span><div class="inf"><div class="nm"></div><div class="sb"></div></div><span class="st"></span></div>' +
    '<div class="pv pv-code"></div><div class="pv pv-out"></div><div class="card-f"><span class="ip"></span><div class="grow" style="flex:1"></div><span class="sub-tag"></span></div>';
  const r = {};
  for (const k of ['may', 'nm', 'sb', 'st', 'pv-code', 'pv-out', 'ip', 'sub-tag']) r[k] = el.querySelector('.' + k);
  el.onclick = () => openModal(id);
  $('grid').appendChild(el);
  const c = { el, r }; cards.set(id, c); return c;
}
function renderCard(s) {
  const c = cards.get(s.id) || makeCard(s.id), r = c.r, st = statusOf(s);
  r.may.textContent = s.may || '?';
  r.nm.textContent = s.name || '(chưa nhập tên)';
  r.sb.textContent = [s.lop && 'Lớp ' + s.lop, s.bai && 'Bài ' + s.bai].filter(Boolean).join(' · ') || '—';
  r.st.textContent = LABEL[st]; r.st.className = 'st ' + st;
  c.el.className = 'card ' + st; c.el.dataset.st = st;
  r['pv-code'].textContent = lastLines(s.code || '', 10) || '(chưa có code)';
  const out = segsText(s);
  r['pv-out'].textContent = out ? lastLines(out, 5) : '';
  r.ip.textContent = devLabel(s.dev) + (s.locked ? ' · 🔒 đang bị khóa' : '');
  r['sub-tag'].innerHTML = s.submitted_at ? '<span class="tag-sub">✓ Đã nộp ' + hhmm(s.submitted_at) + '</span>' : '';
  c.el.dataset.search = [s.may, s.name, s.lop, s.bai].join(' ').toLowerCase();
  c.el.dataset.sub = s.submitted_at ? '1' : '';
}
function resort() {
  const arr = [...students.values()].sort((a, b) => (parseInt(a.may, 10) || 9999) - (parseInt(b.may, 10) || 9999) || (a.name || '').localeCompare(b.name || '', 'vi'));
  for (const s of arr) { const c = cards.get(s.id); if (c) $('grid').appendChild(c.el); }
}
function applyFilter() {
  const q = $('q').value.trim().toLowerCase(), f = $('flt').value;
  for (const { el } of cards.values()) {
    const okQ = !q || el.dataset.search.includes(q);
    const okF = !f || (f === 'submitted' ? el.dataset.sub === '1' : el.dataset.st === f);
    el.hidden = !(okQ && okF);
  }
}
function refreshStats() {
  let on = 0, run = 0, err = 0, sub = 0, off = 0;
  for (const s of students.values()) {
    const st = statusOf(s);
    if (s.online) on++; else off++;
    if (st === 'running') run++; if (st === 'error') err++; if (s.submitted_at) sub++;
  }
  $('sTotal').textContent = on; $('sRun').textContent = run; $('sErr').textContent = err; $('sSub').textContent = sub; $('sOff').textContent = off;
  $('cntAll').textContent = students.size;
  $('emptyLive').hidden = students.size > 0;
}
function upsert(id, s) {
  if (!s) {
    students.delete(id); const c = cards.get(id); if (c) c.el.remove(); cards.delete(id);
    if (current === id) closeModal(); refreshStats(); return;
  }
  const isNew = !students.has(id), old = students.get(id);
  students.set(id, s);
  renderCard(s);
  if (isNew || (old && old.may !== s.may)) resort();
  applyFilter(); refreshStats();
  if (current === id) refreshModal(s);
}
setInterval(() => { for (const s of students.values()) { const c = cards.get(s.id); if (c) { const st = statusOf(s); if (c.el.dataset.st !== st) renderCard(s); } } refreshStats(); applyFilter(); }, 1500);
$('q').oninput = applyFilter; $('flt').onchange = applyFilter;

/* ---------------------------------------------------------------- cửa sổ chi tiết */
const cm = CodeMirror.fromTextArea($('mCode'), {
  mode: 'python', lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false, matchBrackets: true, autoCloseBrackets: true, styleActiveLine: true, readOnly: true,
  extraKeys: { Tab: (c) => { const ch = c.getCursor().ch; c.replaceSelection(' '.repeat(4 - (ch % 4)), 'end'); }, 'Ctrl-/': 'toggleComment', 'Ctrl-Enter': () => $('mRun').click(), F5: () => $('mRun').click() },
});
let editT = null;
cm.on('change', (c, ch) => {
  if (ch.origin === 'setValue' || !$('mEdit').checked || !current) return;
  clearTimeout(editT); editT = setTimeout(() => T && T.setEdit(current, cm.getValue()), 350);
});
function renderOut(s) {
  const box = $('mOut'), near = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.textContent = '';
  for (const p of s.segs || []) { const sp = document.createElement('span'); sp.className = 'cons-seg-' + p.k; sp.textContent = p.s; box.appendChild(sp); }
  if (near) box.scrollTop = box.scrollHeight;
}
let mErr = -1;
function refreshModal(s) {
  const st = statusOf(s);
  $('mMay').textContent = s.may || '?'; $('mName').textContent = s.name || '(chưa nhập tên)';
  $('mSub').textContent = [s.lop && 'Lớp ' + s.lop, s.bai && 'Bài ' + s.bai, devLabel(s.dev)].filter(Boolean).join(' · ');
  $('mStatus').textContent = LABEL[st]; $('mStatus').className = 'st ' + st;
  if (!$('mEdit').checked && cm.getValue() !== (s.code || '')) {
    const cur = cm.getCursor(), sc = cm.getScrollInfo(); cm.setValue(s.code || ''); try { cm.setCursor(cur); } catch (e) { /* bỏ qua */ } cm.scrollTo(sc.left, sc.top);
  }
  renderOut(s);
  if (mErr > 0) { cm.removeLineClass(mErr - 1, 'background', 'cm-errline'); mErr = -1; }
  if (s.status === 'error' && s.errLine > 0 && s.errLine <= cm.lineCount()) { mErr = s.errLine; cm.addLineClass(mErr - 1, 'background', 'cm-errline'); }
  $('mStop').disabled = st !== 'running' && !s.waiting; $('mRun').disabled = !s.online;
  $('mInRow').hidden = !s.waiting;
}
$('mRun').onclick = () => {
  if (!current || !T) return;
  const c = { t: 'run' };
  if ($('mEdit').checked) { clearTimeout(editT); c.code = cm.getValue(); T.setEdit(current, c.code); }
  T.cmd(current, c);
};
$('mStop').onclick = () => { if (current && T) T.cmd(current, { t: 'stop' }); };
$('mIn').addEventListener('keydown', (e) => { if (e.key === 'Enter' && current && T) { T.cmd(current, { t: 'input', text: e.target.value }); e.target.value = ''; } });
function openModal(id) {
  const s = students.get(id); if (!s) return;
  current = id; $('mEdit').checked = s.locked; cm.setOption('readOnly', !s.locked); $('mBanner').hidden = !s.locked;
  $('modal').hidden = false; cm.setValue(s.code || ''); cm.clearHistory(); refreshModal(s);
  setTimeout(() => { cm.refresh(); $('mOut').scrollTop = 1e9; }, 30);
}
function closeModal() {
  if (current && $('mEdit').checked && T) { T.setLock(current, false); $('mEdit').checked = false; }
  $('modal').hidden = true; current = null;
}
$('mEdit').onchange = () => {
  const on = $('mEdit').checked; if (!current || !T) return;
  T.setLock(current, on); if (on) T.setEdit(current, cm.getValue());
  cm.setOption('readOnly', !on); $('mBanner').hidden = !on; if (on) cm.focus();
};
$('mClose').onclick = closeModal;
$('modal').addEventListener('mousedown', (e) => { if (e.target === $('modal')) closeModal(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('viewDlg').hidden) $('viewDlg').hidden = true; else if (!$('qrDlg').hidden) $('qrDlg').hidden = true; else if (!$('modal').hidden) closeModal(); } });
$('mOpen').onclick = () => { if (current) $('mFile').click(); };
$('mFile').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file || !current) return;
  try {
    const text = await U.readTextFile(file);
    if (!$('mEdit').checked) { $('mEdit').checked = true; $('mEdit').dispatchEvent(new Event('change')); }
    cm.setValue(text); T.setEdit(current, text);
    toast('Đã mở file ' + file.name + ' vào bài của học sinh', 'ok');
  } catch (er) { toast(er.message, 'err'); }
};
const studentFile = (s, label) => ({ name: fileNameFor(s), data: withHeader(s, s.code, label || 'Lưu lúc') });
$('mSave').onclick = () => {
  const s = current && students.get(current); if (!s) return;
  const code = $('mEdit').checked ? cm.getValue() : s.code;
  const f = studentFile(Object.assign({}, s, { code }));
  download(f.name, new Blob([f.data], { type: 'text/x-python;charset=utf-8' }));
};
$('mNotify').onclick = () => { const t = prompt('Nội dung nhắn cho học sinh này:'); if (t && t.trim() && current) { T.cmd(current, { t: 'notify', text: t.trim() }); toast('Đã gửi lời nhắn', 'ok'); } };
$('btnNotify').onclick = async () => {
  const t = prompt('Nội dung thông báo gửi cho CẢ LỚP:');
  if (t && t.trim() && T) { await T.notifyMany([...students.values()].filter((s) => s.online).map((s) => s.id), t.trim()); toast('Đã gửi thông báo cho cả lớp', 'ok'); }
};
$('btnSaveAll').onclick = () => {
  const list = [...students.values()].filter((s) => (s.code || '').trim());
  if (!list.length) { toast('Chưa có code nào để tải.', 'warn'); return; }
  const used = new Set(), files = [];
  for (const s of list) { const f = studentFile(s); let n = f.name; if (used.has(n)) n = n.replace(/\.py$/, '_' + s.id.slice(0, 4) + '.py'); used.add(n); files.push({ name: n, data: f.data }); }
  const d = new Date(), tag = d.getFullYear() + U.pad(d.getMonth() + 1) + U.pad(d.getDate()) + '_' + U.pad(d.getHours()) + U.pad(d.getMinutes());
  download('code_' + room + '_' + tag + '.zip', makeZip(files));
  toast('Đã tải code của ' + files.length + ' học sinh', 'ok');
};
$('btnClearOff').onclick = async () => {
  const off = [...students.values()].filter((s) => !s.online);
  if (!off.length) { toast('Không có học sinh nào đang mất kết nối.', 'warn'); return; }
  if (!confirm('Xóa ' + off.length + ' học sinh đang mất kết nối khỏi danh sách? (Bài đã nộp vẫn được giữ.)')) return;
  for (const s of off) await T.removeStudent(s.id);
};

/* ---------------------------------------------------------------- tab */
document.querySelectorAll('.tabbtn').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.tabbtn').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
});

/* ---------------------------------------------------------------- bài nộp */
let knownSubs = null;
function groupSubs() {
  const g = new Map();
  for (const s of subsList) { const k = s.uid + '|' + s.bai; if (!g.has(k)) g.set(k, []); g.get(k).push(s); }   // subsList đã xếp mới → cũ
  return [...g.values()];
}
function renderSubs() {
  const groups = groupSubs(), body = $('subsBody'); body.textContent = '';
  $('cntSubs').textContent = groups.length; $('subsEmpty').hidden = groups.length > 0;
  groups.sort((a, b) => (parseInt(a[0].may, 10) || 9999) - (parseInt(b[0].may, 10) || 9999));
  for (const g of groups) {
    const s = g[0], tr = document.createElement('tr');
    tr.innerHTML = '<td><div class="fname">' + ICON_FILE + '<span></span></div></td><td></td><td></td><td class="acts"><button class="btn small v">Xem</button> <button class="btn small d">Tải .py</button> <button class="btn small danger x">Xóa</button></td>';
    tr.querySelector('span').textContent = fileNameFor(s); tr.children[1].textContent = g.length; tr.children[2].textContent = fmtTime(s.ts);
    tr.querySelector('.v').onclick = () => openView(g);
    tr.querySelector('.d').onclick = () => { const f = { name: fileNameFor(s), data: withHeader(s, s.code, 'Nộp lúc', s.ts) }; download(f.name, new Blob([f.data], { type: 'text/x-python;charset=utf-8' })); };
    tr.querySelector('.x').onclick = async () => { if (confirm('Xóa bài nộp “' + fileNameFor(s) + '” (' + g.length + ' bản)?')) for (const v of g) await T.deleteSub(v.uid, v.key); };
    body.appendChild(tr);
  }
}
let viewGroup = null;
const vcm = CodeMirror.fromTextArea($('vCode'), { mode: 'python', lineNumbers: true, readOnly: true, indentUnit: 4 });
function openView(g) {
  viewGroup = g; const sel = $('vVer'); sel.textContent = '';
  g.forEach((v, i) => { const o = document.createElement('option'); o.value = i; o.textContent = (i === 0 ? 'Mới nhất – ' : 'Bản cũ – ') + fmtTime(v.ts); sel.appendChild(o); });
  showVer(0); $('viewDlg').hidden = false; setTimeout(() => vcm.refresh(), 30);
}
function showVer(i) {
  const v = viewGroup[i]; $('vTitle').textContent = fileNameFor(v); $('vSub').textContent = 'Nộp lúc ' + fmtTime(v.ts) + (v.dev ? ' · ' + devLabel(v.dev) : '');
  vcm.setValue(v.code || '');
}
$('vVer').onchange = () => showVer(+$('vVer').value);
$('vClose').onclick = () => { $('viewDlg').hidden = true; };
$('vDown').onclick = () => { const v = viewGroup[+$('vVer').value]; download(fileNameFor(v), new Blob([withHeader(v, v.code, 'Nộp lúc', v.ts)], { type: 'text/x-python;charset=utf-8' })); };
$('btnZipSubs').onclick = () => {
  const groups = groupSubs(); if (!groups.length) { toast('Chưa có bài nộp nào.', 'warn'); return; }
  const files = [], used = new Set();
  for (const g of groups) {
    let n = fileNameFor(g[0]); if (used.has(n)) n = n.replace(/\.py$/, '_' + g[0].uid.slice(0, 4) + '.py'); used.add(n);
    files.push({ name: n, data: withHeader(g[0], g[0].code, 'Nộp lúc', g[0].ts) });
    g.slice(1).forEach((v, i) => files.push({ name: '_ban_cu/' + n.replace(/\.py$/, '') + '_ban' + (g.length - 1 - i) + '.py', data: withHeader(v, v.code, 'Nộp lúc', v.ts) }));
  }
  download('bai_nop_' + room + '.zip', makeZip(files));
  toast('Đã tải ' + groups.length + ' bài nộp', 'ok');
};
function onSubs(list) {
  subsList = list;
  if (knownSubs) for (const s of list) if (!knownSubs.has(s.key)) toast('✓ ' + (s.may ? 'STT ' + s.may + ' – ' : '') + s.name + ' đã nộp Bài ' + s.bai, 'ok');
  knownSubs = new Set(list.map((s) => s.key));
  renderSubs();
}

/* ---------------------------------------------------------------- bài tập chia sẻ */
const maxKB = cfg.maxFileKB || 700; $('maxKB').textContent = maxKB >= 1024 ? Math.round(maxKB / 1024) + ' MB' : maxKB + ' KB';
function renderFiles(list) {
  filesList = list;
  const body = $('shareBody'); body.textContent = '';
  $('cntShare').textContent = list.length; $('shareEmpty').hidden = list.length > 0;
  for (const f of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><div class="fname">' + ICON_FILE + '<span></span></div></td><td></td><td></td><td class="acts"><button class="btn small d">Tải về</button> <button class="btn small danger x">Xóa</button></td>';
    tr.querySelector('span').textContent = f.name; tr.children[1].textContent = fmtSize(f.size || 0); tr.children[2].textContent = fmtTime(f.ts);
    tr.querySelector('.d').onclick = async () => { try { download(f.name, await T.fileBlob(f, (r) => toast('Đang tải ' + Math.round(r * 100) + '%', 'ok', 900))); } catch (e) { toast('Không tải được: ' + errText(e), 'err'); } };
    tr.querySelector('.x').onclick = async () => { if (confirm('Xóa file “' + f.name + '” khỏi danh sách chia sẻ?')) { await T.delFile(f.id); toast('Đã xóa', 'ok'); } };
    body.appendChild(tr);
  }
}
async function upload(files) {
  if (!files.length || !T) return;
  let n = 0;
  for (const f of files) {
    if (f.size > maxKB * 1024) { toast('“' + f.name + '” lớn hơn ' + $('maxKB').textContent + ' nên không chia sẻ được.', 'err', 6000); continue; }
    try { await T.addFile(f, (r) => toast('Đang tải lên “' + f.name + '” ' + Math.round(r * 100) + '%', 'ok', 1500)); n++; } catch (e) { toast('Không tải lên được “' + f.name + '”: ' + errText(e), 'err'); }
  }
  if (n) toast('Đã chia sẻ ' + n + ' file', 'ok');
}
$('upInput').onchange = (e) => { upload([...e.target.files]); e.target.value = ''; };
const drop = $('drop');
['dragenter', 'dragover'].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => upload([...e.dataTransfer.files]));
['dragover', 'drop'].forEach((n) => window.addEventListener(n, (e) => { if (!drop.contains(e.target)) e.preventDefault(); }));

/* ---------------------------------------------------------------- đăng nhập, chọn lớp */
let isAdmin = false;
function show(view) {
  for (const id of ['loginView', 'roomView', 'dash', 'adminView']) $(id).hidden = id !== view;
  $('roomBox').hidden = view !== 'dash'; $('btnRoom').hidden = view !== 'dash' && view !== 'adminView';
  $('btnOut').hidden = view === 'loginView';
  $('btnAdmin').hidden = !(isAdmin && view !== 'loginView' && view !== 'adminView');
}
function conn(ok, t) { $('conn').className = 'pill ' + (ok ? 'ok' : 'bad'); $('connTxt').textContent = t; }
const rooms = () => { try { return JSON.parse(LS.get('pt_rooms', '[]')); } catch (e) { return []; } };
function rememberRoom(code) { const l = [code, ...rooms().filter((x) => x !== code)].slice(0, 8); LS.set('pt_rooms', JSON.stringify(l)); LS.set('pt_room', code); }
function showRoomPicker(msg) {
  show('roomView');
  const er = $('roomErr'); er.hidden = !msg; er.textContent = msg || '';
  $('rCode').value = LS.get('pt_room', ''); setTimeout(() => $('rCode').focus(), 50);
  loadClassChips();
}
async function loadClassChips() {
  const box = $('recentList'); box.textContent = '';
  let list = [];
  try { list = await Hub.listClasses(db); } catch (e) { list = rooms().map((r) => ({ room: r, title: r })); }
  $('recent').hidden = !list.length;
  for (const c of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rchip'; b.textContent = c.title + (c.title !== c.room ? ' · ' + c.room : '');
    b.onclick = () => { $('rCode').value = c.room; }; b.ondblclick = () => $('roomForm').requestSubmit(); box.appendChild(b);
  }
}
function resetView() {
  students.clear(); cards.forEach((c) => c.el.remove()); cards.clear(); current = null; $('modal').hidden = true;
  subsList = []; knownSubs = null; renderSubs(); renderFiles([]); refreshStats();
}
async function openRoom(code, create, title) {
  code = sanitizeRoom(code); if (!code) throw new Error('Hãy nhập mã lớp.');
  if (T) T.close();
  const t = new Hub.TeacherConn(db, code);
  await t.open({ create, title });
  T = t; room = code; rememberRoom(code); resetView();
  $('roomName').textContent = (t.meta.title && t.meta.title !== code ? t.meta.title + ' · ' : '') + code;
  const url = new URL('hs/', location.href); url.searchParams.set('lop', code);   // địa chỉ ngắn: …/hs/?lop=<mã lớp>
  $('stuLink').textContent = url.href.replace(/^https?:\/\//, ''); $('stuLink').dataset.url = url.href;
  T.onStudents(upsert); T.onSubs(onSubs); T.onFiles(renderFiles);
  show('dash');
}
$('roomForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const b = $('rOpen'); b.disabled = true;
  try { await openRoom($('rCode').value, false); } catch (er) { showRoomPicker(errText(er)); }
  b.disabled = false;
});
$('rNew').onclick = async () => {
  try { await openRoom($('rCode').value, true, $('rTitle').value.trim()); toast('Đã tạo lớp. Gửi mã lớp hoặc mã QR cho học sinh.', 'ok'); }
  catch (er) { showRoomPicker(errText(er)); }
};
$('btnDelClass').onclick = async () => {
  if (!T || !room) return;
  if (!confirm('XÓA lớp “' + room + '” cùng toàn bộ học sinh, bài nộp và file chia sẻ của lớp?\nViệc này không khôi phục được.')) return;
  if (prompt('Để chắc chắn, hãy gõ lại mã lớp (' + room + '):') !== room) { toast('Mã lớp gõ chưa khớp, chưa xóa.', 'warn'); return; }
  try { const r = room; T.close(); T = null; await Hub.deleteClass(db, r); LS.set('pt_room', ''); toast('Đã xóa lớp ' + r, 'ok'); showRoomPicker(''); }
  catch (e) { toast('Không xóa được: ' + errText(e), 'err'); }
};
$('btnRoom').onclick = () => { if (T) { T.close(); T = null; } showRoomPicker(''); };
const demoLogin = () => Hub.isDemo();
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const er = $('loginErr'); er.hidden = true; const b = $('lGo'); b.disabled = true;
  try { await db.signInTeacher($('lEmail').value.trim(), $('lPass').value); afterLogin(); }
  catch (err) { er.textContent = errText(err); er.hidden = false; }
  b.disabled = false;
});
$('lSignup').onclick = async () => {
  const er = $('loginErr'); er.hidden = true; const b = $('lSignup'); b.disabled = true;
  try { await db.signUpTeacher($('lEmail').value.trim(), $('lPass').value); toast('Đã tạo tài khoản giáo viên (lưu trong trình duyệt này).', 'ok'); afterLogin(); }
  catch (err) { er.textContent = errText(err); er.hidden = false; }
  b.disabled = false;
};
$('lReset').onclick = async () => {
  const er = $('loginErr'); const email = $('lEmail').value.trim();
  if (!email) { er.className = 'joinerr'; er.textContent = 'Hãy nhập email vào ô Email trước, rồi bấm “Quên mật khẩu?”.'; er.hidden = false; return; }
  try { await db.resetPassword(email); er.className = 'okmsg'; er.textContent = 'Đã gửi email đặt lại mật khẩu tới ' + email + ' (xem cả thư rác).'; er.hidden = false; }
  catch (err) { er.className = 'joinerr'; er.textContent = errText(err); er.hidden = false; }
};
$('btnOut').onclick = async () => { if (T) { T.close(); T = null; } isAdmin = false; await db.signOut(); show('loginView'); conn(false, 'Chưa đăng nhập'); };
async function afterLogin() {
  try { await checkAdmin(); } catch (e) { /* bỏ qua */ }
  const last = LS.get('pt_room', '');
  if (last) { try { await openRoom(last, false); return; } catch (e) { showRoomPicker(e.message && /chưa có/.test(e.message) ? '' : errText(e)); return; } }
  showRoomPicker('');
}

/* ---------------------------------------------------------------- quản trị: tài khoản giáo viên */
let admin = null;
async function checkAdmin() {
  admin = admin || new Hub.AdminConn(db);
  isAdmin = Hub.isDemo() ? false : await admin.isAdmin();
  $('btnAdmin').hidden = !isAdmin;
}
function genPass() { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const a = new Uint32Array(10); crypto.getRandomValues(a); return Array.from(a, (x) => c[x % c.length]).join(''); }
function renderTeachers(list) {
  const body = $('adBody'); body.textContent = ''; $('adEmpty').hidden = list.length > 0;
  for (const t of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td><td></td><td></td><td class="acts"><button class="btn small r">Gửi email đặt lại mật khẩu</button> <button class="btn small danger x">Thu hồi quyền</button></td>';
    tr.children[0].textContent = t.name || ''; tr.children[1].textContent = t.email || ''; tr.children[2].textContent = fmtTime(t.created);
    tr.querySelector('.r').onclick = async () => { try { await admin.resetPassword(t.email); toast('Đã gửi email đặt lại mật khẩu tới ' + t.email, 'ok'); } catch (e) { toast(errText(e), 'err'); } };
    tr.querySelector('.x').onclick = async () => { if (confirm('Thu hồi quyền giáo viên của ' + t.email + '?\n(Tài khoản vẫn còn nhưng không xem được dữ liệu lớp.)')) { try { await admin.revoke(t.uid); toast('Đã thu hồi quyền', 'ok'); } catch (e) { toast(errText(e), 'err'); } } };
    body.appendChild(tr);
  }
}
$('btnAdmin').onclick = () => { admin.close(); admin.onTeachers(renderTeachers); show('adminView'); $('adMsg').hidden = true; if (!$('adPass').value) $('adPass').value = genPass(); };
$('adBack').onclick = () => { admin.close(); if (T) show('dash'); else showRoomPicker(''); };
$('adGen').onclick = () => { $('adPass').value = genPass(); };
$('adForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const msg = $('adMsg'), b = $('adGo'); b.disabled = true; msg.hidden = true;
  const email = $('adEmail').value.trim(), pw = $('adPass').value;
  try {
    await admin.addTeacher({ email, name: $('adName').value, password: pw });
    msg.className = 'adcred'; msg.innerHTML = '';
    msg.append('✓ Đã tạo tài khoản giáo viên. Hãy gửi cho giáo viên:  Email '); const b1 = document.createElement('b'); b1.textContent = email; msg.append(b1, '  Mật khẩu '); const b2 = document.createElement('b'); b2.textContent = pw; msg.append(b2, '. Giáo viên có thể tự đổi mật khẩu bằng nút “Quên mật khẩu?” ở màn hình đăng nhập.');
    msg.hidden = false; $('adName').value = ''; $('adEmail').value = ''; $('adPass').value = genPass();
  } catch (err) {
    const c = (err && (err.code || err.message)) || '';
    msg.className = 'adbad';
    msg.textContent = /wrong-password|invalid-credential/.test(c) ? 'Email này đã có tài khoản với mật khẩu khác. Hãy nhập đúng mật khẩu hiện tại của tài khoản đó (để cấp quyền), hoặc dùng email khác.' : /PERMISSION_DENIED/i.test(c) ? 'Tài khoản của bạn chưa phải quản trị viên (admins/<UID> = true trong Realtime Database).' : errText(err);
    msg.hidden = false;
  }
  b.disabled = false;
});

/* liên kết học sinh, mã QR */
$('btnCopy').onclick = async () => {
  const u = $('stuLink').dataset.url || '';
  try { await navigator.clipboard.writeText(u); } catch (e) { const t = document.createElement('textarea'); t.value = u; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast('Đã sao chép liên kết cho học sinh', 'ok', 2200);
};
$('btnQR').onclick = () => {
  const u = $('stuLink').dataset.url || ''; const q = qrcode(0, 'M'); q.addData(u); q.make();
  $('qrBox').innerHTML = q.createSvgTag({ cellSize: 7, margin: 2, scalable: true }); $('qrUrl').textContent = u; $('qrDlg').hidden = false;
};
$('qrClose').onclick = () => { $('qrDlg').hidden = true; };
$('qrDlg').addEventListener('mousedown', (e) => { if (e.target === $('qrDlg')) $('qrDlg').hidden = true; });

/* ---------------------------------------------------------------- khởi động */
(async () => {
  if (U.guardFile()) return;
  U.demoBar($('demoBar'), Hub.isDemo());
  if (Hub.isDemo()) {
    $('lSignup').hidden = false; $('lReset').hidden = true;
    $('loginNote').textContent = 'Chế độ thử: tài khoản chỉ lưu trong trình duyệt này. Lần đầu hãy bấm “Tạo tài khoản”.';
  } else $('loginNote').textContent = 'Dùng tài khoản email giáo viên đã được cấp quyền (xem hướng dẫn triển khai). Học sinh không cần đăng nhập.';
  try {
    db = Hub.createDB();
    if (db.onError) db.onError((e) => toast(errText(e), 'err', 7000));
    db.onConnection((ok) => conn(ok, ok ? 'Đã kết nối' : 'Mất kết nối – đang thử lại…'));
    const uid = await db.restoreTeacher();
    if (uid) await afterLogin(); else show('loginView');
  } catch (e) { show('loginView'); const er = $('loginErr'); er.textContent = errText(e); er.hidden = false; }
})();
})();
