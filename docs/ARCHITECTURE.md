# Kiến trúc mã nguồn

## Mục tiêu

Project dùng Clean Architecture theo hướng thực dụng cho Node.js: domain không
biết Telegram, PostgreSQL, Gemini hay biến môi trường; presentation không import
data adapter trực tiếp; infrastructure composition root là nơi duy nhất nối các
dependency khi ứng dụng khởi động.

Schema được mở rộng bằng migration idempotent trong `database.js`; deploy không
cần chạy SQL thủ công.

## Cấu trúc

```text
src/
├── domain/
│   ├── errors.js
│   ├── ledger_policy.js
│   ├── repositories/              # Port/contracts
│   ├── services/                  # Logic thuần, formatter, AI validator
│   └── use_cases/                 # Transaction, finance, ledger, user, AI
├── data/
│   ├── gateways/
│   │   └── gemini_ai_gateway.js
│   └── postgres/
│       ├── database.js            # Pool factory + migration idempotent
│       └── repositories/          # PostgreSQL implementations
├── presentation/
│   └── telegram/
│       ├── create_bot.js
│       ├── context.js
│       ├── views.js
│       └── handlers/
├── infrastructure/
│   ├── composition_root.js
│   ├── config.js
│   ├── http/health_server.js
│   ├── scheduler/scheduler.js
│   └── stores/                  # Pending confirmations + conversation context
├── utils/
└── index.js
```

## Luồng phụ thuộc

```text
Telegram handler
      ↓
Domain use case
      ↓
Repository/Gateway contract
      ↑
PostgreSQL repository hoặc Gemini gateway

Infrastructure composition root tạo và nối tất cả dependency.
```

### Domain

- `repositories/*_contract.js` khai báo các method bắt buộc của từng port.
- `repository_contract.js` kiểm tra adapter tại startup và fail fast nếu thiếu
  method.
- `use_cases/*_use_cases.js` cung cấp API nghiệp vụ cho presentation/scheduler.
- `ledger_policy.js`, `report_service.js` và `ai_result_validator.js` là logic
  thuần, không import Telegraf, PostgreSQL hoặc config runtime.
- Tìm kiếm tự nhiên được AI chuẩn hóa thành filter DTO; repository luôn áp
  `ledger_id`, trạng thái active và các điều kiện SQL trước khi so khớp từ khóa
  đã bỏ dấu. Dữ liệu giao dịch không được đưa vào prompt Gemini.
- Yêu cầu báo cáo tự nhiên được AI chuẩn hóa thành tháng/năm. Presentation lấy
  đúng kỳ đó rồi gọi summary use case; số liệu vẫn được tính trong PostgreSQL.
  Conversation store chỉ giữ kỳ báo cáo gần nhất theo user và ledger trong
  bộ nhớ 30 phút, không lưu nội dung giao dịch hay kết quả tài chính.
- Các câu báo cáo rõ ràng được `local_financial_query.js` định tuyến trước khi
  gọi Gemini. Chống trùng, nhận diện chu kỳ, dự báo ngân sách và tổng kết tuần
  đều dùng rule/SQL; Gemini chỉ xử lý ngôn ngữ tự nhiên phức tạp và OCR.
- Luồng `SPENDING_INSIGHT` lấy hai tháng dữ liệu trong repository, tính tổng,
  thay đổi, category drivers và top transactions ở server. Chỉ DTO tổng hợp
  nhỏ được gửi Gemini để diễn đạt; phản hồi luôn kèm formatter local làm số liệu
  kiểm chứng. Scope `child` được nhận diện từ description và không sửa category.

JavaScript không có interface native nên contract được biểu diễn bằng danh sách
method bất biến và kiểm tra runtime. Cách này không cần DI framework nhưng vẫn
giữ dependency inversion rõ ràng.

### Data

- `postgres/database.js` tạo pool và chạy migration hiện có.
- `postgres/repositories/*` chứa toàn bộ SQL và transaction PostgreSQL.
- Mỗi repository là factory nhận `pool`; không tự đọc singleton database.
- `gemini_ai_gateway.js` nhận `config` và `pool` từ ngoài, quản lý quota và gọi
  Gemini. Validation response được đưa vào domain service thuần.
- `bank_statement.js` parse CSV/XLSX trong RAM bằng giới hạn kích thước/số dòng;
  chỉ DTO giao dịch đã chuẩn hóa mới đi qua use case để lưu PostgreSQL.

Các kiểm tra quyền quan trọng vẫn tồn tại trong SQL/repository để callback cũ
hoặc request giả mạo không thể bỏ qua membership/role.

### Presentation

- `create_bot.js` tạo Telegram adapter và đăng ký feature handler bằng các use
  case được inject.
- `context.js` xử lý rate limit, user context, active ledger và chuyển policy
  thành lỗi thân thiện.
- `views.js` tạo message và inline keyboard dùng lại.
- `action_flows.js` tạo preview/xác nhận dùng chung cho công nợ và điều chỉnh
  giao dịch; handler không cập nhật dữ liệu trước khi callback xác nhận.
- Các handler chỉ biết Telegram, domain service và use-case API; không import
  `src/data`.

### Infrastructure

- `composition_root.js` là nơi duy nhất khởi tạo database, repositories,
  gateways, use cases, Telegram bot, health server và scheduler.
- `index.js` chỉ quản lý lifecycle: initialize, listen, launch và shutdown.
- Health server nhận callback readiness thay vì import pool.
- Scheduler nhận use cases thay vì import PostgreSQL repository.
- Pending confirmation store là instance được inject, không còn global singleton.
- Scheduler chạy một lần lúc 20:00, gửi daily summary, weekly insights vào Chủ
  nhật và báo cáo tháng ở ngày cuối tháng; không polling liên tục.

## Dependency rules

1. Domain không phụ thuộc data, presentation hoặc infrastructure.
2. Presentation không import data adapter; mọi truy cập đi qua use cases.
3. Data có thể phụ thuộc domain contracts/services nhưng không phụ thuộc
   Telegram presentation.
4. Infrastructure được phép biết tất cả layer để thực hiện wiring.
5. Telegram-specific message, callback và keyboard chỉ nằm trong presentation
   hoặc scheduler notification adapter.
6. Transaction nhiều bước và kiểm tra quyền cuối cùng phải nằm trong data
   repository transaction.
7. Boundary tests trong `test/architecture.test.js` ngăn dependency sai chiều
   quay trở lại.

## Cách thêm tính năng

1. Viết policy/entity/service thuần trong domain nếu có quy tắc mới.
2. Bổ sung method vào repository contract phù hợp.
3. Implement method trong PostgreSQL repository hoặc gateway.
4. Expose thao tác qua use-case module theo feature.
5. Inject use case vào handler qua `create_bot.js` và `composition_root.js`.
6. Thêm unit test cho domain/use case; thêm integration test khi query SQL mới
   có PostgreSQL test environment.
7. Chạy `npm test`, `node --check` và `git diff --check` trước deploy.

## Tương thích sau refactor

- Entry point vẫn là `src/index.js`.
- Start command vẫn là `npm start`.
- Không thêm hoặc đổi environment variable.
- Migration bổ sung audit điều chỉnh giao dịch, trạng thái hủy, người tạo công
  nợ và lịch sử thanh toán idempotent.
- Command, callback payload và Telegram response hiện có được giữ nguyên.
- Các file repository/service legacy ở root `src/` đã được chuyển vào layer mới;
  không giữ compatibility adapter trùng lặp.
