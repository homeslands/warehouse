# i18n, Dark Mode và Dịch Lỗi Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** warehouse-ui nói được hai ngôn ngữ (vi/en), có dark mode hoạt động thật, và mọi lỗi backend đều hiện ra bằng ngôn ngữ người dùng đang chọn.

**Architecture:** i18next khởi tạo một lần ở `src/shared/i18n/index.ts` với resource import tĩnh, chia namespace theo domain (`common`, `auth`, `examples`, `errors`). Lỗi backend đi qua `resolveApiErrorMessage()` — một hàm thuần tra `code` (số) trong `error-codes.ts` để lấy khoá i18n. Dark mode do `next-themes` điều khiển bằng class, khớp với `@custom-variant dark` đã có sẵn trong `index.css`.

**Tech Stack:** React 19, Vite 8, Vitest 4, Tailwind 4, shadcn/ui, i18next, react-i18next, i18next-browser-languagedetector, next-themes (đã cài sẵn).

**Spec:** `docs/superpowers/specs/2026-07-10-warehouse-ui-i18n-dark-mode-design.md`

## Global Constraints

- Node 24 (`.nvmrc`). Node 18 làm `vitest` chết ngay lúc khởi động với `SyntaxError: ... 'node:util' does not provide an export named 'styleText'`. Chạy `nvm use` trước mọi lệnh npm.
- Mọi lệnh npm chạy trong `app/warehouse-ui`.
- Ngôn ngữ mặc định: `vi`. Fallback: `vi`.
- Namespace mặc định của i18next: `common`.
- Không lazy-load bản dịch qua HTTP. `resources` import tĩnh từ JSON.
- Không đặt tên hàm bằng tiền tố `use*` trừ khi nó thật sự là React hook.
- Không sửa gì trong `app/warehouse-api`.
- Không sửa `src/components/ui/sonner.tsx` — nó đã gọi `useTheme()` sẵn.
- TDD: viết test đỏ trước, chạy cho thấy đỏ, rồi mới viết code.
- Commit sau mỗi task.

---

## File Structure

**Tạo mới**

| File | Trách nhiệm |
|---|---|
| `src/shared/i18n/index.ts` | Init i18next, type augmentation, đồng bộ `<html lang>` |
| `src/shared/i18n/locales/vi/*.json` | Bản dịch tiếng Việt, 4 namespace |
| `src/shared/i18n/locales/en/*.json` | Bản dịch tiếng Anh, 4 namespace |
| `src/shared/api/error-codes.ts` | Map `code` (số) → tên khoá trong namespace `errors` |
| `src/shared/lib/api-error-message.ts` | `resolveApiErrorMessage(unknown): string` — hàm thuần |
| `src/shared/lib/toast-error.ts` | `toastApiError(unknown): void` — bọc toast quanh hàm trên |
| `src/components/layout/ModeToggle.tsx` | Nút đổi theme |
| `src/components/layout/LanguageToggle.tsx` | Nút đổi ngôn ngữ |

**Sửa**

| File | Thay đổi |
|---|---|
| `src/shared/api/http.ts` | 401 toàn cục bỏ qua request đăng nhập |
| `src/main.tsx` | `import '@/shared/i18n'` |
| `src/app/providers.tsx` | Bọc `ThemeProvider` |
| `src/test/setup.ts` | Init i18n `lng: 'vi'` + mock `matchMedia` |
| `src/components/layout/AppShell.tsx` | `t()` + hai nút toggle |
| `src/features/auth/LoginPage.tsx` | `t()` + hai nút toggle + `resolveApiErrorMessage` |
| `src/features/auth/login.schema.ts` | Message → khoá i18n |
| `src/features/examples/*.tsx` | `t()`, `resolveApiErrorMessage` |
| `src/features/examples/hooks.ts` | `toastApiError` |

---

## Task 1: Sửa bug 401 khi đăng nhập sai

Task này đứng trước mọi thứ khác vì nó không phụ thuộc i18n, và vì không sửa nó thì thông báo lỗi đăng nhập (dù đã dịch) vẫn không bao giờ hiện ra.

**Bối cảnh:** `INVALID_CREDENTIALS` (mã 100001) trả HTTP **401**. `http.ts` bắt mọi 401 rồi gọi `onUnauthorized()`, mà `main.tsx` cài handler đó thành `logout()` + `window.location.assign('/login')`. Gõ sai mật khẩu → reload cứng → `login.isError` không bao giờ render.

**Files:**
- Modify: `src/shared/api/http.ts:24-31`
- Test: `src/shared/api/http.test.ts`

**Interfaces:**
- Produces: `http.ts` giữ nguyên mọi export. Chỉ hành vi interceptor đổi.

- [ ] **Step 1: Đọc test hiện có để bắt chước style**

Run: `sed -n '1,40p' src/shared/api/http.test.ts`

Mục đích: biết cách file này dựng MSW handler và gọi `setUnauthorizedHandler`. Bắt chước, đừng phát minh style mới.

- [ ] **Step 2: Viết test đỏ**

Thêm vào cuối `src/shared/api/http.test.ts`, bên trong `describe` phù hợp (hoặc tạo `describe` mới):

```ts
it('KHÔNG gọi onUnauthorized khi 401 đến từ chính request đăng nhập', async () => {
  const onUnauthorized = vi.fn()
  setUnauthorizedHandler(onUnauthorized)

  server.use(
    mswHttp.post('http://localhost:8085/api/v1/auth/login', () =>
      HttpResponse.json(
        {
          statusCode: 401,
          code: 100001,
          timestamp: '',
          path: '/auth/login',
          method: 'POST',
          message: 'Invalid phone number or password',
        },
        { status: 401 },
      ),
    ),
  )

  await expect(postData('/auth/login', { phonenumber: 'x', password: 'y' })).rejects.toMatchObject({
    code: 100001,
  })
  expect(onUnauthorized).not.toHaveBeenCalled()
})

it('VẪN gọi onUnauthorized khi 401 đến từ request thường', async () => {
  const onUnauthorized = vi.fn()
  setUnauthorizedHandler(onUnauthorized)

  server.use(
    mswHttp.get('http://localhost:8085/api/v1/examples', () =>
      HttpResponse.json(
        {
          statusCode: 401,
          timestamp: '',
          path: '/examples',
          method: 'GET',
          message: 'Unauthorized',
        },
        { status: 401 },
      ),
    ),
  )

  await expect(getData('/examples')).rejects.toBeTruthy()
  expect(onUnauthorized).toHaveBeenCalledTimes(1)
})
```

Bảo đảm phần `import` ở đầu file có đủ: `vi` từ `vitest`, `postData`, `getData`, `setUnauthorizedHandler` từ `@/shared/api/http`, `HttpResponse` và `http as mswHttp` từ `msw`, `server` từ `@/test/msw`. Thêm cái nào còn thiếu.

- [ ] **Step 3: Chạy test, xác nhận ĐỎ**

