/**
 * Cây route khi cờ `apiV1Auth` bật/tắt. API là MSW MOCK (OpenAPI R2) — không gọi API thật.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoutes } from '@/app/routes'
import { ProtectedRouteV1 } from './guards'
import { makeStore, type AppStore } from '@/app/store'
import {
  ACTIVITY_REPORT_INTERVAL_MS,
  endV1Session,
  injectSessionV1,
  loginV1,
} from '@/entities/session'
import { clearCredentials } from '@/shared/api/v1'
import { ok, paginated } from '@/shared/test/api'
import { V1_BASE, v1Action, v1LoginResult, v1ok } from '@/shared/test/api-v1'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'

const LEGACY = { authorityGuards: true, storeAuthorityGuards: true }
let store: AppStore

beforeEach(() => {
  injectSessionV1()
  store = makeStore()
})

afterEach(() => {
  clearCredentials()
})

describe('cờ apiV1Auth TẮT (mặc định) — hành vi cũ', () => {
  it('/login là màn legacy (không có antd form v1)', () => {
    renderWithRouter(createRoutes({ dev: false, capabilities: LEGACY }), { route: '/login', store })
    expect(document.querySelector('[data-slot="login-background"]')).not.toBeNull()
    expect(document.querySelector('form#login-v1')).toBeNull()
  })

  it('/locked không tồn tại (404)', async () => {
    renderWithRouter(createRoutes({ dev: false, capabilities: LEGACY }), {
      route: '/locked',
      store,
    })
    expect(await screen.findByText('Không tìm thấy trang')).toBeInTheDocument()
  })
})

describe('cờ apiV1Auth BẬT', () => {
  const routes = () => createRoutes({ dev: false, capabilities: { ...LEGACY, apiV1Auth: true } })

  it('/login là UI-01 v1 (tải lazy), không còn màn legacy', async () => {
    store.dispatch(endV1Session('loggedOut'))
    renderWithRouter(routes(), { route: '/login', store })
    await waitFor(() => expect(document.querySelector('form#login-v1')).not.toBeNull(), {
      timeout: 5000,
    })
    expect(document.querySelector('[data-slot="login-background"]')).toBeNull()
  })

  it('đang khôi phục phiên (unknown) → vòng chờ (role=status), chưa render vùng được bảo vệ, không điều hướng', async () => {
    const { router } = renderWithRouter(routes(), { route: '/warehouses', store })
    expect(
      await screen.findByRole('status', { name: 'Đang tải...' }, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/warehouses')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('không phiên → /login?redirect=<trang>', async () => {
    store.dispatch(endV1Session('expired'))
    const { router } = renderWithRouter(routes(), { route: '/warehouses?page=2', store })
    // Route `lazy`: router chờ chunk màn kho trước khi render guard — cho thời gian tải chunk.
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'), { timeout: 5000 })
    expect(router.state.location.search).toBe('?redirect=%2Fwarehouses%3Fpage%3D2')
  })

  it('bị khoá (idle) → /locked, nội dung màn được bảo vệ KHÔNG còn trong DOM', async () => {
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, () => v1ok(v1LoginResult())),
      // Shell legacy vẫn gọi /auth/me + /warehouses khi render (shell chưa chuyển sang phiên v1).
      mswHttp.get(`${V1_BASE}/auth/me`, () => ok({ userName: 'x', roleName: 'ADMIN', scope: [] })),
      mswHttp.get(`${V1_BASE}/warehouses`, () => paginated([])),
    )
    await store.dispatch(loginV1({ phoneNumber: '0900000001', password: 'p' }))
    store.dispatch(endV1Session('idle'))
    const { router } = renderWithRouter(routes(), { route: '/warehouses', store })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Phiên đã khoá' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/locked')
    expect(router.state.location.search).toBe('?redirect=%2Fwarehouses')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})

describe('ProtectedRouteV1', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('authenticated → render nội dung; tương tác thật → POST /auth/activity (Bearer), có giới hạn tần suất', async () => {
    const activity: (string | null)[] = []
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, () =>
        v1ok(v1LoginResult({ accessToken: 'access-guard' })),
      ),
      mswHttp.post(`${V1_BASE}/auth/activity`, ({ request }) => {
        activity.push(request.headers.get('Authorization'))
        return v1ok(v1Action())
      }),
    )
    await store.dispatch(loginV1({ phoneNumber: '0900000001', password: 'p' }))
    // Chỉ giả Date (không giả setTimeout) để RTL/MSW vẫn chạy bình thường.
    vi.useFakeTimers({ toFake: ['Date'] })
    renderWithRouter(
      [{ path: '/', element: <ProtectedRouteV1>Nội dung được bảo vệ</ProtectedRouteV1> }],
      { store },
    )
    expect(screen.getByText('Nội dung được bảo vệ')).toBeInTheDocument()

    // Tương tác thật đầu tiên → báo ngay (review r1 M1); thêm trong 60 giây → không báo.
    fireEvent.pointerDown(document.body)
    fireEvent.keyDown(document.body, { key: 'a' })
    await waitFor(() => expect(activity).toEqual(['Bearer access-guard']))
    vi.setSystemTime(Date.now() + ACTIVITY_REPORT_INTERVAL_MS)
    fireEvent.keyDown(document.body, { key: 'b' })
    fireEvent.keyDown(document.body, { key: 'c' })
    await waitFor(() => expect(activity).toEqual(['Bearer access-guard', 'Bearer access-guard']))
  })
})
