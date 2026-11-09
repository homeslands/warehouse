// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native'
import { ActionSheetIOS } from 'react-native'

import { inventoryKeys } from '@/entities/inventory'
import { item } from '@/entities/inventory/model/fixtures'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { SHEET_CLOSE_DELAY_MS } from '@/shared/lib/useSheetSubmit'
import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { StockThresholdSheetScreen } from './StockThresholdSheetScreen'

const mockBack = jest.fn()
const mockParams = { materialSlug: 'xm' }
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

const LIST = '/warehouses/wh-a/materials'
const PATCH = '/warehouses/wh-a/materials/xm'

/** Min riêng 5; max theo mặc định (100). */
const XM = item({
  slug: 'i-xm',
  materialSlug: 'xm',
  materialName: 'Xi măng PCB40',
  baseUnit: { slug: 'u', code: 'BAO', name: 'bao' },
  minimumInventory: 5,
  maximumInventory: null,
  effectiveMinimumInventory: 5,
  effectiveMaximumInventory: 100,
})

const page = (items: object[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })

let client: QueryClient
let confirm: jest.SpyInstance

async function settled() {
  await act(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    await tick()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await tick()
    await tick()
  })
}

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

async function show() {
  await render(
    <QueryClientProvider client={client}>
      <StockThresholdSheetScreen />
    </QueryClientProvider>,
  )
  await settled()
}

const minField = () => screen.getByLabelText('Tối thiểu')
const maxField = () => screen.getByLabelText('Tối đa')
const patches = () => callsTo('patch', PATCH)

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockParams.materialSlug = 'xm'
  confirm = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((_o, cb) => cb(0))
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({
    current: { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true },
    resolved: true,
    resolution: 'selected',
  })
  route('get', LIST, () => page([XM]))
  route('patch', PATCH, () => ok(XM))
})

afterEach(async () => {
  await cleanup()
  client.clear()
  jest.restoreAllMocks()
})

