# Hướng dẫn sử dụng bot quản lý thu chi

> Trạng thái: áp dụng cho phiên bản có sổ chung và `/menu`. Các command cũ vẫn
> tiếp tục hoạt động như shortcut để bảo đảm tương thích.

## 1. Nguyên tắc giao diện

Người dùng không cần nhớ toàn bộ command. Telegram chỉ hiển thị tám lệnh chính:

```text
/start   Bắt đầu hoặc xem tổng quan
/chi     Ghi khoản chi
/thu     Ghi khoản thu
/baocao  Xem báo cáo tháng
/lichsu  Xem giao dịch gần nhất
/tim     Tìm và lọc giao dịch
/export  Xuất file CSV theo tháng
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

Nhắc nhở được bật mặc định. Lúc 20:00 mỗi ngày, bot gửi tổng thu/chi trong ngày
của sổ đang chọn và một câu nhắc thay đổi theo ngày để kiểm tra giao dịch còn
thiếu. Chủ nhật bot gửi tổng kết tuần (so sánh tuần trước, danh mục tăng mạnh,
khoản lớn nhất và dự báo thu–chi cuối tháng); ngày cuối tháng gửi báo cáo tháng.
Các phép tính và câu nhắc được
chọn local nên không dùng Gemini và không tốn AI quota. Dùng `/nhacnho off` để
tắt toàn bộ thông báo tự động; `/nhacnho on` để bật lại.

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
/chi 15k ăn xôi sáng
/chi ăn xôi sáng 15k
/chi mua 2 vé xem phim 150k
/chi biếu bà và mẹ mỗi người 500k
/chi biếu bà 500k; biếu mẹ 500k
/thu 20tr lương tháng 10
/thu lương tháng 10 20tr
```

Số tiền có thể nằm ở đầu, giữa hoặc cuối nội dung. Mỗi lệnh chỉ nên chứa một
số tiền rõ ràng; các số đếm nhỏ trong ghi chú, như `2 vé`, được giữ nguyên.

Với `/chi` và `/thu`, bot phân loại ngay trên server bằng bảng từ khóa local.
Bot không gọi Gemini cho các lệnh này nên không tốn AI quota. Nội dung có hoặc
không có dấu đều được chuẩn hóa trước khi so khớp; ví dụ `ăn xôi sáng` và
`AN XOI SANG` đều được xếp vào **Ăn uống**. Nếu không có từ khóa phù hợp, bot
dùng danh mục **Khác**.

Khoản có nhiều người nhận được tách thành các giao dịch riêng. Bot hiển thị số
tiền từng người và tổng cộng, sau đó yêu cầu xác nhận trước khi lưu. Nhờ vậy,
nếu một người không nhận tiền thì chỉ cần hủy đúng giao dịch của người đó.

Nếu một giao dịch cùng loại, số tiền và nội dung vừa được ghi trong vòng 30
phút, bot cảnh báo có thể bị trùng. Chọn **Vẫn lưu** nếu đó là hai giao dịch
thật sự khác nhau, hoặc **Không lưu** để bỏ bản nhập lại. Quy tắc áp dụng cho
command, câu AI, ảnh hóa đơn và file sao kê.

Khi cùng một khoản xuất hiện ở ít nhất ba tháng, số tiền/nội dung/danh mục giống
nhau và ngày ghi gần nhau, bot gợi ý tạo định kỳ. Chọn **Tạo định kỳ** để nhận
nhắc hàng tháng; đến kỳ vẫn phải bấm **Ghi khoản này**, nên bot không tự ý tạo
chi tiêu.

### Dùng câu tự nhiên

```text
Sáng nay ăn phở 50 nghìn
Hôm qua nhận 2 triệu tiền thưởng
Báo cáo tháng 10
Tháng trước tôi chi bao nhiêu?
Thế tháng trước nữa thì sao?
Tại sao tháng 10 tôi chi nhiều thế?
Tháng này tôi tốn bao nhiêu cho con nhỏ?
Chi phí cho con tháng này tăng vì sao?
```

