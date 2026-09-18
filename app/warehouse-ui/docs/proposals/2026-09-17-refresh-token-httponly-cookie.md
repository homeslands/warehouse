# Đề xuất: chuyển refresh token sang cookie httpOnly

- Người đề xuất: frontend (warehouse-ui)
- Ngày: 2026-09-17
- Trạng thái: chờ backend xem xét

## Hiện tại

`POST /auth/login`, `/auth/refresh`, `/auth/change-password` trả `{ accessToken, refreshToken }` trong body.
Frontend lưu cả hai vào `localStorage` (`warehouse.auth`), vì không có cách nào khác để giữ phiên qua F5.

## Rủi ro

Refresh token sống **30 ngày** (`REFRESHABLE_DURATION=2592000`), nhưng mỗi lần `POST /auth/refresh`
backend ký lại CẢ access lẫn refresh token với `exp` mới (giữ nguyên `sid`), và token cũ không bị vô
hiệu. Chỉ cần một lỗ XSS (thư viện bên thứ ba, nội dung người dùng render sai cách) là script đọc được
`localStorage`, mang refresh token đi và **gia hạn phiên vô thời hạn** — cứ dưới 30 ngày refresh một lần
— kể cả khi người dùng đã tắt trình duyệt. Chỉ `logout` (thu hồi `sid`), `logout-all` hoặc đổi mật khẩu
mới chặn được. Access token (15 phút) bị lộ thì thiệt hại nhỏ hơn nhiều.

## Đề xuất

1. `login`, `refresh`, `change-password` đặt refresh token vào cookie:
   `Set-Cookie: refresh_token=…; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth; Max-Age=2592000`.
   Body chỉ còn `accessToken`.
2. `POST /auth/refresh` đọc refresh token từ cookie.
3. `logout` và `logout-all` xoá cookie (`Max-Age=0`, cùng `Path`).
4. **Chống CSRF** cho `/auth/refresh`, `/auth/logout`, `/auth/logout-all`: `SameSite=Lax` chặn phần lớn;
   thêm kiểm tra header `Origin` nằm trong `ALLOWED_ORIGINS`.
5. **CORS**: `credentials: true` với danh sách origin cụ thể (không dùng `*`).
6. **Chuyển tiếp**: trong một giai đoạn, `/auth/refresh` nhận refresh token từ cookie **hoặc** body, để
   frontend cũ không vỡ trong lúc deploy lệch nhau.

## Nên cân nhắc thêm

- **Xoay vòng refresh token**: mỗi lần refresh phát refresh token mới, token cũ hết hiệu lực.
- **Phát hiện dùng lại**: refresh token đã bị thay mà vẫn được gửi lên → nghi bị đánh cắp → thu hồi cả phiên (`sid`).

## Phần frontend sẽ sửa khi backend xong

- `src/shared/api/token-storage.ts`: chỉ còn giữ access token (bộ nhớ hoặc `sessionStorage`).
- `src/shared/api/http.ts`: lời gọi refresh bỏ body, bật `withCredentials` cho `refreshClient` và các lời gọi logout.
- Đồng bộ nhiều tab: không còn đọc được refresh token → dùng `BroadcastChannel` báo đăng nhập/đăng xuất.
