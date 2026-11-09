// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'
import type { ReactElement } from 'react'
import { Platform, StyleSheet } from 'react-native'

import { importFormKeys, type ImportForm } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  draftFromForm,
  draftStorageKey,
  stopDraftPersistence,
  useReceiveDraft,
} from '@/features/receive-checklist'
import {
  makeDraft,
  makeForm,
  makeItem,
  makeLine,
} from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { lightColors } from '@/shared/theme/tokens'

import { ImportDetailScreen } from './ImportDetailScreen'

const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockReplace = jest.fn()
/** Chuyển giao sang modal (`useHandOffToModal`) chỉ được ghi lại — chạy thật ở `routing.test.tsx`. */
const mockHandOff = jest.fn()
jest.mock('@/shared/lib/useHandOffToModal', () => ({ useHandOffToModal: () => mockHandOff }))
const mockDispatch = jest.fn()
const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
const mockParams: { formSlug: string } = { formSlug: 'pn-1' }
type FocusEffect = () => void | (() => void)
/**
 * Các hiệu ứng `useFocusEffect` đang gắn — `refocus()` gọi lại để giả lập màn được focus lần nữa.
 * `focused = false` giả lập màn đang bị che (màn kiểm nằm trên): hiệu ứng đổi thì không chạy, như
 * expo-router.
 */
const mockFocus: { active: Set<FocusEffect>; focused: boolean } = {
  active: new Set(),
  focused: true,
}
const refocus = () => act(async () => mockFocus.active.forEach((effect) => void effect()))
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react')
  return {
    useRouter: () => ({ push: mockPush, navigate: mockNavigate, replace: mockReplace }),
    useNavigation: () => ({
      dispatch: mockDispatch,
      // Màn đang ở đỉnh Stack của tab (xem `useLeaveOnWarehouseChange`).
      getState: () => ({ index: 1, routes: [{ key: 'list' }, { key: 'me' }] }),
    }),
    useRoute: () => ({ key: 'me' }),
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: FocusEffect) => {
      useEffect(() => {
        mockFocus.active.add(effect)
        const undo = mockFocus.focused ? effect() : undefined
        return () => {
          mockFocus.active.delete(effect)
          undo?.()
        }
      }, [effect])
    },
    Stack: {
      Screen: ({ options }: { options: NativeStackNavigationOptions }) => {
        mockHeader.options = options
        return null
      },
    },
  }
})

jest.mock('@/shared/lib/native-confirm', () => ({
  chooseAction: jest.fn(),
  confirmAction: jest.fn(),
}))

const WH_A = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const WH_B = { slug: 'wh-b', code: 'B', name: 'Kho Thủ Đức', isManager: false }
const FORM_URL = '/warehouses/wh-a/import-forms/pn-1'
const KEY = draftStorageKey('u', 'wh-a', 'pn-1')

/** Phiếu như mockup: 6 dòng, NCC Hoà Phát, có PO + ghi chú. */
function mockupForm(over: Partial<ImportForm> = {}): ImportForm {
  const items = Array.from({ length: 6 }, (_, i) =>
    makeItem(i + 1, { supplierSlug: 'hp', supplierName: 'Công ty TNHH Thép Hoà Phát' }),
  )
  return makeForm(items, {
    code: 'PN-20261105-0912',
    invoiceCode: '0012345',
    purchaseOrder: '7781',
    requesterName: 'Nguyễn Văn Tuấn',
    date: '2026-11-05',
    total: 46_176_000,
    note: 'Giao 2 đợt',
    ...over,
  })
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
      <ImportDetailScreen />
    </QueryClientProvider>,
  )
  await settled()
  return view
}

const checkButton = () => screen.queryByRole('button', { name: /^Kiểm hàng/ })
const rightItems = (): NativeStackHeaderItem[] =>
  mockHeader.options.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: false }) ?? []
type MenuAction = { label: string; destructive?: boolean; disabled?: boolean; onPress: () => void }
/** Menu `⋯` (iOS, UIMenu) trên header; không có → `undefined`. */
const moreMenu = () =>
  rightItems().find((i) => i.type === 'menu') as
    { type: 'menu'; disabled?: boolean; menu: { items: MenuAction[] } } | undefined
const menuLabels = () => moreMenu()?.menu.items.map((i) => i.label) ?? []
const menuItem = (label: string) => moreMenu()!.menu.items.find((i) => i.label === label)!
/** MANAGER: xác nhận được → checklist "Kiểm hàng" (mặc định của file). */
const MANAGER = ['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT', 'IMPORT_FORM_CONFIRM']
function signIn(scope: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH_A, WH_B] } as never,
  })
}
/** Một dòng "Thông tin" theo khoá cố định (nhãn và giá trị cùng một hàng). */
const info = (
  key:
    | 'supplier'
    | 'invoiceCode'
    | 'purchaseOrder'
    | 'date'
    | 'code'
    | 'requester'
    | 'approver'
    | 'note',
) => screen.getByTestId(`import-info-${key}`)
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never)

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(async () => {
  jest.clearAllMocks()
  // `clearAllMocks` không bỏ giá trị `…Once` chưa dùng của test trước.
  jest.mocked(chooseAction).mockReset()
  jest.mocked(confirmAction).mockReset()
  resetFakeApi()
  await AsyncStorage.clear()
  useReceiveDraft.getState().reset()
  useFormNotice.getState().reset()
  mockHeader.options = {}
  mockParams.formSlug = 'pn-1'
  mockFocus.focused = true
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH_A, resolved: true, resolution: 'selected' })
  signIn(MANAGER)
})

afterEach(async () => {
  // Gỡ màn TRƯỚC khi xoá cache: `client.clear()` khi màn còn gắn sẽ báo cập nhật ngoài act().
  await cleanup()
  stopDraftPersistence()
  useReceiveDraft.getState().reset()
  client.clear()
})

