import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { item } from '@/entities/inventory/model/fixtures'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { SafeAreaWrapper } from '@/shared/ui/testing/safe-area'

import { ScanMaterialSheetScreen } from './ScanMaterialSheetScreen'
import { useStockFilter } from './stock-filter.store'

const mockPush = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true }),
  Stack: { Screen: () => null },
}))

const mockXM = item({ slug: 'i-xm', materialCode: 'VT-XM-040', materialSlug: 'xi-mang' })
jest.mock('@/entities/inventory', () => ({
  ...jest.requireActual('@/entities/inventory'),
  useInventory: () => ({
    data: [mockXM],
    errorUpdateCount: 0,
    isFetching: false,
    refetch: jest.fn(),
  }),
}))

const scan = (data: string) =>
  fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data, type: 'code128' })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  jest.clearAllMocks()
  jest.requireMock('expo-camera').__permission.reset()
  useStockFilter.getState().setQuery('')
  useWarehouseStore.setState({
    current: { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true },
    resolved: true,
    resolution: 'selected',
  })
})

describe('ScanMaterialSheetScreen', () => {
  it('khớp → đóng sheet rồi mở chi tiết vật tư', async () => {
    await render(<ScanMaterialSheetScreen />, { wrapper: SafeAreaWrapper })
    await scan('vt-xm-040')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/stock/[materialSlug]',
      params: { materialSlug: 'xi-mang' },
    })
  })

  it('không khớp → ghi mã vào ô tìm kiếm và đóng', async () => {
    await render(<ScanMaterialSheetScreen />, { wrapper: SafeAreaWrapper })
    await scan('8934563')
    expect(useStockFilter.getState().query).toBe('8934563')
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('khớp rồi bấm ✕ (lúc đang trượt đóng) → vẫn chỉ back() MỘT lần, không thoát trang chi tiết', async () => {
    await render(<ScanMaterialSheetScreen />, { wrapper: SafeAreaWrapper })
    await scan('VT-XM-040')
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Đóng' })))
    expect(mockBack).toHaveBeenCalledTimes(1)
  })
})
