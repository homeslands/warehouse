# Warehouse UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng nền tảng `app/warehouse-ui` từ số 0 — scaffold, auth, RBAC, tầng API — cộng màn hình mẫu `examples` chứng minh nền tảng chạy end-to-end với `warehouse-api`.

**Architecture:** SPA Vite + React + TypeScript, tổ chức theo feature. Server state qua TanStack Query, client state (token + user) qua Zustand. Một file `http.ts` bọc axios, cô lập toàn bộ điểm lệch của backend (envelope `{result}`, typo `hasPrevios`, bất đối xứng `size`/`pageSize`) để phần còn lại của codebase không bao giờ thấy chúng. Phân quyền hai lớp: `hasRole()` gác thật, `can()` dựng sẵn chờ backend.

**Tech Stack:** Vite, React, TypeScript strict, Tailwind, shadcn/ui, TanStack Query, TanStack Table, Zustand, axios, React Router v6, React Hook Form, Zod, openapi-typescript, ESLint 9 flat config, Prettier, Vitest, Testing Library, MSW.

**Spec:** `docs/superpowers/specs/2026-07-09-warehouse-ui-foundation-design.md`

## Global Constraints

Mọi task đều chịu các ràng buộc này. Không task nào được vi phạm.

- Thư mục làm việc: `app/warehouse-ui/`. Không sửa bất kỳ file nào trong `app/warehouse-api/`.
- Node 24 (`.nvmrc` chứa đúng `24`).
- Dev server: port **5175**, `strictPort: true`. Backend CORS-reject mọi origin khác.
- API base URL: `http://localhost:8085/api/v1`. Không dùng dev proxy của Vite.
- TypeScript `strict: true`. Không `any` trừ khi có comment giải thích.
- ESLint 9 **flat config** (`eslint.config.js`). Prettier chạy **riêng**, không qua `eslint-plugin-prettier`.
- Alias `@` → `src`.
- Tài nguyên backend định danh bằng **`slug`**, không phải `id`. `id` chỉ dùng làm React key.
- Login bằng **`phonenumber`**, không phải email. Không dùng `z.string().email()`.
- **Không lưu `refreshToken`** ở bất kỳ đâu.
- **`can()` hiện luôn trả `false`** (backend không seed authority/permission). Không dùng `can()` làm cổng gác duy nhất cho bất kỳ thành phần UI nào.
- Mọi biến `VITE_*` nằm trong bundle trình duyệt. Không đặt secret.
- Không thêm cột sắp xếp và không thêm ô tìm kiếm vào bảng `examples` (backend không hỗ trợ — xem spec).
- Commit sau mỗi task. Message tiếng Việt, prefix `feat:` / `chore:` / `test:`.

## Điều kiện tiên quyết (làm một lần, trước Task 1)

Backend phải chạy được và đã seed role, nếu không Task 4 (codegen) và mọi kiểm chứng end-to-end sẽ thất bại.

```bash
cd app/warehouse-api
npm install
cp .env.example .env        # điền giá trị dummy cho ACB_*, ZALO_OA_*, MAIL_*, GOOGLE_MAPS_*, FIREBASE_*
npm run typeorm:r           # BẮT BUỘC: seed 3 role CUSTOMER/ADMIN/SUPER_ADMIN
npm run dev                 # → http://localhost:8085
```

Kiểm chứng: `curl -s http://localhost:8085/swagger.json | head -c 100` phải trả JSON, không phải lỗi kết nối.

Nếu bỏ qua `typeorm:r`, `RootUserSeeder` chỉ ghi một dòng `warn` rồi im lặng bỏ qua — tài khoản `root` không tồn tại, và mọi lần login trả 401 trông y hệt sai mật khẩu.

## File Structure

| File | Trách nhiệm |
|---|---|
| `vite.config.ts` | Port 5175 strictPort, alias `@`, plugin React, cấu hình Vitest |
| `eslint.config.js` | Flat config, TS + react-hooks + react-refresh, tắt rule format |
| `src/shared/config/env.ts` | Đọc + validate `import.meta.env`, ném lỗi rõ ràng lúc boot |
| `src/shared/api/types.ts` | `ApiResponse<T>`, `ApiError`, `Paginated<T>`, `BackendPaginated<T>` |
| `src/shared/api/generated.ts` | openapi-typescript sinh ra. Commit vào git. Không sửa tay |
| `src/shared/api/http.ts` | axios instance, unwrap envelope, chuẩn hoá phân trang, interceptor |
| `src/shared/auth/auth.store.ts` | Zustand: `token`, `user`, `status`. Đọc/ghi localStorage |
| `src/shared/auth/permissions.ts` | `safeParseScope`, `hasRole`, `can`. Hàm thuần, không đụng store |
| `src/shared/auth/guards.tsx` | `ProtectedRoute`, `RequireRole` |
| `src/shared/auth/useSession.ts` | Hydrate `/auth/me` lúc boot |
| `src/shared/lib/cn.ts` | `cn()` — clsx + tailwind-merge |
| `src/components/ui/*` | shadcn CLI sinh. Không sửa tay trừ khi cần |
| `src/components/layout/AppShell.tsx` | Sidebar + Topbar + `<Outlet/>` |
| `src/app/providers.tsx` | QueryClientProvider, Toaster |
| `src/app/router.tsx` | `createBrowserRouter` + guards |
| `src/features/auth/LoginPage.tsx` | Form login |
| `src/features/auth/login.schema.ts` | Zod schema (phonenumber, không phải email) |
| `src/features/auth/useLogin.ts` | Mutation login |
| `src/features/examples/api.ts` | 5 hàm gọi API examples |
| `src/features/examples/hooks.ts` | Query + mutation hooks |
| `src/features/examples/columns.tsx` | Định nghĩa cột TanStack Table |
| `src/features/examples/ExamplesPage.tsx` | Bảng + nút write gác bằng `hasRole` |
| `src/features/examples/ExampleFormDialog.tsx` | Dialog tạo/sửa dùng chung |
| `src/features/examples/DeleteExampleDialog.tsx` | Xác nhận xoá |
| `src/test/setup.ts` | Setup Vitest: jest-dom, MSW server lifecycle |
| `src/test/msw.ts` | MSW server + handler mặc định |

**Quy tắc ranh giới:** `features/*` import từ `shared/` và `components/`, nhưng **không bao giờ import lẫn nhau**.

---

### Task 1: Scaffold + toolchain

**Files:**
- Create: `app/warehouse-ui/` (toàn bộ scaffold)
- Create: `app/warehouse-ui/.nvmrc`, `.gitignore`, `.env.example`
- Modify: `app/warehouse-ui/vite.config.ts`, `eslint.config.js`, `tsconfig.app.json`, `package.json`

**Interfaces:**
- Consumes: không
- Produces: dev server ở `:5175`; script `lint`, `format`, `typecheck`; alias `@` → `src`

- [ ] **Step 1: Scaffold bằng create-vite**

```bash
cd app/warehouse-ui
npm create vite@latest . -- --template react-ts
```

Nếu thư mục không rỗng, chọn "Ignore files and continue".

- [ ] **Step 2: Ghi lại phiên bản thực tế mà create-vite sinh ra**

```bash
node -p "const p=require('./package.json'); JSON.stringify({react:p.dependencies.react, vite:p.devDependencies.vite, eslint:p.devDependencies.eslint},null,2)"
```

Ghi ba con số này vào PR/commit body. **Chúng quyết định phiên bản shadcn ở Task 7.** Nếu React là 19, shadcn phải là bản đã bỏ `forwardRef`; nếu là 18 thì ngược lại. Đừng đoán — đọc.

Nếu `eslint` **không** phải major 9, dừng lại và báo người review: Global Constraints yêu cầu flat config.

- [ ] **Step 3: Cài dependency**

```bash
npm i react-router-dom axios zustand @tanstack/react-query @tanstack/react-table \
      react-hook-form zod @hookform/resolvers
npm i -D openapi-typescript prettier eslint-config-prettier vite-tsconfig-paths
```

- [ ] **Step 4: Ghim Node và gitignore**

`.nvmrc`:
```
24
```

`.gitignore`:
```
node_modules/
dist/
coverage/
.env
*.log
```

- [ ] **Step 5: `.env.example`**

```bash
VITE_API_BASE_URL=http://localhost:8085/api/v1
```

```bash
cp .env.example .env
```

- [ ] **Step 6: `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: { port: 5175, strictPort: true },
})
```

`strictPort: true` là bắt buộc. Thiếu nó, khi 5175 bận Vite nhảy sang 5176, backend CORS-reject, và ta đi debug axios trong khi lỗi nằm ở port.

- [ ] **Step 7: Alias `@` trong `tsconfig.app.json`**

