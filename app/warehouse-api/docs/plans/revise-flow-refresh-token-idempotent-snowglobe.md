# Revise luồng authentication + JWT — refresh token store trên Redis

## Context

Luồng refresh token hiện tại (`src/auth/`) **hoàn toàn stateless**: `/auth/refresh` chỉ verify chữ ký JWT + `exp` + claim `type`, rồi load lại user để check `isActive`. `jti` được sinh mỗi lần nhưng không lưu ở đâu, không đối chiếu với gì.

Hệ quả: **token bị đánh cắp thì không thu hồi được.**

- Kẻ tấn công cầm refresh token dùng được tới khi hết hạn; user không có cách nào cắt phiên đó.
- Không có logout thật — FE xoá token phía client, token vẫn hợp lệ với server.
- Refresh token cũ vẫn dùng được sau khi refresh → không có rotation thật, không phát hiện được token đang bị dùng song song bởi kẻ khác.
- Cách duy nhất để cắt hiện nay là `isActive = false` (khoá cả tài khoản) hoặc đổi `JWT_SECRET` (văng toàn bộ user).

Kết quả mong muốn: mỗi lần đăng nhập tạo một phiên có bản ghi trong **Redis**; refresh token xoay vòng thật; TTL của Redis tự xoá token hết hạn (không cần cron job); user tự thu hồi được một phiên hoặc toàn bộ phiên; token bị đánh cắp và dùng lại bị phát hiện và cắt tự động.

## Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Nơi lưu | **Redis**, key `REFRESH_TOKEN_{uid}_{jti}`, TTL tự hết hạn. **Không** dùng bảng MySQL, **không** cần cron job dọn rác |
| Phạm vi lưu | **Chỉ refresh token.** Access token giữ stateless, `DURATION` 3600s → **900s** |
| `jti` | **`{epochMs}-{random8}`** — mang thời điểm phát hành ngay trên tên key nhưng không trùng, không đoán được |
| Liệt kê thiết bị | **SET chỉ mục theo user**, không SCAN keyspace |
| Endpoint | `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/sessions` |
| Thời hạn phiên | Sliding + trần tuyệt đối |
| Reuse detection | Thu hồi cả phiên + grace period 10s cho refresh song song |
| Lỗ hổng `JwtOptionalAuthGuard` | Sửa trong đợt này |
| Deploy | Chấp nhận user login lại 1 lần, không làm nhánh tương thích |

Đánh đổi được chấp nhận: access token đã phát vẫn dùng được tối đa 15 phút sau khi thu hồi. Ghi rõ trong Swagger description của `/auth/logout*`.

### Vì sao `jti` không nên là timestamp thuần
Hai lần login của cùng một user trong cùng mili giây (mở 2 tab, retry mạng) sinh trùng key → phiên này ghi đè phiên kia, user mất phiên không rõ lý do. `{epochMs}-{random8}` giữ nguyên tính chất bạn cần (đọc được thời điểm phát hành trên key, sắp xếp được theo thời gian, thu hồi được mọi token phát trước mốc X) mà không có rủi ro đó.

## Mô hình dữ liệu trên Redis

Ba loại key. `{uid}` = `user.id`, `{sid}` = session id (uuid, ổn định suốt vòng đời một thiết bị), `{jti}` = `{epochMs}-{random8}` của **token hiện tại**.

| Key | Value | TTL |
|---|---|---|
| `REFRESH_TOKEN_{uid}_{jti}` | `ACTIVE:{sid}` hoặc `GRACE:{sid}:{newJti}` | = hạn còn lại của refresh token; **10s** khi ở trạng thái GRACE |
| `REFRESH_SESSION_{uid}_{sid}` | JSON `{ currentJti, createdAt, lastUsedAt, userAgent, ipAddress, absoluteExpiresAt }` | = TTL của token hiện tại (trượt cùng nhau) |
| `REFRESH_INDEX_{uid}` | Redis SET các `sid` | = `REFRESH_TOKEN_ABSOLUTE_DURATION`, làm mới mỗi lần ghi |

