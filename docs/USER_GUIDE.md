# Hướng dẫn sử dụng bot quản lý thu chi

> Trạng thái: áp dụng cho phiên bản có sổ chung và `/menu`. Các command cũ vẫn
> tiếp tục hoạt động như shortcut để bảo đảm tương thích.

## 1. Nguyên tắc giao diện

Người dùng không cần nhớ toàn bộ command. Telegram chỉ hiển thị sáu lệnh chính:

```text
/start   Bắt đầu hoặc xem tổng quan
/chi     Ghi khoản chi
/thu     Ghi khoản thu
/baocao  Xem báo cáo tháng
/lichsu  Xem giao dịch gần nhất
/menu    Mở tất cả chức năng
```

Các tính năng nâng cao được gom vào `/menu` bằng nút. Những command cũ vẫn được
giữ làm alias cho người đã quen dùng, nhưng không xuất hiện trong menu command
của Telegram.

## 2. Menu đề xuất

```text
📒 SỔ HIỆN TẠI
Gia đình Lân & Thu · Vai trò: Thành viên

[➕ Ghi khoản chi] [💰 Ghi khoản thu]
[📊 Báo cáo]       [🕘 Lịch sử]
[🎯 Kế hoạch]      [👨‍👩‍👧 Sổ chung]
[⚙️ Cài đặt]       [❓ Trợ giúp]
```

### Báo cáo

```text
[Tháng này] [Chọn tháng]
[Biểu đồ]   [Xuất CSV]
```

### Kế hoạch

```text
[Ngân sách] [Giao dịch định kỳ]
[Công nợ]   [Nhắc nhở]
```

### Sổ chung

```text
[Đổi sổ]      [Tạo sổ]
[Tham gia sổ] [Thành viên]
[Mời người]   [Thông tin sổ]
```

Nút quản trị chỉ hiển thị khi role có quyền. Viewer không thấy nút ghi dữ liệu;
member không thấy nút mời, đổi quyền hoặc xóa sổ.

### Cài đặt

```text
[OCR hóa đơn] [Phong cách bot]
[Quota AI]    [Dữ liệu & quyền riêng tư]
```

## 3. Ghi thu chi

### Dùng command

```text
/chi 50k ăn phở
/thu 20tr lương tháng 10
```

### Dùng câu tự nhiên

```text
Sáng nay ăn phở 50 nghìn
Hôm qua nhận 2 triệu tiền thưởng
```

### Dùng ảnh hóa đơn

1. Vào **Menu → Cài đặt → OCR hóa đơn** và bật OCR.
2. Gửi ảnh JPEG, PNG, WebP, HEIC hoặc HEIF.
3. Kiểm tra các giao dịch bot đọc được.
4. Bấm xác nhận trước khi lưu.

Phản hồi thành công phải chỉ rõ sổ đang ghi:

```text
✅ Đã ghi vào “Gia đình Lân & Thu”

💸 50.000 VNĐ · Ăn uống
📝 Ăn phở
👤 Người ghi: Lân

[↩️ Hoàn tác]
```

## 4. Tạo sổ chung

1. Gửi `/menu`.
2. Chọn **Sổ chung → Tạo sổ**.
3. Nhập tên, ví dụ `Gia đình Lân & Thu`.
4. Xác nhận dùng sổ mới làm sổ hiện tại.

Người tạo là chủ sổ và có quyền quản lý thành viên, dữ liệu và lời mời.

Command tương đương dành cho người dùng nâng cao:

```text
/taoso Gia đình Lân & Thu
```

## 5. Mời người khác

1. Owner mở **Menu → Sổ chung → Mời người**.
2. Bot gửi mã mời dùng một lần, có hiệu lực 24 giờ.
3. Chuyển mã cho người được mời qua kênh riêng.

Command tương đương:

```text
/moi
```

Không đăng mã ở nơi công cộng. Có mã vẫn chưa đủ quyền truy cập; owner phải phê
duyệt yêu cầu tham gia.

## 6. Tham gia sổ

Người được mời thực hiện:

1. Mở chat riêng với bot và bấm **Start**.
2. Chọn **Menu → Sổ chung → Tham gia sổ**.
3. Nhập mã được nhận.
4. Chờ owner phê duyệt.

Command tương đương:

```text
/thamgia GD-A7K92P
```

Khi owner chấp nhận, bot thông báo và hỏi có chuyển sang sổ mới hay không:

