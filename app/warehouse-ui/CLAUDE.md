# warehouse-ui

Frontend quản lý kho. React 19 + Vite 8 + TypeScript strict. Cấu trúc theo **Feature-Sliced Design**.

## Chạy

Node 24 (`.nvmrc`). Node cũ hơn làm Vitest chết lúc khởi động.

```bash
nvm use && npm install && cp .env.example .env && npm run dev
```

## Kiến trúc — cái gì đi đâu

Sáu tầng. **Tầng trên import tầng dưới, không bao giờ ngược lại:**

```
app  →  pages  →  widgets  →  features  →  entities  →  shared
```

| Tầng | Chứa gì | Ví dụ |
|---|---|---|
| `app/` | Composition root: `main.tsx`, providers, router, guards, styles | `app/main.tsx`, `app/App.tsx`, `app/routes/` |
| `pages/` | Một slice = một màn hình ứng với một route | `pages/examples/`, `pages/login/` |
| `widgets/` | Khối UI composite có trạng thái, không phải một trang | `widgets/app-shell/` |
| `features/` | Một hành động người dùng | `features/auth-login/`, `features/theme-toggle/` |
| `entities/` | Model nghiệp vụ: type + api + hook đọc/ghi | `entities/example/`, `entities/session/` |
| `shared/` | Không biết gì về nghiệp vụ | `shared/ui/`, `shared/api/`, `shared/lib/` |

`app/main.tsx` là entry point thật (`index.html` trỏ thẳng vào đây), `app/App.tsx` là providers,
`app/routes/` gồm khai báo route (`index.tsx` — `createRoutes({ dev })` và `router`), kiểu `handle`
(`handle.ts`), dựng menu (`nav.ts` → `buildNav`), chặn quyền theo route (`RoleGate.tsx`), layout chính
(`AppLayout.tsx`, tiêm menu vào `AppShell` và `NavContext`) và `ProtectedRoute` (`guards.tsx`).

Các file test dựng cả cây router (`app/routes/ErrorPage.test.tsx`, `NotFoundPage.test.tsx`,
`routes.test.tsx`) nằm ở `app/routes/`, không phải trong `pages/tương-ứng/` — chúng import
`createRoutes` từ `@/app/routes` và render bằng `createMemoryRouter` / `renderWithRouter`, tức là test
*composition* ở tầng `app`, không phải test riêng một page. Một test trong `pages/` mà
`import { createRoutes } from '@/app/routes'` là vi phạm ranh giới (`pages` không được import `app`).

### Ba luật, ESLint giữ hộ

1. **Chiều import.** Vi phạm → `boundaries/dependencies` báo lỗi.
2. **Không import ngang tầng.** `features/example-form` không được import `features/example-delete`. Cần dùng chung thì đẩy xuống tầng dưới.
3. **Public API.** Mỗi slice có `index.ts` là cổng duy nhất. Import `@/entities/example`, không bao giờ `@/entities/example/api/hooks`. Ngoại lệ: `shared/` import thẳng theo segment (`@/shared/ui/button`).

**Barrel `index.ts` chỉ được chứa `export`.** Không import phụ, không side-effect, không logic — đó là nguồn gốc vòng import.

Import trong cùng một slice dùng đường dẫn tương đối (`../model/types`) và không bị luật nào chặn.

### Bẫy: `import/resolver` trong `eslint.config.js`

`eslint-plugin-boundaries` chỉ nhận ra alias `@/...` nhờ:

```js
settings: { 'import/resolver': { typescript: { project: './tsconfig.app.json' } } }
```

(gói `eslint-import-resolver-typescript` trong devDependencies). **Đừng xoá dòng này.** Thiếu nó,
boundaries không phân giải nổi `@/...` và mọi rule ranh giới **im lặng cho qua** — `npm run lint`
vẫn xanh nhưng không còn enforce gì cả. Chuyện này đã từng xảy ra thật trong dự án. Nếu nghi ngờ
rule ranh giới đang im lặng bất thường, kiểm bằng cách cố tình tạo một vi phạm (ví dụ cho
`features/` import thẳng `entities/x/model/...` thay vì qua `index.ts`) — nếu lint không bắt được,
resolver đang hỏng.

