(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const { LS, toast, fileNameFor, fmtSize, readTextFile, download, b64ToBytes, sanitizeRoom } = window.U;
const BASE = new URL('./', location.href).href;
const mobileMQ = window.matchMedia('(max-width: 820px)');

/* ------------------------------------------------------------- thông tin học sinh */
const F = { may: $('fMay'), name: $('fName'), lop: $('fLop'), bai: $('fBai') };
for (const k in F) {
  F[k].value = LS.get('pl_' + k, '');
  F[k].addEventListener('input', () => { LS.set('pl_' + k, F[k].value); F[k].classList.remove('bad'); updateFileName(); scheduleState(); });
}
const meta = () => ({ may: F.may.value.trim(), name: F.name.value.trim(), lop: F.lop.value.trim(), bai: F.bai.value.trim() });
function fileName() { const b = F.bai.value.trim().replace(/[^\w\-]/g, ''); return 'bai' + (b || '1') + '.py'; }
function updateFileName() { $('fileName').textContent = fileName(); }
updateFileName();

/* ------------------------------------------------------------- trình soạn thảo */
const DEFAULT_CODE = "# Viết chương trình Python của em ở đây\nten = input('Em tên là gì? ')\nprint('Xin chào,', ten)\n";
let fs = parseInt(LS.get('pl_fs', mobileMQ.matches ? '16' : '15'), 10) || 15;
const applyFs = () => document.documentElement.style.setProperty('--code-fs', fs + 'px');
applyFs();

const cm = CodeMirror.fromTextArea($('code'), {
  mode: 'python', lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false,
  matchBrackets: true, autoCloseBrackets: true, styleActiveLine: true,
  gutters: ['CodeMirror-linenumbers'],
  extraKeys: {
    Tab: (c) => {
      if (c.somethingSelected()) return c.indentSelection('add');
      const ch = c.getCursor().ch; c.replaceSelection(' '.repeat(4 - (ch % 4)), 'end');
    },
    'Shift-Tab': (c) => c.indentSelection('subtract'),
    'Ctrl-Enter': () => run(), F5: () => run(), 'Ctrl-/': 'toggleComment',
  },
});
cm.setValue(LS.get('pl_code', DEFAULT_CODE));
cm.clearHistory();
let lastSubmitted = LS.get('pl_submitted', null);
let errLine = -1;

function clearErr() {
  if (errLine > 0) { cm.removeLineClass(errLine - 1, 'background', 'cm-errline'); cm.setGutterMarker(errLine - 1, 'CodeMirror-linenumbers', null); }
  errLine = -1;
}
function markErr(n) {
  clearErr();
  if (n > 0 && n <= cm.lineCount()) {
    errLine = n;
    cm.addLineClass(n - 1, 'background', 'cm-errline');
    const m = document.createElement('span'); m.className = 'cm-errgutter'; m.textContent = n; cm.setGutterMarker(n - 1, 'CodeMirror-linenumbers', m);
    cm.scrollIntoView({ line: n - 1, ch: 0 }, 80);
  }
}
let saveT = null;
cm.on('change', () => {
  clearTimeout(saveT); saveT = setTimeout(() => LS.set('pl_code', cm.getValue()), 400);
  if (errLine > 0) clearErr();
  scheduleState();
});
cm.on('cursorActivity', () => { const p = cm.getCursor(); $('stPos').textContent = 'Dòng ' + (p.line + 1) + ', Cột ' + (p.ch + 1); });
$('fsUp').onclick = () => { fs = Math.min(28, fs + 1); LS.set('pl_fs', fs); applyFs(); cm.refresh(); };
$('fsDown').onclick = () => { fs = Math.max(11, fs - 1); LS.set('pl_fs', fs); applyFs(); cm.refresh(); };

/* thanh phím ký tự nhanh (điện thoại): không cướp tiêu điểm để bàn phím không bị đóng */
$('qk').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  e.preventDefault();
  if (cm.getOption('readOnly')) return;
  const k = b.dataset.k;
  if (k === 'tab') { const ch = cm.getCursor().ch; cm.replaceSelection(' '.repeat(4 - (ch % 4)), 'end'); }
  else if (k === 'undo') cm.undo();
  else cm.replaceSelection(k, 'end');
  cm.focus();
});

