// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import type {
  NativeStackHeaderItem,
  NativeStackHeaderItemMenu,
  NativeStackHeaderItemMenuAction,
  NativeStackHeaderItemMenuSubmenu,
  NativeStackNavigationOptions,
} from 'expo-router'
import { Platform } from 'react-native'

import type { InventoryItem } from '@/entities/inventory'
import { item } from '@/entities/inventory/model/fixtures'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { lightColors } from '@/shared/theme/tokens'

import { StockListScreen } from './StockListScreen'
import { resetStockFilterOnWarehouseChange, useStockFilter } from './stock-filter.store'

const mockPush = jest.fn()
const mockNavigate = jest.fn()
/** Options mà màn khai cho header native qua `<Stack.Screen options>` (lần render gần nhất). */
const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
  Stack: {
    Screen: ({ options }: { options: NativeStackNavigationOptions }) => {
      mockHeader.options = options
      return null
    },
  },
}))

/** Mọi tiêu đề `EmptyState` đã từng vẽ — bắt cả khung hình thoáng qua. */
const mockEmptyTitles: string[] = []
jest.mock('@/shared/ui', () => {
  const actual = jest.requireActual('@/shared/ui')
  return {
    ...actual,
    EmptyState: (props: { title: string }) => {
      mockEmptyTitles.push(props.title)
      return actual.EmptyState(props)
    },
  }
})

const WH_A = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const WH_B = { slug: 'wh-b', code: 'B', name: 'Kho Thủ Đức', isManager: false }

const unit = (name: string) => ({ slug: `u-${name}`, code: name.toUpperCase(), name })

/** 5 vật tư của mockup (phone 1). */
const MOCKUP: InventoryItem[] = [
  item({
    slug: 'i-xm',
    materialSlug: 'xi-mang-pcb40',
    materialCode: 'VT-XM-040',
    materialName: 'Xi măng Hà Tiên PCB40',
    quantity: 168,
    reservedQuantity: 30,
    availableQuantity: 138,
    effectiveMinimumInventory: 200,
    effectiveMaximumInventory: 800,
    isBelowMinimum: true,
    typeSlug: 'xi-mang',
    typeName: 'Xi măng',
    baseUnit: unit('bao'),
  }),
  item({
    slug: 'i-sn',
    materialSlug: 'son-dulux',
    materialCode: 'VT-SN-018',
    materialName: 'Sơn Dulux chống thấm 18L',
    quantity: 0,
    availableQuantity: 0,
    effectiveMinimumInventory: 10,
    effectiveMaximumInventory: 50,
    isBelowMinimum: true,
    typeSlug: 'son',
    typeName: 'Sơn',
    baseUnit: unit('thùng'),
  }),
  item({
    slug: 'i-tt',
    materialSlug: 'thep-tam',
    materialCode: 'VT-TT-003',
    materialName: 'Thép tấm SS400 dày 3ly',
    quantity: 42,
    reservedQuantity: 8,
    availableQuantity: 34,
    effectiveMinimumInventory: 10,
    effectiveMaximumInventory: 100,
    typeSlug: 'thep',
    typeName: 'Thép',
    baseUnit: unit('tấm'),
  }),
  item({
    slug: 'i-qh',
    materialSlug: 'que-han',
    materialCode: 'VT-QH-032',
    materialName: 'Que hàn Kim Tín KT-421 Ø3.2',
    quantity: 126.5,
    availableQuantity: 126.5,
    effectiveMinimumInventory: 20,
    effectiveMaximumInventory: 300,
    typeSlug: 'vat-tu-han',
    typeName: 'Vật tư hàn',
    baseUnit: unit('kg'),
  }),
  item({
    slug: 'i-bl',
    materialSlug: 'bu-long',
    materialCode: 'VT-BL-125',
    materialName: 'Bu lông M12×50 mạ kẽm',
    quantity: 96,
    availableQuantity: 96,
    effectiveMinimumInventory: 10,
    effectiveMaximumInventory: 60,
    isAboveMaximum: true,
    typeSlug: 'bu-long',
    typeName: 'Bu lông',
    baseUnit: unit('hộp'),
  }),
]
const NAMES = MOCKUP.map((i) => i.materialName)

