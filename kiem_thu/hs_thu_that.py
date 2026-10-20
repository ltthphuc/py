# -*- coding: utf-8 -*-
"""Cho MỘT học sinh thử vào lớp trên trang THẬT (Firebase) bằng Chrome headless: vào lớp, chạy code, nộp bài,
rồi giữ trang mở vài chục giây để giáo viên kiểm tra trên màn hình của mình.
Chạy: python kiem_thu/hs_thu_that.py https://ltthphuc.github.io/py/ 9a1-tin [giữ_giây]"""
import asyncio, json, subprocess, sys, tempfile, time, urllib.request
import aiohttp

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://ltthphuc.github.io/py/"
ROOM = sys.argv[2] if len(sys.argv) > 2 else "9a1-tin"
HOLD = int(sys.argv[3]) if len(sys.argv) > 3 else 60
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
CP = int(__import__("os").environ.get("CDP_PORT", "9666"))
res = []


def chk(n, ok, extra=""):
    res.append(ok); print(("PASS " if ok else "FAIL ") + n + (("  -> " + str(extra)) if not ok and extra else ""), flush=True)


async def main():
    ch = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={CP}", f"--user-data-dir={tempfile.mkdtemp(prefix='pl_real_')}", "--no-first-run", "--disable-gpu", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{CP}/json/version", timeout=1); break
            except Exception:
                time.sleep(0.5)
        async with aiohttp.ClientSession() as s:
            async with s.put(f"http://127.0.0.1:{CP}/json/new?about:blank") as r:
                t = await r.json()
            ws = await s.ws_connect(t["webSocketDebuggerUrl"], max_msg_size=0)
            n = [0]; errs = []

            async def cmd(m, **p):
                n[0] += 1; i = n[0]
                await ws.send_str(json.dumps({"id": i, "method": m, "params": p}))
                while True:
                    d = json.loads((await ws.receive()).data)
                    if d.get("method") == "Runtime.exceptionThrown":
                        errs.append(d["params"]["exceptionDetails"].get("exception", {}).get("description", "exc"))
                    if d.get("id") == i:
                        return d.get("result", {})

            async def js(code):
                r = await cmd("Runtime.evaluate", expression=code, awaitPromise=True, returnByValue=True)
                if "exceptionDetails" in r:
                    raise RuntimeError(r["exceptionDetails"]["exception"].get("description", str(r)))
                return r["result"].get("value")

            async def wait(expr, to=60):
                t0 = time.time()
                while time.time() - t0 < to:
                    try:
                        if await js(expr):
                            return True
                    except RuntimeError:
                        pass
                    await asyncio.sleep(0.4)
                return False
            await cmd("Page.enable"); await cmd("Runtime.enable")
            await cmd("Emulation.setDeviceMetricsOverride", width=390, height=800, deviceScaleFactor=2, mobile=True)
            await cmd("Page.navigate", url=BASE + "hs/?lop=" + ROOM)
            chk("HS: mở trang (qua địa chỉ ngắn /hs/?lop=…)", await wait("!!document.getElementById('joinDlg')", 30))
            chk("HS: hộp thoại vào lớp hiện sẵn mã lớp", await wait(f"document.getElementById('jRoom').value==='{ROOM}'", 20))
            await js("document.getElementById('jName').value='HS Thử Nghiệm'; document.getElementById('jMay').value='99'; document.getElementById('jLop').value='Thử'; document.getElementById('jGo').click(); 1")
            ok = await wait("document.getElementById('joinDlg').hidden", 30)
            chk("HS: vào lớp thật qua Firebase", ok, await js("document.getElementById('joinErr').textContent"))
            if not ok:
                return
            chk("HS: Python tải xong", await wait("!document.getElementById('btnRun').disabled", 120))
            await js("(()=>{ const e=document.getElementById('fBai'); e.value='1'; e.dispatchEvent(new Event('input')); document.querySelector('.CodeMirror').CodeMirror.setValue(\"ten = input('Tên em? ')\\nprint('Xin chào', ten)\\nprint(sum(range(11)))\\n\"); document.getElementById('btnRun').click(); return 1 })()")
            chk("HS: input() hiện ô nhập", await wait("!!document.querySelector('.inline-input')", 30))
            await js("(()=>{const i=document.querySelector('.inline-input'); i.value='Thử nghiệm'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',cancelable:true})); return 1})()")
            chk("HS: chạy xong, kết quả đúng", await wait("document.getElementById('console').textContent.indexOf('Xin chào Thử nghiệm')>=0 && document.getElementById('console').textContent.indexOf('55')>=0", 30), await js("document.getElementById('console').textContent"))
            await js("document.getElementById('btnSubmit').click(); 1")
            chk("HS: nộp bài thành công", await wait("document.getElementById('stSub').textContent.indexOf('Đã nộp')>=0", 30), await js("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join('|')"))
            chk("Không có lỗi JavaScript", not errs, errs)
            print(f"== Giữ trang học sinh mở {HOLD}s để giáo viên kiểm tra ==", flush=True)
            await asyncio.sleep(HOLD)
    finally:
        ch.terminate()
    print("KẾT QUẢ: %d/%d đạt" % (sum(res), len(res)), flush=True)

asyncio.run(main())
