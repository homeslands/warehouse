> Tài liệu thực thi W02 · bản chia sẻ cho FE/QA. Bản này chưa phải nghiệm thu runtime, và không thay đổi baseline R2.

# #196 W02-BE-01: Đối soát contract R2 ↔ code legacy và thiết kế triển khai W02

- **Mã:** W02-BE-01 / task W02-BE.C · **Owner:** Mekong-HCM (BE) · **Ngày:** 2026-11-06 · **Revision:** r2 (sửa theo review độc lập r1)
- **Trạng thái:** chờ re-review. CONTRACT_READY chỉ công bố trên issue #196 sau khi re-review PASS.
- **Nguồn thiết kế (R2), đọc tại docs `4335203`:**
  - dossier `docs/project/baseline/dossiers/W02.md`;
  - `contracts/`: `architecture-and-boundaries.md`, `openapi-v1.json`, `warehouse-storage.proto`, `permission-policy.csv`, `data-and-migration.md`, `business-rules.md`;
  - `roadmap/requirements-traceability.csv`;
  - decisions D02/D03/D06/D07/D08/D14/D18/D30/D31/D32/D35.
- **Code legacy:** `origin/main` `1d7f200`. Từ `4335203` đến `1d7f200` chỉ đổi file CI, không đụng `src/`.
- **Phạm vi bằng chứng:**
  - Đây là đối soát tài liệu và source: code, OpenAPI, proto, FE callers. Không chạy app/migration, đúng scope BE-01.
  - Operation, quyền, schema và enum được kiểm trực tiếp bằng script trên `openapi-v1.json` (mục 2a).
  - Mọi quy tắc ở mục 5–6 dẫn nguồn R2. Chỗ nào chưa có nguồn thì ghi là deviation mở (mục 6b), không tự chốt.

## 1. Kiến trúc: đích ↔ hiện tại

