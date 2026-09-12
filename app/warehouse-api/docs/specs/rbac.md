# Spec: rbac (cache quyền per-user trên Redis)

## Mục tiêu

Trước đây mỗi request có JWT đều query MySQL (join 4 cấp `user → role → permission → authority → authority_group`) chỉ để dựng `CurrentUserDto.scope`. Spec này đưa quyền của từng user lên Redis: ghi lúc đăng nhập, sống đúng bằng access token, để request bình thường **không chạm MySQL**. Quyền vẫn là RBAC động của `docs/specs/authority-permission.md` (`@RequireAuthority(code)`, bảng `Role`/`Permission`/`Authority`); spec này chỉ thay **nơi đọc**, không thay mô hình.

Engine tính quyền: **không dùng thư viện nào** (`nestjs-rbac` đã gỡ khỏi `package.json`). Mô hình quyền của app chỉ là `role → Authority.code[]` — không action, không filter, không wildcard — nên phần "engine" gọn đúng 1 method `RbacService.authoritiesOfRole(roleName)`: hỏi Redis trước, miss thì join `role ⋈ permission ⋈ authority` rồi ghi lại cache.

## Entity / dữ liệu

Không thêm entity/bảng/migration. Dữ liệu nằm trên Redis (`REDIS_AUTH_DB`, cùng logical DB **và cùng connection `ioredis`** với key thu hồi token, prefix riêng — app không mở client Redis thứ 2 cho cache):

| Key | Kiểu | Value | TTL | Ghi khi | Xoá khi |
|---|---|---|---|---|---|
| `rbac:user:{userId}` | SET | 1 member cờ `@cached` + các `Authority.code` role của user đang có (`SADD` + `EXPIRE`) | `DURATION` (giây — hạn access token) | `POST /auth/login`, `POST /auth/refresh`, và ở nhánh cache miss của `JwtStrategy` | `PUT/DELETE /roles/:roleSlug/authorities/:code` (mọi user thuộc role đó) |
| `rbac:role:{roleName}:authorities` | STRING | JSON array `Authority.code` của role đó (`SET ... EX`) | `RBAC_ROLE_CACHE_TTL` = 300 giây, hằng trong `src/rbac/rbac.constants.ts` (không cấu hình qua `.env`) | mỗi lần phải tính lại quyền 1 user mà key này miss | `PUT/DELETE /roles/:roleSlug/authorities/:code` (chỉ key của role đó) |

**Vì sao key role là STRING JSON chứ không phải SET** như key per-user: Redis không lưu SET rỗng, mà role được cấp 0 quyền vẫn phải là cache **hit** (`[]`) — nếu không thì mọi request của role đó đều rơi xuống MySQL. `[]` phân biệt được với "chưa cache" (`GET` trả `null`), còn key per-user đã có HASH meta làm cờ tồn tại nên không cần mẹo này. Key theo từng role (không phải 1 map chung mọi role): grant/revoke chỉ xoá đúng role vừa đổi, và cache miss chỉ tốn 1 query cho 1 role thay vì nạp toàn bộ bảng.

Value lưu **nguyên bản** (`SMEMBERS` ra thẳng danh sách code, `HGETALL` ra thẳng 2 field) — đọc bằng `redis-cli` không phải bóc envelope nào. `TTL` đặt bằng `EXPIRE` nên `redis-cli TTL` phản ánh đúng.

**Cache CHỈ chứa quyền.** `roleName` là **claim `role` của access token** (ký lúc login/refresh, xem `AuthJwtPayload`), không phải giá trị đọc từ Redis — `AuthorityGuard` (bypass `SUPER_ADMIN`) và `RoleBasedSerializationInterceptor` (`groups`) lấy nó từ token. `userName` không được cache ở đâu cả: consumer duy nhất là `GET /auth/me`, endpoint đó đọc thẳng DB (`AuthService.getProfile`).

