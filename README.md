# Lankv Expense Tracker Bot

Telegram bot quản lý tài chính cá nhân bằng Node.js, Telegram, PostgreSQL và
Gemini. Bot ưu tiên xử lý local; Gemini chỉ được gọi cho câu tự nhiên hoặc ảnh
hóa đơn để giảm quota và giữ free plan đủ dùng cho nhóm nhỏ.

## Tài liệu

- [Đặc tả nghiệp vụ sổ tài chính dùng chung](docs/SHARED_LEDGER_BUSINESS.md)
- [Hướng dẫn sử dụng và thiết kế command/UI-UX](docs/USER_GUIDE.md)
- [Kiến trúc mã nguồn và quy tắc mở rộng](docs/ARCHITECTURE.md)

## Kiến trúc

```text
Telegram
   ↓
Northflank (Node.js, long polling, daily scheduler)
   ├── Local parser và business rules
   ├── Gemini API khi cần AI/OCR
   ├── QuickChart khi người dùng yêu cầu biểu đồ
   ↓
Neon PostgreSQL
```

Mỗi người có một sổ cá nhân và có thể tham gia sổ chung bằng mã mời một lần +
phê duyệt của owner. Mọi truy vấn kiểm tra membership/role và chạy trên
`ledger_id`. Bot chỉ chạy một instance để tránh xung đột Telegram long polling.

Mã nguồn đi theo Clean Architecture thực dụng: Telegram presentation chỉ gọi
domain use cases, PostgreSQL/Gemini nằm trong data adapters, còn toàn bộ wiring
được thực hiện tại `src/infrastructure/composition_root.js`. Xem
[tài liệu kiến trúc](docs/ARCHITECTURE.md).

## Tính năng

- `/chi 50k phở bò`, `/chi phở bò 50k`, `/thu lương 15tr`; số tiền có thể
  nằm ở đầu, giữa hoặc cuối nội dung.
- Tách khoản nhiều người: `/chi biếu bà và mẹ mỗi người 500k` hoặc
  `/chi biếu bà 500k; biếu mẹ 500k`; bot xem trước từng khoản rồi mới lưu.
- Lệnh trực tiếp được phân loại bằng bảng từ khóa local có chuẩn hóa dấu tiếng
  Việt; không dùng Gemini và không tiêu tốn AI quota.
- Nhắn tự nhiên, tách nhiều giao dịch, hiểu ngày tương đối bằng Gemini.
- Xác nhận giao dịch OCR, dữ liệu mơ hồ hoặc khoản tiền lớn.
- Undo, lịch sử tùy số lượng (`/lichsu 3`), điều chỉnh/hủy có xác nhận, báo cáo
  tháng và xuất CSV. Giao dịch hủy được giữ audit nhưng không còn tính báo cáo.
- Tìm kiếm giao dịch bằng `/tim` với từ khóa, loại thu/chi, danh mục, khoảng
  tiền, ngày/tháng và người ghi; các điều kiện được kết hợp theo AND. Câu tự
  nhiên được Gemini chuyển thành cùng bộ lọc nhưng dữ liệu giao dịch vẫn chỉ
  được truy vấn trong PostgreSQL.
- Báo cáo tháng có nút xem chi tiết trực tiếp trong Telegram, phân trang 8 giao
  dịch và hiển thị người ghi cho sổ chung.
- Báo cáo phân biệt chênh lệch thu–chi với ngân sách còn lại; CSV định dạng số
  tiền theo hàng nghìn và có tổng thu, tổng chi, chênh lệch ở cuối file.
- Ngân sách tổng/theo danh mục, hạn mức theo số ngày còn lại, cảnh báo 80%.
- Cảnh báo khoản chi bất thường dựa trên trung bình 30 ngày.
- Công nợ phải thu/phải trả có nút trả một phần, tất toán và hủy; mọi thanh toán
  đều xác nhận, lưu lịch sử riêng và không bị tính nhầm thành thu nhập/chi tiêu.
- Giao dịch định kỳ: bot nhắc và chỉ ghi khi người dùng xác nhận.
- Nhắc tự động mặc định bật: tổng kết thu chi mỗi ngày lúc 20:00, kèm lời nhắc
  local thay đổi theo ngày; Chủ nhật/cuối tháng có thêm báo cáo lũy kế.
- OCR hóa đơn JPEG, PNG, WebP, HEIC/HEIF có consent, không lưu ảnh.
- Biểu đồ QuickChart là tùy chọn qua `/bieudo`.
- Ba phong cách; mặc định hài hước nhưng không trêu chọc các khoản nhạy cảm.
- Quota AI theo user/toàn hệ thống, timeout, retry một lần và local fallback.
- Sổ chung cho 3–5 người với quyền owner/member/viewer, lời mời có hạn và menu
  theo vai trò.
- Telegram chỉ hiển thị tám command chính (gồm `/tim` và `/export`); các chức năng nâng cao nằm trong
  `/menu` nhưng shortcut cũ vẫn hoạt động.
