# Thiết kế: errorElement và route 404 cho warehouse-ui

Ngày: 2026-07-10

> **Đây là ảnh chụp một quyết định, không phải tài liệu sống.**
> Phần "Quyết định và lý do" vẫn đúng — đó là lý do file này được giữ lại. Đặc biệt mục
> "Một lớp lưới, không phải hai": đọc nó trước khi định thêm `ErrorBoundary` bọc `Providers`.
> Phần "Ngoài phạm vi" mô tả thế giới **tại ngày viết**. Muốn biết hiện trạng và nợ kỹ thuật đang treo,
> đọc `CLAUDE.md` ở gốc repo.

## Vấn đề

Một lỗi render bất kỳ trong cây React cho ra **màn hình trắng**: không thông báo, không log, không lối
thoát. `src/app/router.tsx` không có `errorElement` trên bất kỳ route nào, và không có `ErrorBoundary`
nào trong cây.

Gõ sai URL cũng ra màn hình trắng: không có route catch-all `*`, nên không route nào khớp và không gì
được render.

Ngoài ra `/forbidden` hiện là một `<div>` nội tuyến ngay trong `router.tsx:11`, với chuỗi tiếng Việt
hard-code. Nó sót lại sau đợt i18n. Vì đợt này sửa đúng file đó, sửa luôn.

## Phạm vi

- Một route gốc pathless mang `errorElement`, bọc toàn bộ cây route hiện có.
- Ba trang: `ErrorPage`, `NotFoundPage`, `ForbiddenPage`, dùng chung một layout căn giữa.
- Route catch-all `*` → `NotFoundPage`.
- Namespace i18n mới `error`.
- Test: URL không tồn tại → `NotFoundPage`; component ném lỗi → `ErrorPage`, không phải màn hình trắng.

## Ngoài phạm vi

Liệt kê để không quên, không làm đợt này:

- `ErrorBoundary` React bọc `Providers` ở `main.tsx` (xem "Vì sao không có lớp thứ hai").
- Gửi lỗi lên dịch vụ giám sát (Sentry và tương tự). Chưa có hạ tầng.
- Lazy-load route, route manifest.
- Chuyển `onError` lên `QueryCache`/`MutationCache` toàn cục.
- CI.
- Mọi thay đổi trong `warehouse-api`.

## Quyết định và lý do

### Một lớp lưới, không phải hai

`errorElement` trên một route gốc bắt mọi lỗi render và mọi lỗi `loader` trong cả cây route. `ErrorPage`
nằm *trong* router nên dùng được `useRouteError()` và render được `<Link>`.

Đã cân nhắc thêm một `ErrorBoundary` React bọc `Providers` ở `main.tsx` để bắt cả lỗi trong
`ThemeProvider` / `QueryClientProvider`. **Không làm**, và lý do đáng ghi lại:

Kịch bản `Providers` sập rõ ràng nhất là thiếu `VITE_API_BASE_URL` — `src/shared/config/env.ts` ném lỗi.
Nhưng `getEnv()` được gọi ở **top-level của module** `src/shared/api/http.ts`:

```ts
export const http: AxiosInstance = axios.create({ baseURL: getEnv().apiBaseUrl })
```

Nó ném lúc **import module**, trước khi React render dòng nào. Không `ErrorBoundary` nào bắt được —
lớp thứ hai vô dụng ở đúng ca nó được dựng lên để chống. Thêm nó là trả chi phí thật để mua cảm giác
an toàn giả.

Khi nào có một `Provider` thật sự sập *lúc render*, thêm lớp đó. Không phải trước.

### 404 là một trạng thái, không phải một lỗi

Dùng route `*` tường minh trỏ tới `NotFoundPage`, **không** dựa vào `errorElement` bắt `ErrorResponse`
404 của react-router rồi phân nhánh bằng `isRouteErrorResponse(err) && err.status === 404`.

URL sai là trạng thái bình thường của một SPA. Trộn nó vào đường xử lý lỗi khiến cả hai khó đọc:
`ErrorPage` sẽ phải biết về 404, và không ai đọc `router.tsx` mà thấy được 404 được xử lý ở đâu.
`errorElement` để dành cho cái vỡ thật.

### Trang lỗi đứng riêng, không có sidebar

`ErrorPage`, `NotFoundPage`, `ForbiddenPage` không nằm dưới `AppShell` và không nằm dưới
`ProtectedRoute`.

Hệ quả mong muốn: người chưa đăng nhập gõ sai URL vẫn thấy 404, thay vì bị đá sang `/login` rồi bối rối.
`ErrorPage` cũng phải render được khi `AppShell` chính là thứ vừa ném lỗi — nếu nó nằm trong `AppShell`
thì nó chết theo.

### Chi tiết kỹ thuật chỉ hiện ở dev

`ErrorPage` luôn hiện một câu chung và hai nút thoát ("Tải lại", "Về trang chủ").

Khi `import.meta.env.DEV`, hiện thêm `error.message` và stack trong `<pre>`. Vite thay hằng này lúc
build, nên khối dev bị loại khỏi bundle production.

Đây là công cụ nội bộ, nhưng một stack trace trên màn hình vẫn vô nghĩa với thủ kho, và vẫn có thể lộ
đường dẫn nội bộ. Người vận hành cần một câu và một nút bấm, không cần `TypeError: Cannot read
properties of undefined`.

## Cây route

Route gốc pathless bọc mọi thứ:

```tsx
createBrowserRouter([
  {
    element: <Outlet />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forbidden', element: <ForbiddenPage /> },
      {
        element: (
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        ),
        children: [
          { path: '/', element: <Navigate to="/examples" replace /> },
          { path: '/examples', element: <ExamplesPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
```