Thêm vào `compilerOptions`:
```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

Xác nhận `"strict": true` đã có. Nếu chưa, thêm.

- [ ] **Step 8: Prettier**

`.prettierrc`:
```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

- [ ] **Step 9: Nối `eslint-config-prettier` vào `eslint.config.js`**

Thêm import và append vào cuối mảng export — phải là phần tử **cuối cùng** để nó tắt được các rule format do phần tử trước bật:

```js
import prettier from 'eslint-config-prettier'

export default [
  // ...các phần tử create-vite sinh sẵn, giữ nguyên...
  prettier,
]
```

- [ ] **Step 10: Scripts trong `package.json`**

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
  "typecheck": "tsc --noEmit -p tsconfig.app.json",
  "gen:api": "openapi-typescript http://localhost:8085/swagger.json -o src/shared/api/generated.ts"
}
```

- [ ] **Step 11: Kiểm chứng**

```bash
npm run lint && npm run typecheck && npm run format
npm run dev
```

Expected: `lint` và `typecheck` không lỗi. `dev` in ra đúng `Local: http://localhost:5175/`. Nếu nó in 5176, `strictPort` chưa ăn — sửa trước khi đi tiếp.

- [ ] **Step 12: Commit**

```bash
git add app/warehouse-ui
git commit -m "chore: scaffold warehouse-ui (vite + react + ts, eslint 9 flat, prettier)"
```

---

### Task 2: Test harness (Vitest + Testing Library + MSW)

**Files:**
- Create: `src/test/setup.ts`, `src/test/msw.ts`
- Create: `src/shared/lib/cn.ts`, `src/shared/lib/cn.test.ts`
- Modify: `vite.config.ts`, `package.json`

**Interfaces:**
- Consumes: Task 1 (vite.config, alias `@`)
- Produces: `npm run test`; `server` (MSW) export từ `@/test/msw`; `cn(...)` export từ `@/shared/lib/cn`

- [ ] **Step 1: Cài**

```bash
npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom \
        @testing-library/user-event msw
npm i clsx tailwind-merge
```

- [ ] **Step 2: Viết test đỏ trước — `src/shared/lib/cn.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { cn } from '@/shared/lib/cn'

describe('cn', () => {
  it('ghép các class thường', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('bỏ class falsy', () => {
    const showB: boolean = false
    expect(cn('a', showB && 'b', undefined, 'c')).toBe('a c')
  })

  it('class tailwind sau ghi đè class trước cùng nhóm', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
```

- [ ] **Step 3: Cấu hình Vitest trong `vite.config.ts`**

Thêm vào object truyền cho `defineConfig`:

```ts
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
```

Nếu TypeScript than phiền `test` không tồn tại trên type config, đổi dòng đầu file thành:
```ts
/// <reference types="vitest" />
```

- [ ] **Step 4: `src/test/msw.ts`**

```ts
import { setupServer } from 'msw/node'

export const server = setupServer()
```

Handler để rỗng: mỗi test tự khai báo handler nó cần bằng `server.use(...)`. Handler mặc định dùng chung là cách nhanh nhất để một test lặng lẽ phụ thuộc vào dữ liệu của test khác.

- [ ] **Step 5: `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './msw'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())
```

`onUnhandledRequest: 'error'` là cố ý: một request không có handler phải làm test đỏ, chứ không được lặng lẽ đi ra mạng thật.

- [ ] **Step 6: Script test**

Thêm vào `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Chạy test, xác nhận nó ĐỎ**

```bash
npm run test
```

Expected: FAIL — `Failed to resolve import "@/shared/lib/cn"`.

- [ ] **Step 8: Viết `src/shared/lib/cn.ts` tối thiểu**

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 9: Chạy test, xác nhận XANH**

```bash
npm run test
```

Expected: PASS, 3 test.

- [ ] **Step 10: Commit**

```bash
git add app/warehouse-ui
git commit -m "test: dựng harness vitest + testing library + msw"
```

---

### Task 3: Env config có validate

**Files:**
- Create: `src/shared/config/env.ts`, `src/shared/config/env.test.ts`

**Interfaces:**
- Consumes: Task 2 (vitest)
- Produces: `env.apiBaseUrl: string`; `readEnv(raw: Record<string, unknown>): { apiBaseUrl: string }`

Tách `readEnv` (hàm thuần, nhận input) khỏi `env` (giá trị đọc từ `import.meta.env`) để test được mà không phải giả lập `import.meta`.

- [ ] **Step 1: Viết test đỏ — `src/shared/config/env.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { readEnv } from '@/shared/config/env'

describe('readEnv', () => {
  it('trả về apiBaseUrl khi biến hợp lệ', () => {
    expect(readEnv({ VITE_API_BASE_URL: 'http://localhost:8085/api/v1' })).toEqual({
      apiBaseUrl: 'http://localhost:8085/api/v1',
    })
  })

  it('cắt dấu / thừa ở cuối', () => {
    expect(readEnv({ VITE_API_BASE_URL: 'http://x/api/v1/' }).apiBaseUrl).toBe('http://x/api/v1')
  })

  it('ném lỗi nêu đích danh biến thiếu', () => {
    expect(() => readEnv({})).toThrow(/VITE_API_BASE_URL/)
  })

  it('ném lỗi khi biến là chuỗi rỗng', () => {
    expect(() => readEnv({ VITE_API_BASE_URL: '  ' })).toThrow(/VITE_API_BASE_URL/)
  })
})
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

```bash
npx vitest run src/shared/config/env.test.ts
```

Expected: FAIL — không resolve được import.

- [ ] **Step 3: Viết `src/shared/config/env.ts`**

```ts
export type Env = { apiBaseUrl: string }

export function readEnv(raw: Record<string, unknown>): Env {
  const value = raw.VITE_API_BASE_URL

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      'Thiếu biến môi trường VITE_API_BASE_URL. Chạy `cp .env.example .env` rồi điền giá trị.',
    )
  }

  return { apiBaseUrl: value.trim().replace(/\/+$/, '') }
}

export const env: Env = readEnv(import.meta.env as unknown as Record<string, unknown>)
```

Ném lỗi nêu đích danh tên biến là cố ý: thiếu nó thì axios sẽ lặng lẽ gọi vào `undefined/auth/login` và lỗi hiện ra ở nơi cách xa nguyên nhân.

- [ ] **Step 4: Chạy, xác nhận XANH**

```bash
npx vitest run src/shared/config/env.test.ts
```

Expected: PASS, 4 test.

- [ ] **Step 5: Commit**

```bash
git add app/warehouse-ui/src/shared/config
git commit -m "feat: env config có validate và thông báo lỗi nêu đích danh biến"
```

---

### Task 4: Sinh type từ swagger

**Files:**
- Create: `src/shared/api/generated.ts` (do công cụ sinh, commit vào git)

**Interfaces:**
- Consumes: Task 1 (script `gen:api`)
- Produces: `src/shared/api/generated.ts` chứa `components['schemas']['ExampleResponseDto']`, `LoginAuthResponseDto`, `CreateExampleRequestDto`, v.v.

- [ ] **Step 1: Xác nhận backend đang chạy**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8085/swagger.json
```

Expected: `200`. Nếu không, quay lại mục Điều kiện tiên quyết.

- [ ] **Step 2: Sinh type**

```bash
cd app/warehouse-ui && npm run gen:api
```

- [ ] **Step 3: Kiểm chứng cái gì có và cái gì KHÔNG có**

```bash
grep -c "ExampleResponseDto" src/shared/api/generated.ts   # > 0
grep -c "hasPrevios" src/shared/api/generated.ts           # kỳ vọng: 0
```

`hasPrevios` **không** xuất hiện, và đó không phải lỗi. `AppPaginatedResponseDto` là class trần không có `@ApiProperty`, nên swagger sinh schema rỗng cho nó. Đây chính là lý do Task 5 phải khai báo `Paginated<T>` bằng tay. Nếu `grep` trả về số khác 0, nghĩa là backend đã được sửa — báo người review, vì Task 5 sẽ cần viết lại.

- [ ] **Step 4: Xác nhận typecheck vẫn sạch**

```bash
npm run typecheck
```

Expected: không lỗi.

- [ ] **Step 5: Commit**

```bash
git add app/warehouse-ui/src/shared/api/generated.ts
git commit -m "chore: sinh type từ swagger.json"
```

File sinh ra **được commit** một cách có chủ ý. Không hook `gen:api` vào `build` — CI không có backend, build sẽ chết.

---

### Task 5: Tầng HTTP — envelope, phân trang, lỗi

**Files:**
- Create: `src/shared/api/types.ts`
- Create: `src/shared/api/http.ts`, `src/shared/api/http.test.ts`

**Interfaces:**
- Consumes: Task 3 (`env.apiBaseUrl`), Task 2 (`server` từ `@/test/msw`)
- Produces:
  - `type ApiResponse<T> = { message: string; statusCode: number; timestamp: string; result: T }`
  - `type ApiError = { statusCode: number; code?: number; timestamp: string; path: string; method: string; message: string }`
  - `type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number; hasNext: boolean; hasPrevious: boolean }`
  - `http: AxiosInstance`
  - `getData<T>(url, config?): Promise<T>`
  - `getPaginated<T>(url, params: { page: number; size: number }): Promise<Paginated<T>>`
  - `postData<T>(url, body): Promise<T>` / `patchData<T>` / `deleteData<T>`
  - `setAuthTokenGetter(fn: () => string | null): void`
  - `setUnauthorizedHandler(fn: () => void): void`
  - `isApiError(e: unknown): e is ApiError`

`setAuthTokenGetter` / `setUnauthorizedHandler` là **dependency injection có chủ đích**. Nếu `http.ts` import trực tiếp `auth.store.ts` và `router.tsx`, ta tạo vòng import (`store → http → store`) và làm `http.ts` không test được độc lập. Task 6 và Task 8 sẽ tiêm vào.

- [ ] **Step 1: Viết `src/shared/api/types.ts`**

```ts
export type ApiResponse<T> = {
  message: string
  statusCode: number
  timestamp: string
  result: T
}

