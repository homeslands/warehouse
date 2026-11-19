// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, calls, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native'

import { materialKeys } from '@/entities/material'
import { useWarehouseStore } from '@/entities/warehouse'
import { useAuthStore, type CurrentUser } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { confirmAction } from '@/shared/lib/native-confirm'
import { SHEET_CLOSE_DELAY_MS } from '@/shared/lib/useSheetSubmit'
import { sheetHeader } from '@/shared/ui/testing/sheet-header'
import { lightColors } from '@/shared/theme/tokens'

import { WarehouseAssignSheetScreen } from './WarehouseAssignSheetScreen'

const mockBack = jest.fn()
const mockPush = jest.fn()
const mockParams: { material?: string } = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  usePreventRemove: () => jest.fn(),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))
let mockEpoch = 0
jest.mock('@/entities/session', () => ({
  ...jest.requireActual('@/entities/session'),
  getSessionEpoch: () => mockEpoch,
}))
jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))
const confirm = confirmAction as jest.Mock

const user = (warehouses: object[], ...scope: string[]): CurrentUser => ({
  userName: 'u',
  roleName: 'STAFF',
  scope,
  warehouses: warehouses as never,
})
const W1 = { slug: 'w1', code: 'W1', name: 'Kho Một', isManager: true }
const W2 = { slug: 'w2', code: 'W2', name: 'Kho Hai', isManager: true }
const W3 = { slug: 'w3', code: 'W3', name: 'Kho Ba', isManager: true, isActive: false }
const W4 = { slug: 'w4', code: 'W4', name: 'Kho Bốn', isManager: true }
const MATERIAL = {
  slug: 'm1',
  code: 'VT-01',
  name: 'Gạo',
  minimumInventory: 0,
  maximumInventory: 0,
  type: { slug: 'tp', code: 'TP', name: 'Thực phẩm' },
  baseUnit: { slug: 'kg', code: 'KG', name: 'Kilogam' },
  hasSupplier: false,
  suppliers: [],
  warehouses: [{ slug: 'w1', code: 'W1', name: 'Kho Một', quantity: 0, availableQuantity: 0 }],
  units: [],
  createdAt: '',
  updatedAt: '',
}
const PERMS = ['MATERIAL_READ', 'MATERIAL_UPDATE', 'WAREHOUSE_UPDATE']
const PUT = '/warehouses/w2/materials'
const PUT4 = '/warehouses/w4/materials'

let client: QueryClient
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
async function settled() {
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
}
async function show() {
  mockParams.material = 'm1'
  const view = await render(
    <QueryClientProvider client={client}>
      <WarehouseAssignSheetScreen />
    </QueryClientProvider>,
  )
  await settled()
  return view
}
const signIn = (warehouses: object[], ...perms: string[]) =>
  useAuthStore.setState({ user: user(warehouses, ...perms) } as never)
const reply = (status: number, body: object) => ({
  status,
  data: { timestamp: '', path: '', method: 'X', ...body },
})

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockEpoch = 0
  confirm.mockResolvedValue(true)
  useWarehouseStore.setState({ warehouses: null } as never)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  route('get', '/materials/m1', () => ok(MATERIAL))
})

afterEach(async () => {
  await cleanup()
  client.clear()
  useAuthStore.setState({ user: null } as never)
})

const rowOf = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) })
const addButton = () => screen.getByRole('button', { name: /^Gắn vào \d+ kho$/ })
const pressAdd = async () => {
  await fireEvent.press(addButton())
  await settled()
}
const ticked = (name: string) => rowOf(name).props.accessibilityState.checked

