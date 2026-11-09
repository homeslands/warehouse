// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react-native'
import { Alert } from 'react-native'

import type { ImportForm } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  draftStorageKey,
  newDraft,
  stopDraftPersistence,
  useReceiveDraft,
} from '@/features/receive-checklist'
import {
  makeDraft,
  makeForm,
  makeItem,
  makeLine,
} from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { todayLocalIso } from '@/shared/lib/format'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { leaveCount, leaveSpies } from '@/shared/lib/testing/wizard-nav'
import { kv } from '@/shared/storage/kv'

import { useImportWizardDraft } from './useImportWizardDraft'

type MockRoute = { key: string; name: string; params?: { formSlug: string } }
/** Stack modal lúc test (màn đang render là route có `key` = `mockRouteKey.current`). */
const mockStack: { routes: MockRoute[] } = { routes: [] }
const mockRouteKey = { current: 'edit' }
const mockState = () => ({ index: mockStack.routes.length - 1, routes: mockStack.routes })
const mockDispatch = jest.fn()
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, navigate: jest.fn() }),
  useNavigation: () => ({
    dispatch: mockDispatch,
    canGoBack: () => mockStack.routes.length > 1,
    getState: mockState,
  }),
  useRoute: () => ({ key: mockRouteKey.current }),
}))
jest.mock('expo-router/react-navigation', () =>
  jest.requireActual('@/shared/lib/testing/wizard-nav').reactNavigationWith(() => mockState()),
)
jest.mock('@/shared/lib/useWizardNav', () =>
  jest.requireActual('@/shared/lib/testing/wizard-nav').wizardNavWithLeaveSpies(),
)
jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(async () => true),
  chooseAction: jest.fn(async () => null),
}))

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const FORM_URL = '/warehouses/wh-a/import-forms/pn-1'
const NEW_KEY = draftStorageKey('u', 'wh-a', 'new')
const FORM_KEY = draftStorageKey('u', 'wh-a', 'pn-1')

/** Phiếu Nháp 2 dòng của người dùng `u`, có PO. */
const form2 = (over: Partial<ImportForm> = {}) =>
  makeForm([makeItem(1), makeItem(2)], {
    warehouseSlug: 'wh-a',
    purchaseOrder: 'PO-1',
    requesterSlug: 'u',
    ...over,
  })

const EDITOR = ['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT']
function signIn(scope: string[] = EDITOR) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH] } as never,
  })
}

const store = () => useReceiveDraft.getState()
const notice = () => useFormNotice.getState().notice
const newHeader = (over: Partial<ReturnType<typeof newDraft>['header']> = {}) => ({
  code: 'PN-MOI',
  invoiceCode: 'HD-9',
  date: '2026-11-04',
  purchaseOrder: null,
  note: null,
  supplierSlug: null,
  ...over,
})

/** Stack modal chỉ gồm các bước `steps` của phiếu (màn đang render là bước cuối). */
function stackFor(formSlug: string, ...steps: string[]) {
  mockStack.routes = steps.map((s) => ({ key: s, name: `[formSlug]/${s}`, params: { formSlug } }))
  mockRouteKey.current = steps.at(-1)!
}

let client: QueryClient
async function settled() {
  await act(async () => {
    const t = () => new Promise((r) => setTimeout(r, 0))
    await t()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await t()
    await t()
    await t()
  })
}

type Result = ReturnType<typeof useImportWizardDraft>
/** Một màn bước (route hiện tại) dùng hook; trả kết quả mới nhất của nó. */
async function mount(formSlug: string) {
  const out: { current: Result | null } = { current: null }
  function Probe() {
    out.current = useImportWizardDraft(formSlug)
    return null
  }
  const view = await render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  )
  await settled()
  return { out, view }
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
  notifyManager.setScheduler((callback) => callback())
})

afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)))

beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  store().reset()
  useFormNotice.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  signIn()
})

afterEach(() => {
  stopDraftPersistence()
  store().reset()
  client.clear()
})

