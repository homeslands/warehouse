// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native'
import { Alert } from 'react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'

import { materialKeys } from '@/entities/material'
import { useAuthStore, type CurrentUser } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { confirmAction } from '@/shared/lib/native-confirm'
import { lightColors } from '@/shared/theme/tokens'

import { MaterialDetailScreen } from './MaterialDetailScreen'

const mockBack = jest.fn()
const mockPush = jest.fn()
const mockParams: { slug?: string } = {}
const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ options }: { options: NativeStackNavigationOptions }) => {
      mockHeader.options = options
      return null
    },
  },
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

const user = (...scope: string[]): CurrentUser => ({ userName: 'u', roleName: 'STAFF', scope })
const signIn = (...perms: string[]) => useAuthStore.setState({ user: user(...perms) } as never)

const M = {
  slug: 'm1',
  code: 'XM',
  name: 'Xi măng',
  minimumInventory: 10,
  maximumInventory: 100,
  type: { slug: 't1', code: 'XD', name: 'Xây dựng' },
  baseUnit: { slug: 'cai', code: 'CAI', name: 'Cái' },
  hasSupplier: true,
  suppliers: [{ slug: 's1', code: 'NCC1', name: 'Công ty Hoà Phát' }],
  warehouses: [] as object[],
  units: [
    { unitSlug: 'cai', unitCode: 'CAI', unitName: 'Cái', conversionRate: 1, isBaseUnit: true },
    {
      unitSlug: 'thung',
      unitCode: 'THUNG',
      unitName: 'Thùng',
      conversionRate: 24,
      isBaseUnit: false,
    },
  ],
  createdAt: '2026-03-05T08:00:00',
  updatedAt: '2026-04-06T09:00:00',
}
const WH = { slug: 'kho1', code: 'K1', name: 'Kho Tổng', quantity: 12, availableQuantity: 10 }

let client: QueryClient
async function settled() {
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
}
async function show(slug = 'm1') {
  mockParams.slug = slug
  await render(
    <QueryClientProvider client={client}>
      <MaterialDetailScreen />
    </QueryClientProvider>,
  )
  await settled()
}
const reply = (status: number, body: object) => ({
  status,
  data: { timestamp: '', path: '', method: 'X', ...body },
})
const rightItems = (): NativeStackHeaderItem[] =>
  mockHeader.options.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: true }) ?? []

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockParams.slug = undefined
  mockHeader.options = {}
  mockEpoch = 0
  confirm.mockResolvedValue(true)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  route('get', '/materials/m1', () => ok({ ...M, warehouses: [WH] }))
})

afterEach(async () => {
  await cleanup()
  client.clear()
  useAuthStore.setState({ user: null } as never)
})

