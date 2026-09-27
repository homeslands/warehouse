import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { useTogglePermission, type TogglePermissionInput } from './useTogglePermission'

const BASE = 'http://localhost:8085/api/v1'

/**
 * Repo KHÔNG dùng `renderHook` cho hook có mutation — mẫu chung là một component nhỏ với nút bấm,
 * render qua `renderWithProviders` (xem `src/entities/warehouse/api/hooks.test.tsx`).
 */
function Probe({ input }: { input: TogglePermissionInput }) {
  const toggle = useTogglePermission()
  return (
    <div>
      <button onClick={() => toggle.mutate(input)}>toggle</button>
      <output data-testid="status">{toggle.status}</output>
    </div>
  )
}

const ADMIN_USER = { userId: 'u1', userName: 'a', roleName: 'ADMIN', scope: [] }

describe('useTogglePermission', () => {
  it('bật → PUT đúng đường dẫn', async () => {
    let hit = ''
    server.use(
      mswHttp.put(`${BASE}/roles/:roleSlug/authorities/:code`, ({ params }) => {
        hit = `PUT ${String(params.roleSlug)}/${String(params.code)}`
        return ok('granted')
      }),
    )
    const { user } = renderWithProviders(
      <Probe
        input={{
          roleSlug: 'manager',
          roleName: 'MANAGER',
          authorityCode: 'IMPORT_FORM_CREATE',
          granted: true,
        }}
      />,
      { route: '/', auth: ADMIN_USER as never },
    )

    await user.click(screen.getByRole('button', { name: 'toggle' }))

    await waitFor(() => expect(hit).toBe('PUT manager/IMPORT_FORM_CREATE'))
  })

  it('tắt → DELETE đúng đường dẫn', async () => {
    let hit = ''
    server.use(
      mswHttp.delete(`${BASE}/roles/:roleSlug/authorities/:code`, ({ params }) => {
        hit = `DELETE ${String(params.roleSlug)}/${String(params.code)}`
        return ok('revoked')
      }),
    )
    const { user } = renderWithProviders(
      <Probe
        input={{
          roleSlug: 'manager',
          roleName: 'MANAGER',
          authorityCode: 'IMPORT_FORM_CREATE',
          granted: false,
        }}
      />,
      { route: '/', auth: ADMIN_USER as never },
    )

    await user.click(screen.getByRole('button', { name: 'toggle' }))

    await waitFor(() => expect(hit).toBe('DELETE manager/IMPORT_FORM_CREATE'))
  })

  it('đổi quyền của CHÍNH role mình → nạp lại /auth/me', async () => {
    // scope trong store nạp một lần lúc mở phiên. Không nạp lại thì can() nói dối sau khi tự đổi.
    let meCalls = 0
    server.use(
      mswHttp.put(`${BASE}/roles/:roleSlug/authorities/:code`, () => ok('granted')),
      mswHttp.get(`${BASE}/auth/me`, () => {
        meCalls += 1
        return ok({ userId: 'u1', userName: 'a', roleName: 'ADMIN', scope: [] })
      }),
    )
    const { user } = renderWithProviders(
      // `roleName: 'ADMIN'` trùng role của ADMIN_USER → phải nạp lại /auth/me.
      <Probe
        input={{
          roleSlug: 'admin',
          roleName: 'ADMIN',
          authorityCode: 'USER_READ',
          granted: true,
        }}
      />,
      { route: '/', auth: ADMIN_USER as never },
    )

    await user.click(screen.getByRole('button', { name: 'toggle' }))

    await waitFor(() => expect(meCalls).toBe(1))
  })

  it('đổi quyền của role KHÁC → không nạp lại /auth/me', async () => {
    let meCalls = 0
    server.use(
      mswHttp.put(`${BASE}/roles/:roleSlug/authorities/:code`, () => ok('granted')),
      mswHttp.get(`${BASE}/auth/me`, () => {
        meCalls += 1
        return ok({ userId: 'u1', userName: 'a', roleName: 'ADMIN', scope: [] })
      }),
    )
    const { user } = renderWithProviders(
      <Probe
        input={{
          roleSlug: 'supervisor',
          roleName: 'SUPERVISOR',
          authorityCode: 'USER_READ',
          granted: true,
        }}
      />,
      { route: '/', auth: ADMIN_USER as never },
    )

    await user.click(screen.getByRole('button', { name: 'toggle' }))

    // Chờ mutation xong hẳn rồi mới khẳng định "không gọi" — không có tín hiệu này thì assertion
    // chạy ngay lập tức và xanh kể cả khi code sai.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'))
    expect(meCalls).toBe(0)
  })
})
