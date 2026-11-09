// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'
import { StyleSheet } from 'react-native'

import type { ExportForm } from '@/entities/export-form'
import { item as stockItem } from '@/entities/inventory/model/fixtures'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  exportDraftStorageKey,
  newExportDraft,
  stopExportDraftPersistence,
  useExportDraft,
  type ExportDraft,
} from '@/features/export-draft'
import { makeForm, makeItem, makeLine } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { SWIPE_DELETE_MS } from '@/shared/ui/compose'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { useLineFocus } from '@/shared/lib/line-focus'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { leaveCount, leaveSpies } from '@/shared/lib/testing/wizard-nav'
import { lightColors } from '@/shared/theme/tokens'
import { wizardMenuItem, wizardMenuLabels } from '@/shared/ui/testing/wizard-header'

import { ExportItemsStepScreen } from './ExportItemsStepScreen'
import { useExportScanNotice } from './scan-notice.store'

type MockRoute = { key: string; name: string; params?: { formSlug: string } }
const mockStack: { routes: MockRoute[] } = { routes: [] }
const mockState = () => ({ index: mockStack.routes.length - 1, routes: mockStack.routes })
const mockParams: { formSlug: string } = { formSlug: 'px-1' }
const mockNavigate = jest.fn()
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockBack = jest.fn()
const mockDispatch = jest.fn()
const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
/** Màn có đang được focus không (sheet đè lên → false) + các listener 'focus' của navigation. */
const mockNav = { focused: true, focusListeners: new Set<() => void>() }
jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: mockNavigate,
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useNavigation: () => ({
    isFocused: () => mockNav.focused,
    addListener: (event: string, fn: () => void) => {
      if (event !== 'focus') return () => {}
      mockNav.focusListeners.add(fn)
      return () => mockNav.focusListeners.delete(fn)
    },
    dispatch: mockDispatch,
    canGoBack: () => mockStack.routes.length > 1,
    getState: mockState,
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
jest.mock('expo-router/react-navigation', () =>
  jest.requireActual('@/shared/lib/testing/wizard-nav').reactNavigationWith(() => mockState()),
)
jest.mock('@/shared/lib/useWizardNav', () =>
  jest.requireActual('@/shared/lib/testing/wizard-nav').wizardNavWithLeaveSpies(),
)
jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const LIST_URL = '/warehouses/wh-a/export-forms'
const FORM_URL = `${LIST_URL}/px-1`
const STOCK_URL = '/warehouses/wh-a/materials'
const BATCH_URL = '/warehouses/wh-a/material-batches'
const NEW_KEY = exportDraftStorageKey('u', 'wh-a', 'new')
const YEAR = new Date().getFullYear()

/** Stack modal = [bước 2] (phiếu đã có: "Sửa phiếu" mở thẳng; phiếu mới: bước 2 ở đáy modal). */
function open(formSlug: string) {
  mockParams.formSlug = formSlug
  mockStack.routes = [{ key: 'me', name: '[formSlug]/edit', params: { formSlug } }]
}

/** Dòng 1 tự động 10 hộp × 1.000 đ; dòng 2 chọn lô b-2 (HSD 12/03/2027) 10 hộp × 1.000 đ. */
const form2 = (over: Partial<ExportForm> = {}) =>
  makeForm([makeItem(1), makeItem(2, { batchSlug: 'b-2', batchExpiryDate: '2027-03-12' })], {
    warehouseSlug: 'wh-a',
    ...over,
  })

const page = (items: unknown[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })

/** Tồn: m-1 còn 90, m-2 còn 100; lô b-2 còn 8 (nhập 05/10 năm nay). */
function stock() {
  route('get', STOCK_URL, () =>
    page([
      stockItem({ materialSlug: 'm-1', availableQuantity: 90 }),
      stockItem({ materialSlug: 'm-2', availableQuantity: 100 }),
    ]),
  )
  route('get', BATCH_URL, () =>
    page([
      {
        slug: 'b-2',
        materialSlug: 'm-2',
        entryDate: `${YEAR}-10-05`,
        expiryDate: '2027-03-12',
        availableQuantity: 8,
      },
    ]),
  )
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
      <ExportItemsStepScreen />
    </QueryClientProvider>,
  )
  await settled()
  return view
}
const wait = (ms = 0) => act(async () => new Promise((r) => setTimeout(r, ms)))

const ALL = [
  'EXPORT_FORM_READ',
  'EXPORT_FORM_CREATE',
  'EXPORT_FORM_UPDATE_DRAFT',
  'EXPORT_FORM_DELETE_DRAFT',
]
function signIn(scope: string[] = ALL) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH] } as never,
  })
}

