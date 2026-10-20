# -*- coding: utf-8 -*-
"""Kiểm tra trang chạy đúng khi đặt trong thư mục con (giống GitHub Pages dạng https://user.github.io/ten-repo/).
Chạy:  python kiem_thu/test_subpath.py"""
import asyncio, base64, json, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
import aiohttp

ROOT = Path(__file__).resolve().parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
HP, CP = 8766, 9445
LIVE = sys.argv[1] if len(sys.argv) > 1 else None   # ví dụ: python kiem_thu/test_subpath.py https://user.github.io/repo/hocsinh.html
URL = LIVE or f"http://127.0.0.1:{HP}/{ROOT.name}/hocsinh.html"


async def main():
    srv = None if LIVE else subprocess.Popen([sys.executable, "-m", "http.server", str(HP), "--bind", "127.0.0.1"], cwd=str(ROOT.parent), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ch = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={CP}", f"--user-data-dir={tempfile.mkdtemp(prefix='pl_sub_')}", "--no-first-run", "--disable-gpu", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = True
    try:
        for _ in range(40):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{CP}/json/version", timeout=1); urllib.request.urlopen(URL, timeout=1); break
            except Exception:
                time.sleep(0.5)
        async with aiohttp.ClientSession() as s:
            async with s.put(f"http://127.0.0.1:{CP}/json/new?about:blank") as r:
                t = await r.json()
            ws = await s.ws_connect(t["webSocketDebuggerUrl"], max_msg_size=0)
            n = [0]

            async def cmd(m, **p):
                n[0] += 1; i = n[0]
                await ws.send_str(json.dumps({"id": i, "method": m, "params": p}))
                while True:
                    d = json.loads((await ws.receive()).data)
                    if d.get("id") == i:
                        return d.get("result", {})

            async def js(code):
                r = await cmd("Runtime.evaluate", expression=code, awaitPromise=True, returnByValue=True)
                return r.get("result", {}).get("value")

            async def wait(expr, to=90):
                t0 = time.time()
                while time.time() - t0 < to:
                    if await js(expr):
                        return True
                    await asyncio.sleep(0.4)
                return False
            await cmd("Page.enable"); await cmd("Page.navigate", url=URL); await asyncio.sleep(2)
            await js("document.getElementById('jSolo').click(); 1")
            a = await wait("!document.getElementById('btnRun').disabled")
            print(("PASS" if a else "FAIL"), "thư mục con: Python tải xong")
            await js("document.querySelector('.CodeMirror').CodeMirror.setValue(\"n = input('Tên? ')\\nprint('Chào', n)\\n\"); document.getElementById('btnRun').click(); 1")
            b = await wait("!!document.querySelector('.inline-input')", 30)
            print(("PASS" if b else "FAIL"), "thư mục con: input() hiện ô nhập (Service Worker hoạt động)")
            await js("(()=>{const i=document.querySelector('.inline-input'); i.value='Hà'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',cancelable:true})); return 1})()")
            c = await wait("document.getElementById('console').textContent.indexOf('Chào Hà')>=0", 30)
            print(("PASS" if c else "FAIL"), "thư mục con: input() trả đúng giá trị")
            ok = a and b and c
    finally:
        ch.terminate()
        if srv: srv.terminate()
    sys.exit(0 if ok else 1)


asyncio.run(main())
