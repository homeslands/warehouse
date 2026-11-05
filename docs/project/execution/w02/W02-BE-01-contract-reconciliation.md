> Tài liệu thực thi W02 · bản chia sẻ cho FE/QA. Bản này chưa phải nghiệm thu runtime, và không thay đổi baseline R2.

# #196 W02-BE-01: Đối soát contract R2 ↔ code legacy và thiết kế triển khai W02

- **Mã:** W02-BE-01 / task W02-BE.C · **Owner:** Mekong-HCM (BE) · **Ngày:** 2026-11-06 · **Trạng thái:** CONTRACT_READY (sau review độc lập, xem PR)
- **Nguồn thiết kế (R2):** dossier `docs/project/baseline/dossiers/W02.md`, `contracts/architecture-and-boundaries.md`,
  `openapi-v1.json`, `warehouse-storage.proto`, `permission-policy.csv`, `data-and-migration.md`, decisions D02/D03/D06/D07/D08/D14/D18/D30/D31/D32/D35.
  Phiên bản đọc: docs @ `4335203` (bản phát hành của thư bàn giao).
- **Code legacy:** `origin/main` `1d7f200`. Từ `4335203` đến `1d7f200` chỉ đổi file CI, không đụng `src/`.
- **Phạm vi bằng chứng:**
  - Đây là đối soát tài liệu và source (đọc code, OpenAPI, proto, FE callers). Không chạy app/migration (đúng scope BE-01).
  - Operation/quyền đã kiểm trực tiếp trên `openapi-v1.json` (mục 2a).

## 1. Kiến trúc: đích ↔ hiện tại

| Hạng mục | R2 đích | Legacy hiện tại | Gap / quyết định thiết kế |
|---|---|---|---|
| Topology | React → REST Gateway (NestJS) → gRPC + mTLS → Storage (NestJS) → MySQL/Redis/S3/outbox (D03) | 1 NestJS monolith, controller gọi trực tiếp service/TypeORM | Tách 2 composition root. Storage giữ entity/transaction; Gateway không import repository nghiệp vụ |
| Prefix / envelope | `/api/v1`. Envelope **giống legacy** (`message`, `statusCode` 2xx, `timestamp`, `result`), `result` typed, `hasPrevious` | `api/${VERSION}` + `AppResponseDto{message,statusCode,timestamp,result}`, `hasPrevios` | Route v1 chạy song song. Chỉ khác ở `result` typed và `hasPrevious`. Legacy giữ nguyên cho tới khi FE chuyển (architecture §44 bước 1 và 3) |
| Định danh | `{id}` UUID trên path | `:slug` (user/role/authority) | v1 dùng UUID. Legacy giữ slug. Không đổi URL legacy |
| Lỗi | gRPC status → HTTP (401/403/404/422/409/429/503/504/500) + code/field/traceId | `HttpExceptionFilter` + `AppException.code` | Thêm error translator ở Gateway, không phân loại lỗi bằng regex message |
| TraceId | Gateway sinh UUID, đi qua RPC/audit/outbox | Không có | Mới |
| Refresh token | Cookie HttpOnly + kiểm Origin/CSRF + rotation | Gửi trong body `refreshToken`, **không rotation** (`auth.controller.ts:62-90`) | Thay đổi cơ chế. Cần session registry + migration |
| Idle 30 phút / lock (D14) | `POST /auth/activity`, `POST /auth/lock` | Chưa có | Mới |
| Phiên | `GET /sessions`, `DELETE /sessions/{id}` | `sid` trong JWT + deny-list Redis (logout, logout-all) | Cần registry phiên bền vững (MySQL), Redis chỉ làm cache |
| File | Private S3, metadata trong DB, `GET /files/{id}`, `POST /files/{id}/access` (URL có hạn) (D06/D30) | `POST /file/upload` trả key trong `message`, không có metadata/đọc/xoá | Bảng `file_metadata` + purpose + presign. Giữ hợp đồng legacy cho UI cũ |
| Audit / outbox | Audit cùng transaction nghiệp vụ, outbox publish sau commit (D14) | Không có audit nghiệp vụ. `logger_tbl` chỉ là log kỹ thuật (winston) | Module `audit-log` + `outbox` mới |
| Backup | `backup-requests`, `restore-requests`, `jobs/{id}` (job bất đồng bộ) | `POST /db` (mysqldump đồng bộ) + cron 1AM | Chuyển sang job queue + metadata. Restore chỉ tạo yêu cầu (D14/D31) |

