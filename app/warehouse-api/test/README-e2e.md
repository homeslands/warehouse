# E2E harness (W01) — API + MySQL + Redis thật

Harness chạy `AppModule` thật (guard, repository, MySQL, Redis, Bull) trên **một DB test riêng được cấp**. Nó
không đọc `.env` và không fallback sang config dev/prod. Không dùng `synchronize`.

## Cần gì trước khi chạy

Điều phối cấp target test và đưa cho bạn 3 thứ. Không commit 3 thứ này vào repo:

| Biến | Nội dung |
|---|---|
| `WH_E2E_TARGET_FILE` | Đường dẫn tuyệt đối tới JSON non-secret: `id`, `mysql{container,host,port,database,user}`, `redis{container,host,port}` |
| `WH_E2E_CREDENTIAL_FILE` | Đường dẫn tuyệt đối tới JSON `{ "password": … }`, quyền `0600` |
| `WH_E2E_CONTAINER_LABEL` | Label `key=value` mà cả 2 container MySQL/Redis của target phải mang |
| `WH_E2E_EVIDENCE_DIR` (tuỳ chọn) | Thư mục tuyệt đối **ngoài repo** để ghi record JSON (không chứa secret) |

Harness fail-closed (W01-TC01): nó dừng **trước khi** mở kết nối nếu gặp một trong các trường hợp sau:
- Thiếu biến.
- Host không phải loopback.
- DB không khớp `warehouse_test_*`.
- User là `root`.
- Credential khác DB/user, hoặc file credential đọc được bởi group/other.
- Container thiếu label, hoặc port không do container đó publish.
- Shell đã có sẵn `DATABASE_*`/`REDIS_*`.

Harness chuyển cwd sang thư mục tạm rỗng để `ConfigModule` không nạp `.env`.

## Chạy

```bash
cd app/warehouse-api            # Node 24
export WH_E2E_TARGET_FILE=/abs/target.json WH_E2E_CREDENTIAL_FILE=/abs/cred.json \
       WH_E2E_CONTAINER_LABEL=warehouse.task=<task>
npm run test:e2e -- --runInBand
```

Thứ tự trong một lần chạy:
1. Guard target.
2. Chạy migration còn pending (lịch sử nằm ở bảng `migrations`).
3. Reset rồi seed fixture.
4. Dựng app với prefix `api/${VERSION}`, CORS và session giống `main.ts`.
5. Gọi HTTP bằng supertest (không mở port).

Chạy lặp lại không tạo dữ liệu trùng. Khi kết thúc, harness trả cwd về chỗ cũ và xoá thư mục tạm.

## Serve cho FE/QA (browser smoke, chạy tay)

```bash
export WH_E2E_TARGET_FILE=… WH_E2E_CREDENTIAL_FILE=… WH_E2E_CONTAINER_LABEL=…
WH_E2E_FIXTURE_SECRET_FILE=/abs/path/outside/repo/fixture-actors.json WH_E2E_PORT=18085 \
  npm run test:e2e:serve
```

Lệnh này đi qua cùng guard → migrate → seed và cùng composition với e2e, rồi listen **chỉ trên
127.0.0.1**. Nó in ra baseURL dạng `http://127.0.0.1:<port>/api/v1`.

File `WH_E2E_FIXTURE_SECRET_FILE` có các đặc điểm sau:
- Phải là đường dẫn tuyệt đối, nằm ngoài repo, quyền `0600`.
- Chứa `baseUrl`, `warehouses`, và `actors{alias:{id,phonenumber,password}}` của lần seed đó.
- Bị xoá khi dừng serve (Ctrl+C).
- Mỗi lần serve hoặc mỗi lần chạy e2e đều reseed, nên mật khẩu cũ mất hiệu lực.

Không chạy serve song song với `test:e2e` trên cùng target.

Thêm vài lưu ý khi dùng serve:
- File secret phải là đường dẫn **mới**. Harness từ chối nếu file đã tồn tại, hoặc nếu nó nằm trong worktree hay checkout chính.
- Nếu tiến trình bị `kill -9`, file sẽ không được xoá. Khi đó phải xoá tay.
- FE dev server: đặt `VITE_API_PROXY_TARGET=http://127.0.0.1:<port>` để Vite proxy gọi API. CORS của harness chỉ cho
  phép `http://localhost`, nên gọi thẳng từ origin của Vite (ví dụ `:5175`) sẽ bị chặn preflight.

## Fixture `WH-QA-FIXTURES-R2@legacy-adapter-1`

