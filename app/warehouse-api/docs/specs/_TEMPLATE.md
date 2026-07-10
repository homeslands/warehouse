# Spec: <tên feature>

> Copy file này thành `<feature>.md` trong cùng thư mục, điền đủ các mục dưới. Mục nào không áp dụng thì ghi rõ "Không có" thay vì xoá — Claude cần biết là bạn đã cân nhắc chứ không phải bỏ sót.

## Mục tiêu

1-2 câu: feature này giải quyết vấn đề gì, cho ai dùng.

## Entity / dữ liệu

Liệt kê field thật (không phải field mẫu của `example/`):

| Field | Kiểu | Bắt buộc? | Ghi chú |
|---|---|---|---|
| name | string | có | |
| ... | | | |

Quan hệ với entity khác (nếu có): vd `Product belongsTo Category`, `Order hasMany OrderItem`.

## Quy tắc nghiệp vụ

Logic không tự suy ra được từ CRUD thuần — đây là phần quan trọng nhất của spec, viết càng cụ thể càng tốt:

- Vd: "Không cho xoá category nếu còn product thuộc category đó."
- Vd: "Giá sản phẩm phải > 0, không cho sửa giá nếu đã có đơn hàng tham chiếu."

## Quyền truy cập

Role nào được gọi endpoint nào (dùng đúng `RoleEnum` hiện có: `CUSTOMER`/`STAFF`/`CASHIER`/`CHEF`/`MANAGER`/`ADMIN`/`SUPER_ADMIN`/`TELESALE`, hoặc nói rõ nếu cần role mới):

| Action | Role |
|---|---|
| Create | ADMIN, SUPER_ADMIN |
| Read | Public |
| Update | ... |
| Delete | ... |

## API cần có

Liệt kê endpoint dự kiến (method + path + mô tả ngắn), nếu khác CRUD chuẩn 5 route của `example/`:

- `POST /products` — tạo sản phẩm
- `GET /products/:slug/stock` — ví dụ endpoint đặc thù ngoài CRUD

## Ngoài phạm vi (Out of scope)

Ghi rõ cái gì **cố tình chưa làm** ở version này, để Claude không tự ý thêm vào rồi bạn phải yêu cầu bỏ đi. Vd: "Chưa cần lịch sử thay đổi giá", "Chưa cần export Excel".

## Câu hỏi mở / chưa chốt

Những điểm bạn còn phân vân — Claude sẽ hỏi lại thay vì tự đoán khi thấy mục này còn nội dung.