export type ApiError = {
  statusCode: number
  code?: number
  timestamp: string
  path: string
  method: string
  message: string
}

/** Đúng như backend trả về — chú ý typo `hasPrevios`. Chỉ dùng nội bộ trong http.ts. */
export type BackendPaginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
  hasPrevios: boolean
}

/** Hình dạng mà phần còn lại của app nhìn thấy. */
export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}
```

- [ ] **Step 2: Viết test đỏ — `src/shared/api/http.test.ts`**

```ts
import { HttpResponse, http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw'
import {
  getData,
  getPaginated,
  isApiError,
  setAuthTokenGetter,
  setUnauthorizedHandler,
} from '@/shared/api/http'

const BASE = 'http://localhost:8085/api/v1'

beforeEach(() => {
  setAuthTokenGetter(() => null)
  setUnauthorizedHandler(() => {})
})

describe('getData', () => {
  it('bóc `result` ra khỏi envelope', async () => {
    server.use(
      mswHttp.get(`${BASE}/examples/abc`, () =>
        HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '2026-07-09T00:00:00.000Z',
          result: { id: '1', slug: 'abc', name: 'Example A' },
        }),
      ),
    )

    await expect(getData(`/examples/abc`)).resolves.toEqual({
      id: '1',
      slug: 'abc',
      name: 'Example A',
    })
  })

  it('gắn Bearer token khi getter trả về token', async () => {
    setAuthTokenGetter(() => 'tok-123')
    let seen: string | null = null

    server.use(
      mswHttp.get(`${BASE}/auth/me`, ({ request }) => {
        seen = request.headers.get('authorization')
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: {} })
      }),
    )

    await getData('/auth/me')
    expect(seen).toBe('Bearer tok-123')
  })

  it('không gắn header Authorization khi chưa có token', async () => {
    let seen: string | null = 'chưa gán'

    server.use(
      mswHttp.get(`${BASE}/auth/me`, ({ request }) => {
        seen = request.headers.get('authorization')
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: {} })
      }),
    )

    await getData('/auth/me')
    expect(seen).toBeNull()
  })
})

describe('getPaginated', () => {
  it('gửi `size` lên nhưng đọc `pageSize` về, và đổi `hasPrevios` thành `hasPrevious`', async () => {
    let seenQuery = ''

    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) => {
        seenQuery = new URL(request.url).search
        return HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '',
          result: {
            items: [{ slug: 'a' }],
            total: 12,
            page: 2,
            pageSize: 10,
            totalPages: 2,
            hasNext: false,
            hasPrevios: true,
          },
        })
      }),
    )

    const result = await getPaginated<{ slug: string }>('/examples', { page: 2, size: 10 })

    expect(seenQuery).toContain('size=10')
    expect(seenQuery).toContain('page=2')
    expect(result.hasPrevious).toBe(true)
    expect(result.pageSize).toBe(10)
    expect(result).not.toHaveProperty('hasPrevios')
  })
})

describe('xử lý lỗi', () => {
  it('reject bằng ApiError đọc từ body lỗi của backend', async () => {
    server.use(
      mswHttp.get(`${BASE}/examples`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            code: 1234,
            timestamp: '2026-07-09T00:00:00.000Z',
            path: '/api/v1/examples',
            method: 'GET',
            message: 'Forbidden resource',
          },
          { status: 403 },
        ),
      ),
    )

    try {
      await getData('/examples')
      expect.unreachable('lẽ ra phải throw')
    } catch (e) {
      expect(isApiError(e)).toBe(true)
      if (isApiError(e)) {
        expect(e.message).toBe('Forbidden resource')
        expect(e.code).toBe(1234)
        expect(e.statusCode).toBe(403)
      }
    }
  })

  it('gọi unauthorizedHandler đúng một lần khi gặp 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)

    server.use(
      mswHttp.get(`${BASE}/auth/me`, () =>
        HttpResponse.json(
          { statusCode: 401, timestamp: '', path: '/api/v1/auth/me', method: 'GET', message: 'Unauthorized' },
          { status: 401 },
        ),
      ),
    )

    await expect(getData('/auth/me')).rejects.toBeDefined()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('KHÔNG gọi unauthorizedHandler khi gặp 403', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)

    server.use(
      mswHttp.get(`${BASE}/examples`, () =>
        HttpResponse.json(
          { statusCode: 403, timestamp: '', path: '/api/v1/examples', method: 'GET', message: 'Forbidden' },
          { status: 403 },
        ),
      ),
    )

    await expect(getData('/examples')).rejects.toBeDefined()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
```

Lưu ý import: `http` từ `msw` bị đổi tên thành `mswHttp` để không đụng tên với `http` mà `@/shared/api/http` xuất ra.

- [ ] **Step 3: Chạy, xác nhận ĐỎ**

```bash
npx vitest run src/shared/api/http.test.ts
```

Expected: FAIL — không resolve được `@/shared/api/http`.

- [ ] **Step 4: Viết `src/shared/api/http.ts`**

```ts
import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { env } from '@/shared/config/env'
import type { ApiError, ApiResponse, BackendPaginated, Paginated } from './types'

let getAuthToken: () => string | null = () => null
let onUnauthorized: () => void = () => {}

export function setAuthTokenGetter(fn: () => string | null): void {
  getAuthToken = fn
}

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

export const http: AxiosInstance = axios.create({ baseURL: env.apiBaseUrl })

http.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401) onUnauthorized()
    if (error.response?.data) return Promise.reject(error.response.data)
    return Promise.reject(error)
  },
)

export function isApiError(e: unknown): e is ApiError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'statusCode' in e &&
    'message' in e &&
    typeof (e as ApiError).message === 'string'
  )
}

export async function getData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.get<ApiResponse<T>>(url, config)
  return res.data.result
}

export async function postData<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.post<ApiResponse<T>>(url, body)
  return res.data.result
}

export async function patchData<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.patch<ApiResponse<T>>(url, body)
  return res.data.result
}

export async function deleteData<T>(url: string): Promise<T> {
  const res = await http.delete<ApiResponse<T>>(url)
  return res.data.result
}

/**
 * Cô lập hai điểm lệch của backend tại đúng chỗ này:
 *   - request dùng `size`, response trả `pageSize`
 *   - response trả `hasPrevios` (typo)
 * Phần còn lại của codebase không bao giờ thấy chúng.
 */
export async function getPaginated<T>(
  url: string,
  params: { page: number; size: number },
): Promise<Paginated<T>> {
  const raw = await getData<BackendPaginated<T>>(url, { params })

  return {
    items: raw.items,
    total: raw.total,
    page: raw.page,
    pageSize: raw.pageSize,
    totalPages: raw.totalPages,
    hasNext: raw.hasNext,
    hasPrevious: raw.hasPrevios,
  }
}
```

- [ ] **Step 5: Chạy, xác nhận XANH**

```bash
npx vitest run src/shared/api/http.test.ts
```

Expected: PASS, 7 test.

- [ ] **Step 6: Commit**

```bash
git add app/warehouse-ui/src/shared/api
git commit -m "feat: tầng http bọc envelope, chuẩn hoá phân trang, bắt 401"
```

---

### Task 6: Auth store + permissions

**Files:**
- Create: `src/shared/auth/permissions.ts`, `src/shared/auth/permissions.test.ts`
- Create: `src/shared/auth/auth.store.ts`, `src/shared/auth/auth.store.test.ts`

**Interfaces:**
- Consumes: Task 5 (`setAuthTokenGetter`)
- Produces:
  - `type CurrentUser = { userId: string; userName: string; roleName: string; scope: string }`
  - `safeParseScope(scope: string | null | undefined): string[]`
  - `hasRole(user: CurrentUser | null, ...roles: string[]): boolean`
  - `can(user: CurrentUser | null, authority: string): boolean`
  - `useAuthStore` (Zustand) với state `{ token, user, status }` và action `{ setToken, setUser, logout }`
  - `status: 'loading' | 'authenticated' | 'unauthenticated'`
  - `TOKEN_STORAGE_KEY = 'warehouse.accessToken'`

- [ ] **Step 1: Viết test đỏ — `src/shared/auth/permissions.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { can, hasRole, safeParseScope, type CurrentUser } from '@/shared/auth/permissions'

