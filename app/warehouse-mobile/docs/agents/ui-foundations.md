# Nền tảng giao diện

Đọc khi: đụng chữ/theme/`ListGroup`, chuyển động (Reduce Motion), haptics, nút nổi/kính, định dạng tiền, hộp xác nhận ghi (`confirmAction`/`useGuardedAction`), i18n.

- **Icon** chỉ import từ `@/shared/ui/icons` (trong `shared/ui` dùng `./icons`), KHÔNG từ `'lucide-react-native'` (ESLint `no-restricted-imports` chặn; `import type` vẫn được). Metro không tree-shake barrel của gói nên import gốc kéo ~1.9 MB / 2000+ module vào bundle; `icons.ts` nạp từng icon qua subpath `lucide-react-native/icons/<tên-kebab>`. Thêm icon mới = thêm một dòng `export { default as X } from ...` vào `icons.ts`.
- Mọi thao tác ghi (đổi mật khẩu, đăng xuất, đăng xuất mọi thiết bị): xác nhận bằng `confirmAction` (`src/shared/lib/native-confirm.ts` — hộp thoại GỐC: action sheet iOS / Alert Android, mượt hơn Modal tự vẽ) + chạy qua `useGuardedAction` (`src/shared/lib/useGuardedAction.ts`: khoá đồng bộ chống bấm đôi, thành công giữ khoá tới `reset()`, **`onError` là bắt buộc** — lỗi không bao giờ bị nuốt). Không dùng lại Modal tự vẽ cho hộp xác nhận. Ngoại lệ DUY NHẤT (spec form-wizard §6): nút cuối của bước 3 "Xác nhận" trong form 3 bước (phiếu xuất "Gửi duyệt", phiếu nhập "Lưu nháp") KHÔNG hỏi lại — chính bước đó là bước xác nhận (hộp hỏi sẽ lặp đúng nội dung vừa xem); vẫn chạy qua `useGuardedAction`. "Lưu nháp" của phiếu xuất vẫn hỏi. Phiếu nhập "Lưu & xác nhận" (cộng tồn ngay, không đảo ngược) VẪN hỏi lại.

- **Chữ (typography)**: dùng font HỆ THỐNG (iOS SF Pro, Android Roboto) — không còn Geist/Geist Mono, không tải font nào (Expo Go không bị ảnh hưởng). KHÔNG đặt `fontFamily` cho chữ thường; chỉ `fontWeight` qua `fontStyle(weight)` (`shared/theme/fonts.ts`). Hai vai đặc biệt trên `Text` (không còn prop `mono`): `numeric` (tiền/số lượng/đếm/phần trăm/ngày: `fontVariant: ['tabular-nums']` để cột thẳng hàng; helper `numericStyle`) và `code` (mã phiếu/vật tư/kho/NCC, số HĐ: font đơn cách hệ thống — iOS `ui-monospace` = SF Mono, Android `monospace`; helper `codeStyle`). Chỗ không dùng `Text` (headerTitleStyle, headerLargeTitleStyle, labelStyle tab, TextInput) dùng các helper này; header/large title bỏ `fontFamily` để iOS tự vẽ kiểu tiêu đề native.

- Không viết chuỗi giao diện cứng trong component. Chữ mới thêm vào **cả `vi` và `en`** với bộ key **giống hệt nhau**; key đặt trùng tên với warehouse-ui khi có. Mặc định `vi`.

- Nhãn tab dùng `nav:tab.*` (ngắn), tiêu đề lớn dùng `nav:*` (dài).

- `Screen` có prop `edges`; các tab dùng `['left','right']` vì header native/tab bar đã lo inset trên/dưới. Màn dạng nhóm (tab, chọn kho) dùng `tone="grouped"` + `ListGroup`/`ListRow`/`SectionHeader` trong `shared/ui`. Kiểu iOS 26/27 (màn Tài khoản): `ListGroup large` (bo `radius.groupLarge` = 26) + `ListRow large` (cao 50, ô icon 30, đường kẻ lùi 58) + `SectionHeader variant="sentence"`; `radius.group` 12 giữ nguyên cho các màn khác.

- Chuyển động dùng `react-native-reanimated` (4.x, plugin Babel do `babel-preset-expo` tự thêm — không có `babel.config.js`), thông số chung ở `src/shared/lib/motion.ts`. **Luôn tôn trọng Reduce Motion**: đọc `useReducedMotion()`, khi bật thì bỏ scale/nảy/lắc và đổi tức thì; layout animation (`FadeInDown`…) mặc định theo hệ thống. Lần render đầu không chạy hiệu ứng (so với giá trị đã hiện trong `useRef`); callback bất đồng bộ (vd ghi xong) phải kiểm còn mounted trước khi hẹn giờ/điều hướng.

- Rung dùng `haptics` (`src/shared/lib/haptics.ts`, bọc `expo-haptics`, nuốt lỗi máy không hỗ trợ): `selection()` khi đổi lựa chọn, `success()`/`error()` khi ghi xong/lỗi. Nội dung phụ thuộc kho bọc trong `WarehouseTransition` (features/warehouse-picker) để mờ-hiện khi đổi kho; tên trên nút kho trượt/mờ sang tên mới (`WarehouseBarButton`).

- **Tiền** luôn qua `formatMoney` (`shared/lib/format`): số nguyên ngăn nghìn theo locale + " đ" ở cuối cho cả vi ("46.176.000 đ") lẫn en ("46,176,000 đ") — không dùng ký hiệu ₫, không tự ghép chuỗi tiền.

- **Nút tạo nổi** (`FloatingCreateButton`): Liquid Glass tô `colors.accent` (xanh dương hệ thống, `GlassView tintColor`), icon `accentForeground`; dự phòng (không có kính) là hình tròn đặc `accent`. Nút tròn kính dùng chung là `GlassCircleButton` (`shared/ui`: điều kiện có kính `canUseLiquidGlass()`, không opacity/scale trên kính, dự phòng hình tròn đặc + bóng); nút "+" ở đáy màn phiếu dùng nó với kính KHÔNG tô màu.
- Dòng/thẻ bấm được nằm trong vùng cuộn (có đổi nền/scale theo `pressed`) dùng `unstable_pressDelay={ROW_PRESS_DELAY_MS}` (`shared/ui/press.ts`): vuốt cuộn không nháy nền, chạm nhanh vẫn gọi `onPress`. Nút nhỏ/header/thanh đáy thì không.
