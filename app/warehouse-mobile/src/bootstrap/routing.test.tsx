/**
 * Định tuyến thật: `renderRouter('./app')` nạp đúng thư mục route của app (layout gốc + Providers +
 * SessionGate). File này KHÔNG nằm trong `app/`: mọi file trong đó đều bị Expo Router coi là route
 * (docs `router/reference/testing`).
 */
// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, profile, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ActionSheetIOS, Platform } from 'react-native'
import { router } from 'expo-router'
import { StackActions } from 'expo-router/react-navigation'
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library'

import { bootstrapSession, useAuthStore } from '@/entities/session'
import { item } from '@/entities/inventory/model/fixtures'
import { useWarehouseStore } from '@/entities/warehouse'
import { useExportDraft } from '@/features/export-draft'
import {
  makeDraft as makeExportDraft,
  makeLine as makeExportLine,
} from '@/features/export-draft/model/fixtures'
import { useReceiveDraft } from '@/features/receive-checklist'
import { makeDraft, makeLine } from '@/features/receive-checklist/model/fixtures'
import { useExportListFilter } from '@/screens/export-list'
import { useImportListFilter } from '@/screens/import-list'
import { useStockFilter } from '@/screens/stock'
import { queryClient } from './providers'
import { clearTokens, setTokens } from '@/shared/api/token-storage'
import { useLineFocus } from '@/shared/lib/line-focus'
import { kv } from '@/shared/storage/kv'

const WH1 = { slug: 'wh-1', code: 'WH1', name: 'Kho Tổng', isManager: true }
const WH2 = { slug: 'wh-2', code: 'WH2', name: 'Kho Thủ Đức', isManager: false }
const ALL = ['IMPORT_FORM_READ', 'EXPORT_FORM_READ', 'MATERIAL_READ', 'WAREHOUSE_READ']
/** Xác nhận được → màn phiếu là checklist "Kiểm hàng" (không có thì "Sửa phiếu" / chỉ xem). */
const CHECKER = [...ALL, 'IMPORT_FORM_CONFIRM']

/** Đã đăng nhập từ lần mở trước: có token, `/auth/me` trả `user`. */
function signedIn(user: object) {
  setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
  route('get', '/auth/me', () => ok(profile(user)))
}

/** Tồn kho của `wh-1`: 2 vật tư, 2 loại. */
function stockOfWh1() {
  route('get', '/warehouses/wh-1/materials', () =>
    ok({
      items: [
        item({ slug: 'i-1', materialSlug: 'xi-mang', materialName: 'Xi măng PCB40' }),
        item({
          slug: 'i-2',
          materialSlug: 'son',
          materialName: 'Sơn Dulux',
          materialCode: 'VT-SN',
          typeSlug: 'son',
          typeName: 'Sơn',
        }),
      ],
      total: 2,
      page: 1,
      pageSize: 100,
      totalPages: 1,
      hasNext: false,
      hasPrevios: false,
    }),
  )
  route('get', '/warehouses/wh-1/material-batches', () =>
    ok({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 0,
      hasNext: false,
      hasPrevios: false,
    }),
  )
}

/** Phiếu nhập của kho: tab Nhập (mặc định) tải danh sách ngay khi mở. */
function importFormsOf(wh: string, items: object[] = []) {
  route('get', `/warehouses/${wh}/import-forms`, () =>
    ok({
      items,
      total: items.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasNext: false,
      hasPrevios: false,
    }),
  )
}

/** Phiếu xuất của kho: tab Xuất tải danh sách ngay khi mở. */
function exportFormsOf(wh: string, items: object[] = []) {
  route('get', `/warehouses/${wh}/export-forms`, () =>
    ok({
      items,
      total: items.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    }),
  )
}

type Node = ReturnType<typeof screen.getByTestId>

/** Các tab đang có trên thanh tab gốc (NativeTabs): nhãn + testID. Tab bị ẩn không còn trong cây. */
function tabBar() {
  return screen.container
    .queryAll((n) => n.type === 'RNSTabsScreenIOS')
    .map((n) => ({ title: n.props.title as string, testID: n.props.tabBarItemTestID as string }))
}

/** Màn của một tab (theo nhãn tab). Tab đã mở vẫn nằm trong cây khi sang tab khác. */
function tabScreen(title: string): Node {
  const node = screen.container.queryAll(
    (n) => n.type === 'RNSTabsScreenIOS' && n.props.title === title,
  )[0]
  if (!node) throw new Error(`Không có tab "${title}"`)
  return node
}