## 2. Đối soát 37 operation W02

Ký hiệu: **REUSE** = có service legacy dùng lại được, chỉ cần adapter. **CHANGE** = có nhưng khác contract. **NEW** = chưa có.

| # | operationId | v1 HTTP | Quyền R2 | Legacy tương ứng | Quyền legacy | Loại | Ghi chú gap |
|---|---|---|---|---|---|---|---|
| 1 | login | POST /auth/login | PUBLIC_AUTH | POST /auth/login | @Public | CHANGE | Refresh phải trả qua cookie, không trả trong body. Throttle 20/phút giữ nguyên |
| 2 | refresh | POST /auth/refresh | PUBLIC_AUTH | POST /auth/refresh (body) | @Public | CHANGE | Đọc refresh từ cookie, kiểm CSRF/Origin, rotation + phát hiện reuse |
| 3 | logout | POST /auth/logout | AUTHENTICATED | POST /auth/logout | JWT | REUSE | Thêm xoá cookie và ghi audit |
| 4 | logoutall | POST /auth/logout-all | AUTHENTICATED | POST /auth/logout-all | JWT | REUSE | Tương tự #3 |
| 5 | lock | POST /auth/lock | AUTHENTICATED | — | — | NEW | Khoá phiên do idle (D14) |
| 6 | changeOwnPassword | POST /auth/change-password | AUTHENTICATED | POST /auth/change-password | JWT | REUSE | Hiện trả cặp token mới, cần đổi sang cookie |
| 7 | getProfile | GET /auth/me | AUTHENTICATED | GET /auth/me | JWT | CHANGE | Shape typed v1 (User), bỏ `scope` nếu contract không có |
| 8 | updateProfile | PATCH /auth/me | AUTHENTICATED | — (chỉ `PATCH /users/{slug}` cho người khác) | — | NEW | FieldMask `data.<field>`, `clear_fields` |
| 9 | recordInteractiveActivity | POST /auth/activity | AUTHENTICATED | — | — | NEW | Gia hạn idle timer |
| 10 | listOwnSessions | GET /sessions | AUTHENTICATED | — | — | NEW | Cần session registry |
| 11 | revokeOwnSession | DELETE /sessions/{id} | AUTHENTICATED | — | — | NEW | Dùng lại deny-list theo `sid` |
| 12 | listUsers | GET /users | USER_READ | GET /users | USER_READ | REUSE | v1 phân trang `hasPrevious`, scope theo kho giữ nguyên |
| 13 | createUser | POST /users | USER_CREATE | POST /users | USER_CREATE | REUSE | Field `phoneNumber` (R2) ↔ `phonenumber` (legacy): mapping D35 |
| 14 | getUser | GET /users/{id} | USER_READ | GET /users/:userSlug | USER_READ | CHANGE | Path theo UUID |
| 15 | updateUser | PATCH /users/{id} | USER_UPDATE | PATCH /users/:userSlug | USER_UPDATE | CHANGE | FieldMask. Lock/unlock legacy (`PUT .../lock`) map vào patch `isActive`, cần xác nhận lại trên OpenAPI |
| 16 | deleteUser | DELETE /users/{id} | USER_DELETE | DELETE /users/:userSlug | USER_DELETE | CHANGE | Path theo UUID |
| 17 | changeUserRole | PUT /users/{id}/role | **USER_CHANGE_ROLE** | POST /users/:slug/change-role | **USER_UPDATE** | CHANGE | **Thiếu authority `USER_CHANGE_ROLE`**: phải seed + gán theo permission-policy |
| 18 | resetUserPassword | POST /users/{id}/password | USER_CHANGE_PASSWORD | POST /users/:slug/change-password | USER_CHANGE_PASSWORD | CHANGE | Path/tên mới |
| 19 | listRoles | GET /roles | ROLE_READ | GET /roles | ROLE_READ | REUSE | — |
| 20 | createRole | POST /roles | ROLE_CREATE | POST /roles | ROLE_CREATE | REUSE | — |
| 21 | getRole | GET /roles/{id} | ROLE_READ | GET /roles/:slug | ROLE_READ | CHANGE | UUID path |
| 22 | updateRole | PATCH /roles/{id} | ROLE_UPDATE | PATCH /roles/:slug | ROLE_UPDATE | CHANGE | UUID + FieldMask |
| 23 | deleteRole | DELETE /roles/{id} | ROLE_DELETE | DELETE /roles/:slug | ROLE_DELETE | CHANGE | UUID |
| 24 | listAuthorities | GET /authorities | MANAGE_PERMISSIONS | GET /authorities | **chỉ cần JWT** | CHANGE | **Finding F-196-01** (mục 4) |
| 25 | listAuthorityGroups | GET /authority-groups | MANAGE_PERMISSIONS | GET /authority-groups | **chỉ cần JWT** | CHANGE | **F-196-01** |
| 26 | updateAuthorityMetadata | PATCH /authorities/{id} | MANAGE_PERMISSIONS | PATCH /authorities/:slug | MANAGE_PERMISSIONS | CHANGE | UUID |
| 27 | putRoleAuthority | PUT /roles/{id}/authorities/{code} | MANAGE_PERMISSIONS | PUT /roles/:roleSlug/authorities/:code | MANAGE_PERMISSIONS | CHANGE | UUID. Phải tăng role epoch để vô hiệu cache quyền |
| 28 | deleteRoleAuthority | DELETE /roles/{id}/authorities/{code} | MANAGE_PERMISSIONS | DELETE … | MANAGE_PERMISSIONS | CHANGE | Như #27 |
| 29 | uploadFile | POST /files | FILE_CREATE | POST /file/upload | FILE_CREATE | CHANGE | Metadata + purpose. Giới hạn theo purpose: ≤10MiB generic / ≤5MiB chứng từ (D30). Stream gRPC chunk ≤64KiB |
| 30 | getFileMetadata | GET /files/{id} | **FILE_READ** | — | — | NEW | **Thiếu authority `FILE_READ`** |
| 31 | getFileAccess | POST /files/{id}/access | FILE_READ | — | — | NEW | URL tải có hạn. Kiểm ownership/scope theo entity |
| 32 | listAuditEvents | GET /audit-events | **AUDIT_READ** | — | — | NEW | Module audit mới. **Thiếu `AUDIT_READ`** |
| 33 | listTechnicalLogs | GET /technical-logs | **LOG_READ** | GET /logger | **LOGGER_READ** | CHANGE | Đổi tên mã quyền: cần mapping, không xoá mã cũ khi legacy còn dùng |
| 34 | listBackupRequests | GET /backup-requests | **BACKUP_MANAGE** | — | — | NEW | — |
| 35 | createBackupRequest | POST /backup-requests | BACKUP_MANAGE | POST /db | **DB_BACKUP** | CHANGE | Chuyển từ mysqldump đồng bộ sang job |
| 36 | createRestoreRequest | POST /restore-requests | BACKUP_MANAGE | — | — | NEW | Chỉ tạo yêu cầu. Thực thi restore theo gate vận hành |
| 37 | getJob | GET /jobs/{id} | **JOB_READ** | — | — | NEW | Bảng job metadata |