Ý nghĩa: **key token tồn tại ⇔ refresh token đó còn hiệu lực.** Xoá key = thu hồi. TTL hết hạn = token tự chết, không cần dọn.

`sid` được ký vào **cả** access lẫn refresh token (claim `sid`). Nhờ vậy:
- `/auth/logout` biết cắt phiên nào mà không cần FE gửi refresh token lên.
- Reuse detection tra được phiên trong **O(1)** kể cả khi token bị trộm đã cũ nhiều vòng (xem dưới).

SET chỉ mục chỉ dùng cho `GET /auth/sessions` / `logout-all` / giới hạn số phiên. Phần tử SET **không tự hết hạn** theo key con → **dọn lười khi đọc**: `sid` nào mà `REFRESH_SESSION_{uid}_{sid}` không còn thì `SREM` khỏi SET.

### Vì sao Redis hợp với bài toán này hơn bảng MySQL
- TTL thay hoàn toàn cron job dọn rác.
- Rotation gói trong **một Lua script chạy atomic** → race "2 luồng refresh song song" được giải quyết dứt điểm, không phải dựa vào row lock + `affected` như phương án MySQL.
- Mọi thao tác thu hồi là O(1).

## Luồng

### `login()`
1. Sinh `sid = uuidv4()`, `jti = ${Date.now()}-${randomBytes(4).hex}`.
2. `absoluteExpiresAt = now + REFRESH_TOKEN_ABSOLUTE_DURATION`; `ttl = min(REFRESHABLE_DURATION, absoluteExpiresAt - now)`.
3. Một Lua script: `SETEX REFRESH_TOKEN_{uid}_{jti} ttl "ACTIVE:{sid}"`, `SETEX REFRESH_SESSION_{uid}_{sid} ttl <json>`, `SADD REFRESH_INDEX_{uid} {sid}`, `EXPIRE REFRESH_INDEX_{uid} <absolute>`.
4. Nếu `SCARD` index > `MAX_ACTIVE_SESSIONS` (default 10) → thu hồi các phiên cũ nhất theo `createdAt`. Không có trần thì client login-loop đẻ key vô hạn, và kẻ trộm password có thể tạo hàng loạt phiên rác để user không nhận ra phiên lạ trong `/auth/sessions`.

### `refresh()`

Thứ tự **bắt buộc**:

1. `verifyRefreshToken()` — chữ ký + `exp` + `type === Refresh` (giữ nguyên logic hiện có).
2. Load user → `checkActiveUser()` — **TRƯỚC khi ghi Redis**. Nếu xoay vòng trước rồi mới phát hiện user bị khoá thì jti cũ đã chết mà token mới không được trả về → phiên thành gạch vụn. Khi `checkActiveUser` fail → `revokeAllForUser(uid)` rồi throw.
3. Gọi **một Lua script `rotate`** (atomic) với `KEYS = [oldTokenKey, newTokenKey, sessionKey, indexKey]`:

```lua
local v = redis.call('GET', KEYS[1])
if not v then return {'MISS'} end                      -- token không tồn tại: đã dùng rồi / đã thu hồi / hết hạn
if string.sub(v, 1, 5) == 'GRACE' then return {'GRACE', v} end   -- refresh song song
-- v = 'ACTIVE:{sid}' -> xoay vòng
redis.call('SETEX', KEYS[1], GRACE_TTL, 'GRACE:'..sid..':'..newJti)  -- token cũ chuyển sang grace, KHÔNG xoá ngay
redis.call('SETEX', KEYS[2], TTL, 'ACTIVE:'..sid)
redis.call('SETEX', KEYS[3], TTL, sessionJson)          -- cập nhật currentJti + lastUsedAt
redis.call('SADD', KEYS[4], sid); redis.call('EXPIRE', KEYS[4], ABS_TTL)
return {'ROTATED'}
```

