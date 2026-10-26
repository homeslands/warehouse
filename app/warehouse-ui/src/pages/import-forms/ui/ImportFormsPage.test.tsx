import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImportForm } from '@/entities/import-form'
import type { Warehouse } from '@/entities/warehouse'
import { apiError, ok, paginated } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { chooseOption } from '@/shared/test/select'
import { mockMobileViewport } from '@/shared/test/viewport'
import { ImportFormsPage } from './ImportFormsPage'

// jsdom không đo kích thước — giả kết quả đo "vừa / không vừa một hàng". Mặc định: vừa.
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
      expiryDate: null,
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
    'IMPORT_FORM_UPDATE_DRAFT_OWN',
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
      { path: '/import-forms/:slug', element: <p>TRANG CHI TIẾT</p> },
    ],
    { route, auth },
  )
}

describe('ImportFormsPage', () => {
  afterEach(() => {
    fit.fits = true
  })

  it('thiếu ?warehouse → chọn kho đầu, ghi lên URL, tải phiếu của kho đó (không gửi sort)', async () => {
    const seen = mock([kho('w-a', 'A'), kho('w-b', 'B')])
    const { router } = renderPage()
    expect(await screen.findByRole('link', { name: 'PN-0001' })).toBeInTheDocument()
    expect(router.state.location.search).toContain('warehouse=w-a')
    expect(seen.at(-1)?.get('_w')).toBe('w-a')
    expect(seen.at(-1)?.has('sort')).toBe(false)
    expect(seen.at(-1)?.has('sortBy')).toBe(false)
    expect(seen.at(-1)?.has('sort[]')).toBe(false)
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

  it('ô Kho nằm ở đầu trang cạnh tiêu đề, không nằm trên thanh lọc', async () => {
    mock([kho('w-a', 'A'), kho('w-b', 'B')])
    renderPage('/import-forms?warehouse=w-b')
    await screen.findByRole('link', { name: 'PN-0001' })
    const picker = screen.getByRole('combobox', { name: 'Kho' })
    expect(picker).toHaveTextContent('B · Kho B')
    const row = screen
      .getByRole('combobox', { name: 'Trạng thái' })
      .closest('[data-slot="toolbar-row"]')
    expect(row).not.toBeNull()
    expect(row).not.toContainElement(picker)
    expect(row).toContainElement(screen.getByRole('button', { name: 'Tạo phiếu' }))
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.parentElement).toContainElement(picker)
  })

  it('bấm chữ "Kho:" ở đầu trang thì mở ô chọn kho (label gắn thật)', async () => {
    mock([kho('w-a', 'A')])
    const { user } = renderPage('/import-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PN-0001' })
    const picker = screen.getByLabelText('Kho')
    expect(picker).toBe(screen.getByRole('combobox', { name: 'Kho' }))
    await user.click(screen.getByText('Kho', { selector: 'label' }))
    // Bấm nhãn kích hoạt nút (như bấm thẳng vào ô) → danh sách kho mở ra.
    expect(picker).toHaveAttribute('aria-expanded', 'true')
  })

  it('popover Bộ lọc không còn ô Kho; ô người có nhãn phía trên', async () => {
    fit.fits = false
    mock([kho('w-a', 'A')])
    mockUsers()
    const { user } = renderPage('/import-forms?warehouse=w-a', ME)
    await screen.findByRole('link', { name: 'PN-0001' })
    // Kho vẫn hiện (đầu trang) khi bộ lọc đã gom.
    expect(screen.getByRole('combobox', { name: 'Kho' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Bộ lọc/ }))
    const panel = await screen.findByRole('dialog', { name: 'Bộ lọc' })
    expect(within(panel).queryByRole('combobox', { name: 'Kho' })).not.toBeInTheDocument()
    // Nhãn chỉ ở phía trên; chữ trong ô là placeholder trung tính, không lặp lại nhãn.
    expect(within(panel).getAllByText('Người lập')).toHaveLength(1)
    expect(within(panel).getAllByText('Người xác nhận')).toHaveLength(1)
    expect(within(panel).getByRole('combobox', { name: 'Người lập' })).toHaveTextContent('Tất cả')
    expect(within(panel).getByRole('combobox', { name: 'Người lập' })).toBeInTheDocument()
    // Trạng thái (≤ 4 lựa chọn) là nút bấm nhanh.
    expect(within(panel).getByRole('button', { name: 'Đã xác nhận' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('bấm Tạo phiếu → mở sheet tạo ngay trên danh sách, không điều hướng', async () => {
    mock([kho('w-a', 'A')])
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/import-forms/available-materials`, () => paginated([])),
    )
    const { user, router } = renderPage('/import-forms?warehouse=w-a')
    await user.click(await screen.findByRole('button', { name: 'Tạo phiếu' }))
    expect(
      await screen.findByRole('dialog', { name: 'Tạo phiếu nhập · Kho A' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/import-forms')
    expect(screen.getByRole('link', { name: 'PN-0001', hidden: true })).toBeInTheDocument()
  })

  it.each([
    ['có MATERIAL_READ', true],
    ['không có MATERIAL_READ', false],
  ])('sheet tạo, %s → ô vật tư %s nút "Thêm vật tư vào kho…"', async (_name, allowed) => {
    mock([kho('w-a', 'A')])
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/import-forms/available-materials`, () => paginated([])),
    )
    const { user } = renderPage('/import-forms?warehouse=w-a', {
      ...SUP,
      scope: [...SUP.scope, ...(allowed ? ['MATERIAL_READ'] : [])],
    })
    await user.click(await screen.findByRole('button', { name: 'Tạo phiếu' }))
    // Dòng vật tư ở bước ②: qua ① trước (số hoá đơn bắt buộc).
    await user.type(await screen.findByRole('textbox', { name: /^Số hoá đơn/ }), 'HD-9')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    const entry = screen.queryByRole('button', { name: /Thêm vật tư vào kho/ })
    if (allowed) expect(entry).toBeInTheDocument()
    else expect(entry).not.toBeInTheDocument()
  })

  it('đóng sheet tạo (chưa sửa gì) → về danh sách, sheet biến mất', async () => {
    mock([kho('w-a', 'A')])
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/import-forms/available-materials`, () => paginated([])),
    )
    const { user } = renderPage('/import-forms?warehouse=w-a')
    await user.click(await screen.findByRole('button', { name: 'Tạo phiếu' }))
    await screen.findByRole('dialog', { name: 'Tạo phiếu nhập · Kho A' })
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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

    it('Sửa → mở sheet sửa phiếu đó (tự tải chi tiết), không điều hướng', async () => {
      mock([kho('w-a', 'A')], { ...draftForm, requesterSlug: 'u-sup' })
      server.use(
        mswHttp.get(`${BASE}/warehouses/w-a/import-forms/if-1`, () => ok(draftForm)),
        mswHttp.get(`${BASE}/warehouses/w-a/import-forms/available-materials`, () => paginated([])),
      )
      const { user, router } = renderPage('/import-forms?warehouse=w-a')
      await openMenu(user)
      await user.click(await screen.findByRole('menuitem', { name: 'Sửa' }))
      expect(
        await screen.findByRole('dialog', { name: 'Sửa phiếu nhập PN-0001' }),
      ).toBeInTheDocument()
      // Sửa mở ở bước ② — ô Số hoá đơn đã điền sẵn nhưng nằm ở bước ① đang ẩn.
      expect(await screen.findByRole('textbox', { name: /^Số hoá đơn/, hidden: true })).toHaveValue(
        'HD-123',
      )
      expect(router.state.location.pathname).toBe('/import-forms')
    })

    it('Sửa khi chi tiết còn đang tải → tiêu đề đã có mã phiếu, chưa hiện Tổng', async () => {
      mock([kho('w-a', 'A')], { ...draftForm, requesterSlug: 'u-sup' })
      let release: () => void = () => {}
      const gate = new Promise<void>((r) => (release = r))
      server.use(
        mswHttp.get(`${BASE}/warehouses/w-a/import-forms/if-1`, async () => {
          await gate
          return ok(draftForm)
        }),
        mswHttp.get(`${BASE}/warehouses/w-a/import-forms/available-materials`, () => paginated([])),
      )
      const { user } = renderPage('/import-forms?warehouse=w-a')
      await openMenu(user)
      await user.click(await screen.findByRole('menuitem', { name: 'Sửa' }))
      const dialog = await screen.findByRole('dialog', { name: 'Sửa phiếu nhập PN-0001' })
      expect(within(dialog).queryByText(/^Tổng:/)).not.toBeInTheDocument()
      release()
      expect(await within(dialog).findByText(/^Tổng:/)).toBeInTheDocument()
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

describe('ImportFormsPage — sắp xếp theo cột', () => {
  it('bấm tiêu đề Mã phiếu: tăng dần → giảm dần → bỏ sắp xếp (không gửi sort/sortBy)', async () => {
    const seen = mock([kho('w-a', 'A')])
    const { user } = renderPage('/import-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(seen.at(-1)?.has('sortBy')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Mã phiếu' }))
    await waitFor(() => {
      expect(seen.at(-1)?.get('sortBy')).toBe('code')
      expect(seen.at(-1)?.get('sort')).toBe('ASC')
    })

    await user.click(screen.getByRole('button', { name: 'Mã phiếu' }))
    await waitFor(() => expect(seen.at(-1)?.get('sort')).toBe('DESC'))

    await user.click(screen.getByRole('button', { name: 'Mã phiếu' }))
    await waitFor(() => expect(seen.at(-1)?.has('sortBy')).toBe(false))
    expect(seen.at(-1)?.has('sort')).toBe(false)
  })

  it('cột Ngày nhập (importDate) không sắp xếp được — BE không sắp theo trường này', async () => {
    mock([kho('w-a', 'A')])
    renderPage('/import-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(screen.queryByRole('button', { name: 'Ngày nhập' })).not.toBeInTheDocument()
  })
})

describe('ImportFormsPage — lọc ngày tạo', () => {
  afterEach(() => vi.restoreAllMocks())

  it('URL startDate/endDate → gửi đúng, nút hiện khoảng', async () => {
    const seen = mock([kho('w-a', 'A')])
    renderPage('/import-forms?warehouse=w-a&startDate=2026-10-01&endDate=2026-10-15')
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(screen.getByRole('button', { name: /^Ngày tạo: / })).toHaveTextContent(
      '01/10/2026 – 15/10/2026',
    )
    expect(seen.at(-1)?.get('startDate')).toBe('2026-10-01')
    expect(seen.at(-1)?.get('endDate')).toBe('2026-10-15')
  })

  it('URL ngược chiều → đảo lại', async () => {
    const seen = mock([kho('w-a', 'A')])
    renderPage('/import-forms?warehouse=w-a&startDate=2026-10-15&endDate=2026-10-01')
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(seen.at(-1)?.get('startDate')).toBe('2026-10-01')
    expect(seen.at(-1)?.get('endDate')).toBe('2026-10-15')
  })

  it('Xoá bộ lọc → hết ngày và trạng thái, nhưng giữ kho', async () => {
    mockMobileViewport()
    const seen = mock([kho('w-a', 'A'), kho('w-b', 'B')])
    const { user, router } = renderPage(
      '/import-forms?warehouse=w-b&status=DRAFT&startDate=2026-10-01&endDate=2026-10-15',
    )
    await screen.findByRole('link', { name: 'PN-0001' })
    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }))
    await waitFor(() => {
      expect(seen.at(-1)?.has('startDate')).toBe(false)
      expect(seen.at(-1)?.has('endDate')).toBe(false)
      expect(seen.at(-1)?.has('status')).toBe(false)
    })
    expect(seen.at(-1)?.get('_w')).toBe('w-b')
    expect(router.state.location.search).toContain('warehouse=w-b')
  })

  it('chỉ chọn kho (không lọc gì) → không có nút Xoá bộ lọc', async () => {
    mock([kho('w-a', 'A')])
    mockMobileViewport()
    renderPage('/import-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument()
  })
})

describe('ImportFormsPage — ô tìm', () => {
  afterEach(() => vi.restoreAllMocks())

  it('gõ "hd-0001" chọn Số hoá đơn → chỉ gửi invoiceCode; đổi sang Mã phiếu → chỉ gửi code viết hoa, giữ chữ', async () => {
    const seen = mock([kho('w-a', 'A')])
    const { user, router } = renderPage('/import-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PN-0001' })
    await chooseOption(user, 'Tìm theo', 'Số hoá đơn')
    await user.type(screen.getByRole('searchbox'), 'hd-0001')
    await waitFor(() => expect(seen.at(-1)?.get('invoiceCode')).toBe('hd-0001'))
    expect(seen.at(-1)?.has('code')).toBe(false)
    expect(router.state.location.search).toContain('searchBy=invoiceCode')

    await chooseOption(user, 'Tìm theo', 'Mã phiếu')
    await waitFor(() => expect(seen.at(-1)?.get('code')).toBe('HD-0001'))
    expect(seen.at(-1)?.has('invoiceCode')).toBe(false)
    expect(seen.at(-1)?.get('page')).toBe('1')
    expect(screen.getByRole('searchbox')).toHaveValue('hd-0001')
    expect(router.state.location.search).not.toContain('searchBy')
  })

  it('placeholder đổi theo lựa chọn', async () => {
    mock([kho('w-a', 'A')])
    const { user } = renderPage('/import-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(screen.getByPlaceholderText('Tìm theo mã phiếu')).toBeInTheDocument()
    await chooseOption(user, 'Tìm theo', 'Số PO')
    expect(screen.getByPlaceholderText('Tìm theo số PO')).toBeInTheDocument()
  })

  it('"#$%" theo Mã phiếu → không gọi API, trạng thái trống-do-lọc', async () => {
    const seen = mock([kho('w-a', 'A')])
    renderPage('/import-forms?warehouse=w-a&search=%23%24%25')
    expect(await screen.findByText('Không có phiếu nào khớp bộ lọc.')).toBeInTheDocument()
    // Chờ qua debounce / render lại rồi mới khẳng định không có request nào.
    await new Promise((r) => setTimeout(r, 50))
    expect(seen).toHaveLength(0)
    expect(screen.queryByRole('link', { name: 'PN-0001' })).not.toBeInTheDocument()
  })

  it('70 ký tự theo Số hoá đơn → gửi 64 ký tự', async () => {
    const seen = mock([kho('w-a', 'A')])
    renderPage(`/import-forms?warehouse=w-a&searchBy=invoiceCode&search=${'a'.repeat(70)}`)
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(seen.at(-1)?.get('invoiceCode')).toBe('a'.repeat(64))
  })

  it('URL ?search=x&searchBy=invoiceCode → ô tìm có "x", chọn Số hoá đơn', async () => {
    const seen = mock([kho('w-a', 'A')])
    renderPage('/import-forms?warehouse=w-a&search=x&searchBy=invoiceCode')
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(screen.getByRole('searchbox')).toHaveValue('x')
    expect(screen.getByRole('combobox', { name: 'Tìm theo' })).toHaveTextContent('Số hoá đơn')
    expect(seen.at(-1)?.get('invoiceCode')).toBe('x')
  })

  it('Xoá bộ lọc KHÔNG xoá ô tìm và Tìm theo', async () => {
    mockMobileViewport()
    const seen = mock([kho('w-a', 'A')])
    const { user, router } = renderPage(
      '/import-forms?warehouse=w-a&status=DRAFT&search=x&searchBy=purchaseOrder',
    )
    await screen.findByRole('link', { name: 'PN-0001' })
    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }))
    await waitFor(() => expect(seen.at(-1)?.has('status')).toBe(false))
    expect(seen.at(-1)?.get('purchaseOrder')).toBe('x')
    expect(router.state.location.search).toContain('search=x')
    expect(router.state.location.search).toContain('searchBy=purchaseOrder')
    expect(router.state.location.search).not.toContain('status')
    expect(screen.getByRole('searchbox')).toHaveValue('x')
  })
})

describe('ImportFormsPage — đổi Tìm theo từ trang 2', () => {
  afterEach(() => vi.restoreAllMocks())

  it('đang ở trang 2 → đổi Tìm theo → về trang 1', async () => {
    const seen: URLSearchParams[] = []
    server.use(
      mswHttp.get(`${BASE}/warehouses`, () => paginated([kho('w-a', 'A')])),
      mswHttp.get(`${BASE}/warehouses/:w/import-forms`, ({ request }) => {
        const sp = new URL(request.url).searchParams
        seen.push(sp)
        return paginated([draftForm], { page: Number(sp.get('page')), total: 30 })
      }),
    )
    const { user, router } = renderPage(
      '/import-forms?warehouse=w-a&page=2&search=x&searchBy=invoiceCode',
    )
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(seen.at(-1)?.get('page')).toBe('2')
    await chooseOption(user, 'Tìm theo', 'Số PO')
    await waitFor(() => expect(seen.at(-1)?.get('purchaseOrder')).toBe('x'))
    expect(seen.at(-1)?.get('page')).toBe('1')
    expect(router.state.location.search).not.toContain('page=2')
  })
})

const ME: TestAuth = { ...SUP, scope: [...SUP.scope, 'USER_READ'] }

const person = (slug: string, lastName: string, firstName: string, phonenumber: string) => ({
  slug,
  createdAt: '',
  updatedAt: '',
  phonenumber,
  firstName,
  lastName,
  isActive: true,
  roleSlug: 'r',
  roleName: 'STAFF',
})

function mockUsers() {
  const seen: URLSearchParams[] = []
  server.use(
    mswHttp.get(`${BASE}/users/:slug`, ({ params }) =>
      ok(person(String(params.slug), 'Trần', 'Thị B', '0912345678')),
    ),
    mswHttp.get(`${BASE}/users`, ({ request }) => {
      seen.push(new URL(request.url).searchParams)
      return paginated([
        person('u-1', 'Nguyễn', 'Văn A', '0901234567'),
        person('u-2', 'Lê', 'Thị C', '0907654321'),
      ])
    }),
  )
  return seen
}

describe('ImportFormsPage — lọc người lập / người xác nhận', () => {
  afterEach(() => vi.restoreAllMocks())

  it('có USER_READ → chọn Người lập gửi requesterSlug, chọn Người xác nhận gửi approverSlug', async () => {
    const seen = mock([kho('w-a', 'A')])
    mockUsers()
    const { user, router } = renderPage('/import-forms?warehouse=w-a', ME)
    await screen.findByRole('link', { name: 'PN-0001' })

    await user.click(screen.getByRole('combobox', { name: 'Người lập' }))
    await user.click(await screen.findByRole('option', { name: 'Nguyễn Văn A (0901234567)' }))
    await waitFor(() => expect(seen.at(-1)?.get('requesterSlug')).toBe('u-1'))
    expect(router.state.location.search).toContain('requester=u-1')
    expect(seen.at(-1)?.has('approverSlug')).toBe(false)

    await user.click(screen.getByRole('combobox', { name: 'Người xác nhận' }))
    await user.click(await screen.findByRole('option', { name: 'Lê Thị C (0907654321)' }))
    await waitFor(() => expect(seen.at(-1)?.get('approverSlug')).toBe('u-2'))
    expect(seen.at(-1)?.get('requesterSlug')).toBe('u-1')
    expect(seen.at(-1)?.get('page')).toBe('1')
  })

  it('tìm phía server: chữ → name, toàn số → phonenumber', async () => {
    mock([kho('w-a', 'A')])
    const users = mockUsers()
    const { user } = renderPage('/import-forms?warehouse=w-a', ME)
    await screen.findByRole('link', { name: 'PN-0001' })
    await user.click(screen.getByRole('combobox', { name: 'Người lập' }))
    await user.type(await screen.findByPlaceholderText('Tìm theo tên hoặc số điện thoại'), 'Văn')
    await waitFor(() => expect(users.at(-1)?.get('name')).toBe('Văn'))
    expect(users.at(-1)?.has('phonenumber')).toBe(false)
    const input = screen.getByPlaceholderText('Tìm theo tên hoặc số điện thoại')
    await user.clear(input)
    await user.type(input, '0901')
    await waitFor(() => expect(users.at(-1)?.get('phonenumber')).toBe('0901'))
    expect(users.at(-1)?.has('name')).toBe(false)
  })

  it('URL ?requester=u-9 → nút hiện nhãn người đó (lấy từ GET /users/u-9), gửi requesterSlug', async () => {
    const seen = mock([kho('w-a', 'A')])
    mockUsers()
    renderPage('/import-forms?warehouse=w-a&requester=u-9', ME)
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(await screen.findByRole('combobox', { name: 'Người lập' })).toHaveTextContent(
      'Trần Thị B (0912345678)',
    )
    expect(seen.at(-1)?.get('requesterSlug')).toBe('u-9')
  })

  it('đã chọn → nút ghi "Người lập: …" / "Người xác nhận: …", danh sách vẫn chỉ ghi người', async () => {
    mock([kho('w-a', 'A')])
    mockUsers()
    const { user } = renderPage('/import-forms?warehouse=w-a&requester=u-1&approver=u-1', ME)
    await screen.findByRole('link', { name: 'PN-0001' })
    const requester = await screen.findByRole('combobox', { name: 'Người lập' })
    await waitFor(() => expect(requester).toHaveTextContent('Người lập: Trần Thị B (0912345678)'))
    expect(screen.getByRole('combobox', { name: 'Người xác nhận' })).toHaveTextContent(
      'Người xác nhận: Trần Thị B (0912345678)',
    )
    await user.click(requester)
    expect(await screen.findByRole('option', { name: 'Nguyễn Văn A (0901234567)' })).toBeVisible()
  })

  it('URL ?requester= trỏ tới người không tải được (404) → nút "Người lập: Người không xác định" và có ✕ bỏ lọc', async () => {
    const seen = mock([kho('w-a', 'A')])
    server.use(
      mswHttp.get(`${BASE}/users/:slug`, () => apiError(404, 100405, 'not found')),
      mswHttp.get(`${BASE}/users`, () => paginated([])),
    )
    const { user, router } = renderPage('/import-forms?warehouse=w-a&requester=u-gone', ME)
    await screen.findByRole('link', { name: 'PN-0001' })
    const box = screen.getByRole('combobox', { name: 'Người lập' })
    await waitFor(() => expect(box).toHaveTextContent('Người lập: Người không xác định'))
    expect(seen.at(-1)?.get('requesterSlug')).toBe('u-gone')
    await user.click(screen.getByRole('button', { name: 'Xoá lựa chọn' }))
    await waitFor(() => expect(seen.at(-1)?.has('requesterSlug')).toBe(false))
    expect(router.state.location.search).not.toContain('requester')
  })

  it('không mở ô lọc người → không có request GET /users (danh sách); mở ra mới tải', async () => {
    mock([kho('w-a', 'A')])
    const users = mockUsers()
    const { user } = renderPage('/import-forms?warehouse=w-a', ME)
    await screen.findByRole('link', { name: 'PN-0001' })
    await new Promise((r) => setTimeout(r, 50))
    expect(users).toHaveLength(0)
    await user.click(screen.getByRole('combobox', { name: 'Người lập' }))
    await waitFor(() => expect(users.length).toBeGreaterThan(0))
  })

  it('không có USER_READ → không thấy hai bộ lọc, ?requester= / ?approver= không được gửi', async () => {
    const seen = mock([kho('w-a', 'A')])
    renderPage('/import-forms?warehouse=w-a&requester=u-1&approver=u-2')
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(screen.queryByRole('combobox', { name: 'Người lập' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Người xác nhận' })).not.toBeInTheDocument()
    expect(seen.at(-1)?.has('requesterSlug')).toBe(false)
    expect(seen.at(-1)?.has('approverSlug')).toBe(false)
  })

  it('Xoá bộ lọc bỏ cả hai (mobile: chip)', async () => {
    mockMobileViewport()
    const seen = mock([kho('w-a', 'A')])
    mockUsers()
    const { user, router } = renderPage(
      '/import-forms?warehouse=w-a&requester=u-1&approver=u-2',
      ME,
    )
    await screen.findByRole('link', { name: 'PN-0001' })
    await waitFor(() => expect(seen.at(-1)?.get('requesterSlug')).toBe('u-1'))
    expect(seen.at(-1)?.get('approverSlug')).toBe('u-2')
    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }))
    await waitFor(() => expect(seen.at(-1)?.has('requesterSlug')).toBe(false))
    expect(seen.at(-1)?.has('approverSlug')).toBe(false)
    expect(router.state.location.search).not.toContain('requester')
    expect(router.state.location.search).not.toContain('approver')
  })

  it('chỉ có chữ trong ô tìm → ô tìm không tính vào số bộ lọc, không có nút Xoá bộ lọc', async () => {
    // activeFilterCount không đếm ô tìm (khớp MaterialsPage).
    mockMobileViewport()
    mock([kho('w-a', 'A')])
    renderPage('/import-forms?warehouse=w-a&search=x', ME)
    await screen.findByRole('link', { name: 'PN-0001' })
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument()
  })
})

/** Kích hoạt nút `action` / `cancel` của sonner như khi người dùng bấm. */
const press = (button: unknown) => (button as { onClick: (e: unknown) => void }).onClick({})

describe('ImportFormsPage - toast sau khi lưu có lối tắt', () => {
  const MANAGER: TestAuth = {
    ...SUP,
    roleName: 'MANAGER',
    scope: [...SUP.scope, 'IMPORT_FORM_CONFIRM', 'MATERIAL_READ'],
  }
  const flour = {
    slug: 'm-flour',
    code: 'VT-01',
    name: 'Bột mì',
    baseUnitSlug: 'u-kg',
    quantity: 120,
    suppliers: [{ slug: 's-1', code: 'NCC-01', name: 'NCC Bột' }],
    units: [
      {
        unitSlug: 'u-kg',
        unitCode: 'KG',
        unitName: 'Kilogram',
        conversionRate: 1,
        isBaseUnit: true,
      },
    ],
  }

  async function fillCreate(user: ReturnType<typeof renderPage>['user']) {
    await user.click(await screen.findByRole('button', { name: 'Tạo phiếu' }))
    await screen.findByRole('dialog', { name: 'Tạo phiếu nhập · Kho A' })
    await user.type(screen.getByRole('textbox', { name: /^Số hoá đơn/ }), 'HD-9')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.click(await screen.findByRole('option', { name: /VT-01 · Bột mì/ }))
    await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '5')
    await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '1000')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await screen.findByRole('heading', { name: 'Kiểm tra phiếu nhập' })
  }

  /** Bấm nút lưu ở chân sheet (bước ③). */
  async function save(user: ReturnType<typeof renderPage>['user'], label: string) {
    const sheet = screen.getByRole('dialog', { name: 'Tạo phiếu nhập · Kho A' })
    await user.click(within(sheet).getByRole('button', { name: label }))
    // Mọi nút lưu hỏi lại trước khi gửi; nút xác nhận trong hộp mang cùng nhãn.
    await confirmDialog(user, label)
  }

  function setup(auth: TestAuth) {
    mock([kho('w-a', 'A')])
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/import-forms/available-materials`, () =>
        paginated([flour]),
      ),
      mswHttp.get(`${BASE}/suppliers`, () => paginated([])),
      mswHttp.post(`${BASE}/warehouses/w-a/import-forms`, () => ok(draftForm)),
      mswHttp.post(`${BASE}/warehouses/w-a/import-forms/if-1/confirm`, () =>
        ok({ ...draftForm, status: 'CONFIRMED' }),
      ),
    )
    return renderPage('/import-forms?warehouse=w-a', auth)
  }

  it('tạo nháp → toast ngắn "Đã tạo phiếu PN-0001" với một nút "Xem" mở chi tiết', async () => {
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const { user, router } = setup(SUP)
    await fillCreate(user)
    await save(user, 'Lưu nháp')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const [msg, opts] = spy.mock.calls[0]
    expect(msg).toBe('Đã tạo phiếu PN-0001')
    expect(opts?.action).toMatchObject({ label: 'Xem' })
    expect(opts?.cancel).toBeUndefined()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    press(opts?.action)
    await waitFor(() => expect(router.state.location.pathname).toBe('/import-forms/if-1'))
    expect(router.state.location.search).toContain('warehouse=w-a')
    spy.mockRestore()
  })

  it('nút "Xem" trên toast bấm khi sheet đang mở (đang nhập phiếu khác) → bỏ qua, không mất phần đang nhập', async () => {
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const { user, router } = setup(SUP)
    await fillCreate(user)
    await save(user, 'Lưu nháp')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const [, opts] = spy.mock.calls[0]
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Đang sửa phiếu khác: "Xem" sẽ rời trang.
    server.use(mswHttp.get(`${BASE}/warehouses/w-a/import-forms/if-1`, () => ok(draftForm)))
    const sheet = await openEdit(user)
    await user.type(within(sheet).getByRole('textbox', { name: /^Số hoá đơn/ }), '-SUA')

    press(opts?.action)
    await new Promise((r) => setTimeout(r, 50))
    expect(router.state.location.pathname).toBe('/import-forms')
    const still = screen.getByRole('dialog', { name: 'Sửa phiếu nhập PN-0001' })
    expect(within(still).getByRole('textbox', { name: /^Số hoá đơn/ })).toHaveValue(
      `${draftForm.invoiceCode}-SUA`,
    )
    spy.mockRestore()
  })

  it('MANAGER Lưu & xác nhận → toast "Đã tạo và xác nhận PN-0001"', async () => {
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const { user } = setup(MANAGER)
    await fillCreate(user)
    await save(user, 'Lưu & xác nhận')
    await waitFor(() => expect(spy.mock.calls[0]?.[0]).toBe('Đã tạo và xác nhận PN-0001'))
    spy.mockRestore()
  })

  it('xác nhận lỗi → toast cảnh báo "Đã lưu PN-0001, chưa xác nhận", lý do ở dòng phụ, có nút Xem', async () => {
    const spy = vi.spyOn(toast, 'warning').mockImplementation(() => 'id')
    const { user, router } = setup(MANAGER)
    server.use(
      mswHttp.post(`${BASE}/warehouses/w-a/import-forms/if-1/confirm`, () =>
        apiError(500, 100500, 'boom'),
      ),
    )
    await fillCreate(user)
    await save(user, 'Lưu & xác nhận')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('Đã lưu PN-0001, chưa xác nhận')
    const opts = spy.mock.calls[0][1]
    expect(opts?.description).toBe('boom')
    expect(opts?.action).toMatchObject({ label: 'Xem' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    press(opts?.action)
    await waitFor(() => expect(router.state.location.pathname).toBe('/import-forms/if-1'))
    spy.mockRestore()
  })

  async function openEdit(user: ReturnType<typeof renderPage>['user']) {
    await user.click(await screen.findByRole('button', { name: 'Thao tác cho phiếu PN-0001' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sửa' }))
    const sheet = await screen.findByRole('dialog', { name: 'Sửa phiếu nhập PN-0001' })
    // Sửa mở ở bước ②; các ô đầu phiếu nằm ở bước ① (lùi luôn được).
    await user.click(await within(sheet).findByRole('button', { name: /Thông tin phiếu$/ }))
    await within(sheet).findByRole('textbox', { name: /^Ghi chú$/ })
    return sheet
  }

  it('sửa + Lưu: đúng MỘT toast "Đã lưu phiếu nhập"', async () => {
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const { user } = setup(SUP)
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/import-forms/if-1`, () => ok(draftForm)),
      mswHttp.patch(`${BASE}/warehouses/w-a/import-forms/if-1`, () =>
        ok({ ...draftForm, version: 4 }),
      ),
    )
    const sheet = await openEdit(user)
    await user.clear(within(sheet).getByRole('textbox', { name: /^Ghi chú$/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Lưu' }))
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('Đã lưu phiếu nhập')
    spy.mockRestore()
  })

  it('sửa + Lưu & xác nhận: đúng MỘT toast "Đã lưu và xác nhận PN-0001 …"', async () => {
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const { user } = setup(MANAGER)
    server.use(mswHttp.get(`${BASE}/warehouses/w-a/import-forms/if-1`, () => ok(draftForm)))
    const sheet = await openEdit(user)
    await user.click(within(sheet).getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('Đã lưu và xác nhận PN-0001')
    spy.mockRestore()
  })
})