/* ------------------------------------------------------------- chuyển giữa "Soạn code" và "Kết quả" trên điện thoại */
const work = $('work');
function setView(v) {
  work.dataset.view = v;
  $('segCode').classList.toggle('active', v === 'code'); $('segOut').classList.toggle('active', v === 'out');
  if (v === 'out') $('segDot').hidden = true;
  setTimeout(() => cm.refresh(), 30);
}
$('segCode').onclick = () => setView('code'); $('segOut').onclick = () => setView('out');
const showOutOnMobile = () => { if (mobileMQ.matches) setView('out'); };

/* ------------------------------------------------------------- console kết quả */
const consEl = $('console');
let segs = [];            // [{k, s}]  k: o (stdout) e (stderr) i (nhập) m (hệ thống)
let totalLen = 0;
const MAX_LEN = 120000;
let inputEl = null;

function appendOut(k, s) {
  if (!s) return;
  if (consEl.firstChild && consEl.firstChild.dataset && consEl.firstChild.dataset.ph) consEl.removeChild(consEl.firstChild);
  const last = segs[segs.length - 1];
  const holder = inputEl ? inputEl.parentNode : null;
  if (last && last.k === k && !holder) {
    last.s += s; last.el.textContent += s;
  } else {
    const el = document.createElement('span'); el.className = 'cons-seg-' + k; el.textContent = s;
    if (holder) holder.parentNode.insertBefore(el, holder); else consEl.appendChild(el);
    segs.push({ k, s, el });
  }
  totalLen += s.length;
  while (totalLen > MAX_LEN) {
    const f = segs[0], drop = Math.min(f.s.length, totalLen - MAX_LEN);
    if (drop >= f.s.length && segs.length > 1) { segs.shift(); f.el.remove(); }
    else { f.s = f.s.slice(drop); f.el.textContent = f.s; }
    totalLen -= drop;
  }
  consEl.scrollTop = consEl.scrollHeight;
  scheduleState();
}
function clearConsole() {
  segs = []; totalLen = 0; inputEl = null; consEl.textContent = '';
  $('hint').hidden = true;
}
function tailSegs() {
  const out = []; let n = 0;
  for (let i = segs.length - 1; i >= 0 && n < 5000; i--) { const s = segs[i].s.length > 5000 ? segs[i].s.slice(-5000) : segs[i].s; out.unshift({ k: segs[i].k, s }); n += s.length; }
  return out;
}

const HINTS = {
  SyntaxError: 'Cú pháp sai: kiểm tra dấu ngoặc ( ), dấu nháy " \', dấu hai chấm : sau if/for/while/def và chính tả từ khóa.',
  IndentationError: 'Thụt lề chưa đúng: các dòng trong cùng một khối lệnh phải thụt lề bằng nhau (thường là 4 dấu cách).',
  TabError: 'Đang trộn lẫn Tab và dấu cách khi thụt lề, hãy dùng thống nhất một kiểu.',
  NameError: 'Tên biến/hàm chưa được tạo hoặc gõ sai chữ hoa – thường. Hãy kiểm tra lại tên và thứ tự các dòng lệnh.',
  TypeError: 'Sai kiểu dữ liệu: ví dụ cộng chuỗi với số. Dùng int(), float(), str() để đổi kiểu cho phù hợp.',
  ValueError: 'Giá trị không phù hợp: ví dụ int("abc"). Hãy kiểm tra dữ liệu nhập vào.',
  ZeroDivisionError: 'Em đang chia cho 0. Hãy kiểm tra số chia.',
  IndexError: 'Chỉ số vượt quá độ dài của danh sách/chuỗi (chỉ số bắt đầu từ 0).',
  KeyError: 'Khóa này không có trong từ điển (dict).',
  AttributeError: 'Đối tượng không có thuộc tính/phương thức này, hãy kiểm tra tên hàm (ví dụ .append, .upper).',
  ModuleNotFoundError: 'Thư viện này chưa có sẵn. Đã có: math, random, turtle, numpy, pandas, matplotlib, scipy, sympy, datetime, statistics… Hãy hỏi giáo viên.',
  ImportError: 'Không nạp được thư viện, hãy kiểm tra tên.',
  RecursionError: 'Hàm gọi lại chính nó quá nhiều lần – kiểm tra điều kiện dừng.',
  FileNotFoundError: 'Không tìm thấy file. Trên web, file chỉ tồn tại tạm thời trong trang.',
};
function showHint() {
  const e = segs.filter((x) => x.k === 'e').map((x) => x.s).join('').trim().split('\n').pop() || '';
  const m = /^([A-Za-z]+(?:Error|Exception))\b/.exec(e);
  if (!m) return;
  const h = HINTS[m[1]] || (m[1].endsWith('Error') ? 'Chương trình gặp lỗi. Hãy đọc dòng cuối của thông báo lỗi và kiểm tra lại dòng được tô đỏ.' : '');
  if (!h) return;
  $('hint').innerHTML = '<b>Gợi ý:</b> ' + h.replace(/</g, '&lt;');
  $('hint').hidden = false;
}