4. Kết quả `ROTATED` → phát cặp token mới với `jti` mới, `sid` giữ nguyên.
5. Kết quả `GRACE` → **ký lại** cặp token từ `newJti` mà value trỏ tới, `exp` lấy từ **TTL còn lại của key đó** (không phải `now + REFRESHABLE_DURATION`). Nhánh này **read-only tuyệt đối** — không gia hạn gì.
6. Kết quả `MISS` → phân biệt bằng `sid` lấy từ chính JWT:
   - `REFRESH_SESSION_{uid}_{sid}` **còn tồn tại** → token đang trình ra là token cũ của một phiên vẫn sống ⇒ **REUSE_DETECTED** → thu hồi cả phiên (xoá session key + token key hiện tại + `SREM` index) → 401 `REFRESH_TOKEN_REUSED`.
   - session key **không còn** → phiên đã logout/hết hạn → 401 `REFRESH_TOKEN_REVOKED`.
   - JWT không có `sid` (token phát trước đợt này) → 401 `INVALID_REFRESH_TOKEN`.

Đây chính là điểm mà mô hình Redis + claim `sid` mạnh hơn hẳn: reuse detection **không giới hạn độ sâu** và tốn đúng 1 lệnh `EXISTS`.

### Tách `jti` giữa access và refresh token
Hiện access và refresh token **dùng chung `jti`** — phải tách. Access token nhận `jti` riêng mỗi lần ký; refresh token nhận `jti` là khoá Redis. Chung nhau chỉ `sub` + `sid`. Không tách thì access token ký lại ở nhánh grace sẽ trùng `jti` với lần phát trước.

### `logout` / `logout-all` / `sessions`
- `logout`: từ `sid` trong access token → đọc session key lấy `currentJti` → xoá cả 2 key + `SREM` index (một Lua script). Idempotent. Token cũ không có `sid` → trả 200 `revokedSessions: 0` + log warn, **không throw**.
- `logout-all`: `SMEMBERS` index → xoá toàn bộ session key + token key tương ứng → `DEL` index.
- `sessions`: `SMEMBERS` index → `MGET` các session key → bỏ qua (và `SREM`) sid đã hết hạn → trả `SessionResponseDto` gồm `createdAt`, `lastUsedAt`, `ipAddress`, `userAgent`, `isCurrent`. **Không bao giờ trả `sid`/`jti`.**

Cả 3 route **không** gắn `@Public()` (cần JWT), **không** gắn `@RequireAuthority` (user chỉ quản lý phiên của chính mình) → **không cần migration seed `Authority`**.

## Bất biến phải giữ

1. **Mọi thao tác đọc-rồi-ghi phải nằm trong Lua script**, không tách thành nhiều lệnh từ Node. Tách ra là mở lại đúng race mà thiết kế này đang đóng.
2. **Nhánh GRACE read-only tuyệt đối** — không gia hạn TTL, không ghi `lastUsedAt`. Nếu gia hạn, kẻ tấn công poll liên tục sẽ giữ cửa sổ grace mở vĩnh viễn, biến token cũ thành token bất tử.
3. **`exp` của token ký lại ở nhánh grace lấy từ TTL còn lại của key** (`PTTL`), không phải `now + REFRESHABLE_DURATION`. Ký dài hơn store thì JWT sống lâu hơn key → mọi lần dùng sau đều 401 trong khi client tưởng còn hạn.
4. **TTL luôn bị chặn bởi `absoluteExpiresAt`**: `ttl = min(REFRESHABLE_DURATION, absoluteExpiresAt - now)`. Đây là toàn bộ cơ chế trần tuyệt đối — không có nó thì phiên sống vĩnh viễn.
5. **`checkActiveUser` chạy trước khi ghi Redis** (mục 2 luồng refresh).
6. **Redis instance phải là `maxmemory-policy noeviction`.** Nếu để `allkeys-lru`/`allkeys-random`, Redis sẽ **xoá key phiên khi đầy bộ nhớ** → user bị đăng xuất ngẫu nhiên, không log, không lý do. Đây là bẫy vận hành dễ bỏ sót nhất của phương án này.
7. **Dùng Redis logical DB riêng cho auth** (`db: 1` chẳng hạn), tách khỏi DB của BullMQ. BullMQ dùng chung instance; một lần `FLUSHDB` khi bảo trì queue sẽ đăng xuất toàn bộ user.
8. **Chỉ dùng thời gian của Node** khi tính TTL, không dùng `TIME` của Redis trộn lẫn.