`boundaries/entry-point` in ra vài dòng cảnh báo deprecation mỗi lần `npm run lint` chạy
(`Rule "boundaries/entry-point" is deprecated...`). Đó là bình thường, đừng đi sửa nó.

### Bẫy: `paths` bị khai hai lần

Alias `@/*` → `./src/*` nằm ở **cả hai** file:

- `tsconfig.app.json` — dùng thật bởi `tsc` và Vite (qua `resolve.tsconfigPaths` trong `vite.config.ts`).
- `tsconfig.json` ở gốc — không được tsc/Vite dùng, tồn tại chỉ để `npx shadcn add` phân giải được
  alias khi thêm component (shadcn CLI chỉ đọc `tsconfig.json` gốc, không đọc `tsconfig.app.json`).

Đổi alias thì phải sửa **cả hai file**. Bản sao ở `tsconfig.json` gốc là cố ý — đừng "dọn dẹp" xoá nó.

### Thêm một màn hình nghiệp vụ mới

1. Type + api + hook → `entities/<tên>/` — slice này cần `index.ts` riêng export public API, nếu
   không `boundaries/entry-point` từ chối mọi import vào nó.
2. Hành động (dialog tạo/sửa/xoá) → `features/<tên>-<hành-động>/` — slice này cũng cần `index.ts`
   riêng export public API, cùng lý do.
3. Màn hình → `pages/<tên>/` — slice này cũng cần `index.ts` riêng export public API, cùng lý do.
4. Khai route trong `createRoutes` (`app/routes/index.tsx`), thêm vào mảng `screens` (thứ tự khai báo =
   thứ tự trong nhóm menu). **Một khai báo duy nhất** sinh ra menu, chặn quyền, breadcrumb và tiêu đề tab:

   ```tsx
   {
     path: '/materials',
     lazy: () => import('@/pages/materials').then((m) => ({ Component: m.MaterialsPage })),
     handle: {
       roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SUPERVISOR],
       nav: { group: 'catalog', labelKey: 'nav:materials', icon: Package },
       crumb: 'nav:materials',
     } satisfies AppRouteHandle,
   }
   ```

   - `lazy` (không `element`): mỗi màn một chunk JS. Chỉ login / 403 / 404 / trang lỗi import tĩnh.
   - `roles`: lấy đúng danh sách `@HasRole(...)` của endpoint GET ở backend. Không khai `roles` = mọi
     người đã đăng nhập; `roles: []` = chỉ `SUPER_ADMIN`. `SUPER_ADMIN` luôn qua (không cần liệt kê).
     `RoleGate` lấy `roles` của match **sâu nhất** có khai: route con không khai thì thừa hưởng cha;
     route con khai `roles` riêng thì dùng roles của nó (có thể rộng hơn cha) — cha không phải trần
     quyền (menu cũng vậy).
   - Không thêm route `loader` (kể cả trả từ `lazy`) trừ khi kiểm quyền trước: loader chạy trước
     `RoleGate` (RoleGate chỉ là layout render sau khi loader xong).
   - `nav`: bỏ đi thì màn không hiện trên sidebar (vd trang chi tiết). `group` ∈ `NAV_GROUP_ORDER`
     (`catalog` → `admin` → `dev`, trong `app/routes/handle.ts`); nhóm mới = thêm vào đó + khoá
     `nav:groups.<key>`. Màn chưa làm thì **không** khai mục menu.
   - `crumb`: nhãn breadcrumb + tiêu đề tab (`"<crumb> · <tên app>"`).
   - `labelKey` / `crumb` là khoá namespace `nav` (`shared/i18n/locales/{vi,en}/nav.json`), kiểm lúc
     biên dịch — thêm khoá vào **cả hai** file trước.
   - Luôn `satisfies AppRouteHandle`: `handle` của react-router là `unknown`, thiếu `satisfies` thì
     khai sai không bị bắt.
5. Test composition (menu hiện đúng theo role, `/forbidden` khi thiếu quyền) ở `app/routes/`, dùng
   `renderWithRouter(createRoutes({ dev: false }), { route, auth })`.