const page = (items: object[]) =>
  ok({
    items,
    total: items.length,
    page: 1,
    pageSize: 100,
    totalPages: 1,
    hasNext: false,
    hasPrevios: false,
  })

let client: QueryClient

/**
 * Chờ mọi request của react-query xong (axios + interceptor cần vài lượt macrotask), TRONG `act` để
 * React vẽ lại kết quả trước khi khẳng định.
 */
async function settled() {
  await act(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    await tick()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await tick()
    await tick()
  })
}

/** Một lượt macrotask trong `act` (react-query báo trạng thái mới qua `setTimeout(0)`). */
const tick = () => act(async () => new Promise((r) => setTimeout(r, 0)))

async function show({ settle = true } = {}) {
  await render(
    <QueryClientProvider client={client}>
      <StockListScreen />
    </QueryClientProvider>,
  )
  if (settle) await settled()
}

const row = (name: string | RegExp) => screen.getByRole('button', { name })

const SEARCH_LABEL = 'Tên hoặc mã vật tư'

/** Gõ vào ô tìm kiếm (SearchField ở đầu danh sách). */
async function typeSearch(text: string) {
  await act(async () => fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), text))
}

const rightItems = (): NativeStackHeaderItem[] =>
  mockHeader.options.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: false }) ?? []

const filterMenu = () =>
  rightItems().find((i): i is NativeStackHeaderItemMenu => i.type === 'menu')!

const section = (label: string) =>
  filterMenu().menu.items.find(
    (i): i is NativeStackHeaderItemMenuSubmenu => i.type === 'submenu' && i.label === label,
  )!

const actionsOf = (label: string) =>
  section(label).items.filter((i): i is NativeStackHeaderItemMenuAction => i.type === 'action')

/** Chọn một mục trong menu Lọc (mục `label` trong nhóm `group`). */
async function choose(group: string, label: string) {
  const action = actionsOf(group).find((a) => a.label === label)
  if (!action) throw new Error(`Không có mục "${label}" trong nhóm "${group}"`)
  await act(async () => action.onPress())
}

const checked = (group: string) =>
  actionsOf(group)
    .filter((a) => a.state === 'on')
    .map((a) => a.label)

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockHeader.options = {}
  mockEmptyTitles.length = 0
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useStockFilter.getState().reset()
  useWarehouseStore.setState({ current: WH_A, resolved: true, resolution: 'selected' })
})

afterEach(() => {
  client.clear()
  // Trả lại `Platform.OS` đã thay bằng `jest.replaceProperty` (test Android).
  jest.restoreAllMocks()
})

