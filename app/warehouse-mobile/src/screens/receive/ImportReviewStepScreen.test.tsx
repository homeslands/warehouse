/**
 * Bước 3 "Xác nhận" của phiếu nhập trên cây route THẬT của expo-router (`renderRouter`): Stack gốc gồm
 * `(tabs)` (Stack tab Nhập: danh sách, màn xem — màn giả) và modal `import-form` (Stack lồng chứa ba
 * bước thật) — để kiểm cả điều hướng sau khi ghi (sau "Lưu phiếu nhập" modal đóng, tab còn [danh sách,
 * màn xem]).
 */
// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  within,
  type RenderRouterResult,
} from 'expo-router/testing-library'
import type { ReactNode } from 'react'
import { Alert, StyleSheet, Text } from 'react-native'

import type { ImportForm } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  draftStorageKey,
  newDraft,
  stopDraftPersistence,
  useReceiveDraft,
  type LocalLine,
} from '@/features/receive-checklist'
import { makeForm, makeItem, makeLine } from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { lightColors } from '@/shared/theme/tokens'
import { headerConfigs, stubAndroidBack } from '@/shared/ui/testing/native-back'

import { ImportInfoStepScreen } from './ImportInfoStepScreen'
import { ImportItemsStepScreen } from './ImportItemsStepScreen'
import { ImportReviewStepScreen } from './ImportReviewStepScreen'

jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))

/**
 * `mockHoldFinish` → `finish` của luồng (rời về màn xem sau ghi) chỉ được ghi lại, KHÔNG điều hướng: giữ
 * màn bước 3 còn gắn sau lần ghi thành công, như trên máy thật trong lúc Stack đang pop (trong jest màn
 * tháo ra ngay). Mặc định là `useWizardNav` thật.
 */
let mockHoldFinish = false
const mockFinish = jest.fn()
jest.mock('@/shared/lib/useWizardNav', () => {
  const actual = jest.requireActual('@/shared/lib/useWizardNav')
  const { useMemo } = jest.requireActual('react')
  return {
    ...actual,
    useWizardNav: (opts: unknown) => {
      const nav = actual.useWizardNav(opts)
      return useMemo(() => (mockHoldFinish ? { ...nav, finish: mockFinish } : nav), [nav])
    },
  }
})
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: (props: object) => <View testID="date-picker" {...props} />,
    DateTimePickerAndroid: { open: jest.fn() },
  }
})

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const LIST_URL = '/warehouses/wh-a/import-forms'
const FORM_URL = `${LIST_URL}/pn-1`
const NEW_KEY = draftStorageKey('u', 'wh-a', 'new')
const EDITOR = ['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT']

function ViewScreen() {
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  return <Text>{`view ${formSlug}`}</Text>
}

/** Header của Stack gốc / Stack `(tabs)` ẩn: chỉ màn tab và màn bước có header (như app thật). */
const ROUTES = {
  _layout: () => (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="import-form"
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
    </Stack>
  ),
  '(tabs)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/import/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/import/index': () => <Text>list</Text>,
  '(tabs)/import/[formSlug]/index': ViewScreen,
  'import-form/_layout': () => <Stack />,
  'import-form/[formSlug]/info': ImportInfoStepScreen,
  'import-form/[formSlug]/edit': ImportItemsStepScreen,
  'import-form/[formSlug]/review': ImportReviewStepScreen,
}

type StackRoute = { name: string; params?: { formSlug?: string }; state?: StackState }
type StackState = { index: number; routes: StackRoute[] }

const active = (s: StackState | undefined) => s?.routes.slice(0, s.index + 1) ?? []
/** Stack lồng dưới route tên `name` (đang hoạt động) trong cây. */
function findNested(s: StackState | undefined, name: string): StackState | undefined {
  for (const x of active(s).toReversed()) {
    if (x.name === name) return x.state
    const inner = findNested(x.state, name)
    if (inner) return inner
  }
  return undefined
}
const stackOf = (r: RenderRouterResult, name: string) =>
  active(findNested(r.getRouterState() as unknown as StackState, name)).map((x) =>
    x.params?.formSlug ? `${x.name}:${x.params.formSlug}` : x.name,
  )
