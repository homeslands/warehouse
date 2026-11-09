import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'

import { inventoryKeys } from '@/entities/inventory'
import { item } from '@/entities/inventory/model/fixtures'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { SHEET_CLOSE_DELAY_MS } from '@/shared/lib/useSheetSubmit'

import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { StockFilterSheetScreen } from './StockFilterSheetScreen'
import { useStockFilter } from './stock-filter.store'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

const ITEMS = [
  item({ slug: '1', materialSlug: 'xm', typeSlug: 'xi-mang', typeName: 'Xi măng' }),
  item({ slug: '2', materialSlug: 'sn-1', typeSlug: 'son', typeName: 'Sơn' }),
  item({ slug: '3', materialSlug: 'sn-2', typeSlug: 'son', typeName: 'Sơn' }),
]

let client: QueryClient

async function show() {
  await render(
    <QueryClientProvider client={client}>
      <StockFilterSheetScreen />
    </QueryClientProvider>,
  )
}

const card = (name: RegExp) => screen.getByRole('button', { name })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(inventoryKeys.list('wh-a'), ITEMS)
  useWarehouseStore.setState({
    current: { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true },
    resolved: true,
    resolution: 'selected',
  })
  useStockFilter.getState().reset()
})

afterEach(() => client.clear())

describe('StockFilterSheetScreen (Android — thay menu Lọc native của iOS)', () => {
  it('tiêu đề "Lọc", hai nhóm "Mức tồn" / "Loại vật tư"; mặc định Tất cả / Tất cả loại', async () => {
    await show()
    expect(sheetHeader().title).toBe('Lọc')
    expect(screen.getByRole('header', { name: 'Mức tồn' })).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Loại vật tư' })).toBeOnTheScreen()
    expect(card(/^Tất cả$/)).toBeSelected()
    expect(card(/^Tất cả loại/)).toBeSelected()
    expect(card(/^Sơn/)).not.toBeSelected()
    expect(screen.getByText('2 vật tư')).toBeOnTheScreen()
    expect(screen.getByText('3 vật tư')).toBeOnTheScreen()
  })

  it('chạm chỉ đánh dấu (rung chọn); ✓ áp dụng cả hai nhóm rồi đóng', async () => {
    await show()
    await fireEvent.press(card(/^Dưới tối thiểu/))
    await fireEvent.press(card(/^Sơn/))
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2)
    expect(useStockFilter.getState().typeSlug).toBeUndefined()

    jest.useFakeTimers()
    try {
      await pressSheetDone()
      await act(async () => jest.advanceTimersByTime(0))
      expect(useStockFilter.getState()).toMatchObject({ level: 'low', typeSlug: 'son' })
      await act(async () => jest.advanceTimersByTime(SHEET_CLOSE_DELAY_MS))
      expect(mockBack).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('✓ khi giữ nguyên → đóng ngay, không rung; ✕ → đóng, bộ lọc giữ nguyên', async () => {
    await show()
    await pressSheetDone()
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(Haptics.notificationAsync).not.toHaveBeenCalled()

    await fireEvent.press(card(/^Xi măng/))
    await pressSheetCancel()
    expect(mockBack).toHaveBeenCalledTimes(2)
    expect(useStockFilter.getState().typeSlug).toBeUndefined()
  })
})
