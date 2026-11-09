// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import type { AvailableMaterial } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { stopDraftPersistence, useReceiveDraft, type LocalLine } from '@/features/receive-checklist'
import {
  makeDraft,
  makeForm,
  makeItem,
  makeLine,
} from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { useLineFocus } from '@/shared/lib/line-focus'
import { normalizeForSearch } from '@/shared/lib/search'
import { sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ImportPickMaterialsSheetScreen } from './ImportPickMaterialsSheetScreen'

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

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const AV = '/warehouses/wh-a/import-forms/available-materials'
const KG = { unitSlug: 'kg', unitCode: 'KG', unitName: 'kg', conversionRate: 1, isBaseUnit: true }
const BAO = {
  unitSlug: 'bao',
  unitCode: 'BAO',
  unitName: 'bao',
  conversionRate: 50,
  isBaseUnit: false,
}
const mat = (slug: string, name: string, over: Partial<AvailableMaterial> = {}) =>
  ({
    slug,
    code: slug.toUpperCase(),
    name,
    baseUnitSlug: 'kg',
    quantity: 5,
    suppliers: [],
    units: [KG, BAO],
    ...over,
  }) as AvailableMaterial
const XI = mat('xi-mang', 'Xi măng PCB40')
const SON = mat('son', 'Sơn Dulux')
const KEO = mat('keo', 'Keo chưa khai đơn vị', { units: [] })
const ALL = [XI, SON, KEO]

const page = (items: AvailableMaterial[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 50, totalPages: 1, hasNext: false })

let client: QueryClient
const store = () => useReceiveDraft.getState()
const wait = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)))

function seed(lines: LocalLine[] = [makeLine(1)], formSlug = 'pn-1') {
  useReceiveDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug },
    draft: makeDraft(lines, { formSlug }),
  })
}
function signIn(scope: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH] } as never,
  })
}
async function show() {
  route('get', '/warehouses/wh-a/import-forms/pn-1', () =>
    ok(makeForm([makeItem(1)], { warehouseSlug: 'wh-a' })),
  )
  await render(
    <QueryClientProvider client={client}>
      <ImportPickMaterialsSheetScreen />
    </QueryClientProvider>,
  )
  await wait(0)
}
async function search(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Tìm theo mã hoặc tên'), text)
  await wait(350)
  await wait(0)
}
const box = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) })
const addButton = () => screen.getByRole('button', { name: /^Thêm \d+ vật tư$/ })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  useLineFocus.getState().clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT'])
  seed()
  route('get', AV, (c) => {
    const p = c.params as { name?: string; code?: string }
    const q = normalizeForSearch(p.name ?? p.code ?? '')
    // '*' = cả danh sách (tiện cho test).
    return page(
      ALL.filter(
        (m) =>
          q === '*' ||
          normalizeForSearch(m.name).includes(q) ||
          normalizeForSearch(m.code).includes(q),
      ),
    )
  })
})
afterEach(() => {
  stopDraftPersistence()
  store().reset()
  client.clear()
})

