# Plan: Implement Product module

> File này là VÍ DỤ MINH HOẠ định dạng 1 plan thật trông như thế nào sau khi Claude viết ra ở bước `ExitPlanMode` — không phải plan đã được duyệt/implement. Khi làm feature thật, Claude sẽ tự tạo file plan trong thư mục này (tên tuỳ nội dung, không nhất thiết trùng tên spec).

## Nguồn

- Spec: `docs/specs/product.md`
- Template tham khảo: `src/example/`
- Convention: `CLAUDE.md`

## Câu hỏi cần chốt trước khi code

Lấy từ mục "Câu hỏi mở / chưa chốt" trong spec — trả lời rồi mới implement, không đoán:

- Entity `Category` chưa tồn tại → **quyết định**: tạo `Category` tối giản (chỉ `name`) trong cùng lần này, `Product` FK vào qua `categoryId`.
- Case giảm giá khi có khuyến mãi → **quyết định**: bỏ qua, hệ thống chưa có khái niệm khuyến mãi (đúng như spec đã ghi ở "out of scope").

## Các bước implement

1. **Category** (phụ thuộc, làm trước): copy `src/example/` → `src/category/`, chỉ giữ field `name`. Đăng ký module + migration `create-category-table`.
2. **Product**: copy `src/example/` → `src/product/`.
   - Entity: `name`, `sku` (unique), `price` (decimal > 0), `quantity` (int, default 0), `categoryId` (FK → Category, `ManyToOne`).
   - DTO: `CreateProductRequestDto`/`UpdateProductRequestDto` validate `price` bằng `@IsPositive()`, `sku` bằng `@IsNotEmpty()`.
3. Business rule "không xoá khi `quantity > 0`": thêm check đầu `deleteExample()` (đổi tên `deleteProduct()`), throw `ProductException(ProductValidation.PRODUCT_HAS_STOCK)` nếu vi phạm.
4. Business rule "không giảm giá quá 50%/lần update": trong `updateExample()` (đổi tên `updateProduct()`), so `dto.price` với `product.price` hiện tại trước khi `Object.assign`, throw `ProductException(ProductValidation.PRICE_DROP_TOO_LARGE)` nếu `newPrice < oldPrice * 0.5`.
5. Phân quyền: `@HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)` cho create/update; `@HasRoles(RoleEnum.SuperAdmin)` riêng cho delete; `@Public()` cho list/detail (đúng bảng phân quyền trong spec).
6. Mã lỗi: `ProductValidation` dùng dải `999910`-`999916` (đã grep `src/**/*.validation.ts`, dải `999901`-`999909` là của `example`, chưa module nào khác dùng số khác).
7. Đăng ký `CategoryModule`/`ProductModule` vào `app.module.ts`, `CategoryValidation`/`ProductValidation` vào `app.validation.ts`.
8. Migration: `npm run typeorm:g --name=create-category-table`, `npm run typeorm:g --name=create-product-table`, review diff trước khi `npm run typeorm:r`.
9. Test: `product.service.spec.ts` cho 2 rule ở bước 3-4 (case hợp lệ + case vi phạm mỗi rule).

## File sẽ tạo/sửa

```
src/category/          (mới, 9 file theo template example/)
src/product/            (mới, 9 file theo template example/)
src/app/app.module.ts        (sửa — thêm 2 import)
src/app/app.validation.ts     (sửa — thêm 2 import)
src/migrations/                (mới — 2 file migration)
```

## Ngoài phạm vi (theo spec, không tự thêm)

Lịch sử giá/tồn kho, upload ảnh, import Excel.
