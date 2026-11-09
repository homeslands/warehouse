// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native'
import type { NativeStackHeaderItemMenu, NativeStackNavigationOptions } from 'expo-router'
import { StyleSheet } from 'react-native'

import {
  exportFormKeys,
  type ExportForm,
  type ExportFormItem,
  type ExportFormStatus,
} from '@/entities/export-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { confirmAction } from '@/shared/lib/native-confirm'
import { lightColors } from '@/shared/theme/tokens'

import { ExportDetailScreen } from './ExportDetailScreen'

const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockReplace = jest.fn()
/** Chuyển giao sang modal (`useHandOffToModal`) chỉ được ghi lại — chạy thật ở `routing.test.tsx`. */
const mockHandOff = jest.fn()
jest.mock('@/shared/lib/useHandOffToModal', () => ({ useHandOffToModal: () => mockHandOff }))
const mockDispatch = jest.fn()
const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
const mockParams: { formSlug: string } = { formSlug: 'px-1' }
jest.mock('@/shared/lib/native-confirm', () => ({ confirmAction: jest.fn() }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, replace: mockReplace }),
  useNavigation: () => ({
    dispatch: mockDispatch,
    getState: () => ({ index: 1, routes: [{ key: 'list' }, { key: 'me' }] }),
  }),
  useRoute: () => ({ key: 'me' }),
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ options }: { options: NativeStackNavigationOptions }) => {
      mockHeader.options = options
      return null
    },
  },
}))

const WH_A = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const WH_B = { slug: 'wh-b', code: 'B', name: 'Kho Thủ Đức', isManager: false }
const FORM_URL = '/warehouses/wh-a/export-forms/px-1'
const BATCHES_URL = '/warehouses/wh-a/material-batches'

const item = (n: number, over: Partial<ExportFormItem> = {}): ExportFormItem => ({
  slug: `it-${n}`,
  createdAt: '2026-11-05T02:00:00.000Z',
  updatedAt: '2026-11-05T02:00:00.000Z',
  lineNo: n,
  materialSlug: `m-${n}`,
  materialCode: `VT-0${n}`,
  materialName: `Thép cuộn ${n}`,
  unitSlug: 'kg',
  unitCode: 'KG',
  unitName: 'kg',
  batchSlug: null,
  batchExpiryDate: null,
  quantity: 10,
  conversionRate: 1,
  baseQuantity: 10,
  unitPrice: 20_000,
  amount: 200_000,
  note: null,
  ...over,
})

function makeForm(over: Partial<ExportForm> = {}): ExportForm {
  return {
    slug: 'px-1',
    createdAt: '2026-11-05T02:00:00.000Z',
    updatedAt: '2026-11-05T02:00:00.000Z',
    version: 3,
    code: 'PX-20261105-0001',
    type: 'PRODUCTION',
    status: 'PENDING',
    purchaseOrder: 'PO-77',
    invoiceCode: null,
    requesterSlug: 'other',
    requesterName: 'Nguyễn Văn Tuấn',
    approverSlug: null,
    approverName: null,
    receiver: 'Tổ hàn A',
    totalAmount: 46_176_000,
    note: null,
    file: null,
    warehouseSlug: 'wh-a',
    items: [item(1), item(2), item(3)],
    ...over,
  }
}

const page = (items: object[]) =>
  ok({
    items,
    total: items.length,
    page: 1,
    pageSize: 100,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  })

/** Mặc định mọi vật tư chưa có lô nào. */
function noBatches() {
  route('get', BATCHES_URL, () => page([]))
}

let client: QueryClient
async function settled() {
  await act(async () => {
    const t = () => new Promise((r) => setTimeout(r, 0))
    await t()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await t()
    await t()
    await t()
  })
}
async function show() {
  const view = await render(
    <QueryClientProvider client={client}>
      <ExportDetailScreen />
    </QueryClientProvider>,
  )
  await settled()
  return view
}