const user = (over: Partial<CurrentUser> = {}): CurrentUser => ({
  userId: 'u1',
  userName: 'root',
  roleName: 'SUPER_ADMIN',
  scope: '[]',
  ...over,
})

describe('safeParseScope', () => {
  it('parse mảng authority hợp lệ', () => {
    expect(safeParseScope('["CREATE_EXAMPLE","READ_EXAMPLE"]')).toEqual([
      'CREATE_EXAMPLE',
      'READ_EXAMPLE',
    ])
  })

  it('trả mảng rỗng với "[]" — đây là trường hợp THỰC TẾ hôm nay', () => {
    expect(safeParseScope('[]')).toEqual([])
  })

  it('trả mảng rỗng với chuỗi rỗng', () => {
    expect(safeParseScope('')).toEqual([])
  })

  it('trả mảng rỗng với null/undefined', () => {
    expect(safeParseScope(null)).toEqual([])
    expect(safeParseScope(undefined)).toEqual([])
  })

  it('trả mảng rỗng với JSON hỏng, không ném lỗi', () => {
    expect(safeParseScope('{ đây không phải json')).toEqual([])
  })

  it('trả mảng rỗng khi JSON hợp lệ nhưng không phải mảng', () => {
    expect(safeParseScope('{"a":1}')).toEqual([])
  })

  it('lọc bỏ phần tử không phải chuỗi', () => {
    expect(safeParseScope('["A",1,null,"B"]')).toEqual(['A', 'B'])
  })
})

describe('hasRole', () => {
  it('true khi role của user nằm trong danh sách', () => {
    expect(hasRole(user({ roleName: 'ADMIN' }), 'ADMIN', 'SUPER_ADMIN')).toBe(true)
  })

  it('false khi không khớp', () => {
    expect(hasRole(user({ roleName: 'CUSTOMER' }), 'ADMIN', 'SUPER_ADMIN')).toBe(false)
  })

  it('false khi chưa đăng nhập', () => {
    expect(hasRole(null, 'ADMIN')).toBe(false)
  })
})

