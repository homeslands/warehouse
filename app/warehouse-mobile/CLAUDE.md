# warehouse-mobile

App di động React Native + Expo (SDK 58, React Native 0.88, React 19.3, TypeScript ~6.0), điều hướng bằng Expo Router. Dùng chung `warehouse-api` với web, không sửa backend. Luồng: đăng nhập → chọn kho → 4 tab (Xuất, Nhập "Nhận hàng", Tồn kho, Tài khoản). Mô tả đầy đủ hiện trạng: `docs/agents/app-scope.md`.

## Lệnh (Node 24: `source ~/.nvm/nvm.sh && nvm use 24`)

- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint flat config (`eslint-config-expo` + `eslint-config-prettier`)
- `npm test` — jest (preset `jest-expo`, `@testing-library/react-native` v14), giới hạn `--maxWorkers=2` cho đỡ nóng máy
- `npm start` / `npx expo start` — chạy Metro
- `npm run check` — lint → typecheck → jest → `bundle:check` (`expo export` iOS + Android vào `dist/`, bắt lỗi bundle/import) → `format:check`; dừng ở bước lỗi đầu tiên. **Chạy trước khi push.**
- `npm run format` — Prettier (`semi: false`, `singleQuote`, `printWidth: 100`, `trailingComma: all`)

Chạy mọi lệnh trong `app/warehouse-mobile`, không chạy npm ở gốc repo. Không bao giờ dùng `--legacy-peer-deps`: xung đột peer thì ghim đúng phiên bản tương thích SDK.

## Expo SDK 58 mới hơn dữ liệu huấn luyện

Trước khi đụng API Expo/EAS/RN phải đọc docs đúng phiên bản https://docs.expo.dev/versions/v58.0.0/ và https://docs.expo.dev/llms.txt. Cài thư viện bằng `npx expo install <pkg>` (không tự ghim phiên bản package của Expo); package có config plugin thì thêm plugin vào `plugins` của `app.config.ts`. RNTL v14: đọc type trong `node_modules/@testing-library/react-native`, đừng viết theo trí nhớ.

## Kiến trúc: Feature-Sliced Design

```
app/         route Expo Router, mỏng: chỉ render screen
src/
  shared/    config, theme, ui, i18n, storage, api   (không import lớp trên)
  entities/  session, warehouse, inventory, import-form, export-form, user   (chỉ import shared)
  features/  auth-login, warehouse-picker, change-password, logout, language-switch, scan-material, receive-checklist, list-filters
  screens/   import-list, export-list, import-detail, export-detail, export-edit, receive, login, select-warehouse, change-password, language, no-access, offline, account, stock, stock-detail
  bootstrap/ providers, SessionGate, session-wiring, tabs, TabsLayout, TabStackLayout, FormModalStackLayout, routing.test.tsx
```

- Luật phụ thuộc: `shared → entities → features → screens → bootstrap / app`. Không import chéo giữa 2 slice cùng lớp. Slice được import qua `index.ts` của nó.
- Alias `@/*` → `src/*`.
- **Luồng 3 bước là modal ở Stack gốc (`/import-form`, `/export-form`); không push bước vào Stack tab** (`docs/agents/compose-kit.md`).
- **Route trong `app/` chỉ render screen.** Mọi file trong `app/` đều là route, nên **test không được đặt trong `app/`**. Test điều hướng nằm ở `src/bootstrap/routing.test.tsx` (render `./app` thật bằng `renderRouter`).
- Điều hướng theo trạng thái dùng `Stack.Protected` với `guard` + `redirectTo` (`SessionGate.tsx`); không có tab nghiệp vụ nào thì sang `no-access`.

- Thanh tab = `NativeTabs` (tab GỐC, không vẽ tab giả bằng JS); mỗi tab là một Stack lồng (`TabStackLayout`) với header native duy nhất; màn đầu tab khai nút phải qua `tabHeaderRight(...)`, đừng tự đặt `unstable_headerRightItems`/`headerRight`. Chi tiết: `docs/agents/header-tabs-navigation.md`.

## Quy tắc xuyên suốt

- **Ghi = xác nhận + khoá**: mọi thao tác ghi xác nhận bằng `confirmAction` (hộp thoại GỐC, không Modal tự vẽ) và chạy qua `useGuardedAction` với `onError` BẮT BUỘC (lỗi không bị nuốt). Ngoại lệ duy nhất (nút cuối bước 3 form 3 bước) xem `docs/agents/ui-foundations.md`.
- **Mọi bottom sheet** = sheet GỐC: route có Stack lồng riêng, dựng bằng `SheetStackLayout` / `sheetScreenOptions` / `SheetScaffold`; route sheet mới phải thêm vào `SHEET_ROUTES`. Chi tiết và danh sách sheet: `docs/agents/sheets.md`.
- **Bàn phím**: màn/sheet có ô nhập dùng `FormScrollView` + `keyboardScrollProps()`, không tự bọc `KeyboardAvoidingView`. Chi tiết: `docs/agents/keyboard.md`.
- **i18n**: không chuỗi giao diện cứng; thêm vào cả `vi` và `en` với bộ key giống hệt nhau (mặc định `vi`).
- **Tiền** luôn qua `formatMoney` (`shared/lib/format`), không tự ghép chuỗi tiền.
- **Chữ**: font hệ thống, không đặt `fontFamily`; số/tiền/đếm/ngày dùng `Text numeric`, mã phiếu/vật tư/kho/NCC/số HĐ dùng `Text code`.
- **Reduce Motion**: luôn tôn trọng `useReducedMotion()` (reanimated). **Rung** qua `haptics` (`shared/lib/haptics.ts`).
- Vùng chạm ≥ 44pt.
- **Không dùng UIMenu đè lên dòng bấm được** (chạm đóng menu lọt xuống dòng bên dưới). Luật chung và ngoại lệ: `docs/agents/export-wizard.md` (menu `⋯` của header form 3 bước), `docs/agents/stock-tab.md` (menu Lọc tab Tồn kho, lỗi đã biết), `docs/agents/import-list.md`.
- **Chạy hằng ngày = Expo Go**, mọi thư viện native hiện dùng đều có sẵn trong Expo Go SDK 58; chỉ build riêng mới cần prebuild/Xcode 26.4+. Chi tiết: `docs/agents/native-libs.md`.

