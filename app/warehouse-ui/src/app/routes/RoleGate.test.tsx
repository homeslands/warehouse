import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ROLES, useAuthStore } from '@/entities/session'
import type { AppRouteHandle } from './handle'
import { RoleGate } from './RoleGate'

const tree: RouteObject[] = [
  { path: '/forbidden', element: <div>KHÔNG ĐỦ QUYỀN</div> },
  {
    element: <RoleGate />,
    children: [
      { path: '/open', element: <div>AI CŨNG VÀO</div> },
      {
        path: '/admin-only',
        element: <div>CHỈ ADMIN</div>,
        handle: { roles: [ROLES.ADMIN] } satisfies AppRouteHandle,
      },
      {
        path: '/stock',
        handle: { roles: [ROLES.ADMIN, ROLES.MANAGER] } satisfies AppRouteHandle,
        children: [
          { index: true, element: <div>TỒN KHO</div> },
          {
            // Match sâu nhất có khai roles thắng: con hẹp hơn cha.
            path: 'adjust',
            element: <div>ĐIỀU CHỈNH</div>,
            handle: { roles: [ROLES.ADMIN] } satisfies AppRouteHandle,
          },
        ],
      },
    ],
  },
]

function renderAt(path: string, roleName: string) {
  useAuthStore.setState({
    hasSession: true,
    status: 'authenticated',
    user: { userId: 'u1', userName: 'tester', roleName, scope: '[]' },
  })
  render(<RouterProvider router={createMemoryRouter(tree, { initialEntries: [path] })} />)
}

describe('RoleGate', () => {
  it('không đủ quyền → /forbidden', async () => {
    renderAt('/admin-only', 'MANAGER')
    expect(await screen.findByText('KHÔNG ĐỦ QUYỀN')).toBeInTheDocument()
    expect(screen.queryByText('CHỈ ADMIN')).not.toBeInTheDocument()
  })

  it('đủ quyền → vào được', async () => {
    renderAt('/admin-only', 'ADMIN')
    expect(await screen.findByText('CHỈ ADMIN')).toBeInTheDocument()
  })

  it('route không khai roles → mọi người đã đăng nhập vào được', async () => {
    renderAt('/open', 'SUPERVISOR')
    expect(await screen.findByText('AI CŨNG VÀO')).toBeInTheDocument()
  })

  it.each(['/admin-only', '/stock', '/stock/adjust'])('SUPER_ADMIN vào được %s', async (path) => {
    renderAt(path, 'SUPER_ADMIN')
    expect(screen.queryByText('KHÔNG ĐỦ QUYỀN')).not.toBeInTheDocument()
    expect(await screen.findByText(/CHỈ ADMIN|TỒN KHO|ĐIỀU CHỈNH/)).toBeInTheDocument()
  })

  it('route con index không khai roles → thừa hưởng roles của cha: MANAGER vào /stock', async () => {
    renderAt('/stock', 'MANAGER')
    expect(await screen.findByText('TỒN KHO')).toBeInTheDocument()
  })

  it('route con index không khai roles → thừa hưởng roles của cha: SUPERVISOR vào /stock → /forbidden', async () => {
    renderAt('/stock', 'SUPERVISOR')
    expect(await screen.findByText('KHÔNG ĐỦ QUYỀN')).toBeInTheDocument()
    expect(screen.queryByText('TỒN KHO')).not.toBeInTheDocument()
  })

  it('roles của match sâu nhất thắng: MANAGER (cha cho phép) vào /stock/adjust → /forbidden', async () => {
    renderAt('/stock/adjust', 'MANAGER')
    expect(await screen.findByText('KHÔNG ĐỦ QUYỀN')).toBeInTheDocument()
  })
})