const MANAGER = ['EXPORT_FORM_READ', 'EXPORT_FORM_CONFIRM', 'EXPORT_FORM_APPROVE_DISPOSAL']
const STAFF = ['EXPORT_FORM_READ', 'EXPORT_FORM_UPDATE_DRAFT_OWN']
function signIn(scope: string[], userSlug = 'u') {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug, userName: 'an', scope, warehouses: [WH_A, WH_B] } as never,
  })
}
const info = (key: string) => screen.getByTestId(`export-info-${key}`)
const infoKeys = () =>
  screen
    .getAllByTestId(/^export-info-[A-Za-z]+$/)
    .map((r) => r.props.testID.replace('export-info-', ''))
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never)
const confirmBtn = () => screen.queryByRole('button', { name: 'Xác nhận xuất kho' })
const cancelBtn = () => screen.queryByRole('button', { name: 'Huỷ' })
const editBtn = () => screen.queryByRole('button', { name: 'Sửa phiếu' })

/** Menu ⋯ trên header iOS (menu thả xuống gốc `type: 'menu'`, như `⋯` của form 3 bước). */
function moreItem() {
  const items = mockHeader.options.unstable_headerRightItems?.({} as never) ?? []
  return items.find((i) => i.type === 'menu' && i.icon?.type === 'sfSymbol') as
    NativeStackHeaderItemMenu | undefined
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockHeader.options = {}
  mockParams.formSlug = 'px-1'
  useFormNotice.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH_A, resolved: true, resolution: 'selected' })
  signIn(MANAGER)
  noBatches()
})

afterEach(async () => {
  await cleanup()
  client.clear()
})

describe('ExportDetailScreen — đầu phiếu', () => {
  it('tiêu đề = mã phiếu; viên trạng thái + viên loại, người nhận đậm, tổng tiền, "3 dòng · đã giữ hàng" (PENDING)', async () => {
    route('get', FORM_URL, () => ok(makeForm()))
    await show()
    expect(mockHeader.options.title).toBe('PX-20261105-0001')
    expect(screen.getByText('Chờ duyệt')).toBeOnTheScreen()
    expect(screen.getByTestId('export-detail-status')).toHaveStyle({
      backgroundColor: lightColors.card,
      borderColor: lightColors.border,
    })
    expect(screen.getByTestId('export-detail-status-dot')).toHaveStyle({
      backgroundColor: lightColors.accentText,
    })
    expect(screen.getAllByText('Sản xuất').length).toBeGreaterThan(0)
    expect(screen.getByText('Tổng cộng')).toBeOnTheScreen()
    expect(flat(screen.getAllByText('Tổ hàn A')[0])).toMatchObject({
      fontSize: 20,
      fontWeight: '700',
    })
    expect(flat(screen.getByText('46.176.000 đ'))).toMatchObject({
      fontSize: 28,
      fontVariant: ['tabular-nums'],
    })
    expect(screen.getByText('3 dòng · đã giữ hàng')).toBeOnTheScreen()
  })

  it.each(['DRAFT', 'CONFIRMED', 'CANCELLED'] as const)(
    '%s: "3 dòng", không nói đã giữ hàng',
    async (status) => {
      route('get', FORM_URL, () => ok(makeForm({ status })))
      await show()
      expect(screen.getByText('3 dòng')).toBeOnTheScreen()
      expect(screen.queryByText(/đã giữ hàng/)).toBeNull()
    },
  )
})

