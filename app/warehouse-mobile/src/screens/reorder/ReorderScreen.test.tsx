// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native'
import { Alert, Share } from 'react-native'

import { stockOverview } from '@/entities/inventory'
import { item } from '@/entities/inventory/model/fixtures'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { reorderStorageKey, todayKey, useReorderStore } from '@/features/reorder'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { confirmAction } from '@/shared/lib/native-confirm'

import { ReorderScreen } from './ReorderScreen'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: () => null },
}))
jest.mock('@/shared/lib/native-confirm', () => ({
  ...jest.requireActual('@/shared/lib/native-confirm'),
  confirmAction: jest.fn(),
}))

const LIST = '/warehouses/wh-a/materials'
const AVAILABLE = '/warehouses/wh-a/import-forms/available-materials'
const BASE = { slug: 'u-bag', code: 'BAG', name: 'bao' }
const ABC = { slug: 's-abc', code: 'ABC', name: 'Công ty ABC' }
const XYZ = { slug: 's-xyz', code: 'XYZ', name: 'Công ty XYZ' }

const inv = (materialSlug: string, name: string, quantity: number, min: number, max: number) =>
  item({
    slug: `i-${materialSlug}`,
    materialSlug,
    materialCode: `VT-${materialSlug.toUpperCase()}`,
    materialName: name,
    quantity,
    effectiveMinimumInventory: min,
    effectiveMaximumInventory: max,
    baseUnit: BASE,
    units: [
      { unitSlug: 'u-bag', unitCode: 'BAG', unitName: 'bao', conversionRate: 1, isBaseUnit: true },
    ],
  })

const ITEMS = [
  inv('duong', 'Đường cát', 1, 5, 20), // đỏ, 2 bên bán → choose
  inv('sua', 'Sữa tươi', 4, 10, 30), // đỏ, ABC, gợi ý 26
  inv('kem', 'Kem béo', 11, 10, 30), // vàng, ABC, gợi ý 19
  inv('ly', 'Ly giấy', 0, 100, 0), // đỏ, không bên bán, chưa có số
  inv('ok', 'Muối', 500, 10, 30), // đủ hàng → không vào
]
const mat = (slug: string, suppliers: object[]) => ({
  slug,
  code: slug,
  name: slug,
  baseUnitSlug: 'u-bag',
  quantity: 1,
  suppliers,
  units: [],
})
const MATERIALS = [
  mat('duong', [ABC, XYZ]),
  mat('sua', [ABC]),
  mat('kem', [ABC]),
  mat('ly', []),
  mat('ok', [ABC]),
]
const page = (items: object[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })

let client: QueryClient
const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }

function signIn(scope: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u1', userName: 'an', roleName: 'STAFF', scope, warehouses: [WH] } as never,
  })
}

async function settled() {
  await act(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    await tick()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await tick()
    await tick()
  })
}

async function show() {
  await render(
    <QueryClientProvider client={client}>
      <ReorderScreen />
    </QueryClientProvider>,
  )
  await settled()
}

const rowOf = (slug: string) => screen.queryByTestId(`reorder-row-${slug}`)
const SHARED = { action: Share.sharedAction, activityType: undefined }
const DISMISSED = { action: Share.dismissedAction, activityType: undefined }
const mockConfirm = confirmAction as jest.MockedFunction<typeof confirmAction>

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  useReorderStore.setState({ scope: null, local: {}, loaded: false })
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  signIn(['IMPORT_FORM_CREATE'])
  route('get', LIST, () => page(ITEMS))
  route('get', AVAILABLE, () => page(MATERIALS))
})

afterEach(async () => {
  await cleanup()
  client.clear()
  jest.restoreAllMocks()
})