Run: `npm test -- src/shared/api/http.test.ts`
Expected: FAIL. Test thứ nhất đỏ vì `onUnauthorized` bị gọi 1 lần trong khi kỳ vọng 0.

- [ ] **Step 4: Sửa interceptor**

Trong `src/shared/api/http.ts`, thay khối `http.interceptors.response.use(...)` hiện tại bằng:

```ts
// Đăng nhập sai mật khẩu cũng trả 401 (INVALID_CREDENTIALS, mã 100001). Nếu để handler
// toàn cục xử lý, nó sẽ logout + reload cứng trang, và LoginPage không kịp render lỗi.
function isLoginRequest(url: string | undefined): boolean {
  return url === '/auth/login'
}

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401 && !isLoginRequest(error.config?.url)) onUnauthorized()
    if (error.response?.data) return Promise.reject(error.response.data)
    return Promise.reject(error)
  },
)
```

- [ ] **Step 5: Chạy test, xác nhận XANH**

Run: `npm test -- src/shared/api/http.test.ts`
Expected: PASS, cả hai test mới.

- [ ] **Step 6: Chạy toàn bộ test để chắc không vỡ gì**

Run: `npm test`
Expected: PASS. Tổng số test = 43 + 2 = 45.

- [ ] **Step 7: Commit**

```bash
git add app/warehouse-ui/src/shared/api/http.ts app/warehouse-ui/src/shared/api/http.test.ts
git commit -m "fix: 401 khi đăng nhập sai không còn logout và reload cứng trang"
```

---

## Task 2: Cài dependency và dựng i18next

**Files:**
- Create: `src/shared/i18n/index.ts`
- Create: `src/shared/i18n/locales/vi/common.json`, `auth.json`, `examples.json`, `errors.json`
- Create: `src/shared/i18n/locales/en/common.json`, `auth.json`, `examples.json`, `errors.json`
- Modify: `src/main.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: `src/shared/i18n/index.ts` default-export instance `i18n` của i18next, đã `init()`. Import side-effect `import '@/shared/i18n'` là đủ để mọi `t()` hoạt động. Namespace: `common`, `auth`, `examples`, `errors`. Default namespace: `common`.

- [ ] **Step 1: Cài dependency**

```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

- [ ] **Step 2: Viết file bản dịch tiếng Việt**

`src/shared/i18n/locales/vi/common.json`:

```json
{
  "appName": "Warehouse",
  "logout": "Đăng xuất",
  "loading": "Đang tải...",
  "cancel": "Huỷ",
  "save": "Lưu",
  "saving": "Đang lưu...",
  "theme": "Giao diện",
  "themeLight": "Sáng",
  "themeDark": "Tối",
  "themeSystem": "Theo hệ thống",
  "language": "Ngôn ngữ",
  "languageVi": "Tiếng Việt",
  "languageEn": "English"
}
```

`src/shared/i18n/locales/vi/auth.json`:

```json
{
  "title": "Đăng nhập",
  "phonenumber": "Số điện thoại",
  "password": "Mật khẩu",
  "submit": "Đăng nhập",
  "submitting": "Đang đăng nhập...",
  "phonenumberRequired": "Vui lòng nhập số điện thoại",
  "passwordRequired": "Vui lòng nhập mật khẩu"
}
```

`src/shared/i18n/locales/vi/examples.json`:

```json
{
  "title": "Examples",
  "nav": "Examples",
  "create": "Tạo example",
  "edit": "Sửa example",
  "delete": "Xoá example",
  "actions": "Thao tác",
  "editAction": "Sửa",
  "deleteAction": "Xoá",
  "deleting": "Đang xoá...",
  "empty": "Chưa có dữ liệu.",
  "columnName": "Tên",
  "columnDescription": "Mô tả",
  "columnSlug": "Slug",
  "columnCreatedAt": "Ngày tạo",
  "nameRequired": "Vui lòng nhập tên",
  "deleteConfirm": "Xoá <1>{{name}}</1>? Thao tác này không hoàn tác được.",
  "pageInfo": "Trang {{page}} / {{totalPages}} — {{total}} bản ghi",
  "prevPage": "Trang trước",
  "nextPage": "Trang sau",
  "created": "Đã tạo example",
  "updated": "Đã cập nhật example",
  "deleted": "Đã xoá example"
}
```

`src/shared/i18n/locales/vi/errors.json` — 26 mã lỗi backend cộng hai khoá tổng hợp:

```json
{
  "network": "Không kết nối được máy chủ. Kiểm tra đường truyền rồi thử lại.",
  "unknown": "Đã có lỗi xảy ra.",
  "invalidCredentials": "Số điện thoại hoặc mật khẩu không đúng",
  "userNotActive": "Tài khoản đang bị khoá",
  "phonenumberDoesExist": "Số điện thoại đã tồn tại",
  "phonenumberIsRequired": "Vui lòng nhập số điện thoại",
  "passwordIsRequired": "Vui lòng nhập mật khẩu",
  "roleNotFound": "Không tìm thấy vai trò",
  "exportDatabaseError": "Xuất cơ sở dữ liệu thất bại",
  "fileNotFound": "Không tìm thấy tệp",
  "fileSizeExceedsLimitAllowed": "Tệp vượt quá dung lượng cho phép",
  "numberOfFilesExceedLimitAllowed": "Số lượng tệp vượt quá giới hạn cho phép",
  "limitUnexpectedFile": "Tệp không nằm trong danh sách cho phép",
  "limitPartCount": "Vượt quá số phần cho phép",
  "limitFieldKey": "Tên trường quá dài",
  "limitFieldCount": "Vượt quá số trường cho phép",
  "limitFieldValue": "Giá trị trường quá dài",
  "multerError": "Lỗi khi xử lý tệp tải lên",
  "errorWhenUploadFile": "Tải tệp lên thất bại",
  "mustExcelFile": "Tệp phải có định dạng Excel",
  "excelFileWrongHeader": "Tệp Excel sai tiêu đề cột",
  "notificationNotFound": "Không tìm thấy thông báo",
  "senderNotFound": "Không tìm thấy người gửi",
  "receiverNotFound": "Không tìm thấy người nhận",
  "notificationCreateFailed": "Tạo thông báo thất bại",
  "exampleNotFound": "Không tìm thấy example",
  "exampleNameDoesExist": "Tên example đã tồn tại",
  "exampleNameIsRequired": "Vui lòng nhập tên example"
}
```

- [ ] **Step 3: Viết file bản dịch tiếng Anh**

`src/shared/i18n/locales/en/common.json`:

```json
{
  "appName": "Warehouse",
  "logout": "Sign out",
  "loading": "Loading...",
  "cancel": "Cancel",
  "save": "Save",
  "saving": "Saving...",
  "theme": "Theme",
  "themeLight": "Light",
  "themeDark": "Dark",
  "themeSystem": "System",
  "language": "Language",
  "languageVi": "Tiếng Việt",
  "languageEn": "English"
}
```

