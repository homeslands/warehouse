import { screen, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { isValidElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'
import { createRoutes } from '@/app/routes'
import { RoleGate } from './RoleGate'

const BASE = 'http://localhost:8085/api/v1'

beforeEach(() => {
  server.use(mswHttp.get(`${BASE}/examples`, () => paginated([])))
})

/** Các route màn hình (`lazy`) trong cây, kèm chúng có nằm dưới layout `RoleGate` hay không. */
function lazyScreens(
  routes: RouteObject[],
  underGate = false,
): { route: RouteObject; underGate: boolean }[] {
  return routes.flatMap((route) => {
    const gated = underGate || (isValidElement(route.element) && route.element.type === RoleGate)
    return [
      ...(route.lazy ? [{ route, underGate: gated }] : []),
      ...lazyScreens(route.children ?? [], gated),
    ]
  })
}

describe('createRoutes', () => {
  it('dev: true → /examples tải lazy màn Example; menu có nhóm "Dev" với mục "Example"', async () => {
    renderWithRouter(createRoutes({ dev: true }), { route: '/examples', auth: 'admin' })

    expect(await screen.findByRole('heading', { name: 'Examples' })).toBeInTheDocument()
    expect(screen.getByText('Dev')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Example' })).toHaveAttribute('href', '/examples')
  })

  it('dev: false → /examples là 404', async () => {
    renderWithRouter(createRoutes({ dev: false }), { route: '/examples', auth: 'admin' })

    expect(await screen.findByText('Không tìm thấy trang')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Example' })).not.toBeInTheDocument()
  })

  it('dev: true → / là trang Tổng quan (lazy), có thẻ lối tắt tới Example; không còn chuyển sang /examples', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: true }), { auth: 'admin' })

    expect(await screen.findByRole('heading', { name: 'Xin chào, root!' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Dev' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('dev: false → / là Tổng quan, không có mục Example, hiện câu rỗng', async () => {
    renderWithRouter(createRoutes({ dev: false }), { auth: 'admin' })

    expect(await screen.findByText('Chưa có chức năng nào được cấp quyền.')).toBeInTheDocument()
    expect(screen.queryByText('Dev')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Example' })).not.toBeInTheDocument()
  })

  it('handle.crumb của route thật → breadcrumb "Tổng quan › Example" và tiêu đề tab', async () => {
    renderWithRouter(createRoutes({ dev: true }), { route: '/examples', auth: 'admin' })

    await screen.findByRole('heading', { name: 'Examples' })
    const trail = within(screen.getByRole('navigation', { name: 'Vị trí hiện tại' }))
    expect(trail.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/')
    expect(trail.getByText('Example')).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Example · Warehouse')
  })

  it('mọi màn (route lazy) đều nằm dưới layout RoleGate — handle.roles thật sự được kiểm', () => {
    // Test hành vi của RoleGate ở RoleGate.test.tsx; ở đây chỉ chứng minh createRoutes nối nó vào.
    // Duyệt cây thay vì render: màn thật hiện chưa màn nào khai roles để thấy /forbidden.
    const found = lazyScreens(createRoutes({ dev: true }))

    expect(found.length).toBeGreaterThanOrEqual(2) // Tổng quan + Example
    for (const { route, underGate } of found) {
      expect(underGate, `route ${route.path ?? '(index)'} không nằm dưới RoleGate`).toBe(true)
    }
  })

  it('tải nguội một màn lazy: route gốc hiện vòng chờ (hydrateFallbackElement) thay vì trang trắng', async () => {
    // Router chỉ cảnh báo "No `HydrateFallback` element..." khi KHÔNG route nào trong nhánh có
    // fallback; thấy vòng chờ = đã qua nhánh có fallback. (Cảnh báo là warningOnce theo module nên
    // không spy console.warn được một cách tin cậy giữa các test.)
    renderWithRouter(createRoutes({ dev: true }), { route: '/examples', auth: 'admin' })

    expect(screen.getByRole('status', { name: 'Đang tải...' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Examples' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Đang tải...' })).not.toBeInTheDocument()
  })
})
