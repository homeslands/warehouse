import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { userKeys } from '@/entities/user'
import { warehouseKeys, type WarehouseMemberCandidate } from '@/entities/warehouse'
import { AddWarehouseMemberDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const candidates: WarehouseMemberCandidate[] = [
  {
    slug: 'u-lan',
    phonenumber: '0384940599',
    firstName: 'Lan',
    lastName: 'Trần',
    roleName: 'MANAGER',
  },
  { slug: 'u-binh', phonenumber: '0911111111', roleName: 'STAFF' },
]

const kho = { slug: 'kho-1', name: 'Kho Hà Nội' }

function renderDialog(
  target: { slug: string; name: string } | null = kho,
  queryClient?: ReturnType<typeof mutationToastQueryClient>,
) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(
      <AddWarehouseMemberDialog warehouse={target} onOpenChange={onOpenChange} />,
      {
        auth: 'admin',
        queryClient,
      },
    ),
  }
}

async function pickLan(user: ReturnType<typeof renderDialog>['user']) {
  await user.click(screen.getByRole('combobox', { name: 'Người dùng' }))
  await user.click(await screen.findByText('Trần Lan (0384940599) · Quản lý'))
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  server.use(mswHttp.get(`${BASE}/warehouses/kho-1/available-members`, () => paginated(candidates)))
})

describe('AddWarehouseMemberDialog', () => {
  it('đóng thì KHÔNG tải ứng viên', async () => {
    let called = false
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-1/available-members`, () => {
        called = true
        return paginated(candidates)
      }),
    )
    renderDialog(null)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(called).toBe(false)
  })

  it('liệt kê ứng viên dạng "Họ tên (SĐT) · Vai trò"; chưa chọn thì nút Thêm khoá', async () => {
    const { user } = renderDialog()
    await screen.findByText('Kho Hà Nội')
    expect(screen.getByRole('button', { name: 'Thêm thành viên' })).toBeDisabled()

    await user.click(screen.getByRole('combobox', { name: 'Người dùng' }))

    const list = await screen.findByRole('listbox')
    expect(within(list).getByText('Trần Lan (0384940599) · Quản lý')).toBeInTheDocument()
    expect(within(list).getByText('0911111111 · STAFF')).toBeInTheDocument()
  })

  it('chọn rồi Thêm → PUT userSlug, đóng hộp, tải lại danh sách thành viên VÀ ứng viên', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/warehouses/kho-1/members`, async ({ request }) => {
        body = await request.json()
        return ok({})
      }),
    )
    const { user, queryClient, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await pickLan(user)
    await user.click(screen.getByRole('button', { name: 'Thêm thành viên' }))

    await waitFor(() => expect(body).toEqual({ userSlug: 'u-lan' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userKeys.all })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: warehouseKeys.availableMembers('kho-1') })
  })

  it.each([
    [100524, 'Quản trị viên không thể làm thành viên kho'],
    [100520, 'Người dùng đang bị khoá, không gán vào kho được'],
    [100519, 'Không tìm thấy người dùng'],
  ])('lỗi %i hiện trong role=alert, hộp vẫn mở, không toast', async (code, message) => {
    server.use(mswHttp.put(`${BASE}/warehouses/kho-1/members`, () => apiError(422, code)))
    const { user, onOpenChange } = renderDialog(kho, mutationToastQueryClient())
    await screen.findByText('Kho Hà Nội')

    await pickLan(user)
    await user.click(screen.getByRole('button', { name: 'Thêm thành viên' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('lỗi thuộc ô chọn → tải lại danh sách ứng viên để người sai biến khỏi ô', async () => {
    server.use(mswHttp.put(`${BASE}/warehouses/kho-1/members`, () => apiError(422, 100520)))
    const { user, queryClient } = renderDialog(kho, mutationToastQueryClient())
    await screen.findByText('Kho Hà Nội')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await pickLan(user)
    await user.click(screen.getByRole('button', { name: 'Thêm thành viên' }))

    await screen.findByRole('alert')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: warehouseKeys.availableMembers('kho-1') })
  })

  it('lỗi khác → toast và đóng hộp', async () => {
    server.use(mswHttp.put(`${BASE}/warehouses/kho-1/members`, () => apiError(500)))
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội')

    await pickLan(user)
    await user.click(screen.getByRole('button', { name: 'Thêm thành viên' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('đang gửi thì không đóng được bằng Esc, và không còn nút ×', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.put(`${BASE}/warehouses/kho-1/members`, async () => {
        await gate
        return ok({})
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội')

    await pickLan(user)
    await user.click(screen.getByRole('button', { name: 'Thêm thành viên' }))
    await screen.findByRole('button', { name: 'Đang lưu...' })

    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument()

    release()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('mở lại cho kho khác thì bỏ lựa chọn và lỗi cũ', async () => {
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-2/available-members`, () => paginated(candidates)),
      mswHttp.put(`${BASE}/warehouses/kho-1/members`, () => apiError(422, 100524)),
    )
    const onOpenChange = vi.fn()
    const { user, rerender } = renderWithProviders(
      <AddWarehouseMemberDialog warehouse={kho} onOpenChange={onOpenChange} />,
      { auth: 'admin', queryClient: mutationToastQueryClient() },
    )
    await screen.findByText('Kho Hà Nội')
    await pickLan(user)
    await user.click(screen.getByRole('button', { name: 'Thêm thành viên' }))
    await screen.findByRole('alert')

    rerender(
      <AddWarehouseMemberDialog
        warehouse={{ slug: 'kho-2', name: 'Kho Đà Nẵng' }}
        onOpenChange={onOpenChange}
      />,
    )

    await screen.findByText('Kho Đà Nẵng')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm thành viên' })).toBeDisabled()
  })
})
