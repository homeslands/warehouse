# Đơn vị tính (Unit)

> Nguồn: `src/unit/unit.controller.ts`, `src/unit/unit.dto.ts`, `src/unit/unit.validation.ts`, `src/unit/unit.service.ts`, `src/unit/unit.mapper.ts`, `src/shared/utils/code.util.ts` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).
> Đối chiếu code tại `origin/main` 5555273.

Module này chỉ quản lý danh mục đơn vị. **Quy đổi đơn vị theo vật tư** (gắn đơn vị quy đổi, tỉ lệ, quy đổi số lượng) nằm ở module material, xem [material.md](material.md#đơn-vị-quy-đổi-của-vật-tư).

## Tóm tắt endpoint

| Method | Path | Quyền (authority) | Mô tả |
|---|---|---|---|
| POST | /api/v1/units | `UNIT_CREATE` | Tạo đơn vị |
| GET | /api/v1/units | `UNIT_READ` | Danh sách phân trang, kèm `materialCount` |
| GET | /api/v1/units/:slug | `UNIT_READ` | Chi tiết (không có `materialCount`) |
| PATCH | /api/v1/units/:slug | `UNIT_UPDATE` | Sửa một phần |
| DELETE | /api/v1/units/:slug | `UNIT_DELETE` | Xoá mềm, bị chặn nếu vật tư còn dùng |

Không route nào có `@WarehouseScope` hay `@Public` (`unit.controller.ts:27-127`).

## Kiểu dữ liệu dùng chung

### UnitResponseDto

`unit.dto.ts:74-92`, map ở `unit.mapper.ts:39` (`baseMapper`: không bao giờ trả `id`).

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug | string (slug) | Định danh public |
| createdAt | string | Định dạng: xem conventions.md |
| updatedAt | string | Định dạng: xem conventions.md |
| name | string | Đã trim |
| code | string | Đã trim và chuyển sang IN HOA (`unit.mapper.ts:21-24`) |
| description | string \| null | Cột nullable (`unit.entity.ts:17-18`) |
| materialCount | object | **Chỉ có ở `GET /units`** (`unit.service.ts:70-75`) và `GET /materials/:slug/conversion-units/available`. Không có ở POST/PATCH/GET chi tiết, và cũng không có trong unit lồng bên trong response của vật tư. |

`materialCount` (`unit.dto.ts:54-72`, `unit.service.ts:138-148`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| asBaseUnit | number (int ≥ 0) | Số vật tư dùng unit này làm **đơn vị cơ sở** |
| asConversionUnit | number (int ≥ 0) | Số vật tư có unit này trong bảng đơn vị của vật tư. Bảng này có cả dòng đơn vị cơ sở (rate = 1), nên vật tư đã đếm ở `asBaseUnit` cũng được đếm ở đây. |
| total | number (int ≥ 0) | Số vật tư **khác nhau** dùng unit theo ít nhất một trong hai cách trên (OR). Không bằng `asBaseUnit + asConversionUnit`. |

Chỉ đếm vật tư chưa xoá mềm (mặc định của TypeORM `count`).

## POST /api/v1/units

- **Quyền:** `UNIT_CREATE` (`unit.controller.ts:34`).
- **Body** (`CreateUnitRequestDto`, `unit.dto.ts:10-29`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| name | string | có | khác rỗng sau khi trim | Unique trong các unit chưa xoá |
| code | string | có | `UNIT_CODE_REGEX` = `^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])?$` (1-32 ký tự chữ/số/`-`, không bắt đầu hoặc kết thúc bằng `-`) (`code.util.ts:15`) | Server trim rồi chuyển sang IN HOA trước khi kiểm tra trùng và lưu |
| description | string | không | — | Được trim |

Field không khai báo trong DTO bị bỏ qua (`whitelist: true`).

- **Response 201:** `result` là [UnitResponseDto](#unitresponsedto), không có `materialCount`.
- **Lỗi riêng** (thứ tự kiểm tra ở `unit.service.ts:34-44`):

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100902 `UNIT_NAME_IS_REQUIRED` | Thiếu `name` hoặc `name` rỗng |
| 400 | 100904 `UNIT_CODE_IS_REQUIRED` | Thiếu `code` hoặc `code` rỗng |
| 400 | 100905 `UNIT_CODE_INVALID` | `code` sai định dạng |
| 422 | 100906 `UNIT_CODE_DOES_EXIST` | Một unit chưa xoá đã dùng `code` này |
| 422 | 100907 `UNIT_CODE_RESERVED_BY_DELETED` | Một unit **đã xoá mềm** vẫn giữ `code` này |
| 422 | 100903 `UNIT_NAME_DOES_EXIST` | Một unit chưa xoá đã dùng `name` này |

## GET /api/v1/units

- **Quyền:** `UNIT_READ` (`unit.controller.ts:56`).
- **Query** (`GetAllUnitRequestDto`, `unit.dto.ts:38-52`, kế thừa `BaseQueryDto`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| page | number (int ≥ 1) | không | mặc định 1 | Xem conventions.md |
| size | number (int 1-500) | không | mặc định 10 | Xem conventions.md |
| code | string | không | — | So khớp **chính xác**, server trim rồi chuyển sang IN HOA |
| name | string | không | — | Chứa chuỗi con (`LIKE %x%`), đã escape `%` và `_` (`unit.service.ts:58`) |
| sort, startDate, endDate | — | không | Vẫn được validate theo `BaseQueryDto` | **Server không dùng.** Thứ tự luôn là `createdAt DESC` (`unit.service.ts:61-66`) |

- **Response 200:** `result` là trang phân trang (xem conventions.md), `items` là `UnitResponseDto[]` **có** `materialCount`.
- **Lỗi riêng:** không có lỗi riêng ngoài lỗi query chung (`PAGE_INVALID`, `SIZE_INVALID`, `SORT_INVALID`, `START_DATE_INVALID`, `END_DATE_INVALID`) đã ghi ở conventions.md.

## GET /api/v1/units/:slug

- **Quyền:** `UNIT_READ` (`unit.controller.ts:73`).
- **Path:** `slug` (string, slug của unit).
- **Response 200:** `result` là [UnitResponseDto](#unitresponsedto), **không có** `materialCount` (`unit.service.ts:80-83`).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100901 `UNIT_NOT_FOUND` | Không có unit với slug này, hoặc unit đã xoá mềm |

## PATCH /api/v1/units/:slug

- **Quyền:** `UNIT_UPDATE` (`unit.controller.ts:93`).
- **Path:** `slug`.
- **Body** (`UpdateUnitRequestDto = PartialType(CreateUnitRequestDto)`, `unit.dto.ts:36`): cùng field và ràng buộc với POST, nhưng tất cả đều không bắt buộc. Field không gửi, hoặc gửi `null`, được giữ nguyên (`pickDefined`, `unit.service.ts:101`). Gửi body `{}` là hợp lệ.
- **Response 200:** `result` là [UnitResponseDto](#unitresponsedto), không có `materialCount`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100901 `UNIT_NOT_FOUND` | Không tìm thấy slug |
| 400 | 100902 / 100904 / 100905 | Field có gửi nhưng rỗng hoặc sai định dạng |
| 422 | 100906 `UNIT_CODE_DOES_EXIST` / 100907 `UNIT_CODE_RESERVED_BY_DELETED` | `code` mới (khác `code` hiện tại) đã bị dùng |
| 422 | 100903 `UNIT_NAME_DOES_EXIST` | `name` mới (khác `name` hiện tại) đã bị dùng |

## DELETE /api/v1/units/:slug

- **Quyền:** `UNIT_DELETE` (`unit.controller.ts:113`).
- **Path:** `slug`.
- **Response 200:** `result` là chuỗi `"1 unit have been deleted successfully"` (`unit.controller.ts:124`). Đây là **xoá mềm** (`softRemove`).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100901 `UNIT_NOT_FOUND` | Không tìm thấy slug |
| 422 | 100909 `UNIT_IN_USE` | Còn vật tư (chưa xoá) dùng unit này làm đơn vị cơ sở hoặc đơn vị quy đổi (`unit.service.ts:118-121`) |

## Mã lỗi của module

`src/unit/unit.validation.ts:27-43`. Không truyền HTTP status thì mặc định là 422 (`src/app/error-code.util.ts:15-21`).

| Key | code | HTTP | message |
|---|---|---|---|
| UNIT_NOT_FOUND | 100901 | 404 | Unit not found |
| UNIT_NAME_IS_REQUIRED | 100902 | 400 | Unit name is required |
| UNIT_NAME_DOES_EXIST | 100903 | 422 | Unit name does exist |
| UNIT_CODE_IS_REQUIRED | 100904 | 400 | Unit code is required |
| UNIT_CODE_INVALID | 100905 | 400 | Unit code must be 1-32 characters of letters, digits or hyphen (e.g. KG) |
| UNIT_CODE_DOES_EXIST | 100906 | 422 | Unit code does exist |
| UNIT_CODE_RESERVED_BY_DELETED | 100907 | 422 | Unit code is still held by a deleted unit |
| UNIT_IN_USE | 100909 | 422 | Unit is still referenced by materials - detach them first |

Mã 100908 không được dùng.

## Ghi chú cho FE

- **Xoá mềm và `code`:** `code` của unit đã xoá vẫn bị giữ chỗ (`UNIT_CODE_RESERVED_BY_DELETED`). Hiện không có API khôi phục hay xoá hẳn.
- **Xoá mềm và `name`:** server chỉ kiểm tra trùng `name` trong các unit **chưa xoá** (`unit.service.ts:169-172`). Tuy vậy DB có UNIQUE index trên `name_column` (`src/migrations/1783728000019-create-unit-tables.ts:28`). Vì vậy tạo hoặc đổi tên trùng với một unit đã xoá mềm có thể trả **500** thay vì mã nghiệp vụ (chưa xác minh bằng chạy thật).
- **`materialCount`** chỉ có trong response danh sách. Muốn biết một unit có đang được dùng không thì lấy từ danh sách, hoặc gọi DELETE và xử lý `UNIT_IN_USE`.
- **Không có optimistic lock:** entity kế thừa `Base`, không có `version`. Hai người cùng PATCH thì người sau ghi đè.
- **Xoá trắng `description`:** gửi `""` sẽ lưu chuỗi rỗng. Gửi `null` thì giữ nguyên giá trị cũ.
- **Lệch giữa query và hành vi:** `GET /units` nhận `sort`/`startDate`/`endDate` (vẫn trả 422 nếu sai định dạng) nhưng không áp dụng chúng.
- Nếu một request sai nhiều rule cùng lúc, server chỉ trả mã lỗi đầu tiên (xem conventions.md). Thứ tự giữa các rule trên cùng một field chưa xác minh bằng chạy thật.
