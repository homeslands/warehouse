// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

import type { ImportForm } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  draftFromForm,
  draftStorageKey,
  stopDraftPersistence,
  useReceiveDraft,
} from '@/features/receive-checklist'
import { makeForm, makeItem } from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { lightColors } from '@/shared/theme/tokens'

import { ReceiveScreen } from './ReceiveScreen'
import { AndroidReceiveHeaderRight } from './receive-header'
import { useScanNotice } from './scan-notice.store'

const fontOf = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as never)?.fontFamily
const mockNavigate = jest.fn()
const mockReplace = jest.fn()
/** Chuyển giao sang modal (`useHandOffToModal`) chỉ được ghi lại — chạy thật ở `routing.test.tsx`. */
const mockHandOff = jest.fn()
jest.mock('@/shared/lib/useHandOffToModal', () => ({ useHandOffToModal: () => mockHandOff }))
const mockDispatch = jest.fn()
const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
const mockParams: { formSlug: string } = { formSlug: 'pn-1' }
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, replace: mockReplace }),
  useNavigation: () => ({
    dispatch: mockDispatch,
    canGoBack: () => true,
    // Màn đang ở đỉnh Stack của tab (xem `useLeaveOnWarehouseChange`).
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
jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))

const WH_A = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const WH_B = { slug: 'wh-b', code: 'B', name: 'Kho Thủ Đức', isManager: false }
const FORM_URL = '/warehouses/wh-a/import-forms/pn-1'
const KEY = draftStorageKey('u', 'wh-a', 'pn-1')

/** 12 dòng của mockup: dòng 1 xi măng (phiếu 50), còn lại 10 mỗi dòng. */
function mockupForm(over: Partial<ImportForm> = {}): ImportForm {
  const items = Array.from({ length: 12 }, (_, i) =>
    makeItem(i + 1, i === 0 ? { materialName: 'Xi măng Hà Tiên PCB40', quantity: 50 } : {}),
  )
  return makeForm(items, { code: 'PN-2611-0123', invoiceCode: 'HD-9', ...over })
}

/** Mockup: dòng 1 lệch (48/50) + dòng 7–12 khớp = 7 đã kiểm; dòng 2–6 chưa kiểm. */
async function seedMockupDraft(form: ImportForm) {
  const draft = draftFromForm(form)
  draft.lines = draft.lines.map((l, i) => ({
    ...l,
    checked: i === 0 || i >= 6,
    quantity: i === 0 ? 48 : l.quantity,
  }))
  await AsyncStorage.setItem(KEY, JSON.stringify(draft))
}

let client: QueryClient
const tick = () => act(async () => new Promise((r) => setTimeout(r, 0)))
async function settled() {
  await act(async () => {
    const t = () => new Promise((r) => setTimeout(r, 0))
    await t()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await t()
    await t()
    await t()
  })
}

function Wrapper() {
  return (
    <QueryClientProvider client={client}>
      <ReceiveScreen />
    </QueryClientProvider>
  )
}
async function show() {
  const view = await render(<Wrapper />)
  await settled()
  return view
}

function signIn(scope: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH_A] } as never,
  })
}
const ALL = [
  'IMPORT_FORM_READ',
  'IMPORT_FORM_CREATE',
  'IMPORT_FORM_UPDATE_DRAFT',
  'IMPORT_FORM_CONFIRM',
]

const circles = () => screen.queryAllByRole('checkbox')
const circle = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) })
const writes = () => calls.filter((c) => c.method !== 'get')
const rightItems = (): NativeStackHeaderItem[] =>
  mockHeader.options.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: false }) ?? []
/** Nút `…` (không tính "Quét mã"). */
const moreItems = () => rightItems().filter((i) => (i as { label?: string }).label === 'Tuỳ chọn')
const scanItems = () => rightItems().filter((i) => (i as { label?: string }).label === 'Quét mã')
type ButtonItem = { label: string; disabled?: boolean; icon?: unknown; onPress: () => void }
/** Nút chữ "Lưu" / "Đang lưu…" trên header (iOS). */
const saveItems = () =>
  rightItems().filter((i) =>
    /^(Lưu|Đang lưu…)$/.test((i as { label?: string }).label ?? ''),
  ) as ButtonItem[]
const pressHeaderSave = () => act(async () => saveItems()[0]!.onPress())

const TILE_LABELS = { all: 'Tất cả', unchecked: 'Chưa kiểm', match: 'Khớp', diff: 'Lệch' } as const
/** Ô số liệu (nhãn a11y "Chưa kiểm, 5"). */
const tile = (key: keyof typeof TILE_LABELS) =>
  screen.getByRole('button', { name: new RegExp(`^${TILE_LABELS[key]}, \\d+$`) })
/** Số trên bốn ô. */
function tileCounts() {
  const n = (key: keyof typeof TILE_LABELS) =>
    Number(/(\d+)$/.exec(tile(key).props.accessibilityLabel as string)![1])
  return { all: n('all'), unchecked: n('unchecked'), match: n('match'), diff: n('diff') }
}
const queryTiles = () =>
  screen.queryAllByRole('button', { name: /^(Tất cả|Chưa kiểm|Khớp|Lệch), / })
const row = (key: string) => screen.getByTestId(`receive-row-${key}`)

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
  // react-query báo cho component bằng hẹn giờ 0ms: khi máy bận (cả bộ test chạy song song), lượt báo
  // có thể rơi vào khe giữa hai `act()` của các luồng Lưu nhiều bước → cảnh báo "not wrapped in act"
  // chập chờn. Báo ngay (đồng bộ) để cập nhật nằm trong `act` đã gây ra nó.
  notifyManager.setScheduler((callback) => callback())
})

afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)))

beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  useReceiveDraft.getState().reset()
  mockHeader.options = {}
  mockParams.formSlug = 'pn-1'
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH_A, resolved: true, resolution: 'selected' })
  signIn(ALL)
})

afterEach(async () => {
  // Gỡ màn TRƯỚC khi xoá cache: `client.clear()` khi màn còn gắn sẽ báo cập nhật ngoài act().
  await cleanup()
  stopDraftPersistence()
  useReceiveDraft.getState().reset()
  client.clear()
})

