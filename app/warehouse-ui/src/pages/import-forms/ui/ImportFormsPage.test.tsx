import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ImportForm } from '@/entities/import-form'
import type { Warehouse } from '@/entities/warehouse'
import { apiError, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { chooseOption } from '@/shared/test/select'
import { ImportFormsPage } from './ImportFormsPage'

const draftForm: ImportForm = {
  slug: 'if-1',
  createdAt: '2026-10-12T02:00:00.000Z',
  updatedAt: '2026-10-12T02:00:00.000Z',
  version: 3,
  code: 'PN-0001',
  purchaseOrder: 'PO-12',
  invoiceCode: 'HD-123',
  requesterSlug: 'u-sup',
  requesterName: 'Nguyễn Văn A',
  approverSlug: null,
  approverName: null,
  date: '2026-10-12',
  total: 3_750_000,
  file: 'hoa-don-1760000000000.pdf',
  note: 'Giao buổi sáng',
  status: 'DRAFT',
  warehouseSlug: 'w-a',
  items: [
    {
      slug: 'it-1',
      createdAt: '',
      updatedAt: '',
      lineNo: 1,
      materialSlug: 'm-flour',
      materialCode: 'VT-01',
      materialName: 'Bột mì',
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      supplierSlug: 's-1',
      supplierCode: 'NCC-01',
      supplierName: 'NCC Bột',
      supplierTaxCode: '0101',
      supplierAddress: 'Hà Nội',
      quantity: 10,
      conversionRate: 25,
      baseQuantity: 250,
      unitPrice: 375_000,
      amount: 3_750_000,
      note: null,
    },
  ],
}

const BASE = 'http://localhost:8085/api/v1'
const kho = (slug: string, code: string, isActive = true) =>
  ({ slug, code, name: `Kho ${code}`, isActive }) as Warehouse

const SUP: TestAuth = {
  userName: 's',
  userSlug: 'u-sup',
  roleName: 'SUPERVISOR',
  scope: [
    'IMPORT_FORM_READ',
    'IMPORT_FORM_CREATE',
    'WAREHOUSE_READ',
    'IMPORT_FORM_DELETE_DRAFT_OWN',
  ],
}

function mock(warehouses: Warehouse[], form: ImportForm = draftForm) {
  const seen: URLSearchParams[] = []
  server.use(
    mswHttp.get(`${BASE}/warehouses`, () => paginated(warehouses)),
    mswHttp.get(`${BASE}/warehouses/:w/import-forms`, ({ request, params }) => {
      const sp = new URL(request.url).searchParams
      sp.set('_w', String(params.w))
      seen.push(sp)
      return paginated([form])
    }),
  )
  return seen
}

function renderPage(route = '/import-forms', auth: TestAuth = SUP) {
  return renderWithRouter(
    [
      { path: '/import-forms', element: <ImportFormsPage /> },
      { path: '/import-forms/new', element: <p>TRANG TẠO</p> },
      { path: '/import-forms/:slug', element: <p>TRANG CHI TIẾT</p> },
    ],
    { route, auth },
  )
}

describe('ImportFormsPage', () => {
  it('thiếu ?warehouse → chọn kho đầu, ghi lên URL, tải phiếu của kho đó (sort createdAt:DESC)', async () => {
    const seen = mock([kho('w-a', 'A'), kho('w-b', 'B')])
    const { router } = renderPage()
    expect(await screen.findByRole('link', { name: 'PN-0001' })).toBeInTheDocument()
    expect(router.state.location.search).toContain('warehouse=w-a')
    expect(seen.at(-1)?.get('_w')).toBe('w-a')
    expect(seen.at(-1)?.get('sort[]')).toBe('createdAt:DESC')
  })

  it('đổi kho → tải lại theo kho mới, về trang 1', async () => {
    const seen = mock([kho('w-a', 'A'), kho('w-b', 'B')])
    const { user } = renderPage('/import-forms?warehouse=w-a&page=2')
    await screen.findByRole('link', { name: 'PN-0001' })
    await chooseOption(user, 'Kho', 'B · Kho B')
    await waitFor(() => expect(seen.at(-1)?.get('_w')).toBe('w-b'))
    expect(seen.at(-1)?.get('page')).toBe('1')
  })

  it('lọc trạng thái gửi status', async () => {
    const seen = mock([kho('w-a', 'A')])
    const { user } = renderPage('/import-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PN-0001' })
    await chooseOption(user, 'Trạng thái', 'Đã xác nhận')
    await waitFor(() => expect(seen.at(-1)?.get('status')).toBe('CONFIRMED'))
  })

  it('kho ngừng hoạt động → nút Tạo khoá kèm lý do', async () => {
    mock([kho('w-a', 'A', false)])
    renderPage('/import-forms?warehouse=w-a')
    const create = await screen.findByRole('button', { name: 'Tạo phiếu' })
    expect(create).toBeDisabled()
    expect(create).toHaveAccessibleDescription(
      'Kho đang ngừng hoạt động — không tạo được phiếu mới.',
    )
  })

  it('không có kho nào → câu báo, không gọi danh sách phiếu', async () => {
    const seen = mock([])
    renderPage()
    expect(
      await screen.findByText('Bạn chưa thuộc kho nào nên chưa xem được phiếu nhập.'),
    ).toBeInTheDocument()
    expect(seen).toHaveLength(0)
  })

  it('không có IMPORT_FORM_CREATE → không có nút Tạo', async () => {
    mock([kho('w-a', 'A')])
    renderPage('/import-forms?warehouse=w-a', {
      userName: 'm',
      roleName: 'MANAGER',
      scope: ['IMPORT_FORM_READ', 'WAREHOUSE_READ'],
    })
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(screen.queryByRole('button', { name: 'Tạo phiếu' })).not.toBeInTheDocument()
  })

  it('bấm hàng → chi tiết', async () => {
    mock([kho('w-a', 'A')])
    const { user, router } = renderPage('/import-forms?warehouse=w-a')
    await user.click(await screen.findByText('HD-123'))
    expect(await screen.findByText('TRANG CHI TIẾT')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?warehouse=w-a')
  })

  it('bấm hàng → chi tiết mang backTo là đường dẫn danh sách', async () => {
    mock([kho('w-a', 'A')])
    const { user, router } = renderPage('/import-forms?warehouse=w-a')
    await user.click(await screen.findByText('HD-123'))
    await screen.findByText('TRANG CHI TIẾT')
    expect(router.state.location.state).toEqual({ backTo: '/import-forms?warehouse=w-a' })
  })

  it('?warehouse không hợp lệ → ghi lại kho đầu và tải phiếu kho đó', async () => {
    const seen = mock([kho('w-a', 'A'), kho('w-b', 'B')])
    const { router } = renderPage('/import-forms?warehouse=zzz')
    expect(await screen.findByRole('link', { name: 'PN-0001' })).toBeInTheDocument()
    expect(router.state.location.search).toContain('warehouse=w-a')
    expect(seen.at(-1)?.get('_w')).toBe('w-a')
    expect(seen.map((x) => x.get('_w'))).not.toContain('zzz')
  })

  it('GET /warehouses lỗi 500 → báo lỗi, không gọi danh sách phiếu', async () => {
    const seen = mock([])
    server.use(mswHttp.get(`${BASE}/warehouses`, () => apiError(500)))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(seen).toHaveLength(0)
  })

  describe('thao tác hàng', () => {
    const openMenu = async (user: Awaited<ReturnType<typeof renderPage>>['user']) =>
      user.click(await screen.findByRole('button', { name: 'Thao tác cho phiếu PN-0001' }))

    it('phiếu nháp của mình → có Sửa, Xoá; Xoá mở hộp xác nhận', async () => {
      mock([kho('w-a', 'A')], { ...draftForm, requesterSlug: 'u-sup' })
      const { user } = renderPage('/import-forms?warehouse=w-a')
      await openMenu(user)
      expect(await screen.findByRole('menuitem', { name: 'Xem chi tiết' })).toBeInTheDocument()
      await user.click(await screen.findByRole('menuitem', { name: 'Xoá phiếu' }))
      expect(await screen.findByRole('alertdialog')).toHaveTextContent('Xoá phiếu nhập PN-0001')
    })

    it('phiếu nháp của người khác → không có Sửa, Xoá', async () => {
      mock([kho('w-a', 'A')], { ...draftForm, requesterSlug: 'u-other' })
      const { user } = renderPage('/import-forms?warehouse=w-a')
      await openMenu(user)
      expect(await screen.findByRole('menuitem', { name: 'Xem chi tiết' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Xoá phiếu' })).not.toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Sửa' })).not.toBeInTheDocument()
    })

    it('phiếu đã xác nhận → chỉ còn Xem chi tiết', async () => {
      mock([kho('w-a', 'A')], { ...draftForm, requesterSlug: 'u-sup', status: 'CONFIRMED' })
      const { user } = renderPage('/import-forms?warehouse=w-a')
      await openMenu(user)
      expect(await screen.findByRole('menuitem', { name: 'Xem chi tiết' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Xoá phiếu' })).not.toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Sửa' })).not.toBeInTheDocument()
    })
  })
})