/* ------------------------------------------------------------- đồ họa turtle */
const gWrap = $('gfxWrap'), gCv = $('gfx'), gTop = $('gfxTop');
const gx = gCv.getContext('2d'), gt = gTop.getContext('2d');
let gOps = [], gCur = new Map(), gBg = '#ffffff', gW = 0, gH = 0, gDpr = 1;

function gSize() {
  gDpr = window.devicePixelRatio || 1; gW = gWrap.clientWidth; gH = gWrap.clientHeight;
  for (const c of [gCv, gTop]) { c.width = Math.max(1, Math.round(gW * gDpr)); c.height = Math.max(1, Math.round(gH * gDpr)); }
  gRedraw();
}
function gOne(op) {
  const X = (x) => gW / 2 + x, Y = (y) => gH / 2 - y;
  if (op.o === 'line') { gx.strokeStyle = op.c; gx.lineWidth = op.w; gx.lineCap = 'round'; gx.beginPath(); gx.moveTo(X(op.x1), Y(op.y1)); gx.lineTo(X(op.x2), Y(op.y2)); gx.stroke(); }
  else if (op.o === 'fill') { gx.fillStyle = op.c; gx.beginPath(); op.pts.forEach((p, i) => i ? gx.lineTo(X(p[0]), Y(p[1])) : gx.moveTo(X(p[0]), Y(p[1]))); gx.closePath(); gx.fill(); }
  else if (op.o === 'dot') { gx.fillStyle = op.c; gx.beginPath(); gx.arc(X(op.x), Y(op.y), op.r, 0, 6.2832); gx.fill(); }
  else if (op.o === 'text') {
    const f = op.font; gx.fillStyle = op.c; gx.font = (f[2].includes('bold') ? 'bold ' : '') + (f[2].includes('italic') ? 'italic ' : '') + Math.round(f[1] * 1.33) + 'px "' + f[0] + '", sans-serif';
    gx.textAlign = op.align === 'center' ? 'center' : op.align === 'right' ? 'right' : 'left'; gx.textBaseline = 'alphabetic'; gx.fillText(op.s, X(op.x), Y(op.y));
  }
}
function gRedraw() {
  gx.setTransform(gDpr, 0, 0, gDpr, 0, 0); gx.fillStyle = gBg; gx.fillRect(0, 0, gW, gH);
  for (const op of gOps) gOne(op);
  gCursors();
}
function gCursors() {
  gt.setTransform(gDpr, 0, 0, gDpr, 0, 0); gt.clearRect(0, 0, gW, gH);
  for (const c of gCur.values()) {
    if (!c.show) continue;
    const a = c.h * Math.PI / 180, cx = gW / 2 + c.x, cy = gH / 2 - c.y, ca = Math.cos(a), sa = Math.sin(a);
    const P = (f, s) => [cx + f * ca + s * sa, cy - f * sa + s * ca];
    const t = P(12, 0), l = P(-8, 7), r = P(-8, -7), m = P(-3, 0);
    gt.beginPath(); gt.moveTo(...t); gt.lineTo(...l); gt.lineTo(...m); gt.lineTo(...r); gt.closePath();
    gt.fillStyle = c.c; gt.globalAlpha = .85; gt.fill(); gt.globalAlpha = 1; gt.strokeStyle = '#111'; gt.lineWidth = 1; gt.stroke();
  }
}
let gfxSeen = false;
function gfxOps(ops) {
  let full = false;
  for (const op of ops) {
    if (op.o === 'turtle') gCur.set(op.id, op);
    else if (op.o === 'bg') { gBg = op.c; full = true; }
    else if (op.o === 'clear') { gOps = []; full = true; }
    else { gOps.push(op); if (!full) gOne(op); }
  }
  if (gOps.length > 300000) { gOps = gOps.slice(-200000); full = true; }
  if (full) gRedraw(); else gCursors();
  $('gfxDot').hidden = false;
  if (!gfxSeen) { gfxSeen = true; showTab('gfx'); }
}
function gfxImage(b64) {
  const box = $('gfxImgs'), im = new Image(); im.src = 'data:image/png;base64,' + b64; box.appendChild(im); box.hidden = false;
  $('gfxDot').hidden = false;
  if (!gfxSeen) { gfxSeen = true; showTab('gfx'); }
}
function gfxReset() { $('gfxImgs').textContent = ''; $('gfxImgs').hidden = true; gOps = []; gCur.clear(); gBg = '#ffffff'; gfxSeen = false; $('gfxDot').hidden = true; if (gW) gRedraw(); }
function showTab(which) {
  const g = which === 'gfx';
  $('tabOut').classList.toggle('active', !g); $('tabGfx').classList.toggle('active', g);
  consEl.hidden = g; gWrap.hidden = !g; if (g) { gSize(); $('hint').hidden = true; }
}
$('tabOut').onclick = () => showTab('out'); $('tabGfx').onclick = () => showTab('gfx');
new ResizeObserver(() => { if (!gWrap.hidden) gSize(); }).observe(gWrap);

