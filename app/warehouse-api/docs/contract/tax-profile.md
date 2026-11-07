# Hồ sơ mã số thuế (Tax Profile)

> Nguồn: `src/tax-profile/tax-profile.controller.ts`, `src/tax-profile/tax-profile.dto.ts`, `src/tax-profile/tax-profile.validation.ts`, `src/tax-profile/tax-profile.service.ts`, `src/tax-profile/tax-profile.constants.ts`, `src/tax-profile/tax-profile.mapper.ts` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).
> Đối chiếu code tại `origin/main` 5555273.

Module này là bộ nhớ đệm (cache) thông tin doanh nghiệp theo mã số thuế. Dữ liệu lấy từ bên thứ ba (`https://api.vietqr.io/v2/business`, `tax-profile.constants.ts:6`). FE không tạo, sửa hay xoá hồ sơ trực tiếp.

## Tóm tắt endpoint

| Method | Path | Quyền (authority) | Mô tả |
|---|---|---|---|
| GET | /api/v1/tax-profiles | `TAX_PROFILE_READ` | Danh sách hồ sơ đã cache, có phân trang |
| GET | /api/v1/tax-profiles/:taxCode | `TAX_PROFILE_READ` | Tra hồ sơ: đọc cache trước, cache chưa có thì gọi upstream rồi **lưu vào DB** |
| POST | /api/v1/tax-profiles/:taxCode/refresh | `TAX_PROFILE_UPDATE` | Luôn gọi upstream và ghi đè cache |

Không route nào có `@WarehouseScope` hay `@Public` (`tax-profile.controller.ts:23-99`).

## Kiểu dữ liệu dùng chung

### TaxProfileResponseDto

Khai báo ở `tax-profile.dto.ts:27-62`, map ở `tax-profile.mapper.ts:18` (`baseMapper`, không trả `id`).

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug | string (slug) | |
| createdAt, updatedAt | string | Định dạng: xem conventions.md |
| taxCode | string | Mã số thuế 10 chữ số, là giá trị client đã hỏi (sau khi trim) |
| name | string | Tên doanh nghiệp |
| internationalName | string \| null | |
| shortName | string \| null | |
| address | string \| null | |
| status | string \| null | Trạng thái người nộp thuế, giữ **nguyên văn tiếng Việt** từ upstream |
| sourceUpdatedAt | string (ISO-8601) \| null | Thời điểm **phía cơ quan thuế** cập nhật dữ liệu, không phải lúc hệ thống này đồng bộ. Là `null` nếu upstream không trả hoặc trả giá trị không parse được (`tax-profile.service.ts:153-157`). Trong DTO field này có kiểu `Date` và được serialize thành JSON (chưa xác minh định dạng bằng chạy thật) |

### Tham số đường dẫn `:taxCode`

