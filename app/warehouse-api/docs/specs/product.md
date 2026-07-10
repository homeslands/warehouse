# Spec: Product (quản lý sản phẩm)

> File này là VÍ DỤ MINH HOẠ cách điền `_TEMPLATE.md` — không phải feature đã implement thật. Xoá hoặc thay bằng spec thật khi bắt đầu làm module product.

## Mục tiêu

Cho phép ADMIN quản lý danh sách sản phẩm (thêm/sửa/xoá/xem), khách hàng xem được danh sách sản phẩm public để đặt hàng.

## Entity / dữ liệu

| Field | Kiểu | Bắt buộc? | Ghi chú |
|---|---|---|---|
| name | string | có | tên sản phẩm |
| sku | string, unique | có | mã sản phẩm |
| price | decimal | có | phải > 0 |
| quantity | int | có | tồn kho, default 0 |
| categoryId | uuid (FK) | có | thuộc 1 category |

Quan hệ: `Product belongsTo Category` (`ManyToOne`, chưa có entity `Category` — coi như tạo song song hoặc giả định đã tồn tại tuỳ độ ưu tiên thật).

## Quy tắc nghiệp vụ

- `sku` không được trùng giữa các sản phẩm chưa bị xoá (unique theo `sku`, bỏ qua bản ghi đã `deletedAt`).
- Không cho xoá sản phẩm nếu `quantity > 0` — phải set về 0 trước (giả định business muốn tránh xoá nhầm hàng còn tồn).
- Không cho sửa `price` giảm quá 50% giá trị cũ trong 1 lần update (tránh nhập sai giá) — trả lỗi nghiệp vụ rõ ràng, không phải lỗi validate chung chung.

## Quyền truy cập

| Action | Role |
|---|---|
| Create | ADMIN, SUPER_ADMIN |
| Read (list/detail) | Public |
| Update | ADMIN, SUPER_ADMIN |
| Delete | SUPER_ADMIN |

## API cần có

- `POST /products` — tạo sản phẩm.
- `GET /products` — danh sách phân trang (kế thừa `BaseQueryDto` sẵn có), filter theo `categoryId`.
- `GET /products/:slug` — chi tiết.
- `PATCH /products/:slug` — cập nhật.
- `DELETE /products/:slug` — xoá mềm (chặn theo quy tắc nghiệp vụ ở trên).

## Ngoài phạm vi (Out of scope)

- Chưa cần lịch sử thay đổi giá/tồn kho.
- Chưa cần upload ảnh sản phẩm (dù `src/file/s3` đã có sẵn, không tích hợp ở version này).
- Chưa cần import/export Excel.

## Câu hỏi mở / chưa chốt

- Entity `Category` đã tồn tại chưa hay cần tạo mới trong cùng feature này?
- "Giảm giá quá 50%" tính trên giá trị nào nếu sản phẩm đang có khuyến mãi (chưa có khái niệm khuyến mãi trong hệ thống) — tạm bỏ qua case này.
