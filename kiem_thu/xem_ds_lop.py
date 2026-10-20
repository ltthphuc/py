# -*- coding: utf-8 -*-
"""Mở trang học sinh THẬT bằng trình duyệt sạch (như học sinh mới) và in danh sách lớp trong ô "Chọn lớp".
Chạy: python kiem_thu/xem_ds_lop.py https://ltthphuc.github.io/py/"""
import asyncio, json, subprocess, sys, tempfile, time, urllib.request
import aiohttp
BASE = sys.argv[1] if len(sys.argv) > 1 else "https://ltthphuc.github.io/py/"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
async def main():
    ch = subprocess.Popen([CHROME, "--headless=new", "--remote-debugging-port=9811", f"--user-data-dir={tempfile.mkdtemp()}", "--no-first-run", "--disable-gpu", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try: urllib.request.urlopen("http://127.0.0.1:9811/json/version", timeout=1); break
            except Exception: time.sleep(0.5)
        async with aiohttp.ClientSession() as s:
            async with s.put("http://127.0.0.1:9811/json/new?about:blank") as r: t = await r.json()
            ws = await s.ws_connect(t["webSocketDebuggerUrl"], max_msg_size=0); n = [0]
            async def cmd(m, **p):
                n[0] += 1; i = n[0]; await ws.send_str(json.dumps({"id": i, "method": m, "params": p}))
                while True:
                    d = json.loads((await ws.receive()).data)
                    if d.get("id") == i: return d.get("result", {})
            await cmd("Page.enable"); await cmd("Page.navigate", url=BASE + "hs/")
            for _ in range(40):
                await asyncio.sleep(1)
                r = await cmd("Runtime.evaluate", expression="document.getElementById('jClass') ? JSON.stringify({o:[...document.getElementById('jClass').options].map(x=>x.textContent), d:document.getElementById('jClass').disabled, e:document.getElementById('joinErr').textContent}) : ''", returnByValue=True)
                v = r.get("result", {}).get("value")
                if v and '"d":false' in v: print(v); break
            else: print("không tải được danh sách:", v)
    finally: ch.terminate()
asyncio.run(main())
