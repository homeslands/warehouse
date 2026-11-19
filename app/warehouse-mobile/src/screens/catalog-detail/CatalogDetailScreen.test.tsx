// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, calls, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'
import { Platform } from 'react-native'

import { materialTypeKeys } from '@/entities/material-type'
import { useAuthStore, type CurrentUser } from '@/entities/session'
import { unitKeys } from '@/entities/unit'
import type { CatalogKind } from '@/features/catalog-form'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { confirmAction } from '@/shared/lib/native-confirm'

import { CatalogDetailScreen } from './CatalogDetailScreen'

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

const UNIT = {
  slug: 'kg',
  code: 'KG',
  name: 'Kilogam',
  description: null,
  createdAt: '2026-03-05T08:00:00',
  updatedAt: '2026-04-06T09:00:00',
}
const MT = {
  slug: 'mt',
  code: 'XD',
  name: 'Xây dựng',
  description: 'Vật liệu thô',
  createdAt: '',
  updatedAt: '',
}

let client: QueryClient

async function settled() {
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
}

async function show(kind: CatalogKind, slug: string) {
  mockParams.slug = slug
  await render(
    <QueryClientProvider client={client}>
      <CatalogDetailScreen kind={kind} />
    </QueryClientProvider>,
  )
  await settled()
}

const signIn = (...perms: string[]) => useAuthStore.setState({ user: user(...perms) } as never)

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
  route('get', '/units/kg', () => ok(UNIT))
  route('get', '/material-types/mt', () => ok(MT))
})

afterEach(async () => {
  await cleanup()
  client.clear()
  useAuthStore.setState({ user: null } as never)
})

describe('CatalogDetailScreen — hiển thị', () => {
  it('thông tin: mã, tên, mô tả trống = "—", chân ngày tạo / cập nhật; tiêu đề header = mã', async () => {
    signIn('UNIT_READ')
    await show('unit', 'kg')
    expect(mockHeader.options.title).toBe('KG')
    expect(screen.getByText('Kilogam')).toBeOnTheScreen()
    expect(screen.getByText('—')).toBeOnTheScreen()
    expect(screen.getByText('Tạo 05/03/2026 · Cập nhật 06/04/2026')).toBeOnTheScreen()
  })

  it('loại vật tư: có mô tả, không có khối "Đang dùng"', async () => {
    signIn('MATERIAL_READ')
    await show('material-type', 'mt')
    expect(screen.getByText('Vật liệu thô')).toBeOnTheScreen()
    expect(screen.queryByTestId('unit-usage')).toBeNull()
  })

  it('khối "Đang dùng": đơn vị gốc / quy đổi (quy đổi = max(0, conv − base)); số lấy từ list', async () => {
    signIn('UNIT_READ')
    client.setQueryData(unitKeys.list(), [
      { ...UNIT, materialCount: { asBaseUnit: 2, asConversionUnit: 5, total: 5 } },
    ])
    await show('unit', 'kg')
    const usage = within(screen.getByTestId('unit-usage'))
    expect(usage.getByText('Đơn vị gốc')).toBeOnTheScreen()
    expect(usage.getByText('2 vật tư')).toBeOnTheScreen()
    expect(usage.getByText('Đơn vị quy đổi')).toBeOnTheScreen()
    expect(usage.getByText('3 vật tư')).toBeOnTheScreen()
  })

  it('đơn vị không biết số đang dùng (deep link, chưa có list): không có khối "Đang dùng"', async () => {
    signIn('UNIT_READ')
    await show('unit', 'kg')
    expect(screen.queryByTestId('unit-usage')).toBeNull()
  })

  it('thiếu quyền READ: "noAccess", không gọi API', async () => {
    signIn('MATERIAL_READ')
    await show('unit', 'kg')
    expect(screen.getByText('Bạn không có quyền xem mục này.')).toBeOnTheScreen()
    expect(calls.filter((c) => c.url.includes('/units'))).toHaveLength(0)
  })

  it('tải lỗi lần đầu (500) → màn lỗi có Thử lại', async () => {
    signIn('UNIT_READ')
    route('get', '/units/kg', () => reply(500, { statusCode: 500, message: 'x' }))
    await show('unit', 'kg')
    expect(screen.getByText('Không tải được dữ liệu')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: /Thử lại/ })).toBeOnTheScreen()
  })

  it('tải 404 (100901) → "không còn nữa", làm mới list, không Sửa / Xoá', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE', 'UNIT_DELETE')
    route('get', '/units/kg', () => reply(404, { statusCode: 404, code: 100901, message: 'x' }))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('unit', 'kg')
    expect(screen.getByText(/không còn nữa/)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull()
    expect(rightItems()).toHaveLength(0)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: unitKeys.list() }))
    expect(mockBack).not.toHaveBeenCalled()
  })
})

describe('CatalogDetailScreen — nút Sửa', () => {
  it('thiếu UPDATE: không có nút Sửa', async () => {
    signIn('UNIT_READ', 'UNIT_DELETE')
    await show('unit', 'kg')
    expect(rightItems()).toHaveLength(0)
  })

  it('có UPDATE (iOS): nút chữ "Sửa" → push sheet với slug', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE')
    await show('unit', 'kg')
    const items = rightItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'button', label: 'Sửa' })
    await act(async () => (items[0] as { onPress: () => void }).onPress())
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/unit-form', params: { slug: 'kg' } })
  })

  it('Android: headerRight là nút chữ "Sửa"', async () => {
    const original = Platform.OS
    Platform.OS = 'android'
    try {
      signIn('MATERIAL_READ', 'MATERIAL_UPDATE')
      await show('material-type', 'mt')
      expect(mockHeader.options.unstable_headerRightItems).toBeUndefined()
      const Right = mockHeader.options.headerRight as () => React.ReactElement
      await render(<>{Right()}</>)
      await fireEvent.press(screen.getByRole('button', { name: 'Sửa' }))
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/material-type-form',
        params: { slug: 'mt' },
      })
    } finally {
      Platform.OS = original
    }
  })
})

