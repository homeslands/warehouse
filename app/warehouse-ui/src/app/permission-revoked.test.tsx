import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
// Cố định cờ: file này mô tả hành vi KHI CHƯA CÓ luật ủy quyền. Không cố định thì test chạy theo
// giá trị cờ trong working tree — ai bật cờ ở máy mình để thử là cả file đỏ oan. Luật ủy quyền có test riêng ở
// features/permission-matrix.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    userSort: false,
    search: false,
    profileEdit: false,
    sessionList: false,
    authorityGuards: true,
    storeAuthorityGuards: true,
    permissionDelegationRules: false,
  },
}))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'
import { queryClient } from '@/app/query-client'
import { createRoutes } from '@/app/routes'

// Ở tầng app: cần queryClient THẬT (chốt 403 → nạp lại quyền) + cây route thật (RoleGate).
const BASE = 'http://localhost:8085/api/v1'

const ADMIN = {
  userName: 'a',
  roleName: 'ADMIN',
  scope: ['MANAGE_PERMISSIONS', 'ROLE_READ'],
}

let revoked = false

beforeEach(() => {
  revoked = false
  vi.mocked(toast.error).mockClear()
  server.use(
    mswHttp.get(`${BASE}/roles`, () =>
      ok([
        { slug: 'admin', name: 'ADMIN', authorityCodes: ['MANAGE_PERMISSIONS'] },
        { slug: 'manager', name: 'MANAGER', authorityCodes: ['MANAGE_PERMISSIONS'] },
      ]),
    ),
    mswHttp.get(`${BASE}/authorities`, () =>
      ok([
        {
          slug: 'a1',
          code: 'LOGGER_READ',
          name: 'Xem log',
          authorityGroup: { slug: 'g1', name: 'System' },
        },
      ]),
    ),
    // Người khác vừa gỡ MANAGE_PERMISSIONS của ADMIN: từ lúc đó backend từ chối, và /auth/me trả
    // scope mới.
    mswHttp.put(`${BASE}/roles/:roleSlug/authorities/:code`, () => {
      revoked = true
      return apiError(403, undefined, 'Forbidden resource')
    }),
    mswHttp.get(`${BASE}/auth/me`, () => ok(revoked ? { ...ADMIN, scope: [] } : ADMIN)),
  )
})

afterEach(() => queryClient.clear())

describe('bị thu quyền giữa phiên', () => {
  it('bấm thao tác bị 403 → nạp lại quyền → rời màn không còn được vào, kèm MỘT toast giải thích', async () => {
    const { user, router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/permissions',
      auth: ADMIN as never,
      queryClient,
    })

    await user.click(await screen.findByRole('switch', { name: 'Xem nhật ký hệ thống — Quản lý' }))
    const box = await screen.findByRole('alertdialog')
    await user.click(within(box).getByRole('button', { name: 'Cấp quyền' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    expect(router.state.location.search).toBe('?reason=permissionChanged')
    expect(await screen.findByText('Quyền truy cập đã thay đổi')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      'Bạn không có quyền thực hiện thao tác này. Quyền của bạn có thể vừa được thay đổi — giao diện đã được cập nhật lại.',
      { id: 'permission-denied' },
    )
  })
})
