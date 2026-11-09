// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'
import { StackActions } from 'expo-router/react-navigation'
import { StyleSheet } from 'react-native'

import type { ImportForm } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  draftStorageKey,
  newDraft,
  stopDraftPersistence,
  useReceiveDraft,
  type ReceiveDraft,
} from '@/features/receive-checklist'
import {
  makeDraft,
  makeForm,
  makeItem,
  makeLine,
} from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { SWIPE_DELETE_MS } from '@/shared/ui/compose'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { useLineFocus } from '@/shared/lib/line-focus'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { leaveCount, leaveSpies } from '@/shared/lib/testing/wizard-nav'
import { wizardMenuItem, wizardMenuLabels } from '@/shared/ui/testing/wizard-header'
import { lightColors } from '@/shared/theme/tokens'

import { ImportItemsStepScreen } from './ImportItemsStepScreen'
import { useScanNotice } from './scan-notice.store'

type MockRoute = { key: string; name: string; params?: { formSlug: string } }
const mockStack: { routes: MockRoute[] } = { routes: [] }
const mockState = () => ({ index: mockStack.routes.length - 1, routes: mockStack.routes })
const mockParams: { formSlug: string } = { formSlug: 'pn-1' }
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
const LIST_URL = '/warehouses/wh-a/import-forms'
const FORM_URL = `${LIST_URL}/pn-1`
const NEW_KEY = draftStorageKey('u', 'wh-a', 'new')
const FORM_KEY = draftStorageKey('u', 'wh-a', 'pn-1')

/** Stack modal: phiếu đã có = [bước 2] ("Sửa phiếu" mở thẳng); phiếu mới = [bước 1, bước 2]. */
function open(formSlug: string) {
  mockParams.formSlug = formSlug
  mockStack.routes = [
    ...(formSlug === 'new' ? [{ key: 'info', name: '[formSlug]/info', params: { formSlug } }] : []),
    { key: 'me', name: '[formSlug]/edit', params: { formSlug } },
  ]
}

/** Phiếu Nháp 2 dòng (10 bao × 1.000 đ), bên bán của dòng là "Hoà Phát", có PO. */
const form2 = (over: Partial<ImportForm> = {}) =>
  makeForm(
    [
      makeItem(1, { supplierSlug: 's1', supplierName: 'Hoà Phát' }),
      makeItem(2, { supplierSlug: 's1', supplierName: 'Hoà Phát' }),
    ],
    { warehouseSlug: 'wh-a', purchaseOrder: 'PO-1', requesterSlug: 'u', ...over },
  )

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
      <ImportItemsStepScreen />
    </QueryClientProvider>,
  )
  await settled()
  return view
}
const wait = (ms = 0) => act(async () => new Promise((r) => setTimeout(r, ms)))

const EDITOR = ['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT']
function signIn(scope: string[] = EDITOR) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH] } as never,
  })
}

const store = () => useReceiveDraft.getState()
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never)
const rightItems = (): NativeStackHeaderItem[] =>
  mockHeader.options.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: true }) ?? []
const headerLabels = () => rightItems().map((i) => (i as { label?: string }).label)
const leftLabels = () =>
  (
    mockHeader.options.unstable_headerLeftItems?.({ tintColor: undefined, canGoBack: true }) ?? []
  ).map((i) => (i as { label?: string }).label)
type ButtonItem = { label: string; disabled?: boolean; onPress: () => void }
const headerItem = (label: string) =>
  rightItems().find((i) => (i as { label?: string }).label === label) as ButtonItem | undefined
const headerLeft = (label: string) =>
  mockHeader.options
    .unstable_headerLeftItems?.({ tintColor: undefined, canGoBack: true })
    ?.find((i) => (i as { label?: string }).label === label)