describe('ExportDetailScreen — Thông tin', () => {
  it('chứng từ: file null thì không có dòng', async () => {
    route('get', FORM_URL, () => ok(makeForm({ file: null })))
    await show()
    expect(screen.queryByTestId('export-attachment')).toBeNull()
  })

  it('chứng từ: có URL thì hiện dòng với tên, bấm được', async () => {
    route('get', FORM_URL, () =>
      ok(makeForm({ file: 'https://s3.example.com/f/phieu-1700000000000.pdf' })),
    )
    await show()
    expect(screen.getByTestId('export-attachment')).toBeOnTheScreen()
    expect(screen.getByText('phieu.pdf')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Chứng từ, phieu.pdf' })).toBeOnTheScreen()
  })

  it('chứng từ: key cũ hiện tên, không bấm được', async () => {
    route('get', FORM_URL, () => ok(makeForm({ file: 'old/key-1700000000000.pdf' })))
    await show()
    expect(screen.getByText('key.pdf')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /Chứng từ/ })).toBeNull()
  })

  it('Loại, Mã phiếu, Số PO, Người nhận, Người lập, Ngày tạo dd/MM/yyyy HH:mm theo đúng thứ tự; HĐ / người xác nhận / ghi chú ẩn khi trống', async () => {
    route('get', FORM_URL, () => ok(makeForm()))
    await show()
    expect(screen.getByRole('header', { name: 'Thông tin' })).toBeOnTheScreen()
    expect(info('type')).toHaveTextContent('LoạiSản xuất')
    expect(info('code')).toHaveTextContent('Mã phiếuPX-20261105-0001')
    expect(info('purchaseOrder')).toHaveTextContent('Số POPO-77')
    expect(info('receiver')).toHaveTextContent('Người nhậnTổ hàn A')
    expect(info('requester')).toHaveTextContent('Người lậpNguyễn Văn Tuấn')
    const d = new Date('2026-11-05T02:00:00.000Z')
    const p = (n: number) => String(n).padStart(2, '0')
    const stamp = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
    expect(info('createdAt')).toHaveTextContent(`Ngày tạo${stamp}`)
    expect(screen.queryByTestId('export-info-invoiceCode')).toBeNull()
    expect(screen.queryByTestId('export-info-approver')).toBeNull()
    expect(screen.queryByTestId('export-info-note')).toBeNull()
    expect(infoKeys()).toEqual([
      'type',
      'code',
      'purchaseOrder',
      'receiver',
      'requester',
      'createdAt',
    ])
  })

  it('có HĐ, ghi chú, người xác nhận (Đã xuất) / người huỷ (Đã huỷ)', async () => {
    route('get', FORM_URL, () =>
      ok(
        makeForm({
          status: 'CONFIRMED',
          invoiceCode: 'HD-9',
          note: 'Giao gấp',
          approverSlug: 'h',
          approverName: 'Lê Thu Hà',
        }),
      ),
    )
    await show()
    expect(info('invoiceCode')).toHaveTextContent('Số HĐHD-9')
    expect(info('note')).toHaveTextContent('Ghi chúGiao gấp')
    expect(info('approver')).toHaveTextContent('Người xác nhậnLê Thu Hà')
    expect(infoKeys()).toEqual([
      'type',
      'code',
      'purchaseOrder',
      'receiver',
      'invoiceCode',
      'note',
      'requester',
      'approver',
      'createdAt',
    ])
    await act(async () => {
      client.setQueryData(
        exportFormKeys.detail('wh-a', 'px-1'),
        makeForm({ status: 'CANCELLED', approverSlug: 'h', approverName: 'Lê Thu Hà' }),
      )
    })
    await settled()
    expect(info('approver')).toHaveTextContent('Người huỷLê Thu Hà')
  })
})

