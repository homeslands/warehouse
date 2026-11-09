/**
 * Bước 3 "Xác nhận" của phiếu xuất trên cây route THẬT của expo-router (`renderRouter`): Stack gốc gồm
 * `(tabs)` (Stack tab Xuất: danh sách, màn xem — màn giả) và modal `export-form` (Stack lồng chứa ba
 * bước thật) — để kiểm cả điều hướng sau khi ghi (sau Gửi duyệt modal đóng, tab còn [danh sách, màn xem]).
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
import { StyleSheet, Text } from 'react-native'

import type { ExportForm } from '@/entities/export-form'
import { item as stockItem } from '@/entities/inventory/model/fixtures'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  exportDraftStorageKey,
  newExportDraft,
  stopExportDraftPersistence,
  useExportDraft,
} from '@/features/export-draft'
import { makeForm, makeItem, makeLine } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { lightColors } from '@/shared/theme/tokens'
import { headerConfigs, stubAndroidBack } from '@/shared/ui/testing/native-back'

import { ExportInfoStepScreen } from './ExportInfoStepScreen'
import { ExportItemsStepScreen } from './ExportItemsStepScreen'
import { ExportReviewStepScreen } from './ExportReviewStepScreen'

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

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const LIST_URL = '/warehouses/wh-a/export-forms'
const FORM_URL = `${LIST_URL}/px-1`
const STOCK_URL = '/warehouses/wh-a/materials'
const BATCH_URL = '/warehouses/wh-a/material-batches'
const NEW_KEY = exportDraftStorageKey('u', 'wh-a', 'new')
const ALL = [
  'EXPORT_FORM_READ',
  'EXPORT_FORM_CREATE',
  'EXPORT_FORM_UPDATE_DRAFT',
  'EXPORT_FORM_DELETE_DRAFT',
]

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
        name="export-form"
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
    </Stack>
  ),
  '(tabs)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/export/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/export/index': () => <Text>list</Text>,
  '(tabs)/export/[formSlug]/index': ViewScreen,
  'export-form/_layout': () => <Stack />,
  'export-form/[formSlug]/info': ExportInfoStepScreen,
  'export-form/[formSlug]/edit': ExportItemsStepScreen,
  'export-form/[formSlug]/review': ExportReviewStepScreen,
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
/** Stack của tab Xuất: mỗi route là `<tên>` hoặc `<tên>:<formSlug>`, chỉ các route đang hoạt động. */
const exportStack = (r: RenderRouterResult) => stackOf(r, 'export')
/** Stack của modal `export-form` (rỗng = modal đã đóng). */
const modalStack = (r: RenderRouterResult) => stackOf(r, 'export-form')
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
/** `renderRouter` bật fake timers: chạy hết hẹn giờ + promise (tải phiếu / tồn, ghi, điều hướng). */
async function settled() {
  await act(() => jest.runAllTimersAsync())
  for (let n = 0; n < 20 && client.isFetching() > 0; n++) {
    await act(() => jest.runAllTimersAsync())
  }
}

/** Mở Stack tab Xuất với các đường dẫn đẩy lần lượt (màn cuối là màn đang hiện). */
async function open(...paths: string[]) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const r = await renderRouter(ROUTES, { initialUrl: '/export', wrapper })
  for (const p of paths) {
    await act(() => router.push(p as never))
    await settled()
  }
  return r
}

/** Dòng 1 tự động 10 hộp × 1.000 đ; dòng 2 chọn lô b-2 (HSD 12/03/2027) 10 hộp × 1.000 đ. */
const form2 = (over: Partial<ExportForm> = {}) =>
  makeForm([makeItem(1), makeItem(2, { batchSlug: 'b-2', batchExpiryDate: '2027-03-12' })], {
    warehouseSlug: 'wh-a',
    ...over,
  })

const page = (items: unknown[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })

/** Tồn: m-1 còn `m1`, m-2 còn 100; lô b-2 còn `lot`. */
function stock(m1 = 90, lot = 50) {
  route('get', STOCK_URL, () =>
    page([
      stockItem({ materialSlug: 'm-1', availableQuantity: m1 }),
      stockItem({ materialSlug: 'm-2', availableQuantity: 100 }),
    ]),
  )
  route('get', BATCH_URL, () =>
    page([
      {
        slug: 'b-2',
        materialSlug: 'm-2',
        entryDate: '2026-10-05',
        expiryDate: '2027-03-12',
        availableQuantity: lot,
      },
    ]),
  )
}

