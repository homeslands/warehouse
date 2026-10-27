import { screen, waitFor, within } from '@testing-library/react'
import { delay, http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { confirmStep } from '@/shared/test/confirm'
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

  it('người có họ tên → "Họ Tên (số điện thoại)"; gõ tên để tìm được', async () => {
    server.use(
      mswHttp.get(`${BASE}/users`, () =>
        paginated([{ ...managers[0], lastName: 'Nguyễn', firstName: 'Văn A' }]),
      ),
    )
    const { user } = renderDialog()

    await user.click(await screen.findByRole('combobox'))
    await user.keyboard('Văn A')

    expect(
      within(await screen.findByRole('listbox')).getByText('Nguyễn Văn A (0901111111)'),
    ).toBeInTheDocument()
  })

  it('chọn người rồi Lưu → PUT managerSlug', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, async ({ request }) => {
        body = await request.json()
        return ok({
          ...warehouse,
          manager: { slug: 'u-a', phonenumber: '0901111111', firstName: '', lastName: '' },
        })
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmStep(user, 'Xác nhận gán')

    await waitFor(() => expect(body).toEqual({ managerSlug: 'u-a' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('kho chưa có quản lý: KHÔNG có nút Bỏ gán, và Lưu bị khoá khi chưa chọn ai', async () => {
    renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    expect(screen.queryByRole('button', { name: 'Bỏ gán' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('mở với quản lý hiện tại được chọn sẵn → Lưu khoá, không có bước xác nhận', async () => {
    const { user } = renderDialog({
      ...warehouse,
      manager: { slug: 'u-a', phonenumber: '0901111111', firstName: '', lastName: '' },
    })
    await screen.findByText('Kho Hà Nội 1')

    const save = screen.getByRole('button', { name: 'Lưu' })
    expect(save).toBeDisabled()
    await user.click(save)
    expect(screen.queryByText(/Xác nhận gán/)).not.toBeInTheDocument()
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
      manager: { slug: 'u-a', phonenumber: '0901111111', firstName: '', lastName: '' },
    })
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Bỏ gán' }))
    await confirmStep(user, 'Xác nhận bỏ gán')

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
    await confirmStep(user, 'Xác nhận gán')

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    // Lỗi thuộc ô → về màn nhập để chọn lại.
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('lỗi không thuộc ô chọn → toast, ở lại màn xác nhận', async () => {
    server.use(mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, () => apiError(500)))
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmStep(user, 'Xác nhận gán')

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    // Lỗi ngoài ô: ở lại màn xác nhận, hộp không đóng.
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Xác nhận gán' })).toBeEnabled()
  })

  it('quản lý đang giữ chức bị khoá vẫn hiện trong ô chọn', async () => {
    const { user } = renderDialog({
      ...warehouse,
      manager: { slug: 'u-locked', phonenumber: '0902222222', firstName: '', lastName: '' },
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
        return ok({
          ...warehouse,
          manager: { slug: 'u-a', phonenumber: '0901111111', firstName: '', lastName: '' },
        })
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmStep(user, 'Xác nhận gán')
    await screen.findByRole('button', { name: 'Đang lưu...' })

    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument()

    release()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('bấm Lưu → màn xác nhận đúng câu, CHƯA gửi; xác nhận mới gửi', async () => {
    let calls = 0
    server.use(
      mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, () => {
        calls += 1
        return ok(warehouse)
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(
      await screen.findByRole('heading', { name: 'Gán 0901111111 làm quản lý kho Kho Hà Nội 1?' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(calls).toBe(0)

    await confirmStep(user, 'Xác nhận gán')
    await waitFor(() => expect(calls).toBe(1))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('"Quay lại" giữ lựa chọn; bấm Lưu lần nữa hỏi lại đúng tên', async () => {
    const { user } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await screen.findByRole('button', { name: 'Xác nhận gán' })

    await user.click(screen.getByRole('button', { name: 'Quay lại' }))

    expect(screen.getByRole('combobox')).toHaveTextContent('0901111111')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(
      await screen.findByRole('heading', { name: 'Gán 0901111111 làm quản lý kho Kho Hà Nội 1?' }),
    ).toBeInTheDocument()
  })

  it('Bỏ gán → màn xác nhận riêng ("Bỏ quản lý của kho …?"); Quay lại về màn nhập', async () => {
    const { user } = renderDialog({
      ...warehouse,
      manager: { slug: 'u-a', phonenumber: '0901111111', firstName: '', lastName: '' },
    })
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Bỏ gán' }))

    expect(
      await screen.findByRole('heading', { name: 'Bỏ quản lý của kho Kho Hà Nội 1?' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quay lại' }))
    expect(screen.getByRole('combobox')).toHaveTextContent('0901111111')
  })

  it('đóng rồi mở lại thì bắt đầu ở màn nhập', async () => {
    const onOpenChange = vi.fn()
    const { user, rerender } = renderWithProviders(
      <AssignWarehouseManagerDialog warehouse={warehouse} onOpenChange={onOpenChange} />,
      { auth: 'admin' },
    )
    await screen.findByText('Kho Hà Nội 1')
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await screen.findByRole('button', { name: 'Xác nhận gán' })

    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    rerender(<AssignWarehouseManagerDialog warehouse={null} onOpenChange={onOpenChange} />)
    rerender(<AssignWarehouseManagerDialog warehouse={warehouse} onOpenChange={onOpenChange} />)

    expect(await screen.findByRole('combobox')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận gán' })).not.toBeInTheDocument()
  })

  it('bấm đúp nút xác nhận → chỉ MỘT request', async () => {
    let calls = 0
    server.use(
      mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, async () => {
        calls += 1
        await delay(150)
        return ok(warehouse)
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Kho Hà Nội 1')
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('0901111111'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await user.dblClick(await screen.findByRole('button', { name: 'Xác nhận gán' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(calls).toBe(1)
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