describe('ExportDetailScreen — dòng vật tư và nhãn lô', () => {
  it('dòng có lô hiện "HSD … · nhập …" khi tải được lô; không lô → không viên', async () => {
    const entry = new Date()
    entry.setDate(5)
    entry.setMonth(9)
    const entryIso = `${entry.getFullYear()}-10-05`
    route('get', FORM_URL, () =>
      ok(
        makeForm({
          items: [
            item(1, { batchSlug: 'b-1', batchExpiryDate: '2027-03-12' }),
            item(2),
            item(3, { batchSlug: 'b-3', batchExpiryDate: null }),
          ],
        }),
      ),
    )
    route('get', BATCHES_URL, (config) => {
      const m = (config.params as { materialSlug: string }).materialSlug
      const batch = (slug: string, expiryDate: string | null) => ({
        slug,
        entryDate: entryIso,
        expiryDate,
        quantity: 5,
        remainingQuantity: 5,
        reservedQuantity: 0,
        availableQuantity: 5,
        status: 1,
        materialSlug: m,
        baseUnit: null,
      })
      return page(
        m === 'm-1' ? [batch('b-1', '2027-03-12')] : m === 'm-3' ? [batch('b-3', null)] : [],
      )
    })
    await show()
    expect(screen.getByText('HSD 12/03/2027 · nhập 05/10')).toBeOnTheScreen()
    expect(screen.getByText('Không HSD · nhập 05/10')).toBeOnTheScreen()
    // Dòng 2 không có lô: không viên lô.
    expect(screen.getAllByText(/HSD/)).toHaveLength(2)
    // Chỉ lấy lô theo vật tư có `batchSlug`, không lọc tồn.
    const calls = callsTo('get', BATCHES_URL)
    expect(calls).toHaveLength(2)
  })

  it('tải lô lỗi → vẫn hiện HSD của dòng (không phần nhập)', async () => {
    route('get', FORM_URL, () =>
      ok(makeForm({ items: [item(1, { batchSlug: 'b-1', batchExpiryDate: '2027-03-12' })] })),
    )
    route('get', BATCHES_URL, () => 'network')
    await show()
    expect(screen.getByText('HSD 12/03/2027')).toBeOnTheScreen()
  })

  it('dòng như bước 3 của form: tên, số lượng × đơn giá, thành tiền, mã vật tư, ghi chú dòng; không bấm được', async () => {
    route('get', FORM_URL, () =>
      ok(makeForm({ items: [item(1, { quantity: 2.5, amount: 50_000, note: 'Giao gấp' })] })),
    )
    await show()
    expect(screen.getByText('Thép cuộn 1')).toBeOnTheScreen()
    expect(screen.getByText(/VT-01/)).toBeOnTheScreen()
    expect(screen.getByText(/2,5 kg × 20\.000 đ/)).toBeOnTheScreen()
    expect(screen.getByText('50.000 đ')).toBeOnTheScreen()
    expect(screen.getByText(/Giao gấp/)).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Vật tư · 1' })).toBeOnTheScreen()
  })

  it('PENDING: dòng chưa gán lô không hiện "Lô tự động"', async () => {
    route('get', FORM_URL, () => ok(makeForm({ items: [item(1)] })))
    await show()
    expect(screen.queryByText(/Lô tự động/)).toBeNull()
  })

  it('DRAFT: dòng chưa gán lô hiện "Lô tự động"', async () => {
    route('get', FORM_URL, () => ok(makeForm({ status: 'DRAFT', items: [item(1)] })))
    await show()
    expect(screen.getByText(/Lô tự động/)).toBeOnTheScreen()
  })
})