const submitButton = () => screen.getByRole('button', { name: 'Gửi duyệt' })
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never)

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
  useExportDraft.getState().reset()
  useFormNotice.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope: ALL, warehouses: [WH] } as never,
  })
  jest.mocked(confirmAction).mockResolvedValue(true)
  jest.mocked(chooseAction).mockResolvedValue(null)
  stock()
})

/** Back phần cứng Android giả (xem `native-back.ts`) — test nào cần thì gán, dọn ở `afterEach`. */
let androidBack: ReturnType<typeof stubAndroidBack> | null = null

afterEach(() => {
  androidBack?.restore()
  androidBack = null
  mockHoldFinish = false
  stopExportDraftPersistence()
  useExportDraft.getState().reset()
  client.clear()
  jest.useRealTimers()
})

describe('ExportReviewStepScreen — phiếu đã có', () => {
  beforeEach(() => route('get', FORM_URL, () => ok(form2())))

  it('tóm tắt chỉ đọc: thanh bước 3, nhóm Thông tin, Vật tư · n (số × giá · lô), câu ghi chú, Tổng cộng', async () => {
    await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    expect(screen.getByLabelText('Bước 3 trên 3, Xác nhận, đang ở đây')).toBeSelected()
    // progress is inside the scroll content: vạch tiến độ là phần tử đầu của danh sách.
    expect(
      within(screen.getByTestId('export-review-list')).getByTestId('export-wizard-steps-3'),
    ).toBeOnTheScreen()
    const info = within(screen.getByTestId('export-review-info'))
    expect(info.getByText('Sản xuất')).toBeOnTheScreen()
    expect(info.getByText('PX-1')).toBeOnTheScreen()
    expect(info.getByText('PO-1')).toBeOnTheScreen()
    expect(info.getByText('Bếp A')).toBeOnTheScreen()
    expect(info.getByText('HD-1')).toBeOnTheScreen()
    expect(screen.getByText('Vật tư · 2')).toBeOnTheScreen()
    // Dòng vật tư = dòng đọc của bước 2 (tên + thành tiền / số × giá / mã · còn n · lô) nhưng KHÔNG
    // chevron, không bấm được.
    const row1 = screen.getByTestId('export-review-line-m-1|u-1|')
    const line1 = within(row1)
    expect(line1.getByText('Vật tư 1')).toBeOnTheScreen()
    expect(line1.getByText(/^10\.000\s?đ$/)).toBeOnTheScreen()
    expect(line1.getByText(/^10 hộp × 1\.000\sđ$/)).toBeOnTheScreen()
    expect(line1.getByText('VT1 · còn 90 hộp · Lô tự động')).toBeOnTheScreen()
    expect(line1.queryByText('›')).toBeNull()
    expect(row1.props.accessibilityRole).toBeUndefined()
    expect(row1.props.accessibilityLabel).toMatch(
      /^Vật tư 1, 10 hộp × 1\.000\s?đ, 10\.000\s?đ, VT1, còn 90 hộp, Lô tự động$/,
    )
    expect(
      within(screen.getByTestId('export-review-line-m-2|u-2|b-2')).getByText(
        'VT2 · còn 50 hộp · HSD 12/03/2027 · nhập 05/10',
      ),
    ).toBeOnTheScreen()
    expect(screen.queryAllByRole('button', { name: /^Vật tư \d/ })).toEqual([])
    expect(screen.getByTestId('export-review-footnote')).toHaveTextContent(
      'Gửi duyệt sẽ giữ hàng cho 2 dòng; 1 dòng lấy lô có HSD sớm nhất.',
    )
    expect(screen.getByTestId('export-review-total')).toHaveTextContent(/^Tổng cộng20\.000\s?đ$/)
    // Không có cảnh báo → không có khối "Lưu ý".
    expect(screen.queryByTestId('export-review-warnings')).toBeNull()
  })

  it('Gửi duyệt submits WITHOUT confirmAction', async () => {
    route('post', `${FORM_URL}/submit`, () => ok(form2({ version: 4, status: 'PENDING' })))
    await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    await fireEvent.press(submitButton())
    await settled()
    expect(confirmAction).not.toHaveBeenCalled()
    expect(callsTo('post', `${FORM_URL}/submit`)).toHaveLength(1)
    expect(useExportDraft.getState().draft).toBeNull()
  })

  it('Gửi duyệt xong, màn còn gắn trong lúc rời luồng → nút vẫn bận, tóm tắt giữ nguyên (không vòng quay tải) tới khi tháo màn', async () => {
    mockHoldFinish = true
    route('post', `${FORM_URL}/submit`, () => ok(form2({ version: 4, status: 'PENDING' })))
    await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    await fireEvent.press(submitButton())
    await settled()
    expect(mockFinish).toHaveBeenCalledWith('px-1')
    expect(useExportDraft.getState().draft).toBeNull()
    expect(submitButton()).toBeBusy()
    expect(submitButton()).toBeDisabled()
    expect(screen.getByTestId('export-review-list')).toBeOnTheScreen()
    expect(screen.getByTestId('export-review-total')).toHaveTextContent(/^Tổng cộng20\.000\s?đ$/)
  })

  it('after submit: view of the form is on top of the list, no wizard routes', async () => {
    route('post', `${FORM_URL}/submit`, () => ok(form2({ version: 4, status: 'PENDING' })))
    const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    await fireEvent.press(submitButton())
    await settled()
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    expectModalClosed(r)
    await act(() => router.back())
    expect(exportStack(r)).toEqual(['index'])
    expectModalClosed(r)
  })

  it('shortage on submit returns to step 2 and highlights the card', async () => {
    route('post', `${FORM_URL}/submit`, () => failure(409, 101502))
    // Dò lại khi lỗi: m-1 chỉ còn 4 (thiếu 6), lô b-2 còn 50 (đủ).
    const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    stock(4)
    await fireEvent.press(submitButton())
    await settled()
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    expect(modalStack(r)).toEqual(['[formSlug]/edit:px-1'])
    // Thông báo mức phiếu còn ở bước 2 (bước 2 vẫn gắn khi bước 3 rời đi).
    expect(
      within(screen.getByTestId('export-form-notice')).getByText(
        'Không đủ hàng cho 1 dòng — giảm số lượng hoặc đổi lô rồi gửi lại.',
      ),
    ).toBeOnTheScreen()
    const short = within(screen.getByTestId('export-line-m-1|u-1|')).getByText('Thiếu 6 hộp')
    expect(flat(short).color).toBe(lightColors.destructiveText)
    expect(
      within(screen.getByTestId('export-line-m-2|u-2|b-2')).queryByText(/Thiếu|Không đủ hàng/),
    ).toBeNull()
  })

  it('đang Gửi duyệt (request chưa về) → thanh bước + "Sửa" khoá, chạm không làm gì; xong → màn xem trên danh sách', async () => {
    let reply: (r: ReturnType<typeof ok>) => void = () => {}
    route('post', `${FORM_URL}/submit`, () => new Promise((resolve) => (reply = resolve)))
    const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    await fireEvent.press(submitButton())
    await settled()
    expect(useExportDraft.getState().saving).toBe(true)
    const step2 = screen.getByLabelText(/^Bước 2 trên 3, Vật tư/)
    expect(step2).toBeDisabled()
    await fireEvent.press(step2)
    await fireEvent.press(screen.getByRole('button', { name: 'Sửa Vật tư' }))
    await settled()
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    expect(modalStack(r)).toEqual(['[formSlug]/edit:px-1', '[formSlug]/review:px-1'])
    // Vuốt cạnh iOS tắt trên màn đang ghi (props của màn native).
    const top = screen.container.queryAll((n) => n.type === 'RNSScreen').at(-1)!
    expect(top.props.gestureEnabled).toBe(false)
    await act(async () => reply(ok(form2({ version: 4, status: 'PENDING' }))))
    await settled()
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    expectModalClosed(r)
  })

  it('thiếu hàng mà không dò ra dòng nào → vẫn về bước 2, câu chung, không tô thẻ', async () => {
    route('post', `${FORM_URL}/submit`, () => failure(409, 100817))
    const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    // Tồn dò lại đủ cho mọi dòng → không xác định được dòng thiếu.
    stock(500, 500)
    await fireEvent.press(submitButton())
    await settled()
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    expect(modalStack(r)).toEqual(['[formSlug]/edit:px-1'])
    expect(
      within(screen.getByTestId('export-form-notice')).getByText(
        'Kho không đủ hàng cho phiếu này — kiểm tra số lượng / lô đã chọn',
      ),
    ).toBeOnTheScreen()
    expect(screen.queryByText(/^Thiếu |Không đủ hàng|Lô chỉ còn/)).toBeNull()
  })

  it('Sửa buttons in group headers go to step 1 / 2', async () => {
    const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    // "Sửa" là chữ accent ở PHẢI tiêu đề nhóm (kiểu Cài đặt), mỗi nhóm một nút.
    const infoHeader = within(screen.getByTestId('export-review-info-header'))
    expect(infoHeader.getByRole('header')).toHaveTextContent('Thông tin')
    const editInfo = infoHeader.getByRole('button', { name: 'Sửa Thông tin' })
    expect(flat(within(editInfo).getByText('Sửa')).color).toBe(lightColors.accentText)
    const itemsHeader = within(screen.getByTestId('export-review-items-header'))
    expect(itemsHeader.getByRole('header')).toHaveTextContent('Vật tư · 2')
    expect(itemsHeader.getByRole('button', { name: 'Sửa Vật tư' })).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Sửa Vật tư' }))
    await settled()
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    expect(modalStack(r)).toEqual(['[formSlug]/edit:px-1'])
    await act(() => router.push('/export-form/px-1/review'))
    await settled()
    await fireEvent.press(screen.getByRole('button', { name: 'Sửa Thông tin' }))
    await settled()
    // Phiếu đã có mở ở bước 2: bước 1 thay các bước (back từ bước 1 về màn xem — spec §3.1).
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    expect(modalStack(r)).toEqual(['[formSlug]/info:px-1'])
  })

  it('chứng từ: không có file thì không có dòng', async () => {
    stock(90, 8)
    await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    expect(screen.queryByTestId('export-review-attachment')).toBeNull()
  })

  it('chứng từ: có file thì hiện dòng dưới nhóm Thông tin', async () => {
    route('get', FORM_URL, () =>
      ok(form2({ file: 'https://s3.example.com/f/phieu-1700000000000.pdf' })),
    )
    stock(90, 8)
    await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    expect(screen.getByTestId('export-review-attachment')).toBeOnTheScreen()
    expect(screen.getByText('phieu.pdf')).toBeOnTheScreen()
  })

  it('opening review with step 1 invalid redirects to step 1', async () => {
    route('get', FORM_URL, () => ok(form2({ receiver: '' })))
    const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    expect(modalStack(r)).toEqual(['[formSlug]/info:px-1'])
    expect(submitButton).toThrow()
  })

  it('Lưu ý is a footer text, not a card', async () => {
    route('get', FORM_URL, () =>
      ok(
        form2({
          items: [
            makeItem(1, { quantity: 120 }),
            makeItem(2, { batchSlug: 'b-2', batchExpiryDate: '2027-03-12', unitPrice: 0 }),
          ],
        }),
      ),
    )
    stock(90, 8)
    await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    // Chân nhóm Vật tư (trong danh sách, sau các dòng): chữ cam 13, KHÔNG nền / viền / tiêu đề riêng.
    const footer = within(screen.getByTestId('export-review-list')).getByTestId(
      'export-review-warnings',
    )
    const box = flat(footer)
    expect(box.backgroundColor).toBeUndefined()
    expect(box.borderWidth).toBeUndefined()
    expect(within(footer).queryByText('Lưu ý')).toBeNull()
    const zero = within(footer).getByText('1 dòng có đơn giá 0 đ')
    expect(flat(zero)).toMatchObject({ color: lightColors.warningText, fontSize: 13 })
    // Lô b-2 còn 8 < 10 → cũng vượt; m-1 còn 90 < 120.
    expect(
      within(footer).getByText('2 dòng vượt tồn hiện có: Vật tư 1, Vật tư 2'),
    ).toBeOnTheScreen()
    // Trình đọc màn hình vẫn nghe tiêu đề "Lưu ý".
    expect(footer.props.accessibilityLabel).toBe(
      'Lưu ý: 1 dòng có đơn giá 0 đ. 2 dòng vượt tồn hiện có: Vật tư 1, Vật tư 2',
    )
    // Dòng vượt tồn: "còn n" cam ở dòng 3 (như bước 2) thay cho chấm cam cũ.
    for (const [key, left] of [
      ['m-1|u-1|', 'còn 90 hộp'],
      ['m-2|u-2|b-2', 'còn 8 hộp'],
    ] as const) {
      const row = within(screen.getByTestId(`export-review-line-${key}`))
      expect(flat(row.getByText(left)).color).toBe(lightColors.warningText)
    }
    expect(screen.queryByTestId('export-review-line-m-1|u-1|-dot')).toBeNull()
    // Không chặn: vẫn gửi duyệt được.
    expect(submitButton()).toBeEnabled()
  })

  it('ghi chú của dòng → trích một dòng, mờ, cuối dòng 3', async () => {
    route('get', FORM_URL, () =>
      ok(form2({ items: [makeItem(1, { note: 'Giao trước 9h\nGọi anh Tâm' }), makeItem(2)] })),
    )
    await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    const row = within(screen.getByTestId('export-review-line-m-1|u-1|'))
    expect(row.getByText('VT1 · còn 90 hộp · Lô tự động · Giao trước 9h')).toBeOnTheScreen()
    expect(flat(row.getByText('Giao trước 9h')).color).toBe(lightColors.mutedForeground)
  })

  it('Gửi duyệt mà mã đã sửa trùng phiếu khác (PATCH 101404) → về bước 1, lỗi dưới ô Mã phiếu', async () => {
    route('patch', FORM_URL, () => failure(409, 101404))
    const r = await open('/export/px-1', '/export-form/px-1/edit', '/export-form/px-1/review')
    await act(async () => void useExportDraft.getState().setHeader({ code: 'PX-TRUNG' }))
    await fireEvent.press(submitButton())
    await settled()
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-1'])
    expect(modalStack(r)).toEqual(['[formSlug]/info:px-1'])
    expect(screen.getByText('Mã phiếu đã tồn tại.')).toBeOnTheScreen()
    expect(screen.queryByTestId('export-form-notice')).toBeNull()
    expect(callsTo('post', `${FORM_URL}/submit`)).toHaveLength(0)
  })
})

