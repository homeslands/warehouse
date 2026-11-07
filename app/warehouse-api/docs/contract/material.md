# Vật tư (Material, Material Type, Material Batch)

> Nguồn: `src/material-type/material-type.{controller,dto,validation,service,mapper}.ts`, `src/material/material.{controller,dto,validation,service,mapper,entity}.ts`, `src/material/material-unit.entity.ts`, `src/material-batch/material-batch.{controller,dto,validation,constants,service,mapper}.ts`, `src/shared/utils/{code.util,query.util,decimal.validator,decimal.transformer}.ts` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).
> Đối chiếu code tại `origin/main` 5555273. Chỗ nào lệch với `docs/plans/material.md` hay `docs/specs/material.md` thì **code là chuẩn**; các điểm lệch ghi ở [Ghi chú cho FE](#ghi-chú-cho-fe).

## Tóm tắt endpoint

| Method | Path | Quyền (authority, AND) | Mô tả |
|---|---|---|---|
| POST | /api/v1/material-types | `MATERIAL_CREATE` | Tạo loại vật tư |
| GET | /api/v1/material-types | `MATERIAL_READ` | Danh sách loại vật tư |
| GET | /api/v1/material-types/:slug | `MATERIAL_READ` | Chi tiết loại vật tư |
| PATCH | /api/v1/material-types/:slug | `MATERIAL_UPDATE` | Sửa loại vật tư |
| DELETE | /api/v1/material-types/:slug | `MATERIAL_DELETE` | Xoá mềm loại vật tư |
| POST | /api/v1/materials | `MATERIAL_CREATE` | Tạo vật tư, có đơn vị cơ sở |
| GET | /api/v1/materials | `MATERIAL_READ` | Danh sách vật tư |
| GET | /api/v1/materials/:slug | `MATERIAL_READ` | Chi tiết vật tư |
| PATCH | /api/v1/materials/:slug | `MATERIAL_UPDATE` | Sửa vật tư, kể cả đổi đơn vị cơ sở |
| DELETE | /api/v1/materials/:slug | `MATERIAL_DELETE` | Xoá mềm vật tư |
| PUT | /api/v1/materials/:slug/suppliers | `MATERIAL_UPDATE` + `SUPPLIER_UPDATE` | Thay toàn bộ danh sách nhà cung cấp |
| GET | /api/v1/materials/:slug/conversion-units | `MATERIAL_READ` + `UNIT_READ` | Các đơn vị đã gắn, có cả đơn vị cơ sở |
| GET | /api/v1/materials/:slug/conversion-units/available | `MATERIAL_READ` + `UNIT_READ` | Các unit còn gắn được |
| POST | /api/v1/materials/:slug/conversion-units | `MATERIAL_UPDATE` + `UNIT_UPDATE` | Gắn đơn vị quy đổi |
| PATCH | /api/v1/materials/:slug/conversion-units/:unitSlug | `MATERIAL_UPDATE` + `UNIT_UPDATE` | Sửa tỉ lệ quy đổi |
| DELETE | /api/v1/materials/:slug/conversion-units/:unitSlug | `MATERIAL_UPDATE` + `UNIT_UPDATE` | Gỡ đơn vị quy đổi (xoá cứng) |
| POST | /api/v1/materials/:slug/convert | `MATERIAL_READ` + `UNIT_READ` | Quy đổi số lượng, không ghi dữ liệu |
| GET | /api/v1/warehouses/:warehouseSlug/material-batches | `MATERIAL_READ` + `WAREHOUSE_READ`, warehouse scope | Danh sách lô của kho |
| GET | /api/v1/warehouses/:warehouseSlug/material-batches/:slug | `MATERIAL_READ` + `WAREHOUSE_READ`, warehouse scope | Chi tiết lô |

Tổng cộng 19 endpoint. Loại vật tư dùng chung bộ quyền `MATERIAL_*`, không có authority riêng (`src/authority/authority.constants.ts:91-97`). Nhiều authority trên một route nghĩa là role phải có **đủ tất cả** (`src/authority/authority.decorator.ts:10-14`).

---

## Kiểu dữ liệu dùng chung

### MaterialTypeResponseDto

`material-type.dto.ts:70-82`, map ở `material-type.mapper.ts:43` (`baseMapper`, không trả `id`).

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug | string (slug) | |
| createdAt, updatedAt | string | Định dạng: xem conventions.md |
| name | string | |
| code | string | IN HOA (`material-type.mapper.ts:25-28`) |
| description | string \| null | |

### MaterialResponseDto

`material.dto.ts:221-270`, map ở `material.mapper.ts:83-134`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug, createdAt, updatedAt | string | Xem conventions.md |
| code | string | IN HOA |
| name | string | |
| minimumInventory | number (≥ 0, tối đa 6 chữ số thập phân) | Ngưỡng mặc định áp cho mọi kho. Cột `DECIMAL(18,6)`, server trả về `number` (`material.entity.ts:66-86`) |
| maximumInventory | number (≥ 0, tối đa 6 chữ số thập phân) | Như trên |
| type | [MaterialTypeResponseDto](#materialtyperesponsedto) | Luôn có (`material.mapper.ts:90-95`) |
| baseUnit | [UnitResponseDto](unit.md#unitresponsedto) \| null | Không có `materialCount`. `null` với vật tư cũ chưa có đơn vị cơ sở (`material.mapper.ts:96-99`) |
| hasSupplier | boolean | `suppliers.length > 0` (`material.mapper.ts:102-105`) |
| suppliers | [SupplierResponseDto](supplier.md#supplierresponsedto)[] | `[]` nếu chưa gắn. Chỉ có nhà cung cấp chưa xoá mềm |
| warehouses | [MaterialWarehouseResponseDto](#materialwarehouseresponsedto)[] | Sắp theo `code` kho tăng dần. Bỏ qua kho đã xoá mềm (`material.mapper.ts:113-120`, `material.service.ts:220-224`) |
| units | [MaterialConversionUnitResponseDto](#materialconversionunitresponsedto)[] | Đơn vị cơ sở đứng đầu (`isBaseUnit: true`), các đơn vị còn lại sắp theo `unit.code` tăng dần. Bỏ qua unit đã xoá mềm (`material.mapper.ts:123-134`). `[]` khi chưa có đơn vị nào |

### MaterialWarehouseResponseDto

`material.dto.ts:181-196`, map ở `material.mapper.ts:138-162`. Mỗi phần tử là một dòng tồn (`inventory_tbl`) của vật tư trong một kho.

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug | string | Slug **của kho** |
| code | string | Mã kho |
| name | string | Tên kho |
| quantity | number | Tồn trong kho này, tính theo đơn vị cơ sở |
| availableQuantity | number | `quantity - reservedQuantity`, làm tròn 6 chữ số thập phân |

### MaterialConversionUnitResponseDto

`material.dto.ts:198-219`, map ở `material.mapper.ts:166-186`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| unitSlug | string | |
| unitCode | string | |
| unitName | string | |
| unit | [UnitResponseDto](unit.md#unitresponsedto) | Không có `materialCount` |
| conversionRate | number (> 0, tối đa 6 chữ số thập phân) | Số đơn vị cơ sở trong **1** đơn vị này (ví dụ 1 BAO = 50 KG thì rate = 50). Dòng của đơn vị cơ sở luôn là `1` |
| isBaseUnit | boolean | `true` nếu đây là đơn vị cơ sở của vật tư |

---

## Loại vật tư (Material Type)

## POST /api/v1/material-types

- **Quyền:** `MATERIAL_CREATE` (`material-type.controller.ts:34`).
- **Body** (`CreateMaterialTypeRequestDto`, `material-type.dto.ts:10-29`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| name | string | có | khác rỗng sau khi trim | Unique trong các loại vật tư chưa xoá |
| code | string | có | `BUSINESS_CODE_REGEX` = `^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$` (2-32 ký tự chữ/số/`-`, không bắt đầu hoặc kết thúc bằng `-`) (`code.util.ts:9`) | Server trim rồi chuyển sang IN HOA |
| description | string | không | — | Được trim |

- **Response 201:** `result` là [MaterialTypeResponseDto](#materialtyperesponsedto).
- **Lỗi riêng** (`material-type.service.ts:40-52`):

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100602 `MATERIAL_TYPE_NAME_IS_REQUIRED` | Thiếu `name` hoặc `name` rỗng |
| 400 | 100604 `MATERIAL_TYPE_CODE_IS_REQUIRED` | Thiếu `code` hoặc `code` rỗng |
| 400 | 100605 `MATERIAL_TYPE_CODE_INVALID` | `code` sai định dạng |
| 422 | 100606 `MATERIAL_TYPE_CODE_DOES_EXIST` | `code` đã được dùng |
| 422 | 100607 `MATERIAL_TYPE_CODE_RESERVED_BY_DELETED` | Một loại vật tư đã xoá mềm vẫn giữ `code` này |
| 422 | 100603 `MATERIAL_TYPE_NAME_DOES_EXIST` | `name` đã được dùng (chỉ xét bản ghi chưa xoá) |

## GET /api/v1/material-types

- **Quyền:** `MATERIAL_READ` (`material-type.controller.ts:56`).
- **Query** (`GetAllMaterialTypeRequestDto`, `material-type.dto.ts:45-68`, kế thừa `BaseQueryDto`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| page, size | number | không | xem conventions.md | |
| code | string | không | — | So khớp chính xác, server chuyển sang IN HOA |
| name | string | không | — | Chứa chuỗi con (`LIKE %x%`) |
| startDate, endDate | string (`YYYY-MM-DD` hoặc ISO-8601) | không | xem conventions.md | Lọc theo `createdAt`, gồm cả hai đầu |
| sortBy | `'createdAt' \| 'name' \| 'code'` | không | mặc định `createdAt` | Sai giá trị trả `SORT_BY_INVALID` (chung) |
| sort | `'ASC' \| 'DESC'` | không | mặc định `DESC` | |

- **Response 200:** trang phân trang của `MaterialTypeResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100610 `MATERIAL_TYPE_DATE_RANGE_INVALID` | `startDate` sau `endDate` (`material-type.service.ts:57-59`) |

## GET /api/v1/material-types/:slug

- **Quyền:** `MATERIAL_READ` (`material-type.controller.ts:78`).
- **Response 200:** `MaterialTypeResponseDto`.
- **Lỗi riêng:** 404 `100601 MATERIAL_TYPE_NOT_FOUND` khi không thấy slug hoặc bản ghi đã xoá mềm.

## PATCH /api/v1/material-types/:slug

- **Quyền:** `MATERIAL_UPDATE` (`material-type.controller.ts:98`).
- **Body:** `PartialType(CreateMaterialTypeRequestDto)` (`material-type.dto.ts:36`). Mọi field đều không bắt buộc; field có gửi vẫn được validate như POST. Field không gửi, hoặc gửi `null`, được giữ nguyên (`material-type.service.ts:110`).
- **Response 200:** `MaterialTypeResponseDto`.
- **Lỗi riêng:** 404 `100601`; 400 `100602`/`100604`/`100605`; 422 `100606`/`100607` khi đổi sang `code` đã bị dùng; 422 `100603` khi đổi sang `name` đã bị dùng (`material-type.service.ts:97-120`).

## DELETE /api/v1/material-types/:slug

- **Quyền:** `MATERIAL_DELETE` (`material-type.controller.ts:122`).
- **Response 200:** `result` là chuỗi `"1 material type have been deleted successfully"`. Đây là xoá mềm.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100601 `MATERIAL_TYPE_NOT_FOUND` | Không thấy slug |
| 422 | 100609 `MATERIAL_TYPE_IN_USE` | Còn vật tư chưa xoá thuộc loại này (`material-type.service.ts:128-130`) |

---

## Vật tư (Material)

## POST /api/v1/materials

- **Quyền:** `MATERIAL_CREATE` (`material.controller.ts:43`).
- **Body** (`CreateMaterialRequestDto`, `material.dto.ts:33-89`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| code | string | có | `BUSINESS_CODE_REGEX` (2-32 ký tự, như loại vật tư) | Server trim rồi chuyển sang IN HOA. Unique tính cả bản ghi đã xoá mềm |
| name | string | có | khác rỗng | **Không** unique |
| typeSlug | string (slug) | có | khác rỗng | Slug của loại vật tư |
| baseUnitSlug | string (slug) | có | khác rỗng, không được `null` | Slug của unit làm đơn vị cơ sở |
| minimumInventory | number | không | ≥ 0, tối đa 6 chữ số thập phân, không nhận số dạng mũ (`decimal.validator.ts`) | Mặc định `0` |
| maximumInventory | number | không | ≥ 0, tối đa 6 chữ số thập phân | Mặc định `0`. Phải ≥ `minimumInventory` |

Body **không** nhận nhà cung cấp hay đơn vị quy đổi; hai thứ này có route riêng ở dưới.

- **Response 201:** [MaterialResponseDto](#materialresponsedto). Lúc này `warehouses: []`, `suppliers: []`, `hasSupplier: false`, và `units` có đúng 1 dòng là đơn vị cơ sở (`conversionRate: 1`, `isBaseUnit: true`) (`material.service.ts:102-160`).
- **Lỗi riêng** (thứ tự kiểm tra: validate DTO → trùng code → khoảng ngưỡng → loại vật tư → unit, theo `material.service.ts:126-139`):

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100703 `MATERIAL_CODE_IS_REQUIRED` | Thiếu `code` hoặc `code` rỗng |
| 400 | 100704 `MATERIAL_CODE_INVALID` | `code` sai định dạng |
| 400 | 100702 `MATERIAL_NAME_IS_REQUIRED` | Thiếu `name` hoặc `name` rỗng |
| 400 | 100707 `MATERIAL_TYPE_SLUG_IS_REQUIRED` | Thiếu `typeSlug` hoặc `typeSlug` rỗng |
| 422 | 100724 `MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED` | Thiếu `baseUnitSlug`, rỗng, hoặc `null` (lưu ý: mã này là **422**, không phải 400) |
| 400 | 100708 `MATERIAL_MINIMUM_INVENTORY_INVALID` | Âm, quá 6 chữ số thập phân, không phải số, hoặc số dạng mũ |
| 400 | 100709 `MATERIAL_MAXIMUM_INVENTORY_INVALID` | Như trên |
| 422 | 100705 `MATERIAL_CODE_DOES_EXIST` | `code` đã được dùng |
| 422 | 100706 `MATERIAL_CODE_RESERVED_BY_DELETED` | Một vật tư đã xoá mềm vẫn giữ `code` này |
| 422 | 100710 `MATERIAL_INVENTORY_RANGE_INVALID` | `maximumInventory < minimumInventory` |
| 404 | 100601 `MATERIAL_TYPE_NOT_FOUND` | `typeSlug` không tồn tại |
| 404 | 100901 `UNIT_NOT_FOUND` | `baseUnitSlug` không tồn tại |

## GET /api/v1/materials

- **Quyền:** `MATERIAL_READ` (`material.controller.ts:65`).
- **Query** (`GetAllMaterialRequestDto`, `material.dto.ts:125-178`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| page, size | number | không | xem conventions.md | |
| typeSlug | string | không | — | Lọc theo loại vật tư. Slug sai trả danh sách rỗng, không báo 404 |
| code | string | không | Sau khi chuyển IN HOA phải khớp `^[A-Z0-9_-]+$` | So khớp **tiền tố** (`LIKE 'x%'`) |
| name | string | không | Chỉ chữ cái (có tiếng Việt), chữ số, khoảng trắng: `^[\p{L}\p{M}\p{N}\s]+$` | So khớp **tiền tố** (`LIKE 'x%'`) |
| hasSupplier | `'true' \| 'false'` | không | Giá trị khác trả `MATERIAL_HAS_SUPPLIER_INVALID` | `true`: có ít nhất 1 nhà cung cấp chưa xoá. `false`: không có nhà cung cấp nào |
| supplierSlug | string | không | — | Vật tư gắn với nhà cung cấp này. **Được ưu tiên hơn `hasSupplier`**: gửi cả hai thì `hasSupplier` bị bỏ qua (`material.service.ts:181-188`) |
| warehouseSlug | string | không | — | Chỉ lấy vật tư đang được gán vào kho này. Kho không tồn tại thì trả rỗng. **Không** kiểm tra warehouse scope |
| startDate, endDate | string | không | xem conventions.md | Lọc theo `createdAt` |
| sortBy | `'createdAt' \| 'name' \| 'code'` | không | mặc định `createdAt` | |
| sort | `'ASC' \| 'DESC'` | không | mặc định `DESC` | |

- **Response 200:** trang phân trang của [MaterialResponseDto](#materialresponsedto). Mỗi item có đủ `warehouses`, `units`, `suppliers`. Danh sách `warehouses` **không** bị lọc theo `warehouseSlug`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100732 `MATERIAL_CODE_SEARCH_INVALID` | `code` chứa ký tự ngoài `A-Z 0-9 _ -` |
| 400 | 100731 `MATERIAL_NAME_SEARCH_INVALID` | `name` chứa ký tự đặc biệt |
| 422 | 100725 `MATERIAL_HAS_SUPPLIER_INVALID` | `hasSupplier` khác `true`/`false` |
| 400 | 100729 `MATERIAL_DATE_RANGE_INVALID` | `startDate` sau `endDate` |

## GET /api/v1/materials/:slug

- **Quyền:** `MATERIAL_READ` (`material.controller.ts:89`).
- **Response 200:** [MaterialResponseDto](#materialresponsedto).
- **Lỗi riêng:** 404 `100701 MATERIAL_NOT_FOUND`.

## PATCH /api/v1/materials/:slug

- **Quyền:** `MATERIAL_UPDATE` (`material.controller.ts:283`).
- **Body** (`UpdateMaterialRequestDto`, `material.dto.ts:96-116`): cùng field với POST, tất cả đều không bắt buộc. Field không gửi, hoặc gửi `null`, được giữ nguyên. **Không** reset ngưỡng tồn về 0 khi không gửi.
  - `typeSlug`: có gửi thì đổi loại vật tư.
  - `baseUnitSlug`: có gửi thì đổi đơn vị cơ sở, nhưng chỉ khi vật tư còn "sạch" (`material.service.ts:367-381`): chưa có tồn `> 0` ở bất kỳ kho nào, **và** chưa gắn đơn vị nào ngoài chính đơn vị cơ sở. Gửi lại đúng đơn vị cơ sở hiện tại thì không có gì thay đổi. Không có cách gỡ đơn vị cơ sở về `null`.
  - Server kiểm tra ngưỡng trên giá trị **sau khi gộp**: chỉ gửi `minimumInventory` thì vẫn so với `maximumInventory` đang lưu trong DB.
- **Response 200:** [MaterialResponseDto](#materialresponsedto).
- **Lỗi riêng** (`material.service.ts:250-317`):

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100701 `MATERIAL_NOT_FOUND` | Không thấy slug |
| 400/422 | các mã validate như POST | Field có gửi nhưng sai (`baseUnitSlug: ""` trả 422 `100724`) |
| 422 | 100705 / 100706 | Đổi sang `code` đã bị dùng |
| 422 | 100710 `MATERIAL_INVENTORY_RANGE_INVALID` | Sau khi gộp, max < min |
| 404 | 100601 `MATERIAL_TYPE_NOT_FOUND` | `typeSlug` không tồn tại |
| 404 | 100901 `UNIT_NOT_FOUND` | `baseUnitSlug` không tồn tại |
| 422 | 100723 `MATERIAL_BASE_UNIT_LOCKED` | Đổi đơn vị cơ sở khi đã có tồn hoặc đã có đơn vị quy đổi |

## DELETE /api/v1/materials/:slug

- **Quyền:** `MATERIAL_DELETE` (`material.controller.ts:307`).
- **Response 200:** `result` là chuỗi `"1 material have been deleted successfully"`. Đây là xoá mềm.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100701 `MATERIAL_NOT_FOUND` | Không thấy slug |
| 422 | 100712 `MATERIAL_IN_USE` | Vật tư còn được gán vào ít nhất 1 kho, kể cả khi tồn bằng 0 (`material.service.ts:388-391`) |

## PUT /api/v1/materials/:slug/suppliers

- **Quyền:** `MATERIAL_UPDATE` + `SUPPLIER_UPDATE` (`material.controller.ts:253`).
- **Body** (`AssignMaterialSuppliersRequestDto`, `material.dto.ts:280-296`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| supplierSlugs | string[] | có | Mảng có 0-50 phần tử; mỗi phần tử là chuỗi khác rỗng | Server trim từng phần tử và bỏ trùng lặp. `[]` nghĩa là gỡ hết nhà cung cấp |

Đây là PUT đúng nghĩa: **thay toàn bộ** danh sách nhà cung cấp. Nhà cung cấp không có trong mảng sẽ bị gỡ. Thao tác là tất cả hoặc không: chỉ một slug không tồn tại hoặc đã xoá mềm là cả request bị từ chối, không ghi gì (`material.service.ts:324-360`).

- **Response 200:** [MaterialResponseDto](#materialresponsedto). Trong response này `suppliers` được sắp theo `code` tăng dần.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 100726 `MATERIAL_SUPPLIER_SLUGS_INVALID` | Không phải mảng, quá 50 phần tử, hoặc có phần tử rỗng hay không phải chuỗi |
| 404 | 100701 `MATERIAL_NOT_FOUND` | Không thấy vật tư |
| 404 | 101201 `SUPPLIER_NOT_FOUND` | Có ít nhất 1 slug nhà cung cấp không tồn tại |

---

## Đơn vị quy đổi của vật tư

Mô hình trong code: mỗi vật tư có một tập đơn vị lưu trong bảng join `material_unit_can_have_tbl` (`material-unit.entity.ts`). Đơn vị cơ sở **cũng là một dòng** trong tập này, với `conversionRate = 1`. Mọi tỉ lệ đều tính theo đơn vị cơ sở. Dòng trong bảng join được xoá cứng, không có xoá mềm hay `version`.

## GET /api/v1/materials/:slug/conversion-units

- **Quyền:** `MATERIAL_READ` + `UNIT_READ` (`material.controller.ts:110`).
- **Query** (`GetConversionUnitRequestDto`, `material.dto.ts:303-313`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| page, size | number | không | xem conventions.md | |
| code | string | không | — | Mã unit, so khớp chính xác, server chuyển sang IN HOA |
| name | string | không | — | Tên unit, chứa chuỗi con |
| sort, startDate, endDate | — | không | Vẫn được validate | **Server không dùng.** Thứ tự luôn là `unit.code ASC` (`material.service.ts:425-432`) |

- **Response 200:** trang phân trang của [MaterialConversionUnitResponseDto](#materialconversionunitresponsedto). Danh sách **có cả** dòng đơn vị cơ sở (`isBaseUnit: true`), nằm ở vị trí theo `unit.code` chứ không bị đưa lên đầu như trong `MaterialResponseDto.units`.
- **Lỗi riêng:** 404 `100701 MATERIAL_NOT_FOUND`.

## GET /api/v1/materials/:slug/conversion-units/available

- **Quyền:** `MATERIAL_READ` + `UNIT_READ` (`material.controller.ts:134`).
- **Query:** giống endpoint trên (`GetConversionUnitRequestDto`).
- **Response 200:** trang phân trang của [UnitResponseDto](unit.md#unitresponsedto) **có** `materialCount`. Danh sách gồm mọi unit chưa xoá, trừ những unit đã gắn với vật tư (kể cả đơn vị cơ sở). Thứ tự `createdAt DESC`, vì endpoint này dùng lại `UnitService.findAll` (`material.service.ts:452-466`).
- **Lỗi riêng:** 404 `100701 MATERIAL_NOT_FOUND`.

## POST /api/v1/materials/:slug/conversion-units

- **Quyền:** `MATERIAL_UPDATE` + `UNIT_UPDATE` (`material.controller.ts:156`).
- **Body** (`CreateMaterialConversionUnitRequestDto`, `material.dto.ts:321-342`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| unitSlug | string (slug) | có | khác rỗng | |
| conversionRate | number | có | > 0, tối đa 6 chữ số thập phân, không nhận số dạng mũ | Số đơn vị cơ sở trong 1 đơn vị này |

- **Response 201:** [MaterialConversionUnitResponseDto](#materialconversionunitresponsedto) với `isBaseUnit: false`.
- **Lỗi riêng** (`material.service.ts:468-506`):

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100715 `MATERIAL_UNIT_SLUG_IS_REQUIRED` | Thiếu `unitSlug` hoặc `unitSlug` rỗng |
| 400 | 100718 `MATERIAL_CONVERSION_RATE_INVALID` | Thiếu, ≤ 0, quá 6 chữ số thập phân, hoặc không phải số |
| 404 | 100701 `MATERIAL_NOT_FOUND` | Không thấy vật tư |
| 422 | 100714 `MATERIAL_BASE_UNIT_IS_REQUIRED` | Vật tư chưa có đơn vị cơ sở |
| 404 | 100901 `UNIT_NOT_FOUND` | `unitSlug` không tồn tại |
| 422 | 100716 `MATERIAL_CONVERSION_UNIT_DOES_EXIST` | Unit đã gắn với vật tư, kể cả khi đó là đơn vị cơ sở |

## PATCH /api/v1/materials/:slug/conversion-units/:unitSlug

- **Quyền:** `MATERIAL_UPDATE` + `UNIT_UPDATE` (`material.controller.ts:208`).
- **Path:** `slug` (vật tư), `unitSlug` (unit).
- **Body** (`UpdateMaterialConversionUnitRequestDto`, `material.dto.ts:349-351`): chỉ có `conversionRate?` (ràng buộc như POST). `unitSlug` gửi trong body bị loại bỏ. Gửi body `{}` là hợp lệ và không đổi gì.
- **Response 200:** [MaterialConversionUnitResponseDto](#materialconversionunitresponsedto) với `isBaseUnit: false`.
- **Lỗi riêng** (`material.service.ts:508-532`, `611-624`):

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100718 `MATERIAL_CONVERSION_RATE_INVALID` | `conversionRate` sai |
| 404 | 100701 `MATERIAL_NOT_FOUND` | Không thấy vật tư |
| 404 | 100901 `UNIT_NOT_FOUND` | Không thấy unit |
| 404 | 100717 `MATERIAL_CONVERSION_UNIT_NOT_FOUND` | Unit tồn tại nhưng chưa gắn với vật tư |
| 422 | 100721 `MATERIAL_BASE_UNIT_RATE_IS_FIXED` | `unitSlug` là đơn vị cơ sở. Lỗi này trả về kể cả khi body rỗng |

## DELETE /api/v1/materials/:slug/conversion-units/:unitSlug

- **Quyền:** `MATERIAL_UPDATE` + `UNIT_UPDATE` (`material.controller.ts:234`).
- **Response 200:** `result` là chuỗi `"1 conversion unit have been detached successfully"`. Đây là **xoá cứng** dòng trong bảng join.
- **Lỗi riêng:** 404 `100701` / `100901` / `100717` (như PATCH); 422 `100722 MATERIAL_BASE_UNIT_CANNOT_BE_DETACHED` khi `unitSlug` là đơn vị cơ sở (`material.service.ts:534-549`).

## POST /api/v1/materials/:slug/convert

Quy đổi số lượng giữa 2 đơn vị của cùng một vật tư. Endpoint dùng POST nhưng **không ghi dữ liệu**, nên chỉ cần quyền đọc.

- **Quyền:** `MATERIAL_READ` + `UNIT_READ` (`material.controller.ts:182`).
- **Body** (`ConvertMaterialQuantityRequestDto`, `material.dto.ts:356-376`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| quantity | number | có | ≥ 0, tối đa 6 chữ số thập phân | |
| fromUnitSlug | string (slug) | có | khác rỗng | Đơn vị cơ sở hoặc một đơn vị đã gắn |
| toUnitSlug | string (slug) | có | khác rỗng | Như trên |

- **Công thức** (`material.service.ts:556-584`): `quantityInBaseUnit = round6(quantity × rate(from))`, sau đó `toQuantity = round6(quantityInBaseUnit ÷ rate(to))`.
- **Response 200** (`MaterialConversionResultResponseDto`, `material.dto.ts:382-418`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| materialSlug | string | |
| fromUnitSlug, fromUnitCode | string | |
| fromQuantity | number | Bằng `quantity` client gửi lên |
| fromConversionRate | number | |
| toUnitSlug, toUnitCode | string | |
| toQuantity | number | Làm tròn 6 chữ số thập phân |
| toConversionRate | number | |
| baseUnitSlug, baseUnitCode | string | |
| quantityInBaseUnit | number | Làm tròn 6 chữ số thập phân |

- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100720 `MATERIAL_CONVERT_QUANTITY_INVALID` | `quantity` âm, quá 6 chữ số thập phân, hoặc không phải số |
| 400 | 100715 `MATERIAL_UNIT_SLUG_IS_REQUIRED` | Thiếu `fromUnitSlug` hoặc `toUnitSlug` |
| 404 | 100701 `MATERIAL_NOT_FOUND` | |
| 422 | 100714 `MATERIAL_BASE_UNIT_IS_REQUIRED` | Vật tư chưa có đơn vị cơ sở |
| 404 | 100901 `UNIT_NOT_FOUND` | Slug unit không tồn tại |
| 404 | 100717 `MATERIAL_CONVERSION_UNIT_NOT_FOUND` | Unit tồn tại nhưng không thuộc vật tư |
| 400 | 100718 `MATERIAL_CONVERSION_RATE_INVALID` | Tỉ lệ lưu trong DB ≤ 0 hoặc không hợp lệ (dữ liệu bẩn, `material.service.ts:604-606`) |

---

## Lô hàng (Material Batch), chỉ đọc

Lô được tạo khi xác nhận phiếu nhập, được giữ chỗ hoặc trừ khi xử lý phiếu xuất. Không có API tạo, sửa hay xoá lô (`material-batch.controller.ts:19-22`).

**Warehouse scope** (`@WarehouseScope('warehouseSlug')`, `material-batch.controller.ts:27`; guard ở `src/warehouse/guard/warehouse-scope.guard.ts`): user phải là manager hoặc member của kho. `SUPER_ADMIN` và `ADMIN` được bỏ qua bước kiểm tra này. Guard có thể trả:

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Kho không tồn tại. Áp dụng cả với ADMIN/SUPER_ADMIN, vì service tự tra kho (`material-batch.service.ts:93`, `125`) |
| 403 | 100523 `WAREHOUSE_ACCESS_DENIED` | User không thuộc kho |

### MaterialBatchResponseDto

`material-batch.dto.ts:83-135`, map ở `material-batch.mapper.ts:21-73`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug, createdAt, updatedAt | string | Xem conventions.md |
| entryDate | string (`YYYY-MM-DD`) | Ngày nhập, bằng ngày của phiếu nhập |
| expiryDate | string (`YYYY-MM-DD`) \| null | `null` nghĩa là không có hạn dùng |
| quantity | number | Lượng nhập ban đầu, tính theo đơn vị cơ sở |
| remainingQuantity | number | Lượng còn lại, tính theo đơn vị cơ sở |
| reservedQuantity | number | Lượng đang được phiếu xuất `PENDING` giữ chỗ |
| availableQuantity | number | `remainingQuantity - reservedQuantity`, làm tròn 6 chữ số thập phân |
| status | `0 \| 1` | `0` = hết hàng, `1` = còn hàng (`material-batch.constants.ts:5-8`). Luôn khớp với `remainingQuantity > 0` |
| materialSlug, materialCode, materialName | string | |
| material | object | `{ slug, code, name, type: MaterialTypeResponseDto \| null, baseUnit: UnitResponseDto \| null }` (`material-batch.dto.ts:62-81`). `baseUnit` là đơn vị của mọi số lượng trong lô |
| warehouseSlug | string | |
| importFormSlug | string \| null | Slug phiếu nhập đã tạo ra lô |
| importFormCode | string \| null | Mã phiếu nhập |

## GET /api/v1/warehouses/:warehouseSlug/material-batches

- **Quyền:** `MATERIAL_READ` + `WAREHOUSE_READ`, cộng warehouse scope (`material-batch.controller.ts:32`).
- **Query** (`GetAllMaterialBatchRequestDto`, `material-batch.dto.ts:20-59`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| page, size | number | không | xem conventions.md | |
| materialSlug | string | không | — | So khớp chính xác |
| status | `0 \| 1` | không | Giá trị khác trả `MATERIAL_BATCH_STATUS_INVALID` | |
| expiryBefore | string (`YYYY-MM-DD`) | không | ISO-8601 strict và đúng mẫu `^\d{4}-\d{2}-\d{2}$` | Lấy lô có `expiryDate` **trước hẳn** ngày này. Lô không có hạn dùng bị loại |
| sortBy | `'createdAt' \| 'expiryDate' \| 'entryDate'` | không | mặc định `createdAt` | |
| sort | `'ASC' \| 'DESC'` | không | mặc định `DESC` | Thêm `id ASC` để thứ tự ổn định |
| startDate, endDate | — | không | Vẫn được validate | **Server không dùng** (`material-batch.service.ts:88-117`) |

- **Response 200:** trang phân trang của [MaterialBatchResponseDto](#materialbatchresponsedto).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 101503 `MATERIAL_BATCH_STATUS_INVALID` | `status` khác 0/1 |
| 400 | 101504 `MATERIAL_BATCH_EXPIRY_BEFORE_INVALID` | `expiryBefore` sai định dạng |
| 404/403 | 100501 / 100523 | Xem phần warehouse scope ở trên |

## GET /api/v1/warehouses/:warehouseSlug/material-batches/:slug

- **Quyền:** như trên (`material-batch.controller.ts:55`).
- **Response 200:** [MaterialBatchResponseDto](#materialbatchresponsedto).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 101501 `MATERIAL_BATCH_NOT_FOUND` | Không có lô với slug này **trong kho này**, kể cả khi lô thuộc kho khác (`material-batch.service.ts:119-129`) |
| 404/403 | 100501 / 100523 | Xem phần warehouse scope |

---

## Mã lỗi của module

Không truyền HTTP status thì mặc định là 422 (`src/app/error-code.util.ts:15-21`).

### `src/material-type/material-type.validation.ts:29-61`

| Key | code | HTTP | message |
|---|---|---|---|
| MATERIAL_TYPE_NOT_FOUND | 100601 | 404 | Material type not found |
| MATERIAL_TYPE_NAME_IS_REQUIRED | 100602 | 400 | Material type name is required |
| MATERIAL_TYPE_NAME_DOES_EXIST | 100603 | 422 | Material type name does exist |
| MATERIAL_TYPE_CODE_IS_REQUIRED | 100604 | 400 | Material type code is required |
| MATERIAL_TYPE_CODE_INVALID | 100605 | 400 | Material type code must be 2-32 characters of letters, digits or hyphen (e.g. MT-01) |
| MATERIAL_TYPE_CODE_DOES_EXIST | 100606 | 422 | Material type code does exist |
| MATERIAL_TYPE_CODE_RESERVED_BY_DELETED | 100607 | 422 | Material type code is still held by a deleted material type |
| MATERIAL_TYPE_IN_USE | 100609 | 422 | Material type is still referenced by materials - move or delete them first |
| MATERIAL_TYPE_DATE_RANGE_INVALID | 100610 | 400 | startDate must not be after endDate |

### `src/material/material.validation.ts:63-174`

| Key | code | HTTP | message |
|---|---|---|---|
| MATERIAL_NOT_FOUND | 100701 | 404 | Material not found |
| MATERIAL_NAME_IS_REQUIRED | 100702 | 400 | Material name is required |
| MATERIAL_CODE_IS_REQUIRED | 100703 | 400 | Material code is required |
| MATERIAL_CODE_INVALID | 100704 | 400 | Material code must be 2-32 characters of letters, digits or hyphen (e.g. MAT-001) |
| MATERIAL_CODE_DOES_EXIST | 100705 | 422 | Material code does exist |
| MATERIAL_CODE_RESERVED_BY_DELETED | 100706 | 422 | Material code is still held by a deleted material |
| MATERIAL_TYPE_SLUG_IS_REQUIRED | 100707 | 400 | typeSlug is required |
| MATERIAL_MINIMUM_INVENTORY_INVALID | 100708 | 400 | minimumInventory must be an integer >= 0 |
| MATERIAL_MAXIMUM_INVENTORY_INVALID | 100709 | 400 | maximumInventory must be an integer >= 0 |
| MATERIAL_INVENTORY_RANGE_INVALID | 100710 | 422 | maximumInventory must be greater than or equal to minimumInventory |
| MATERIAL_IN_USE | 100712 | 422 | Material is still assigned to warehouses - remove it from them first |
| MATERIAL_BASE_UNIT_IS_REQUIRED | 100714 | 422 | Material must have a base unit before conversion units can be attached |
| MATERIAL_UNIT_SLUG_IS_REQUIRED | 100715 | 400 | unitSlug is required |
| MATERIAL_CONVERSION_UNIT_DOES_EXIST | 100716 | 422 | This unit is already a conversion unit of the material - use PATCH to change its rate |
| MATERIAL_CONVERSION_UNIT_NOT_FOUND | 100717 | 404 | This unit is not a conversion unit of the material |
| MATERIAL_CONVERSION_RATE_INVALID | 100718 | 400 | conversionRate must be a number greater than 0 (max 6 decimal places) |
| MATERIAL_CONVERT_QUANTITY_INVALID | 100720 | 400 | quantity to convert must be a number >= 0 (max 6 decimal places) |
| MATERIAL_BASE_UNIT_RATE_IS_FIXED | 100721 | 422 | Conversion rate of the base unit is always 1 and cannot be changed |
| MATERIAL_BASE_UNIT_CANNOT_BE_DETACHED | 100722 | 422 | Base unit cannot be detached - change the base unit of the material first |
| MATERIAL_BASE_UNIT_LOCKED | 100723 | 422 | Base unit can no longer be changed: the material already has stock or other conversion units |
| MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED | 100724 | 422 | baseUnitSlug is required |
| MATERIAL_HAS_SUPPLIER_INVALID | 100725 | 422 | hasSupplier must be true or false |
| MATERIAL_SUPPLIER_SLUGS_INVALID | 100726 | 422 | supplierSlugs must be an array of at most 50 non-empty strings |
| MATERIAL_DATE_RANGE_INVALID | 100729 | 400 | startDate must not be after endDate |
| MATERIAL_NAME_SEARCH_INVALID | 100731 | 400 | name may only contain letters, digits and spaces |
| MATERIAL_CODE_SEARCH_INVALID | 100732 | 400 | code may only contain letters, digits, "_" and "-" |

Các mã 100711, 100713, 100719, 100727, 100728, 100730 không được dùng. Theo comment trong code, 100713 và 100719 được cố ý bỏ trống.

### `src/material-batch/material-batch.validation.ts:20-46`

| Key | code | HTTP | message |
|---|---|---|---|
| MATERIAL_BATCH_NOT_FOUND | 101501 | 404 | Material batch not found |
| MATERIAL_BATCH_INSUFFICIENT | 101502 | 409 | Not enough available quantity (remaining - reserved) in the material batches |
| MATERIAL_BATCH_STATUS_INVALID | 101503 | 400 | Status must be 0 (out of stock) or 1 (in stock) |
| MATERIAL_BATCH_EXPIRY_BEFORE_INVALID | 101504 | 400 | expiryBefore must be a valid date in YYYY-MM-DD format |
| MATERIAL_BATCH_RESERVED_INVALID | 101505 | 409 | The reserved quantity of the material batch does not match the export form |

`101502` và `101505` không phát sinh từ route lô. Chúng được ném trong luồng phiếu xuất (`material-batch.service.ts:173-328`); xem contract của export-form.

## Ghi chú cho FE

- **Định danh:** mọi route dùng `slug`, response không bao giờ trả `id`.
- **Không có optimistic lock:** `MaterialType` và `Material` kế thừa `Base`, không có `version`. PATCH đồng thời thì request sau ghi đè.
- **Xoá mềm:** `code` của loại vật tư hay vật tư đã xoá vẫn bị giữ chỗ (`*_CODE_RESERVED_BY_DELETED`). Với `name` của loại vật tư, service chỉ kiểm tra trùng trong bản ghi chưa xoá, nhưng DB có UNIQUE index trên `name_column` (`src/migrations/1783728000015-create-material-tables.ts:28`). Trùng tên với một loại vật tư đã xoá mềm vì vậy có thể trả **500** (chưa xác minh bằng chạy thật).
- **Ngưỡng tồn:** khi tạo, nếu gửi `minimumInventory > 0` mà không gửi `maximumInventory` thì max mặc định là `0` và request bị chặn với `MATERIAL_INVENTORY_RANGE_INVALID`. `0` **không** có nghĩa là "không giới hạn". Ngưỡng là số thập phân (tối đa 6 chữ số), dù message của mã 100708/100709 ghi "integer".
- **`units` và `conversion-units`:** `MaterialResponseDto.units` đưa đơn vị cơ sở lên đầu. `GET .../conversion-units` thì sắp thuần theo `unit.code`. Cả hai đều có dòng đơn vị cơ sở.
- **Đổi đơn vị cơ sở** chỉ được làm khi vật tư chưa có tồn và chưa gắn đơn vị quy đổi. Đây là thao tác để sửa khai báo sai, không dùng để chuyển đổi nghiệp vụ.
- **Nhà cung cấp:** `PUT /materials/:slug/suppliers` thay toàn bộ danh sách. Muốn thêm hoặc gỡ từng phần cho nhiều vật tư thì dùng `PUT|DELETE /suppliers/:slug/materials` ([supplier.md](supplier.md)).
- **Thứ tự `suppliers`** trong GET (danh sách và chi tiết) không được sắp xếp tường minh (relation TypeORM). Chỉ response của PUT suppliers là sắp theo `code` (chưa xác minh thứ tự thực tế của GET).
- **Query không có tác dụng:** `GET .../conversion-units`, `.../available` và `GET .../material-batches` nhận `startDate`/`endDate` (vẫn trả 422 nếu sai định dạng) nhưng không áp dụng. Hai route conversion-units cũng bỏ qua `sort`.
- **Sắp lô theo `expiryDate`:** lô có `expiryDate = null` nằm ở đâu phụ thuộc cách MySQL sắp NULL (mặc định là đầu danh sách khi ASC). Chưa xác minh bằng chạy thật.
- **Lệch so với docs cũ:** `docs/plans/material.md` và `docs/specs/material.md` ghi phân quyền bằng `@HasRole` (ADMIN/MANAGER/SUPERVISOR), `VersionedBase`, và ngưỡng tồn kiểu `int`. Code hiện tại dùng authority `MATERIAL_*`, kế thừa `Base` (không có `version`), và ngưỡng là `DECIMAL(18,6)`. Các route `/warehouses/:warehouseSlug/materials` trong spec thuộc module inventory, không nằm trong file này.
- Nếu một request sai nhiều rule cùng lúc, server chỉ trả mã lỗi đầu tiên (xem conventions.md).