/* ------------------------------------------------------------- Service Worker (cho lệnh input) */
let swOk = false;
async function ensureSW() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((res) => { const t = setTimeout(res, 3500); navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); res(); }, { once: true }); });
    }
    return !!navigator.serviceWorker.controller;
  } catch (e) { return false; }
}

/* ------------------------------------------------------------- Python (worker) */
let worker = null, ready = false, running = false, status = 'idle', pyVer = '';
const runBtn = $('btnRun'), stopBtn = $('btnStop');

function setUi(state, text) {
  const el = $('stState'); el.className = 'st-state ' + state; $('stTxt').textContent = text;
}
function refreshButtons() {
  runBtn.disabled = !ready || running;
  stopBtn.disabled = !running;
  $('runTxt').textContent = !ready ? 'Đang tải Python…' : (running ? 'Đang chạy…' : 'Chạy');
}
function startWorker() {
  ready = false; refreshButtons(); setUi('', 'Đang tải Python…');
  worker = new Worker('assets/js/worker.js');
  worker.onmessage = onWorker;
  worker.onerror = (e) => { toast('Lỗi khởi động Python: ' + (e.message || ''), 'err'); };
  worker.postMessage({ t: 'init', base: BASE });
}
function onWorker(ev) {
  const m = ev.data;
  if (m.t === 'ready') {
    ready = true; pyVer = m.ver; $('stVer').textContent = 'Python ' + m.ver; setUi('ready', 'Sẵn sàng'); refreshButtons();
  } else if (m.t === 'fatal') {
    toast('Không tải được Python: ' + m.msg, 'err'); setUi('error', 'Lỗi tải Python');
  } else if (m.t === 'out') {
    for (const p of m.parts) appendOut(p.k, p.s);
  } else if (m.t === 'info') {
    if (running) setUi('running', /^Loading/.test(m.text) ? 'Đang nạp thư viện: ' + m.text.replace(/^Loading /, '') : m.text);
  } else if (m.t === 'gfx') {
    gfxOps(m.ops);
  } else if (m.t === 'img') {
    gfxImage(m.data);
  } else if (m.t === 'need_input') {
    showInput(m.token);
  } else if (m.t === 'done') {
    running = false; removeInput();
    if (m.err !== 0) { status = 'error'; showTab('out'); markErr(m.err); showHint(); setUi('error', 'Chương trình có lỗi'); }
    else { status = 'done'; setUi('ready', 'Chạy xong'); }
    if (segs.length && !/\n$/.test(segs[segs.length - 1].s)) appendOut('m', '');
    refreshButtons(); scheduleState();
  }
}

