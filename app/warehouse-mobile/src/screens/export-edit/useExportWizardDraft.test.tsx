// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react-native'
import { Alert } from 'react-native'

import type { ExportForm } from '@/entities/export-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  draftFromForm,
  exportDraftStorageKey,
  newExportDraft,
  stopExportDraftPersistence,
  useExportDraft,
} from '@/features/export-draft'
import { makeForm, makeItem, makeLine } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { leaveCount, leaveSpies } from '@/shared/lib/testing/wizard-nav'
import { kv } from '@/shared/storage/kv'

import { exportWizardLeave, useExportActions } from './useExportActions'
import { useExportWizardDraft } from './useExportWizardDraft'

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
const FORM_URL = '/warehouses/wh-a/export-forms/px-1'
const NEW_KEY = exportDraftStorageKey('u', 'wh-a', 'new')
const FORM_KEY = exportDraftStorageKey('u', 'wh-a', 'px-1')

const form2 = (over: Partial<ExportForm> = {}) =>
  makeForm([makeItem(1), makeItem(2, { batchSlug: 'b-2', batchExpiryDate: '2027-03-12' })], {
    warehouseSlug: 'wh-a',
    ...over,
  })

const ALL = [
  'EXPORT_FORM_READ',
  'EXPORT_FORM_CREATE',
  'EXPORT_FORM_UPDATE_DRAFT',
  'EXPORT_FORM_DELETE_DRAFT',
]
function signIn(scope: string[] = ALL) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH] } as never,
  })
}

const store = () => useExportDraft.getState()
const notice = () => useFormNotice.getState().notice

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

type Result = ReturnType<typeof useExportWizardDraft>
/** Một màn bước (route hiện tại) dùng hook; trả kết quả mới nhất của nó. */
async function mount(formSlug: string) {
  const out: { current: Result | null } = { current: null }
  function Probe() {
    out.current = useExportWizardDraft(formSlug)
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
  stopExportDraftPersistence()
  store().reset()
  client.clear()
})