Đừng nhét cả bốn tầng vào một thư mục — đó chính là thứ cấu trúc này tồn tại để ngăn.

Màn chỉ dành cho dev (Example) khai trong `devScreens()` — sau cả cờ `dev` **và** `import.meta.env.DEV`
để bản build production bỏ hẳn cả route lẫn chunk JS.

### Thêm một API mới

1. Type → `entities/<x>/model/types.ts`, **viết tay** (không sinh từ Swagger); backend có `version` thì kế
   thừa `Versioned` (`shared/api/types.ts`). Đối chiếu Swagger khi khai: trường backend **luôn trả** thì
   khai **bắt buộc** dù Swagger ghi tuỳ chọn (DTO dùng `@ApiPropertyOptional` cả cho `slug`, `createdAt`,
   `updatedAt`, `version`). Danh sách có bộ lọc: khai `<X>Filters` cạnh type, tham số là `ListParams<<X>Filters>`.
2. Hàm gọi API → `entities/<x>/api/<x>.api.ts`, chỉ dùng `getData` / `getPaginated` / `postData` /
   `patchData` / `deleteData` từ `shared/api/http.ts`. **Không dùng `axios` trực tiếp** — mất refresh token.
3. Key → `entities/<x>/api/query-keys.ts`, theo mẫu `entities/example/api/query-keys.ts`.
4. Hook → `entities/<x>/api/hooks.ts`:
   - danh sách phân trang có `placeholderData: keepPreviousData`;
   - query phụ thuộc tham số có `enabled`;
   - mutation invalidate `keys.all` + toast thành công;
   - **không tự toast lỗi** — `app/query-client.ts` làm hộ. Tự xử lý lỗi (ví dụ báo tại ô form) thì đặt
     `meta: { suppressErrorToast: true }` và tự gọi `toastApiError` cho các lỗi còn lại.
5. Mã lỗi mới → `shared/api/error-codes.ts` + `errors.json` cả vi và en.
6. Export qua `index.ts` của slice.
7. Test: dữ liệu giả dựng qua `ok<T>()` / `paginated<T>()` / `apiError()` (`shared/test/api.ts`) với type
   của entity, render qua `renderWithProviders` (`shared/test/render.tsx`).

## Tầng API

Backend bọc mọi response trong envelope `{ message, statusCode, timestamp, result }`, còn lỗi thì
**hình dạng khác hẳn**: `{ statusCode, code?, timestamp, path, method, message }`. Envelope và lỗi
khai tay trong `shared/api/types.ts`; type entity khai tay trong `entities/<x>/model/types.ts`.
**Không sinh type từ Swagger**: envelope không có trong Swagger, trường luôn có bị ghi tuỳ chọn, và
phải sinh lại mỗi lần backend deploy.

`shared/api/http.ts` cô lập các điểm lệch của backend, **không nơi nào khác trong app được thấy chúng**:

- Request phân trang dùng `size`, response trả `pageSize`
- Response trả `hasPrevios` (typo của backend)
- `getPaginated(url, { page, size, ...filters })` bỏ bộ lọc `undefined` / `null` / `''` trước khi gửi

Tài nguyên định danh bằng `slug`, không phải `id`.

### Token và phiên

- Token chỉ đọc/ghi qua `shared/api/token-storage.ts` (key `warehouse.auth`). Không đụng `localStorage` trực tiếp.
- Access token sống 15 phút. Request nhận **401** → interceptor gọi `/auth/refresh` **một lần** cho mọi
  request đang chờ (single-flight), rồi gửi lại. Refresh hỏng → interceptor báo lý do
  (`expired` / `revoked` / `userInactive` / `unauthorized`) qua `setSessionEndHandler` →
  `endSession(reason)` → `ProtectedRoute` đưa về `/login?redirect=…` và màn login hiện lý do.
- `/auth/login`, `/auth/refresh` không bao giờ kích hoạt refresh. `/auth/logout` **có**: backend đòi
  access token còn hạn, nên logout sau khi token hết hạn refresh rồi gửi lại để thật sự thu hồi phiên.
