# Python Lab Online

Phòng thực hành Python **chạy trên web**: học sinh viết và chạy Python ngay trên trình duyệt (máy tính hoặc điện thoại), ở lớp hay ở nhà; giáo viên xem **trực tiếp** bài làm của cả lớp, sửa hộ, chạy hộ, nhắn tin, thu bài và chia sẻ bài tập.

- **Python thật** (Pyodide, Python 3.13) chạy trong trình duyệt học sinh: an toàn, không tốn máy chủ.
- **Thông báo lỗi giống Python**, kèm gợi ý tiếng Việt và tô đỏ dòng lỗi; `input()` nhập ngay trong khung kết quả.
- **Đồ họa**: turtle, matplotlib. **Thư viện**: numpy, pandas, scipy, sympy, scikit-learn, openpyxl, sqlite3…
- **Điện thoại**: giao diện tự co giãn, có thanh phím ký tự nhanh.
- **Giáo viên**: thẻ giám sát từng học sinh theo thời gian thực, khóa và sửa code học sinh, bấm Chạy/Dừng hộ, gõ `input()` hộ, nhắn riêng hoặc thông báo cả lớp, tải bài nộp (từng bài hoặc `.zip`), chia sẻ file bài tập, mã QR vào lớp.
- **Chọn lớp, không gõ mã**: học sinh chọn lớp trong danh sách do giáo viên tạo. **Quản trị**: tài khoản admin tạo tài khoản + mật khẩu cho giáo viên khác ngay trên web.
- **Đăng nhập**: học sinh vào tự do bằng mã lớp; giáo viên phải đăng nhập bằng tài khoản (Firebase Authentication + luật bảo mật). Có trang `kiemtra.html` tự kiểm tra cấu hình.
- **Miễn phí**: GitHub Pages (phát web) + Firebase gói Spark (đồng bộ thời gian thực).

**Địa chỉ ngắn:** học sinh vào <https://ltthphuc.github.io/py/hs> · giáo viên vào <https://ltthphuc.github.io/py/gv> · trang chủ <https://ltthphuc.github.io/py/>

## Dùng thử trong 1 phút

```bash
python -m http.server 8000     # chạy trong thư mục này
```

Mở <http://localhost:8000/>: mở một tab **Giáo viên** (tạo lớp) và một tab **Học sinh** (vào lớp) để xem thử. Chế độ thử chỉ trao đổi giữa các tab của cùng một trình duyệt.

## Chạy thật trên mạng

Làm theo **[HUONG_DAN_TRIEN_KHAI.md](HUONG_DAN_TRIEN_KHAI.md)**: tạo Firebase (khoảng 10 phút), điền `config.js`, đưa lên GitHub và bật Pages.

## Công nghệ

HTML/CSS/JavaScript thuần (không cần bước build), [Pyodide](https://pyodide.org), CodeMirror 5, Firebase Realtime Database + Authentication (SDK kèm sẵn trong `vendor/`), Service Worker (giúp `input()` chạy trên web tĩnh).

---
Design By: Nguyễn Hữu Phúc - THCS Lê Thánh Tông - ZL: 0373.022.325