describe('useExportWizardDraft — phiếu đã có', () => {
  beforeEach(() => {
    stackFor('px-1', 'edit')
    route('get', FORM_URL, () => ok(form2()))
  })

  it('nạp bản nháp của phiếu: ready, đúng ctx / form / quyền; đủ bước 1 + bước 2', async () => {
    const { out } = await mount('px-1')
    const r = out.current!
    expect(r.ready).toBe(true)
    expect(r.isNew).toBe(false)
    expect(r.ctx).toEqual({ userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'px-1' })
    expect(r.form?.slug).toBe('px-1')
    expect(r.abilities?.canEdit).toBe(true)
    expect(r.draft?.header.code).toBe('PX-1')
    expect(r).toMatchObject({ step1Ok: true, step2Ok: true, missing: [] })
  })

  it('thiếu theo bước: đầu phiếu thiếu → step1Ok false; dòng thiếu giá → step2Ok false', async () => {
    route('get', FORM_URL, () =>
      ok(form2({ receiver: '', items: [makeItem(1, { unitPrice: null as never })] })),
    )
    const { out } = await mount('px-1')
    expect(out.current!.step1Ok).toBe(false)
    expect(out.current!.step2Ok).toBe(false)
    expect(out.current!.missing.map((m) => m.id)).toEqual([
      'header:receiver',
      expect.stringMatching(/^line:.*:price$/),
    ])
  })

  it('chỉ sửa đầu phiếu trên máy, phiếu đổi version ở nơi khác → giữ đầu phiếu đã sửa + báo đã gộp (thông báo mức phiếu dùng chung)', async () => {
    const saved = draftFromForm(form2())
    await kv.set(FORM_KEY, { ...saved, header: { ...saved.header, type: 'DISPOSAL' } })
    route('get', FORM_URL, () => ok(form2({ version: 4, receiver: 'Bếp B' })))
    await mount('px-1')
    expect(store().draft?.header).toMatchObject({ type: 'DISPOSAL', receiver: 'Bếp B' })
    expect(notice()).toMatchObject({ kind: 'export', formSlug: 'px-1' })
    expect(notice()!.message).toMatch(/^Phiếu đã được sửa ở nơi khác — đã tải bản mới nhất và gộp/)
    expect(notice()!.message).not.toMatch(/Đầu phiếu/)
  })

  it('đầu phiếu xung đột (server đổi Loại khác giá trị trên máy) → lấy của server, báo tên trường', async () => {
    const saved = draftFromForm(form2())
    await kv.set(FORM_KEY, {
      ...saved,
      header: { ...saved.header, type: 'DISPOSAL', receiver: 'Bếp C' },
    })
    route('get', FORM_URL, () => ok(form2({ version: 4, type: 'SALE' })))
    await mount('px-1')
    expect(store().draft?.header).toMatchObject({ type: 'SALE', receiver: 'Bếp C' })
    expect(notice()!.message).toMatch(
      /Đầu phiếu cũng đã bị đổi ở nơi khác — đã lấy theo bản mới: Loại\.$/,
    )
  })

  it('phiếu không còn Nháp (tải về Chờ duyệt) → bỏ bản nháp, về màn xem (không còn bước nào)', async () => {
    route('get', FORM_URL, () => ok(form2({ status: 'PENDING' })))
    await mount('px-1')
    expect(store().draft).toBeNull()
    // Đóng modal, màn xem phiếu ở đỉnh Stack tab.
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finish).toHaveBeenCalledWith('px-1')
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('phiếu không còn Nháp mà đã sửa trên máy → hộp thoại báo đã bỏ bản nháp', async () => {
    const saved = draftFromForm(form2())
    await kv.set(FORM_KEY, { ...saved, header: { ...saved.header, receiver: 'Bếp Z' } })
    route('get', FORM_URL, () => ok(form2({ status: 'PENDING' })))
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await mount('px-1')
    expect(alert).toHaveBeenCalledTimes(1)
    expect(await kv.get(FORM_KEY)).toBeNull()
    expect(leaveSpies.finish).toHaveBeenCalledWith('px-1')
    alert.mockRestore()
  })

  it('không có quyền sửa phiếu → về màn xem, không đụng bản nháp', async () => {
    signIn(['EXPORT_FORM_READ'])
    const { out } = await mount('px-1')
    expect(out.current!.ready).toBe(false)
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finish).toHaveBeenCalledWith('px-1')
    expect(store().draft).toBeNull()
  })

  it('second step screen does not reload the draft', async () => {
    const get = jest.spyOn(kv, 'get')
    await mount('px-1')
    const reads = () => get.mock.calls.filter(([k]) => k === FORM_KEY).length
    expect(reads()).toBe(1)
    // Bước 1 được đẩy lên trên bước 2 của cùng phiếu: thấy bản nháp đã có trong store → không nạp lại.
    stackFor('px-1', 'edit', 'info')
    const { out } = await mount('px-1')
    expect(out.current!.ready).toBe(true)
    expect(reads()).toBe(1)
    get.mockRestore()
  })

  it('màn bước nằm dưới (không ở đỉnh Stack) không nạp, không rời màn', async () => {
    const get = jest.spyOn(kv, 'get')
    route('get', FORM_URL, () => ok(form2({ status: 'PENDING' })))
    stackFor('px-1', 'edit', 'info')
    mockRouteKey.current = 'edit'
    await mount('px-1')
    expect(get.mock.calls.filter(([k]) => k === FORM_KEY)).toHaveLength(0)
    expect(leaveCount()).toBe(0)
    get.mockRestore()
  })

  it('rời luồng (không còn màn bước nào của phiếu) → bỏ thông báo mức phiếu của phiếu đó', async () => {
    const { view } = await mount('px-1')
    await act(async () =>
      useFormNotice.getState().show({ kind: 'export', formSlug: 'px-1', message: 'Lỗi' }),
    )
    await view.unmount()
    // Kiểm "còn màn bước nào không" được hoãn một nhịp (đổi bước = tháo màn này, gắn màn kia).
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    expect(notice()).toBeNull()
  })

  it('đổi bước (goToStep thay màn bước 2 bằng màn bước 1 trong cùng một lượt) → thông báo mức phiếu VẪN còn', async () => {
    // [xem, 2] → chạm bước 1 = pop bước 2 + push bước 1: React tháo màn cũ (cleanup) TRƯỚC khi chạy
    // effect gắn của màn mới — bộ đếm qua 0 trong chốc lát, không được coi là đã rời luồng.
    function Step(_: { name: string }) {
      useExportWizardDraft('px-1')
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
      useFormNotice.getState().show({ kind: 'export', formSlug: 'px-1', message: 'Đã gộp' }),
    )
    stackFor('px-1', 'info')
    await view.rerender(tree('info'))
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    expect(notice()).toMatchObject({ formSlug: 'px-1', message: 'Đã gộp' })
    // Rời hẳn luồng (màn bước cuối cùng tháo ra) → bỏ.
    await view.unmount()
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    expect(notice()).toBeNull()
  })
})