describe('ExportDetailScreen — Xác nhận / Huỷ (PENDING)', () => {
  it('MANAGER thấy [Huỷ] [Xác nhận xuất kho]; Xác nhận → hỏi → POST /confirm {version} → Đã xuất, hết nút', async () => {
    let status: ExportFormStatus = 'PENDING'
    route('get', FORM_URL, () => ok(makeForm({ status, approverName: 'An', approverSlug: 'u' })))
    route('post', `${FORM_URL}/confirm`, (config) => {
      expect(JSON.parse(config.data as string)).toEqual({ version: 3 })
      status = 'CONFIRMED'
      return ok(makeForm({ status }))
    })
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await show()
    expect(cancelBtn()).not.toBeNull()
    await act(async () => fireEvent.press(confirmBtn()!))
    await settled()
    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Xác nhận xuất kho PX-20261105-0001?' }),
    )
    expect(callsTo('post', `${FORM_URL}/confirm`)).toHaveLength(1)
    expect(screen.getByText('Đã xuất')).toBeOnTheScreen()
    expect(confirmBtn()).toBeNull()
    expect(cancelBtn()).toBeNull()
    expect(screen.queryByTestId('export-detail-dock')).toBeNull()
  })

  it('Huỷ → hỏi (nói rõ phiếu thành Đã huỷ) → POST /cancel {version} → Đã huỷ', async () => {
    let status: ExportFormStatus = 'PENDING'
    route('get', FORM_URL, () => ok(makeForm({ status })))
    route('post', `${FORM_URL}/cancel`, (config) => {
      expect(JSON.parse(config.data as string)).toEqual({ version: 3 })
      status = 'CANCELLED'
      return ok(makeForm({ status }))
    })
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await show()
    await act(async () => fireEvent.press(cancelBtn()!))
    await settled()
    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Huỷ phiếu PX-20261105-0001?',
        message: expect.stringContaining('Đã huỷ'),
        destructive: true,
      }),
    )
    expect(callsTo('post', `${FORM_URL}/cancel`)).toHaveLength(1)
    expect(screen.getByText('Đã huỷ')).toBeOnTheScreen()
    expect(cancelBtn()).toBeNull()
  })

  it('không đồng ý ở hộp hỏi → không gọi server', async () => {
    route('get', FORM_URL, () => ok(makeForm()))
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    await show()
    await act(async () => fireEvent.press(confirmBtn()!))
    await settled()
    expect(callsTo('post', `${FORM_URL}/confirm`)).toHaveLength(0)
  })

  it('xác nhận lỗi → câu lỗi mức phiếu, nút còn; thiếu hàng có câu riêng', async () => {
    route('get', FORM_URL, () => ok(makeForm()))
    route('post', `${FORM_URL}/confirm`, () => failure(409, 100817))
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await show()
    await act(async () => fireEvent.press(confirmBtn()!))
    await settled()
    expect(screen.getByTestId('export-detail-error')).toHaveTextContent(/Tồn khả dụng không đủ/)
    expect(confirmBtn()).not.toBeNull()
    expect(useFormNotice.getState().notice).toMatchObject({ kind: 'export', formSlug: 'px-1' })
  })

  it('đóng thông báo → hết thông báo trong store', async () => {
    route('get', FORM_URL, () => ok(makeForm()))
    route('post', `${FORM_URL}/confirm`, () => failure(409, 100817))
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await show()
    await act(async () => fireEvent.press(confirmBtn()!))
    await settled()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' })))
    expect(screen.queryByTestId('export-detail-error')).toBeNull()
    expect(useFormNotice.getState().notice).toBeNull()
  })

  it('rời màn → bỏ thông báo của phiếu này, giữ thông báo của phiếu khác', async () => {
    route('get', FORM_URL, () => ok(makeForm()))
    route('post', `${FORM_URL}/confirm`, () => failure(409, 100817))
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    const view = await show()
    await act(async () => fireEvent.press(confirmBtn()!))
    await settled()
    expect(useFormNotice.getState().notice).toMatchObject({ formSlug: 'px-1' })
    await view.unmount()
    expect(useFormNotice.getState().notice).toBeNull()

    useFormNotice.getState().show({ kind: 'export', formSlug: 'px-2', message: 'x' })
    const again = await show()
    await again.unmount()
    expect(useFormNotice.getState().notice).toMatchObject({ formSlug: 'px-2' })
  })

  it('rời màn khi yêu cầu đang bay, lỗi về sau → KHÔNG đẩy thông báo cũ vào store', async () => {
    route('get', FORM_URL, () => ok(makeForm()))
    route('post', `${FORM_URL}/confirm`, () => failure(409, 100817))
    let answer!: (v: boolean) => void
    jest.mocked(confirmAction).mockReturnValueOnce(new Promise<boolean>((r) => (answer = r)))
    const view = await show()
    await act(async () => fireEvent.press(confirmBtn()!))
    await view.unmount()
    await act(async () => answer(true))
    await settled()
    expect(callsTo('post', `${FORM_URL}/confirm`)).toHaveLength(1)
    expect(useFormNotice.getState().notice).toBeNull()
  })

  it('xuất huỷ: 403 trơn khi xác nhận → "Bạn không có quyền duyệt phiếu xuất huỷ."', async () => {
    route('get', FORM_URL, () => ok(makeForm({ type: 'DISPOSAL' })))
    // Guard của Nest: 403 trơn, không `code`.
    route('post', `${FORM_URL}/confirm`, () => ({
      status: 403,
      data: {
        statusCode: 403,
        message: 'Forbidden resource',
        timestamp: '',
        path: '',
        method: 'POST',
      },
    }))
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await show()
    await act(async () => fireEvent.press(confirmBtn()!))
    await settled()
    expect(screen.getByTestId('export-detail-error')).toHaveTextContent(
      'Bạn không có quyền duyệt phiếu xuất huỷ.',
    )
  })

  it('PENDING DISPOSAL thiếu quyền duyệt huỷ → Xác nhận khoá + "Cần quyền duyệt xuất huỷ"; vẫn Huỷ được', async () => {
    signIn(['EXPORT_FORM_READ', 'EXPORT_FORM_CONFIRM'])
    route('get', FORM_URL, () => ok(makeForm({ type: 'DISPOSAL' })))
    await show()
    expect(confirmBtn()).toBeDisabled()
    expect(screen.getByText('Cần quyền duyệt xuất huỷ')).toBeOnTheScreen()
    expect(cancelBtn()).not.toBeNull()
    await act(async () => fireEvent.press(confirmBtn()!))
    expect(confirmAction).not.toHaveBeenCalled()
  })

  it('không có EXPORT_FORM_CONFIRM → không nút nào', async () => {
    signIn(['EXPORT_FORM_READ'])
    route('get', FORM_URL, () => ok(makeForm()))
    await show()
    expect(confirmBtn()).toBeNull()
    expect(cancelBtn()).toBeNull()
    expect(screen.queryByTestId('export-detail-dock')).toBeNull()
  })
})