## File cần tạo / sửa

**Tạo mới**
- `src/redis/redis.module.ts` + `src/redis/redis.service.ts` — module global bọc `ioredis`, connection từ `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` (cùng bộ env BullMQ đang dùng) + `db` riêng. Expose `getClient()` và các helper cần thiết. Project **chưa có Redis client module** nào — BullMQ tự quản connection riêng của nó.
- `src/auth/refresh-token.service.ts` — **toàn bộ** tương tác Redis (`AuthService` không chạm client). API:
  ```ts
  createSession(userId, meta, now?): Promise<IssuedSession>
  rotate(userId, oldJti, sid, meta, now?): Promise<RotateOutcome>  // 'rotated'|'grace'|'reused'|'revoked'|'not_found'
  revokeSession(userId, sid): Promise<number>
  revokeAllForUser(userId): Promise<number>
  listActiveSessions(userId): Promise<SessionRecord[]>
  ```
  Trả **outcome kiểu union, không throw** — `AuthService` map sang exception. Các Lua script khai báo hằng ở đầu file, nạp bằng `defineCommand` của ioredis để Redis cache script (dùng `EVALSHA`).
- `src/auth/refresh-token.service.spec.ts`.

**Sửa**
- `src/auth/auth.dto.ts` — `AuthJwtPayload` thêm `sid?`, `iat?`; thêm `SessionResponseDto`, `LogoutResponseDto { revokedSessions: number }`.
- `src/auth/auth.service.ts` — `login(dto, meta)`, `refresh(dto, meta)`, thêm `logout()`/`logoutAll()`/`listSessions()`; thay `generateToken()` bằng `buildTokenPair(userId, session)` (tách jti, ký `sid`).
- `src/auth/auth.controller.ts` — 3 route mới; `login`/`refresh` nhận `@Ip()` + `@Headers('user-agent')`; `@Throttle` (login 20/phút, refresh 30/phút — 10 quá chặt, SPA 5 tab cùng 401 là 5 lần refresh).
- `src/auth/auth.validation.ts` — `REFRESH_TOKEN_REVOKED` (100005), `REFRESH_TOKEN_REUSED` (100009), `SESSION_EXPIRED` (100010); cập nhật union `TAuthErrorCodeKey`. Guard trùng mã trong `src/app/app.validation.ts` throw lúc boot nếu chọn nhầm.
- `src/auth/auth.module.ts` — import `RedisModule`, thêm `RefreshTokenService` vào `providers`.
- `src/auth/passport/jwt/jwt.strategy.ts` — trả thêm `sessionId: payload.sid`.
- `src/user/user.decorator.ts` — `CurrentUserDto` thêm `sessionId?: string`.
- `src/auth/passport/jwt/jwt-optional-auth.guard.ts` — sửa lỗ hổng (mục cuối).
- `src/health/health.controller.ts` — thêm indicator `redis.ping()`. Auth giờ phụ thuộc Redis, healthcheck không phản ánh điều đó là mù.
- `src/app/env.validation.ts` — `REDIS_HOST`, `REDIS_PORT` chuyển thành **bắt buộc** (auth không chạy được nếu thiếu → fail fast lúc boot tốt hơn fail lúc user login); `REDIS_PASSWORD`, `REDIS_AUTH_DB`, `REFRESH_TOKEN_ABSOLUTE_DURATION`, `REFRESH_TOKEN_GRACE_PERIOD`, `MAX_ACTIVE_SESSIONS` để `@IsOptional()` + default trong code. Lưu ý `validate()` dùng `skipMissingProperties: false` — khai bắt buộc mà `.env` thiếu là **app không boot được**.
- `package.json` — thêm `ioredis` thành **dependency trực tiếp** (hiện chỉ là dep gián tiếp qua `bullmq`; phụ thuộc vào cây dependency của package khác là mong manh). Bản đang cài: `ioredis@5.10.1`.
- `.env.example` — `DURATION=900`, `REFRESHABLE_DURATION=2592000`, thêm `REFRESH_TOKEN_ABSOLUTE_DURATION=7776000`, `REFRESH_TOKEN_GRACE_PERIOD=10`, `MAX_ACTIVE_SESSIONS=10`, `REDIS_AUTH_DB=1`; bỏ chú thích "chưa có module nào dùng" ở khối Redis.
- `src/auth/auth.service.spec.ts`, `src/auth/auth.controller.spec.ts` — `AuthService` có dependency mới nên mọi `Test.createTestingModule` hiện tại sẽ fail resolve; controller spec gọi `login(dto)`/`refresh(dto)` 1 tham số cũng phải sửa.
- `CLAUDE.md` — cập nhật "Auth flow hiện có" + "Nợ kỹ thuật"; ghi rõ Redis giờ là **thành phần bắt buộc** để chạy app (hiện `setup.md`/CLAUDE.md coi Redis là tuỳ chọn).

