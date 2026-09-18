import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import type { ReactElement, ReactNode } from 'react'
import {
  MemoryRouter,
  RouterProvider,
  createMemoryRouter,
  type RouteObject,
} from 'react-router-dom'

/**
 * Cùng hình dạng với `CurrentUser` của `entities/session`. `shared` không được import `entities`,
 * nên khai lại ở đây; TypeScript so theo cấu trúc nên truyền `CurrentUser` vào vẫn hợp lệ.
 */
export type TestUser = { userId: string; userName: string; roleName: string; scope: string }

/** `'none'` = chưa đăng nhập. Không đụng `endReason` để test màn login tự đặt lý do trước khi render. */
export type TestAuth = 'admin' | 'customer' | 'none' | TestUser

const TEST_USERS = {
  admin: { userId: 'u-admin', userName: 'root', roleName: 'SUPER_ADMIN', scope: '[]' },
  customer: { userId: 'u-customer', userName: 'khach', roleName: 'CUSTOMER', scope: '[]' },
} as const satisfies Record<'admin' | 'customer', TestUser>

let applyAuth: (user: TestUser | null) => void = () => {
  throw new Error(
    'renderWithProviders: chưa có auth applier. Kiểm `src/app/test-setup.ts` có trong ' +
      '`test.setupFiles` của vite.config.ts.',
  )
}

/**
 * Tầng `app` tiêm cách đặt phiên (đặt `useAuthStore`) — cùng khuôn với `setSessionEndHandler` /
 * `setCacheCleaner`. Gọi từ `src/app/test-setup.ts`, không gọi trong từng test.
 */
export function setTestAuthApplier(fn: (user: TestUser | null) => void): void {
  applyAuth = fn
}

export type RenderWithProvidersOptions = {
  /** Địa chỉ ban đầu của `MemoryRouter`, gồm cả query string. Mặc định `/`. */
  route?: string
  auth?: TestAuth
  /** Mặc định client mới, `retry: false`, KHÔNG có handler toast global của `app/query-client.ts`. */
  queryClient?: QueryClient
} & Omit<RenderOptions, 'wrapper' | 'queries'>

function resolveUser(auth: TestAuth): TestUser | null {
  if (auth === 'none') return null
  if (auth === 'admin' || auth === 'customer') return TEST_USERS[auth]
  return auth
}

function newTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/** Theme + QueryClient, KHÔNG có router — hai hàm render dưới tự thêm router của mình. */
function providersFor(queryClient: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeProvider>
    )
  }
}

export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const {
    route = '/',
    auth = 'none',
    queryClient = newTestQueryClient(),
    ...renderOptions
  } = options

  applyAuth(resolveUser(auth))
  const user = userEvent.setup()
  const Providers = providersFor(queryClient)

  // `wrapper` (không bọc thẳng `ui`) để `rerender` vẫn giữ provider.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Providers>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </Providers>
  )

  return { ...render(ui, { wrapper, ...renderOptions }), queryClient, user }
}

/**
 * Như `renderWithProviders` nhưng dựng **data router** (`createMemoryRouter(routes)`) — cần cho
 * component dùng `useMatches` / `useNavigation` / `lazy` / `handle` (MemoryRouter thường không có).
 * Trả thêm `router` để test đọc `router.state.location` hoặc `router.navigate(...)`.
 */
export function renderWithRouter(routes: RouteObject[], options: RenderWithProvidersOptions = {}) {
  const {
    route = '/',
    auth = 'none',
    queryClient = newTestQueryClient(),
    ...renderOptions
  } = options

  applyAuth(resolveUser(auth))
  const user = userEvent.setup()
  const router = createMemoryRouter(routes, { initialEntries: [route] })

  return {
    ...render(<RouterProvider router={router} />, {
      wrapper: providersFor(queryClient),
      ...renderOptions,
    }),
    queryClient,
    user,
    router,
  }
}
