# Thiết kế: i18n, dark mode, và dịch lỗi backend cho warehouse-ui

Ngày: 2026-07-10

> **Đây là ảnh chụp một quyết định, không phải tài liệu sống.**
> Phần "Quyết định và lý do" vẫn đúng — đó là lý do file này được giữ lại.
> Phần "Ngoài phạm vi" mô tả thế giới **tại ngày viết**; một số mục trong đó nay đã làm xong
> (`errorElement` và route 404, test key-parity vi/en). Muốn biết hiện trạng và nợ kỹ thuật đang treo,
> đọc `CLAUDE.md` ở gốc repo.

## Vấn đề

Toast của warehouse-ui đang lẫn hai ngôn ngữ. Thành công thì tiếng Việt hard-code
(`toast.success('Đã tạo example')`), còn lỗi thì lấy `error.message` từ backend — mà backend
viết tiếng Anh (`createErrorCode(999901, 'Example not found')`). Người dùng thấy "Đã xoá example"
rồi ngay sau đó "Example not found".

Song song, `next-themes` đã nằm trong `package.json` và `src/components/ui/sonner.tsx` đã gọi
`useTheme()`, nhưng không có `ThemeProvider` nào được mount. Hook trả `undefined`; dark mode
chưa hoạt động dù `src/index.css` đã có đủ bộ token `.dark`.

## Phạm vi

- Dựng i18next + react-i18next, hai ngôn ngữ: `vi` (mặc định) và `en`.
- Gỡ toàn bộ chuỗi UI hard-code của hai màn hình hiện có (Login, Examples) và AppShell sang i18n.
- Map 26 mã lỗi backend sang khoá i18n.
- Mount `ThemeProvider`, thêm nút đổi theme và nút đổi ngôn ngữ.
- Sửa bug 401-khi-đăng-nhập-sai làm reload cứng trang (xem mục cùng tên). Không phải i18n, nhưng
  nếu không sửa thì thông báo lỗi đăng nhập đã dịch cũng không bao giờ hiện ra.

## Ngoài phạm vi

Liệt kê để không bị quên, không làm đợt này:

- Chuyển `onError` lên `QueryCache` / `MutationCache` toàn cục. Hiện mỗi mutation tự gọi
  `toastApiError`. Việc gom lên `QueryClient` là bước tiếp theo, và nó sẽ vá luôn chỗ
  `useExamples` hiện không báo lỗi gì khi query hỏng.
- `errorElement` trên route gốc và route catch-all 404.
- Lazy-load route, route manifest.
- Mọi thay đổi trong `warehouse-api`.

## Quyết định và lý do

### Đa ngôn ngữ thật, không phải "tiếng Việt cho gọn"

Chọn i18next + react-i18next + i18next-browser-languagedetector. Đây là lựa chọn của người dùng
sau khi cân nhắc phương án chỉ-tiếng-Việt.

### Bản dịch tập trung, chia namespace theo domain

```
src/shared/i18n/index.ts
src/shared/i18n/locales/vi/{common,auth,examples,errors}.json
src/shared/i18n/locales/en/{common,auth,examples,errors}.json
```

Đã cân nhắc hai phương án khác:

- **Colocate theo feature** (`src/features/examples/locales/`) — ranh giới feature sạch hơn,
  nhưng cần một lớp gom resource lúc init và người dịch phải mở file rải rác.
- **Một file phẳng mỗi ngôn ngữ** — đơn giản nhất hôm nay, nhưng số route sẽ phình ra; file phẳng
  sẽ thành hàng nghìn dòng và mọi lần thêm màn hình là một conflict git.

Chọn tập trung + namespace: giá phải trả (JSON không nằm cạnh feature) trả một lần; giá của file
phẳng trả mãi.

### Import tĩnh, không lazy-load qua HTTP

App nội bộ, hai ngôn ngữ, tổng bản dịch vài chục KB. Thêm một round-trip mạng để tiết kiệm 20KB
là lỗ. `resources` import thẳng từ JSON.

### Type-safe key

Bật module augmentation của `react-i18next`:

```ts
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: (typeof resources)['vi']
  }
}
```