const store = () => useExportDraft.getState()
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never)
const rightItems = (): NativeStackHeaderItem[] =>
  mockHeader.options.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: true }) ?? []
type ButtonItem = { label: string; disabled?: boolean; onPress: () => void }
const headerItem = (label: string) =>
  rightItems().find((i) => (i as { label?: string }).label === label) as ButtonItem | undefined
const headerLabels = () => rightItems().map((i) => (i as { label?: string }).label)
const leftItems = (): NativeStackHeaderItem[] =>
  mockHeader.options.unstable_headerLeftItems?.({ tintColor: undefined, canGoBack: true }) ?? []
const leftLabels = () => leftItems().map((i) => (i as { label?: string }).label)
/** Mục `label` / nhãn các mục của menu `⋯` (menu gốc iOS). */
const menuItem = (label: string) => wizardMenuItem(mockHeader.options, label)
const menuLabels = () => wizardMenuLabels(mockHeader.options)
/** Dòng vật tư chỉ đọc (MỘT phần tử a11y `button`) của khoá `key`. */
const row = (key: string) => screen.getByTestId(`export-line-${key}`)
const nextButton = () => screen.getByRole('button', { name: 'Tiếp tục' })
const summary = () => screen.getByTestId('export-items-summary')
/** "Tiếp tục" TRÔNG như khoá (nền `fill`) khi chưa vào được bước 3 — nhưng vẫn bấm được. */
const expectNextLocked = (hint: string) => {
  expect(nextButton()).toHaveStyle({ backgroundColor: lightColors.fill })
  expect(nextButton()).toBeEnabled()
  expect(nextButton().props.accessibilityHint).toBe(hint)
}
const errorHaptic = () =>
  jest
    .mocked(jest.requireMock('expo-haptics').notificationAsync as jest.Mock)
    .mock.calls.filter(([type]) => type === 'error').length
/** Thao tác a11y "Xoá" của dòng (thay cho vuốt — trình đọc màn hình). */
/** Thao tác a11y "Xoá" rồi chờ hết hiệu ứng xoá (thẻ trượt ra + co lại) — màn gỡ dòng sau đó. */
const swipeDelete = async (key: string) => {
  await fireEvent(row(key), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } })
  await wait(SWIPE_DELETE_MS + 20)
}
/** Route sheet sửa dòng `key` (dòng vừa thêm / vừa quét: ô số tự focus). */
const sheetOf = (key: string, justAdded = false) => ({
  pathname: '/export-line',
  params: justAdded ? { key, focus: 'quantity' } : { key },
})
const sheetOpens = () =>
  mockNavigate.mock.calls.filter(
    ([href]) => (href as { pathname?: string }).pathname === '/export-line',
  ).length
/** Màn được focus lại (sheet phía trên vừa đóng / quay về từ bước 3). */
async function refocus() {
  mockNav.focused = true
  await act(async () => mockNav.focusListeners.forEach((fn) => fn()))
  await wait(50)
}

/** Bản nháp phiếu mới đã lưu trên máy (mở `/export-form/new/edit` → nạp nó). */
async function storedNew(d: ExportDraft) {
  await AsyncStorage.setItem(NEW_KEY, JSON.stringify(d))
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
  notifyManager.setScheduler((callback) => callback())
})

afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)))

beforeEach(async () => {
  jest.clearAllMocks()
  mockNavigate.mockReset()
  resetFakeApi()
  await AsyncStorage.clear()
  store().reset()
  useFormNotice.getState().reset()
  open('px-1')
  mockHeader.options = {}
  mockNav.focused = true
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  signIn()
  jest.mocked(confirmAction).mockResolvedValue(true)
  jest.mocked(chooseAction).mockResolvedValue(null)
  stock()
})

afterEach(() => {
  stopExportDraftPersistence()
  store().reset()
  client.clear()
})

