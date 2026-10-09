# Lankv Expense Tracker Bot

Telegram bot quản lý thu chi cá nhân, sử dụng Node.js, Telegraf và PostgreSQL.

## Tính năng

- Ghi khoản chi: `/chi 50k phở bò`
- Ghi khoản thu: `/thu 15tr lương tháng 10`
- Báo cáo tháng: `/baocao` hoặc `/baocao 10/2026`
- Xem 10 giao dịch gần nhất: `/lichsu`
- Xóa giao dịch của chính người dùng: `/xoa 123`
- Xuất CSV: `/export` hoặc `/export 10/2026`
- Phân loại giao dịch tự động theo từ khóa
- Giới hạn người được phép sử dụng bằng Telegram User ID
- Health check tại `/health` và readiness check tại `/ready`
- Tự tạo bảng và index PostgreSQL khi khởi động

## Yêu cầu

- Node.js 20 trở lên
- PostgreSQL
- Telegram bot token từ `@BotFather`

## Chạy local

```bash
npm install
cp .env.example .env
```

Điền thông tin thật vào `.env`:

```env
TELEGRAM_BOT_TOKEN=token_tu_botfather
DATABASE_URL=postgresql://username:password@hostname:5432/database_name
DB_SSL=disable
ALLOWED_USER_IDS=
APP_TIMEZONE=Asia/Ho_Chi_Minh
PORT=3000
```

Sau đó chạy:

```bash
npm test
npm start
```

Gửi `/id` cho bot để lấy Telegram User ID. Sau đó điền ID vào
`ALLOWED_USER_IDS` và khởi động lại ứng dụng. Có thể cho phép nhiều tài khoản:

```env
ALLOWED_USER_IDS=123456789,987654321
```

## Cấu hình SSL PostgreSQL

- `DB_SSL=disable`: kết nối nội bộ không dùng TLS.
- `DB_SSL=require`: dùng TLS nhưng chấp nhận chứng chỉ do nhà cung cấp quản lý.
- `DB_SSL=verify-full`: dùng TLS và xác minh đầy đủ chứng chỉ.

Hãy dùng đúng chế độ mà Botkeep cung cấp trong thông tin kết nối database.

## Deploy lên Botkeep

Thiết lập build/start command nếu Botkeep yêu cầu:

```text
Build command: npm install
Start command: npm start
```

Khai báo các environment variables trên Botkeep, không upload file `.env`:

- `TELEGRAM_BOT_TOKEN`
- `DATABASE_URL`
- `DB_SSL`
- `ALLOWED_USER_IDS`
- `APP_TIMEZONE`
- `PORT` nếu Botkeep không tự cấp biến này

Ứng dụng dùng Telegram long polling, vì vậy chỉ chạy một instance bot tại một thời
điểm. Khi deploy Botkeep, hãy dừng tiến trình bot đang chạy trên máy cá nhân.

## Database schema

Ứng dụng tự tạo bảng `financial_transactions`. Số tiền được lưu dưới dạng số
nguyên VND để tránh sai số số thực. Mọi truy vấn thay đổi/xóa dữ liệu đều giới hạn
theo `telegram_user_id`.