**Tổng hợp:** REUSE 7 · CHANGE 19 · NEW 11. Đã kiểm lại từ bảng: 7 + 19 + 11 = 37.

### 2a. Kiểm trực tiếp OpenAPI/proto R2 (2026-11-06, docs @ `4335203`)

- **OpenAPI:** đủ 37/37 operationId của gói. `x-authority` từng operation khớp cột "Quyền R2" ở bảng trên.
- **Response:** mọi operation dùng chung bộ mã lỗi 400/401/403/404/409/422/429/500/503/504 với schema `Error`.
- **Proto:** `warehouse-storage.proto` có 161 RPC. Các RPC W02 đã đối chiếu trong `service` (dòng ~4264–4300), ví dụ `Login`, `Refresh`, `Lock`, `GetProfile`, `UpdateProfile`, `ListOwnSessions`, `GetFileAccess`, `ListAuditEvents`, `CreateBackupRequest`, `GetJob`.
- **UploadFile** là client-stream: `rpc UploadFile(stream FileUploadChunk)`.

Schema then chốt, gap so với legacy:

| Schema R2 | Field (required*) | Gap legacy |
|---|---|---|
| `LoginResult` | accessToken*, expiresIn*, user*, sessionId*, csrfToken* | Legacy trả `accessToken/refreshToken/expireTime*`. v1 không trả refresh trong body (cookie), thêm `csrfToken` |
| `UserPatch` | **version***, displayName, email, isActive | (1) `user_tbl` **chưa có `version_column`**: User/Role kế thừa `Base`, không phải `VersionedBase`, nên cần migration thêm cột. (2) `displayName` ↔ `firstName`/`lastName`: cần mapping D35 có nguồn, xem `sdd-field-traceability.csv`. (3) Lock/unlock legacy = patch `isActive` |
| `Session` | id*, isCurrent*, createdAt*, lastInteractiveAt*, idleExpiresAt*, expiresAt*, ipMasked, userAgent | Chưa có registry phiên |
| `FileMetadata` | id*, purpose*, originalName*, **detectedMimeType***, extension*, sizeBytes*, **sha256***, warehouseId, ownerId*, createdAt*, status* | Legacy chỉ có key S3. Phải nhận diện MIME theo **nội dung** (magic bytes), không theo mimetype client khai, và tính sha256 khi stream |
| `FileAccess` | url*, expiresAt*, downloadName*, contentDisposition* | Mới (presigned GET) |
| `AuditEvent` | id*, actorId*, actorType*, action*, entityType*, entityId*, traceId*, createdAt*, warehouseId, entityVersion, before, after, changedFields, ipMasked, userAgent, actorName, serviceIdentity | Mới |
| `Job` | id*, kind*, status*, createdAt*, progress*, finishedAt, errorKey, resultFileId | Mới |