describe('ExportDetailScreen — Nháp', () => {
  it('người sửa được: "Sửa phiếu" → modal /export-form/<slug>/edit; không Xác nhận / Huỷ', async () => {
    signIn(STAFF, 'own')
    route('get', FORM_URL, () => ok(makeForm({ status: 'DRAFT', requesterSlug: 'own' })))
    await show()
    expect(confirmBtn()).toBeNull()
    expect(cancelBtn()).toBeNull()
    await act(async () => fireEvent.press(editBtn()!))
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/export-form/[formSlug]/edit',
      params: { formSlug: 'px-1' },
    })
    expect(moreItem()).toBeUndefined()
  })

  it('đang huỷ (hộp hỏi / yêu cầu đang chạy) → "Sửa phiếu" bị khoá', async () => {
    signIn(['EXPORT_FORM_READ', 'EXPORT_FORM_CONFIRM', 'EXPORT_FORM_UPDATE_DRAFT'], 'u')
    route('get', FORM_URL, () => ok(makeForm({ status: 'DRAFT' })))
    jest.mocked(confirmAction).mockReturnValueOnce(new Promise<boolean>(() => {}))
    await show()
    expect(editBtn()).toBeEnabled()
    const cancelItem = moreItem()!.menu.items[0] as { onPress: () => void }
    await act(async () => cancelItem.onPress())
    expect(editBtn()).toBeDisabled()
  })

  it('Nháp của người khác, chỉ có _OWN → không nút nào', async () => {
    signIn(STAFF, 'me')
    route('get', FORM_URL, () => ok(makeForm({ status: 'DRAFT', requesterSlug: 'other' })))
    await show()
    expect(editBtn()).toBeNull()
    expect(screen.queryByTestId('export-detail-dock')).toBeNull()
  })

  it('MANAGER: không "Sửa phiếu"; menu ⋯ [Huỷ phiếu] → hỏi lại → POST /cancel → Đã huỷ', async () => {
    let status: ExportFormStatus = 'DRAFT'
    route('get', FORM_URL, () => ok(makeForm({ status })))
    route('post', `${FORM_URL}/cancel`, () => {
      status = 'CANCELLED'
      return ok(makeForm({ status }))
    })
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await show()
    expect(editBtn()).toBeNull()
    expect(screen.queryByTestId('export-detail-dock')).toBeNull()
    const more = moreItem()!
    expect(more.icon).toEqual({ type: 'sfSymbol', name: 'ellipsis' })
    expect(more.label).toBe('Tuỳ chọn')
    const cancelItem = more.menu.items[0] as {
      label: string
      destructive?: boolean
      onPress: () => void
    }
    expect(cancelItem).toMatchObject({ label: 'Huỷ phiếu', destructive: true })
    await act(async () => cancelItem.onPress())
    await settled()
    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Huỷ phiếu PX-20261105-0001?',
        message: expect.stringContaining('Đã huỷ'),
        confirmLabel: 'Huỷ phiếu',
        destructive: true,
      }),
    )
    expect(callsTo('post', `${FORM_URL}/cancel`)).toHaveLength(1)
    expect(screen.getByText('Đã huỷ')).toBeOnTheScreen()
    expect(moreItem()).toBeUndefined()
  })
})