**Không đụng tới**: entity/migration/TypeORM (phương án này không thêm bảng nào), `src/app/app.module.ts` trừ khi `RedisModule` không đặt `@Global()`.

## Thứ tự triển khai

Mỗi bước build + `npm test` xanh trước khi sang bước sau.

1. `RedisModule` + `RedisService` + `ioredis` vào `package.json` + env. Boot app, verify kết nối và `/health` báo Redis OK.
2. Mã lỗi mới trong `auth.validation.ts` → boot để guard trùng mã chạy.
3. `RefreshTokenService` + spec đầy đủ (Lua script, rotate/grace/reuse). Chưa ai gọi — bước nhiều logic nhất, test xong mới đấu nối.
4. DTO + claim `sid` + `CurrentUserDto.sessionId` + `JwtStrategy`. Chưa đổi hành vi (`sid` là `undefined`), test cũ vẫn xanh.
5. `AuthService.login`/`refresh` dùng store + sửa `auth.service.spec.ts`. **Bước breaking** — sau đây token cũ hết dùng được.
6. `logout`/`logout-all`/`sessions` + controller + sửa controller spec.
7. Fix `JwtOptionalAuthGuard` + test.
8. `@Throttle` — **sau khi** verify `GET /api/v1/real-ip` trả IP thật.
9. Cập nhật `CLAUDE.md`, `.env.example`, Swagger description.

## Kế hoạch test

`refresh-token.service.spec.ts` — mock `RedisService` trả sẵn kết quả `eval`; **mã trả về của Lua script là thứ duy nhất điều khiển luồng**, y như vai trò của `affected` trong phương án SQL:
- `eval` → `['ROTATED']` → outcome `rotated`, `jti` mới đúng định dạng `{epochMs}-{hex8}`, `sid` giữ nguyên.
- `eval` → `['GRACE', 'GRACE:sid:newJti']` → outcome `grace`, trả `jti === newJti`, `exp` lấy từ `PTTL` chứ không phải `REFRESHABLE_DURATION`, và **không có lệnh ghi nào được gọi thêm**.
- `eval` → `['MISS']` + `EXISTS` session key = 1 → **`reused`** + xoá cả phiên (case quan trọng nhất — reuse sâu bao nhiêu vòng cũng bắt được).
- `eval` → `['MISS']` + `EXISTS` = 0 → `revoked`.
- `MISS` + JWT không có `sid` → `not_found`.
- `createSession`: `ttl = min(sliding, absolute - now)`; khi `REFRESHABLE_DURATION > ABSOLUTE_DURATION` thì `ttl === absolute - now`; UA dài bị cắt; vượt `MAX_ACTIVE_SESSIONS` → thu hồi phiên cũ nhất.
- `listActiveSessions`: sid có trong SET nhưng session key đã hết hạn → bị `SREM` và không xuất hiện trong kết quả (dọn lười).
- `revokeAllForUser` xoá đủ session key + token key + index.