describe('ImportDetailScreen — đầu phiếu', () => {
  it('tiêu đề = mã phiếu, không có nút phải; nhãn Nháp vàng, NCC đậm 20, tổng tiền server, số dòng', async () => {
    // Chỉ xem: không mục nào cho `⋯` → không có nút phải.
    signIn(['IMPORT_FORM_READ'])
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(mockHeader.options.title).toBe('PN-20261105-0912')
    expect(mockHeader.options.unstable_headerRightItems).toBeUndefined()
    expect(mockHeader.options.headerRight).toBeUndefined()
    expect(screen.getByText('Nháp')).toBeOnTheScreen()
    expect(screen.getByTestId('import-detail-status')).toHaveStyle({
      backgroundColor: lightColors.warningSoft,
    })
    const supplier = screen.getByRole('header', { name: 'Công ty TNHH Thép Hoà Phát' })
    expect(flat(supplier)).toMatchObject({ fontSize: 20, fontWeight: '700' })
    // Tổng tiền là `total` của server (không tự cộng lại từ dòng).
    const total = screen.getByText('46.176.000 đ')
    expect(flat(total)).toMatchObject({ fontSize: 28, fontVariant: ['tabular-nums'] })
    expect(screen.getByText('6 dòng vật tư')).toBeOnTheScreen()
    expect(screen.getByText('Tổng cộng')).toBeOnTheScreen()
    expect(screen.getByTestId('import-detail-hero-total')).toHaveTextContent('46.176.000 đ')
  })

  it('chứng từ: file null thì không có dòng', async () => {
    route('get', FORM_URL, () => ok(makeForm([makeItem(1)], { file: null })))
    await show()
    expect(screen.queryByTestId('import-attachment')).toBeNull()
  })

  it('chứng từ: có URL thì hiện dòng với tên, bấm được', async () => {
    route('get', FORM_URL, () =>
      ok(makeForm([makeItem(1)], { file: 'https://s3.example.com/f/hoa-don-1700000000000.pdf' })),
    )
    await show()
    expect(screen.getByTestId('import-attachment')).toBeOnTheScreen()
    expect(screen.getByText('hoa-don.pdf')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Chứng từ, hoa-don.pdf' })).toBeOnTheScreen()
  })

  it('chứng từ: key cũ hiện tên, không bấm được', async () => {
    route('get', FORM_URL, () => ok(makeForm([makeItem(1)], { file: 'old/key-1700000000000.pdf' })))
    await show()
    expect(screen.getByText('key.pdf')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /Chứng từ/ })).toBeNull()
  })

  it('không dòng nào có NCC → "Chưa có bên bán" (mờ), không có dòng Bên bán', async () => {
    route('get', FORM_URL, () => ok(makeForm([makeItem(1)], { total: 10_000 })))
    await show()
    expect(screen.queryByTestId('import-info-supplier')).toBeNull()
    expect(screen.getByText('Chưa có bên bán')).toHaveStyle({
      color: lightColors.mutedForeground,
    })
    expect(screen.getByText('1 dòng vật tư')).toBeOnTheScreen()
  })

  it('NCC suy ra = NCC xuất hiện nhiều nhất ở các dòng', async () => {
    const items = [
      makeItem(1, { supplierSlug: 'a', supplierName: 'Cty A' }),
      makeItem(2, { supplierSlug: 'b', supplierName: 'Cty B' }),
      makeItem(3, { supplierSlug: 'b', supplierName: 'Cty B' }),
    ]
    route('get', FORM_URL, () => ok(makeForm(items)))
    await show()
    expect(screen.getByRole('header', { name: 'Cty B' })).toBeOnTheScreen()
    expect(screen.queryByText('Cty A')).toBeNull()
  })

  it('Đã xác nhận nền xanh, Đã huỷ nền xám (chữ của importForms:status)', async () => {
    route('get', FORM_URL, () => ok(mockupForm({ status: 'CONFIRMED' })))
    await show()
    expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen()
    expect(screen.getByTestId('import-detail-status')).toHaveStyle({
      backgroundColor: lightColors.successSoft,
    })
    await act(async () => {
      client.setQueryData(
        importFormKeys.detail('wh-a', 'pn-1'),
        mockupForm({ status: 'CANCELLED' }),
      )
    })
    await settled()
    expect(screen.getByText('Đã huỷ')).toBeOnTheScreen()
    expect(screen.getByTestId('import-detail-status')).toHaveStyle({
      backgroundColor: lightColors.fill,
    })
  })
})

describe('ImportDetailScreen — Thông tin', () => {
  it('Bên bán, Số HĐ, Ngày nhập, Mã phiếu, PO, Ghi chú, Người tạo (mã là chữ đơn cách, ngày là số)', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(screen.getByRole('header', { name: 'Thông tin' })).toBeOnTheScreen()
    expect(info('supplier')).toHaveTextContent('Bên bánCông ty TNHH Thép Hoà Phát')
    expect(info('invoiceCode')).toHaveTextContent('Số HĐ0012345')
    expect(flat(screen.getByText('0012345')).fontFamily).toBe('ui-monospace')
    expect(info('date')).toHaveTextContent('Ngày nhập05/11/2026')
    expect(flat(screen.getByText('05/11/2026')).fontVariant).toEqual(['tabular-nums'])
    expect(info('code')).toHaveTextContent('Mã phiếuPN-20261105-0912')
    expect(info('purchaseOrder')).toHaveTextContent('Số PO7781')
    expect(info('requester')).toHaveTextContent('Người tạoNguyễn Văn Tuấn')
    expect(info('note')).toHaveTextContent('Ghi chúGiao 2 đợt')
    const keys = screen
      .getAllByTestId(/^import-info-[A-Za-z]+$/)
      .map((r) => r.props.testID.replace('import-info-', ''))
    expect(keys).toEqual([
      'supplier',
      'invoiceCode',
      'date',
      'code',
      'purchaseOrder',
      'note',
      'requester',
    ])
    // Ghi chú tối đa 3 dòng, các giá trị khác 1 dòng.
    expect(screen.getByText('Giao 2 đợt').props.numberOfLines).toBe(3)
    expect(screen.getByText('Nguyễn Văn Tuấn').props.numberOfLines).toBe(1)
    // Phiếu Nháp không có người xác nhận / huỷ.
    expect(screen.queryByText('Người xác nhận')).toBeNull()
    expect(screen.queryByText('Người huỷ')).toBeNull()
  })

  it('không có PO / ghi chú → ẩn dòng tương ứng', async () => {
    route('get', FORM_URL, () => ok(mockupForm({ purchaseOrder: null, note: null })))
    await show()
    expect(screen.queryByTestId('import-info-purchaseOrder')).toBeNull()
    expect(screen.queryByTestId('import-info-note')).toBeNull()
    expect(info('invoiceCode')).toBeOnTheScreen()
  })

  it('Đã xác nhận → "Người xác nhận"; Đã huỷ → "Người huỷ" (approverName)', async () => {
    route('get', FORM_URL, () =>
      ok(mockupForm({ status: 'CONFIRMED', approverSlug: 'h', approverName: 'Lê Thu Hà' })),
    )
    await show()
    expect(info('approver')).toHaveTextContent('Người xác nhậnLê Thu Hà')
    await act(async () => {
      client.setQueryData(
        importFormKeys.detail('wh-a', 'pn-1'),
        mockupForm({ status: 'CANCELLED', approverSlug: 'h', approverName: 'Lê Thu Hà' }),
      )
    })
    await settled()
    expect(info('approver')).toHaveTextContent('Người huỷLê Thu Hà')
    expect(screen.queryByText('Người xác nhận')).toBeNull()
  })

  it('Đã xác nhận nhưng không có approverName → không có dòng người xác nhận', async () => {
    route('get', FORM_URL, () => ok(mockupForm({ status: 'CONFIRMED' })))
    await show()
    expect(screen.queryByText('Người xác nhận')).toBeNull()
  })
})