`src/shared/i18n/locales/en/auth.json`:

```json
{
  "title": "Sign in",
  "phonenumber": "Phone number",
  "password": "Password",
  "submit": "Sign in",
  "submitting": "Signing in...",
  "phonenumberRequired": "Phone number is required",
  "passwordRequired": "Password is required"
}
```

`src/shared/i18n/locales/en/examples.json`:

```json
{
  "title": "Examples",
  "nav": "Examples",
  "create": "Create example",
  "edit": "Edit example",
  "delete": "Delete example",
  "actions": "Actions",
  "editAction": "Edit",
  "deleteAction": "Delete",
  "deleting": "Deleting...",
  "empty": "No data yet.",
  "columnName": "Name",
  "columnDescription": "Description",
  "columnSlug": "Slug",
  "columnCreatedAt": "Created at",
  "nameRequired": "Name is required",
  "deleteConfirm": "Delete <1>{{name}}</1>? This action cannot be undone.",
  "pageInfo": "Page {{page}} / {{totalPages}} — {{total}} records",
  "prevPage": "Previous",
  "nextPage": "Next",
  "created": "Example created",
  "updated": "Example updated",
  "deleted": "Example deleted"
}
```

`src/shared/i18n/locales/en/errors.json`:

```json
{
  "network": "Cannot reach the server. Check your connection and try again.",
  "unknown": "Something went wrong.",
  "invalidCredentials": "Invalid phone number or password",
  "userNotActive": "This account is not active",
  "phonenumberDoesExist": "Phone number already exists",
  "phonenumberIsRequired": "Phone number is required",
  "passwordIsRequired": "Password is required",
  "roleNotFound": "Role not found",
  "exportDatabaseError": "Failed to export the database",
  "fileNotFound": "File not found",
  "fileSizeExceedsLimitAllowed": "File exceeds the allowed size",
  "numberOfFilesExceedLimitAllowed": "Too many files",
  "limitUnexpectedFile": "Unexpected file field",
  "limitPartCount": "Too many parts",
  "limitFieldKey": "Field name too long",
  "limitFieldCount": "Too many fields",
  "limitFieldValue": "Field value too long",
  "multerError": "Failed to process the uploaded file",
  "errorWhenUploadFile": "File upload failed",
  "mustExcelFile": "The file must be an Excel file",
  "excelFileWrongHeader": "The Excel file has wrong column headers",
  "notificationNotFound": "Notification not found",
  "senderNotFound": "Sender not found",
  "receiverNotFound": "Receiver not found",
  "notificationCreateFailed": "Failed to create the notification",
  "exampleNotFound": "Example not found",
  "exampleNameDoesExist": "Example name already exists",
  "exampleNameIsRequired": "Example name is required"
}
```

- [ ] **Step 4: Viết `src/shared/i18n/index.ts`**

```ts
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import viCommon from './locales/vi/common.json'
import viAuth from './locales/vi/auth.json'
import viExamples from './locales/vi/examples.json'
import viErrors from './locales/vi/errors.json'
import enCommon from './locales/en/common.json'
import enAuth from './locales/en/auth.json'
import enExamples from './locales/en/examples.json'
import enErrors from './locales/en/errors.json'

export const defaultNS = 'common'

export const resources = {
  vi: { common: viCommon, auth: viAuth, examples: viExamples, errors: viErrors },
  en: { common: enCommon, auth: enAuth, examples: enExamples, errors: enErrors },
} as const

export const SUPPORTED_LANGUAGES = ['vi', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    ns: ['common', 'auth', 'examples', 'errors'],
    fallbackLng: 'vi',
    supportedLngs: SUPPORTED_LANGUAGES,
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'warehouse.language',
    },
    interpolation: { escapeValue: false },
  })

// Screen reader và CSS theo :lang() cần thuộc tính này khớp với ngôn ngữ đang hiển thị.
function syncHtmlLang(lng: string): void {
  document.documentElement.lang = lng
}

syncHtmlLang(i18n.resolvedLanguage ?? 'vi')
i18n.on('languageChanged', syncHtmlLang)

export default i18n
```

- [ ] **Step 5: Bật type-safe key**

Tạo `src/shared/i18n/i18next.d.ts`:

```ts
import type { defaultNS, resources } from './index'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: (typeof resources)['vi']
  }
}
```

Gõ sai khoá sẽ bị `tsc` bắt thay vì hiện chuỗi thô lên màn hình.

- [ ] **Step 6: Cho phép import JSON trong tsconfig**

Mở `tsconfig.app.json`. Nếu `compilerOptions` chưa có `"resolveJsonModule": true` thì thêm vào. Nếu đã có, bỏ qua step này.

- [ ] **Step 7: Import i18n ở `main.tsx`**

Thêm dòng import side-effect vào `src/main.tsx`, **trước** `import { router }`, sau `import './index.css'` là được — miễn nó chạy trước khi React render:

```ts
import '@/shared/i18n'
```

- [ ] **Step 8: Ghim ngôn ngữ `vi` trong môi trường test**

Đây là bẫy thật, không phải phòng ngừa. jsdom đặt `navigator.language = 'en-US'`, mà
`LanguageDetector` có `'navigator'` trong `detection.order` và `'en'` nằm trong `supportedLngs`.
Không ghim thì **mọi test chạy bằng tiếng Anh** — kể cả test của Task 3 (assert chuỗi tiếng Việt) và
4 assertion tiếng Việt sẵn có trong `ExamplesPage.test.tsx`.

`changeLanguage` trả Promise. Phải `await` — `void i18n.changeLanguage('vi')` không đảm bảo ngôn ngữ
đã đổi xong trước khi test đầu tiên render. Vitest cho phép top-level await trong `setupFiles`.

Thêm vào `src/test/setup.ts`:

```ts
import i18n from '@/shared/i18n'

// Test khẳng định thứ người dùng THẤY (chuỗi tiếng Việt), nên ghim ngôn ngữ.
// Không có dòng này, LanguageDetector đọc navigator.language ('en-US' trong jsdom) và chọn 'en'.
await i18n.changeLanguage('vi')
```

- [ ] **Step 9: Kiểm chứng typecheck và test**

Run: `npm run typecheck && npm test`
Expected: typecheck không lỗi; 45 test vẫn PASS (chưa thêm test mới ở task này).

Nếu `ExamplesPage.test.tsx` đỏ với "Unable to find an accessible element ... /tạo example/i", nghĩa
là ngôn ngữ vẫn là `en` — kiểm tra lại rằng `await` (không phải `void`) được dùng ở Step 8.

- [ ] **Step 10: Commit**

```bash
git add app/warehouse-ui/package.json app/warehouse-ui/package-lock.json \
        app/warehouse-ui/tsconfig.app.json app/warehouse-ui/src/main.tsx \
        app/warehouse-ui/src/test/setup.ts app/warehouse-ui/src/shared/i18n
git commit -m "feat: dựng i18next hai ngôn ngữ, namespace theo domain, khoá type-safe"
```