describe('can', () => {
  it('true khi authority có trong scope', () => {
    expect(can(user({ scope: '["CREATE_EXAMPLE"]' }), 'CREATE_EXAMPLE')).toBe(true)
  })

  it('false với SUPER_ADMIN khi scope rỗng — trạng thái thực tế hôm nay', () => {
    expect(can(user({ roleName: 'SUPER_ADMIN', scope: '[]' }), 'CREATE_EXAMPLE')).toBe(false)
  })

  it('false khi chưa đăng nhập', () => {
    expect(can(null, 'CREATE_EXAMPLE')).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

```bash
npx vitest run src/shared/auth/permissions.test.ts
```

Expected: FAIL — không resolve được import.

- [ ] **Step 3: Viết `src/shared/auth/permissions.ts`**

```ts
export type CurrentUser = {
  userId: string
  userName: string
  roleName: string
  scope: string
}

/**
 * Backend gom authority names rồi JSON.stringify thủ công vào `scope` (auth.utils.ts).
 * Không migration nào seed authority/permission, nên trên thực tế `scope` LUÔN là "[]".
 * Suy biến về mảng rỗng thay vì ném lỗi: một chuỗi hỏng không được phép làm trắng màn hình.
 */
export function safeParseScope(scope: string | null | undefined): string[] {
  if (!scope) return []

  try {
    const parsed: unknown = JSON.parse(scope)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

export function hasRole(user: CurrentUser | null, ...roles: string[]): boolean {
  if (!user) return false
  return roles.includes(user.roleName)
}

/**
 * LUÔN trả false ở thời điểm hiện tại — backend chưa seed authority nào.
 * Không dùng làm cổng gác duy nhất cho bất kỳ thành phần UI nào. Dùng hasRole().
 */
export function can(user: CurrentUser | null, authority: string): boolean {
  if (!user) return false
  return safeParseScope(user.scope).includes(authority)
}
```

- [ ] **Step 4: Chạy, xác nhận XANH**

```bash
npx vitest run src/shared/auth/permissions.test.ts
```

Expected: PASS, 13 test.

- [ ] **Step 5: Viết test đỏ — `src/shared/auth/auth.store.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { TOKEN_STORAGE_KEY, useAuthStore } from '@/shared/auth/auth.store'

const reset = () => {
  localStorage.clear()
  useAuthStore.setState({ token: null, user: null, status: 'loading' })
}

describe('useAuthStore', () => {
  beforeEach(reset)

  it('setToken ghi vào localStorage', () => {
    useAuthStore.getState().setToken('tok-1')
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('tok-1')
    expect(useAuthStore.getState().token).toBe('tok-1')
  })

  it('setUser chuyển status sang authenticated', () => {
    useAuthStore.getState().setUser({
      userId: 'u1',
      userName: 'root',
      roleName: 'SUPER_ADMIN',
      scope: '[]',
    })
    expect(useAuthStore.getState().status).toBe('authenticated')
  })

  it('logout xoá token khỏi localStorage và đặt status unauthenticated', () => {
    useAuthStore.getState().setToken('tok-1')
    useAuthStore.getState().logout()

    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })
})
```

- [ ] **Step 6: Chạy, xác nhận ĐỎ**

```bash
npx vitest run src/shared/auth/auth.store.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Viết `src/shared/auth/auth.store.ts`**

```ts
import { create } from 'zustand'
import { setAuthTokenGetter } from '@/shared/api/http'
import type { CurrentUser } from './permissions'

export const TOKEN_STORAGE_KEY = 'warehouse.accessToken'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

type AuthState = {
  token: string | null
  user: CurrentUser | null
  status: AuthStatus
  setToken: (token: string) => void
  setUser: (user: CurrentUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  user: null,
  status: 'loading',

  setToken: (token) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    set({ token })
  },

  setUser: (user) => set({ user, status: 'authenticated' }),

  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    set({ token: null, user: null, status: 'unauthenticated' })
  },
}))

// Tiêm token vào http.ts mà không tạo vòng import ngược.
// KHÔNG lưu refreshToken: backend phát ra nó nhưng không endpoint nào tiêu thụ.
setAuthTokenGetter(() => useAuthStore.getState().token)
```

- [ ] **Step 8: Chạy, xác nhận XANH**

```bash
npx vitest run src/shared/auth/
```

Expected: PASS, 16 test.

- [ ] **Step 9: Commit**

```bash
git add app/warehouse-ui/src/shared/auth
git commit -m "feat: auth store + phân quyền hai lớp (hasRole gác thật, can dựng sẵn)"
```

---

### Task 7: Tailwind + shadcn/ui

**Files:**
- Modify: `src/index.css`, `vite.config.ts`, `tsconfig.app.json`
- Create: `components.json`, `src/components/ui/*`

**Interfaces:**
- Consumes: Task 2 (`cn`), Task 1 (alias `@`)
- Produces: `Button`, `Input`, `Label`, `Table` (+ `TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`), `Dialog` (+ các phần), `Sonner` (Toaster), `DropdownMenu` — tất cả từ `@/components/ui/*`

- [ ] **Step 1: Đọc lại phiên bản React đã ghi ở Task 1 Step 2**

Đây là lý do Task 1 bắt ghi nó. React 19 bỏ `forwardRef` (ref thành prop thường); shadcn có hai dòng component tương ứng. Cài lệch phiên bản sẽ đẻ ra hàng loạt cảnh báo TypeScript ngay ở component đầu tiên, và triệu chứng trông như lỗi cấu hình TS.

- [ ] **Step 2: Cài Tailwind theo hướng dẫn hiện hành**

```bash
npx shadcn@latest init
```

CLI sẽ hỏi style, base color, và tự cài Tailwind + viết `components.json` + `src/index.css` + sửa `vite.config.ts`/`tsconfig`. Trả lời theo mặc định, chọn base color `slate`.

Nếu CLI hỏi về alias, xác nhận `@/*` → `./src/*` (đã set ở Task 1 Step 7).

- [ ] **Step 3: Thêm các component cần dùng**

```bash
npx shadcn@latest add button input label table dialog dropdown-menu sonner
```

- [ ] **Step 4: Xác nhận `cn` không bị ghi đè**

```bash
cat src/lib/utils.ts 2>/dev/null
```

shadcn mặc định sinh `cn` vào `src/lib/utils.ts`. Ta đã có nó ở `src/shared/lib/cn.ts` từ Task 2. **Giữ một nguồn duy nhất**: sửa `components.json` trường `aliases.utils` thành `@/shared/lib/cn`, xoá `src/lib/utils.ts`, rồi sửa import trong các file `src/components/ui/*` đã sinh:

```bash
grep -rl "@/lib/utils" src/components/ui/ | xargs sed -i '' 's|@/lib/utils|@/shared/lib/cn|g'
rm -f src/lib/utils.ts && rmdir src/lib 2>/dev/null || true
```

- [ ] **Step 5: Kiểm chứng**

```bash
npm run typecheck && npm run lint && npm run test
```

Expected: tất cả sạch. Nếu `typecheck` báo lỗi quanh `forwardRef` hoặc `ref`, phiên bản React và shadcn lệch nhau — quay lại Step 1.

- [ ] **Step 6: Commit**

```bash
git add app/warehouse-ui
git commit -m "feat: tailwind + shadcn/ui, gộp cn() về một nguồn duy nhất"
```

---

### Task 8: Router, guards, session hydrate, và trang Login

**Files:**
- Create: `src/shared/auth/useSession.ts`
- Create: `src/shared/auth/guards.tsx`, `src/shared/auth/guards.test.tsx`
- Create: `src/features/auth/login.schema.ts`, `src/features/auth/login.schema.test.ts`
- Create: `src/features/auth/useLogin.ts`, `src/features/auth/LoginPage.tsx`
- Create: `src/app/providers.tsx`, `src/app/router.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: Task 5 (`getData`, `postData`, `setUnauthorizedHandler`), Task 6 (`useAuthStore`, `hasRole`), Task 7 (`Button`, `Input`, `Label`)
- Produces:
  - `useSession(): void` — gọi một lần ở `providers.tsx`
  - `<ProtectedRoute>{children}</ProtectedRoute>` — nhận `children`, không tự render `<Outlet/>`. Task 9 dùng nó bọc `<AppShell/>`, và chính `AppShell` mới render `<Outlet/>`.
  - `<RequireRole roles={string[]}>{children}</RequireRole>` — cùng dạng. Task 10 **không** dùng nó (route `/examples` mở cho mọi user đã đăng nhập; nút write mới bị gác). Nó được viết và test sẵn cho module nghiệp vụ sau này.
  - `loginSchema`, `type LoginInput = { phonenumber: string; password: string }`
  - `useLogin(): UseMutationResult<LoginResult, ApiError, LoginInput>`
  - `type LoginResult = { accessToken: string; expireTime: string }`
  - `router` từ `@/app/router`

- [ ] **Step 1: Viết test đỏ — `src/features/auth/login.schema.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { loginSchema } from '@/features/auth/login.schema'

describe('loginSchema', () => {
  it('chấp nhận số điện thoại và mật khẩu hợp lệ', () => {
    expect(loginSchema.safeParse({ phonenumber: '0376295216', password: 'secret' }).success).toBe(
      true,
    )
  })

  it('chấp nhận `root` — tài khoản seed không phải số điện thoại thật', () => {
    expect(loginSchema.safeParse({ phonenumber: 'root', password: 'root' }).success).toBe(true)
  })

  it('từ chối phonenumber rỗng', () => {
    expect(loginSchema.safeParse({ phonenumber: '', password: 'secret' }).success).toBe(false)
  })

  it('từ chối password rỗng', () => {
    expect(loginSchema.safeParse({ phonenumber: '0376295216', password: '' }).success).toBe(false)
  })
})
```

Test thứ hai là điểm mấu chốt: tài khoản seed có `phonenumber = "root"`. Một regex `/^0\d{9}$/` sẽ chặn đúng tài khoản duy nhất dùng để đăng nhập lần đầu. Không validate định dạng số điện thoại — chỉ validate không rỗng.

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

```bash
npx vitest run src/features/auth/login.schema.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Viết `src/features/auth/login.schema.ts`**

```ts
import { z } from 'zod'

// KHÔNG dùng z.string().email(): backend đăng nhập bằng phonenumber.
// KHÔNG ép định dạng số: tài khoản seed có phonenumber = "root".
export const loginSchema = z.object({
  phonenumber: z.string().min(1, 'Vui lòng nhập số điện thoại'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
})

export type LoginInput = z.infer<typeof loginSchema>
```

- [ ] **Step 4: Chạy, xác nhận XANH**

```bash
npx vitest run src/features/auth/login.schema.test.ts
```

Expected: PASS, 4 test.

- [ ] **Step 5: Viết test đỏ — `src/shared/auth/guards.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProtectedRoute, RequireRole } from '@/shared/auth/guards'
import { useAuthStore } from '@/shared/auth/auth.store'
import type { CurrentUser } from '@/shared/auth/permissions'

const asUser = (roleName: string): CurrentUser => ({
  userId: 'u1',
  userName: 'tester',
  roleName,
  scope: '[]',
})

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>TRANG LOGIN</div>} />
        <Route path="/forbidden" element={<div>KHÔNG ĐỦ QUYỀN</div>} />
        <Route path="/secret" element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, status: 'unauthenticated' })
})

describe('ProtectedRoute', () => {
  it('đẩy về /login khi chưa đăng nhập', () => {
    renderAt('/secret', <ProtectedRoute><div>BÍ MẬT</div></ProtectedRoute>)
    expect(screen.getByText('TRANG LOGIN')).toBeInTheDocument()
  })

  it('hiện nội dung khi đã đăng nhập', () => {
    useAuthStore.setState({ token: 't', user: asUser('CUSTOMER'), status: 'authenticated' })
    renderAt('/secret', <ProtectedRoute><div>BÍ MẬT</div></ProtectedRoute>)
    expect(screen.getByText('BÍ MẬT')).toBeInTheDocument()
  })

  it('không đẩy đi đâu khi status còn loading', () => {
    useAuthStore.setState({ token: 't', user: null, status: 'loading' })
    renderAt('/secret', <ProtectedRoute><div>BÍ MẬT</div></ProtectedRoute>)
    expect(screen.queryByText('TRANG LOGIN')).not.toBeInTheDocument()
    expect(screen.queryByText('BÍ MẬT')).not.toBeInTheDocument()
  })
})

describe('RequireRole', () => {
  it('cho qua khi role khớp', () => {
    useAuthStore.setState({ token: 't', user: asUser('SUPER_ADMIN'), status: 'authenticated' })
    renderAt('/secret', <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}><div>BÍ MẬT</div></RequireRole>)
    expect(screen.getByText('BÍ MẬT')).toBeInTheDocument()
  })

  it('đẩy về /forbidden khi role không khớp', () => {
    useAuthStore.setState({ token: 't', user: asUser('CUSTOMER'), status: 'authenticated' })
    renderAt('/secret', <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}><div>BÍ MẬT</div></RequireRole>)
    expect(screen.getByText('KHÔNG ĐỦ QUYỀN')).toBeInTheDocument()
  })
})
```

Test "loading" bắt một lỗi kinh điển: nếu guard coi `user === null` là "chưa đăng nhập", thì trong khoảnh khắc `/auth/me` còn đang bay, người dùng đã đăng nhập vẫn bị đá về `/login`. Mỗi lần F5.

- [ ] **Step 6: Chạy, xác nhận ĐỎ**

```bash
npx vitest run src/shared/auth/guards.test.tsx
```

Expected: FAIL.

- [ ] **Step 7: Viết `src/shared/auth/guards.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from './auth.store'
import { hasRole } from './permissions'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)

  if (status === 'loading') return null
  if (status !== 'authenticated') return <Navigate to="/login" replace />
  return <>{children}</>
}

export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)

  if (status === 'loading') return null
  if (status !== 'authenticated') return <Navigate to="/login" replace />
  if (!hasRole(user, ...roles)) return <Navigate to="/forbidden" replace />
  return <>{children}</>
}
```

- [ ] **Step 8: Chạy, xác nhận XANH**

```bash
npx vitest run src/shared/auth/guards.test.tsx
```

Expected: PASS, 5 test.

- [ ] **Step 9: Viết `src/shared/auth/useSession.ts`**

```ts
import { useEffect } from 'react'
import { getData } from '@/shared/api/http'
import { useAuthStore } from './auth.store'
import type { CurrentUser } from './permissions'

/**
 * Gọi một lần lúc boot. Có token trong localStorage thì hỏi backend xem nó còn sống không.
 * Đây cũng là cách phát hiện token hết hạn mà không cần tự decode `exp` ở client.
 */
export function useSession(): void {
  const token = useAuthStore((s) => s.token)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    if (!token) {
      useAuthStore.setState({ status: 'unauthenticated' })
      return
    }

    let cancelled = false

    getData<CurrentUser>('/auth/me')
      .then((user) => {
        if (!cancelled) setUser(user)
      })
      .catch(() => {
        if (!cancelled) logout()
      })

    return () => {
      cancelled = true
    }
  }, [token, setUser, logout])
}
```

- [ ] **Step 10: Viết `src/features/auth/useLogin.ts`**

```ts
import { useMutation } from '@tanstack/react-query'
import { postData } from '@/shared/api/http'
import type { ApiError } from '@/shared/api/types'
import { useAuthStore } from '@/shared/auth/auth.store'
import type { LoginInput } from './login.schema'