describe('ImportDetailScreen — Vật tư', () => {
  it('"Vật tư · n"; dòng theo lineNo là một phần tử a11y: tên, số × giá, mã · HSD, thành tiền', async () => {
    const items = [
      makeItem(2, {
        materialName: 'Tôn lạnh 0.45mm',
        materialCode: 'VT-TON-045',
        unitName: 'tấm',
        unitPrice: 312_000,
        quantity: 50,
        amount: 15_600_000,
        expiryDate: '2028-06-30',
        note: 'Hàng dễ vỡ',
      }),
      makeItem(1, {
        materialName: 'Thép hộp 40×80×1.4',
        materialCode: 'VT-THP-4080',
        unitName: 'cây',
        unitPrice: 0,
        quantity: 120,
        amount: 0,
      }),
    ]
    route('get', FORM_URL, () => ok(makeForm(items)))
    await show()
    expect(screen.getByRole('header', { name: 'Vật tư · 2' })).toBeOnTheScreen()
    const rows = screen.getAllByTestId(/^import-item-it-\d+$/)
    expect(rows.map((r) => r.props.testID)).toEqual(['import-item-it-1', 'import-item-it-2'])
    expect(rows[0]).toHaveTextContent(/Thép hộp 40×80×1\.4/)
    expect(rows[0]).toHaveTextContent(/120 cây · Chưa có giá/)
    expect(rows[0]).toHaveTextContent(/VT-THP-4080 · Không HSD/)
    expect(rows[0]).toHaveAccessibleName(/Thép hộp 40×80×1\.4/)
    expect(rows[1]).toHaveTextContent(/50 tấm × 312\.000 đ/)
    expect(rows[1]).toHaveTextContent(/HSD 30\/06\/2028/)
    expect(rows[1]).toHaveTextContent(/Hàng dễ vỡ/)
    expect(rows[1]).toHaveTextContent(/15\.600\.000 đ/)
    // Dòng chỉ để xem: không bấm được.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Thép hộp/ })).toBeNull()
  })

  it('tên rất dài, số lượng 6 chữ số lẻ, tiền rất lớn vẫn hiện đủ trong dòng', async () => {
    const long = 'Thép cuộn cán nóng '.repeat(8).trim()
    const items = [
      makeItem(1, {
        materialName: long,
        quantity: 12.345678,
        unitPrice: 99_999_999.99,
        amount: 1_234_567_888_888,
      }),
    ]
    route('get', FORM_URL, () => ok(makeForm(items, { total: 1_234_567_888_888 })))
    await show()
    const row = screen.getByTestId('import-item-it-1')
    expect(row).toHaveTextContent(/12,345678 bao/)
    expect(screen.getAllByText(/1\.234\.567\.888\.888 đ/).length).toBeGreaterThan(0)
  })
})