describe('ReceiveScreen — danh sách kiểm', () => {
  it('đầu phiếu: HĐ · ngày + nhãn trạng thái, NCC suy ra, tổng tiền; bốn ô số liệu; tiêu đề "Kiểm hàng" (mã phiếu ở màn xem)', async () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      makeItem(i + 1, {
        supplierSlug: 's1',
        supplierName: 'Cty TNHH Thép Hoà Phát',
        ...(i === 0 ? { materialName: 'Xi măng Hà Tiên PCB40', quantity: 50 } : {}),
      }),
    )
    const form = makeForm(items, { code: 'PN-2611-0123', invoiceCode: 'HD-9' })
    route('get', FORM_URL, () => ok(form))
    await seedMockupDraft(form)
    await show()
    expect(mockHeader.options.title).toBe('Kiểm hàng')
    expect(screen.getByText('Cty TNHH Thép Hoà Phát')).toBeOnTheScreen()
    expect(screen.getByText('HĐ HD-9 · 04/11/2026')).toBeOnTheScreen()
    expect(fontOf(screen.getByText('HD-9'))).toBe('ui-monospace')
    expect(fontOf(screen.getByText('HĐ HD-9 · 04/11/2026'))).toBeUndefined()
    expect(StyleSheet.flatten(screen.getByText('04/11/2026').props.style).fontVariant).toEqual([
      'tabular-nums',
    ])
    expect(screen.getByText('Nháp')).toBeOnTheScreen()
    // Tổng = Σ số × đơn giá của bản nháp: 48 × 1.000 + 11 × 10 × 1.000.
    const total = screen.getByText('158.000 đ')
    expect(StyleSheet.flatten(total.props.style).fontVariant).toEqual(['tabular-nums'])
    expect(tileCounts()).toEqual({ all: 12, unchecked: 5, match: 6, diff: 1 })
    expect(tile('all')).toBeSelected()
    // Không còn thanh tiến độ / segmented cũ.
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    // Dòng lệch: "phiếu 50 · −2".
    expect(screen.getByText('phiếu 50 · −2')).toBeOnTheScreen()
  })

  it('chạm vòng tròn dòng 2 → tiến độ +1, dòng khớp, không gọi API ghi; chạm lại → bỏ', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await seedMockupDraft(form)
    await show()
    expect(tileCounts()).toEqual({ all: 12, unchecked: 5, match: 6, diff: 1 })
    await act(async () => fireEvent.press(circle('Đánh dấu khớp: Vật tư 2')))
    expect(tileCounts()).toEqual({ all: 12, unchecked: 4, match: 7, diff: 1 })
    expect(useReceiveDraft.getState().draft?.lines[1]?.checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Bỏ đánh dấu: Vật tư 2/ })).toBeOnTheScreen()
    await act(async () => fireEvent.press(circle('Bỏ đánh dấu: Vật tư 2')))
    expect(tileCounts()).toEqual({ all: 12, unchecked: 5, match: 6, diff: 1 })
    expect(writes()).toHaveLength(0)
  })

  it('vòng tròn có vùng chạm 44pt', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await show()
    expect(circles()[0]).toHaveStyle({ width: 44, height: 44 })
  })

  it('chạm ô để lọc: "Chưa kiểm" 5 dòng, "Khớp" 6, "Lệch" 1 rồi gồm cả dòng "Không nhận", "Tất cả" 12', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await seedMockupDraft(form)
    await show()
    await act(async () => fireEvent.press(tile('unchecked')))
    expect(circles()).toHaveLength(5)
    expect(tile('unchecked')).toBeSelected()
    expect(tile('all')).not.toBeSelected()
    await act(async () => fireEvent.press(tile('match')))
    expect(circles()).toHaveLength(6)
    expect(circles().every((c) => /Bỏ đánh dấu/.test(c.props.accessibilityLabel))).toBe(true)
    expect(screen.queryByText('Vật tư 2')).toBeNull()
    expect(tile('match')).toBeSelected()
    await act(async () => fireEvent.press(tile('diff')))
    expect(circles()).toHaveLength(1)
    expect(tile('diff')).toBeSelected()
    // Dòng 2 nhận 0 → "Không nhận", tính vào Lệch.
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-2|u-2', { quantity: 0 })
    })
    expect(tileCounts()).toEqual({ all: 12, unchecked: 4, match: 6, diff: 2 })
    expect(circles()).toHaveLength(2)
    expect(screen.getByText('Không nhận')).toBeOnTheScreen()
    await act(async () => fireEvent.press(tile('all')))
    expect(screen.getByText('Vật tư 2')).toBeOnTheScreen()
    expect(tile('all')).toBeSelected()
  })

  it('dòng: không mũi tên ›; dòng lệch không tô nền vàng; nhóm bo tròn đầu/cuối', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await seedMockupDraft(form)
    await show()
    const svgs = (key: string) =>
      row(key).queryAll((n) => typeof n.type === 'string' && n.type.startsWith('RNSVG'))
    // Dòng chưa kiểm: không có icon nào (vòng tròn rỗng, không chevron).
    expect(svgs('m-2|u-2')).toHaveLength(0)
    // Dòng lệch (dòng 1): nền thẻ như mọi dòng.
    expect(row('m-1|u-1')).toHaveStyle({ backgroundColor: lightColors.card })
    expect(row('m-1|u-1')).toHaveStyle({ borderTopLeftRadius: 26, borderTopRightRadius: 26 })
    expect(row('m-2|u-2')).toHaveStyle({ borderTopLeftRadius: 0 })
    expect(StyleSheet.flatten(row('m-1|u-1').props.style).minHeight).toBeGreaterThanOrEqual(60)
  })

  it('còn 5 dòng chưa kiểm → nút chính khoá "Còn 5 dòng chưa kiểm"', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await seedMockupDraft(form)
    await show()
    const button = screen.getByRole('button', { name: 'Còn 5 dòng chưa kiểm' })
    expect(button).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Xác nhận nhập kho' })).toBeNull()
  })

  it('kiểm đủ + có IMPORT_FORM_CONFIRM → "Xác nhận nhập kho" bật', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await show()
    await act(async () => {
      for (const l of useReceiveDraft.getState().draft?.lines ?? []) {
        useReceiveDraft.getState().toggleCheck(l.key)
      }
    })
    expect(screen.getByRole('button', { name: 'Xác nhận nhập kho' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /dòng chưa kiểm/ })).toBeNull()
  })

  it('[+] khi canAddLine → /import-pick; "Lưu" trên header chỉ khi có thay đổi; chạm dòng → /import-line', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await show()
    expect(saveItems()).toHaveLength(0)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Thêm' })))
    expect(mockNavigate).toHaveBeenCalledWith('/import-pick')
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    // Header: [Lưu (chữ, không icon), Quét mã, …] — Lưu đứng TRƯỚC.
    expect(rightItems().map((i) => (i as { label?: string }).label)).toEqual([
      'Lưu',
      'Quét mã',
      'Tuỳ chọn',
    ])
    expect(saveItems()[0]).toMatchObject({ type: 'button', label: 'Lưu', disabled: false })
    expect(saveItems()[0]!.icon).toBeUndefined()
    // Thanh đáy không còn nút Lưu cho phiếu đã có trên server.
    expect(screen.queryByRole('button', { name: 'Lưu' })).toBeNull()
    await act(async () => fireEvent.press(screen.getByText('Vật tư 4')))
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/import-line',
      params: { key: 'm-4|u-4' },
    })
    expect(writes()).toHaveLength(0)
  })

  it('có sửa mà không có IMPORT_FORM_CREATE → không có [+ Thêm]', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT'])
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await show()
    expect(screen.queryByRole('button', { name: 'Thêm' })).toBeNull()
  })

  it('xác nhận được + chỉ _OWN, phiếu người khác → không Lưu/Thêm nhưng vẫn đánh dấu được', async () => {
    signIn([
      'IMPORT_FORM_READ',
      'IMPORT_FORM_CREATE',
      'IMPORT_FORM_UPDATE_DRAFT_OWN',
      'IMPORT_FORM_CONFIRM',
    ])
    const form = mockupForm({ requesterSlug: 'someone-else' })
    route('get', FORM_URL, () => ok(form))
    await show()
    expect(screen.queryByRole('button', { name: 'Thêm' })).toBeNull()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    expect(saveItems()).toHaveLength(0)
    await act(async () => fireEvent.press(circle('Đánh dấu khớp: Vật tư 2')))
    // Có thay đổi trên máy nhưng không có quyền sửa → không có "…".
    expect(moreItems()).toHaveLength(0)
    // Dòng 3 sửa số (tự đánh dấu, lệch) + dòng 2 khớp.
    expect(tileCounts()).toEqual({ all: 12, unchecked: 10, match: 1, diff: 1 })
  })

  it('CONFIRMED → chỉ đọc: không vòng tròn, không thanh đáy', async () => {
    const form = mockupForm({ status: 'CONFIRMED' })
    route('get', FORM_URL, () => ok(form))
    await show()
    expect(screen.getByText('Vật tư 2')).toBeOnTheScreen()
    expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen()
    expect(circles()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Thêm' })).toBeNull()
    expect(saveItems()).toHaveLength(0)
    expect(queryTiles()).toHaveLength(0)
    // Nhãn trạng thái xanh; tổng tiền theo dòng trên server (50 × 1.000 + 11 × 10 × 1.000).
    expect(screen.getByTestId('receive-status')).toHaveStyle({
      backgroundColor: lightColors.successSoft,
    })
    expect(screen.getByText('160.000 đ')).toBeOnTheScreen()
  })

  it('200 dòng tên 120 ký tự: render không lỗi và chỉ vẽ một phần (ảo hoá)', async () => {
    const long = 'Vật tư tên rất dài '.repeat(8).slice(0, 120)
    const items = Array.from({ length: 200 }, (_, i) =>
      makeItem(i + 1, { materialName: `${long}${i + 1}` }),
    )
    const form = makeForm(items, { code: 'PN-BIG' })
    route('get', FORM_URL, () => ok(form))
    await show()
    expect(tileCounts()).toMatchObject({ all: 200, unchecked: 200 })
    const rendered = circles().length
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(60)
  })

  it('tắt app rồi mở lại (store mới + load) → dấu đã kiểm còn nguyên', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    const first = await show()
    await act(async () => fireEvent.press(circle('Đánh dấu khớp: Vật tư 2')))
    await act(async () => fireEvent.press(circle('Đánh dấu khớp: Vật tư 3')))
    expect(tileCounts()).toMatchObject({ all: 12, unchecked: 10 })
    await first.unmount()
    useReceiveDraft.getState().reset() // ghi nốt rồi xoá bộ nhớ, như tắt app
    await tick()
    client.clear()
    await show()
    expect(tileCounts()).toMatchObject({ all: 12, unchecked: 10 })
    expect(screen.getByRole('checkbox', { name: /Bỏ đánh dấu: Vật tư 2/ })).toBeOnTheScreen()
  })

  it('"…" chỉ khi có thay đổi trên máy; chọn "Bỏ thay đổi trên máy" → hỏi, xoá dấu và bản lưu', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await show()
    expect(moreItems()).toHaveLength(0)
    await act(async () => fireEvent.press(circle('Đánh dấu khớp: Vật tư 2')))
    const items = moreItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'button', icon: { type: 'sfSymbol', name: 'ellipsis' } })
    // Chỉ đánh dấu (chưa sửa) → "Lưu" khoá, menu chỉ còn "Bỏ thay đổi trên máy".
    jest.mocked(chooseAction).mockResolvedValueOnce(0)
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    await act(async () => (items[0] as { onPress: () => void }).onPress())
    expect(chooseAction).toHaveBeenCalledWith({
      actions: [{ label: 'Bỏ thay đổi trên máy', destructive: true }],
      cancelLabel: 'Huỷ',
    })
    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true, confirmLabel: 'Bỏ thay đổi trên máy' }),
    )
    expect(tileCounts()).toMatchObject({ all: 12, unchecked: 11 })
    jest.mocked(chooseAction).mockResolvedValueOnce(0)
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await act(async () => (moreItems()[0] as { onPress: () => void }).onPress())
    await settled()
    expect(tileCounts()).toMatchObject({ all: 12, unchecked: 12 })
    expect(await AsyncStorage.getItem(KEY)).toBeNull()
    expect(moreItems()).toHaveLength(0)
  })

  it('"…" mở menu [Lưu, Bỏ thay đổi trên máy]; chọn Lưu → như nút Lưu trên header; chọn Bỏ → hỏi', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    route('patch', FORM_URL, () => ok({ ...form, version: 4 }))
    await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    await act(async () => (moreItems()[0] as { onPress: () => void }).onPress())
    expect(chooseAction).toHaveBeenCalledWith({
      actions: [
        { label: 'Lưu', destructive: undefined },
        { label: 'Bỏ thay đổi trên máy', destructive: true },
      ],
      cancelLabel: 'Huỷ',
    })
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }))
    expect(writes()).toHaveLength(0)
    jest.mocked(chooseAction).mockResolvedValueOnce(0)
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await act(async () => (moreItems()[0] as { onPress: () => void }).onPress())
    await settled()
    expect(writes()).toHaveLength(1)
  })

  it('"…" huỷ menu → không làm gì; đang lưu → không có "…"', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    let release: (r: ReturnType<typeof ok>) => void = () => undefined
    route('patch', FORM_URL, () => new Promise((r) => (release = r)))
    await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    jest.mocked(chooseAction).mockResolvedValueOnce(null)
    await act(async () => (moreItems()[0] as { onPress: () => void }).onPress())
    expect(confirmAction).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
    // Hộp hỏi của Lưu (được dùng ngay bên dưới → không còn tồn trong hàng đợi).
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await pressHeaderSave()
    await tick()
    expect(moreItems()).toHaveLength(0)
    await act(async () => release(ok({ ...form, version: 4 })))
    await settled()
  })

  it('dòng đổi trên web có nhãn "Đã đổi trên web"', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    const draft = draftFromForm(form)
    draft.lines[2] = { ...draft.lines[2]!, changedOnServer: true }
    await AsyncStorage.setItem(KEY, JSON.stringify(draft))
    await show()
    expect(screen.getAllByText('Đã đổi trên web')).toHaveLength(1)
  })

  it('đổi kho → popToTop', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await show()
    expect(mockDispatch).not.toHaveBeenCalled()
    route('get', '/warehouses/wh-b/import-forms/pn-1', () => failure(404, 101301))
    await act(async () => {
      useWarehouseStore.setState({ current: WH_B })
    })
    // Chờ lần tải theo kho mới xong (thông báo của react-query chạy bằng hẹn giờ, ngoài act).
    await settled()
    expect(mockDispatch).toHaveBeenCalledTimes(1)
  })

  it('tải lỗi lần đầu → màn lỗi + Thử lại', async () => {
    route('get', FORM_URL, () => failure(500, 100001))
    await show()
    expect(screen.getByText('Không tải được phiếu nhập')).toBeOnTheScreen()
    route('get', FORM_URL, () => ok(mockupForm()))
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Thử lại' })))
    await settled()
    expect(tileCounts()).toMatchObject({ all: 12, unchecked: 12 })
  })

  it('[Lưu] → hỏi rồi PATCH; lỗi mạng → thông báo mức phiếu trên màn, đóng được; bản nháp giữ', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    route('patch', FORM_URL, () => 'network')
    await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await pressHeaderSave()
    await settled()
    expect(writes()).toHaveLength(1)
    expect(screen.getByTestId('receive-error')).toHaveTextContent('Không kết nối được máy chủ')
    expect(useReceiveDraft.getState().draft?.lines[2]?.quantity).toBe(9)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' })))
    expect(screen.queryByTestId('receive-error')).toBeNull()
  })

  it('[Lưu] mà mã phiếu (đã sửa ở luồng soạn) trùng phiếu khác (PATCH 101304) → thông báo mức phiếu trên màn, đóng được', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    route('patch', FORM_URL, () => failure(409, 101304))
    await show()
    await act(async () => {
      useReceiveDraft.getState().setHeader({ code: 'PN-TRUNG' })
    })
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await pressHeaderSave()
    await settled()
    expect(writes()).toHaveLength(1)
    expect(screen.getByTestId('receive-error')).toHaveTextContent('Mã phiếu đã tồn tại')
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' })))
    expect(screen.queryByTestId('receive-error')).toBeNull()
  })

  it('đang gửi → vòng tròn, dòng, [Thêm], [Lưu] khoá, không "…"; lưu xong → hết thay đổi, [Lưu] ẩn', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    let release: (r: ReturnType<typeof ok>) => void = () => undefined
    route('patch', FORM_URL, () => new Promise((r) => (release = r)))
    await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await pressHeaderSave()
    await tick()
    expect(circle('Đánh dấu khớp: Vật tư 2')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled()
    // Header: chỉ còn "Đang lưu…" khoá (không bấm đôi); "Quét mã" lẫn "…" ẩn khi đang gửi.
    expect(rightItems()).toHaveLength(1)
    expect(saveItems()[0]).toMatchObject({ label: 'Đang lưu…', disabled: true })
    await act(async () => fireEvent.press(circle('Đánh dấu khớp: Vật tư 2')))
    expect(useReceiveDraft.getState().draft?.lines[1]?.checked).toBe(false)

    const items = form.items!.map((i) => (i.materialSlug === 'm-3' ? { ...i, quantity: 9 } : i))
    await act(async () => release(ok({ ...form, version: 4, items })))
    await settled()
    expect(saveItems()).toHaveLength(0)
    expect(circle('Đánh dấu khớp: Vật tư 2')).toBeEnabled()
    expect(tileCounts()).toMatchObject({ all: 12, unchecked: 11 })
    expect(screen.queryByTestId('receive-error')).toBeNull()
  })

  it('hạn dùng trước ngày phiếu → không hỏi, báo trên màn', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { expiryDate: '2026-01-01' })
    })
    await pressHeaderSave()
    expect(confirmAction).not.toHaveBeenCalled()
    expect(screen.getByTestId('receive-error')).toHaveTextContent(
      'Hạn dùng trước ngày phiếu ở 1 dòng',
    )
    // Dòng bị chặn giữ nền đỏ nhạt.
    expect(row('m-3|u-3')).toHaveStyle({ backgroundColor: lightColors.destructiveSoft })
    expect(row('m-2|u-2')).toHaveStyle({ backgroundColor: lightColors.card })
    expect(writes()).toHaveLength(0)
  })

  it('làm mới phiếu trong lúc Lưu (v4 về trước PATCH, v3 cũ về sau PATCH) không làm hỏng bản nháp', async () => {
    const form = mockupForm()
    const DETAIL = ['import-forms', 'wh-a', 'detail', 'pn-1']
    const v4 = {
      ...form,
      version: 4,
      items: form.items!.map((i) => (i.materialSlug === 'm-3' ? { ...i, quantity: 9 } : i)),
    }
    let serve: () => ReturnType<typeof ok> | Promise<ReturnType<typeof ok>> = () => ok(form)
    route('get', FORM_URL, () => serve())
    let releasePatch: (r: ReturnType<typeof ok>) => void = () => undefined
    route('patch', FORM_URL, () => new Promise((r) => (releasePatch = r)))
    await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
      useReceiveDraft.getState().toggleCheck('m-2|u-2')
    })
    const list = screen.getByTestId('receive-list')
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await pressHeaderSave()
    await tick()
    expect(useReceiveDraft.getState().saving).toBe(true)
    // Đang lưu: RefreshControl vẫn gắn (không dựng lại danh sách) nhưng tắt, kéo không tải lại.
    expect(screen.getByTestId('receive-list')).toBe(list)
    const refresh = () =>
      screen.getByTestId('receive-list').props.refreshControl as {
        props: { enabled?: boolean; onRefresh: () => void }
      }
    expect(refresh().props.enabled).toBe(false)
    const gets = callsTo('get', FORM_URL).length
    await act(async () => refresh().props.onRefresh())
    await tick()
    expect(callsTo('get', FORM_URL)).toHaveLength(gets)

    // (a) Một lần tải lại đọc được v4 (PATCH đã ghi) TRƯỚC khi phản hồi PATCH về.
    serve = () => ok(v4)
    await act(async () => {
      await client.refetchQueries({ queryKey: DETAIL })
    })
    await settled()
    // (b) Một lần tải lại đọc v3 cũ, về SAU phản hồi PATCH.
    let releaseGet: (r: ReturnType<typeof ok>) => void = () => undefined
    serve = () => new Promise((r) => (releaseGet = r))
    await act(async () => {
      void client.refetchQueries({ queryKey: DETAIL })
    })
    await tick()
    await act(async () => releasePatch(ok(v4)))
    await tick()
    await act(async () => releaseGet(ok(form)))
    await settled()

    const d = useReceiveDraft.getState().draft!
    expect(d.version).toBe(4)
    expect(d.lines.filter((l) => l.changedOnServer)).toHaveLength(0)
    expect(d.lines[1]).toMatchObject({ checked: true })
    expect(d.lines[2]).toMatchObject({ quantity: 9, checked: true, base: { quantity: 9 } })
    expect(client.getQueryData<ImportForm>(DETAIL)?.version).toBe(4)
    expect(saveItems()).toHaveLength(0)
    expect(screen.getByTestId('receive-list')).toBe(list)
    expect(refresh().props.enabled).toBe(true)
  })

  it('thông báo lỗi nằm NGOÀI danh sách (thấy ở mọi vị trí cuộn) và được đọc cho trình đọc màn hình', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    route('patch', FORM_URL, () => 'network')
    await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    await fireEvent.scroll(screen.getByTestId('receive-list'), {
      nativeEvent: {
        contentOffset: { y: 2000, x: 0 },
        contentSize: { height: 3000, width: 400 },
        layoutMeasurement: { height: 800, width: 400 },
      },
    })
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await pressHeaderSave()
    await settled()
    const notice = screen.getByTestId('receive-error')
    expect(notice).toHaveTextContent('Không kết nối được máy chủ')
    expect(within(screen.getByTestId('receive-list')).queryByTestId('receive-error')).toBeNull()
    expect(announce).toHaveBeenCalledWith('Không kết nối được máy chủ')
    announce.mockRestore()
  })

  it('khoá rồi mở khoá khi Lưu không dựng lại danh sách: cùng nút danh sách, dòng không gắn lại', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    let release: (r: ReturnType<typeof ok>) => void = () => undefined
    route('patch', FORM_URL, () => new Promise((r) => (release = r)))
    await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    const list = screen.getByTestId('receive-list')
    const row = screen.getByRole('checkbox', { name: /Vật tư 2$/ })
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await pressHeaderSave()
    await tick()
    expect(screen.getByTestId('receive-list')).toBe(list)
    expect(screen.getByRole('checkbox', { name: /Vật tư 2$/ })).toBe(row)
    const items = form.items!.map((i) => (i.materialSlug === 'm-3' ? { ...i, quantity: 9 } : i))
    await act(async () => release(ok({ ...form, version: 4, items })))
    await settled()
    expect(screen.getByTestId('receive-list')).toBe(list)
    expect(screen.getByRole('checkbox', { name: /Vật tư 2$/ })).toBe(row)
  })

  it('rời phiếu A khi đang Lưu chậm, mở phiếu B (cùng số version) → B nạp bản nháp của chính nó', async () => {
    const formA = mockupForm()
    route('get', FORM_URL, () => ok(formA))
    let release: (r: ReturnType<typeof ok>) => void = () => undefined
    route('patch', FORM_URL, () => new Promise((r) => (release = r)))
    const a = await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await pressHeaderSave()
    await tick()
    expect(useReceiveDraft.getState().saving).toBe(true)
    await a.unmount()

    const formB = makeForm([makeItem(1, { materialName: 'Thép B' }), makeItem(2)], {
      slug: 'pn-2',
      code: 'PN-B',
      version: 4,
    })
    route('get', '/warehouses/wh-a/import-forms/pn-2', () => ok(formB))
    mockParams.formSlug = 'pn-2'
    await show()
    const itemsA = formA.items!.map((i) => (i.materialSlug === 'm-3' ? { ...i, quantity: 9 } : i))
    await act(async () => release(ok({ ...formA, version: 4, items: itemsA })))
    await settled()

    expect(useReceiveDraft.getState().saving).toBe(false)
    expect(useReceiveDraft.getState().ctx?.formSlug).toBe('pn-2')
    expect(useReceiveDraft.getState().draft?.formSlug).toBe('pn-2')
    expect(screen.getByText('Thép B')).toBeOnTheScreen()
    expect(tileCounts()).toMatchObject({ all: 2, unchecked: 2 })
  })
})