export type LoginResult = {
  accessToken: string
  expireTime: string
}

export function useLogin() {
  const setToken = useAuthStore((s) => s.setToken)

  return useMutation<LoginResult, ApiError, LoginInput>({
    mutationFn: (input) => postData<LoginResult>('/auth/login', input),
    onSuccess: (result) => {
      // Backend cũng trả refreshToken + expireTimeRefreshToken. Ta cố ý KHÔNG lưu:
      // không endpoint nào tiêu thụ chúng, nên cất chỉ tạo rủi ro mà không đổi lấy gì.
      setToken(result.accessToken)
    },
  })
}
```

- [ ] **Step 11: Viết `src/features/auth/LoginPage.tsx`**

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/shared/auth/auth.store'
import { loginSchema, type LoginInput } from './login.schema'
import { useLogin } from './useLogin'

export function LoginPage() {
  const status = useAuthStore((s) => s.status)
  const login = useLogin()

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phonenumber: '', password: '' },
  })

  if (status === 'authenticated') return <Navigate to="/examples" replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Đăng nhập</h1>

        <div className="space-y-2">
          <Label htmlFor="phonenumber">Số điện thoại</Label>
          <Input id="phonenumber" autoComplete="username" {...form.register('phonenumber')} />
          {form.formState.errors.phonenumber && (
            <p className="text-sm text-red-600">{form.formState.errors.phonenumber.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>
          )}
        </div>

        {login.isError && <p className="text-sm text-red-600">{login.error.message}</p>}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 12: Viết `src/app/providers.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { isApiError } from '@/shared/api/http'
import { useSession } from '@/shared/auth/useSession'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Thử lại một request 403 ba lần là vô nghĩa và làm chậm phản hồi lỗi.
      retry: (failureCount, error) => {
        if (isApiError(error) && error.statusCode >= 400 && error.statusCode < 500) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})

function SessionGate({ children }: { children: ReactNode }) {
  useSession()
  return <>{children}</>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionGate>{children}</SessionGate>
      <Toaster richColors />
    </QueryClientProvider>
  )
}
```

- [ ] **Step 13: Viết `src/app/router.tsx`**

`AppShell` và `ExamplesPage` chưa tồn tại — Task 9 và 10 tạo chúng. Tạm thời router chỉ có `/login` và `/forbidden`; Task 9 sẽ thêm nhánh còn lại.

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LoginPage } from '@/features/auth/LoginPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/forbidden',
    element: <div className="p-8">Bạn không đủ quyền truy cập trang này.</div>,
  },
  { path: '/', element: <Navigate to="/examples" replace /> },
])
```

- [ ] **Step 14: Viết `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from '@/app/providers'
import { router } from '@/app/router'
import { setUnauthorizedHandler } from '@/shared/api/http'
import { useAuthStore } from '@/shared/auth/auth.store'
import './index.css'

// Tiêm handler 401 ở đây, không trong http.ts: tránh vòng import http → store → http.
setUnauthorizedHandler(() => {
  useAuthStore.getState().logout()
  window.location.assign('/login')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)
```

- [ ] **Step 15: Kiểm chứng**

```bash
npm run test && npm run typecheck && npm run lint
```

Expected: tất cả sạch, **39 test** pass (cn 3, env 4, http 7, permissions 13, auth.store 3, login.schema 4, guards 5).

- [ ] **Step 16: Kiểm chứng bằng tay — đăng nhập thật**

Backend phải đang chạy. `npm run dev`, mở `http://localhost:5175/login`, đăng nhập `root` / `root`.

Expected: không lỗi CORS trong console; tab Network thấy `POST /api/v1/auth/login` trả 200, rồi `GET /api/v1/auth/me` trả 200 kèm header `Authorization: Bearer ...`. `localStorage` có key `warehouse.accessToken` và **không** có refreshToken.

Trang sẽ điều hướng sang `/examples` và hiện trắng — đúng như dự kiến, Task 10 mới tạo trang đó.

- [ ] **Step 17: Commit**

```bash
git add app/warehouse-ui/src
git commit -m "feat: router, guards, hydrate session, trang đăng nhập"
```

---

### Task 9: App shell

**Files:**
- Create: `src/components/layout/AppShell.tsx`
- Modify: `src/app/router.tsx`

**Interfaces:**
- Consumes: Task 6 (`useAuthStore`), Task 7 (`Button`, `DropdownMenu`), Task 8 (`ProtectedRoute`)
- Produces: `<AppShell />` render `<Outlet/>`; route `/examples` được bọc `ProtectedRoute`

- [ ] **Step 1: Viết `src/components/layout/AppShell.tsx`**

```tsx
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/shared/auth/auth.store'
import { cn } from '@/shared/lib/cn'

const NAV = [{ to: '/examples', label: 'Examples' }]

export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-slate-50 p-4">
        <div className="mb-6 text-lg font-semibold">Warehouse</div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'block rounded px-3 py-2 text-sm hover:bg-slate-200',
                pathname === item.to && 'bg-slate-200 font-medium',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="text-sm text-slate-500">{pathname}</div>
          <div className="flex items-center gap-3">
            <span className="text-sm">
              {user?.userName} <span className="text-slate-400">({user?.roleName})</span>
            </span>
            <Button variant="outline" size="sm" onClick={logout}>
              Đăng xuất
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

Menu hiện chỉ có một mục nên chưa cần lọc theo quyền. Khi thêm mục thứ hai bị giới hạn quyền, lọc `NAV` bằng `hasRole(user, ...)` — **không** bằng `can()`.

- [ ] **Step 2: Nối vào router — thay `src/app/router.tsx`**

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { ExamplesPage } from '@/features/examples/ExamplesPage'
import { ProtectedRoute } from '@/shared/auth/guards'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/forbidden',
    element: <div className="p-8">Bạn không đủ quyền truy cập trang này.</div>,
  },
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
])
```

`ExamplesPage` chưa tồn tại. Tạo file tạm để typecheck qua, Task 10 viết đầy đủ:

`src/features/examples/ExamplesPage.tsx`:
```tsx
export function ExamplesPage() {
  return <div>Examples</div>
}
```

- [ ] **Step 3: Kiểm chứng**

```bash
npm run typecheck && npm run lint && npm run test
```

Expected: sạch.

- [ ] **Step 4: Kiểm chứng bằng tay**

`npm run dev`, đăng nhập `root`/`root`.

Expected: thấy sidebar, topbar hiện `root (SUPER_ADMIN)`. Bấm Đăng xuất → về `/login`, `localStorage` không còn `warehouse.accessToken`.

- [ ] **Step 5: Commit**

```bash
git add app/warehouse-ui/src
git commit -m "feat: app shell với sidebar, topbar, đăng xuất"
```

---

### Task 10: Màn hình mẫu `examples`

**Files:**
- Create: `src/features/examples/api.ts`
- Create: `src/features/examples/hooks.ts`
- Create: `src/features/examples/columns.tsx`
- Create: `src/features/examples/ExampleFormDialog.tsx`
- Create: `src/features/examples/DeleteExampleDialog.tsx`
- Modify: `src/features/examples/ExamplesPage.tsx` (thay file tạm từ Task 9)
- Create: `src/features/examples/ExamplesPage.test.tsx`

**Interfaces:**
- Consumes: Task 5 (`getPaginated`, `postData`, `patchData`, `deleteData`), Task 6 (`hasRole`, `useAuthStore`), Task 7 (`Table`, `Dialog`, `Button`, `Input`, `Label`)
- Produces:
  - `type Example = { id: string; slug: string; name: string; description?: string; createdAt: string; updatedAt: string }`
  - `type ExampleInput = { name: string; description?: string }`
  - `fetchExamples(params: { page: number; size: number }): Promise<Paginated<Example>>`
  - `createExample(input: ExampleInput): Promise<Example>`
  - `updateExample(slug: string, input: ExampleInput): Promise<Example>`
  - `removeExample(slug: string): Promise<string>`
  - `useExamples(page, size)`, `useCreateExample()`, `useUpdateExample()`, `useDeleteExample()`
  - `EXAMPLES_KEY = ['examples'] as const`