`auth.service.spec.ts` — giữ 6 case cũ, thêm mock `RefreshTokenService`, mở rộng `configService.get` cho các key mới, và:
- `rotated` → `sid` giống nhau ở cả 2 token; refresh token có `jti === outcome.jti`; access token có `jti` **khác** (khoá việc tách jti).
- 4 outcome còn lại map đúng mã lỗi 100009 / 100005 / 100003.
- **user inactive → `USER_NOT_ACTIVE` và `expect(rotate).not.toHaveBeenCalled()`** (khoá thứ tự ở bước 2 luồng refresh) + `revokeAllForUser` được gọi.
- `refresh` truyền đúng `payload.sid` xuống `rotate`.
- `logout(undefined)` → `{ revokedSessions: 0 }`, không throw, không gọi `revokeSession`.
- `listSessions` đánh đúng `isCurrent`; regression `expect(dto).not.toHaveProperty('sid')`.

`auth.controller.spec.ts` — sửa 2 test cũ cho signature 3 tham số, thêm 3 test wrap `AppResponseDto`.

Guard: test `JwtOptionalAuthGuard` khi 2 context đan xen (một `@Public()`, một không).

> Lua script không test được bằng unit test mock. Tính đúng đắn của nó phải verify bằng tay ở mục dưới (đặc biệt case parallel refresh) — đây là điểm yếu về kiểm thử của phương án Redis, cần chấp nhận hoặc bổ sung integration test chạy với Redis thật sau này.

## Verify end-to-end

`BASE=http://localhost:8085/api/v1`, kiểm tra Redis bằng `redis-cli -n <REDIS_AUTH_DB>`.

