# Hướng dẫn triển khai Python Lab Online (GitHub Pages + Firebase)

Bản này chạy **hoàn toàn trên web**: học sinh làm bài ở nhà bằng máy tính hoặc điện thoại, giáo viên xem trực tiếp bài làm trên máy tính hoặc điện thoại. Không cần thuê máy chủ.

| Thành phần | Làm nhiệm vụ gì | Chi phí |
|---|---|---|
| **GitHub Pages** | Phát các file web (trang học sinh, trang giáo viên, bộ Python) | Miễn phí |
| **Firebase Realtime Database + Authentication** | Chuyển code, kết quả, lệnh Chạy/Dừng, bài nộp giữa học sinh và giáo viên theo thời gian thực | Miễn phí (gói Spark) |
| Trình duyệt học sinh | Chạy Python thật (Pyodide) ngay trên máy/điện thoại của em | Không |

Có hai cách dùng:

- **Chế độ thử** (mặc định, `backend: 'local'` trong `config.js`): không cần tài khoản nào. Dùng để xem thử, dạy thử: học sinh và giáo viên chỉ trao đổi được giữa các tab **trong cùng một trình duyệt**.
- **Chạy thật** (`backend: 'firebase'`): làm theo phần 3 và 4 bên dưới, khoảng 20 phút, làm một lần.

---

## 1. Xem thử ngay trên máy (không cần tài khoản)

Trang web dùng Service Worker nên **không mở được bằng cách bấm đúp file .html**; cần chạy qua một máy chủ web cục bộ:

```bash
cd 23_Python_Lab_Online
python -m http.server 8000
```

Mở `http://localhost:8000/`:

1. Mở tab **Giáo viên** → bấm **Tạo lớp mới** (ví dụ mã `9a1-tin`).
2. Mở một tab **Học sinh** (hoặc dán liên kết giáo viên đưa) → nhập mã lớp, họ tên → **Vào lớp**.
3. Viết code, bấm **Chạy**; trên tab giáo viên thấy ngay thẻ học sinh.

## 2. Cấu trúc thư mục

```
index.html            trang chủ (chọn Học sinh / Giáo viên)
hocsinh.html          trang học sinh
giaovien.html         trang giáo viên
config.js             CẤU HÌNH (bạn sửa file này)
database.rules.json   luật bảo mật Firebase (dán vào Firebase)
sw.js                 Service Worker (giúp lệnh input() chạy được trên web tĩnh)
assets/               css, js, mã Python phụ (turtle, matplotlib)
vendor/               CodeMirror, Firebase SDK, QR (đã kèm sẵn, không cần internet bên thứ ba)
pyodide/              Python chạy trong trình duyệt + numpy, pandas, matplotlib, scipy... (khoảng 57 MB)
kiem_thu/             kiểm thử tự động
```

## 3. Tạo Firebase (làm một lần)

Cần một tài khoản Google. Tên các mục trong Firebase có thể thay đổi đôi chút theo thời gian.

1. Vào <https://console.firebase.google.com> → **Add project** (Tạo dự án) → đặt tên (ví dụ `python-lab-lop9`) → có thể **tắt Google Analytics** → **Create project**.
2. Menu bên trái **Build → Authentication → Get started** → thẻ **Sign-in method**:
   - bật **Anonymous** (học sinh vào không cần tài khoản),
   - bật **Email/Password** (dành cho giáo viên).
