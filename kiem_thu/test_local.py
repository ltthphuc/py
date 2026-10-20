# -*- coding: utf-8 -*-
"""Kiểm thử tự động bản online ở CHẾ ĐỘ THỬ (backend 'local') bằng Chrome headless + CDP.
Chạy:  python kiem_thu/test_local.py   (từ thư mục gốc của dự án)
Cần: Google Chrome, aiohttp."""
import asyncio
import base64
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

import aiohttp

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "anh"
OUT.mkdir(exist_ok=True)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
HTTP_PORT, CDP_PORT = 8765, 9444
BASE = f"http://127.0.0.1:{HTTP_PORT}/"
results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (("  -> " + str(extra)) if extra and not cond else ""))


class Page:
    def __init__(self, ws):
        self.ws, self.n = ws, 0

    async def cmd(self, method, **params):
        self.n += 1
        i = self.n
        await self.ws.send_str(json.dumps({"id": i, "method": method, "params": params}))
        while True:
            m = await self.ws.receive()
            d = json.loads(m.data)
            if d.get("id") == i:
                if "error" in d:
                    raise RuntimeError(d["error"])
                return d.get("result", {})

    async def js(self, code):
        r = await self.cmd("Runtime.evaluate", expression=code, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"]["exception"].get("description", str(r)))
        return r["result"].get("value")

    async def shot(self, name):
        await asyncio.sleep(0.6)
        r = await self.cmd("Page.captureScreenshot", format="png")
        (OUT / name).write_bytes(base64.b64decode(r["data"]))

    async def wait_for(self, expr, timeout=40, step=0.3):
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if await self.js(expr):
                    return True
            except RuntimeError:
                pass
            await asyncio.sleep(step)
        return False


async def new_page(sess, w=1366, h=768, mobile=False):
    async with sess.put(f"http://127.0.0.1:{CDP_PORT}/json/new?about:blank") as r:
        t = await r.json()
    ws = await sess.ws_connect(t["webSocketDebuggerUrl"], max_msg_size=0)
    p = Page(ws)
    await p.cmd("Page.enable")
    await p.cmd("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1.5 if not mobile else 2, mobile=mobile)
    if mobile:
        await p.cmd("Emulation.setTouchEmulationEnabled", enabled=True)
    return p


async def goto(p, url):
    await p.cmd("Page.navigate", url=url)
    await asyncio.sleep(1.5)


async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(HTTP_PORT), "--bind", "127.0.0.1"], cwd=str(ROOT),
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    prof = tempfile.mkdtemp(prefix="pl_online_")
    ch = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={CDP_PORT}", f"--user-data-dir={prof}",
                           "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/version", timeout=1)
                urllib.request.urlopen(BASE, timeout=1)
                break
            except Exception:
                time.sleep(0.5)
        async with aiohttp.ClientSession() as sess:
            T = await new_page(sess)
            S = await new_page(sess)
            # ------------------------------------------------ giáo viên tạo lớp
            await goto(T, BASE + "giaovien.html")
            check("GV: hiện bảng chọn lớp (chế độ thử, không cần đăng nhập)", await T.wait_for("!document.getElementById('roomView').hidden"))
            await T.js("document.getElementById('rCode').value='9a1-tin'; document.getElementById('rTitle').value='Lớp 9A1 Tin học'; document.getElementById('rNew').click(); 1")
            check("GV: tạo lớp và vào bảng điều khiển", await T.wait_for("!document.getElementById('dash').hidden"))
            link = await T.js("document.getElementById('stuLink').dataset.url")
            check("GV: có liên kết học sinh kèm mã lớp", link and "lop=9a1-tin" in link, link)
            # ------------------------------------------------ học sinh vào lớp
            await goto(S, link)
            check("HS: hiện hộp thoại vào lớp (chưa có tên)", await S.wait_for("!document.getElementById('joinDlg').hidden"))
            await S.js("""document.getElementById('jName').value='Nguyễn Văn An'; document.getElementById('jMay').value='05'; document.getElementById('jLop').value='9A1';
                          document.getElementById('jGo').click(); 1""")
            check("HS: vào lớp thành công", await S.wait_for("document.getElementById('joinDlg').hidden && document.getElementById('connTxt').textContent.indexOf('Lớp')>=0"))
            check("HS: Service Worker điều khiển trang (cho input)", await S.js("!!navigator.serviceWorker.controller"))
            check("HS: Python tải xong", await S.wait_for("!document.getElementById('btnRun').disabled", 90))
            await S.js("""(()=>{ for (const [id,v] of [['fBai','3']]) { const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('input')); }
              document.querySelector('.CodeMirror').CodeMirror.setValue("# Bảng cửu chương\\nn = int(input('Nhập số n: '))\\nfor i in range(1, 4):\\n    print(n, 'x', i, '=', n * i)\\n"); return 1 })()""")
            await S.js("document.getElementById('btnRun').click(); 1")
            check("HS: input() hiện ô nhập", await S.wait_for("!!document.querySelector('.inline-input')"))
            await S.js("""(()=>{ const i=document.querySelector('.inline-input'); i.value='7'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',cancelable:true})); return 1 })()""")
            check("HS: input() trả đúng giá trị, chương trình chạy xong",
                  await S.wait_for("document.getElementById('console').textContent.indexOf('7 x 3 = 21')>=0"), await S.js("document.getElementById('console').textContent"))
            # ------------------------------------------------ giáo viên thấy học sinh
            check("GV: thấy thẻ học sinh", await T.wait_for("document.querySelectorAll('.card').length===1"))
            check("GV: thấy kết quả của học sinh",
                  await T.wait_for("document.querySelector('.card .pv-out').textContent.indexOf('7 x 3 = 21')>=0", 15), await T.js("document.querySelector('.card').innerText"))
            check("GV: thẻ hiện tên, STT, bài", await T.js("(()=>{const t=document.querySelector('.card').innerText; return t.includes('Nguyễn Văn An')&&t.includes('05')&&t.includes('Bài 3')})()"))
            # ------------------------------------------------ sửa code + chạy hộ + nhập hộ
            await T.js("""document.querySelector('.card').click(); 1""")
            await T.js("""(()=>{ const e=document.getElementById('mEdit'); e.checked=true; e.dispatchEvent(new Event('change')); return 1 })()""")
            check("HS: bị khóa khi giáo viên bật chế độ sửa", await S.wait_for("!document.getElementById('lockBanner').hidden"))
            await T.js("""(()=>{ const c=document.querySelector('#modal .CodeMirror').CodeMirror; c.replaceRange("x = input('Tên? ')\\nprint('Chào', x)\\n", {line:0,ch:0}, {line:c.lineCount(),ch:0}); return 1 })()""")
            check("HS: nhận code do giáo viên sửa", await S.wait_for("document.querySelector('.CodeMirror').CodeMirror.getValue().indexOf('Tên?')>=0", 15))
            await T.js("document.getElementById('mRun').click(); 1")
            check("GV bấm Chạy: chương trình chạy trên máy học sinh và hỏi input", await S.wait_for("!!document.querySelector('.inline-input')", 20))
            check("GV: thấy ô nhập hộ khi học sinh chờ input", await T.wait_for("!document.getElementById('mInRow').hidden", 15))
            await T.js("""(()=>{ const i=document.getElementById('mIn'); i.value='Phúc'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); return 1 })()""")
            check("GV nhập hộ: học sinh nhận được và chạy xong",
                  await S.wait_for("document.getElementById('console').textContent.indexOf('Chào Phúc')>=0", 15), await S.js("document.getElementById('console').textContent"))
            check("GV: thấy kết quả chạy hộ", await T.wait_for("document.getElementById('mOut').textContent.indexOf('Chào Phúc')>=0", 15))
            await T.shot("gv_chi_tiet.png")
            # lỗi + dừng
            await T.js("""(()=>{ const c=document.querySelector('#modal .CodeMirror').CodeMirror; c.replaceRange("while True:\\n    pass\\n", {line:0,ch:0}, {line:c.lineCount(),ch:0}); return 1 })()""")
            await asyncio.sleep(0.8)
            await T.js("document.getElementById('mRun').click(); 1")
            check("GV: thấy trạng thái Đang chạy", await T.wait_for("document.getElementById('mStatus').textContent.indexOf('Đang chạy')>=0", 15))
            await T.js("document.getElementById('mStop').click(); 1")
            check("GV bấm Dừng: học sinh dừng chương trình",
                  await S.wait_for("document.getElementById('console').textContent.indexOf('Đã dừng')>=0", 15))
            await T.js("document.getElementById('mClose').click(); 1")
            check("HS: được mở khóa khi giáo viên đóng cửa sổ", await S.wait_for("document.getElementById('lockBanner').hidden", 15))
            # ------------------------------------------------ nộp bài
            await S.wait_for("!document.getElementById('btnRun').disabled", 30)
            await S.js("""document.querySelector('.CodeMirror').CodeMirror.setValue("print('bài nộp lần 1')\\n"); document.getElementById('btnSubmit').click(); 1""")
            check("HS: nộp bài thành công", await S.wait_for("document.getElementById('stSub').textContent.indexOf('Đã nộp')>=0", 15))
            await asyncio.sleep(0.5)
            await S.js("""document.querySelector('.CodeMirror').CodeMirror.setValue("print('bài nộp lần 2')\\n"); document.getElementById('btnSubmit').click(); 1""")
            await asyncio.sleep(1.5)
            await T.js("document.querySelector('[data-tab=subs]').click(); 1")
            check("GV: tab Bài đã nộp có 1 dòng (2 bản)", await T.wait_for("document.querySelectorAll('#subsBody tr').length===1 && document.querySelector('#subsBody tr').children[1].textContent==='2'", 15),
                  await T.js("document.getElementById('subsBody').innerText"))
            nm = await T.js("document.querySelector('#subsBody .fname span').textContent")
            check("GV: tên file bài nộp đúng mẫu STT_Họ_tên_Bài", nm == "05_Nguyễn_Văn_An_Bai3.py", nm)
            zb = await T.js("""(async()=>{ const g=[...document.querySelectorAll('#subsBody tr')]; let cap=null; const o=HTMLAnchorElement.prototype.click;
               HTMLAnchorElement.prototype.click=function(){ cap={name:this.download, href:this.href}; };
               document.getElementById('btnZipSubs').click(); HTMLAnchorElement.prototype.click=o;
               const b=await (await fetch(cap.href)).arrayBuffer(); let s=''; const u=new Uint8Array(b); for(let i=0;i<u.length;i+=8192) s+=String.fromCharCode.apply(null,u.subarray(i,i+8192));
               return {name:cap.name, b64:btoa(s)}; })()""")
            z = zipfile.ZipFile(io.BytesIO(base64.b64decode(zb["b64"])))
            names = z.namelist()
            check("GV: tải .zip bài nộp đọc được, có bản cũ", z.testzip() is None and "05_Nguyễn_Văn_An_Bai3.py" in names and any(n.startswith("_ban_cu/") for n in names), names)
            body = z.read("05_Nguyễn_Văn_An_Bai3.py").decode("utf-8")
            check("GV: file nộp có tiêu đề thông tin và đúng nội dung bản mới", "# Họ tên: Nguyễn Văn An" in body and "bài nộp lần 2" in body, body[:200])
            await T.shot("gv_bai_nop.png")
            # ------------------------------------------------ chia sẻ file
            await T.js("document.querySelector('[data-tab=share]').click(); 1")
            await T.js("""(()=>{ const dt=new DataTransfer(); dt.items.add(new File(["print('đề bài')\\n"],'De_bai_1.py')); const i=document.getElementById('upInput'); i.files=dt.files; i.dispatchEvent(new Event('change')); return 1 })()""")
            check("GV: chia sẻ file thành công", await T.wait_for("document.querySelectorAll('#shareBody tr').length===1", 15))
            check("HS: thấy file giáo viên chia sẻ", await S.wait_for("document.getElementById('fileBadge').textContent==='1'", 15))
            await S.js("document.getElementById('btnFiles').click(); 1")
            dl = await S.js("""(async()=>{ let cap=null; const o=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){ cap={name:this.download, href:this.href}; };
               document.querySelector('.file-row').click(); for(let i=0;i<30&&!cap;i++) await new Promise(r=>setTimeout(r,200)); HTMLAnchorElement.prototype.click=o;
               if(!cap) return null; const t=await (await fetch(cap.href)).text(); return {name:cap.name, text:t}; })()""")
            check("HS: tải được file chia sẻ đúng nội dung", dl and dl["name"] == "De_bai_1.py" and "đề bài" in dl["text"], dl)
            await S.shot("hs_desktop.png")
            # ------------------------------------------------ thông báo, thư viện, đồ họa
            await T.js("""(()=>{ window.prompt=()=> 'Cả lớp chú ý!'; document.getElementById('btnNotify').click(); return 1 })()""")
            check("HS: nhận thông báo của giáo viên", await S.wait_for("[...document.querySelectorAll('.toast')].some(t=>t.textContent.indexOf('Cả lớp chú ý')>=0)", 15))
            await S.js("""(()=>{ document.getElementById('filesClose').click(); document.querySelector('.CodeMirror').CodeMirror.setValue("import numpy as np\\nprint(np.arange(5).sum())\\nimport turtle\\nt=turtle.Turtle()\\nfor i in range(4):\\n    t.forward(80); t.left(90)\\n"); document.getElementById('btnRun').click(); return 1 })()""")
            check("HS: numpy + turtle chạy (kết quả 10, hiện tab Đồ họa)",
                  await S.wait_for("document.getElementById('console').textContent.indexOf('10')>=0 && document.getElementById('tabGfx').classList.contains('active')", 60))
            # ------------------------------------------------ đóng/mở lại trang: học sinh offline rồi online
            await S.js("location.href='about:blank'")
            check("GV: học sinh đóng trang → Mất kết nối", await T.wait_for("(()=>{document.querySelector('[data-tab=live]').click(); return document.querySelector('.card').dataset.st==='offline'})()", 15))

            # ------------------------------------------------ điện thoại
            M = await new_page(sess, 390, 800, mobile=True)
            await goto(M, link)
            await M.js("document.getElementById('jName').value='Trần Thu Hà'; document.getElementById('jMay').value='12'; document.getElementById('jLop').value='9A1'; document.getElementById('jGo').click(); 1")
            check("ĐT: vào lớp", await M.wait_for("document.getElementById('joinDlg').hidden", 20))
            check("ĐT: Python tải xong", await M.wait_for("!document.getElementById('btnRun').disabled", 90))
            check("ĐT: không bị tràn ngang", await M.js("document.documentElement.scrollWidth <= window.innerWidth + 1"), await M.js("document.documentElement.scrollWidth + ' > ' + window.innerWidth"))
            check("ĐT: hiện thanh phím ký tự nhanh", await M.js("getComputedStyle(document.getElementById('qk')).display !== 'none'"))
            await M.js("document.querySelector('.CodeMirror').CodeMirror.setValue(''); document.querySelector('.CodeMirror').CodeMirror.focus(); 1")
            await M.js("""(()=>{ for (const k of ['tab','(',')']) { document.querySelector('#qk button[data-k="'+k+'"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); } return 1 })()""")
            check("ĐT: phím nhanh chèn ký tự vào code", await M.js("document.querySelector('.CodeMirror').CodeMirror.getValue()") == "    ()")
            await M.js("document.querySelector('.CodeMirror').CodeMirror.setValue(\"print('xin chào từ điện thoại')\\n\"); 1")
            await M.shot("hs_mobile_code.png")
            await M.js("document.getElementById('btnRun').click(); 1")
            check("ĐT: bấm Chạy tự chuyển sang tab Kết quả", await M.wait_for("document.getElementById('work').dataset.view==='out' && document.getElementById('console').textContent.indexOf('xin chào từ điện thoại')>=0", 30))
            await M.shot("hs_mobile_ketqua.png")
            T2 = await new_page(sess, 390, 800, mobile=True)
            await goto(T2, BASE + "giaovien.html")
            check("ĐT: giáo viên thấy học sinh trên điện thoại", await T2.wait_for("document.querySelectorAll('.card').length>=1", 20))
            check("ĐT: trang giáo viên không tràn ngang", await T2.js("document.documentElement.scrollWidth <= window.innerWidth + 1"), await T2.js("document.documentElement.scrollWidth + ' > ' + window.innerWidth"))
            await T2.shot("gv_mobile.png")
            await T2.js("document.querySelector('.card').click(); 1")
            await T2.shot("gv_mobile_chi_tiet.png")

            # ------------------------------------------------ lớp FirebaseDB + Hub với SDK giả lập
            F = await new_page(sess)
            await goto(F, BASE + "kiem_thu/fbmock.html")
            await F.wait_for("window.__done===true", 30)
            for name, ok_, extra in (await F.js("window.__checks") or []):
                check("FIREBASE(giả lập): " + name, ok_, extra)
    finally:
        ch.terminate()
        srv.terminate()
    bad = [r for r in results if not r[1]]
    print(f"\nKẾT QUẢ: {len(results) - len(bad)}/{len(results)} đạt")
    sys.exit(1 if bad else 0)


asyncio.run(main())