## 3. Quyền: authority R2 chưa có trong legacy

| Mã R2 | Legacy | Hướng xử lý (migration seed mới, không sửa migration cũ) |
|---|---|---|
| USER_CHANGE_ROLE | dùng chung USER_UPDATE | Seed mới, cấp ADMIN theo permission-policy. Route legacy giữ USER_UPDATE |
| FILE_READ | — | Seed mới, cấp ADMIN/MANAGER/SUPERVISOR |
| AUDIT_READ | — | Seed mới, cấp ADMIN/MANAGER |
| LOG_READ | LOGGER_READ | Seed `LOG_READ`, cấp cùng role đang có `LOGGER_READ`. Giữ `LOGGER_READ` cho route legacy (D35: mapping có nguồn) |
| BACKUP_MANAGE | DB_BACKUP | Seed mới, cấp ADMIN. Giữ `DB_BACKUP` cho `POST /db` legacy tới khi bỏ route |
| JOB_READ | — | Seed mới, cấp ADMIN/MANAGER/SUPERVISOR |

Mọi việc cấp/thu quyền phải tăng **role epoch** để cache Redis `rbac:role:*` / `rbac:user:*` bị vô hiệu. Nếu không kiểm được thì fail-closed (architecture §23).

## 4. Findings an ninh/contract trên code hiện hành

