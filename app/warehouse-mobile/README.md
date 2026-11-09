# warehouse-mobile

App di động (React Native + Expo SDK 58) cho nhân viên kho: nhập, xuất, tra tồn kho. Dùng chung `warehouse-api` với web. Hiện là bản khung: đăng nhập, chọn kho, 4 tab (3 tab nghiệp vụ còn là placeholder), tab Tài khoản (đổi ngôn ngữ, đổi mật khẩu, đăng xuất).

## Cài đặt và chạy

Cần Node 24 (xem `.nvmrc`):

```bash
source ~/.nvm/nvm.sh && nvm use 24
npm install
cp .env.example .env     # rồi chỉnh EXPO_PUBLIC_API_BASE_URL theo máy
npx expo start
```

`EXPO_PUBLIC_API_BASE_URL` đã gồm `/api/v1`, không có `/` cuối:

| Chạy trên        | URL                                                         |
| ---------------- | ----------------------------------------------------------- |
| iOS simulator    | `http://localhost:8085/api/v1`                              |
| Android emulator | `http://10.0.2.2:8085/api/v1`                               |
| Máy thật         | `http://<IP LAN của máy chạy API>:8085/api/v1` (cùng Wi-Fi) |
| Sandbox          | `https://sandbox.warehouse.cmsiot.net/api/v1.0.0`           |

Đổi `.env` xong phải khởi động lại Metro (`npx expo start -c`).

Lệnh kiểm tra: `npm run typecheck`, `npm run lint`, `npm test`.

## Build bằng EAS

`eas.json` có 3 profile:

```bash
eas build --profile development --platform all   # development client, cài nội bộ
eas build --profile preview --platform all       # Android APK / iOS ad hoc (nội bộ)
eas build --profile production --platform all    # bản phát hành, tự tăng build number
```

Mỗi profile đặt `APP_VARIANT` (`development | preview | production`), `EXPO_PUBLIC_APP_VARIANT` và `EXPO_PUBLIC_API_BASE_URL`. Bundle ID thêm hậu tố `.dev` / `.preview` cho 2 biến thể đầu.

Phân phối:

- `distribution: "internal"` trên iOS là **ad hoc**, KHÔNG phải TestFlight: thiết bị phải đăng ký trước bằng `eas device:create` (tối đa 100 thiết bị).
- TestFlight cần build store (profile `production`) rồi `eas submit --platform ios`.
- Spec §10 ghi "preview (APK / TestFlight)": hiểu là Android APK qua `preview`; iOS thì ad hoc qua `preview`, hoặc TestFlight qua `production` + `eas submit`.

## TODO trước khi phát hành

- [ ] **Bundle ID / package thật**: hiện là giá trị tạm `com.homeslands.warehouse`.
- [ ] **URL API production**: `eas.json` profile `production` đang trỏ sandbox.
- [ ] **Tài khoản Apple Developer, Google Play và Expo** (EAS) của công ty.
- [ ] **Dạng store — chưa chốt**:
  - công khai: cần trang chính sách quyền riêng tư, tài khoản demo cho Apple duyệt, đường xoá tài khoản (backend chưa có API);
  - riêng tư cho công ty: Apple Business Manager (Custom App) + Managed Google Play, công ty cần số D-U-N-S.

## Bộ quyền khuyến nghị cho vai trò nhân viên kho

Với quyền mặc định (migration `1783728000012`), luồng "văn phòng tạo, kho sửa" không chạy, vì Supervisor chỉ có `*_UPDATE_DRAFT_OWN` còn Manager không có quyền sửa nháp. Admin cấp thêm `IMPORT_FORM_UPDATE_DRAFT` và `EXPORT_FORM_UPDATE_DRAFT` (cùng `MATERIAL_READ` + `WAREHOUSE_READ` để xem lô/tồn) cho vai trò của nhân viên kho, qua màn Phân quyền trên web. Không sửa code hay migration. App ẩn/hiện theo quyền thật nên không phụ thuộc cấu hình này, nhưng nên cấp bộ sau:

- `IMPORT_FORM_READ`, `IMPORT_FORM_CREATE`, `IMPORT_FORM_UPDATE_DRAFT`, và `IMPORT_FORM_CONFIRM` nếu được tự xác nhận;
- `EXPORT_FORM_READ`, `EXPORT_FORM_CREATE`, `EXPORT_FORM_UPDATE_DRAFT`, và `EXPORT_FORM_CONFIRM` nếu được tự xác nhận;
- `MATERIAL_READ`, `WAREHOUSE_READ`.

Lưu ý: thêm dòng vào phiếu nhập cần `IMPORT_FORM_CREATE`.

## Kiểm tra tay trên máy

- [ ] Đăng nhập bằng tài khoản sandbox.
- [ ] Chọn kho (tài khoản nhiều kho thấy màn chọn; một kho thì vào thẳng).
- [ ] Các tab hiện đúng theo quyền; tài khoản không có quyền nào thấy màn "chưa được cấp quyền".
- [ ] Tắt hẳn app rồi mở lại: vào thẳng, không phải đăng nhập lại.
- [ ] Chế độ tối/sáng theo hệ thống đều đọc rõ.
- [ ] Đổi mật khẩu (có hộp xác nhận), đăng nhập lại bằng mật khẩu mới.
- [ ] Đăng xuất mọi thiết bị (có hộp xác nhận) → về màn đăng nhập.
- [ ] Bật chế độ máy bay rồi mở app lạnh → màn offline; tắt chế độ máy bay, bấm thử lại → vào được.
