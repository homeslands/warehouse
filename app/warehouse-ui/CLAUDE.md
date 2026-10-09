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
2. **Không import ngang tầng.** `features/example-form` không được import `features/example-delete`;
   `entities/store` không được import `entities/warehouse`. Cần dùng chung thì đẩy xuống tầng dưới,
   hoặc — khi cả hai đã là entity và không còn tầng nào thấp hơn để đẩy xuống — làm ở `features`, nơi
   được phép import cả hai (vd `features/store-assign-warehouse` invalidate cả `storeKeys.all` lẫn
   `warehouseKeys.all` sau khi gán kho cho cửa hàng).
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
   - `authority`: gác theo **quyền** (`Authority.code`, endpoint gắn `@RequireAuthority(...)` ở
     backend thay vì `@HasRole`). Khai cùng `roles` thì phải qua **cả hai** (AND) — khớp cách
     backend tách `@HasRole` và `@RequireAuthority` thành hai guard độc lập. Ví dụ: `/permissions`
     khai `handle.authority: ['MANAGE_PERMISSIONS', 'ROLE_READ']` — **mảng = phải có tất cả** (màn gọi
     nhiều endpoint gác bằng mã khác nhau; kiểm bằng `hasAuthority` trong `app/routes/handle.ts`).
     Chuỗi rỗng bị coi như không khai (fail-closed,
     xem `readHandle` ở `app/routes/handle.ts`) — đừng khai `authority: ''` để "tạm tắt gác".
   - Không thêm route `loader` (kể cả trả từ `lazy`) trừ khi kiểm quyền trước: loader chạy trước
     `RoleGate` (RoleGate chỉ là layout render sau khi loader xong).
   - `nav`: bỏ đi thì màn không hiện trên sidebar (vd trang chi tiết). `group` ∈ `NAV_GROUP_ORDER`
     (`catalog` → `admin` → `dev`, trong `app/routes/handle.ts`); nhóm mới = thêm vào đó + khoá
     `nav:groups.<key>`. Màn chưa làm thì **không** khai mục menu.
   - `crumb`: nhãn breadcrumb + tiêu đề tab (`"<crumb> · <tên app>"`).
   - **Trang chi tiết** là route con lồng dưới route danh sách (`/warehouses/:slug` dưới `/warehouses`),
     khai `handle.crumb: 'nav:detail'`. Trang gọi `useCrumbTitle(record?.name)` (`@/widgets/app-shell`)
     để breadcrumb và tiêu đề tab hiện tên bản ghi. Bấm **cả hàng** mở chi tiết (`DataTable`
     `onRowClick`; ô tên vẫn là `<Link>` cho bàn phím và Ctrl/⌘+bấm), cả hai gửi `state.backTo`; nút
     quay lại đọc bằng `readBackTo(location.state, '/warehouses')` (`shared/lib/back-link.ts`). Thân
     trang là **một**
     `DetailCard` "Tổng quan" (`shared/ui/detail.tsx`): nhãn trên giá trị, lưới 1/2/3 cột; nhóm khác
     loại (vd pháp nhân) là `DetailGroup` có tiêu đề trong cùng card; trường dài `span="full"`; tạo/cập
     nhật lúc ở chân card (`DetailMeta`). Không lặp lại tên — đã là `<h1>`.
   - `labelKey` / `crumb` là khoá namespace `nav` (`shared/i18n/locales/{vi,en}/nav.json`), kiểm lúc
     biên dịch — thêm khoá vào **cả hai** file trước.
   - Luôn `satisfies AppRouteHandle`: `handle` của react-router là `unknown`, thiếu `satisfies` thì
     khai sai không bị bắt.
5. `roles`/`authority` của route = quyền **XEM** (guard của endpoint GET). Quyền **GHI** gác riêng
   trong màn, **theo đúng decorator của từng endpoint ghi**:
   - `@RequireAuthority(X)` → `can(user, 'X')`, **mỗi nút một mã** của đúng endpoint nó gọi
     (`/examples`: Tạo ↔ `EXAMPLE_CREATE`, Sửa ↔ `EXAMPLE_UPDATE`, Xoá ↔ `EXAMPLE_DELETE`).
   - `@HasRole(RoleEnum.Admin)` → `hasRole(user, ROLES.ADMIN)`.
   - Màn mà backend **đang chuyển** từ role sang authority (`/warehouses`, `/stores`): luật đặt ở
     `pages/<x>/model/abilities.ts` — một hàm thuần `<x>Abilities(user, flags)` trả
     `{ create, update, delete, … }`, nhánh theo cờ trong `BACKEND_SUPPORTS`. Trang gọi
     `<x>Abilities(user, BACKEND_SUPPORTS)`; test truyền cờ trực tiếp (không mock module). Route đọc
     cờ qua `createRoutes({ capabilities })`.
   - Nút mở hộp cần tải dữ liệu của **endpoint khác** thì cần cả quyền đó: gán quản lý kho =
     `WAREHOUSE_ASSIGN_MANAGER` **và** `USER_READ` **và** `ROLE_READ` (hộp tải `GET /roles` rồi `GET /users`);
     gán kho cho cửa hàng =
     `STORE_UPDATE` **và** `WAREHOUSE_UPDATE` (chính endpoint gán đòi cả hai) **và** `WAREHOUSE_READ`
     (hộp tải danh sách kho).
   Không có quyền thì ẩn hẳn nút, và **không dựng cột thao tác** khi không còn nút nào trong cột
   (ngăn cách trước mục Xoá cũng chỉ vẽ khi phía trên còn mục khác).
6. Test composition (menu hiện đúng theo role, `/forbidden` khi thiếu quyền) ở `app/routes/`, dùng
   `renderWithRouter(createRoutes({ dev: false }), { route, auth })`.

Đừng nhét cả bốn tầng vào một thư mục — đó chính là thứ cấu trúc này tồn tại để ngăn.

Màn chỉ dành cho dev (Example) khai trong `devScreens()` — sau cả cờ `dev` **và** `import.meta.env.DEV`
để bản build production bỏ hẳn cả route lẫn chunk JS.

### Thêm một API mới

1. Type → `entities/<x>/model/types.ts`, **viết tay** (không sinh từ Swagger); chỉ **các loại phiếu**
   (nhập/xuất/kiểm kho) còn `version` → kế thừa `Versioned` (`shared/api/types.ts`); danh mục (kho, cửa
   hàng, vật tư, loại vật tư, đơn vị) **không** có `version` từ `WMS-10-be(2)`. Đối chiếu Swagger khi khai:
   trường backend **luôn trả** thì khai **bắt buộc** dù Swagger ghi tuỳ chọn (DTO dùng `@ApiPropertyOptional`
   cả cho `slug`, `createdAt`, `updatedAt`, `version`). Danh sách có bộ lọc: khai `<X>Filters` cạnh type,
   tham số là `ListParams<<X>Filters>`.
2. Hàm gọi API → `entities/<x>/api/<x>.api.ts`, chỉ dùng `getData` / `getPaginated` / `postData` /
   `patchData` / `putData` / `deleteData` từ `shared/api/http.ts`. **Không dùng `axios` trực tiếp** — mất
   refresh token. Backend dùng `PUT` cho các endpoint "thay đúng một slot" và idempotent
   (`PUT /warehouses/:slug/manager`, `PUT /stores/:slug/warehouse`): **đừng gộp chúng vào form sửa** —
   một lần bấm Lưu hoá thành hai request, lỗi nửa chừng không xử lý gọn được. Endpoint bỏ gán nhận
   `null` tường minh (`managerSlug: null`, `warehouseSlug: null`), không phải thiếu field hay chuỗi rỗng.
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
- **403 do thiếu quyền** (`isPermissionDenied`, `shared/api/http.ts`) = `scope` trong store đã cũ
  vì người khác vừa đổi quyền của role mình. `app/query-client.ts` nạp lại `/auth/me`
  (`refreshCurrentUser`, gộp các lời gọi chồng nhau thành một request) → menu, nút, `RoleGate` tự
  cập nhật; mất quyền vào màn đang đứng thì bị đưa sang `/forbidden`. Toast dùng
  `id: 'permission-denied'` nên nhiều request cùng bị từ chối chỉ hiện **một** toast. Việc nạp lại
  chạy **trước** mọi nhánh bỏ toast (`suppressErrorToast`, lỗi lần tải đầu) — các nhánh đó chỉ tắt
  việc *báo*, không tắt việc *làm mới quyền*. Backend không gắn `code` cho loại 403 này nên nhận diện
  bằng `statusCode === 403` + không `code` + message `"Forbidden resource"` (câu mặc định của Nest);
  phải khớp message vì `FeatureGuard` cũng trả 403 không `code`. Có mã riêng từ backend thì đổi sang
  so `code`. Phần làm mới quyền **không** có trong `mutationToastQueryClient()` (`shared` không import
  được `entities`) — test nó ở tầng `app` (`app/query-client.test.ts`, `app/permission-revoked.test.tsx`).
  Chỉ bắt được **bị thu** quyền; chiều **được cấp thêm** do `usePermissionSync` lo (dưới đây).