describe('ImportDetailScreen — nút "Kiểm hàng"', () => {
  it('phiếu Nháp: nút viên thuốc "Kiểm hàng" ở đáy → push /import/[formSlug]/receive', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    const button = checkButton()!
    expect(button).toHaveAccessibleName('Kiểm hàng')
    expect(screen.getByTestId('import-detail-dock')).toBeOnTheScreen()
    await act(async () => fireEvent.press(button))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/import/[formSlug]/receive',
      params: { formSlug: 'pn-1' },
    })
  })

  it.each(['CONFIRMED', 'CANCELLED'] as const)('%s → không có nút ở đáy', async (status) => {
    route('get', FORM_URL, () => ok(mockupForm({ status })))
    await show()
    expect(checkButton()).toBeNull()
    expect(screen.queryByTestId('import-detail-dock')).toBeNull()
  })

  it('bản nháp đã lưu trên máy có 3/6 dòng đã kiểm → "Kiểm hàng · đã kiểm 3/6"', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    const draft = makeDraft(
      Array.from({ length: 6 }, (_, i) => makeLine(i + 1, { checked: i < 3 })),
    )
    await AsyncStorage.setItem(KEY, JSON.stringify(draft))
    await show()
    expect(checkButton()).toHaveAccessibleName('Kiểm hàng · đã kiểm 3/6')
    // Chỉ xem: không nạp bản nháp vào store.
    expect(useReceiveDraft.getState().ctx).toBeNull()
  })

  it('cờ checklist tắt: nút "Duyệt phiếu", không "đã kiểm n/m" dù còn dấu kiểm cũ', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/features/receive-checklist/model/flags').__setChecklistEnabled(false)
    route('get', FORM_URL, () => ok(mockupForm()))
    const draft = makeDraft(
      Array.from({ length: 6 }, (_, i) => makeLine(i + 1, { checked: i < 3 })),
    )
    await AsyncStorage.setItem(KEY, JSON.stringify(draft))
    await show()
    expect(screen.getByRole('button', { name: 'Duyệt phiếu' })).toBeOnTheScreen()
    expect(checkButton()).toBeNull()
  })

  it('bản nháp trên máy chưa kiểm dòng nào → chỉ "Kiểm hàng"', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await AsyncStorage.setItem(KEY, JSON.stringify(makeDraft([makeLine(1), makeLine(2)])))
    await show()
    expect(checkButton()).toHaveAccessibleName('Kiểm hàng')
  })

  it('bản nháp của kho khác / người khác không tính', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    const draft = makeDraft([makeLine(1, { checked: true })])
    await AsyncStorage.setItem(draftStorageKey('u', 'wh-b', 'pn-1'), JSON.stringify(draft))
    await AsyncStorage.setItem(draftStorageKey('x', 'wh-a', 'pn-1'), JSON.stringify(draft))
    await show()
    expect(checkButton()).toHaveAccessibleName('Kiểm hàng')
  })

  it('quay lại từ màn kiểm (focus lại) → đọc bản nháp trong bộ nhớ, nhãn cập nhật', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(checkButton()).toHaveAccessibleName('Kiểm hàng')
    // Màn kiểm đã nạp bản nháp và người dùng đánh dấu 2 dòng (chưa kịp ghi xuống máy).
    useReceiveDraft.setState({
      ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' },
      draft: makeDraft([
        makeLine(1, { checked: true }),
        makeLine(2, { checked: true }),
        makeLine(3),
      ]),
    })
    await refocus()
    expect(checkButton()).toHaveAccessibleName('Kiểm hàng · đã kiểm 2/3')
  })

  it('danh sách chừa đáy theo chiều cao đo được của vùng nổi', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    await act(async () => {
      fireEvent(screen.getByTestId('import-detail-dock-content'), 'layout', {
        nativeEvent: { layout: { height: 68, width: 300, x: 0, y: 0 } },
      })
    })
    const list = screen.getByTestId('import-detail-list')
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({
      paddingBottom: 68 + 16,
    })
  })

  it('confirmer sees Kiểm hàng and ⋯ with Sửa phiếu that navigates to modal /import-form/<slug>/edit', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    signIn(MANAGER)
    route('get', FORM_URL, () => ok(mockupForm()))
    jest.mocked(chooseAction).mockResolvedValueOnce(0)
    await show()
    expect(checkButton()).toHaveAccessibleName('Kiểm hàng')
    expect(screen.queryByRole('button', { name: 'Sửa phiếu' })).toBeNull()
    const items = rightItems() as {
      type: string
      label: string
      icon?: unknown
      menu: { items: { label: string; onPress: () => void }[] }
    }[]
    expect(items).toHaveLength(1)
    // Menu thả xuống gốc (UIMenu) như `⋯` của form 3 bước — không action sheet.
    expect(items[0]).toMatchObject({
      type: 'menu',
      label: 'Tuỳ chọn',
      icon: { type: 'sfSymbol', name: 'ellipsis' },
    })
    // MANAGER (xác nhận được) cũng huỷ được; không có quyền xoá → không "Xoá phiếu nháp".
    expect(items[0]!.menu.items.map((i) => i.label)).toEqual(['Sửa phiếu', 'Huỷ phiếu'])
    await act(async () => items[0]!.menu.items[0]!.onPress())
    expect(chooseAction).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/import-form/[formSlug]/edit',
      params: { formSlug: 'pn-1' },
    })
  })

  it('Android: ⋯ là nút phẳng trên header (không UIMenu)', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    signIn(MANAGER)
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(mockHeader.options.unstable_headerRightItems).toBeUndefined()
    const Right = mockHeader.options.headerRight as () => ReactElement
    await render(<Right />)
    expect(screen.getByRole('button', { name: 'Tuỳ chọn' })).toBeOnTheScreen()
  })

  it('xác nhận được, không sửa được → ⋯ chỉ có "Huỷ phiếu" (không "Sửa phiếu")', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CONFIRM'])
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(checkButton()).toHaveAccessibleName('Kiểm hàng')
    expect(menuLabels()).toEqual(['Huỷ phiếu'])
  })

  it('non-confirmer editor sees Sửa phiếu that navigates to modal /import-form/<slug>/edit', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT', 'IMPORT_FORM_CREATE'])
    route('get', FORM_URL, () => ok(mockupForm()))
    // Có dấu đã kiểm trên máy (vd từ trước) → vẫn không hiện "· đã kiểm".
    const draft = makeDraft(Array.from({ length: 6 }, (_, i) => makeLine(i + 1, { checked: true })))
    await AsyncStorage.setItem(KEY, JSON.stringify(draft))
    await show()
    expect(checkButton()).toBeNull()
    const button = screen.getByRole('button', { name: 'Sửa phiếu' })
    expect(screen.getByTestId('import-detail-dock')).toBeOnTheScreen()
    await act(async () => fireEvent.press(button))
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/import-form/[formSlug]/edit',
      params: { formSlug: 'pn-1' },
    })
    // Không có `⋯` (đã có nút "Sửa phiếu").
    expect(rightItems()).toHaveLength(0)
  })

  it('không sửa, không xác nhận (chỉ _OWN, phiếu người khác) → không có nút, không chừa đáy', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT_OWN'])
    route('get', FORM_URL, () => ok(mockupForm({ requesterSlug: 'someone-else' })))
    await show()
    expect(checkButton()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sửa phiếu' })).toBeNull()
    expect(screen.queryByTestId('import-detail-dock')).toBeNull()
    const list = screen.getByTestId('import-detail-list')
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({
      paddingBottom: 16,
    })
  })

  it('iOS: vùng nổi là SafeAreaView cạnh đáy', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(screen.getByTestId('import-detail-dock').type).toBe('RNCSafeAreaView')
    jest.restoreAllMocks()
  })
})

