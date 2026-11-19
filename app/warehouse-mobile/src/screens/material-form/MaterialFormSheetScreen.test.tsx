// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, calls, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native'

import { Alert } from 'react-native'
import { materialKeys } from '@/entities/material'
import { useWarehouseStore } from '@/entities/warehouse'
import { useReceiveDraft, useScanNotice } from '@/features/receive-checklist'
import { makeDraft, makeLine } from '@/features/receive-checklist/model/fixtures'
import { useLineFocus } from '@/shared/lib/line-focus'
import { inventoryKeys } from '@/entities/inventory'
import { useMaterialDraft } from '@/features/material-form'
import { useAuthStore, type CurrentUser } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { confirmAction } from '@/shared/lib/native-confirm'
import { SHEET_CLOSE_DELAY_MS } from '@/shared/lib/useSheetSubmit'
import { pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { MaterialFormSheetScreen } from './MaterialFormSheetScreen'
import { PickSheetScreen } from './PickSheetScreen'

const mockBack = jest.fn()
const mockPush = jest.fn()
const mockParams: {
  slug?: string
  field?: string
  material?: string
  code?: string
  name?: string
  importForm?: string
} = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  usePreventRemove: () => jest.fn(),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))
let mockEpoch = 0
jest.mock('@/entities/session', () => ({
  ...jest.requireActual('@/entities/session'),
  getSessionEpoch: () => mockEpoch,
}))
jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))
const confirm = confirmAction as jest.Mock

const user = (...scope: string[]): CurrentUser => ({ userName: 'u', roleName: 'STAFF', scope })
const TYPE = { slug: 'tp', code: 'TP', name: 'Thực phẩm' }
const KG = { slug: 'kg', code: 'KG', name: 'Kilogam' }
const MATERIAL = {
  slug: 'm1',
  code: 'VT-01',
  name: 'Gạo',
  minimumInventory: 0,
  maximumInventory: 0,
  type: TYPE,
  baseUnit: KG,
  hasSupplier: false,
  suppliers: [],
  warehouses: [],
  units: [
    { unitSlug: 'kg', unitCode: 'KG', unitName: 'Kilogam', conversionRate: 1, isBaseUnit: true },
  ],
  createdAt: '',
  updatedAt: '',
}

let client: QueryClient
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
async function settled() {
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
}
async function show(slug?: string) {
  mockParams.slug = slug
  await render(
    <QueryClientProvider client={client}>
      <MaterialFormSheetScreen />
    </QueryClientProvider>,
  )
  await settled()
}
const signIn = (...perms: string[]) => useAuthStore.setState({ user: user(...perms) } as never)
const pick = async (type: typeof TYPE | null, base: typeof KG | null) => {
  await act(async () => {
    if (type) useMaterialDraft.getState().set('type', type)
    if (base) useMaterialDraft.getState().set('baseUnit', base)
  })
}
const reply = (status: number, body: object) => ({
  status,
  data: { timestamp: '', path: '', method: 'X', ...body },
})
const ALL = ['MATERIAL_READ', 'MATERIAL_CREATE', 'MATERIAL_UPDATE', 'UNIT_READ']

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockParams.slug = undefined
  mockParams.field = undefined
  mockParams.material = undefined
  mockParams.code = undefined
  mockParams.importForm = undefined
  mockParams.name = undefined
  mockEpoch = 0
  useReceiveDraft.getState().reset()
  useLineFocus.getState().clear()
  useScanNotice.getState().clear()
  confirm.mockResolvedValue(true)
  useMaterialDraft.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  route('get', '/materials/m1', () => ok(MATERIAL))
})

afterEach(async () => {
  await cleanup()
  client.clear()
  useAuthStore.setState({ user: null } as never)
})

