# -*- coding: utf-8 -*-
"""Mở các trang (địa chỉ thật hoặc cục bộ) bằng Chrome headless, in ra mọi lỗi console / lỗi tải file.
Chạy: python kiem_thu/kiem_tra_loi_trang.py https://ltthphuc.github.io/py/"""
import asyncio, base64, json, subprocess, sys, tempfile, time, urllib.request
import aiohttp

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/"
PAGES = sys.argv[2:] or ["", "hocsinh.html", "giaovien.html", "hs/", "gv/"]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
CP = 9555


async def main():
    ch = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={CP}", f"--user-data-dir={tempfile.mkdtemp(prefix='pl_err_')}", "--no-first-run", "--disable-gpu", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{CP}/json/version", timeout=1); break
            except Exception:
                time.sleep(0.5)
        async with aiohttp.ClientSession() as s:
            for pg in PAGES:
                async with s.put(f"http://127.0.0.1:{CP}/json/new?about:blank") as r:
                    t = await r.json()
                ws = await s.ws_connect(t["webSocketDebuggerUrl"], max_msg_size=0)
                n = [0]; logs = []

                async def send(m, **p):
                    n[0] += 1; await ws.send_str(json.dumps({"id": n[0], "method": m, "params": p}))
                await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable")
                await send("Page.navigate", url=BASE + pg)
                t0 = time.time(); shot = None
                while time.time() - t0 < 12:
                    try:
                        m = await asyncio.wait_for(ws.receive(), 1)
                    except asyncio.TimeoutError:
                        continue
                    d = json.loads(m.data)
                    me = d.get("method")
                    if me == "Runtime.exceptionThrown":
                        e = d["params"]["exceptionDetails"]; logs.append("EXC " + (e.get("exception", {}).get("description") or e.get("text", "")))
                    elif me == "Runtime.consoleAPICalled" and d["params"]["type"] in ("error", "warning"):
                        logs.append(d["params"]["type"].upper() + " " + " ".join(str(a.get("value", a.get("description", ""))) for a in d["params"]["args"]))
                    elif me == "Log.entryAdded" and d["params"]["entry"]["level"] in ("error", "warning"):
                        en = d["params"]["entry"]; logs.append("LOG " + en["level"] + " " + en["text"] + " " + en.get("url", ""))
                    elif me == "Network.loadingFailed":
                        logs.append("NETFAIL " + str(d["params"].get("errorText")) + " " + str(d["params"].get("blockedReason", "")))
                    elif me == "Network.responseReceived" and d["params"]["response"]["status"] >= 400:
                        logs.append("HTTP %s %s" % (d["params"]["response"]["status"], d["params"]["response"]["url"]))
                print("====", BASE + pg, "->", "LỖI" if logs else "không có lỗi")
                for l in logs[:15]:
                    print("   ", l[:300])
                await ws.close()
    finally:
        ch.terminate()

asyncio.run(main())
