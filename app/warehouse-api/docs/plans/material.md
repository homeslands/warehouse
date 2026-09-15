# Plan: material (danh mục vật tư + tồn kho theo kho)

Nguồn: `docs/specs/material.md`. Khuôn mẫu: `src/warehouse/` (module thật gần nhất, cùng kiểu master data + `VersionedBase`).

## Quyết định chốt từ mục "Câu hỏi mở" của spec

| Điểm | Chốt |
|---|---|
| Số module | **3** module tách rời: `material-type/`, `material/`, `warehouse-material/` — theo tiền lệ `authority/` + `authority-group/` tách nhau. |
| Dải mã lỗi | `material-type` = `1006xx`, `material` = `1007xx`, `warehouse-material` = `1008xx` (đã kiểm `1006`-`1008` chưa ai dùng). |
| Base class | `MaterialType`/`Material` → `VersionedBase`; `WarehouseMaterial` → `Base` (quantity là cộng/trừ nguyên tử). |
| Route của bảng nối | Lồng dưới kho: `/warehouses/:warehouseSlug/materials` — controller riêng trong `warehouse-material/`, KHÔNG nhét vào `WarehouseController`. |
| Định danh trong URL/body | Luôn là `slug` (không bao giờ lộ `id`), theo `BaseResponseDto`. |
| Phân quyền | `@HasRole` — write `ADMIN`, read `ADMIN`/`MANAGER`/`SUPERVISOR`. Không dùng `@RequireAuthority` ⇒ **không** cần migration seed `Authority`. |

## Thứ tự bước

1. `src/material-type/` — 9 file theo checklist CLAUDE.md (entity, dto, mapper, service, controller, module, exception, validation, 2 spec test).
2. `src/material/` — như trên, thêm quan hệ `ManyToOne MaterialType` + resolve `typeSlug` → entity, chặn xoá khi còn `Material` tham chiếu (query ngược từ `material-type`).
3. `src/warehouse-material/` — entity bảng nối + 5 route lồng dưới `/warehouses/:warehouseSlug/materials`; import `WarehouseModule` (đã export `WarehouseService`) và `MaterialModule`.
4. Đăng ký 3 module trong `src/app/app.module.ts`; gộp 3 `*Validation` vào `src/app/app.validation.ts` (guard trùng mã sẽ throw lúc boot nếu chọn nhầm dải).
5. Migration `1783728000015-create-material-tables.ts` — **viết tay**, không dùng `typeorm:g` (xem "Điểm dễ sai"). Đã verify `up()`/`down()` trên 1 DB nháp rồi xoá DB đó; **chưa chạy** trên `warehouse_db`, user tự chạy `npm run typeorm:r`.
6. Verify: `npm run lint`, `npm run test`.

## File sẽ tạo

```
src/material-type/   material-type.{entity,dto,mapper,service,controller,module,exception,validation}.ts
                     material-type.{service,controller}.spec.ts
src/material/        material.{entity,dto,mapper,service,controller,module,exception,validation}.ts
                     material.{service,controller}.spec.ts
src/warehouse-material/  warehouse-material.{entity,dto,mapper,service,controller,module,exception,validation}.ts
                         warehouse-material.{service,controller}.spec.ts
src/migrations/<ts>-create-material-tables.ts   (sinh, chưa chạy)
```

## File sẽ sửa

- `src/app/app.module.ts` — thêm 3 module vào `imports`.
- `src/app/app.validation.ts` — gộp 3 bộ mã lỗi.
- `CLAUDE.md` — cập nhật danh sách module trong `src/`, bảng map `@HasRole` → role.

## Điểm dễ sai đã tính trước

- **UNIQUE index không bỏ qua soft-delete**: check trùng `code` phải `withDeleted` và phân biệt "đang dùng" vs "bản ghi đã xoá giữ chỗ" (copy `assertCodeIsFree` của `warehouse.service.ts`). Áp cho cả `code` của 2 entity lẫn cặp `(warehouse, material)` của bảng nối.
- **Quan hệ không `eager`**: mọi read path phải truyền `relations` tường minh, nếu không response im lặng mất `typeSlug`/`materialCode` mà không có lỗi nào.
- **`delta` phải ghi bằng 1 UPDATE có điều kiện**, không `findOne` rồi `save` — nếu không, 2 lần điều chỉnh đồng thời mất 1.
- **Ngưỡng override 1 vế**: so với giá trị effective của vế kia, không so với `null`.
- **`typeorm:g` đẻ ra migration phá hoại**: nó diff cả schema cũ (migration cũ đặt tên index/FK thủ công, VARCHAR hẹp hơn entity) nên sinh kèm drop/re-add `user_tbl.phonenumber_column` + `warehouse_tbl.code_column` (mất dữ liệu) và hạ `ON DELETE` của `FK_user_role`/`FK_warehouse_manager`/`FK_permission_*` xuống NO ACTION. Phải viết tay.
- Automapper **không kế thừa** map của DTO cha ⇒ `Update*RequestDto extends Create*RequestDto` vẫn phải khai `createMap` riêng (đã vấp ở `warehouse.mapper.ts`).