describe('ReceiveScreen — phiếu đổi trên server lúc đang mở (tải lại nền)', () => {
  const DETAIL = ['import-forms', 'wh-a', 'detail', 'pn-1']
  const CONFLICT =
    'Phiếu đã được người khác thay đổi. Đã tải lại; các dòng đổi trên web cần kiểm lại.'

  /** Bản nháp v3 trên máy: dòng 3 sửa 10 → 9 (đã kiểm), dòng 2 đánh dấu khớp. */
  async function seedEdited(form: ImportForm) {
    const draft = draftFromForm(form)
    draft.lines[1] = { ...draft.lines[1]!, checked: true }
    draft.lines[2] = { ...draft.lines[2]!, quantity: 9, checked: true }
    await AsyncStorage.setItem(KEY, JSON.stringify(draft))
  }
  /** v4 trên server: kế toán sửa dòng 2 thành 12 và xoá dòng 12. */
  const v4 = (form: ImportForm): ImportForm => ({
    ...form,
    version: 4,
    items: form
      .items!.filter((i) => i.materialSlug !== 'm-12')
      .map((i) => (i.materialSlug === 'm-2' ? { ...i, quantity: 12 } : i)),
  })

  it('tải lại nền thấy v4 → gộp, báo mức phiếu nêu dòng bị xoá, dòng đổi gắn nhãn; không ghi gì', async () => {
    const form = mockupForm()
    let serve = form
    route('get', FORM_URL, () => ok(serve))
    await seedEdited(form)
    await show()
    expect(screen.queryByTestId('receive-error')).toBeNull()
    expect(tileCounts()).toMatchObject({ all: 12, unchecked: 10 })

    serve = v4(form)
    await act(async () => {
      await client.refetchQueries({ queryKey: DETAIL })
    })
    await settled()

    expect(screen.getByTestId('receive-error')).toHaveTextContent(
      `${CONFLICT} Đã bị xoá trên phiếu: Vật tư 12`,
    )
    expect(screen.getAllByText('Đã đổi trên web')).toHaveLength(1)
    const d = useReceiveDraft.getState().draft!
    expect(d.version).toBe(4)
    expect(d.lines).toHaveLength(11)
    expect(d.lines[1]).toMatchObject({ quantity: 12, checked: false, changedOnServer: true })
    expect(d.lines[2]).toMatchObject({ quantity: 9, checked: true, changedOnServer: false })
    expect(tileCounts()).toMatchObject({ all: 11, unchecked: 10 })
    expect(writes()).toHaveLength(0)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' })))
    expect(screen.queryByTestId('receive-error')).toBeNull()
  })

  it('mở lại app: bản nháp v3 trên máy, server đã là v4 → cũng báo', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(v4(form)))
    await seedEdited(form)
    await show()
    expect(screen.getByTestId('receive-error')).toHaveTextContent(
      `${CONFLICT} Đã bị xoá trên phiếu: Vật tư 12`,
    )
    expect(writes()).toHaveLength(0)
  })

  it('tải lại nền thấy phiếu đã xác nhận trên web → báo đã bỏ bản nháp trên máy, chỉ đọc', async () => {
    const form = mockupForm()
    let serve = form
    route('get', FORM_URL, () => ok(serve))
    await seedEdited(form)
    await show()
    serve = { ...form, version: 4, status: 'CONFIRMED' }
    await act(async () => {
      await client.refetchQueries({ queryKey: DETAIL })
    })
    await settled()
    expect(screen.getByTestId('receive-error')).toHaveTextContent(
      'Phiếu không còn ở trạng thái Nháp (đã được xác nhận hoặc huỷ). Đã bỏ dấu đã kiểm và số đã sửa trên máy.',
    )
    expect(await AsyncStorage.getItem(KEY)).toBeNull()
    expect(circles()).toHaveLength(0)
    expect(writes()).toHaveLength(0)
  })

  it('checklist: bản nháp CHỈ có dấu kiểm (không sửa số) → web đổi version vẫn báo như cũ', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok({ ...form, version: 4 }))
    const draft = draftFromForm(form)
    draft.lines[1] = { ...draft.lines[1]!, checked: true }
    await AsyncStorage.setItem(KEY, JSON.stringify(draft))
    await show()
    expect(mockHeader.options.title).toBe('Kiểm hàng')
    expect(screen.getByTestId('receive-error')).toHaveTextContent(CONFLICT)
  })

  it('checklist: bản nháp CHỈ có dấu kiểm → phiếu thành đã xác nhận vẫn báo đã bỏ; tiêu đề vẫn "Kiểm hàng"', async () => {
    const form = mockupForm()
    let serve = form
    route('get', FORM_URL, () => ok(serve))
    const draft = draftFromForm(form)
    draft.lines[1] = { ...draft.lines[1]!, checked: true }
    await AsyncStorage.setItem(KEY, JSON.stringify(draft))
    await show()
    serve = { ...form, version: 4, status: 'CONFIRMED' }
    await act(async () => {
      await client.refetchQueries({ queryKey: DETAIL })
    })
    await settled()
    expect(screen.getByTestId('receive-error')).toHaveTextContent(
      'Phiếu không còn ở trạng thái Nháp (đã được xác nhận hoặc huỷ). Đã bỏ dấu đã kiểm và số đã sửa trên máy.',
    )
    expect(mockHeader.options.title).toBe('Kiểm hàng')
  })

  it('không có gì trên máy → phiếu thành đã xác nhận thì không báo', async () => {
    const form = mockupForm()
    let serve = form
    route('get', FORM_URL, () => ok(serve))
    await show()
    serve = { ...form, version: 4, status: 'CONFIRMED' }
    await act(async () => {
      await client.refetchQueries({ queryKey: DETAIL })
    })
    await settled()
    expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen()
    expect(screen.queryByTestId('receive-error')).toBeNull()
  })
})