/** Mục `label` / nhãn các mục của menu `⋯` (menu gốc iOS). */
const menuItem = (label: string) => wizardMenuItem(mockHeader.options, label)
const menuLabels = () => wizardMenuLabels(mockHeader.options)
/** Dòng vật tư chỉ đọc (MỘT phần tử a11y `button`) của khoá `key`. */
const row = (key: string) => screen.getByTestId(`import-line-${key}`)
const nextButton = () => screen.getByRole('button', { name: 'Tiếp tục' })
const summary = () => screen.getByTestId('import-items-summary')
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
/** Route sheet sửa dòng `key` ở chế độ soạn (dòng vừa thêm / vừa quét: ô số tự focus). */
const sheetOf = (key: string, justAdded = false) => ({
  pathname: '/import-line',
  params: justAdded ? { key, compose: '1', focus: 'quantity' } : { key, compose: '1' },
})
const sheetOpens = () =>
  mockNavigate.mock.calls.filter(
    ([href]) => (href as { pathname?: string }).pathname === '/import-line',
  ).length
/** Màn được focus lại (sheet phía trên vừa đóng / quay về từ bước 3). */
async function refocus() {
  mockNav.focused = true
  await act(async () => mockNav.focusListeners.forEach((fn) => fn()))
  await wait(50)
}
const toReview = { pathname: '/import-form/[formSlug]/review', params: { formSlug: 'pn-1' } }

/** Bản nháp phiếu mới đã lưu trên máy (`/import-form/new/…` → nạp nó). */
async function storedNew(d: ReceiveDraft) {
  await AsyncStorage.setItem(NEW_KEY, JSON.stringify(d))
}
const newHeader = (over: Partial<ReceiveDraft['header']> = {}) => ({
  code: 'PN-MOI',
  invoiceCode: 'HD-9',
  date: '2026-11-04',
  purchaseOrder: null,
  note: null,
  supplierSlug: null,
  ...over,
})

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
  useScanNotice.getState().clear()
  open('pn-1')
  mockHeader.options = {}
  mockNav.focused = true
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  signIn()
  jest.mocked(confirmAction).mockResolvedValue(true)
  jest.mocked(chooseAction).mockResolvedValue(null)
})

afterEach(() => {
  stopDraftPersistence()
  store().reset()
  client.clear()
})