/** Header native (RN Screens) đang hiện trong `root`: tiêu đề và có phải tiêu đề lớn không. */
function nativeHeaders(root: Node = screen.container) {
  return root
    .queryAll((n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false)
    .map((n) => ({ title: n.props.title as string, largeTitle: !!n.props.largeTitle }))
}

/** Nút kho (mục PHẢI ngoài cùng của thanh) trong `root`. */
const warehouseButtons = (root: Node = screen.container) =>
  within(root).queryAllByRole('button', { name: /^Kho: / })

async function go(href: string) {
  await act(async () => router.navigate(href as never))
  await act(() => jest.runAllTimersAsync())
}

/** Chọn mục `title` trong menu native bên phải header (iOS: UIMenu của RN Screens). */
async function pressHeaderMenuItem(root: Node, title: string) {
  const config = root.queryAll(
    (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
  )[0]
  type MenuNode = {
    title?: string
    menuId?: string
    items?: MenuNode[]
    menu?: { items: MenuNode[] }
  }
  const find = (nodes: MenuNode[]): MenuNode | undefined => {
    for (const n of nodes) {
      if (n.title === title && n.menuId) return n
      const inner = find(n.items ?? n.menu?.items ?? [])
      if (inner) return inner
    }
    return undefined
  }
  const hit = find(config.props.headerRightBarButtonItems ?? [])
  if (!hit) throw new Error(`Không có mục menu "${title}"`)
  await fireEvent(config, 'pressHeaderBarButtonMenuItem', { nativeEvent: { menuId: hit.menuId } })
  await act(() => jest.runAllTimersAsync())
}

type NativeMenuNode = {
  title?: string
  menuId?: string
  destructive?: boolean
  disabled?: boolean
  items?: NativeMenuNode[]
  menu?: { items: NativeMenuNode[] }
}

/** Các mục (action) của mọi menu gốc bên phải một header native. */
function headerMenuItems(config: Node): NativeMenuNode[] {
  const walk = (nodes: NativeMenuNode[]): NativeMenuNode[] =>
    nodes.flatMap((n) => (n.menuId ? [n] : walk(n.items ?? n.menu?.items ?? [])))
  return walk((config.props.headerRightBarButtonItems ?? []) as NativeMenuNode[])
}

/**
 * Bấm mục `title` của menu gốc `⋯` trên header TRÊN CÙNG có mục đó (nhiều màn bước cùng gắn → header
 * của màn dưới cũng có trong cây; màn trên cùng là header cuối).
 */
async function pressTopHeaderMenuItem(title: string) {
  const configs = screen.container.queryAll(
    (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
  )
  const config = configs.findLast((c) => headerMenuItems(c).some((i) => i.title === title))
  const hit = config && headerMenuItems(config).find((i) => i.title === title)
  if (!config || !hit) throw new Error(`Không có mục menu "${title}"`)
  await fireEvent(config, 'pressHeaderBarButtonMenuItem', { nativeEvent: { menuId: hit.menuId } })
  await act(() => jest.runAllTimersAsync())
}

/** Nút gốc (mục thanh `type: 'button'`) trên các header native đang hiện — vd ✕/✓ của sheet. */
function headerButtons(root: Node = screen.container) {
  type Item = { title?: string; buttonId?: string; disabled?: boolean }
  return root
    .queryAll((n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false)
    .flatMap((config) =>
      [
        ...((config.props.headerLeftBarButtonItems ?? []) as Item[]),
        ...((config.props.headerRightBarButtonItems ?? []) as Item[]),
      ]
        .filter((item) => item.buttonId)
        .map((item) => ({ config, item })),
    )
}

/** Bấm nút gốc `label` trên header native (sheet: "Huỷ" = ✕, "Xong" = ✓). */
async function pressHeaderButton(label: string, pick: 'first' | 'last' = 'first') {
  const match = ({ item }: ReturnType<typeof headerButtons>[number]) => item.title === label
  const hit = pick === 'first' ? headerButtons().find(match) : headerButtons().findLast(match)
  if (!hit) throw new Error(`Không có nút header "${label}"`)
  await fireEvent(hit.config, 'pressHeaderBarButtonItem', {
    nativeEvent: { buttonId: hit.item.buttonId },
  })
  await act(() => jest.runAllTimersAsync())
}

/**
 * Bấm nút `label` của header TRÊN CÙNG có nút đó (mục cuối): sheet mở trên modal form 3 bước — ✕ của
 * sheet và ✕ của bước đầu modal cùng nhãn "Đóng".
 */
const pressTopHeaderButton = (label: string) => pressHeaderButton(label, 'last')

const headerButtonLabels = () => headerButtons().map(({ item }) => item.title)

/** `edges` mà SafeAreaView bọc ngoài một phần tử thật sự gửi xuống native. */
function safeAreaEdgesOf(node: ReturnType<typeof screen.getByTestId>): unknown {
  let current: typeof node | null = node
  while (current && current.type !== 'RNCSafeAreaView') current = current.parent
  return current?.props.edges
}

type StackRoute = { name: string; params?: { formSlug?: string }; state?: StackState }
type StackState = { index: number; routes: StackRoute[] }

/** Kết quả `renderRouter` của ca đang chạy (đọc state điều hướng). */
let rendered: Awaited<ReturnType<typeof renderRouter>>
const activeRoutes = (s: StackState | undefined) => s?.routes.slice(0, s.index + 1) ?? []
const routeLabel = (x: StackRoute) =>
  x.params?.formSlug ? `${x.name}:${x.params.formSlug}` : x.name

/** Stack gốc của app (bỏ lớp `__root` của expo-router nếu có). */
function rootState(): StackState {
  const top = rendered.getRouterState() as unknown as StackState
  return top.routes[0]?.name === '__root' ? (top.routes[0].state as StackState) : top
}

/** Stack lồng dưới route tên `name` (đang hoạt động, gần đỉnh nhất). */
function nestedStack(s: StackState | undefined, name: string): StackState | undefined {
  for (const x of activeRoutes(s).toReversed()) {
    if (x.name === name) return x.state
    const inner = nestedStack(x.state, name)
    if (inner) return inner
  }
  return undefined
}

/** Tên các route đang hoạt động của Stack gốc. */
const rootRoutes = () => activeRoutes(rootState()).map((x) => x.name)
/** Stack của tab / modal `name` (`import`, `import-form`…), mỗi route là `<tên>` hoặc `<tên>:<formSlug>`. */
const stackOf = (name: string) => activeRoutes(nestedStack(rootState(), name)).map(routeLabel)

/** Màn modal toàn màn của form 3 bước (route gốc `import-form` / `export-form`) trên cùng. */
function formModal(): Node {
  const node = screen.container
    .queryAll((n) => n.type === 'RNSModalScreen' && n.props.stackPresentation === 'fullScreenModal')
    .at(-1)
  if (!node) throw new Error('Không có modal form 3 bước')
  return node
}

/** Header native trên cùng trong modal form 3 bước (màn bước đang hiện). */
function topModalHeader(): Node {
  const configs = formModal().queryAll(
    (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
  )
  return configs[configs.length - 1]!
}

/** SF Symbol các mục gốc bên trái một header (✕ = `xmark`). */
const leftSymbols = (config: Node) =>
  ((config.props.headerLeftBarButtonItems ?? []) as { sfSymbolName?: string }[]).map(
    (i) => i.sfSymbolName,
  )

async function boot() {
  rendered = await renderRouter('./app', { initialUrl: '/' })
  // Font, i18n, bootstrapSession, resolveFor đều là promise: chạy hết rồi mới khẳng định.
  await act(() => jest.runAllTimersAsync())
}

afterEach(() => jest.restoreAllMocks())

beforeEach(async () => {
  resetFakeApi()
  importFormsOf('wh-1')
  importFormsOf('wh-2')
  exportFormsOf('wh-1')
  exportFormsOf('wh-2')
  clearTokens()
  await AsyncStorage.clear()
  await kv.set('warehouse.language', 'vi')
  useAuthStore.setState({ status: 'loading', user: null, endReason: null })
  useWarehouseStore.getState().reset()
  useStockFilter.getState().reset()
  useImportListFilter.getState().reset()
  useExportListFilter.getState().reset()
  useExportDraft.getState().reset()
  // Yêu cầu mở sheet dòng (quét / bộ chọn) chỉ trong bộ nhớ: không để lọt sang test sau.
  useLineFocus.getState().clear()
  // `queryClient` của app là module dùng chung: cache của test trước không được lọt sang test sau.
  queryClient.clear()
})

describe('SessionGate + routes', () => {
  it('chưa đăng nhập → /login', async () => {
    await boot()
    expect(screen).toHavePathname('/login')
    expect(screen.getByLabelText('Số điện thoại')).toBeOnTheScreen()
  })

  it('đã đăng nhập, 2 kho, chưa chọn → /select-warehouse; chọn kho → /import', async () => {
    signedIn({ scope: ALL, warehouses: [WH1, WH2] })
    await boot()
    expect(screen).toHavePathname('/select-warehouse')
    // Lần đầu: màn đầy đủ có tiêu đề lớn, không có Huỷ (không có gì để quay lại).
    expect(screen.getByRole('header', { name: 'Chọn kho' })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Huỷ' })).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: /Kho Thủ Đức/ }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import')
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-2')
  })

  it('chỉ có EXPORT_FORM_READ → tab bar chỉ có Xuất và Tài khoản', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ'], warehouses: [WH1] })
    await boot()
    expect(screen).toHavePathname('/export')
    // Nhãn tab ngắn theo mockup A; tiêu đề lớn native của màn vẫn là nhãn dài.
    expect(tabBar()).toEqual([
      { title: 'Xuất', testID: 'tab-export' },
      { title: 'Tài khoản', testID: 'tab-account' },
    ])
    expect(nativeHeaders(tabScreen('Xuất'))).toEqual([{ title: 'Xuất kho', largeTitle: true }])
  })

  it('đã chọn kho nhưng không còn tab nghiệp vụ nào → /no-access (noAccess)', async () => {
    signedIn({ scope: [], warehouses: [WH1] })
    await boot()
    expect(screen).toHavePathname('/no-access')
    expect(screen.getByText('Bạn không có quyền sử dụng ứng dụng này.')).toBeOnTheScreen()
  })

  it('không được gán kho nào → /no-access (noWarehouse)', async () => {
    signedIn({ scope: ALL, warehouses: [] })
    await boot()
    expect(screen).toHavePathname('/no-access')
    expect(screen.getByText('Tài khoản chưa được gán vào kho nào.')).toBeOnTheScreen()
  })

  it('ADMIN không là thành viên kho nào → /select-warehouse với MỌI kho (GET /warehouses, cả kho đã tắt); chọn → tab', async () => {
    signedIn({ roleName: 'ADMIN', scope: ALL, warehouses: [] })
    route('get', '/warehouses', () =>
      ok({
        items: [
          { slug: 'wh-2', code: 'WH2', name: 'Kho Thủ Đức', isActive: false },
          { slug: 'wh-1', code: 'WH1', name: 'Kho Tổng', isActive: true },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNext: false,
      }),
    )
    await boot()
    expect(screen).toHavePathname('/select-warehouse')
    expect(screen.getByRole('header', { name: '2 kho của bạn' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Kho Thủ Đức, WH2, Đã tắt' })).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: /^Kho Tổng/ }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import')
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-1')
  })

  it('ADMIN: tải danh sách kho lỗi → /select-warehouse báo lỗi + Thử lại (không phải /no-access); thử lại được → tab', async () => {
    signedIn({ roleName: 'ADMIN', scope: ALL, warehouses: [] })
    route('get', '/warehouses', () => 'network')
    await boot()
    expect(screen).toHavePathname('/select-warehouse')
    expect(screen.getByText('Không tải được danh sách kho')).toBeOnTheScreen()

    route('get', '/warehouses', () =>
      ok({
        items: [{ slug: 'wh-1', code: 'WH1', name: 'Kho Tổng', isActive: true }],
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNext: false,
      }),
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import')
  })

  it('endSession(expired) → về /login, màn login báo phiên hết hạn, store kho bị reset', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    await boot()
    expect(screen).toHavePathname('/import')

    await act(async () => useAuthStore.getState().endSession('expired'))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/login')
    expect(screen.getByText(/Phiên đăng nhập đã hết hạn/)).toBeOnTheScreen()
    expect(useWarehouseStore.getState().resolution).toBeNull()
  })

  it('mọi tab: đúng một header native (tiêu đề lớn) có nút kho bên PHẢI (không có mục trái), mang mã kho', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    for (const [href, tab, title] of [
      ['/import', 'Nhập', 'Nhập kho'],
      ['/export', 'Xuất', 'Xuất kho'],
      ['/stock', 'Tồn kho', 'Tồn kho'],
      ['/account', 'Tài khoản', 'Tài khoản'],
    ] as const) {
      await go(href)
      expect(screen).toHavePathname(href)
      expect(nativeHeaders(tabScreen(tab))).toEqual([{ title, largeTitle: true }])
      const [button, ...rest] = warehouseButtons(tabScreen(tab))
      expect(rest).toHaveLength(0)
      expect(button.props.accessibilityLabel).toBe('Kho: Kho Tổng, đổi kho')
      expect(within(button).getByText('WH1')).toBeOnTheScreen()
      // Nút kho là mục `custom` bên phải của header gốc; bên trái không có mục nào.
      const [config] = tabScreen(tab).queryAll(
        (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
      )
      expect(config.props.headerLeftBarButtonItems ?? []).toHaveLength(0)
      expect(within(config).queryAllByRole('button', { name: /^Kho: / })).toHaveLength(1)
    }
  })

  it('tab Tồn kho: thứ tự bên phải = Quét mã, Lọc, rồi nút kho ngoài cùng', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    const [config] = tabScreen('Tồn kho').queryAll(
      (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
    )
    // expo-router đảo mảng cho UIKit (rightBarButtonItems: chỉ số 0 = ngoài cùng bên phải) và chừa
    // chỉ số 0 cho mục custom (nút kho): Lọc ở 2, Quét mã ở 3 → thứ tự trực quan [Quét mã, Lọc, kho].
    const native = (
      config.props.headerRightBarButtonItems as { title?: string; index: number }[]
    ).map((i) => [i.title, i.index])
    // Giữa kho và Lọc có mục `spacing` (chỉ số 1) để kho là viên kính riêng.
    const titled = native.filter(([title]) => title)
    expect(titled).toEqual([
      ['Lọc', 2],
      ['Quét mã', 3],
    ])
    expect(native.find(([title]) => !title)).toEqual([undefined, 1])
    expect(
      within(config)
        .queryAllByRole('button', { name: /^Kho: / })
        .map((b) => b.props.accessibilityLabel),
    ).toEqual(['Kho: Kho Tổng, đổi kho'])
  })

  it('bấm viên chọn kho trên tab → mở bảng /switch-warehouse, đánh dấu kho khác + ✓ → quay lại tab', async () => {
    signedIn({ scope: ALL, warehouses: [WH1, WH2] })
    await kv.set('warehouse.lastWarehouse.root', 'wh-1')
    await boot()
    expect(screen).toHavePathname('/import')

    await fireEvent.press(warehouseButtons(tabScreen('Nhập'))[0])
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/switch-warehouse')
    expect(headerButtonLabels()).toEqual(expect.arrayContaining(['Huỷ', 'Xong']))
    // Sheet có header native riêng (Stack lồng), tiêu đề "Chọn kho".
    expect(nativeHeaders()).toContainEqual({ title: 'Chọn kho', largeTitle: false })
    expect(screen.getByRole('header', { name: 'Kho của bạn · 2' })).toBeOnTheScreen()
    // Header native của Stack lồng trong sheet lo mép trên; thân sheet chỉ chừa hai bên + thanh home.
    expect(safeAreaEdgesOf(screen.getByTestId('select-warehouse-screen'))).toEqual({
      top: 'off',
      right: 'additive',
      bottom: 'additive',
      left: 'additive',
    })

    // Hai bước: chạm dòng chỉ đánh dấu, ✓ (Xong) mới ghi rồi đóng bảng.
    await fireEvent.press(screen.getByRole('button', { name: /Kho Thủ Đức/ }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/switch-warehouse')
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-1')

    await pressHeaderButton('Xong')
    expect(screen).toHavePathname('/import')
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-2')
  })

  it('bảng đổi kho: Huỷ → đóng, kho giữ nguyên; đang ở tab thì /select-warehouse bị khoá', async () => {
    signedIn({ scope: ALL, warehouses: [WH1, WH2] })
    await kv.set('warehouse.lastWarehouse.root', 'wh-1')
    await boot()
    await fireEvent.press(warehouseButtons(tabScreen('Nhập'))[0])
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/switch-warehouse')

    await pressHeaderButton('Huỷ')
    expect(screen).toHavePathname('/import')
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-1')

    await act(async () => router.navigate('/select-warehouse'))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import')
  })

  it('tab Tài khoản: dòng "Kho" (nhóm Làm việc) mở bảng đổi kho', async () => {
    signedIn({ scope: ALL, warehouses: [WH1, WH2] })
    await kv.set('warehouse.lastWarehouse.root', 'wh-1')
    await boot()
    await go('/account')
    expect(screen).toHavePathname('/account')
    await fireEvent.press(screen.getByRole('button', { name: 'Kho, Kho Tổng' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/switch-warehouse')
  })

  it('đăng nhập: viên ngôn ngữ mở sheet /language; chọn English + ✓ → đổi ngôn ngữ, về /login', async () => {
    await boot()
    expect(screen).toHavePathname('/login')
    await fireEvent.press(screen.getByRole('button', { name: 'Ngôn ngữ, Tiếng Việt' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/language')

    await fireEvent.press(screen.getByRole('button', { name: /^English/ }))
    await pressHeaderButton('Xong')
    expect(screen).toHavePathname('/login')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen()
  })

  it('chưa đăng nhập: /change-password và /switch-warehouse bị khoá (về /login)', async () => {
    await boot()
    await act(async () => router.navigate('/change-password'))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/login')
    await act(async () => router.navigate('/switch-warehouse'))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/login')
  })

  it('tab Tài khoản: Ngôn ngữ → /language, ✕ → về; Đổi mật khẩu → /change-password, ✕ → về', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    await boot()
    await go('/account')
    expect(screen).toHavePathname('/account')

    await fireEvent.press(screen.getByRole('button', { name: 'Ngôn ngữ, Tiếng Việt' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/language')
    await pressHeaderButton('Huỷ')
    expect(screen).toHavePathname('/account')

    await fireEvent.press(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/change-password')
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toBeOnTheScreen()
    await pressHeaderButton('Huỷ')
    expect(screen).toHavePathname('/account')
  })

  it('đang mở /language từ Tài khoản thì phiên hết hạn → về /login, dùng được ngay', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    await boot()
    await go('/account')
    await fireEvent.press(screen.getByRole('button', { name: 'Ngôn ngữ, Tiếng Việt' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/language')

    await act(async () => useAuthStore.getState().endSession('expired'))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/login')
    expect(screen.getByText(/Phiên đăng nhập đã hết hạn/)).toBeOnTheScreen()
    expect(screen.getByLabelText('Số điện thoại')).toBeOnTheScreen()
    // Mở lại sheet từ màn đăng nhập và đóng được.
    await fireEvent.press(screen.getByRole('button', { name: 'Ngôn ngữ, Tiếng Việt' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/language')
    await pressHeaderButton('Huỷ')
    expect(screen).toHavePathname('/login')
  })

  it('đang mở /language từ /login thì đăng nhập xong → vào tab, không kẹt ở sheet', async () => {
    await boot()
    await fireEvent.press(screen.getByRole('button', { name: 'Ngôn ngữ, Tiếng Việt' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/language')

    route('get', '/auth/me', () => ok(profile({ scope: ALL, warehouses: [WH1] })))
    await act(async () => {
      useAuthStore.getState().startSession({ accessToken: 'acc-2', refreshToken: 'ref-2' })
      await bootstrapSession()
    })
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import')
    expect(nativeHeaders(tabScreen('Nhập'))).toEqual([{ title: 'Nhập kho', largeTitle: true }])
  })

  it('đang mở /change-password thì phiên hết hạn → về /login', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    await boot()
    await act(async () => router.navigate('/change-password'))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/change-password')
    await act(async () => useAuthStore.getState().endSession('expired'))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/login')
  })

  it('quay lại app, quyền đổi: tab đang mở bị gỡ → sang tab đầu tiên còn lại; hết tab → /no-access', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    await boot()
    expect(screen).toHavePathname('/import')

    const user = useAuthStore.getState().user!
    await act(async () => useAuthStore.getState().setUser({ ...user, scope: ['EXPORT_FORM_READ'] }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export')
    expect(tabBar().map((t) => t.title)).toEqual(['Xuất', 'Tài khoản'])

    await act(async () => useAuthStore.getState().setUser({ ...user, scope: [] }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/no-access')
  })

  it('offline lúc mở app → màn mất mạng (token giữ nguyên); Thử lại thành công → vào tab', async () => {
    setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
    route('get', '/auth/me', () => 'network')
    await boot()
    expect(screen.getByText('Không kết nối được máy chủ')).toBeOnTheScreen()
    expect(useAuthStore.getState().status).toBe('offline')

    route('get', '/auth/me', () => ok(profile({ scope: ALL, warehouses: [WH1] })))
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import')
  })
})

describe('ô tìm kiếm trong danh sách khi đổi tab (iOS 26 nháy với ô native)', () => {
  it('Nhập → Tồn kho → Xuất → Nhập: mỗi tab giữ chữ đã gõ, không có RNSSearchBar nào', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    const field = (tab: string, label: string) => within(tabScreen(tab)).getByLabelText(label)
    const FORM = 'Mã phiếu, số HĐ hoặc PO'
    const noNativeBar = () =>
      expect(screen.container.queryAll((n) => n.type === 'RNSSearchBar')).toHaveLength(0)

    noNativeBar()
    await fireEvent.changeText(field('Nhập', FORM), 'pn-1')
    await go('/stock')
    await fireEvent.changeText(field('Tồn kho', 'Tên hoặc mã vật tư'), 'son')
    await go('/export')
    await fireEvent.changeText(field('Xuất', FORM), 'px-2')
    await go('/import')

    expect(field('Nhập', FORM).props.value).toBe('pn-1')
    expect(field('Tồn kho', 'Tên hoặc mã vật tư').props.value).toBe('son')
    expect(field('Xuất', FORM).props.value).toBe('px-2')
    noNativeBar()
  })
})

describe('tab Tồn kho (Stack lồng)', () => {
  it('mở /stock: tiêu đề lớn native "Tồn kho", ô tìm kiếm trong danh sách, nút kho mở bảng đổi kho', async () => {
    signedIn({ scope: ALL, warehouses: [WH1, WH2] })
    await kv.set('warehouse.lastWarehouse.root', 'wh-1')
    stockOfWh1()
    await boot()
    await go('/stock')
    expect(screen).toHavePathname('/stock')
    const tab = tabScreen('Tồn kho')
    expect(nativeHeaders(tab)).toEqual([{ title: 'Tồn kho', largeTitle: true }])
    expect(within(tab).getByText('Xi măng PCB40')).toBeOnTheScreen()

    // Ô tìm kiếm nằm trong danh sách (không phải UISearchController của header: nháy khi đổi tab).
    expect(tab.queryAll((n) => n.type === 'RNSSearchBar')).toHaveLength(0)
    await fireEvent.changeText(within(tab).getByLabelText('Tên hoặc mã vật tư'), 'son')
    await act(() => jest.runAllTimersAsync())
    expect(within(tab).getByText('Sơn Dulux')).toBeOnTheScreen()
    expect(within(tab).queryByText('Xi măng PCB40')).toBeNull()

    await fireEvent.press(warehouseButtons(tab)[0])
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/switch-warehouse')
  })

  it('menu Lọc native: chọn loại "Sơn" → chỉ còn Sơn, có dòng gợi ý "Sơn · 1 vật tư"', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    const tab = tabScreen('Tồn kho')
    await pressHeaderMenuItem(tab, 'Sơn')
    expect(within(tab).getByText('Sơn Dulux')).toBeOnTheScreen()
    expect(within(tab).queryByText('Xi măng PCB40')).toBeNull()
    expect(within(tab).getByText('Sơn · 1 vật tư')).toBeOnTheScreen()
  })

  it('chạm vật tư → /stock/[materialSlug] (push trong Stack lồng)', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    await fireEvent.press(screen.getByRole('button', { name: /^Sơn Dulux/ }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/stock/son')
    expect(within(tabScreen('Tồn kho')).getByTestId('stock-hero')).toBeOnTheScreen()
  })

  it('header màn con chuẩn: nút back chỉ icon, tiêu đề nhỏ là mã vật tư, không tiêu đề lớn', async () => {
    // native-stack chỉ gửi `backButtonDisplayMode` khi iOS ≥ 14 — giả lập iOS 26 như máy thật.
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.0')
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    await fireEvent.press(screen.getByRole('button', { name: /^Sơn Dulux/ }))
    await act(() => jest.runAllTimersAsync())
    const configs = tabScreen('Tồn kho').queryAll(
      (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
    )
    const detail = configs[configs.length - 1]
    expect(detail.props.title).toBe('VT-SN')
    expect(detail.props.largeTitle).toBeFalsy()
    expect(detail.props.backButtonDisplayMode).toBe('minimal')
  })

  it('Android: màn gốc của tab giữ tiêu đề bên trái (không căn giữa); màn con tiêu đề căn giữa', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    const centered = () =>
      screen.container.queryAll(
        (n) => n.type === 'RNSScreenStackHeaderSubview' && n.props.type === 'center',
      )
    expect(centered()).toHaveLength(0)
    await fireEvent.press(screen.getByRole('button', { name: /^Sơn Dulux/ }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/stock/son')
    expect(centered()).toHaveLength(1)
  })

  it('đang ở chi tiết mà đổi kho → về danh sách của kho mới, chỉ còn một màn danh sách', async () => {
    signedIn({ scope: ALL, warehouses: [WH1, WH2] })
    await kv.set('warehouse.lastWarehouse.root', 'wh-1')
    stockOfWh1()
    route('get', '/warehouses/wh-2/materials', () =>
      ok({
        items: [item({ slug: 'i-9', materialSlug: 'gach', materialName: 'Gạch ống Tuynel' })],
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNext: false,
        hasPrevios: false,
      }),
    )
    await boot()
    await go('/stock')
    await fireEvent.press(screen.getByRole('button', { name: /^Sơn Dulux/ }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/stock/son')

    await act(async () => useWarehouseStore.getState().select(WH2))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/stock')
    const tab = tabScreen('Tồn kho')
    expect(within(tab).queryAllByTestId('stock-hero')).toHaveLength(0)
    expect(within(tab).getAllByTestId('stock-list')).toHaveLength(1)
    expect(nativeHeaders(tab)).toEqual([{ title: 'Tồn kho', largeTitle: true }])
    expect(within(tab).getByText('Gạch ống Tuynel')).toBeOnTheScreen()
  })

  it('chi tiết đang mở ở tab Tồn kho, đổi kho từ tab khác → quay lại Tồn kho thấy danh sách kho mới', async () => {
    signedIn({ scope: ALL, warehouses: [WH1, WH2] })
    await kv.set('warehouse.lastWarehouse.root', 'wh-1')
    stockOfWh1()
    route('get', '/warehouses/wh-2/materials', () =>
      ok({
        items: [item({ slug: 'i-9', materialSlug: 'gach', materialName: 'Gạch ống Tuynel' })],
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNext: false,
        hasPrevios: false,
      }),
    )
    await boot()
    await go('/stock')
    await fireEvent.press(screen.getByRole('button', { name: /^Sơn Dulux/ }))
    await act(() => jest.runAllTimersAsync())
    await go('/account')

    await act(async () => useWarehouseStore.getState().select(WH2))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/account')

    await go('/stock')
    expect(screen).toHavePathname('/stock')
    const tab = tabScreen('Tồn kho')
    expect(within(tab).queryAllByTestId('stock-hero')).toHaveLength(0)
    expect(nativeHeaders(tab)).toEqual([{ title: 'Tồn kho', largeTitle: true }])
    expect(within(tab).getByText('Gạch ống Tuynel')).toBeOnTheScreen()
  })

  it('iOS: sheet lọc /stock-filter (chỉ dành cho Android) bị khoá → về tab đầu', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    await go('/stock-filter')
    expect(screen).toHavePathname('/import')
  })

  it('nút "Quét mã" trên header Tồn kho → mở sheet /scan-material (chỉ có ✕)', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    await pressHeaderButton('Quét mã')
    expect(screen).toHavePathname('/scan-material')
    expect(screen.getByTestId('scan-sheet')).toBeOnTheScreen()
    expect(headerButtonLabels()).toContain('Đóng')
    expect(headerButtonLabels()).not.toContain('Xong')
  })

  it('quét mã khớp → đóng sheet, mở chi tiết vật tư; quay lại → danh sách', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    await pressHeaderButton('Quét mã')
    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data: ' vt-sn ' })
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/stock/son')
    expect(screen.queryByTestId('scan-sheet')).toBeNull()
    expect(within(tabScreen('Tồn kho')).getByTestId('stock-hero')).toBeOnTheScreen()

    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/stock')
  })

  it('quét mã không khớp → đóng sheet, ô tìm kiếm có mã + câu không tìm thấy', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    await pressHeaderButton('Quét mã')
    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data: '8934563' })
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/stock')
    expect(screen.queryByTestId('scan-sheet')).toBeNull()
    expect(useStockFilter.getState().query).toBe('8934563')
    expect(
      within(tabScreen('Tồn kho')).getByText('Không tìm thấy vật tư khớp “8934563”'),
    ).toBeOnTheScreen()
    // Ô tìm kiếm trong danh sách hiện đúng mã đã quét.
    expect(within(tabScreen('Tồn kho')).getByLabelText('Tên hoặc mã vật tư').props.value).toBe(
      '8934563',
    )
  })

  it('tồn kho tải lỗi → sheet quét báo lỗi + Thử lại, không kẹt "đang tải"', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    route('get', '/warehouses/wh-1/materials', () => ({ status: 500 }))
    await boot()
    await go('/stock')
    await pressHeaderButton('Quét mã')
    const sheet = within(screen.getByTestId('scan-sheet'))
    expect(sheet.getByText('Không tải được tồn kho')).toBeOnTheScreen()
    expect(sheet.queryByText('Đang tải danh sách vật tư…')).toBeNull()
    expect(sheet.getByRole('button', { name: 'Thử lại' })).toBeOnTheScreen()
  })

  it('thiếu quyền xem tồn kho (deep link) → /scan-material bị khoá, về tab đầu', async () => {
    signedIn({ scope: ['IMPORT_FORM_READ', 'MATERIAL_READ'], warehouses: [WH1] })
    await boot()
    expect(screen).toHavePathname('/import')
    await go('/scan-material')
    expect(screen).toHavePathname('/import')
    expect(screen.queryByTestId('scan-sheet')).toBeNull()
  })

  it('thiếu IMPORT_FORM_READ (deep link) → /import-line bị khoá, về tab đầu', async () => {
    signedIn({ scope: ['MATERIAL_READ', 'WAREHOUSE_READ'], warehouses: [WH1] })
    await boot()
    expect(screen).toHavePathname('/stock')
    await go('/import-line?key=a')
    expect(screen).toHavePathname('/stock')
    expect(screen.queryByTestId('receive-line-sheet')).toBeNull()
  })

  it('chưa đăng nhập → /import-line bị khoá, về /login', async () => {
    await boot()
    expect(screen).toHavePathname('/login')
    await go('/import-line?key=a')
    expect(screen).toHavePathname('/login')
    expect(screen.queryByTestId('receive-line-sheet')).toBeNull()
  })

  it('có IMPORT_FORM_READ, đang ở tab: /import-line mở bảng sửa dòng của bản nháp', async () => {
    signedIn({ scope: ['IMPORT_FORM_READ'], warehouses: [WH1] })
    await boot()
    await act(async () =>
      useReceiveDraft.setState({
        ctx: { userSlug: 'u', warehouseSlug: 'wh-1', formSlug: 'pn-1' },
        draft: makeDraft([makeLine(1, { materialName: 'Sơn Dulux' })]),
      }),
    )
    await go('/import-line?key=m-1%7Cu-1')
    expect(screen).toHavePathname('/import-line')
    expect(screen.getByTestId('receive-line-sheet')).toBeOnTheScreen()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('/scan-line: chưa có bản nháp phiếu đang mở → bị khoá, về tab đầu', async () => {
    signedIn({ scope: ['IMPORT_FORM_READ'], warehouses: [WH1] })
    await boot()
    expect(screen).toHavePathname('/import')
    await go('/scan-line')
    expect(screen).toHavePathname('/import')
    expect(screen.queryByTestId('scan-sheet')).toBeNull()
  })

  it('/scan-line: thiếu IMPORT_FORM_READ (có bản nháp) → bị khoá, về tab đầu', async () => {
    signedIn({ scope: ['MATERIAL_READ', 'WAREHOUSE_READ'], warehouses: [WH1] })
    await boot()
    await act(async () =>
      useReceiveDraft.setState({
        ctx: { userSlug: 'u', warehouseSlug: 'wh-1', formSlug: 'pn-1' },
        draft: makeDraft([makeLine(1)]),
      }),
    )
    await go('/scan-line')
    expect(screen).toHavePathname('/stock')
    expect(screen.queryByTestId('scan-sheet')).toBeNull()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('/scan-line: quét khớp → đóng sheet, mở /import-line?key= của dòng; không khớp → ghi mã báo mức phiếu', async () => {
    signedIn({ scope: ['IMPORT_FORM_READ'], warehouses: [WH1] })
    await boot()
    await act(async () =>
      useReceiveDraft.setState({
        ctx: { userSlug: 'u', warehouseSlug: 'wh-1', formSlug: 'pn-1' },
        draft: makeDraft([makeLine(1), makeLine(2)]),
      }),
    )
    await go('/scan-line')
    expect(screen).toHavePathname('/scan-line')
    expect(headerButtonLabels()).toContain('Đóng')
    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data: 'vt2' })
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-line')
    expect(screen).toHaveSearchParams({ key: 'm-2|u-2' })
    expect(screen.queryByTestId('scan-sheet')).toBeNull()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('Android: thiếu quyền xem tồn kho (deep link) → /stock-filter bị khoá, về tab đầu', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    signedIn({ scope: ['IMPORT_FORM_READ', 'MATERIAL_READ'], warehouses: [WH1] })
    await boot()
    expect(screen).toHavePathname('/import')
    await go('/stock-filter')
    expect(screen).toHavePathname('/import')
    expect(screen.queryByTestId('stock-filter-sheet')).toBeNull()
  })

  it('Android: có quyền xem tồn kho → /stock-filter mở sheet lọc', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    signedIn({ scope: ALL, warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    await go('/stock-filter')
    expect(screen).toHavePathname('/stock-filter')
    expect(screen.getByTestId('stock-filter-sheet')).toBeOnTheScreen()
  })

  it('sheet sửa ngưỡng: có đủ MATERIAL_UPDATE + WAREHOUSE_UPDATE → mở được từ chi tiết vật tư', async () => {
    signedIn({ scope: [...ALL, 'MATERIAL_UPDATE', 'WAREHOUSE_UPDATE'], warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    await fireEvent.press(screen.getByRole('button', { name: /^Sơn Dulux/ }))
    await act(() => jest.runAllTimersAsync())
    await fireEvent.press(screen.getByRole('button', { name: 'Sửa ngưỡng tồn' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/stock-threshold')
    expect(await screen.findByTestId('stock-threshold-sheet')).toBeOnTheScreen()
    expect(screen.getByLabelText('Tối thiểu')).toBeOnTheScreen()
  })

  it('sheet sửa ngưỡng: thiếu WAREHOUSE_UPDATE (deep link) → bị khoá, về tab đầu', async () => {
    signedIn({ scope: [...ALL, 'MATERIAL_UPDATE'], warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/stock')
    await go('/stock-threshold?materialSlug=son')
    expect(screen).not.toHavePathname('/stock-threshold')
  })

  it('tab Nhập (iOS): bên phải = Lọc, rồi nút kho ngoài cùng; Lọc là mục button (không UIMenu), viền khi chưa lọc', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    await boot()
    expect(screen).toHavePathname('/import')
    const [config] = tabScreen('Nhập').queryAll(
      (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
    )
    type NativeItem = {
      title?: string
      index: number
      buttonId?: string
      menuId?: string
      icon?: unknown
    }
    const items = config.props.headerRightBarButtonItems as NativeItem[]
    // Chỉ số 0 dành cho nút kho (custom), khoảng 8 ở 1, Lọc ở 2 → thứ tự trực quan [Lọc, kho].
    expect(items.filter((i) => i.title).map((i) => [i.title, i.index])).toEqual([['Lọc', 2]])
    expect(items.find((i) => !i.title)?.index).toBe(1)
    const filter = items.find((i) => i.title === 'Lọc')!
    expect(filter.buttonId).toBeDefined()
    expect(filter.menuId).toBeUndefined()
    expect(JSON.stringify(filter.icon)).toContain('line.3.horizontal.decrease.circle')
    expect(JSON.stringify(filter.icon)).not.toContain('.fill')
    expect(
      within(config)
        .queryAllByRole('button', { name: /^Kho: / })
        .map((b) => b.props.accessibilityLabel),
    ).toEqual(['Kho: Kho Tổng, đổi kho'])
  })

  it('tab Nhập: Lọc → sheet /import-filter MỘT trang (nửa màn); bật "Thời gian" → 7 ngày qua; ✕ → về /import, icon đặc + dòng tóm tắt', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    await boot()
    await pressHeaderButton('Lọc')
    expect(screen).toHavePathname('/import-filter')
    expect(screen.getByTestId('import-filter-sheet')).toBeOnTheScreen()
    const [sheet] = screen.container.queryAll(
      (n) => n.type === 'RNSModalScreen' && n.props.stackPresentation === 'formSheet',
    )
    expect(sheet.props.sheetAllowedDetents).toEqual([0.5, 1])
    // Người xác nhận chỉ khi có USER_READ.
    expect(screen.queryByRole('switch', { name: 'Người xác nhận' })).toBeNull()

    await act(async () =>
      fireEvent(screen.getByRole('switch', { name: 'Thời gian' }), 'valueChange', true),
    )
    expect(useImportListFilter.getState().time).toBe('last7')
    // Bật/chọn không rời trang (không có trang con).
    await fireEvent.press(screen.getByRole('radio', { name: 'Hôm nay' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-filter')
    expect(useImportListFilter.getState().time).toBe('today')

    await pressHeaderButton('Huỷ')
    expect(screen).toHavePathname('/import')
    const tab = tabScreen('Nhập')
    expect(within(tab).getByText('Hôm nay')).toBeOnTheScreen()
    const [config] = tab.queryAll(
      (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
    )
    const filter = (
      config.props.headerRightBarButtonItems as { title?: string; icon?: unknown }[]
    ).find((i) => i.title === 'Lọc')!
    expect(JSON.stringify(filter.icon)).toContain('line.3.horizontal.decrease.circle.fill')
  })

  it('tab Nhập: chạm dòng tóm tắt bộ lọc → mở /import-filter', async () => {
    useImportListFilter.setState({ time: 'last30' })
    signedIn({ scope: ALL, warehouses: [WH1] })
    await boot()
    await fireEvent.press(
      within(tabScreen('Nhập')).getByRole('button', { name: 'Bộ lọc: 30 ngày qua' }),
    )
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-filter')
    expect(screen.getByRole('switch', { name: 'Thời gian' })).toBeChecked()
  })

  it('sheet Lọc (USER_READ): bật "Người xác nhận" → tôi xác nhận, ngay trên trang', async () => {
    signedIn({ scope: [...ALL, 'USER_READ'], warehouses: [WH1] })
    route('get', '/users', () =>
      ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0, hasNext: false }),
    )
    await boot()
    await go('/import-filter')
    await act(async () =>
      fireEvent(screen.getByRole('switch', { name: 'Người xác nhận' }), 'valueChange', true),
    )
    expect(screen).toHavePathname('/import-filter')
    expect(useImportListFilter.getState().approver).toMatchObject({ slug: 'root' })
    expect(useImportListFilter.getState().requester).toBeNull()
  })

  it('không thấy tab Nhập (deep link) → /import-filter bị khoá', async () => {
    signedIn({ scope: ['MATERIAL_READ', 'WAREHOUSE_READ'], warehouses: [WH1] })
    stockOfWh1()
    await boot()
    expect(screen).toHavePathname('/stock')
    await go('/import-filter')
    expect(screen).toHavePathname('/stock')
    expect(screen.queryByTestId('import-filter-sheet')).toBeNull()
  })

  it('tab Xuất: /export là danh sách phiếu — tiêu đề lớn "Xuất kho", [Lọc, kho], MANAGER mặc định "Chờ duyệt", thẻ phiếu', async () => {
    signedIn({ scope: [...ALL, 'EXPORT_FORM_CONFIRM', 'EXPORT_FORM_CREATE'], warehouses: [WH1] })
    exportFormsOf('wh-1', [
      {
        slug: 'px-1',
        code: 'PX-20261101-0900',
        type: 'PRODUCTION',
        status: 'PENDING',
        receiver: 'Tổ hàn A',
        requesterName: 'Tuấn',
        totalAmount: 1000,
        createdAt: new Date().toISOString(),
        version: 1,
      },
    ])
    await boot()
    await go('/export')
    const tab = tabScreen('Xuất')
    expect(nativeHeaders(tab)).toEqual([{ title: 'Xuất kho', largeTitle: true }])
    expect(headerButtonLabels()).toContain('Lọc')
    expect(within(tab).getByRole('tab', { name: 'Chờ duyệt' })).toBeSelected()
    expect(within(tab).getByText('PX-20261101-0900')).toBeOnTheScreen()
    expect(within(tab).getByText('Sản xuất · Tổ hàn A · Tuấn')).toBeOnTheScreen()
    expect(within(tab).getByRole('button', { name: 'Tạo phiếu xuất' })).toBeOnTheScreen()
  })

  it('tab Xuất: chạm phiếu → màn XEM /export/[formSlug]: tiêu đề nhỏ là mã phiếu, back chỉ icon, [Huỷ] [Xác nhận xuất kho]', async () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.0')
    signedIn({ scope: [...ALL, 'EXPORT_FORM_CONFIRM'], warehouses: [WH1] })
    exportFormsOf('wh-1', [
      {
        slug: 'px-1',
        code: 'PX-20261101-0900',
        type: 'PRODUCTION',
        status: 'PENDING',
        receiver: 'Tổ hàn A',
        requesterName: 'Tuấn',
        totalAmount: 1000,
        createdAt: new Date().toISOString(),
        version: 1,
      },
    ])
    route('get', '/warehouses/wh-1/export-forms/px-1', () =>
      ok({
        slug: 'px-1',
        code: 'PX-20261101-0900',
        type: 'PRODUCTION',
        status: 'PENDING',
        receiver: 'Tổ hàn A',
        requesterName: 'Tuấn',
        requesterSlug: 'u-2',
        purchaseOrder: 'PO-1',
        totalAmount: 1000,
        createdAt: new Date().toISOString(),
        version: 1,
        items: [
          {
            slug: 'it-1',
            lineNo: 1,
            materialSlug: 'xi-mang',
            materialCode: 'VT-01',
            materialName: 'Xi măng PCB40',
            unitName: 'bao',
            batchSlug: null,
            batchExpiryDate: null,
            quantity: 2,
            unitPrice: 500,
            amount: 1000,
          },
        ],
      }),
    )
    await boot()
    await go('/export')
    await fireEvent.press(
      within(tabScreen('Xuất')).getByRole('button', { name: /PX-20261101-0900/ }),
    )
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export/px-1')
    const tab = within(tabScreen('Xuất'))
    expect(tab.getByText('Xi măng PCB40')).toBeOnTheScreen()
    expect(tab.getByRole('button', { name: 'Huỷ' })).toBeOnTheScreen()
    expect(tab.getByRole('button', { name: 'Xác nhận xuất kho' })).toBeOnTheScreen()
    const configs = tabScreen('Xuất').queryAll(
      (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
    )
    const detail = configs[configs.length - 1]
    expect(detail.props.title).toBe('PX-20261101-0900')
    expect(detail.props.largeTitle).toBeFalsy()
    expect(detail.props.backButtonDisplayMode).toBe('minimal')
  })

  it('tab Xuất: Lọc → sheet /export-filter MỘT trang (nửa màn); bật "Loại" → 5 viên, chọn Bán → type=SALE; ✕ → về /export, icon đặc + tóm tắt "Bán"', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ'], warehouses: [WH1] })
    await boot()
    await go('/export')
    await pressHeaderButton('Lọc')
    expect(screen).toHavePathname('/export-filter')
    expect(screen.getByTestId('export-filter-sheet')).toBeOnTheScreen()
    const [sheet] = screen.container.queryAll(
      (n) => n.type === 'RNSModalScreen' && n.props.stackPresentation === 'formSheet',
    )
    expect(sheet.props.sheetAllowedDetents).toEqual([0.5, 1])
    expect(screen.getByRole('switch', { name: 'Thời gian' })).toBeOnTheScreen()

    await act(async () =>
      fireEvent(screen.getByRole('switch', { name: 'Loại' }), 'valueChange', true),
    )
    await fireEvent.press(screen.getByRole('radio', { name: 'Bán' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export-filter')
    expect(useExportListFilter.getState().type).toBe('SALE')

    await pressHeaderButton('Huỷ')
    expect(screen).toHavePathname('/export')
    const tab = tabScreen('Xuất')
    expect(within(tab).getByRole('button', { name: 'Bộ lọc: Bán' })).toBeOnTheScreen()
    const [config] = tab.queryAll(
      (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
    )
    const filter = (
      config.props.headerRightBarButtonItems as { title?: string; icon?: unknown }[]
    ).find((i) => i.title === 'Lọc')!
    expect(JSON.stringify(filter.icon)).toContain('line.3.horizontal.decrease.circle.fill')
  })

  it('không thấy tab Xuất (deep link) → /export-filter bị khoá', async () => {
    signedIn({ scope: ['MATERIAL_READ', 'WAREHOUSE_READ'], warehouses: [WH1] })
    stockOfWh1()
    await boot()
    expect(screen).toHavePathname('/stock')
    await go('/export-filter')
    expect(screen).toHavePathname('/stock')
    expect(screen.queryByTestId('export-filter-sheet')).toBeNull()
  })

  /** Phiếu xuất Nháp px-1 của chính `root` ở wh-1 (một dòng tự động). */
  function draftExportOfWh1() {
    const form = {
      slug: 'px-1',
      code: 'PX-1',
      type: 'PRODUCTION',
      status: 'DRAFT',
      receiver: 'Tổ hàn A',
      purchaseOrder: 'PO-1',
      invoiceCode: null,
      note: null,
      requesterName: 'root',
      requesterSlug: 'root',
      totalAmount: 1000,
      createdAt: new Date().toISOString(),
      version: 1,
      warehouseSlug: 'wh-1',
      items: [
        {
          slug: 'it-1',
          lineNo: 1,
          materialSlug: 'xi-mang',
          materialCode: 'VT-01',
          materialName: 'Xi măng PCB40',
          unitSlug: 'bao',
          unitName: 'bao',
          conversionRate: 1,
          batchSlug: null,
          batchExpiryDate: null,
          quantity: 2,
          unitPrice: 500,
          amount: 1000,
          note: null,
        },
      ],
    }
    exportFormsOf('wh-1', [form])
    route('get', '/warehouses/wh-1/export-forms/px-1', () => ok(form))
  }

  it('list + opens /export-form/new/info (bước 1 "Phiếu xuất mới"; Tiếp tục → bước 2, back → bước 1; ✕ rồi "+" mở lại đúng bản nháp)', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ', 'EXPORT_FORM_CREATE'], warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await go('/export')
    await fireEvent.press(within(tabScreen('Xuất')).getByRole('button', { name: 'Tạo phiếu xuất' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export-form/new/info')
    expect(rootRoutes()).toEqual(['(tabs)', 'export-form'])
    expect(topModalHeader().props.title).toBe('Phiếu xuất mới')
    const form = within(formModal())
    expect(form.getByLabelText('Bước 1 trên 3, Thông tin, đang ở đây')).toBeOnTheScreen()
    expect(form.getByRole('button', { name: 'Loại, Sản xuất' })).toBeOnTheScreen()
    expect(form.getByLabelText('Mã phiếu').props.value).toMatch(/^PX-\d{8}-\d{4}$/)
    expect(form.getByText('Còn thiếu: Số PO, Người nhận')).toBeOnTheScreen()
    // Trông như khoá (vẫn bấm được — bấm thì chỉ tới ô thiếu), trình đọc màn hình nghe còn thiếu gì.
    expect(form.getByRole('button', { name: 'Tiếp tục' }).props.accessibilityHint).toBe(
      'Còn thiếu: Số PO, Người nhận',
    )
    await fireEvent.changeText(form.getByLabelText('Mã phiếu'), 'px-moi')
    await fireEvent.changeText(form.getByLabelText('Số PO'), 'PO-9')
    await fireEvent.changeText(form.getByLabelText('Người nhận'), 'Tổ hàn A')
    await act(() => jest.runAllTimersAsync())
    expect(form.queryByText(/^Còn thiếu/)).toBeNull()
    // Tiếp tục → bước 2 (đẩy lên trên bước 1); back gốc lùi đúng một bước.
    await fireEvent.press(form.getByRole('button', { name: 'Tiếp tục' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export-form/new/edit')
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export-form/new/info')
    // ✕ (màn đầu modal) → đóng modal, về danh sách; "+" mở lại bước 1 với bản nháp vừa gõ.
    expect(leftSymbols(topModalHeader())).toEqual(['xmark'])
    await pressHeaderButton('Đóng')
    expect(screen).toHavePathname('/export')
    expect(rootRoutes()).toEqual(['(tabs)'])
    await fireEvent.press(within(tabScreen('Xuất')).getByRole('button', { name: 'Tạo phiếu xuất' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export-form/new/info')
    expect(within(formModal()).getByLabelText('Mã phiếu').props.value).toBe('PX-MOI')
    // Route xem với 'new' → chuyển sang bước 1 (modal), Stack tab còn danh sách.
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    await go('/export/new')
    expect(screen).toHavePathname('/export-form/new/info')
    expect(stackOf('export')).toEqual(['index'])
    expect(within(formModal()).getByLabelText('Người nhận').props.value).toBe('Tổ hàn A')
    await act(async () => useExportDraft.getState().reset())
  })

  it('Lưu nháp on step 2 of a new form ends at the list', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ', 'EXPORT_FORM_CREATE'], warehouses: [WH1] })
    stockOfWh1()
    const created = {
      slug: 'px-9',
      code: 'PX-MOI',
      type: 'PRODUCTION',
      status: 'DRAFT',
      receiver: 'Tổ hàn A',
      purchaseOrder: 'PO-9',
      invoiceCode: null,
      note: null,
      requesterName: 'root',
      requesterSlug: 'root',
      totalAmount: 10000,
      createdAt: new Date().toISOString(),
      version: 1,
      warehouseSlug: 'wh-1',
      items: [],
    }
    route('post', '/warehouses/wh-1/export-forms', () => ok(created))
    route('get', '/warehouses/wh-1/export-forms/px-9', () => ok(created))
    // Hộp hỏi "Tạo phiếu nháp …?" (action sheet gốc) → đồng ý.
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(0))
    await boot()
    await go('/export')
    await fireEvent.press(within(tabScreen('Xuất')).getByRole('button', { name: 'Tạo phiếu xuất' }))
    await act(() => jest.runAllTimersAsync())
    const form = within(formModal())
    await fireEvent.changeText(form.getByLabelText('Mã phiếu'), 'PX-MOI')
    await fireEvent.changeText(form.getByLabelText('Số PO'), 'PO-9')
    await fireEvent.changeText(form.getByLabelText('Người nhận'), 'Tổ hàn A')
    await fireEvent.press(form.getByRole('button', { name: 'Tiếp tục' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export-form/new/edit')
    await act(
      async () =>
        void useExportDraft
          .getState()
          .addLine(makeExportLine(1, { base: null, quantity: 5, unitPrice: 2000 })),
    )
    // "Lưu nháp" là mục của menu gốc `⋯` (không còn nút chữ). Bước 1 vẫn gắn bên dưới (header của nó
    // cũng trong cây): bấm mục của màn TRÊN CÙNG.
    expect(headerButtonLabels()).not.toContain('Lưu nháp')
    await pressTopHeaderMenuItem('Lưu nháp')
    expect(sheet.mock.calls.at(-1)![0].title).toBe('Tạo phiếu nháp PX-MOI?')
    // Tạo phiếu mới xong → về danh sách, modal đã đóng (chốt 2026-11-08).
    expect(screen).toHavePathname('/export')
    expect(rootRoutes()).toEqual(['(tabs)'])
    expect(stackOf('export')).toEqual(['index'])
    expect(screen.queryByLabelText('Mã phiếu')).toBeNull()
    await act(async () => useExportDraft.getState().reset())
  })

  it('/import/create và /export/create → modal bước 1, Stack tab còn [index]', async () => {
    signedIn({
      scope: [...ALL, 'IMPORT_FORM_CREATE', 'EXPORT_FORM_CREATE'],
      warehouses: [WH1],
    })
    stockOfWh1()
    await boot()
    await go('/export')
    await go('/export/create')
    expect(screen).toHavePathname('/export-form/new/info')
    expect(rootRoutes()).toEqual(['(tabs)', 'export-form'])
    expect(stackOf('export')).toEqual(['index'])
    expect(stackOf('export-form')).toEqual(['[formSlug]/info:new'])
    expect(topModalHeader().props.title).toBe('Phiếu xuất mới')
    await pressHeaderButton('Đóng')
    expect(rootRoutes()).toEqual(['(tabs)'])
    await go('/import/create')
    expect(screen).toHavePathname('/import-form/new/info')
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    expect(stackOf('import')).toEqual(['index'])
    expect(stackOf('import-form')).toEqual(['[formSlug]/info:new'])
    expect(topModalHeader().props.title).toBe('Phiếu nhập mới')
    await act(async () => {
      useExportDraft.getState().reset()
      useReceiveDraft.getState().reset()
    })
  })

  it('tab Xuất, thiếu EXPORT_FORM_CREATE (deep link) → /export/create, /export-form/new/info, /export/new/edit không mở modal, về danh sách', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ'], warehouses: [WH1] })
    await boot()
    for (const href of ['/export/create', '/export-form/new/info', '/export/new/edit']) {
      await go(href)
      expect(screen).toHavePathname('/export')
      expect(rootRoutes()).toEqual(['(tabs)'])
      expect(stackOf('export')).toEqual(['index'])
    }
  })

  it('tab Xuất: màn xem phiếu Nháp "Sửa phiếu" → /export-form/px-1/edit = bước 2 Vật tư (tiêu đề "Sửa phiếu", ✕ trái); header [Quét mã, ⋯ menu gốc]', async () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.0')
    signedIn({
      scope: [
        'EXPORT_FORM_READ',
        'EXPORT_FORM_UPDATE_DRAFT_OWN',
        'EXPORT_FORM_DELETE_DRAFT',
        ...ALL,
      ],
      warehouses: [WH1],
    })
    stockOfWh1()
    draftExportOfWh1()
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(1))
    await boot()
    await go('/export/px-1')
    // Mở thẳng modal: không đẩy màn trung gian vào tab rồi bỏ đi (không pop / replace nào).
    const pops = jest.spyOn(StackActions, 'pop')
    const replaces = jest.spyOn(StackActions, 'replace')
    await fireEvent.press(within(tabScreen('Xuất')).getByRole('button', { name: 'Sửa phiếu' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export-form/px-1/edit')
    expect(rootRoutes()).toEqual(['(tabs)', 'export-form'])
    expect(stackOf('export')).toEqual(['index', '[formSlug]/index:px-1'])
    expect(stackOf('export-form')).toEqual(['[formSlug]/edit:px-1'])
    expect(pops).not.toHaveBeenCalled()
    expect(replaces).not.toHaveBeenCalled()
    const header = topModalHeader()
    expect(header.props.title).toBe('Sửa phiếu')
    // Màn đầu modal: ✕ (không có back gốc).
    expect(leftSymbols(header)).toEqual(['xmark'])
    const edit = within(formModal())
    // Bước 2: thẻ vật tư (không còn nhóm Thông tin — nằm ở bước 1), thanh bước ở bước 2.
    expect(edit.getByText('Xi măng PCB40')).toBeOnTheScreen()
    expect(edit.queryByLabelText('Mã phiếu')).toBeNull()
    expect(edit.getByLabelText('Bước 2 trên 3, Vật tư, đang ở đây')).toBeSelected()
    // Phải: [Quét mã (nút gốc), ⋯ (menu gốc `type: 'menu'`)] — expo-router đảo mảng cho UIKit.
    type NativeItem = { type?: string; title?: string; sfSymbolName?: string }
    const right = (header.props.headerRightBarButtonItems ?? []) as NativeItem[]
    expect(right.map((i) => [i.type, i.title, i.sfSymbolName]).reverse()).toEqual([
      ['button', 'Quét mã', 'barcode.viewfinder'],
      ['menu', 'Tuỳ chọn', 'ellipsis'],
    ])
    expect(headerMenuItems(header).map((i) => [i.title, !!i.disabled, !!i.destructive])).toEqual([
      ['Lưu nháp', true, false],
      ['Xoá nháp', false, true],
    ])
    // Thêm vật tư ở đầu danh sách thẻ; Quét mã trên header.
    expect(edit.getByRole('button', { name: 'Thêm vật tư' })).toBeOnTheScreen()
    expect(edit.queryByRole('button', { name: 'Quét mã' })).toBeNull()
    // Xoá nháp → hộp hỏi gốc (huỷ → ở lại).
    await pressTopHeaderMenuItem('Xoá nháp')
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      title: 'Xoá phiếu nháp PX-1?',
      options: ['Xoá nháp', 'Không xoá'],
    })
    expect(screen).toHavePathname('/export-form/px-1/edit')
    await act(async () => useExportDraft.getState().reset())
  })

  it('/export-info no longer exists (không còn sheet Thông tin phiếu)', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ', 'EXPORT_FORM_CREATE'], warehouses: [WH1] })
    await boot()
    await go('/export')
    await go('/export-info')
    // Không còn route: Expo Router hiện màn "không khớp" mặc định, không có sheet nào.
    expect(screen.getByText('Unmatched Route')).toBeOnTheScreen()
    expect(screen.queryByTestId('export-info-sheet')).toBeNull()
  })

  const EXPORT_SHEETS = ['/export-line?key=m-1%7Cu-1%7C', '/export-add-line', '/scan-export-line']
  const exportSheetIds = ['export-line-sheet', 'export-add-line-sheet', 'scan-sheet']
  function openExportDraft() {
    return act(async () =>
      useExportDraft.setState({
        ctx: { userSlug: 'u', warehouseSlug: 'wh-1', formSlug: 'px-1' },
        draft: makeExportDraft([makeExportLine(1, { unitPrice: 1000, materialName: 'Vật tư 1' })]),
      }),
    )
  }

  it('/export-line, /export-add-line, /scan-export-line: chưa có bản nháp phiếu xuất đang mở → bị khoá', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ', 'EXPORT_FORM_CREATE'], warehouses: [WH1] })
    await boot()
    for (const [i, href] of EXPORT_SHEETS.entries()) {
      await go(href)
      expect(screen).toHavePathname('/export')
      expect(screen.queryByTestId(exportSheetIds[i]!)).toBeNull()
    }
  })

  it('thiếu EXPORT_FORM_READ (có bản nháp) → cả ba sheet của phiếu xuất bị khoá', async () => {
    signedIn({ scope: ['IMPORT_FORM_READ', 'EXPORT_FORM_CREATE'], warehouses: [WH1] })
    await boot()
    await openExportDraft()
    for (const [i, href] of EXPORT_SHEETS.entries()) {
      await go(href)
      expect(screen).toHavePathname('/import')
      expect(screen.queryByTestId(exportSheetIds[i]!)).toBeNull()
    }
    await act(async () => useExportDraft.getState().reset())
  })

  it('/export-line mở bảng sửa dòng của bản nháp; /export-add-line khoá khi không có quyền tạo / sửa phiếu xuất', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ'], warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await openExportDraft()
    await go('/export-line?key=m-1%7Cu-1%7C')
    expect(screen).toHavePathname('/export-line')
    expect(screen.getByTestId('export-line-sheet')).toBeOnTheScreen()
    await pressHeaderButton('Đóng')
    await go('/export-add-line')
    expect(screen).toHavePathname('/export')
    expect(screen.queryByTestId('export-add-line-sheet')).toBeNull()
    await act(async () => useExportDraft.getState().reset())
  })

  it('có EXPORT_FORM_CREATE: /export-add-line mở sheet thêm vật tư', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ', 'EXPORT_FORM_CREATE'], warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await openExportDraft()
    await go('/export-add-line')
    expect(screen).toHavePathname('/export-add-line')
    expect(screen.getByTestId('export-add-line-sheet')).toBeOnTheScreen()
    await act(async () => useExportDraft.getState().reset())
  })

  it('/scan-export-line khi không có bước 2 nào đang mở: khớp dòng → đóng sheet, để lại yêu cầu mở sheet dòng (không tự mở /export-line); khớp vật tư chưa có dòng → thêm dòng ngay, đóng sheet (không mở sheet thêm vật tư)', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ', 'EXPORT_FORM_CREATE'], warehouses: [WH1] })
    stockOfWh1()
    await boot()
    await openExportDraft()
    await go('/scan-export-line')
    expect(screen).toHavePathname('/scan-export-line')
    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data: 'vt1' })
    await act(() => jest.runAllTimersAsync())
    expect(screen).not.toHavePathname('/scan-export-line')
    expect(screen).not.toHavePathname('/export-line')
    expect(useExportDraft.getState().draft!.lines).toHaveLength(1)
    // Yêu cầu chờ bước 2 của phiếu nhận (ở đây không có bước 2 nào gắn).
    expect(useLineFocus.getState().request).toEqual({
      kind: 'export',
      formSlug: 'px-1',
      key: useExportDraft.getState().draft!.lines[0]!.key,
    })
    await go('/scan-export-line')
    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data: 'VT-SN' })
    await act(() => jest.runAllTimersAsync())
    expect(screen).not.toHavePathname('/scan-export-line')
    expect(screen).not.toHavePathname('/export-add-line')
    expect(useExportDraft.getState().draft!.lines.map((l) => l.materialSlug)).toEqual([
      'm-1',
      'son',
    ])
    expect(useLineFocus.getState().request).toMatchObject({ kind: 'export', formSlug: 'px-1' })
    await act(async () => {
      useLineFocus.getState().clear()
      useExportDraft.getState().reset()
    })
  })

  it('bước 2 đang mở + /scan-export-line khớp dòng → sheet đóng, bước 2 tự mở /export-line của dòng đó (focus=quantity); đóng sheet dòng rồi bước 2 được focus lại → không mở lại', async () => {
    signedIn({
      scope: ['EXPORT_FORM_READ', 'EXPORT_FORM_UPDATE_DRAFT_OWN', ...ALL],
      warehouses: [WH1],
    })
    stockOfWh1()
    draftExportOfWh1()
    await boot()
    await go('/export/px-1')
    await go('/export-form/px-1/edit')
    expect(screen).toHavePathname('/export-form/px-1/edit')
    const key = useExportDraft.getState().draft!.lines[0]!.key
    await go('/scan-export-line')
    expect(screen).toHavePathname('/scan-export-line')
    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data: 'VT-01' })
    await act(() => jest.runAllTimersAsync())
    // Sheet quét pop → bước 2 (Stack modal) nhận 'focus' → navigate sheet dòng, ô số focus sẵn.
    expect(screen).toHavePathname('/export-line')
    expect(screen).toHaveSearchParams({ key, focus: 'quantity' })
    expect(screen.getByTestId('export-line-sheet')).toBeOnTheScreen()
    expect(useLineFocus.getState().request).toBeNull()
    // Đóng sheet dòng (chưa sửa gì) → về bước 2; bước 2 focus lại nhưng yêu cầu đã tiêu thụ → ở lại.
    await pressTopHeaderButton('Đóng')
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export-form/px-1/edit')
    // Một lần focus lại nữa (mở rồi đóng sheet quét, không quét gì) → vẫn không mở lại.
    await go('/scan-export-line')
    await pressTopHeaderButton('Đóng')
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export-form/px-1/edit')
    expect(rootRoutes()).toEqual(['(tabs)', 'export-form'])
    expect(screen.queryByTestId('export-line-sheet')).toBeNull()
    await act(async () => useExportDraft.getState().reset())
  })

  it('route cũ (/import-filter/time, /import-filter/person, /import-filter-time, /import-filter-person) đã bỏ: không mở trang lọc nào', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    await boot()
    for (const href of [
      '/import-filter/time',
      '/import-filter/person?role=requester',
      '/import-filter-time',
      '/import-filter-person?role=requester',
    ]) {
      await go(href)
      for (const id of ['import-filter-time-page', 'import-filter-person-page'])
        expect(screen.queryByTestId(id)).toBeNull()
      expect(screen.queryByRole('switch', { name: 'Thời gian' })).toBeNull()
    }
  })

  it('tab Nhập (IMPORT_FORM_READ): /import là danh sách phiếu — tiêu đề lớn "Nhập kho", trạng thái Nháp, thẻ phiếu', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    importFormsOf('wh-1', [
      {
        slug: 'pn-1',
        code: 'PN-20261101-0900',
        invoiceCode: 'HD-001',
        purchaseOrder: null,
        requesterName: 'Nguyễn Văn An',
        date: '2026-11-01',
        total: 1000,
        status: 'DRAFT',
        version: 1,
      },
    ])
    await boot()
    expect(screen).toHavePathname('/import')
    const tab = tabScreen('Nhập')
    expect(nativeHeaders(tab)).toEqual([{ title: 'Nhập kho', largeTitle: true }])
    expect(within(tab).getByRole('tab', { name: 'Nháp' })).toBeOnTheScreen()
    expect(within(tab).getByText('PN-20261101-0900')).toBeOnTheScreen()
  })

  /** Phiếu Nháp `pn-1` của kho wh-1 (một dòng xi măng); `status()` đọc lại mỗi lần GET chi tiết. */
  function draftFormOfWh1(status: () => string = () => 'DRAFT') {
    const summary = {
      slug: 'pn-1',
      code: 'PN-20261101-0900',
      invoiceCode: 'HD-001',
      purchaseOrder: null,
      requesterSlug: 'u-1',
      requesterName: 'Nguyễn Văn An',
      approverName: null,
      date: '2026-11-01',
      total: 10000,
      status: 'DRAFT',
      version: 1,
    }
    importFormsOf('wh-1', [summary])
    route('get', '/warehouses/wh-1/import-forms/pn-1', () =>
      ok({
        ...summary,
        status: status(),
        approverName: status() === 'CONFIRMED' ? 'Lê Thu Hà' : null,
        warehouseSlug: 'wh-1',
        items: [
          {
            slug: 'it-1',
            lineNo: 1,
            materialSlug: 'm-1',
            materialCode: 'VT-1',
            materialName: 'Xi măng PCB40',
            unitSlug: 'u-1',
            unitName: 'bao',
            supplierSlug: null,
            supplierName: null,
            quantity: 10,
            unitPrice: 1000,
            amount: 10000,
            note: null,
            expiryDate: null,
          },
        ],
      }),
    )
  }

  /** Header native của màn trên cùng trong tab Nhập. */
  const topImportHeader = () => {
    const configs = tabScreen('Nhập').queryAll(
      (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
    )
    return configs[configs.length - 1]
  }

  /** Mở phiếu pn-1 từ danh sách → màn xem. */
  async function openFormFromList() {
    await boot()
    await fireEvent.press(screen.getByRole('button', { name: /PN-20261101-0900/ }))
    await act(() => jest.runAllTimersAsync())
  }

  it('chạm phiếu → màn XEM /import/[formSlug]: tiêu đề nhỏ là mã phiếu, back chỉ icon, dòng chỉ xem, nút "Kiểm hàng"', async () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.0')
    signedIn({ scope: CHECKER, warehouses: [WH1] })
    draftFormOfWh1()
    await openFormFromList()
    expect(screen).toHavePathname('/import/pn-1')
    const tab = within(tabScreen('Nhập'))
    expect(tab.getByText('Xi măng PCB40')).toBeOnTheScreen()
    expect(tab.getByText('1 dòng vật tư')).toBeOnTheScreen()
    // Màn xem: không có vòng tròn đánh dấu.
    expect(tab.queryAllByRole('checkbox')).toHaveLength(0)
    expect(tab.getByRole('button', { name: 'Kiểm hàng' })).toBeOnTheScreen()
    const detail = topImportHeader()
    expect(detail.props.title).toBe('PN-20261101-0900')
    expect(detail.props.largeTitle).toBeFalsy()
    expect(detail.props.backButtonDisplayMode).toBe('minimal')
    // Người kiểm (xác nhận được, không sửa) chỉ có `⋯` → [Huỷ phiếu] (UIMenu gốc).
    const right = (detail.props.headerRightBarButtonItems ?? []) as {
      type: string
      menu?: { items: { title: string }[] }
    }[]
    expect(right).toHaveLength(1)
    expect(right[0]!.type).toBe('menu')
    expect(right[0]!.menu!.items.map((i) => i.title)).toEqual(['Huỷ phiếu'])
  })

  it('màn xem: "Kiểm hàng" → /import/[formSlug]/receive (tiêu đề "Kiểm hàng", back chỉ icon, danh sách kiểm)', async () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.0')
    signedIn({ scope: CHECKER, warehouses: [WH1] })
    draftFormOfWh1()
    await openFormFromList()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Kiểm hàng' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import/pn-1/receive')
    expect(
      within(tabScreen('Nhập')).getByRole('checkbox', { name: /Xi măng PCB40/ }),
    ).toBeOnTheScreen()
    const header = topImportHeader()
    expect(header.props.title).toBe('Kiểm hàng')
    expect(header.props.largeTitle).toBeFalsy()
    expect(header.props.backButtonDisplayMode).toBe('minimal')
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('cờ checklist tắt: màn xem "Duyệt phiếu" → màn duyệt không vòng tròn; "Thêm" → sheet /import-pick, dòng thêm hiện ở màn duyệt', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/features/receive-checklist/model/flags').__setChecklistEnabled(false)
    signedIn({
      scope: [...CHECKER, 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT'],
      warehouses: [WH1],
    })
    draftFormOfWh1()
    await openFormFromList()
    expect(within(tabScreen('Nhập')).queryByRole('button', { name: /^Kiểm hàng/ })).toBeNull()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Duyệt phiếu' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import/pn-1/receive')
    expect(within(tabScreen('Nhập')).queryAllByRole('checkbox')).toHaveLength(0)
    expect(topImportHeader().props.title).toBe('Duyệt phiếu')
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Thêm' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-pick')
    expect(screen.getByTestId('import-pick-sheet')).toBeOnTheScreen()
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import/pn-1/receive')
    await act(async () => {
      const store = useReceiveDraft.getState()
      store.addLine({
        ...store.draft!.lines[0]!,
        key: 'mx|ux',
        materialSlug: 'mx',
        materialName: 'Vật tư thêm từ bộ chọn',
        base: null,
      })
    })
    expect(within(tabScreen('Nhập')).getByText('Vật tư thêm từ bộ chọn')).toBeOnTheScreen()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('màn xem pn-1 "Sửa phiếu" (không xác nhận được) → /import-form/pn-1/edit, header trái ✕; Tiếp tục → review có back gốc, không ✕', async () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.0')
    signedIn({ scope: [...ALL, 'IMPORT_FORM_UPDATE_DRAFT'], warehouses: [WH1] })
    draftFormOfWh1()
    await openFormFromList()
    const tab = () => within(tabScreen('Nhập'))
    expect(tab().queryByRole('button', { name: /^Kiểm hàng/ })).toBeNull()
    await fireEvent.press(tab().getByRole('button', { name: 'Sửa phiếu' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/pn-1/edit')
    // Modal toàn màn trên Stack gốc (che thanh tab); màn xem nằm dưới trong tab.
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    expect(stackOf('import')).toEqual(['index', '[formSlug]/index:pn-1'])
    expect(stackOf('import-form')).toEqual(['[formSlug]/edit:pn-1'])
    const header = topModalHeader()
    expect(header.props.title).toBe('Sửa phiếu')
    expect(leftSymbols(header)).toEqual(['xmark'])
    const form = () => within(formModal())
    expect(form().queryAllByRole('checkbox')).toHaveLength(0)
    expect(form().getByLabelText('Bước 2 trên 3, Vật tư, đang ở đây')).toBeOnTheScreen()
    // Bước 2 = dòng chỉ đọc (chạm → sheet sửa dòng), không còn ô số trên dòng.
    expect(form().getByRole('button', { name: /^Xi măng PCB40, 10 bao/ })).toBeOnTheScreen()
    expect(form().queryByLabelText(/^Số lượng — /)).toBeNull()
    // Tiếp tục → bước 3 được đẩy lên trong modal: back gốc (chỉ icon), không ✕.
    await fireEvent.press(form().getAllByRole('button', { name: 'Tiếp tục' }).at(-1)!)
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/pn-1/review')
    expect(stackOf('import-form')).toEqual(['[formSlug]/edit:pn-1', '[formSlug]/review:pn-1'])
    const review = topModalHeader()
    expect(leftSymbols(review)).toEqual([])
    expect(review.props.backButtonDisplayMode).toBe('minimal')
    expect(review.props.hideBackButton).toBe(false)
    // Đóng modal (back hai lần) → màn xem.
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import/pn-1')
    expect(rootRoutes()).toEqual(['(tabs)'])
    // Link cũ của checklist cũng sang màn soạn (modal) với người chỉ sửa được: checklist bị bỏ khỏi
    // tab, modal ở bước 2.
    await go('/import/pn-1/receive')
    expect(screen).toHavePathname('/import-form/pn-1/edit')
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    expect(stackOf('import')).toEqual(['index', '[formSlug]/index:pn-1'])
    expect(stackOf('import-form')).toEqual(['[formSlug]/edit:pn-1'])
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('MANAGER (xác nhận + sửa): màn xem có "Kiểm hàng" và menu ⋯ → "Sửa phiếu" → màn soạn /import-form/pn-1/edit', async () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.0')
    signedIn({ scope: [...CHECKER, 'IMPORT_FORM_UPDATE_DRAFT'], warehouses: [WH1] })
    draftFormOfWh1()
    await openFormFromList()
    expect(within(tabScreen('Nhập')).getByRole('button', { name: 'Kiểm hàng' })).toBeOnTheScreen()
    // ⋯ = menu thả xuống gốc (như form 3 bước), không phải action sheet.
    await pressTopHeaderMenuItem('Sửa phiếu')
    expect(screen).toHavePathname('/import-form/pn-1/edit')
    expect(topModalHeader().props.title).toBe('Sửa phiếu')
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('compose → Thêm vật tư opens /import-pick sheet', async () => {
    signedIn({
      scope: [...ALL, 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT'],
      warehouses: [WH1],
    })
    draftFormOfWh1()
    await boot()
    await go('/import-form/pn-1/edit')
    expect(screen).toHavePathname('/import-form/pn-1/edit')
    await fireEvent.press(within(formModal()).getByRole('button', { name: 'Thêm vật tư' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-pick')
    expect(screen.getByTestId('import-pick-sheet')).toBeOnTheScreen()
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form', 'import-pick'])
    // Đóng sheet trước khi dọn bản nháp (guard của sheet đang hiện lật → expo-router `replace` sang home).
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/pn-1/edit')
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('người chỉ sửa nháp (không IMPORT_FORM_CREATE): màn soạn không có "Thêm vật tư", /import-pick bị khoá', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_UPDATE_DRAFT'], warehouses: [WH1] })
    draftFormOfWh1()
    await boot()
    await go('/import-form/pn-1/edit')
    expect(screen).toHavePathname('/import-form/pn-1/edit')
    const form = within(formModal())
    expect(form.getByText('Xi măng PCB40')).toBeOnTheScreen()
    expect(form.queryByRole('button', { name: 'Thêm vật tư' })).toBeNull()
    // Đóng modal trước: link tới sheet bị khoá khi modal đang mở → expo-router `replace` sang home, đè
    // một `(tabs)` lên trên modal (hành vi sẵn có của guard sheet). Bản nháp vẫn còn trong store → sheet
    // chỉ bị khoá vì thiếu IMPORT_FORM_CREATE.
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    expect(rootRoutes()).toEqual(['(tabs)'])
    expect(useReceiveDraft.getState().draft).not.toBeNull()
    await go('/import-pick')
    expect(screen).not.toHavePathname('/import-pick')
    expect(screen.queryByTestId('import-pick-sheet')).toBeNull()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('kiểm một dòng rồi quay lại màn xem → nút "Kiểm hàng · đã kiểm 1/1"', async () => {
    signedIn({ scope: CHECKER, warehouses: [WH1] })
    draftFormOfWh1()
    await openFormFromList()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Kiểm hàng' }))
    await act(() => jest.runAllTimersAsync())
    await fireEvent.press(
      within(tabScreen('Nhập')).getByRole('checkbox', { name: /Xi măng PCB40/ }),
    )
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import/pn-1')
    expect(
      within(tabScreen('Nhập')).getByRole('button', { name: 'Kiểm hàng · đã kiểm 1/1' }),
    ).toBeOnTheScreen()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('Xác nhận nhập kho ở màn kiểm → về màn xem, phiếu hiện Đã xác nhận, hết nút "Kiểm hàng"', async () => {
    let status = 'DRAFT'
    signedIn({ scope: [...ALL, 'IMPORT_FORM_CONFIRM'], warehouses: [WH1] })
    draftFormOfWh1(() => status)
    route('post', '/warehouses/wh-1/import-forms/pn-1/confirm', () => {
      status = 'CONFIRMED'
      return ok({})
    })
    // Hộp hỏi gốc (iOS action sheet): bấm nút xác nhận (chỉ số 0).
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(0))
    await openFormFromList()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Kiểm hàng' }))
    await act(() => jest.runAllTimersAsync())
    await fireEvent.press(
      within(tabScreen('Nhập')).getByRole('checkbox', { name: /Xi măng PCB40/ }),
    )
    await fireEvent.press(
      within(tabScreen('Nhập')).getByRole('button', { name: 'Xác nhận nhập kho' }),
    )
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import/pn-1')
    const tab = within(tabScreen('Nhập'))
    expect(tab.getByText('Đã xác nhận')).toBeOnTheScreen()
    expect(tab.getByText('Lê Thu Hà')).toBeOnTheScreen()
    expect(tab.queryByRole('button', { name: /^Kiểm hàng/ })).toBeNull()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('phiếu đã xác nhận ở nơi khác: mở màn xem → bản nháp kiểm dở trên máy bị bỏ', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    draftFormOfWh1(() => 'CONFIRMED')
    const key = 'warehouse.receiveDraft.root.wh-1.pn-1'
    await kv.set(key, makeDraft([makeLine(1, { checked: true })], { formSlug: 'pn-1' }))
    await openFormFromList()
    expect(screen).toHavePathname('/import/pn-1')
    expect(within(tabScreen('Nhập')).getByText('Đã xác nhận')).toBeOnTheScreen()
    expect(await kv.get(key)).toBeNull()
  })

  it('phiếu bị xác nhận trên web lúc đang ở màn kiểm → màn kiểm vẫn tự báo "không còn Nháp" (màn xem bên dưới không dọn trước)', async () => {
    let status = 'DRAFT'
    signedIn({ scope: CHECKER, warehouses: [WH1] })
    draftFormOfWh1(() => status)
    const key = 'warehouse.receiveDraft.root.wh-1.pn-1'
    await openFormFromList()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Kiểm hàng' }))
    await act(() => jest.runAllTimersAsync())
    await fireEvent.press(
      within(tabScreen('Nhập')).getByRole('checkbox', { name: /Xi măng PCB40/ }),
    )
    await act(() => jest.runAllTimersAsync())
    expect(await kv.get(key)).not.toBeNull()
    status = 'CONFIRMED'
    await act(async () => queryClient.invalidateQueries({ queryKey: ['import-forms'] }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import/pn-1/receive')
    expect(
      within(tabScreen('Nhập')).getByText(
        'Phiếu không còn ở trạng thái Nháp (đã được xác nhận hoặc huỷ). Đã bỏ dấu đã kiểm và số đã sửa trên máy.',
      ),
    ).toBeOnTheScreen()
    expect(await kv.get(key)).toBeNull()
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    expect(within(tabScreen('Nhập')).getByText('Đã xác nhận')).toBeOnTheScreen()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('đổi kho khi đang ở màn kiểm (màn xem nằm dưới) → về danh sách, đúng một popToTop, không lỗi', async () => {
    signedIn({ scope: CHECKER, warehouses: [WH1, WH2] })
    await kv.set('warehouse.lastWarehouse.root', 'wh-1')
    draftFormOfWh1()
    await openFormFromList()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Kiểm hàng' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import/pn-1/receive')
    const errors = jest.spyOn(console, 'error')
    const pops = jest.spyOn(StackActions, 'popToTop')
    await act(async () => useWarehouseStore.getState().select(WH2))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import')
    expect(nativeHeaders(tabScreen('Nhập'))).toEqual([{ title: 'Nhập kho', largeTitle: true }])
    expect(pops).toHaveBeenCalledTimes(1)
    expect(errors).not.toHaveBeenCalled()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('tab Nhập có xem + kiểm, đổi kho qua sheet từ tab Tài khoản → sheet KHÔNG bị đóng sớm, tab Nhập về danh sách', async () => {
    signedIn({ scope: CHECKER, warehouses: [WH1, WH2] })
    await kv.set('warehouse.lastWarehouse.root', 'wh-1')
    draftFormOfWh1()
    await openFormFromList()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Kiểm hàng' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import/pn-1/receive')
    await go('/account')
    await fireEvent.press(screen.getByRole('button', { name: 'Kho, Kho Tổng' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/switch-warehouse')
    await fireEvent.press(screen.getByRole('button', { name: /Kho Thủ Đức/ }))
    await act(() => jest.runAllTimersAsync())

    const errors = jest.spyOn(console, 'error')
    const pops = jest.spyOn(StackActions, 'popToTop')
    // ✓ (Xong): ghi kho → rung thành công → đóng sau 350ms (useSheetSubmit). Không chạy hết hẹn giờ.
    const done = headerButtons().find(({ item }) => item.title === 'Xong')!
    await fireEvent(done.config, 'pressHeaderBarButtonItem', {
      nativeEvent: { buttonId: done.item.buttonId },
    })
    await act(() => jest.advanceTimersByTimeAsync(100))
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-2')
    // POP_TO_TOP thứ hai từng nổi lên Stack GỐC và đóng sheet ngay.
    expect(screen).toHavePathname('/switch-warehouse')
    expect(pops).toHaveBeenCalledTimes(1)
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/account')
    await go('/import')
    expect(screen).toHavePathname('/import')
    expect(nativeHeaders(tabScreen('Nhập'))).toEqual([{ title: 'Nhập kho', largeTitle: true }])
    expect(pops).toHaveBeenCalledTimes(1)
    expect(errors).not.toHaveBeenCalled()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('import list + opens /import-form/new/info (bước 1 "Phiếu nhập mới"; Tiếp tục → bước 2, back → bước 1; quay lại rồi "+" mở lại đúng bản nháp)', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_CREATE'], warehouses: [WH1] })
    await boot()
    const tab = tabScreen('Nhập')
    // Header của tab Nhập bên phải chỉ có Lọc (+ nút kho); "+" là nút nổi phía trên thanh tab.
    const [config] = tab.queryAll(
      (n) => n.type === 'RNSScreenStackHeaderConfig' && n.props.hidden === false,
    )
    expect(
      ((config.props.headerRightBarButtonItems ?? []) as { title?: string }[])
        .filter((i) => i.title)
        .map((i) => i.title),
    ).toEqual(['Lọc'])
    await fireEvent.press(within(tab).getByRole('button', { name: 'Tạo phiếu nhập' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/new/info')
    expect(topModalHeader().props.title).toBe('Phiếu nhập mới')
    const form = within(formModal())
    expect(form.getByLabelText('Bước 1 trên 3, Thông tin, đang ở đây')).toBeOnTheScreen()
    expect(form.getByLabelText('Mã phiếu').props.value).toMatch(/^PN-\d{8}-\d{4}$/)
    expect(form.getByText('Còn thiếu: Số HĐ')).toBeOnTheScreen()
    expect(form.getByRole('button', { name: 'Tiếp tục' }).props.accessibilityHint).toBe(
      'Còn thiếu: Số HĐ',
    )
    await fireEvent.changeText(form.getByLabelText('Mã phiếu'), 'pn-moi')
    await fireEvent.changeText(form.getByLabelText('Số HĐ'), 'HD-1')
    await act(() => jest.runAllTimersAsync())
    expect(form.queryByText(/^Còn thiếu/)).toBeNull()
    // Tiếp tục → bước 2 (đẩy lên trên bước 1); back gốc lùi đúng một bước.
    await fireEvent.press(form.getByRole('button', { name: 'Tiếp tục' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/new/edit')
    expect(
      within(screen.getByTestId('import-items-summary')).getByText(' · Chưa có vật tư'),
    ).toBeOnTheScreen()
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/new/info')
    // Quay về danh sách (đóng modal), "+" mở lại bước 1 với bản nháp vừa gõ.
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import')
    expect(rootRoutes()).toEqual(['(tabs)'])
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Tạo phiếu nhập' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/new/info')
    expect(within(formModal()).getByLabelText('Mã phiếu').props.value).toBe('PN-MOI')
    // Route xem với 'new' và link cũ của checklist → bước 1 (modal), Stack tab chỉ còn danh sách.
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    await go('/import/new')
    expect(screen).toHavePathname('/import-form/new/info')
    expect(stackOf('import')).toEqual(['index'])
    await act(async () => router.back())
    await act(() => jest.runAllTimersAsync())
    await go('/import/new/receive')
    expect(screen).toHavePathname('/import-form/new/info')
    expect(stackOf('import')).toEqual(['index'])
    expect(within(formModal()).getByLabelText('Số HĐ').props.value).toBe('HD-1')
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('"+" tab Nhập → /import-form/new/info, thanh tab bị che (route gốc import-form là đỉnh), header trái ✕', async () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.0')
    signedIn({ scope: [...ALL, 'IMPORT_FORM_CREATE'], warehouses: [WH1] })
    await boot()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Tạo phiếu nhập' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/new/info')
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    expect(stackOf('import')).toEqual(['index'])
    expect(stackOf('import-form')).toEqual(['[formSlug]/info:new'])
    // Modal toàn màn, không vuốt xuống để đóng.
    expect(formModal().props.gestureEnabled).toBe(false)
    expect(leftSymbols(topModalHeader())).toEqual(['xmark'])
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('"+" bấm hai lần liền → chỉ MỘT modal, mở thẳng (không màn trung gian trong tab)', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_CREATE'], warehouses: [WH1] })
    await boot()
    const pops = jest.spyOn(StackActions, 'pop')
    const replaces = jest.spyOn(StackActions, 'replace')
    // Cùng một nút bấm hai lần trước khi modal kịp che (lần hai không chờ hẹn giờ).
    const fab = within(tabScreen('Nhập')).getByRole('button', { name: 'Tạo phiếu nhập' })
    await fireEvent.press(fab)
    await fireEvent.press(fab)
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/new/info')
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    expect(stackOf('import')).toEqual(['index'])
    expect(stackOf('import-form')).toEqual(['[formSlug]/info:new'])
    expect(pops).not.toHaveBeenCalled()
    expect(replaces).not.toHaveBeenCalled()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('màn xem pn-1 "Sửa phiếu" bấm hai lần liền → chỉ MỘT modal', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_UPDATE_DRAFT'], warehouses: [WH1] })
    draftFormOfWh1()
    await openFormFromList()
    const edit = within(tabScreen('Nhập')).getByRole('button', { name: 'Sửa phiếu' })
    await fireEvent.press(edit)
    await fireEvent.press(edit)
    await act(() => jest.runAllTimersAsync())
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    expect(stackOf('import-form')).toEqual(['[formSlug]/edit:pn-1'])
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('màn xem phiếu xuất Nháp "Sửa phiếu" bấm hai lần liền → chỉ MỘT modal', async () => {
    signedIn({
      scope: ['EXPORT_FORM_READ', 'EXPORT_FORM_UPDATE_DRAFT_OWN', ...ALL],
      warehouses: [WH1],
    })
    stockOfWh1()
    draftExportOfWh1()
    await boot()
    await go('/export/px-1')
    const edit = within(tabScreen('Xuất')).getByRole('button', { name: 'Sửa phiếu' })
    await fireEvent.press(edit)
    await fireEvent.press(edit)
    await act(() => jest.runAllTimersAsync())
    expect(rootRoutes()).toEqual(['(tabs)', 'export-form'])
    expect(stackOf('export-form')).toEqual(['[formSlug]/edit:px-1'])
  })

  it('màn xem pn-1 "Sửa phiếu" mở thẳng modal (không pop / replace trong tab)', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_UPDATE_DRAFT'], warehouses: [WH1] })
    draftFormOfWh1()
    await openFormFromList()
    const pops = jest.spyOn(StackActions, 'pop')
    const replaces = jest.spyOn(StackActions, 'replace')
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Sửa phiếu' }))
    await act(() => jest.runAllTimersAsync())
    expect(stackOf('import')).toEqual(['index', '[formSlug]/index:pn-1'])
    expect(stackOf('import-form')).toEqual(['[formSlug]/edit:pn-1'])
    expect(pops).not.toHaveBeenCalled()
    expect(replaces).not.toHaveBeenCalled()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('đổi kho khi modal đang mở (Sửa phiếu từ màn xem) → modal đóng, tab về danh sách, không lỗi', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_UPDATE_DRAFT'], warehouses: [WH1, WH2] })
    await kv.set('warehouse.lastWarehouse.root', 'wh-1')
    draftFormOfWh1()
    await openFormFromList()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Sửa phiếu' }))
    await act(() => jest.runAllTimersAsync())
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    const errors = jest.spyOn(console, 'error')
    await act(async () => useWarehouseStore.getState().select(WH2))
    await act(() => jest.runAllTimersAsync())
    expect(rootRoutes()).toEqual(['(tabs)'])
    expect(stackOf('import')).toEqual(['index'])
    expect(screen).toHavePathname('/import')
    expect(errors).not.toHaveBeenCalled()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('đổi kho khi modal phiếu mới đang mở ở bước 2 → modal đóng, danh sách', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_CREATE'], warehouses: [WH1, WH2] })
    await kv.set('warehouse.lastWarehouse.root', 'wh-1')
    await boot()
    await go('/import-form/new/info')
    await act(async () => useReceiveDraft.getState().setHeader({ invoiceCode: 'HD-1' }))
    await fireEvent.press(within(formModal()).getByRole('button', { name: 'Tiếp tục' }))
    await act(() => jest.runAllTimersAsync())
    expect(stackOf('import-form')).toEqual(['[formSlug]/info:new', '[formSlug]/edit:new'])
    const errors = jest.spyOn(console, 'error')
    await act(async () => useWarehouseStore.getState().select(WH2))
    await act(() => jest.runAllTimersAsync())
    expect(rootRoutes()).toEqual(['(tabs)'])
    expect(stackOf('import')).toEqual(['index'])
    expect(errors).not.toHaveBeenCalled()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('/import/pn-1/edit (link cũ) → /import-form/pn-1/edit', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_UPDATE_DRAFT'], warehouses: [WH1] })
    draftFormOfWh1()
    await boot()
    await go('/import/pn-1/edit')
    expect(screen).toHavePathname('/import-form/pn-1/edit')
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    expect(stackOf('import')).toEqual(['index'])
    expect(stackOf('import-form')).toEqual(['[formSlug]/edit:pn-1'])
    expect(within(formModal()).getByText('Xi măng PCB40')).toBeOnTheScreen()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('sheet /import-line mở trên modal rồi đóng → về /import-form/pn-1/edit, modal còn', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_UPDATE_DRAFT'], warehouses: [WH1] })
    draftFormOfWh1()
    await openFormFromList()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Sửa phiếu' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/pn-1/edit')
    await fireEvent.press(
      within(formModal()).getByRole('button', { name: /^Xi măng PCB40, 10 bao/ }),
    )
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-line')
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form', 'import-line'])
    await pressTopHeaderButton('Đóng')
    expect(screen).toHavePathname('/import-form/pn-1/edit')
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    expect(stackOf('import-form')).toEqual(['[formSlug]/edit:pn-1'])
    expect(stackOf('import')).toEqual(['index', '[formSlug]/index:pn-1'])
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('mất IMPORT_FORM_READ khi modal mở → về tab còn lại (home), không còn import-form trong Stack gốc', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_UPDATE_DRAFT'], warehouses: [WH1] })
    draftFormOfWh1()
    await boot()
    await go('/import-form/pn-1/edit')
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    const user = useAuthStore.getState().user!
    await act(async () =>
      useAuthStore.getState().setUser({ ...user, scope: ['EXPORT_FORM_READ', 'MATERIAL_READ'] }),
    )
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/export')
    // Route bị khoá đang hiện → expo-router `replace` sang `home` (một `(tabs)` mới, như sheet bị khoá).
    expect(rootRoutes()).not.toContain('import-form')
    expect(rootRoutes().at(-1)).toBe('(tabs)')
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('hết phiên khi modal mở → /login, không còn import-form trong Stack gốc', async () => {
    signedIn({ scope: [...ALL, 'IMPORT_FORM_CREATE'], warehouses: [WH1] })
    await boot()
    await go('/import-form/new/info')
    expect(rootRoutes()).toEqual(['(tabs)', 'import-form'])
    // `(tabs)` và modal cùng mất guard trong một lượt render: trước khi chuyển sang /login, modal thoáng là
    // màn đầu Stack gốc → expo-router (dev) cảnh báo đúng câu này. Chỉ nuốt câu đó, câu khác vẫn in.
    const print = console.warn.bind(console)
    const warn = jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      if (
        !/"import-form" uses presentation "fullScreenModal" but is the first/.test(String(args[0]))
      )
        print(...args)
    })
    await act(async () => useAuthStore.getState().endSession('expired'))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/login')
    expect(rootRoutes()).toEqual(['login'])
    warn.mockRestore()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('phiếu mới: Lưu nháp → danh sách (bước 3, không hỏi lại; không còn bước nào của "new")', async () => {
    signedIn({ scope: [...CHECKER, 'IMPORT_FORM_CREATE'], warehouses: [WH1] })
    await kv.set(
      'warehouse.receiveDraft.root.wh-1.new',
      makeDraft([makeLine(1, { base: null, quantity: 5 })], {
        formSlug: 'new',
        version: null,
        headerBase: null,
        header: { ...makeDraft([]).header, code: 'PN-MOI' },
      }),
    )
    const created = {
      slug: 'pn-9',
      code: 'PN-MOI',
      invoiceCode: 'HD-1',
      purchaseOrder: null,
      requesterSlug: 'root',
      requesterName: 'root',
      approverName: null,
      date: '2026-11-04',
      total: 5000,
      status: 'DRAFT',
      version: 1,
      warehouseSlug: 'wh-1',
      items: [
        {
          slug: 'it-9',
          lineNo: 1,
          materialSlug: 'm-1',
          materialCode: 'VT1',
          materialName: 'Vật tư 1',
          unitSlug: 'u-1',
          unitName: 'bao',
          supplierSlug: null,
          supplierName: null,
          quantity: 5,
          unitPrice: 1000,
          amount: 5000,
          note: null,
          expiryDate: null,
        },
      ],
    }
    route('post', '/warehouses/wh-1/import-forms', () => ok(created))
    route('get', '/warehouses/wh-1/import-forms/pn-9', () => ok(created))
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    await boot()
    await fireEvent.press(within(tabScreen('Nhập')).getByRole('button', { name: 'Tạo phiếu nhập' }))
    await act(() => jest.runAllTimersAsync())
    expect(screen).toHavePathname('/import-form/new/info')
    // Nhiều bước cùng gắn: bấm nút của màn TRÊN CÙNG (mục cuối).
    const press = async (name: string) => {
      await fireEvent.press(within(formModal()).getAllByRole('button', { name }).at(-1)!)
      await act(() => jest.runAllTimersAsync())
    }
    await press('Tiếp tục')
    expect(screen).toHavePathname('/import-form/new/edit')
    await press('Tiếp tục')
    expect(screen).toHavePathname('/import-form/new/review')
    await press('Lưu nháp')
    // Bước 3 chính là bước xác nhận: không hộp hỏi.
    expect(sheet).not.toHaveBeenCalled()
    // Tạo phiếu mới xong → về thẳng danh sách, modal đã đóng (chốt 2026-11-08).
    expect(screen).toHavePathname('/import')
    expect(rootRoutes()).toEqual(['(tabs)'])
    expect(stackOf('import')).toEqual(['index'])
    expect(screen.queryByLabelText('Mã phiếu')).toBeNull()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('thiếu IMPORT_FORM_CREATE (deep link) → /import/create, /import-form/new/info, /import/new/edit không mở modal, về danh sách', async () => {
    signedIn({ scope: ALL, warehouses: [WH1] })
    await kv.set(
      'warehouse.receiveDraft.root.wh-1.new',
      makeDraft([], {
        formSlug: 'new',
        version: null,
        header: { ...makeDraft([]).header, code: 'PN-MOI' },
      }),
    )
    await boot()
    for (const href of ['/import/create', '/import-form/new/info', '/import/new/edit']) {
      await go(href)
      expect(screen).toHavePathname('/import')
      expect(rootRoutes()).toEqual(['(tabs)'])
      expect(stackOf('import')).toEqual(['index'])
    }
    expect(screen.queryByLabelText('Mã phiếu')).toBeNull()
  })

  it('thiếu IMPORT_FORM_CREATE (deep link) → /import-add-line bị khoá, về tab đầu', async () => {
    signedIn({ scope: ['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT'], warehouses: [WH1] })
    await boot()
    await act(async () =>
      useReceiveDraft.setState({
        ctx: { userSlug: 'root', warehouseSlug: 'wh-1', formSlug: 'pn-1' },
        draft: makeDraft([makeLine(1)]),
      }),
    )
    await go('/import-add-line')
    expect(screen).toHavePathname('/import')
    expect(screen.queryByTestId('add-line-sheet')).toBeNull()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('có IMPORT_FORM_CREATE, đang ở tab: /import-add-line mở sheet thêm vật tư của bản nháp', async () => {
    signedIn({ scope: ['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE'], warehouses: [WH1] })
    await boot()
    await act(async () =>
      useReceiveDraft.setState({
        ctx: { userSlug: 'root', warehouseSlug: 'wh-1', formSlug: 'new' },
        draft: makeDraft([], { formSlug: 'new', version: null }),
      }),
    )
    await go('/import-add-line')
    expect(screen).toHavePathname('/import-add-line')
    expect(screen.getByTestId('add-line-sheet')).toBeOnTheScreen()
    await act(async () => useReceiveDraft.getState().reset())
  })

  it('thiếu IMPORT_FORM_READ → không có tab Nhập', async () => {
    signedIn({ scope: ['EXPORT_FORM_READ', 'MATERIAL_READ'], warehouses: [WH1] })
    await boot()
    expect(tabBar().map((t) => t.title)).not.toContain('Nhập')
  })

  it('thiếu WAREHOUSE_READ → không có tab Tồn kho, /stock không tới được', async () => {
    signedIn({ scope: ['IMPORT_FORM_READ', 'MATERIAL_READ'], warehouses: [WH1] })
    await boot()
    expect(screen).toHavePathname('/import')
    expect(tabBar().map((t) => t.title)).toEqual(['Nhập', 'Tài khoản'])
    await go('/stock')
    expect(screen).not.toHavePathname('/stock')
  })
})