/** Stack của tab Nhập: mỗi route là `<tên>` hoặc `<tên>:<formSlug>`, chỉ các route đang hoạt động. */
const importStack = (r: RenderRouterResult) => stackOf(r, 'import')
/** Stack của modal `import-form` (rỗng = modal đã đóng). */
const modalStack = (r: RenderRouterResult) => stackOf(r, 'import-form')
/** Tên các route đang hoạt động của Stack gốc (bỏ lớp `__root` của expo-router nếu có). */
const rootStack = (r: RenderRouterResult) => {
  const top = r.getRouterState() as unknown as StackState
  const root = top.routes[0]?.name === '__root' ? (top.routes[0].state as StackState) : top
  return active(root).map((x) => x.name)
}
/** Modal đã đóng: Stack modal rỗng và Stack gốc chỉ còn `(tabs)`. */
const expectModalClosed = (r: RenderRouterResult) => {
  expect(modalStack(r)).toEqual([])
  expect(rootStack(r)).toEqual(['(tabs)'])
}

/** Header đang hiện (bỏ header ẩn của Stack gốc / `(tabs)`): [danh sách, bước…]. */
const shownHeaders = () => headerConfigs().filter((c) => !(c as { hidden?: boolean }).hidden)

let client: QueryClient
/** `renderRouter` bật fake timers: chạy hết hẹn giờ + promise (tải phiếu, ghi, điều hướng). */
async function settled() {
  await act(() => jest.runAllTimersAsync())
  for (let n = 0; n < 20 && client.isFetching() > 0; n++) {
    await act(() => jest.runAllTimersAsync())
  }
}

/** Mở Stack tab Nhập với các đường dẫn đẩy lần lượt (màn cuối là màn đang hiện). */
async function open(...paths: string[]) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const r = await renderRouter(ROUTES, { initialUrl: '/import', wrapper })
  for (const p of paths) {
    await act(() => router.push(p as never))
    await settled()
  }
  return r
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

const page = (items: unknown[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 20, totalPages: 1, hasNext: false })

const saveButton = (name: string) => screen.getByRole('button', { name })
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never)
const store = () => useReceiveDraft.getState()

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
  notifyManager.setScheduler((callback) => callback())
})

afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)))

beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  store().reset()
  useFormNotice.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope: EDITOR, warehouses: [WH] } as never,
  })
  jest.mocked(confirmAction).mockResolvedValue(true)
  jest.mocked(chooseAction).mockResolvedValue(null)
})

/** Back phần cứng Android giả (xem `native-back.ts`) — test nào cần thì gán, dọn ở `afterEach`. */
let androidBack: ReturnType<typeof stubAndroidBack> | null = null

afterEach(() => {
  androidBack?.restore()
  androidBack = null
  mockHoldFinish = false
  stopDraftPersistence()
  store().reset()
  client.clear()
  jest.useRealTimers()
})

