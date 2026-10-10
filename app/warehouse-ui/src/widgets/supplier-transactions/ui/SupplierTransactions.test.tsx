import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom không đo kích thước — giả kết quả đo của thanh công cụ. Mặc định: vừa một hàng.
const fit = vi.hoisted(() => ({ fits: true }))
vi.mock('@/shared/ui/data-table/toolbar-fit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/ui/data-table/toolbar-fit')>()
  return {
    ...actual,
    useToolbarFit: () => ({
      rowRef: { current: null },
      filtersRef: { current: null },
      actionsRef: { current: null },
      fits: fit.fits,
    }),
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import {
  toTransactionRange,
  type SupplierMaterial,
  type SupplierTransaction,
} from '@/entities/supplier'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders, renderWithRouter } from '@/shared/test/render'
import { SupplierTransactions } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const supplier = { slug: 's-1', code: 'NCC-HN-01' }

const purchase: SupplierTransaction = {
  slug: 't-1',
  createdAt: '',
  updatedAt: '',
  type: 'PURCHASE',
  transactionDate: '2026-10-05T05:00:00.000Z',
  materialSlug: 'm-1',
  materialCode: 'NL04',
  materialName: 'Bột giặt',
  quantity: 2,
  unitPrice: 10000,
  amount: 20000,
}
const material: SupplierMaterial = {
  slug: 'm-1',
  createdAt: '',
  updatedAt: '',
  code: 'NL04',
  name: 'Bột giặt',
  typeName: 'Hoá chất',
  baseUnitName: 'kg',
}

function mockApi(items: SupplierTransaction[] = [purchase]) {
  const urls: URL[] = []
  server.use(
    mswHttp.get(`${BASE}/suppliers/s-1/transactions`, ({ request }) => {
      const url = new URL(request.url)
      urls.push(url)
      return paginated(items, { page: 1 })
    }),
    mswHttp.get(`${BASE}/suppliers/s-1/materials`, () => paginated([material])),
  )
  return urls
}

const noop = () => {}

/** Dòng giao dịch trong bảng (cùng chữ với mục trong ô lọc Vật tư). */
const findRow = async () => within(await screen.findByRole('table')).findByText('NL04 · Bột giặt')

function renderAt(route: string, canRecord = false, canViewMaterials = true) {
  return renderWithRouter(
    [
      {
        path: '/suppliers/:slug',
        element: (
          <SupplierTransactions
            supplier={supplier}
            canRecord={canRecord}
            canViewMaterials={canViewMaterials}
            onGoToMaterials={noop}
          />
        ),
      },
    ],
    { route, auth: 'admin' },
  )
}

