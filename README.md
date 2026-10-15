# Lankv Expense Tracker Bot

Telegram bot quản lý tài chính cá nhân bằng Node.js, Telegraf, PostgreSQL và
Gemini. Bot ưu tiên xử lý local; Gemini chỉ được gọi cho câu tự nhiên hoặc ảnh
hóa đơn để giảm quota và giữ free plan đủ dùng cho nhóm nhỏ.

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

Mỗi `telegram_user_id` là một không gian dữ liệu độc lập. Bot chỉ chạy một
instance để tránh xung đột Telegram long polling.

## Tính năng

- `/chi 50k phở bò`, `/thu 15tr lương` và các hậu tố tiền Việt.
- Nhắn tự nhiên, tách nhiều giao dịch, hiểu ngày tương đối bằng Gemini.
- Xác nhận giao dịch OCR, dữ liệu mơ hồ hoặc khoản tiền lớn.
- Undo, lịch sử, xóa, báo cáo tháng và xuất CSV.
- Ngân sách tổng/theo danh mục, hạn mức theo số ngày còn lại, cảnh báo 80%.
- Cảnh báo khoản chi bất thường dựa trên trung bình 30 ngày.
- Theo dõi cho vay, đi vay, thanh toán từng phần và hạn trả.
- Giao dịch định kỳ: bot nhắc và chỉ ghi khi người dùng xác nhận.
- Báo cáo tự động Chủ nhật/cuối tháng lúc 20:00 khi bật `/nhacnho on`.
- OCR hóa đơn có consent, không lưu ảnh.
- Biểu đồ QuickChart là tùy chọn qua `/bieudo`.
- Ba phong cách; mặc định hài hước nhưng không trêu chọc các khoản nhạy cảm.
- Quota AI theo user/toàn hệ thống, timeout, retry một lần và local fallback.
- `/deletedata` xóa toàn bộ dữ liệu của chính người dùng.

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
AI_ENABLED=true
AI_TEXT_DAILY_LIMIT_PER_USER=30
AI_IMAGE_DAILY_LIMIT_PER_USER=5
AI_GLOBAL_DAILY_LIMIT=200
CONFIRMATION_THRESHOLD_VND=1000000
BOT_RATE_LIMIT_PER_MINUTE=30
SCHEDULER_ENABLED=true
```

Không commit `.env`, bot token, API key hoặc database URL. `GEMINI_API_KEY`
chỉ được dùng ở runtime và không được ghi ra log.

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
- Ảnh Telegram được xử lý trong RAM và giới hạn 5 MB.
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