3. Thẻ **Users → Add user**: nhập email và mật khẩu của giáo viên → **Add user**. Sao chép giá trị cột **User UID** của tài khoản vừa tạo (dạng `a1B2c3…`).
4. Menu **Build → Realtime Database → Create Database**: chọn vị trí gần Việt Nam (ví dụ **Singapore**), chọn **Start in locked mode** → **Enable**. Ghi lại địa chỉ ở đầu trang, dạng `https://<tên-dự-án>-default-rtdb.<vùng>.firebasedatabase.app`.
5. Thẻ **Rules**: xóa nội dung cũ, dán toàn bộ nội dung file `database.rules.json` → **Publish**.
6. Thẻ **Data**: bấm dấu **+** bên cạnh tên cơ sở dữ liệu → *Name* `teachers`, bấm **+** tiếp ở nhánh `teachers` → *Name* là **User UID đã sao chép ở bước 3**, *Value* gõ `true` → **Add**. Từ nay tài khoản đó mới có quyền giáo viên. Có thể thêm nhiều giáo viên bằng cách thêm nhiều UID.
7. Bấm bánh răng **Project settings → General → Your apps → biểu tượng `</>` (Web)** → đặt tên → **Register app**. Màn hình hiện đoạn `firebaseConfig`.
8. Mở `config.js`, đổi `backend: 'local'` thành `backend: 'firebase'` và điền:

```js
window.PYLAB_CONFIG = {
  backend: 'firebase',
  firebase: {
    apiKey: '…',
    authDomain: '…firebaseapp.com',
    databaseURL: 'https://…-default-rtdb.….firebasedatabase.app',   // địa chỉ ở bước 4
    projectId: '…',
    appId: '…'
  },
  maxFileKB: 700
};
```

> **apiKey của Firebase không phải mật khẩu**: nó được thiết kế để nằm trong web công khai. An toàn dữ liệu do **luật bảo mật** ở bước 5 đảm bảo (học sinh chỉ ghi được vào mục của chính mình; chỉ tài khoản có trong `teachers` mới đọc được cả lớp).

## 4. Đưa lên GitHub và bật GitHub Pages

1. Tạo tài khoản <https://github.com> → **New repository** (ví dụ `python-lab`, chọn **Public**).
2. Đưa toàn bộ thư mục dự án lên. Nên dùng `git` (giao diện kéo thả của web giới hạn số file mỗi lần tải):

```bash
cd 23_Python_Lab_Online
git init
git add .
git commit -m "Python Lab Online"
git branch -M main
git remote add origin https://github.com/<tên-tài-khoản>/python-lab.git
git push -u origin main
```

3. Trên GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, thư mục `/ (root)` → Save**.
4. Đợi 1–2 phút, trang hiện địa chỉ dạng `https://<tên-tài-khoản>.github.io/python-lab/`. Đó là địa chỉ để học sinh và giáo viên dùng.
5. Sau này muốn đổi cấu hình hoặc nâng cấp: sửa file rồi `git push` lại (hoặc sửa trực tiếp `config.js` trên giao diện web GitHub).

(Khuyến nghị) Hạn chế khóa API chỉ dùng cho web của bạn: vào <https://console.cloud.google.com/apis/credentials> → chọn *Browser key* của dự án → **Website restrictions** → thêm `https://<tên-tài-khoản>.github.io/*`.

### Địa chỉ ngắn cho học sinh và giáo viên

Sau khi bật Pages, mỗi người chỉ cần nhớ **tên-tài-khoản.github.io/tên-kho**. Dự án có sẵn hai đường dẫn tắt:

| Địa chỉ | Mở trang |
|---|---|
| `…github.io/<tên-kho>/` | Trang chủ (chọn học sinh / giáo viên) |
| `…github.io/<tên-kho>/hs` | Trang học sinh (tự giữ `?lop=…` nếu có) |
| `…github.io/<tên-kho>/gv` | Trang giáo viên |

Muốn địa chỉ ngắn hơn nữa, **đổi tên kho** thành tên ngắn (GitHub → Settings → Repository name, ví dụ `py`). Địa chỉ Pages đổi theo ngay, nhưng địa chỉ cũ sẽ không còn dùng được.

### Dùng tên miền riêng (ví dụ pylab.vn) — tùy chọn, có phí

Tên miền riêng phải **mua** ở nhà cung cấp (tên miền .vn khoảng vài trăm nghìn đồng/năm, .com khoảng 250.000–300.000 đồng/năm). Sau khi mua:

1. Ở trang quản lý DNS của nhà cung cấp, thêm bản ghi:
   - miền gốc (`pylab.vn`): 4 bản ghi **A** tới `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`;
   - hoặc miền phụ (`lop.pylab.vn`): 1 bản ghi **CNAME** tới `<tên-tài-khoản>.github.io`.