- Biến môi trường: `EXPO_PUBLIC_API_BASE_URL` (đã gồm `/api/v1`, không có `/` cuối), `APP_VARIANT` ∈ `development | preview | production`. `.env` bị git ignore; mẫu ở `.env.example`.
- Bundle ID / package `com.homeslands.warehouse` (+ `.dev` / `.preview`) là **giá trị tạm**, chưa chốt.
- **Không sửa `app/warehouse-api`** (và không sửa `app/warehouse-ui`). Việc cần backend được ghi ở spec §11 (`docs/superpowers/specs/2026-11-03-warehouse-mobile-design.md`, local).

## Bẫy cần nhớ (token và HTTP)

- `getTokens()` đọc đồng bộ; `hydrateTokens()` PHẢI được await trước request đầu tiên (bootstrap đã làm).
- `src/shared/api/http.ts`, `error-codes.ts`, `types.ts`, `routes.ts`, `authority-codes.ts` chép từ `app/warehouse-ui`: đồng bộ lại khi web đổi (ngoại lệ có chủ đích: `timeout` 30s ở mobile).
- Handler của `setSessionEndHandler` PHẢI gọi `clearTokens()` đồng bộ; ghi profile bất đồng bộ phải so `getSessionEpoch()` trước `setUser`.
- `useWarehouseStore.select()` reject nếu chưa `resolveFor(user)`; trạng thái `offline` không tự hồi phục (nút Thử lại gọi `bootstrapSession()`).
- Chi tiết, nguồn danh sách kho theo vai trò, chọn/đổi kho: `docs/agents/warehouses-session.md`.

## Test (cơ bản)

- Test KHÔNG đặt trong `app/`; test điều hướng ở `src/bootstrap/routing.test.tsx`. `jest.setup.ts` mock `expo-secure-store`, AsyncStorage, `expo-haptics`; test HTTP dùng `src/shared/api/testing/fake-api.ts` (không thêm thư viện mock mạng); `lucide-react-native` ánh xạ CJS trong `jest.config.js` (đừng gỡ). Header/tab native không có chữ trong jest; `renderRouter` bật fake timers. Chi tiết: `docs/agents/testing.md`.

## Chỉ mục tài liệu chi tiết (`docs/agents/`)

Chỉ đọc file khớp với việc đang làm; mỗi file bắt đầu bằng dòng "Đọc khi".

| Khu vực                          | File                                    | Đọc khi                                                                              |
| -------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| Hiện trạng tính năng             | `docs/agents/app-scope.md`              | cần biết app có những tab/tính năng nào                                              |
| Tab, header, điều hướng          | `docs/agents/header-tabs-navigation.md` | sửa NativeTabs, header tab/Stack, `tabHeaderRight`, nâng SDK (API `unstable_*`)      |
| Bottom sheet                     | `docs/agents/sheets.md`                 | thêm/sửa sheet, `SHEET_ROUTES`, đóng sheet, test sheet                               |
| Bàn phím                         | `docs/agents/keyboard.md`               | màn/sheet có ô nhập                                                                  |
| Tab Tồn kho                      | `docs/agents/stock-tab.md`              | danh sách tồn, lọc, chi tiết vật tư, quét mã                                         |
| Danh sách phiếu nhập             | `docs/agents/import-list.md`            | tab Nhập: danh sách, bộ lọc, `features/list-filters`                                 |
| Nhận hàng / Kiểm hàng            | `docs/agents/import-checklist.md`       | màn xem phiếu nhập, checklist, `useReceiveDraft`                                     |
| Soạn phiếu nhập                  | `docs/agents/import-wizard.md`          | form 3 bước nhập, sheet dòng/chọn vật tư/bên bán                                     |
| Tab Xuất: danh sách, xem, entity | `docs/agents/export-list-detail.md`     | danh sách/xem phiếu xuất, `entities/export-form`                                     |
| Soạn phiếu xuất                  | `docs/agents/export-wizard.md`          | form 3 bước xuất, sheet, `features/export-draft`                                     |
| Bộ khung form 3 bước             | `docs/agents/compose-kit.md`            | `shared/ui/compose`, wizard helpers, tổng quan luồng 3 bước                          |
| Kho, phiên, token, HTTP          | `docs/agents/warehouses-session.md`     | phiên, token, chọn/đổi kho, nguồn kho theo vai trò                                   |
| Nền tảng giao diện               | `docs/agents/ui-foundations.md`         | chữ, theme, ListGroup, motion, haptics, nút kính, tiền, confirm/guarded action, i18n |
| Thư viện native                  | `docs/agents/native-libs.md`            | Expo Go vs build riêng, camera, datetimepicker, glass, blur, gesture-handler         |
| Test                             | `docs/agents/testing.md`                | jest setup, reanimated, fake-api, helper test header/tab                             |