describe('StockListScreen — danh sách', () => {
  it('5 vật tư của mockup: dòng phụ "mã · loại · giữ n", số tồn + đơn vị, viên nhãn mức tồn', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    for (const name of NAMES) expect(screen.getByText(name)).toBeOnTheScreen()

    const xm = within(row(/^Xi măng Hà Tiên PCB40/))
    expect(xm.getByText('VT-XM-040 · Xi măng · giữ 30')).toBeOnTheScreen()
    expect(xm.getByText('168')).toBeOnTheScreen()
    expect(xm.getByText('bao')).toBeOnTheScreen()
    expect(xm.getByText('Thiếu')).toBeOnTheScreen()
    expect(within(row(/^Sơn Dulux/)).getByText('Hết')).toBeOnTheScreen()
    expect(within(row(/^Bu lông/)).getByText('Vượt')).toBeOnTheScreen()
    const tt = within(row(/^Thép tấm/))
    expect(tt.getByText('VT-TT-003 · Thép · giữ 8')).toBeOnTheScreen()
    const qh = within(row(/^Que hàn/))
    expect(qh.getByText('VT-QH-032 · Vật tư hàn')).toBeOnTheScreen()
    // Số lẻ theo locale vi; dòng bình thường không có viên nhãn.
    expect(qh.getByText('126,5')).toBeOnTheScreen()
    expect(qh.queryByText(/^(Hết|Thiếu|Vượt)$/)).toBeNull()
    // Nhãn đọc màn hình ghi đủ chữ mức tồn.
    expect(row(/^Xi măng Hà Tiên PCB40/).props.accessibilityLabel).toContain('Dưới tối thiểu')
  })

  it('mã vật tư trên dòng phụ dùng font code (đơn cách hệ thống)', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    expect(within(row(/^Xi măng Hà Tiên PCB40/)).getByText('VT-XM-040')).toHaveStyle({
      fontFamily: 'ui-monospace',
    })
  })

  it('chữ đỏ "Hết" (viên nhãn + tổng quan) dùng destructiveText — đủ tương phản AA trên nền nhạt', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    expect(within(row(/^Sơn Dulux/)).getByText('Hết')).toHaveStyle({
      color: lightColors.destructiveText,
    })
    expect(within(screen.getByTestId('stock-overview')).getByText('1 hết')).toHaveStyle({
      color: lightColors.destructiveText,
    })
  })

  it('hai nhóm: "Cần chú ý · 3" (hết → dưới min → vượt max) rồi "Bình thường · 2" (theo tên)', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    const headers = screen.getAllByRole('header').map((h) => h.props.children)
    expect(headers).toEqual(['Cần chú ý · 3', 'Bình thường · 2'])
    const order = screen
      .getAllByTestId('stock-row')
      .map((r) => (r.props.accessibilityLabel as string).split(',')[0])
    expect(order).toEqual([
      'Sơn Dulux chống thấm 18L',
      'Xi măng Hà Tiên PCB40',
      'Bu lông M12×50 mạ kẽm',
      'Que hàn Kim Tín KT-421 Ø3.2',
      'Thép tấm SS400 dày 3ly',
    ])
  })

  it('thanh tổng quan đếm cả kho: "5 vật tư" + "1 hết · 1 dưới · 1 vượt"; tìm kiếm không đổi số, chỉ đổi số nhóm', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    const overview = within(screen.getByTestId('stock-overview'))
    expect(overview.getByText('5 vật tư')).toBeOnTheScreen()
    expect(overview.getByText('1 hết · 1 dưới · 1 vượt')).toBeOnTheScreen()

    await typeSearch('xi mang')
    expect(within(screen.getByTestId('stock-overview')).getByText('5 vật tư')).toBeOnTheScreen()
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Cần chú ý · 1'])
  })

  it('kho không có vật tư cần chú ý → chỉ nhóm "Bình thường", tổng quan ghi "Không có cảnh báo"', async () => {
    route('get', '/warehouses/wh-a/materials', () =>
      page(MOCKUP.filter((i) => !i.isBelowMinimum && !i.isAboveMaximum && i.quantity > 0)),
    )
    await show()
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Bình thường · 2'])
    expect(
      within(screen.getByTestId('stock-overview')).getByText('Không có cảnh báo'),
    ).toBeOnTheScreen()
  })

  it('chạm dòng → push chi tiết với đúng materialSlug', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    await fireEvent.press(row(/^Xi măng Hà Tiên PCB40/))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/stock/[materialSlug]',
      params: { materialSlug: 'xi-mang-pcb40' },
    })
  })
})