describe('SupplierTransactions', () => {
  afterEach(() => {
    fit.fits = true
  })

  it('hiện bảng đủ cột và ghi chú bất biến', async () => {
    mockApi()
    renderWithProviders(
      <SupplierTransactions
        supplier={supplier}
        canRecord={false}
        canViewMaterials
        onGoToMaterials={noop}
      />,
      { auth: 'admin' },
    )

    expect(await findRow()).toBeInTheDocument()
    expect(screen.getByText('Giao dịch đã ghi không sửa hay xoá được.')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Thời gian',
      'Loại',
      'Vật tư',
      'Số lượng',
      'Đơn giá',
      'Thành tiền',
      'Người ghi',
      'Ghi chú',
    ])
  })

  it('rỗng → "Chưa có giao dịch nào."', async () => {
    mockApi([])
    renderWithProviders(
      <SupplierTransactions
        supplier={supplier}
        canRecord={false}
        canViewMaterials
        onGoToMaterials={noop}
      />,
      { auth: 'admin' },
    )
    expect(await screen.findByText('Chưa có giao dịch nào.')).toBeInTheDocument()
  })

  it('đang lọc mà rỗng → "Không có kết quả." (không phải "Chưa có giao dịch nào.")', async () => {
    mockApi([])
    renderAt('/suppliers/s-1?tab=transactions&type=PAYMENT')
    expect(await screen.findByText('Không có kết quả.')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có giao dịch nào.')).not.toBeInTheDocument()
  })

  it('canViewMaterials=false → không gọi API vật tư, ẩn bộ lọc Vật tư', async () => {
    mockApi()
    let materialHits = 0
    server.use(
      mswHttp.get(`${BASE}/suppliers/s-1/materials`, () => {
        materialHits += 1
        return paginated([material])
      }),
    )
    renderAt('/suppliers/s-1?tab=transactions', false, false)
    await findRow()

    expect(screen.queryByRole('combobox', { name: 'Vật tư' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Loại' })).toBeInTheDocument()
    expect(materialHits).toBe(0)
  })

  it('lọc theo URL gửi type, materialSlug, from/to giờ máy; đổi lọc vẫn giữ ?tab=', async () => {
    const urls = mockApi()
    const { router, user } = renderAt(
      '/suppliers/s-1?tab=transactions&type=PAYMENT&materialSlug=m-1&startDate=2026-10-01&endDate=2026-10-07',
    )
    await findRow()

    const range = toTransactionRange('2026-10-01', '2026-10-07')
    const sent = urls[urls.length - 1].searchParams
    expect(sent.get('type')).toBe('PAYMENT')
    expect(sent.get('materialSlug')).toBe('m-1')
    expect(sent.get('from')).toBe(range.from)
    expect(sent.get('to')).toBe(range.to)
    expect(sent.get('startDate')).toBeNull()

    await user.click(screen.getByRole('combobox', { name: 'Loại' }))
    await user.click(await screen.findByRole('option', { name: 'Trả hàng' }))
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search)
      expect(params.get('type')).toBe('RETURN')
      expect(params.get('tab')).toBe('transactions')
    })
  })

  it('ô Loại có đủ lựa chọn; ô Vật tư lấy từ vật tư của nhà cung cấp', async () => {
    mockApi()
    const { user } = renderAt('/suppliers/s-1')
    await findRow()

    await user.click(screen.getByRole('combobox', { name: 'Loại' }))
    const types = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(types.map((o) => o.textContent)).toEqual([
      'Tất cả loại',
      'Mua hàng',
      'Trả hàng',
      'Thanh toán',
    ])
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('combobox', { name: 'Vật tư' }))
    const mats = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(mats.map((o) => o.textContent)).toEqual(['Tất cả vật tư', 'NL04 · Bột giặt'])
  })

  it('canRecord=false → không có nút Ghi giao dịch', async () => {
    mockApi()
    renderAt('/suppliers/s-1')
    await findRow()
    expect(screen.queryByRole('button', { name: 'Ghi giao dịch' })).not.toBeInTheDocument()
  })

  it('canRecord=true → nút mở sheet ghi giao dịch', async () => {
    mockApi()
    const { user } = renderAt('/suppliers/s-1', true)
    await findRow()

    await user.click(screen.getByRole('button', { name: 'Ghi giao dịch' }))
    expect(await screen.findByRole('dialog', { name: 'Ghi giao dịch' })).toBeInTheDocument()
  })

  it('"Xoá bộ lọc" xoá cả 4 tham số, giữ ?tab=', async () => {
    fit.fits = false // thu bộ lọc vào popover — nơi nút Xoá bộ lọc nằm
    mockApi()
    const { router, user } = renderAt(
      '/suppliers/s-1?tab=transactions&type=PAYMENT&materialSlug=m-1&startDate=2026-10-01&endDate=2026-10-07',
    )
    await findRow()

    await user.click(screen.getByRole('button', { name: /^Bộ lọc/ }))
    await user.click(await screen.findByRole('button', { name: 'Xoá bộ lọc' }))
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search)
      for (const k of ['type', 'materialSlug', 'startDate', 'endDate']) {
        expect(params.has(k)).toBe(false)
      }
      expect(params.get('tab')).toBe('transactions')
    })
  })
})
