// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'
import { Platform } from 'react-native'

import { useAuthStore } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { lightColors } from '@/shared/theme/tokens'

import { CatalogListScreen } from './CatalogListScreen'

const mockPush = jest.fn()
const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  Stack: {
    Screen: ({ options }: { options: NativeStackNavigationOptions }) => {
      mockHeader.options = options
      return null
    },
  },
}))

const baseUser = {
  userName: 'root',
  phonenumber: '0900000001',
  firstName: 'A',
  lastName: 'B',
  roleName: 'MANAGER',
}
const signIn = (scope: string[]) =>
  useAuthStore.setState({
    status: 'authenticated',
    user: { ...baseUser, scope } as never,
    endReason: null,
  })

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

const unit = (slug: string, code: string, name: string, extra: object = {}) => ({
  slug,
  code,
  name,
  createdAt: '',
  updatedAt: '',
  ...extra,
})

let client: QueryClient
async function show(kind: 'unit' | 'material-type' = 'unit') {
  await render(
    <QueryClientProvider client={client}>
      <CatalogListScreen kind={kind} />
    </QueryClientProvider>,
  )
  await act(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    await tick()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await tick()
    await tick()
  })
}

const rightItems = (): NativeStackHeaderItem[] =>
  mockHeader.options.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: false }) ?? []

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockHeader.options = {}
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  signIn(['UNIT_READ', 'UNIT_CREATE'])
})