describe('StockListScreen — header native: menu Lọc', () => {
  beforeEach(() => route('get', '/warehouses/wh-a/materials', () => page(MOCKUP)))

  it('iOS: KHÔNG dùng ô tìm native (nháy khi đổi tab, iOS 26); bên phải: Quét mã, Lọc, rồi nút kho (ngoài cùng)', async () => {
    await show()
    expect(mockHeader.options.headerSearchBarOptions).toBeUndefined()
    expect(screen.getByLabelText(SEARCH_LABEL)).toBeOnTheScreen()
    expect(rightItems().map((i) => i.type)).toEqual(['button', 'menu', 'spacing', 'custom'])
    expect(mockHeader.options.unstable_headerLeftItems).toBeUndefined()
    expect(filterMenu()).toMatchObject({
      label: 'Lọc',
      icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease.circle' },
    })
  })

  it('menu có hai nhóm chọn một: "Mức tồn" và "Loại vật tư" (mặc định Tất cả / Tất cả loại)', async () => {
    await show()
    expect(filterMenu().menu.items.map((i) => (i.type === 'submenu' ? i.label : i.type))).toEqual([
      'Mức tồn',
      'Loại vật tư',
    ])
    expect(section('Mức tồn')).toMatchObject({ inline: true })
    expect(actionsOf('Mức tồn').map((a) => a.label)).toEqual([
      'Tất cả',
      'Dưới tối thiểu',
      'Vượt tối đa',
    ])
    expect(actionsOf('Loại vật tư').map((a) => a.label)).toEqual([
      'Tất cả loại',
      'Bu lông',
      'Sơn',
      'Thép',
      'Vật tư hàn',
      'Xi măng',
    ])
    expect(checked('Mức tồn')).toEqual(['Tất cả'])
    expect(checked('Loại vật tư')).toEqual(['Tất cả loại'])
  })

  it('gõ "xi mang" (không dấu) → còn 1 dòng; tìm theo mã', async () => {
    await show()
    await typeSearch('xi mang')
    expect(screen.getByText('Xi măng Hà Tiên PCB40')).toBeOnTheScreen()
    for (const name of NAMES.slice(1)) expect(screen.queryByText(name)).toBeNull()
    await typeSearch('vt-bl')
    expect(screen.getByText('Bu lông M12×50 mạ kẽm')).toBeOnTheScreen()
    expect(screen.queryByText('Xi măng Hà Tiên PCB40')).toBeNull()
  })

  it('Lọc "Dưới tối thiểu" → chỉ dòng thấp/hết, dấu tích chuyển, icon đặc, dòng gợi ý + Xoá lọc', async () => {
    await show()
    await choose('Mức tồn', 'Dưới tối thiểu')
    expect(screen.getByText('Xi măng Hà Tiên PCB40')).toBeOnTheScreen()
    expect(screen.getByText('Sơn Dulux chống thấm 18L')).toBeOnTheScreen()
    expect(screen.queryByText('Thép tấm SS400 dày 3ly')).toBeNull()
    expect(screen.queryByText('Bu lông M12×50 mạ kẽm')).toBeNull()
    expect(checked('Mức tồn')).toEqual(['Dưới tối thiểu'])
    expect(filterMenu().icon).toEqual({
      type: 'sfSymbol',
      name: 'line.3.horizontal.decrease.circle.fill',
    })
    expect(filterMenu().accessibilityLabel).toBe('Lọc, đang lọc')
    expect(screen.getByText('Dưới tối thiểu · 2 vật tư')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Xoá lọc' }))
    for (const name of NAMES) expect(screen.getByText(name)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Xoá lọc' })).toBeNull()
    expect(checked('Mức tồn')).toEqual(['Tất cả'])
  })

  it('Lọc "Vượt tối đa" → chỉ dòng vượt max', async () => {
    await show()
    await choose('Mức tồn', 'Vượt tối đa')
    expect(screen.getByText('Bu lông M12×50 mạ kẽm')).toBeOnTheScreen()
    expect(screen.queryByText('Xi măng Hà Tiên PCB40')).toBeNull()
  })

  it('Lọc loại "Sơn" + mức "Dưới tối thiểu" → gợi ý ghép hai bộ lọc và số vật tư', async () => {
    await show()
    await choose('Loại vật tư', 'Sơn')
    expect(screen.getByText('Sơn Dulux chống thấm 18L')).toBeOnTheScreen()
    expect(screen.queryByText('Xi măng Hà Tiên PCB40')).toBeNull()
    expect(checked('Loại vật tư')).toEqual(['Sơn'])
    expect(screen.getByText('Sơn · 1 vật tư')).toBeOnTheScreen()
    await choose('Mức tồn', 'Dưới tối thiểu')
    expect(screen.getByText('Dưới tối thiểu · Sơn · 1 vật tư')).toBeOnTheScreen()
  })

  it('không khớp tìm kiếm → "Không tìm thấy vật tư khớp “…”"', async () => {
    await show()
    await typeSearch('zzz')
    expect(screen.getByText('Không tìm thấy vật tư khớp “zzz”')).toBeOnTheScreen()
  })

  it('1.500 vật tư: danh sách ảo hoá (không vẽ hết), lọc theo mã vẫn ra đúng 1 dòng', async () => {
    resetFakeApi()
    const many = Array.from({ length: 1500 }, (_, n) =>
      item({
        slug: `i-${n}`,
        materialSlug: `m-${n}`,
        materialCode: `VT-${String(n).padStart(4, '0')}`,
        materialName: `Vật tư số ${String(n).padStart(4, '0')}`,
      }),
    )
    route('get', '/warehouses/wh-a/materials', () => page(many))
    await show()
    expect(screen.getAllByText(/^Vật tư số /).length).toBeLessThan(100)
    await typeSearch('vt-1234')
    expect(screen.getAllByText(/^Vật tư số /)).toHaveLength(1)
    expect(screen.getByText('Vật tư số 1234')).toBeOnTheScreen()
  })
})

describe('StockListScreen — trạng thái', () => {
  it('đang tải lần đầu → khung xương 6 dòng', async () => {
    route('get', '/warehouses/wh-a/materials', () => new Promise(() => {}))
    await show({ settle: false })
    expect(
      screen.getAllByTestId('stock-skeleton-row', { includeHiddenElements: true }),
    ).toHaveLength(6)
    // Đang tải giữ khung xương, không có vòng quay của FirstLoadState.
    expect(screen.getByLabelText('Đang tải tồn kho', { includeHiddenElements: true })).toBeTruthy()
    // ActivityIndicator của RN không có accessibilityRole → tìm theo host type.
    expect(screen.container.queryAll((n) => n.type === 'ActivityIndicator')).toHaveLength(0)
    expect(
      within(
        screen.getByLabelText('Đang tải tồn kho', { includeHiddenElements: true }),
      ).getAllByTestId('stock-skeleton-row', { includeHiddenElements: true }),
    ).toHaveLength(6)
  })

  it('kho rỗng → EmptyState "Kho chưa có vật tư nào"', async () => {
    route('get', '/warehouses/wh-a/materials', () => page([]))
    await show()
    expect(screen.getByText('Kho chưa có vật tư nào')).toBeOnTheScreen()
  })

  it('lỗi lần đầu → Thử lại: đang gửi thì nút bận + khoá (bấm lại không gửi thêm), xong thì có danh sách', async () => {
    route('get', '/warehouses/wh-a/materials', () => 'network')
    await show()
    expect(screen.getByText('Không tải được tồn kho')).toBeOnTheScreen()
    expect(screen.getByText('Không kết nối được máy chủ')).toBeOnTheScreen()

    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    route('get', '/warehouses/wh-a/materials', async () => {
      await gate
      return page(MOCKUP)
    })
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await tick()
    const retry = screen.getByRole('button', { name: 'Thử lại' })
    expect(retry).toBeBusy()
    expect(retry).toBeDisabled()
    await fireEvent.press(retry)
    expect(callsTo('get', '/warehouses/wh-a/materials')).toHaveLength(2)

    await act(async () => release())
    await settled()
    expect(screen.getByText('Xi măng Hà Tiên PCB40')).toBeOnTheScreen()
  })

  it('kéo làm mới lỗi khi đã có dữ liệu → giữ danh sách + dòng báo lỗi; Thử lại khoá khi đang gửi, không gửi lặp', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    route('get', '/warehouses/wh-a/materials', () => 'network')
    // Kéo xuống để làm mới = sự kiện `refresh` của RefreshControl native.
    const [pull] = screen.container.queryAll((n) => n.type === 'RCTRefreshControl')
    await fireEvent(pull, 'refresh')
    await settled()
    for (const name of NAMES) expect(screen.getByText(name)).toBeOnTheScreen()
    expect(screen.getByText('Không làm mới được danh sách')).toBeOnTheScreen()

    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    route('get', '/warehouses/wh-a/materials', async () => {
      await gate
      return page(MOCKUP.slice(0, 1))
    })
    const before = callsTo('get', '/warehouses/wh-a/materials').length
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await tick()
    const retry = screen.getByRole('button', { name: 'Thử lại' })
    expect(retry).toBeDisabled()
    await fireEvent.press(retry)
    expect(callsTo('get', '/warehouses/wh-a/materials')).toHaveLength(before + 1)

    await act(async () => release())
    await settled()
    expect(screen.queryByText('Không làm mới được danh sách')).toBeNull()
    expect(screen.queryByText('Sơn Dulux chống thấm 18L')).toBeNull()
  })

  it('loại đang lọc biến mất sau khi làm mới → tự về "Tất cả loại", không hiện slug thô', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    await choose('Loại vật tư', 'Sơn')
    route('get', '/warehouses/wh-a/materials', () =>
      page(MOCKUP.filter((i) => i.typeSlug !== 'son')),
    )
    const [pull] = screen.container.queryAll((n) => n.type === 'RCTRefreshControl')
    await fireEvent(pull, 'refresh')
    await settled()
    expect(useStockFilter.getState().typeSlug).toBeUndefined()
    expect(checked('Loại vật tư')).toEqual(['Tất cả loại'])
    expect(screen.queryByText(/son/)).toBeNull()
    expect(screen.getByText('Xi măng Hà Tiên PCB40')).toBeOnTheScreen()
  })
})