describe('ImportPickMaterialsSheetScreen', () => {
  it('ô tìm trống → hiện mọi vật tư của kho (không gửi name / code), mỗi dòng có tồn + bên bán', async () => {
    const withSellers = mat('xi-mang', 'Xi măng PCB40', {
      quantity: 1200,
      suppliers: [
        { slug: 'a', code: 'A', name: 'NCC An' },
        { slug: 'b', code: 'B', name: 'NCC Bình' },
        { slug: 'c', code: 'C', name: 'NCC Cường' },
      ],
    })
    const seen: Record<string, unknown>[] = []
    route('get', AV, (c) => {
      seen.push(c.params as Record<string, unknown>)
      return page([withSellers, SON])
    })
    await show()
    expect(sheetHeader().title).toBe('Thêm vật tư')
    expect(sheetHeader().done).toBeUndefined()
    expect(addButton()).toBeDisabled()
    expect(seen).toHaveLength(1)
    expect(seen[0]).not.toHaveProperty('name')
    expect(seen[0]).not.toHaveProperty('code')
    expect(screen.getByText('Tồn 1.200 kg')).toBeOnTheScreen()
    expect(screen.getByText('Bên bán: NCC An, NCC Bình +1')).toBeOnTheScreen()
    expect(screen.getByText('Sơn Dulux')).toBeOnTheScreen()
  })

  it('cuộn tới cuối → tải trang tiếp theo, gộp vào danh sách', async () => {
    const pages: number[] = []
    route('get', AV, (c) => {
      const p = c.params as { page: number }
      pages.push(p.page)
      return p.page === 1
        ? ok({ items: [XI], total: 2, page: 1, pageSize: 50, totalPages: 2, hasNext: true })
        : ok({ items: [SON], total: 2, page: 2, pageSize: 50, totalPages: 2, hasNext: false })
    })
    await show()
    expect(screen.queryByText('Sơn Dulux')).toBeNull()
    await fireEvent.scroll(screen.getByTestId('import-pick-sheet-scroll'), {
      nativeEvent: {
        contentOffset: { y: 300 },
        contentSize: { height: 800, width: 400 },
        layoutMeasurement: { height: 600, width: 400 },
      },
    })
    await wait(0)
    expect(screen.getByText('Xi măng PCB40')).toBeOnTheScreen()
    expect(screen.getByText('Sơn Dulux')).toBeOnTheScreen()
    expect(pages).toEqual([1, 2])
  })

  it('tick two across searches then Thêm 2 vật tư adds both and asks step 2 to open the first line sheet', async () => {
    await show()
    await search('xi')
    await fireEvent.press(box('Xi măng PCB40'))
    await search('son')
    expect(screen.queryByText('Xi măng PCB40')).toBeNull()
    await fireEvent.press(box('Sơn Dulux'))
    expect(addButton()).toHaveTextContent('Thêm 2 vật tư')
    await fireEvent.press(addButton())
    const lines = store().draft!.lines
    expect(lines.map((l) => l.key)).toEqual(['m-1|u-1', 'xi-mang|kg', 'son|kg'])
    expect(lines[1]).toMatchObject({ quantity: 0, unitPrice: 0, checked: false })
    expect(lines[1].units).toEqual([KG, BAO])
    expect(useLineFocus.getState().request).toEqual({
      kind: 'import',
      formSlug: 'pn-1',
      key: 'xi-mang|kg',
    })
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('existing material shows đã có and is not tickable; material without units is locked', async () => {
    seed([makeLine(1, { materialSlug: 'son', unitSlug: 'thung' })])
    await show()
    await search('*')
    expect(box('Sơn Dulux')).toBeDisabled()
    expect(screen.getByText('đã có')).toBeOnTheScreen()
    await fireEvent.press(box('Sơn Dulux'))
    expect(box('Sơn Dulux')).not.toBeChecked()
    expect(box('Keo chưa khai đơn vị')).toBeDisabled()
    expect(screen.getByText('Chưa có đơn vị')).toBeOnTheScreen()
  })

  it('capacity reached blocks further ticks', async () => {
    seed(Array.from({ length: 199 }, (_, i) => makeLine(i + 1000)))
    await show()
    await search('*')
    await fireEvent.press(box('Xi măng PCB40'))
    expect(box('Sơn Dulux')).toBeDisabled()
    expect(screen.getByText('Đã đủ 200 dòng — tối đa của một phiếu.')).toBeOnTheScreen()
    await fireEvent.press(addButton())
    expect(store().draft!.lines).toHaveLength(200)
  })

  describe('Chọn tất cả', () => {
    const selectAll = () => screen.getByRole('button', { name: 'Chọn tất cả' })

    it('ticks every pickable shown item (skips đã có / locked), updates the add count, tap again unticks', async () => {
      seed([makeLine(1, { materialSlug: 'son', unitSlug: 'thung' })])
      await show()
      await search('*')
      await fireEvent.press(selectAll())
      expect(box('Xi măng PCB40')).toBeChecked()
      expect(box('Sơn Dulux')).not.toBeChecked()
      expect(box('Keo chưa khai đơn vị')).not.toBeChecked()
      expect(addButton()).toHaveTextContent('Thêm 1 vật tư')
      await fireEvent.press(screen.getByRole('button', { name: 'Bỏ chọn tất cả' }))
      expect(box('Xi măng PCB40')).not.toBeChecked()
      expect(addButton()).toHaveTextContent('Thêm 0 vật tư')
    })

    it('deselect only unticks shown items; picks from an earlier search stay', async () => {
      await show()
      await search('xi')
      await fireEvent.press(box('Xi măng PCB40'))
      await search('son')
      await fireEvent.press(selectAll())
      expect(addButton()).toHaveTextContent('Thêm 2 vật tư')
      await fireEvent.press(screen.getByRole('button', { name: 'Bỏ chọn tất cả' }))
      expect(addButton()).toHaveTextContent('Thêm 1 vật tư')
    })

    it('with 2 slots left and 5 items only the first 2 are ticked and the capacity message shows', async () => {
      seed(Array.from({ length: 198 }, (_, i) => makeLine(i + 1000)))
      const five = ['a', 'b', 'c', 'd', 'e'].map((s) => mat(s, `Vat tu ${s}`))
      route('get', AV, () => page(five))
      await show()
      await search('*')
      await fireEvent.press(selectAll())
      expect(box('Vat tu a')).toBeChecked()
      expect(box('Vat tu b')).toBeChecked()
      expect(box('Vat tu c')).not.toBeChecked()
      expect(addButton()).toHaveTextContent('Thêm 2 vật tư')
      expect(screen.getByText('Đã đủ 200 dòng — tối đa của một phiếu.')).toBeOnTheScreen()
    })

    it('hidden when nothing shown is pickable', async () => {
      route('get', AV, () => page([KEO]))
      await show()
      await search('*')
      expect(screen.queryByRole('button', { name: 'Chọn tất cả' })).toBeNull()
    })
  })

  it('new form with header supplier stamps that supplier on picked lines', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'SUPPLIER_READ'])
    useReceiveDraft.setState({
      ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'new' },
      draft: makeDraft([], {
        formSlug: 'new',
        header: { ...makeDraft([]).header, supplierSlug: 's2' },
      }),
    })
    route('get', '/suppliers', () =>
      ok({
        items: [{ slug: 's2', code: 'N2', name: 'Hà Tiên' }],
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNext: false,
      }),
    )
    await show()
    await search('xi')
    await fireEvent.press(box('Xi măng PCB40'))
    await fireEvent.press(addButton())
    expect(store().draft!.lines[0]).toMatchObject({ supplierSlug: 's2', supplierName: 'Hà Tiên' })
  })

  it('closes when there is no draft', async () => {
    store().reset()
    await show()
    expect(mockBack).toHaveBeenCalled()
  })

  it('edit-only user (sửa nháp, không IMPORT_FORM_CREATE) → closes: available-materials is gated by CREATE', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT_OWN'])
    await show()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('closes when the user cannot edit the existing form (tạo + xác nhận, không sửa nháp)', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_CONFIRM'])
    await show()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('closes on a new form when the user cannot create forms (chỉ sửa nháp)', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT'])
    seed([], 'new')
    await show()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })
})