- Lỗi mạng, hết giờ (refresh timeout 15s), 5xx, 408, 429 khi refresh **không** kết thúc phiên.
- Refresh hỏng mà storage đã giữ cặp token khác (đổi mật khẩu, tab khác đăng nhập) → không kết thúc
  phiên mới, gửi lại bằng cặp đang lưu.
- Phiên bắt đầu/kết thúc chỉ qua `entities/session`: `startSession`, `endSession`, `logout`,
  `replaceTokens` (đổi mật khẩu — không xoá cache). Tab khác đăng nhập/đăng xuất được đồng bộ qua sự kiện `storage`.

### Lỗi

- Toast lỗi là việc của `app/query-client.ts` (`QueryCache` / `MutationCache`). **Hook không tự toast lỗi.**
- Query lỗi ở lần tải đầu không toast (component hiện lỗi tại chỗ); đã có dữ liệu mà tải lại lỗi thì toast.
- 401 và request bị huỷ không bao giờ toast.
- Tự xử lý lỗi → `meta: { suppressErrorToast: true }` rồi tự gọi `toastApiError` cho phần còn lại
  (ví dụ `features/change-password`).

## Màn danh sách / form — bộ khung dùng chung

Ghép từ các mảnh độc lập (không có "màn CRUD cấu hình sẵn"). Mẫu đầy đủ: `pages/examples/ui/ExamplesPage.tsx`.

- **Trang / số dòng / bộ lọc trên URL**: `useListParams(FILTERS)` (`shared/lib/list-params.ts`), `FILTERS` là
  `z.object({...})` khai **ngoài** component (không lọc thì `z.object({})`; lọc số dùng `z.coerce`). Giá trị sai
  trên URL → mặc định; `setFilters`/`setSize` về trang 1; ghi bằng `replace`. Số dòng: `PAGE_SIZE_OPTIONS`
  (10/20/50, mặc định 10).
  - Lọc boolean dùng `z.stringbool()` — **không** `z.coerce.boolean()` (nó hiểu `"false"` là `true`). Bộ lọc
    nhiều giá trị / mảng (`?status=a&status=b`) **chưa hỗ trợ**: `useListParams` chỉ đọc giá trị đầu.
  - Giữ schema lọc của trang khớp kiểu lọc của entity:
    `const FILTERS = z.object({...}) satisfies z.ZodType<XFilters>`. Bắt được sai kiểu giá trị, **không**
    bắt thiếu/thừa khoá optional — tên khoá vẫn phải tự soát.
  - Effect phụ thuộc **giá trị nguyên thuỷ** (`filters.name`), không phụ thuộc cả object `filters` — object
    đổi identity mỗi lần URL đổi (kể cả chỉ đổi trang).
- **Tự lùi trang**: `useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)`.
- **Bảng**: `DataTable` (`shared/ui/data-table/DataTable.tsx`) — truyền `data={data?.items}` (undefined = chưa
  có dữ liệu), `isLoading={isPending}`, `error`, `pagination={{ …, isFetching: isPlaceholderData }}`.
  Thanh trên bảng: `ListToolbar` (`filters` / `actions`) + `SearchInput` (debounce 300 ms).
- **Form**: `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage` (`shared/ui/form.tsx`).
  Message của schema Zod là **khoá i18n có namespace** (`'examples:nameRequired'`) — `FormMessage` tự dịch;
  chuỗi không phải khoá hiện nguyên. **Mọi** rule cần message là khoá, kể cả lỗi sai kiểu:
  `z.number({ error: 'materials:minRequired' })` — thiếu thì UI tiếng Việt hiện câu tiếng Anh gốc của Zod.
- **Lỗi backend vào ô**: mutation đặt `meta: { suppressErrorToast: true }`, rồi trong `onError`:
  `if (!applyApiErrorToForm(form, error, { 999902: 'name' })) toastApiError(error)`.