describe('ExportReviewStepScreen — phiếu mới', () => {
  /** Bản nháp phiếu mới trên máy: đầu phiếu đủ, một dòng 5 hộp × 2.000 đ. */
  async function storedNew(lines = [makeLine(1, { base: null, quantity: 5, unitPrice: 2000 })]) {
    const d = newExportDraft({ code: 'PX-MOI', purchaseOrder: 'PO-9', receiver: 'Tổ hàn A' })
    d.lines = lines
    await AsyncStorage.setItem(NEW_KEY, JSON.stringify(d))
  }
  const created = (over: Partial<ExportForm> = {}) =>
    makeForm([makeItem(1, { quantity: 5, unitPrice: 2000, amount: 10000 })], {
      slug: 'px-9',
      code: 'PX-MOI',
      version: 1,
      warehouseSlug: 'wh-a',
      ...over,
    })

  it('bước 3 (iOS): ⋯ là nút gốc thường mở action sheet (không UIMenu — chạm đóng menu có thể lọt xuống nút ghi); bước 2 vẫn menu gốc', async () => {
    await storedNew()
    await open('/export-form/new/info', '/export-form/new/edit', '/export-form/new/review')
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
      { label: 'Lưu nháp' },
      { label: 'Bỏ phiếu mới', destructive: true },
    ])
    // Huỷ action sheet → không gì xảy ra, không ghi.
    expect(confirmAction).not.toHaveBeenCalled()
    expect(callsTo('post', LIST_URL)).toHaveLength(0)
  })

  it('after submit: back at the list, no step of "new" left', async () => {
    await storedNew()
    route('post', LIST_URL, () => ok(created()))
    route('post', `${LIST_URL}/px-9/submit`, () => ok(created({ version: 2, status: 'PENDING' })))
    const r = await open(
      '/export-form/new/info',
      '/export-form/new/edit',
      '/export-form/new/review',
    )
    await fireEvent.press(submitButton())
    await settled()
    expect(confirmAction).not.toHaveBeenCalled()
    // Tạo phiếu mới xong → về danh sách (chốt 2026-11-08), không còn bước nào của 'new'.
    expect(exportStack(r)).toEqual(['index'])
    expectModalClosed(r)
  })

  it('POST xong mà gửi duyệt thiếu hàng → tab [danh sách, xem phiếu mới], modal [bước 2 của nó] + thông báo / tô thẻ ở đó', async () => {
    await storedNew()
    route('post', LIST_URL, () => ok(created()))
    route('get', `${LIST_URL}/px-9`, () => ok(created()))
    route('post', `${LIST_URL}/px-9/submit`, () => failure(409, 100817))
    const r = await open(
      '/export-form/new/info',
      '/export-form/new/edit',
      '/export-form/new/review',
    )
    stock(2)
    await fireEvent.press(submitButton())
    await settled()
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-9'])
    expect(modalStack(r)).toEqual(['[formSlug]/edit:px-9'])
    // Thông báo thuộc phiếu MỚI, còn sau khi các bước của 'new' rời đi.
    expect(
      within(screen.getByTestId('export-form-notice')).getByText(
        'Không đủ hàng cho 1 dòng — giảm số lượng hoặc đổi lô rồi gửi lại.',
      ),
    ).toBeOnTheScreen()
    expect(
      within(screen.getByTestId('export-line-m-1|u-1|')).getByText('Thiếu 3 hộp'),
    ).toBeOnTheScreen()
    // Back từ bước 2 (màn đầu modal) = đóng modal → màn xem của phiếu (như "Sửa phiếu").
    await act(() => router.back())
    expectModalClosed(r)
    expect(exportStack(r)).toEqual(['index', '[formSlug]/index:px-9'])
  })

  it('Gửi duyệt trùng mã (101404 của phiếu khác) → về bước 1, lỗi dưới ô Mã phiếu', async () => {
    await storedNew()
    route('post', LIST_URL, () => failure(409, 101404))
    route('get', LIST_URL, () => page([]))
    const r = await open(
      '/export-form/new/info',
      '/export-form/new/edit',
      '/export-form/new/review',
    )
    await fireEvent.press(submitButton())
    await settled()
    expect(exportStack(r)).toEqual(['index'])
    expect(modalStack(r)).toEqual(['[formSlug]/info:new'])
    expect(screen.getByText('Mã phiếu đã tồn tại.')).toBeOnTheScreen()
    expect(screen.queryByTestId('export-form-notice')).toBeNull()
  })

  it('đang Gửi duyệt phiếu mới: ‹ gốc + ✕ ẩn, back Android bị nuốt — Stack không đổi; ghi xong vẫn về danh sách', async () => {
    await storedNew()
    let reply: (r: ReturnType<typeof ok>) => void = () => {}
    route('post', LIST_URL, () => new Promise((resolve) => (reply = resolve)))
    route('post', `${LIST_URL}/px-9/submit`, () => ok(created({ version: 2, status: 'PENDING' })))
    androidBack = stubAndroidBack()
    const r = await open(
      '/export-form/new/info',
      '/export-form/new/edit',
      '/export-form/new/review',
    )
    const steps = ['[formSlug]/info:new', '[formSlug]/edit:new', '[formSlug]/review:new']
    // Header: [danh sách, bước 1, bước 2, bước 3]. Trước khi ghi: bước 3 có ‹ gốc, bước 1 có ✕.
    expect(shownHeaders().at(-1)!.hideBackButton).toBe(false)
    expect(shownHeaders()[1]!.headerLeftBarButtonItems?.map((i) => i.title)).toEqual(['Đóng'])
    await fireEvent.press(submitButton())
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
    // Luồng tự rời sau ghi vẫn chạy: về danh sách (phiếu mới).
    expect(exportStack(r)).toEqual(['index'])
    expectModalClosed(r)
  })

  it('mở thẳng bước 3 khi phiếu chưa có dòng (bước 2 chưa đủ) → về bước 2', async () => {
    await storedNew([])
    const r = await open('/export-form/new/review')
    expect(exportStack(r)).toEqual(['index'])
    expect(modalStack(r)).toEqual(['[formSlug]/edit:new'])
  })
})
