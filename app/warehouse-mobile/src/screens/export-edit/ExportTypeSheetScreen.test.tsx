import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { stopExportDraftPersistence, useExportDraft } from '@/features/export-draft'
import { makeDraft } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ExportTypeSheetScreen } from './ExportTypeSheetScreen'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const WH_HN = { slug: 'wh-hn', code: 'HN', name: 'Kho Hà Nội', isManager: false }
const store = () => useExportDraft.getState()

function seed(
  header: Partial<ReturnType<typeof makeDraft>['header']> = {},
  warehouseSlug = 'wh-a',
) {
  const d = makeDraft([])
  useExportDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug, formSlug: 'new' },
    draft: { ...d, header: { ...d.header, type: 'PRODUCTION', ...header } },
  })
}
const card = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  useWarehouseStore.setState({
    current: WH,
    warehouses: null,
    resolved: true,
    resolution: 'selected',
  })
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope: [], warehouses: [WH, WH_HN] } as never,
  })
})
afterEach(() => {
  stopExportDraftPersistence()
  store().reset()
})

describe('ExportTypeSheetScreen', () => {
  it('5 loại, loại hiện tại được chọn; chạm chỉ đánh dấu, ✓ mới ghi rồi đóng', async () => {
    seed()
    await render(<ExportTypeSheetScreen />)
    expect(sheetHeader().title).toBe('Loại')
    for (const name of ['Sản xuất', 'Bán', 'Chuyển kho', 'Huỷ', 'Khác']) {
      expect(card(name)).toBeOnTheScreen()
    }
    expect(card('Sản xuất')).toBeSelected()
    await fireEvent.press(card('Bán'))
    expect(card('Bán')).toBeSelected()
    expect(store().draft!.header.type).toBe('PRODUCTION')
    await pressSheetDone()
    expect(store().draft!.header.type).toBe('SALE')
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('✕ đóng, không ghi', async () => {
    seed()
    await render(<ExportTypeSheetScreen />)
    await fireEvent.press(card('Huỷ'))
    await pressSheetCancel()
    expect(store().draft!.header.type).toBe('PRODUCTION')
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['Sản xuất', 'Anh Nam', 'Chuyển kho', 'TRANSFER', ''],
    ['Sản xuất', 'Kho Hà Nội', 'Chuyển kho', 'TRANSFER', 'Kho Hà Nội'],
    ['Chuyển kho', 'Kho Hà Nội', 'Bán', 'SALE', ''],
    ['Chuyển kho', 'Kho tàu', 'Bán', 'SALE', 'Kho tàu'],
    ['Sản xuất', 'Kho Hà Nội', 'Bán', 'SALE', 'Kho Hà Nội'],
  ] as const)(
    'đổi %s (người nhận "%s") → %s: người nhận còn hợp lệ thì giữ, không thì xoá',
    async (from, receiver, to, type, kept) => {
      seed({ type: from === 'Chuyển kho' ? 'TRANSFER' : 'PRODUCTION', receiver })
      await render(<ExportTypeSheetScreen />)
      await fireEvent.press(card(to))
      await pressSheetDone()
      expect(store().draft!.header).toMatchObject({ type, receiver: kept })
    },
  )

  it('đang ghi phiếu → ✓ khoá', async () => {
    seed()
    await render(<ExportTypeSheetScreen />)
    await act(async () => {
      store().setSaving(true)
    })
    expect(sheetHeader().done).toBeUndefined()
    await fireEvent.press(card('Bán'))
    expect(store().draft!.header.type).toBe('PRODUCTION')
  })

  it('không còn bản nháp → tự đóng', async () => {
    await render(<ExportTypeSheetScreen />)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('bản nháp của kho khác kho đang chọn → tự đóng', async () => {
    seed({}, 'wh-hn')
    await render(<ExportTypeSheetScreen />)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })
})