---

## Task 3: Map mã lỗi backend và `resolveApiErrorMessage`

**Files:**
- Create: `src/shared/api/error-codes.ts`
- Create: `src/shared/lib/api-error-message.ts`
- Create: `src/shared/lib/api-error-message.test.ts`
- Create: `src/shared/lib/toast-error.ts`

**Interfaces:**
- Consumes: `i18n` từ Task 2 (namespace `errors`); `isApiError` và type `ApiError` từ `src/shared/api/http.ts` / `src/shared/api/types.ts`.
- Produces:
  - `ERROR_CODE_KEYS: Record<number, string>` — map mã số → tên khoá trong namespace `errors`.
  - `resolveApiErrorMessage(error: unknown): string`
  - `toastApiError(error: unknown): void`

- [ ] **Step 1: Viết `src/shared/api/error-codes.ts`**

Mã lấy trực tiếp từ các file `*.validation.ts` của `warehouse-api`. Không đoán.

Kiểu `ErrorMessageKey` lấy từ chính file JSON, nên khai một khoá không tồn tại trong `errors.json`
sẽ bị `tsc` bắt ngay tại đây — không phải đợi người dùng thấy chuỗi thô.

```ts
import type viErrors from '@/shared/i18n/locales/vi/errors.json'

/** Tên khoá hợp lệ trong namespace `errors`, suy ra từ chính bản dịch tiếng Việt. */
export type ErrorMessageKey = keyof typeof viErrors

/**
 * Map mã lỗi số của backend → tên khoá trong namespace i18n `errors`.
 *
 * Đây là nguồn chân lý THỨ HAI: backend khai mã trong `src/**\/*.validation.ts`, còn đây là bản
 * sao thủ công. Thêm mã mới ở backend mà quên khai ở đây thì `resolveApiErrorMessage` sẽ rơi về
 * `message` tiếng Anh của backend và ghi console.warn — hỏng có kiểm soát, không im lặng.
 */
export const ERROR_CODE_KEYS: Record<number, ErrorMessageKey> = {
  100001: 'invalidCredentials',
  100002: 'userNotActive',
  100005: 'phonenumberDoesExist',
  100006: 'phonenumberIsRequired',
  100007: 'passwordIsRequired',
  100101: 'roleNotFound',
  109000: 'exportDatabaseError',
  121000: 'fileNotFound',
  121001: 'fileSizeExceedsLimitAllowed',
  121002: 'numberOfFilesExceedLimitAllowed',
  121003: 'limitUnexpectedFile',
  121004: 'limitPartCount',
  121005: 'limitFieldKey',
  121006: 'limitFieldCount',
  121007: 'limitFieldValue',
  121008: 'multerError',
  121009: 'errorWhenUploadFile',
  121010: 'mustExcelFile',
  121011: 'excelFileWrongHeader',
  155501: 'notificationNotFound',
  155502: 'senderNotFound',
  155503: 'receiverNotFound',
  155504: 'notificationCreateFailed',
  999901: 'exampleNotFound',
  999902: 'exampleNameDoesExist',
  999903: 'exampleNameIsRequired',
}
```

- [ ] **Step 2: Viết test đỏ — `src/shared/lib/api-error-message.test.ts`**

Test khẳng định **hàm tra đúng khoá**, không khẳng định nội dung bản dịch. So sánh với
`i18n.t('errors:...')` chứ không với câu tiếng Việt nguyên văn — sửa câu chữ trong `errors.json`
không được phép làm đỏ unit test. Logic đang test là phép ánh xạ `999901 → exampleNotFound`.

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'

const apiError = (over: Record<string, unknown> = {}) => ({
  statusCode: 422,
  timestamp: '',
  path: '/examples',
  method: 'POST',
  message: 'Example not found',
  ...over,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveApiErrorMessage', () => {
  it('ánh xạ mã 999901 sang khoá errors:exampleNotFound', () => {
    expect(resolveApiErrorMessage(apiError({ code: 999901 }))).toBe(i18n.t('errors:exampleNotFound'))
  })

  it('bám theo ngôn ngữ đang chọn', async () => {
    const vi_ = resolveApiErrorMessage(apiError({ code: 999901 }))

    await i18n.changeLanguage('en')
    const en_ = resolveApiErrorMessage(apiError({ code: 999901 }))
    expect(en_).toBe(i18n.t('errors:exampleNotFound'))
    await i18n.changeLanguage('vi')

    // Hai ngôn ngữ phải ra hai chuỗi khác nhau, nếu không phép dịch đã không xảy ra.
    expect(en_).not.toBe(vi_)
  })

  it('mã lạ → dùng message của backend và cảnh báo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveApiErrorMessage(apiError({ code: 424242, message: 'Weird failure' }))).toBe(
      'Weird failure',
    )
    expect(warn).toHaveBeenCalledOnce()
  })

  it('không có code → dùng message của backend', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveApiErrorMessage(apiError({ message: 'Plain failure' }))).toBe('Plain failure')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('không phải ApiError (lỗi mạng) → khoá errors:network', () => {
    expect(resolveApiErrorMessage(new Error('Network Error'))).toBe(i18n.t('errors:network'))
  })
})
```

- [ ] **Step 3: Chạy test, xác nhận ĐỎ**

Run: `npm test -- src/shared/lib/api-error-message.test.ts`
Expected: FAIL với lỗi kiểu "Failed to resolve import ... api-error-message".

- [ ] **Step 4: Viết `src/shared/lib/api-error-message.ts`**

```ts
import i18n from '@/shared/i18n'
import { ERROR_CODE_KEYS } from '@/shared/api/error-codes'
import { isApiError } from '@/shared/api/http'

/**
 * Hàm thuần, KHÔNG phải hook — dùng được cả trong render lẫn trong callback của react-query.
 * Dùng `i18n.t` trực tiếp vì `useTranslation` chỉ gọi được trong component.
 */
export function resolveApiErrorMessage(error: unknown): string {
  if (!isApiError(error)) return i18n.t('errors:network')

  const key = error.code === undefined ? undefined : ERROR_CODE_KEYS[error.code]

  if (key === undefined) {
    // Không nuốt thành "Đã có lỗi xảy ra": đây là công cụ nội bộ, một câu tiếng Anh cụ thể
    // hữu ích hơn một câu tiếng Việt vô nghĩa. Cảnh báo để lập trình viên bổ sung khoá.
    console.warn(
      `[api-error] Mã lỗi ${String(error.code)} chưa có trong ERROR_CODE_KEYS. ` +
        `Dùng message của backend: "${error.message}"`,
    )
    return error.message || i18n.t('errors:unknown')
  }

  return i18n.t(`errors:${key}`)
}
```