- **F-196-01 (Medium):** `GET /authorities` (`authority.controller.ts:30-50`) và `GET /authority-groups` (`authority-group.controller.ts:14-31`) không có `@RequireAuthority`, nên user nào đã đăng nhập cũng đọc được toàn bộ danh mục quyền. R2 yêu cầu `MANAGE_PERMISSIONS`.
  - Lộ cấu trúc quyền, mức thấp vì không phải dữ liệu nghiệp vụ.
  - Đã kiểm FE @ `4335203`: `GET /authorities` chỉ được dùng qua `useAuthorities` ở `pages/permissions/ui/PermissionsPage.tsx` (màn quản trị phân quyền). Không thấy FE gọi `GET /authority-groups`.
  - Đề xuất: siết `MANAGE_PERMISSIONS` cho cả 2 route legacy trong #197 (BE.I). Tác động FE: chỉ màn `/permissions`, mà màn này vốn yêu cầu quyền quản trị.
- **F-196-02 (Info):** refresh token không rotation và nằm trong body. Đây là hành vi đã biết (Swagger ghi rõ). R2 yêu cầu đổi; thuộc #197.
- **F-196-03 (Info):** `POST /db` chạy mysqldump đồng bộ trong request, đồng thời có cron backup 1AM. Không có metadata hay retention 30 ngày (D14). Thuộc #197.

## 5. Dữ liệu và migration dự kiến (viết trong #197, chạy trên target test theo D32)

1. `session_registry`: id, userId, sid, createdAt, lastActivityAt, revokedAt, userAgent/ip (đã băm). Dùng cho refresh rotation, idle 30 phút, `GET/DELETE /sessions`.
2. `file_metadata`: id, s3Key, checksum, size, mime, purpose, ownerUserId, entityType/entityId, status (TEMP/ATTACHED), createdAt. Object TEMP có TTL cleanup (D06).
3. `audit_event`: id, traceId, actorId, action, entityType/entityId, before/after (JSON), warehouseId, createdAt. Ghi trong cùng transaction nghiệp vụ.
4. `outbox_event`: id, eventId (dedupe), type, payload, status, attempts, createdAt, publishedAt.
5. `idempotency_key`: key, scope (operation + user), requestHash, responseRef, createdAt, TTL. Dùng chung cho upload/backup/restore.
6. `job`: id, type (BACKUP/RESTORE_REQUEST), status, requestedBy, result/error, timestamps. `backup_request`/`restore_request` (hoặc gộp vào job; chốt theo OpenAPI `BackupRequest`/`RestoreRequest`/`Job`).
7. Seed 6 authority mới (mục 3) + role epoch (cột `epoch_column` trên `role_tbl` hoặc key Redis có nguồn từ DB).
8. `version_column` cho `user_tbl` và `role_tbl` (UserPatch/RolePatch yêu cầu `version`). Backfill mặc định là 1. Down = drop cột.

**Rollback plan chung:**
- Mỗi migration có `down` đảo đúng thao tác.
- Migration chỉ thêm (bảng/cột/seed). Không đổi tên hay xoá cột legacy khi route legacy còn dùng.
- Bật tính năng mới theo route v1, nên legacy không phụ thuộc vào bảng mới. Rollback = revert migration + tắt route v1, không mất dữ liệu legacy.
- Chạy up → down → up trên target test (D32) trước khi bàn giao QA.

Mỗi migration có `down`. Không sửa migration đã chạy (gồm 047). Backfill session cho token cũ: không cần, vì token cũ hết hạn tự nhiên. Chiến lược cutover ghi rõ trong #197.

## 5a. Transaction, state, version và idempotency

