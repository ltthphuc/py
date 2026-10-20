/* ============================================================================
   CẤU HÌNH PYTHON LAB ONLINE  (sửa file này rồi đưa lên GitHub)

   backend: 'local'     CHẾ ĐỘ THỬ - không cần tài khoản nào. Học sinh và giáo viên chỉ
                        trao đổi được giữa các tab trong CÙNG MỘT trình duyệt (để xem thử, dạy thử).
            'firebase'  CHẠY THẬT trên mạng: học sinh ở nhà (máy tính, điện thoại), giáo viên
                        xem trực tiếp. Cần điền đầy đủ phần "firebase" bên dưới
                        (xem HUONG_DAN_TRIEN_KHAI.md - mục "Tạo Firebase").
   ========================================================================== */
window.PYLAB_CONFIG = {
  backend: 'firebase',

  firebase: {
    apiKey: 'AIzaSyBlDFlafEwAeSuOiNElkPGX44ne07j8bPo',
    authDomain: 'pythonlabltt.firebaseapp.com',
    databaseURL: 'https://pythonlabltt-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'pythonlabltt',
    appId: '1:102251803685:web:d2d6ffa09242810a607bcc'
  },

  maxFileKB: 700   // dung lượng tối đa mỗi file giáo viên chia sẻ cho học sinh
};
