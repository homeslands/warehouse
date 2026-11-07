# Contract API warehouse-api (cho FE)

Tài liệu này mô tả API mà **code BE trên nhánh `main` đang chạy**. FE dùng nó làm nguồn tham chiếu khi gọi API.

- Tài liệu được viết từ source code (controller, DTO, validation, guard), không dựa trên spec hay kế hoạch.
- Mọi thay đổi API phía BE đều phải cập nhật tài liệu này trong **cùng PR** (xem [Quy trình cập nhật](#quy-trình-cập-nhật)).
- Code BE đang nằm ở PR chưa merge (ví dụ chuỗi draft W02 `#237`–`#241`) **chưa** có trong tài liệu. Phần đó chỉ được thêm vào khi PR merge.
- Swagger UI ở `/api/api-docs` (JSON ở `/swagger.json`) có danh sách endpoint, nhưng nhiều DTO chưa khai báo `@ApiProperty` nên schema ở đó chưa đầy đủ. Khi Swagger và tài liệu này khác nhau, tin tài liệu này. Nếu tài liệu này khác code, thì tài liệu sai: hãy báo BE.

## Mục lục

| File | Nội dung |
|---|---|
| [conventions.md](conventions.md) | Base URL, envelope response/lỗi, xác thực, guard và quyền, phân trang, optimistic lock, mã lỗi chung |
| [auth.md](auth.md) | Đăng nhập, refresh, logout, thông tin người dùng hiện tại |
| [users-rbac.md](users-rbac.md) | User, role, authority, authority group, permission |
| [warehouse.md](warehouse.md) | Kho, gán user vào kho, phạm vi kho |
| [store.md](store.md) | Cửa hàng |
| [inventory.md](inventory.md) | Tồn kho theo kho |
| [import-form.md](import-form.md) | Phiếu nhập: endpoint và vòng đời trạng thái |
| [export-form.md](export-form.md) | Phiếu xuất: endpoint và vòng đời trạng thái |
| [material.md](material.md) | Vật tư, loại vật tư, lô vật tư |
| [unit.md](unit.md) | Đơn vị tính |
| [tax-profile.md](tax-profile.md) | Hồ sơ thuế |
| [supplier.md](supplier.md) | Nhà cung cấp |
| [file.md](file.md) | Tải lên, tải xuống tệp |
| [notification.md](notification.md) | Thông báo |
| [system.md](system.md) | Health, mã lỗi, feature flag, các endpoint vận hành |

## Cách đọc

- Mỗi endpoint có một mục tiêu đề dạng `## <METHOD> /api/v1/<path>`. Path param viết dạng `:slug`, đúng như trong code.
- **Quyền**: authority, role, phạm vi kho, feature flag mà endpoint yêu cầu. Cơ chế chung xem [conventions.md](conventions.md).
- **Lỗi riêng**: chỉ liệt kê lỗi của endpoint đó. Lỗi chung (401, 403, 422 validation, 409 optimistic lock...) nằm trong [conventions.md](conventions.md).

## Quy trình cập nhật

Khi một PR BE thêm, xoá hoặc đổi endpoint, field, quyền hay mã lỗi:

1. Sửa file module tương ứng trong thư mục này, trong **cùng PR**.
2. Ghi một dòng vào [Lịch sử thay đổi](#lịch-sử-thay-đổi): ngày, PR, thay đổi, có phá vỡ tương thích (breaking) hay không.
3. Thay đổi breaking (đổi tên hoặc xoá field/endpoint, đổi kiểu, siết validation) phải báo team FE trên issue/PR trước khi merge.

Test `src/app/api-contract-docs.spec.ts` chạy cùng `npm test`. Test fail khi:

- có route trong controller nhưng không có mục `## <METHOD> <path>` tương ứng ở đây;
- hoặc có mục endpoint ở đây nhưng route không còn tồn tại.

Test chỉ kiểm tra danh sách endpoint. Nội dung field, quyền và mã lỗi vẫn phải được reviewer đối chiếu với code.

Module `src/example` là mẫu để tạo module mới, không dành cho FE nên được loại khỏi kiểm tra này.

## Lịch sử thay đổi

| Ngày | PR | Thay đổi | Breaking |
|---|---|---|---|
| 2026-11-07 | (PR này) | Bản đầu tiên, mô tả API tại `main` `5555273` | — |