describe('StockListScreen — đổi kho', () => {
  let off: () => void
  beforeEach(() => (off = resetStockFilterOnWarehouseChange()))
  afterEach(() => off())

  it('A→B đang tải: không lúc nào hiện vật tư của A; ô tìm kiếm được xoá, bộ lọc về mặc định', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    let releaseB!: () => void
    const gateB = new Promise<void>((r) => (releaseB = r))
    route('get', '/warehouses/wh-b/materials', async () => {
      await gateB
      return page([
        item({ materialSlug: 'b-1', materialName: 'Gạch ống Tuynel', warehouseSlug: 'wh-b' }),
      ])
    })
    await show()
    await typeSearch('xi')
    expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('xi')
    await choose('Mức tồn', 'Dưới tối thiểu')
    expect(screen.getByText('Xi măng Hà Tiên PCB40')).toBeOnTheScreen()

    await act(async () => useWarehouseStore.setState({ current: WH_B }))
    for (const name of NAMES) expect(screen.queryByText(name)).toBeNull()
    expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('')
    expect(useStockFilter.getState()).toMatchObject({ query: '', level: undefined })
    expect(
      screen.getAllByTestId('stock-skeleton-row', { includeHiddenElements: true }),
    ).toHaveLength(6)

    await act(async () => releaseB())
    await settled()
    expect(screen.getByText('Gạch ống Tuynel')).toBeOnTheScreen()
    for (const name of NAMES) expect(screen.queryByText(name)).toBeNull()
  })

  it('A→B đã có cache của B: không có khung hình nào báo "Không tìm thấy … “xi”" (từ khoá cũ)', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    client.setQueryData(
      ['inventory', 'wh-b', 'list', {}],
      [item({ materialSlug: 'b-1', materialName: 'Gạch ống Tuynel', warehouseSlug: 'wh-b' })],
    )
    await show()
    await typeSearch('xi')
    mockEmptyTitles.length = 0
    await act(async () => useWarehouseStore.setState({ current: WH_B }))
    await settled()
    expect(screen.getByText('Gạch ống Tuynel')).toBeOnTheScreen()
    expect(mockEmptyTitles.filter((t) => t.startsWith('Không tìm thấy'))).toEqual([])
  })

  it('nơi khác ghi từ khoá vào store (vd quét mã không thấy) → ô tìm kiếm hiện từ khoá đó', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    await act(async () => useStockFilter.getState().setQuery('8934563'))
    expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('8934563')
    expect(screen.getByText('Không tìm thấy vật tư khớp “8934563”')).toBeOnTheScreen()
  })
})