```text
✅ Bạn đã được thêm vào “Gia đình Lân & Thu” với quyền Thành viên.

[Chuyển sang sổ này] [Để sau]
```

## 7. Chuyển sổ hiện tại

Mở **Menu → Sổ chung → Đổi sổ**, sau đó chọn bằng nút:

```text
● Gia đình Lân & Thu
○ Sổ cá nhân của Lân
```

Bot phải hỏi xác nhận nếu người dùng đang ở giữa luồng nhập giao dịch. Tên sổ
hiện tại luôn xuất hiện ở đầu `/menu` và trong phản hồi lưu dữ liệu.

Command tương đương:

```text
/danhsachso
/chonso 2
```

## 8. Quản lý thành viên

Owner mở **Menu → Sổ chung → Thành viên**:

```text
👑 Lân · Chủ sổ
👤 Thu · Thành viên

[Đổi Thu thành Người xem]
[Xóa Thu khỏi sổ]
```

Trước khi remove, bot xác nhận:

```text
Thu sẽ mất quyền truy cập ngay. Các giao dịch Thu đã ghi vẫn được giữ lại.

[Xác nhận xóa] [Hủy]
```

Member và viewer chỉ xem được danh sách, không thấy nút quản trị.

## 9. Quyền của từng vai trò

- **Chủ sổ:** toàn quyền, mời và remove thành viên, đổi role, xóa sổ.
- **Thành viên:** xem toàn bộ sổ, thêm dữ liệu, sửa/xóa dữ liệu mình tạo.
- **Người xem:** chỉ xem giao dịch và báo cáo.

Nếu thao tác không được phép, bot giải thích và đưa hành động thay thế:

```text
⛔ Bạn đang có quyền Người xem nên không thể ghi khoản chi.
Hãy liên hệ chủ sổ nếu bạn cần quyền Thành viên.
```

## 10. Báo cáo và lịch sử

```text
/baocao
/baocao 09/2026
/lichsu
/lichsu 3
```

Báo cáo của sổ chung bao gồm dữ liệu của tất cả thành viên. Lịch sử hiển thị
người ghi từng giao dịch và cho phép chọn tối đa 20 giao dịch mỗi lần.

## 11. Rời hoặc xóa sổ

### Thành viên rời sổ

Mở **Menu → Sổ chung → Thông tin sổ → Rời sổ**. Quyền truy cập bị thu hồi,
nhưng dữ liệu đã ghi vẫn được giữ lại.

### Owner xóa sổ

Owner mở **Dữ liệu & quyền riêng tư → Xóa sổ**. Bot hiển thị phạm vi dữ liệu và
yêu cầu xác nhận hai bước. Không thể hoàn tác sau khi hoàn tất.

`/deletedata` xóa sổ cá nhân, cài đặt và membership sau khi xác nhận. Nếu người
dùng còn sở hữu sổ chung, bot yêu cầu xử lý các sổ đó trước.

## 12. Quy tắc UX và behavior

- Một màn hình tối đa 6–8 nút và chỉ hiển thị hành động phù hợp với role.
- Dùng nút cho lựa chọn; chỉ yêu cầu gõ khi nhập số tiền, tên, mô tả hoặc mã mời.
- Mọi thao tác phá hủy đều có **Hủy** và xác nhận rõ phạm vi.
- Callback xử lý một lần; bấm lại phải trả về trạng thái đã hoàn thành.
- Khi input sai, giữ nguyên ngữ cảnh và đưa ví dụ sửa đúng.
- Không gửi nhiều tin liên tiếp nếu có thể cập nhật tin nhắn menu hiện tại.
- Luôn cho biết sổ đang thao tác để tránh ghi nhầm.
- Tự động quay lại menu liên quan sau khi hoàn thành một thao tác.
- Menu command của Telegram chỉ chứa chức năng thường dùng; command nâng cao
  được coi là shortcut, không phải cách khám phá tính năng chính.

## 13. Command đầy đủ cho người dùng nâng cao

Các lệnh chính được hiển thị:

```text
/start /chi /thu /baocao /lichsu /menu
```

Các shortcut ẩn nhưng vẫn hỗ trợ:

```text
/bieudo /export /xoa
/ngansach /no /dinhky /nhacnho
/taoso /moi /thamgia /danhsachso /chonso
/thanhvien /phanquyen /xoathanhvien /roiso /xoaso
/ocr /phongcach /aiquota /quyenriengtu /deletedata /id /help
```

Mục tiêu là người dùng phổ thông chỉ cần nhớ `/menu`, `/chi` và `/thu`.
