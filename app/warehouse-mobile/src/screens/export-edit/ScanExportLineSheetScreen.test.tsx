// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { item as stockItem } from '@/entities/inventory/model/fixtures'
import { useWarehouseStore } from '@/entities/warehouse'
import { stopExportDraftPersistence, useExportDraft } from '@/features/export-draft'
import { makeDraft, makeLine } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { ScanExportLineSheetScreen } from './ScanExportLineSheetScreen'
import { useLineFocus } from '@/shared/lib/line-focus'
import { useExportScanNotice } from './scan-notice.store'

const mockNavigate = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, back: mockBack, canGoBack: () => true }),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
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
  )
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
}
const scan = (data: string) =>
  fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data, type: 'code128' })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(async () => {
  jest.requireMock('expo-camera').__permission.reset()
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  useExportScanNotice.getState().clear()
  useLineFocus.getState().clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
})
afterEach(async () => {
  await act(async () => useExportDraft.getState().reset())
  stopExportDraftPersistence()
  client.clear()
})

describe('ScanExportLineSheetScreen', () => {
  it('matching an existing line asks step 2 to open its sheet (closes; does not navigate itself)', async () => {
    seed()
    await show()
    await scan(' vt2 ')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    // Sheet này chỉ đóng; bước 2 (được focus lại) mở sheet `/export-line` của dòng đó — `useComposeLineOpen`.
    expect(useLineFocus.getState().request).toEqual({
      kind: 'export',
      formSlug: 'px-1',
      key: 'm-2|u-2|',
    })
    expect(useExportDraft.getState().draft!.lines).toHaveLength(2)
    expect(useExportScanNotice.getState().notice).toBeNull()
  })

  it('vật tư có nhiều dòng (đơn vị / lô khác) → dòng đầu theo thứ tự trên phiếu', async () => {
    seed([
      makeLine(1, { materialSlug: 'a', materialCode: 'VT-A', unitSlug: 'kg' }),
      makeLine(2, { materialSlug: 'a', materialCode: 'VT-A', unitSlug: 'kg', batchSlug: 'b' }),
    ])
    await show()
    await scan('vt-a')
    expect(useLineFocus.getState().request).toEqual({
      kind: 'export',
      formSlug: 'px-1',
      key: 'a|kg|',
    })
  })

  it('khớp vật tư trong kho nhưng chưa có dòng → thêm thẳng một dòng (đơn vị gốc, lô tự động, số lượng chưa nhập, chưa có giá), đóng, yêu cầu mở sheet của dòng đó', async () => {
    seed()
    await show()
    await scan('SN1')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    const lines = useExportDraft.getState().draft!.lines
    expect(lines).toHaveLength(3)
    expect(lines[2]).toEqual(
      expect.objectContaining({
        key: 'son|u-bag|',
        materialSlug: 'son',
        unitSlug: 'u-bag',
        unitName: 'Bao',
        conversionRate: 1,
        quantity: 0,
        unitPrice: null,
        batchSlug: null,
        base: null,
      }),
    )
    expect(useLineFocus.getState().request).toEqual({
      kind: 'export',
      formSlug: 'px-1',
      key: 'son|u-bag|',
    })
    expect(useExportScanNotice.getState().notice).toBeNull()
  })

  it('phiếu đã đủ 200 dòng → không thêm, đóng + báo mức phiếu "đủ dòng"', async () => {
    seed(Array.from({ length: 200 }, (_, i) => makeLine(i + 1000)))
    await show()
    await scan('SN1')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(useExportDraft.getState().draft!.lines).toHaveLength(200)
    expect(useExportScanNotice.getState().notice).toEqual({
      formSlug: 'px-1',
      code: 'SN1',
      reason: 'full',
    })
  })

  it('không khớp đâu cả → đóng, ghi mã để màn phiếu báo; không điều hướng', async () => {
    seed()
    await show()
    await scan(' 8934563 ')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(useExportScanNotice.getState().notice).toEqual({
      formSlug: 'px-1',
      code: '8934563',
      reason: 'notFound',
    })
  })

  it('đang lưu phiếu → chỉ đóng, không điều hướng, không ghi thông báo', async () => {
    seed()
    await show()
    useExportDraft.setState({ saving: true })
    await scan('VT1')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(useExportScanNotice.getState().notice).toBeNull()
    expect(useLineFocus.getState().request).toBeNull()
  })
})
