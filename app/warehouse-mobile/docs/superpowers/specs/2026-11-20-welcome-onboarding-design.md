# Màn chào (onboarding) — thiết kế ngắn

Ngày: 2026-11-20 · Phạm vi: chỉ `app/warehouse-mobile`

## Mục đích

Giới thiệu ngắn gọn app cho nhân viên kho ngay lúc mới cài. Chỉ có một màn kiểu Apple ("Welcome to …"), không có nhiều trang phải vuốt.

## Mục tiêu / không làm

- Hiện **một lần** trên máy mới cài, trước màn đăng nhập. Thứ tự: lớp phủ logo → màn chào → đăng nhập.
- Người dùng cũ đang đăng nhập sẵn khi cập nhật app **không thấy** màn chào và được tự đánh dấu đã xem, nên đăng xuất sau đó cũng không gặp.
- Không làm: nhiều trang, nút bỏ qua, nút đổi ngôn ngữ (màn đăng nhập đã có), cách mở lại màn chào từ phần Tài khoản.
- Không được: nháy màn chào trước khi biết cờ đã xem, kẹt ở màn chào, để người đang đăng nhập bị đá về màn chào.

## Phương án

- **A. Một màn riêng (route `/welcome`) — ĐÃ CHỌN.** Thêm đích `welcome` vào `destinationFor` và đặt route trong `Stack.Protected` như các màn khác. Nút Back Android và trình đọc màn hình hoạt động đúng; kiểm được bằng bộ test điều hướng sẵn có.
- B. Lớp phủ đè lên `/login`: không đụng điều hướng và chuyển cảnh liền mạch, nhưng phải tự che màn đăng nhập khỏi trình đọc màn hình và tự chặn nút Back. Không chọn.

## Cách làm (đã chốt)

- **Cờ**: lưu bằng `kv`, khoá `warehouse.welcomeSeen` (true). Giống giao diện và ngôn ngữ, cờ theo máy, không theo tài khoản, và đăng xuất không xoá. Store zustand nhỏ `useWelcome` có `{ seen: boolean | null }`; `initWelcome()` chạy song song trong `useAppBootstrap`, cùng `initI18n` / `initAppearance` / `bootstrapSession`. Đọc lỗi thì coi như **đã xem**, để không bao giờ chặn đăng nhập.
- **Điều hướng**: `destinationFor(status, resolution, user, welcomeSeen)`, trong đó `unauthenticated` + `!welcomeSeen` → `'welcome'`, còn lại như cũ. `hrefFor('welcome') = '/welcome'`. Trong `SessionGate` thêm `<Stack.Protected guard={destination === 'welcome'}><Stack.Screen name="welcome" /></Stack.Protected>`; file route mỏng `app/welcome.tsx`.
- **Người dùng cũ**: khi `status` thành `authenticated` (phiên có sẵn hoặc vừa đăng nhập) mà chưa có cờ thì ghi cờ.
- **Bấm "Bắt đầu"**: ghi cờ, store đổi `seen = true`, đích thành `login` và `Stack.Protected` chuyển sang `/login`.
- **Offline / đang tải**: giữ như cũ (`offline`, `splash`). Màn chào chỉ thay cho `login`.
- **Màn** `src/screens/welcome/WelcomeScreen.tsx`, trắng đen, khớp lớp phủ logo. **Bố cục theo mẫu A, kiểu "Có gì mới" của Apple** (người dùng chọn ngày 2026-11-20 trong demo 3 mẫu: https://claude.ai/artifact/FUh9aCZziJsfmY5aSsAxmx). Nền `background`, khối logo và tiêu đề căn giữa; không dùng thẻ, icon không có ô nền.
  - Trên: logo Soko (ảnh `splash-icon(.png|-dark.png)` theo giao diện, rộng khoảng 130pt; chỉ lấy phần chữ vì ảnh gốc có nhiều lề trong suốt) và tiêu đề "Chào mừng tới Soko" căn giữa, chữ to đậm khoảng 28pt (vai trò header).
  - Giữa: 3 dòng căn trái, cách nhau rộng (khoảng 24pt). Mỗi dòng có icon lucide nét trong `src/shared/ui/icons.ts` (khoảng 30pt, màu `foreground`), tiêu đề đậm và mô tả màu `secondaryForeground`:
    - `ScanBarcode`: Quét mã nhập / xuất — "Lập phiếu nhanh bằng camera, không cần gõ mã."
    - `Package`: Tồn kho & hạn dùng — "Biết ngay vật tư sắp thiếu, sắp hết hạn hay đã quá hạn."
    - `ShoppingCart`: Đề xuất đặt hàng — "Gom vật tư cần đặt theo nhà cung cấp, gửi đi trong vài chạm."
  - Dưới: nút chính "Bắt đầu" ghim đáy, dùng `Button` sẵn có, trong safe area.
  - Chuyển động: tiêu đề và từng dòng hiện lần lượt (mờ + trượt lên nhẹ, cách nhau ~120 ms) sau khi lớp phủ logo xong; nút hiện cuối. Bật Reduce Motion thì hiện ngay, không chuyển động. Nội dung cuộn được khi chữ lớn hoặc máy nhỏ.
- **i18n**: thêm vi + en vào `common.json` (khoá `welcome.*`). Bản en: "Welcome to Soko" · "Scan to receive & issue / Create forms with your camera, no typing codes." · "Stock & expiry / See what's running low, expiring soon or expired." · "Reorder suggestions / Group items to order by supplier and send in a few taps." · "Get Started".

## Lưu ý cho người làm

- `routing.test.tsx` gọi `AsyncStorage.clear()` trong `beforeEach`, nên mọi test đang mong `/login` sẽ rơi vào `/welcome`. Cần đặt sẵn cờ đã xem ở `beforeEach` và viết test riêng cho các trường hợp: lần đầu → `/welcome`; bấm Bắt đầu → `/login`; phiên có sẵn → tab, đồng thời ghi cờ; đọc cờ lỗi → `/login`.
- Phần tự quyết khi làm: số đo, khoảng cách và easing cụ thể.
- Cập nhật tài liệu một lần ở cuối: `docs/agents/warehouses-session.md` (luồng đích) cộng một dòng trong CLAUDE.md nếu cần.