describe('ImportItemsStepScreen — phiếu đã có', () => {
  beforeEach(() => route('get', FORM_URL, () => ok(form2())))

  it('tiêu đề "Sửa phiếu", bước 2 hiện tại; khối "Vật tư · 2"; tóm tắt "2 vật tư" + tổng', async () => {
    await show()
    expect(mockHeader.options.title).toBe('Sửa phiếu')
    expect(screen.getByLabelText('Bước 2 trên 3, Vật tư, đang ở đây')).toBeSelected()
    expect(screen.getByRole('header', { name: 'Vật tư · 2' })).toBeOnTheScreen()
    expect(within(summary()).getByText('2 vật tư')).toBeOnTheScreen()
    expect(screen.getByTestId('import-items-total')).toHaveTextContent(/^20\.000\s?đ$/)
    // Sửa trên máy (sheet) → tổng + dòng cập nhật ngay.
    await act(async () => void store().updateLine('m-1|u-1', { quantity: 5 }, { check: false }))
    expect(screen.getByTestId('import-items-total')).toHaveTextContent(/^15\.000\s?đ$/)
    expect(row('m-1|u-1')).toHaveTextContent(/5 bao × 1\.000\s?đ/)
    // Không thiếu gì → "Tiếp tục" không trông khoá.
    expect(nextButton()).not.toHaveStyle({ backgroundColor: lightColors.fill })
    expect(nextButton().props.accessibilityHint).toBeUndefined()
  })

  it('dòng: tên + thành tiền (không ›), "10 bao × 1.000 đ", "mã · Không HSD | HSD dd/MM/yyyy"; giá trống → "· Chưa có giá" xám', async () => {
    await show()
    const r = within(row('m-1|u-1'))
    expect(r.getByText('Vật tư 1')).toBeOnTheScreen()
    expect(r.getByText(/^10\.000\s?đ$/)).toBeOnTheScreen()
    expect(r.queryByText('›')).toBeNull()
    expect(r.getByText(/^10 bao × 1\.000\s?đ$/)).toBeOnTheScreen()
    expect(r.getByText('VT1 · Không HSD')).toBeOnTheScreen()
    await act(async () => {
      store().updateLine('m-1|u-1', { unitPrice: 0, expiryDate: '2027-03-12' }, { check: false })
    })
    expect(r.getByText('10 bao · Chưa có giá')).toBeOnTheScreen()
    expect(flat(r.getByText('10 bao · Chưa có giá')).color).toBe(lightColors.mutedForeground)
    expect(r.getByText('VT1 · HSD 12/03/2027')).toBeOnTheScreen()
    // Giá nhập tuỳ chọn: không bao giờ thiếu.
    expect(within(summary()).queryByText(/^ · /)).toBeNull()
  })

  it('header has no Lưu nháp', async () => {
    await show()
    // Chưa đổi gì → không có gì để bỏ → không có ⋯ (chỉ Quét mã); không bao giờ có "Lưu nháp".
    expect(headerLabels()).toEqual(['Quét mã'])
    await act(async () => void store().updateLine('m-1|u-1', { quantity: 7 }, { check: false }))
    expect(headerLabels()).toEqual(['Quét mã', 'Tuỳ chọn'])
    expect(menuLabels()).toEqual(['Bỏ thay đổi trên máy'])
  })

  it('progress is inside the scroll content', async () => {
    await show()
    const list = screen.getByTestId('import-items-list')
    expect(within(list).getByTestId('import-wizard-steps-2')).toBeOnTheScreen()
    expect(within(list).getByLabelText('Bước 2 trên 3, Vật tư, đang ở đây')).toBeSelected()
    expect(within(list).queryByTestId('import-items-dock')).toBeNull()
  })

  it('rows are read-only; tapping a row opens the line sheet (compose=1)', async () => {
    await show()
    expect(screen.queryByLabelText(/^Số lượng/)).toBeNull()
    expect(screen.queryByLabelText(/^Đơn giá/)).toBeNull()
    expect(row('m-1|u-1').props.accessibilityRole).toBe('button')
    await fireEvent.press(row('m-2|u-2'))
    expect(mockNavigate).toHaveBeenLastCalledWith(sheetOf('m-2|u-2'))
  })

  it('mỗi vật tư một thẻ bo đủ góc; "⊕ Thêm vật tư" → /import-pick; Quét mã trên header → /scan-line?compose=1', async () => {
    await show()
    expect(flat(row('m-2|u-2')).borderTopLeftRadius).toBeGreaterThan(0)
    expect(flat(row('m-2|u-2')).borderBottomLeftRadius).toBeGreaterThan(0)
    await fireEvent.press(screen.getByTestId('import-items-add'))
    expect(mockNavigate).toHaveBeenLastCalledWith('/import-pick')
    expect(screen.queryByRole('button', { name: 'Quét mã' })).toBeNull()
    await act(async () => headerItem('Quét mã')!.onPress())
    expect(mockNavigate).toHaveBeenLastCalledWith({
      pathname: '/scan-line',
      params: { compose: '1' },
    })
  })

  it('no Thêm vật tư row without IMPORT_FORM_CREATE (dòng cuối bo dưới)', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT'])
    await show()
    expect(screen.queryByTestId('import-items-add')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thêm vật tư' })).toBeNull()
    // Không có dòng "Thêm" → dòng cuối khép khối.
    expect(flat(row('m-2|u-2')).borderBottomLeftRadius).toBeGreaterThan(0)
    // Quét mã vẫn có trên header (chỉ tìm dòng đã có trên phiếu).
    expect(headerItem('Quét mã')).toBeDefined()
  })

  it('không có IMPORT_FORM_CREATE + chưa có dòng: chỉ câu xám; "Chưa có vật tư" không bao giờ mở bộ chọn', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT'])
    await AsyncStorage.setItem(FORM_KEY, JSON.stringify(makeDraft([], { version: 3 })))
    await show()
    expect(screen.queryByTestId('import-items-add')).toBeNull()
    expect(screen.getByTestId('import-items-empty')).toBeOnTheScreen()
    expect(within(summary()).getByText(' · Chưa có vật tư')).toBeOnTheScreen()
    // Không thêm được vật tư: chạm chỉ cuộn lên đầu — gợi ý nói đúng điều đó.
    expect(screen.getByRole('button', { name: 'Chưa có vật tư' }).props.accessibilityHint).toBe(
      'Cuộn lên đầu danh sách',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Chưa có vật tư' }))
    await fireEvent.press(nextButton())
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('quét mã: không có trên phiếu (notOnForm) / không có trong kho → thông báo mức phiếu; rời màn thì xoá', async () => {
    const view = await show()
    await act(async () => useScanNotice.getState().show('pn-1', 'VT9', 'notOnForm'))
    expect(
      within(screen.getByTestId('import-screen-notice')).getByText(
        'Không tìm thấy vật tư có mã “VT9” trên phiếu này',
      ),
    ).toBeOnTheScreen()
    await act(async () => useScanNotice.getState().show('pn-1', 'VT9'))
    expect(screen.getByText('Không tìm thấy vật tư có mã “VT9” trong kho')).toBeOnTheScreen()
    await act(async () => useScanNotice.getState().show('pn-1', 'SN1', 'full'))
    expect(
      screen.getByText('Phiếu đã đủ 200 dòng — không thêm được vật tư mã “SN1”'),
    ).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' }))
    expect(useScanNotice.getState().notice).toBeNull()
    await act(async () => useScanNotice.getState().show('pn-1', '42'))
    await view.unmount()
    expect(useScanNotice.getState().notice).toBeNull()
  })

  it('thông báo mức phiếu (store) và thông báo của màn xếp chồng, testID riêng, store TRƯỚC', async () => {
    await show()
    await act(async () =>
      useFormNotice.getState().show({ kind: 'import', formSlug: 'pn-1', message: 'Đã gộp' }),
    )
    await act(async () => useScanNotice.getState().show('pn-1', '42'))
    const dock = screen.getByTestId('import-items-dock-content')
    const ids = within(dock)
      .getAllByTestId(/^import-(form|screen)-notice$/)
      .map((n) => n.props.testID)
    expect(ids).toEqual(['import-form-notice', 'import-screen-notice'])
    await fireEvent.press(screen.getAllByRole('button', { name: 'Đóng thông báo' })[0]!)
    expect(useFormNotice.getState().notice).toBeNull()
    expect(useScanNotice.getState().notice).toBeNull()
  })

  it('Tiếp tục when complete pushes review', async () => {
    await show()
    await fireEvent.press(nextButton())
    expect(mockPush).toHaveBeenCalledWith(toReview)
    expect(errorHaptic()).toBe(0)
  })

  it('Tiếp tục khi dòng thiếu số: không sang bước 3, rung lỗi + mở sheet dòng thiếu đầu tiên', async () => {
    await show()
    await act(async () => void store().updateLine('m-2|u-2', { quantity: 0 }, { check: false }))
    expect(within(row('m-2|u-2')).getByText('Chưa nhập số lượng')).toBeOnTheScreen()
    expect(within(summary()).getByText(' · 1 chưa đủ')).toBeOnTheScreen()
    expectNextLocked('Còn thiếu: 1 chưa đủ')
    await fireEvent.press(nextButton())
    expect(mockPush).not.toHaveBeenCalled()
    expect(errorHaptic()).toBe(1)
    expect(mockNavigate).toHaveBeenLastCalledWith(sheetOf('m-2|u-2'))
  })

  it('zero-quantity server line ("Không nhận" của checklist) = chưa đủ, "Nhập số hoặc xoá dòng" ở dòng 3; dấu kiểm giữ', async () => {
    const stored = makeDraft(
      [makeLine(1, { checked: true, quantity: 12 }), makeLine(2, { checked: true, quantity: 0 })],
      { version: 3 },
    )
    await AsyncStorage.setItem(FORM_KEY, JSON.stringify(stored))
    await show()
    expectNextLocked('Còn thiếu: 1 chưa đủ')
    expect(
      within(row('m-2|u-2')).getByText('VT2 · Không HSD · Nhập số hoặc xoá dòng'),
    ).toBeOnTheScreen()
    expect(store().draft!.lines.map((l) => l.checked)).toEqual([true, true])
    // Sửa ở sheet (ghi `{ check: false }`) không đụng dấu kiểm.
    await act(async () => void store().updateLine('m-2|u-2', { quantity: 3 }, { check: false }))
    expect(store().draft!.lines.map((l) => l.checked)).toEqual([true, true])
    expect(nextButton()).not.toHaveStyle({ backgroundColor: lightColors.fill })
  })

  it('HSD trước ngày nhập + đã đổi ở nơi khác → cảnh báo cam ở dòng 3; dòng tính "chưa đủ"', async () => {
    await show()
    await act(async () =>
      useReceiveDraft.setState((st) => ({
        draft: {
          ...st.draft!,
          lines: st.draft!.lines.map((l, i) =>
            i === 0 ? { ...l, expiryDate: '2000-01-01', changedOnServer: true } : l,
          ),
        },
      })),
    )
    const r = within(row('m-1|u-1'))
    expect(flat(r.getByText('HSD trước ngày nhập')).color).toBe(lightColors.warningText)
    expect(flat(r.getByText('Đã đổi ở nơi khác — xem lại')).color).toBe(lightColors.warningText)
    expect(within(summary()).getByText(' · 1 chưa đủ')).toBeOnTheScreen()
  })

  it('swipe delete kept: a server line asks; a new line is removed at once', async () => {
    await show()
    await act(async () => void store().addLine(makeLine(3, { base: null, quantity: 1 })))
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    await swipeDelete('m-1|u-1')
    await act(async () => {})
    expect(jest.mocked(confirmAction).mock.calls.at(-1)![0]).toMatchObject({
      title: 'Xoá Vật tư 1 khỏi phiếu?',
      destructive: true,
    })
    expect(store().draft!.lines).toHaveLength(3)
    await swipeDelete('m-1|u-1')
    await act(async () => {})
    expect(store().draft!.lines.map((l) => l.key)).toEqual(['m-2|u-2', 'm-3|u-3'])
    jest.mocked(confirmAction).mockClear()
    await swipeDelete('m-3|u-3')
    await act(async () => {})
    expect(confirmAction).not.toHaveBeenCalled()
    expect(store().draft!.lines.map((l) => l.key)).toEqual(['m-2|u-2'])
  })

  it('after adding 3 materials the first line sheet opens once (chờ màn được focus lại, ô số tự focus)', async () => {
    await show()
    mockNav.focused = false
    await act(async () => {
      for (const n of [3, 4, 5]) store().addLine(makeLine(n, { base: null, quantity: 0 }))
      useLineFocus.getState().ask('import', 'pn-1', 'm-3|u-3')
    })
    await wait(100)
    expect(sheetOpens()).toBe(0)
    await refocus()
    expect(mockNavigate).toHaveBeenCalledWith(sheetOf('m-3|u-3', true))
    expect(sheetOpens()).toBe(1)
    expect(useLineFocus.getState().request).toBeNull()
  })

  it('returning from review does not reopen the sheet', async () => {
    await show()
    mockNav.focused = false
    await act(async () => useLineFocus.getState().ask('import', 'pn-1', 'm-2|u-2'))
    await refocus()
    expect(sheetOpens()).toBe(1)
    mockNav.focused = false
    await refocus()
    await refocus()
    expect(sheetOpens()).toBe(1)
  })

  it('scan of an existing line opens its sheet; yêu cầu của phiếu xuất cùng slug không đụng màn này', async () => {
    await show()
    await act(async () => useLineFocus.getState().ask('import', 'pn-1', 'm-2|u-2'))
    await wait(50)
    expect(mockNavigate).toHaveBeenLastCalledWith(sheetOf('m-2|u-2', true))
    mockNavigate.mockClear()
    await act(async () => useLineFocus.getState().ask('export', 'pn-1', 'm-1|u-1'))
    await wait(50)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('mở thẳng bước 2 (màn đầu modal) → ✕ trái, không back gốc; ✕ → đóng modal, bản nháp trên máy còn', async () => {
    await show()
    expect(mockHeader.options.headerBackVisible).toBe(false)
    expect(leftLabels()).toEqual(['Đóng'])
    await act(async () => void store().updateLine('m-1|u-1', { quantity: 5 }, { check: false }))
    await act(async () => (headerLeft('Đóng') as ButtonItem).onPress())
    expect(leaveSpies.exit).toHaveBeenCalledTimes(1)
    expect(leaveCount()).toBe(1)
    // Không hỏi, không xoá: bản nháp (đã sửa) vẫn còn.
    expect(confirmAction).not.toHaveBeenCalled()
    expect(store().draft?.lines[0]?.quantity).toBe(5)
  })

  it('không ghi gì → thanh bước chạm được, vuốt cạnh bật; bước 1 chạm được (phiếu đã có) → bước 1 thay vào đáy modal', async () => {
    await show()
    expect(mockHeader.options.gestureEnabled).toBe(true)
    await fireEvent.press(screen.getByLabelText('Bước 1 trên 3, Thông tin, đã xong'))
    // [bước 2] → bước 1 thay bước 2 ở đáy modal (dãy bước tăng dần).
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/import-form/[formSlug]/info',
      params: { formSlug: 'pn-1' },
    })
  })

  it('đang ghi (bản nháp khoá) → Thêm / Quét / dòng khoá, không vuốt xoá được, thanh bước + vuốt cạnh khoá', async () => {
    await show()
    await act(async () => useReceiveDraft.setState({ saving: true }))
    expect(screen.getByTestId('import-items-add')).toBeDisabled()
    expect(headerItem('Quét mã')).toMatchObject({ disabled: true })
    expect(mockHeader.options.gestureEnabled).toBe(false)
    expect(screen.getByLabelText(/^Bước 1 trên 3, Thông tin/)).toBeDisabled()
    expect(nextButton()).toBeDisabled()
    expect(row('m-1|u-1')).toBeDisabled()
    await fireEvent.press(row('m-1|u-1'))
    expect(sheetOpens()).toBe(0)
    await swipeDelete('m-1|u-1')
    await act(async () => {})
    expect(store().draft!.lines).toHaveLength(2)
  })

  it('Bên bán của phiếu đã có không tính vào còn thiếu (không NCC trên dòng)', async () => {
    resetFakeApi()
    route('get', FORM_URL, () => ok(makeForm([makeItem(1)], { warehouseSlug: 'wh-a' })))
    route('get', '/suppliers', () =>
      ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1, hasNext: false }),
    )
    signIn([...EDITOR, 'SUPPLIER_READ'])
    await show()
    expect(within(summary()).queryByText(/^ · /)).toBeNull()
    expect(screen.queryByText('Thông tin phiếu còn thiếu')).toBeNull()
    await fireEvent.press(nextButton())
    expect(mockPush).toHaveBeenCalledWith(toReview)
  })
})

