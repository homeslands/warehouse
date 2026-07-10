# errorElement và Route 404 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một lỗi render bất kỳ, hoặc một URL không tồn tại, không còn cho ra màn hình trắng.

**Architecture:** Một route gốc pathless mang `errorElement: <ErrorPage/>` bọc toàn bộ cây route hiện có, cộng một route catch-all `*` trỏ tới `NotFoundPage`. Ba trang lỗi (`ErrorPage`, `NotFoundPage`, `ForbiddenPage`) đứng riêng ngoài `AppShell` và ngoài `ProtectedRoute`, dùng chung một component layout `CenteredMessage`. Chuỗi của chúng nằm trong một namespace i18n mới tên `error`.

**Tech Stack:** React 19, Vite 8, Vitest 4, Testing Library, react-router-dom v7, Tailwind 4, shadcn/ui, i18next.

**Spec:** `docs/superpowers/specs/2026-07-10-warehouse-ui-error-boundary-404-design.md`

## Global Constraints

- **Node 24** (`.nvmrc`). Node 18 làm vitest chết ngay lúc khởi động với `SyntaxError: ... 'node:util' does not provide an export named 'styleText'`. Chạy `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` trước mọi lệnh npm.
- Mọi lệnh npm chạy trong `app/warehouse-ui`.
- **`as never` / `as any` bị CẤM.** Nếu `tsc` kêu, sửa kiểu, đừng ép kiểu.
- Namespace i18n mới tên **`error`** (số ít). **Không** nhập vào `errors` (số nhiều) — namespace đó giữ 26 mã lỗi backend do `src/shared/api/error-codes.ts` tra vào.
- Test assert theo `i18n.t('error:...')`, **không** theo câu tiếng Việt nguyên văn. Sửa bản dịch không được phép làm đỏ unit test.
- Màu phải dùng token theme (`bg-background`, `text-muted-foreground`, `text-destructive`), **không** màu cứng (`bg-slate-50`, `text-red-600`). Màu cứng không đổi theo dark mode.
- Không sửa `app/warehouse-api`, `src/components/ui/sonner.tsx`, `src/index.css`.
- Không đặt tiền tố `use*` cho hàm không phải React hook.
- TDD: viết test đỏ trước, chạy cho thấy đỏ, rồi mới viết code.
- Commit sau mỗi task.
- Baseline: **62 test pass, 14 file**.

## Bối cảnh sẵn có

- `src/shared/i18n/index.ts` export default `i18n` (đã init), named `resources`, `defaultNS`, `SUPPORTED_LANGUAGES`, type `SupportedLanguage`. Type-safe key bật qua `src/shared/i18n/i18next.d.ts` (`resources: (typeof resources)['vi']`).
- `src/test/setup.ts` ghim `await i18n.changeLanguage('vi')` và mock `window.matchMedia`.
- `src/shared/auth/guards.test.tsx` tự dựng `MemoryRouter` riêng, **không** import `router.tsx` — nên việc đổi cây route không làm nó đỏ.
- `src/components/ui/button.tsx` có sẵn một lint warning `react-refresh/only-export-components`. Không phải lỗi của bạn.
- Mỗi lần chạy test in một cảnh báo deprecation của `vite-tsconfig-paths`. Có sẵn từ trước.

---

## File Structure

**Tạo mới**

| File | Trách nhiệm |
|---|---|
| `src/shared/i18n/locales/vi/error.json` | Chuỗi ba trang lỗi, tiếng Việt |
| `src/shared/i18n/locales/en/error.json` | Bản tiếng Anh |
| `src/components/layout/CenteredMessage.tsx` | Layout căn giữa dùng chung, không sidebar |
| `src/components/layout/CenteredMessage.test.tsx` | Test cho layout đó |
| `src/features/error/ErrorPage.tsx` | `errorElement` — dùng `useRouteError()` |
| `src/features/error/NotFoundPage.tsx` | Route `*` |
| `src/features/error/ForbiddenPage.tsx` | Route `/forbidden` |
| `src/features/error/ErrorPage.test.tsx` | Component ném lỗi → ErrorPage, không màn hình trắng |
| `src/features/error/NotFoundPage.test.tsx` | URL không tồn tại → NotFoundPage |

