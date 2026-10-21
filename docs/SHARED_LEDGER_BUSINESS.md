# Đặc tả nghiệp vụ — Sổ tài chính dùng chung

> Trạng thái: đã triển khai trong source code; có hiệu lực trên bot sau khi
> commit, deploy và migration khởi động hoàn tất.

## 1. Mục tiêu

Cho phép nhiều người nhắn riêng với Telegram bot nhưng cùng ghi chép và xem một
sổ tài chính. Phiên bản đầu tối ưu cho gia đình hoặc nhóm nhỏ 3–5 người, vận
hành được trên hạ tầng free plan.

Tính năng không phụ thuộc Telegram group. Mỗi thành viên tương tác trong cuộc
trò chuyện riêng với bot.

## 2. Thuật ngữ

- **Sổ (ledger):** không gian dữ liệu chứa giao dịch, ngân sách, công nợ và cấu
  hình tài chính dùng chung.
- **Sổ hiện tại:** sổ được dùng mặc định cho `/chi`, `/thu`, `/baocao` và câu
  nói tự nhiên.
- **Chủ sổ (owner):** người tạo sổ và có toàn quyền quản trị.
- **Thành viên (member):** người được ghi chép và xem dữ liệu trong sổ.
- **Người xem (viewer):** người chỉ được xem dữ liệu và báo cáo.
- **Người tạo giao dịch:** thành viên đã ghi giao dịch, được lưu bằng Telegram
  User ID, không dùng username làm định danh.

## 3. Phạm vi phiên bản đầu

### Bao gồm

- Tạo sổ dùng chung.
- Mời bằng mã ngẫu nhiên, dùng một lần và có thời hạn.
- Chủ sổ phê duyệt hoặc từ chối yêu cầu tham gia.
- Chọn sổ hiện tại khi một người tham gia nhiều sổ.
- Phân quyền `owner`, `member`, `viewer`.
- Xem danh sách, đổi quyền và xóa thành viên.
- Áp dụng phân quyền lên giao dịch, báo cáo, ngân sách, công nợ, định kỳ và xuất
  dữ liệu.
- Lưu người tạo giao dịch để truy vết.
- Rời sổ, hủy lời mời và xóa sổ có xác nhận.

### Chưa bao gồm

- Đồng bộ tài khoản ngân hàng.
- Chia tiền hoặc quyết toán nợ giữa các thành viên.
- Nhiều chủ sổ đồng thời.
- Quản lý thông qua Telegram group.

## 4. Vai trò và quyền

| Chức năng | Owner | Member | Viewer |
|---|:---:|:---:|:---:|
| Xem giao dịch và báo cáo | Có | Có | Có |
| Tạo giao dịch | Có | Có | Không |
| Sửa/xóa giao dịch mình tạo | Có | Có | Không |
| Sửa/xóa giao dịch người khác | Có | Không | Không |
| Quản lý ngân sách, công nợ, định kỳ | Có | Có | Không |
| Tạo/hủy mã mời | Có | Không | Không |
| Duyệt thành viên | Có | Không | Không |
| Đổi quyền hoặc xóa thành viên | Có | Không | Không |
| Xóa toàn bộ sổ | Có | Không | Không |

Quyền phải được kiểm tra ở tầng service/repository cho mọi thao tác; việc ẩn nút
trên UI không được xem là biện pháp bảo mật.

Với công nợ, owner và member đều được ghi nhận thanh toán. Member chỉ được hủy
khoản công nợ do mình tạo; owner được hủy mọi khoản. Thanh toán nợ gốc lưu ở
`debt_payments` và không phát sinh khoản thu/chi mới.

Giao dịch không bị hard-delete khi hủy. Repository chuyển trạng thái sang
`cancelled` và ghi snapshot trước/sau vào `transaction_adjustments`. Báo cáo,
ngân sách, lịch sử đang hoạt động và CSV chỉ đọc giao dịch `active`. Owner được
điều chỉnh mọi giao dịch; member chỉ được điều chỉnh giao dịch do mình tạo.

## 5. Luồng nghiệp vụ

### 5.1. Khởi tạo

1. Người dùng lần đầu chạy `/start` được tạo một sổ cá nhân tự động.
2. Người dùng có thể chọn **Tạo sổ chung** từ `/menu`.
3. Người tạo nhập tên sổ và trở thành `owner`.
4. Sổ mới trở thành sổ hiện tại sau khi người dùng xác nhận chuyển sổ.

### 5.2. Mời thành viên

1. Owner mở **Menu → Sổ chung → Mời thành viên**.
2. Bot tạo mã đủ ngẫu nhiên, dùng một lần, hết hạn sau 24 giờ.
3. Bot chỉ hiển thị mã rõ ở thời điểm tạo; database nên lưu hash của mã.
4. Owner có thể hủy mã chưa sử dụng.
5. Không tạo thêm mã nếu đã có mã còn hiệu lực, trừ khi owner chủ động hủy mã
   cũ.

### 5.3. Xin tham gia và phê duyệt

1. Người được mời nhắn riêng `/thamgia MA_MOI`, hoặc chọn **Tham gia sổ** trong
   menu rồi nhập mã.
2. Bot kiểm tra mã tồn tại, còn hạn, chưa dùng và người gửi chưa là thành viên.
3. Bot tạo yêu cầu `pending`, đánh dấu mã đã sử dụng và gửi owner hai nút
   **Chấp nhận** / **Từ chối**.
4. Khi chấp nhận, người mới được thêm với role `member` và nhận thông báo.
5. Khi từ chối, yêu cầu đóng và người xin tham gia nhận thông báo.
6. Một callback đã xử lý không được xử lý lần hai.

