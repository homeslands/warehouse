# Thiết kế: Nền tảng warehouse-ui

Ngày: 2026-07-09
Trạng thái: đã duyệt, chờ lập kế hoạch triển khai

## Bối cảnh

`app/warehouse-ui/` hiện rỗng hoàn toàn. Backend `app/warehouse-api/` (NestJS 10 + TypeORM/MySQL) đã có auth, user, role, file (S3), notification (Firebase FCM), và một module mẫu `example`.

Backend **chưa có module nghiệp vụ kho nào** — không có product, stock, inventory, phiếu nhập/xuất. `setup.md` của api tự xác nhận điều này.

## Mục tiêu

Dựng nền tảng UI: scaffold, auth flow, RBAC, tầng API, layout shell, cộng **một màn hình mẫu** chứng minh nền tảng chạy end-to-end.

## Ngoài phạm vi

- Mọi màn hình nghiệp vụ kho (chưa có API).
- Web push / Firebase FCM (backend có `notification` module, nhưng UI chưa có chỗ hiển thị có nghĩa).
- Upload file / S3 (chưa có màn hình nào cần).
- npm workspace / monorepo tooling (chưa có code dùng chung để chia sẻ).
- Mọi thay đổi trong `warehouse-api`.

## Sự thật đã xác minh về backend

Mọi quyết định dưới đây dựa trên các sự thật này, đã đọc trực tiếp từ source:

| Sự thật | Nguồn |
|---|---|
| Global prefix `api/v1`, port `8085` | `src/main.ts` |
| `ALLOWED_ORIGINS=http://localhost:5175` | `.env.example` |
| Login bằng `phonenumber + password` | `src/auth/auth.dto.ts` |
| Chỉ có 3 route auth: `me`, `login`, `register` | `src/auth/auth.controller.ts` |
| **Không có endpoint refresh** dù `login` phát ra `refreshToken` | `src/auth/auth.service.ts` |
| **Không có user controller, không có role controller** | `src/user/` chỉ có entity + decorator |
| Authority tới UI qua `scope: string` (`JSON.stringify(string[])`) | `src/auth/auth.utils.ts` |
| Backend **chỉ enforce bằng role**, không có `@HasAuthority` | `src/role/role.guard.ts` |
| Success envelope `{ message, statusCode, timestamp, result }` | `src/app/app.dto.ts` |
| Error shape **khác hẳn**: `{ statusCode, code?, timestamp, path, method, message }` | `src/app/http-exception.filter.ts` |
| `AppResponseDto` / `AppPaginatedResponseDto` **không có `@ApiProperty`** → swagger sinh schema rỗng | `src/app/app.dto.ts` |
| Phân trang trả `hasPrevios` (typo) | `src/app/app.dto.ts` |
| Request dùng `size`, response trả `pageSize` | `src/app/base.dto.ts` vs `app.dto.ts` |
| `sort` được khai báo nhưng `example.service.findAll` **bỏ qua nó** | `src/example/example.service.ts` |
| `examples`: GET public, write gác `@HasRoles(Admin, SuperAdmin)` | `src/example/example.controller.ts` |
| Tài nguyên định danh bằng `slug`, không phải `id` | `src/app/base.dto.ts` |
| Root user tự seed: `root` / `root`, role `SUPER_ADMIN` — nhưng **bỏ qua nếu role chưa có trong DB** | `src/auth/root-user.seeder.ts` |
| Chỉ 3 role được seed: `CUSTOMER`, `ADMIN`, `SUPER_ADMIN` | `src/migrations/1783728000004-seed-roles.ts` |
| **Không authority/permission nào được seed** → `scope` luôn là `"[]"` với mọi user | cùng migration trên |

## Stack

| Hạng mục | Chốt | Lý do |
|---|---|---|
| Build | Vite + React 18 + TypeScript strict | App nội bộ sau login, không cần SSR/SEO |
| Port dev | 5175, `strictPort: true` | Khớp `ALLOWED_ORIGINS`; strictPort để lỗi port không hoá trang thành lỗi CORS |
| Styling | Tailwind + shadcn/ui | Component nằm trong repo, sửa được, không khoá vào theme |
| Bảng | TanStack Table | Data grid cho app quản trị |
| Server state | TanStack Query | |
| Client state | Zustand | Chỉ giữ token + user; không cần Redux |
| Form | React Hook Form + Zod | |
| Router | React Router v6 (`createBrowserRouter`) | |
| HTTP | Axios + interceptor | |
| Types | `openapi-typescript` từ `/swagger.json` | |
| Lint | ESLint 9 flat config + `typescript-eslint` v8 | Default của Vite react-ts hiện nay |
| Format | Prettier chạy riêng + `eslint-config-prettier` | Lint lo tính đúng, Prettier lo hình thức |
| Node | 24 | Khớp `.nvmrc` của api |