describe('CatalogListScreen', () => {
  it('(a) gõ "cai" chỉ còn dòng "Cái"', async () => {
    route('get', '/units', () =>
      page([unit('u-1', 'CAI', 'Cái'), unit('u-2', 'KG', 'Kilogram'), unit('u-3', 'M', 'Mét')]),
    )
    await show()
    expect(screen.getByText('Kilogram')).toBeOnTheScreen()
    await act(async () =>
      fireEvent.changeText(screen.getByLabelText('Tìm theo mã hoặc tên'), 'cai'),
    )
    expect(screen.getByText('Cái')).toBeOnTheScreen()
    expect(screen.queryByText('Kilogram')).toBeNull()
    expect(screen.queryByText('Mét')).toBeNull()
  })

  it('(a2) lọc không ra → "Không có kết quả phù hợp"', async () => {
    route('get', '/units', () => page([unit('u-1', 'CAI', 'Cái')]))
    await show()
    await act(async () =>
      fireEvent.changeText(screen.getByLabelText('Tìm theo mã hoặc tên'), 'zzz'),
    )
    expect(screen.getByText('Không có kết quả phù hợp')).toBeOnTheScreen()
  })

  const usedUnits = () =>
    page([
      unit('u-1', 'KG', 'Kilogram', {
        materialCount: { asBaseUnit: 3, asConversionUnit: 5, total: 6 },
      }),
      unit('u-2', 'M', 'Mét', {
        description: 'Đo chiều dài',
        materialCount: { asBaseUnit: 0, asConversionUnit: 0, total: 0 },
      }),
      unit('u-3', 'L', 'Lít', {
        materialCount: { asBaseUnit: 4, asConversionUnit: 4, total: 4 },
      }),
    ])

  it('(b) đơn vị chia hai nhóm "Đang dùng" / "Chưa dùng"; dòng đang dùng hiện số total', async () => {
    route('get', '/units', usedUnits)
    await show()
    expect(screen.getByText('Đang dùng')).toBeOnTheScreen()
    expect(screen.getByText('Chưa dùng')).toBeOnTheScreen()
    const ends = screen.getAllByTestId('catalog-row-end')
    expect(ends).toHaveLength(2)
    // Mã A→Z: KG (6) rồi L (4) trong nhóm đang dùng.
    expect(ends[0]).toHaveTextContent('6 vật tư')
    expect(ends[1]).toHaveTextContent('4 vật tư')
    // Khuôn dòng chung với Nhập / Xuất / Tồn kho: ô icon 44 trung tính (không tô màu "đang dùng").
    for (const tile of screen.getAllByTestId('catalog-tile'))
      expect(tile).toHaveStyle({ width: 44, backgroundColor: lightColors.fill })
    // Đơn vị chưa dùng không có cột phải; mô tả nối sau mã.
    expect(screen.getByLabelText('Mét, M, Đo chiều dài')).toBeOnTheScreen()
    expect(screen.getByText(/· Đo chiều dài/)).toBeOnTheScreen()
  })

  it('(b2) nhóm rỗng không hiện: toàn đơn vị chưa dùng → không có tiêu đề "Đang dùng"', async () => {
    route('get', '/units', () =>
      page([
        unit('u-2', 'M', 'Mét', {
          materialCount: { asBaseUnit: 0, asConversionUnit: 0, total: 0 },
        }),
        unit('u-3', 'L', 'Lít'),
      ]),
    )
    await show()
    expect(screen.queryByText('Đang dùng')).toBeNull()
    expect(screen.getByText('Chưa dùng')).toBeOnTheScreen()
    expect(screen.queryAllByTestId('catalog-row-end')).toHaveLength(0)
  })

  it('(c) rỗng: hiện "empty" + gợi ý khi có quyền tạo; không gợi ý khi chỉ đọc', async () => {
    route('get', '/units', () => page([]))
    await show()
    expect(screen.getByText('Chưa có đơn vị nào')).toBeOnTheScreen()
    expect(screen.getByText('Đơn vị được tạo sẽ hiện ở đây.')).toBeOnTheScreen()
  })

  it('(c2) rỗng + chỉ đọc: không có gợi ý tạo', async () => {
    signIn(['UNIT_READ'])
    route('get', '/units', () => page([]))
    await show()
    expect(screen.getByText('Chưa có đơn vị nào')).toBeOnTheScreen()
    expect(screen.queryByText('Đơn vị được tạo sẽ hiện ở đây.')).toBeNull()
  })

  it('(d) thiếu UNIT_READ: "noAccess", không gọi API', async () => {
    signIn(['MATERIAL_READ'])
    route('get', '/units', () => page([]))
    await show()
    expect(screen.getByText('Bạn không có quyền xem mục này.')).toBeOnTheScreen()
    expect(calls.filter((c) => c.url.includes('/units'))).toHaveLength(0)
  })

  it('chạm dòng → push màn chi tiết /account/units/<slug>; nút + (iOS) mở sheet tạo', async () => {
    route('get', '/units', () => page([unit('u-1', 'KG', 'Kilogram')]))
    await show()
    await fireEvent.press(screen.getByRole('button', { name: /Kilogram/ }))
    expect(mockPush).toHaveBeenCalledWith('/account/units/u-1')
    const plus = rightItems()
    expect(plus).toHaveLength(1)
    expect(mockHeader.options.title).toBe('Đơn vị tính')
    await act(async () => (plus[0] as { onPress: () => void }).onPress())
    expect(mockPush).toHaveBeenLastCalledWith('/unit-form')
  })

  it('thiếu quyền tạo: header không có nút +', async () => {
    signIn(['UNIT_READ'])
    route('get', '/units', () => page([]))
    await show()
    expect(rightItems()).toHaveLength(0)
  })

  it('Android: headerRight là nút + 44pt', async () => {
    const original = Platform.OS
    Platform.OS = 'android'
    try {
      route('get', '/units', () => page([]))
      await show()
      expect(mockHeader.options.unstable_headerRightItems).toBeUndefined()
      const Right = mockHeader.options.headerRight as () => React.ReactElement
      await render(<>{Right()}</>)
      await fireEvent.press(screen.getByRole('button', { name: 'Thêm đơn vị' }))
      expect(mockPush).toHaveBeenCalledWith('/unit-form')
    } finally {
      Platform.OS = original
    }
  })

  it('loại vật tư: một khối không tiêu đề, không cột phải; chạm → /account/material-types/<slug>', async () => {
    signIn(['MATERIAL_READ'])
    route('get', '/material-types', () =>
      page([
        { slug: 't-1', code: 'XM', name: 'Xi măng', createdAt: '', updatedAt: '' },
        { slug: 't-2', code: 'GA', name: 'Gạch', createdAt: '', updatedAt: '' },
      ]),
    )
    await show('material-type')
    expect(screen.queryByText('Chưa dùng')).toBeNull()
    expect(screen.queryByText('Đang dùng')).toBeNull()
    expect(screen.queryAllByTestId('catalog-row-end')).toHaveLength(0)
    expect(screen.getAllByTestId('catalog-row')).toHaveLength(2)
    await fireEvent.press(screen.getByRole('button', { name: /Xi măng/ }))
    expect(mockPush).toHaveBeenCalledWith('/account/material-types/t-1')
  })
})