1. **Login** → `KEYS REFRESH_TOKEN_*` thấy 1 key; `TTL` khớp `REFRESHABLE_DURATION`; `SMEMBERS REFRESH_INDEX_{uid}` có 1 sid.
2. **Decode access token** → có `sid`, `type: access`, `exp - iat === 900`. Refresh token có `jti` dạng `{epochMs}-{hex8}`, và `epochMs` khớp thời điểm login.
3. **Refresh** → key cũ chuyển value sang `GRACE:...` với `TTL ≈ 10`, key mới `ACTIVE:...`, session key có `currentJti` mới. **Vẫn 1 sid trong index**.
4. **Grace**: dùng lại token cũ trong <10s → **200**, và `TTL` của key grace **không được reset** (khoá bất biến #2).
5. **Reuse**: `sleep 12` (key grace đã tự hết hạn) rồi dùng lại token cũ → **401 code 100009**, và toàn bộ key của phiên đó biến mất. Token "sạch" của phiên đó sau đó → **100005**.
6. **Reuse sâu**: login mới → refresh 3 lần → replay token đời đầu → **phải 100009**.
7. **Parallel refresh thật**: 5 request `curl ... &` cùng một token → kỳ vọng **tất cả 200** (1 rotate + 4 grace), không có 100009. Đây là bài test quan trọng nhất cho Lua script.
8. **TTL tự dọn**: set `REFRESHABLE_DURATION=60`, login, `sleep 65`, kiểm tra key đã tự biến mất và `/auth/sessions` trả rỗng (dọn lười SET hoạt động).
9. **sessions / logout / logout-all**: `/auth/sessions` không lộ `sid`/`jti`; sau `logout-all` list rỗng nhưng access token vẫn dùng được ≤15 phút (đúng thiết kế).
10. **Redis chết**: `redis-cli SHUTDOWN NOSAVE` → `/auth/login` và `/auth/refresh` phải trả lỗi rõ ràng (không treo, không 500 trần trụi); `/health` phải đỏ; request với access token còn hạn vẫn chạy bình thường.
11. `GET /api/v1/real-ip` trả IP thật **trước khi** bật `@Throttle`.

Tự động: `npm run lint` && `npm test`.

## Rủi ro khi deploy

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| **Redis thành điểm chết đơn của auth** — Redis down thì không ai login/refresh được (access token còn hạn vẫn chạy ≤15 phút) | **Cao** | Đây là đánh đổi cố hữu của phương án. Bắt buộc: healthcheck Redis, alert, và `retryStrategy` cho client. Cân nhắc Redis có replica trước khi lên prod |
| **`maxmemory-policy` không phải `noeviction`** → phiên bị evict ngẫu nhiên, user đăng xuất không rõ lý do, không log | **Cao, rất dễ bỏ sót** | `redis-cli CONFIG GET maxmemory-policy` trước khi deploy. Bất biến #6 |
| **Dùng chung Redis với BullMQ** → một lần `FLUSHDB` bảo trì queue đăng xuất toàn bộ user | Trung bình | Logical DB riêng cho auth (bất biến #7) |
| **Redis không bật persistence** → restart là mọi user đăng xuất | Trung bình | Bật AOF, hoặc chấp nhận và thông báo trước khi restart |
| **Toàn bộ refresh token cũ chết ngay** sau deploy (không có key → `MISS` → 401). User bị đá về login trong ≤1h | Đã chấp nhận | Deploy giờ thấp điểm + thông báo. **Phải xác nhận FE đã xử lý 401 trên `/auth/refresh` → clear storage → redirect login**; nếu chưa sẽ thành vòng lặp 401 vô tận |
| **`@Throttle` + proxy**: bật khi `TRUST_PROXY_COUNT=0` sau nginx → mọi user chung 1 IP → **khoá login cả hệ thống** | Cao | Bước verify #11 trước khi merge; hoãn `@Throttle` sang PR riêng nếu chưa chắc |
| **`DURATION` 3600→900**: FE không có single-flight refresh sẽ 401 sau 15 phút | Cao | Xác nhận FE trước. Có thể tách 2 lần deploy: (1) Redis store giữ `DURATION=3600`, (2) hạ 900 sau |
| **`REDIS_HOST` thành env bắt buộc** → môi trường nào chưa set sẽ **không boot được** | Trung bình | Kiểm tra `.env` của mọi môi trường trước khi merge |
| **Lua script không có unit test** | Trung bình | Verify tay case #7 mỗi lần sửa script; giữ script ngắn |

## Kèm theo: sửa lỗ hổng `JwtOptionalAuthGuard`

`src/auth/passport/jwt/jwt-optional-auth.guard.ts` lưu `private isPublic` trên **instance của guard singleton** rồi mới `await super.canActivate()`. Hai request đan xen đọc nhầm cờ của nhau; chiều nguy hiểm là request vào route **cần JWT** đọc trúng `isPublic = true` của một request `@Public()` → `handleRequest` trả `{}` thay vì ném 401 → **bypass xác thực dưới tải đồng thời**.

Lỗi có sẵn, không do đợt này gây ra, nhưng nó vô hiệu hoá chính khả năng thu hồi mà kế hoạch này xây dựng — thu hồi phiên vô nghĩa nếu request đi lọt mà không cần token.

Sửa: bỏ field instance, đọc reflector ngay trong `handleRequest` qua tham số thứ 4 (`context: ExecutionContext`) mà `AuthGuard` của Passport truyền vào — mọi state đi theo request thay vì theo instance.