function showInput(token) {
  removeInput();
  if (!swOk) appendOut('e', '[Trình duyệt chưa bật Service Worker nên chưa nhập được dữ liệu cho input(). Hãy dùng Chrome/Edge/Safari mới nhất, không mở ở chế độ riêng tư.]\n');
  const wrap = document.createElement('span');
  const inp = document.createElement('input');
  inp.className = 'inline-input'; inp.spellcheck = false; inp.autocomplete = 'off'; inp.autocapitalize = 'off'; inp.enterKeyHint = 'send';
  wrap.appendChild(inp); consEl.appendChild(wrap); inputEl = inp;
  const fit = () => { inp.style.width = Math.max(6, inp.value.length + 2) + 'ch'; };
  inp.addEventListener('input', fit); fit();
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = inp.value;
    removeInput();
    appendOut('i', text + '\n');
    const c = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (c) c.postMessage({ t: 'input', token, text });
  });
  setUi('running', 'Đang chờ em nhập dữ liệu…');
  consEl.scrollTop = consEl.scrollHeight; inp.focus(); scheduleState();
}
function removeInput() { if (inputEl) { const w = inputEl.parentNode; if (w) w.remove(); inputEl = null; scheduleState(); } }
function feedInput(text) {
  if (!inputEl) return;
  inputEl.value = text; inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
}
consEl.addEventListener('click', () => { if (inputEl && !getSelection().toString()) inputEl.focus(); });

function run() {
  if (!ready || running) return;
  clearErr(); clearConsole(); gfxReset(); showTab('out'); showOutOnMobile();
  running = true; status = 'running'; setUi('running', 'Đang chạy…'); refreshButtons();
  worker.postMessage({ t: 'run', code: cm.getValue(), fname: fileName() });
  scheduleState();
}
function stop() {
  if (!running) return;
  worker.terminate(); removeInput();
  appendOut('m', '\n[Đã dừng chương trình]\n');
  running = false; status = 'done'; refreshButtons(); scheduleState();
  startWorker();
}
runBtn.onclick = run; stopBtn.onclick = stop;
function runWhenReady() { if (ready && !running) run(); else setTimeout(runWhenReady, 300); }
if (mobileMQ.matches) {
  /* điện thoại: báo có kết quả mới khi đang ở màn hình soạn code */
  const mo = new MutationObserver(() => { if (work.dataset.view === 'code') $('segDot').hidden = false; });
  mo.observe(consEl, { childList: true, characterData: true, subtree: true });
}

/* ------------------------------------------------------------- vào lớp / kết nối giáo viên */
let db = null, conn = null, room = LS.get('pl_room', ''), solo = false, stateT = null, lastSent = {};
function connUi(kind, txt) {
  const b = $('btnJoin'); b.className = 'pill pillbtn ' + (kind || ''); $('connTxt').textContent = txt;
}
function resetSent() { lastSent = {}; }
function buildState() {
  const m = meta();
  return {
    may: m.may, name: m.name, lop: m.lop, bai: m.bai, code: cm.getValue(), segs: JSON.stringify(tailSegs()),
    status, errLine: Math.max(errLine, 0), waiting: !!inputEl,
  };
}
function sendState() {
  stateT = null;
  if (!conn) return;
  const cur = buildState(), patch = {}; let any = false;
  for (const k in cur) if (cur[k] !== lastSent[k]) { patch[k] = cur[k]; any = true; }
  if (!any) return;
  Object.assign(lastSent, patch);
  conn.setState(patch).catch((e) => { for (const k in patch) delete lastSent[k]; console.warn(e); });
}
function scheduleState() { if (conn && !stateT) stateT = setTimeout(sendState, 700); }