2. GitHub → **Settings → Pages → Custom domain**: nhập tên miền → Save → đợi dấu tích xanh DNS check → bật **Enforce HTTPS**.
3. Firebase không cần đổi gì (Anonymous và Email/Password hoạt động với mọi tên miền). Nếu đã giới hạn khóa API theo địa chỉ web (mục bảo mật ở trên), nhớ thêm `https://<tên-miền>/*`.

## 5. Cách dùng hằng ngày

**Giáo viên**

1. Mở `…/giaovien.html` → đăng nhập bằng email/mật khẩu ở bước 3.
2. Nhập mã lớp (tên ngắn không dấu, ví dụ `9a1-tin`) → **Tạo lớp mới** (lần đầu) hoặc **Mở lớp**.
3. Ở đầu trang có **liên kết** và **mã QR** của lớp: gửi liên kết cho học sinh (Zalo, nhóm lớp…), hoặc chiếu mã QR để học sinh quét bằng điện thoại.
4. Dùng các tab **Giám sát lớp**, **Bài đã nộp** (tải từng bài hoặc cả lớp `.zip`), **Bài tập chia sẻ**. Cách thao tác giống bản chạy trong mạng LAN (sửa code học sinh, Chạy/Dừng hộ, nhắn tin, mở file `.py`…).

**Học sinh**

1. Mở liên kết giáo viên gửi (hoặc `…/hocsinh.html` rồi nhập mã lớp). Điện thoại và máy tính đều dùng được.
2. Nhập họ tên, STT, lớp → **Vào lớp**. Viết code → **Chạy** → **Nộp bài**.
3. Trên điện thoại có thanh phím ký tự nhanh (Tab, `:`, `( )`, `[ ]`, `" '`…) phía dưới khung code.
4. Muốn tự luyện không cần giáo viên: bấm **Luyện tập một mình**.

## 5b. Đăng nhập giáo viên

- **Học sinh vào tự do**, không cần tài khoản: chỉ cần mã lớp.
- **Giáo viên bắt buộc đăng nhập** ở trang `…/gv` (có nút Quên mật khẩu).
  - **Chạy thật (Firebase):** tài khoản email do bạn tạo ở bước 3. Chỉ UID có trong mục `teachers` mới xem được cả lớp; học sinh dù biết địa chỉ cũng **không đọc được** dữ liệu của lớp, do luật bảo mật của Firebase chặn.
  - **Chế độ thử:** lần đầu bấm **Tạo tài khoản** (email + mật khẩu từ 6 ký tự); tài khoản chỉ lưu trong trình duyệt đó, chỉ để tránh vào nhầm trang giáo viên, **không phải bảo mật thật**.
- Thêm giáo viên thứ hai: tạo thêm một người dùng trong Authentication → Users, rồi thêm UID của họ vào `teachers` (bước 6).
- **Trang kiểm tra cấu hình** `…/kiemtra.html`: tự thử từng bước (Anonymous, kết nối cơ sở dữ liệu, luật bảo mật) và cho biết cần sửa gì; có ô thử đăng nhập giáo viên và hiện **User UID** để bạn thêm vào `teachers`.

## 6. Giới hạn của gói miễn phí và cách xử lý

| Giới hạn | Mức | Ghi chú |
|---|---|---|
| Kết nối đồng thời Realtime Database (Spark) | **100** | Tổng số học sinh + giáo viên đang mở trang cùng lúc. Một lớp 40–45 em dư sức; nếu nhiều lớp học cùng lúc cần nâng lên gói Blaze (trả theo mức dùng, thường rất rẻ). |
| Tạo tài khoản ẩn danh | khoảng 100 lần/giờ/địa chỉ IP | Cả lớp ở cùng mạng trường chỉ tính khoảng 40 lần. Học sinh vào lại bằng cùng trình duyệt không tạo tài khoản mới. |
| Dung lượng, lưu lượng | 1 GB lưu trữ, 10 GB tải/tháng | Rất dư cho code văn bản. Mỗi file chia sẻ tối đa 700 KB (đổi ở `maxFileKB`). |
| Dung lượng tải ban đầu của học sinh | khoảng 12 MB lần đầu | Trình duyệt lưu lại nên các lần sau rất nhanh. Thư viện nặng (pandas, scipy…) chỉ tải khi học sinh `import`. |