**Sửa**

| File | Thay đổi |
|---|---|
| `src/shared/i18n/index.ts` | Import + đăng ký namespace `error` |
| `src/shared/i18n/i18n.test.ts` | Suy danh sách namespace từ `resources.vi` |
| `src/app/router.tsx` | Export `routes`; route gốc + `errorElement`; route `*`; `ForbiddenPage` |

---

## Task 1: Namespace i18n `error`, và bịt lỗ trong test key-parity

Làm trước vì hai task sau đều tra khoá từ namespace này.

**Files:**
- Create: `src/shared/i18n/locales/vi/error.json`
- Create: `src/shared/i18n/locales/en/error.json`
- Modify: `src/shared/i18n/index.ts`
- Modify: `src/shared/i18n/i18n.test.ts:21`

**Interfaces:**
- Consumes: `resources` từ `src/shared/i18n/index.ts`.
- Produces: namespace `error` với các khoá `title`, `description`, `reload`, `goHome`, `notFoundTitle`, `notFoundDescription`, `forbiddenTitle`, `forbiddenDescription`, `detailsHeading`. Task 2 và 3 gọi `t('error:<key>')`.

- [ ] **Step 1: Sửa test key-parity để nó suy danh sách namespace từ nguồn**

`src/shared/i18n/i18n.test.ts:21` đang hard-code:

```ts
const namespaces = ['common', 'auth', 'examples', 'errors'] as const
```

Thêm namespace mới mà quên sửa dòng này thì namespace mới **không được canh** — test tự bỏ sót chính mình. Thay bằng:

```ts
const namespaces = Object.keys(resources.vi) as (keyof typeof resources.vi)[]
```

Không đụng gì khác trong file.

- [ ] **Step 2: Chạy test, xác nhận vẫn XANH**

Run: `npm test -- src/shared/i18n/i18n.test.ts`
Expected: PASS, 5 test. Chưa có namespace `error` nên `Object.keys(resources.vi)` vẫn ra đúng 4 namespace cũ. Đây là refactor không đổi hành vi.

- [ ] **Step 3: Viết `src/shared/i18n/locales/vi/error.json`**

```json
{
  "title": "Đã có lỗi xảy ra",
  "description": "Ứng dụng gặp sự cố ngoài dự kiến. Thử tải lại trang, hoặc quay về trang chủ.",
  "reload": "Tải lại",
  "goHome": "Về trang chủ",
  "detailsHeading": "Chi tiết kỹ thuật (chỉ hiện khi phát triển)",
  "notFoundTitle": "Không tìm thấy trang",
  "notFoundDescription": "Địa chỉ bạn vừa mở không tồn tại.",
  "forbiddenTitle": "Không đủ quyền",
  "forbiddenDescription": "Bạn không đủ quyền truy cập trang này."
}
```

- [ ] **Step 4: Viết `src/shared/i18n/locales/en/error.json`**

Phải có **đúng cùng tập khoá**, nếu không test key-parity sẽ đỏ.

```json
{
  "title": "Something went wrong",
  "description": "The application hit an unexpected error. Try reloading the page, or go back home.",
  "reload": "Reload",
  "goHome": "Go home",
  "detailsHeading": "Technical details (development only)",
  "notFoundTitle": "Page not found",
  "notFoundDescription": "The address you opened does not exist.",
  "forbiddenTitle": "Not allowed",
  "forbiddenDescription": "You do not have permission to view this page."
}
```

- [ ] **Step 5: Đăng ký namespace trong `src/shared/i18n/index.ts`**

Ba chỗ phải sửa. Thiếu một chỗ là hỏng.

Thêm hai dòng import, cạnh các import locale khác:

```ts
import viError from './locales/vi/error.json'
import enError from './locales/en/error.json'
```

Thêm vào `resources`:

```ts
export const resources = {
  vi: { common: viCommon, auth: viAuth, examples: viExamples, errors: viErrors, error: viError },
  en: { common: enCommon, auth: enAuth, examples: enExamples, errors: enErrors, error: enError },
} as const
```

Thêm vào mảng `ns` trong `.init({...})`:

```ts
    ns: ['common', 'auth', 'examples', 'errors', 'error'],
```

- [ ] **Step 6: Chạy test, xác nhận key-parity đã canh namespace mới**

Run: `npm test -- src/shared/i18n/i18n.test.ts`
Expected: PASS, **6 test** (parity chạy `it.each` trên 5 namespace + 1 test `syncHtmlLang`).

Số test tăng từ 5 lên 6 chính là bằng chứng Step 1 có tác dụng: danh sách namespace đã tự mở rộng.

- [ ] **Step 7: Chứng minh test key-parity không xanh rỗng**

Xoá tạm một khoá khỏi `src/shared/i18n/locales/en/error.json` (ví dụ `"goHome"`), chạy lại:

Run: `npm test -- src/shared/i18n/i18n.test.ts`
Expected: FAIL, đúng test `namespace "error"`, với thông báo `namespace "error" lệch khoá giữa vi và en`.

Khôi phục khoá vừa xoá, chạy lại, xác nhận XANH trở lại. Dán cả output đỏ lẫn output xanh vào report.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: sạch. `i18next.d.ts` suy type từ `resources`, nên namespace mới tự có type mà không phải sửa gì.

- [ ] **Step 9: Chạy full suite**

Run: `npm test`
Expected: PASS, **63 test** (62 + 1 test parity mới của namespace `error`).

- [ ] **Step 10: Commit**

```bash
git add app/warehouse-ui/src/shared/i18n
git commit -m "feat: namespace i18n \`error\`; test key-parity tự suy danh sách namespace"
```

---

## Task 2: `CenteredMessage` và ba trang lỗi

**Files:**
- Create: `src/components/layout/CenteredMessage.tsx`
- Create: `src/components/layout/CenteredMessage.test.tsx`
- Create: `src/features/error/ErrorPage.tsx`
- Create: `src/features/error/NotFoundPage.tsx`
- Create: `src/features/error/ForbiddenPage.tsx`

**Interfaces:**
- Consumes: namespace `error` (Task 1); `Button` từ `@/components/ui/button`.
- Produces:
  - `CenteredMessage({ title, description, children }: { title: string; description: string; children?: ReactNode })`
  - `ErrorPage()`, `NotFoundPage()`, `ForbiddenPage()` — không nhận prop. Task 3 gắn chúng vào cây route.

- [ ] **Step 1: Viết test đỏ — `src/components/layout/CenteredMessage.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CenteredMessage } from '@/components/layout/CenteredMessage'

describe('CenteredMessage', () => {
  it('hiện tiêu đề, mô tả, và phần children', () => {
    render(
      <CenteredMessage title="Tiêu đề" description="Mô tả">
        <button type="button">Nút</button>
      </CenteredMessage>,
    )

    expect(screen.getByRole('heading', { name: 'Tiêu đề' })).toBeInTheDocument()
    expect(screen.getByText('Mô tả')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nút' })).toBeInTheDocument()
  })

  it('không có children thì vẫn render được', () => {
    render(<CenteredMessage title="Chỉ tiêu đề" description="Chỉ mô tả" />)

    expect(screen.getByRole('heading', { name: 'Chỉ tiêu đề' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `npm test -- src/components/layout/CenteredMessage.test.tsx`
Expected: FAIL với `Failed to resolve import "@/components/layout/CenteredMessage"`.

- [ ] **Step 3: Viết `src/components/layout/CenteredMessage.tsx`**

```tsx
import type { ReactNode } from 'react'

type Props = {
  title: string
  description: string
  children?: ReactNode
}

/**
 * Khung dùng chung cho ErrorPage / NotFoundPage / ForbiddenPage.
 * Đứng riêng, KHÔNG có sidebar: ErrorPage phải render được cả khi AppShell chính là thứ vừa ném lỗi.
 */
export function CenteredMessage({ title, description, children }: Props) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `npm test -- src/components/layout/CenteredMessage.test.tsx`
Expected: PASS, 2 test.

- [ ] **Step 5: Viết `src/features/error/NotFoundPage.tsx`**

