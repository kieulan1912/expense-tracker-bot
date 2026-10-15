# Kiến trúc mã nguồn

## Mục tiêu

Mã nguồn dùng kiến trúc phân lớp kết hợp feature modules. Mục tiêu là tách logic
nghiệp vụ khỏi Telegram framework, tránh một `bot.js` khổng lồ và cho phép kiểm
thử từng phần độc lập.

## Cấu trúc

```text
src/
├── domain/
│   └── ledger_policy.js
├── presentation/
│   └── telegram/
│       ├── create_bot.js
│       ├── context.js
│       ├── views.js
│       └── handlers/
│           ├── ledger_handlers.js
│           ├── finance_handlers.js
│           ├── menu_handlers.js
│           └── ai_handlers.js
├── *_repository.js
├── ai_service.js
├── report_service.js
├── scheduler.js
├── database.js
└── index.js
```

### Domain

Chứa policy thuần, không import Telegraf, PostgreSQL hoặc config môi trường.
`ledger_policy.js` quyết định role nào được ghi hoặc quản trị sổ và cung cấp
nhãn role ổn định.

### Presentation — Telegram

- `create_bot.js` là composition root: tạo bot, gắn middleware và đăng ký các
  feature handler.
- `context.js` tạo user context, rate limit, active ledger và chuyển domain
  policy thành lỗi thân thiện với người dùng.
- `views.js` chỉ xây dựng nội dung và keyboard dùng lại.
- `handlers/ledger_handlers.js` xử lý sổ, lời mời, thành viên và role.
- `handlers/finance_handlers.js` xử lý command thu chi, báo cáo, ngân sách, công
  nợ và định kỳ.
- `handlers/menu_handlers.js` xử lý navigation, cài đặt và quyền riêng tư.
- `handlers/ai_handlers.js` xử lý text tự nhiên, OCR và bản nháp xác nhận.

Handler không khởi tạo bot và không tự đăng ký middleware toàn cục; mỗi module
chỉ export một hàm `register...Handlers(bot)`.

### Data và infrastructure adapters

- `database.js` quản lý pool và migration idempotent.
- Các file `*_repository.js` là adapter PostgreSQL, chịu trách nhiệm query và
  transaction.
- `ai_service.js` là adapter Gemini và quota AI.
- `scheduler.js` là adapter tác vụ nền.

Trong quy mô bot cá nhân 3–5 user, các handler gọi repository/service qua API
hàm nhỏ thay vì thêm interface/DI container hình thức. Khi cần thay PostgreSQL
hoặc Telegram, có thể đưa các API này vào application use case mà không thay
domain policy.

## Dependency rules

1. Domain không phụ thuộc presentation hoặc infrastructure.
2. Repository không phụ thuộc Telegram context.
3. Telegram-specific message, callback và keyboard chỉ nằm trong
   `presentation/telegram`.
4. `index.js` chỉ quản lý lifecycle: database, HTTP health server, Telegram bot
   và scheduler.
5. Quyền phải được kiểm tra lại ở server/repository đối với thao tác nhạy cảm;
   ẩn nút không được xem là bảo mật.
6. Callback dài hạn phải chứa đủ ID nghiệp vụ và kiểm tra membership mới ở thời
   điểm xử lý, không tin state lúc nút được tạo.

## Cách thêm tính năng

1. Đặt policy thuần vào `domain` nếu có quy tắc nghiệp vụ mới.
2. Thêm query nhỏ vào repository phù hợp; transaction nhiều bước phải nằm cùng
   một repository/service.
3. Thêm handler vào feature module hiện có hoặc tạo module mới.
4. Đăng ký module tại `create_bot.js`.
5. Thêm unit test cho policy/parser và integration test cho query quan trọng
   khi có PostgreSQL test environment.
6. Chạy `npm test`, `node --check` và `git diff --check` trước khi deploy.

## Tương thích sau refactor

- Entry point vẫn là `src/index.js`.
- Start command vẫn là `npm start`.
- Callback payload và command hiện có không đổi.
- Không đổi schema hoặc migration chỉ vì refactor presentation.
- `src/bot.js` legacy đã được loại bỏ; runtime dùng
  `presentation/telegram/create_bot.js`.