- **Trường bắt buộc**: `<FormItem required>` (khai một lần trên `FormItem`, dữ liệu tĩnh qua context —
  không phải state/effect) khiến `FormLabel` tự hiện dấu `*` đỏ (aria-hidden) và `FormControl` tự gắn
  `aria-required="true"` cho control cùng `FormItem` — không dùng thuộc tính `required` gốc của HTML (gây
  bong bóng validate trình duyệt). Form sửa khoá nút Lưu khi form chưa đổi so với giá trị lúc mở
  (`!formState.isDirty`); **không** khoá nút vì form chưa hợp lệ — bấm Lưu vẫn phải báo lỗi tại từng ô và
  focus vào ô lỗi đầu tiên (`handleSubmit` mặc định `shouldFocusError`).
- **Linh kiện**: `Combobox` (lọc tại client, không phân biệt dấu), `DatePicker` (giá trị `YYYY-MM-DD`),
  `NumberInput` (`number | undefined`, không bao giờ `NaN`), `Checkbox`, `Textarea`, `Badge`, `Skeleton`,
  `AlertDialog` (xác nhận xoá).
- **Hiển thị**: `formatNumber` / `formatCurrency` (VND) / `formatDate` / `formatDateTime` (`shared/lib/format.ts`)
  theo ngôn ngữ đang chọn, rỗng → `—`. Component dùng chúng phải gọi `useTranslation()`.
- **Test**: `renderWithProviders(ui, { route, auth: 'admin' | 'customer' | CurrentUser | 'none', queryClient })`.
  `auth` được tầng app tiêm qua `src/app/test-setup.ts` (shared không import entities). Muốn đếm toast với
  handler global thật thì test ở tầng `app` với `queryClient` của `app/query-client.ts`. Component cần
  **data router** (`useMatches`, `useNavigation`, `lazy`, `handle` — vd `AppShell`) thì dùng
  `renderWithRouter(routes, { route, auth })` (cùng file), trả thêm `router`.

Bẫy khi thêm linh kiện shadcn (style `radix-nova`):
- `npx shadcn add` hỏi ghi đè file đã có và treo khi không có TTY → `yes n | npx shadcn@latest add <tên> --yes`.
- CLI để nguyên `import { cn } from "cn"` **và cài nhầm gói npm `cn`** → `npm uninstall cn`, sửa import về
  `@/shared/lib/cn`, chạy `prettier --write`.
- `radix-nova` không còn `form` — `shared/ui/form.tsx` chép từ `new-york-v4`.
- File export `xxxVariants` / hook cạnh component → thêm warning react-refresh; bỏ export hoặc tách file.
- jsdom thiếu `ResizeObserver` / `scrollIntoView` (cmdk) — stub trong `shared/test/setup.ts`; thêm polyfill
  khác chỉ khi có test đỏ vì nó.
- `sidebar` đã tách `SidebarContext` / `useSidebar` / `SIDEBAR_COOKIE_NAME` sang `shared/ui/sidebar-context.ts`
  (import `useSidebar` từ đó, không từ `sidebar.tsx`); `shared/lib/use-mobile.ts` viết lại bằng
  `matchMedia(...).matches` — test màn nhỏ chỉ cần giả `matchMedia`. Chạy lại `shadcn add` cho các file này
  thì phải tách/sửa lại. Tooltip cần `TooltipProvider` (đặt trong `AppShell`).
- `breadcrumb`: đã bỏ `role="link"` / `aria-disabled` của `BreadcrumbPage` (chữ thường, chỉ giữ
  `aria-current="page"`).
- `sidebar`: `SidebarInset` render `<div>` (bản gốc là `<main>`) — `AppShell` tự đặt `<main>` quanh vùng
  nội dung để header nằm ngoài main. Ngoài ra đã sửa: `Sidebar` nhận `mobileTitle` / `mobileDescription`
  (tên ngăn trượt mobile, truyền chuỗi đã dịch); `SidebarTrigger` có `aria-expanded` / `aria-controls`
  (`sidebarId` trong context); Ctrl/⌘ + B bỏ qua khi đang gõ (input/textarea/select/contentEditable,
  IME) hoặc ở trong dialog.

## Quyền

Backend **chỉ enforce bằng role**, và **không authority nào được seed** → `scope` luôn là `"[]"`.