describe('StockListScreen — nút Quét mã', () => {
  afterEach(() => jest.restoreAllMocks())

  it('iOS: mục "Quét mã" (barcode.viewfinder) đứng trước menu Lọc → mở /scan-material', async () => {
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    const [scan, filter] = rightItems()
    expect(scan).toMatchObject({
      type: 'button',
      label: 'Quét mã',
      icon: { type: 'sfSymbol', name: 'barcode.viewfinder' },
    })
    expect(filter.type).toBe('menu')
    await act(async () => (scan as { onPress: () => void }).onPress())
    expect(mockNavigate).toHaveBeenCalledWith('/scan-material')
  })

  it('Android: nút "Quét mã" phẳng cạnh nút Lọc → mở /scan-material', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    await render(mockHeader.options.headerRight!({ canGoBack: false } as never) as never)
    await fireEvent.press(screen.getByRole('button', { name: 'Quét mã' }))
    expect(mockNavigate).toHaveBeenCalledWith('/scan-material')
    expect(screen.getByRole('button', { name: 'Lọc' })).toBeOnTheScreen()
  })

  it('Android: thứ tự headerRight = Quét mã, Lọc, kho; headerLeft trống', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    await show()
    expect(mockHeader.options.headerLeft).toBeUndefined()
    await render(mockHeader.options.headerRight!({ canGoBack: false } as never) as never)
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual([
      'Quét mã',
      'Lọc',
      expect.stringMatching(/^Kho: /),
    ])
  })
})