- `/deletedata` xóa sổ cá nhân và membership; `/xoaso` chỉ dành cho owner của
  sổ chung.

Gõ `/help` trong Telegram để xem đầy đủ cú pháp.

## Chạy local

Yêu cầu Node.js 20+ và PostgreSQL.

```bash
npm install
cp .env.example .env
npm test
npm start
```

Các biến bắt buộc:

```env
TELEGRAM_BOT_TOKEN=
DATABASE_URL=postgresql://username:password@hostname:5432/database_name
DB_SSL=require
GEMINI_API_KEY=
APP_TIMEZONE=Asia/Ho_Chi_Minh
PORT=3000
```

Các biến tùy chọn và giá trị mặc định:

```env
ALLOWED_USER_IDS=
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-3.8-flash
AI_ENABLED=true
AI_TEXT_DAILY_LIMIT_PER_USER=150
AI_IMAGE_DAILY_LIMIT_PER_USER=10
AI_GLOBAL_DAILY_LIMIT=300
OCR_MAX_IMAGE_MB=10
CONFIRMATION_THRESHOLD_VND=1000000
BOT_RATE_LIMIT_PER_MINUTE=30
SCHEDULER_ENABLED=true
```

Khi `ALLOWED_USER_IDS` được cấu hình, các ID trong danh sách được dùng bot ngay.
Người ngoài danh sách chỉ có thể gửi `/thamgia MA_MOI`; sau khi owner duyệt,
membership sổ chung cho phép họ sử dụng bot mà không cần sửa biến môi trường.

Không commit `.env`, bot token, API key hoặc database URL. `GEMINI_API_KEY`
chỉ được dùng ở runtime và không được ghi ra log.

Quota trên được đề xuất cho hai người dùng: mỗi người tối đa 150 lượt text,
10 lượt ảnh và toàn bot tối đa 300 lượt/ngày. `/chi`, `/thu`, `/tim`, báo cáo
và các lệnh rõ ràng chạy local nên không tiêu lượt AI. Giới hạn thực tế của
Gemini phụ thuộc project/tier; kiểm tra trang Rate limits trong Google AI Studio
trước khi tăng tiếp.

## Deploy Northflank

### Service

```text
Type: Combined Service
Repository: kieulan1912/expense-tracker-bot
Branch: main
Build: Dockerfile
Port: 3000 HTTP
Instances: 1
```

Đặt toàn bộ secret trong **Environment → Runtime variables**, không đặt trong
Build arguments. Sau khi thay đổi biến, restart/redeploy service.

### Health checks

- Liveness: HTTP `GET /health`, port `3000`, interval `60s`, timeout `5s`.
- `/ready` kiểm tra cả PostgreSQL; không dùng làm probe liên tục để tránh đánh
  thức Neon khi không có hoạt động.

### Log khởi động đúng

```text
Kết nối PostgreSQL thành công
Health server đang chạy tại port 3000
Scheduler đã bật; lần chạy kế tiếp: ... (Asia/Ho_Chi_Minh)
Telegram bot đã khởi động
```

Database được mở rộng tự động bằng các lệnh `CREATE TABLE IF NOT EXISTS` và
`ADD COLUMN IF NOT EXISTS`; không cần chạy migration thủ công cho lần deploy
này.

## Danh mục

| ID | Danh mục chi |
|---:|---|
| 1 | Ăn uống |
| 2 | Di chuyển |
| 3 | Hóa đơn & sinh hoạt |
| 4 | Mua sắm & giải trí |
| 5 | Sức khỏe |
| 6 | Giáo dục & phát triển |
| 7 | Cho tặng & gia đình |
| 99 | Khác |

Khoản thu dùng ID `91`–`94` cho Lương, Thưởng, Đầu tư và Kinh doanh.

## Quyền riêng tư và free-plan guardrails

- Lệnh rõ ràng không gọi AI.
- Không lưu prompt, response AI hoặc ảnh hóa đơn.
- Ảnh Telegram được xử lý trong RAM và mặc định giới hạn 10 MB.
- OCR chỉ hoạt động sau khi user đồng ý.
- Báo cáo text không gọi dịch vụ ngoài; chỉ `/bieudo` gửi tổng hợp tới
  QuickChart.
- Scheduler truy vấn công việc một lần mỗi ngày thay vì polling từng phút.
- Free Tier Gemini có chính sách xử lý dữ liệu riêng; không nên gửi ảnh chứa
  thông tin ngân hàng nhạy cảm nếu người dùng không chấp nhận chính sách đó.

## BotFather

- `/setname`: đổi tên hiển thị.
- `/setdescription`: đổi mô tả.
- `/setabouttext`: đổi giới thiệu ngắn.
- `/setuserpic`: đổi avatar.
- `/setcommands`: đổi danh sách lệnh thủ công nếu cần.
- `/revoke`: thu hồi token bị lộ.
