# Plan: Module `TaxProfile` (tra cứu thông tin doanh nghiệp từ cơ quan thuế)

## Context

Module `store` (vừa xong, `docs/specs/store.md`) bắt buộc `legalName` + `taxCode` nhưng người dùng phải tự gõ tay tên pháp nhân và địa chỉ đăng ký — dễ sai chính tả, và sai thì hoá đơn sai. Feature này thêm **tra cứu mã số thuế** qua API công khai của VietQR (nguồn: Tổng cục Thuế) và **cache kết quả ở MySQL**, để màn hình tạo `Store` pre-fill được.

Spec: `docs/specs/tax-profile.md`.

## Quyết định đã chốt với user (không tự đổi)

| Điểm | Quyết định |
|---|---|
| Quan hệ với `Store` | **Standalone**, khoá tự nhiên `taxCode` UNIQUE, **không FK** |
| Thời điểm gọi upstream | **Chỉ qua endpoint tường minh** — `Store` create/update KHÔNG gọi bên thứ ba |
| Cache | **Cache-first + refresh tường minh** (không TTL, không job nền) |
| Mã chi nhánh `-001` | **Chặn trước khi gọi upstream**, mã lỗi riêng |
| Base class | `Base` (KHÔNG `VersionedBase` — cache một chiều, không có form-edit) |
| Phân quyền | `@HasRole`, không cần migration seed `Authority` |

## Đã khảo sát (đọc/chạy thật, không suy đoán)

- **Hợp đồng upstream đã kiểm chứng bằng `curl` thật** (4 mã: `0101245486`, `0100109106`, `0000000000`, `abc`, `0101245486-001`):
  - Luôn **HTTP 200**, kể cả lỗi → bắt lỗi bằng HTTP status là **sai**, phải đọc field `code` trong body.
  - `code`: `00` OK, `51` không tồn tại, `52` sai định dạng.
  - `internationalName`/`shortName` **có thật sự trả `null`** (`0100109106`) → phải nullable.
  - Mã chi nhánh `0101245486-001` → `code: 51`.
  - **Không cần API key.**
- `@nestjs/axios@^4.0.1` + `axios@^1.18.1` **đã có trong `package.json`**; `HttpModule` đã được dùng ở `src/health/health.module.ts` → import `HttpModule` vào `TaxProfileModule`, không cần cài thêm gì.
- **Dải mã lỗi `1011xx` chưa ai dùng** (`store` vừa lấy `1010xx`). Guard chống trùng ở `src/app/app.validation.ts` sẽ chặn lúc boot nếu sai.
- Migration mới nhất là `1783728000016` (create-store-table) → file mới dùng **`1783728000017`**.
- **`typeorm:g` KHÔNG dùng được trên repo này** → viết tay SQL, mẫu `1783728000016-create-store-table.ts`.
- Base URL đọc qua `configService.get('VIETQR_BUSINESS_API_URL')` **có fallback hằng số** — cố ý **không** thêm vào `env.validation.ts`: thêm biến bắt buộc sẽ làm crash bootstrap với mọi `.env` đang tồn tại (xem "Nợ kỹ thuật" trong `CLAUDE.md`).

## Các bước implement

### 1. `src/tax-profile/tax-profile.constants.ts`

```ts
export const VIETQR_BUSINESS_API_URL = 'https://api.vietqr.io/v2/business';
export const VIETQR_TIMEOUT_MS = 10_000;
export const VIETQR_CODE_SUCCESS = '00';
export const VIETQR_CODE_TAX_NOT_FOUND = '51';
export const VIETQR_CODE_TAX_INVALID = '52';
export const TAX_PROFILE_TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/;  // nhận cả mã chi nhánh...
export const TAX_PROFILE_BRANCH_SUFFIX_REGEX = /-\d{3}$/;        // ...để trả lỗi riêng, rõ nguyên nhân
```

### 2. `src/tax-profile/tax-profile.entity.ts` — `@Entity('tax_profile_tbl')`, `extends Base`

7 cột: `tax_code_column` (UNIQUE), `name_column`, `international_name_column` (NULL), `short_name_column` (NULL), `address_column` (NULL), `status_column` (NULL), `source_updated_at_column` (DATETIME NULL). Mỗi field `@AutoMap()`. Không quan hệ nào.