function applyRemoteCode(code) {
  if (code === cm.getValue()) return;
  const cur = cm.getCursor(), sc = cm.getScrollInfo();
  cm.setValue(code); try { cm.setCursor(cur); } catch (e) { /* bỏ qua */ } cm.scrollTo(sc.left, sc.top);
}
function setLock(on) {
  $('lockBanner').hidden = !on; cm.setOption('readOnly', on ? 'nocursor' : false); cm.refresh();
}
let lastSeq = 0;
function handleCmd(d) {
  if (d.t === 'run') {
    if (typeof d.code === 'string') applyRemoteCode(d.code);
    if (!ready) toast('Python đang khởi động, giáo viên hãy bấm Chạy lại sau giây lát.', 'warn');
    else if (running) { stop(); runWhenReady(); } else run();
  } else if (d.t === 'stop') stop();
  else if (d.t === 'input') feedInput(d.text);
  else if (d.t === 'notify') toast('📢 Giáo viên: ' + d.text, 'warn', 9000);
}
function handleCtl(c) {
  setLock(!!c.locked);
  if (c.locked && c.edit && c.edit.seq !== lastSeq) { lastSeq = c.edit.seq; applyRemoteCode(c.edit.code || ''); }
}

async function joinRoom(r, silent) {
  r = sanitizeRoom(r); if (!r) throw new Error('Em hãy nhập mã lớp.');
  connUi('', 'Đang vào lớp…');
  try {
    db = db || Hub.createDB();
    if (conn) await conn.leave();
    const c = new Hub.StudentConn(db, r);
    await c.join(Object.assign(buildState(), { online: true }));
    conn = c; room = r; solo = false; LS.set('pl_room', r); resetSent();
    c.onConn((ok) => { if (ok) { connUi('ok', (c.title && c.title !== r ? c.title : 'Lớp ' + r)); resetSent(); scheduleState(); } else connUi('bad', 'Mất kết nối – đang thử lại…'); });
    c.onCmd(handleCmd); c.onCtl(handleCtl);
    c.onFiles(renderFiles);
    if (!silent) toast('Đã vào lớp “' + (c.title || r) + '”', 'ok');
    scheduleState();
    return c;
  } catch (e) {
    conn = null; connUi('', 'Chưa vào lớp');
    throw e;
  }
}

/* hộp thoại vào lớp: học sinh CHỌN lớp trong danh sách giáo viên đã tạo (đỡ gõ sai) */
const dlg = $('joinDlg');
let manual = false;
function setManual(on) {
  manual = on; $('jRoom').hidden = !on; $('jClass').parentElement.hidden = on; $('jManual').textContent = on ? 'Chọn lớp từ danh sách' : 'Không thấy lớp của em? Nhập mã lớp';
  if (on) $('jRoom').focus();
}
async function loadClasses() {
  const sel = $('jClass'); sel.disabled = true; sel.innerHTML = '<option value="">Đang tải danh sách lớp…</option>';
  try {
    db = db || Hub.createDB(); await db.signInAnonymously();
    const list = await Hub.listClasses(db);
    sel.innerHTML = '';
    const ph = document.createElement('option'); ph.value = ''; ph.textContent = list.length ? '— Chọn lớp của em —' : 'Chưa có lớp nào (hãy hỏi giáo viên)'; sel.appendChild(ph);
    for (const c of list) { const o = document.createElement('option'); o.value = c.room; o.textContent = c.title + (c.title !== c.room ? '  (' + c.room + ')' : ''); sel.appendChild(o); }
    if (room && !list.some((c) => c.room === room)) { const o = document.createElement('option'); o.value = room; o.textContent = room + '  (mã từ liên kết)'; sel.appendChild(o); }
    sel.value = room || (list.length === 1 ? list[0].room : '');
    sel.disabled = false;
  } catch (e) {
    sel.innerHTML = '<option value="">Không tải được danh sách lớp</option>'; setManual(true);
    const er = $('joinErr'); er.textContent = 'Không tải được danh sách lớp (' + (e.message || 'lỗi mạng') + '). Em có thể nhập mã lớp.'; er.hidden = false;
  }
}
function openJoin(msg) {
  $('jRoom').value = room || ''; $('jName').value = F.name.value; $('jMay').value = F.may.value; $('jLop').value = F.lop.value;
  setManual(false);
  const er = $('joinErr'); er.hidden = !msg; er.textContent = msg || '';
  dlg.hidden = false; loadClasses();
  setTimeout(() => (room ? $('jName') : $('jClass')).focus(), 50);
}
$('jManual').onclick = () => setManual(!manual);
$('btnJoin').onclick = () => openJoin('');
$('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const er = $('joinErr'); er.hidden = true;
  const code = manual ? $('jRoom').value : $('jClass').value;
  if (!sanitizeRoom(code)) { er.textContent = 'Em hãy chọn lớp của em trong danh sách.'; er.hidden = false; return; }
  const name = $('jName').value.trim();
  if (!name) { er.textContent = 'Em hãy nhập họ và tên.'; er.hidden = false; return; }
  F.name.value = name; F.may.value = $('jMay').value.trim(); F.lop.value = $('jLop').value.trim();
  for (const k of ['name', 'may', 'lop']) LS.set('pl_' + k, F[k].value);
  const b = $('jGo'); b.disabled = true; b.textContent = 'Đang vào…';
  try { await joinRoom(code); dlg.hidden = true; }
  catch (err) { er.textContent = err.message || 'Không vào được lớp.'; er.hidden = false; }
  b.disabled = false; b.textContent = 'Vào lớp';
});
$('jSolo').onclick = async () => {
  solo = true; dlg.hidden = true; LS.set('pl_room', '');
  if (conn) { await conn.leave(); conn = null; }
  connUi('', 'Luyện tập một mình');
};