describe('ImportReviewStepScreen — phiếu đã có', () => {
  beforeEach(() => route('get', FORM_URL, () => ok(form2())))

  /** Sửa trên máy để phiếu có gì để lưu (dòng 1: 10 → 8). */
  const edit = () =>
    act(async () => void store().updateLine('m-1|u-1', { quantity: 8 }, { check: false }))

  it('tóm tắt chỉ đọc: thanh bước 3, nhóm Thông tin, Vật tư · n (số × giá · HSD), câu ghi chú, Tổng cộng', async () => {
    await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    expect(screen.getByLabelText('Bước 3 trên 3, Xác nhận, đang ở đây')).toBeSelected()
    // progress is inside the scroll content: vạch tiến độ là phần tử đầu của danh sách.
    expect(
      within(screen.getByTestId('import-review-list')).getByTestId('import-wizard-steps-3'),
    ).toBeOnTheScreen()
    const info = within(screen.getByTestId('import-review-info'))
    expect(info.getByText('Bên bán')).toBeOnTheScreen()
    expect(info.getByText('Hoà Phát')).toBeOnTheScreen()
    expect(info.getByText('HD-1')).toBeOnTheScreen()
    expect(info.getByText('04/11/2026')).toBeOnTheScreen()
    expect(info.getByText('PN-1')).toBeOnTheScreen()
    expect(info.getByText('PO-1')).toBeOnTheScreen()
    expect(screen.getByText('Vật tư · 2')).toBeOnTheScreen()
    // Dòng vật tư = dòng đọc của bước 2 nhưng không mũi tên, không bấm được.
    const row1 = screen.getByTestId('import-review-line-m-1|u-1')
    const line1 = within(row1)
    expect(line1.getByText('Vật tư 1')).toBeOnTheScreen()
    expect(line1.getByText(/^10\.000\s?đ$/)).toBeOnTheScreen()
    expect(line1.getByText(/^10 bao × 1\.000\sđ$/)).toBeOnTheScreen()
    expect(line1.getByText('VT1 · Không HSD')).toBeOnTheScreen()
    expect(line1.queryByText('›')).toBeNull()
    expect(row1.props.accessibilityRole).toBeUndefined()
    expect(screen.queryAllByRole('button', { name: /^Vật tư \d/ })).toEqual([])
    expect(screen.getByTestId('import-review-footnote')).toHaveTextContent(
      'Phiếu được lưu ở trạng thái Nháp; người có quyền sẽ kiểm hàng và xác nhận nhập kho.',
    )
    expect(screen.getByTestId('import-review-total')).toHaveTextContent(/^Tổng cộng20\.000\s?đ$/)
    expect(screen.queryByTestId('import-review-warnings')).toBeNull()
  })

  it('existing form unchanged: button disabled with Chưa có thay đổi', async () => {
    await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    expect(saveButton('Lưu nháp')).toBeDisabled()
    expect(screen.getByTestId('import-review-unchanged')).toHaveTextContent('Chưa có thay đổi')
    await edit()
    expect(saveButton('Lưu nháp')).toBeEnabled()
    expect(screen.queryByTestId('import-review-unchanged')).toBeNull()
  })

  it('Lưu phiếu: PATCH WITHOUT confirmAction → màn xem của phiếu trên danh sách', async () => {
    route('patch', FORM_URL, () => ok(form2({ version: 4 })))
    const r = await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    await edit()
    await fireEvent.press(saveButton('Lưu nháp'))
    await settled()
    expect(confirmAction).not.toHaveBeenCalled()
    expect(callsTo('patch', FORM_URL)).toHaveLength(1)
    // Sửa nháp có sẵn → Lưu: modal đóng, màn xem pn-1 ở đỉnh tab.
    expect(importStack(r)).toEqual(['index', '[formSlug]/index:pn-1'])
    expectModalClosed(r)
  })

  it('Lưu xong, màn còn gắn trong lúc rời luồng → nút vẫn bận, KHÔNG "Chưa có thay đổi", tóm tắt giữ nguyên tới khi tháo màn', async () => {
    mockHoldFinish = true
    route('patch', FORM_URL, () => ok(form2({ version: 4 })))
    await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    await edit()
    await fireEvent.press(saveButton('Lưu nháp'))
    await settled()
    expect(mockFinish).toHaveBeenCalledWith('pn-1')
    expect(saveButton('Lưu nháp')).toBeBusy()
    expect(saveButton('Lưu nháp')).toBeDisabled()
    expect(screen.queryByTestId('import-review-unchanged')).toBeNull()
    expect(screen.getByTestId('import-review-list')).toBeOnTheScreen()
  })

  it('lỗi mạng → thông báo mức phiếu ở đáy bước 3, ở lại', async () => {
    route('patch', FORM_URL, () => 'network')
    const r = await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    await edit()
    await fireEvent.press(saveButton('Lưu nháp'))
    await settled()
    expect(
      within(screen.getByTestId('import-form-notice')).getByText('Không kết nối được máy chủ'),
    ).toBeOnTheScreen()
    expect(screen.queryByTestId('import-screen-notice')).toBeNull()
    expect(modalStack(r).at(-1)).toBe('[formSlug]/review:pn-1')
    expect(saveButton('Lưu nháp')).toBeEnabled()
  })

  it('đổi mã trùng phiếu khác (PATCH 101304) → về bước 1, lỗi dưới ô Mã phiếu', async () => {
    route('patch', FORM_URL, () => failure(409, 101304))
    const r = await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    await act(async () => void store().setHeader({ code: 'PN-TRUNG' }))
    await fireEvent.press(saveButton('Lưu nháp'))
    await settled()
    expect(importStack(r)).toEqual(['index', '[formSlug]/index:pn-1'])
    expect(modalStack(r)).toEqual(['[formSlug]/info:pn-1'])
    expect(screen.getByText('Mã phiếu đã tồn tại')).toBeOnTheScreen()
    expect(screen.queryByTestId('import-form-notice')).toBeNull()
  })

  it('đang ghi (request chưa về) → nút, "Sửa", thanh bước khoá, vuốt cạnh tắt; xong → màn xem trên danh sách', async () => {
    let reply: (r: ReturnType<typeof ok>) => void = () => {}
    route('patch', FORM_URL, () => new Promise((resolve) => (reply = resolve)))
    const r = await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    await edit()
    await fireEvent.press(saveButton('Lưu nháp'))
    await settled()
    expect(store().saving).toBe(true)
    expect(saveButton('Lưu nháp')).toBeDisabled()
    const step2 = screen.getByLabelText(/^Bước 2 trên 3, Vật tư/)
    expect(step2).toBeDisabled()
    await fireEvent.press(step2)
    await fireEvent.press(screen.getByRole('button', { name: 'Sửa Vật tư' }))
    await settled()
    expect(modalStack(r).at(-1)).toBe('[formSlug]/review:pn-1')
    const top = screen.container.queryAll((n) => n.type === 'RNSScreen').at(-1)!
    expect(top.props.gestureEnabled).toBe(false)
    await act(async () => reply(ok(form2({ version: 4 }))))
    await settled()
    expect(importStack(r)).toEqual(['index', '[formSlug]/index:pn-1'])
    expectModalClosed(r)
  })

  it('Sửa buttons in group headers go to step 1 / 2', async () => {
    const r = await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    // "Sửa" là chữ accent ở PHẢI tiêu đề nhóm (kiểu Cài đặt), mỗi nhóm một nút.
    const infoHeader = within(screen.getByTestId('import-review-info-header'))
    expect(infoHeader.getByRole('header')).toHaveTextContent('Thông tin')
    const editInfo = infoHeader.getByRole('button', { name: 'Sửa Thông tin' })
    expect(flat(within(editInfo).getByText('Sửa')).color).toBe(lightColors.accentText)
    const itemsHeader = within(screen.getByTestId('import-review-items-header'))
    expect(itemsHeader.getByRole('header')).toHaveTextContent('Vật tư · 2')
    expect(itemsHeader.getByRole('button', { name: 'Sửa Vật tư' })).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Sửa Vật tư' }))
    await settled()
    expect(modalStack(r)).toEqual(['[formSlug]/edit:pn-1'])
    await act(() => router.push('/import-form/pn-1/review'))
    await settled()
    await fireEvent.press(screen.getByRole('button', { name: 'Sửa Thông tin' }))
    await settled()
    expect(modalStack(r)).toEqual(['[formSlug]/info:pn-1'])
    expect(importStack(r)).toEqual(['index', '[formSlug]/index:pn-1'])
  })

  it('opening review with step 2 invalid redirects to step 2', async () => {
    route('get', FORM_URL, () => ok(form2({ items: [makeItem(1, { quantity: 0 })] })))
    const r = await open('/import/pn-1', '/import-form/pn-1/review')
    expect(modalStack(r)).toEqual(['[formSlug]/edit:pn-1'])
    expect(() => saveButton('Lưu nháp')).toThrow()
  })

  it('chứng từ: không có file thì không có dòng', async () => {
    await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    expect(screen.queryByTestId('import-review-attachment')).toBeNull()
  })

  it('chứng từ: có file thì hiện dòng dưới nhóm Thông tin', async () => {
    route('get', FORM_URL, () =>
      ok(form2({ file: 'https://s3.example.com/f/hoa-don-1700000000000.pdf' })),
    )
    await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    expect(screen.getByTestId('import-review-attachment')).toBeOnTheScreen()
    expect(screen.getByText('hoa-don.pdf')).toBeOnTheScreen()
  })

  it('mở review khi bước 1 thiếu (Số HĐ trống) → về bước 1', async () => {
    route('get', FORM_URL, () => ok(form2({ invoiceCode: '' })))
    const r = await open('/import/pn-1', '/import-form/pn-1/review')
    expect(modalStack(r)).toEqual(['[formSlug]/info:pn-1'])
  })

  it('Lưu ý is a footer text, not a card', async () => {
    route('get', FORM_URL, () =>
      ok(
        form2({
          items: [
            makeItem(1, { note: 'Thùng móp góc\nđã chụp ảnh' }),
            makeItem(2, { unitPrice: 0, amount: 0 }),
          ],
        }),
      ),
    )
    await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
    // Chân nhóm Vật tư (trong danh sách, sau các dòng): chữ cam 13, KHÔNG nền / viền / tiêu đề riêng.
    const footer = within(screen.getByTestId('import-review-list')).getByTestId(
      'import-review-warnings',
    )
    const box = flat(footer)
    expect(box.backgroundColor).toBeUndefined()
    expect(box.borderWidth).toBeUndefined()
    expect(within(footer).queryByText('Lưu ý')).toBeNull()
    expect(flat(within(footer).getByText('1 dòng có đơn giá 0 đ'))).toMatchObject({
      color: lightColors.warningText,
      fontSize: 13,
    })
    expect(footer.props.accessibilityLabel).toBe('Lưu ý: 1 dòng có đơn giá 0 đ')
    // Dòng giá 0: "10 bao · Chưa có giá" xám như bước 2 (không còn chấm cam).
    const zero = within(screen.getByTestId('import-review-line-m-2|u-2'))
    expect(flat(zero.getByText('10 bao · Chưa có giá')).color).toBe(lightColors.mutedForeground)
    expect(screen.queryByTestId('import-review-line-m-2|u-2-dot')).toBeNull()
    // Ghi chú của dòng → trích một dòng, mờ, cuối dòng 3.
    const noted = within(screen.getByTestId('import-review-line-m-1|u-1'))
    expect(noted.getByText('VT1 · Không HSD · Thùng móp góc')).toBeOnTheScreen()
    expect(flat(noted.getByText('Thùng móp góc')).color).toBe(lightColors.mutedForeground)
  })

  describe('Lưu & xác nhận (IMPORT_FORM_CONFIRM)', () => {
    const CONFIRM_URL = `${FORM_URL}/confirm`
    beforeEach(() =>
      useAuthStore.setState({
        user: {
          userSlug: 'u',
          userName: 'an',
          scope: [...EDITOR, 'IMPORT_FORM_CONFIRM'],
          warehouses: [WH],
        } as never,
      }),
    )

    it('không có quyền xác nhận → chỉ "Lưu nháp"', async () => {
      useAuthStore.setState({
        user: { userSlug: 'u', userName: 'an', scope: EDITOR, warehouses: [WH] } as never,
      })
      await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
      expect(screen.queryByRole('button', { name: 'Lưu & xác nhận' })).toBeNull()
      expect(saveButton('Lưu nháp')).toBeOnTheScreen()
    })

    it('chưa đổi gì: "Lưu nháp" khoá nhưng "Lưu & xác nhận" bấm được → hỏi lại → chỉ POST /confirm (không PATCH) → màn xem', async () => {
      route('post', CONFIRM_URL, () => ok(form2({ status: 'CONFIRMED', version: 4 })))
      const r = await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
      expect(saveButton('Lưu nháp')).toBeDisabled()
      expect(screen.getByTestId('import-review-footnote')).toHaveTextContent(/Lưu & xác nhận/)
      await fireEvent.press(saveButton('Lưu & xác nhận'))
      await settled()
      expect(jest.mocked(confirmAction).mock.calls.at(-1)![0]).toMatchObject({
        title: 'Xác nhận nhập kho PN-1?',
        message: expect.stringContaining('Tồn kho sẽ được cộng ngay'),
      })
      expect(callsTo('patch', FORM_URL)).toHaveLength(0)
      expect(callsTo('post', CONFIRM_URL)).toHaveLength(1)
      expect(importStack(r)).toEqual(['index', '[formSlug]/index:pn-1'])
      expectModalClosed(r)
      expect(store().draft).toBeNull()
    })

    it('đã sửa: hỏi lại → PATCH rồi POST /confirm với version mới', async () => {
      route('patch', FORM_URL, () => ok(form2({ version: 4 })))
      const versions: unknown[] = []
      route('post', CONFIRM_URL, (c) => {
        versions.push((JSON.parse(c.data as string) as { version: number }).version)
        return ok(form2({ status: 'CONFIRMED', version: 5 }))
      })
      await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
      await edit()
      await fireEvent.press(saveButton('Lưu & xác nhận'))
      await settled()
      expect(callsTo('patch', FORM_URL)).toHaveLength(1)
      expect(versions).toEqual([4])
    })

    it('huỷ hộp hỏi → không ghi gì, ở lại bước 3', async () => {
      jest.mocked(confirmAction).mockResolvedValueOnce(false)
      const r = await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
      await edit()
      await fireEvent.press(saveButton('Lưu & xác nhận'))
      await settled()
      expect(callsTo('patch', FORM_URL)).toHaveLength(0)
      expect(callsTo('post', CONFIRM_URL)).toHaveLength(0)
      expect(modalStack(r).at(-1)).toBe('[formSlug]/review:pn-1')
      expect(saveButton('Lưu & xác nhận')).toBeEnabled()
    })

    it('đã lưu nhưng xác nhận lỗi → báo "Đã lưu nhưng chưa xác nhận…", ở lại bước 3', async () => {
      // Server thật: sau PATCH, GET trả version mới (app tải lại phiếu khi xác nhận lỗi).
      let version = 3
      route('get', FORM_URL, () => ok(form2({ version })))
      route('patch', FORM_URL, () => {
        version = 4
        return ok(form2({ version }))
      })
      route('post', CONFIRM_URL, () => failure(500))
      await open('/import/pn-1', '/import-form/pn-1/edit', '/import-form/pn-1/review')
      await edit()
      await fireEvent.press(saveButton('Lưu & xác nhận'))
      await settled()
      expect(screen.getByTestId('import-form-notice')).toHaveTextContent(
        /Đã lưu nhưng chưa xác nhận được/,
      )
      expect(store().draft?.version).toBe(4)
    })
  })
})