describe('ReceiveScreen — có quyền xác nhận, không có quyền sửa', () => {
  it('bản nháp có số đã sửa → Xác nhận không gửi gì, báo và cho "Bỏ thay đổi trên máy"', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CONFIRM'])
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    const draft = draftFromForm(form)
    draft.lines = draft.lines.map((l, i) => ({
      ...l,
      checked: true,
      quantity: i === 2 ? 9 : l.quantity,
    }))
    await AsyncStorage.setItem(KEY, JSON.stringify(draft))
    await show()
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Xác nhận nhập kho' })),
    )
    await settled()
    expect(confirmAction).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
    const notice = screen.getByTestId('receive-error')
    expect(notice).toHaveTextContent(/Bạn không có quyền sửa phiếu này/)
    jest.mocked(confirmAction).mockResolvedValueOnce(true)
    await act(async () =>
      fireEvent.press(within(notice).getByRole('button', { name: 'Bỏ thay đổi trên máy' })),
    )
    await settled()
    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true, confirmLabel: 'Bỏ thay đổi trên máy' }),
    )
    expect(screen.queryByTestId('receive-error')).toBeNull()
    expect(tileCounts()).toMatchObject({ all: 12, unchecked: 12 })
    expect(await AsyncStorage.getItem(KEY)).toBeNull()
    expect(writes()).toHaveLength(0)
  })
})

