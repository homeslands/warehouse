---
name: verify-feature
description: Chạy thực tế warehouse-api và gọi thử route của 1 feature vừa code (không chỉ dựa vào unit test) để xác nhận response đúng AppResponseDto, đúng phân quyền role, đúng quy tắc nghiệp vụ trong spec. Dùng ở bước 7 (Verify) của docs/WORKFLOW.md, sau khi lint/test đã pass, trước khi báo hoàn thành feature.
paths: "app/warehouse-api/**"
---

# Verify feature (warehouse-api)

Kiểm tra 1 feature **chạy thật đúng như spec**, không chỉ pass unit test. Unit test xác nhận code không tự mâu thuẫn với chính nó; skill này xác nhận hành vi API thật khớp với `docs/specs/<feature>.md`.

## Khi nào dùng

Sau khi `npm run lint` và `npm run test` đã pass (bước 7 trong `docs/WORKFLOW.md`), trước khi báo với user là feature đã xong. Bỏ qua nếu chỉ sửa 1 dòng nhỏ không ảnh hưởng route/hành vi API.

## Các bước

1. **Xác định feature đang verify** — đọc `docs/specs/<feature>.md` (nếu có) để biết: field thật, quy tắc nghiệp vụ, bảng phân quyền theo role, danh sách API cần kiểm.

2. **Đảm bảo app đang chạy** — kiểm tra process đang lắng nghe đúng `PORT` trong `.env` (không tự đoán cổng mặc định 8081, luôn đọc `.env` thật). Nếu chưa chạy, khởi động `npm run dev` ở chế độ background, đợi log "Nest application successfully started" (hoặc tương đương) rồi mới gọi request — không gọi request khi app còn đang bootstrap.

3. **Lấy access token nếu route cần JWT** — gọi `POST /api/{VERSION}/auth/login` bằng tài khoản root (`ROOT_PHONENUMBER`/`ROOT_PASSWORD` trong `.env`, mặc định `root`/`root`) để có token role `SUPER_ADMIN`, dùng test route giới hạn bởi `@RequireAuthority(...)` (`SUPER_ADMIN` bypass mọi check, luôn gọi được). **Không có endpoint đăng ký công khai** (`POST /auth/register` đã bỏ) — nếu spec yêu cầu test route theo role thấp hơn, dùng token `SUPER_ADMIN` gọi `POST /api/{VERSION}/users` (tạo user kèm gán `roleSlug`, xem `docs/specs/user.md`) để tạo user test theo đúng role cần, rồi login bằng user đó. Role đó có/không có quyền tuỳ vào `permission_tbl` hiện tại (bật/tắt qua `PUT/DELETE /roles/:roleSlug/authorities/:authorityCode`), không phải role hardcode trong code.

4. **Gọi lần lượt từng route trong mục "API cần có" của spec** bằng `curl` (hoặc tool HTTP có sẵn), đối chiếu:
   - Response bọc đúng `AppResponseDto` (`statusCode`, `timestamp`, `result`, `message`) — danh sách phân trang thì `result` phải đúng `AppPaginatedResponseDto`.
   - HTTP status đúng (201 cho create, 200 cho các action khác — xem `example.controller.ts` làm chuẩn).
   - Role không đủ quyền → bị chặn đúng (gọi lại route create/update/delete bằng token role không có authority tương ứng theo bảng "Quyền truy cập" trong spec, phải nhận lỗi 401/403, không được lọt qua).

5. **Test riêng từng quy tắc nghiệp vụ trong spec** — với mỗi rule ở mục "Quy tắc nghiệp vụ", gọi request cố tình vi phạm rule đó, xác nhận bị chặn đúng mã lỗi khai báo trong `<feature>.validation.ts` (không phải lỗi 400 validate chung chung do message không khớp key — xem mục 5 "Quy tắc quan trọng" trong `CLAUDE.md`).

6. **Kiểm tra Swagger** (`http://localhost:{PORT}/api/api-docs`) hiển thị đúng endpoint mới, đúng `@ApiTags`/`@ApiResponseWithType`.

7. **Báo cáo kết quả** — liệt kê từng route/rule đã test, pass/fail. Nếu fail, sửa code rồi lặp lại bước 4-5 cho route/rule đó, không cần chạy lại toàn bộ từ đầu.

8. **Đề xuất cải tiến skill** — nếu trong quá trình verify gặp 1 case/lỗi/cách xử lý mà các bước 1-7 ở trên **chưa từng đề cập** (vd 1 dạng lỗi lạ, 1 cách gọi API đặc biệt, 1 bẫy dễ verify sai), **hỏi user trước** (nêu rõ nội dung định thêm) — chỉ append vào mục "Bài học rút ra" cuối file sau khi user đồng ý. Không tự sửa file khi chưa được xác nhận, không sửa nội dung các bước 1-7 đã có.

## Lưu ý

- Không tự bịa response mong đợi nếu spec không nói rõ — nếu phát hiện spec thiếu case, dừng lại hỏi user thay vì tự đoán rồi verify theo giả định sai.
- Không dùng skill này để thay thế `npm run test`/`test:e2e` — 2 loại test đó vẫn bắt buộc chạy trước, skill này bổ sung phần mà unit test không phủ được (hành vi request/response thật, tương tác giữa các guard/module).

## Bài học rút ra

> Mục này được chính skill tự cập nhật sau mỗi lần dùng (xem bước 8) — mỗi dòng là 1 bài học thực tế phát sinh khi verify feature thật, chưa nằm sẵn trong các bước ở trên. Xoá dòng nào nếu thấy không còn đúng hoặc đã được gộp vào bước chính thức.

(chưa có bài học nào — sẽ được thêm sau lần verify đầu tiên)
