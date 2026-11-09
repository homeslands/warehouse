// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StyleSheet } from 'react-native'
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
import { pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { AddLineSheetScreen } from './AddLineSheetScreen'

const fontOf = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as never)?.fontFamily
const mockBack = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, navigate: mockNavigate, canGoBack: () => true }),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const AV = '/warehouses/wh-a/import-forms/available-materials'
const FORM_URL = '/warehouses/wh-a/import-forms/pn-1'
const S1 = { slug: 's1', code: 'NCC1', name: 'Hoà Phát' }
const S2 = { slug: 's2', code: 'NCC2', name: 'Hà Tiên' }

const XI: AvailableMaterial = {
  slug: 'xi-mang',
  code: 'XM40',
  name: 'Xi măng PCB40',
  baseUnitSlug: 'kg',
  quantity: 1200,
  suppliers: [S1, S2],
  units: [
    { unitSlug: 'kg', unitCode: 'KG', unitName: 'kg', conversionRate: 1, isBaseUnit: true },
    { unitSlug: 'bao', unitCode: 'BAO', unitName: 'bao', conversionRate: 50, isBaseUnit: false },
  ],
}
const XIT: AvailableMaterial = {
  slug: 'xi-trang',
  code: 'XT',
  name: 'Xi trắng',
  baseUnitSlug: 'kg',
  quantity: 0,
  suppliers: [S1],
  units: [{ unitSlug: 'kg', unitCode: 'KG', unitName: 'kg', conversionRate: 1, isBaseUnit: true }],
}

const page = (items: AvailableMaterial[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 50, totalPages: 1, hasNext: false })

type Params = Record<string, unknown>
const seen: Params[] = []
function materials() {
  route('get', AV, (c) => {
    const p = c.params as Params
    seen.push(p)
    // name=xi → cả hai; code=xi → xi-mang (trùng) → gộp không trùng.
    return page(p.name ? [XI, XIT] : [XI])
  })
}

let client: QueryClient
const store = () => useReceiveDraft.getState()
const wait = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)))

function seed(lines: LocalLine[], over: { formSlug?: string; supplierSlug?: string | null } = {}) {
  const formSlug = over.formSlug ?? 'pn-1'
  useReceiveDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug },
    draft: makeDraft(lines, {
      formSlug,
      header: { ...makeDraft([]).header, supplierSlug: over.supplierSlug ?? null },
    }),
  })
}

function signIn(scope: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH] } as never,
  })
}

async function show() {
  route('get', FORM_URL, () => ok(makeForm([makeItem(1)], { warehouseSlug: 'wh-a' })))
  const view = await render(
    <QueryClientProvider client={client}>
      <AddLineSheetScreen />
    </QueryClientProvider>,
  )
  await wait(0)
  return view
}

async function search(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Tìm theo mã hoặc tên'), text)
  await wait(350)
  await wait(0)
}

async function pick(name: RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }))
}

const added = () => store().draft!.lines.at(-1)!

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  seen.length = 0
  await AsyncStorage.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT'])
  seed([makeLine(1)])
  materials()
})

afterEach(() => {
  stopDraftPersistence()
  store().reset()
  client.clear()
})

describe('AddLineSheetScreen — tìm vật tư', () => {
  it('tìm "xi" gọi name=xi và code=xi, gộp không trùng; dòng có mã, tên, tồn', async () => {
    await show()
    expect(sheetHeader().title).toBe('Thêm vật tư')
    await search('xi')
    expect(seen).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'xi' }),
        expect.objectContaining({ code: 'xi' }),
      ]),
    )
    expect(callsTo('get', AV)).toHaveLength(2)
    expect(screen.getAllByText('Xi măng PCB40')).toHaveLength(1)
    expect(screen.getByText('Xi trắng')).toBeOnTheScreen()
    expect(screen.getByText('XM40')).toBeOnTheScreen()
    expect(screen.getByText(/Tồn: 1\.200 kg/)).toBeOnTheScreen()
  })

  it('chưa gõ gì → gợi ý tìm, không gọi API', async () => {
    await show()
    expect(screen.getByText('Gõ tên hoặc mã vật tư để tìm')).toBeOnTheScreen()
    expect(callsTo('get', AV)).toHaveLength(0)
  })
})