### Các phương án đã cân nhắc và loại

- **Next.js**: thêm tầng server vô ích cho app nội bộ sau login; JWT bearer + RBAC client-side vướng khi trộn RSC.
- **Nhóm thư mục theo loại file** (`components/`, `pages/`, `services/`): tới ~10 module nghiệp vụ thì `services/` thành sọt rác.
- **Feature-Sliced Design đầy đủ**: đúng bài dài hạn, nhưng trả trước chi phí nghi thức khi chưa có API nghiệp vụ nào để đổ vào. Cấu trúc theo feature nâng cấp lên FSD được sau.
- **Codegen cả hook (orval/rtk-query)**: code sinh ra khó tuỳ biến quanh envelope và interceptor.
- **ESLint 8 + `.eslintrc.js`** (giống backend): bắt đầu dự án mới bằng cấu hình legacy.

## Tầng API

### Vai trò của codegen

`openapi-typescript` chỉ sinh **DTO tài nguyên** (`ExampleResponseDto`, `LoginAuthResponseDto`, `CurrentUserDto`, `RoleEnum`...). Nó **không** sinh được envelope: `AppResponseDto` và `AppPaginatedResponseDto` là class trần không decorator, nên `getSchemaPath()` cho ra object rỗng, và `ApiPaginatedResponse` dựng `allOf: [{}, { items }]` → type mất sạch `total`, `page`, `pageSize`, `totalPages`, `hasNext`.

Vì vậy envelope khai báo tay, một lần, trong `shared/api/types.ts`:

```ts
type ApiResponse<T> = { message: string; statusCode: number; timestamp: string; result: T }
type ApiError = { statusCode: number; code?: number; timestamp: string
                  path: string; method: string; message: string }
type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number
                      totalPages: number; hasNext: boolean; hasPrevious: boolean }
```

### `shared/api/http.ts`

Trách nhiệm, và không gì khác:

1. Axios instance với `baseURL` từ env, gắn `Authorization: Bearer <token>`.
2. Unwrap `result` khỏi envelope thành công.
3. Chuẩn hoá phân trang: đọc `hasPrevios` → expose `hasPrevious`; đọc `pageSize` nhưng gửi đi bằng `size`. **Hai điểm lệch của backend bị cô lập tại đúng file này**; phần còn lại của codebase không bao giờ thấy chúng.
4. Bắt 401 → xoá auth store → điều hướng `/login`. Không thử refresh.
5. Parse `ApiError`, đọc `message` để hiện toast, giữ `code` để phân nhánh.

### Codegen là script chạy tay

```json
"gen:api": "openapi-typescript http://localhost:8085/swagger.json -o src/shared/api/generated.ts"
```

File sinh ra **commit vào git**. Không hook vào `build` — CI không có backend, build sẽ chết.

### TanStack Query

- Query key: `['examples', 'list', { page, size }]`, `['examples', 'detail', slug]`.
- Sau mutation: `invalidateQueries({ queryKey: ['examples'] })`.
- `retry: false` cho 4xx — thử lại một request 403 ba lần là vô nghĩa.

## Auth

**Login**: `POST /api/v1/auth/login` với `{ phonenumber, password }`. Zod schema validate **số điện thoại**, không phải email.

**Không lưu `refreshToken`.** Backend phát ra nó nhưng không route nào tiêu thụ. Cất một credential dài hạn vĩnh viễn không dùng được là rủi ro không đổi lấy gì. Đọc response rồi vứt.

**Cất `accessToken` trong `localStorage`.** Backend trả token trong body JSON, không phải `Set-Cookie` httpOnly, nên lựa chọn thực tế chỉ còn `localStorage` (XSS đọc được, nhưng sống qua reload) hoặc memory (F5 mất phiên). Đây là app quản trị nội bộ; bắt đăng nhập lại mỗi lần F5 là không dùng được. **Đánh đổi có ý thức**: phòng thủ thật sự là httpOnly cookie, và nó cần backend đổi.

**Hydrate lúc boot**: có token → gọi `GET /auth/me`. Thành công thì đổ user vào store; thất bại thì xoá token, về `/login`. Đây cũng là cách phát hiện token hết hạn mà không cần tự decode `exp` ở client.

**Token hết hạn sau `DURATION=3600s`** và không có cách gia hạn. UI chỉ bắt 401 → logout. Ghi nhận là nợ backend.

## RBAC

Backend enforce bằng **role**; tầng authority đã có đủ 4 bảng (`Role → Permission → Authority → AuthorityGroup`) nhưng **chưa có guard nào đọc nó**. UI dựng cả hai lớp:

```ts
const authorities: string[] = safeParse(user.scope) ?? []

hasRole('ADMIN', 'SUPER_ADMIN')   // dùng NGAY — khớp @HasRoles của backend
can('CREATE_EXAMPLE')             // dựng sẵn — chờ backend có @HasAuthority
```

`safeParse` bọc `try/catch`: `scope` là chuỗi do backend `JSON.stringify` thủ công; nếu rỗng hoặc hỏng thì suy biến về "không có quyền nào", không được ném lỗi làm trắng màn hình.

**`can()` hiện luôn trả `false` cho mọi người dùng.** Migration seed đúng 3 role và **không seed authority/permission nào**, nên `role.permissions` rỗng và `buildScope` trả về chuỗi `"[]"`. Hệ quả bắt buộc: `can()` được dựng và test, nhưng **không được dùng làm cổng gác duy nhất cho bất kỳ thành phần UI nào** trong đợt này — nếu dùng, thành phần đó sẽ vô hình với tất cả mọi người, và triệu chứng (nút biến mất) trỏ sai hoàn toàn về nguyên nhân (bảng `permission_tbl` rỗng). Mọi cổng gác thật đi qua `hasRole()`.

Router: `<ProtectedRoute>` (chỉ hỏi đã đăng nhập chưa) bọc ngoài, `<RequireRole roles={[...]}>` cho từng nhánh. Menu và nút gọi `hasRole` / `can` để ẩn hiện.

**Ẩn nút không phải là bảo mật.** Backend là nơi chặn thật; UI chỉ tránh cho người dùng bấm vào thứ chắc chắn nhận 403.

`RoleEnum` có 8 giá trị, trong đó `CHEF`, `CASHIER`, `TELESALE` là di sản copy từ một dự án nhà hàng, không dính gì tới kho. Chỉ generate enum từ swagger, không dựng UI cho chúng.

## Màn hình mẫu: `examples`

Chọn vì nó là tài nguyên duy nhất có CRUD phân trang đầy đủ, và cấu hình quyền của nó demo được cả hai nhánh:

- `GET /examples`, `GET /examples/:slug` là `@Public()` → bảng load được cả khi chưa login.
- `POST` / `PATCH` / `DELETE` gác `@HasRoles(Admin, SuperAdmin)` → chứng minh `hasRole` ẩn nút đúng, và interceptor bắt 403 đúng.

Tài nguyên định danh bằng **`slug`**. `id` chỉ dùng làm React key.

Gồm: bảng TanStack Table phân trang server-side, dialog tạo, dialog sửa, xác nhận xoá, invalidate sau mutation.

### Cố tình KHÔNG có

- **Không cột sắp xếp.** `BaseQueryDto` khai báo `sort?: string[]` và swagger quảng cáo nó, nhưng `example.service.findAll` hardcode `order: { createdAt: 'DESC' }` và không đọc `query.sort`. Header bấm-để-sort sẽ gửi param, backend im lặng bỏ qua, người dùng nghĩ UI hỏng.
- **Không ô tìm kiếm.** `GetAllExampleRequestDto` chỉ có `page`/`size`/`sort`. Search phía client trên đúng một trang dữ liệu là ảo giác, không phải tính năng.

## Cấu trúc thư mục

```
app/warehouse-ui/
├── src/
│   ├── main.tsx                  # QueryClientProvider, RouterProvider
│   ├── app/
│   │   ├── router.tsx            # createBrowserRouter + guards
│   │   └── providers.tsx
│   ├── shared/
│   │   ├── api/
│   │   │   ├── http.ts           # axios + interceptor + unwrap envelope
│   │   │   ├── types.ts          # ApiResponse<T>, ApiError, Paginated<T>
│   │   │   └── generated.ts      # openapi-typescript sinh ra, commit vào git
│   │   ├── auth/
│   │   │   ├── auth.store.ts     # zustand: token + user
│   │   │   ├── permissions.ts    # hasRole(), can(), safeParse(scope)
│   │   │   └── guards.tsx        # ProtectedRoute, RequireRole
│   │   ├── lib/                  # cn(), formatters
│   │   └── config/env.ts         # đọc + validate import.meta.env
│   ├── components/
│   │   ├── ui/                   # shadcn CLI sinh
│   │   └── layout/               # AppShell, Sidebar, Topbar, UserMenu
│   └── features/
│       ├── auth/                 # LoginPage, useLogin, login.schema.ts
│       └── examples/             # ExamplesPage, api.ts, hooks.ts, columns.tsx, dialogs
├── .env.example
├── eslint.config.js
├── vite.config.ts
└── components.json
```

**Quy tắc ranh giới duy nhất**: `features/*` được import từ `shared/` và `components/`, nhưng **không bao giờ import lẫn nhau**. Khi hai feature cần chung một thứ, thứ đó leo lên `shared/`. Có thể enforce bằng `eslint-plugin-boundaries` về sau; chưa cần lúc này.