describe('CatalogDetailScreen — xoá', () => {
  it('thiếu DELETE: không có nút Xoá', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE')
    await show('unit', 'kg')
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull()
  })

  it('đơn vị đang được 2 vật tư dùng (số từ list, detail không có): Xoá khoá + chú thích, bấm không gọi API', async () => {
    signIn('UNIT_READ', 'UNIT_DELETE')
    client.setQueryData(unitKeys.list(), [
      { ...UNIT, materialCount: { asBaseUnit: 2, asConversionUnit: 2, total: 2 } },
    ])
    route('delete', '/units/kg', () => ok())
    await show('unit', 'kg')
    expect(callsTo('get', '/units/kg').length).toBeGreaterThanOrEqual(1)
    const del = screen.getByRole('button', { name: 'Xoá' })
    expect(del).toBeDisabled()
    expect(screen.getByText('Đang được 2 vật tư dùng, không thể xoá.')).toBeOnTheScreen()
    await fireEvent.press(del)
    await settled()
    expect(confirm).not.toHaveBeenCalled()
    expect(callsTo('delete', '/units/kg')).toHaveLength(0)
  })

  it('đơn vị không có số đang dùng: Xoá vẫn bấm được, BE chặn 100909 → câu dưới nút', async () => {
    signIn('UNIT_READ', 'UNIT_DELETE')
    route('delete', '/units/kg', () => reply(409, { statusCode: 409, code: 100909, message: 'x' }))
    await show('unit', 'kg')
    expect(screen.getByRole('button', { name: 'Xoá' })).toBeEnabled()
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(callsTo('delete', '/units/kg')).toHaveLength(1)
    expect(screen.getByText(/Đơn vị còn được vật tư dùng/)).toBeOnTheScreen()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('xoá loại vật tư: confirm destructive → DELETE → lỗi 100609 hiện dưới nút Xoá', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_DELETE')
    route('delete', '/material-types/mt', () =>
      reply(409, { statusCode: 409, code: 100609, message: 'x' }),
    )
    await show('material-type', 'mt')
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true, title: 'Xoá loại vật tư XD?' }),
    )
    expect(callsTo('delete', '/material-types/mt')).toHaveLength(1)
    expect(screen.getByText(/Loại vật tư còn vật tư thuộc loại/)).toBeOnTheScreen()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('người dùng không đồng ý ở hộp xác nhận → không gọi API', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_DELETE')
    confirm.mockResolvedValueOnce(false)
    await show('material-type', 'mt')
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(callsTo('delete', '/material-types/mt')).toHaveLength(0)
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('lỗi chung (500) → câu lỗi hiện, nút Xoá mở khoá lại', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_DELETE')
    route('delete', '/material-types/mt', () => reply(500, { statusCode: 500, message: 'x' }))
    await show('material-type', 'mt')
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(screen.getByRole('alert')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Xoá' })).toBeEnabled()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('xoá thành công → gỡ detail, invalidate list + inventory, back đúng 1 lần', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_DELETE')
    route('delete', '/material-types/mt', () => ok())
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('material-type', 'mt')
    const getsBefore = callsTo('get', '/material-types/mt').length
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: materialTypeKeys.list() }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['inventory'] }))
    expect(spy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: materialTypeKeys.detail('mt') }),
    )
    expect(client.getQueryData(materialTypeKeys.detail('mt'))).toBeUndefined()
    expect(callsTo('get', '/material-types/mt')).toHaveLength(getsBefore)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('phiên đổi giữa lúc xoá → không invalidate, không back', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_DELETE')
    route('delete', '/material-types/mt', () => {
      mockEpoch++
      return ok()
    })
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('material-type', 'mt')
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(callsTo('delete', '/material-types/mt')).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('bấm Xoá hai lần (cả lúc hộp xác nhận đang mở) → 1 hộp, 1 request', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_DELETE')
    route('delete', '/material-types/mt', () => ok())
    let answer: (v: boolean) => void = () => {}
    confirm.mockReturnValueOnce(new Promise<boolean>((r) => (answer = r)))
    await show('material-type', 'mt')
    const del = screen.getByRole('button', { name: 'Xoá' })
    await fireEvent.press(del)
    await fireEvent.press(del)
    await act(async () => answer(true))
    await settled()
    await fireEvent.press(del)
    await settled()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(callsTo('delete', '/material-types/mt')).toHaveLength(1)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('xoá gặp 404 (100901) → câu "không còn nữa", ẩn Xoá và Sửa, làm mới list, không back', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE', 'UNIT_DELETE')
    route('delete', '/units/kg', () => reply(404, { statusCode: 404, code: 100901, message: 'x' }))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('unit', 'kg')
    expect(rightItems()).toHaveLength(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }))
    await settled()
    expect(screen.getByRole('alert')).toHaveTextContent(/không còn nữa/)
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull()
    expect(rightItems()).toHaveLength(0)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: unitKeys.list() }))
    expect(mockBack).not.toHaveBeenCalled()
  })
})