describe('ReceiveScreen — người chỉ sửa được / phiếu mới → màn soạn', () => {
  it('new form goes to step 1, edit-only user goes to modal /edit (chuyển giao: checklist bị bỏ khỏi tab)', async () => {
    // Phiếu mới (link cũ `/import/new/receive`): không tải gì, sang bước 1 trong modal.
    mockParams.formSlug = 'new'
    const first = await show()
    expect(mockHandOff).toHaveBeenCalledTimes(1)
    expect(mockHandOff).toHaveBeenCalledWith('/import-form/new/info')
    expect(callsTo('get', '/warehouses/wh-a/import-forms/new')).toHaveLength(0)
    await first.unmount()

    // Sửa được, không xác nhận được (SUPERVISOR): màn soạn (bước 2) của phiếu trong modal, không nạp
    // bản nháp.
    mockHandOff.mockClear()
    mockParams.formSlug = 'pn-1'
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT'])
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(mockHandOff).toHaveBeenCalledTimes(1)
    expect(mockHandOff).toHaveBeenCalledWith({
      pathname: '/import-form/[formSlug]/edit',
      params: { formSlug: 'pn-1' },
    })
    expect(mockReplace).not.toHaveBeenCalled()
    expect(useReceiveDraft.getState().draft).toBeNull()
    expect(screen.queryByTestId('receive-list')).toBeNull()
  })

  it('xác nhận được (MANAGER) → ở lại checklist, không chuyển', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(mockHandOff).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockHeader.options.title).toBe('Kiểm hàng')
  })
})

