/* Web Worker: chạy Python (Pyodide) tách khỏi giao diện để nút Dừng luôn hoạt động.
   Trang chính gửi {t:'init', base} (địa chỉ gốc của trang web) rồi {t:'run', code, fname}. */
let BASE = '';
let pending = [], pendingLen = 0, timer = null, lastFlush = 0;

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (pending.length) { postMessage({ t: 'out', parts: pending }); pending = []; pendingLen = 0; }
  lastFlush = performance.now();
}
function push(k, s) {
  if (!s) return;
  const last = pending[pending.length - 1];
  if (last && last.k === k) last.s += s; else pending.push({ k, s });
  pendingLen += s.length;
  /* vòng lặp in vô hạn: chỉ giữ phần đuôi để giao diện không bị quá tải */
  while (pendingLen > 100000 && pending.length) {
    const f = pending[0], over = pendingLen - 100000;
    if (over >= f.s.length && pending.length > 1) { pending.shift(); pendingLen -= f.s.length; }
    else { const cut = Math.min(over, f.s.length); f.s = f.s.slice(cut); pendingLen -= cut; break; }
  }
  if (performance.now() - lastFlush > 60) flush();
  else if (!timer) timer = setTimeout(flush, 60);
}

/* input(): chờ (đồng bộ) cho tới khi học sinh gõ xong và nhấn Enter. Service Worker giữ yêu cầu cho tới lúc đó. */
function jsInput() {
  flush();
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  postMessage({ t: 'need_input', token });
  for (;;) {
    const x = new XMLHttpRequest();
    x.open('GET', BASE + '__input?t=' + token, false);
    try { x.send(); } catch (e) { return ''; }
    if (x.status !== 200) return '';
    let d; try { d = JSON.parse(x.responseText); } catch (e) { return ''; }
    if (d.w) continue;               // service worker xin chờ tiếp
    return d.v == null ? '' : String(d.v);
  }
}

const BOOT = `
import sys, os, builtins, linecache, traceback
sys.path.insert(0, '/lab_mods')
os.environ['MPLBACKEND'] = 'module://lab_backend'

def _input(prompt=''):
    sys.stdout.write(str(prompt))
    sys.stdout.flush()
    return _js_input()
builtins.input = _input

def __run_user(src, fname):
    g = {'__name__': '__main__', '__file__': fname, '__builtins__': builtins}
    linecache.cache[fname] = (len(src), None, src.splitlines(True), fname)
    err = 0
    sys.modules.pop('turtle', None)
    _plt = sys.modules.get('matplotlib.pyplot')
    if _plt is not None:
        _plt.close('all')
    try:
        exec(compile(src, fname, 'exec'), g)
    except SystemExit:
        pass
    except BaseException as e:
        tb = e.__traceback__
        if tb is not None:
            tb = tb.tb_next
        if isinstance(e, SyntaxError) and e.filename == fname:
            err = e.lineno or 0
        else:
            t = tb
            while t is not None:
                if t.tb_frame.f_code.co_filename == fname:
                    err = t.tb_lineno
                t = t.tb_next
        traceback.print_exception(type(e), e, tb)
        sys.stderr.flush()
        err = err or -1
    finally:
        try:
            _t = sys.modules.get('turtle')
            if _t is not None:
                _t._flush()
        except Exception:
            pass
        try:
            sys.stdout.flush()
        except Exception:
            pass
    return err
`;

let py = null, readyP = null;

async function start() {
  importScripts(BASE + 'pyodide/pyodide.js');
  py = await loadPyodide({ indexURL: BASE + 'pyodide/' });
  const dec = { o: new TextDecoder(), e: new TextDecoder() };
  py.setStdout({ write: (b) => { push('o', dec.o.decode(b, { stream: true })); return b.length; } });
  py.setStderr({ write: (b) => { push('e', dec.e.decode(b, { stream: true })); return b.length; } });
  py.globals.set('_js_input', jsInput);
  self._js_turtle = (json) => { flush(); postMessage({ t: 'gfx', ops: JSON.parse(json) }); };
  self._js_image = (b64) => { flush(); postMessage({ t: 'img', data: b64 }); };
  const turtleSrc = await (await fetch(BASE + 'assets/py/pyturtle.py')).text();
  const backendSrc = await (await fetch(BASE + 'assets/py/lab_backend.py')).text();
  py.FS.mkdirTree('/lab_mods');
  py.FS.writeFile('/lab_mods/turtle.py', turtleSrc);
  py.FS.writeFile('/lab_mods/lab_backend.py', backendSrc);
  py.runPython(BOOT);
  postMessage({ t: 'ready', ver: py.runPython('sys.version.split()[0]') });
}

onmessage = async (e) => {
  const m = e.data;
  if (m.t === 'init') {
    BASE = m.base;
    readyP = start().catch((er) => postMessage({ t: 'fatal', msg: String(er) }));
    return;
  }
  if (m.t !== 'run') return;
  await readyP;
  let err = 0;
  try {
    try { await py.loadPackagesFromImports(m.code, { messageCallback: (t) => postMessage({ t: 'info', text: t }), errorCallback() {} }); } catch (ex) { /* thư viện không có sẵn: Python sẽ báo ModuleNotFoundError */ }
    err = py.globals.get('__run_user')(m.code, m.fname);
  } catch (ex) {
    push('e', String(ex) + '\n');
    err = -1;
  }
  flush();
  postMessage({ t: 'done', err });
};