describe('useImportWizardDraft — phiếu đã có', () => {
  beforeEach(() => {
    stackFor('pn-1', 'edit')
    route('get', FORM_URL, () => ok(form2()))
  })

  it('nạp bản nháp của phiếu: ready, đúng ctx / form / quyền; đủ bước 1 + bước 2; chưa đổi gì', async () => {
    const { out } = await mount('pn-1')
    const r = out.current!
    expect(r.ready).toBe(true)
    expect(r.isNew).toBe(false)
    expect(r.ctx).toEqual({ userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' })
    expect(r.form?.slug).toBe('pn-1')
    expect(r.abilities?.canEdit).toBe(true)
    expect(r.draft?.header.code).toBe('PN-1')
    expect(r).toMatchObject({
      step1Ok: true,
      step2Ok: true,
      missing: [],
      dirty: false,
      canAddLine: true,
      // Phiếu đã có: Bên bán chỉ xem, không bắt buộc.
      supplierRequired: false,
    })
  })

  it('thiếu theo bước: Số HĐ trống → step1Ok false; dòng số 0 → step2Ok false', async () => {
    route('get', FORM_URL, () =>
      ok(form2({ invoiceCode: '', items: [makeItem(1, { quantity: 0 })] })),
    )
    const { out } = await mount('pn-1')
    expect(out.current!.step1Ok).toBe(false)
    expect(out.current!.step2Ok).toBe(false)
    expect(out.current!.missing.map((m) => m.id)).toEqual([
      'header:invoiceCode',
      'line:m-1|u-1:quantity',
    ])
  })

  it('người chỉ sửa nháp (không IMPORT_FORM_CREATE): canAddLine false', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT'])
    const { out } = await mount('pn-1')
    expect(out.current!.ready).toBe(true)
    expect(out.current!.canAddLine).toBe(false)
  })

  it('đã sửa trên máy, phiếu đổi version ở nơi khác → gộp, giữ phần đã sửa + báo qua thông báo mức phiếu', async () => {
    await kv.set(FORM_KEY, makeDraft([makeLine(1), makeLine(2, { quantity: 7 })], { version: 3 }))
    route('get', FORM_URL, () => ok(form2({ version: 4 })))
    const { out } = await mount('pn-1')
    expect(store().draft!.lines.map((l) => l.quantity)).toEqual([10, 7])
    expect(out.current!.dirty).toBe(true)
    expect(notice()).toMatchObject({ kind: 'import', formSlug: 'pn-1' })
    expect(notice()!.message).toBe(
      'Phiếu đã được người khác thay đổi. Đã tải lại; xem lại các dòng đổi trên web trước khi Lưu.',
    )
  })

  it('đầu phiếu xung đột (server đổi Số HĐ khác giá trị trên máy) → lấy của server, báo tên trường', async () => {
    const d = makeDraft([makeLine(1), makeLine(2)], { version: 3 })
    await kv.set(FORM_KEY, { ...d, header: { ...d.header, invoiceCode: 'HD-MAY' } })
    route('get', FORM_URL, () => ok(form2({ version: 4, invoiceCode: 'HD-SERVER' })))
    await mount('pn-1')
    expect(store().draft!.header.invoiceCode).toBe('HD-SERVER')
    expect(notice()!.message).toMatch(
      /Đầu phiếu cũng đã bị đổi ở nơi khác — đã lấy theo bản mới: Số hoá đơn\.$/,
    )
  })

  it('dấu đã kiểm (checklist) giữ nguyên khi mở luồng soạn', async () => {
    await kv.set(
      FORM_KEY,
      makeDraft(
        [makeLine(1, { checked: true, quantity: 12 }), makeLine(2, { checked: true, quantity: 0 })],
        { version: 3 },
      ),
    )
    const { out } = await mount('pn-1')
    expect(out.current!.draft!.lines.map((l) => l.checked)).toEqual([true, true])
    // Dòng số 0 ("Không nhận" của checklist) ở luồng soạn là thiếu số lượng.
    expect(out.current!.step2Ok).toBe(false)
  })

  it('phiếu không còn Nháp → bỏ bản nháp trên máy, về màn xem (không còn bước nào)', async () => {
    route('get', FORM_URL, () => ok(form2({ status: 'CONFIRMED' })))
    await kv.set(FORM_KEY, makeDraft([makeLine(1), makeLine(2)], { version: 3 }))
    await mount('pn-1')
    expect(store().draft).toBeNull()
    expect(await kv.get(FORM_KEY)).toBeNull()
    // Đóng modal, màn xem phiếu ở đỉnh Stack tab.
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finish).toHaveBeenCalledWith('pn-1')
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('phiếu không còn Nháp mà đã sửa trên máy → hộp thoại báo đã bỏ bản nháp', async () => {
    route('get', FORM_URL, () => ok(form2({ status: 'CONFIRMED' })))
    await kv.set(FORM_KEY, makeDraft([makeLine(1, { quantity: 7 }), makeLine(2)], { version: 3 }))
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await mount('pn-1')
    expect(alert).toHaveBeenCalledTimes(1)
    expect(await kv.get(FORM_KEY)).toBeNull()
    expect(leaveSpies.finish).toHaveBeenCalledWith('pn-1')
    alert.mockRestore()
  })

  it('phiếu Nháp mà người dùng không sửa được → về màn xem, không nạp bản nháp', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CONFIRM'])
    const { out } = await mount('pn-1')
    expect(out.current!.ready).toBe(false)
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finish).toHaveBeenCalledWith('pn-1')
    expect(store().draft).toBeNull()
  })

  it('second step screen does not reload the draft', async () => {
    const get = jest.spyOn(kv, 'get')
    await mount('pn-1')
    const reads = () => get.mock.calls.filter(([k]) => k === FORM_KEY).length
    expect(reads()).toBe(1)
    // Bước 1 được đẩy lên trên bước 2 của cùng phiếu: thấy bản nháp đã có trong store → không nạp lại.
    stackFor('pn-1', 'edit', 'info')
    const { out } = await mount('pn-1')
    expect(out.current!.ready).toBe(true)
    expect(reads()).toBe(1)
    get.mockRestore()
  })

  it('màn bước nằm dưới (không ở đỉnh Stack) không nạp, không rời màn', async () => {
    const get = jest.spyOn(kv, 'get')
    route('get', FORM_URL, () => ok(form2({ status: 'CONFIRMED' })))
    stackFor('pn-1', 'edit', 'info')
    mockRouteKey.current = 'edit'
    await mount('pn-1')
    expect(get.mock.calls.filter(([k]) => k === FORM_KEY)).toHaveLength(0)
    expect(leaveCount()).toBe(0)
    get.mockRestore()
  })

  it('rời luồng (không còn màn bước nào của phiếu) → bỏ thông báo mức phiếu của phiếu đó', async () => {
    const { view } = await mount('pn-1')
    await act(async () =>
      useFormNotice.getState().show({ kind: 'import', formSlug: 'pn-1', message: 'Lỗi' }),
    )
    await view.unmount()
    // Kiểm "còn màn bước nào không" được hoãn một nhịp (đổi bước = tháo màn này, gắn màn kia).
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    expect(notice()).toBeNull()
  })

  it('đổi bước (thay màn bước 2 bằng màn bước 1 trong cùng một lượt) → thông báo mức phiếu VẪN còn; thông báo phiếu xuất cùng slug không bị đụng', async () => {
    function Step(_: { name: string }) {
      useImportWizardDraft('pn-1')
      return null
    }
    const tree = (name: string) => (
      <QueryClientProvider client={client}>
        <Step key={name} name={name} />
      </QueryClientProvider>
    )
    const view = await render(tree('edit'))
    await settled()
    await act(async () =>
      useFormNotice.getState().show({ kind: 'import', formSlug: 'pn-1', message: 'Đã gộp' }),
    )
    stackFor('pn-1', 'info')
    await view.rerender(tree('info'))
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    expect(notice()).toMatchObject({ kind: 'import', formSlug: 'pn-1', message: 'Đã gộp' })
    await view.unmount()
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    expect(notice()).toBeNull()
  })
})