| Luồng | Transaction | State / version | Idempotency |
|---|---|---|---|
| Refresh rotation | 1 transaction trên `session_registry`: đánh dấu refresh cũ là đã dùng, phát refresh mới | Session: ACTIVE → IDLE_LOCKED / REVOKED | Refresh cũ dùng lại ⇒ coi là reuse: revoke toàn bộ phiên đó và trả 401 (không phát token mới) |
| Logout / revoke session | Cập nhật `revokedAt` + deny-list Redis sau commit | REVOKED là trạng thái cuối | Gọi lặp trả cùng kết quả, không lỗi |
| PATCH user/role (FieldMask) | 1 transaction + audit cùng transaction | `version` optimistic. Lệch version ⇒ 409 (FAILED_PRECONDITION/ABORTED) | Retry với cùng version sau khi đã commit ⇒ 409, client phải đọc lại |
| Grant/revoke quyền | 1 transaction + tăng role epoch + audit | — | PUT/DELETE quyền vốn idempotent (legacy đã vậy) |
| Upload file | Stream vào S3 trạng thái TEMP, rồi transaction ghi metadata | TEMP → ATTACHED (khi gắn entity) / EXPIRED (TTL cleanup) | Header `Idempotency-Key` (bắt buộc theo OpenAPI): cùng key + cùng nội dung ⇒ trả lại cùng file. Khách huỷ hoặc lỗi giữa chừng ⇒ không tạo metadata ATTACHED; object TEMP bị dọn theo TTL |
| Audit + outbox | Insert cùng transaction nghiệp vụ | Outbox: PENDING → PUBLISHED / FAILED | Consumer dedupe theo `eventId`. Dispatcher retry không ghi lại nghiệp vụ |
| Backup/restore request | Transaction tạo `job` + audit | QUEUED → RUNNING → SUCCEEDED / FAILED | Header `Idempotency-Key` (OpenAPI khai báo cho `createBackupRequest`/`createRestoreRequest`): cùng key ⇒ trả lại job cũ. Cần bảng/cột lưu key + hash request. DEADLINE_EXCEEDED ⇒ tra theo key, không tạo job mới |

## 6. Thiết kế triển khai #197: microtask theo thứ tự dependency (1 BE)

| MT | Nội dung | Phụ thuộc | Kiểm chứng |
|---|---|---|---|
| I-01 | Proto compile + Storage gRPC server skeleton + Gateway client, mTLS bằng cert test, error/trace translator | — | Contract test proto↔OpenAPI; unit cho translator |
| I-02 | Session registry + refresh cookie/CSRF/rotation/reuse-detect + idle/activity/lock | I-01 | e2e trên harness W01 (TC-AUTH-01..08), Redis/MySQL thật |
| I-03 | Users/roles/authorities/permissions v1 qua Storage, FieldMask, UUID; F-196-01; seed 6 authority + role epoch | I-01 | TC-RBAC-01..08, TC-API/DENY-* 12..28 |
| I-04 | File metadata + purpose + presign + stream upload, cleanup TEMP | I-01 | TC-FILE-01..08 (S3 fake = SIMULATED; S3 thật NOT_RUN nếu không có target) |
| I-05 | Audit cùng transaction + outbox dispatcher | I-03 | TC-AUD-01..03, rollback test |
| I-06 | Technical logs v1 + backup/restore request + job | I-05 | TC-BKP-01..02, TC-API/DENY 33..37 |
| I-07 | Bàn giao QA: CONTRACT/BE.I READY_FOR_QA, runbook, evidence | I-01..06 | QA #199 |

Ước lượng R2 W02-BE: không thay đổi, theo `planning/resource-schedule.csv`.

**Gate:** #197 chỉ bắt đầu implement khi W01-QA.T COMPLETE + E02b VERIFIED. Snapshot 05/11: #166 vẫn OPEN, nên chưa được bắt đầu.

## 6a. Truy vết requirement → microtask

Nghĩa của từng ID tra trong `docs/project/roadmap/requirements-traceability.csv` @ `4335203`.

