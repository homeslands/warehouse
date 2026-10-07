import { act, render, screen, waitFor } from '@testing-library/react'
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
      {
        path: '/needs-authority',
        element: <div>CẦN QUYỀN</div>,
        handle: { authority: 'MANAGE_PERMISSIONS' } satisfies AppRouteHandle,
      },
      {
        path: '/needs-both',
        element: <div>CẦN CẢ HAI</div>,
        handle: {
          roles: [ROLES.MANAGER],
          authority: 'MANAGE_PERMISSIONS',
        } satisfies AppRouteHandle,
      },
    ],
  },
]

function renderAt(path: string, roleName: string, scope: string[] = []) {
  useAuthStore.setState({
    hasSession: true,
    status: 'authenticated',
    user: { userName: 'tester', roleName, scope },
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

describe('RoleGate — gác bằng authority', () => {
  it('thiếu authority → /forbidden', async () => {
    renderAt('/needs-authority', 'ADMIN', [])
    expect(await screen.findByText('KHÔNG ĐỦ QUYỀN')).toBeInTheDocument()
  })

  it('có authority trong scope → vào được', async () => {
    renderAt('/needs-authority', 'ADMIN', ['MANAGE_PERMISSIONS'])
    expect(await screen.findByText('CẦN QUYỀN')).toBeInTheDocument()
  })

  it('SUPER_ADMIN vào được dù scope RỖNG', async () => {
    // Backend cho SUPER_ADMIN bypass và cố tình không cấp permission row nào cho nó. Thiếu bypass
    // này ở can() thì người quyền cao nhất là người duy nhất bị khoá khỏi màn phân quyền.
    renderAt('/needs-authority', 'SUPER_ADMIN', [])
    expect(await screen.findByText('CẦN QUYỀN')).toBeInTheDocument()
  })

  it('khai cả roles lẫn authority → phải qua CẢ HAI', async () => {
    // Đúng authority nhưng SAI role → vẫn chặn.
    renderAt('/needs-both', 'ADMIN', ['MANAGE_PERMISSIONS'])
    expect(await screen.findByText('KHÔNG ĐỦ QUYỀN')).toBeInTheDocument()
  })

  it('đúng role nhưng THIẾU authority → vẫn chặn', async () => {
    // Nửa AND do task này tạo ra. Ca "đúng authority, sai role" ở trên bị chốt `roles` cũ chặn nên
    // xanh kể cả khi chưa có code authority — chỉ ca này mới canh được.
    renderAt('/needs-both', 'MANAGER', [])
    expect(await screen.findByText('KHÔNG ĐỦ QUYỀN')).toBeInTheDocument()
  })

  it('đúng cả role lẫn authority → vào được', async () => {
    renderAt('/needs-both', 'MANAGER', ['MANAGE_PERMISSIONS'])
    expect(await screen.findByText('CẦN CẢ HAI')).toBeInTheDocument()
  })
})

describe('RoleGate — quyền đổi GIỮA PHIÊN', () => {
  function renderRouter(path: string, roleName: string, scope: string[]) {
    useAuthStore.setState({
      hasSession: true,
      status: 'authenticated',
      user: { userName: 'tester', roleName, scope },
    })
    const router = createMemoryRouter(tree, { initialEntries: [path] })
    render(<RouterProvider router={router} />)
    return router
  }

  it('đang ở màn được vào, rồi bị thu quyền → /forbidden KÈM lý do', async () => {
    const router = renderRouter('/needs-authority', 'ADMIN', ['MANAGE_PERMISSIONS'])
    expect(await screen.findByText('CẦN QUYỀN')).toBeInTheDocument()

    act(() => {
      useAuthStore.setState({
        user: { userName: 'tester', roleName: 'ADMIN', scope: [] },
      })
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    expect(router.state.location.search).toBe('?reason=permissionChanged')
  })

  it('tự gõ URL màn không có quyền → /forbidden KHÔNG kèm lý do (không có gì "vừa đổi")', async () => {
    const router = renderRouter('/needs-authority', 'ADMIN', [])

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    expect(router.state.location.search).toBe('')
  })
})