describe('ExportItemsStepScreen — phiếu đã có', () => {
  beforeEach(() => route('get', FORM_URL, () => ok(form2())))

  it('tiêu đề "Sửa phiếu", bước 2 hiện tại; khối "Vật tư · 2"; tóm tắt "2 vật tư" + tổng', async () => {
    await show()
    expect(mockHeader.options.title).toBe('Sửa phiếu')
    expect(screen.getByLabelText('Bước 2 trên 3, Vật tư, đang ở đây')).toBeSelected()
    expect(screen.getByRole('header', { name: 'Vật tư · 2' })).toBeOnTheScreen()
    expect(within(summary()).getByText('2 vật tư')).toBeOnTheScreen()
    expect(screen.getByTestId('export-items-total')).toHaveTextContent(/^20\.000\s?đ$/)
    // Sửa trên máy (sheet) → tổng + dòng cập nhật ngay.
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 5 }))
    expect(screen.getByTestId('export-items-total')).toHaveTextContent(/^15\.000\s?đ$/)
    expect(row('m-1|u-1|')).toHaveTextContent(/5 hộp × 1\.000\s?đ/)
    expect(nextButton()).toBeEnabled()
  })

  it('dòng: tên + thành tiền (không ›), "10 hộp × 1.000 đ", "mã · còn n · Lô tự động | nhãn lô"; vượt tồn → cam', async () => {
    await show()
    const auto = within(row('m-1|u-1|'))
    expect(auto.getByText('Vật tư 1')).toBeOnTheScreen()
    expect(auto.getByText(/^10\.000\s?đ$/)).toBeOnTheScreen()
    expect(auto.queryByText('›')).toBeNull()
    expect(auto.getByText(/^10 hộp × 1\.000\s?đ$/)).toBeOnTheScreen()
    expect(auto.getByText('VT1 · còn 90 hộp · Lô tự động')).toBeOnTheScreen()

    const lot = within(row('m-2|u-2|b-2'))
    expect(lot.getByText('VT2 · còn 8 hộp · HSD 12/03/2027 · nhập 05/10')).toBeOnTheScreen()
    // Lô đã chọn: khả dụng của lô (8) — vượt số trên dòng → chữ cảnh báo.
    expect(flat(lot.getByText('còn 8 hộp')).color).toBe(lightColors.warningText)
    expect(flat(auto.getByText('còn 90 hộp')).color).toBe(lightColors.mutedForeground)
    // Nhãn a11y: tên + số × giá + thành tiền + dòng 3.
    expect(row('m-1|u-1|').props.accessibilityLabel).toMatch(
      /^Vật tư 1, 10 hộp × 1\.000\s?đ, 10\.000\s?đ, VT1, còn 90 hộp, Lô tự động$/,
    )
  })

  it('rows are read-only; tapping a row opens the line sheet', async () => {
    await show()
    // Không còn ô nhập nào trên bước 2 (số / giá / đơn vị sửa ở sheet).
    expect(screen.queryByLabelText(/^Số lượng/)).toBeNull()
    expect(screen.queryByLabelText(/^Đơn giá/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Đơn vị/ })).toBeNull()
    expect(row('m-1|u-1|').props.accessibilityRole).toBe('button')
    await fireEvent.press(row('m-2|u-2|b-2'))
    // Chạm dòng có sẵn: KHÔNG tự focus ô số.
    expect(mockNavigate).toHaveBeenLastCalledWith(sheetOf('m-2|u-2|b-2'))
  })

  it('mỗi vật tư một thẻ bo đủ góc; "⊕ Thêm vật tư" → /export-add-line; "Quét mã" trên header → /scan-export-line', async () => {
    await show()
    const add = screen.getByTestId('export-items-add')
    expect(add).toHaveAccessibleName('Thêm vật tư')
    // Dòng cuối của khối có dòng "Thêm" bên dưới → không bo dưới; "Thêm" bo dưới.
    expect(flat(row('m-2|u-2|b-2')).borderTopLeftRadius).toBeGreaterThan(0)
    expect(flat(row('m-2|u-2|b-2')).borderBottomLeftRadius).toBeGreaterThan(0)
    await fireEvent.press(add)
    expect(mockNavigate).toHaveBeenCalledWith('/export-add-line')
    expect(screen.queryByRole('button', { name: 'Quét mã' })).toBeNull()
    await act(async () => headerItem('Quét mã')!.onPress())
    expect(mockNavigate).toHaveBeenCalledWith('/scan-export-line')
  })

  it('header: [Quét mã, ⋯]; ⋯ có "Lưu nháp" (khoá khi chưa đổi gì) — no Save draft text button in header', async () => {
    await show()
    expect(headerLabels()).toEqual(['Quét mã', 'Tuỳ chọn'])
    expect(rightItems().map((i) => i.type)).toEqual(['button', 'menu'])
    expect(menuLabels()).toEqual(['Lưu nháp', 'Xoá nháp'])
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: true })
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 5 }))
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: false })
  })

  it('đang Lưu nháp (request chưa về) → ⋯ chỉ còn Lưu nháp khoá, Thêm / Quét / dòng khoá, không vuốt xoá được; xong → về màn xem', async () => {
    let reply: (r: ReturnType<typeof ok>) => void = () => {}
    let sent: { items: { quantity: number }[] } | undefined
    route('patch', FORM_URL, (config) => {
      sent = JSON.parse(String(config.data))
      return new Promise((resolve) => (reply = resolve))
    })
    await show()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 5 }))
    await act(async () => menuItem('Lưu nháp')!.onPress())
    await settled()
    expect(sent!.items[0]!.quantity).toBe(5)
    expect(store().saving).toBe(true)
    expect(menuLabels()).toEqual(['Lưu nháp'])
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: true })
    expect(headerItem('Quét mã')).toMatchObject({ disabled: true })
    expect(screen.getByTestId('export-items-add')).toBeDisabled()
    expect(row('m-1|u-1|')).toBeDisabled()
    expect(row('m-1|u-1|').props.accessibilityActions ?? []).toEqual([])
    await fireEvent.press(row('m-1|u-1|'))
    expect(sheetOpens()).toBe(0)
    // Thanh bước khoá + tắt vuốt cạnh: rời bước giữa lúc ghi sẽ làm mất điều hướng / thông báo sau ghi.
    const step1 = screen.getByLabelText(/^Bước 1 trên 3, Thông tin/)
    expect(step1).toBeDisabled()
    await fireEvent.press(step1)
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockHeader.options.gestureEnabled).toBe(false)
    await act(async () =>
      reply(
        ok(
          form2({
            version: 4,
            items: [
              makeItem(1, { quantity: 5 }),
              makeItem(2, { batchSlug: 'b-2', batchExpiryDate: '2027-03-12' }),
            ],
          }),
        ),
      ),
    )
    await settled()
    // Về màn xem (`nav.finish`: đóng modal — một lần).
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finish).toHaveBeenCalledWith('px-1')
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('progress is inside the scroll content', async () => {
    await show()
    const list = screen.getByTestId('export-items-list')
    expect(within(list).getByTestId('export-wizard-steps-2')).toBeOnTheScreen()
    expect(within(list).getByLabelText('Bước 2 trên 3, Vật tư, đang ở đây')).toBeSelected()
    // Thanh đáy (có nền) nằm ngoài danh sách.
    expect(within(list).queryByTestId('export-items-dock')).toBeNull()
  })

  it('không ghi gì → thanh bước chạm được, vuốt cạnh bật', async () => {
    await show()
    expect(screen.getByLabelText(/^Bước 1 trên 3, Thông tin/)).toBeEnabled()
    expect(mockHeader.options.gestureEnabled).toBe(true)
  })

  it('⋯ (menu gốc): Lưu nháp, Bỏ thay đổi (khi có thay đổi), Xoá nháp (có quyền xoá) — mục đỏ', async () => {
    await show()
    expect(menuLabels()).toEqual(['Lưu nháp', 'Xoá nháp'])
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 5 }))
    expect(menuLabels()).toEqual(['Lưu nháp', 'Bỏ thay đổi trên máy', 'Xoá nháp'])
    expect(menuItem('Bỏ thay đổi trên máy')).toMatchObject({ destructive: true })
    expect(menuItem('Xoá nháp')).toMatchObject({ destructive: true })
    expect(menuItem('Lưu nháp')!.destructive).toBeFalsy()
  })

  it('không có quyền xoá: chưa đổi gì → ⋯ chỉ có Lưu nháp; có thay đổi → thêm Bỏ thay đổi', async () => {
    signIn(ALL.filter((c) => c !== 'EXPORT_FORM_DELETE_DRAFT'))
    await show()
    expect(menuLabels()).toEqual(['Lưu nháp'])
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 5 }))
    expect(menuLabels()).toEqual(['Lưu nháp', 'Bỏ thay đổi trên máy'])
  })

  it('Bỏ thay đổi trên máy → hỏi lại → bản nháp (và dòng) về bản trên máy chủ', async () => {
    await show()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 5 }))
    await act(async () => menuItem('Bỏ thay đổi trên máy')!.onPress())
    await settled()
    expect(jest.mocked(confirmAction).mock.calls.at(-1)![0].title).toBe('Bỏ thay đổi trên máy')
    expect(store().draft!.lines[0]!.quantity).toBe(10)
    expect(row('m-1|u-1|')).toHaveTextContent(/10 hộp × 1\.000\s?đ/)
  })

  it('quét mã không khớp (sheet ghi mã) → thông báo mức phiếu; chỉ của phiếu này; đóng thì mất; rời màn thì xoá', async () => {
    const view = await show()
    await act(async () => useExportScanNotice.getState().show('px-khac', '111'))
    expect(screen.queryByText(/Không tìm thấy vật tư/)).toBeNull()
    await act(async () => useExportScanNotice.getState().show('px-1', '8934563'))
    expect(
      within(screen.getByTestId('export-screen-notice')).getByText(
        'Không tìm thấy vật tư có mã “8934563” trong kho',
      ),
    ).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' }))
    expect(screen.queryByText(/Không tìm thấy vật tư/)).toBeNull()
    expect(useExportScanNotice.getState().notice).toBeNull()
    await act(async () => useExportScanNotice.getState().show('px-1', '42'))
    await view.unmount()
    expect(useExportScanNotice.getState().notice).toBeNull()
  })

  it('quét mã: phiếu đủ 200 dòng / vật tư chưa có đơn vị → câu báo riêng', async () => {
    await show()
    await act(async () => useExportScanNotice.getState().show('px-1', 'SN1', 'full'))
    expect(
      screen.getByText('Phiếu đã đủ 200 dòng — không thêm được vật tư mã “SN1”'),
    ).toBeOnTheScreen()
    await act(async () => useExportScanNotice.getState().show('px-1', 'KEO', 'noUnit'))
    expect(
      screen.getByText('Vật tư mã “KEO” chưa có đơn vị — không thêm được vào phiếu'),
    ).toBeOnTheScreen()
  })

  it('thông báo mức phiếu (store) và thông báo của màn xếp chồng, testID riêng, store TRƯỚC', async () => {
    await show()
    await act(async () =>
      useFormNotice.getState().show({ kind: 'export', formSlug: 'px-1', message: 'Đã gộp' }),
    )
    await act(async () => useExportScanNotice.getState().show('px-1', '42'))
    const dock = screen.getByTestId('export-items-dock-content')
    const ids = within(dock)
      .getAllByTestId(/^export-(form|screen)-notice$/)
      .map((n) => n.props.testID)
    expect(ids).toEqual(['export-form-notice', 'export-screen-notice'])
    await fireEvent.press(screen.getAllByRole('button', { name: 'Đóng thông báo' })[0]!)
    expect(useFormNotice.getState().notice).toBeNull()
    expect(useExportScanNotice.getState().notice).toBeNull()
  })

  it('after adding 3 materials the first line sheet opens once (chờ màn được focus lại, ô số tự focus)', async () => {
    await show()
    // Bộ chọn đang đè lên: thêm 3 dòng rồi yêu cầu mở dòng ĐẦU (như `addMaterialLines`).
    mockNav.focused = false
    await act(async () => {
      for (const n of [3, 4, 5]) store().addLine(makeLine(n, { base: null, quantity: 0 }))
      useLineFocus.getState().ask('export', 'px-1', 'm-3|u-3|')
    })
    await wait(100)
    expect(sheetOpens()).toBe(0)
    await refocus()
    expect(mockNavigate).toHaveBeenCalledWith(sheetOf('m-3|u-3|', true))
    expect(sheetOpens()).toBe(1)
    expect(useLineFocus.getState().request).toBeNull()
  })

  it('returning from review does not reopen the sheet', async () => {
    await show()
    mockNav.focused = false
    await act(async () => useLineFocus.getState().ask('export', 'px-1', 'm-1|u-1|'))
    await refocus()
    expect(sheetOpens()).toBe(1)
    // Sang bước 3 rồi quay lại: màn bước 2 được focus lại — không mở sheet lần nữa.
    mockNav.focused = false
    await refocus()
    await refocus()
    expect(sheetOpens()).toBe(1)
  })

  it('scan of an existing line opens its sheet', async () => {
    await show()
    // Sheet quét đóng → yêu cầu của đúng phiếu này; màn đang focus sẵn → mở ngay.
    await act(async () => useLineFocus.getState().ask('export', 'px-1', 'm-2|u-2|b-2'))
    await wait(50)
    expect(mockNavigate).toHaveBeenLastCalledWith(sheetOf('m-2|u-2|b-2', true))
    // Yêu cầu của phiếu nhập cùng slug không đụng màn này.
    mockNavigate.mockClear()
    await act(async () => useLineFocus.getState().ask('import', 'px-1', 'm-1|u-1|'))
    await wait(50)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('tapping the orange summary opens the first missing line sheet', async () => {
    await show()
    await act(async () => {
      store().updateLine('m-2|u-2|b-2', { unitPrice: null })
      store().addLine(makeLine(3, { base: null, quantity: 0 }))
    })
    // Mỗi dòng còn thiếu tính MỘT lần ("chưa đủ"), phần cam là nút ≥ 44pt.
    const gap = within(summary()).getByRole('button', { name: '2 chưa đủ' })
    expect(within(summary()).getByText(' · 2 chưa đủ')).toBeOnTheScreen()
    expect(flat(within(summary()).getByText(' · 2 chưa đủ')).color).toBe(lightColors.warningText)
    expect(flat(gap).minHeight).toBeGreaterThanOrEqual(44)
    expect(gap.props.accessibilityHint).toBe('Mở dòng còn thiếu')
    // Dòng thiếu: chữ cam ở dòng 2, "—" cam ở thành tiền.
    const missing = within(row('m-2|u-2|b-2'))
    expect(flat(missing.getByText('10 hộp · Chưa nhập đơn giá')).color).toBe(
      lightColors.warningText,
    )
    expect(flat(missing.getByText('—')).color).toBe(lightColors.warningText)
    // Chạm → sheet của dòng thiếu ĐẦU TIÊN theo thứ tự danh sách (lần nào cũng vậy).
    await fireEvent.press(gap)
    await fireEvent.press(gap)
    expect(mockNavigate.mock.calls).toEqual([[sheetOf('m-2|u-2|b-2')], [sheetOf('m-2|u-2|b-2')]])
  })

  it('Tiếp tục khi dòng còn thiếu: không sang bước 3, rung lỗi + mở sheet dòng thiếu đầu tiên', async () => {
    await show()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 0 }))
    expect(within(row('m-1|u-1|')).getByText('Chưa nhập số lượng')).toBeOnTheScreen()
    expect(within(summary()).getByText(' · 1 chưa đủ')).toBeOnTheScreen()
    // Trông như khoá, vẫn bấm được; trình đọc màn hình nghe còn thiếu gì.
    expectNextLocked('Còn thiếu: 1 chưa đủ')
    await fireEvent.press(nextButton())
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(errorHaptic()).toBe(1)
    expect(mockNavigate).toHaveBeenLastCalledWith(sheetOf('m-1|u-1|'))
  })

  it('Tiếp tục when complete pushes /export-form/<slug>/review', async () => {
    await show()
    await fireEvent.press(nextButton())
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/export-form/[formSlug]/review',
      params: { formSlug: 'px-1' },
    })
  })

  it('swipe delete kept: a server line asks; a new line is removed at once', async () => {
    await show()
    await act(async () => store().addLine(makeLine(3, { base: null, quantity: 1, unitPrice: 5 })))
    // Dòng có sẵn trên server → hỏi lại; không đồng ý → giữ.
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    expect(row('m-1|u-1|').props.accessibilityActions).toEqual([{ name: 'delete', label: 'Xoá' }])
    await swipeDelete('m-1|u-1|')
    await act(async () => {})
    expect(jest.mocked(confirmAction).mock.calls.at(-1)![0]).toMatchObject({
      title: 'Xoá Vật tư 1 khỏi phiếu?',
      destructive: true,
    })
    expect(store().draft!.lines).toHaveLength(3)
    await swipeDelete('m-1|u-1|')
    await act(async () => {})
    expect(store().draft!.lines.map((l) => l.key)).toEqual(['m-2|u-2|b-2', 'm-3|u-3|'])
    // Dòng mới thêm trên máy → xoá ngay, không hỏi.
    jest.mocked(confirmAction).mockClear()
    await swipeDelete('m-3|u-3|')
    await act(async () => {})
    expect(confirmAction).not.toHaveBeenCalled()
    expect(store().draft!.lines.map((l) => l.key)).toEqual(['m-2|u-2|b-2'])
  })

  it('shortage keys from useFormNotice highlight the row (line 3 red, replaces "còn n")', async () => {
    await show()
    await act(async () =>
      useFormNotice.getState().show({
        kind: 'export',
        formSlug: 'px-1',
        message: 'Không đủ hàng cho 1 dòng — giảm số lượng hoặc đổi lô rồi gửi lại.',
        shortageKeys: ['m-2|u-2|b-2'],
      }),
    )
    const short = within(row('m-2|u-2|b-2')).getByText('Không đủ hàng')
    expect(flat(short).color).toBe(lightColors.destructiveText)
    expect(within(row('m-2|u-2|b-2')).queryByText('còn 8 hộp')).toBeNull()
    expect(within(row('m-1|u-1|')).queryByText('Không đủ hàng')).toBeNull()
    expect(within(row('m-1|u-1|')).getByText('còn 90 hộp')).toBeOnTheScreen()
    expect(
      within(screen.getByTestId('export-form-notice')).getByText(
        'Không đủ hàng cho 1 dòng — giảm số lượng hoặc đổi lô rồi gửi lại.',
      ),
    ).toBeOnTheScreen()
    // Đóng thông báo → bỏ tô.
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' }))
    expect(screen.queryByText('Không đủ hàng')).toBeNull()
  })

  it('shortage detail (useFormNotice detail) → "Thiếu n <đv>" đỏ ở dòng 3', async () => {
    await show()
    const at = store().draft!.lines[0]!
    await act(async () =>
      useFormNotice.getState().show({
        kind: 'export',
        formSlug: 'px-1',
        message: 'Không đủ hàng cho 1 dòng',
        shortageKeys: ['m-1|u-1|'],
        detail: new Map([['m-1|u-1|', { shortage: { kind: 'stock', missing: 4 }, at }]]),
      }),
    )
    expect(flat(within(row('m-1|u-1|')).getByText('Thiếu 4 hộp')).color).toBe(
      lightColors.destructiveText,
    )
  })

  it('đã đổi ở nơi khác → "Đã đổi ở nơi khác — xem lại" cam ở dòng 3', async () => {
    await show()
    await act(async () =>
      useExportDraft.setState((s) => ({
        draft: {
          ...s.draft!,
          lines: s.draft!.lines.map((l, i) => (i === 0 ? { ...l, changedOnServer: true } : l)),
        },
      })),
    )
    expect(flat(within(row('m-1|u-1|')).getByText('Đã đổi ở nơi khác — xem lại')).color).toBe(
      lightColors.warningText,
    )
  })

  it('bước 1 chạm được (phiếu đã có) → bước 1 thay vào đáy modal', async () => {
    await show()
    await fireEvent.press(screen.getByLabelText('Bước 1 trên 3, Thông tin, đã xong'))
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/export-form/[formSlug]/info',
      params: { formSlug: 'px-1' },
    })
  })

  it('mở thẳng bước 2 (màn đầu modal) → ✕ trái, không back gốc; ✕ → đóng modal, bản nháp trên máy còn', async () => {
    await show()
    expect(mockHeader.options.headerBackVisible).toBe(false)
    expect(leftLabels()).toEqual(['Đóng'])
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 5 }))
    const close = leftItems().find((i) => (i as { label?: string }).label === 'Đóng')
    await act(async () => (close as ButtonItem).onPress())
    expect(leaveSpies.exit).toHaveBeenCalledTimes(1)
    expect(leaveCount()).toBe(1)
    expect(confirmAction).not.toHaveBeenCalled()
    expect(store().draft?.lines[0]?.quantity).toBe(5)
  })

  it('bước 2 đẩy lên trên bước 1 trong modal → back gốc (‹), không ✕', async () => {
    mockStack.routes = [
      { key: 'info', name: '[formSlug]/info', params: { formSlug: 'px-1' } },
      ...mockStack.routes,
    ]
    await show()
    expect(mockHeader.options.headerBackVisible).toBeUndefined()
    expect(leftLabels()).toEqual([])
  })
})