- **Quay lại tab thì kiểm tra lại quyền**: `usePermissionSync` (`entities/session`, gắn trong
  `app/App.tsx` cạnh `useSession`) nạp lại `/auth/me` khi tab hiện lại sau khi bị ẩn **≥ 30s**
  và cách lần trước **≥ 60s** (tính cả lần nạp lúc mở phiên) — luật nằm ở hàm thuần `shouldRecheck`.
  Vai trò hoặc tập `scope` khác đi (không tính thứ tự) → toast thông tin "Quyền của bạn vừa được cập
  nhật."; không đổi thì im lặng. Chuyển giữa các màn trong app **không** tốn request nào.
- **Trang 403 nêu lý do**: `RoleGate` nhớ màn gần nhất đã cho vào; bị chặn ngay tại **đúng** màn
  đó (quyền đổi giữa phiên) → `/forbidden?reason=permissionChanged`, `ForbiddenPage` hiện "Quyền truy
  cập đã thay đổi". Tự gõ URL không có quyền → `/forbidden` trần, câu chung như cũ.
- **Bẫy khi test các hook trong `entities/session`**: `src/app/test-setup.ts` import barrel
  `@/entities/session` trước khi file test chạy, nên module trong barrel đã giữ bản **thật** của mọi
  thứ nó import — `vi.mock('sonner')` hay `vi.mock('./refresh-user')` trong file test **không chen
  vào được**, mock im lặng không bao giờ thấy lời gọi. Kiểm thứ người dùng thấy (render `<Toaster />`
  thật, đếm request bằng MSW) hoặc tách luật ra hàm thuần (`shouldRecheck`). Module **ngoài** barrel
  (vd `app/query-client.ts`) thì `vi.mock('@/entities/session', …)` vẫn ăn bình thường.
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
  Thanh trên bảng: `ListToolbar` — `search` (ô tìm, căn **trái**, `SearchInput` debounce 300 ms),
  `filters` rồi `actions` (nút Tạo…) căn **phải**, nút hành động ngoài cùng; không có ô tìm thì cả cụm vẫn
  nằm bên phải.
  Khung bảng hẹp: cột phụ khai `meta: { hideBelow: '@sm' | '@2xl' | '@4xl' }` trong `ColumnDef` — **container
  query** theo bề rộng thật của khung bảng (breakpoint theo cửa sổ sai khi sidebar đang mở); xem đủ ở trang
  chi tiết. Cột tên, trạng thái, thao tác không khai. Cột chỉ có icon (menu `⋯`) khai `meta: { compactHeader: true }` — chữ tiêu
  đề chỉ còn cho trình đọc màn hình khi khung hẹp. Cột `id: 'actions'` được `DataTable` **ghim mép phải**
  (`data-pinned="right"`, nền đục, bóng mép khi bảng tràn) — một ô quá rộng không đẩy được nút `⋯` ra ngoài.
  Ô mặc định không xuống dòng (`TableCell` của shadcn). Cột chữ dài do người dùng nhập: bọc
  `block max-w-* whitespace-normal`; chuỗi không có khoảng trắng (email) thêm `break-words` — **đừng dùng
  `[overflow-wrap:anywhere]`**: nó hạ min-content về 1 ký tự nên bảng bóp cột, email ngắn cũng gãy giữa chữ.
  Nhãn ngắn mà có thể dài (vai trò tự tạo): `truncate` + `title`. Danh sách trong ô: 2 mục + "+N", đủ ở
  `title` và `sr-only`. Kiểm bằng skill `break-ui` (dữ liệu xấu thật, nhiều khổ màn) trước khi báo xong.
  Bộ lọc trên thanh (`ListToolbar`), không cần khai gì thêm:
  - **Desktop vừa một hàng**: ô tìm trái, bộ lọc + nút hành động phải.
  - **Desktop không vừa** (laptop có sidebar — `toolbar-fit.ts` đo chỗ thật của thanh, không theo cửa sổ): gom
    vào nút "Bộ lọc (n)" mở popover; thanh luôn một hàng, nút hành động không rơi xuống hàng riêng.
  - **Mobile < 768px**: hàng 1 ô tìm + nút hành động, hàng 2 **chip lướt ngang** (không có ô tìm thì nút hành
    động đứng cuối hàng chip). `SelectFilter`/`DateRangeFilter` tự đổi sang dạng chip qua `filter-display.ts`:
    chưa chọn ghi tên bộ lọc, đã chọn ghi giá trị + ✕. Bộ lọc khác loại (Combobox, ô tick) được hàng chip bo tròn.
  - Nút hành động trên mobile chỉ còn icon (`<span className="max-md:sr-only">` cho chữ) để ô tìm không bị cắt.
  - Truyền `activeFilterCount` (số trên nút "Bộ lọc") và `onClearFilters` (nút "Xoá bộ lọc").
- **Form**: `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage` (`shared/ui/form.tsx`).
  Message của schema Zod là **khoá i18n có namespace** (`'examples:nameRequired'`) — `FormMessage` tự dịch;
  chuỗi không phải khoá hiện nguyên. **Mọi** rule cần message là khoá, kể cả lỗi sai kiểu:
  `z.number({ error: 'materials:minRequired' })` — thiếu thì UI tiếng Việt hiện câu tiếng Anh gốc của Zod.
- **Lỗi backend vào ô**: mutation đặt `meta: { suppressErrorToast: true }`, rồi trong `onError`:
  `if (!applyApiErrorToForm(form, error, { 999902: 'name' })) toastApiError(error)`.
- **Đừng dùng thuộc tính validate gốc của HTML trên input** (`required`, `type="email"`,
  `pattern`, `min`/`max`). Trình duyệt **và jsdom** chạy validate gốc TRƯỚC khi submit, nên form
  không gửi, resolver Zod không chạy, và **không lỗi nào hiện ra** — nhìn như bấm Lưu mà không có
  gì xảy ra. Đã cắn thật với `type="email"` ở `features/profile-form`. Cần bàn phím email trên
  mobile thì dùng `inputMode="email"` (chỉ gợi ý bàn phím, không validate).
- **Trường bắt buộc**: `<FormItem required>` (khai một lần trên `FormItem`, dữ liệu tĩnh qua context —
  không phải state/effect) khiến `FormLabel` tự hiện dấu `*` đỏ (aria-hidden) và `FormControl` tự gắn
  `aria-required="true"` cho control cùng `FormItem` — không dùng thuộc tính `required` gốc của HTML (gây
  bong bóng validate trình duyệt). Form sửa khoá nút Lưu khi form chưa đổi so với giá trị lúc mở
  (`!formState.isDirty`); **không** khoá nút vì form chưa hợp lệ — bấm Lưu vẫn phải báo lỗi tại từng ô và
  focus vào ô lỗi đầu tiên (`handleSubmit` mặc định `shouldFocusError`).