describe('MaterialDetailScreen', () => {
  it('(a) hiện 3 khối: quy đổi, kho (tên + tồn), NCC; tiêu đề = mã', async () => {
    signIn('MATERIAL_READ')
    await show()
    expect(mockHeader.options.title).toBe('XM')
    const conv = within(screen.getByTestId('material-conversions'))
    expect(conv.getByText('Gốc')).toBeOnTheScreen()
    expect(conv.getByText('1 THUNG = 24 CAI')).toBeOnTheScreen()
    const wh = within(screen.getByTestId('material-warehouses'))
    expect(wh.getByText('Kho Tổng')).toBeOnTheScreen()
    expect(wh.getByText('Tồn 12 · Khả dụng 10 CAI')).toBeOnTheScreen()
    expect(
      within(screen.getByTestId('material-suppliers')).getByText('Công ty Hoà Phát'),
    ).toBeOnTheScreen()
  })

  it('(b) chỉ MATERIAL_READ: không Sửa, không Xoá, quy đổi không bấm được, không "+ Thêm"', async () => {
    signIn('MATERIAL_READ')
    await show()
    expect(rightItems()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull()
    expect(screen.queryByText('Thêm đơn vị quy đổi')).toBeNull()
    await fireEvent.press(screen.getByText('1 THUNG = 24 CAI'))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('đầu trang cùng dáng dòng danh sách: ô icon 44 trung tính + tên + "mã · loại" font hệ thống', async () => {
    signIn('MATERIAL_READ')
    await show()
    expect(screen.getByTestId('material-detail-tile', { includeHiddenElements: true })).toHaveStyle(
      {
        width: 44,
        backgroundColor: lightColors.fill,
      },
    )
    const code = screen.getByTestId('material-detail-code')
    expect(code).toHaveTextContent('XM · Xây dựng')
    expect(code).not.toHaveStyle({ fontFamily: 'ui-monospace' })
  })

  it('quản lý quy đổi: chạm dòng → sheet với material + unit; "+ Thêm" → sheet với material', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_UPDATE', 'UNIT_UPDATE', 'UNIT_READ')
    await show()
    await fireEvent.press(screen.getByText('1 THUNG = 24 CAI'))
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/conversion-unit-form',
      params: { material: 'm1', unit: 'thung' },
    })
    // Dòng hành động kiểu iOS: chữ + icon màu accent, icon trơn (không vòng 40 lệch trong thẻ chữ).
    expect(screen.getByText('Thêm đơn vị quy đổi')).toHaveStyle({ color: lightColors.accent })
    expect(screen.queryByTestId('card-icon-circle', { includeHiddenElements: true })).toBeNull()
    await fireEvent.press(screen.getByText('Thêm đơn vị quy đổi'))
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/conversion-unit-form',
      params: { material: 'm1' },
    })
  })

  it('có UPDATE: nút Sửa → /material-form?slug=', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_UPDATE', 'UNIT_READ')
    await show()
    const items = rightItems()
    expect(items[0]).toMatchObject({ type: 'button', label: 'Sửa' })
    await act(async () => (items[0] as { onPress: () => void }).onPress())
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/material-form', params: { slug: 'm1' } })
  })

  it('(c) còn trong 1 kho → Xoá khoá + chú thích chứa 1, bấm không gọi API', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_DELETE')
    route('delete', '/materials/m1', () => ok())
    await show()
    const del = screen.getByRole('button', { name: 'Xoá' })
    expect(del).toBeDisabled()
    expect(screen.getByText(/Đang có trong 1 kho/)).toBeOnTheScreen()
    await fireEvent.press(del)
    await settled()
    expect(confirm).not.toHaveBeenCalled()
    expect(callsTo('delete', '/materials/m1')).toHaveLength(0)
  })

  it('(d) xoá thành công → DELETE, back đúng 1 lần, gỡ detail + invalidate lists', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_DELETE')
    route('get', '/materials/m1', () => ok(M))
    route('delete', '/materials/m1', () => ok())
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true, title: 'Xoá vật tư XM?' }),
    )
    expect(callsTo('delete', '/materials/m1')).toHaveLength(1)
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(materialKeys.detail('m1'))).toBeUndefined()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: materialKeys.lists() }))
  })

  it('lỗi inUse (100712) → câu dưới nút Xoá, không back', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_DELETE')
    route('get', '/materials/m1', () => ok(M))
    route('delete', '/materials/m1', () =>
      reply(409, { statusCode: 409, code: 100712, message: 'x' }),
    )
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(callsTo('delete', '/materials/m1')).toHaveLength(1)
    expect(mockBack).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeOnTheScreen()
  })

  it('(e) GET 404 100701 → "không còn nữa", ẩn Sửa / Xoá', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_UPDATE', 'MATERIAL_DELETE', 'UNIT_READ')
    route('get', '/materials/m1', () => reply(404, { statusCode: 404, code: 100701, message: 'x' }))
    await show()
    expect(screen.getByText(/không còn nữa/)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull()
    expect(rightItems()).toHaveLength(0)
  })

  it('(f) đổi phiên lúc DELETE đang chờ → không back, không invalidate', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_DELETE')
    route('get', '/materials/m1', () => ok(M))
    route('delete', '/materials/m1', () => {
      mockEpoch++
      return ok()
    })
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(callsTo('delete', '/materials/m1')).toHaveLength(1)
    expect(mockBack).not.toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })

  it('đang chờ DELETE → nút Sửa ẩn, dòng quy đổi và "+ Thêm" không bấm được', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_UPDATE', 'MATERIAL_DELETE', 'UNIT_UPDATE', 'UNIT_READ')
    route('get', '/materials/m1', () => ok(M))
    route('delete', '/materials/m1', () => 'hang')
    await show()
    expect(rightItems()).toHaveLength(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(callsTo('delete', '/materials/m1')).toHaveLength(1)
    expect(rightItems()).toHaveLength(0)
    await fireEvent.press(screen.getByText('1 THUNG = 24 CAI'))
    expect(screen.queryByText('Thêm đơn vị quy đổi')).toBeNull()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('§5.3: Loại "MÃ · tên", Tối thiểu / Tối đa kèm mã đơn vị gốc', async () => {
    signIn('MATERIAL_READ')
    await show()
    expect(screen.getByText('XD · Xây dựng')).toBeOnTheScreen()
    expect(screen.getByText('10 CAI')).toBeOnTheScreen()
    expect(screen.getByText('100 CAI')).toBeOnTheScreen()
  })

  it('§5.3: Tối thiểu / Tối đa = 0 → "Không đặt"', async () => {
    signIn('MATERIAL_READ')
    route('get', '/materials/m1', () => ok({ ...M, minimumInventory: 0, maximumInventory: 0 }))
    await show()
    expect(screen.getAllByText('Không đặt')).toHaveLength(2)
  })

  it('§5.3: dòng kho "Tồn x · Khả dụng y MÃ"', async () => {
    signIn('MATERIAL_READ')
    await show()
    const wh = within(screen.getByTestId('material-warehouses'))
    expect(wh.getByText('Tồn 12 · Khả dụng 10 CAI')).toBeOnTheScreen()
  })

  it('§5.3: chỉ có dòng gốc + không quyền quy đổi → "Chưa có đơn vị quy đổi"', async () => {
    signIn('MATERIAL_READ')
    route('get', '/materials/m1', () => ok({ ...M, units: [M.units[0]] }))
    await show()
    expect(screen.getByText('Chưa có đơn vị quy đổi')).toBeOnTheScreen()
  })

  it('§5.3: chỉ có dòng gốc + có quyền quy đổi → không có câu mờ', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_UPDATE', 'UNIT_UPDATE', 'UNIT_READ')
    route('get', '/materials/m1', () => ok({ ...M, units: [M.units[0]] }))
    await show()
    expect(screen.queryByText('Chưa có đơn vị quy đổi')).toBeNull()
  })
})