Gõ sai `t('examples:crateButton')` thì `tsc` bắt, không phải đợi thấy khoá thô hiện trên màn hình.
Đây chính là thứ project cũ (order-ui) không có, và là lý do map i18n key của họ trôi khỏi backend.

### `document.documentElement.lang` theo ngôn ngữ hiện tại

Screen reader và CSS theo `lang` cần nó. Cập nhật trong `i18n.on('languageChanged')`.

## Dịch lỗi backend

Backend trả một object phẳng: `{ statusCode, code?, timestamp, path, method, message }`
(`src/app/http-exception.filter.ts`). `message` đã được resolve phía server từ `AppValidation`,
nhưng bằng tiếng Anh. `code` là số, hiện có **26 mã** trên toàn hệ thống.

Không bê map 250 dòng của project cũ sang. `src/shared/api/error-codes.ts` giữ map
`code` → tên khoá ngữ nghĩa; `errors.json` giữ bản dịch. Hai thứ tách nhau: map là chuyện của API,
bản dịch là chuyện của ngôn ngữ.

26 mã hiện có, nhóm theo module backend:

| Mã | Tên | Message của backend |
|---|---|---|
| 100001 | INVALID_CREDENTIALS | Invalid phone number or password |
| 100002 | USER_NOT_ACTIVE | User is not active |
| 100005 | PHONENUMBER_DOES_EXIST | Phone number already exists |
| 100006 | PHONENUMBER_IS_REQUIRED | Phone number is required |
| 100007 | PASSWORD_IS_REQUIRED | Password is required |
| 100101 | ROLE_NOT_FOUND | Role not found |
| 109000 | EXPORT_DATABASE_ERROR | Export database error |
| 121000 | FILE_NOT_FOUND | File not found |
| 121001 | FILE_SIZE_EXCEEDS_LIMIT_ALLOWED | File size exceed limit allowed |
| 121002 | NUMBER_OF_FILES_EXCEED_LIMIT_ALLOWED | Number of files exceed limit allowed |
| 121003 | LIMIT_UNEXPECTED_FILE | Limit unexpected file |
| 121004 | LIMIT_PART_COUNT | Limit part count |
| 121005 | LIMIT_FIELD_KEY | Limit field key |
| 121006 | LIMIT_FIELD_COUNT | Limit field count |
| 121007 | LIMIT_FIELD_VALUE | Limit field value |
| 121008 | MULTER_ERROR | Multer error |
| 121009 | ERROR_WHEN_UPLOAD_FILE | Error when upload file |
| 121010 | MUST_EXCEL_FILE | Must excel file |
| 121011 | EXCEL_FILE_WRONG_HEADER | Excel file wrong header |
| 155501 | NOTIFICATION_NOT_FOUND | Notification not found |
| 155502 | SENDER_NOT_FOUND | Sender not found |
| 155503 | RECEIVER_NOT_FOUND | Receiver not found |
| 155504 | NOTIFICATION_CREATE_FAILED | Notification create failed |
| 999901 | EXAMPLE_NOT_FOUND | Example not found |
| 999902 | EXAMPLE_NAME_DOES_EXIST | Example name does exist |
| 999903 | EXAMPLE_NAME_IS_REQUIRED | Example name is required |

### Bug chặn đường: 401 khi đăng nhập sai làm reload cứng trang

Phát hiện khi đọc code để lập kế hoạch, **không** phải lỗi do đợt này gây ra.

`INVALID_CREDENTIALS` (mã 100001) được khai với `HttpStatus.UNAUTHORIZED` trong
`src/auth/auth.validation.ts`. Ở FE, `src/shared/api/http.ts:27` bắt **mọi** 401 rồi gọi
`onUnauthorized()`, mà `src/main.tsx:11` cài handler đó thành `logout()` +
`window.location.assign('/login')`.

Hệ quả: người dùng gõ sai mật khẩu → backend trả 401 → trang reload cứng → state React mất sạch →
dòng `login.isError` ở `LoginPage.tsx:51` **không bao giờ được render**. Người dùng thấy một form
trắng và không biết vì sao.

Dịch một câu lỗi không bao giờ hiển thị là vô nghĩa, nên đợt này phải sửa: handler 401 toàn cục chỉ
áp dụng cho request **không phải** đăng nhập. Sửa tại `http.ts`, kiểm tra `error.config?.url`.