**Vì sao vẫn cần member `@cached`:** Redis không lưu SET rỗng, nên nếu chỉ `SADD` các quyền thì role không có quyền nào sẽ không có key ⇒ không phân biệt được "chưa cache" với "đã cache, quyền rỗng" ⇒ mỗi request đều rơi xuống MySQL, im lặng, không lỗi. Đây không phải trường hợp lý thuyết: `SUPER_ADMIN` **cố tình** không có row `permission_tbl` nào (nó bypass ở guard — migration `1783728000011`), nên SET của tài khoản root chỉ gồm đúng member này. Hit/miss quyết định bởi `@cached`, không phải bởi số lượng member. `@` không đụng `Authority.code` thật được: code toàn UPPER_SNAKE và chỉ tạo được qua migration (không có API tạo `Authority`) — ràng buộc cấu trúc, không phải quy ước.

`permissions` chính là `CurrentUserDto.scope`. `SUPER_ADMIN` được cache đúng những gì có trong `permission_tbl` (có thể `[]`) — bypass vẫn nằm ở `AuthorityGuard`.

## Quy tắc nghiệp vụ

**Luồng theo endpoint:**

| Endpoint | Redis (RBAC) | MySQL |
|---|---|---|
| `POST /auth/login` | `GET rbac:role:{roleName}:authorities`, rồi 1 `MULTI`: `DEL` → `SADD @cached + quyền` → `EXPIRE` (TTL `DURATION`) — **sau** khi đã xác thực + `isActive`. Access token ký kèm claim `role` | load user (đã có sẵn), thêm 1 query `role ⋈ permission ⋈ authority` chỉ khi key role miss |
| `POST /auth/refresh` | ghi lại như login (access token mới có hạn mới, cache ghi lúc login sẽ hết trước); claim `role` ký lại theo giá trị vừa đọc từ DB | `findById` (eager `role`) |
| Mọi request có JWT (`JwtStrategy.validate`) | **1 lệnh `SMEMBERS rbac:user:{uid}`** — hit ⇒ dựng `CurrentUserDto` từ cache | **0 query** khi hit |
| `GET /auth/me` | như trên | +1 query lấy `phonenumber` (`userName` không nằm trong cache) |
| Cache miss / Redis lỗi / meta mất | ghi lại với đủ TTL | `findById` + `authoritiesOfRole(roleName)` (**đọc `rbac:role:{roleName}:authorities` trước**, miss thì 1 query `role ⋈ permission ⋈ authority` rồi ghi lại key role) |
| `PUT/DELETE /roles/:roleSlug/authorities/:code` | 1 `DEL` biến đổi (1 key × số user thuộc role) + `DEL rbac:role:{roleName}:authorities` — **sau** khi ghi DB | +1 query lấy `id` user theo `role_id_column` |

**Ghi đè phải `DEL` trước `SADD`.** `SADD` hợp nhất vào set đang có: ghi đè mà không xoá trước thì quyền vừa bị thu hồi vẫn nằm lại trong cache tới hết TTL. Cả cụm `DEL`/`SADD`/`EXPIRE` nằm trong 1 `MULTI` để không có khoảnh khắc cache chỉ có một nửa.

**Đọc chỉ 1 lệnh, không cần `MULTI`** — chỉ còn 1 key nên không có khe hở "1 trong 2 key hết TTL giữa chừng" như bản 2 key trước đây.

**Thứ tự trong `JwtStrategy.validate`:** từ chối refresh-type → check thu hồi (`TokenRevocationService`, fail-closed) → `RbacService.resolve(userId)` → dựng `CurrentUserDto`. Token đã bị thu hồi thì không tốn lần đọc cache nào.

**Guard không đọc Redis.** "Guard kiểm tra quyền từ Redis" được hiện thực bằng đúng 1 lần đọc trong `JwtStrategy`; `AuthorityGuard` (`src/role/role.guard.ts`) chỉ so `user.scope.includes(code)` + bypass `SUPER_ADMIN` (đọc `roleName` từ claim), giữ nguyên code.

**Cache miss trả `null`** khi user không còn tồn tại hoặc `isActive = false` ⇒ `JwtStrategy` trả 401, không ghi cache.

