# Spec: TaxProfile (tra cứu thông tin doanh nghiệp từ cơ quan thuế)

## Mục tiêu

Tra cứu và lưu cache thông tin đăng ký doanh nghiệp do **cơ quan thuế** (Tổng cục Thuế, `gdt.gov.vn`) công bố, theo mã số thuế, qua API công khai `https://api.vietqr.io/v2/business/{taxCode}`. Dùng để pre-fill `legalName`/`invoiceAddress` khi tạo `Store` và để đối chiếu tên pháp nhân trước khi xuất hoá đơn.

`TaxProfile` **độc lập với `Store`** — không FK, khoá tự nhiên là `taxCode`. Một pháp nhân có thể chưa có `Store` nào (tra cứu trước khi tạo), hoặc có nhiều `Store` cùng dùng chung 1 `TaxProfile`.

## Entity / dữ liệu

| Field | Kiểu | Bắt buộc? | Ghi chú |
|---|---|---|---|
| taxCode | string | có | **UNIQUE ở DB**, khoá tự nhiên. Lấy từ `data.id` của upstream |
| name | string | có | tên pháp nhân theo đăng ký thuế, vd `TẬP ĐOÀN VINGROUP - CÔNG TY CP` |
| internationalName | string | không | upstream trả `null` khá thường xuyên |
| shortName | string | không | upstream trả `null` khá thường xuyên |
| address | string | không | địa chỉ đăng ký |
| status | string | không | trạng thái NNT, vd `NNT đang hoạt động` |
| sourceUpdatedAt | datetime | không | `metadata.updatedAt` của upstream — mốc dữ liệu **bên cơ quan thuế**, không phải mốc sync của ta |

**Không có cột `lastSyncedAt`**: đường ghi duy nhất của bảng này là 1 lần sync thành công, nên `updatedAt` (`Base`) **chính là** mốc sync gần nhất. `sourceUpdatedAt` là khái niệm khác hẳn (upstream tự khai dữ liệu của họ cũ tới đâu) nên mới cần cột riêng.

Quan hệ với entity khác: **Không có.** `Store.taxCode` và `TaxProfile.taxCode` trùng giá trị nhưng **không có FK** — cố ý, để tra cứu được mã số thuế chưa gắn với `Store` nào.

Entity kế thừa **`Base`**, *không* phải `VersionedBase`: bảng này không có luồng "load full ra form, người dùng sửa nhiều field rồi lưu" — nó là **cache một chiều** từ upstream, người dùng không bao giờ sửa tay. Không có optimistic locking vì không có 2 người cùng sửa.

## Hợp đồng với upstream (đã kiểm chứng bằng request thật, không phải suy đoán)

`GET https://api.vietqr.io/v2/business/{taxCode}` — **không cần API key**.

⚠️ **Upstream luôn trả HTTP 200**, kể cả khi lỗi. Trạng thái thật nằm ở field `code` trong body — bắt lỗi bằng HTTP status là sai:

| `code` | Nghĩa | Ta trả về |
|---|---|---|
| `00` | Success | `TaxProfileResponseDto` |
| `51` | Mã số thuế không tồn tại | `TAX_PROFILE_NOT_FOUND_UPSTREAM` (404) |
| `52` | Mã số thuế không chính xác | `TAX_PROFILE_REJECTED_UPSTREAM` (400) |
| khác / network lỗi / timeout | — | `TAX_PROFILE_LOOKUP_FAILED` (502) |

Body khi thành công:

```json
{ "code": "00", "desc": "Success - Thành công",
  "data": { "id": "0101245486", "name": "TẬP ĐOÀN VINGROUP - CÔNG TY CP",
            "internationalName": "VINGROUP JOINT STOCK COMPANY", "shortName": "VINGROUP",
            "address": "Số 7, Đường Bằng Lăng 1, ... TP Hà Nội", "status": "NNT đang hoạt động" },
  "metadata": { "source": "https://www.gdt.gov.vn", "updatedAt": "2026-08-17T09:27:43.000Z" } }
```

`internationalName`/`shortName` trả `null` với nhiều doanh nghiệp (đã thấy ở `0100109106`) ⇒ **phải** nullable.

## Quy tắc nghiệp vụ

