---
description: Scaffold a new warehouse-api module by copying src/example/ and applying convention
---

Tạo module mới `$ARGUMENTS` trong `app/warehouse-api/src/` theo đúng convention mô tả trong `app/warehouse-api/CLAUDE.md`. Không tự sáng tạo pattern khác — copy nguyên `src/example/` làm nền, không viết lại từ đầu.

Quy ước đặt tên: nếu `$ARGUMENTS` là `product`, PascalCase là `Product`, dùng để thay `Example`/`example` trong toàn bộ file được copy.

Các bước thực hiện, theo đúng thứ tự:

1. Copy toàn bộ `app/warehouse-api/src/example/` sang `app/warehouse-api/src/<feature>/`, đổi tên file (`example.*` → `<feature>.*`).
2. Trong từng file vừa copy, thay `Example`→`<Feature>` (PascalCase), `example`→`<feature>` (lowerCamelCase), `EXAMPLE_`→`<FEATURE>_` (UPPER_SNAKE trong `.validation.ts`), `example_tbl`→`<feature>_tbl`, `examples` (route path số nhiều trong `@Controller`) → route path hợp lý cho feature mới.
3. **Hỏi người dùng entity mới nên dùng `Base` hay `VersionedBase`** (xem tiêu chí ở `app/warehouse-api/CLAUDE.md` mục "Base entity") — **không mặc định theo `example/`** dù `example/` hiện đang dùng `VersionedBase` làm mẫu minh hoạ. Nếu người dùng chọn `Base` (không cần optimistic locking), phải gỡ bỏ phần versioning vừa copy theo từ `example/`:
   - `<feature>.entity.ts`: đổi `extends VersionedBase` → `extends Base`, sửa import từ `src/app/versioned.entity` sang `src/app/base.entity`.
   - `<feature>.dto.ts`: bỏ field `version` khỏi `Update<Feature>RequestDto`; đổi `<Feature>ResponseDto extends VersionedResponseDto` → `extends BaseResponseDto`, sửa import từ `src/app/base.dto`.
   - `<feature>.mapper.ts`: bỏ `versionedMapper()` khỏi lời gọi `createMap(...)` và bỏ import `src/app/versioned.mapper`.
   - `<feature>.service.ts`: trong hàm update, bỏ `lock: { mode: 'optimistic', version: dto.version }`, đổi `findOne({ where: { slug }, lock: {...} })` về `findOneBy({ slug })` (giống các module không versioned khác, vd `role.service.ts`).
   Nếu chọn `VersionedBase`, giữ nguyên phần đã copy từ `example/`, không cần sửa gì thêm ở bước này.
4. Trong `<feature>.validation.ts`: đổi hẳn dải mã lỗi (`999901`-`999903` trong `example.validation.ts` là ví dụ) sang 1 dải **chưa dùng** — trước khi chọn số, grep toàn bộ `src/**/*.validation.ts` để liệt kê các dải đã dùng và tránh trùng.
5. Hỏi người dùng field thực tế của entity mới (nếu chưa cung cấp trong `$ARGUMENTS`) thay vì tự bịa field `name`/`description` của `Example` — sau đó cập nhật entity, DTO, mapper theo field thật.
6. Đăng ký `<Feature>Module` vào `src/app/app.module.ts` (mảng `imports`).
7. Đăng ký `<Feature>Validation` vào `src/app/app.validation.ts` (gộp vào `AppValidation`).
8. Sinh migration: `npm run typeorm:g --name=create-<feature>-table` (trong thư mục `app/warehouse-api`), review file migration sinh ra trước khi chạy.
9. Chạy `npm run typeorm:r` để áp dụng migration — nếu người dùng chưa xác nhận muốn chạy migration ngay, hỏi trước khi chạy.
10. Chạy `npm run lint` và `npm run test` trong `app/warehouse-api`, sửa lỗi nếu có.

Sau khi xong, tóm tắt ngắn gọn: đã tạo file nào, đăng ký ở đâu, migration đã chạy hay chưa.