Dọn dữ liệu: trong Firebase Console → Realtime Database → Data, xóa nhánh `rooms/<mã lớp>` khi kết thúc học kỳ.

## 7. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Mở trang thấy báo lỗi / học sinh báo “Mã lớp chưa tồn tại” trong khi giáo viên đã tạo lớp | Trang đang ở **chế độ thử** (chưa nối Firebase) nên mỗi máy chỉ thấy dữ liệu của chính trình duyệt đó. Làm mục 3 và 4, rồi mở `…/kiemtra.html` để xem còn thiếu bước nào. |
| Giáo viên đăng nhập báo "chưa có quyền giáo viên" / `permission_denied` | Chưa thêm UID vào `teachers` (bước 6), hoặc dán sai `Rules` (bước 5). |
| Học sinh báo "Mã lớp chưa tồn tại" | Giáo viên chưa bấm **Tạo lớp mới**, hoặc học sinh gõ sai mã lớp. |
| Trang chạy nhưng báo thiếu cấu hình Firebase | `config.js` chưa điền `apiKey`, `databaseURL`… hoặc còn `backend: 'local'`. |
| Nút Chạy hiện "Đang tải Python…" rất lâu | Lần đầu tải khoảng 12 MB; mạng yếu thì chờ lâu hơn. |
| `input()` không hiện ô nhập, báo Service Worker | Trình duyệt chặn Service Worker (chế độ riêng tư/ẩn danh, bản quá cũ). Dùng Chrome, Edge, Safari mới nhất, không mở ở chế độ riêng tư. |
| Sau khi nâng cấp, học sinh vẫn thấy bản cũ | Nhấn tải lại trang (hoặc xóa dữ liệu trang). Bài đang gõ vẫn được giữ trong trình duyệt. |
| Học sinh vào được nhưng giáo viên không thấy | Kiểm tra cả hai dùng **cùng một mã lớp** và cùng một dự án Firebase (`config.js` giống nhau). |

## 8. Khác biệt so với bản chạy trong mạng LAN (offline)

| | Bản offline (máy chủ .exe trong phòng máy) | Bản online (GitHub Pages + Firebase) |
|---|---|---|
| Cần internet | Không | Có |
| Học sinh ở nhà, dùng điện thoại | Không | **Có** |
| Giáo viên xem ở nhà / bằng điện thoại | Không | **Có** |
| Bài nộp | Lưu thành file trong thư mục `bai_nop` trên máy giáo viên | Lưu trong Firebase; giáo viên **tải từng bài hoặc cả lớp .zip** |
| Chia sẻ bài tập | Thư mục trên máy giáo viên | Tải file lên trang giáo viên (mỗi file ≤ 700 KB) |
| Mở tường lửa | Cần (nút Mở tường lửa) | Không cần |
| Số học sinh đồng thời | Theo mạng LAN | Tối đa khoảng 100 với gói miễn phí |

## 9. Kiểm thử tự động

Cần Google Chrome và `pip install aiohttp`:

```bash
python kiem_thu/test_local.py      # chế độ thử: học sinh, giáo viên, điện thoại + lớp Firebase với SDK giả lập
python kiem_thu/test_subpath.py    # trang đặt trong thư mục con (như GitHub Pages)
```

Lưu ý: kiểm thử dùng SDK Firebase **giả lập**, chưa chạy với một dự án Firebase thật (cần tài khoản của bạn). Vì vậy sau khi cấu hình xong, hãy thử một vòng: giáo viên tạo lớp → một điện thoại vào lớp → chạy code → nộp bài.

---
Design By: Nguyễn Hữu Phúc - THCS Lê Thánh Tông - ZL: 0373.022.325