### `resolveApiErrorMessage(error)` và `toastApiError(error)`

Tách làm hai, vì lỗi cần hiển thị ở **hai nơi**, không chỉ toast:

- `LoginPage.tsx:51` và `ExamplesPage.tsx:72` hiện lỗi **inline** trong trang.
- `hooks.ts` hiện lỗi bằng **toast**.

`resolveApiErrorMessage(error: unknown): string` — hàm thuần, trong
`src/shared/lib/api-error-message.ts`. Ba nhánh:

1. **`isApiError(e)` và `e.code` có trong map** → `t('errors:<key>')`.
2. **`isApiError(e)` nhưng mã lạ (hoặc `code` vắng mặt)** → trả `e.message` của backend, kèm
   `console.warn` báo thiếu khoá.

   Cố ý *không* nuốt thành "Đã có lỗi xảy ra" như project cũ: đây là công cụ nội bộ, một câu tiếng
   Anh cụ thể hữu ích hơn một câu tiếng Việt vô nghĩa. `console.warn` là thứ nhắc lập trình viên bổ
   sung khoá còn thiếu.
3. **Không phải `ApiError`** (mất mạng, backend chết — `http.ts` reject nguyên `AxiosError` khi
   không có `response`) → `t('errors:network')`.

Nhánh 3 vá đúng quirk mà order-ui bỏ ngỏ: lỗi network không có toast nào.

`toastApiError(error: unknown): void` — trong `src/shared/lib/toast-error.ts`. Nếu
`isApiError(e) && e.statusCode === 401` thì **không làm gì**: 401 (ngoài login) đã dẫn tới logout +
chuyển trang, một toast nữa chỉ là nhiễu. Ngược lại `toast.error(resolveApiErrorMessage(e))`.

Cả hai **không phải hook**. Đặt tên `resolve*`/`toast*`, **không** đặt `use*` — order-ui có
`useErrorToast` không chứa hook nào, gây hiểu nhầm và vi phạm `eslint-plugin-react-hooks`.

Vì `t` nằm ngoài React ở đây, dùng `i18next.t` trực tiếp (instance đã init), không dùng `useTranslation`.

## Dark mode

