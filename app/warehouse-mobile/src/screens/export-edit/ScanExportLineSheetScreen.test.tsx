import { StyleSheet } from 'react-native'
// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { item as stockItem } from '@/entities/inventory/model/fixtures'
import { useWarehouseStore } from '@/entities/warehouse'
import { stopExportDraftPersistence, useExportDraft } from '@/features/export-draft'
import { makeDraft, makeLine } from '@/features/export-draft/model/fixtures'
import { SafeAreaWrapper } from '@/shared/ui/testing/safe-area'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { ScanExportLineSheetScreen } from './ScanExportLineSheetScreen'

const mockNavigate = jest.fn()
const mockBack = jest.fn()
let now = 1_000_000
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, back: mockBack, canGoBack: () => true }),
  Stack: { Screen: () => null },
}))

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
let client: QueryClient

function seed(lines = [makeLine(1), makeLine(2)]) {
  useExportDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'px-1' },
    draft: makeDraft(lines),
    saving: false,
  })
}
async function show() {
  route('get', '/warehouses/wh-a/materials', () =>
    ok({
      items: [
        stockItem({ materialSlug: 'm-1', materialCode: 'VT1' }),
        stockItem({ materialSlug: 'm-2', materialCode: 'VT2' }),
        stockItem({ materialSlug: 'son', materialCode: 'SN1', materialName: 'Sơn' }),
      ],
      total: 3,
      page: 1,
      pageSize: 100,
      totalPages: 1,
      hasNext: false,
    }),
  )
  await render(
    <QueryClientProvider client={client}>
      <ScanExportLineSheetScreen />
    </QueryClientProvider>,
    { wrapper: SafeAreaWrapper },
  )
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
}
/** Mỗi lần quét cách lần trước 3 s (qua cả hai ngưỡng chống đọc lặp của camera). */
const scan = (data: string) => {
  now += 3000
  return fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data, type: 'code128' })
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(async () => {
  jest.requireMock('expo-camera').__permission.reset()
  jest.clearAllMocks()
  now = 1_000_000
  jest.spyOn(performance, 'now').mockImplementation(() => now)
  resetFakeApi()
  await AsyncStorage.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
})
afterEach(async () => {
  await act(async () => useExportDraft.getState().reset())
  stopExportDraftPersistence()
  client.clear()
})

const hapticsMock = () => jest.requireMock('expo-haptics').notificationAsync as jest.Mock
const has = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
const entries = () => screen.queryAllByTestId('scan-entry', { includeHiddenElements: true })