### 3. `src/tax-profile/tax-profile.validation.ts` — dải `1011xx`

`TAX_PROFILE_NOT_FOUND` (101101, 404), `*_TAX_CODE_IS_REQUIRED` (101102, 400), `*_TAX_CODE_INVALID` (101103, 400), `*_BRANCH_CODE_NOT_SUPPORTED` (101104, 400), `*_NOT_FOUND_UPSTREAM` (101105, 404), `*_REJECTED_UPSTREAM` (101106, 400), `*_LOOKUP_FAILED` (101107, **502 BAD_GATEWAY**).

### 4. `src/tax-profile/tax-profile.dto.ts`

- `LookupTaxProfileParamDto` — `taxCode` với `@Matches(TAX_PROFILE_TAX_CODE_REGEX)`, dùng cho cả 2 route có `:taxCode`.
- `GetAllTaxProfileRequestDto extends BaseQueryDto`.
- `TaxProfileResponseDto extends BaseResponseDto` (KHÔNG `VersionedResponseDto`) — 7 field `@AutoMap()`.
- `VietQrBusinessResponse` — interface (không phải class DTO) mô tả body upstream: `{ code, desc, data, metadata }`.

### 5. `src/tax-profile/tax-profile.service.ts`

- `findAll(query)` — phân trang cache, `createdAt DESC`.
- `lookup(taxCode)` — normalize → chặn mã chi nhánh → tra cache → **hit thì trả luôn** → miss thì `fetchFromUpstream` + upsert.
- `refresh(taxCode)` — normalize → chặn mã chi nhánh → **luôn** `fetchFromUpstream` + upsert.
- `private fetchFromUpstream(taxCode)` — `firstValueFrom(httpService.get(...))`, đọc `body.code`, map sang 3 mã lỗi; mọi lỗi mạng/timeout/`code` lạ → `TAX_PROFILE_LOOKUP_FAILED`. **Ném trước khi chạm DB** để upstream lỗi không phá cache đang có.
- `private upsert(taxCode, data, metadata)` — tìm theo `taxCode`, `Object.assign` nếu có, `create` nếu chưa; lưu `taxCode` theo **giá trị ta hỏi**, không theo `data.id`.

### 6. `src/tax-profile/tax-profile.controller.ts` — `@ApiTags('TaxProfile')`, `@Controller('tax-profiles')`

3 route. `@HasRole(Admin, Manager, Supervisor)` cho 2 GET, `@HasRole(Admin)` cho `POST :taxCode/refresh`.

### 7. `tax-profile.module.ts` (import `HttpModule`) + `tax-profile.exception.ts` + `tax-profile.mapper.ts`

Mapper chỉ cần `createMap(mapper, TaxProfile, TaxProfileResponseDto, extend(baseMapper(mapper)))` — **không** `versionedMapper()` (entity dùng `Base`).

### 8. Đăng ký (2 chỗ)

1. `src/app/app.module.ts` → `imports: [..., TaxProfileModule]`
2. `src/app/app.validation.ts` → `...TaxProfileValidation` + `TTaxProfileErrorCode` vào type intersection

### 9. Migration `src/migrations/1783728000017-create-tax-profile-table.ts` (viết tay)

`CREATE TABLE tax_profile_tbl` — `UNIQUE INDEX IDX_tax_profile_slug`, `UNIQUE INDEX IDX_tax_profile_tax_code`. Không FK. `down()` = `DROP TABLE`.

### 10. Test

`tax-profile.service.spec.ts` — mock `HttpService`, khoá các bất biến: HTTP 200 + `code:51` phải thành 404 (không phải success), cache hit **không** gọi upstream, `refresh` **luôn** gọi upstream, mã chi nhánh bị chặn **trước** khi gọi, upstream lỗi không ghi DB, upsert không tạo bản ghi thứ 2.
`tax-profile.controller.spec.ts` — wrap `AppResponseDto` + khoá metadata `@HasRole`.

## Verify (theo `docs/WORKFLOW.md` bước 7)

`npm run lint` → `npm run test` → migration (**hỏi user trước khi chạy**, theo `CLAUDE.md` gốc của repo).