describe('ImportItemsStepScreen — phiếu mới (formSlug "new")', () => {
  beforeEach(() => open('new'))

  it('bước 2 đẩy lên trên bước 1 trong modal → back gốc (‹), không ✕', async () => {
    await show()
    expect(mockHeader.options.headerBackVisible).toBeUndefined()
    expect(leftLabels()).toEqual([])
  })

  it('empty form: khối chỉ có "⊕ Thêm vật tư" + câu xám; "Chưa có vật tư" và "Tiếp tục" mở bộ chọn', async () => {
    await storedNew(newDraft(newHeader()))
    await show()
    expect(mockHeader.options.title).toBe('Phiếu nhập mới')
    expect(screen.getByRole('header', { name: 'Vật tư · 0' })).toBeOnTheScreen()
    expect(screen.queryByTestId('import-items-add-hairline')).toBeNull()
    expect(
      within(screen.getByTestId('import-items-empty')).getByText(
        'Chưa có vật tư — thêm hoặc quét mã',
      ),
    ).toBeOnTheScreen()
    expect(within(summary()).getByText('0 vật tư')).toBeOnTheScreen()
    expectNextLocked('Còn thiếu: Chưa có vật tư')
    const gap = screen.getByRole('button', { name: 'Chưa có vật tư' })
    // Gợi ý nói đúng việc chạm làm: mở bộ chọn (không phải "Mở dòng còn thiếu" — chưa có dòng nào).
    expect(gap.props.accessibilityHint).toBe('Mở danh sách chọn vật tư')
    expect(flat(gap).minHeight).toBeGreaterThanOrEqual(44)
    await fireEvent.press(gap)
    expect(mockNavigate).toHaveBeenCalledWith('/import-pick')
    mockNavigate.mockClear()
    await fireEvent.press(nextButton())
    expect(mockNavigate).toHaveBeenCalledWith('/import-pick')
    expect(mockPush).not.toHaveBeenCalled()
    expect(errorHaptic()).toBe(1)
  })

  it('bản trắng chưa sửa: không có ⋯, không ghi lên máy', async () => {
    await show()
    expect(store().draft).toMatchObject({ formSlug: 'new', lines: [] })
    expect(headerLabels()).toEqual(['Quét mã'])
    await wait(400)
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull()
  })

  it('giá trống không tính là thiếu; số 0 thì có ("1 chưa đủ"); có số → bước 2 đủ, bước 1 thiếu → gợi ý "Thông tin phiếu còn thiếu"', async () => {
    await storedNew({
      ...newDraft(newHeader({ invoiceCode: '' })),
      lines: [makeLine(1, { base: null, quantity: 0, unitPrice: 0 })],
    })
    await show()
    expect(within(summary()).getByText(' · 1 chưa đủ')).toBeOnTheScreen()
    expectNextLocked('Còn thiếu: 1 chưa đủ')
    expect(screen.queryByText('Thông tin phiếu còn thiếu')).toBeNull()
    await act(async () => void store().updateLine('m-1|u-1', { quantity: 5 }, { check: false }))
    expect(within(summary()).queryByText(/^ · /)).toBeNull()
    expectNextLocked('Thông tin phiếu còn thiếu')
    const hint = screen.getByRole('button', { name: 'Thông tin phiếu còn thiếu' })
    expect(flat(hint).minHeight).toBeGreaterThanOrEqual(44)
    await fireEvent.press(hint)
    expect(mockDispatch).toHaveBeenCalledWith(StackActions.pop(1))
    mockDispatch.mockClear()
    await fireEvent.press(nextButton())
    expect(errorHaptic()).toBe(1)
    expect(mockDispatch).toHaveBeenCalledWith(StackActions.pop(1))
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/import-form/[formSlug]/review' }),
    )
  })

  it('tapping the orange summary opens the first missing line sheet', async () => {
    await storedNew({
      ...newDraft(newHeader()),
      lines: [
        makeLine(1, { base: null }),
        makeLine(2, { base: null, quantity: 0 }),
        makeLine(3, { base: null, quantity: 0 }),
      ],
    })
    await show()
    const gap = screen.getByRole('button', { name: '2 chưa đủ' })
    expect(flat(within(summary()).getByText(' · 2 chưa đủ')).color).toBe(lightColors.warningText)
    await fireEvent.press(gap)
    await fireEvent.press(gap)
    expect(mockNavigate.mock.calls).toEqual([[sheetOf('m-2|u-2')], [sheetOf('m-2|u-2')]])
  })

  it('⋯ → "Bỏ phiếu mới" (khi đã nhập gì): hỏi, bỏ bản nháp, về danh sách', async () => {
    await storedNew({ ...newDraft(newHeader()), lines: [makeLine(1, { base: null })] })
    await show()
    expect(headerLabels()).toEqual(['Quét mã', 'Tuỳ chọn'])
    expect(menuLabels()).toEqual(['Bỏ phiếu mới'])
    await act(async () => menuItem('Bỏ phiếu mới')!.onPress())
    await settled()
    expect(jest.mocked(confirmAction).mock.calls.at(-1)![0].title).toBe('Bỏ phiếu mới')
    expect(store().draft).toBeNull()
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull()
    // Đóng modal, Stack tab về danh sách.
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finishToList).toHaveBeenCalledTimes(1)
  })

  it('dòng thiếu ngoài vùng đã vẽ (150 dòng) → chạm tóm tắt vẫn mở đúng sheet', async () => {
    await storedNew({
      ...newDraft(newHeader()),
      lines: Array.from({ length: 150 }, (_, i) =>
        makeLine(i + 1, { base: null, quantity: i === 140 ? 0 : 5 }),
      ),
    })
    await show()
    expect(screen.queryByTestId('import-line-m-141|u-141')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: '1 chưa đủ' }))
    expect(mockNavigate).toHaveBeenLastCalledWith(sheetOf('m-141|u-141'))
  })
})
