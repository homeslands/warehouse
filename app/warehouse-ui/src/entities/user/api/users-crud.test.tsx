import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import {
  useCreateUser,
  useResetUserPassword,
  useChangeUserRole,
  useRoles,
  useSetUserActive,
  useUpdateUser,
  useUsers,
} from './hooks'
import { userKeys } from './query-keys'
import type { User } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const user: User = {
  slug: 'u-lan',
  createdAt: 'Wed Sep 30 2026 11:22:59 GMT+0700 (Indochina Time)',
  updatedAt: 'Wed Sep 30 2026 11:22:59 GMT+0700 (Indochina Time)',
  phonenumber: '0384940599',
  firstName: 'Lan',
  lastName: 'Trần',
  dob: null,
  email: null,
  address: null,
  isActive: true,
  roleSlug: 'r-supervisor',
  roleName: 'SUPERVISOR',
}

function Probe() {
  const list = useUsers({ page: 1, size: 10, roleSlug: 'r-supervisor' })
  const create = useCreateUser()
  const reset = useResetUserPassword()
  const update = useUpdateUser()
  const setActive = useSetUserActive()
  const changeRole = useChangeUserRole()

  return (
    <div>
      <output data-testid="names">
        {(list.data?.items ?? []).map((u) => u.phonenumber).join(',')}
      </output>
      <button
        onClick={() =>
          create.mutate({
            phonenumber: '0390000001',
            firstName: 'A',
            lastName: 'Nguyễn',
            password: 'x',
            roleSlug: 'r-supervisor',
          })
        }
      >
        create
      </button>
      <button onClick={() => reset.mutate({ slug: 'u-lan', input: { newPassword: 'abc' } })}>
        reset
      </button>
      <button
        onClick={() => update.mutate({ slug: 'u-lan', input: { phonenumber: '0390000009' } })}
      >
        update
      </button>
      <button onClick={() => setActive.mutate({ slug: 'u-lan', isActive: false })}>lock</button>
      <button onClick={() => setActive.mutate({ slug: 'u-lan', isActive: true })}>unlock</button>
      <button onClick={() => changeRole.mutate({ slug: 'u-lan', roleSlug: 'r-manager' })}>
        changeRole
      </button>
      <output data-testid="reset-status">{reset.status}</output>
    </div>
  )
}

let listQuery = ''
beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  server.use(
    mswHttp.get(`${BASE}/users`, ({ request }) => {
      listQuery = new URL(request.url).searchParams.toString()
      return paginated([user])
    }),
  )
})

describe('useUsers', () => {
  it('gửi page/size/roleSlug và ghi cache theo userKeys.list', async () => {
    const { queryClient } = renderWithProviders(<Probe />)

    expect(await screen.findByText('0384940599')).toBeInTheDocument()
    expect(listQuery).toBe('page=1&size=10&roleSlug=r-supervisor')
    expect(
      queryClient.getQueryData(userKeys.list({ page: 1, size: 10, roleSlug: 'r-supervisor' })),
    ).toBeDefined()
  })
})

describe('mutation người dùng', () => {
  it.each([
    ['create', 'post', `${BASE}/users`, 'Đã tạo người dùng'],
    ['update', 'patch', `${BASE}/users/u-lan`, 'Đã cập nhật người dùng'],
    ['lock', 'put', `${BASE}/users/u-lan/lock`, 'Đã khoá người dùng'],
    ['unlock', 'put', `${BASE}/users/u-lan/unlock`, 'Đã mở khoá người dùng'],
    ['changeRole', 'post', `${BASE}/users/u-lan/change-role`, 'Đã đổi vai trò'],
  ] as const)('%s: thành công → toast và tải lại danh sách', async (name, method, url, message) => {
    let body: unknown
    server.use(
      mswHttp[method](url, async ({ request }) => {
        // `PUT .../lock|unlock` không có body.
        body = method === 'put' ? undefined : await request.json()
        return ok(user)
      }),
    )
    const { user: ue, queryClient } = renderWithProviders(<Probe />)
    await screen.findByText('0384940599')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await ue.click(screen.getByRole('button', { name }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userKeys.all })
    if (name === 'update') expect(body).toEqual({ phonenumber: '0390000009' })
    if (name === 'changeRole') expect(body).toEqual({ roleSlug: 'r-manager' })
  })

  it('khoá KHÔNG bao giờ gọi DELETE /users/{slug} (backend: DELETE = xoá)', async () => {
    let deleteCalls = 0
    server.use(
      mswHttp.delete(`${BASE}/users/u-lan`, () => {
        deleteCalls += 1
        return ok(1)
      }),
      mswHttp.put(`${BASE}/users/u-lan/lock`, () => ok(user)),
    )
    const { user: ue } = renderWithProviders(<Probe />)
    await screen.findByText('0384940599')

    await ue.click(screen.getByRole('button', { name: 'lock' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã khoá người dùng'))
    expect(deleteCalls).toBe(0)
  })

  it('reset: POST đúng slug + body, toast, KHÔNG tải lại danh sách (danh sách không đổi)', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/users/u-lan/change-password`, async ({ request }) => {
        body = await request.json()
        return ok({ userSlug: 'u-lan' })
      }),
    )
    const { user: ue, queryClient } = renderWithProviders(<Probe />)
    await screen.findByText('0384940599')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await ue.click(screen.getByRole('button', { name: 'reset' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã đặt lại mật khẩu'))
    expect(body).toEqual({ newPassword: 'abc' })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('reset: 404 (người vừa bị xoá ở nơi khác) → tải lại danh sách', async () => {
    server.use(mswHttp.post(`${BASE}/users/u-lan/change-password`, () => apiError(404, 100405)))
    const { user: ue, queryClient } = renderWithProviders(<Probe />)
    await screen.findByText('0384940599')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await ue.click(screen.getByRole('button', { name: 'reset' }))

    await waitFor(() => expect(screen.getByTestId('reset-status')).toHaveTextContent('error'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userKeys.all })
  })

  it.each(['create', 'reset', 'update', 'changeRole'] as const)(
    '%s: KHÔNG tự toast lỗi — form/dialog tự hiện lỗi (meta.suppressErrorToast)',
    async (name) => {
      const routes = {
        create: mswHttp.post(`${BASE}/users`, () => apiError(422, 100401)),
        reset: mswHttp.post(`${BASE}/users/u-lan/change-password`, () => apiError(403, 100407)),
        update: mswHttp.patch(`${BASE}/users/u-lan`, () => apiError(400, 100413)),
        changeRole: mswHttp.post(`${BASE}/users/u-lan/change-role`, () => apiError(403, 100104)),
      }
      server.use(routes[name])
      const { user: ue } = renderWithProviders(<Probe />, {
        queryClient: mutationToastQueryClient(),
      })
      await screen.findByText('0384940599')

      await ue.click(screen.getByRole('button', { name }))

      await waitFor(() => expect(toast.success).not.toHaveBeenCalled())
      expect(toast.error).not.toHaveBeenCalled()
    },
  )
})

function RolesProbe({ enabled }: { enabled: boolean }) {
  const roles = useRoles({ enabled })
  return <output data-testid="roles">{roles.fetchStatus}</output>
}

describe('useRoles', () => {
  it('enabled: false → không gọi GET /roles (người xem thiếu ROLE_READ)', async () => {
    let calls = 0
    server.use(
      mswHttp.get(`${BASE}/roles`, () => {
        calls += 1
        return ok([])
      }),
    )
    renderWithProviders(<RolesProbe enabled={false} />)

    expect(screen.getByTestId('roles')).toHaveTextContent('idle')
    expect(calls).toBe(0)
  })
})
