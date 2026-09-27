import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { storeKeys, type Store } from '@/entities/store'
import { warehouseKeys, type Warehouse } from '@/entities/warehouse'
import { AssignStoreWarehouseDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const warehouse = (slug: string, name: string, isActive = true): Warehouse => ({
  slug,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name,
  code: slug.toUpperCase(),
  address: 'Hà Nội',
  isActive,
})

const warehouses = [
  warehouse('kho-1', 'Kho trống'),
  warehouse('kho-2', 'Kho của cửa hàng khác'),
  warehouse('kho-3', 'Kho đã ngừng', false),
]

const store: Store = {
  slug: 'ch-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Cửa hàng Hà Nội 1',
  code: 'ST-HN-01',
  legalName: 'Công ty TNHH ABC',
  taxCode: '0101234567',
  isActive: true,
}

function renderDialog(
  target: Store | null = store,
  assigned: string[] = ['kho-2'],
  queryClient?: ReturnType<typeof mutationToastQueryClient>,
) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(
      <AssignStoreWarehouseDialog
        store={target}
        assignedWarehouseSlugs={assigned}
        onOpenChange={onOpenChange}
      />,
      { auth: 'admin', queryClient },
    ),
  }
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  server.use(mswHttp.get(`${BASE}/warehouses`, () => paginated(warehouses)))
})

describe('AssignStoreWarehouseDialog', () => {
  it('đóng thì KHÔNG tải danh sách kho', async () => {
    let called = false
    server.use(
      mswHttp.get(`${BASE}/warehouses`, () => {
        called = true
        return paginated(warehouses)
      }),
    )
    renderDialog(null)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(called).toBe(false)
  })

  it('chỉ liệt kê kho đang hoạt động VÀ chưa gán cho cửa hàng khác', async () => {
    const { user } = renderDialog()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('combobox'))

    const list = await screen.findByRole('listbox')
    expect(within(list).getByText('Kho trống')).toBeInTheDocument()
    expect(within(list).queryByText('Kho của cửa hàng khác')).not.toBeInTheDocument()
    expect(within(list).queryByText('Kho đã ngừng')).not.toBeInTheDocument()
  })

  it('không còn kho nào hợp lệ (đã ngừng hoặc đã bị gán) → ô chọn hiện câu rỗng riêng', async () => {
    server.use(
      mswHttp.get(`${BASE}/warehouses`, () =>
        paginated([
          warehouse('kho-1', 'Kho đã ngừng', false),
          warehouse('kho-2', 'Kho của cửa hàng khác'),
        ]),
      ),
    )
    const { user } = renderDialog(store, ['kho-2'])
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('combobox'))

    expect(
      await screen.findByText('Không còn kho nào đang hoạt động và chưa được gán'),
    ).toBeInTheDocument()
  })

  it('kho của CHÍNH cửa hàng đang sửa vẫn nằm trong danh sách', async () => {
    const { user } = renderDialog({ ...store, warehouseSlug: 'kho-2', warehouseName: 'Kho 2' }, [
      'kho-2',
    ])
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('combobox'))

    const list = await screen.findByRole('listbox')
    expect(within(list).getByText('Kho của cửa hàng khác')).toBeInTheDocument()
  })

  it('chọn kho rồi Lưu → PUT warehouseSlug', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/stores/ch-ha-noi/warehouse`, async ({ request }) => {
        body = await request.json()
        return ok({ ...store, warehouseSlug: 'kho-1' })
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('Kho trống'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(body).toEqual({ warehouseSlug: 'kho-1' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('cửa hàng đang gắn kho: Bỏ gán gửi warehouseSlug: null', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/stores/ch-ha-noi/warehouse`, async ({ request }) => {
        body = await request.json()
        return ok(store)
      }),
    )
    const { user } = renderDialog({ ...store, warehouseSlug: 'kho-2', warehouseName: 'Kho 2' })

    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Bỏ gán' }))

    await waitFor(() => expect(body).toEqual({ warehouseSlug: null }))
  })

  it('cửa hàng chưa gắn kho: không có nút Bỏ gán, Lưu khoá khi chưa chọn', async () => {
    renderDialog()
    await screen.findByText('Cửa hàng Hà Nội 1')

    expect(screen.queryByRole('button', { name: 'Bỏ gán' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it.each([
    [101019, 'Kho đã được gán cho cửa hàng khác'],
    [101018, 'Kho đang ngừng hoạt động nên không gán được'],
    [101020, 'Kho đang bị một cửa hàng đã xoá giữ chỗ'],
  ])('lỗi %i hiện tại ô chọn, hộp vẫn mở, và tải lại danh sách kho', async (code, message) => {
    server.use(mswHttp.put(`${BASE}/stores/ch-ha-noi/warehouse`, () => apiError(422, code)))
    // Client mặc định của renderWithProviders không có MutationCache.onError — trên nó
    // `toast.error` không bao giờ được gọi dù có mất `meta.suppressErrorToast` hay không. Phải
    // dùng client mang chốt chặn toast như app thật thì khẳng định "không toast" mới có ý nghĩa.
    const { user, queryClient, onOpenChange } = renderDialog(
      store,
      ['kho-2'],
      mutationToastQueryClient(),
    )
    await screen.findByText('Cửa hàng Hà Nội 1')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('Kho trống'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    // Cả hai danh sách đều đã cũ: "kho còn trống" ở StoresPage tính từ dữ liệu CỬA HÀNG
    // (`warehouseSlug` của từng dòng), không phải từ chính danh sách kho. Chỉ tải lại
    // `warehouseKeys.all` không xoá được cái khiến ô chọn tiếp tục gợi ý đúng kho vừa bị từ chối —
    // phải tải lại `storeKeys.all` nữa thì trang mới có dữ liệu mới để tính lại
    // `assignedWarehouseSlugs`.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: warehouseKeys.all })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: storeKeys.all })
  })

  it('lỗi ngoài ô chọn → toast và đóng hộp', async () => {
    server.use(mswHttp.put(`${BASE}/stores/ch-ha-noi/warehouse`, () => apiError(500)))
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('Kho trống'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // Carry-over Task 9: hộp một ô đối xứng với AssignWarehouseManagerDialog (Task 6) — cùng chốt
  // chặn Esc / click ngoài / nút × khi đang gán.
  it('đang gửi thì không đóng được hộp bằng Esc, và không còn nút ×', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.put(`${BASE}/stores/ch-ha-noi/warehouse`, async () => {
        await gate
        return ok({ ...store, warehouseSlug: 'kho-1' })
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('Kho trống'))
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
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