| Requirement (nghĩa theo nguồn) | Microtask |
|---|---|
| ADR-001 kiến trúc microservices (Gateway/Storage) | I-01 |
| DS-06 Logger có level/context/timestamp/PID/**Trace ID** | I-01 (traceId xuyên RPC) + I-06 (technical logs) |
| NFR-07 xác thực username/password, bcrypt · NFR-11 tự khoá sau 30 phút không hoạt động · ADR-003 JWT access + refresh + session · DS-02 API auth/user/role/session | I-02 (+ I-03 cho phần user/role của DS-02) |
| NFR-08 RBAC 3 vai trò · DS-09 ma trận actor/action/scope · BRD-U02 admin quản lý user · SRS-U02 admin quản lý user/phân quyền/cấu hình/backup | I-03 (+ I-06 cho phần backup của SRS-U02) |
| BRD-U01 cửa hàng gắn với kho | I-03: chỉ nền scope kho. Nghiệp vụ store làm ở W03 (traceability: packages W02;W03) |
| ADR-006 dữ liệu file (bảng File: name/mimetype/size/extension…) · SRS-U29 upload chứng từ phiếu nhập | I-04: nền file/purpose. Gắn chứng từ vào phiếu nhập của SRS-U29 làm ở W04 (packages W02;W04). Lưu ý **D06 thay thế phần lưu bytes trong MySQL** của ADR-006: bytes nằm ở private S3, MySQL giữ metadata |
| NFR-09 audit trail giao dịch quan trọng · BRD-U05 xem audit trail đầy đủ | I-05 |
| NFR-10 backup tự động hằng ngày, giữ 30 ngày · BRD-U04 backup tự động + thủ công, restore | I-06 |
| NFR-23 lưu trữ ≥2 năm, archive | I-06: chỉ chính sách retention cho backup/log. Archive dữ liệu thuộc W11 (`requestArchive`) |
| ADR-002 MySQL 3NF, soft delete, created/updated · DS-01 ERD/migration | Mọi migration I-02..I-06 |
| DS-10 tài liệu UI/API/technical/error + conventions · DS-12 diagram master | I-07 (tài liệu bàn giao) |

Case ID chi tiết nằm trong dossier W02 (116 case) và được giao cho QA #198 thiết kế.

**Đối soát phần legacy đã merge** (theo yêu cầu issue):
- #168 (`FILE_CREATE` + giới hạn 10MB/9 loại): khớp D30 cho generic upload. Còn thiếu purpose FINANCIAL ≤5MiB (PDF/JPG/PNG), làm ở I-04.
- #180 (key S3 an toàn) và #184 (log key sạch + cặp đuôi↔mime cho phiếu): giữ nguyên, I-04 dựng trên nền này.
- QA #173/#174: chưa có kết quả, nên không coi là evidence của W02.

## 7. CONTRACT_READY cho FE/QA (đầu ra của #196)

- FE (THẮNG) và QA (LAN ANH, #198) dùng **OpenAPI R2 + bảng mục 2** làm nguồn. 37 operation không đổi contract.
- Khác biệt legacy cần biết trong giai đoạn chuyển tiếp:
  - slug vs UUID;
  - envelope legacy;
  - refresh trong body (legacy) vs cookie (v1);
  - mã quyền mới (mục 3).
- Không có CR nào thay đổi contract R2 trong bản đối soát này. Các finding mục 4 được sửa trong phạm vi #197.

## 8. Trạng thái checklist #196

1. Bảng đối soát 37/37 operation + schema/error/quyền/RPC + requirement/case: **xong** (mục 2, 2a, 3, 6a).
2. Thiết kế file/module, transaction/state/version/idempotency, migration up/down + rollback: **xong**, ở mức thiết kế (mục 5, 6). Không chạy migration trong task này.
3. Checklist bàn giao FE/QA + mapping legacy↔v1: **xong** (mục 7).
4. Evidence: SHA nguồn `1d7f200`, docs `4335203`, người thực hiện Mekong-HCM, ngày 2026-11-06. Không chạy app, nên không có command/target.
5. Deviation/CR: không có thay đổi R2. Finding F-196-01..03 giao cho #197.
