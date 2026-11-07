> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# WH-PRO-W01-EXEC-20261105-R1 — Từ tài liệu đến thực thi

Phê duyệt protocol bởi điều phối05/11/2026. Các lệnh sau **chưa chạy trong task lập kế hoạch/issue**; worker chạy sau khi nhận ownership. Kết quả phải vào run record.

## Backend — chạy trong app/warehouse-api

```bash
node --version
npm test -- --runInBand
npx tsc --noEmit --incremental false -p tsconfig.json
npx tsc --noEmit --incremental false -p tsconfig.build.json
npx eslint "{src,apps,libs,test}/**/*.ts" --no-fix
npx nest build
```

Sau khi BE-02 implement harness/config/test thực sự:

```bash
npm run test:e2e -- --runInBand
```

Script bootstrap/migration/seed/reset là đầu ra BE-02, không giả đã tồn tại. Không dùng config typeorm mặc định import dotenv hoặc chạy npm typeorm:r vào DB hiện hữu. Config test phải chỉ nhận target grant, fail-closed trước connect/write, không synchronize. App composition test dùng guard/repository/DB thật; vô hiệu cron và transport ra ngoài, fake external provider ghi SIMULATED, không gọi kết quả đó là S3/email thật PASS.

## Frontend — chạy trong app/warehouse-ui

```bash
node --version
npm run check
```

Sau khi FE-02 thêm Playwright và cấu hình hai project desktop/mobile:

```bash
npx playwright test --project=desktop --project=mobile
```

Browser login/list chạy với API thật và fixture thường từ BE. Không route.fulfill hoặc mock HTTP trong bài REAL_API. Viewport1440/390; trace/screenshot/report và console errors gắn run ID. Không bật capability chưa có API.

## Fixture và basic RBAC

Giữ8actor/3kho base trong R2. Riêng W01-TC06, tạo custom role cùng family SUPERVISOR bỏ WAREHOUSE_READ, gán cho actor test SUP_A_NO_EXPORT trong case rồi reset; không đổi shared role làm các user khác mất quyền. Không tạo nhiều vai trò nghiệp vụ mới hay account ngoài target test.

Fixture R2 dùng field target `phoneNumber`, trong khi DTO legacy nhận `phonenumber`; adapter test phải map rõ hai tên này. Các số `+999...` trong fixture target là placeholder, không truyền vào CreateUserRequestDto legacy có regex VN. Dùng dữ liệu test hợp lệ riêng trong target đã cấp (ví dụ dãy0900000001–0900000008, không gửi SMS), giữ actor alias/UUID để đối chiếu. Mapping firstName/lastName và quan hệ kho cũng phải theo entity legacy thực tế; không seed graph vi phạm ràng buộc để giả scope v1 đã hoạt động. Ghi những quan hệ target chưa implement vào gap W02/W03, không báo full R2 RBAC PASS từ smoke W01.

POST/auth/login, GET/auth/me và GET/warehouses là API legacy đã thấy trong source; không giả v1 target đã chạy. E02b chỉ là bootstrap/basic auth/RBAC/harness readiness. Refresh rotation/cookie, idle, toàn bộ quyền/state và kiến trúc gRPC được kiểm ở W02 sau implement; W01 không cấp miễn trừ yêu cầu đó.

## Tester và bàn giao

QA chạy lại đầy đủ case W01-TC01..12 trên diff cuối; ghi expected/actual, không thay bằng log audit04/11. Reviewer độc lập đọc đúng diff; owner acceptance có thật. Với defect ngoài scope, điều phối chốt issue/CR và forecast, không hạ tiêu chí hoặc sửa migration đã chạy để ghi PASS.