describe.each(['ios', 'android'] as const)(
  'StockListScreen — %s: ô tìm kiếm trong danh sách',
  (os) => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', os)
      route('get', '/warehouses/wh-a/materials', () => page(MOCKUP))
    })

    it('không dùng headerSearchBarOptions; ô tìm là mục đầu của danh sách, gõ → store → lọc', async () => {
      await show()
      expect(mockHeader.options.headerSearchBarOptions).toBeUndefined()
      // Nút Quét mã / Lọc vẫn còn trên header.
      expect(
        mockHeader.options.headerRight ?? mockHeader.options.unstable_headerRightItems,
      ).toBeDefined()
      const field = screen.getByLabelText(SEARCH_LABEL)
      expect(field.props).toMatchObject({
        returnKeyType: 'search',
        autoCapitalize: 'none',
        autoCorrect: false,
      })
      // Mục đầu của ListHeader: nằm trước mọi dòng vật tư.
      const order = screen.container
        .queryAll(
          (n) => n.props.accessibilityLabel === SEARCH_LABEL || n.props.testID === 'stock-row',
        )
        .map((n) => n.props.testID ?? 'search')
      expect(order[0]).toBe('search')
      await act(async () => fireEvent.changeText(field, 'xi mang'))
      expect(useStockFilter.getState().query).toBe('xi mang')
      await settled()
      expect(screen.getAllByTestId('stock-row')).toHaveLength(1)
    })

    it('quét mã ghi từ khoá vào store → ô hiện mã; nút xoá → ô trống', async () => {
      await show()
      await act(async () => useStockFilter.getState().setQuery('8934563'))
      expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('8934563')
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Xoá tìm kiếm' })))
      expect(useStockFilter.getState().query).toBe('')
      expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('')
    })
  },
)