Fixture có 8 actor (ADMIN, MANAGER_AB/A/C, SUP_A1/A2/B, SUP_A_NO_EXPORT) và 3 kho (`e2e-wh-a/b/c`). Mỗi actor
giữ UUID R2; số điện thoại đi từ `0900000001` tới `0900000008`. Mật khẩu được sinh ngẫu nhiên mỗi lần seed và
chỉ nằm trong bộ nhớ của process test. Token lấy bằng `POST /auth/login` thật. Không actor nào dùng SUPER_ADMIN.
User `e2e-root` do `RootUserSeeder` tạo, với mật khẩu ngẫu nhiên và không được dùng.

Model legacy không biểu diễn được R2 ở 4 chỗ dưới đây. Ngoài ra, fixture R2 không cấp UUID cho store nên harness
tự đặt. `LEGACY_GAPS` trong `harness/fixture.ts` liệt kê đủ 5 mục.

| R2 | Legacy | Cách làm trong harness |
|---|---|---|
| Nhiều manager/kho | 1 manager/kho | MANAGER_AB làm manager kho B và member kho A |
| Store ↔ nhiều kho | Store ↔ Warehouse 1-1 | STORE_1↔A, STORE_2↔C; kho B không có store |
| Quyền gỡ theo user | Quyền theo role | Role harness `E2E_SUPERVISOR_NO_EXPORT` |
| `phoneNumber` `+999…` | `phonenumber` theo regex VN | Dùng dãy `0900000001`–`08` |

Các gap này thuộc W02/W03. Smoke W01 **không** chứng minh full RBAC R2.

**Reset** chỉ xoá các row harness sở hữu: UUID actor/kho/store cố định, member của các kho đó, và 2 role
`E2E_*`. Nó không TRUNCATE và không chạm row khác. Role `SUPERVISOR` dùng chung không bao giờ bị sửa.

## Case

| Case | Suite | Mức bằng chứng |
|---|---|---|
| W01-TC01 target sai bị chặn | `e2e/w01-tc01-target-guard` | CONFIG_GUARD (không kết nối) |
| W01-TC02 migration + history | `e2e/w01-db` | REAL_DB |
| W01-TC03 seed/reset lặp không trùng | `e2e/w01-db` | REAL_DB |
| W01-TC08 2 connection/barrier/rollback | `e2e/w01-db` | REAL_DB_HELPER |
| W01-TC04 login → `/auth/me` | `e2e/w01-api` | REAL_API_DB_REDIS |
| W01-TC05 ẩn danh → 401 | `e2e/w01-api` | REAL_API |
| W01-TC06 thiếu `WAREHOUSE_READ` → 403 | `e2e/w01-api` | REAL_API_DB |
| W01-TC07 SUP_A1 chỉ thấy kho A, kho B → 403 (100523) | `e2e/w01-api` | REAL_API_DB |

**TC08 chỉ là helper hạ tầng.** Nó dùng bảng probe `e2e_harness_probe_tbl` do harness sở hữu. Nó **không**
chứng minh race nghiệp vụ confirm tồn kho của W04.

## Provider ra ngoài

`FirebaseService` và `S3Service` được thay bằng bản giả: mỗi lần gọi được ghi lại và trả về `SIMULATED`.
Các biến mail/Google/AWS/Firebase nhận giá trị `SIMULATED`. Mọi cron job bị `stop()` sau khi app init.
Vì vậy kết quả ở đây **không** chứng minh S3, email hay push thật hoạt động.

- VietQR **không** được thay bằng bản giả: URL trỏ tới `http://simulated.invalid`. W01 không gọi tới nó.
- Bull consumer (notification) chạy thật trên Redis test.

## Ghi vào target ngoài các row harness

App và composition tự ghi một số thứ vào target, không chỉ các row harness sở hữu:
- **MySQL:** `logger_tbl` (winston DatabaseTransport), `session_tbl` (express-mysql-session), user `e2e-root`
  (RootUserSeeder), bảng `e2e_harness_probe_tbl` (TC08).
- **Redis DB 1:** key `rbac:user:*`, `rbac:role:*` cùng key revoke/refresh của auth (nếu phát sinh).
- **Redis DB 0:** key Bull prefix `warehouse-bull`.

Tên key Redis là hằng trong app nên **không** theo namespace mà grant đề xuất. Điều này chấp nhận được vì
container Redis dành riêng cho target. Reset chỉ xoá cache RBAC của actor/role harness.

## Ownership container

Label được kiểm do người chạy khai qua `WH_E2E_CONTAINER_LABEL`, vì `target.json` hiện chưa chứa label.
Để giảm rủi ro khai sai, harness kiểm kèm 3 điều: container đó thật sự publish đúng port trong grant, host là
loopback, và DB là `warehouse_test_*`.

## Giới hạn

- Đây là API legacy. Contract `/api/v1` typed của R2 chưa được implement. Prefix `v1` ở đây chỉ là giá trị
  `VERSION` của harness.
- Refresh-cookie, idle timeout và full RBAC/state được kiểm ở W02.