describe('ImportDetailScreen — tải / làm mới', () => {
  it('tải lỗi lần đầu → màn lỗi + Thử lại; Thử lại được → hiện phiếu', async () => {
    let fail = true
    route('get', FORM_URL, () => (fail ? 'network' : ok(mockupForm())))
    await show()
    expect(screen.getByText('Không tải được phiếu nhập')).toBeOnTheScreen()
    expect(checkButton()).toBeNull()
    fail = false
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Thử lại' })))
    await settled()
    expect(screen.getByRole('header', { name: 'Công ty TNHH Thép Hoà Phát' })).toBeOnTheScreen()
  })

  it('làm mới lỗi khi đã có dữ liệu → ErrorBanner phía trên, giữ phiếu cũ', async () => {
    let fail = false
    route('get', FORM_URL, () => (fail ? 'network' : ok(mockupForm())))
    await show()
    fail = true
    await act(async () => {
      await client.refetchQueries({ queryKey: importFormKeys.detail('wh-a', 'pn-1') })
    })
    await settled()
    expect(screen.getByText('Không làm mới được phiếu nhập')).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Công ty TNHH Thép Hoà Phát' })).toBeOnTheScreen()
  })

  it('xác nhận xong ở màn kiểm (cache bị invalidate) → màn xem tải lại, hiện Đã xác nhận, hết nút', async () => {
    let status: ImportForm['status'] = 'DRAFT'
    route('get', FORM_URL, () => ok(mockupForm({ status, approverName: 'An' })))
    await show()
    expect(checkButton()).not.toBeNull()
    status = 'CONFIRMED'
    // `useReceiveActions` invalidate cả nhánh phiếu nhập của kho rồi `router.back()`.
    await act(async () => {
      await client.invalidateQueries({ queryKey: importFormKeys.warehouse('wh-a') })
    })
    await settled()
    expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen()
    expect(info('approver')).toHaveTextContent('Người xác nhậnAn')
    expect(checkButton()).toBeNull()
  })

  it('phiếu đã bị xoá (tải lại → 101301) → màn lỗi tải, không còn nút Kiểm hàng', async () => {
    let gone = false
    route('get', FORM_URL, () => (gone ? failure(404, 101301) : ok(mockupForm())))
    await show()
    gone = true
    await act(async () => {
      await client.invalidateQueries({ queryKey: importFormKeys.warehouse('wh-a') })
    })
    await settled()
    expect(screen.getByText('Không tải được phiếu nhập')).toBeOnTheScreen()
    expect(screen.getByText('Không tìm thấy phiếu nhập (có thể đã bị xoá)')).toBeOnTheScreen()
    expect(checkButton()).toBeNull()
    expect(screen.queryByText('Công ty TNHH Thép Hoà Phát')).toBeNull()
  })

  it('/import/new (link cũ) → chuyển giao sang modal /import-form/new/info, không gọi GET', async () => {
    mockParams.formSlug = 'new'
    await show()
    expect(mockHandOff).toHaveBeenCalledTimes(1)
    expect(mockHandOff).toHaveBeenCalledWith('/import-form/new/info')
    expect(mockReplace).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('đổi kho → popToTop', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(mockDispatch).not.toHaveBeenCalled()
    route('get', '/warehouses/wh-b/import-forms/pn-1', () => failure(404, 101301))
    await act(async () => useWarehouseStore.setState({ current: WH_B }))
    // Chờ lần tải theo kho mới xong (thông báo của react-query chạy bằng hẹn giờ, ngoài act).
    await settled()
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'POP_TO_TOP' }))
  })
})

describe('ImportDetailScreen — dọn bản nháp trên máy của phiếu không còn Nháp', () => {
  const ctx = { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' }
  const saved = () => makeDraft([makeLine(1, { checked: true }), makeLine(2)])

  it('phiếu Nháp → giữ bản nháp trên máy', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await AsyncStorage.setItem(KEY, JSON.stringify(saved()))
    await show()
    expect(await AsyncStorage.getItem(KEY)).not.toBeNull()
  })

  it.each(['CONFIRMED', 'CANCELLED'] as const)(
    '%s (đổi ở nơi khác) → xoá bản lưu trên máy',
    async (status) => {
      route('get', FORM_URL, () => ok(mockupForm({ status })))
      await AsyncStorage.setItem(KEY, JSON.stringify(saved()))
      await show()
      expect(await AsyncStorage.getItem(KEY)).toBeNull()
    },
  )

  it('Đã xác nhận, bản nháp đúng phiếu còn trong bộ nhớ (không đang lưu) → bỏ cả bản trong bộ nhớ', async () => {
    route('get', FORM_URL, () => ok(mockupForm({ status: 'CONFIRMED' })))
    useReceiveDraft.setState({ ctx, draft: saved() })
    await AsyncStorage.setItem(KEY, JSON.stringify(saved()))
    await show()
    expect(useReceiveDraft.getState().draft).toBeNull()
    expect(await AsyncStorage.getItem(KEY)).toBeNull()
  })

  it('phiếu bị xoá (101301) → xoá bản lưu trên máy', async () => {
    let gone = false
    route('get', FORM_URL, () => (gone ? failure(404, 101301) : ok(mockupForm())))
    await AsyncStorage.setItem(KEY, JSON.stringify(saved()))
    await show()
    expect(await AsyncStorage.getItem(KEY)).not.toBeNull()
    gone = true
    await act(async () => {
      await client.invalidateQueries({ queryKey: importFormKeys.warehouse('wh-a') })
    })
    await settled()
    expect(await AsyncStorage.getItem(KEY)).toBeNull()
  })

  it('lỗi tải khác (mất mạng) → không xoá gì', async () => {
    route('get', FORM_URL, () => 'network')
    await AsyncStorage.setItem(KEY, JSON.stringify(saved()))
    await show()
    expect(await AsyncStorage.getItem(KEY)).not.toBeNull()
  })

  it('màn kiểm đang ở trên (màn xem không focus) → không dọn; focus lại mới dọn', async () => {
    let status: ImportForm['status'] = 'DRAFT'
    route('get', FORM_URL, () => ok(mockupForm({ status })))
    await AsyncStorage.setItem(KEY, JSON.stringify(saved()))
    await show()
    // Người dùng mở màn kiểm; phiếu bị xác nhận trên web và được tải lại trong lúc đó.
    mockFocus.focused = false
    status = 'CONFIRMED'
    await act(async () => {
      await client.invalidateQueries({ queryKey: importFormKeys.warehouse('wh-a') })
    })
    await settled()
    expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen()
    // Để màn kiểm tự `load` → `discard` + báo "không còn Nháp".
    expect(await AsyncStorage.getItem(KEY)).not.toBeNull()
    // Quay lại màn xem.
    mockFocus.focused = true
    await refocus()
    await settled()
    expect(await AsyncStorage.getItem(KEY)).toBeNull()
  })
})