Mã hợp lệ không tự cấp quyền; phê duyệt của owner là điều kiện bắt buộc.

### 5.4. Chọn sổ và ghi dữ liệu

- Mỗi người có đúng một `active_ledger_id` tại một thời điểm.
- Mọi lệnh tài chính và câu nói tự nhiên mặc định dùng sổ hiện tại.
- Phản hồi tạo giao dịch luôn hiển thị tên sổ và người ghi.
- Nếu sổ hiện tại không còn truy cập được, bot tự chuyển về sổ cá nhân và thông
  báo một lần.
- Không cho phép client truyền `ledger_id` rồi truy vấn trực tiếp mà không kiểm
  tra membership.

### 5.5. Quản lý thành viên

- Owner xem danh sách thành viên và thao tác bằng inline button.
- Owner có thể chuyển `member` thành `viewer` và ngược lại.
- Không được hạ quyền hoặc xóa chính owner.
- Khi bị xóa, quyền truy cập bị thu hồi ngay ở request tiếp theo.
- Dữ liệu thành viên đã ghi vẫn thuộc sổ và giữ nguyên `created_by_user_id`.
- Không tái sử dụng username để nhận diện thành viên.

### 5.6. Rời và xóa sổ

- Member/viewer có thể rời sổ; giao dịch cũ không bị xóa.
- Owner không thể rời khi chưa chuyển quyền sở hữu. Phiên bản đầu chưa hỗ trợ
  chuyển owner nên owner chỉ có thể giữ hoặc xóa sổ.
- Xóa sổ cần hai bước: cảnh báo phạm vi, sau đó bấm xác nhận.
- Chỉ owner được xóa sổ.
- `/deletedata` không được âm thầm xóa sổ chung. Lệnh này phải đưa người dùng
  tới màn hình **Dữ liệu & quyền riêng tư** để chọn đúng phạm vi.

## 6. Quy tắc dữ liệu

Các thực thể cần bổ sung:

- `ledgers`: thông tin sổ và owner.
- `ledger_members`: thành viên, role và trạng thái.
- `ledger_invitations`: hash mã mời, thời hạn, trạng thái và người tạo.
- `ledger_join_requests`: yêu cầu tham gia và trạng thái phê duyệt.

Các bảng nghiệp vụ hiện tại cần có `ledger_id`. Giao dịch cần thêm
`created_by_user_id`. Mọi index báo cáo nên bắt đầu bằng `ledger_id` và thời
gian giao dịch.

Ràng buộc quan trọng:

- Một người chỉ xuất hiện một lần trong một sổ.
- Một sổ có đúng một owner trong phiên bản đầu.
- `active_ledger_id` phải trỏ tới sổ mà người dùng đang có membership active.
- Mã mời không lưu plain text lâu dài, không thể dùng lại và phải có thời hạn.
- Xóa ledger dùng transaction và cascade có kiểm soát.

## 7. Tương thích dữ liệu hiện tại

- Khi nâng cấp, tạo một sổ cá nhân cho mỗi `telegram_user_id` hiện có.
- Gán dữ liệu cũ vào sổ cá nhân tương ứng.
- Gán `created_by_user_id` bằng `telegram_user_id` cũ.
- Các command tài chính cũ tiếp tục hoạt động trên sổ hiện tại.
- Command nâng cao vẫn có thể tồn tại như alias, dù không hiển thị trong danh
  sách command chính.

## 8. Bảo mật và riêng tư

- Xác thực bằng Telegram User ID từ update do Telegram cung cấp.
- Kiểm tra membership và role trên server ở mọi read/write.
- Mã mời tạo bằng bộ sinh số ngẫu nhiên mật mã, có giới hạn thử sai và rate
  limit.
- Không ghi mã mời, token hoặc nội dung ảnh hóa đơn vào log.
- Gửi thông báo cho owner khi thành viên được thêm, đổi quyền, bị xóa hoặc khi
  có yêu cầu xóa sổ.
- Các thao tác nhạy cảm phải idempotent và có audit log tối thiểu: actor, action,
  ledger, target và thời gian.

## 9. Tối ưu chi phí

- Quản lý sổ, phân quyền và báo cáo dùng PostgreSQL, không gọi Gemini.
- AI quota tiếp tục tính theo Telegram user để một thành viên không dùng hết
  quota của cả gia đình.
- Không polling; phê duyệt được thực hiện qua Telegram callback.
- Scheduler xử lý theo ledger nhưng chỉ gửi báo cáo cho thành viên đã bật nhắc
  nhở.
- Pool database nhỏ và index theo `ledger_id` phù hợp cho 3–5 người trên free
  plan.

## 10. Tiêu chí nghiệm thu

1. Hai tài khoản Telegram nhắn riêng vẫn ghi và xem được cùng một sổ.
2. Không có mã hợp lệ và phê duyệt của owner thì không thể truy cập sổ.
3. Member không thể sửa/xóa giao dịch của người khác bằng command hoặc callback
   giả mạo.
4. Viewer không thể tạo hay thay đổi dữ liệu.
5. Sau khi remove, user không đọc hoặc ghi được dữ liệu sổ ngay lập tức.
6. Báo cáo tổng hợp đủ giao dịch của mọi thành viên trong sổ.
7. Phản hồi giao dịch thể hiện tên sổ và người tạo.
8. Command cũ vẫn hoạt động với sổ cá nhân hoặc sổ hiện tại.
9. Xóa sổ chỉ thực hiện sau hai bước xác nhận bởi owner.
10. Các thao tác phân quyền không gọi Gemini và không làm tăng đáng kể chi phí.
