import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportForm, ExportFormItem } from '@/entities/export-form'
import type { Warehouse } from '@/entities/warehouse'
import { apiError, ok, paginated } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { chooseOption } from '@/shared/test/select'
import { mockMobileViewport } from '@/shared/test/viewport'
import { ExportFormsPage } from './ExportFormsPage'

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

// Dữ liệu giả — chép từ `@/entities/export-form/model/fixtures` (deep import bị `boundaries/entry-point` chặn).
const item = (overrides: Partial<ExportFormItem> = {}): ExportFormItem => ({
  slug: 'xit-1',
  createdAt: '2026-10-26T02:00:00.000Z',
  updatedAt: '2026-10-26T02:00:00.000Z',
  lineNo: 1,
  materialSlug: 'm-VT-01',
  materialCode: 'VT-01',
  materialName: 'Bột mì',
  unitSlug: 'u-kg',
  unitCode: 'KG',
  unitName: 'Kilogram',
  batchSlug: null,
  batchExpiryDate: null,
  quantity: 10,
  conversionRate: 1,
  baseQuantity: 10,
  unitPrice: 0,
  amount: 0,
  note: null,
  ...overrides,
})
const draftForm: ExportForm = {
  slug: 'xf-1',
  createdAt: '2026-10-26T02:00:00.000Z',
  updatedAt: '2026-10-26T02:00:00.000Z',
  version: 1,
  code: 'PX-0001',
  type: 'PRODUCTION',
  status: 'DRAFT',
  purchaseOrder: 'PO-12',
  invoiceCode: 'HD-123',
  requesterSlug: 'u-sup',
  requesterName: 'Nguyễn Văn A',
  approverSlug: null,
  approverName: null,
  receiver: 'Xưởng 1',
  totalAmount: 0,
  note: 'Giao buổi sáng',
  file: null,
  warehouseSlug: 'w-a',
  items: [item()],
}

const BASE = 'http://localhost:8085/api/v1'
const URL_FORMS = `${BASE}/warehouses/w-a/export-forms`
const kho = (slug: string, code: string, isActive = true) =>
  ({ slug, code, name: `Kho ${code}`, isActive }) as Warehouse

const SUP: TestAuth = {
  userName: 's',
  userSlug: 'u-sup',
  roleName: 'SUPERVISOR',
  scope: [
    'EXPORT_FORM_READ',
    'EXPORT_FORM_CREATE',
    'EXPORT_FORM_UPDATE_DRAFT_OWN',
    'EXPORT_FORM_DELETE_DRAFT_OWN',
    'EXPORT_FORM_EXPORT',
    'WAREHOUSE_READ',
    'MATERIAL_READ',
  ],
}
const MANAGER: TestAuth = {
  userName: 'm',
  userSlug: 'u-mgr',
  roleName: 'MANAGER',
  scope: [
    'EXPORT_FORM_READ',
    'EXPORT_FORM_DELETE_DRAFT',
    'EXPORT_FORM_CONFIRM',
    'EXPORT_FORM_APPROVE_DISPOSAL',
    'EXPORT_FORM_EXPORT',
    'WAREHOUSE_READ',
  ],
}

/** Lời gọi huy hiệu "Chờ duyệt (n)": `status=PENDING&size=1` — tách khỏi danh sách để `seen` chỉ là của bảng. */
const isPendingCount = (sp: URLSearchParams) =>
  sp.get('status') === 'PENDING' && sp.get('size') === '1'

function mock(warehouses: Warehouse[], form: ExportForm = draftForm, pendingTotal = 3) {
  const seen: URLSearchParams[] = []
  const pendingCalls: URLSearchParams[] = []
  server.use(
    mswHttp.get(`${BASE}/warehouses`, () => paginated(warehouses)),
    mswHttp.get(`${BASE}/warehouses/:w/export-forms`, ({ request, params }) => {
      const sp = new URL(request.url).searchParams
      sp.set('_w', String(params.w))
      if (isPendingCount(sp)) {
        pendingCalls.push(sp)
        return paginated([], { size: 1, total: pendingTotal })
      }
      seen.push(sp)
      return paginated([form])
    }),
  )
  return Object.assign(seen, { pendingCalls })
}

