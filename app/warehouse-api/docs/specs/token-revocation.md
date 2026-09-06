# Spec: token-revocation (deny-list trên Redis)

## Mục tiêu

Thu hồi token có hiệu lực **ngay ở request kế tiếp**, thay cho mô hình allow-list cũ (`REFRESH_TOKEN_*`/`REFRESH_SESSION_*`/`REFRESH_INDEX_*`, xem `docs/plans/revise-flow-refresh-token-idempotent-snowglobe.md`) — nơi `logout` chỉ giết được refresh token còn access token vẫn sống tối đa `DURATION` giây.

Redis chỉ còn **đúng 2 loại key**, và **chỉ ghi khi thu hồi** — login/refresh không ghi gì.

## Mô hình dữ liệu (cùng `REDIS_AUTH_DB` với cache RBAC)

| Key | Value | TTL | Ghi khi |
|---|---|---|---|
| `BLACK_LIST_{uid}_{sid}` | `"1"` | `REFRESHABLE_DURATION` | `POST /auth/logout` |
| `TOKEN_IAT_AVAILABLE_{uid}` | mốc epoch **giây** | `REFRESHABLE_DURATION` | `POST /auth/logout-all`; sau này: đổi mật khẩu, xoá tài khoản |

**Vì sao key theo `sid` chứ không phải `jti`:** `/auth/logout` chỉ cầm access token, mà `jti` của access và refresh token **khác nhau** — bỏ session store thì không còn chỗ nào tra ra `jti` của refresh token. Cả 2 token lại mang **cùng `sid`**, nên 1 key giết được cả cặp.

**Vì sao TTL là `REFRESHABLE_DURATION` (bất biến, không được hạ):** token sống lâu nhất mang `sid`/`iat` đó là refresh token. Vì `/auth/refresh` ký lại refresh token với `exp` mới, một token có thể vừa phát ra ngay trước lúc thu hồi ⇒ còn sống thêm tối đa `REFRESHABLE_DURATION`. Key thu hồi hết hạn sớm hơn = token cũ **sống lại**.

## Luồng

| Endpoint | Redis |
|---|---|
| `POST /auth/login` | **không đọc, không ghi**. Sinh `sid = uuidv4()`, ký cặp token. |
| `POST /auth/refresh` | **1 lệnh đọc** (check thu hồi), **0 lệnh ghi**. Ký lại **cả 2** token, `exp` mới, **giữ nguyên `sid`**. |
| `POST /auth/logout` | `SET BLACK_LIST_{uid}_{sid} "1" EX REFRESHABLE_DURATION` |
| `POST /auth/logout-all` | `SET TOKEN_IAT_AVAILABLE_{uid} <now>` **+** `SET BLACK_LIST_{uid}_{sid}` cho phiên đang gọi (xem khe hở 1 giây bên dưới) |
| Mọi request có JWT | **1 lệnh đọc** trong `JwtStrategy.validate` |

Check thu hồi (`TokenRevocationService.isRevoked`) dùng **1 round-trip**: `MGET BLACK_LIST_{uid}_{sid} TOKEN_IAT_AVAILABLE_{uid}`. Từ chối khi key blacklist tồn tại **hoặc** `payload.iat < cutoff`. Token không có `sid` (phát trước khi có claim này) chỉ còn bị cutoff chặn — dùng `GET` 1 key.

Đặt check **trước** `findByIdWithAuthorities` trong `JwtStrategy`: token đã chết thì không tốn thêm 1 query MySQL.

Giữ `sid` **ổn định qua mỗi lần refresh** là điều kiện để blacklist theo `sid` giết cả chuỗi token của thiết bị đó, không chỉ token hiện hành.

## Bất biến

- **Fail-closed**: `isRevoked()` không đọc được Redis ⇒ **coi như đã thu hồi**, từ chối request. Cơ chế thu hồi mà chỉ cần làm Redis chết là bypass được thì không phải cơ chế bảo mật. Đánh đổi: Redis chết = mọi request có JWT đều 401. Đây là khác biệt có chủ ý với cache RBAC (`docs/specs/rbac.md`) — cache RBAC hỏng thì đọc DB vẫn ra đúng quyền, còn ở đây không có nguồn nào khác để đối chiếu.
- Ghi thu hồi (`logout`/`logout-all`) **throw khi Redis lỗi**, không nuốt: logout im lặng không có tác dụng còn tệ hơn 5xx bảo client thử lại.
- TTL của cả 2 key ≥ `REFRESHABLE_DURATION` (xem trên).
- `/auth/refresh` **không ghi Redis**. Thêm bất kỳ lệnh ghi nào vào đây là quay lại mô hình allow-list.

## Đánh đổi đã chấp nhận

- **Không còn reuse detection.** Refresh token bị đánh cắp dùng được như token thật cho tới khi hết hạn hoặc user logout. Trước đây replay một refresh token đã xoay vòng sẽ bị coi là trộm và thu hồi cả phiên.
- **Refresh token cũ không chết khi refresh.** `/auth/refresh` phát token mới nhưng không thu hồi token cũ (sẽ phải ghi Redis mỗi lần refresh). Token cũ sống tới `exp` của chính nó.
- **Khe hở dưới 1 giây ở `logout-all`, đã bịt phần nguy hiểm nhất.** `iat` chỉ có độ phân giải 1 giây: token ký **cùng giây** với `logout-all` có `iat == cutoff`, mà điều kiện là `iat < cutoff`, nên lọt. Verify thật đã bắt được lỗi này: chạy login → `logout-all` → `GET /auth/me` trong cùng 1 giây thì `/auth/me` vẫn trả 200, tức token sống thêm tối đa `DURATION` (đang là 3600s trong `.env`).

  Cách xử lý: `logout-all` ghi **thêm** `BLACK_LIST_{uid}_{sid}` cho chính phiên đang gọi — token nằm trong tay người vừa bấm nút chết chắc chắn, không phụ thuộc độ phân giải `iat`. Token của **thiết bị khác** vẫn do cutoff lo, và chúng phát từ trước nên thực tế không dính khe hở này.

  Cố tình **không** dùng `cutoff = now + 1` để bịt: làm vậy thì user login lại ngay trong giây đó sẽ nhận token bị chính cutoff của mình từ chối (login trả 200 nhưng token 401 ngay — lỗi chập chờn rất khó debug). Đổi lại còn đúng một khe hở lý thuyết: token của thiết bị khác **ký đúng cùng giây** với `logout-all`.
- **Không còn `GET /auth/sessions`, `MAX_ACTIVE_SESSIONS`, cửa sổ grace, trần tuyệt đối.** Không còn nguồn dữ liệu nào để liệt kê phiên đang mở.
- `LogoutAuthResponseDto.revokedSessions` giữ tên field (không phá client) nhưng đổi nghĩa thành `0|1` = "đã ghi key thu hồi hay chưa" — không còn đếm được số phiên thật.

## Ngoài phạm vi

- **Đổi mật khẩu / xoá tài khoản**: hiện **chưa có endpoint nào** trong code (xem `docs/specs/user.md`). Spec này chỉ dựng sẵn primitive `TokenRevocationService.revokeAllTokensForUser(userId)`; khi làm 2 tính năng đó thì gọi nó là đủ, không phải thiết kế lại.
- Không đổi `CurrentUserDto.sessionId` (vẫn cần cho `logout`).
- Không đụng `src/config/session.config.ts` (`express-session` + `session_tbl`) — cơ chế khác hẳn, chỉ trùng tên.