`useTranslation` phải nhận **mảng** namespace (`['error']`), không phải chuỗi. Với chuỗi trần, khoá có tiền tố `error:` không typecheck — đây là quy ước sẵn có của codebase, xem `src/features/examples/hooks.ts:31`.

`Button` hỗ trợ `asChild` (nó dùng `Slot.Root` của radix, xem `src/components/ui/button.tsx:54`), nên bọc `<Link>` bên trong là hợp lệ và giữ được ngữ nghĩa link cho screen reader.

```tsx
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CenteredMessage } from '@/components/layout/CenteredMessage'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation(['error'])

  return (
    <CenteredMessage
      title={t('error:notFoundTitle')}
      description={t('error:notFoundDescription')}
    >
      <Button asChild variant="outline">
        <Link to="/">{t('error:goHome')}</Link>
      </Button>
    </CenteredMessage>
  )
}
```

- [ ] **Step 6: Viết `src/features/error/ForbiddenPage.tsx`**

Thay cho `<div>` nội tuyến hard-code tiếng Việt hiện nằm trong `src/app/router.tsx:11`.

```tsx
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CenteredMessage } from '@/components/layout/CenteredMessage'
import { Button } from '@/components/ui/button'

export function ForbiddenPage() {
  const { t } = useTranslation(['error'])

  return (
    <CenteredMessage
      title={t('error:forbiddenTitle')}
      description={t('error:forbiddenDescription')}
    >
      <Button asChild variant="outline">
        <Link to="/">{t('error:goHome')}</Link>
      </Button>
    </CenteredMessage>
  )
}
```

- [ ] **Step 7: Viết `src/features/error/ErrorPage.tsx`**

`useRouteError()` trả `unknown`. **Không** ép kiểu — thu hẹp bằng `instanceof`.

```tsx
import { useTranslation } from 'react-i18next'
import { Link, useRouteError } from 'react-router-dom'
import { CenteredMessage } from '@/components/layout/CenteredMessage'
import { Button } from '@/components/ui/button'

/** Đọc message/stack mà không ép kiểu: useRouteError() trả về `unknown`. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}

/**
 * Giữ component này CÀNG ĐƠN GIẢN CÀNG TỐT: không gọi API, không đọc store, không logic điều kiện
 * ngoài cờ import.meta.env.DEV. Nếu ErrorPage tự ném lỗi thì không còn lưới nào bên dưới nó.
 */
export function ErrorPage() {
  const error = useRouteError()
  const { t } = useTranslation(['error'])

  return (
    <CenteredMessage title={t('error:title')} description={t('error:description')}>
      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('error:reload')}
        </Button>
        <Button asChild>
          <Link to="/">{t('error:goHome')}</Link>
        </Button>
      </div>

      {import.meta.env.DEV && (
        <details className="text-left">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            {t('error:detailsHeading')}
          </summary>
          <pre className="bg-muted mt-2 overflow-x-auto rounded p-3 text-left text-xs">
            {describeError(error)}
          </pre>
        </details>
      )}
    </CenteredMessage>
  )
}
```

`import.meta.env.DEV` được Vite thay bằng hằng lúc build, nên khối `<details>` bị loại khỏi bundle production.

- [ ] **Step 8: Typecheck và lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck sạch; lint 0 error (warning sẵn có ở `button.tsx` vẫn còn).

Nếu `tsc` kêu ở `t('error:notFoundTitle')`, kiểm tra Task 1 Step 5 đã thêm `error` vào **cả ba** chỗ trong `i18n/index.ts` chưa. **Đừng** dùng `as never` để làm nó im.

- [ ] **Step 9: Chạy full suite**

Run: `npm test`
Expected: PASS, **65 test** (63 + 2 test của `CenteredMessage`).

- [ ] **Step 10: Commit**

```bash
git add app/warehouse-ui/src/components/layout/CenteredMessage.tsx \
        app/warehouse-ui/src/components/layout/CenteredMessage.test.tsx \
        app/warehouse-ui/src/features/error
git commit -m "feat: CenteredMessage và ba trang lỗi (Error, NotFound, Forbidden)"
```

---

## Task 3: Gắn vào cây route, và chứng minh màn hình trắng đã hết

