import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { Role, User } from '@/entities/user'
import type { Warehouse } from '@/entities/warehouse'
import { AssignWarehouseManagerDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const roles: Role[] = [
  { slug: 'r-admin', name: 'ADMIN', authorityCodes: [] },
  { slug: 'r-manager', name: 'MANAGER', authorityCodes: [] },
]

const managers: User[] = [
  {
    slug: 'u-a',
    createdAt: '',
    updatedAt: '',
    phonenumber: '0901111111',
    isActive: true,
    roleSlug: 'r-manager',
    roleName: 'MANAGER',
  },
  {
    slug: 'u-locked',
    createdAt: '',
    updatedAt: '',
    phonenumber: '0902222222',
    isActive: false,
    roleSlug: 'r-manager',
    roleName: 'MANAGER',
  },
]

const warehouse: Warehouse = {
  slug: 'kho-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Kho Hà Nội 1',
  code: 'WH-HN-01',
  address: 'Số 1, Cầu Giấy, Hà Nội',
  isActive: true,
}

function renderDialog(target: Warehouse | null = warehouse) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(
      <AssignWarehouseManagerDialog warehouse={target} onOpenChange={onOpenChange} />,
      { auth: 'admin' },
    ),
  }
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  server.use(
    mswHttp.get(`${BASE}/roles`, () => ok(roles)),
    mswHttp.get(`${BASE}/users`, () => paginated(managers)),
  )
})

describe('AssignWarehouseManagerDialog', () => {
  it('warehouse = null thì không render', () => {
    renderDialog(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('hiện tên kho và chỉ liệt kê người vai trò MANAGER đang hoạt động', async () => {
    const { user } = renderDialog()

    expect(await screen.findByText('Kho Hà Nội 1')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox'))

    const list = await screen.findByRole('listbox')
    expect(within(list).getByText('0901111111')).toBeInTheDocument()
    expect(within(list).queryByText('0902222222')).not.toBeInTheDocument()
  })

  it('chọn người rồi Lưu → PUT managerSlug', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, async ({ request }) => {
        body = await request.json()
        return ok({ ...warehouse, managerSlug: 'u-a' })
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(body).toEqual({ managerSlug: 'u-a' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('kho chưa có quản lý: KHÔNG có nút Bỏ gán, và Lưu bị khoá khi chưa chọn ai', async () => {
    renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    expect(screen.queryByRole('button', { name: 'Bỏ gán' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('kho đang có quản lý: nút Bỏ gán gửi managerSlug: null', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, async ({ request }) => {
        body = await request.json()
        return ok({ ...warehouse })
      }),
    )
    const { user, onOpenChange } = renderDialog({
      ...warehouse,
      managerSlug: 'u-a',
      managerPhonenumber: '0901111111',
    })
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Bỏ gán' }))

    await waitFor(() => expect(body).toEqual({ managerSlug: null }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it.each([
    [100515, 'Người quản lý đang bị khoá'],
    [100516, 'Người quản lý phải có vai trò MANAGER'],
    [100514, 'Không tìm thấy người quản lý'],
  ])('lỗi %i hiện NGAY TRONG hộp, không toast, hộp vẫn mở', async (code, message) => {
    server.use(mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, () => apiError(422, code)))
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('lỗi không thuộc ô chọn → toast và đóng hộp', async () => {
    server.use(mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, () => apiError(500)))
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('quản lý đang giữ chức bị khoá vẫn hiện trong ô chọn', async () => {
    const { user } = renderDialog({
      ...warehouse,
      managerSlug: 'u-locked',
      managerPhonenumber: '0902222222',
    })
    await screen.findByText('Kho Hà Nội 1')

    // Người này không nằm trong danh sách ứng viên (isActive = false) — hộp tự chèn vào, nếu không
    // ô chọn trông như đang trống dù kho đang có quản lý.
    expect(screen.getByRole('combobox')).toHaveTextContent('0902222222')
    await user.click(screen.getByRole('combobox'))
    expect(within(await screen.findByRole('listbox')).getByText('0902222222')).toBeInTheDocument()
  })

  it('đang gửi thì không đóng được hộp bằng Esc, và không còn nút ×', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, async () => {
        await gate
        return ok({ ...warehouse, managerSlug: 'u-a' })
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await screen.findByRole('button', { name: 'Đang lưu...' })

    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument()

    release()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('lúc rảnh thì Esc vẫn đóng được hộp', async () => {
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    await user.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('/roles lỗi → KHÔNG báo "chưa có vai trò MANAGER" và không khoá ô chọn', async () => {
    server.use(mswHttp.get(`${BASE}/roles`, () => apiError(500, undefined, 'Boom')))
    renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled())
    expect(screen.queryByText('Chưa có vai trò MANAGER')).not.toBeInTheDocument()
  })

  it('chưa có vai trò MANAGER → nói rõ lý do và khoá ô chọn', async () => {
    server.use(mswHttp.get(`${BASE}/roles`, () => ok([roles[0]])))
    renderDialog()

    expect(await screen.findByText('Chưa có vai trò MANAGER')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
