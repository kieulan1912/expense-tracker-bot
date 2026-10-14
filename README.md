# Lankv Expense Tracker Bot

Telegram bot quản lý thu chi cá nhân, sử dụng Node.js, Telegraf và PostgreSQL.

## Kiến trúc triển khai

```text
Telegram
   ↓
Northflank (Node.js service)
   ↓
Neon (PostgreSQL)
```

- Northflank chạy bot và cung cấp health endpoint.
- Neon lưu trữ dữ liệu PostgreSQL.
- GitHub là nguồn deploy; secrets chỉ được lưu trong Runtime Variables của
  Northflank.

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
- Telegram bot token từ `@BotFather`
- PostgreSQL, khuyến nghị Neon pooled connection

## Chạy local

```bash
npm install
cp .env.example .env
```

Điền thông tin thật vào `.env`:

```env
TELEGRAM_BOT_TOKEN=token_tu_botfather
DATABASE_URL=postgresql://user:password@host/neondb?sslmode=require
DB_SSL=require
ALLOWED_USER_IDS=
APP_TIMEZONE=Asia/Ho_Chi_Minh
NODE_ENV=development
PORT=3000
```

Không commit `.env`, Telegram token hoặc database connection string lên GitHub.

Chạy test và khởi động bot:

```bash
npm test
npm start
```

Các log thành công:

```text
Kết nối PostgreSQL thành công
Health server đang chạy tại port 3000
Telegram bot đã khởi động
```

## Giới hạn người sử dụng

Gửi `/id` cho bot để lấy Telegram User ID. Sau đó điền ID vào
`ALLOWED_USER_IDS` và khởi động lại ứng dụng:

```env
ALLOWED_USER_IDS=123456789
```

Cho phép nhiều tài khoản bằng dấu phẩy:

```env
ALLOWED_USER_IDS=123456789,987654321
```

## Deploy lên Northflank

### 1. Tạo service

Tạo một **Combined Service** từ GitHub với cấu hình:

```text
Repository: kieulan1912/expense-tracker-bot
Branch: main
Build type: Dockerfile
Dockerfile path: /Dockerfile
```

Free compute `nf-compute-10` (0.1 vCPU, 256 MB RAM) đủ cho bot cá nhân.

### 2. Cấu hình networking

Tạo public HTTP port:

```text
Port: 3000
Protocol: HTTP
Public: Enabled
Health check: /health
```

### 3. Cấu hình Runtime Variables

Trong **Environment → Runtime variables**, thêm:

```env
TELEGRAM_BOT_TOKEN=token_tu_botfather
DATABASE_URL=neon_pooled_connection_string
DB_SSL=require
ALLOWED_USER_IDS=telegram_user_id
APP_TIMEZONE=Asia/Ho_Chi_Minh
NODE_ENV=production
PORT=3000
```

Đánh dấu `TELEGRAM_BOT_TOKEN` và `DATABASE_URL` là secrets nếu giao diện cung
cấp tùy chọn này. Không đặt các giá trị trên trong Build arguments.

### 4. Kiểm tra sau deploy

```text
GET /health → {"status":"ok"}
GET /ready  → {"status":"ready"}
```

Kiểm tra tab **Logs** để xác nhận kết nối PostgreSQL và Telegram thành công.
Service bật CD sẽ tự deploy commit mới trên nhánh `main`.

Ứng dụng sử dụng Telegram long polling, vì vậy chỉ chạy một instance bot tại một
thời điểm. Hãy dừng tiến trình local trước khi chạy bản Northflank để tránh lỗi
`409 Conflict`.

## Quản lý hồ sơ Telegram bot

Thực hiện trong `@BotFather`:

- Đổi tên hiển thị: `/setname`
- Đổi mô tả: `/setdescription`
- Đổi phần giới thiệu ngắn: `/setabouttext`
- Đổi avatar: `/setuserpic`
- Đổi danh sách lệnh: `/setcommands`
- Thu hồi token bị lộ: `/revoke`

Các thay đổi tên, mô tả và avatar không yêu cầu deploy lại ứng dụng.

## Cấu hình SSL PostgreSQL

- `DB_SSL=disable`: chỉ dùng với kết nối tin cậy không yêu cầu TLS.
- `DB_SSL=require`: bật TLS cho Neon hoặc nhà cung cấp PostgreSQL tương thích.
- `DB_SSL=verify-full`: xác minh đầy đủ chứng chỉ và hostname khi môi trường hỗ
  trợ.

## Database schema

Ứng dụng tự tạo bảng `financial_transactions`. Số tiền được lưu dưới dạng số
nguyên VND để tránh sai số số thực. Mọi truy vấn thay đổi hoặc xóa dữ liệu đều
giới hạn theo `telegram_user_id`.