Gác UI bằng `hasRole(user, ROLES.ADMIN)` (`ROLES` / `Role` trong `entities/session`, khớp `RoleEnum`
của backend: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `SUPERVISOR`). `hasRole` **luôn true với `SUPER_ADMIN`**
(khớp bypass của backend) — không cần liệt kê nó. **Không dùng `can()`** — nó luôn trả `false`.

Gác màn hình: `handle.roles` của route (xem "Thêm một màn hình nghiệp vụ mới") — `RoleGate` đưa về
`/forbidden`, `buildNav` ẩn mục menu. Không bọc từng route bằng component guard.

## Đa ngôn ngữ

Tiếng Việt mặc định, tiếng Anh thứ hai. Khoá được kiểm tra kiểu lúc biên dịch.

Namespace `nav`: nhãn menu, tên nhóm (`groups.*`), breadcrumb, tiêu đề tab và trang Tổng quan.

Hai namespace dễ nhầm:
- `errors` (số nhiều) — bản dịch mã lỗi backend, tra qua `shared/api/error-codes.ts`
- `errorPages` — chuỗi của ba trang lỗi

Thêm mã lỗi mới ở backend thì phải thêm vào `error-codes.ts`, nếu không người dùng thấy câu tiếng
Anh nguyên bản của backend (kèm `console.warn`).

## Giao diện sáng/tối

`next-themes`, class trên `<html>`. Dùng token (`bg-background`, `text-muted-foreground`), **không
dùng màu cứng** (`bg-slate-50`) — nếu không dark mode chỉ đúng một nửa.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server, cổng 5175 (`strictPort`, khớp `ALLOWED_ORIGINS` của api); `/api` được proxy tới `VITE_API_PROXY_TARGET` (xem `setup.md`) |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, gồm cả luật ranh giới FSD |
| `npm run format:check` | Prettier, chỉ kiểm tra |
| `npm run test:coverage` | Vitest kèm coverage — ngưỡng trong `vite.config.ts` là sàn chặn tụt lùi, biên rất mỏng; không hạ ngưỡng |
| `npm run build` | Build production |
| `npm run check` | Chạy đủ lint → typecheck → test:coverage → build → format:check, dừng ở bước lỗi đầu tiên. **Chạy trước khi push.** |

Baseline hiện tại của `npm run lint`: đúng **một** warning có sẵn
(`react-refresh/only-export-components` ở `shared/ui/button.tsx`) — không phải do bạn gây ra, đừng
mất công tìm cách sửa nó.

## Nợ kỹ thuật đang treo

- **Env nhét vào bundle lúc build.** Mỗi môi trường cần một image riêng; không promote image từ
  staging lên production được. Chuyển sang runtime config (`window.__ENV__`) khi nào cần điều đó.
- **`entities/` mới có `session` và `example`.** Màn hình nghiệp vụ thật chưa có API backend.
- **Breadcrumb chưa có tên động.** `crumb` là khoá i18n tĩnh; trang chi tiết (`/materials/:slug`) cần tên
  bản ghi thì mở rộng `crumb` (vd hàm nhận `match.data`/`params`) khi làm màn chi tiết đầu tiên.
- **Chưa sắp xếp theo cột.** `BaseQueryDto` nhận `sort` nhưng chưa service nào xử lý (mọi danh sách
  phân trang `createdAt DESC`). Thêm `sort` vào `useListParams`/`DataTable` khi backend làm.
- **Root `tsconfig.json` dùng `baseUrl`**, field mà TypeScript 6 deprecate. Xem lại khi nâng cấp TS,
  và kiểm lại `npx shadcn add` vẫn ghi đúng vào `src/shared/ui/` sau khi sửa.
- **Refresh token nằm ở `localStorage`.** XSS đọc được và giữ phiên **vô thời hạn**: mỗi lần
  `/auth/refresh` ký refresh token mới với hạn 30 ngày mới, nên chỉ logout / logout-all / đổi mật khẩu
  mới chặn được. Chờ backend chuyển sang cookie httpOnly — xem `docs/proposals/2026-09-17-refresh-token-httponly-cookie.md`.