describe('ReceiveScreen — không sửa, không xác nhận (vào thẳng route)', () => {
  it('chỉ xem: dòng không bấm được, không ô, không nút đáy, không Lưu / Quét trên header', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT_OWN'])
    route('get', FORM_URL, () => ok(mockupForm({ requesterSlug: 'someone-else' })))
    await show()
    // Tiêu đề trung tính: mã phiếu (không "Kiểm hàng" / "Sửa phiếu").
    expect(mockHeader.options.title).toBe('PN-2611-0123')
    expect(screen.getByText('Vật tư 4')).toBeOnTheScreen()
    expect(circles()).toHaveLength(0)
    expect(queryTiles()).toHaveLength(0)
    expect(row('m-4|u-4').props.accessibilityRole).toBeUndefined()
    await act(async () => fireEvent.press(screen.getByText('Vật tư 4')))
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.queryByTestId('receive-controls')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thêm' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lưu' })).toBeNull()
    expect(rightItems()).toHaveLength(0)
    expect(moreItems()).toHaveLength(0)
  })
})

describe('ReceiveScreen — số 6 chữ số lẻ trên dòng', () => {
  it('dòng hiện đủ 6 số lẻ; lệch 0,000001 hiện "+0,000001" (không phải "+0")', async () => {
    const items = [makeItem(1, { quantity: 12.345678 }), makeItem(2, { quantity: 12.345678 })]
    const form = makeForm(items)
    route('get', FORM_URL, () => ok(form))
    const draft = draftFromForm(form)
    draft.lines[0] = { ...draft.lines[0]!, quantity: 12.345679, checked: true }
    await AsyncStorage.setItem(KEY, JSON.stringify(draft))
    await show()
    expect(screen.getByText('12,345679 bao')).toBeOnTheScreen()
    expect(screen.getByText('phiếu 12,345678 · +0,000001')).toBeOnTheScreen()
    expect(screen.getByText('12,345678 bao')).toBeOnTheScreen()
  })
})

