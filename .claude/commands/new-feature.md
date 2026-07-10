---
description: Scaffold a new warehouse-api module by copying src/example/ and applying convention
---

Tạo module mới `$ARGUMENTS` trong `app/warehouse-api/src/` theo đúng convention mô tả trong `app/warehouse-api/CLAUDE.md`. Không tự sáng tạo pattern khác — copy nguyên `src/example/` làm nền, không viết lại từ đầu.

Quy ước đặt tên: nếu `$ARGUMENTS` là `product`, PascalCase là `Product`, dùng để thay `Example`/`example` trong toàn bộ file được copy.

Các bước thực hiện, theo đúng thứ tự:

1. Copy toàn bộ `app/warehouse-api/src/example/` sang `app/warehouse-api/src/<feature>/`, đổi tên file (`example.*` → `<feature>.*`).
2. Trong từng file vừa copy, thay `Example`→`<Feature>` (PascalCase), `example`→`<feature>` (lowerCamelCase), `EXAMPLE_`→`<FEATURE>_` (UPPER_SNAKE trong `.validation.ts`), `example_tbl`→`<feature>_tbl`, `examples` (route path số nhiều trong `@Controller`) → route path hợp lý cho feature mới.
3. Trong `<feature>.validation.ts`: đổi hẳn dải mã lỗi (`999901`-`999903` trong `example.validation.ts` là ví dụ) sang 1 dải **chưa dùng** — trước khi chọn số, grep toàn bộ `src/**/*.validation.ts` để liệt kê các dải đã dùng và tránh trùng.
4. Hỏi người dùng field thực tế của entity mới (nếu chưa cung cấp trong `$ARGUMENTS`) thay vì tự bịa field `name`/`description` của `Example` — sau đó cập nhật entity, DTO, mapper theo field thật.
5. Đăng ký `<Feature>Module` vào `src/app/app.module.ts` (mảng `imports`).
6. Đăng ký `<Feature>Validation` vào `src/app/app.validation.ts` (gộp vào `AppValidation`).
7. Sinh migration: `npm run typeorm:g --name=create-<feature>-table` (trong thư mục `app/warehouse-api`), review file migration sinh ra trước khi chạy.
8. Chạy `npm run typeorm:r` để áp dụng migration — nếu người dùng chưa xác nhận muốn chạy migration ngay, hỏi trước khi chạy.
9. Chạy `npm run lint` và `npm run test` trong `app/warehouse-api`, sửa lỗi nếu có.

Sau khi xong, tóm tắt ngắn gọn: đã tạo file nào, đăng ký ở đâu, migration đã chạy hay chưa.