**KHÔNG dùng `as never`.** Vì `ERROR_CODE_KEYS` có kiểu `Record<number, ErrorMessageKey>`, template
literal `` `errors:${key}` `` suy ra thành union các khoá hợp lệ và `i18n.t` chấp nhận nó. Nếu `tsc`
vẫn kêu, sửa **kiểu**, đừng ép kiểu — `as never` vô hiệu hoá đúng cái type-safety mà Task 2 vừa dựng.

- [ ] **Step 5: Chạy test, xác nhận XANH**

Run: `npm test -- src/shared/lib/api-error-message.test.ts`
Expected: PASS, 5 test.

Nếu test "lỗi mạng" đỏ vì `i18n` chưa init trong môi trường test, tạm bỏ qua — Task 4 sẽ init i18n trong `src/test/setup.ts`. Nhưng `import i18n from '@/shared/i18n'` đã tự `init()` như một side-effect, nên nó phải xanh ngay. Nếu không, kiểm tra `resolveJsonModule` ở Step 6 của Task 2.

- [ ] **Step 6: Viết `src/shared/lib/toast-error.ts`**

```ts
import { toast } from 'sonner'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from './api-error-message'

/**
 * 401 (ngoài đăng nhập) đã dẫn tới logout + chuyển trang ở `main.tsx`. Một toast nữa chỉ là nhiễu
 * trên đường người dùng bị đá ra.
 */
export function toastApiError(error: unknown): void {
  if (isApiError(error) && error.statusCode === 401) return
  toast.error(resolveApiErrorMessage(error))
}
```

- [ ] **Step 7: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS. Tổng = 45 + 5 = 50.

- [ ] **Step 8: Commit**

```bash
git add app/warehouse-ui/src/shared/api/error-codes.ts \
        app/warehouse-ui/src/shared/lib/api-error-message.ts \
        app/warehouse-ui/src/shared/lib/api-error-message.test.ts \
        app/warehouse-ui/src/shared/lib/toast-error.ts
git commit -m "feat: dịch 26 mã lỗi backend sang khoá i18n, fallback có cảnh báo"
```

---

## Task 4: Dark mode — ThemeProvider và mock `matchMedia`

**Files:**
- Modify: `src/app/providers.tsx`
- Modify: `src/test/setup.ts` (chỉ thêm mock `matchMedia`; việc ghim ngôn ngữ đã làm ở Task 2)

**Interfaces:**
- Consumes: `next-themes` (đã có trong `package.json`).
- Produces: `useTheme()` từ `next-themes` dùng được ở mọi component dưới `Providers`.

- [ ] **Step 1: Mock `matchMedia` trong `src/test/setup.ts`**

`next-themes` với `enableSystem` gọi `window.matchMedia`, mà jsdom không có. Hiện chưa test nào render `Providers` nên chưa nổ — đây là phòng ngừa, để test đầu tiên làm vậy không chết với thông báo khó hiểu.

Thêm vào `src/test/setup.ts`, sau các import:

```ts
// jsdom không cài đặt matchMedia. next-themes (enableSystem) gọi nó ngay khi mount.
// next-themes 0.4.6 dùng API CŨ `addListener`/`removeListener` (trình duyệt thật vẫn giữ chúng
// như alias deprecated), nên thiếu hai method này thì mock ném TypeError — đúng lúc nó cần hoạt động.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
```

Mock này vô dụng nếu không có gì render `Providers` để chứng minh nó hoạt động. Thêm
`src/app/providers.test.tsx` render `<Providers><div>ok</div></Providers>` và khẳng định nó mount
được — vừa chứng minh mock đúng, vừa là lưới an toàn cho cả tầng provider về sau.

`SessionGate` gọi `useSession()`, hàm này bắn `GET /auth/me` khi localStorage có token, mà MSW cấu
hình `onUnhandledRequest: 'error'`. Xoá localStorage trước khi render để `useSession` rẽ thẳng sang
`unauthenticated`, không phát sinh HTTP nào.

- [ ] **Step 2: Bọc `ThemeProvider` trong `src/app/providers.tsx`**

Thêm import:

```ts
import { ThemeProvider } from 'next-themes'
```

Rồi thay thân hàm `Providers`:

```tsx
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SessionGate>{children}</SessionGate>
        <Toaster richColors />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
```

`attribute="class"` khớp với `@custom-variant dark (&:is(.dark *))` ở `src/index.css:6`. Bộ token `.dark` đã đầy đủ từ dòng 116 — không đụng CSS.

- [ ] **Step 3: Chạy test**

Run: `npm test`
Expected: PASS, 51 test (50 + providers.test.tsx). Không test nào đỏ.

- [ ] **Step 4: Kiểm chứng thật bằng mắt**

```bash
cp .env.example .env   # nếu chưa có; env.ts ném lỗi khi thiếu VITE_API_BASE_URL
npm run dev
```

Mở `http://localhost:5175`. Trong DevTools console:

```js
document.documentElement.classList.contains('dark')
```

Đổi theme hệ thống (macOS: System Settings → Appearance) và xác nhận giá trị trên đổi theo. Nếu luôn `false`, `ThemeProvider` chưa mount đúng.

- [ ] **Step 5: Commit**

```bash
git add app/warehouse-ui/src/app/providers.tsx app/warehouse-ui/src/test/setup.ts
git commit -m "feat: mount ThemeProvider, dark mode theo hệ thống; mock matchMedia cho jsdom"
```

---

## Task 5: Hai nút toggle

**Files:**
- Create: `src/components/layout/ModeToggle.tsx`
- Create: `src/components/layout/LanguageToggle.tsx`

**Interfaces:**
- Consumes: `dropdown-menu` và `button` từ `@/components/ui/*`; `useTheme` từ `next-themes`; `useTranslation` từ `react-i18next`; `SUPPORTED_LANGUAGES` từ `@/shared/i18n`.
- Produces: `<ModeToggle />` và `<LanguageToggle />`, không nhận prop.

- [ ] **Step 1: Viết `src/components/layout/ModeToggle.tsx`**

```tsx
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ModeToggle() {
  const { setTheme } = useTheme()
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('theme')}>
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" />
          {t('themeLight')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          {t('themeDark')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" />
          {t('themeSystem')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

Icon đổi bằng class `dark:hidden` / `dark:block` thay vì đọc `theme` — tránh hydration mismatch và tránh phải xử lý `mounted`.

- [ ] **Step 2: Viết `src/components/layout/LanguageToggle.tsx`**

```tsx
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SUPPORTED_LANGUAGES } from '@/shared/i18n'

const LABEL_KEY = { vi: 'languageVi', en: 'languageEn' } as const