- **Kiểm ngay khi nhập xong**: mọi `useForm` khai `mode: 'onTouched'` — một ô được kiểm khi rời ô lần đầu,
  sau đó kiểm lại mỗi lần gõ (lỗi tự mất khi sửa đúng); không la lỗi khi mới gõ chữ đầu. Ô **trống** chỉ đi
  ngang qua chưa bị la "bắt buộc" — lỗi đó hiện sau lần bấm gửi đầu (ô đang sửa bị xoá trắng thì báo ngay);
  luật nằm ở `visibleError` trong `shared/ui/form.tsx`, không giấu lỗi backend (`type: 'server'`). Ô có
  ràng buộc định dạng (SĐT, mã, MST, độ dài mật khẩu) có `FormDescription` gợi ý hiện sẵn; có lỗi thì câu
  lỗi thay chỗ gợi ý — câu lỗi vì thế ngắn ("… không đúng định dạng"), chi tiết nằm ở gợi ý. Luật nối hai ô
  (`refine` cấp object, vd "Nhập lại mật khẩu" khớp "Mật khẩu") cần thêm
  `useRevalidateWhenTouched(form, nguồn, đích)` (`shared/lib/form-validation.ts`) — RHF chỉ kiểm lại ô
  đang gõ nên lỗi ở ô đích đứng yên khi sửa ô nguồn. Ô chọn (`Select`, `Combobox`, `DatePicker`, `Switch`)
  không nối `onBlur` nên chỉ báo lỗi khi bấm Lưu — chấp nhận được vì chọn xong là hợp lệ.
- **409 (`isVersionConflict`) thì đóng hộp** — chỉ áp cho thứ còn `version` (màn Example, và các loại
  phiếu sau này): khi mutation trả 409 vì `version` lệch, bên gọi tự đóng hộp thay vì giữ nó mở — giữ
  mở chỉ tạo vòng lặp thử lại vì `version` trong tay đã cũ.
  - **Kho và cửa hàng KHÔNG có nhánh này**: backend bỏ `version` cho danh mục ở `WMS-10-be(2)`. Hệ
    quả: hai người sửa cùng một kho cùng lúc thì **người lưu sau ghi đè người lưu trước, không có
    cảnh báo** — quyết định của backend, FE không bù được.
- **Sheet hay dialog** — quy ước của dự án, chọn theo *hình dạng thao tác*, không theo sở thích:
  - **form nhiều ô → `FormSheet`** (`shared/ui/FormSheet.tsx`): ngăn trượt bên phải ~480px (full width
    dưới 640px), tiêu đề cố định, vùng nội dung cuộn được, chân sheet cố định chứa Huỷ/Lưu. Props:
    `open`, `onOpenChange`, `title`, `description?`, `submitLabel`, `isPending`, `submitDisabled?`,
    `isDirty?`, `confirmation?`, `onSubmit`, `children`. Truyền `isDirty={form.formState.isDirty}`: đóng
    form đã sửa mà chưa lưu (Huỷ, ×, Esc, bấm ra ngoài) thì hỏi "Bỏ thay đổi chưa lưu?" trước.
    **Thao tác TẠO phải xác nhận** (nghiệp vụ chốt): `handleSubmit` chỉ giữ giá trị đã hợp lệ vào state
    rồi mở `confirmation` ("Xác nhận tạo …", tóm tắt mã/tên); bấm xác nhận mới gọi API; gửi lỗi thì đóng
    hộp để lỗi tại ô hiện ra. **Sửa thì lưu thẳng**, không hỏi. Mẫu: `features/warehouse-form`. Test
    bấm qua hộp bằng `confirmDialog(user, nhãn)` (`shared/test/confirm.ts`). Nút Lưu nằm TRONG `<form>` (không dùng thuộc tính `form=` — jsdom không nối
    nó qua portal của Radix). Mẫu: `features/warehouse-form`, `features/store-form`.
    Bẫy CSS: class ghi đè chiều rộng phải dùng cùng tiền tố biến thể
    (`data-[side=right]:sm:max-w-[480px]`), vì `sheet.tsx` gốc có `data-[side=right]:w-3/4` — class
    trần thua về specificity và jsdom **không** phát hiện được (chỉ thấy khi xem CSS đã build).
    Cùng loại bẫy, hai biến thể khác đã cắn thật trong dự án này:
    - `AlertDialogContent` có `data-[size=sm]:max-w-xs`. Truyền `className="max-w-md"` **không ăn**:
      tailwind-merge không coi hai class khác biến thể là trùng, và selector kèm `[data-size]` thắng
      specificity. Phải viết `data-[size=sm]:max-w-md`.
    - `AlertDialogAction`/`AlertDialogCancel` truyền className qua `Slot` của Radix, mà `Slot`
      **nối chuỗi** chứ không chạy tailwind-merge → `size="lg"` (`h-9`) cộng `className="h-11"` để lại
      CẢ HAI trên phần tử, thắng thua do thứ tự utility trong stylesheet. Đừng ghi đè chiều cao bằng
      className ở đó — thêm hẳn một `size` vào `button.tsx` (đó là lý do có `xl`).

    Cả hai đều vô hình khi đọc code và khi chạy test. Cách kiểm: render thật rồi in `element.className`
    ra xem class nào còn sống sót.
  - **thao tác một ô (gán, chọn) → `Dialog`**: mẫu `features/warehouse-assign-manager`,
    `features/store-assign-warehouse`. Không dựng react-hook-form cho một ô — state cục bộ + một
    `<p role="alert">` cho lỗi backend thuộc ô đó là đủ.
  - **Mọi hộp thoại đều cùng một hình dáng**: huy hiệu icon `DialogIcon` (`shared/ui/DialogIcon.tsx`
    — quầng ba lớp, `tone="destructive"` cho hành động phá huỷ, mặc định là tông chính) ở đầu, phần
    đầu căn giữa (`<DialogHeader className="items-center text-center">`), chân hộp phẳng
    (`className="flex-row border-t-0 bg-transparent [&>button]:flex-1"`) với nút `size="xl"`.
    Dùng `flex-1` chứ **không** `grid-cols-2`: nhiều hộp có nút hiện theo điều kiện (vd "Bỏ gán" chỉ
    hiện khi đã gán ai đó), lưới cứng hai cột sẽ để nút còn lại nằm lẻ nửa bên trái.
    Cỡ chữ tiêu đề/mô tả nằm ở `DialogTitle`/`AlertDialogTitle` gốc — đừng gắn `text-*` ở từng hộp.
  - **xác nhận → `ConfirmDialog`** (`shared/ui/ConfirmDialog.tsx`, bọc `Dialog`): xoá, ngừng/mở
    hoạt động, đăng xuất mọi thiết bị. `tone`: `destructive` (mặc định) cho hành động phá huỷ,
    `success` cho hành động tích cực (vd mở lại hoạt động), `default` cho trung tính — đổi cả màu
    quầng icon lẫn nút xác nhận.
    **Hành động đổi trạng thái bản ghi thì HỎI LẠI cả hai chiều**: một hộp lo cả bật lẫn tắt, hướng
    suy ra từ `isActive` của chính bản ghi (`features/<x>-toggle-active`), trang chỉ giữ một mẩu
    state. Đừng làm chiều "bật" thành thao tác một cú bấm — trước đây từng vậy và nó lệch hẳn
    khỏi phần còn lại. **Đừng dựng lại hộp xác nhận bằng `AlertDialog` trần** —
    sáu hộp hiện có đều đi qua nó, thêm hộp thứ bảy cũng vậy. Props: `open`, `onOpenChange`, `icon`
    (glyph trần, quầng ba lớp do hộp tự vẽ), `title`, `description`, `confirmLabel`, `cancelLabel`,
    `closeLabel`, `isPending?`, `onConfirm`. Phần "nhớ bản ghi cuối lúc hộp mờ dần" thuộc về bên gọi
    vì nó gắn với entity.
    **Vì sao bọc `Dialog` chứ không phải `AlertDialog`:** `AlertDialog` của Radix hard-code
    `onPointerDownOutside: (e) => e.preventDefault()` — không gỡ được bằng props — nên không bao giờ
    đóng được bằng cách bấm ra ngoài. `ConfirmDialog` vì thế dựng trên `Dialog` rồi đặt lại
    `role="alertdialog"` (Radix spread `...contentProps` SAU `role` nên ghi đè được): vừa có cử chỉ
    bấm-ra-ngoài-để-đóng, vừa giữ đúng ngữ nghĩa ARIA. Đổi lại phải **tự** chặn mọi lối đóng khi
    đang gửi (`onEscapeKeyDown`, `onPointerDownOutside`, `showCloseButton={!isPending}`) — có test
    trong `ConfirmDialog.test.tsx`.

  - **Mọi hộp thoại đều có đủ nút Huỷ + nút xác nhận, và đóng được bằng cách bấm ra ngoài** (trừ lúc
    đang gửi request). Nút × của `Dialog`/`Sheet` lấy nhãn từ `common:close` — **đừng hardcode
    "Close"**; bản shadcn gốc viết cứng tiếng Anh, đã sửa ở cả `dialog.tsx` và `sheet.tsx`.
  - Màn Example giữ `Dialog` cho form — cố ý, **đừng đi sửa nó**.
  - **Không đóng được khi đang gửi**: `FormSheet` và hai hộp gán (`AssignWarehouseManagerDialog`,
    `AssignStoreWarehouseDialog`) đều chặn `onEscapeKeyDown` / `onPointerDownOutside` và giấu nút ×
    (`showCloseButton={!isPending}`) lúc đang gửi — `Dialog.Close`/`SheetContent` của Radix gọi thẳng
    `onOpenChange` khi bấm ×, không đi qua hai handler kia, nên phải xử lý riêng.