describe('ReceiveScreen — quét mã trong phiếu', () => {
  it('phiếu Nháp: nút gốc "Quét mã" (type button, không phải menu) → /scan-line', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    const items = scanItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: 'button',
      icon: { type: 'sfSymbol', name: 'barcode.viewfinder' },
    })
    expect(rightItems().some((i) => i.type === 'menu')).toBe(false)
    await act(async () => (items[0] as { onPress: () => void }).onPress())
    expect(mockNavigate).toHaveBeenCalledWith('/scan-line')
  })

  it('phiếu không còn Nháp → không có nút quét', async () => {
    route('get', FORM_URL, () => ok(mockupForm({ status: 'CONFIRMED' })))
    await show()
    expect(scanItems()).toHaveLength(0)
  })

  it('thông báo của phiếu khác không hiện trên phiếu này', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    await act(async () => useScanNotice.getState().show('pn-khac', '8934563'))
    expect(screen.queryByTestId('receive-error')).toBeNull()
  })

  it('quét không khớp → thông báo mức phiếu, đóng được', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    await act(async () => useScanNotice.getState().show('pn-1', '8934563'))
    expect(
      within(screen.getByTestId('receive-error')).getByText(
        'Không tìm thấy vật tư có mã “8934563” trên phiếu này',
      ),
    ).toBeOnTheScreen()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' })))
    expect(screen.queryByTestId('receive-error')).toBeNull()
    expect(useScanNotice.getState().notice).toBeNull()
  })
})

describe('ReceiveScreen — bố cục mới (đầu phiếu, header Lưu, nút nổi đáy)', () => {
  const original = Platform.OS
  afterEach(() => {
    Platform.OS = original
    jest.mocked(isLiquidGlassAvailable).mockReturnValue(false)
    jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(false)
  })

  it('đang lọc "Khớp" mà phiếu thành Đã xác nhận (tải lại) → hiện đủ dòng, bộ lọc về "Tất cả"', async () => {
    const form = mockupForm()
    let serve = form
    route('get', FORM_URL, () => ok(serve))
    await seedMockupDraft(form)
    await show()
    await act(async () => fireEvent.press(tile('match')))
    expect(screen.queryByText('Vật tư 2')).toBeNull()
    serve = { ...form, version: 4, status: 'CONFIRMED' }
    await act(async () => {
      await client.refetchQueries({ queryKey: ['import-forms', 'wh-a', 'detail', 'pn-1'] })
    })
    await settled()
    expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen()
    expect(screen.getByText('Vật tư 2')).toBeOnTheScreen()
    expect(screen.queryByText('Không có dòng nào')).toBeNull()
    // Nếu phiếu lại hiện ô (vd mở lại thành Nháp) thì bộ lọc đã về "Tất cả".
    serve = { ...form, version: 5, status: 'DRAFT' }
    await act(async () => {
      await client.refetchQueries({ queryKey: ['import-forms', 'wh-a', 'detail', 'pn-1'] })
    })
    await settled()
    expect(tile('all')).toBeSelected()
  })

  it('hàng nút đáy không chặn chạm ở vùng trống (pointerEvents box-none)', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    const row = screen.getByTestId('receive-controls')
    expect(row.props.pointerEvents).toBe('box-none')
  })

  it('tổng tiền cập nhật ngay khi sửa số của một dòng nháp', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(screen.getByText('160.000 đ')).toBeOnTheScreen()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    expect(screen.getByText('159.000 đ')).toBeOnTheScreen()
  })

  it('nhãn trạng thái: Đã huỷ nền xám; Nháp nền vàng nhạt', async () => {
    route('get', FORM_URL, () => ok(mockupForm({ status: 'CANCELLED' })))
    await show()
    expect(screen.getByText('Đã huỷ')).toBeOnTheScreen()
    expect(screen.getByTestId('receive-status')).toHaveStyle({ backgroundColor: lightColors.fill })
    expect(queryTiles()).toHaveLength(0)
  })

  it('header "Lưu" → cùng luồng Lưu (hỏi lại rồi PATCH)', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    route('patch', FORM_URL, () => ok({ ...form, version: 4 }))
    await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    await pressHeaderSave()
    expect(confirmAction).toHaveBeenCalledTimes(1)
    expect(writes()).toHaveLength(0)
  })

  it('Android: header có nút chữ "Lưu" trước Quét mã và …', async () => {
    Platform.OS = 'android'
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    expect(mockHeader.options.unstable_headerRightItems).toBeUndefined()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 })
    })
    const header = mockHeader.options.headerRight!({ tintColor: undefined, canGoBack: true })
    const view = await render(<>{header}</>)
    const buttons = view.getAllByRole('button')
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual(['Lưu', 'Quét mã', 'Tuỳ chọn'])
    expect(view.getByText('Lưu')).toBeOnTheScreen()
  })

  it('Android: "Lưu" khoá khi đang gửi', async () => {
    const onPress = jest.fn()
    await render(
      <AndroidReceiveHeaderRight save={{ label: 'Đang lưu…', onPress, disabled: true }} />,
    )
    const save = screen.getByRole('button', { name: 'Đang lưu…' })
    expect(save).toBeDisabled()
    await fireEvent.press(save)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('nút "+" tròn: Liquid Glass KHÔNG tô màu khi có; không thì hình tròn nền thẻ', async () => {
    jest.mocked(isLiquidGlassAvailable).mockReturnValue(true)
    jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(true)
    route('get', FORM_URL, () => ok(mockupForm()))
    const view = await show()
    const glass = within(screen.getByRole('button', { name: 'Thêm' })).getByTestId('glass-view')
    expect(glass.props.isInteractive).toBe(true)
    expect(glass.props.tintColor).toBeUndefined()
    await view.unmount()

    jest.mocked(isLiquidGlassAvailable).mockReturnValue(false)
    await show()
    const add = screen.getByRole('button', { name: 'Thêm' })
    expect(within(add).queryByTestId('glass-view')).toBeNull()
    expect(within(add).getByTestId('glass-circle-fallback')).toHaveStyle({
      width: 48,
      height: 48,
      backgroundColor: lightColors.card,
    })
  })

  it('nút chính dạng viên thuốc 48pt: khoá = nền xám đặc (không mờ đi vì nổi trên danh sách)', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await seedMockupDraft(form)
    await show()
    const primary = screen.getByRole('button', { name: 'Còn 5 dòng chưa kiểm' })
    expect(primary).toBeDisabled()
    expect(primary).toHaveStyle({
      minHeight: 48,
      borderRadius: 24,
      backgroundColor: lightColors.fill,
    })
    expect(StyleSheet.flatten(primary.props.style).opacity ?? 1).toBe(1)
  })

  it('thanh đáy nổi: không nền/viền; danh sách chừa đáy theo chiều cao đo được', async () => {
    route('get', FORM_URL, () => ok(mockupForm()))
    await show()
    const dock = screen.getByTestId('receive-dock')
    expect(dock).toHaveStyle({ position: 'absolute', bottom: 0 })
    expect(StyleSheet.flatten(dock.props.style).backgroundColor).toBeUndefined()
    const pad = () =>
      StyleSheet.flatten(screen.getByTestId('receive-list').props.contentContainerStyle)
        .paddingBottom as number
    await act(async () =>
      fireEvent(screen.getByTestId('receive-dock-content'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 130 } },
      }),
    )
    expect(pad()).toBeGreaterThanOrEqual(130)
    await act(async () =>
      fireEvent(screen.getByTestId('receive-dock-content'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 60 } },
      }),
    )
    expect(pad()).toBeGreaterThanOrEqual(60)
    expect(pad()).toBeLessThan(130)
  })
})