describe('StockThresholdSheetScreen', () => {
  it('tiêu đề "Ngưỡng tồn", tên vật tư + đơn vị gốc, điền giá trị đầu, ghi "Theo mặc định vật tư" ở ô mặc định', async () => {
    await show()
    expect(sheetHeader().title).toBe('Ngưỡng tồn')
    expect(screen.getByText(/Xi măng PCB40/)).toBeOnTheScreen()
    expect(minField().props.value).toBe('5')
    expect(maxField().props.value).toBe('100')
    expect(screen.getAllByText('Theo mặc định vật tư')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Dùng mặc định' })).toHaveLength(1)
  })

  it('tải lại danh sách kho khi mở', async () => {
    client.setQueryData(inventoryKeys.list('wh-a'), [XM])
    await show()
    expect(callsTo('get', LIST).length).toBeGreaterThanOrEqual(1)
  })

  it('Lưu tắt khi chưa đổi: bấm ✓ không hỏi, không gọi PATCH', async () => {
    await show()
    expect(sheetHeader().done?.disabled).toBe(true)
    await pressSheetDone()
    expect(confirm).not.toHaveBeenCalled()
    expect(patches()).toHaveLength(0)
  })

  it('đổi min → Lưu → đúng 1 PATCH { minimumInventory } (bấm đôi vẫn 1), refetch danh sách rồi đóng', async () => {
    await show()
    const before = callsTo('get', LIST).length
    await fireEvent.changeText(minField(), '8')
    expect(sheetHeader().done?.disabled).toBeFalsy()
    await pressSheetDone()
    await pressSheetDone()
    await settled()
    expect(patches()).toHaveLength(1)
    expect(callsTo('get', LIST).length).toBeGreaterThan(before)
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('body PATCH chỉ có trường đã đổi', async () => {
    let body: unknown
    route('patch', PATCH, (config) => {
      body = JSON.parse(config.data as string)
      return ok(XM)
    })
    await show()
    await fireEvent.changeText(minField(), '8')
    await pressSheetDone()
    await settled()
    expect(body).toEqual({ minimumInventory: 8 })
  })

  it('"Dùng mặc định" → PATCH { minimumInventory: null }, ô ghi "Theo mặc định vật tư"', async () => {
    let body: unknown
    route('patch', PATCH, (config) => {
      body = JSON.parse(config.data as string)
      return ok(XM)
    })
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Dùng mặc định' }))
    expect(screen.getAllByText('Theo mặc định vật tư')).toHaveLength(2)
    await pressSheetDone()
    await settled()
    expect(body).toEqual({ minimumInventory: null })
  })

  it('không xác nhận trong hộp hỏi → không gọi PATCH', async () => {
    confirm.mockImplementation((_o, cb) => cb(1))
    await show()
    await fireEvent.changeText(minField(), '8')
    await pressSheetDone()
    await settled()
    expect(patches()).toHaveLength(0)
  })

  it('tối đa < tối thiểu → báo lỗi tại ô, không hỏi, không gọi PATCH', async () => {
    await show()
    await fireEvent.changeText(minField(), '500')
    expect(screen.getByText('Tối đa phải lớn hơn hoặc bằng tối thiểu.')).toBeOnTheScreen()
    await pressSheetDone()
    expect(confirm).not.toHaveBeenCalled()
    expect(patches()).toHaveLength(0)
  })

  it('ô trống khi đặt riêng → "Nhập số từ 0 trở lên."', async () => {
    await show()
    await fireEvent.changeText(minField(), '')
    expect(screen.getByText('Nhập số từ 0 trở lên.')).toBeOnTheScreen()
  })

  it('100811 từ server → hiện câu khoảng sai, sheet không đóng', async () => {
    route('patch', PATCH, () => failure(400, 100811))
    await show()
    await fireEvent.changeText(minField(), '8')
    await pressSheetDone()
    await settled()
    await wait(SHEET_CLOSE_DELAY_MS * 2)
    expect(screen.getByText('Tối đa phải lớn hơn hoặc bằng tối thiểu.')).toBeOnTheScreen()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('không tìm thấy vật tư → "Vật tư không còn trong kho này." và đóng được', async () => {
    mockParams.materialSlug = 'khong-co'
    await show()
    expect(screen.getByText('Vật tư không còn trong kho này.')).toBeOnTheScreen()
    expect(sheetHeader().done).toBeUndefined()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
    expect(mockBack).toHaveBeenCalledTimes(1)
    await pressSheetCancel()
    expect(mockBack).toHaveBeenCalledTimes(2)
  })

  it('I1: refetch mang max mới về sau khi gõ min → body chỉ có minimumInventory', async () => {
    let body: unknown
    route('patch', PATCH, (config) => {
      body = JSON.parse(config.data as string)
      return ok(XM)
    })
    await show()
    await fireEvent.changeText(minField(), '8')
    route('get', LIST, () =>
      page([{ ...XM, maximumInventory: 200, effectiveMaximumInventory: 200 }]),
    )
    await act(async () => {
      await client.invalidateQueries({ queryKey: inventoryKeys.warehouse('wh-a') })
    })
    await settled()
    expect(maxField().props.value).toBe('200')
    await pressSheetDone()
    await settled()
    expect(body).toEqual({ minimumInventory: 8 })
  })

  it('I2: đổi kho khi sheet đang mở → đóng sheet, không PATCH sang kho mới', async () => {
    route('get', '/warehouses/wh-b/materials', () => page([XM]))
    route('patch', '/warehouses/wh-b/materials/xm', () => ok(XM))
    await show()
    await fireEvent.changeText(minField(), '8')
    await act(async () => {
      useWarehouseStore.setState({
        current: { slug: 'wh-b', code: 'B', name: 'Kho B', isManager: true },
      })
    })
    await settled()
    expect(mockBack).toHaveBeenCalled()
    expect(screen.queryByLabelText('Tối thiểu')).toBeNull()
    expect(callsTo('patch', '/warehouses/wh-b/materials/xm')).toHaveLength(0)
    expect(patches()).toHaveLength(0)
  })

  it('M2: hai lần bấm ✓ nhanh chỉ mở một hộp xác nhận', async () => {
    confirm.mockImplementation(() => {})
    await show()
    await fireEvent.changeText(minField(), '8')
    const { done } = sheetHeader()
    await act(async () => {
      done!.onPress()
      done!.onPress()
    })
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('M4: phiên đổi giữa chừng khi PATCH đang bay → không làm mới cache', async () => {
    route('patch', PATCH, () => {
      useAuthStore.getState().endSession('revoked')
      return ok(XM)
    })
    await show()
    const before = callsTo('get', LIST).length
    await fireEvent.changeText(minField(), '8')
    await pressSheetDone()
    await settled()
    expect(patches()).toHaveLength(1)
    expect(callsTo('get', LIST).length).toBe(before)
  })
})
