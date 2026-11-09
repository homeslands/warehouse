// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { stopDraftPersistence, useReceiveDraft } from '@/features/receive-checklist'
import { makeDraft, makeLine } from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ImportSupplierSheetScreen } from './ImportSupplierSheetScreen'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    navigate: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

const paged = (items: unknown[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })
const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const SUPPLIERS = [
  { slug: 's1', code: 'HP01', name: 'Hoà Phát' },
  { slug: 's2', code: 'HT02', name: 'Hà Tiên' },
  { slug: 's3', code: 'NS03', name: 'Nghi Sơn' },
]

let client: QueryClient
const store = () => useReceiveDraft.getState()
const wait = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)))

function seed(formSlug: string, supplierSlug: string | null) {
  useReceiveDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug },
    draft: makeDraft([makeLine(1, { supplierSlug: 's1', supplierName: 'Hoà Phát' }), makeLine(2)], {
      formSlug,
      header: { ...makeDraft([]).header, supplierSlug },
    }),
  })
}
async function show() {
  await render(
    <QueryClientProvider client={client}>
      <ImportSupplierSheetScreen />
    </QueryClientProvider>,
  )
  await wait(0)
}
const card = (name: string) => screen.getByRole('button', { name: new RegExp(name) })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      userSlug: 'u',
      userName: 'an',
      scope: ['IMPORT_FORM_CREATE', 'SUPPLIER_READ'],
      warehouses: [WH],
    } as never,
  })
  route('get', '/suppliers', () => paged(SUPPLIERS))
  seed('new', 's1')
})
afterEach(() => {
  stopDraftPersistence()
  store().reset()
  client.clear()
})

describe('ImportSupplierSheetScreen', () => {
  it('search filters by name or code without diacritics', async () => {
    await show()
    expect(sheetHeader().title).toBe('Bên bán')
    expect(screen.getByText('Hoà Phát')).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText('Tìm theo tên hoặc mã'), 'ha tien')
    expect(screen.getByText('Hà Tiên')).toBeOnTheScreen()
    expect(screen.queryByText('Hoà Phát')).toBeNull()
    await fireEvent.changeText(screen.getByLabelText('Tìm theo tên hoặc mã'), 'ns03')
    expect(screen.getByText('Nghi Sơn')).toBeOnTheScreen()
    expect(screen.queryByText('Hà Tiên')).toBeNull()
    await fireEvent.changeText(screen.getByLabelText('Tìm theo tên hoặc mã'), 'zzz')
    expect(screen.getByText('Không có bên bán phù hợp')).toBeOnTheScreen()
  })

  it('done sets supplier and restamps every line', async () => {
    await show()
    await fireEvent.press(card('Hà Tiên'))
    expect(store().draft!.header.supplierSlug).toBe('s1') // chạm chỉ đánh dấu
    await pressSheetDone()
    const d = store().draft!
    expect(d.header.supplierSlug).toBe('s2')
    expect(d.lines.map((l) => [l.supplierSlug, l.supplierName])).toEqual([
      ['s2', 'Hà Tiên'],
      ['s2', 'Hà Tiên'],
    ])
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('done on the current value only closes', async () => {
    await show()
    await fireEvent.press(card('Hoà Phát'))
    await pressSheetDone()
    expect(store().draft!.lines[1].supplierSlug).toBeNull()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('closes immediately for an existing form', async () => {
    seed('pn-1', 's1')
    await show()
    expect(mockBack).toHaveBeenCalled()
    expect(screen.queryByText('Hoà Phát')).toBeNull()
  })

  it('shows the load error with retry and the empty text', async () => {
    resetFakeApi()
    route('get', '/suppliers', () => paged([]))
    await show()
    expect(screen.getByText('Chưa có bên bán nào')).toBeOnTheScreen()
  })
})