describe('ReorderScreen', () => {
  it('nhóm đúng thứ tự: cần chọn nơi đặt, bên bán, chưa có bên bán; dòng đủ hàng không vào', async () => {
    await show()
    const titles = screen.getAllByRole('header').map((h) => h.props.children)
    expect(titles).toEqual(['Cần chọn nơi đặt', 'Công ty ABC', 'Chưa có bên bán'])
    expect(rowOf('ok')).toBeNull()
    expect(within(rowOf('sua')!).getByText(/26/)).toBeOnTheScreen()
    expect(within(rowOf('ly')!).getByText('Nhập số')).toBeOnTheScreen()
    expect(within(rowOf('duong')!).getByText('Chọn nơi đặt')).toBeOnTheScreen()
  })

  it('chip Thiếu ẩn dòng vàng; chip Sắp thiếu chỉ còn dòng vàng; số trên chip đếm cả kho', async () => {
    await show()
    expect(screen.getByLabelText('Tất cả, 4')).toBeOnTheScreen()
    expect(screen.getByLabelText('Thiếu, 3')).toBeOnTheScreen()
    expect(screen.getByLabelText('Sắp thiếu, 1')).toBeOnTheScreen()

    await fireEvent.press(screen.getByTestId('reorder-chip-red'))
    expect(rowOf('kem')).toBeNull()
    expect(rowOf('sua')).toBeOnTheScreen()
    expect(screen.getByLabelText('Sắp thiếu, 1')).toBeOnTheScreen()

    await fireEvent.press(screen.getByTestId('reorder-chip-yellow'))
    expect(rowOf('kem')).toBeOnTheScreen()
    expect(rowOf('sua')).toBeNull()
    expect(screen.queryByText('Chưa có bên bán')).toBeNull()
  })

  it('thiếu IMPORT_FORM_CREATE: không gọi available-materials, một nhóm "Vật tư cần đặt"', async () => {
    signIn([])
    await show()
    expect(callsTo('get', AVAILABLE)).toHaveLength(0)
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Vật tư cần đặt'])
  })

  it('available-materials lỗi: banner lỗi, danh sách vẫn hiện (nhóm chung)', async () => {
    route('get', AVAILABLE, () => failure(500, 1))
    await show()
    expect(screen.getByText('Không tải được danh sách bên bán')).toBeOnTheScreen()
    expect(rowOf('sua')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeOnTheScreen()
  })

  it('chạm dòng mở sheet /reorder-line', async () => {
    await show()
    await fireEvent.press(rowOf('sua')!)
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/reorder-line',
      params: { materialSlug: 'sua' },
    })
  })

  it('chia sẻ xong + xác nhận → dòng "Đã đặt"; chữ chia sẻ chỉ có dòng có số', async () => {
    await show()
    const share = jest.spyOn(Share, 'share').mockResolvedValue(SHARED)
    mockConfirm.mockResolvedValue(true)
    await fireEvent.press(screen.getByTestId('reorder-send-supplier-s-abc'))
    await settled()
    const message = share.mock.calls[0]![0].message as string
    expect(message).toContain('Sữa tươi')
    expect(message).toContain('Kem béo')
    expect(message).not.toContain('Ly giấy')
    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(useReorderStore.getState().local.sua?.orderedAt).toBe(todayKey())
    expect(within(rowOf('sua')!).getByText(/Đã đặt/)).toBeOnTheScreen()
  })

  it('chữ chia sẻ bỏ dòng đã đặt và dòng chưa có số (nhóm không bên bán)', async () => {
    await show()
    const share = jest.spyOn(Share, 'share').mockResolvedValue(DISMISSED)
    await act(async () => useReorderStore.getState().markOrdered(['kem'], todayKey()))
    await settled()
    await fireEvent.press(screen.getByTestId('reorder-send-supplier-s-abc'))
    await settled()
    const message = share.mock.calls[0]![0].message as string
    expect(message).toContain('Sữa tươi')
    expect(message).not.toContain('Kem béo')
    expect(screen.getByTestId('reorder-send-none')).toBeDisabled()
  })

  it('huỷ chia sẻ: không hỏi đánh dấu, store không đổi', async () => {
    await show()
    jest.spyOn(Share, 'share').mockResolvedValue(DISMISSED)
    await fireEvent.press(screen.getByTestId('reorder-send-supplier-s-abc'))
    await settled()
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(useReorderStore.getState().local).toEqual({})
  })

  it('chia sẻ lỗi: báo lỗi, không hỏi đánh dấu', async () => {
    await show()
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('x'))
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await fireEvent.press(screen.getByTestId('reorder-send-supplier-s-abc'))
    await settled()
    expect(alert).toHaveBeenCalled()
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('đổi kho giữa lúc chia sẻ: không đánh dấu vào kho mới (kho mới đã nạp xong)', async () => {
    await show()
    route('get', '/warehouses/wh-b/materials', () => page(ITEMS))
    route('get', '/warehouses/wh-b/import-forms/available-materials', () => page(MATERIALS))
    let release!: () => void
    jest
      .spyOn(Share, 'share')
      .mockImplementation(() => new Promise((resolve) => (release = () => resolve(SHARED))))
    mockConfirm.mockResolvedValue(true)
    await fireEvent.press(screen.getByTestId('reorder-send-supplier-s-abc'))
    await act(async () => {
      useWarehouseStore.setState({ current: { ...WH, slug: 'wh-b', name: 'Kho B' } })
    })
    await settled()
    // Kho mới đã nạp xong → nếu không có guard scope thì `markOrdered` sẽ ghi được.
    expect(useReorderStore.getState().loaded).toBe(true)
    expect(useReorderStore.getState().scope).toBe('u1|wh-b')
    await act(async () => release())
    await settled()
    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(useReorderStore.getState().local).toEqual({})
    expect(await AsyncStorage.getItem(reorderStorageKey('u1', 'wh-b'))).toBeNull()
    expect(await AsyncStorage.getItem(reorderStorageKey('u1', 'wh-a'))).toBeNull()
  })

  it('đang nạp phần lưu trên máy: dòng gửi khoá, không chia sẻ', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise(() => {}))
    const share = jest.spyOn(Share, 'share').mockResolvedValue(SHARED)
    await show()
    expect(useReorderStore.getState().loaded).toBe(false)
    const send = screen.getByTestId('reorder-send-supplier-s-abc')
    expect(send).toBeDisabled()
    await fireEvent.press(send)
    expect(share).not.toHaveBeenCalled()
  })

  describe('dọn phần lưu (prune)', () => {
    const seed = () =>
      AsyncStorage.setItem(
        reorderStorageKey('u1', 'wh-a'),
        JSON.stringify({ gone: { supplierSlug: 's-abc' } }),
      )

    it('có dữ liệu tồn → dọn mục của vật tư không còn trong kho', async () => {
      await seed()
      await show()
      expect(useReorderStore.getState().local.gone).toBeUndefined()
    })

    it('tồn đang tải → không dọn', async () => {
      await seed()
      route('get', LIST, () => new Promise(() => {}) as never)
      await render(
        <QueryClientProvider client={client}>
          <ReorderScreen />
        </QueryClientProvider>,
      )
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })
      expect(useReorderStore.getState().loaded).toBe(true)
      expect(useReorderStore.getState().local.gone).toBeDefined()
    })

    it('tồn lỗi → không dọn', async () => {
      await seed()
      route('get', LIST, () => failure(500, 1))
      await show()
      expect(useReorderStore.getState().loaded).toBe(true)
      expect(useReorderStore.getState().local.gone).toBeDefined()
    })
  })

  it('chip "Thiếu" = hết hàng + dưới min theo stockLevel (kể cả hết hàng Min 0)', async () => {
    const withOut = [
      { ...inv('duong', 'Đường cát', 1, 5, 20), isBelowMinimum: true },
      { ...inv('sua', 'Sữa tươi', 4, 10, 30), isBelowMinimum: true },
      inv('kem', 'Kem béo', 11, 10, 30),
      inv('het', 'Hết hàng', 0, 0, 0),
      inv('ok', 'Muối', 500, 10, 30),
    ]
    route('get', LIST, () => page(withOut))
    route('get', AVAILABLE, () => page([...MATERIALS, mat('het', [])]))
    await show()
    const overview = stockOverview(withOut)
    expect(overview.out + overview.low).toBe(3)
    expect(screen.getByLabelText(`Thiếu, ${overview.out + overview.low}`)).toBeOnTheScreen()
    expect(rowOf('het')).toBeOnTheScreen()
  })

  it('chip số 0 ẩn; chip đang chọn về 0 thì quay về Tất cả', async () => {
    await show()
    await fireEvent.press(screen.getByTestId('reorder-chip-yellow'))
    expect(rowOf('sua')).toBeNull()
    // Hết vật tư vàng → chip "Sắp thiếu" ẩn, danh sách quay về Tất cả.
    route('get', LIST, () => page(ITEMS.filter((i) => i.materialSlug !== 'kem')))
    await act(async () => {
      await client.invalidateQueries()
    })
    await settled()
    expect(screen.queryByTestId('reorder-chip-yellow')).toBeNull()
    expect(screen.getByTestId('reorder-chip-all')).toBeOnTheScreen()
    expect(screen.getByLabelText('Tất cả, 3')).toHaveProp('accessibilityState', { selected: true })
    expect(rowOf('sua')).toBeOnTheScreen()
  })

  it('kho chỉ có vật tư đỏ: không có chip "Sắp thiếu"', async () => {
    route('get', LIST, () => page([ITEMS[1]!]))
    await show()
    expect(screen.queryByTestId('reorder-chip-yellow')).toBeNull()
    expect(screen.getByTestId('reorder-chip-red')).toBeOnTheScreen()
  })

  it('available-materials bị cắt (truncated) → coi như không có dữ liệu bên bán: một nhóm chung', async () => {
    route('get', AVAILABLE, () =>
      ok({ items: MATERIALS, total: 9999, page: 1, pageSize: 100, totalPages: 99, hasNext: true }),
    )
    await show()
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Vật tư cần đặt'])
  })

  it('store còn dữ liệu của kho cũ (chưa nạp kho mới): không hiện dấu "Đã đặt" của kho cũ', async () => {
    // Giữ nguyên trạng thái "khung hình đầu sau khi đổi kho": scope cũ, loaded = true, chưa nạp lại.
    const realLoad = useReorderStore.getState().load
    try {
      useReorderStore.setState({
        load: jest.fn().mockResolvedValue(undefined),
        scope: 'u1|wh-cu',
        loaded: true,
        local: { sua: { orderedAt: todayKey() } },
      })
      await show()
      expect(rowOf('sua')).toBeOnTheScreen()
      expect(screen.queryByText(/Đã đặt/)).toBeNull()
    } finally {
      useReorderStore.setState({ load: realLoad })
    }
  })

  it('Android: câu hỏi đánh dấu nêu tên bên bán ("Bạn đã gửi cho …?")', async () => {
    await show()
    jest.spyOn(Share, 'share').mockResolvedValue(SHARED)
    mockConfirm.mockResolvedValue(false)
    await fireEvent.press(screen.getByTestId('reorder-send-supplier-s-abc'))
    await settled()
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Bạn đã gửi cho Công ty ABC? Đánh dấu 2 vật tư là đã đặt.',
      }),
    )
  })

  it('nhóm không bên bán (nhóm chung): câu hỏi "Bạn đã gửi danh sách này?"', async () => {
    signIn([])
    await show()
    jest.spyOn(Share, 'share').mockResolvedValue(SHARED)
    mockConfirm.mockResolvedValue(false)
    await fireEvent.press(screen.getByTestId('reorder-send-all'))
    await settled()
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Bạn đã gửi danh sách này? Đánh dấu'),
      }),
    )
  })

  it('rỗng: "Không có vật tư nào cần đặt"', async () => {
    route('get', LIST, () => page([ITEMS[4]]))
    await show()
    expect(screen.getByText('Không có vật tư nào cần đặt')).toBeOnTheScreen()
  })
})