export function LanguageToggle() {
  const { t, i18n } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('language')}>
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <DropdownMenuItem key={lng} onClick={() => void i18n.changeLanguage(lng)}>
            {t(LABEL_KEY[lng])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 3: Kiểm chứng typecheck và lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck sạch; lint không error mới (warning `react-refresh` sẵn có ở `button.tsx` vẫn còn, không sao).

- [ ] **Step 4: Commit**

```bash
git add app/warehouse-ui/src/components/layout/ModeToggle.tsx \
        app/warehouse-ui/src/components/layout/LanguageToggle.tsx
git commit -m "feat: nút đổi theme và nút đổi ngôn ngữ"
```

---

## Task 6: Gỡ chuỗi của AppShell và LoginPage

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/features/auth/LoginPage.tsx`
- Modify: `src/features/auth/login.schema.ts`

**Interfaces:**
- Consumes: `useTranslation` (Task 2), `resolveApiErrorMessage` (Task 3), `ModeToggle` + `LanguageToggle` (Task 5).

- [ ] **Step 1: Sửa `src/features/auth/login.schema.ts`**

Schema là module thuần, không gọi được `t()`. Nó chứa **khoá**; component dịch lúc render.

`react-hook-form` khai `errors.<field>.message` là `string | undefined`, nên `t()` không nhận trực
tiếp. Cách đúng là khai một union khoá hẹp và ép về **nó**, chứ không ép về `never`.

```ts
import { z } from 'zod'

// KHÔNG dùng z.string().email(): backend đăng nhập bằng phonenumber.
// KHÔNG ép định dạng số: tài khoản seed có phonenumber = "root".
// Message là KHOÁ i18n, không phải câu hoàn chỉnh. LoginPage dịch qua t().
export type LoginErrorKey = 'auth:phonenumberRequired' | 'auth:passwordRequired'

export const loginSchema = z.object({
  phonenumber: z.string().min(1, 'auth:phonenumberRequired' satisfies LoginErrorKey),
  password: z.string().min(1, 'auth:passwordRequired' satisfies LoginErrorKey),
})

export type LoginInput = z.infer<typeof loginSchema>
```

`satisfies LoginErrorKey` khiến gõ sai khoá bị bắt ngay tại schema. `LoginErrorKey` phải là khoá có
thật trong `auth.json` — nếu đổi tên khoá mà quên sửa đây, `t()` ở LoginPage sẽ báo lỗi kiểu.

- [ ] **Step 2: Chạy test schema, xác nhận vẫn XANH**

Run: `npm test -- src/features/auth/login.schema.test.ts`
Expected: PASS, 4 test. File test này chỉ assert `.success` (boolean), không assert nội dung message — nên đổi message không làm nó đỏ.

- [ ] **Step 3: Sửa `src/features/auth/LoginPage.tsx`**

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { LanguageToggle } from '@/components/layout/LanguageToggle'
import { ModeToggle } from '@/components/layout/ModeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/shared/auth/auth.store'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { loginSchema, type LoginErrorKey, type LoginInput } from './login.schema'
import { useLogin } from './useLogin'

export function LoginPage() {
  const status = useAuthStore((s) => s.status)
  const login = useLogin()
  const { t } = useTranslation(['auth', 'common'])

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phonenumber: '', password: '' },
  })

  if (status === 'authenticated') return <Navigate to="/examples" replace />

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="absolute top-4 right-4 flex gap-2">
        <LanguageToggle />
        <ModeToggle />
      </div>

      <form
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
        className="bg-card w-full max-w-sm space-y-4 rounded-lg border p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">{t('auth:title')}</h1>

        <div className="space-y-2">
          <Label htmlFor="phonenumber">{t('auth:phonenumber')}</Label>
          <Input id="phonenumber" autoComplete="username" {...form.register('phonenumber')} />
          {form.formState.errors.phonenumber && (
            <p className="text-destructive text-sm">
              {t(form.formState.errors.phonenumber.message as LoginErrorKey)}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t('auth:password')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <p className="text-destructive text-sm">
              {t(form.formState.errors.password.message as LoginErrorKey)}
            </p>
          )}
        </div>

        {login.isError && (
          <p className="text-destructive text-sm">{resolveApiErrorMessage(login.error)}</p>
        )}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? t('auth:submitting') : t('auth:submit')}
        </Button>
      </form>
    </div>
  )
}
```

Chú ý: `bg-slate-50` / `bg-white` / `text-red-600` bị thay bằng token `bg-background` / `bg-card` / `text-destructive`. Màu cứng `slate-50` không đổi theo dark mode — giữ nó thì dark mode chỉ đúng một nửa.

- [ ] **Step 4: Sửa `src/components/layout/AppShell.tsx`**

```tsx
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from '@/components/layout/LanguageToggle'
import { ModeToggle } from '@/components/layout/ModeToggle'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/shared/auth/auth.store'
import { cn } from '@/shared/lib/cn'

// Menu hiện chỉ có một mục nên chưa cần lọc theo quyền. Khi thêm mục thứ hai
// bị giới hạn quyền, lọc NAV bằng hasRole(user, ...) — không dùng can(), vì
// can() luôn trả false (backend chưa seed authority nào).
const NAV = [{ to: '/examples', labelKey: 'examples:nav' }] as const

export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { pathname } = useLocation()
  const { t } = useTranslation(['common', 'examples'])

  return (
    <div className="bg-background flex min-h-screen">
      <aside className="bg-muted/40 w-56 shrink-0 border-r p-4">
        <div className="mb-6 text-lg font-semibold">{t('common:appName')}</div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'hover:bg-muted block rounded px-3 py-2 text-sm',
                pathname === item.to && 'bg-muted font-medium',
              )}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="text-muted-foreground text-sm">{pathname}</div>
          <div className="flex items-center gap-3">
            <span className="text-sm">
              {user?.userName} <span className="text-muted-foreground">({user?.roleName})</span>
            </span>
            <LanguageToggle />
            <ModeToggle />
            <Button variant="outline" size="sm" onClick={logout}>
              {t('common:logout')}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS, 50 test.

- [ ] **Step 6: Typecheck và lint**

Run: `npm run typecheck && npm run lint`
Expected: sạch.

- [ ] **Step 7: Commit**

```bash
git add app/warehouse-ui/src/components/layout/AppShell.tsx \
        app/warehouse-ui/src/features/auth/LoginPage.tsx \
        app/warehouse-ui/src/features/auth/login.schema.ts
git commit -m "feat: gỡ chuỗi AppShell + LoginPage sang i18n, dùng token màu theo theme"
```

---

## Task 7: Gỡ chuỗi của feature `examples`

**Files:**
- Modify: `src/features/examples/columns.tsx`
- Modify: `src/features/examples/ExamplesPage.tsx`
- Modify: `src/features/examples/ExampleFormDialog.tsx`
- Modify: `src/features/examples/DeleteExampleDialog.tsx`
- Modify: `src/features/examples/hooks.ts`

**Interfaces:**
- Consumes: `useTranslation`, `resolveApiErrorMessage`, `toastApiError`.
- Produces: `exampleColumns` đổi từ hằng số sang hàm `buildExampleColumns(t)` — vì header cột cần dịch mà `columns.tsx` không phải component.

- [ ] **Step 1: Sửa `src/features/examples/columns.tsx`**

Header cột phải dịch, nhưng module này không phải component nên không gọi được hook. Đổi hằng số thành hàm nhận `t`:

```tsx
import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import type { Example } from './api'

// Không có cột sắp xếp: backend bỏ qua tham số `sort`. Xem spec, mục "Cố tình KHÔNG có".
export function buildExampleColumns(t: TFunction): ColumnDef<Example>[] {
  return [
    { accessorKey: 'name', header: t('examples:columnName') },
    {
      accessorKey: 'description',
      header: t('examples:columnDescription'),
      cell: ({ row }) => row.original.description ?? '—',
    },
    { accessorKey: 'slug', header: t('examples:columnSlug') },
    {
      accessorKey: 'createdAt',
      header: t('examples:columnCreatedAt'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
    },
  ]
}
```

`toLocaleString('vi-VN')` đổi thành `toLocaleString()` — ngày tháng phải theo locale người dùng chọn, không ghim cứng tiếng Việt.

- [ ] **Step 2: Sửa `src/features/examples/hooks.ts`**

Thay ba dòng `onError: (error) => toast.error(error.message)` và ba chuỗi success:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError } from '@/shared/api/types'
import { toastApiError } from '@/shared/lib/toast-error'
import {
  createExample,
  fetchExamples,
  removeExample,
  updateExample,
  type Example,
  type ExampleInput,
} from './api'

export const EXAMPLES_KEY = ['examples'] as const

export function useExamples(page: number, size: number) {
  return useQuery({
    queryKey: [...EXAMPLES_KEY, 'list', { page, size }],
    queryFn: () => fetchExamples({ page, size }),
  })
}

function useInvalidateExamples() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: EXAMPLES_KEY })
}

export function useCreateExample() {
  const invalidate = useInvalidateExamples()
  const { t } = useTranslation('examples')

  return useMutation<Example, ApiError, ExampleInput>({
    mutationFn: createExample,
    onSuccess: () => {
      toast.success(t('examples:created'))
      invalidate()
    },
    onError: toastApiError,
  })
}

export function useUpdateExample() {
  const invalidate = useInvalidateExamples()
  const { t } = useTranslation('examples')

  return useMutation<Example, ApiError, { slug: string; input: ExampleInput }>({
    mutationFn: ({ slug, input }) => updateExample(slug, input),
    onSuccess: () => {
      toast.success(t('examples:updated'))
      invalidate()
    },
    onError: toastApiError,
  })
}

export function useDeleteExample() {
  const invalidate = useInvalidateExamples()
  const { t } = useTranslation('examples')

  return useMutation<string, ApiError, string>({
    mutationFn: removeExample,
    onSuccess: () => {
      toast.success(t('examples:deleted'))
      invalidate()
    },
    onError: toastApiError,
  })
}
```

- [ ] **Step 3: Sửa `src/features/examples/ExampleFormDialog.tsx`**

Schema nội tuyến chứa khoá, component dịch. Cùng cách khai kiểu như `login.schema.ts` — union khoá
hẹp, **không** `as never`:

```tsx
type ExampleErrorKey = 'examples:nameRequired'

const schema = z.object({
  name: z.string().min(1, 'examples:nameRequired' satisfies ExampleErrorKey),
  description: z.string().optional(),
})
```

Thêm `import { useTranslation } from 'react-i18next'`, rồi trong component:

```tsx
const { t } = useTranslation(['examples', 'common'])
```

Thay các chuỗi trong JSX:

```tsx
<DialogTitle>{example ? t('examples:edit') : t('examples:create')}</DialogTitle>
...
<Label htmlFor="name">{t('examples:columnName')}</Label>
<Input id="name" {...form.register('name')} />
{form.formState.errors.name && (
  <p className="text-destructive text-sm">
    {t(form.formState.errors.name.message as ExampleErrorKey)}
  </p>
)}
...
<Label htmlFor="description">{t('examples:columnDescription')}</Label>
...
<Button type="submit" disabled={isPending}>
  {isPending ? t('common:saving') : t('common:save')}
</Button>
```

Đổi luôn `text-red-600` → `text-destructive`.

- [ ] **Step 4: Sửa `src/features/examples/DeleteExampleDialog.tsx`**

Câu xác nhận có một đoạn in đậm ở giữa (`Xoá <tên>? Thao tác này...`). Dùng `<Trans>` để giữ được thẻ `<span>` bên trong bản dịch — khoá `examples:deleteConfirm` đã chứa `<1>{{name}}</1>`.

Thêm import:

```tsx
import { Trans, useTranslation } from 'react-i18next'
```

Trong component:

```tsx
const { t } = useTranslation(['examples', 'common'])
```

JSX:

```tsx
<DialogTitle>{t('examples:delete')}</DialogTitle>

<p className="text-sm">
  <Trans
    i18nKey="examples:deleteConfirm"
    values={{ name: example?.name ?? '' }}
    components={[<span key="0" />, <span key="1" className="font-medium" />]}
  />
</p>

<DialogFooter>
  <Button variant="outline" onClick={() => onOpenChange(false)}>
    {t('common:cancel')}
  </Button>
  <Button
    variant="destructive"
    disabled={isPending}
    onClick={() => example && onConfirm(example.slug)}
  >
    {isPending ? t('examples:deleting') : t('examples:deleteAction')}
  </Button>
</DialogFooter>
```

- [ ] **Step 5: Sửa `src/features/examples/ExamplesPage.tsx`**

Thay import `exampleColumns` bằng `buildExampleColumns`, thêm `useTranslation` và `resolveApiErrorMessage`:

```tsx
import { useTranslation } from 'react-i18next'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { buildExampleColumns } from './columns'
```

Trong component, sau `const user = ...`:

```tsx
const { t } = useTranslation(['examples', 'common'])
```

`useMemo` phải phụ thuộc thêm `t` (nếu không, đổi ngôn ngữ mà header cột không đổi):

```tsx
const columns = useMemo<ColumnDef<Example>[]>(() => {
  const base = buildExampleColumns(t)
  if (!canWrite) return base

  const actionsColumn: ColumnDef<Example> = {
    id: 'actions',
    header: t('examples:actions'),
    cell: ({ row }) => (
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing(row.original)
            setFormOpen(true)
          }}
        >
          {t('examples:editAction')}
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setDeleting(row.original)}>
          {t('examples:deleteAction')}
        </Button>
      </div>
    ),
  }

  return [...base, actionsColumn]
}, [canWrite, t])
```

Lỗi query hiện dịch qua helper:

```tsx
if (isError) return <p className="text-destructive">{resolveApiErrorMessage(error)}</p>
```

Phần còn lại:

```tsx
<h1 className="text-xl font-semibold">{t('examples:title')}</h1>
...
<Button onClick={...}>{t('examples:create')}</Button>
...
<TableCell colSpan={columns.length}>{t('common:loading')}</TableCell>
...
<TableCell colSpan={columns.length}>{t('examples:empty')}</TableCell>
...
<span className="text-muted-foreground text-sm">
  {t('examples:pageInfo', {
    page: data?.page ?? page,
    totalPages: data?.totalPages ?? 1,
    total: data?.total ?? 0,
  })}
</span>
<Button ...>{t('examples:prevPage')}</Button>
<Button ...>{t('examples:nextPage')}</Button>
```

Đổi `text-slate-500` → `text-muted-foreground`.

- [ ] **Step 6: Chạy test — đây là chỗ dễ vỡ nhất**

Run: `npm test`
Expected: PASS, 50 test.

`ExamplesPage.test.tsx` query bằng chuỗi tiếng Việt (`/tạo example/i`, `/trang trước/i`). Chúng vẫn xanh vì `src/test/setup.ts` đã ghim `lng: 'vi'` (Task 4, Step 2), và các khoá `examples:create` / `examples:prevPage` dịch ra đúng chuỗi cũ. **Giữ nguyên** các assertion đó — test nên khẳng định thứ người dùng thấy.

Nếu đỏ với `/tạo example/i` không tìm thấy: kiểm tra `examples.json` tiếng Việt có khoá `create` với giá trị đúng `"Tạo example"`.

- [ ] **Step 7: Typecheck và lint**

Run: `npm run typecheck && npm run lint`
Expected: sạch.

- [ ] **Step 8: Commit**

```bash
git add app/warehouse-ui/src/features/examples
git commit -m "feat: gỡ chuỗi feature examples sang i18n, lỗi API dịch qua helper"
```

---

## Task 8: Kiểm chứng end-to-end và dọn dẹp

**Files:**
- Delete: `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`
- Modify: `README.md`

**Interfaces:**
- Consumes: mọi thứ từ Task 1–7.

- [ ] **Step 1: Xác nhận ba file asset thật sự không được dùng**

```bash
grep -rn "hero.png\|react.svg\|vite.svg" src index.html
```

Expected: không kết quả nào (ngoài chính các file trong `src/assets/`). Nếu có kết quả, **dừng lại** và bỏ qua step tiếp theo.

- [ ] **Step 2: Xoá asset thừa của create-vite**

```bash
git rm app/warehouse-ui/src/assets/hero.png \
       app/warehouse-ui/src/assets/react.svg \
       app/warehouse-ui/src/assets/vite.svg
```

- [ ] **Step 3: Chạy full verification**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: typecheck sạch; lint 0 error (1 warning `react-refresh/only-export-components` ở `button.tsx` là sẵn có); 50 test pass; build thành công.

- [ ] **Step 4: Kiểm chứng thật, cần backend chạy**

Backend phải sống ở `http://localhost:8085`. Nếu chưa có `.env`: `cp .env.example .env`.

```bash
npm run dev
```

Mở `http://localhost:5175` và xác nhận từng điểm:

1. Đăng nhập **sai mật khẩu** → thấy dòng đỏ *"Số điện thoại hoặc mật khẩu không đúng"* ngay trong form. Trang **không** reload, URL **không** đổi. (Đây là Task 1. Trước khi sửa, trang sẽ nháy trắng.)
2. Bấm nút ngôn ngữ → chọn English → toàn bộ giao diện đổi sang tiếng Anh, kể cả header bảng. Reload trang → vẫn tiếng Anh.
3. Trong DevTools: `document.documentElement.lang` trả `"en"`.
4. Bấm nút theme → Tối → nền chuyển tối, toast cũng tối. Reload → vẫn tối.
5. Đăng nhập thành công, tạo một example trùng tên với example đã có → toast đỏ *"Tên example đã tồn tại"* (mã 999902), **không** phải *"Example name does exist"*.
6. Tắt backend, bấm tạo example → toast đỏ *"Không kết nối được máy chủ..."*, không phải màn hình trắng.
7. Bật lại backend, xoá `accessToken` trong localStorage rồi bấm tạo example → bị đá về `/login`, và **không** có toast thừa nào.

- [ ] **Step 5: Viết lại `README.md`**

`README.md` hiện là boilerplate của create-vite (nói về Oxlint và React Compiler — không liên quan). Thay toàn bộ bằng:

````markdown
# warehouse-ui

Frontend cho hệ thống quản lý kho. React 19 + Vite 8 + TypeScript.

## Yêu cầu

- Node 24 (`.nvmrc`). Node cũ hơn làm Vitest chết lúc khởi động.
- `warehouse-api` chạy ở `http://localhost:8085`.

## Chạy

```bash
nvm use
npm install
cp .env.example .env
npm run dev
```

Mở http://localhost:5175

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Build production |
| `npm run gen:api` | Sinh type từ `swagger.json` (cần backend chạy) |

## Kiến trúc

- `src/app/` — router, providers
- `src/features/` — màn hình theo nghiệp vụ
- `src/shared/` — http, auth, i18n, config dùng chung
- `src/components/ui/` — shadcn/ui

## Đa ngôn ngữ

Tiếng Việt (mặc định) và tiếng Anh. Bản dịch ở `src/shared/i18n/locales/<lng>/<namespace>.json`.
Khoá được kiểm tra kiểu lúc biên dịch — gõ sai khoá thì `npm run typecheck` báo lỗi.

Lỗi từ backend trả về mã số; `src/shared/api/error-codes.ts` ánh xạ mã đó sang khoá i18n.
Thêm mã lỗi mới ở backend thì phải thêm vào file này, nếu không người dùng sẽ thấy
câu tiếng Anh nguyên bản của backend (và một cảnh báo trong console).

## Giao diện sáng/tối

`next-themes`, điều khiển bằng class trên `<html>`. Token màu ở `src/index.css`.
Dùng token (`bg-background`, `text-muted-foreground`, ...) thay vì màu cứng (`bg-slate-50`),
nếu không dark mode sẽ chỉ đúng một nửa.
````

- [ ] **Step 6: Commit**

```bash
git add app/warehouse-ui/README.md app/warehouse-ui/src/assets
git commit -m "docs: viết lại README; xoá asset thừa của create-vite"
```

---

## Ngoài phạm vi — ghi lại để không quên

Không làm trong plan này:

1. Chuyển `onError` lên `QueryCache` / `MutationCache` toàn cục. Sau plan này, `useExamples` **vẫn** không báo lỗi query bằng toast (nó hiện lỗi inline, chấp nhận được), nhưng mọi query tương lai sẽ phải tự nhớ xử lý lỗi.
2. `errorElement` trên route gốc và route catch-all 404.
3. Lazy-load route và route manifest.
4. Test so khớp tập khoá giữa `vi` và `en` — bản dịch `en` sẽ mục vì không có gì canh.
5. `npm run gen:api` để sinh `src/shared/api/generated.ts` (Task 4 của plan foundation, chưa bao giờ chạy).
6. `POST /auth/refresh` không tồn tại ở backend → người dùng bị đăng xuất sau 1 tiếng.