describe('useExportWizardDraft — đổi kho khi modal đang mở', () => {
  const WH_B = { slug: 'wh-b', code: 'B', name: 'Kho Thủ Đức', isManager: false }
  const toWarehouse = (current: typeof WH | null) =>
    act(async () => useWarehouseStore.setState({ current }))

  beforeEach(() => {
    route('get', FORM_URL, () => ok(form2()))
    route('get', '/warehouses/wh-b/export-forms/px-1', () => ok(form2({ warehouseSlug: 'wh-b' })))
  })

  it('màn ở đỉnh Stack modal: lần hiện đầu không rời; đổi kho → đóng modal (exit) đúng một lần', async () => {
    stackFor('px-1', 'edit', 'review')
    await mount('px-1')
    expect(leaveCount()).toBe(0)
    await toWarehouse(WH_B)
    await settled()
    expect(leaveSpies.exit).toHaveBeenCalledTimes(1)
    expect(leaveCount()).toBe(1)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('màn bước nằm dưới (không ở đỉnh Stack modal) không rời', async () => {
    stackFor('px-1', 'edit', 'review')
    mockRouteKey.current = 'edit'
    await mount('px-1')
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

describe('useExportWizardDraft — phiếu mới (formSlug "new")', () => {
  beforeEach(() => stackFor('new', 'info'))

  it('chưa có bản nháp → bản trắng có mã gợi ý, loại Sản xuất, CHỈ trong bộ nhớ; không gọi GET', async () => {
    const { out } = await mount('new')
    const r = out.current!
    expect(r.ready).toBe(true)
    expect(r.isNew).toBe(true)
    expect(r.form).toBeUndefined()
    expect(r.draft!.header).toMatchObject({ type: 'PRODUCTION', receiver: '' })
    expect(r.draft!.header.code).toMatch(/^PX-\d{8}-\d{4}$/)
    expect(r.step1Ok).toBe(false)
    expect(callsTo('get', '/warehouses/wh-a/export-forms/new')).toHaveLength(0)
    await act(async () => new Promise((res) => setTimeout(res, 350)))
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull()
  })

  it('đã có bản nháp phiếu mới trên máy → mở lại đúng nó (mã, đầu phiếu, dòng)', async () => {
    const d = newExportDraft({
      code: 'PX-CU',
      purchaseOrder: 'PO-1',
      receiver: 'Bếp',
      type: 'OTHER',
    })
    d.lines = [makeLine(1, { base: null })]
    await AsyncStorage.setItem(NEW_KEY, JSON.stringify(d))
    const { out } = await mount('new')
    expect(out.current!.draft!.header).toMatchObject({
      code: 'PX-CU',
      receiver: 'Bếp',
      type: 'OTHER',
    })
    expect(out.current!.draft!.lines.map((l) => l.materialName)).toEqual(['Vật tư 1'])
    expect(out.current!.step1Ok).toBe(true)
  })

  it('second step screen does not reload the new draft (giữ đúng bản trắng đang có)', async () => {
    const { out: first } = await mount('new')
    const code = first.current!.draft!.header.code
    const get = jest.spyOn(kv, 'get')
    stackFor('new', 'info', 'edit')
    const { out } = await mount('new')
    expect(out.current!.ready).toBe(true)
    expect(out.current!.draft!.header.code).toBe(code)
    expect(get.mock.calls.filter(([k]) => k === NEW_KEY)).toHaveLength(0)
    get.mockRestore()
  })

  it('thiếu EXPORT_FORM_CREATE → về danh sách (bỏ mọi bước của phiếu)', async () => {
    signIn(['EXPORT_FORM_READ'])
    const { out } = await mount('new')
    expect(out.current!.ready).toBe(false)
    // Đóng modal, Stack tab về danh sách.
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finishToList).toHaveBeenCalledTimes(1)
  })
})

// Chuyển từ màn soạn một trang (ExportEditScreen): luồng ghi rời màn rồi lần tải lại phiếu (Chờ duyệt) về
// sau không được rời thêm một màn (useLeaveOnce dùng chung giữa useExportActions và useWizardNav).
describe('useExportWizardDraft + useExportActions — rời màn đúng một lần', () => {
  it('Gửi duyệt thành công → về màn xem ĐÚNG MỘT lần (phiếu Chờ duyệt về cache không làm màn rời lần nữa)', async () => {
    stackFor('px-1', 'edit')
    route('get', FORM_URL, () => ok(form2()))
    const pending = form2({ version: 4, status: 'PENDING' })
    route('post', `${FORM_URL}/submit`, () => {
      route('get', FORM_URL, () => ok(pending))
      return ok(pending)
    })
    const out: { submit: (() => Promise<void>) | null } = { submit: null }
    function Probe() {
      const wizard = useExportWizardDraft('px-1')
      const actions = useExportActions({
        ctx: wizard.ctx,
        form: wizard.form,
        abilities: wizard.abilities,
        leave: exportWizardLeave(wizard.nav),
      })
      out.submit = actions.submit
      return null
    }
    await render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )
    await settled()
    await act(async () => out.submit!())
    await settled()
    expect(callsTo('post', `${FORM_URL}/submit`)).toHaveLength(1)
    expect(leaveCount()).toBe(1)
    expect(leaveSpies.finish).toHaveBeenCalledWith('px-1')
    expect(mockBack).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(store().draft).toBeNull()
  })
})