**Files:**
- Modify: `src/app/router.tsx`
- Create: `src/features/error/NotFoundPage.test.tsx`
- Create: `src/features/error/ErrorPage.test.tsx`

**Interfaces:**
- Consumes: `ErrorPage`, `NotFoundPage`, `ForbiddenPage` (Task 2).
- Produces: `src/app/router.tsx` export **hai** thứ:
  - `export const routes: RouteObject[]` — cây route thuần, để test dựng `createMemoryRouter(routes, ...)`
  - `export const router = createBrowserRouter(routes)` — cái `main.tsx` đang dùng

  Tách `routes` ra là bắt buộc: không tách thì không test được cây route thật, vì `createBrowserRouter` gắn vào `window.history`.

- [ ] **Step 1: Viết test đỏ — `src/features/error/NotFoundPage.test.tsx`**

Test này dùng **cây route thật**, nên nó khẳng định route `*` thực sự nằm đúng chỗ.

```tsx
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { routes } from '@/app/router'
import { useAuthStore } from '@/shared/auth/auth.store'

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ token: null, user: null, status: 'unauthenticated' })
})

describe('route catch-all', () => {
  it('URL không tồn tại hiện NotFoundPage, kể cả khi chưa đăng nhập', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/khong-ton-tai'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText(i18n.t('error:notFoundTitle'))).toBeInTheDocument()
  })
})
```

Chưa đăng nhập vẫn thấy 404 — nếu route `*` bị đặt nhầm dưới `ProtectedRoute`, test này đỏ vì bị đá sang `/login`. Đó chính là điều nó canh.

- [ ] **Step 2: Viết test đỏ — `src/features/error/ErrorPage.test.tsx`**

**Đây là test quan trọng nhất của cả plan.** Nó chứng minh màn hình trắng đã hết.

Dùng cây route tổng hợp (một component ném lỗi), không dùng `routes` thật — ta đang test bản thân `ErrorPage`, không test cây route.

```tsx
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { ErrorPage } from '@/features/error/ErrorPage'

function Boom(): never {
  throw new Error('nổ lúc render')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorPage', () => {
  it('component ném lỗi lúc render thì hiện ErrorPage, không phải màn hình trắng', async () => {
    // React log lỗi ra console.error khi một component ném. Im nó để output test sạch.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const router = createMemoryRouter(
      [{ path: '/', element: <Boom />, errorElement: <ErrorPage /> }],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)

    expect(await screen.findByText(i18n.t('error:title'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: i18n.t('error:goHome') })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Chạy hai test, ghi lại chính xác cái nào đỏ**

Run: `npm test -- src/features/error`

Expected — và hai test này KHÁC nhau, đừng trông đợi cả hai cùng đỏ:

- `NotFoundPage.test.tsx` → **FAIL**, `Failed to resolve import ... routes` (hoặc `routes` is not exported). Nó import `routes` từ `@/app/router`, thứ chưa tồn tại. Đây là test đỏ thật sự của task này.
- `ErrorPage.test.tsx` → **PASS ngay**. Nó tự dựng cây route tổng hợp và `ErrorPage` đã có từ Task 2, nên nó không phụ thuộc `router.tsx` chút nào.

Việc `ErrorPage.test.tsx` xanh ngay **không** có nghĩa nó vô dụng: nó khẳng định `errorElement` thực sự bắt được lỗi render, và Step 6 sẽ chứng minh nó không xanh rỗng. Nhưng nó không canh được việc `router.tsx` có gắn `errorElement` hay không — cái đó `NotFoundPage.test.tsx` cũng không canh.

**Đây là một lỗ hổng thật, và bạn phải bịt nó.** Thêm test sau vào cuối `src/features/error/NotFoundPage.test.tsx`, khẳng định cây route thật có mang `errorElement`:

```tsx
import { routes } from '@/app/router'