**Thứ tự tra cứu khi phải tính lại quyền 1 user** (`RbacService.authoritiesOfRole`): Redis (`rbac:role:{roleName}:authorities`) **trước**, MySQL sau. Nghĩa là 2 lớp cache — lớp per-user chặn hầu hết request, lớp per-role chặn nốt phần còn lại của cùng 1 role (N user cùng role, cache per-user vừa hết hạn ⇒ tối đa 1 query DB cho cả nhóm thay vì N).

**Role không tồn tại** (user mang `role_id` rác, hoặc role bị xoá) ⇒ `[]`, cache lại `[]`, **không** throw: user đó mất quyền và bị `AuthorityGuard` chặn, không phải lỗi 500.

**Hiệu lực ngay của bật/tắt quyền** (cam kết của `authority-permission.md`) được giữ bằng invalidation trong `PermissionService.grant/revoke`: xoá cache của mọi user thuộc role đó + key authority của chính role đó, request kế tiếp tính lại từ DB. Nhánh grant idempotent (đã có row) không đổi gì nên không xoá.

## Bất biến

- **Fail-open**: mọi lỗi Redis ở tầng cache RBAC (`RbacCacheService`, cả key per-user lẫn per-role) đều bị nuốt + log warn; `get` lỗi ⇒ coi như miss ⇒ đọc DB. Ngược với check thu hồi (fail-closed) — đừng copy nhầm hướng xử lý lỗi giữa 2 chỗ, dù giờ cả 2 dùng chung 1 client `ioredis`. Vì thu hồi fail-closed chạy trước, Redis chết hẳn thì mọi JWT vẫn 401; nhánh fallback chỉ gặp khi lỗi cục bộ (timeout, value hỏng, key hết hạn, Redis vừa restart).
- `getRoleAuthorities()` phân biệt `[]` (hit, role không có quyền nào) với `null` (miss/lỗi/JSON hỏng ⇒ đọc DB). Trả `[]` khi miss là làm user mất sạch quyền tới hết TTL; coi `[]` là miss là làm mọi request của role rỗng đều query MySQL.
- Member `@cached` **luôn** được `SADD`, kể cả khi danh sách quyền rỗng: nó là cờ hit/miss. Bỏ nó ⇒ SET rỗng ⇒ key biến mất ⇒ `SUPER_ADMIN` (0 row permission) miss vĩnh viễn, mỗi request 1 query MySQL mà không có lỗi nào báo ra.
- SET đọc lên mà **không có** `@cached` ⇒ coi như miss (value của bản deploy cũ hoặc ai đó `SADD` tay), không được tin phần còn lại.
- `RbacService.resolve` trả `[]` (hit, role không có quyền) khác hẳn `null` (user không còn / bị khoá ⇒ 401). Lẫn 2 cái này là mọi request của `SUPER_ADMIN` thành 401.
- Không cache `userName`/`roleName`: `roleName` đã ở trong claim, `userName` chỉ 1 endpoint hiếm gọi cần.
- Ghi đè cache luôn `DEL` trước `SADD` (xem "Quy tắc nghiệp vụ").
- Ghi cache **sau** khi đã load user và qua `checkActiveUser`/`isActive`; invalidate **sau** khi đã ghi DB.
- TTL key user = `DURATION` (giây, `EXPIRE`). Không dài hơn: user bị đổi role/khoá tay trong DB thì cache cũ sống tối đa 1 hạn access token.

- `login`/`refresh` **không ghi key thu hồi** (bất biến của `token-revocation.md`) — lệnh ghi cache RBAC ở 2 endpoint này là key khác, không vi phạm.

## Quyền truy cập

Không có route mới. Không thêm/sửa `@RequireAuthority(...)` nào ⇒ không cần migration seed `Authority`.

## API cần có

Không có. Thay đổi nội bộ: `JwtStrategy`, `AuthService.login/refresh`, `PermissionService.grant/revoke`, module mới `src/rbac/`.