describe('MaterialDetailScreen - khối Kho (gắn / gỡ)', () => {
  const PERMS = ['MATERIAL_READ', 'MATERIAL_UPDATE', 'WAREHOUSE_UPDATE']
  const withWh = (w: object, extra: object = {}) =>
    route('get', '/materials/m1', () => ok({ ...M, ...extra, warehouses: [{ ...WH, ...w }] }))
  const DEL = '/warehouses/kho1/materials/m1'
  let alertSpy: jest.SpyInstance
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  })
  afterEach(() => alertSpy.mockRestore())

  it('thiếu WAREHOUSE_UPDATE: không có "Gắn vào kho", chạm dòng kho không làm gì', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_UPDATE')
    await show()
    expect(screen.queryByText('Gắn vào kho')).toBeNull()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(alertSpy).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(callsTo('delete', DEL)).toHaveLength(0)
  })

  it('còn tồn → Alert "Còn 3 CAI", không request', async () => {
    signIn(...PERMS)
    withWh({ quantity: 3, availableQuantity: 3 })
    route('delete', DEL, () => ok())
    await show()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(alertSpy).toHaveBeenCalledWith(
      'Chưa gỡ được',
      expect.stringContaining('Còn 3 CAI trong kho Kho Tổng'),
    )
    expect(confirm).not.toHaveBeenCalled()
    expect(callsTo('delete', DEL)).toHaveLength(0)
  })

  it('đang giữ chỗ (available < 0) → Alert reserved, không request', async () => {
    signIn(...PERMS)
    withWh({ quantity: 0, availableQuantity: -2 })
    await show()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(alertSpy).toHaveBeenCalledWith('Chưa gỡ được', expect.stringContaining('giữ chỗ'))
    expect(callsTo('delete', DEL)).toHaveLength(0)
  })

  it('kho {0,0} → xác nhận destructive, đúng một DELETE, invalidate chi tiết', async () => {
    signIn(...PERMS)
    withWh({ quantity: 0, availableQuantity: 0 })
    route('delete', DEL, () => ok())
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        destructive: true,
        title: 'Gỡ XM khỏi Kho Tổng?',
        message: 'Sau khi gỡ, hiện chưa gắn lại được vật tư này vào kho này.',
      }),
    )
    expect(callsTo('delete', DEL)).toHaveLength(1)
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: materialKeys.detail('m1') }),
    )
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('chạm dòng kho hai lần khi hộp còn mở → confirmAction một lần', async () => {
    signIn(...PERMS)
    withWh({ quantity: 0, availableQuantity: 0 })
    route('delete', DEL, () => ok())
    confirm.mockReturnValue(new Promise(() => undefined))
    await show()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('DELETE 400 100807 → Alert blockedTitle', async () => {
    signIn(...PERMS)
    withWh({ quantity: 0, availableQuantity: 0 })
    route('delete', DEL, () => reply(400, { statusCode: 400, code: 100807, message: 'x' }))
    await show()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(callsTo('delete', DEL)).toHaveLength(1)
    expect(alertSpy).toHaveBeenCalledWith('Chưa gỡ được', expect.any(String))
  })

  it('DELETE 404 100801 → im lặng: không Alert, không hộp lỗi', async () => {
    signIn(...PERMS)
    withWh({ quantity: 0, availableQuantity: 0 })
    route('delete', DEL, () => reply(404, { statusCode: 404, code: 100801, message: 'x' }))
    await show()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(callsTo('delete', DEL)).toHaveLength(1)
    expect(alertSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lỗi chung → hộp lỗi của màn chi tiết', async () => {
    signIn(...PERMS)
    withWh({ quantity: 0, availableQuantity: 0 })
    route('delete', DEL, () => reply(500, { statusCode: 500, code: 1, message: 'x' }))
    await show()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(screen.getByRole('alert')).toBeOnTheScreen()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('lỗi chung rồi gỡ lần hai thành công → hộp lỗi cũ biến mất', async () => {
    signIn(...PERMS)
    withWh({ quantity: 0, availableQuantity: 0 })
    let n = 0
    route('delete', DEL, () =>
      n++ === 0 ? reply(500, { statusCode: 500, code: 1, message: 'x' }) : ok(),
    )
    await show()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(screen.getByRole('alert')).toBeOnTheScreen()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(callsTo('delete', DEL)).toHaveLength(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('đổi phiên giữa DELETE → không invalidate', async () => {
    signIn(...PERMS)
    withWh({ quantity: 0, availableQuantity: 0 })
    route('delete', DEL, () => {
      mockEpoch++
      return ok()
    })
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(callsTo('delete', DEL)).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
  })

  it('baseUnit null → "Gắn vào kho" disabled + câu needBaseUnit', async () => {
    signIn(...PERMS)
    withWh({}, { baseUnit: null })
    await show()
    expect(screen.getByText('Cần đặt đơn vị gốc trước khi gắn vào kho.')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Gắn vào kho' })).toBeDisabled()
    await fireEvent.press(screen.getByText('Gắn vào kho'))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('đổi phiên rồi DELETE lỗi 500 → không Alert, không hộp lỗi, không invalidate', async () => {
    signIn(...PERMS)
    withWh({ quantity: 0, availableQuantity: 0 })
    route('delete', DEL, () => {
      mockEpoch++
      return reply(500, { statusCode: 500, code: 1, message: 'x' })
    })
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show()
    await fireEvent.press(screen.getByText('Kho Tổng'))
    await settled()
    expect(callsTo('delete', DEL)).toHaveLength(1)
    expect(alertSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('chạm "Gắn vào kho" → /warehouse-assign với material', async () => {
    signIn(...PERMS)
    await show()
    await fireEvent.press(screen.getByText('Gắn vào kho'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/warehouse-assign',
      params: { material: 'm1' },
    })
  })
})