it('route gốc mang errorElement, nên lỗi render không cho ra màn hình trắng', () => {
  expect(routes).toHaveLength(1)
  expect(routes[0].errorElement).toBeDefined()
})
```

Nó đỏ cùng lý do với test kia (chưa export `routes`), và sau Step 4 thì xanh. Không có nó, ai đó gỡ `errorElement` khỏi `router.tsx` mà toàn bộ suite vẫn xanh.

Ghi vào report: test nào đỏ, test nào xanh ngay, và vì sao.

- [ ] **Step 4: Viết lại `src/app/router.tsx`**

```tsx
import { Outlet, createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { ErrorPage } from '@/features/error/ErrorPage'
import { ForbiddenPage } from '@/features/error/ForbiddenPage'
import { NotFoundPage } from '@/features/error/NotFoundPage'
import { ExamplesPage } from '@/features/examples/ExamplesPage'
import { ProtectedRoute } from '@/shared/auth/guards'

/**
 * Tách khỏi `router` để test dựng được `createMemoryRouter(routes, ...)`.
 * `createBrowserRouter` gắn vào window.history nên không dùng lại được trong test.
 */
export const routes: RouteObject[] = [
  {
    // Route gốc pathless: `errorElement` ở đây bắt lỗi render của TOÀN BỘ cây con.
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
      // Phải là con CUỐI của route gốc, KHÔNG phải con của nhánh ProtectedRoute:
      // nằm trong đó thì người chưa đăng nhập gõ sai URL sẽ bị đá sang /login thay vì thấy 404.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
```

`main.tsx` không phải sửa: nó vẫn import `{ router }`.

- [ ] **Step 5: Chạy hai test, xác nhận XANH**

Run: `npm test -- src/features/error`
Expected: PASS, 3 test (2 của NotFoundPage.test.tsx + 1 của ErrorPage.test.tsx).

- [ ] **Step 6: Chứng minh `ErrorPage.test.tsx` không xanh rỗng**

Sửa tạm `Boom` thành component không ném:

```tsx
function Boom() {
  return <div>không nổ</div>
}
```

Run: `npm test -- src/features/error/ErrorPage.test.tsx`
Expected: FAIL — không tìm thấy `error:title`, vì `ErrorPage` không được render.

Khôi phục `Boom` về bản ném lỗi, chạy lại, xác nhận XANH. Dán cả hai output vào report.

- [ ] **Step 7: Chạy full suite — chỗ dễ vỡ nhất**

Run: `npm test`
Expected: PASS, **68 test** (65 + 3).

`src/shared/auth/guards.test.tsx` phải vẫn xanh: nó tự dựng `MemoryRouter` riêng và không import `router.tsx`. Nếu nó đỏ, bạn đã đổi thứ gì đó ngoài phạm vi — điều tra, đừng sửa test.

- [ ] **Step 8: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: typecheck sạch; lint 0 error; build thành công (cảnh báo chunk > 500 kB là có sẵn từ trước).

- [ ] **Step 9: Commit**

```bash
git add app/warehouse-ui/src/app/router.tsx app/warehouse-ui/src/features/error
git commit -m "feat: errorElement trên route gốc và route 404; hết màn hình trắng"
```

---

## Kiểm chứng thủ công (cần người, không cần backend)

Ba điểm này không cần backend chạy, chỉ cần trình duyệt. Người vận hành tự làm sau khi merge:

```bash
cd app/warehouse-ui && nvm use && npm run dev
```

1. Mở `http://localhost:5175/khong-ton-tai` → thấy "Không tìm thấy trang" và nút "Về trang chủ". Không bị đá sang `/login`.
2. Mở `http://localhost:5175/forbidden` → thấy "Không đủ quyền", không phải `<div>` trần.
3. Đổi ngôn ngữ sang English rồi lặp lại bước 1 → chuỗi đổi theo.

Kiểm chứng `ErrorPage` trong trình duyệt cần cố tình làm vỡ một component; test tự động ở Task 3 đã phủ, không cần làm tay.

---

## Ngoài phạm vi — ghi lại để không quên

1. `ErrorBoundary` React bọc `Providers` ở `main.tsx`. Spec giải thích vì sao chưa cần.
2. Gửi lỗi lên dịch vụ giám sát (Sentry và tương tự).
3. `errorElement` **không** bắt lỗi trong event handler và code bất đồng bộ — giới hạn của React error boundary, không phải của react-router.
4. Lazy-load route, route manifest.
5. CI.
6. `npm run gen:api` để sinh `src/shared/api/generated.ts`.