describe('AddLineSheetScreen — thêm dòng', () => {
  it('vật tư đã có trên phiếu với cùng đơn vị → không thêm, đóng và mở dòng sẵn có', async () => {
    seed([makeLine(1, { key: 'xi-mang|kg', materialSlug: 'xi-mang', unitSlug: 'kg' })])
    await show()
    await search('xi')
    await pick(/Xi măng PCB40/)
    expect(screen.getByText(/đã có trên phiếu/)).toBeOnTheScreen()
    await pressSheetDone()
    expect(store().draft!.lines).toHaveLength(1)
    expect(mockBack).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/import-line',
      params: { key: 'xi-mang|kg' },
    })
  })

  it('vật tư đã chọn: chỉ mã dùng font code, phần tồn kho thì không', async () => {
    await show()
    await search('xi')
    await pick(/Xi măng PCB40/)
    const code = screen.getByText('XM40')
    expect(fontOf(code)).toBe('ui-monospace')
    expect(fontOf(screen.getByText(/^XM40 · /))).toBeUndefined()
  })

  it('đơn vị mặc định là đơn vị gốc; chọn đơn vị quy đổi → unitSlug đúng, mở bảng sửa dòng mới', async () => {
    await show()
    await search('xi')
    await pick(/Xi măng PCB40/)
    expect(screen.getByRole('button', { name: 'kg', selected: true })).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'bao' }))
    await fireEvent.changeText(screen.getByLabelText('Số lượng'), '12,5')
    await pressSheetDone()
    expect(added()).toMatchObject({
      key: 'xi-mang|bao',
      unitSlug: 'bao',
      unitName: 'bao',
      quantity: 12.5,
      checked: true,
      base: null,
    })
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/import-line',
      params: { key: 'xi-mang|bao' },
    })
  })

  it('đơn giá để trống → unitPrice 0; có chú thích kế toán bổ sung', async () => {
    await show()
    await search('xi')
    await pick(/Xi măng PCB40/)
    expect(
      screen.getByText('Để trống nếu chưa biết giá — kế toán bổ sung trên web'),
    ).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText('Số lượng'), '3')
    await pressSheetDone()
    expect(added().unitPrice).toBe(0)
  })

  it('đơn giá 3 chữ số lẻ → báo lỗi, không thêm; "12500,55" → 12500.55', async () => {
    await show()
    await search('xi')
    await pick(/Xi măng PCB40/)
    await fireEvent.changeText(screen.getByLabelText('Số lượng'), '3')
    await fireEvent.changeText(screen.getByLabelText('Đơn giá'), '1,234')
    await pressSheetDone()
    expect(screen.getByText('Đơn giá phải ≥ 0, tối đa 2 chữ số thập phân')).toBeOnTheScreen()
    expect(store().draft!.lines).toHaveLength(1)
    await fireEvent.changeText(screen.getByLabelText('Đơn giá'), '12500,55')
    await pressSheetDone()
    expect(added().unitPrice).toBe(12500.55)
  })

  it('số lượng trống hoặc 0 → báo lỗi, không thêm', async () => {
    await show()
    await search('xi')
    await pick(/Xi măng PCB40/)
    await pressSheetDone()
    expect(screen.getByText('Số lượng phải > 0, tối đa 6 chữ số thập phân')).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText('Số lượng'), '0')
    await pressSheetDone()
    expect(store().draft!.lines).toHaveLength(1)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('NCC dòng mới = NCC đầu phiếu khi vật tư có NCC đó', async () => {
    seed([makeLine(1)], { supplierSlug: 's2' })
    await show()
    await search('xi')
    await pick(/Xi măng PCB40/)
    await fireEvent.changeText(screen.getByLabelText('Số lượng'), '1')
    await pressSheetDone()
    expect(added()).toMatchObject({ supplierSlug: 's2', supplierName: 'Hà Tiên' })
  })

  it("phiếu 'new' có bên bán đầu phiếu: vật tư KHÔNG có NCC đó vẫn lấy NCC đầu phiếu (tên từ danh sách bên bán)", async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'SUPPLIER_READ'])
    route('get', '/suppliers', () =>
      ok({
        items: [{ slug: 's9', code: 'NCC9', name: 'Bên bán mới' }],
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNext: false,
      }),
    )
    seed([], { formSlug: 'new', supplierSlug: 's9' })
    await show()
    await search('xi')
    await pick(/Xi trắng/)
    await fireEvent.changeText(screen.getByLabelText('Số lượng'), '1')
    await pressSheetDone()
    expect(added()).toMatchObject({ supplierSlug: 's9', supplierName: 'Bên bán mới' })
  })

  it('phiếu trên server: vật tư không có NCC đầu phiếu nhưng chỉ có một NCC → NCC đó (luật suy ra)', async () => {
    seed([makeLine(1)], { supplierSlug: 's2' })
    await show()
    await search('xi')
    await pick(/Xi trắng/)
    await fireEvent.changeText(screen.getByLabelText('Số lượng'), '1')
    await pressSheetDone()
    expect(added()).toMatchObject({ supplierSlug: 's1', supplierName: 'Hoà Phát' })
  })

  it('đã đủ 200 dòng → báo, không thêm', async () => {
    seed(Array.from({ length: 200 }, (_, i) => makeLine(i + 1)))
    await show()
    expect(screen.getByText('Đã đủ 200 dòng — tối đa của một phiếu.')).toBeOnTheScreen()
    await search('xi')
    await pick(/Xi măng PCB40/)
    await fireEvent.changeText(screen.getByLabelText('Số lượng'), '1')
    await pressSheetDone()
    expect(store().draft!.lines).toHaveLength(200)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('đang Lưu phiếu → không có ✓, có chú thích chờ lưu xong', async () => {
    await show()
    await act(async () => store().setSaving(true))
    expect(sheetHeader().done).toBeUndefined()
    expect(screen.getByText('Đang lưu phiếu — chờ lưu xong rồi sửa tiếp.')).toBeOnTheScreen()
    await act(async () => store().setSaving(false))
  })

  it("phiếu 'new': thêm được (không cần tải phiếu từ server)", async () => {
    seed([], { formSlug: 'new', supplierSlug: 's1' })
    await show()
    await search('xi')
    await pick(/Xi măng PCB40/)
    await fireEvent.changeText(screen.getByLabelText('Số lượng'), '2')
    await pressSheetDone()
    expect(added()).toMatchObject({ key: 'xi-mang|kg', supplierSlug: 's1' })
    expect(callsTo('get', FORM_URL.replace('pn-1', 'new'))).toHaveLength(0)
  })

  it('không còn bản nháp → đóng sheet', async () => {
    useReceiveDraft.setState({ ctx: null, draft: null })
    await show()
    expect(mockBack).toHaveBeenCalled()
  })
})
