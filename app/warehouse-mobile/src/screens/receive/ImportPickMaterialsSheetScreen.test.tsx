// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'

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
import { confirmAction } from '@/shared/lib/native-confirm'
import { sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ImportPickMaterialsSheetScreen } from './ImportPickMaterialsSheetScreen'

let mockEpoch = 0
jest.mock('@/entities/session', () => ({
  ...jest.requireActual('@/entities/session'),
  getSessionEpoch: () => mockEpoch,
}))
jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))
const mockBack = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    navigate: jest.fn(),
    canGoBack: () => true,
    replace: mockReplace,
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
  mockEpoch = 0
  jest.mocked(confirmAction).mockResolvedValue(true)
  resetFakeApi()
  await AsyncStorage.clear()
  useLineFocus.getState().clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT'])
  seed()
  route('get', AV, () => page(ALL))
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

  it('tải hết mọi trang một lượt (size 100), gộp vào danh sách', async () => {
    const pages: number[] = []
    route('get', AV, (c) => {
      const p = c.params as { page: number; size: number }
      pages.push(p.page)
      expect(p.size).toBe(100)
      return p.page === 1
        ? ok({ items: [XI], total: 2, page: 1, pageSize: 100, totalPages: 2, hasNext: true })
        : ok({ items: [SON], total: 2, page: 2, pageSize: 100, totalPages: 2, hasNext: false })
    })
    await show()
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

  describe('nhóm theo bên bán của phiếu', () => {
    const MP = { slug: 's1', code: 'N1', name: 'Minh Phát' }
    const SUA = mat('sua', 'Sữa tươi', { suppliers: [MP] })
    const BOT = mat('bot', 'Bột mì')
    const scrollEnd = () =>
      fireEvent.scroll(screen.getByTestId('import-pick-sheet-scroll'), {
        nativeEvent: {
          contentOffset: { y: 300 },
          contentSize: { height: 800, width: 400 },
          layoutMeasurement: { height: 600, width: 400 },
        },
      })
    beforeEach(() => {
      signIn([
        'IMPORT_FORM_READ',
        'IMPORT_FORM_CREATE',
        'IMPORT_FORM_UPDATE_DRAFT',
        'SUPPLIER_READ',
      ])
      route('get', '/suppliers', () =>
        ok({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 1, hasNext: false }),
      )
    })
    function seedSupplier(slug: string | null, name: string | null = 'Minh Phát') {
      useReceiveDraft.setState({
        ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' },
        draft: makeDraft([makeLine(1, { supplierSlug: slug, supplierName: slug ? name : null })], {
          formSlug: 'pn-1',
          header: { ...makeDraft([]).header, supplierSlug: slug },
        }),
      })
    }

    it('(a) vật tư của NCC ở trang 2 nằm ở nhóm "Của …", số đếm đúng', async () => {
      seedSupplier('s1')
      route('get', AV, (c) =>
        (c.params as { page: number }).page === 1
          ? ok({ items: [BOT], total: 2, page: 1, pageSize: 100, totalPages: 2, hasNext: true })
          : ok({ items: [SUA], total: 2, page: 2, pageSize: 100, totalPages: 2, hasNext: false }),
      )
      await show()
      expect(screen.getByText('Của Minh Phát · 1')).toBeOnTheScreen()
      expect(screen.getByText('Vật tư khác · 1')).toBeOnTheScreen()
      expect(
        screen.getByText('Chọn → thêm vào phiếu và gắn vào Minh Phát khi lưu phiếu.'),
      ).toBeOnTheScreen()
    })

    it('(b) NCC chưa có vật tư nào → chỉ câu mineEmpty, không tiêu đề nhóm 1', async () => {
      seedSupplier('s1')
      route('get', AV, () => page([BOT]))
      await show()
      expect(
        screen.getByText(
          'Minh Phát chưa có vật tư nào trong kho này — chọn ở danh sách dưới, vật tư sẽ được gắn vào Minh Phát khi lưu phiếu.',
        ),
      ).toBeOnTheScreen()
      expect(screen.queryByText(/^Của Minh Phát/)).toBeNull()
      expect(screen.getByText('Vật tư khác · 1')).toBeOnTheScreen()
    })

    it('(b2) kho không có vật tư nào → chỉ materialEmpty (không kèm mineEmpty)', async () => {
      seedSupplier('s1')
      route('get', AV, () => page([]))
      await show()
      expect(screen.getByText('Không có vật tư phù hợp')).toBeOnTheScreen()
      expect(screen.queryByText(/chưa có vật tư nào trong kho/)).toBeNull()
      expect(screen.queryByText(/^Của /)).toBeNull()
    })

    it('(c) tick vật tư nhóm 2 → câu gắn; Thêm → dòng mang NCC của phiếu', async () => {
      seedSupplier('s1')
      route('get', AV, () => page([SUA, BOT]))
      await show()
      expect(screen.queryByText(/sẽ được gắn vào/)).toBeNull()
      await fireEvent.press(box('Sữa tươi'))
      expect(screen.queryByText(/sẽ được gắn vào/)).toBeNull()
      await fireEvent.press(box('Bột mì'))
      expect(
        screen.getByText('1 vật tư sẽ được gắn vào Minh Phát khi lưu phiếu.'),
      ).toBeOnTheScreen()
      await fireEvent.press(addButton())
      expect(store().draft!.lines.find((l) => l.materialSlug === 'bot')).toMatchObject({
        supplierSlug: 's1',
      })
    })

    it('(d) phiếu không NCC → không tiêu đề nhóm, không câu', async () => {
      seedSupplier(null)
      route('get', AV, () => page([SUA, BOT]))
      await show()
      await fireEvent.press(box('Bột mì'))
      expect(screen.queryByText(/^Của /)).toBeNull()
      expect(screen.queryByText(/^Vật tư khác/)).toBeNull()
      expect(screen.queryByText(/gắn vào/)).toBeNull()
      expect(screen.getByText('Bột mì')).toBeOnTheScreen()
    })

    it('(e) tìm "sua" khớp "Sữa"; nhóm 1 rỗng khi tìm → ẩn khối', async () => {
      seedSupplier('s1')
      route('get', AV, () => page([SUA, BOT]))
      await show()
      await search('sua')
      expect(screen.getByText('Sữa tươi')).toBeOnTheScreen()
      expect(screen.queryByText('Bột mì')).toBeNull()
      await search('bot')
      expect(screen.queryByText(/^Của Minh Phát/)).toBeNull()
      expect(screen.queryByText(/chưa có vật tư nào trong kho/)).toBeNull()
      expect(screen.getByText('Bột mì')).toBeOnTheScreen()
    })

    it('(f) ô tìm và "Chọn tất cả" ghim ngoài vùng cuộn', async () => {
      seedSupplier('s1')
      route('get', AV, () => page([SUA, BOT]))
      await show()
      const scroll = screen.getByTestId('import-pick-sheet-scroll')
      expect(within(scroll).queryByLabelText('Tìm theo mã hoặc tên')).toBeNull()
      expect(within(scroll).queryByRole('button', { name: 'Chọn tất cả' })).toBeNull()
      expect(screen.getByLabelText('Tìm theo mã hoặc tên')).toBeOnTheScreen()
      expect(screen.getByRole('button', { name: 'Chọn tất cả' })).toBeOnTheScreen()
      expect(within(scroll).getByText('Sữa tươi')).toBeOnTheScreen()
    })

    it('(g0) nhóm 1 lớn cũng vẽ dần: 120 vật tư của NCC → 50 thẻ, cuộn thêm 50 (cửa sổ chung hai nhóm)', async () => {
      seedSupplier('s1')
      const mine = Array.from({ length: 120 }, (_, i) =>
        mat(`m${i}`, `Cua NCC ${i}`, { suppliers: [MP] }),
      )
      route('get', AV, () => page([...mine, BOT]))
      await show()
      expect(screen.getByText('Của Minh Phát · 120')).toBeOnTheScreen()
      expect(screen.getAllByRole('checkbox')).toHaveLength(50)
      expect(screen.queryByText('Bột mì')).toBeNull()
      await scrollEnd()
      expect(screen.getAllByRole('checkbox')).toHaveLength(100)
      await scrollEnd()
      // 120 của NCC + 1 thẻ nhóm 2.
      expect(screen.getAllByRole('checkbox')).toHaveLength(121)
      expect(screen.getByText('Bột mì')).toBeOnTheScreen()
    })

    it('(g1) đổi từ khoá → cửa sổ về 50', async () => {
      seedSupplier('s1')
      const many = Array.from({ length: 120 }, (_, i) => mat(`v${i}`, `Vat tu ${i}`))
      route('get', AV, () => page(many))
      await show()
      await scrollEnd()
      expect(screen.getAllByRole('checkbox')).toHaveLength(100)
      await search('vat')
      expect(screen.getAllByRole('checkbox')).toHaveLength(50)
    })

    it('(h) phiếu đã có NHIỀU bên bán → một danh sách, không gợi ý; dòng mới theo luật lineSupplier', async () => {
      useReceiveDraft.setState({
        ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' },
        draft: makeDraft(
          [
            makeLine(1, { supplierSlug: 's1', supplierName: 'Minh Phát' }),
            makeLine(2, { supplierSlug: 's2', supplierName: 'Hà Tiên' }),
          ],
          { formSlug: 'pn-1', header: { ...makeDraft([]).header, supplierSlug: 's1' } },
        ),
      })
      route('get', AV, () => page([SUA, BOT]))
      await show()
      expect(screen.queryByText(/^Của /)).toBeNull()
      expect(screen.queryByText(/^Vật tư khác/)).toBeNull()
      await fireEvent.press(box('Bột mì'))
      expect(screen.queryByText(/gắn vào/)).toBeNull()
      await fireEvent.press(addButton())
      expect(store().draft!.lines.find((l) => l.materialSlug === 'bot')).toMatchObject({
        supplierSlug: null,
      })
    })

    it('(i) không có SUPPLIER_READ → một danh sách, không gọi /suppliers, dòng mới theo luật cũ', async () => {
      signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT'])
      seedSupplier('s1')
      route('get', AV, () => page([SUA, BOT]))
      await show()
      expect(callsTo('get', '/suppliers')).toHaveLength(0)
      expect(screen.queryByText(/^Của /)).toBeNull()
      await fireEvent.press(box('Bột mì'))
      expect(screen.queryByText(/gắn vào/)).toBeNull()
      await fireEvent.press(addButton())
      expect(store().draft!.lines.find((l) => l.materialSlug === 'bot')).toMatchObject({
        supplierSlug: null,
      })
    })

    it('(g) nhóm 2 > 50 → vẽ 50 thẻ, cuộn tới cuối thêm 50', async () => {
      seedSupplier('s1')
      const many = Array.from({ length: 120 }, (_, i) => mat(`v${i}`, `Vat tu ${i}`))
      route('get', AV, () => page(many))
      await show()
      expect(screen.getAllByRole('checkbox')).toHaveLength(50)
      await scrollEnd()
      expect(screen.getAllByRole('checkbox')).toHaveLength(100)
    })
  })

  describe('kho quá nhiều vật tư (chạm trần 50 trang)', () => {
    it('hiện câu báo, không lỗi; gõ → tìm trên server (name/code), chia nhóm như thường', async () => {
      const searched: Record<string, unknown>[] = []
      route('get', AV, (c) => {
        const p = c.params as Record<string, unknown>
        if (p.name || p.code) {
          searched.push(p)
          return page([mat('xa-xa', 'Xà gồ xa')])
        }
        // Luôn còn trang sau → chạm trần 50 trang.
        return ok({
          items: [mat(`p${p.page as number}`, `Trang ${p.page as number}`)],
          total: 0,
          page: p.page,
          pageSize: 100,
          totalPages: 0,
          hasNext: true,
        })
      })
      await show()
      expect(screen.getByText('Kho có quá nhiều vật tư — gõ để tìm.')).toBeOnTheScreen()
      expect(screen.getByText('Trang 1')).toBeOnTheScreen()
      await search('xa')
      expect(searched.length).toBeGreaterThan(0)
      expect(searched[0]).toMatchObject({ name: 'xa', page: 1 })
      expect(screen.getByText('Xà gồ xa')).toBeOnTheScreen()
      expect(screen.queryByText('Trang 1')).toBeNull()
      await fireEvent.press(box('Xà gồ xa'))
      await fireEvent.press(addButton())
      expect(store().draft!.lines.some((l) => l.materialSlug === 'xa-xa')).toBe(true)
    })

    it('không chạm trần → không có câu báo, gõ lọc ở máy (không gọi tìm)', async () => {
      const searched: unknown[] = []
      route('get', AV, (c) => {
        if ((c.params as Record<string, unknown>).name) searched.push(c.params)
        return page(ALL)
      })
      await show()
      expect(screen.queryByText('Kho có quá nhiều vật tư — gõ để tìm.')).toBeNull()
      await search('xi')
      expect(searched).toHaveLength(0)
    })
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

  describe('+ Tạo vật tư mới', () => {
    const CREATE = ['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT']
    const FULL = [
      ...CREATE,
      'MATERIAL_READ',
      'MATERIAL_CREATE',
      'MATERIAL_UPDATE',
      'WAREHOUSE_UPDATE',
      'UNIT_READ',
    ]
    const btn = (q: string) => screen.queryByRole('button', { name: `+ Tạo vật tư mới “${q}”` })

    it('đủ quyền + có chữ tìm → hiện nút (cả khi không có kết quả, thay vì chỉ câu trống)', async () => {
      signIn(FULL)
      await show()
      expect(screen.queryByRole('button', { name: /Tạo vật tư mới/ })).toBeNull()
      await search('zzz')
      expect(btn('zzz')).not.toBeNull()
      expect(screen.getByText('Không có vật tư phù hợp')).toBeTruthy()
    })

    it('hiện nút cả khi có kết quả khớp', async () => {
      signIn(FULL)
      await show()
      await search('xi')
      expect(btn('xi')).not.toBeNull()
    })

    it('thiếu quyền tạo trong kho → không có nút', async () => {
      signIn(CREATE)
      await show()
      await search('zzz')
      expect(btn('zzz')).toBeNull()
    })

    it('thiếu MATERIAL_READ (route /material-form bị khoá) → không có nút', async () => {
      signIn(FULL.filter((c) => c !== 'MATERIAL_READ'))
      await show()
      await search('zzz')
      expect(btn('zzz')).toBeNull()
    })

    it('đang có tick → hỏi bỏ tick; huỷ giữ nguyên, đồng ý mới chuyển form', async () => {
      signIn(FULL)
      await show()
      await search('xi')
      await fireEvent.press(box('Xi măng'))
      jest.mocked(confirmAction).mockResolvedValueOnce(false)
      await fireEvent.press(btn('xi')!)
      await wait(0)
      expect(confirmAction).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Bỏ 1 vật tư đã chọn để tạo vật tư mới?',
          confirmLabel: 'Tạo vật tư',
        }),
      )
      expect(mockReplace).not.toHaveBeenCalled()
      expect(box('Xi măng').props.accessibilityState?.checked).toBe(true)
      await fireEvent.press(btn('xi')!)
      await wait(0)
      expect(mockReplace).toHaveBeenCalledTimes(1)
    })

    it('phiếu không có formSlug → không có nút', async () => {
      signIn(FULL)
      useReceiveDraft.setState({
        ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: '' },
      })
      await show()
      await search('zzz')
      expect(btn('zzz')).toBeNull()
    })

    it('bấm với chuỗi hợp lệ như mã → thay sheet chọn bằng form vật tư, params code (không chồng hai sheet)', async () => {
      signIn(FULL)
      await show()
      await search('VT-09')
      await fireEvent.press(btn('VT-09')!)
      expect(mockReplace).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/material-form',
        params: { importForm: 'pn-1', code: 'VT-09' },
      })
      expect(mockBack).not.toHaveBeenCalled()
    })

    it('bấm với chữ thường → params name', async () => {
      signIn(FULL)
      await show()
      await search('sữa đặc')
      await fireEvent.press(btn('sữa đặc')!)
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/material-form',
        params: { importForm: 'pn-1', name: 'sữa đặc' },
      })
    })

    it('chuỗi chỉ chữ (khớp regex mã nhưng không có số / gạch) → name', async () => {
      signIn(FULL)
      await show()
      await search('sua')
      await fireEvent.press(btn('sua')!)
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/material-form',
        params: { importForm: 'pn-1', name: 'sua' },
      })
    })
  })

  describe('nhóm "Chưa có trong kho"', () => {
    const MAT = '/materials'
    const PUT = '/warehouses/wh-a/materials'
    const ASSIGNER = [
      'IMPORT_FORM_READ',
      'IMPORT_FORM_CREATE',
      'IMPORT_FORM_UPDATE_DRAFT',
      'MATERIAL_READ',
      'MATERIAL_UPDATE',
      'WAREHOUSE_UPDATE',
      'SUPPLIER_READ',
    ]
    const NCC = { slug: 's9', code: 'N9', name: 'NCC Thật' }
    const cat = (slug: string, name: string, over: Record<string, unknown> = {}) => ({
      slug,
      code: slug.toUpperCase(),
      name,
      baseUnit: { slug: 'kg', code: 'KG', name: 'kg' },
      suppliers: [NCC],
      warehouses: [],
      units: [KG],
      ...over,
    })
    const DAY = cat('day', 'Dây điện')
    const DEN = cat('den', 'Đèn led')
    const inv = (slug: string, name: string) => ({
      slug: `i-${slug}`,
      warehouseSlug: 'wh-a',
      materialSlug: slug,
      materialCode: slug.toUpperCase(),
      materialName: name,
      baseUnit: { slug: 'kg', code: 'KG', name: 'kg' },
      units: [KG],
    })
    const matPage = (items: unknown[]) =>
      ok({ items, total: items.length, page: 1, pageSize: 30, totalPages: 1, hasNext: false })
    beforeEach(() => {
      signIn(ASSIGNER)
      route('get', '/suppliers', () =>
        ok({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 1, hasNext: false }),
      )
      route('get', MAT, () => matPage([DAY, DEN]))
    })

    it('lọc: bỏ vật tư đã ở kho (theo warehouses) và vật tư đã có trong danh sách khả dụng', async () => {
      const inWh = cat('kho', 'Dây trong kho', {
        warehouses: [
          { slug: 'wh-a', code: 'A', name: 'Kho Tổng', quantity: 1, availableQuantity: 1 },
        ],
      })
      const dup = cat('xi-mang', 'Dây trùng khả dụng')
      const seen: unknown[] = []
      route('get', MAT, (c) => {
        seen.push(c.params)
        return matPage([DAY, inWh, dup])
      })
      await show()
      await search('day')
      expect(screen.getByText('Chưa có trong kho · 1')).toBeOnTheScreen()
      expect(screen.getByText('Chọn → gắn vào kho Kho Tổng và thêm vào phiếu.')).toBeOnTheScreen()
      expect(screen.getByText('Dây điện')).toBeOnTheScreen()
      expect(screen.queryByText('Dây trong kho')).toBeNull()
      expect(screen.queryByText('Dây trùng khả dụng')).toBeNull()
      expect(seen[0]).toMatchObject({ name: 'day', page: 1, size: 30 })
    })

    it('thiếu quyền → không request danh mục, không nhóm', async () => {
      signIn([
        'IMPORT_FORM_READ',
        'IMPORT_FORM_CREATE',
        'IMPORT_FORM_UPDATE_DRAFT',
        'MATERIAL_READ',
      ])
      await show()
      await search('day')
      expect(callsTo('get', MAT)).toHaveLength(0)
      expect(screen.queryByText(/Chưa có trong kho/)).toBeNull()
    })

    it('ô trống hoặc 1 ký tự → không request danh mục, không nhóm', async () => {
      await show()
      await search('d')
      expect(callsTo('get', MAT)).toHaveLength(0)
      expect(screen.queryByText(/Chưa có trong kho/)).toBeNull()
    })

    it('đang gắn kho (PUT chưa xong) → nút "+ Tạo vật tư mới" khoá', async () => {
      signIn([...ASSIGNER, 'MATERIAL_CREATE', 'UNIT_READ'])
      let release: () => void = () => {}
      route(
        'put',
        PUT,
        () =>
          new Promise((r) => {
            release = () => r(ok(inv('day', 'Dây điện')))
          }),
      )
      await show()
      await search('day')
      await fireEvent.press(box('Dây điện'))
      await fireEvent.press(addButton())
      await wait(0)
      const create = screen.getByRole('button', { name: /Tạo vật tư mới/ })
      expect(create.props.accessibilityState?.disabled).toBe(true)
      await act(async () => release())
      await wait(0)
    })

    it('tick 1 vật tư nhóm + 1 vật tư khả dụng → xác nhận → 1 PUT + 2 dòng (NCC thật, NCC phiếu)', async () => {
      useReceiveDraft.setState({
        ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' },
        draft: makeDraft([makeLine(1, { supplierSlug: 's1', supplierName: 'Minh Phát' })], {
          formSlug: 'pn-1',
          header: { ...makeDraft([]).header, supplierSlug: 's1' },
        }),
      })
      route('put', PUT, () => ok(inv('day', 'Dây điện')))
      route('get', AV, () => page([mat('den-kd', 'Đèn khả dụng')]))
      await show()
      await search('den')
      await fireEvent.press(box('Đèn khả dụng'))
      await fireEvent.press(box('Dây điện'))
      expect(screen.getByText('1 vật tư sẽ được gắn vào kho Kho Tổng.')).toBeOnTheScreen()
      await fireEvent.press(addButton())
      await wait(0)
      expect(confirmAction).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Gắn 1 vật tư vào kho Kho Tổng và thêm vào phiếu?' }),
      )
      expect(callsTo('put', PUT)).toHaveLength(1)
      expect(callsTo('put', PUT)[0]!.body).toBe('{"materialSlug":"day"}')
      const lines = store().draft!.lines
      expect(lines.map((l) => l.materialSlug)).toEqual(['m-1', 'den-kd', 'day'])
      expect(lines[2]).toMatchObject({ supplierSlug: 's1' })
      expect(lines[2]!.materialSupplierSlugs).toEqual(['s9'])
      expect(mockBack).toHaveBeenCalledTimes(1)
    })

    it('huỷ xác nhận → không PUT, không thêm dòng', async () => {
      jest.mocked(confirmAction).mockResolvedValue(false)
      await show()
      await search('day')
      await fireEvent.press(box('Dây điện'))
      await fireEvent.press(addButton())
      await wait(0)
      expect(callsTo('put', PUT)).toHaveLength(0)
      expect(store().draft!.lines).toHaveLength(1)
    })

    it('PUT lỗi 100802 → dòng thành công vẫn thêm, sheet giữ mở, chỉ còn tick vật tư lỗi, hộp lỗi', async () => {
      route('put', PUT, (c) =>
        String(c.data).includes('"den"') ? failure(400, 100802) : ok(inv('day', 'Dây điện')),
      )
      route('get', AV, () => page([mat('den-kd', 'Đèn khả dụng')]))
      route('get', MAT, () => matPage([DAY, DEN]))
      await show()
      await search('den')
      await fireEvent.press(box('Đèn khả dụng'))
      await fireEvent.press(box('Đèn led'))
      await fireEvent.press(box('Dây điện'))
      await fireEvent.press(addButton())
      await wait(0)
      expect(store().draft!.lines.map((l) => l.materialSlug)).toEqual(['m-1', 'den-kd', 'day'])
      expect(mockBack).not.toHaveBeenCalled()
      expect(box('Đèn led')).toBeChecked()
      expect(addButton()).toHaveTextContent('Thêm 1 vật tư')
      expect(screen.getByText(/từng được gỡ khỏi kho này/)).toBeOnTheScreen()
      expect(screen.getByText(/DEN: /)).toBeOnTheScreen()
    })

    it('phiên đổi giữa lúc gắn → không thêm dòng nào', async () => {
      route('put', PUT, () => {
        mockEpoch++
        return ok(inv('day', 'Dây điện'))
      })
      await show()
      await search('day')
      await fireEvent.press(box('Dây điện'))
      await fireEvent.press(addButton())
      await wait(0)
      expect(store().draft!.lines).toHaveLength(1)
      expect(mockBack).not.toHaveBeenCalled()
    })

    it('sức chứa: hết chỗ sau khi xác nhận → không PUT (kiểm trước khi gắn kho)', async () => {
      seed(Array.from({ length: 198 }, (_, i) => makeLine(i + 1000)))
      jest.mocked(confirmAction).mockImplementation(async () => {
        useReceiveDraft.setState({
          draft: makeDraft(
            Array.from({ length: 200 }, (_, i) => makeLine(i + 1000)),
            { formSlug: 'pn-1' },
          ),
        })
        return true
      })
      await show()
      await search('day')
      await fireEvent.press(box('Dây điện'))
      await fireEvent.press(addButton())
      await wait(0)
      expect(callsTo('put', PUT)).toHaveLength(0)
      expect(store().draft!.lines).toHaveLength(200)
    })

    it('PUT xong nhưng phiếu đổi → báo trong hộp lỗi, không thêm dòng, tick còn (vật tư chuyển sang nhóm thường)', async () => {
      route('put', PUT, () => {
        useReceiveDraft.setState({ saving: true })
        return ok(inv('day', 'Dây điện'))
      })
      await show()
      await search('day')
      await fireEvent.press(box('Dây điện'))
      await fireEvent.press(addButton())
      await wait(0)
      expect(callsTo('put', PUT)).toHaveLength(1)
      expect(
        screen.getByText(
          'Đã gắn 1 vật tư vào kho nhưng phiếu vừa thay đổi — mở lại "Thêm vật tư" để thêm vào phiếu.',
        ),
      ).toBeOnTheScreen()
      expect(store().draft!.lines).toHaveLength(1)
      expect(mockBack).not.toHaveBeenCalled()
      expect(addButton()).toHaveTextContent('Thêm 1 vật tư')
      // Bấm lại không PUT lần nữa (đã là vật tư thường).
      await act(async () => useReceiveDraft.setState({ saving: false }))
      await fireEvent.press(addButton())
      await wait(0)
      expect(callsTo('put', PUT)).toHaveLength(1)
      expect(store().draft!.lines).toHaveLength(2)
    })

    it('bấm đôi "Thêm" khi hộp xác nhận chưa đóng → một hộp xác nhận, một PUT', async () => {
      route('put', PUT, () => ok(inv('day', 'Dây điện')))
      let resolve!: (v: boolean) => void
      jest.mocked(confirmAction).mockReturnValue(new Promise<boolean>((r) => (resolve = r)))
      await show()
      await search('day')
      await fireEvent.press(box('Dây điện'))
      await fireEvent.press(addButton())
      await fireEvent.press(addButton())
      await act(async () => resolve(true))
      await wait(0)
      expect(confirmAction).toHaveBeenCalledTimes(1)
      expect(callsTo('put', PUT)).toHaveLength(1)
    })

    it('hai vật tư gắn được nhưng một cái không có đơn vị → một dòng thêm, cái kia giữ tick + hộp lỗi', async () => {
      route('put', PUT, (c) =>
        String(c.data).includes('"den"')
          ? ok({ ...inv('den', 'Đèn led'), units: [], baseUnit: null })
          : ok(inv('day', 'Dây điện')),
      )
      await show()
      await search('den')
      await fireEvent.press(box('Dây điện'))
      await fireEvent.press(box('Đèn led'))
      await fireEvent.press(addButton())
      await wait(0)
      expect(callsTo('put', PUT)).toHaveLength(2)
      expect(store().draft!.lines.map((l) => l.materialSlug)).toEqual(['m-1', 'day'])
      expect(mockBack).not.toHaveBeenCalled()
      expect(addButton()).toHaveTextContent('Thêm 1 vật tư')
      expect(screen.getByText(/Đã gắn 1 vật tư vào kho nhưng phiếu vừa thay đổi/)).toBeOnTheScreen()
    })

    it('nhóm khả dụng rỗng mà nhóm "Chưa có trong kho" có vật tư → không hiện câu không phù hợp', async () => {
      await show()
      await search('zzz')
      expect(screen.getByText('Chưa có trong kho · 2')).toBeOnTheScreen()
      expect(screen.queryByText('Không có vật tư phù hợp')).toBeNull()
    })
  })
})