describe('ImportDetailScreen — ⋯ Huỷ phiếu / Xoá phiếu nháp', () => {
  const CODE = 'PN-20261105-0912'
  const CANCEL_URL = `${FORM_URL}/cancel`
  /** Đủ quyền: sửa + xác nhận (huỷ) + xoá mọi nháp. */
  const ALL = [...MANAGER, 'IMPORT_FORM_DELETE_DRAFT']
  const LIST_KEY = importFormKeys.list('wh-a')
  const notice = () => screen.queryByTestId('import-detail-error')
  const pressItem = (label: string) => act(async () => menuItem(label).onPress())

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios')
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('mục theo quyền', () => {
    it('sửa + xác nhận + xoá → [Sửa phiếu, Huỷ phiếu (đỏ), Xoá phiếu nháp (đỏ)]', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      await show()
      expect(moreMenu()!.menu.items).toEqual([
        expect.objectContaining({ label: 'Sửa phiếu' }),
        expect.objectContaining({ label: 'Huỷ phiếu', destructive: true }),
        expect.objectContaining({ label: 'Xoá phiếu nháp', destructive: true }),
      ])
      expect(moreMenu()!.menu.items[0]!.destructive).toBeFalsy()
    })

    it('chỉ xem (READ) → không có ⋯', async () => {
      signIn(['IMPORT_FORM_READ'])
      route('get', FORM_URL, () => ok(mockupForm()))
      await show()
      expect(moreMenu()).toBeUndefined()
      expect(mockHeader.options.headerRight).toBeUndefined()
    })

    it('chỉ DELETE_DRAFT_OWN: phiếu người khác → không "Xoá phiếu nháp"; phiếu của mình → có', async () => {
      signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CONFIRM', 'IMPORT_FORM_DELETE_DRAFT_OWN'])
      let requesterSlug = 'someone-else'
      route('get', FORM_URL, () => ok(mockupForm({ requesterSlug })))
      await show()
      expect(menuLabels()).toEqual(['Huỷ phiếu'])
      requesterSlug = 'u'
      await act(async () => {
        await client.invalidateQueries({ queryKey: importFormKeys.warehouse('wh-a') })
      })
      await settled()
      expect(menuLabels()).toEqual(['Huỷ phiếu', 'Xoá phiếu nháp'])
    })

    it('chỉ sửa + xoá của mình (không xác nhận) → nút đáy "Sửa phiếu", ⋯ chỉ có "Xoá phiếu nháp"', async () => {
      signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT', 'IMPORT_FORM_DELETE_DRAFT_OWN'])
      route('get', FORM_URL, () => ok(mockupForm()))
      await show()
      expect(screen.getByRole('button', { name: 'Sửa phiếu' })).toBeOnTheScreen()
      expect(menuLabels()).toEqual(['Xoá phiếu nháp'])
    })

    it.each(['CANCELLED', 'CONFIRMED'] as const)('%s → không có ⋯ dù đủ quyền', async (status) => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm({ status })))
      await show()
      expect(moreMenu()).toBeUndefined()
    })

    it('Android: ⋯ mở hộp chọn gốc với đúng các mục; chọn "Huỷ phiếu" → hỏi lại', async () => {
      jest.replaceProperty(Platform, 'OS', 'android')
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      jest.mocked(chooseAction).mockResolvedValueOnce(1)
      jest.mocked(confirmAction).mockResolvedValueOnce(false)
      await show()
      expect(mockHeader.options.unstable_headerRightItems).toBeUndefined()
      const Right = mockHeader.options.headerRight as () => ReactElement
      await render(<Right />)
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Tuỳ chọn' })))
      await settled()
      expect(chooseAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: [
            { label: 'Sửa phiếu' },
            { label: 'Huỷ phiếu', destructive: true },
            { label: 'Xoá phiếu nháp', destructive: true },
          ],
        }),
      )
      expect(confirmAction).toHaveBeenCalledWith(
        expect.objectContaining({ title: `Huỷ phiếu nhập ${CODE}?` }),
      )
    })
  })

  describe('Huỷ phiếu', () => {
    it('hỏi lại đúng chữ → POST /cancel {version} → ở lại, hiện Đã huỷ, hết mục Huỷ', async () => {
      signIn(ALL)
      let status: ImportForm['status'] = 'DRAFT'
      route('get', FORM_URL, () => ok(mockupForm({ status })))
      route('post', CANCEL_URL, (config) => {
        expect(JSON.parse(config.data as string)).toEqual({ version: 3 })
        status = 'CANCELLED'
        return ok(mockupForm({ status }))
      })
      jest.mocked(confirmAction).mockResolvedValueOnce(true)
      await show()
      await pressItem('Huỷ phiếu')
      await settled()
      expect(confirmAction).toHaveBeenCalledWith({
        title: `Huỷ phiếu nhập ${CODE}?`,
        message: 'Phiếu chuyển sang Đã huỷ, tồn kho không đổi (vẫn giữ lại để tra cứu).',
        confirmLabel: 'Huỷ phiếu',
        cancelLabel: 'Không huỷ',
        destructive: true,
      })
      expect(callsTo('post', CANCEL_URL)).toHaveLength(1)
      expect(screen.getByText('Đã huỷ')).toBeOnTheScreen()
      expect(moreMenu()).toBeUndefined()
      expect(mockDispatch).not.toHaveBeenCalled()
      expect(notice()).toBeNull()
    })

    it('không đồng ý → không gọi server; mở lại được', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      jest.mocked(confirmAction).mockResolvedValue(false)
      await show()
      await pressItem('Huỷ phiếu')
      await pressItem('Huỷ phiếu')
      expect(confirmAction).toHaveBeenCalledTimes(2)
      expect(calls.filter((c) => c.method === 'post')).toHaveLength(0)
      expect(moreMenu()!.disabled).toBeFalsy()
    })

    it('bấm đôi khi hộp hỏi đang mở → một hộp, đúng 1 POST; menu khoá trong lúc chạy', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      route('post', CANCEL_URL, () => ok(mockupForm({ status: 'CANCELLED' })))
      let answer!: (v: boolean) => void
      jest.mocked(confirmAction).mockReturnValueOnce(new Promise<boolean>((r) => (answer = r)))
      await show()
      const item = menuItem('Huỷ phiếu')
      await act(async () => {
        item.onPress()
        item.onPress()
      })
      expect(moreMenu()!.disabled).toBe(true)
      expect(menuItem('Huỷ phiếu').disabled).toBe(true)
      expect(menuItem('Xoá phiếu nháp').disabled).toBe(true)
      // "Sửa phiếu" ở đáy cũng khoá (giống màn xem phiếu xuất).
      expect(checkButton()).toBeDisabled()
      await act(async () => {
        answer(true)
        item.onPress()
      })
      await settled()
      expect(confirmAction).toHaveBeenCalledTimes(1)
      expect(callsTo('post', CANCEL_URL)).toHaveLength(1)
    })

    it('xong → bỏ bản nháp trên máy của phiếu', async () => {
      signIn(ALL)
      let status: ImportForm['status'] = 'DRAFT'
      route('get', FORM_URL, () => ok(mockupForm({ status })))
      route('post', CANCEL_URL, () => {
        status = 'CANCELLED'
        return ok(mockupForm({ status }))
      })
      await AsyncStorage.setItem(KEY, JSON.stringify(makeDraft([makeLine(1, { checked: true })])))
      jest.mocked(confirmAction).mockResolvedValueOnce(true)
      await show()
      await pressItem('Huỷ phiếu')
      await settled()
      expect(await AsyncStorage.getItem(KEY)).toBeNull()
    })

    it.each([
      [100800, 'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.'],
      [101314, 'Phiếu không còn ở trạng thái Nháp'],
    ])('lỗi %s → tải lại phiếu + thông báo; menu hết bận', async (code, message) => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      route('post', CANCEL_URL, () => failure(409, code))
      jest.mocked(confirmAction).mockResolvedValue(true)
      await show()
      expect(callsTo('get', FORM_URL)).toHaveLength(1)
      await pressItem('Huỷ phiếu')
      await settled()
      expect(callsTo('get', FORM_URL)).toHaveLength(2)
      expect(notice()).toHaveTextContent(message)
      expect(useFormNotice.getState().notice).toMatchObject({ kind: 'import', formSlug: 'pn-1' })
      expect(moreMenu()!.disabled).toBeFalsy()
      expect(menuItem('Huỷ phiếu').disabled).toBeFalsy()
      // Bấm lại được (khoá đã mở): thử lại → POST lần 2.
      await pressItem('Huỷ phiếu')
      await settled()
      expect(callsTo('post', CANCEL_URL)).toHaveLength(2)
    })

    it('403 trơn (guard) → câu lỗi quyền; đóng thông báo được', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      route('post', CANCEL_URL, () => ({
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
      await pressItem('Huỷ phiếu')
      await settled()
      expect(notice()).toHaveTextContent(/Bạn không có quyền thực hiện thao tác này/)
      expect(screen.getByTestId('import-detail-dock')).toBeOnTheScreen()
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' })))
      expect(notice()).toBeNull()
      expect(useFormNotice.getState().notice).toBeNull()
    })

    it('rời màn → bỏ thông báo của phiếu này', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      route('post', CANCEL_URL, () => failure(409, 100800))
      jest.mocked(confirmAction).mockResolvedValueOnce(true)
      const view = await show()
      await pressItem('Huỷ phiếu')
      await settled()
      expect(useFormNotice.getState().notice).toMatchObject({ formSlug: 'pn-1' })
      await view.unmount()
      expect(useFormNotice.getState().notice).toBeNull()
    })
  })

  describe('Xoá phiếu nháp', () => {
    it('hỏi lại đúng chữ → DELETE → về danh sách; KHÔNG có GET chi tiết sau đó; chỉ làm mới danh sách', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      route('delete', FORM_URL, () => ok('deleted'))
      jest.mocked(confirmAction).mockResolvedValueOnce(true)
      const view = await show()
      // Danh sách đã có trong cache (màn đáy Stack).
      client.setQueryData(LIST_KEY, { items: [] })
      expect(callsTo('get', FORM_URL)).toHaveLength(1)
      await pressItem('Xoá phiếu nháp')
      await settled()
      expect(confirmAction).toHaveBeenCalledWith({
        title: `Xoá phiếu nháp ${CODE}?`,
        message: `Phiếu bị xoá hẳn và mã ${CODE} không dùng lại được.`,
        confirmLabel: 'Xoá nháp',
        cancelLabel: 'Không xoá',
        destructive: true,
      })
      expect(callsTo('delete', FORM_URL)).toHaveLength(1)
      // Về danh sách: bỏ màn xem khỏi Stack của tab.
      expect(mockDispatch).toHaveBeenCalledTimes(1)
      expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'POP_TO_TOP' }))
      expect(client.getQueryState(LIST_KEY)?.isInvalidated).toBe(true)
      expect(client.getQueryState(importFormKeys.detail('wh-a', 'pn-1'))?.isInvalidated).toBe(false)
      expect(notice()).toBeNull()
      // Menu vẫn khoá tới khi màn đóng.
      expect(moreMenu()!.disabled).toBe(true)
      // Màn đóng (sau hiệu ứng pop): cache chi tiết của phiếu đã xoá bị bỏ, vẫn không GET.
      await view.unmount()
      await settled()
      expect(client.getQueryData(importFormKeys.detail('wh-a', 'pn-1'))).toBeUndefined()
      expect(callsTo('get', FORM_URL)).toHaveLength(1)
    })

    it('lần tải chi tiết đang bay lúc xoá xong → bị huỷ, không thành màn lỗi 404', async () => {
      signIn(ALL)
      let pending: ((r: ReturnType<typeof ok>) => void) | null = null
      route('get', FORM_URL, () =>
        callsTo('get', FORM_URL).length === 1
          ? ok(mockupForm())
          : new Promise((r) => (pending = r)),
      )
      route('delete', FORM_URL, () => ok('deleted'))
      jest.mocked(confirmAction).mockResolvedValueOnce(true)
      await show()
      // Kéo làm mới: GET đang bay.
      await act(async () => {
        void client.refetchQueries({ queryKey: importFormKeys.detail('wh-a', 'pn-1') })
      })
      expect(pending).not.toBeNull()
      await pressItem('Xoá phiếu nháp')
      await act(async () => pending!(failure(404, 101301)))
      await settled()
      expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'POP_TO_TOP' }))
      expect(screen.queryByText('Không tải được phiếu nhập')).toBeNull()
      expect(client.getQueryState(importFormKeys.detail('wh-a', 'pn-1'))?.status).toBe('success')
    })

    it('xong → bỏ bản lưu trên máy (store không giữ phiếu này)', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      route('delete', FORM_URL, () => ok('deleted'))
      await AsyncStorage.setItem(KEY, JSON.stringify(makeDraft([makeLine(1, { checked: true })])))
      jest.mocked(confirmAction).mockResolvedValueOnce(true)
      await show()
      await pressItem('Xoá phiếu nháp')
      await settled()
      expect(await AsyncStorage.getItem(KEY)).toBeNull()
    })

    it('404 (đã bị xoá ở nơi khác) → như xoá xong', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      route('delete', FORM_URL, () => failure(404, 101301))
      await AsyncStorage.setItem(KEY, JSON.stringify(makeDraft([makeLine(1)])))
      jest.mocked(confirmAction).mockResolvedValueOnce(true)
      await show()
      await pressItem('Xoá phiếu nháp')
      await settled()
      expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'POP_TO_TOP' }))
      expect(notice()).toBeNull()
      expect(callsTo('get', FORM_URL)).toHaveLength(1)
      expect(await AsyncStorage.getItem(KEY)).toBeNull()
    })

    it('không còn Nháp (101314) → tải lại + thông báo, ở lại, menu hết bận', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      route('delete', FORM_URL, () => failure(409, 101314))
      jest.mocked(confirmAction).mockResolvedValueOnce(true)
      await show()
      await pressItem('Xoá phiếu nháp')
      await settled()
      expect(mockDispatch).not.toHaveBeenCalled()
      expect(callsTo('get', FORM_URL)).toHaveLength(2)
      expect(notice()).toHaveTextContent('Phiếu không còn ở trạng thái Nháp')
      expect(moreMenu()!.disabled).toBeFalsy()
    })

    it('bấm đôi khi hộp hỏi đang mở → đúng 1 DELETE', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      route('delete', FORM_URL, () => ok('deleted'))
      let answer!: (v: boolean) => void
      jest.mocked(confirmAction).mockReturnValueOnce(new Promise<boolean>((r) => (answer = r)))
      await show()
      const item = menuItem('Xoá phiếu nháp')
      await act(async () => {
        item.onPress()
        item.onPress()
      })
      await act(async () => answer(true))
      await settled()
      expect(confirmAction).toHaveBeenCalledTimes(1)
      expect(callsTo('delete', FORM_URL)).toHaveLength(1)
      expect(mockDispatch).toHaveBeenCalledTimes(1)
    })
  })

  describe('câu nhắc bản nháp dở trên máy', () => {
    const NOTE = '\n\nThay đổi chưa lưu trên máy cũng bị bỏ.'

    it('có bản nháp trên máy → nội dung hộp hỏi Xoá / Huỷ có câu nhắc', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      await AsyncStorage.setItem(KEY, JSON.stringify(makeDraft([makeLine(1)])))
      jest.mocked(confirmAction).mockResolvedValue(false)
      await show()
      await pressItem('Xoá phiếu nháp')
      expect(confirmAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          message: `Phiếu bị xoá hẳn và mã ${CODE} không dùng lại được.${NOTE}`,
        }),
      )
      await pressItem('Huỷ phiếu')
      expect(confirmAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          message: `Phiếu chuyển sang Đã huỷ, tồn kho không đổi (vẫn giữ lại để tra cứu).${NOTE}`,
        }),
      )
    })

    const messageAfterDelete = async () => {
      jest.mocked(confirmAction).mockResolvedValue(false)
      await show()
      await pressItem('Xoá phiếu nháp')
      return jest.mocked(confirmAction).mock.lastCall![0].message
    }

    it('store giữ bản dựng sạch của đúng phiếu → không có câu nhắc', async () => {
      signIn(ALL)
      const form = mockupForm()
      route('get', FORM_URL, () => ok(form))
      useReceiveDraft.setState({
        ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' },
        draft: draftFromForm(form),
      })
      expect(await messageAfterDelete()).not.toContain('Thay đổi chưa lưu')
    })

    it('kv có bản nháp có dòng đã kiểm → có câu nhắc', async () => {
      signIn(ALL)
      const form = mockupForm()
      route('get', FORM_URL, () => ok(form))
      const d = draftFromForm(form)
      d.lines[0] = { ...d.lines[0], checked: true }
      await AsyncStorage.setItem(KEY, JSON.stringify(d))
      expect(await messageAfterDelete()).toContain(NOTE)
    })

    it('bản nháp sửa số lượng (không kiểm) → có câu nhắc', async () => {
      signIn(ALL)
      const form = mockupForm()
      route('get', FORM_URL, () => ok(form))
      const d = draftFromForm(form)
      d.lines[0] = { ...d.lines[0], quantity: 99 }
      await AsyncStorage.setItem(KEY, JSON.stringify(d))
      expect(await messageAfterDelete()).toContain(NOTE)
    })

    it('không có bản nháp (hoặc chỉ có của kho khác) → không có câu nhắc', async () => {
      signIn(ALL)
      route('get', FORM_URL, () => ok(mockupForm()))
      await AsyncStorage.setItem(
        draftStorageKey('u', 'wh-b', 'pn-1'),
        JSON.stringify(makeDraft([makeLine(1)])),
      )
      jest.mocked(confirmAction).mockResolvedValue(false)
      await show()
      await pressItem('Xoá phiếu nháp')
      expect(confirmAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: `Phiếu bị xoá hẳn và mã ${CODE} không dùng lại được.` }),
      )
    })
  })
})