describe('useImportWizardDraft — đổi kho khi modal đang mở', () => {
  const WH_B = { slug: 'wh-b', code: 'B', name: 'Kho Thủ Đức', isManager: false }
  const toWarehouse = (current: typeof WH | null) =>
    act(async () => useWarehouseStore.setState({ current }))

  beforeEach(() => {
    route('get', FORM_URL, () => ok(form2()))
    route('get', '/warehouses/wh-b/import-forms/pn-1', () => ok(form2({ warehouseSlug: 'wh-b' })))
  })

  it('màn ở đỉnh Stack modal: lần hiện đầu không rời; đổi kho → đóng modal (exit) đúng một lần', async () => {
    stackFor('pn-1', 'edit', 'review')
    await mount('pn-1')
    expect(leaveCount()).toBe(0)
    await toWarehouse(WH_B)
    await settled()
    expect(leaveSpies.exit).toHaveBeenCalledTimes(1)
    expect(leaveCount()).toBe(1)
    // Màn trong tab tự về danh sách bằng hook của chúng: modal không dispatch gì lên Stack của nó.
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('màn bước nằm dưới (không ở đỉnh Stack modal) không rời', async () => {
    stackFor('pn-1', 'edit', 'review')
    mockRouteKey.current = 'edit'
    await mount('pn-1')
    await toWarehouse(WH_B)
    await settled()
    expect(leaveCount()).toBe(0)
  })

  it('phiếu mới: đổi kho → exit; kho bị xoá (hết phiên) → không rời (SessionGate lo)', async () => {
    stackFor('new', 'info')
    await mount('new')
    await toWarehouse(null)
    await settled()
    expect(leaveCount()).toBe(0)
    await toWarehouse(WH_B)
    await settled()
    expect(leaveSpies.exit).toHaveBeenCalledTimes(1)
  })
})

describe('useImportWizardDraft — phiếu mới (formSlug "new")', () => {
  beforeEach(() => stackFor('new', 'info'))

  it('chưa có bản nháp → bản trắng mã gợi ý + ngày hôm nay, CHỈ trong bộ nhớ; không gọi GET', async () => {
    const { out } = await mount('new')
    const r = out.current!
    expect(r.ready).toBe(true)
    expect(r.isNew).toBe(true)
    expect(r.form).toBeUndefined()
    expect(r.draft).toMatchObject({
      formSlug: 'new',
      version: null,
      headerBase: null,
      lines: [],
      header: {
        invoiceCode: '',
        date: todayLocalIso(),
        purchaseOrder: null,
        note: null,
        supplierSlug: null,
      },
    })
    expect(r.draft!.header.code).toMatch(/^PN-\d{8}-\d{4}$/)
    expect(r.step1Ok).toBe(false)
    expect(r.dirty).toBe(false)
    expect(callsTo('get', '/warehouses/wh-a/import-forms/new')).toHaveLength(0)
    await act(async () => new Promise((res) => setTimeout(res, 400)))
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull()
  })

  it('sửa bản trắng (Số HĐ) → dirty', async () => {
    const { out } = await mount('new')
    await act(async () => store().setHeader({ invoiceCode: 'HD-1' }))
    expect(out.current!.dirty).toBe(true)
    expect(out.current!.step1Ok).toBe(true)
  })

  it('đã có bản nháp phiếu mới trên máy → mở lại đúng nó (mã, đầu phiếu, dòng)', async () => {
    await AsyncStorage.setItem(
      NEW_KEY,
      JSON.stringify({ ...newDraft(newHeader()), lines: [makeLine(1, { base: null })] }),
    )
    const { out } = await mount('new')
    expect(out.current!.draft!.header).toMatchObject({ code: 'PN-MOI', invoiceCode: 'HD-9' })
    expect(out.current!.draft!.lines.map((l) => l.materialName)).toEqual(['Vật tư 1'])
    expect(out.current!.step1Ok).toBe(true)
    expect(out.current!.dirty).toBe(true)
  })

  it('second step screen does not reload the new draft (giữ đúng bản trắng đang có)', async () => {
    const { out: first } = await mount('new')
    const code = first.current!.draft!.header.code
    const get = jest.spyOn(kv, 'get')
    stackFor('new', 'info', 'edit')
    const { out } = await mount('new')
    expect(out.current!.ready).toBe(true)
    expect(out.current!.draft!.header.code).toBe(code)
    // Bản trắng vẫn "chưa sửa gì" ở bước sau (mã / ngày gợi ý dùng chung giữa các bước).
    expect(out.current!.dirty).toBe(false)
    expect(get.mock.calls.filter(([k]) => k === NEW_KEY)).toHaveLength(0)
    get.mockRestore()
  })

  it('kho có danh sách bên bán + SUPPLIER_READ → Bên bán bắt buộc (thiếu ở bước 1)', async () => {
    signIn([...EDITOR, 'SUPPLIER_READ'])
    route('get', '/suppliers', () =>
      ok({
        items: [{ slug: 's1', code: 'NCC1', name: 'Hoà Phát' }],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        hasNext: false,
      }),
    )
    await AsyncStorage.setItem(NEW_KEY, JSON.stringify(newDraft(newHeader())))
    const { out } = await mount('new')
    expect(out.current!.supplierRequired).toBe(true)
    expect(out.current!.canPickSupplier).toBe(true)
    expect(out.current!.suppliers?.map((s) => s.slug)).toEqual(['s1'])
    expect(out.current!.missing.map((m) => m.id)).toEqual(['header:supplier', 'lines'])
    expect(out.current!.step1Ok).toBe(false)
  })

  it('thiếu IMPORT_FORM_CREATE → về danh sách (bỏ mọi bước của phiếu), không dựng bản trắng', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT'])
    const { out } = await mount('new')
    expect(out.current!.ready).toBe(false)
    expect(store().draft).toBeNull()
    // Đóng modal, Stack tab về danh sách.
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finishToList).toHaveBeenCalledTimes(1)
  })
})