Với báo cáo AI, bot lấy tháng/năm bạn nêu; nếu chỉ nêu tháng thì dùng năm
hiện tại. Nếu không nhắc kỳ nào, bot dùng tháng hiện tại. Kỳ báo cáo gần nhất
được giữ tối đa 30 phút theo từng người và từng sổ để hiểu câu nối tiếp như
“thế tháng trước thì sao?”. Gemini chỉ xác định kỳ cần hỏi; phần tổng thu/chi
được truy vấn và tính từ PostgreSQL trong sổ hiện tại.

Với câu hỏi “tại sao” hoặc “chi nhiều vì đâu”, bot so sánh với tháng liền trước,
tìm nhóm tăng mạnh, giao dịch lớn và khoản bất thường. Số liệu được tính trong
PostgreSQL; Gemini chỉ biến phần tổng hợp đó thành nhận định dễ đọc. Nếu Gemini
bận, bot vẫn trả toàn bộ số liệu phân tích bằng formatter local.

Phân tích **chi cho con nhỏ** không thay đổi danh mục gốc của giao dịch. Bot
nhận diện từ ghi chú như `cho con`, `sữa`, `bỉm`, `tã`, `ăn dặm`, `mầm non`,
`nhà trẻ`, `khám nhi`… Vì vậy nên ghi mô tả rõ, ví dụ `/chi 450k bỉm cho bé`,
thay vì chỉ ghi `/chi 450k mua đồ`. Bot luôn kèm lưu ý nếu kết quả dựa trên
từ khóa, tránh coi con số ước lượng này là tuyệt đối.

### Dùng ảnh hóa đơn

1. Vào **Menu → Cài đặt → OCR hóa đơn** và bật OCR.
2. Gửi ảnh JPEG, PNG, WebP, HEIC hoặc HEIF.
3. Kiểm tra các giao dịch bot đọc được.
4. Bấm xác nhận trước khi lưu.

### Nhập sao kê ngân hàng

1. Tải sao kê từ ngân hàng ở định dạng `.csv` hoặc `.xlsx`.
2. Gửi file trực tiếp vào chat với bot khi đang chọn đúng sổ.
3. Bot tự nhận cột ngày, nội dung, ghi nợ/ghi có hoặc số tiền và hiển thị preview.
4. Kiểm tra tổng thu/chi và tối đa 8 dòng đầu, sau đó bấm **Lưu** hoặc **Hủy**.

File tối đa 5 MB và 300 giao dịch. Bot xử lý file trong RAM, không gửi nội dung
sao kê tới Gemini và không lưu file sau khi xử lý. Do mỗi ngân hàng có mẫu cột
khác nhau, file nên có tiêu đề rõ như `Ngày`, `Nội dung`, `Ghi nợ`, `Ghi có`;
nếu không nhận diện được, hãy xuất lại dạng CSV chuẩn từ ứng dụng ngân hàng.

Phản hồi thành công phải chỉ rõ sổ đang ghi:

```text
✅ Đã ghi vào “Gia đình Lân & Thu”

💸 50.000 VNĐ · Ăn uống
📝 Ăn phở
👤 Người ghi: Lân

[↩️ Hoàn tác]
```

### Điều chỉnh hoặc hủy giao dịch

Gõ `/lichsu`, sau đó chọn **Điều chỉnh #ID** dưới giao dịch cần xử lý:

- **Sửa số tiền:** nhập số tiền mới, có thể thêm ghi chú sau dấu `|`.
- **Hủy giao dịch:** giao dịch không còn được tính trong báo cáo, CSV và ngân
  sách nhưng lịch sử thay đổi vẫn được lưu.

Shortcut `/xoa ID` vẫn được hỗ trợ nhưng luôn hiển thị bước xác nhận. Owner có
thể xử lý mọi giao dịch trong sổ; member chỉ xử lý giao dịch do mình tạo.