describe('ExportItemsStepScreen — phiếu mới (formSlug "new")', () => {
  beforeEach(() => open('new'))

  it('empty form: khối chỉ có "⊕ Thêm vật tư" (bo cả trên) + câu xám; "Chưa có vật tư" và "Tiếp tục" mở bộ chọn', async () => {
    await storedNew(newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9', receiver: 'A' }))
    await show()
    expect(mockHeader.options.title).toBe('Phiếu xuất mới')
    expect(screen.getByRole('header', { name: 'Vật tư · 0' })).toBeOnTheScreen()
    expect(screen.queryByTestId('export-items-add-hairline')).toBeNull()
    expect(
      within(screen.getByTestId('export-items-empty')).getByText(
        'Chưa có vật tư — thêm hoặc quét mã',
      ),
    ).toBeOnTheScreen()
    expect(within(summary()).getByText('0 vật tư')).toBeOnTheScreen()
    expectNextLocked('Còn thiếu: Chưa có vật tư')
    // Phần thiếu "Chưa có vật tư" → mở bộ chọn vật tư (kèm gợi ý a11y).
    const gap = screen.getByRole('button', { name: 'Chưa có vật tư' })
    // Gợi ý nói đúng việc chạm làm: mở bộ chọn (không phải "Mở dòng còn thiếu" — chưa có dòng nào).
    expect(gap.props.accessibilityHint).toBe('Mở danh sách chọn vật tư')
    await fireEvent.press(gap)
    expect(mockNavigate).toHaveBeenCalledWith('/export-add-line')
    // "Tiếp tục" lúc chưa có dòng cũng mở bộ chọn, không sang bước 3.
    mockNavigate.mockClear()
    await fireEvent.press(nextButton())
    expect(mockNavigate).toHaveBeenCalledWith('/export-add-line')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('dòng thiếu giá: "5 hộp · Chưa nhập đơn giá" cam; tóm tắt "1 chưa đủ" → sheet dòng đó; "Tiếp tục" → cùng sheet + rung lỗi', async () => {
    const d = newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9', receiver: 'Tổ hàn A' })
    d.lines = [makeLine(1, { base: null, quantity: 5, unitPrice: null })]
    await storedNew(d)
    await show()
    expectNextLocked('Còn thiếu: 1 chưa đủ')
    expect(flat(within(row('m-1|u-1|')).getByText('5 hộp · Chưa nhập đơn giá')).color).toBe(
      lightColors.warningText,
    )
    await fireEvent.press(screen.getByRole('button', { name: '1 chưa đủ' }))
    expect(mockNavigate).toHaveBeenLastCalledWith(sheetOf('m-1|u-1|'))
    mockNavigate.mockClear()
    await fireEvent.press(nextButton())
    expect(mockNavigate).toHaveBeenLastCalledWith(sheetOf('m-1|u-1|'))
    expect(errorHaptic()).toBe(1)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('dòng thiếu ngoài vùng đã vẽ (150 dòng) → chạm tóm tắt vẫn mở đúng sheet', async () => {
    const d = newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9', receiver: 'Tổ hàn A' })
    d.lines = Array.from({ length: 150 }, (_, i) =>
      makeLine(i + 1, { base: null, unitPrice: i === 140 ? null : 1000 }),
    )
    await storedNew(d)
    await show()
    expect(screen.queryByTestId('export-line-m-141|u-141|')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: '1 chưa đủ' }))
    expect(mockNavigate).toHaveBeenLastCalledWith(sheetOf('m-141|u-141|'))
  })

  it('bước 2 đủ mà bước 1 còn thiếu → gợi ý "Thông tin phiếu còn thiếu" (chạm → bước 1); Tiếp tục trông khoá, bấm → bước 1 + rung lỗi', async () => {
    const d = newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9' })
    d.lines = [makeLine(1, { base: null })]
    await storedNew(d)
    await show()
    expectNextLocked('Thông tin phiếu còn thiếu')
    const hint = screen.getByRole('button', { name: 'Thông tin phiếu còn thiếu' })
    expect(flat(hint).minHeight).toBeGreaterThanOrEqual(44)
    await fireEvent.press(hint)
    // [bước 2] ở đáy modal → bước 1 thay vào đáy.
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/export-form/[formSlug]/info',
      params: { formSlug: 'new' },
    })
    mockReplace.mockClear()
    await fireEvent.press(nextButton())
    expect(errorHaptic()).toBe(1)
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/export-form/[formSlug]/info',
      params: { formSlug: 'new' },
    })
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/export-form/[formSlug]/review' }),
    )
  })

  it('Lưu nháp: khoá khi bước 1 còn thiếu; đủ → bật', async () => {
    const d = newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9' })
    d.lines = [makeLine(1, { base: null })]
    await storedNew(d)
    await show()
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: true })
    await act(async () => store().setHeader({ receiver: 'Tổ hàn A' }))
    expect(menuItem('Lưu nháp')).toMatchObject({ disabled: false })
    expect(nextButton()).toBeEnabled()
    expect(nextButton()).not.toHaveStyle({ backgroundColor: lightColors.fill })
    expect(nextButton().props.accessibilityHint).toBeUndefined()
  })

  it('⋯ offers Bỏ phiếu mới for a new form', async () => {
    const d = newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9', receiver: 'Tổ hàn A' })
    d.lines = [makeLine(1, { base: null })]
    await storedNew(d)
    await show()
    expect(menuLabels()).toEqual(['Lưu nháp', 'Bỏ phiếu mới'])
    await act(async () => menuItem('Bỏ phiếu mới')!.onPress())
    await settled()
    expect(jest.mocked(confirmAction).mock.calls.at(-1)![0].title).toBe('Bỏ phiếu mới')
    expect(store().draft).toBeNull()
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull()
    // Đóng modal, Stack tab về danh sách.
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finishToList).toHaveBeenCalledTimes(1)
  })

  it('Lưu nháp phiếu mới trùng mã (101404) → về bước 1 (lỗi dưới ô Mã phiếu ở đó), không báo ở bước 2', async () => {
    const d = newExportDraft({ code: 'PX-TRUNG', purchaseOrder: 'PO-9', receiver: 'Tổ hàn A' })
    d.lines = [makeLine(1, { base: null })]
    await storedNew(d)
    route('post', LIST_URL, () => failure(409, 101404))
    route('get', LIST_URL, () => page([]))
    await show()
    await act(async () => menuItem('Lưu nháp')!.onPress())
    await settled()
    expect(callsTo('post', LIST_URL)).toHaveLength(1)
    // [bước 2] → bước 1 thay bước 2 ở đáy modal (không còn gì dưới để giữ).
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/export-form/[formSlug]/info',
      params: { formSlug: 'new' },
    })
    expect(screen.queryByText('Mã phiếu đã tồn tại.')).toBeNull()
    expect(screen.queryByTestId('export-screen-notice')).toBeNull()
    expect(useFormNotice.getState().notice).toBeNull()
  })
})