**Ràng buộc riêng của task:** không thêm cột sắp xếp, không thêm ô tìm kiếm. Backend khai báo `sort` nhưng `example.service.findAll` hardcode `order: { createdAt: 'DESC' }` và bỏ qua nó; `GetAllExampleRequestDto` không có tham số search. Header bấm-để-sort sẽ gửi param, backend im lặng bỏ qua, và người dùng nghĩ UI hỏng.

- [ ] **Step 1: Viết `src/features/examples/api.ts`**

```ts
import { deleteData, getPaginated, patchData, postData } from '@/shared/api/http'
import type { Paginated } from '@/shared/api/types'

export type Example = {
  id: string
  slug: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

export type ExampleInput = {
  name: string
  description?: string
}

// Tài nguyên định danh bằng `slug`, không phải `id`.
export const fetchExamples = (params: { page: number; size: number }): Promise<Paginated<Example>> =>
  getPaginated<Example>('/examples', params)

export const createExample = (input: ExampleInput): Promise<Example> =>
  postData<Example>('/examples', input)

export const updateExample = (slug: string, input: ExampleInput): Promise<Example> =>
  patchData<Example>(`/examples/${slug}`, input)

export const removeExample = (slug: string): Promise<string> => deleteData<string>(`/examples/${slug}`)
```

- [ ] **Step 2: Viết `src/features/examples/hooks.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ApiError } from '@/shared/api/types'
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

  return useMutation<Example, ApiError, ExampleInput>({
    mutationFn: createExample,
    onSuccess: () => {
      toast.success('Đã tạo example')
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })
}

export function useUpdateExample() {
  const invalidate = useInvalidateExamples()

  return useMutation<Example, ApiError, { slug: string; input: ExampleInput }>({
    mutationFn: ({ slug, input }) => updateExample(slug, input),
    onSuccess: () => {
      toast.success('Đã cập nhật example')
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })
}

export function useDeleteExample() {
  const invalidate = useInvalidateExamples()

  return useMutation<string, ApiError, string>({
    mutationFn: removeExample,
    onSuccess: () => {
      toast.success('Đã xoá example')
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })
}
```

- [ ] **Step 3: Viết `src/features/examples/columns.tsx`**

```tsx
import type { ColumnDef } from '@tanstack/react-table'
import type { Example } from './api'

// Không có cột sắp xếp: backend bỏ qua tham số `sort`. Xem spec, mục "Cố tình KHÔNG có".
export const exampleColumns: ColumnDef<Example>[] = [
  { accessorKey: 'name', header: 'Tên' },
  {
    accessorKey: 'description',
    header: 'Mô tả',
    cell: ({ row }) => row.original.description ?? '—',
  },
  { accessorKey: 'slug', header: 'Slug' },
  {
    accessorKey: 'createdAt',
    header: 'Ngày tạo',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleString('vi-VN'),
  },
]
```

- [ ] **Step 4: Viết `src/features/examples/ExampleFormDialog.tsx`**

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Example, ExampleInput } from './api'

const schema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên'),
  description: z.string().optional(),
})

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  example?: Example
  onSubmit: (input: ExampleInput) => void
  isPending: boolean
}

export function ExampleFormDialog({ open, onOpenChange, example, onSubmit, isPending }: Props) {
  const form = useForm<ExampleInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })

  useEffect(() => {
    form.reset({ name: example?.name ?? '', description: example?.description ?? '' })
  }, [example, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{example ? 'Sửa example' : 'Tạo example'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Tên</Label>
            <Input id="name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Mô tả</Label>
            <Input id="description" {...form.register('description')} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Viết `src/features/examples/DeleteExampleDialog.tsx`**

```tsx
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Example } from './api'

type Props = {
  example: Example | null
  onOpenChange: (open: boolean) => void
  onConfirm: (slug: string) => void
  isPending: boolean
}

export function DeleteExampleDialog({ example, onOpenChange, onConfirm, isPending }: Props) {
  return (
    <Dialog open={example !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xoá example</DialogTitle>
        </DialogHeader>

        <p className="text-sm">
          Xoá <span className="font-medium">{example?.name}</span>? Thao tác này không hoàn tác được.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => example && onConfirm(example.slug)}
          >
            {isPending ? 'Đang xoá...' : 'Xoá'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: Viết test đỏ — `src/features/examples/ExamplesPage.test.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { useAuthStore } from '@/shared/auth/auth.store'
import { ExamplesPage } from '@/features/examples/ExamplesPage'

const BASE = 'http://localhost:8085/api/v1'

const example = {
  id: '1',
  slug: 'example-a',
  name: 'Example A',
  description: 'mô tả',
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ExamplesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    mswHttp.get(`${BASE}/examples`, () =>
      HttpResponse.json({
        message: 'ok',
        statusCode: 200,
        timestamp: '',
        result: {
          items: [example],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          hasNext: false,
          hasPrevios: false,
        },
      }),
    ),
  )
})

describe('ExamplesPage', () => {
  it('hiện dữ liệu trả về từ API', async () => {
    useAuthStore.setState({
      token: 't',
      user: { userId: 'u', userName: 'root', roleName: 'SUPER_ADMIN', scope: '[]' },
      status: 'authenticated',
    })

    renderPage()
    expect(await screen.findByText('Example A')).toBeInTheDocument()
  })

  it('SUPER_ADMIN thấy nút Tạo', async () => {
    useAuthStore.setState({
      token: 't',
      user: { userId: 'u', userName: 'root', roleName: 'SUPER_ADMIN', scope: '[]' },
      status: 'authenticated',
    })

    renderPage()
    await screen.findByText('Example A')
    expect(screen.getByRole('button', { name: /tạo example/i })).toBeInTheDocument()
  })

  it('CUSTOMER KHÔNG thấy nút Tạo', async () => {
    useAuthStore.setState({
      token: 't',
      user: { userId: 'u', userName: 'khach', roleName: 'CUSTOMER', scope: '[]' },
      status: 'authenticated',
    })

    renderPage()
    await screen.findByText('Example A')
    expect(screen.queryByRole('button', { name: /tạo example/i })).not.toBeInTheDocument()
  })

  it('nút Trang trước bị vô hiệu ở trang đầu (hasPrevious=false)', async () => {
    useAuthStore.setState({
      token: 't',
      user: { userId: 'u', userName: 'root', roleName: 'SUPER_ADMIN', scope: '[]' },
      status: 'authenticated',
    })

    renderPage()
    await screen.findByText('Example A')
    expect(screen.getByRole('button', { name: /trang trước/i })).toBeDisabled()
  })
})
```

Test cuối là mắt xích khép kín: nó bắt đầu từ `hasPrevios` trong response giả, đi qua `getPaginated`, và kết thúc ở trạng thái `disabled` của một cái nút. Nếu ai đó sửa `http.ts` làm rơi phép đổi tên, test này đỏ.

- [ ] **Step 7: Chạy, xác nhận ĐỎ**

```bash
npx vitest run src/features/examples/ExamplesPage.test.tsx
```

Expected: FAIL — `ExamplesPage` hiện chỉ render `<div>Examples</div>`, không có nút, không có dữ liệu.

- [ ] **Step 8: Viết `src/features/examples/ExamplesPage.tsx`**

```tsx
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuthStore } from '@/shared/auth/auth.store'
import { hasRole } from '@/shared/auth/permissions'
import type { Example } from './api'
import { exampleColumns } from './columns'
import { DeleteExampleDialog } from './DeleteExampleDialog'
import { ExampleFormDialog } from './ExampleFormDialog'
import { useCreateExample, useDeleteExample, useExamples, useUpdateExample } from './hooks'

const PAGE_SIZE = 10