Với AI, có thể nhắn `Mẹ không nhận khoản biếu 500k` hoặc `Giảm khoản biếu bà và
mẹ 1 triệu xuống còn 500k`. Bot tìm giao dịch trong 90 ngày gần nhất và yêu cầu
chọn nếu có nhiều kết quả; AI không tự sửa dữ liệu khi chưa xác nhận.

## 4. Quản lý công nợ

Gõ `/no` để xem bốn khoản mỗi trang cùng các nút thao tác và nút chuyển trang:

- **Trả:** nhập số tiền đã thanh toán và xác nhận.
- **Tất toán:** thanh toán toàn bộ số còn lại và xác nhận.
- **Chi tiết:** xem số ban đầu, đã trả, còn lại và từng lần thanh toán.
- **Hủy khoản:** chỉ dùng khi nhập sai hoặc khoản không còn hiệu lực; không dùng
  thay cho trả nợ.

Cú pháp dễ đọc:

```text
/no phai-thu Nam 100k | tiền Grab
/no phai-tra Lan 1tr | tiền nhà
/no tra Nam 40k
/no tattoan Nam
```

Cú pháp cũ `/no cho`, `/no vay` và `/no tra ID SỐ_TIỀN` vẫn hoạt động. Nếu một
người có nhiều khoản đang mở, bot hiển thị danh sách để chọn đúng ID. Số tiền
trả lớn hơn dư nợ bị từ chối thay vì tự động cắt xuống.

Thanh toán nợ gốc được lưu trong lịch sử công nợ, không được tính là thu nhập
hoặc chi tiêu. Owner/member có thể ghi thanh toán; member chỉ được hủy khoản do
mình tạo, còn owner có thể hủy mọi khoản trong sổ.

## 5. Tạo sổ chung

1. Gửi `/menu`.
2. Chọn **Sổ chung → Tạo sổ**.
3. Nhập tên, ví dụ `Gia đình Lân & Thu`.
4. Xác nhận dùng sổ mới làm sổ hiện tại.

Người tạo là chủ sổ và có quyền quản lý thành viên, dữ liệu và lời mời.

Command tương đương dành cho người dùng nâng cao:

```text
/taoso Gia đình Lân & Thu
```

## 6. Mời người khác

1. Owner mở **Menu → Sổ chung → Mời người**.
2. Bot gửi mã mời dùng một lần, có hiệu lực 24 giờ.
3. Chuyển mã cho người được mời qua kênh riêng.

Command tương đương:

```text
/moi
```

Không đăng mã ở nơi công cộng. Có mã vẫn chưa đủ quyền truy cập; owner phải phê
duyệt yêu cầu tham gia.

## 7. Tham gia sổ

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

## 8. Chuyển sổ hiện tại

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

## 9. Quản lý thành viên

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

## 10. Quyền của từng vai trò

- **Chủ sổ:** toàn quyền, mời và remove thành viên, đổi role, xóa sổ.
- **Thành viên:** xem toàn bộ sổ, thêm dữ liệu, sửa/xóa dữ liệu mình tạo.
- **Người xem:** chỉ xem giao dịch và báo cáo.

Nếu thao tác không được phép, bot giải thích và đưa hành động thay thế:

```text
⛔ Bạn đang có quyền Người xem nên không thể ghi khoản chi.
Hãy liên hệ chủ sổ nếu bạn cần quyền Thành viên.
```

## 11. Báo cáo và lịch sử

```text
/baocao
/baocao 09/2026
/lichsu
/lichsu 3
/tim sữa cho con
/tim sữa cho con | chi | tháng 10/2026 | min 100k | người Lân
/export
/export 09/2026
```

Báo cáo của sổ chung bao gồm dữ liệu của tất cả thành viên. Lịch sử hiển thị
người ghi từng giao dịch và cho phép chọn tối đa 20 giao dịch mỗi lần.

### Tìm và lọc giao dịch