## Đánh đổi đã chấp nhận

- **Khoá user (`isActive = false`) có độ trễ ≤ `DURATION`**: trước đây check ở mọi request, giờ chỉ ở cache miss. `/auth/refresh` vẫn thu hồi user inactive như cũ. Endpoint khoá/xoá/đổi role user (chưa có) **phải** xoá cache của user (`RbacCacheService.delUsers`, và gọi `TokenRevocationService.revokeAllTokensForUser`) — ghi trong "Nợ kỹ thuật" của `CLAUDE.md`.
- **Đổi tên role** không hỗ trợ (`PATCH /roles/:slug` chỉ sửa `description`); nếu sau này có, phải invalidate như grant/revoke.
- **1 SET quyền cho mỗi user** thay vì 2 key (SET + HASH meta): đọc còn đúng 1 `SMEMBERS` (bỏ được `MULTI`), invalidate còn 1 key/user, `SISMEMBER rbac:user:{uid} SOME_CODE` trả lời trực tiếp được nếu sau này muốn guard tự đọc Redis, và thêm/bớt 1 quyền lẻ chỉ cần `SADD`/`SREM`.
- **`roleName` trong JWT thay vì trong cache — claim KHÔNG thu hồi được.** Hạ ai đó khỏi `SUPER_ADMIN` thì họ vẫn bypass `AuthorityGuard` tới khi access token hết hạn (≤ `DURATION`); muốn hiệu lực ngay phải gọi `TokenRevocationService.revokeAllTokensForUser()`. Ngược lại, quyền (`scope`) vẫn xoá được ngay qua invalidation vì nó nằm ở Redis. Endpoint đổi role user (chưa có) **bắt buộc** phải thu hồi token, không chỉ xoá cache.
- **Deploy**: access token phát trước thay đổi này không có claim `role` ⇒ `roleName` là `undefined` ⇒ mất bypass `SUPER_ADMIN` và `groups` rỗng, tới khi token hết hạn hoặc client gọi `/auth/refresh` (≤ `DURATION`).
- **`GET /auth/me` tốn thêm 1 query MySQL** (đổi lại không phải cache `userName` cho mọi user chỉ để phục vụ endpoint này).
- **Tự viết thay vì dùng thư viện RBAC**: mất sẵn action/filter/wildcard của `nestjs-rbac`, đổi lại bỏ được 1 dependency + `ModuleRef` lấy provider nội bộ của lib, và thứ tự "Redis trước, DB sau" nằm tường minh trong `RbacService` thay vì phụ thuộc cách lib cache.
- `reflect-metadata` vẫn ở `^0.2.2` kèm `overrides` trong `package.json` (đã bump lúc thêm `nestjs-rbac`) — **không** hạ lại về `0.1` khi gỡ lib: `typeorm` vẫn cần `0.2.2`, còn `@automapper/classes` peer `~0.1.13`, nên `overrides` mới là thứ giữ cả process chỉ có 1 bản.

## Ngoài phạm vi (Out of scope)

- Action/filter/wildcard trong mã quyền (`code@action`, `ParamsFilter`...) — quyền vẫn là danh sách `Authority.code` phẳng.
- `@nestjs/cache-manager`/`keyv` — đã gỡ, cache RBAC dùng thẳng `ioredis` qua `RedisService`.
- Cache cho `RoleBasedSerializationInterceptor` (vẫn dựa vào `roleName`, không liên quan).
- Endpoint khoá/mở khoá/đổi role user (nợ kỹ thuật sẵn có).

## Câu hỏi mở / chưa chốt

Không có — đã chốt với user: **không dùng thư viện RBAC**, quyền do `RbacService` tự tính; cache quyền lưu bằng `SADD`/`EXPIRE` trên `ioredis` (không dùng cache-manager/keyv); tra Redis trước khi tra DB ở cả 2 lớp; cache miss fail-open + ghi lại; grant/revoke invalidate ngay; `JwtStrategy` bỏ query DB khi hit.