describe('ExportDetailScreen — Đã xuất / Đã huỷ', () => {
  it.each(['CONFIRMED', 'CANCELLED'] as const)('%s → không nút, không ⋯', async (status) => {
    route('get', FORM_URL, () => ok(makeForm({ status })))
    await show()
    expect(confirmBtn()).toBeNull()
    expect(cancelBtn()).toBeNull()
    expect(editBtn()).toBeNull()
    expect(moreItem()).toBeUndefined()
    expect(screen.queryByTestId('export-detail-dock')).toBeNull()
  })
})

describe('ExportDetailScreen — tải / làm mới', () => {
  it('tải lỗi lần đầu → màn lỗi + Thử lại', async () => {
    let fail = true
    route('get', FORM_URL, () => (fail ? 'network' : ok(makeForm())))
    await show()
    expect(screen.getByText('Không tải được phiếu xuất')).toBeOnTheScreen()
    fail = false
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Thử lại' })))
    await settled()
    expect(screen.getAllByText('Tổ hàn A').length).toBeGreaterThan(0)
  })

  it('làm mới lỗi khi đã có dữ liệu → ErrorBanner, giữ phiếu cũ', async () => {
    let fail = false
    route('get', FORM_URL, () => (fail ? 'network' : ok(makeForm())))
    await show()
    fail = true
    await act(async () => {
      await client.refetchQueries({ queryKey: exportFormKeys.detail('wh-a', 'px-1') })
    })
    await settled()
    expect(screen.getByText('Không làm mới được phiếu xuất')).toBeOnTheScreen()
    expect(screen.getAllByText('Tổ hàn A').length).toBeGreaterThan(0)
  })

  it('phiếu bị xoá (101401) → màn lỗi tải, không giữ bản cũ, không nút', async () => {
    let gone = false
    route('get', FORM_URL, () => (gone ? failure(404, 101401) : ok(makeForm())))
    await show()
    gone = true
    await act(async () => {
      await client.invalidateQueries({ queryKey: exportFormKeys.warehouse('wh-a') })
    })
    await settled()
    expect(screen.getByText('Không tải được phiếu xuất')).toBeOnTheScreen()
    expect(screen.getByText('Phiếu xuất không còn trên máy chủ.')).toBeOnTheScreen()
    expect(screen.queryByText('Tổ hàn A')).toBeNull()
    expect(confirmBtn()).toBeNull()
  })

  it('đổi kho → popToTop', async () => {
    route('get', FORM_URL, () => ok(makeForm()))
    await show()
    expect(mockDispatch).not.toHaveBeenCalled()
    route('get', '/warehouses/wh-b/export-forms/px-1', () => failure(404, 101401))
    await act(async () => useWarehouseStore.setState({ current: WH_B }))
    await settled()
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'POP_TO_TOP' }))
  })

  it("'new' (phiếu chưa có trên server) → chuyển giao sang modal /export-form/new/info, không gọi GET", async () => {
    mockParams.formSlug = 'new'
    await show()
    expect(mockHandOff).toHaveBeenCalledTimes(1)
    expect(mockHandOff).toHaveBeenCalledWith('/export-form/new/info')
    expect(mockReplace).not.toHaveBeenCalled()
    expect(callsTo('get', '/warehouses/wh-a/export-forms/new')).toHaveLength(0)
  })
})