export function ExamplesPage() {
  const user = useAuthStore((s) => s.user)
  // Gác bằng hasRole, KHÔNG bằng can(): backend chặn bằng @HasRoles(Admin, SuperAdmin),
  // và can() luôn trả false vì không authority nào được seed.
  const canWrite = hasRole(user, 'ADMIN', 'SUPER_ADMIN')

  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Example | undefined>(undefined)
  const [deleting, setDeleting] = useState<Example | null>(null)

  const { data, isPending, isError, error } = useExamples(page, PAGE_SIZE)
  const create = useCreateExample()
  const update = useUpdateExample()
  const remove = useDeleteExample()

  const columns = useMemo<ColumnDef<Example>[]>(() => {
    if (!canWrite) return exampleColumns

    const actionsColumn: ColumnDef<Example> = {
      id: 'actions',
      header: 'Thao tác',
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
            Sửa
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleting(row.original)}>
            Xoá
          </Button>
        </div>
      ),
    }

    return [...exampleColumns, actionsColumn]
  }, [canWrite])

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isError) return <p className="text-red-600">{error.message}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Examples</h1>
        {canWrite && (
          <Button
            onClick={() => {
              setEditing(undefined)
              setFormOpen(true)
            }}
          >
            Tạo example
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={columns.length}>Đang tải...</TableCell>
              </TableRow>
            )}

            {!isPending && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length}>Chưa có dữ liệu.</TableCell>
              </TableRow>
            )}

            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.original.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-slate-500">
          Trang {data?.page ?? page} / {data?.totalPages ?? 1} — {data?.total ?? 0} bản ghi
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.hasPrevious}
          onClick={() => setPage((p) => p - 1)}
        >
          Trang trước
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          Trang sau
        </Button>
      </div>

      <ExampleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        example={editing}
        isPending={create.isPending || update.isPending}
        onSubmit={(input) => {
          const onSuccess = () => setFormOpen(false)
          if (editing) update.mutate({ slug: editing.slug, input }, { onSuccess })
          else create.mutate(input, { onSuccess })
        }}
      />

      <DeleteExampleDialog
        example={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        isPending={remove.isPending}
        onConfirm={(slug) => remove.mutate(slug, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  )
}
```

Dùng `mutate` với callback `onSuccess`, **không** dùng `mutateAsync`. `mutateAsync` trả về promise reject khi lỗi, buộc ta phải `.catch` — và một `.catch(() => {})` trần là chỗ lỗi đi vào để chết. Ở đây dialog chỉ đóng khi thành công; khi lỗi, `onError` của mutation đã hiện toast và dialog ở nguyên để người dùng sửa rồi thử lại.

- [ ] **Step 9: Chạy, xác nhận XANH**

```bash
npx vitest run src/features/examples/
```

Expected: PASS, 4 test.

- [ ] **Step 10: Toàn bộ test + lint + typecheck**

```bash
npm run test && npm run typecheck && npm run lint
```

Expected: sạch, **43 test** pass (39 từ Task 8, cộng 4 của `ExamplesPage`).

- [ ] **Step 11: Commit**

```bash
git add app/warehouse-ui/src
git commit -m "feat: màn hình examples — bảng phân trang, CRUD, gác quyền bằng role"
```

---

### Task 11: Kiểm chứng end-to-end và tài liệu

**Files:**
- Create: `app/warehouse-ui/README.md`

**Interfaces:**
- Consumes: tất cả các task trước
- Produces: 6 tiêu chí nghiệm thu của spec đều được quan sát bằng mắt

Task này không có code mới. Nó tồn tại vì "test xanh" và "app chạy đúng" là hai chuyện khác nhau, và spec định nghĩa nghiệm thu bằng cái thứ hai.

- [ ] **Step 1: Chuẩn bị hai tài khoản**

Backend đang chạy. Tạo tài khoản `CUSTOMER` để kiểm chứng nhánh không quyền:

```bash
curl -X POST http://localhost:8085/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"phonenumber":"0900000001","password":"customer123"}'
```

Expected: HTTP 201, body có `"result":"OK"`.

- [ ] **Step 2: Tiêu chí 1 — login và hydrate**

`npm run dev`, vào `http://localhost:5175`, đăng nhập `root` / `root`.

Expected: vào app shell. Topbar hiện `root (SUPER_ADMIN)`. Network có `GET /api/v1/auth/me` trả 200.

- [ ] **Step 3: Tiêu chí 2 — phân trang server-side**

Tạo ít nhất 11 example (dùng nút Tạo, hoặc `curl` với Bearer token lấy từ `localStorage`) rồi bấm "Trang sau".

Expected: Network hiện request tới `/api/v1/examples?page=2&size=10`. Chú ý là **`size`**, không phải `pageSize`. Nút "Trang trước" chuyển từ mờ sang bấm được.

- [ ] **Step 4: Tiêu chí 3 — write path với quyền**

Bấm "Tạo example", nhập tên, lưu.

Expected: toast "Đã tạo example"; bảng tự refresh và hiện bản ghi mới mà không cần F5.

- [ ] **Step 5: Tiêu chí 4 — nhánh không quyền**

Đăng xuất, đăng nhập `0900000001` / `customer123`.

Expected: bảng vẫn load (vì `GET /examples` là `@Public()`), nhưng **không** thấy nút "Tạo example", không thấy cột "Thao tác".

Rồi gọi API trực tiếp bằng token của `CUSTOMER` để xác nhận backend mới là nơi chặn thật:

```bash
curl -i -X POST http://localhost:8085/api/v1/examples \
  -H "Authorization: Bearer <token-của-customer-lấy-từ-localStorage>" \
  -H 'Content-Type: application/json' -d '{"name":"lén"}'
```

Expected: HTTP 403. Đây là bằng chứng "ẩn nút không phải là bảo mật" — UI chỉ tránh cho người dùng bấm vào thứ chắc chắn bị từ chối.

- [ ] **Step 6: Tiêu chí 5 — token hỏng thì bị đá ra**

Trong DevTools Console: `localStorage.setItem('warehouse.accessToken','rác')` rồi F5.

Expected: `GET /auth/me` trả 401, app tự điều hướng về `/login`, và `warehouse.accessToken` đã bị xoá khỏi `localStorage`.

- [ ] **Step 7: Tiêu chí 6 — cổng chất lượng**

```bash
npm run lint && npm run typecheck && npm run test
```

Expected: cả ba sạch.

- [ ] **Step 8: Viết `app/warehouse-ui/README.md`**

```markdown
# warehouse-ui

Giao diện quản lý kho. SPA Vite + React + TypeScript, nói chuyện với `warehouse-api`.

## Chạy lần đầu

Backend phải chạy trước, và **migration phải đã chạy** (nếu không, tài khoản `root` không tồn tại
và mọi lần login trả 401 trông y hệt sai mật khẩu):

```bash
cd ../warehouse-api && npm install && cp .env.example .env && npm run typeorm:r && npm run dev
```

Rồi:

```bash
nvm use
npm install
cp .env.example .env
npm run gen:api     # cần backend đang chạy ở :8085
npm run dev         # → http://localhost:5175
```

Đăng nhập: `root` / `root`.

## Scripts

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server ở cổng 5175 (cố định — backend CORS chỉ cho origin này) |
| `npm run gen:api` | Sinh lại `src/shared/api/generated.ts` từ `/swagger.json` |
| `npm run test` | Vitest |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` | Prettier |

## Những chỗ cần biết trước khi sửa

- **`src/shared/api/http.ts`** cô lập mọi điểm lệch của backend: envelope `{result}`, typo
  `hasPrevios` → `hasPrevious`, và bất đối xứng `size` (request) vs `pageSize` (response).
  Đừng bypass nó bằng cách gọi `axios` trực tiếp.
- **`can()` luôn trả `false`.** Backend chưa seed authority/permission nào. Dùng `hasRole()`
  để gác quyền. `can()` chỉ nằm sẵn chờ backend có `@HasAuthority`.
- **Không lưu `refreshToken`.** Backend phát ra nó nhưng không endpoint nào tiêu thụ.
- **Bảng `examples` không có sort và search** vì backend không hỗ trợ. Xem
  `docs/superpowers/specs/2026-07-09-warehouse-ui-foundation-design.md`, mục "Nợ backend".
- **`features/*` không được import lẫn nhau.** Thứ dùng chung phải leo lên `shared/`.
```

- [ ] **Step 9: Commit**

```bash
git add app/warehouse-ui/README.md
git commit -m "docs: README cho warehouse-ui"
```

---

## Sau khi hoàn thành

Nền tảng sẵn sàng để đắp module nghiệp vụ. Khi backend có `product` / `stock` / `inventory`:

1. Chạy lại `npm run gen:api`.
2. Tạo `src/features/<module>/` theo đúng bộ file của `examples`: `api.ts`, `hooks.ts`, `columns.tsx`, `<X>Page.tsx`, dialogs.
3. Thêm route vào `src/app/router.tsx` và mục menu vào `NAV` của `AppShell`.
4. Nếu route bị giới hạn quyền, bọc `RequireRole` và lọc `NAV` bằng `hasRole` — **không** bằng `can()` cho tới khi backend seed authority.

10 khoản nợ backend nằm ở cuối file spec. Khoản đáng làm trước nhất là `POST /auth/refresh`: hiện người dùng bị đá ra sau đúng một tiếng, không có cách nào gia hạn.