describe('MaterialFormSheetScreen', () => {
  it('tạo: mã + tên + loại + đơn vị gốc + min/max → confirm "VT-01 ·" → POST → đóng', async () => {
    signIn(...ALL)
    route('post', '/materials', () => ok(MATERIAL))
    await show()
    await fireEvent.changeText(screen.getByLabelText('Mã'), 'vt-01')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Gạo')
    await pick(TYPE, KG)
    await fireEvent.changeText(screen.getByLabelText('Tối thiểu'), '5')
    await fireEvent.changeText(screen.getByLabelText('Tối đa'), '10')
    await pressSheetDone()
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('VT-01 ·') }),
    )
    const posts = callsTo('post', '/materials')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0].body as string)).toEqual({
      code: 'VT-01',
      name: 'Gạo',
      typeSlug: 'tp',
      baseUnitSlug: 'kg',
      minimumInventory: 5,
      maximumInventory: 10,
    })
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('min 5, max trống → ✓ khoá, câu lỗi dưới Tối đa, không request', async () => {
    signIn(...ALL)
    await show()
    await fireEvent.changeText(screen.getByLabelText('Mã'), 'vt-01')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Gạo')
    await pick(TYPE, KG)
    await fireEvent.changeText(screen.getByLabelText('Tối thiểu'), '5')
    expect(sheetHeader().done?.disabled).toBe(true)
    expect(screen.getByText(/Tối đa phải lớn hơn hoặc bằng tối thiểu/)).toBeOnTheScreen()
    await pressSheetDone()
    expect(confirm).not.toHaveBeenCalled()
    expect(calls.filter((c) => c.method !== 'get')).toHaveLength(0)
  })

  it('thiếu UNIT_READ mở tạo → đóng, không request', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_CREATE')
    await show()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('sửa chỉ đổi tên → PATCH { name }', async () => {
    signIn(...ALL)
    route('patch', '/materials/m1', () => ok(MATERIAL))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('m1')
    expect(sheetHeader().done?.disabled).toBe(true)
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Gạo thơm')
    await pressSheetDone()
    const patches = callsTo('patch', '/materials/m1')
    expect(JSON.parse(patches[0].body as string)).toEqual({ name: 'Gạo thơm' })
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: materialKeys.detail('m1') }),
    )
  })

  it('vật tư có tồn kho → hàng Đơn vị gốc chỉ đọc + chú thích khoá', async () => {
    signIn(...ALL)
    route('get', '/materials/m1', () =>
      ok({
        ...MATERIAL,
        warehouses: [{ slug: 'w', code: 'W', name: 'K', quantity: 3, availableQuantity: 3 }],
      }),
    )
    await show('m1')
    expect(screen.queryByRole('button', { name: /Đơn vị gốc/ })).toBeNull()
    expect(screen.getByText(/không đổi được đơn vị gốc/)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: /Loại/ })).toBeOnTheScreen()
  })

  it('vật tư cũ baseUnit null + có tồn → hàng Đơn vị gốc mở, chọn xong ✓ bật, PATCH baseUnitSlug', async () => {
    signIn(...ALL)
    route('get', '/materials/m1', () =>
      ok({
        ...MATERIAL,
        baseUnit: null,
        units: [],
        warehouses: [{ slug: 'w', code: 'W', name: 'K', quantity: 5, availableQuantity: 5 }],
      }),
    )
    route('patch', '/materials/m1', () => ok(MATERIAL))
    await show('m1')
    expect(screen.getByRole('button', { name: /Đơn vị gốc/ })).toBeOnTheScreen()
    expect(sheetHeader().done?.disabled).toBe(true)
    await pick(null, KG)
    expect(sheetHeader().done?.disabled).toBe(false)
    await pressSheetDone()
    const patches = callsTo('patch', '/materials/m1')
    expect(JSON.parse(patches[0].body as string)).toEqual({ baseUnitSlug: 'kg' })
  })

  it('đóng sheet (unmount) không xoá lựa chọn của sheet mở lại ngay sau đó', async () => {
    signIn(...ALL)
    await show()
    await pick(TYPE, KG)
    await cleanup()
    expect(useMaterialDraft.getState().type).toEqual(TYPE)
    expect(useMaterialDraft.getState().baseUnit).toEqual(KG)
  })

  it('chạm hàng Loại → push màn pick field=type', async () => {
    signIn(...ALL)
    await show()
    await fireEvent.press(screen.getByRole('button', { name: /Loại/ }))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/material-form/pick',
      params: { field: 'type' },
    })
  })

  it('lỗi 100705 → câu dưới ô Mã, sheet còn mở', async () => {
    signIn(...ALL)
    route('post', '/materials', () => reply(409, { statusCode: 409, code: 100705, message: 'x' }))
    await show()
    await fireEvent.changeText(screen.getByLabelText('Mã'), 'vt-01')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Gạo')
    await pick(TYPE, KG)
    await pressSheetDone()
    expect(screen.getByText(/Mã vật tư đã tồn tại/)).toBeOnTheScreen()
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(mockBack).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Tên').props.value).toBe('Gạo')
  })

  it('đổi phiên giữa lúc PATCH đang chờ → không invalidate, không đóng', async () => {
    signIn(...ALL)
    route('patch', '/materials/m1', () => {
      mockEpoch++
      return ok(MATERIAL)
    })
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('m1')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Khác')
    await pressSheetDone()
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(callsTo('patch', '/materials/m1')).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('MaterialFormSheetScreen — quét Mã', () => {
  it('nút quét có nhãn a11y, chạm → push /material-form/scan', async () => {
    signIn(...ALL)
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Quét mã vạch để điền Mã' }))
    expect(mockPush).toHaveBeenCalledWith('/material-form/scan')
  })

  it('scannedCode "abc-12" → ô Mã "ABC-12", không lỗi, scannedCode về null', async () => {
    signIn(...ALL)
    await show()
    await act(async () => useMaterialDraft.getState().setScannedCode('abc-12'))
    expect(screen.getByLabelText('Mã').props.value).toBe('ABC-12')
    expect(screen.queryByText(/Mã quét được không dùng/)).toBeNull()
    expect(screen.queryByText(/Mã chỉ gồm|không hợp lệ/)).toBeNull()
    expect(useMaterialDraft.getState().scannedCode).toBeNull()
  })

  it('scannedCode sai quy tắc → lỗi scannedCodeInvalid; sửa tay rồi → lỗi chung', async () => {
    signIn(...ALL)
    await show()
    await act(async () => useMaterialDraft.getState().setScannedCode('https://x.vn/p?id=1'))
    expect(screen.getByText(/Mã quét được không dùng làm Mã vật tư được/)).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText('Mã'), '@@')
    expect(screen.queryByText(/Mã quét được không dùng/)).toBeNull()
  })

  it('param code=sp01 (tạo mới) → ô Mã "SP01"', async () => {
    signIn(...ALL)
    mockParams.code = 'sp01'
    await show()
    expect(screen.getByLabelText('Mã').props.value).toBe('SP01')
  })

  it('sửa vật tư: ô Mã sửa được vẫn có nút quét', async () => {
    signIn(...ALL)
    await show('m1')
    expect(screen.getByRole('button', { name: 'Quét mã vạch để điền Mã' })).toBeOnTheScreen()
  })
})

describe('PickSheetScreen', () => {
  it('field=type: chạm một loại → store có loại đó + router.back', async () => {
    signIn(...ALL)
    mockParams.field = 'type'
    route('get', '/material-types', () =>
      ok({
        items: [TYPE],
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNext: false,
        hasPrevios: false,
      }),
    )
    await render(
      <QueryClientProvider client={client}>
        <PickSheetScreen />
      </QueryClientProvider>,
    )
    await settled()
    await fireEvent.press(screen.getByText('Thực phẩm'))
    expect(useMaterialDraft.getState().type).toEqual(TYPE)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  const renderPick = async () => {
    await render(
      <QueryClientProvider client={client}>
        <PickSheetScreen />
      </QueryClientProvider>,
    )
    await settled()
  }

  it('field=baseUnit thiếu UNIT_READ → back, không request', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_CREATE')
    mockParams.field = 'baseUnit'
    await renderPick()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('field=unit không có material → back, không request', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_UPDATE', 'UNIT_READ', 'UNIT_UPDATE')
    mockParams.field = 'unit'
    mockParams.material = undefined
    await renderPick()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('field=type thiếu quyền đọc vật tư → back, không request', async () => {
    signIn('UNIT_READ')
    mockParams.field = 'type'
    await renderPick()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })
})

describe('MaterialFormSheetScreen — tạo trong phiếu nhập', () => {
  const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
  const PERMS = [...ALL, 'WAREHOUSE_UPDATE', 'SUPPLIER_READ']
  const INV = {
    slug: 'inv-1',
    materialSlug: 'm-new',
    materialCode: 'SP01',
    materialName: 'Gạo',
    quantity: 0,
    baseUnit: KG,
    units: [
      { unitSlug: 'kg', unitCode: 'KG', unitName: 'Kilogam', conversionRate: 1, isBaseUnit: true },
    ],
  }
  const URL = '/warehouses/wh-a/materials'

  function seedForm(supplierSlug: string | null = 's1', formSlug = 'pn-1') {
    useReceiveDraft.setState({
      ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug },
      draft: makeDraft([makeLine(1, { supplierSlug, supplierName: supplierSlug && 'Hoà Phát' })], {
        formSlug,
        header: { ...makeDraft([]).header, supplierSlug },
      }),
      saving: false,
    })
  }
  async function open(code = 'sp01') {
    mockParams.code = code
    mockParams.importForm = 'pn-1'
    await show()
  }
  it('param name (tạo trong phiếu) → điền sẵn ô Tên, Mã trống', async () => {
    mockParams.name = 'sữa đặc'
    mockParams.code = undefined
    mockParams.importForm = 'pn-1'
    await show()
    expect(screen.getByLabelText('Tên').props.value).toBe('sữa đặc')
    expect(screen.getByLabelText('Mã').props.value).toBe('')
  })

  async function fillAndSave() {
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Gạo')
    await pick(TYPE, KG)
    await pressSheetDone()
    await wait(SHEET_CLOSE_DELAY_MS + 50)
  }
  beforeEach(() => {
    useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
    signIn(...PERMS)
    seedForm()
  })
  afterEach(() => {
    useWarehouseStore.setState({ current: null, resolved: false, resolution: null } as never)
  })

  it('tiêu đề "Vật tư mới cho phiếu nhập", Mã điền sẵn, chân nhóm nêu kho + bên bán', async () => {
    await open()
    expect(sheetHeader().title).toBe('Vật tư mới cho phiếu nhập')
    expect(screen.getByLabelText('Mã').props.value).toBe('SP01')
    expect(
      screen.getByText(/Vật tư sẽ được gắn vào kho Kho Tổng và bên bán Hoà Phát/),
    ).toBeOnTheScreen()
  })

  it('phiếu chưa có bên bán → chân nhóm chỉ nêu kho', async () => {
    seedForm(null)
    await open()
    expect(screen.getByText(/Vật tư sẽ được gắn vào kho Kho Tổng/)).toBeOnTheScreen()
    expect(screen.queryByText(/bên bán/)).toBeNull()
  })

  it('lưu → 1 POST /warehouses/wh-a/materials { material, supplierSlug } → dòng mới + focus + đóng', async () => {
    route('post', URL, () => ok(INV))
    useScanNotice.getState().show('pn-1', 'SP01')
    const spy = jest.spyOn(client, 'invalidateQueries')
    await open()
    await fillAndSave()
    expect(confirm).toHaveBeenCalled()
    const posts = callsTo('post', URL)
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0].body as string)).toEqual({
      material: { code: 'SP01', name: 'Gạo', typeSlug: 'tp', baseUnitSlug: 'kg' },
      supplierSlug: 's1',
    })
    expect(callsTo('post', '/materials')).toHaveLength(0)
    const added = useReceiveDraft.getState().draft!.lines.find((l) => l.materialSlug === 'm-new')
    expect(added).toMatchObject({ supplierSlug: 's1', unitSlug: 'kg' })
    expect(useLineFocus.getState().request).toEqual({
      kind: 'import',
      formSlug: 'pn-1',
      key: added!.key,
    })
    expect(useScanNotice.getState().notice).toBeNull()
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: inventoryKeys.warehouse('wh-a') }),
    )
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('vật tư tạo xong nhưng không thêm được dòng (chưa có đơn vị) → thông báo noUnit, vẫn đóng', async () => {
    route('post', URL, () => ok({ ...INV, units: [], baseUnit: null }))
    await open()
    await fillAndSave()
    expect(useScanNotice.getState().notice).toEqual({
      formSlug: 'pn-1',
      code: 'SP01',
      reason: 'noUnit',
    })
    expect(useLineFocus.getState().request).toBeNull()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('phiếu chưa có bên bán → body không có supplierSlug', async () => {
    seedForm(null)
    route('post', URL, () => ok(INV))
    await open()
    await fillAndSave()
    const [post] = callsTo('post', URL)
    expect(JSON.parse(post.body as string)).not.toHaveProperty('supplierSlug')
  })

  it('phiếu đã đủ 200 dòng → không confirm, không POST, hộp lỗi scanFull', async () => {
    useReceiveDraft.setState({
      draft: makeDraft(
        Array.from({ length: 200 }, (_, i) => makeLine(i + 1)),
        { formSlug: 'pn-1' },
      ),
    })
    await open()
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Gạo')
    await pick(TYPE, KG)
    await pressSheetDone()
    expect(confirm).not.toHaveBeenCalled()
    expect(callsTo('post', URL)).toHaveLength(0)
    expect(screen.getByText(/Phiếu đã đủ 200 dòng/)).toBeOnTheScreen()
  })

  it('phiếu đang lưu → không confirm, không POST, báo importUnavailable', async () => {
    useReceiveDraft.setState({ saving: true })
    await open()
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Gạo')
    await pick(TYPE, KG)
    await pressSheetDone()
    expect(confirm).not.toHaveBeenCalled()
    expect(callsTo('post', URL)).toHaveLength(0)
    expect(screen.getByText('Phiếu đang lưu hoặc đã đổi — thử lại sau.')).toBeOnTheScreen()
  })

  it('phiếu chuyển sang đang lưu trong lúc confirm → onSubmit chặn, không POST', async () => {
    confirm.mockImplementation(async () => {
      useReceiveDraft.setState({ saving: true })
      return true
    })
    await open()
    await fillAndSave()
    expect(callsTo('post', URL)).toHaveLength(0)
    expect(screen.getByText('Phiếu đang lưu hoặc đã đổi — thử lại sau.')).toBeOnTheScreen()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('kho của phiếu đổi trong lúc POST → không thêm dòng', async () => {
    route('post', URL, () => {
      useReceiveDraft.setState({ ctx: { userSlug: 'u', warehouseSlug: 'wh-b', formSlug: 'pn-1' } })
      return ok(INV)
    })
    await open()
    await fillAndSave()
    expect(useReceiveDraft.getState().draft!.lines.some((l) => l.materialSlug === 'm-new')).toBe(
      false,
    )
    expect(useLineFocus.getState().request).toBeNull()
  })

  it('đổi phiên giữa lúc POST → không thêm dòng, không focus, không đóng', async () => {
    route('post', URL, () => {
      mockEpoch++
      return ok(INV)
    })
    await open()
    await fillAndSave()
    expect(callsTo('post', URL)).toHaveLength(1)
    expect(useReceiveDraft.getState().draft!.lines.some((l) => l.materialSlug === 'm-new')).toBe(
      false,
    )
    expect(useLineFocus.getState().request).toBeNull()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('thiếu WAREHOUSE_UPDATE → đóng, không request', async () => {
    signIn(...ALL)
    await open()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('không có bản nháp khớp importForm → đóng, không request', async () => {
    seedForm('s1', 'pn-khac')
    await open()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('thiếu MATERIAL_READ (route bị khoá) → đóng, không request', async () => {
    signIn(...PERMS.filter((c) => c !== 'MATERIAL_READ'))
    await open()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('không có kho đang chọn → đóng, không request', async () => {
    useWarehouseStore.setState({ current: null } as never)
    await open()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('kèm slug (sửa) → đóng, không request', async () => {
    mockParams.importForm = 'pn-1'
    await show('m1')
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('lỗi Mã trùng → câu dưới ô Mã, không thêm dòng, sheet còn mở', async () => {
    route('post', URL, () => reply(409, { statusCode: 409, code: 100705, message: 'x' }))
    await open()
    await fillAndSave()
    expect(screen.getByText(/Mã vật tư đã tồn tại/)).toBeOnTheScreen()
    expect(useReceiveDraft.getState().draft!.lines.some((l) => l.materialSlug === 'm-new')).toBe(
      false,
    )
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('lỗi kho (100804) → hộp lỗi đầu sheet', async () => {
    route('post', URL, () => reply(400, { statusCode: 400, code: 100804, message: 'x' }))
    await open()
    await fillAndSave()
    expect(screen.getByRole('alert')).toBeOnTheScreen()
    expect(mockBack).not.toHaveBeenCalled()
  })
})

describe('MaterialFormSheetScreen — chọn kho khi tạo', () => {
  const W1 = { slug: 'w1', code: 'W1', name: 'Kho Một', isManager: true }
  const W2 = { slug: 'w2', code: 'W2', name: 'Kho Hai', isManager: true }
  const W3 = { slug: 'w3', code: 'W3', name: 'Kho Ba', isManager: true, isActive: false }
  const PERMS = [...ALL, 'WAREHOUSE_UPDATE']
  const INV = {
    slug: 'inv-1',
    materialSlug: 'm-new',
    materialCode: 'VT-01',
    materialName: 'Gạo',
    quantity: 0,
    baseUnit: KG,
    units: [],
  }
  const signInWh = (perms: string[], warehouses = [W1, W2, W3]) =>
    useAuthStore.setState({
      user: { ...user(...perms), warehouses: warehouses as never },
    } as never)
  const khoRow = () => screen.getByRole('button', { name: /^Kho\b/ })
  async function fillAndSave() {
    await fireEvent.changeText(screen.getByLabelText('Mã'), 'vt-01')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Gạo')
    await pick(TYPE, KG)
    await pressSheetDone()
    await wait(SHEET_CLOSE_DELAY_MS + 50)
  }
  let alertSpy: jest.SpyInstance
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    useWarehouseStore.setState({ current: W1, resolved: true, resolution: 'selected' } as never)
  })
  afterEach(() => {
    alertSpy.mockRestore()
    useWarehouseStore.setState({ current: null, resolved: false, resolution: null } as never)
  })

  it('mặc định tick kho hiện tại: hàng Kho hiện tên kho + chú thích', async () => {
    signInWh(PERMS)
    await show()
    expect(useMaterialDraft.getState().warehouses).toEqual(['w1'])
    expect(within(khoRow()).getByText('Kho Một')).toBeOnTheScreen()
    expect(screen.getByText('Vật tư chỉ dùng được trong phiếu của kho đã gắn.')).toBeOnTheScreen()
  })

  it('kho hiện tại đã tắt → mặc định "Không gắn kho"', async () => {
    useWarehouseStore.setState({ current: W3 } as never)
    signInWh(PERMS)
    await show()
    expect(useMaterialDraft.getState().warehouses).toEqual([])
    expect(within(khoRow()).getByText('Không gắn kho')).toBeOnTheScreen()
  })

  it('chọn 2 kho → "2 kho"; chạm hàng → push /material-form/warehouses', async () => {
    signInWh(PERMS)
    await show()
    await act(async () => useMaterialDraft.getState().setWarehouses(['w1', 'w2']))
    expect(within(khoRow()).getByText('2 kho')).toBeOnTheScreen()
    await fireEvent.press(khoRow())
    expect(mockPush).toHaveBeenCalledWith('/material-form/warehouses')
  })

  it('thiếu quyền gắn kho → không có hàng Kho, tạo như cũ (POST /materials)', async () => {
    signInWh(ALL)
    route('post', '/materials', () => ok(MATERIAL))
    await show()
    expect(screen.queryByRole('button', { name: /^Kho\b/ })).toBeNull()
    await fillAndSave()
    expect(callsTo('post', '/materials')).toHaveLength(1)
    expect(calls.filter((c) => c.url.startsWith('/warehouses'))).toHaveLength(0)
  })

  it('quyền đổi khi sheet đang mở (bật quyền gắn kho) → giữ loại / đơn vị gốc đã chọn', async () => {
    signInWh(ALL)
    await show()
    await pick(TYPE, KG)
    await act(async () => signInWh(PERMS))
    expect(useMaterialDraft.getState().type).toEqual(TYPE)
    expect(useMaterialDraft.getState().baseUnit).toEqual(KG)
    expect(useMaterialDraft.getState().warehouses).toEqual(['w1'])
  })

  it('sửa vật tư → không có hàng Kho', async () => {
    signInWh(PERMS)
    await show('m1')
    expect(screen.queryByRole('button', { name: /^Kho\b/ })).toBeNull()
  })

  it('0 kho → POST /materials như cũ, không gọi /warehouses', async () => {
    signInWh(PERMS)
    route('post', '/materials', () => ok(MATERIAL))
    await show()
    await act(async () => useMaterialDraft.getState().setWarehouses([]))
    await fillAndSave()
    expect(callsTo('post', '/materials')).toHaveLength(1)
    expect(calls.filter((c) => c.url.startsWith('/warehouses'))).toHaveLength(0)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('xác nhận có dòng "Gắn vào: Kho Một, Kho Hai"', async () => {
    signInWh(PERMS)
    route('post', '/warehouses/w1/materials', () => ok(INV))
    route('put', '/warehouses/w2/materials', () => ok({}))
    await show()
    await act(async () => useMaterialDraft.getState().setWarehouses(['w1', 'w2']))
    await fillAndSave()
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Gắn vào: Kho Một, Kho Hai'),
      }),
    )
  })

  it('2 kho → POST /warehouses/w1/materials { material } rồi PUT /warehouses/w2/materials, invalidate, đóng', async () => {
    signInWh(PERMS)
    route('post', '/warehouses/w1/materials', () => ok(INV))
    route('put', '/warehouses/w2/materials', () => ok({}))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show()
    await act(async () => useMaterialDraft.getState().setWarehouses(['w1', 'w2']))
    await fillAndSave()
    expect(callsTo('post', '/materials')).toHaveLength(0)
    const posts = callsTo('post', '/warehouses/w1/materials')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0].body as string)).toEqual({
      material: { code: 'VT-01', name: 'Gạo', typeSlug: 'tp', baseUnitSlug: 'kg' },
    })
    const puts = callsTo('put', '/warehouses/w2/materials')
    expect(puts).toHaveLength(1)
    expect(JSON.parse(puts[0].body as string)).toEqual({ materialSlug: 'm-new' })
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: inventoryKeys.warehouse('w2') }),
    )
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: inventoryKeys.warehouse('w1') }),
    )
    expect(alertSpy).not.toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('kho phụ lỗi → Alert nêu kho lỗi, vẫn đóng, bấm lại không POST lần nữa', async () => {
    signInWh(PERMS)
    route('post', '/warehouses/w1/materials', () => ok(INV))
    route('put', '/warehouses/w2/materials', () =>
      reply(400, { statusCode: 400, code: 100802, message: 'x' }),
    )
    await show()
    await act(async () => useMaterialDraft.getState().setWarehouses(['w1', 'w2']))
    await fillAndSave()
    expect(callsTo('post', '/warehouses/w1/materials')).toHaveLength(1)
    expect(alertSpy).toHaveBeenCalledTimes(1)
    const [title, body] = alertSpy.mock.calls[0]
    expect(title).toBe('Đã tạo vật tư')
    expect(body).toContain('Chưa gắn được vào:')
    expect(body).toContain('Kho Hai')
    expect(mockBack).toHaveBeenCalledTimes(1)
    // Sheet đã đóng và ✓ khoá sau lần lưu thành công: bấm lại không tạo thêm lần nữa.
    await pressSheetDone()
    expect(callsTo('post', '/warehouses/w1/materials')).toHaveLength(1)
  })

  it('lỗi Mã trùng ở bước tạo kho đầu → câu dưới ô Mã, sheet còn mở, không PUT', async () => {
    signInWh(PERMS)
    route('post', '/warehouses/w1/materials', () =>
      reply(400, { statusCode: 400, code: 100705, message: 'x' }),
    )
    await show()
    await act(async () => useMaterialDraft.getState().setWarehouses(['w1', 'w2']))
    await fillAndSave()
    expect(mockBack).not.toHaveBeenCalled()
    expect(callsTo('put', '/warehouses/w2/materials')).toHaveLength(0)
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('đổi phiên giữa lúc POST → không PUT, không đóng, không Alert, không invalidate', async () => {
    signInWh(PERMS)
    const spy = jest.spyOn(client, 'invalidateQueries')
    route('post', '/warehouses/w1/materials', () => {
      mockEpoch++
      return ok(INV)
    })
    route('put', '/warehouses/w2/materials', () => ok({}))
    await show()
    await act(async () => useMaterialDraft.getState().setWarehouses(['w1', 'w2']))
    await fillAndSave()
    expect(callsTo('put', '/warehouses/w2/materials')).toHaveLength(0)
    expect(mockBack).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('MaterialFormSheetScreen — chọn Bên bán khi tạo', () => {
  const W1 = { slug: 'w1', code: 'W1', name: 'Kho Một', isManager: true }
  const S1 = { slug: 's1', code: 'S1', name: 'Hoà Phát' }
  const S2 = { slug: 's2', code: 'S2', name: 'Việt Nhật' }
  const SUP = ['SUPPLIER_READ', 'SUPPLIER_UPDATE']
  const PERMS = [...ALL, ...SUP]
  const NEW = { ...MATERIAL, slug: 'm-new' }
  const signInSup = (perms: string[], withWarehouse = false) =>
    useAuthStore.setState({
      user: { ...user(...perms), warehouses: (withWarehouse ? [W1] : []) as never },
    } as never)
  const bbRow = () => screen.getByRole('button', { name: /^Bên bán\b/ })
  const page = (items: object[]) =>
    ok({
      items,
      total: items.length,
      page: 1,
      pageSize: 100,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    })
  async function fillAndSave() {
    await fireEvent.changeText(screen.getByLabelText('Mã'), 'vt-01')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Gạo')
    await pick(TYPE, KG)
    await pressSheetDone()
    await wait(SHEET_CLOSE_DELAY_MS + 50)
  }
  let alertSpy: jest.SpyInstance
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    route('get', '/suppliers', () => page([S1, S2]))
    route('put', '/suppliers/s1/materials', () => ok({}))
    route('put', '/suppliers/s2/materials', () => ok({}))
    route('post', '/materials', () => ok(NEW))
  })
  afterEach(() => {
    alertSpy.mockRestore()
    useWarehouseStore.setState({ current: null, resolved: false, resolution: null } as never)
  })

  it('có quyền: hàng "Bên bán" mặc định "Chưa chọn" + chú thích; chạm → push /material-form/suppliers', async () => {
    signInSup(PERMS)
    await show()
    expect(useMaterialDraft.getState().suppliers).toEqual([])
    expect(within(bbRow()).getByText('Chưa chọn')).toBeOnTheScreen()
    expect(
      screen.getByText('Vật tư của bên bán hiện ở nhóm đầu khi lập phiếu nhập của bên bán đó.'),
    ).toBeOnTheScreen()
    await fireEvent.press(bbRow())
    expect(mockPush).toHaveBeenCalledWith('/material-form/suppliers')
  })

  it('hàng hiện tên (1) hoặc "n bên bán"', async () => {
    signInSup(PERMS)
    await show()
    await act(async () => useMaterialDraft.getState().setSuppliers(['s1']))
    expect(within(bbRow()).getByText('Hoà Phát')).toBeOnTheScreen()
    await act(async () => useMaterialDraft.getState().setSuppliers(['s1', 's2']))
    expect(within(bbRow()).getByText('2 bên bán')).toBeOnTheScreen()
  })

  it('thiếu từng quyền → không hàng, không request /suppliers', async () => {
    for (const missing of ['SUPPLIER_READ', 'SUPPLIER_UPDATE', 'MATERIAL_UPDATE']) {
      resetFakeApi()
      route('post', '/materials', () => ok(NEW))
      signInSup(PERMS.filter((p) => p !== missing))
      await show()
      expect(screen.queryByRole('button', { name: /^Bên bán\b/ })).toBeNull()
      expect(calls.filter((c) => c.url.startsWith('/suppliers'))).toHaveLength(0)
      await cleanup()
    }
  })

  it('sửa vật tư → không hàng Bên bán', async () => {
    signInSup(PERMS)
    await show('m1')
    expect(screen.queryByRole('button', { name: /^Bên bán\b/ })).toBeNull()
  })

  it('chế độ phiếu nhập → không hàng Bên bán', async () => {
    useWarehouseStore.setState({
      current: { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true },
    } as never)
    useReceiveDraft.setState({
      draft: makeDraft([], { formSlug: 'pn-1' }),
      ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' },
    } as never)
    mockParams.importForm = 'pn-1'
    signInSup([...PERMS, 'MATERIAL_CREATE', 'UNIT_READ', 'WAREHOUSE_UPDATE'], true)
    await show()
    expect(screen.getByLabelText('Mã')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /^Bên bán\b/ })).toBeNull()
  })

  it('xác nhận có dòng "Bên bán: Hoà Phát, Việt Nhật"', async () => {
    signInSup(PERMS)
    await show()
    await act(async () => useMaterialDraft.getState().setSuppliers(['s1', 's2']))
    await fillAndSave()
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Bên bán: Hoà Phát, Việt Nhật'),
      }),
    )
  })

  it('2 bên bán, không kho → POST /materials rồi 2 PUT { materialSlugs: [slug] }, invalidate, đóng', async () => {
    signInSup(PERMS)
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show()
    await act(async () => useMaterialDraft.getState().setSuppliers(['s1', 's2']))
    await fillAndSave()
    expect(callsTo('post', '/materials')).toHaveLength(1)
    for (const s of ['s1', 's2']) {
      const puts = callsTo('put', `/suppliers/${s}/materials`)
      expect(puts).toHaveLength(1)
      expect(JSON.parse(puts[0].body as string)).toEqual({ materialSlugs: ['m-new'] })
    }
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: materialKeys.lists() }))
    expect(alertSpy).not.toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('có kho + bên bán → POST /warehouses/w1/materials rồi PUT bên bán', async () => {
    useWarehouseStore.setState({ current: W1, resolved: true, resolution: 'selected' } as never)
    signInSup([...PERMS, 'WAREHOUSE_UPDATE'], true)
    route('post', '/warehouses/w1/materials', () =>
      ok({
        slug: 'inv-1',
        materialSlug: 'm-new',
        materialCode: 'VT-01',
        materialName: 'Gạo',
        quantity: 0,
        baseUnit: KG,
        units: [],
      }),
    )
    await show()
    await act(async () => useMaterialDraft.getState().setSuppliers(['s1']))
    await fillAndSave()
    expect(callsTo('post', '/warehouses/w1/materials')).toHaveLength(1)
    expect(callsTo('post', '/materials')).toHaveLength(0)
    expect(callsTo('put', '/suppliers/s1/materials')).toHaveLength(1)
  })

  it('một bên bán lỗi → bên sau vẫn gắn, Alert gộp nêu bên bán lỗi, đóng, không POST lại', async () => {
    signInSup(PERMS)
    route('put', '/suppliers/s1/materials', () =>
      reply(500, { statusCode: 500, code: 1, message: 'x' }),
    )
    await show()
    await act(async () => useMaterialDraft.getState().setSuppliers(['s1', 's2']))
    await fillAndSave()
    expect(callsTo('put', '/suppliers/s2/materials')).toHaveLength(1)
    expect(alertSpy).toHaveBeenCalledTimes(1)
    const [title, body] = alertSpy.mock.calls[0]
    expect(title).toBe('Đã tạo vật tư')
    expect(body).toContain('Bên bán Hoà Phát')
    expect(body).not.toContain('Việt Nhật')
    expect(mockBack).toHaveBeenCalledTimes(1)
    await pressSheetDone()
    expect(callsTo('post', '/materials')).toHaveLength(1)
  })

  it('kho phụ lỗi + bên bán lỗi → MỘT Alert nêu cả hai', async () => {
    const W2 = { slug: 'w2', code: 'W2', name: 'Kho Hai', isManager: true }
    useWarehouseStore.setState({ current: W1, resolved: true, resolution: 'selected' } as never)
    useAuthStore.setState({
      user: { ...user(...PERMS, 'WAREHOUSE_UPDATE'), warehouses: [W1, W2] as never },
    } as never)
    route('post', '/warehouses/w1/materials', () =>
      ok({
        slug: 'inv-1',
        materialSlug: 'm-new',
        materialCode: 'VT-01',
        materialName: 'Gạo',
        quantity: 0,
        baseUnit: KG,
        units: [],
      }),
    )
    route('put', '/warehouses/w2/materials', () =>
      reply(400, { statusCode: 400, code: 100802, message: 'x' }),
    )
    route('put', '/suppliers/s1/materials', () =>
      reply(500, { statusCode: 500, code: 1, message: 'x' }),
    )
    await show()
    await act(async () => {
      useMaterialDraft.getState().setWarehouses(['w1', 'w2'])
      useMaterialDraft.getState().setSuppliers(['s1'])
    })
    await fillAndSave()
    expect(alertSpy).toHaveBeenCalledTimes(1)
    const body = alertSpy.mock.calls[0][1] as string
    expect(body).toContain('Kho Hai')
    expect(body).toContain('Bên bán Hoà Phát')
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('đổi phiên giữa lúc POST → không PUT bên bán, không đóng, không Alert', async () => {
    signInSup(PERMS)
    route('post', '/materials', () => {
      mockEpoch++
      return ok(NEW)
    })
    await show()
    await act(async () => useMaterialDraft.getState().setSuppliers(['s1']))
    await fillAndSave()
    expect(callsTo('put', '/suppliers/s1/materials')).toHaveLength(0)
    expect(mockBack).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('đổi phiên giữa các lần PUT → dừng, không đóng, không Alert', async () => {
    signInSup(PERMS)
    route('put', '/suppliers/s1/materials', () => {
      mockEpoch++
      return ok({})
    })
    await show()
    await act(async () => useMaterialDraft.getState().setSuppliers(['s1', 's2']))
    await fillAndSave()
    expect(callsTo('put', '/suppliers/s2/materials')).toHaveLength(0)
    expect(mockBack).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })
})
