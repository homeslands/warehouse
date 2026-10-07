import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { useAssignWarehouseMember, useAvailableMembers, useRemoveWarehouseMember } from './hooks'
import { warehouseKeys } from './query-keys'
import type { WarehouseMemberCandidate } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const candidate: WarehouseMemberCandidate = {
  slug: 'u-lan',
  phonenumber: '0390111222',
  firstName: 'Lan',
  lastName: 'Nguyễn',
  roleName: 'Nhân viên kho',
}

function Probe({ enabled }: { enabled?: boolean }) {
  const list = useAvailableMembers('kho-hn', { enabled })
  const assign = useAssignWarehouseMember()
  const remove = useRemoveWarehouseMember()
  return (
    <div>
      <output data-testid="phones">
        {(list.data?.items ?? []).map((c) => c.phonenumber).join(',')}
      </output>
      <button onClick={() => assign.mutate({ slug: 'kho-hn', userSlug: 'u-lan' })}>assign</button>
      <button onClick={() => remove.mutate({ slug: 'kho-hn', userSlug: 'u-lan' })}>remove</button>
    </div>
  )
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('useAvailableMembers', () => {
  it('query key nằm dưới warehouseKeys.all', () => {
    expect(warehouseKeys.availableMembers('kho-hn')).toEqual([
      'warehouses',
      'available-members',
      'kho-hn',
    ])
  })

  it('tải trang 1, size 100 và hiện SĐT ứng viên', async () => {
    let search = ''
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-hn/available-members`, ({ request }) => {
        search = new URL(request.url).search
        return paginated([candidate])
      }),
    )
    renderWithProviders(<Probe />)

    expect(await screen.findByText('0390111222')).toBeInTheDocument()
    expect(search).toBe('?page=1&size=100')
  })

  it('enabled: false → không gọi request', async () => {
    const spy = vi.fn()
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-hn/available-members`, () => {
        spy()
        return paginated([candidate])
      }),
    )
    renderWithProviders(<Probe enabled={false} />)

    await new Promise((r) => setTimeout(r, 50))
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('mutation thành viên kho', () => {
  it('assign: PUT body { userSlug }, toast và tải lại danh sách ứng viên', async () => {
    let body: unknown
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-hn/available-members`, () => paginated([candidate])),
      mswHttp.put(`${BASE}/warehouses/kho-hn/members`, async ({ request }) => {
        body = await request.json()
        return ok(null)
      }),
    )
    const { user, queryClient } = renderWithProviders(<Probe />)
    await screen.findByText('0390111222')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'assign' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã thêm thành viên'))
    expect(body).toEqual({ userSlug: 'u-lan' })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['warehouses', 'available-members', 'kho-hn'],
    })
  })

  it('remove: DELETE đúng URL, toast và tải lại danh sách ứng viên', async () => {
    const spy = vi.fn()
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-hn/available-members`, () => paginated([candidate])),
      mswHttp.delete(`${BASE}/warehouses/kho-hn/members/u-lan`, () => {
        spy()
        return ok(null)
      }),
    )
    const { user, queryClient } = renderWithProviders(<Probe />)
    await screen.findByText('0390111222')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'remove' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã gỡ thành viên'))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['warehouses', 'available-members', 'kho-hn'],
    })
  })
})