describe('ReceiveScreen — cờ RECEIVE_CHECKLIST_ENABLED tắt ("Duyệt phiếu")', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/features/receive-checklist/model/flags').__setChecklistEnabled(false)
  })

  it('không vòng tròn / ô lọc / tiến độ; tiêu đề "Duyệt phiếu"; chạm dòng mở bảng sửa; [+] → /import-pick', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    // Chỉ có dấu kiểm cũ (từ lúc cờ còn bật), không sửa số.
    const old = draftFromForm(form)
    old.lines = old.lines.map((l) => ({ ...l, checked: true }))
    await AsyncStorage.setItem(KEY, JSON.stringify(old))
    await show()
    expect(mockHeader.options.title).toBe('Duyệt phiếu')
    expect(circles()).toHaveLength(0)
    expect(queryTiles()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /dòng chưa kiểm/ })).toBeNull()
    expect(screen.getAllByTestId(/^receive-row-/).length).toBeGreaterThan(0)
    await act(async () => fireEvent.press(screen.getByText('Vật tư 4')))
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/import-line',
      params: { key: 'm-4|u-4' },
    })
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Thêm' })))
    expect(mockNavigate).toHaveBeenCalledWith('/import-pick')
    // Dấu kiểm cũ trên máy không tính là thay đổi: không "Lưu", không "…".
    expect(saveItems()).toHaveLength(0)
    expect(moreItems()).toHaveLength(0)
  })

  it('"Xác nhận nhập kho" bật khi chưa tick gì; hỏi rồi POST confirm đúng một lần', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    route('post', `${FORM_URL}/confirm`, () => ok({ ...form, status: 'CONFIRMED', version: 4 }))
    jest.mocked(confirmAction).mockResolvedValue(true)
    await show()
    const button = screen.getByRole('button', { name: 'Xác nhận nhập kho' })
    expect(button).toBeEnabled()
    await act(async () => fireEvent.press(button))
    await settled()
    expect(confirmAction).toHaveBeenCalledTimes(1)
    expect(jest.mocked(confirmAction).mock.calls[0]![0].message).toContain(
      'Tồn kho sẽ được cộng ngay',
    )
    expect(callsTo('post', `${FORM_URL}/confirm`)).toHaveLength(1)
  })

  it('"Bỏ thay đổi trên máy": câu hỏi không nhắc "dấu đã kiểm"', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    await show()
    await act(async () => {
      useReceiveDraft.getState().updateLine('m-3|u-3', { quantity: 9 }, { check: false })
    })
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    await act(async () => (moreItems()[0] as { onPress: () => void }).onPress())
    const msg = jest.mocked(confirmAction).mock.calls[0]![0].message
    expect(msg).toContain('Số đã sửa trên máy này sẽ mất')
    expect(msg).not.toMatch(/dấu đã kiểm/)
  })

  it('huỷ hộp hỏi xác nhận → không gửi gì', async () => {
    const form = mockupForm()
    route('get', FORM_URL, () => ok(form))
    jest.mocked(confirmAction).mockResolvedValue(false)
    await show()
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Xác nhận nhập kho' })),
    )
    await settled()
    expect(confirmAction).toHaveBeenCalledTimes(1)
    expect(writes()).toHaveLength(0)
  })

  it('dòng mới thêm từ bộ chọn hiện trên màn; yêu cầu mở sheet dòng bị bỏ', async () => {
    const form = makeForm([makeItem(1), makeItem(2)])
    route('get', FORM_URL, () => ok(form))
    await show()
    await act(async () => {
      const store = useReceiveDraft.getState()
      const base = store.draft!.lines[0]!
      store.addLine({
        ...base,
        key: 'mx|ux',
        materialSlug: 'mx',
        materialName: 'Vật tư chọn thêm',
        base: null,
        checked: false,
      })
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/shared/lib/line-focus').useLineFocus.getState().ask('import', 'pn-1', 'mx|ux')
    })
    expect(screen.getByText('Vật tư chọn thêm')).toBeOnTheScreen()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('@/shared/lib/line-focus').useLineFocus.getState().request).toBeNull()
  })
})