/* ------------------------------------------------------------- nộp bài / bài mới */
$('btnSubmit').onclick = async () => {
  if (!conn) { toast('Em cần vào lớp (nhập mã lớp) trước khi nộp bài.', 'warn'); openJoin(''); return; }
  const m = meta(); let bad = false;
  for (const k of ['may', 'name', 'bai']) if (!m[k]) { F[k].classList.add('bad'); bad = true; }
  if (bad) { toast('Em hãy nhập đủ STT, Họ tên và Bài số trước khi nộp.', 'warn'); (F.may.value ? (F.name.value ? F.bai : F.name) : F.may).focus(); return; }
  const code = cm.getValue();
  if (!code.trim()) { toast('Chưa có code để nộp.', 'warn'); return; }
  const btn = $('btnSubmit'); btn.disabled = true;
  try {
    await sendStateNow();
    const d = await conn.submit(Object.assign({}, m, { code }));
    lastSubmitted = code; LS.set('pl_submitted', code);
    const t = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    $('stSub').textContent = '✓ Đã nộp lúc ' + t;
    toast('Đã nộp bài thành công: ' + d.file, 'ok');
  } catch (e) { toast('Nộp bài chưa được: ' + (e.message || 'mất kết nối') + '. Bài của em vẫn còn trên màn hình, hãy thử lại.', 'err', 6000); }
  btn.disabled = false;
};
async function sendStateNow() { clearTimeout(stateT); stateT = null; if (conn) { const cur = buildState(); lastSent = {}; await conn.setState(cur); Object.assign(lastSent, cur); } }