describe('WarehouseAssignSheetScreen', () => {
  it('kho đã gắn không hiện; kho tắt "Đã tắt" chữ đỏ, không tick được', async () => {
    signIn([W1, W2, W3], ...PERMS)
    await show()
    expect(screen.queryByText('Kho Một')).toBeNull()
    expect(screen.queryByText('đã có')).toBeNull()
    expect(screen.getByText('Kho Hai')).toBeOnTheScreen()
    expect(screen.getByText('Đã tắt')).toHaveStyle({ color: lightColors.destructiveText })
    await fireEvent.press(rowOf('Kho Ba'))
    expect(ticked('Kho Ba')).toBe(false)
    expect(addButton()).toBeDisabled()
  })

  it('ô tìm và "Chọn tất cả" ghim ngoài vùng cuộn; danh sách kho nằm trong vùng cuộn', async () => {
    signIn([W1, W2, W4], ...PERMS)
    await show()
    const scroll = screen.getByTestId('warehouse-assign-sheet-scroll')
    expect(within(scroll).queryByLabelText('Tìm kho')).toBeNull()
    expect(within(scroll).queryByRole('button', { name: 'Chọn tất cả' })).toBeNull()
    expect(screen.getByLabelText('Tìm kho')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Chọn tất cả' })).toBeOnTheScreen()
    expect(within(scroll).getByText('Kho Hai')).toBeOnTheScreen()
  })

  it('không có ✓ ở header; nút đáy khoá khi 0 tick, "Gắn vào 2 kho" khi tick 2', async () => {
    signIn([W1, W2, W4], ...PERMS)
    await show()
    expect(sheetHeader().done).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Gắn vào 0 kho' })).toBeDisabled()
    await fireEvent.press(rowOf('Kho Hai'))
    await fireEvent.press(rowOf('Kho Bốn'))
    expect(screen.getByRole('button', { name: 'Gắn vào 2 kho' })).toBeEnabled()
  })

  it('tick 2 → xác nhận → 2 PUT { materialSlug } → invalidate → đóng', async () => {
    signIn([W1, W2, W4], ...PERMS)
    route('put', PUT, () => ok({}))
    route('put', PUT4, () => ok({}))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show()
    await fireEvent.press(rowOf('Kho Hai'))
    await fireEvent.press(rowOf('Kho Bốn'))
    await pressAdd()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Gắn VT-01 vào 2 kho?' }))
    for (const url of [PUT, PUT4]) {
      const puts = callsTo('put', url)
      expect(puts).toHaveLength(1)
      expect(JSON.parse(puts[0].body as string)).toEqual({ materialSlug: 'm1' })
    }
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: materialKeys.detail('m1') }),
    )
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('1 kho → câu xác nhận có tên kho', async () => {
    signIn([W1, W2], ...PERMS)
    route('put', PUT, () => ok({}))
    await show()
    await fireEvent.press(rowOf('Kho Hai'))
    await pressAdd()
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Gắn VT-01 vào Kho Hai?' }),
    )
  })

  it('huỷ xác nhận → không PUT', async () => {
    signIn([W1, W2], ...PERMS)
    confirm.mockResolvedValue(false)
    await show()
    await fireEvent.press(rowOf('Kho Hai'))
    await pressAdd()
    expect(callsTo('put', PUT)).toHaveLength(0)
  })

  it('1 trong 2 kho 100802 → không đóng, hộp lỗi, kho ok bỏ tick, có invalidate', async () => {
    signIn([W1, W2, W4], ...PERMS)
    route('put', PUT, () => reply(400, { statusCode: 400, code: 100802, message: 'x' }))
    route('put', PUT4, () => ok({}))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show()
    await fireEvent.press(rowOf('Kho Hai'))
    await fireEvent.press(rowOf('Kho Bốn'))
    await pressAdd()
    const box = screen.getByRole('alert')
    expect(box).toHaveTextContent(/Chưa gắn được vào 1 kho/)
    expect(box).toHaveTextContent(/Kho Hai: đã có vật tư này hoặc vật tư từng được gỡ khỏi kho này/)
    expect(box).toHaveTextContent(/liên hệ quản trị hệ thống/)
    expect(ticked('Kho Hai')).toBe(true)
    expect(ticked('Kho Bốn')).toBe(false)
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: materialKeys.detail('m1') }),
    )
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(mockBack).not.toHaveBeenCalled()
    // Tick / bỏ tick tiếp → hộp lỗi biến mất.
    await fireEvent.press(rowOf('Kho Hai'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lỗi 404 một kho → lý do notFound, không có gợi ý reassign', async () => {
    signIn([W1, W2], ...PERMS)
    route('put', PUT, () => reply(404, { statusCode: 404, code: 100000, message: 'x' }))
    await show()
    await fireEvent.press(rowOf('Kho Hai'))
    await pressAdd()
    const box = screen.getByRole('alert')
    expect(box).toHaveTextContent(/Kho Hai: kho hoặc vật tư đã bị xoá ở nơi khác/)
    expect(box).not.toHaveTextContent(/quản trị hệ thống/)
  })

  it('vật tư đã ở mọi kho → câu empty, không có danh sách / ô tìm / "Không có kho phù hợp"', async () => {
    signIn([W1], ...PERMS)
    await show()
    expect(screen.getByText('Vật tư đã ở mọi kho bạn quản lý.')).toBeOnTheScreen()
    expect(screen.queryByLabelText('Tìm kho')).toBeNull()
    expect(screen.queryByText('Không có kho phù hợp.')).toBeNull()
    expect(addButton()).toBeDisabled()
  })

  it('chỉ còn kho đã tắt → câu onlyInactive', async () => {
    signIn([W1, W3], ...PERMS)
    await show()
    expect(screen.getByText('Các kho còn lại đều đã tắt.')).toBeOnTheScreen()
    expect(screen.getByText('Kho Ba')).toBeOnTheScreen()
    expect(addButton()).toBeDisabled()
  })

  it('"Chọn tất cả" tick mọi kho gắn được, không tick kho đã tắt', async () => {
    signIn([W1, W2, W3, W4], ...PERMS)
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chọn tất cả' }))
    expect(ticked('Kho Hai')).toBe(true)
    expect(ticked('Kho Bốn')).toBe(true)
    expect(ticked('Kho Ba')).toBe(false)
    expect(screen.getByRole('button', { name: 'Gắn vào 2 kho' })).toBeEnabled()
  })

  it('ô tìm luôn hiện, lọc theo tên, tick giữ qua lần đổi từ khoá, không khớp → noMatch', async () => {
    signIn([W1, W2, W4], ...PERMS)
    await show()
    await fireEvent.press(rowOf('Kho Hai'))
    await fireEvent.changeText(screen.getByLabelText('Tìm kho'), 'bốn')
    expect(screen.queryByText('Kho Hai')).toBeNull()
    expect(screen.getByText('Kho Bốn')).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText('Tìm kho'), 'zzz')
    expect(screen.getByText('Không có kho phù hợp.')).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText('Tìm kho'), '')
    expect(ticked('Kho Hai')).toBe(true)
  })

  it('đổi phiên giữa lúc PUT → không invalidate, không đóng, không hộp lỗi', async () => {
    signIn([W1, W2], ...PERMS)
    route('put', PUT, () => {
      mockEpoch++
      return ok({})
    })
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show()
    await fireEvent.press(rowOf('Kho Hai'))
    await pressAdd()
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(callsTo('put', PUT)).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('thiếu WAREHOUSE_UPDATE → đóng, không request', async () => {
    signIn([W1, W2], 'MATERIAL_READ', 'MATERIAL_UPDATE')
    await show()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })
})