- **Linh kiện**: `Combobox` (lọc tại client, không phân biệt dấu), `DatePicker` (giá trị `YYYY-MM-DD`),
  `NumberInput` (`number | undefined`, không bao giờ `NaN`), `Checkbox`, `Switch`, `Textarea`, `Badge`,
  `Skeleton`, `AlertDialog` / `ConfirmDialog` (xác nhận phá huỷ), `Select` (`shared/ui/select.tsx`, shadcn/Radix — mọi ô
  chọn trong app đều dùng nó, **không còn `<select>` gốc ở đâu**), `SelectFilter`
  (`shared/ui/data-table/SelectFilter.tsx` — ô lọc một-trong-vài-giá-trị trên `ListToolbar`, bọc quanh
  `Select`, nhãn qua `aria-label`).
  - Radix `Select.Item` **không nhận `value=""`** (chuỗi rỗng dành riêng cho "chưa chọn gì", khai vậy
    là ném lỗi). `SelectFilter` vì thế đổi mục "không lọc" sang một giá trị nội bộ rồi dịch ngược về
    `''` trước khi báo ra — bên ngoài vẫn chỉ thấy `''`. Ô chọn mới nào có mục "tất cả" phải làm y vậy.
  - Nhãn nhìn thấy được **không** nối được bằng `<label>` bọc ngoài (nút mở là `<button>`, không phải
    control của form) — đặt tên khả truy cập bằng `aria-label` trên `SelectTrigger`.
- **Ô tuỳ chọn và chuỗi rỗng**: `@IsOptional()` của backend chỉ bỏ qua `undefined`/`null`, **không** bỏ
  qua `''`. Ô tuỳ chọn có validator định dạng (`phonenumber` `@Matches`, `email` `@IsEmail`) phải gửi
  `undefined` khi trống, nếu không backend trả lỗi định dạng cho một ô người dùng đã bỏ trắng. Ô tuỳ
  chọn chỉ có `@IsOptional()` (`description`, `address`, `invoiceAddress`) gửi `''` được — và đó là
  cách duy nhất để **xoá** nội dung cũ khi sửa (PATCH partial: field vắng mặt = giữ nguyên).
- **Ngừng/mở hoạt động** là PATCH chỉ `{ isActive }` (partial), không phải gửi lại cả form.
  Backend bắt **ngừng hoạt động trước khi xoá** (100517 / 101016) → khoá sẵn mục Xoá kèm `title` nêu lý
  do, thay vì để người dùng bấm rồi ăn toast lỗi.
- **Danh sách lựa chọn dựng từ trang dữ liệu đang hiển thị thì luôn có thể cũ** (kho "còn trống" của
  `AssignStoreWarehouseDialog` tính từ `warehouseSlug` của các dòng cửa hàng ở `StoresPage`, không
  phải một trường "thuộc cửa hàng nào" trên chính kho) — cửa hàng ở trang khác hay người khác vừa gán
  thì không thấy được. Vì vậy lỗi trùng/đã-bị-chiếm (101019/101020) phải hiện **tại ô chọn**, kèm
  invalidate cả hai danh sách liên quan; invalidate chéo entity đặt ở tầng `features`
  (`AssignStoreWarehouseDialog` invalidate cả `warehouseKeys.all` lẫn `storeKeys.all`), không phải
  trong hook của một entity — ranh giới FSD: `entities/store` không được import `entities/warehouse`.
- **Hiển thị**: `formatNumber` / `formatCurrency` (VND) / `formatDate` / `formatDateTime` (`shared/lib/format.ts`)
  theo ngôn ngữ đang chọn, rỗng → `—`. Ô bảng / trang chi tiết **thiếu giá trị** thì dùng `<EmptyValue />`
  (`shared/ui/EmptyValue.tsx`): chữ xám "Chưa có" / "Not set" — không `—`, không `N/A`; trường có câu riêng
  ("Chưa có quản lý", "Chưa gán kho") thì dùng câu đó. Component dùng chúng phải gọi `useTranslation()`.
- **Test**: `renderWithProviders(ui, { route, auth: 'admin' | 'customer' | CurrentUser | 'none', queryClient })`.
  `auth` được tầng app tiêm qua `src/app/test-setup.ts` (shared không import entities).
  Chọn giá trị trong một `Select`: dùng `chooseOption(user, '<tên ô>', '<nhãn mục>')` /
  `selectedLabel('<tên ô>')` (`shared/test/select.ts`) — `user.selectOptions` chỉ chạy với `<select>`
  gốc, Radix Select là nút mở + danh sách trong portal. Muốn đếm toast với
  handler global thật thì test ở tầng `app` với `queryClient` của `app/query-client.ts`. Component cần
  **data router** (`useMatches`, `useNavigation`, `lazy`, `handle` — vd `AppShell`) thì dùng
  `renderWithRouter(routes, { route, auth })` (cùng file), trả thêm `router`.
  - `mutationToastQueryClient()` (`shared/test/query-client.ts`): client mặc định của
    `renderWithProviders` **không có** `MutationCache`, nên khẳng định kiểu
    `expect(toast.error).not.toHaveBeenCalled()` (kiểm `meta.suppressErrorToast`) đúng sẵn dù hook có
    bug hay không — không bao giờ đỏ được. Test nào khẳng định điều đó phải truyền
    `queryClient: mutationToastQueryClient()` vào `renderWithProviders`. Đây là bản sao đúng chốt
    `MutationCache.onError` của `app/query-client.ts` (`shared` không import được `app`) — sửa một bên
    thì phải soát lại bên kia.

Bẫy khi thêm linh kiện shadcn (style `radix-nova`):
- `npx shadcn add` hỏi ghi đè file đã có và treo khi không có TTY → `yes n | npx shadcn@latest add <tên> --yes`.
- CLI để nguyên `import { cn } from "cn"` **và cài nhầm gói npm `cn`** → `npm uninstall cn`, sửa import về
  `@/shared/lib/cn`, chạy `prettier --write`.
- `radix-nova` không còn `form` — `shared/ui/form.tsx` chép từ `new-york-v4`.
- File export `xxxVariants` / hook cạnh component → thêm warning react-refresh; bỏ export hoặc tách file.
- jsdom thiếu `ResizeObserver` / `scrollIntoView` (cmdk) và **Pointer Capture API** (`hasPointerCapture`,
  Radix Select gọi trong `pointerdown` của nút mở) — stub trong `shared/test/setup.ts`; thêm polyfill
  khác chỉ khi có test đỏ vì nó. Thiếu stub pointer capture thì test chết dưới dạng *Unhandled Error*
  chứ không phải test đỏ bình thường, dễ nhìn nhầm là lỗi khác.
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

