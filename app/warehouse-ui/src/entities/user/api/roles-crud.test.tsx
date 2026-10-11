import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { useCreateRole, useDeleteRole, useUpdateRole } from './hooks'
import { roleKeys } from './query-keys'
import { createRole, removeRole, updateRole } from './user.api'
import type { Role } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'
const tl: Role = { slug: 'r-tl', name: 'Trưởng nhóm', level: 15, authorityCodes: [] }

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('role API', () => {
  it('POST / PATCH / DELETE đúng URL và body', async () => {
    const seen: { method: string; path: string; body: unknown }[] = []
    const record = async ({ request }: { request: Request }) => {
      const body = request.method === 'DELETE' ? null : await request.json()
      seen.push({ method: request.method, path: new URL(request.url).pathname, body })
      return ok(request.method === 'DELETE' ? 'r-tl' : tl)
    }
    server.use(
      mswHttp.post(`${BASE}/roles`, record),
      mswHttp.patch(`${BASE}/roles/r-tl`, record),
      mswHttp.delete(`${BASE}/roles/r-tl`, record),
    )

    await createRole({ name: 'Trưởng nhóm', level: 15 })
    await updateRole('r-tl', { description: '' })
    await removeRole('r-tl')

    expect(seen).toEqual([
      { method: 'POST', path: '/api/v1/roles', body: { name: 'Trưởng nhóm', level: 15 } },
      { method: 'PATCH', path: '/api/v1/roles/r-tl', body: { description: '' } },
      { method: 'DELETE', path: '/api/v1/roles/r-tl', body: null },
    ])
  })
})

function Probe() {
  const create = useCreateRole()
  const update = useUpdateRole()
  const remove = useDeleteRole()
  return (
    <>
      <button onClick={() => create.mutate({ name: 'Trưởng nhóm', level: 15 })}>create</button>
      <button onClick={() => update.mutate({ slug: 'r-tl', input: { description: 'x' } })}>
        update
      </button>
      <button onClick={() => remove.mutate('r-tl')}>delete</button>
    </>
  )
}

describe('role hooks', () => {
  it.each([
    ['create', 'Đã thêm vai trò'],
    ['update', 'Đã lưu vai trò'],
    ['delete', 'Đã xoá vai trò'],
  ])(
    '%s thành công → toast + invalidate roleKeys.all (ma trận, ô vai trò ở Người dùng tải lại)',
    async (name, message) => {
      server.use(
        mswHttp.post(`${BASE}/roles`, () => ok(tl)),
        mswHttp.patch(`${BASE}/roles/r-tl`, () => ok(tl)),
        mswHttp.delete(`${BASE}/roles/r-tl`, () => ok('r-tl')),
      )
      const { user, queryClient } = renderWithProviders(<Probe />)
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

      await user.click(screen.getByRole('button', { name }))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message))
      expect(invalidate).toHaveBeenCalledWith({ queryKey: roleKeys.all })
    },
  )

  it('lỗi không tự toast (form / hộp xoá tự báo)', async () => {
    server.use(mswHttp.delete(`${BASE}/roles/r-tl`, () => apiError(422, 100106)))
    const { user } = renderWithProviders(<Probe />, { queryClient: mutationToastQueryClient() })
    await user.click(screen.getByRole('button', { name: 'delete' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(toast.error).not.toHaveBeenCalled()
  })
})
