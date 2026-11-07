# File (upload tệp đính kèm)

> Nguồn: `src/file/file.controller.ts`, `src/file/file.constant.ts`, `src/file/file.util.ts`,
> `src/file/custom-interceptor.ts`, `src/file/file.service.ts`, `src/file/s3/s3.service.ts`,
> `src/file/s3/s3-key.util.ts`, `src/file/file.validation.ts`, migration
> `src/migrations/1783728000047-seed-file-authorities.ts` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).
> Đối chiếu code tại `origin/main` 5555273.

## Tóm tắt endpoint

| Method | Path | Quyền (authority / role) | Mô tả |
|---|---|---|---|
| POST | /api/v1/file/upload | `FILE_CREATE` | Tải 1 file lên S3, trả về **key** S3 nằm trong `message` |

Module `file` **không có** endpoint đọc, tải xuống hay xoá file (`src/authority/authority.constants.ts:126-128`:
"Chỉ có CREATE: chưa có route đọc/xoá file"). Xem mục [Lấy / tải file](#lấy--tải-file).

## POST /api/v1/file/upload

- **Quyền:** cần đăng nhập (JWT) và có authority `FILE_CREATE` (`file.controller.ts:43`). Route không còn
  `@Public()`. Migration seed cấp sẵn `FILE_CREATE` cho role `ADMIN`, `SUPERVISOR`
  (`1783728000047-seed-file-authorities.ts:18-25`); role khác cần được cấp qua quản trị permission.
  Không có warehouse scope, không có feature flag, không có throttle riêng (chỉ throttle global — xem conventions.md).
- **Thứ tự kiểm tra:** guard (401/403) chạy trước interceptor, nên thiếu quyền bị chặn trước khi BE đọc file.
  Sau đó multer đọc multipart (`custom-interceptor.ts:16-48`), rồi service kiểm tra có file (`file.service.ts:23`).
- **Content-Type:** `multipart/form-data` (`file.controller.ts:28`).
- **Body (multipart):**

| Tên field | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `file` | binary (1 file) | Có | ≤ 10 485 760 byte (10 MB, **tính cả biên**); đúng 1 file; đuôi + mimetype phải khớp allowlist bên dưới | Tên field là hằng `FILE_UPLOAD_FIELD_NAME = 'file'` (`file.constant.ts:14`). Field text khác trong form bị bỏ qua. |

**Giới hạn kích thước** (`file.constant.ts:16-22`, `file.controller.ts:47-50`):
`FILE_UPLOAD_MAX_SIZE = 10 * 1024 * 1024` = 10 485 760 byte. File đúng 10 485 760 byte **được nhận**;
10 485 761 byte trở lên bị từ chối. (Code truyền `fileSize: MAX + 1` cho multer vì busboy báo vượt khi chạm giới hạn.)
Số file tối đa `FILE_UPLOAD_MAX_COUNT = 1`.

**Allowlist đuôi → mimetype** (`file.constant.ts:37-50`, kiểm bởi `isAllowedUploadType`, `file.util.ts:18-28`):

| Đuôi (không phân biệt hoa/thường) | Mimetype bắt buộc đi kèm |
|---|---|
| `pdf` | `application/pdf` |
| `jpg` | `image/jpeg` |
| `jpeg` | `image/jpeg` |
| `png` | `image/png` |
| `webp` | `image/webp` |
| `xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `xls` | `application/vnd.ms-excel` |
| `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `doc` | `application/msword` |

- Đuôi lấy từ **tên file client gửi** (`path.extname(originalname)`, phần sau dấu chấm cuối). Mimetype là giá trị
  **client khai** trong part multipart (trình duyệt lấy từ `File.type`). BE **không đọc nội dung file**
  (`file.util.ts:13-17`). Phải khớp **cả hai**: đổi đuôi hoặc mimetype khác đều bị chặn.
- File không có đuôi hoặc trình duyệt gửi `application/octet-stream` → bị chặn `FILE_TYPE_NOT_ALLOWED`.

- **Response 201:** HTTP 201 (`file.controller.ts:42`). **Không có `result`.** Key S3 nằm trong `message`
  (`file.controller.ts:59-67`):

```json
{
  "message": "File hoa-don-3f2b6c1e-8a4d-4f7e-9c11-2b7e5d0a9f10.pdf uploaded to S3 successfully",
  "statusCode": 201,
  "timestamp": "2026-11-07T03:00:00.000Z"
}
```

  Dạng key (`s3-key.util.ts:45-64`, upload qua route này **không có folder**, `file.service.ts:24`):
  `<tên-đã-làm-sạch>-<UUID v4>[.<đuôi>]`.
  - Tên: bỏ dấu tiếng Việt/unicode, chữ thường, chỉ giữ `[a-z0-9_-]`, ký tự khác thành `-`, tối đa 64 ký tự;
    tên rỗng sau khi làm sạch → `file` (`s3-key.util.ts:5,11,29-37`).
  - Đuôi: chữ thường, chỉ `[a-z0-9]`, tối đa 16 ký tự (`s3-key.util.ts:8,39-43`).
  - Key không chứa khoảng trắng, nên regex `^File (.+) uploaded to S3 successfully$` lấy được key.

- **Lỗi riêng** (mọi lỗi multer/kiểu file đều là 422 có `code`, không phải 413/400 — `custom-interceptor.ts:19-45`):

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 121000 `FILE_NOT_FOUND` | Không có part `file` (form trống, chỉ có field text) hoặc request không phải multipart (`file.service.ts:22-23`) |
| 422 | 121001 `FILE_SIZE_EXCEEDS_LIMIT_ALLOWED` | File > 10 485 760 byte (multer `LIMIT_FILE_SIZE`) |
| 422 | 121002 `NUMBER_OF_FILES_EXCEED_LIMIT_ALLOWED` | Gửi từ 2 file trở lên (multer `LIMIT_FILE_COUNT`) |
| 422 | 121003 `LIMIT_UNEXPECTED_FILE` | File gửi dưới tên field khác `file` |
| 422 | 121012 `FILE_TYPE_NOT_ALLOWED` | Đuôi không thuộc allowlist, hoặc mimetype không khớp đuôi (`file.util.ts:39-41`) |
| 422 | 121004–121008 | Các lỗi multer khác: `LIMIT_PART_COUNT`, `LIMIT_FIELD_KEY` (tên field > 100 byte — giới hạn mặc định của multer, chưa xác minh bằng test), `LIMIT_FIELD_COUNT`, `LIMIT_FIELD_VALUE`, mã multer lạ → `MULTER_ERROR` |
| 422 | 121009 `ERROR_WHEN_UPLOAD_FILE` | Lỗi khi đọc multipart không phải lỗi multer (vd. stream đứt) |
| 500 | — | Lỗi khi gửi lên S3 (`s3.service.ts:41-48` không bắt lỗi). Không qua `HttpExceptionFilter` nên body không có `code` — xem conventions.md |

Các case 121000/121001/121002/121003/121012 có unit test ở `src/file/file.controller.spec.ts:79-180`
(test không được chạy trong lần viết tài liệu này).

## Lấy / tải file

- **Không có API tải file.** `POST /file/upload` chỉ trả key; BE không có route trả URL hay nội dung theo key.
  Cách FE hiển thị/tải file từ key là **chưa xác minh** (cần BE/PO chốt).
- Hàm nội bộ `S3Service.getFileUrl(key)` (`s3.service.ts:75-79`) dựng link public dạng
  `https://<bucket>.s3.<region>.amazonaws.com/<key>`; comment trong code ghi rõ link này "chỉ mở được khi
  bucket/object cho đọc public". Hàm này **không được gọi** bởi route `/file/upload`.
- Route upload của phiếu nhập/xuất (`POST /api/v1/warehouses/:warehouseSlug/import-forms/upload-file`,
  `POST /api/v1/warehouses/:warehouseSlug/export-forms/upload-file`) là route **khác**: dùng chung allowlist đuôi/mimetype
  (`file.constant.ts:30-32`), lưu vào folder `import-forms/` / `export-forms/` và trả **URL** (`getFileUrl`) trong `result`
  (`src/import-form/import-form.service.ts:116-130`). Quyền và mã lỗi của 2 route đó xem tài liệu contract của
  module phiếu nhập/xuất.

## Mã lỗi của module

Toàn bộ `src/file/file.validation.ts:35-55`. Mọi mã dùng HTTP mặc định 422 của `createErrorCode`
(`src/app/error-code.util.ts:15-21`).

| Key | code | HTTP | message |
|---|---|---|---|
| `FILE_NOT_FOUND` | 121000 | 422 | File not found |
| `FILE_SIZE_EXCEEDS_LIMIT_ALLOWED` | 121001 | 422 | File size exceed limit allowed |
| `NUMBER_OF_FILES_EXCEED_LIMIT_ALLOWED` | 121002 | 422 | Number of files exceed limit allowed |
| `LIMIT_UNEXPECTED_FILE` | 121003 | 422 | Limit unexpected file |
| `LIMIT_PART_COUNT` | 121004 | 422 | Limit part count |
| `LIMIT_FIELD_KEY` | 121005 | 422 | Limit field key |
| `LIMIT_FIELD_COUNT` | 121006 | 422 | Limit field count |
| `LIMIT_FIELD_VALUE` | 121007 | 422 | Limit field value |
| `MULTER_ERROR` | 121008 | 422 | Multer error |
| `ERROR_WHEN_UPLOAD_FILE` | 121009 | 422 | Error when upload file |
| `MUST_EXCEL_FILE` | 121010 | 422 | Must excel file |
| `EXCEL_FILE_WRONG_HEADER` | 121011 | 422 | Excel file wrong header |
| `FILE_TYPE_NOT_ALLOWED` | 121012 | 422 | File type is not allowed (pdf, jpg, jpeg, png, webp, xls, xlsx, doc, docx only) |

`MUST_EXCEL_FILE` (121010) và `EXCEL_FILE_WRONG_HEADER` (121011) hiện **không được ném ở đâu** trong `src/`.
`FILE_NOT_FOUND` (121000) cũng được ném bởi route upload của phiếu nhập/xuất khi thiếu file.

## Ghi chú cho FE

- **Key nằm trong `message`, không trong `result`.** Đây là hợp đồng hiện tại (`file.controller.ts:59-60`).
  FE đang tách key bằng regex ở `warehouse-ui/src/shared/api/file.api.ts:12-17` — vẫn đúng với code BE.
- **Lệch với FE:** `fileDisplayName` ở `warehouse-ui/src/shared/api/file.api.ts:32-33` giả định key dạng
  `<tên>-<Date.now()>.<đuôi>` (13 chữ số). Code BE hiện dùng **UUID v4** làm hậu tố (`s3-key.util.ts:56`),
  nên regex đó không bỏ được hậu tố. Tên trong key cũng đã bị làm sạch (bỏ dấu, chữ thường), không còn là tên gốc.
- Giới hạn FE chặn trước (10 MB tính cả biên, 1 file, allowlist đuôi + mimetype) phải lấy từ bảng ở trên
  (`file.constant.ts`); BE vẫn là chốt chặn cuối.
- Thiếu quyền `FILE_CREATE` → 403 **không có `code`** (guard chung, xem conventions.md).
- Route upload riêng của phiếu nhập/xuất trả URL trong `result`, còn route này trả key trong `message`.
  Hai hợp đồng khác nhau, đừng dùng chung một parser.