Hai trục gác độc lập, cả hai **bypass `SUPER_ADMIN`** (khớp `AuthorityGuard`/`HasRoleGuard` của
backend cho nó qua trước khi nhìn `scope`):

- `hasRole(user, ...roles)` gác theo **vai trò** (`ROLES` / `Role` trong `entities/session`, khớp
  `RoleEnum` của backend: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `SUPERVISOR`).
- `can(user, 'CODE')` gác theo **quyền** — `CODE` là một `Authority.code`, tra trong `user.scope`
  (mảng mã authority, `entities/session/model/permissions.ts`; nạp từ Redis mỗi request nên vừa
  bật/tắt quyền admin là có hiệu lực ngay). Từ `WMS-10-be(1)` (2026-09-25) backend gác **mọi**
  endpoint nghiệp vụ bằng `@RequireAuthority` — **64 mã** (thêm `ROLE_*` từ `WMS-10-be(5)`: `GET /roles` cần `ROLE_READ`), seed mặc định chép đúng `@HasRole` cũ.
  **Nhiều mã trong một decorator là AND**: route nối hai tài nguyên không có mã riêng (gán kho cho
  cửa hàng = `STORE_UPDATE` + `WAREHOUSE_UPDATE`; vật tư trong kho = `MATERIAL_*` + `WAREHOUSE_*`) →
  FE gác bằng `can(A) && can(B)`. Mã bốn loại phiếu seed sẵn nhưng module phiếu **chưa có endpoint**
  nên bật/tắt chúng chưa đổi được gì. Lịch sử + chỗ backend làm khác đề xuất:
  `docs/proposals/2026-09-24-authority-based-guards.md`. FE gọi `can()` ở `/permissions`,
  `/examples`, `/warehouses`, `/stores`, `/users`, `/suppliers` (bốn màn sau qua `pages/*/model/abilities.ts`). `USER_DELETE` có trong
  `AUTHORITY_CODES` (để `/permissions` không báo lệch) nhưng **không có nút nào dùng** — chỉ khoá, không xoá. Đếm bằng `grep
  AuthorityCode\.` trên migration chỉ ra 37 vì ba migration đầu (009/010/011) seed 9 mã còn lại bằng
  chuỗi literal, không qua hằng số — đếm đúng phải dựa trên số hằng khai trong
  `authority.constants.ts`, không phải cách migration tham chiếu tới chúng.
  `SUPPLIER_CREATE/READ/UPDATE/DELETE` (WMS-11) gác `/suppliers`: ghi giao dịch dùng `SUPPLIER_UPDATE`, gắn / gỡ vật tư
  thêm `MATERIAL_UPDATE` (AND), tab Vật tư thêm `MATERIAL_READ` — chi tiết ở "Nợ kỹ thuật" → Nhà cung cấp.

Chọn cái nào: **theo đúng thứ backend gác**. Endpoint gắn `@RequireAuthority(X)` → FE gác bằng
`can(user, 'X')`. Endpoint gắn `@HasRole(...)` → gác bằng `hasRole`.

Mã authority có **kiểu**: `AuthorityCode` / `AUTHORITY_CODES` (`shared/api/authority-codes.ts`),
bản sao của `app/warehouse-api/src/authority/authority.constants.ts`. `can()` và `handle.authority`
chỉ nhận mã trong danh sách — gõ sai là lỗi biên dịch (có test `@ts-expect-error` giữ điều này).
Bản sao thì có thể lệch: màn `/permissions` so với `GET /authorities` và `console.warn` khi dev
(`authorityCodeDrift`) — thấy cảnh báo thì sửa danh sách (đồng bộ lần cuối 2026-10-08, thêm 4 mã `SUPPLIER_*` của WMS-11).

`scope` nạp một lần vào store lúc mở phiên, không tự làm mới. Người dùng tự đổi quyền của **chính
role mình** (`features/permission-matrix`) thì phải gọi `refreshCurrentUser()`
(`entities/session/model/refresh-user.ts`) ngay sau khi API thành công — nếu không, `scope` trong
store cũ đi và `can()` nói dối cho tới lần đăng nhập sau.

Bảng quyền theo vai trò (BRD §5, bản đã chốt) ở **`docs/permissions.md`** — gác route và hiện/ẩn nút
theo đúng đó, đừng suy diễn lại từ BRD. Tóm tắt: cả ba role đều **tạo/sửa** được phiếu nhập, xuất,
kiểm kho, chi kho; chỉ `ADMIN`/`MANAGER` được **duyệt**; phiếu `Confirmed` bất biến với mọi role.

Gác màn hình: `handle.roles` (vai trò) và/hoặc `handle.authority` (quyền, `Authority.code`) của
route (xem "Thêm một màn hình nghiệp vụ mới") — khai **cả hai** thì phải qua cả hai (AND), khớp cách
backend tách `@HasRole` và `@RequireAuthority` thành hai guard độc lập. `RoleGate` đưa về
`/forbidden`, `buildNav` ẩn mục menu — cả hai đọc `handle` của match sâu nhất có khai; không bọc
từng route bằng component guard. Màn `/permissions` (`pages/permissions`) là ví dụ gác bằng quyền:
`handle.authority: ['MANAGE_PERMISSIONS', 'ROLE_READ']`, nav nhóm `admin`.