Dùng chung cho 2 route có `:taxCode` (`LookupTaxProfileParamDto`, `tax-profile.dto.ts:14-23`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| taxCode | string | có | `^\d{10}(-\d{3})?$` (`tax-profile.constants.ts:20`) | Có trim. DTO **chấp nhận** hậu tố chi nhánh `-xxx`, nhưng service sau đó từ chối với `TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED` (`tax-profile.service.ts:74-83`) |

## GET /api/v1/tax-profiles

- **Quyền:** `TAX_PROFILE_READ` (`tax-profile.controller.ts:30`).
- **Query** (`GetAllTaxProfileRequestDto`, `tax-profile.dto.ts:25`, kế thừa `BaseQueryDto` và không thêm field nào):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| page, size | number | không | xem conventions.md | |
| sort, startDate, endDate | — | không | Vẫn được validate | **Server không dùng.** Thứ tự luôn là `createdAt DESC` (`tax-profile.service.ts:40-54`) |

Endpoint không có bộ lọc theo mã số thuế hay tên.

- **Response 200:** trang phân trang của [TaxProfileResponseDto](#taxprofileresponsedto).
- **Lỗi riêng:** không có, chỉ có lỗi query chung (xem conventions.md).

## GET /api/v1/tax-profiles/:taxCode

- **Quyền:** `TAX_PROFILE_READ` (`tax-profile.controller.ts:48`).
- **Hành vi** (`tax-profile.service.ts:60-67`, `85-151`):
  1. Kiểm tra định dạng `taxCode`, rồi chặn mã có hậu tố chi nhánh.
  2. Cache **đã có** mã này: trả luôn, không gọi upstream, không có TTL.
  3. Cache **chưa có**: gọi upstream (timeout 10 giây, `tax-profile.constants.ts:8`). Thành công thì lưu hoặc ghi đè bản ghi theo `taxCode` rồi trả về. Nghĩa là route GET này **có thể ghi DB**.
- **Response 200:** [TaxProfileResponseDto](#taxprofileresponsedto).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 101102 `TAX_PROFILE_TAX_CODE_IS_REQUIRED` | `taxCode` rỗng sau khi trim, ví dụ chỉ có khoảng trắng |
| 400 | 101103 `TAX_PROFILE_TAX_CODE_INVALID` | Sai định dạng (không đủ 10 chữ số, có chữ cái...) |
| 400 | 101104 `TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED` | Có hậu tố chi nhánh, ví dụ `0101234567-001` |
| 404 | 101105 `TAX_PROFILE_NOT_FOUND_UPSTREAM` | Upstream báo mã không tồn tại (`code: "51"`) |
| 400 | 101106 `TAX_PROFILE_REJECTED_UPSTREAM` | Upstream báo mã sai định dạng (`code: "52"`) |
| 502 | 101107 `TAX_PROFILE_LOOKUP_FAILED` | Lỗi mạng, timeout, upstream lỗi 5xx, `code` lạ, hoặc `code: "00"` nhưng không có `data` (`tax-profile.service.ts:98-128`) |

## POST /api/v1/tax-profiles/:taxCode/refresh

- **Quyền:** `TAX_PROFILE_UPDATE` (`tax-profile.controller.ts:76`).
- **Body:** không có.
- **Hành vi:** bỏ qua cache, luôn gọi upstream rồi ghi đè hoặc tạo bản ghi (`tax-profile.service.ts:70-72`). Nếu upstream lỗi, server báo lỗi **trước khi** chạm DB, nên cache cũ vẫn giữ nguyên.
- **Response 200** (không phải 201): [TaxProfileResponseDto](#taxprofileresponsedto).
- **Lỗi riêng:** giống `GET /tax-profiles/:taxCode` (101102, 101103, 101104, 101105, 101106, 101107).

## Mã lỗi của module

`src/tax-profile/tax-profile.validation.ts:25-61`.

| Key | code | HTTP | message |
|---|---|---|---|
| TAX_PROFILE_NOT_FOUND | 101101 | 404 | Tax profile not found in the local cache |
| TAX_PROFILE_TAX_CODE_IS_REQUIRED | 101102 | 400 | Tax code is required |
| TAX_PROFILE_TAX_CODE_INVALID | 101103 | 400 | Tax code must be 10 digits with an optional 3-digit branch suffix (e.g. 0101234567-001) |
| TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED | 101104 | 400 | Branch tax codes (e.g. 0101234567-001) are not served by the tax lookup provider, use the 10-digit parent code |
| TAX_PROFILE_NOT_FOUND_UPSTREAM | 101105 | 404 | Tax code does not exist in the tax authority registry |
| TAX_PROFILE_REJECTED_UPSTREAM | 101106 | 400 | Tax code was rejected as malformed by the tax lookup provider |
| TAX_PROFILE_LOOKUP_FAILED | 101107 | 502 | Tax lookup provider is unavailable, please try again later |

`TAX_PROFILE_NOT_FOUND` (101101) có khai báo nhưng service hiện **không ném** mã này: cache chưa có thì service gọi upstream thay vì trả 404.

## Ghi chú cho FE

- **Định danh trên URL là `taxCode`**, không phải `slug`. `slug` vẫn có trong response nhưng không có route nào nhận nó.
- **GET có thể chậm** (tối đa khoảng 10 giây khi cache chưa có) và có thể trả **502**. Nên có trạng thái loading và cho phép thử lại.
- **Dữ liệu có thể cũ:** cache không có TTL. Muốn lấy dữ liệu mới thì gọi `POST .../refresh`, cần `TAX_PROFILE_UPDATE`.
- **Mã chi nhánh** (`-xxx`) bị từ chối với 400 `101104`. Hãy tra theo mã 10 số của công ty mẹ.
- **`status`** là chuỗi tiếng Việt nguyên văn từ cơ quan thuế, không phải enum. Không dùng làm khoá để so sánh logic.
- **POST refresh trả 200**, không phải 201.
- Các trường hợp upstream trả `data.name` rỗng chưa được xác minh. Cột `name_column` là NOT NULL (`tax-profile.entity.ts:21`), nên khi đó có thể ra lỗi 500.