describe('ScanExportLineSheetScreen', () => {
  it('chưa quét → "Chưa quét vật tư nào", tiêu đề "Đã quét · 0"; gợi ý chỉ còn dưới khung', async () => {
    seed()
    await show()
    expect(screen.getByText('Chưa quét vật tư nào')).toBeOnTheScreen()
    expect(screen.getByTestId('scan-count')).toHaveTextContent('Đã quét · 0')
    expect(screen.getAllByText(/Đưa mã vạch hoặc mã QR/)).toHaveLength(1)
  })

  it('quét vật tư chưa có dòng → thêm dòng mới (+1, đơn vị gốc), sheet ở lại, mục ✓ trong danh sách', async () => {
    seed()
    await show()
    await scan('SN1')
    expect(mockBack).not.toHaveBeenCalled()
    const lines = useExportDraft.getState().draft!.lines
    expect(lines).toHaveLength(3)
    expect(lines[2]).toEqual(
      expect.objectContaining({ materialSlug: 'son', unitSlug: 'u-bag', quantity: 1, base: null }),
    )
    expect(entries()).toHaveLength(1)
    expect(entries()[0]).toHaveTextContent(has('Sơn'))
    expect(entries()[0]).toHaveTextContent(has('＋1 · SL 1 Bao'))
    expect(screen.getByTestId('scan-count')).toHaveTextContent('Đã quét · 1')
    expect(hapticsMock()).toHaveBeenLastCalledWith('success')
  })

  it('thu gọn: vùng danh sách cao CỐ ĐỊNH trước và sau khi quét (khung ngắm không nhảy)', async () => {
    seed()
    await show()
    const height = () => StyleSheet.flatten(screen.getByTestId('scan-list').props.style).height
    const before = height()
    expect(before).toBeGreaterThan(0)
    await scan('SN1')
    expect(height()).toBe(before)
    await scan('SN1*S-001')
    await scan('SN1*S-002')
    expect(height()).toBe(before)
  })

  it('quét liên tiếp → cộng dồn; danh sách mới nhất ở trên, kèm serial', async () => {
    seed()
    await show()
    await scan('SN1')
    await scan('SN1*S-001')
    await scan('SN1*S-002')
    const lines = useExportDraft.getState().draft!.lines
    expect(lines).toHaveLength(3)
    expect(lines[2]!.quantity).toBe(3)
    await fireEvent.press(screen.getByTestId('scan-expand'))
    const rows = entries()
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent(has('＋1 · SL 3 Bao · S-002'))
    expect(rows[1]).toHaveTextContent(has('＋1 · SL 2 Bao · S-001'))
    expect(rows[2]).toHaveTextContent(has('＋1 · SL 1 Bao'))
    expect(screen.getByTestId('scan-count')).toHaveTextContent('Đã quét · 3')
  })

  it('quét lại serial sau khi đã đưa ra ngoài → mục ⚠ (không phải lỗi), rung warning, không đổi phiếu, không tăng đếm', async () => {
    seed()
    await show()
    await scan('SN1*S-001')
    await scan('SN1*S-001')
    expect(useExportDraft.getState().draft!.lines[2]!.quantity).toBe(1)
    expect(entries()[0]).toHaveTextContent(has('Sơn'))
    expect(entries()[0]).toHaveTextContent(has('Serial đã quét · S-001'))
    expect(hapticsMock()).toHaveBeenLastCalledWith('warning')
    expect(screen.getByTestId('scan-count')).toHaveTextContent('Đã quét · 1')
  })

  it('nhãn serial còn trong khung (camera bỏ qua) → thêm mục ⚠ đúng một lần + rung warning', async () => {
    seed()
    await show()
    await scan('SN1*S-001')
    for (let i = 0; i < 4; i++) {
      now += 300
      await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', {
        data: 'SN1*S-001',
        type: 'code128',
      })
    }
    expect(entries()).toHaveLength(2)
    expect(entries()[0]).toHaveTextContent(has('Serial đã quét · S-001'))
    expect(hapticsMock()).toHaveBeenLastCalledWith('warning')
    expect(useExportDraft.getState().draft!.lines[2]!.quantity).toBe(1)
    expect(screen.getByTestId('scan-count')).toHaveTextContent('Đã quét · 1')
  })

  it('nhãn chỉ Mã còn trong khung → không thêm mục, không rung thêm, hiện dòng tạm rồi tự tắt sau 2,5 s', async () => {
    try {
      seed()
      await show()
      jest.useFakeTimers()
      await scan('SN1')
      const calls = hapticsMock().mock.calls.length
      now += 300
      await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', {
        data: 'SN1',
        type: 'code128',
      })
      expect(screen.getByTestId('scan-notice')).toHaveTextContent(
        'Mã vẫn trong khung — đưa ra ngoài rồi quét lại để cộng thêm',
      )
      expect(entries()).toHaveLength(1)
      expect(hapticsMock().mock.calls).toHaveLength(calls)
      await act(async () => jest.advanceTimersByTime(2600))
      expect(screen.queryByTestId('scan-notice')).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('danh sách chỉ giữ 50 mục mới nhất', async () => {
    seed()
    await show()
    for (let i = 0; i < 52; i++) await scan(`NOPE-${i}`)
    await fireEvent.press(screen.getByRole('button', { name: 'Xem tất cả mục đã quét' }))
    expect(entries()).toHaveLength(50)
    expect(entries()[0]).toHaveTextContent(has('NOPE-51'))
    expect(screen.getByTestId('scan-count')).toHaveTextContent('Đã quét · 0')
  })

  it('thu gọn chỉ 2 mục mới nhất; mở rộng hiện đủ, nút đổi nhãn + expanded, camera tạm dừng', async () => {
    seed()
    await show()
    for (let i = 0; i < 4; i++) await scan(`NOPE-${i}`)
    expect(entries()).toHaveLength(2)
    expect(entries()[0]).toHaveTextContent(has('NOPE-3'))
    const btn = () => screen.getByTestId('scan-expand')
    expect(btn()).toHaveTextContent('Xem tất cả')
    expect(btn().props.accessibilityState).toEqual({ expanded: false })
    await fireEvent.press(btn())
    expect(entries()).toHaveLength(4)
    expect(btn()).toHaveTextContent('Thu gọn')
    expect(btn().props.accessibilityState).toEqual({ expanded: true })
    expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined()
    await fireEvent.press(screen.getByTestId('scan-grabber'))
    expect(entries()).toHaveLength(2)
    expect(btn()).toHaveTextContent('Xem tất cả')
    expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeDefined()
  })

  it('mã không khớp → mục ✕ với mã, không tăng đếm', async () => {
    seed()
    await show()
    await scan(' 8934563 ')
    expect(useExportDraft.getState().draft!.lines).toHaveLength(2)
    expect(entries()[0]).toHaveTextContent(has('8934563'))
    expect(entries()[0]).toHaveTextContent(has('Không tìm thấy vật tư trong kho'))
    expect(hapticsMock()).toHaveBeenLastCalledWith('error')
    expect(screen.getByTestId('scan-count')).toHaveTextContent('Đã quét · 0')
  })

  it('phiếu đủ 200 dòng → báo đủ dòng, không thêm', async () => {
    seed(Array.from({ length: 200 }, (_, i) => makeLine(i + 1000)))
    await show()
    await scan('SN1')
    expect(useExportDraft.getState().draft!.lines).toHaveLength(200)
    expect(entries()[0]).toHaveTextContent(has('Phiếu đã đủ 200 dòng'))
  })

  it('đang lưu phiếu → camera tắt (không đọc), báo đang lưu', async () => {
    seed()
    await show()
    await act(async () => useExportDraft.setState({ saving: true }))
    expect(screen.getByText(/Đang lưu phiếu/)).toBeOnTheScreen()
    await scan('VT1')
    expect(useExportDraft.getState().draft!.lines).toHaveLength(2)
    expect(useExportDraft.getState().draft!.lines[0]!.quantity).toBe(10)
  })

  it('bản nháp thuộc kho khác kho đang chọn → đóng sheet, không quét vào phiếu', async () => {
    seed()
    useExportDraft.setState({ ctx: { userSlug: 'u', warehouseSlug: 'wh-b', formSlug: 'px-1' } })
    await show()
    expect(mockBack).toHaveBeenCalledTimes(1)
    await scan('SN1')
    expect(useExportDraft.getState().draft!.lines).toHaveLength(2)
  })

  it('đổi kho khi sheet đang mở → đóng sheet đúng một lần', async () => {
    seed()
    await show()
    await act(async () =>
      useWarehouseStore.setState({ current: { ...WH, slug: 'wh-b', code: 'B' } }),
    )
    await act(async () => useWarehouseStore.setState({ current: { ...WH, slug: 'wh-c' } }))
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('"Xong" đóng sheet', async () => {
    seed()
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Xong' }))
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('tồn kho tải lỗi → báo lỗi + Thử lại', async () => {
    seed()
    route('get', '/warehouses/wh-a/materials', () => {
      throw new Error('boom')
    })
    await render(
      <QueryClientProvider client={client}>
        <ScanExportLineSheetScreen />
      </QueryClientProvider>,
      { wrapper: SafeAreaWrapper },
    )
    await act(async () => {
      for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.getByText('Không tải được tồn kho')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeOnTheScreen()
  })
})