| Hạng mục | R2 đích | Legacy hiện tại | Gap / thiết kế |
|---|---|---|---|
| Topology | React → REST Gateway → gRPC + mTLS → Storage → MySQL/Redis/S3/outbox (D03, architecture §7-26) | 1 NestJS monolith | Tách 2 composition root. Storage giữ entity/transaction; Gateway không import repository nghiệp vụ |
| Envelope thành công | Required `message`, `statusCode` (2xx), `timestamp`, **`traceId`**, `result` (typed) | `message/statusCode/timestamp/result`, **không có `traceId`** | Thêm `traceId`. `result` theo schema v1 |
| Envelope lỗi | Required `statusCode`, `code`, **`errorKey`**, `message`, `traceId`, `timestamp` | `statusCode/code/timestamp/path/method/message` | Error translator ở Gateway: gRPC status → HTTP (architecture §53-67), không phân loại bằng regex message |
| Phân trang | v1 list trả object phân trang: `items` + page/pageSize/total/totalPages/hasNext/**hasPrevious**; pageSize 1..100; sortBy whitelist; q ≤200 (business-rules §14) | Legacy `hasPrevios`. `GET /roles` và `GET /authorities` legacy trả **mảng không phân trang** | v1 phân trang toàn bộ list. Legacy giữ nguyên |
| Định danh | `{id}` UUID; slug legacy chỉ qua adapter (business-rules §9) | `:slug` | v1 dùng UUID |
| Refresh | Cookie `Secure; HttpOnly; SameSite=Lax; Path=/api/v1/auth`, Origin allowlist + CSRF; access 15 phút, refresh ≤7 ngày, rotation/reuse-revoke (business-rules §20-21) | Refresh trong body, ký lại `exp` mới và giữ `sid`, **không rotation** (`auth.service.ts:103-108, 228-240`); FE lưu refresh trong localStorage | Thay cơ chế. Cutover theo mục 5c |
| Idle | Server idle 30 phút; polling/refresh **không** gia hạn idle; `POST /auth/activity` có rate limit (business-rules §20, D14) | Không có | Mới |
| Login throttle | 20/phút theo **IP + identifier**; refresh 30/phút/session (business-rules §21) | `@Throttle` 20/phút chỉ theo IP; refresh 30/phút theo IP | Đổi key throttle |
| File | Private S3; D06: kiểm MIME thực + đuôi + size theo purpose; URL ký **≤5 phút**; upload chưa gắn được dọn sau **24h** | `POST /file/upload` trả key trong `message` | Mục 5 nhóm File |
| Audit/outbox | Audit cùng transaction nghiệp vụ; outbox dispatcher sau commit; consumer dedupe | `logger_tbl` chỉ là log kỹ thuật | Mục 5 nhóm Audit |
| Backup | Job + manifest MySQL + object/checksum/version (D06 mục 4, D14 giữ 30 ngày) | `POST /db` mysqldump đồng bộ + cron 1AM | Mục 5 nhóm Job |

## 2. Đối soát 37 operation W02

Ký hiệu: **REUSE** = dùng lại service legacy qua adapter. **CHANGE** = có nhưng khác contract. **NEW** = chưa có.

Case ID theo quy ước dossier W02: mỗi operation có `TC-API-<op>`, và có thêm `TC-DENY-<op>` trừ `login`/`refresh`.

| # | operationId | v1 HTTP | x-authority | Legacy | Quyền legacy | Loại | Microtask | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 1 | login | POST /auth/login | PUBLIC_AUTH | POST /auth/login | @Public | CHANGE | I-02 | `LoginResult` có `csrfToken`, `sessionId`; refresh đặt vào cookie |
| 2 | refresh | POST /auth/refresh | PUBLIC_AUTH | POST /auth/refresh (body) | @Public | CHANGE | I-02 | Cookie + CSRF, rotation/reuse-revoke, kiểm idle khi refresh (TC-AUTH-03) |
| 3 | logout | POST /auth/logout | AUTHENTICATED | POST /auth/logout | JWT | REUSE | I-02 | Thêm xoá cookie, audit |
| 4 | logoutall | POST /auth/logout-all | AUTHENTICATED | POST /auth/logout-all | JWT | REUSE | I-02 | Như #3 |
| 5 | lock | POST /auth/lock | AUTHENTICATED | — | — | NEW | I-02 | |
| 6 | changeOwnPassword | POST /auth/change-password | AUTHENTICATED | POST /auth/change-password | JWT | REUSE | I-02 | Password 12..72 byte UTF-8 (business-rules §16) |
| 7 | getProfile | GET /auth/me | AUTHENTICATED | GET /auth/me | JWT | CHANGE | I-02 | Shape v1 |
| 8 | updateProfile | PATCH /auth/me | AUTHENTICATED | — | — | NEW | I-02 | Body có `version` |
| 9 | recordInteractiveActivity | POST /auth/activity | AUTHENTICATED | — | — | NEW | I-02 | Rate limit, chỉ session của caller |
| 10 | listOwnSessions | GET /sessions | AUTHENTICATED | — | — | NEW | I-02 | Schema `Session` |
| 11 | revokeOwnSession | DELETE /sessions/{id} | AUTHENTICATED | — | — | NEW | I-02 | |
| 12 | listUsers | GET /users | USER_READ | GET /users | USER_READ | REUSE | I-03 | Phân trang v1 |
| 13 | createUser | POST /users | USER_CREATE | POST /users | USER_CREATE | REUSE | I-03 | **`Idempotency-Key` bắt buộc**; mapping field mục 6b |
| 14 | getUser | GET /users/{id} | USER_READ | GET /users/:slug | USER_READ | CHANGE | I-03 | UUID |
| 15 | updateUser | PATCH /users/{id} | USER_UPDATE | PATCH /users/:slug; PUT …/lock, …/unlock | USER_UPDATE | CHANGE | I-03 | `UserPatch` {version*, displayName, email, isActive}. Lock/unlock legacy tương ứng `isActive` |
| 16 | deleteUser | DELETE /users/{id} | USER_DELETE | DELETE /users/:slug | USER_DELETE | CHANGE | I-03 | **`version` qua query** |
| 17 | changeUserRole | PUT /users/{id}/role | USER_CHANGE_ROLE | POST /users/:slug/change-role | USER_UPDATE | CHANGE | I-03 | Body {version*, roleId*}; seed mã mới |
| 18 | resetUserPassword | POST /users/{id}/password | USER_CHANGE_PASSWORD | POST /users/:slug/change-password | USER_CHANGE_PASSWORD | CHANGE | I-03 | Body {newPassword*, version*} |
| 19 | listRoles | GET /roles | ROLE_READ | GET /roles (mảng) | ROLE_READ | CHANGE | I-03 | v1 phân trang |
| 20 | createRole | POST /roles | ROLE_CREATE | POST /roles | ROLE_CREATE | CHANGE | I-03 | **`Idempotency-Key`**. `RoleWrite.family` ∈ {MANAGER, SUPERVISOR} |
| 21 | getRole | GET /roles/{id} | ROLE_READ | GET /roles/:slug | ROLE_READ | CHANGE | I-03 | `Role` required family/builtIn/version |
| 22 | updateRole | PATCH /roles/{id} | ROLE_UPDATE | PATCH /roles/:slug | ROLE_UPDATE | CHANGE | I-03 | Body `version`. family/builtIn/code bất biến |
| 23 | deleteRole | DELETE /roles/{id} | ROLE_DELETE | DELETE /roles/:slug | ROLE_DELETE | CHANGE | I-03 | `version` query |
| 24 | listAuthorities | GET /authorities | MANAGE_PERMISSIONS | GET /authorities (mảng) | **chỉ JWT** | CHANGE | I-03 | F-196-01; phân trang v1 |
| 25 | listAuthorityGroups | GET /authority-groups | MANAGE_PERMISSIONS | GET /authority-groups | **chỉ JWT** | CHANGE | I-03 | F-196-01 |
| 26 | updateAuthorityMetadata | PATCH /authorities/{id} | MANAGE_PERMISSIONS | PATCH /authorities/:slug | MANAGE_PERMISSIONS | CHANGE | I-03 | UUID |
| 27 | putRoleAuthority | PUT /roles/{id}/authorities/{code} | MANAGE_PERMISSIONS | PUT /roles/:slug/authorities/:code | MANAGE_PERMISSIONS | CHANGE | I-03 | Đổi cache epoch |
| 28 | deleteRoleAuthority | DELETE /roles/{id}/authorities/{code} | MANAGE_PERMISSIONS | DELETE … | MANAGE_PERMISSIONS | CHANGE | I-03 | **`version` query** |
| 29 | uploadFile | POST /files | FILE_CREATE | POST /file/upload | FILE_CREATE | CHANGE | I-04 | **`Idempotency-Key`**; purpose GENERIC/FINANCIAL_ATTACHMENT/EXCEL_IMPORT; stream ≤64KiB/chunk |
| 30 | getFileMetadata | GET /files/{id} | FILE_READ | — | — | NEW | I-04 | Seed mã mới |
| 31 | getFileAccess | POST /files/{id}/access | FILE_READ | — | — | NEW | I-04 | URL ký ≤5 phút (D06) |
| 32 | listAuditEvents | GET /audit-events | AUDIT_READ | — | — | NEW | I-05 | |
| 33 | listTechnicalLogs | GET /technical-logs | LOG_READ | GET /logger | LOGGER_READ | CHANGE | I-06 | Retention 30 ngày |
| 34 | listBackupRequests | GET /backup-requests | BACKUP_MANAGE | — | — | NEW | I-06 | |
| 35 | createBackupRequest | POST /backup-requests | BACKUP_MANAGE | POST /db | DB_BACKUP | CHANGE | I-06 | **`Idempotency-Key`**; job + manifest |
| 36 | createRestoreRequest | POST /restore-requests | BACKUP_MANAGE | — | — | NEW | I-06 | **`Idempotency-Key`**; 202. Thực thi restore theo gate vận hành |
| 37 | getJob | GET /jobs/{id} | JOB_READ | — | — | NEW | I-06 | `Job.status` ∈ QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED |

**Tổng:** REUSE 6 · CHANGE 20 · NEW 11 = 37. So với r1, #19 `listRoles` chuyển từ REUSE sang CHANGE vì v1 phân trang còn legacy trả mảng.

### 2a. Kiểm trực tiếp OpenAPI/proto R2 (script, docs `4335203`)

- **OpenAPI:** đủ 37/37 operationId. `x-authority` khớp cột trên.
- **Response:** chung bộ lỗi 400/401/403/404/409/422/429/500/503/504 với schema `Error`.
- **Proto:** 161 RPC; `UploadFile` là client-stream.
- **`Idempotency-Key` bắt buộc ở:** createUser, createRole, uploadFile, createBackupRequest, createRestoreRequest.
- **`version` bắt buộc ở:**
  - body: updateProfile, updateUser, updateRole, changeUserRole, resetUserPassword;
  - query: deleteUser, deleteRole, deleteRoleAuthority.
- **Enum:**
  - `Role.family` ∈ ADMIN/MANAGER/SUPERVISOR; `RoleWrite.family` ∈ MANAGER/SUPERVISOR;
  - `FileMetadata.purpose` ∈ GENERIC/FINANCIAL_ATTACHMENT/EXCEL_IMPORT;
  - `FileMetadata.status` ∈ **UNATTACHED/ATTACHED/REJECTED**;
  - `Job.status` ∈ QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED.

| Schema R2 | Field (required*) | Gap legacy |
|---|---|---|
| `LoginResult` | accessToken*, expiresIn*, user*, sessionId*, csrfToken* | Legacy trả accessToken/refreshToken/expireTime* trong body |
| `UserPatch` | version*, displayName, email, isActive | `user_tbl` chưa có `version_column` (User/Role kế thừa `Base`). Mapping displayName/email ở mục 6b |
| `Role` | id*, name*, family*, level*, builtIn*, authorityCodes*, version* | Legacy chưa có cột family/builtIn/version |
| `Session` | id*, isCurrent*, createdAt*, lastInteractiveAt*, idleExpiresAt*, expiresAt*, ipMasked, userAgent | Mới |
| `FileMetadata` | id*, purpose*, originalName*, detectedMimeType*, extension*, sizeBytes*, sha256*, warehouseId, ownerId*, createdAt*, status* | Mới. MIME phải nhận diện từ nội dung (D06 mục 2) |
| `FileAccess` | url*, expiresAt*, downloadName*, contentDisposition* | Mới |
| `AuditEvent` | id*, actorId*, actorType*, action*, entityType*, entityId*, traceId*, createdAt*, warehouseId, entityVersion, before, after, changedFields, ipMasked, userAgent, actorName, serviceIdentity | Mới |
| `Job` | id*, kind*, status*, createdAt*, progress*, finishedAt, errorKey, resultFileId | Mới |

## 3. Quyền

| Mã R2 | Legacy | Hướng xử lý (migration seed mới) |
|---|---|---|
| USER_CHANGE_ROLE | dùng chung USER_UPDATE | Seed + cấp **ADMIN** (`permission-policy` default_grant_families). Route legacy giữ USER_UPDATE |
| FILE_READ | — | Seed + cấp **ADMIN, MANAGER, SUPERVISOR** |
| AUDIT_READ | — | Seed + cấp **ADMIN, MANAGER** |
| LOG_READ | LOGGER_READ | Seed + cấp **đúng theo policy (ADMIN)**, không sao chép từ các role đang có LOGGER_READ lúc runtime. LOGGER_READ giữ cho route legacy |
| BACKUP_MANAGE | DB_BACKUP | Seed + cấp **ADMIN**. DB_BACKUP giữ cho `POST /db` legacy |
| JOB_READ | — | Seed + cấp **ADMIN, MANAGER, SUPERVISOR** |

Quy tắc R2 phải thực thi ở Storage (business-rules §22-24):
- Custom role vẫn thuộc 3 family. Không tạo `SUPER_ADMIN` lúc runtime.
- family/builtIn/code bất biến sau khi tạo.
- `x-authority` có `|` là OR giữa các mã, sau đó AND với family ceiling + warehouse scope + row policy.
- Route v1 thiếu annotation ⇒ deny.
- Cache quyền có epoch; cache không phải nguồn cấp quyền (data-and-migration §22). Thiếu xác minh ⇒ fail-closed.

## 4. Findings trên code hiện hành

- **F-196-01 (Medium):** `GET /authorities` và `GET /authority-groups` chỉ cần JWT (`authority.controller.ts:30-50`, `authority-group.controller.ts:14-31`). R2 yêu cầu `MANAGE_PERMISSIONS`.
  - FE @ `4335203` chỉ gọi `/authorities` từ `pages/permissions/ui/PermissionsPage.tsx` (màn quản trị); không gọi `/authority-groups`.
  - Siết trong #197.
- **F-196-02 (High, thiết kế):** refresh legacy không rotation; ký lại `exp` mới, giữ `sid` (`auth.service.ts:103-108, 228-240`). FE lưu refresh trong localStorage. Vì vậy token cũ **không tự hết hạn** nếu user hoạt động liên tục. Cutover theo mục 5c.
- **F-196-03 (Info):** `POST /db` mysqldump đồng bộ + cron 1AM, không manifest/retention. Thay bằng job (I-06).
- **F-196-04 (Medium):** `role.guard.ts` cho `SUPER_ADMIN` vượt mọi `AuthorityGuard`/`HasRoleGuard` (`role.guard.ts:32, 63`). D02 + permission-policy: "Admin is not a universal bypass"; không có `SUPER_ADMIN` runtime. v1 phải áp family ceiling + scope cho mọi principal. Xử lý legacy `SUPER_ADMIN` (root seeder) là deviation mở DEV-196-03 (mục 6b).

## 5. Dữ liệu (theo `data-and-migration.md` §16-37; viết trong #197, chạy trên target test theo D32)

Tên dưới đây là **tên logic** của R2. Entity/migration map sang bảng/cột legacy rõ ràng, không rename bảng production chỉ để khớp tên. Mọi bảng nghiệp vụ có `id`, `version`, `created_at`, `updated_at` (+ `deleted_at` nếu soft delete). Timestamp audit/hệ thống là UTC.

| Nhóm | Bảng logic | Ràng buộc R2 bắt buộc |
|---|---|---|
| Identity | users, roles, authorities, authority_groups, role_authorities | Thêm `version_column` cho user/role. Thêm `family` (3 giá trị) và `builtIn` cho role. `roles.name` unique kể cả đã xoá. `authorities.code` unique bất biến. `users.phone`/`email` unique (xem DEV-196-02) |
| Session | **sessions, refresh_token_families, refresh_token_hashes** | Chỉ lưu **hash** refresh, không plaintext. Unique token hash. `session.user_id` FK. family ↔ session liên kết. **revoked / idle / token expiry tách riêng** (sessions giữ lastInteractiveAt, idleExpiresAt, expiresAt, revokedAt). **Mỗi family chỉ 1 token hiện hành.** Lưu userAgent dạng có thể trả về `Session.userAgent`, IP đầy đủ chỉ ở storage hạn chế, API trả `ipMasked` |
| File | **file_objects, typed_file_attachment_links** | Object: key/checksum (sha256)/size/MIME thực/owner/purpose/status (UNATTACHED/ATTACHED/REJECTED). Link có **typed FK** tới đúng 1 entity (CHECK), unique(file_id, entity link). Không lưu binary/base64 trong MySQL |
| Audit/outbox | **audit_logs, outbox_events, outbox_deliveries, request_idempotency** | Audit cùng transaction nghiệp vụ, đủ field `AuditEvent` + `command_id`, unique(command_id, entity_type, entity_id, action). Outbox `event_id` PK. Delivery unique(event_id, recipient, channel). Idempotency unique(principal, operation, key) + payload hash bất biến |
| Job | **backup_jobs** (+ archive_jobs ở W11) | Job source idempotency unique. Manifest MySQL + object/checksum/version (D06 mục 4). Giữ 30 ngày (D14) |
| Technical log | technical_logs hoặc log sink được duyệt | INFO/WARN/ERROR, traceId, index timestamp, redact secret, retention 30 ngày; không áp cleanup này cho business audit |

### 5a. Transaction, state, version, idempotency

Nguồn: business-rules §10-12, §20-21; data-and-migration §48-55.

| Luồng | Quy tắc |
|---|---|
| Idempotency chung | `Idempotency-Key` 16–128 ký tự, unique (principalId, operationId, key). Cùng key + cùng payload chuẩn hoá ⇒ trả kết quả cũ. Cùng key + payload khác ⇒ **409**. Giữ bản ghi **≥7 ngày**. Áp dụng: createUser, createRole, uploadFile, createBackupRequest, createRestoreRequest |
| Version | Mọi update/action có `version` (8 operation ở mục 2a), check **lại trong transaction đã khoá**. Lệch ⇒ 409. Payload chỉ có version không phải update hợp lệ. Không giữ transaction DB qua call ra ngoài |
| Refresh rotation | Transaction: kiểm session chưa revoked/idle/expired ⇒ đánh dấu hash hiện hành đã dùng ⇒ phát hash mới cùng family. Hash cũ dùng lại ⇒ **revoke cả family/session**, trả 401. Polling/refresh **không** gia hạn idle |
| Logout / revoke | Ghi revokedAt + audit trong transaction. Deny-list Redis cập nhật sau commit. Gọi lặp cho cùng kết quả |
| Grant/revoke quyền | Transaction + audit + đổi cache epoch. `deleteRoleAuthority` bắt buộc `version` |
| Upload | Stream lên object store, rồi transaction ghi metadata UNATTACHED. Gắn entity qua typed link ⇒ ATTACHED. Sai MIME/size ⇒ REJECTED. Huỷ hoặc lỗi giữa chừng ⇒ không ATTACHED. UNATTACHED được dọn sau **24h** nếu không còn tham chiếu (D06) |
| Audit + outbox | Cùng transaction nghiệp vụ. Dispatcher publish sau commit. Consumer dedupe theo event_id. Retry không ghi lại nghiệp vụ |
| Backup/restore job | Transaction tạo job + audit. QUEUED → RUNNING → SUCCEEDED/FAILED/CANCELLED. Trùng key ⇒ trả job cũ. DEADLINE_EXCEEDED ⇒ tra theo key, không tạo job mới |

### 5b. Migration và rollback (data-and-migration §65-74)

1. **Kiểm kê target test:** SHA/diff, migration history, PK/FK/collation/index, số dòng. Chỉ dùng WH-TEST-ENV-20261105.
2. **Reserve ID:** đọc lại max migration lúc bắt đầu #197. Không dùng lại 047, không rename/backdate.
3. **Expand:** thêm bảng/cột nullable/index mới. Schema vẫn đọc được dữ liệu cũ. API v1 chưa kích hoạt. Unique/FK chỉ thêm sau khi có report duplicate/missing parent.
4. **Backfill:**
   - role.family theo tên role legacy (ADMIN/MANAGER/SUPERVISOR); role custom map theo level, có danh sách đối soát.
   - builtIn cho 4 role seed.
   - version = 1.
   - email/displayName theo DEV-196-02.
5. **Validate rồi constrain:** so số dòng và FK trước/sau. Chỉ sau đó mới NOT NULL, unique, seed mã quyền mới + đổi cache epoch.
6. **Rollback:**
   - Trước khi bật capability v1, rollback = `down` của các bước expand/backfill. Mỗi migration ghi up/down + tác động.
   - **Sau khi đã có dữ liệu v1** (session/audit/file/job): **không drop** cột/bảng. Dừng ghi capability, giữ snapshot, rồi forward-fix/reconciliation. Lý do: audit phải giữ ≥2 năm (NFR-23).
   - Revert DB có sẵn cần quyền riêng.
   - Chạy up → down → up trên target test trước khi bàn giao QA, chỉ ở phase expand.

### 5c. Cutover auth (data-and-migration §73, F-196-02)

- Legacy auth **không được coi là đạt security gate** khi vẫn lưu refresh trong localStorage.
- FE chuyển sang cookie v1 và BE **revoke toàn bộ phiên legacy cùng một mốc**, ví dụ `logoutAll` diện rộng / tăng epoch session.
- Hệ quả: user đăng nhập lại một lần.
- Mốc này phải thống nhất với FE (THẮNG) và QA (LAN ANH) trước khi bật. Ghi trong I-07.

## 6. Thiết kế triển khai #197: microtask (1 BE, theo dependency)

| MT | Nội dung | Phụ thuộc | Case |
|---|---|---|---|
| I-01 | Proto compile, Storage gRPC server, Gateway client, mTLS cert test, traceId, error translator, envelope v1 | — | TC-ARC-01..04 |
| I-02 | sessions/refresh families/hashes, cookie+CSRF+Origin, rotation/reuse-revoke, idle 30 phút + activity + lock, throttle IP+identifier, op #1-11 | I-01 | TC-AUTH-01..08; TC-API/DENY op #1-11 |
| I-03 | users/roles/authorities/permissions v1 (UUID, FieldMask, version, idempotency), family/builtIn/ceiling, F-196-01, F-196-04 (v1), seed 6 mã + epoch, op #12-28 | I-01 | TC-RBAC-01..08; TC-API/DENY op #12-28 |
| I-04 | file_objects + typed links, purpose/size/MIME thực, stream + sha256, presign ≤5 phút, cleanup 24h, op #29-31 | I-01 | TC-FILE-01..08; TC-API/DENY op #29-31 |
| I-05 | audit_logs + outbox_events/deliveries + request_idempotency dùng chung, op #32 | I-03 | TC-AUD-01..03; TC-API/DENY op #32 |
| I-06 | technical logs v1, backup_jobs + manifest + restore request, op #33-37 | I-05 | TC-BKP-01..02; TC-API/DENY op #33-37 |
| I-07 | Bàn giao: BE.I READY_FOR_QA, runbook, mốc cutover auth (5c) | I-01..06 | TC-UI-01..11 do FE + QA browser chạy trên API này |

**Gate:** #197 chỉ implement khi W01-QA.T COMPLETE + E02b VERIFIED. Tại 06/11, #166 vẫn OPEN.

### 6a. Truy vết requirement → microtask

Nghĩa của ID lấy từ `roadmap/requirements-traceability.csv` @ `4335203`.

| Requirement | Microtask |
|---|---|
| ADR-001 kiến trúc microservices | I-01 |
| DS-06 logger có Trace ID | I-01 (trace) + I-05 (audit) + I-06 (technical logs) |
| NFR-07 username/password + bcrypt · NFR-11 khoá sau 30 phút · ADR-003 JWT access + refresh + session · DS-02 API auth/user/role/session | I-02 (+ I-03 cho user/role) |
| NFR-08 RBAC 3 vai trò · DS-09 ma trận actor/action/scope · BRD-U02 admin quản lý user · SRS-U02 admin user/phân quyền/backup | I-03 (+ I-06 cho backup) |
| BRD-U01 cửa hàng gắn kho | I-03: chỉ nền scope kho; store làm ở W03 (packages W02;W03) |
| ADR-006 dữ liệu file · SRS-U29 upload chứng từ phiếu nhập | I-04: nền file; gắn chứng từ phiếu ở W04 (packages W02;W04). D06 thay phần lưu bytes trong MySQL |
| NFR-09 audit trail · BRD-U05 xem audit đầy đủ | I-05 (+ I-06 cho phần log lỗi/xuất log của BRD-U05) |
| NFR-10 backup hằng ngày, giữ 30 ngày · BRD-U04 backup + restore | I-06 |
| NFR-23 lưu trữ ≥2 năm, archive | I-06: retention; archive làm ở W11 (packages W02;W11) |
| ADR-002 MySQL 3NF, soft delete · DS-01 ERD/migration | Mọi migration I-02..I-06 |
| DS-10 tài liệu/conventions · DS-12 diagram master | I-07 |

### 6b. Deviation mở (cần chốt trước/khi làm #197)

| ID | Nội dung | Nguồn | Owner / gate |
|---|---|---|---|
| DEV-196-01 | Không có. Trạng thái session IDLE_LOCKED ở r1 đã bỏ, dùng các trường thời điểm của R2 | — | — |
| DEV-196-02 | Mapping user: `displayName` ↔ `firstName`/`lastName`; `email` legacy nullable, R2 unique (required hay không theo `UserCreate`); `avatarFileId` chưa có cột | `sdd-field-traceability.csv`, D35 | Mekong-HCM. Chốt bằng mapping có nguồn trong I-03, không tự gộp |
| DEV-196-03 | User `SUPER_ADMIN` legacy (root seeder) và bypass trong guard, so với D02 "không SUPER_ADMIN runtime, không bypass" | D02, permission-policy | Mekong-HCM. Đề xuất: v1 không nhận SUPER_ADMIN như bypass; legacy giữ cho đến cutover. Cần CR nếu muốn gỡ ở legacy |
| DEV-196-04 | Cách lưu cache epoch: cột DB hay key Redis có nguồn từ DB | data-and-migration §22 | Mekong-HCM, chốt ở I-03 |

## 7. CONTRACT_READY: checklist bàn giao FE/QA

- Nguồn contract: **OpenAPI R2** + bảng mục 2/2a. 37 operation **không đổi** contract R2.
- Khác biệt v1 ↔ legacy FE/QA cần biết:
  1. UUID path ↔ slug.
  2. Envelope thành công có thêm `traceId`. Lỗi có `errorKey`/`code`/`traceId`.
  3. List v1 luôn phân trang, có `hasPrevious`. `GET /roles` và `/authorities` legacy trả mảng.
  4. Refresh qua cookie + `csrfToken` (v1), không còn trong body. Cutover theo 5c.
  5. `Idempotency-Key` và `version` bắt buộc ở các operation trong mục 2a.
  6. Mã quyền mới ở mục 3. File status UNATTACHED/ATTACHED/REJECTED.
- QA #198 thiết kế test theo bảng case mục 2 + mục 6; test thật ở #199 sau BE.I.

## 8. Trạng thái checklist #196

1. Bảng đối soát 37/37 + schema/error/quyền/RPC/enum + requirement/case: có ở r2 (mục 2, 2a, 3, 6, 6a).
2. Thiết kế module, transaction/state/version/idempotency, migration expand/backfill/validate/constrain + rollback: có ở r2 (mục 5, 5a, 5b, 5c, 6). Không chạy migration.
3. Checklist FE/QA + mapping legacy↔v1: có ở r2 (mục 7).
4. Evidence: nguồn `1d7f200`, docs `4335203`, Mekong-HCM, 2026-11-06. SHA256 của file này ghi trong comment công bố CONTRACT_READY trên #196.
5. Deviation/CR: không đổi R2. Deviation mở DEV-196-02..04 có owner (mục 6b). Finding F-196-01..04 giao #197.