`ThemeProvider` của `next-themes` bọc trong `src/app/providers.tsx`:

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
```

`attribute="class"` khớp với `@custom-variant dark (&:is(.dark *))` đã có sẵn ở
`src/index.css:6`. Bộ token `.dark` đã đầy đủ từ `src/index.css:116` — không cần đụng CSS.

`src/components/ui/sonner.tsx` đã gọi `useTheme()` sẵn, nên toast tự khớp theme ngay khi provider
được mount. Không sửa gì trong file đó.

### Hai nút điều khiển

`src/components/layout/ModeToggle.tsx` và `src/components/layout/LanguageToggle.tsx`, dùng
`dropdown-menu` và icon `lucide-react` đã có.

Đặt ở topbar của `AppShell`, **và cả trên `LoginPage`**. `LoginPage` nằm ngoài `AppShell`; nếu
không đặt thì một người dùng có trình duyệt tiếng Anh sẽ thấy màn đăng nhập tiếng Anh mà không có
cách nào đổi.

`ThemeProvider` được mount trong `Providers`, mà `Providers` bọc `RouterProvider` ở `main.tsx`,
nên cả `LoginPage` lẫn `AppShell` đều nằm trong phạm vi provider.

### Bẫy: jsdom không có `matchMedia`

`next-themes` với `enableSystem` gọi `window.matchMedia`, mà jsdom không cài đặt nó.

Hiện tại **không test nào render qua `Providers`** — `ExamplesPage.test.tsx` tự dựng
`QueryClientProvider` + `MemoryRouter` riêng — nên chưa test nào nổ. Đây là bẫy *tiềm ẩn*, không
phải lỗi đang có. Vẫn thêm mock vào `src/test/setup.ts`: nó rẻ, và test đầu tiên render `Providers`
sẽ nổ với một thông báo khó hiểu nếu không có nó.

## Zod schema

Hai schema đang nhét thẳng câu tiếng Việt vào thông báo lỗi:

- `src/features/auth/login.schema.ts` — `.min(1, 'Vui lòng nhập số điện thoại')`
- `src/features/examples/ExampleFormDialog.tsx:18` — schema nội tuyến, `.min(1, 'Vui lòng nhập tên')`

Schema là module thuần, không có `t()`. Cách sạch: schema chứa **khoá**
(`'auth:phonenumberRequired'`); component dịch lúc render qua `t(errors.phonenumber.message)`.
Schema không cần biết ngôn ngữ tồn tại.

## Test

`src/features/auth/login.schema.test.ts` chỉ assert `.success` (boolean), **không** assert nội dung
thông báo. Đổi message thành khoá không làm nó đỏ — không cần sửa file này.

`src/features/examples/ExamplesPage.test.tsx` query bằng chữ tiếng Việt (`/tạo example/i`,
`/trang trước/i`) → **giữ nguyên**. `src/test/setup.ts` init i18n với `lng: 'vi'`, nên chúng vẫn
xanh. Test nên khẳng định thứ người dùng thấy, không phải thứ lập trình viên gõ.

## File

Tạo mới:

```
src/shared/i18n/index.ts
src/shared/i18n/locales/vi/{common,auth,examples,errors}.json
src/shared/i18n/locales/en/{common,auth,examples,errors}.json
src/shared/api/error-codes.ts
src/shared/lib/api-error-message.ts
src/shared/lib/api-error-message.test.ts
src/shared/lib/toast-error.ts
src/components/layout/ModeToggle.tsx
src/components/layout/LanguageToggle.tsx
```

Sửa:

```
src/shared/api/http.ts                       401 toàn cục bỏ qua request đăng nhập
src/shared/api/http.test.ts                  test cho ngoại lệ 401 nói trên
src/main.tsx                                 import '@/shared/i18n'
src/app/providers.tsx                        ThemeProvider
src/components/layout/AppShell.tsx           t() + hai nút toggle
src/features/auth/LoginPage.tsx              t() + hai nút toggle + resolveApiErrorMessage
src/features/auth/login.schema.ts            message → khoá
src/features/examples/ExamplesPage.tsx       t() + resolveApiErrorMessage
src/features/examples/ExampleFormDialog.tsx  t() + schema message → khoá
src/features/examples/DeleteExampleDialog.tsx t()
src/features/examples/columns.tsx            t()
src/features/examples/hooks.ts               toastApiError
src/test/setup.ts                            init i18n (lng: 'vi') + mock matchMedia
package.json                                 3 dep mới
```

`src/features/auth/useLogin.ts` **không** cần sửa: nó chỉ chứa comment tiếng Việt, không có chuỗi UI.
`src/features/auth/login.schema.test.ts` cũng không, xem mục Test.

Dependency mới: `i18next`, `react-i18next`, `i18next-browser-languagedetector`.

## Kiểm chứng

- `npm test` — 43 test hiện có vẫn xanh, cộng test mới cho `toastApiError` (bốn nhánh).
- `npm run typecheck` — sạch. Type augmentation phải khiến khoá sai bị bắt ở đây.
- `npm run lint` — không error mới.
- `npm run build` — sạch.
- Chạy thật: đổi ngôn ngữ, đổi theme, reload → cả hai được nhớ. Ngắt mạng rồi bấm tạo example →
  toast `errors:network`, không phải màn hình trắng.

## Rủi ro

**Thêm mã lỗi mới ở backend mà quên khai ở FE.** `error-codes.ts` là nguồn chân lý thứ hai, không
sinh tự động từ backend. Giảm nhẹ bằng nhánh 3 của `toastApiError`: mã lạ vẫn hiện được message của
backend (chỉ là tiếng Anh) và ghi `console.warn`, thay vì im lặng hoặc hiện chuỗi vô nghĩa. Đây là
sự đánh đổi có ý thức, không phải sơ suất.

**Bản dịch `en` sẽ mục.** Không ai kiểm tra `en` có đủ khoá như `vi` không. Nếu về sau thấy đau, cân
nhắc một test so khớp tập khoá giữa hai ngôn ngữ.