- **Cache-first**: `GET /tax-profiles/{taxCode}` trả bản ghi đã lưu nếu có, **không** gọi upstream. Chỉ gọi upstream khi cache miss. Upstream tự khai dữ liệu của họ cũ 7 ngày đến 1 tháng ⇒ TTL ngắn không mua được gì ngoài độ trễ và thêm điểm chết.
- **Refresh tường minh**: `POST /tax-profiles/{taxCode}/refresh` luôn gọi upstream và ghi đè bản ghi. Đây là endpoint **riêng** (không phải query param `?refresh=true`) để phân quyền nằm trọn ở decorator — theo `CLAUDE.md`, rào tĩnh theo endpoint thì dùng decorator, không tự check role trong service.
- **Mã chi nhánh (`-001`) bị từ chối ngay, không gọi upstream**: upstream trả `code: 51` cho mọi mã có hậu tố chi nhánh (đã kiểm chứng với `0101245486-001`). Chặn trước bằng `TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED` (400) để tiết kiệm 1 round-trip vô nghĩa và cho thông báo đúng nguyên nhân, thay vì "mã số thuế không tồn tại" gây hiểu nhầm.
- `taxCode` được `trim()` trước khi dùng; không upper-case (toàn chữ số + gạch ngang).
- Lookup ghi cache là **upsert theo `taxCode`**: đã có thì update tại chỗ, chưa có thì insert. Không bao giờ tạo 2 bản ghi cùng `taxCode`.
- Lưu `taxCode` theo **giá trị ta hỏi**, không theo `data.id` upstream trả về — tránh trường hợp upstream chuẩn hoá khác đi làm lệch khoá cache.
- Upstream lỗi **không** làm hỏng bản ghi cache đang có: `TAX_PROFILE_LOOKUP_FAILED` ném ra trước khi chạm DB.
- **Không** đụng tới `Store`: tạo/sửa `Store` không gọi upstream (xem "Ngoài phạm vi").

## Quyền truy cập

Dùng RBAC cơ bản (`@HasRole`) ⇒ **không cần migration seed `Authority`**.

| Action | Role |
|---|---|
| `GET /tax-profiles` (danh sách cache) | `ADMIN`, `MANAGER`, `SUPERVISOR` |
| `GET /tax-profiles/{taxCode}` (lookup, cache-first) | `ADMIN`, `MANAGER`, `SUPERVISOR` |
| `POST /tax-profiles/{taxCode}/refresh` | `ADMIN` |

Lookup mở cho cả 3 role vì màn hình tạo `Store` cần pre-fill. Refresh giữ riêng `ADMIN`: nó là đường duy nhất gọi thẳng ra bên thứ ba, mở cho mọi role là mở đường nện upstream. `SUPER_ADMIN` bypass toàn bộ.

## API cần có

- `GET /tax-profiles` — danh sách profile đã cache (phân trang).
- `GET /tax-profiles/{taxCode}` — lookup cache-first, tự gọi upstream + lưu cache khi miss.
- `POST /tax-profiles/{taxCode}/refresh` — ép gọi upstream, ghi đè cache.

## Ngoài phạm vi (Out of scope)

- **Không tự động tra cứu khi tạo/sửa `Store`** — đã chốt: `Store` write không được phụ thuộc uptime của bên thứ ba. Module `store` **không đổi một dòng nào** trong lần này.
- Không có FK/join giữa `Store` và `TaxProfile`; ghép bằng giá trị `taxCode` ở tầng gọi.
- Chưa hỗ trợ mã số thuế chi nhánh (`-001`) — upstream không phục vụ.
- Chưa có TTL/refresh nền theo lịch (`@nestjs/schedule` có sẵn nhưng không dùng ở đây), chưa có job hàng loạt.
- Chưa có xoá bản ghi cache, chưa có lịch sử thay đổi thông tin pháp nhân theo thời gian.
- Chưa validate checksum MST thật của Tổng cục Thuế, chỉ check format `/^\d{10}(-\d{3})?$/`.
- Chưa cache ở Redis — cache nằm ở MySQL, đủ cho tần suất tra cứu của màn hình tạo `Store`.

## Câu hỏi mở / chưa chốt

Không có — 4 điểm thiết kế (quan hệ với `Store`, thời điểm gọi upstream, chính sách cache, cách xử lý mã chi nhánh) đã chốt với user trước khi lập plan (`docs/plans/tax-profile.md`).