`warehouse-ui` là package độc lập, `.gitignore` riêng. Repo không có root `package.json` và đợt này không dựng workspace.

## Cấu hình

### `.env.example`

```bash
VITE_API_BASE_URL=http://localhost:8085/api/v1
```

Chỉ một biến. `/api/v1` nằm trong base URL vì backend set `setGlobalPrefix('api/' + VERSION)`.

`shared/config/env.ts` validate biến này tồn tại và ném lỗi rõ ràng lúc khởi động, thay vì để axios lặng lẽ gọi vào `undefined/auth/login`.

**Mọi biến `VITE_` đều nằm trong bundle trình duyệt tải về.** Không bao giờ đặt secret ở đây.

### `vite.config.ts`

- `server: { port: 5175, strictPort: true }` — strictPort bắt buộc: thiếu nó, khi 5175 bận Vite nhảy sang 5176, backend CORS-reject, và ta đi debug axios trong khi lỗi nằm ở port.
- Alias `@` → `src`.
- **Không dùng dev proxy**: gọi thẳng `localhost:8085` để thật sự đi qua CORS, đúng như production. Proxy sẽ giấu lỗi CORS ở local rồi để ta gặp nó lần đầu lúc deploy.

## Cách chạy

### Điều kiện tiên quyết ở `warehouse-api`

Bắt buộc, và dễ bỏ sót: **migration phải chạy trước khi backend bootstrap lần đầu.**

```bash
cd app/warehouse-api && npm run typeorm:r   # seed 3 role
```

`RootUserSeeder` tìm role `SUPER_ADMIN`; nếu chưa có nó chỉ ghi một dòng `warn` rồi **im lặng bỏ qua**. Backend vẫn khởi động bình thường, nhưng tài khoản `root` không tồn tại và mọi lần login đều trả 401 — triệu chứng trông y hệt sai mật khẩu.

### UI

```bash
cd app/warehouse-ui
nvm use              # 24
npm install
cp .env.example .env
npm run gen:api      # cần warehouse-api đang chạy ở :8085
npm run dev          # → http://localhost:5175
```

Đăng nhập bằng `root` / `root` (role `SUPER_ADMIN`).

## Tiêu chí nghiệm thu

Phải quan sát được, không phải "code compile là xong":

1. Login bằng `root/root` → vào app shell, `/auth/me` trả user, tên hiện trên topbar.
2. Bảng `examples` load dữ liệu phân trang; bấm sang trang 2 thấy `page=2&size=10` trên network.
3. Bằng `root` → thấy nút Tạo/Sửa/Xoá; tạo được example mới; bảng tự refresh.
4. Bằng tài khoản `CUSTOMER` (đăng ký qua `/auth/register`) → không thấy các nút đó; gọi API trực tiếp thì nhận 403 và UI hiện toast đọc từ `message`.
5. Xoá token trong `localStorage` rồi gọi một API → 401 → tự về `/login`.
6. `npm run lint` và `tsc --noEmit` sạch.

## Nợ backend đã ghi nhận

Ngoài phạm vi đợt này. Liệt kê để không bị quên:

1. `POST /auth/refresh` không tồn tại, dù `login` vẫn phát `refreshToken`. Hệ quả: user bị đá ra sau 1 tiếng.
2. Typo `hasPrevios` trong `AppPaginatedResponseDto`. UI đang cô lập nó trong `http.ts`.
3. `AppResponseDto` / `AppPaginatedResponseDto` thiếu `@ApiProperty` → swagger sinh schema rỗng, codegen vô dụng cho envelope.
4. `BaseQueryDto.sort` được khai báo và quảng cáo trên swagger nhưng `example.service.findAll` bỏ qua.
5. Không có API user/role, dù RBAC đã dựng đủ 4 tầng bảng. Không quản lý được người dùng qua UI.
6. Không có `@HasAuthority` guard — tầng authority hiện chỉ là dữ liệu, chưa được enforce.
7. Không migration/seeder nào tạo authority hay permission. 4 bảng RBAC tồn tại nhưng 2 bảng luôn rỗng, nên `scope` luôn là `"[]"` và `can()` luôn `false`.
8. `RootUserSeeder` im lặng bỏ qua khi role chưa seed — chỉ `warn`, không `throw`. Triệu chứng (login 401) trỏ sai hoàn toàn về nguyên nhân.
9. Request dùng `size` nhưng response trả `pageSize` — bất đối xứng.
10. `env.validation.ts` bắt buộc `ACB_*`, `ZALO_OA_*`, `MAIL_*`, `GOOGLE_MAPS_*` dù không module nào dùng (đã ghi trong `setup.md` của api).