$('btnNew').onclick = () => {
  const code = cm.getValue();
  if (code.trim() && code !== lastSubmitted && code !== DEFAULT_CODE && !confirm('Bài hiện tại CHƯA được nộp (hoặc đã sửa sau khi nộp).\nEm vẫn muốn mở trang mới?')) return;
  if (running) stop();
  clearConsole(); clearErr();
  cm.setValue('# Bài mới\n'); cm.clearHistory();
  const n = parseInt(F.bai.value, 10); if (!isNaN(n)) { F.bai.value = String(n + 1); LS.set('pl_bai', F.bai.value); }
  lastSubmitted = null; LS.set('pl_submitted', ''); $('stSub').textContent = ''; status = 'idle';
  updateFileName(); setView('code'); cm.focus(); cm.setCursor(cm.lineCount(), 0); scheduleState();
};
async function openLocalFile(file) {
  if (!file) return;
  if (cm.getOption('readOnly')) { toast('Giáo viên đang chỉnh sửa bài của em, hãy thử lại sau.', 'warn'); return; }
  const cur = cm.getValue();
  if (cur.trim() && cur !== lastSubmitted && cur !== DEFAULT_CODE && !confirm('Mở file sẽ THAY THẾ bài đang làm (bài này chưa nộp hoặc đã sửa sau khi nộp).\nEm vẫn muốn mở file?')) return;
  try {
    const text = await readTextFile(file);
    if (running) stop();
    clearConsole(); clearErr(); gfxReset(); showTab('out'); setView('code');
    cm.setValue(text); cm.clearHistory(); status = 'idle'; cm.focus(); scheduleState();
    toast('Đã mở file: ' + file.name, 'ok');
  } catch (e) { toast('Không mở được file: ' + e.message, 'err'); }
}
$('btnOpen').onclick = () => $('fileOpen').click();
$('fileOpen').onchange = (e) => { openLocalFile(e.target.files[0]); e.target.value = ''; };
(() => {
  const w = document.querySelector('.editor-wrap');
  ['dragenter', 'dragover'].forEach((n) => w.addEventListener(n, (e) => { e.preventDefault(); w.style.outline = '3px dashed var(--blue)'; w.style.outlineOffset = '-6px'; }));
  ['dragleave', 'drop'].forEach((n) => w.addEventListener(n, (e) => { e.preventDefault(); w.style.outline = ''; }));
  w.addEventListener('drop', (e) => openLocalFile(e.dataTransfer.files[0]));
})();
$('btnClear').onclick = () => { clearConsole(); status = running ? status : 'idle'; scheduleState(); };
$('btnDownload').onclick = () => {
  const m = meta();
  download(fileNameFor({ may: m.may, name: m.name || 'HocSinh', bai: m.bai || '1' }), new Blob([cm.getValue()], { type: 'text/x-python;charset=utf-8' }));
};
window.addEventListener('beforeunload', () => LS.set('pl_code', cm.getValue()));

/* ------------------------------------------------------------- bài tập giáo viên chia sẻ */
function renderFiles(list) {
  const b = $('fileBadge'); b.textContent = list.length; b.hidden = !list.length;
  const box = $('filesList'); box.textContent = '';
  if (!list.length) { box.innerHTML = '<div class="empty">Thầy cô chưa chia sẻ bài tập nào.</div>'; return; }
  for (const f of list) {
    const a = document.createElement('button'); a.type = 'button'; a.className = 'file-row';
    a.innerHTML = '<span class="fi"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg></span><span class="fn"></span><span class="fm"></span>';
    a.querySelector('.fn').textContent = f.name; a.querySelector('.fm').textContent = fmtSize(f.size || 0);
    a.onclick = async () => {
      try { const b64 = await conn.fileData(f.id); if (!b64) throw new Error('file trống'); download(f.name, new Blob([b64ToBytes(b64)])); }
      catch (e) { toast('Không tải được file: ' + (e.message || ''), 'err'); }
    };
    box.appendChild(a);
  }
}
$('btnFiles').onclick = () => { if (!conn) { toast('Em cần vào lớp để xem bài tập của thầy cô.', 'warn'); openJoin(''); return; } const p = $('filesPanel'); p.hidden = !p.hidden; };
$('filesClose').onclick = () => { $('filesPanel').hidden = true; };

/* ------------------------------------------------------------- thanh kéo chia đôi (máy tính) */
(() => {
  const sp = $('splitter'); let drag = false;
  sp.addEventListener('pointerdown', (e) => { drag = true; sp.classList.add('drag'); sp.setPointerCapture(e.pointerId); });
  sp.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = work.getBoundingClientRect(); const pct = Math.min(80, Math.max(25, ((e.clientX - r.left) / r.width) * 100));
    work.style.setProperty('--split', pct + '%'); cm.refresh();
  });
  sp.addEventListener('pointerup', () => { drag = false; sp.classList.remove('drag'); cm.refresh(); });
})();
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('filesPanel').hidden = true; });

/* ------------------------------------------------------------- khởi động */
$('console').firstChild.dataset.ph = '1';
U.demoBar($('demoBar'), Hub.isDemo());
const qRoom = new URLSearchParams(location.search).get('lop');
if (qRoom) room = sanitizeRoom(qRoom);
(async () => {
  if (U.guardFile()) return;
  swOk = await ensureSW();
  startWorker();
  cm.refresh();
  if (room && F.name.value.trim()) {
    try { await joinRoom(room, true); }
    catch (e) { openJoin(e.message); }
  } else openJoin('');
})();
})();