function renderPage(route = '/export-forms', auth: TestAuth = SUP) {
  return renderWithRouter(
    [
      { path: '/export-forms', element: <ExportFormsPage /> },
      { path: '/export-forms/:slug', element: <p>TRANG CHI TIẾT</p> },
    ],
    { route, auth },
  )
}

afterEach(() => {
  fit.fits = true
  vi.restoreAllMocks()
})

describe('ExportFormsPage', () => {
  it('thiếu ?warehouse → chọn kho đầu, ghi lên URL, tải phiếu của kho đó', async () => {
    const seen = mock([kho('w-a', 'A'), kho('w-b', 'B')])
    const { router } = renderPage()
    expect(await screen.findByRole('link', { name: 'PX-0001' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Phiếu xuất kho' })).toBeInTheDocument()
    expect(router.state.location.search).toContain('warehouse=w-a')
    expect(seen.at(-1)?.get('_w')).toBe('w-a')
    expect(seen.at(-1)?.has('sortBy')).toBe(false)
  })

  it('đổi kho → tải lại theo kho mới, về trang 1', async () => {
    const seen = mock([kho('w-a', 'A'), kho('w-b', 'B')])
    const { user } = renderPage('/export-forms?warehouse=w-a&page=2')
    await screen.findByRole('link', { name: 'PX-0001' })
    await chooseOption(user, 'Kho', 'B · Kho B')
    await waitFor(() => expect(seen.at(-1)?.get('_w')).toBe('w-b'))
    expect(seen.at(-1)?.get('page')).toBe('1')
  })

  it('lọc trạng thái gửi status', async () => {
    const seen = mock([kho('w-a', 'A')])
    const { user } = renderPage('/export-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PX-0001' })
    await chooseOption(user, 'Trạng thái', 'Đã xác nhận')
    await waitFor(() => expect(seen.at(-1)?.get('status')).toBe('CONFIRMED'))
  })

  it('lọc Lý do xuất gửi type (5 lựa chọn đúng thứ tự)', async () => {
    const seen = mock([kho('w-a', 'A')])
    const { user } = renderPage('/export-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PX-0001' })
    await user.click(screen.getByRole('combobox', { name: 'Lý do xuất' }))
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['Tất cả lý do', 'Sản xuất', 'Xuất huỷ', 'Chuyển kho', 'Bán', 'Khác'])
    await user.click(screen.getByRole('option', { name: 'Xuất huỷ' }))
    await waitFor(() => expect(seen.at(-1)?.get('type')).toBe('DISPOSAL'))
  })

  it('URL ?type=SALE → gửi type, ?type sai → bỏ', async () => {
    const seen = mock([kho('w-a', 'A')])
    renderPage('/export-forms?warehouse=w-a&type=SALE')
    await screen.findByRole('link', { name: 'PX-0001' })
    expect(seen.at(-1)?.get('type')).toBe('SALE')
  })

  it('popover Bộ lọc: Lý do xuất (> 4 lựa chọn) là Select có nhãn, Trạng thái là nút bấm nhanh', async () => {
    fit.fits = false
    mock([kho('w-a', 'A')])
    const { user } = renderPage('/export-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PX-0001' })
    await user.click(screen.getByRole('button', { name: /Bộ lọc/ }))
    const panel = await screen.findByRole('dialog', { name: 'Bộ lọc' })
    expect(within(panel).getByRole('combobox', { name: 'Lý do xuất' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Chờ duyệt' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(panel).queryByRole('combobox', { name: 'Kho' })).not.toBeInTheDocument()
  })

  it('ô Kho ở đầu trang cạnh tiêu đề, không nằm trên thanh lọc', async () => {
    mock([kho('w-a', 'A'), kho('w-b', 'B')])
    renderPage('/export-forms?warehouse=w-b')
    await screen.findByRole('link', { name: 'PX-0001' })
    const picker = screen.getByRole('combobox', { name: 'Kho' })
    expect(picker).toHaveTextContent('B · Kho B')
    const row = screen
      .getByRole('combobox', { name: 'Trạng thái' })
      .closest('[data-slot="toolbar-row"]')
    expect(row).not.toContainElement(picker)
    expect(row).toContainElement(screen.getByRole('button', { name: 'Tạo phiếu xuất' }))
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toContainElement(picker)
  })

  describe('nút nhanh "Chờ duyệt (n)"', () => {
    it('có EXPORT_FORM_CONFIRM: hiện số phiếu chờ; bấm đặt status=PENDING, bấm lại bỏ lọc', async () => {
      const seen = mock([kho('w-a', 'A')], draftForm, 4)
      const { user, router } = renderPage('/export-forms?warehouse=w-a', MANAGER)
      await screen.findByRole('link', { name: 'PX-0001' })
      const quick = await screen.findByRole('button', { name: 'Chờ duyệt (4)' })
      expect(quick).toHaveAttribute('aria-pressed', 'false')
      expect(seen.pendingCalls.at(-1)?.get('_w')).toBe('w-a')

      await user.click(quick)
      await waitFor(() => expect(seen.at(-1)?.get('status')).toBe('PENDING'))
      expect(router.state.location.search).toContain('status=PENDING')
      expect(screen.getByRole('button', { name: 'Chờ duyệt (4)' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )

      await user.click(screen.getByRole('button', { name: 'Chờ duyệt (4)' }))
      await waitFor(() => expect(seen.at(-1)?.has('status')).toBe(false))
      expect(screen.getByRole('button', { name: 'Chờ duyệt (4)' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    })

    it('URL ?status=PENDING → nút đang bật', async () => {
      mock([kho('w-a', 'A')])
      renderPage('/export-forms?warehouse=w-a&status=PENDING', MANAGER)
      expect(await screen.findByRole('button', { name: 'Chờ duyệt (3)' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('thiếu EXPORT_FORM_CONFIRM → không có nút, không gọi đếm', async () => {
      const seen = mock([kho('w-a', 'A')])
      renderPage('/export-forms?warehouse=w-a', SUP)
      await screen.findByRole('link', { name: 'PX-0001' })
      expect(screen.queryByRole('button', { name: /^Chờ duyệt/ })).not.toBeInTheDocument()
      expect(seen.pendingCalls).toHaveLength(0)
    })
  })

  it('bấm Tạo phiếu xuất → mở sheet tạo ngay trên danh sách, không điều hướng', async () => {
    mock([kho('w-a', 'A')])
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/materials`, () => paginated([])),
      mswHttp.get(`${BASE}/warehouses/w-a/material-batches`, () => paginated([])),
    )
    const { user, router } = renderPage('/export-forms?warehouse=w-a')
    await user.click(await screen.findByRole('button', { name: 'Tạo phiếu xuất' }))
    expect(
      await screen.findByRole('dialog', { name: 'Tạo phiếu xuất · Kho A' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/export-forms')
  })

  it('kho ngừng hoạt động → nút Tạo khoá kèm lý do', async () => {
    mock([kho('w-a', 'A', false)])
    renderPage('/export-forms?warehouse=w-a')
    const create = await screen.findByRole('button', { name: 'Tạo phiếu xuất' })
    expect(create).toBeDisabled()
    expect(create).toHaveAccessibleDescription(
      'Kho đang ngừng hoạt động — không tạo được phiếu mới.',
    )
  })

  it.each([
    ['EXPORT_FORM_CREATE', 'EXPORT_FORM_CREATE'],
    ['MATERIAL_READ (Ruling 2: form tải vật tư của kho)', 'MATERIAL_READ'],
  ])('thiếu %s → không có nút Tạo', async (_name, missing) => {
    mock([kho('w-a', 'A')])
    renderPage('/export-forms?warehouse=w-a', {
      ...SUP,
      scope: SUP.scope.filter((c) => c !== missing),
    })
    await screen.findByRole('link', { name: 'PX-0001' })
    expect(screen.queryByRole('button', { name: 'Tạo phiếu xuất' })).not.toBeInTheDocument()
  })

  it('không có kho nào → câu báo, không gọi danh sách phiếu', async () => {
    const seen = mock([])
    renderPage()
    expect(
      await screen.findByText('Bạn chưa thuộc kho nào nên chưa xem được phiếu xuất.'),
    ).toBeInTheDocument()
    expect(seen).toHaveLength(0)
  })

  it('GET /warehouses lỗi 500 → báo lỗi, không gọi danh sách phiếu', async () => {
    const seen = mock([])
    server.use(mswHttp.get(`${BASE}/warehouses`, () => apiError(500)))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(seen).toHaveLength(0)
  })

  it('bấm hàng → chi tiết, mang backTo là đường dẫn danh sách', async () => {
    mock([kho('w-a', 'A')])
    const { user, router } = renderPage('/export-forms?warehouse=w-a')
    await user.click(await screen.findByText('Xưởng 1'))
    expect(await screen.findByText('TRANG CHI TIẾT')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/export-forms/xf-1')
    expect(router.state.location.search).toBe('?warehouse=w-a')
    expect(router.state.location.state).toEqual({ backTo: '/export-forms?warehouse=w-a' })
  })

  it('bấm tiêu đề Mã phiếu → gửi sortBy=code', async () => {
    const seen = mock([kho('w-a', 'A')])
    const { user } = renderPage('/export-forms?warehouse=w-a')
    await screen.findByRole('link', { name: 'PX-0001' })
    await user.click(screen.getByRole('button', { name: 'Mã phiếu' }))
    await waitFor(() => {
      expect(seen.at(-1)?.get('sortBy')).toBe('code')
      expect(seen.at(-1)?.get('sort')).toBe('ASC')
    })
  })

  it('ô tìm: Số PO gửi purchaseOrder; Mã phiếu toàn ký hiệu → không gọi API, trống-do-lọc', async () => {
    const seen = mock([kho('w-a', 'A')])
    const { user } = renderPage('/export-forms?warehouse=w-a&searchBy=purchaseOrder&search=po-1')
    await screen.findByRole('link', { name: 'PX-0001' })
    expect(seen.at(-1)?.get('purchaseOrder')).toBe('po-1')
    expect(seen.at(-1)?.has('code')).toBe(false)
    await chooseOption(user, 'Tìm theo', 'Mã phiếu')
    await waitFor(() => expect(seen.at(-1)?.get('code')).toBe('PO-1'))

    const before = seen.length
    const box = screen.getByPlaceholderText('Tìm theo mã phiếu')
    await user.clear(box)
    await user.type(box, '#$%')
    expect(await screen.findByText('Không có phiếu nào khớp bộ lọc.')).toBeInTheDocument()
    expect(seen.slice(before).some((sp) => sp.get('code') === '')).toBe(false)
  })

  it('Xoá bộ lọc (mobile) → bỏ trạng thái, lý do, ngày; giữ kho', async () => {
    mockMobileViewport()
    const seen = mock([kho('w-a', 'A'), kho('w-b', 'B')])
    const { user, router } = renderPage(
      '/export-forms?warehouse=w-b&status=DRAFT&type=SALE&startDate=2026-10-01&endDate=2026-10-15',
    )
    await screen.findByRole('link', { name: 'PX-0001' })
    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }))
    await waitFor(() => {
      expect(seen.at(-1)?.has('status')).toBe(false)
      expect(seen.at(-1)?.has('type')).toBe(false)
      expect(seen.at(-1)?.has('startDate')).toBe(false)
    })
    expect(router.state.location.search).toContain('warehouse=w-b')
  })

  it('không có USER_READ → không thấy lọc Người lập / Người xác nhận, ?requester không được gửi', async () => {
    const seen = mock([kho('w-a', 'A')])
    renderPage('/export-forms?warehouse=w-a&requester=u-9')
    await screen.findByRole('link', { name: 'PX-0001' })
    expect(screen.queryByRole('combobox', { name: 'Người lập' })).not.toBeInTheDocument()
    expect(seen.at(-1)?.has('requesterSlug')).toBe(false)
  })

  it('có USER_READ → ?requester / ?approver gửi requesterSlug / approverSlug', async () => {
    const seen = mock([kho('w-a', 'A')])
    server.use(
      mswHttp.get(`${BASE}/users/:slug`, ({ params }) =>
        ok({
          slug: String(params.slug),
          createdAt: '',
          updatedAt: '',
          phonenumber: '0901234567',
          firstName: 'B',
          lastName: 'Trần',
          isActive: true,
          roleSlug: 'r',
          roleName: 'STAFF',
        }),
      ),
    )
    renderPage('/export-forms?warehouse=w-a&requester=u-9&approver=u-8', {
      ...SUP,
      scope: [...SUP.scope, 'USER_READ'],
    })
    await screen.findByRole('link', { name: 'PX-0001' })
    expect(screen.getByRole('combobox', { name: 'Người lập' })).toBeInTheDocument()
    expect(seen.at(-1)?.get('requesterSlug')).toBe('u-9')
    expect(seen.at(-1)?.get('approverSlug')).toBe('u-8')
  })

  describe('thao tác hàng', () => {
    const openMenu = async (user: ReturnType<typeof renderPage>['user']) =>
      user.click(await screen.findByRole('button', { name: 'Thao tác cho phiếu PX-0001' }))

    it('nháp của mình → Xem chi tiết, Sửa, Xoá; Xoá mở hộp xác nhận', async () => {
      mock([kho('w-a', 'A')])
      const { user } = renderPage('/export-forms?warehouse=w-a')
      await openMenu(user)
      expect(await screen.findByRole('menuitem', { name: 'Xem chi tiết' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Sửa' })).toBeInTheDocument()
      await user.click(screen.getByRole('menuitem', { name: 'Xoá phiếu' }))
      expect(await screen.findByRole('alertdialog')).toHaveTextContent('Xoá phiếu xuất PX-0001')
    })

    it('phiếu Chờ duyệt → chỉ Xem chi tiết (không duyệt ngay trên hàng)', async () => {
      mock([kho('w-a', 'A')], { ...draftForm, status: 'PENDING' })
      const { user } = renderPage('/export-forms?warehouse=w-a', MANAGER)
      await openMenu(user)
      await screen.findByRole('menuitem', { name: 'Xem chi tiết' })
      expect(screen.getAllByRole('menuitem')).toHaveLength(1)
    })
  })
})

const press = (button: unknown) => (button as { onClick: (e: unknown) => void }).onClick({})

describe('ExportFormsPage — toast sau khi lưu', () => {
  const stock = {
    slug: 'i-VT-01',
    materialSlug: 'm-VT-01',
    materialCode: 'VT-01',
    materialName: 'Bột mì',
    quantity: 120,
    reservedQuantity: 0,
    availableQuantity: 120,
    baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
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

  function setup(
    auth: TestAuth = SUP,
    submit: () => Response = () => ok({ ...draftForm, status: 'PENDING', version: 2 }),
  ) {
    mock([kho('w-a', 'A')])
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/materials`, () => paginated([stock], { size: 500 })),
      mswHttp.get(`${BASE}/warehouses/w-a/material-batches`, () => paginated([])),
      mswHttp.post(URL_FORMS, () => ok(draftForm)),
      mswHttp.post(`${URL_FORMS}/xf-1/submit`, submit),
    )
    return renderPage('/export-forms?warehouse=w-a', auth)
  }

  async function fillCreate(user: ReturnType<typeof renderPage>['user']) {
    await user.click(await screen.findByRole('button', { name: 'Tạo phiếu xuất' }))
    await screen.findByRole('dialog', { name: 'Tạo phiếu xuất · Kho A' })
    await user.click(await screen.findByRole('radio', { name: 'Sản xuất' }))
    await user.type(screen.getByRole('textbox', { name: /^Người nhận/ }), 'Xưởng 1')
    await user.type(screen.getByRole('textbox', { name: /^Số PO/ }), 'PO-12')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.click(await screen.findByRole('option', { name: /VT-01 · Bột mì/ }))
    await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '5')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await screen.findByRole('heading', { name: 'Kiểm tra phiếu xuất' })
  }

  async function save(user: ReturnType<typeof renderPage>['user'], label: string) {
    const sheet = screen.getByRole('dialog', { name: 'Tạo phiếu xuất · Kho A' })
    await user.click(within(sheet).getByRole('button', { name: label }))
    // Mọi nút lưu hỏi lại trước khi gửi; nút xác nhận trong hộp mang cùng nhãn.
    await confirmDialog(user, label)
  }

  it('tạo nháp → "Đã lưu nháp PX-0001" kèm "Xem" mở chi tiết', async () => {
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const { user, router } = setup()
    await fillCreate(user)
    await save(user, 'Lưu nháp')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const [msg, opts] = spy.mock.calls[0]
    expect(msg).toBe('Đã lưu nháp PX-0001')
    expect(opts?.action).toMatchObject({ label: 'Xem' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    press(opts?.action)
    await waitFor(() => expect(router.state.location.pathname).toBe('/export-forms/xf-1'))
    expect(router.state.location.search).toContain('warehouse=w-a')
  })

  it('Lưu & gửi duyệt → "Đã gửi duyệt PX-0001"', async () => {
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const { user } = setup()
    await fillCreate(user)
    await save(user, 'Lưu & gửi duyệt')
    await waitFor(() => expect(spy.mock.calls[0]?.[0]).toBe('Đã gửi duyệt PX-0001'))
  })

  it('gửi duyệt lỗi sau khi tạo → cảnh báo NGAY (sheet còn mở); "Xem" bấm lúc sheet mở bị bỏ qua', async () => {
    const warning = vi.spyOn(toast, 'warning').mockImplementation(() => 'id')
    const { user, router } = setup(SUP, () => apiError(500, 100500, 'boom'))
    await fillCreate(user)
    await save(user, 'Lưu & gửi duyệt')
    await waitFor(() => expect(warning).toHaveBeenCalledTimes(1))
    const [msg, opts] = warning.mock.calls[0]
    expect(msg).toBe('Đã lưu nháp PX-0001 nhưng chưa gửi duyệt được')
    expect(opts?.description).toBe('boom')
    expect(opts?.action).toMatchObject({ label: 'Xem' })
    // Sheet ở lại (thành sửa phiếu vừa tạo).
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    press(opts?.action)
    await new Promise((r) => setTimeout(r, 50))
    expect(router.state.location.pathname).toBe('/export-forms')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('sửa nháp + Lưu → đúng MỘT toast "Đã lưu PX-0001"', async () => {
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const { user } = setup()
    server.use(
      mswHttp.get(`${URL_FORMS}/xf-1`, () => ok(draftForm)),
      mswHttp.patch(`${URL_FORMS}/xf-1`, () => ok({ ...draftForm, version: 2 })),
    )
    await user.click(await screen.findByRole('button', { name: 'Thao tác cho phiếu PX-0001' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sửa' }))
    const sheet = await screen.findByRole('dialog', { name: 'Sửa phiếu xuất PX-0001' })
    const qty = await within(sheet).findByRole('textbox', { name: 'Số lượng dòng 1' })
    await waitFor(() => expect(qty).toHaveValue('10'))
    await user.clear(qty)
    await user.type(qty, '7')
    await user.click(within(sheet).getByRole('button', { name: 'Lưu' }))
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('Đã lưu PX-0001')
  })
})