`/tim` tìm trong sổ đang chọn và không dùng AI quota. Từ khóa được so khớp
không phân biệt hoa/thường hoặc dấu tiếng Việt. Tách các điều kiện bằng dấu
`|`; tất cả điều kiện được kết hợp theo AND:

```text
/tim mua sữa cho con
/tim sữa | chi | tháng 10/2026
/tim tiền học | từ 01/09/2026 | đến 31/10/2026
/tim | thu | danh mục Lương | min 10tr
/tim | người Lân | max 500k | giới hạn 20
```

Các bộ lọc được hỗ trợ:

- `chi` hoặc `thu`.
- `ngày DD/MM/YYYY`, `tháng MM/YYYY`, `từ DD/MM/YYYY`, `đến DD/MM/YYYY`.
- `min SỐ_TIỀN`, `max SỐ_TIỀN`.
- `danh mục TÊN_HOẶC_ID`, `người TÊN`, `giới hạn 1..20`.

Có thể hỏi tự nhiên, ví dụ `Tìm các khoản mua sữa cho con trong tháng 10 trên
100k do Lân ghi`. Gemini chỉ chuyển câu nói thành bộ lọc; bot không gửi lịch sử
giao dịch lên Gemini và PostgreSQL mới là nơi thực hiện truy vấn.

Sau khi bot trả tổng thu, tổng chi và chênh lệch thu–chi, bot hiển thị thêm
ngân sách tổng, số tiền còn lại và tỷ lệ đã dùng nếu sổ đã đặt ngân sách tổng
cho tháng đó. Ngân sách theo danh mục không được cộng vào ngân sách tổng để
tránh tính trùng.

Nếu tốc độ chi hiện tại cho thấy ngân sách có thể bị vượt vào cuối tháng, bot
hiển thị số tiền dự kiến vượt. Dự báo là phép ngoại suy theo số ngày đã qua,
chạy trong PostgreSQL và không dùng AI quota.

Bấm **📋 Xem chi tiết** để xem danh sách giao dịch ngay trong Telegram. Mỗi
trang hiển thị tối đa 8 giao dịch; mỗi mục có mã, loại thu/chi, số tiền, ngày
tháng năm và giờ, danh mục, ghi chú, người ghi. Dùng **Trang trước** hoặc
**Trang sau** để chuyển trang; bấm **📊 Xem tổng quan** để quay lại báo cáo
tổng. Bot kiểm tra lại quyền truy cập sổ ở mỗi lần bấm nút.

File CSV định dạng số tiền theo hàng nghìn (`1.250.000`) và có ba dòng tổng
hợp cuối file: tổng thu, tổng chi và chênh lệch thu–chi.

## 12. Rời hoặc xóa sổ

### Thành viên rời sổ

Mở **Menu → Sổ chung → Thông tin sổ → Rời sổ**. Quyền truy cập bị thu hồi,
nhưng dữ liệu đã ghi vẫn được giữ lại.

### Owner xóa sổ

Owner mở **Dữ liệu & quyền riêng tư → Xóa sổ**. Bot hiển thị phạm vi dữ liệu và
yêu cầu xác nhận hai bước. Không thể hoàn tác sau khi hoàn tất.

`/deletedata` xóa sổ cá nhân, cài đặt và membership sau khi xác nhận. Nếu người
dùng còn sở hữu sổ chung, bot yêu cầu xử lý các sổ đó trước.

## 13. Quy tắc UX và behavior

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

## 14. Command đầy đủ cho người dùng nâng cao

Các lệnh chính được hiển thị:

```text
/start /chi /thu /baocao /lichsu /tim /export /menu
```

Các shortcut ẩn nhưng vẫn hỗ trợ:

```text
/bieudo /xoa
/ngansach /no /dinhky /nhacnho
/taoso /moi /thamgia /danhsachso /chonso
/thanhvien /phanquyen /xoathanhvien /roiso /xoaso
/ocr /phongcach /aiquota /quyenriengtu /deletedata /id /help
```

Mục tiêu là người dùng phổ thông chỉ cần nhớ `/menu`, `/chi` và `/thu`.