describe('ImportReviewStepScreen — phiếu mới', () => {
  /** Bản nháp phiếu mới trên máy: đầu phiếu đủ, một dòng 5 bao × 2.000 đ. */
  async function storedNew(
    lines: LocalLine[] = [makeLine(1, { base: null, quantity: 5, unitPrice: 2000 })],
  ) {
    const d = newDraft({
      code: 'PN-MOI',
      invoiceCode: 'HD-9',
      date: '2026-11-04',
      purchaseOrder: null,
      note: null,
      supplierSlug: null,
    })
    d.lines = lines
    await AsyncStorage.setItem(NEW_KEY, JSON.stringify(d))
  }
  const created = (over: Partial<ImportForm> = {}) =>
    makeForm([makeItem(1, { quantity: 5, unitPrice: 2000, amount: 10000 })], {
      slug: 'pn-9',
      code: 'PN-MOI',
      invoiceCode: 'HD-9',
      version: 1,
      warehouseSlug: 'wh-a',
      requesterSlug: 'u',
      ...over,
    })

  it('bước 3 (iOS): ⋯ là nút gốc thường mở action sheet (không UIMenu — chạm đóng menu có thể lọt xuống nút ghi); bước 2 vẫn menu gốc', async () => {
    await storedNew()
    await open('/import-form/new/info', '/import-form/new/edit', '/import-form/new/review')
    type NativeItem = { type?: string; title?: string; sfSymbolName?: string; buttonId?: string }
    const configs = screen.container.queryAll(
      (n) => n.type === 'RNSScreenStackHeaderConfig' && !n.props.hidden,
    )
    const rightOf = (c: (typeof configs)[number]) =>
      (c.props.headerRightBarButtonItems ?? []) as NativeItem[]
    // Bước 2 (màn dưới) giữ UIMenu gốc.
    expect(rightOf(configs.at(-2)!).map((i) => i.type)).toContain('menu')
    const review = configs.at(-1)!
    const right = rightOf(review)
    expect(right.map((i) => [i.type, i.title, i.sfSymbolName])).toEqual([
      ['button', 'Tuỳ chọn', 'ellipsis'],
    ])
    await fireEvent(review, 'pressHeaderBarButtonItem', {
      nativeEvent: { buttonId: right[0]!.buttonId },
    })
    await settled()
    expect(jest.mocked(chooseAction)).toHaveBeenCalledTimes(1)
    expect(jest.mocked(chooseAction).mock.calls[0]![0].actions).toEqual([
      { label: 'Bỏ phiếu mới', destructive: true },
    ])
    // Huỷ action sheet → không gì xảy ra, không ghi.
    expect(confirmAction).not.toHaveBeenCalled()
    expect(callsTo('post', LIST_URL)).toHaveLength(0)
  })

  it('Lưu phiếu nhập saves WITHOUT confirmAction and ends at the list', async () => {
    await storedNew()
    route('post', LIST_URL, () => ok(created()))
    const r = await open(
      '/import-form/new/info',
      '/import-form/new/edit',
      '/import-form/new/review',
    )
    expect(saveButton('Lưu nháp')).toBeEnabled()
    expect(screen.queryByTestId('import-review-unchanged')).toBeNull()
    await fireEvent.press(saveButton('Lưu nháp'))
    await settled()
    expect(confirmAction).not.toHaveBeenCalled()
    expect(callsTo('post', LIST_URL)).toHaveLength(1)
    // Tạo phiếu mới xong → về danh sách (chốt 2026-11-08), modal đóng.
    expect(importStack(r)).toEqual(['index'])
    expectModalClosed(r)
  })

  it('đang Lưu phiếu nhập mới: ‹ gốc + ✕ ẩn, back Android bị nuốt — Stack không đổi; ghi xong vẫn về danh sách', async () => {
    await storedNew()
    let reply: (r: ReturnType<typeof ok>) => void = () => {}
    route('post', LIST_URL, () => new Promise((resolve) => (reply = resolve)))
    androidBack = stubAndroidBack()
    const r = await open(
      '/import-form/new/info',
      '/import-form/new/edit',
      '/import-form/new/review',
    )
    const steps = ['[formSlug]/info:new', '[formSlug]/edit:new', '[formSlug]/review:new']
    // Header: [danh sách, bước 1, bước 2, bước 3]. Trước khi ghi: bước 3 có ‹ gốc, bước 1 có ✕.
    expect(shownHeaders()).toHaveLength(4)
    expect(shownHeaders().at(-1)!.hideBackButton).toBe(false)
    expect(shownHeaders()[1]!.headerLeftBarButtonItems?.map((i) => i.title)).toEqual(['Đóng'])
    await fireEvent.press(saveButton('Lưu nháp'))
    await settled()
    expect(callsTo('post', LIST_URL)).toHaveLength(1)
    // Đang ghi: mọi bước ẩn ‹ gốc, không còn ✕ nào.
    for (const c of shownHeaders().slice(1)) {
      expect(c.hideBackButton).toBe(true)
      expect(c.headerLeftBarButtonItems ?? []).toEqual([])
    }
    // Back phần cứng Android: đã xử lý (không thoát app), Stack không đổi.
    expect(await androidBack.press()).toBe(true)
    await settled()
    expect(modalStack(r)).toEqual(steps)
    await act(async () => reply(ok(created())))
    await settled()
    // Luồng tự rời sau ghi vẫn chạy: modal đóng, về danh sách (phiếu mới).
    expect(importStack(r)).toEqual(['index'])
    expectModalClosed(r)
  })

  it('code taken goes back to step 1 with the error under Mã phiếu', async () => {
    await storedNew()
    route('post', LIST_URL, () => failure(409, 101304))
    route('get', LIST_URL, () => page([]))
    const r = await open(
      '/import-form/new/info',
      '/import-form/new/edit',
      '/import-form/new/review',
    )
    await fireEvent.press(saveButton('Lưu nháp'))
    await settled()
    expect(importStack(r)).toEqual(['index'])
    expect(modalStack(r)).toEqual(['[formSlug]/info:new'])
    expect(screen.getByText('Mã phiếu đã tồn tại')).toBeOnTheScreen()
    expect(screen.queryByTestId('import-form-notice')).toBeNull()
    expect(store().ctx?.formSlug).toBe('new')
  })

  it('trùng mã vì lần Lưu trước đã tạo phiếu (của mình) → tab [danh sách, xem phiếu đó], modal [bước 2 của phiếu đó] + báo ở đó', async () => {
    await storedNew()
    route('post', LIST_URL, () => failure(409, 101304))
    route('get', LIST_URL, () => page([{ ...created(), items: undefined }]))
    route('get', `${LIST_URL}/pn-9`, () => ok(created()))
    const r = await open(
      '/import-form/new/info',
      '/import-form/new/edit',
      '/import-form/new/review',
    )
    await fireEvent.press(saveButton('Lưu nháp'))
    await settled()
    expect(callsTo('post', LIST_URL)).toHaveLength(1)
    expect(importStack(r)).toEqual(['index', '[formSlug]/index:pn-9'])
    expect(modalStack(r)).toEqual(['[formSlug]/edit:pn-9'])
    expect(
      within(screen.getByTestId('import-form-notice')).getByText(
        'Phiếu PN-MOI đã được tạo ở lần Lưu trước (bị ngắt) — đã mở lại phiếu đó.',
      ),
    ).toBeOnTheScreen()
    // Bước 2 là màn đầu modal: lùi = đóng modal → màn xem pn-9.
    await act(() => router.back())
    expectModalClosed(r)
    expect(importStack(r)).toEqual(['index', '[formSlug]/index:pn-9'])
  })

  it('mở thẳng bước 3 khi phiếu chưa có dòng (bước 2 chưa đủ) → về bước 2', async () => {
    await storedNew([])
    const r = await open('/import-form/new/review')
    expect(importStack(r)).toEqual(['index'])
    expect(modalStack(r)).toEqual(['[formSlug]/edit:new'])
  })

  describe('Lưu & xác nhận (IMPORT_FORM_CONFIRM)', () => {
    const CONFIRM_URL = `${LIST_URL}/pn-9/confirm`
    beforeEach(() =>
      useAuthStore.setState({
        user: {
          userSlug: 'u',
          userName: 'an',
          scope: [...EDITOR, 'IMPORT_FORM_CONFIRM'],
          warehouses: [WH],
        } as never,
      }),
    )

    it('hỏi lại TRƯỚC khi ghi; đồng ý → POST tạo rồi POST /confirm (version của phiếu vừa tạo) → danh sách, bỏ bản nháp', async () => {
      await storedNew()
      route('post', LIST_URL, () => ok(created()))
      const versions: unknown[] = []
      route('post', CONFIRM_URL, (c) => {
        versions.push((JSON.parse(c.data as string) as { version: number }).version)
        return ok(created({ status: 'CONFIRMED', version: 2 }))
      })
      const r = await open(
        '/import-form/new/info',
        '/import-form/new/edit',
        '/import-form/new/review',
      )
      await fireEvent.press(saveButton('Lưu & xác nhận'))
      await settled()
      expect(confirmAction).toHaveBeenCalledTimes(1)
      expect(jest.mocked(confirmAction).mock.calls[0]![0].message).toMatch(
        /Tồn kho sẽ được cộng ngay/,
      )
      expect(callsTo('post', LIST_URL)).toHaveLength(1)
      expect(versions).toEqual([1])
      expect(importStack(r)).toEqual(['index'])
      expectModalClosed(r)
      expect(store().draft).toBeNull()
    })

    it('huỷ hộp hỏi → không tạo phiếu', async () => {
      await storedNew()
      jest.mocked(confirmAction).mockResolvedValueOnce(false)
      route('post', LIST_URL, () => ok(created()))
      await open('/import-form/new/info', '/import-form/new/edit', '/import-form/new/review')
      await fireEvent.press(saveButton('Lưu & xác nhận'))
      await settled()
      expect(callsTo('post', LIST_URL)).toHaveLength(0)
      expect(callsTo('post', CONFIRM_URL)).toHaveLength(0)
    })

    it('tạo xong mà xác nhận lỗi → phiếu vẫn Nháp: về danh sách + hộp thoại "Đã lưu nhưng chưa xác nhận…"', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
      await storedNew()
      route('post', LIST_URL, () => ok(created()))
      route('post', CONFIRM_URL, () => failure(500))
      const r = await open(
        '/import-form/new/info',
        '/import-form/new/edit',
        '/import-form/new/review',
      )
      await fireEvent.press(saveButton('Lưu & xác nhận'))
      await settled()
      expect(importStack(r)).toEqual(['index'])
      expectModalClosed(r)
      // Hộp thoại gốc (màn xem không đọc thông báo mức phiếu); không để lại thông báo cũ cho phiếu.
      expect(alert).toHaveBeenCalledWith(
        'Chưa xác nhận nhập kho',
        expect.stringMatching(/Đã lưu nhưng chưa xác nhận được/),
      )
      expect(useFormNotice.getState().notice).toBeNull()
      // Bản nháp giữ lại (đã chuyển sang phiếu vừa tạo).
      expect(store().ctx?.formSlug).toBe('pn-9')
    })
  })
})