Route `*` phải là **con cuối cùng** của route gốc, không phải con của nhánh `ProtectedRoute` — nếu nằm
trong đó, người chưa đăng nhập gõ sai URL sẽ bị `ProtectedRoute` đá sang `/login` trước khi thấy 404.

## File

Tạo mới:

```
src/components/layout/CenteredMessage.tsx    layout dùng chung cho ba trang
src/features/error/ErrorPage.tsx
src/features/error/NotFoundPage.tsx
src/features/error/ForbiddenPage.tsx
src/features/error/ErrorPage.test.tsx        router ném lỗi → ErrorPage, không phải màn hình trắng
src/features/error/NotFoundPage.test.tsx     URL không tồn tại → NotFoundPage
src/shared/i18n/locales/vi/error.json
src/shared/i18n/locales/en/error.json
```

Sửa:

```
src/app/router.tsx              route gốc + errorElement + route '*' + ForbiddenPage
src/shared/i18n/index.ts        đăng ký namespace `error` (import + resources + mảng `ns`)
src/shared/i18n/i18n.test.ts    suy danh sách namespace từ `resources.vi` thay vì hard-code
```

### `CenteredMessage`

Một component nhận `title`, `description`, và `children` (chỗ đặt nút). Ba trang lỗi khác nhau ở nội
dung, giống nhau ở khung. Không có nó thì cùng một khối `flex min-h-screen items-center justify-center`
bị chép ba lần.

Dùng token theme (`bg-background`, `text-muted-foreground`), không màu cứng — nếu không dark mode chỉ
đúng một nửa.

## Namespace i18n

Namespace mới tên **`error`** (số ít), **không** nhập vào `errors` (số nhiều).

`errors` đang giữ bản dịch của 26 mã lỗi backend, do `src/shared/api/error-codes.ts` tra vào. `error`
giữ chuỗi của ba trang lỗi. Hai khái niệm khác nhau: một cái là "backend từ chối yêu cầu này", một cái
là "app vừa vỡ". Gộp lại thì `errors.json` thành cái sọt rác và không ai biết khoá nào do code nào tra.

Khoá của `error`:

```
title, description, reload, goHome,
notFoundTitle, notFoundDescription,
forbiddenTitle, forbiddenDescription,
detailsHeading
```

Cả `vi` và `en`.

### Sửa luôn một lỗ trong test key-parity

`src/shared/i18n/i18n.test.ts:21` hard-code danh sách namespace:

```ts
const namespaces = ['common', 'auth', 'examples', 'errors'] as const
```

Thêm namespace `error` mà quên sửa dòng này thì namespace mới **không được canh** — đúng loại lỗi im
lặng mà test đó sinh ra để chống. Nó tự bỏ sót chính mình.

Đổi thành suy từ nguồn:

```ts
const namespaces = Object.keys(resources.vi) as (keyof typeof resources.vi)[]
```

Từ nay thêm namespace nào cũng được canh tự động. Đây là sửa nhỏ, nằm trong file đợt này phải chạm
tới, và nó chặn đúng cái bẫy mà đợt này sẽ dẫm vào.

## Test

`NotFoundPage.test.tsx` — `createMemoryRouter` với cùng cây route, `initialEntries: ['/khong-ton-tai']`,
khẳng định thấy chuỗi `error:notFoundTitle`.

`ErrorPage.test.tsx` — **test quan trọng nhất**. Dựng `createMemoryRouter` với một route có element ném
lỗi ngay lúc render, và `errorElement: <ErrorPage />`. Khẳng định `ErrorPage` hiện ra. Đây chính là thứ
chứng minh màn hình trắng đã hết; không có nó thì cả đợt này chỉ là niềm tin.

React log lỗi ra `console.error` khi một component ném — im nó trong test bằng
`vi.spyOn(console, 'error').mockImplementation(() => {})`, nếu không output test đầy nhiễu và vi phạm
quy ước "output phải sạch".

Assert theo `i18n.t('error:...')`, không theo câu tiếng Việt nguyên văn. Đây là quy ước đã thiết lập ở
đợt i18n: sửa bản dịch không được phép làm đỏ unit test.

## Kiểm chứng

- `npm test` — 62 test hiện có vẫn xanh, cộng test mới. Đặc biệt `guards.test.tsx` không được đỏ:
  nó tự dựng `MemoryRouter` riêng, không dùng `router.tsx`.
- `npm run typecheck` sạch. Khoá `error:*` sai phải bị `tsc` bắt.
- `npm run lint` không error mới.
- `npm run build` sạch.
- Chạy thật: gõ `/khong-ton-tai` → thấy 404 kể cả khi chưa đăng nhập.

## Rủi ro

**`errorElement` không bắt lỗi trong event handler và trong code bất đồng bộ.** Đây là giới hạn của
React error boundary, không phải của react-router. Một lỗi ném trong `onClick` vẫn nổi lên `window`.
Lỗi từ react-query đã được `toastApiError` xử lý riêng, nên khoảng trống thực tế hẹp — nhưng nó tồn tại,
và không nên tưởng rằng `errorElement` phủ hết mọi thứ.

**`ErrorPage` cũng có thể ném.** Nếu `useTranslation` hay `CenteredMessage` vỡ bên trong nó, không còn
lưới nào bên dưới. Giữ `ErrorPage` càng đơn giản càng tốt: không gọi API, không dùng store, không logic
điều kiện ngoài cờ `import.meta.env.DEV`.