Màn `/permissions` **không** hiện tên quyền backend trả về (lẫn Anh–Việt: "Create user" cạnh "Tạo
phiếu nhập kho"): tên quyền dịch theo **mã** (`permissions:authorityNames.<CODE>`), tên nhóm dịch theo
tên nhóm backend (`GROUP_KEYS` trong `features/permission-matrix/model/labels.ts` →
`permissions:groupNames.*`); dòng mã bên dưới giữ nguyên. Mã/nhóm FE chưa biết → hiện tên backend.
**Thêm mã vào `AUTHORITY_CODES` thì thêm tên vào cả `vi` lẫn `en`** — `labels.test.ts` đỏ nếu thiếu.
Cột vai trò xếp theo cấp bậc `ROLE_RANK` (SUPER_ADMIN → ADMIN → MANAGER → SUPERVISOR), không theo thứ tự
API (`sortRolesByRank`).

Trong màn `/permissions`, **mọi** lần gạt switch đều đi qua `ConfirmDialog` — cả cấp lẫn gỡ, cho mọi
vai trò, không chỉ ca tự thu hồi. Bảng dày switch cạnh nhau, không có undo, và thay đổi có hiệu lực
ngay với mọi người dùng đang đăng nhập, nên một cú bấm nhầm không được phép là một cú bấm. Hộp có ba
nhánh chữ (cấp / gỡ / tự thu hồi `MANAGE_PERMISSIONS` của chính role mình) — sửa một nhánh thì soát
cả ba, có test riêng cho từng nhánh. Toast **thành công** nằm trong `useTogglePermission`, toast lỗi
vẫn để chốt `MutationCache.onError` lo như mọi nơi khác.

**Tên vai trò hiển thị** luôn qua `useRoleLabel()` (`entities/session`, khoá `common:roles.<ROLE>`):
`MANAGER` → "Quản lý" / "Manager". Không in thẳng `roleName` ra UI (góc avatar, trang Tài khoản, cột và hộp
xác nhận ở `/permissions`). Vai trò lạ → hiện nguyên mã. Họ tên người: `formatFullName` / `initialsOf` / `formatPersonLabel`
(`shared/lib/person-name.ts`), họ trước tên. Người đăng nhập chưa có tên → hiện "Người dùng" (`common:unnamedUser`) kèm
icon, **không** lấy số điện thoại làm tên (số điện thoại ở dòng phụ).

**MANAGER và SUPERVISOR chỉ thấy phần của mình — backend lọc** (`WMS-10-be(7)`, mở rộng cho SUPERVISOR ở PR #72):
`GET /warehouses` trả kho mình quản lý **hoặc là thành viên** (`warehouse_member_tbl`), `GET /stores` trả cửa hàng
gắn với các kho đó; `managerSlug`/`hasManager` bị bỏ qua. FE vì vậy **không** có công tắc "kho của tôi", không gọi
`/warehouses/mine`, ẩn hai bộ lọc theo quản lý và dùng câu báo trống riêng (`warehouses:mineEmpty`,
`stores:mineEmpty`). Backend so tên vai trò (`WAREHOUSE_SCOPED_ROLES`) **không** miễn SUPER_ADMIN → FE dùng
`isWarehouseScoped(user.roleName)` (`entities/session`), không dùng `hasRole` của FE. Chi tiết `GET /…/:slug`
backend **chưa** lọc (mở link kho khác vẫn xem được).

## Đa ngôn ngữ

Tiếng Việt mặc định, tiếng Anh thứ hai. Khoá được kiểm tra kiểu lúc biên dịch.

Namespace `nav`: nhãn menu, tên nhóm (`groups.*`), breadcrumb, tiêu đề tab và trang Tổng quan.

Mỗi màn nghiệp vụ có namespace riêng trùng tên số nhiều của entity (`warehouses`, `stores`) chứa tiêu
đề, tên cột, nhãn ô form, chuỗi dialog và toast của màn đó — thêm màn mới là thêm một cặp file
`locales/{vi,en}/<tên>.json` rồi khai trong `shared/i18n/index.ts` (cả `resources` lẫn `ns`).

Hai namespace dễ nhầm:
- `errors` (số nhiều) — bản dịch mã lỗi backend, tra qua `shared/api/error-codes.ts`
- `errorPages` — chuỗi của ba trang lỗi

Thêm mã lỗi mới ở backend thì phải thêm vào `error-codes.ts`, nếu không người dùng thấy câu tiếng
Anh nguyên bản của backend (kèm `console.warn`).

## Giao diện sáng/tối

`next-themes`, class trên `<html>`. Dùng token (`bg-background`, `text-muted-foreground`), **không
dùng màu cứng** (`bg-slate-50`) — nếu không dark mode chỉ đúng một nửa.

## Màn đăng nhập

Ảnh nền ở `pages/login/assets/` (hai bản 1280px / 1920px, JPEG ~55%, nạp qua `srcSet`, `alt=""`,
`fetchPriority="high"`). Đổi ảnh thì nén lại cỡ đó (`sips -s formatOptions 55 --resampleWidth …`) —
ảnh gốc từ máy ảnh vài MB là thứ lớn nhất trang tải đầu tiên. Lớp phủ tối trên ảnh dùng `black/…` cố
định ở cả hai chế độ sáng/tối (chữ trắng trên ảnh phải đọc được) — ngoại lệ có chủ đích của luật "dùng
token". Thẻ đăng nhập là **kính mờ** (glassmorphism): màu `white/…` cố định, gom trong các hằng
`GLASS_*` đầu `LoginPage.tsx` — nền thật của thẻ là ảnh đã làm mờ, không phải `--background`, nên nó
**không** đổi theo sáng/tối. Không có `backdrop-filter` thì rơi về nền `slate-900/70` để chữ trắng vẫn đọc
được. **Bẫy autofill:** Chrome tô ô tự điền bằng nền `#e8f0fe` mà `background` không gỡ được — trên kính
nó thành một mảng xanh nhạt. Mẹo cũ "kéo dài `transition` của `background-color`" **đã hết tác dụng** ở Chrome
mới (thử thật: ra chữ trắng trên nền xanh nhạt). Cách đang dùng ở `GLASS_INPUT`: `background-clip: text`
(thu nền autofill vào trong nét chữ) + `-webkit-text-fill-color` phủ chữ lên — Chrome không cho đổi màu
nền nhưng cho đổi phạm vi vẽ nền. Đã kiểm bằng một ô giả lập nền `!important` trong Chrome headless.

**Chụp màn hình để kiểm tra giao diện** (jsdom không dựng CSS): `npm run build && npx vite preview`,
rồi Chrome headless `--screenshot --window-size=W,H`. **Bẫy:** Chrome kẹp chiều rộng cửa sổ tối thiểu
~500px — `--window-size=390,…` vẫn dựng layout ở 500px rồi cắt ảnh, trông như bị tràn ngang dù layout
đúng. Chụp cỡ điện thoại thì nhúng trang vào `<iframe width="390">` trong một file HTML tạm.

## Cỡ chữ

Thang cỡ chữ khai trong khối `@theme` ở `app/styles/index.css` (`--text-xs` … `--text-2xl` kèm
`--text-*--line-height`), nâng ~14% so với mặc định Tailwind. **Muốn chữ to/nhỏ hơn thì sửa thang ở
đó, đừng đi đổi `text-sm` thành `text-base` ở từng component** — mọi utility `text-*` đọc từ các
biến này nên một chỗ sửa là cả app theo.

Cỡ hardcode dạng `text-[0.9rem]` (`shared/ui/button.tsx` size `sm`, `shared/ui/calendar.tsx`)
**không** theo thang — đổi thang thì phải chỉnh tay mấy chỗ đó cho cân.

Chiều cao cố định đi kèm cỡ chữ: `Button` `h-8`, `Badge` `h-6`, `Input` `h-9`. Nâng cỡ chữ mà quên
nâng chiều cao thì `Badge` (có `overflow-hidden`) cắt mất chữ.

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

- **Màn Người dùng (`/users`, WMS-12): FE chặn tạm thay backend ở vài chỗ — đừng gỡ trước khi backend làm.**
  Đã dùng API thật (PR #72, #78; 2026-10-07): tạo, sửa hồ sơ (`PATCH`), đổi vai trò (`.../change-role`), khoá /
  mở khoá (`PUT .../lock`, `PUT .../unlock`), đặt lại mật khẩu hộ; sửa / đổi vai trò / khoá / mở khoá cùng mã
  `USER_UPDATE`. **`DELETE /users/{slug}` giờ là XOÁ thật (`USER_DELETE`) — FE không gọi, không có nút xoá**
  (nghiệp vụ đã chốt **chỉ khoá**; đề nghị backend gỡ endpoint — proposal mục 3.7). Cờ `userSearch`, `userSort`
  đã bật (nhập toàn chữ số → `phonenumber`, còn lại → `name`: `pages/users/model/search-query.ts`). Thành viên kho ở
  `widgets/warehouse-members` (trang chi tiết kho; xem cần `USER_READ`, thêm/gỡ cần `WAREHOUSE_UPDATE` + `USER_READ`). Khối này cố ý KHÔNG áp lớp lọc tạm `ability.visible` của `/users` (thành viên kho đều dưới ADMIN; người xem cần `USER_READ`) và đi theo cờ `userSearch` — cờ tắt thì đóng cả khối (backend cũ bỏ qua `warehouseSlug`).
  Còn chờ backend
  (`docs/proposals/2026-09-30-user-management-api.md`):
  - **Lớp chặn tạm ở FE** (giao diện thôi, gọi thẳng API vẫn vượt được):
    - `ability.visible` (`pages/users/model/abilities.ts`): người dưới ADMIN chỉ thấy chính mình + người cấp thấp
      hơn, lọc ở client — phân trang theo backend nên một trang có thể ít dòng hơn (có dòng ghi chú
      `users:rowsHidden`). Gỡ khi backend lọc `GET /users` theo phạm vi kho.
    - Mật khẩu ≥ 8 ký tự (`shared/lib/password-policy.ts`) ở `user-form`, `user-reset-password`, `change-password`.
      Backend chốt chính sách thì giữ luật cho khớp và map mã lỗi của backend vào ô.
    - Nút "Đặt lại mật khẩu" ẩn trên người ngang/cao hơn: backend (PR #80) mới chặn người cấp CAO hơn, vẫn cho
      đặt lại người CÙNG cấp và chưa kiểm phạm vi kho — đừng "sửa" abilities cho khớp backend.
  - `PATCH` chưa nhận `null` → form sửa **không xoá trống** được email/ngày sinh/địa chỉ: ô trống bị bỏ qua (giữ
    nguyên, có gợi ý `users:keepWhenEmpty`), chỉ gửi trường đã đổi (`toUpdateInput`).
  - Luật cấp dùng `role.level` của cả hai bên: người bị tác động (`UserResponseDto`) và chính mình (`GET /auth/me`
    trả `role.level` từ PR #80). Phiên cũ chưa có `me.role` mới lùi về `BUILT_IN_ROLE_LEVELS`
    (`entities/user/model/role-level.ts`) — phải khớp `level` backend seed.
  - "Chính mình" so bằng `userSlug` của `/auth/me` (PR #80, bỏ `userId`) qua `isSameUser` (`entities/user`);
    phiên cũ chưa có `userSlug` lùi về so định danh đăng nhập.
  - `warehouses` trong `UserResponseDto` chỉ là kho làm **thành viên**, không gồm kho người đó quản lý. Bộ lọc kho
    chỉ hiện khi có `WAREHOUSE_READ`; MANAGER chỉ có `USER_READ` xem được thành viên của mọi kho (backend chưa lọc phạm vi).
- **Nhà cung cấp (`/suppliers`, WMS-14): đã dùng API thật của WMS-11; còn chờ backend**
  (`docs/proposals/2026-10-08-supplier-api.md`). Test tay: `docs/test-checklists/WMS-14-fe-supplier-checklist.md`.

  | Thiếu / chặn tạm | Hệ quả ở FE |
  |---|---|
  | Tìm `search`/`code`/`taxCode`/`phonenumber` (WMS-13, `dev` qua PR #89) **đã bật** `supplierSearch`; `sort` backend đang làm | `search` chỉ khớp tên / người liên hệ / email (KHÔNG khớp mã), `code` khớp đủ mã. Sắp xếp cột dựng sẵn sau `supplierSort` (**tắt**) — bật chỉ khi đã thử với API thật. Một ô tìm, đoán tham số theo dạng nhập (`pages/suppliers/model/search-query.ts`); 10 chữ số (MST hay SĐT) đoán sai thì câu báo trống có nút đổi (`?searchBy=`). Test với cờ bật: `SuppliersPage.sort-search.test.tsx` |
  | Lọc `GET /suppliers/{slug}/materials` (`code` / `name` / `from` / `to`, WMS-13) | tab Vật tư có ô tìm (mã khớp đúng / tên chứa chuỗi) + khoảng "Ngày tạo vật tư", cờ `supplierMaterialFilters` **đã bật**. Bộ lọc giữ ở state của tab, không lên URL (tab Giao dịch đã dùng `page` / `startDate` / `endDate`). `from`/`to` theo ngày tạo VẬT TƯ, không phải ngày gắn |
  | WMS-13 **tạm ẩn** `GET`/`POST /suppliers/{slug}/transactions` | tab Giao dịch sau cờ `supplierTransactions` (**tắt**): trang chỉ còn Hồ sơ + Vật tư, `?tab=transactions` rơi về Vật tư. Code tab / form ghi giao dịch giữ nguyên |
  | `GET /materials` không trả nhà cung cấp | ô "Gắn vật tư" lấy **100 vật tư đầu**, chỉ loại vật tư đã gắn với chính NCC này; vật tư thuộc NCC khác chỉ biết qua 101212 hiện tại ô |
  | `PATCH` dùng `pickDefined`, không nhận `null` | form sửa **không xoá trống** được ô tuỳ chọn: ô trống bị bỏ khỏi body (giữ nguyên, gợi ý `suppliers:keepWhenEmpty`) |
  | Chưa có API công nợ | trang chi tiết không có tổng mua / trả / còn nợ — đừng tự cộng từ danh sách giao dịch (phân trang, có lọc) |
  | Sổ giao dịch chỉ thêm | không có nút sửa / xoá giao dịch; luôn hỏi xác nhận trước khi ghi |

  Quyền theo **authority**, không có nhánh lùi theo vai trò: xem = `SUPPLIER_READ`; thêm / sửa / xoá = `SUPPLIER_CREATE`
  / `_UPDATE` / `_DELETE`; ghi giao dịch = `SUPPLIER_UPDATE` (khi cờ `supplierTransactions` bật); gắn / gỡ vật tư = `SUPPLIER_UPDATE` + `MATERIAL_UPDATE`; tab
  Vật tư cần thêm `MATERIAL_READ`. Trên sandbox (2026-10-08) chỉ ADMIN có quyền ghi; MANAGER / SUPERVISOR chỉ xem.
- **Màn Tài khoản (`/account`) mới có phần đọc.** Sửa hồ sơ (`PATCH /auth/me`) và danh sách thiết
  bị (`GET`/`DELETE /auth/sessions`) đã dựng sẵn sau `BACKEND_SUPPORTS.profileEdit` / `.sessionList`
  nhưng backend **chưa có endpoint nào**. Từ 2026-09-30 `GET /auth/me` đã trả hồ sơ (`phonenumber`,
  `firstName`, `lastName`, `email`, `dob`, `address`) — góc avatar và trang Tài khoản hiện họ tên (lùi về
  `userName` khi tên rỗng); form sửa hồ sơ sau cờ vẫn dùng `fullName` cũ, phải đổi khi backend có `PATCH`. Xem
  `docs/proposals/2026-09-23-account-profile-and-sessions.md`. Phần sau cờ có test riêng chạy với
  cờ BẬT (`pages/account/ui/AccountPage.flags.test.tsx`).
- **Env nhét vào bundle lúc build.** Mỗi môi trường cần một image riêng; không promote image từ
  staging lên production được. Chuyển sang runtime config (`window.__ENV__`) khi nào cần điều đó.
- **Chưa tìm theo tên/mã, chưa lọc cửa hàng theo kho.** Backend `GET /warehouses` và `GET /stores` chưa
  nhận `name` / `code` / `warehouseSlug` → hai màn chưa có `SearchInput`. Thêm khi backend làm.
- **Danh sách "kho còn trống" do FE tự tính.** Hộp gán kho cho cửa hàng loại kho đã gán dựa trên **trang
  dữ liệu cửa hàng đang hiển thị** — cửa hàng ở trang khác không thấy được. Backend vẫn là chốt chặn
  (101019/101020) và lỗi hiện ngay tại ô chọn; bỏ được khi backend có `GET /warehouses?hasStore=false`.
- **Lý do "Xoá bị khoá" dùng thuộc tính `title` gốc của HTML** thay vì component tooltip có style riêng
  (`DropdownMenuItem` của `WarehousesPage`/`StoresPage`) — chấp nhận được vì đây là menu item disabled,
  nhưng không đồng bộ hình thức với phần còn lại của UI.
- **`Switch` chưa nối `field.name` / `field.onBlur`** khi dùng trong `react-hook-form`
  (`WarehouseFormSheet`, `StoreFormSheet` chỉ truyền `checked`/`onCheckedChange`/`ref`) — chưa gây lỗi
  thấy được vì `isActive` luôn có giá trị mặc định, nhưng thiếu validate-on-blur và tên field khi debug.
- **`phonenumber` / `email` gửi `undefined` khi trống nên không xoá được giá trị cũ qua form** (khác với
  `description`/`address`/`invoiceAddress`, gửi `''` xoá được bình thường) — hệ quả trực tiếp của bẫy
  "Ô tuỳ chọn và chuỗi rỗng" ở trên; cần API riêng hoặc backend nới `@IsOptional()` mới xoá được.
- **Sắp xếp theo cột và tìm kiếm: FE ĐÃ DỰNG SẴN, backend chưa làm.** Cả hai nằm sau cờ trong
  `shared/api/backend-capabilities.ts` (`BACKEND_SUPPORTS.sort` / `.search`), mặc định `false`.
  - Sort: `useListParams` giữ trạng thái trên URL (`?sort=name:DESC`), `sortToParam` đổi sang dạng
    `['name:DESC']` mà `BaseQueryDto` khai (`@IsArray()` → phải là mảng, `sort[]=…` trên query
    string). `DataTable` nhận prop `sorting`; cột nào sắp được thì khai
    `meta: { sortField: '<trường>' }` trong `ColumnDef`. Bấm lần lượt tăng → giảm → thôi sắp.
    **Không dùng `getSortedRowModel`** của TanStack: nó chỉ sắp trong trang hiện tại (10–50 dòng)
    nên người dùng tưởng cả danh sách đã sắp — sai âm thầm, tệ hơn là không có.
  - Search: `SearchInput` đã gắn sẵn vào `ListToolbar` của hai màn, khoá bộ lọc là `search`.
    **Tên tham số chưa chốt với backend** — nếu backend đặt `q`/`keyword`/`name` thì đổi khoá đó ở
    `WarehouseFilters`/`StoreFilters` và trong `FILTERS` của hai màn.
  - **Bật cờ chỉ khi đã thử với API thật.** Bật nhầm thì UI hiện mũi tên / ô tìm mà dữ liệu không
    đổi. Phần sau cờ có test riêng chạy với cờ BẬT
    (`pages/warehouses/ui/WarehousesPage.sort-search.test.tsx`) — sửa phần này thì chạy cả file đó.
- **Root `tsconfig.json` dùng `baseUrl`**, field mà TypeScript 6 deprecate. Xem lại khi nâng cấp TS,
  và kiểm lại `npx shadcn add` vẫn ghi đúng vào `src/shared/ui/` sau khi sửa.
- **Refresh token nằm ở `localStorage`.** XSS đọc được và giữ phiên **vô thời hạn**: mỗi lần
  `/auth/refresh` ký refresh token mới với hạn 30 ngày mới, nên chỉ logout / logout-all / đổi mật khẩu
  mới chặn được. Chờ backend chuyển sang cookie httpOnly — xem `docs/proposals/2026-09-17-refresh-token-httponly-cookie.md`.
- **Nợ có điều kiện kích hoạt — `ConfirmDialog` chung.** Bốn hộp xác nhận
  (`DeleteWarehouseDialog`/`DeleteStoreDialog`, `DeactivateWarehouseDialog`/`DeactivateStoreDialog`) là bản sao
  cấu trúc của nhau, chỉ khác kiểu entity, tên prop và khoá i18n. Cố ý giữ vậy lúc này: bản generic cần
  ~6 props chuỗi + `getSlug`/`getName` để bù phần khác nhau, đắt hơn là chép. **Điều kiện kích hoạt: entity
  thứ ba cần cùng cặp hộp này thì rút `ConfirmDialog` ra `shared/ui` TRƯỚC khi chép lần thứ ba** — lúc đó là
  6 bản, và một sửa đổi hành vi chung (ví dụ nhánh còn thiếu: `AlertDialog` chưa chặn Esc lúc đang gửi, khác
  với `FormSheet` và hai hộp gán) sẽ phải làm ở 6 chỗ, thiếu một chỗ thì không gì bắt được.
- **`useWarehouses` có option `enabled`, `useStores` thì không** (chưa nơi nào cần tải danh sách cửa hàng có
  điều kiện). Ai chép `entities/store` làm mẫu mà cần nạp có điều kiện thì tự thêm, theo đúng dạng của
  `useWarehouses`.
- **`toRejection` (`src/shared/api/http.ts`) trả `error.response?.data ?? error`, mà axios để nguyên
  chuỗi rỗng khi 5xx không có body** — `??` chỉ thay khi `data` là `null`/`undefined`, `''` lọt qua
  nguyên vẹn. Hệ quả đang chạm người dùng: `isApiError('')` là `false` nên `resolveApiErrorMessage`
  trả `errors:network` ("Không kết nối được máy chủ") cho một lỗi 500 **có** phản hồi từ server —
  sai loại lỗi, ở toast global, `DataTable`, hai hộp gán (`AssignWarehouseManagerDialog`,
  `AssignStoreWarehouseDialog`) và màn phân quyền. Phụ: `isVersionConflict('')` cũng `false` (409
  không body sẽ không đóng được sheet/hộp theo đúng quy ước "409 thì đóng hộp"), và `retry` coi `''`
  là lỗi tạm thời nên thử lại tới 3 lần thay vì dừng ngay. Sửa tối thiểu khi làm:
  `const d = error.response?.data; return d === undefined || d === '' ? error : d`. **Đợt này chưa
  sửa** — chạm tầng `shared`, ảnh hưởng nhiều test.
- **Luật ủy quyền R1–R4 ở màn `/permissions`: FE ĐÃ DỰNG SẴN sau cờ `permissionDelegationRules`
  (mặc định `false`), chờ backend.** Đặc tả: `docs/proposals/2026-09-25-permission-delegation-rules.md`.
  Luật từng ô là hàm thuần `cellLock` / `isRankLocked` (`features/permission-matrix/model/cell-rules.ts`),
  thứ tự R3 → R1 → R2 → R4 như backend; SUPER_ADMIN miễn R1–R3, R4 ("vai trò cuối cùng") áp cho mọi
  người và áp cả khi cờ tắt. Cột vai trò ngang/cao hơn mình vẽ ✓/— (chỉ xem) thay cho switch. Hằng số
  phải khớp backend: `ROLE_RANK` (`entities/session/model/roles.ts`), `PROTECTED_AUTHORITY_CODES`
  (`shared/api/authority-codes.ts`). **Còn thiếu**: bốn mã lỗi mới (`AUTHORITY_PROTECTED`,
  `ROLE_RANK_NOT_ALLOWED`, `AUTHORITY_NOT_HELD`, `LAST_PERMISSION_ADMIN`) chưa có trong
  `error-codes.ts` vì backend chưa chọn số — tới lúc đó lỗi từ chối hiện câu chung. Bật cờ xong thì
  hộp cảnh báo "tự thu hồi" trong `PermissionMatrix.tsx` không còn ai chạm tới được (R1 khoá cột của
  chính mình) — gỡ nó khi gỡ cờ. Test với cờ bật: `PermissionMatrix.delegation.test.tsx`.
- **Cờ chuyển tiếp role → authority còn chưa gỡ.** `authorityGuards` (kho + người dùng) và
  `storeAuthorityGuards` (cửa hàng) trong `shared/api/backend-capabilities.ts` **đã bật** từ
  2026-09-25 (backend `WMS-10-be(1)`). Còn giữ để tắt được nếu một môi trường chưa lên bản backend
  mới. Khi mọi môi trường đã chạy ổn: gỡ hai cờ, gỡ nhánh `hasRole` trong
  `pages/{warehouses,stores}/model/abilities.ts`, gỡ `capabilities` khỏi `createRoutes`, và bỏ các
  test chạy với cờ tắt (`abilities.test.ts` phần "cờ TẮT", `describe` "cờ TẮT" cuối
  `app/routes/routes.test.tsx`). Nhắc: từ lúc backend deploy, mọi ô đã bật/tắt ở `/permissions` có
  hiệu lực thật (sandbox 2026-09-24: MANAGER đang có `WAREHOUSE_CREATE` → tạo được kho).
- **Ma trận quyền seed ở backend dịch từ BRD §5.5 bản CŨ, lệch với bản chốt 2026-09-23** (Manager tạo/sửa
  được cả bốn loại phiếu). Cần vào màn `/permissions` bật **7 ô** cho `MANAGER`:
  `IMPORT_FORM_CREATE`, `EXPORT_FORM_CREATE`, `BALANCE_FORM_CREATE`, `BALANCE_FORM_RECORD_COUNT`,
  `IMPORT_FORM_UPDATE_DRAFT`, `EXPORT_FORM_UPDATE_DRAFT`, `WAREHOUSE_PAYMENT_UPDATE_DRAFT`. Không cần
  migration — đúng thiết kế backend (bật qua UI là seed dữ liệu, không phải đổi code). **Hiện chưa
  có tác dụng**: module phiếu chưa có endpoint nào — bật trước chỉ là chuẩn bị dữ liệu cho lúc backend
  làm module đó và gác bằng `@RequireAuthority`.
