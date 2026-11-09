// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import type { ReactNode } from 'react'
import { Alert } from 'react-native'

import { importFormKeys, type ImportForm } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import {
  draftStorageKey,
  isDirty,
  newDraft,
  stopDraftPersistence,
  useReceiveDraft,
} from '@/features/receive-checklist'
import { resetAttachmentUploads, startAttachmentUpload } from '@/features/form-attachment'
import { installRnFormData } from '@/shared/api/testing/rn-form-data'
import { makeForm, makeItem, makeLine } from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { confirmAction } from '@/shared/lib/native-confirm'

import { useReceiveActions } from './useReceiveActions'

/** Điều hướng sau ghi của luồng soạn (màn truyền từ `nav` của luồng 3 bước) — chỉ ghi lại lời gọi. */
const leave = { toView: jest.fn(), toList: jest.fn(), toInfo: jest.fn(), reopen: jest.fn() }
/** Thông báo mức phiếu lúc `leave.reopen` được gọi (phải hiện SAU khi điều hướng). */
let noticeAtReopen: unknown = 'chưa gọi'
/** Thông báo mức phiếu của luồng soạn (store dùng chung) — hook không giữ state thông báo riêng. */
const formNotice = () => useFormNotice.getState().notice

const mockBack = jest.fn()
const mockReplace = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush }),
}))
jest.mock('@/shared/lib/native-confirm', () => ({ confirmAction: jest.fn() }))

const WH = 'wh-a'
const FORM_URL = '/warehouses/wh-a/import-forms/pn-1'
const CONFIRM_URL = `${FORM_URL}/confirm`
const KEY = draftStorageKey('u', WH, 'pn-1')
const ctx = { userSlug: 'u', warehouseSlug: WH, formSlug: 'pn-1' }

/** Phiếu 3 dòng, mỗi dòng 10 bao × 1.000 đ, version 3. */
const form3 = (over: Partial<ImportForm> = {}) =>
  makeForm([makeItem(1), makeItem(2), makeItem(3)], { warehouseSlug: WH, ...over })

let client: QueryClient
const store = () => useReceiveDraft.getState()
const writes = () => calls.filter((c) => c.method !== 'get')
const confirmMock = () => jest.mocked(confirmAction)
const lastDialog = () => confirmMock().mock.calls.at(-1)![0]
const nbsp = (s: string | undefined) => (s ?? '').replace(/ /g, ' ')
const body = (config: { data?: unknown }) => JSON.parse(String(config.data))

async function setup(
  form: ImportForm = form3(),
  {
    canEdit = true,
    checklist,
    compose = false,
  }: { canEdit?: boolean; checklist?: boolean; compose?: boolean } = {},
) {
  await store().load(ctx, form)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = await renderHook(
    (props: { form: ImportForm }) =>
      useReceiveActions(
        compose
          ? { warehouseSlug: WH, form: props.form, canEdit, checklist, compose: true, leave }
          : { warehouseSlug: WH, form: props.form, canEdit, checklist },
      ),
    { wrapper, initialProps: { form } },
  )
  return view
}

/** Dòng 1: 10 → 8 + hạn dùng; dòng 2: 0 (bỏ); dòng 3: khớp. Cả 3 đã kiểm. */
function editMockup() {
  store().updateLine('m-1|u-1', { quantity: 8, expiryDate: '2026-12-01' })
  store().updateLine('m-2|u-2', { quantity: 0 })
  store().toggleCheck('m-3|u-3')
}

const saved = (version = 4) =>
  form3({
    version,
    items: [
      makeItem(1, { quantity: 8, expiryDate: '2026-12-01', amount: 8000 }),
      makeItem(3, { lineNo: 2 }),
    ],
  })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  store().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  confirmMock().mockResolvedValue(true)
  useFormNotice.getState().reset()
})

afterEach(() => {
  stopDraftPersistence()
  store().reset()
  client.clear()
})

describe('useReceiveActions — Lưu', () => {
  it("gửi PATCH đúng body (bỏ dòng 0, có expiryDate, version; PO / ghi chú trống gửi '' để server xoá thật)", async () => {
    let sent: unknown
    route('patch', FORM_URL, (config) => {
      sent = body(config)
      return ok(saved())
    })
    const { result } = await setup()
    editMockup()
    await act(() => result.current.save())
    expect(sent).toEqual({
      code: 'PN-1',
      invoiceCode: 'HD-1',
      date: '2026-11-04',
      purchaseOrder: '',
      note: '',
      version: 3,
      items: [
        {
          materialSlug: 'm-1',
          unitSlug: 'u-1',
          quantity: 8,
          unitPrice: 1000,
          expiryDate: '2026-12-01',
        },
        { materialSlug: 'm-3', unitSlug: 'u-3', quantity: 10, unitPrice: 1000, expiryDate: null },
      ],
    })
  })

  it('hỏi lại kèm tóm tắt: giữ nguyên, cũ → mới, bỏ khỏi phiếu, tổng tiền, ghi đè', async () => {
    route('patch', FORM_URL, () => ok(saved()))
    const { result } = await setup()
    editMockup()
    await act(() => result.current.save())
    const dialog = lastDialog()
    expect(dialog.title).toBe('Lưu thay đổi phiếu PN-1?')
    expect(dialog.confirmLabel).toBe('Lưu')
    expect(nbsp(dialog.message)).toBe(
      [
        'Giữ nguyên số trên phiếu: 1 dòng',
        'Vật tư 1 10 → 8 bao',
        'Vật tư 1: HSD chưa có → 01/12/26',
        'Bỏ khỏi phiếu: Vật tư 2',
        'Tổng tiền mới 18.000 đ',
        'Số thực nhận sẽ ghi đè số trên phiếu.',
      ].join('\n'),
    )
  })

  it('kết quả về → bản nháp theo phiếu đã lưu: không còn dirty, dấu kiểm giữ, rung success', async () => {
    route('patch', FORM_URL, () => ok(saved()))
    const { result } = await setup()
    editMockup()
    await act(() => result.current.save())
    const d = store().draft!
    expect(d.version).toBe(4)
    expect(isDirty(d, saved())).toBe(false)
    expect(d.lines.map((l) => [l.key, l.checked])).toEqual([
      ['m-1|u-1', true],
      ['m-3|u-3', true],
    ])
    expect(client.getQueryData(['import-forms', WH, 'detail', 'pn-1'])).toEqual(saved())
    expect(result.current.error).toBeNull()
    expect(result.current.busy).toBeNull()
    expect(store().saving).toBe(false)
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('Lưu xong vẫn Lưu tiếp được lần nữa (khoá được mở lại)', async () => {
    route('patch', FORM_URL, () => ok(saved()))
    const { result, rerender } = await setup()
    editMockup()
    await act(() => result.current.save())
    await rerender({ form: saved() })
    store().updateLine('m-3|u-3', { quantity: 9 })
    route('patch', FORM_URL, () => ok(saved(5)))
    await act(() => result.current.save())
    expect(callsTo('patch', FORM_URL)).toHaveLength(2)
  })

  it('người dùng huỷ hộp hỏi → không request, bản nháp nguyên', async () => {
    confirmMock().mockResolvedValue(false)
    const { result } = await setup()
    editMockup()
    const before = store().draft
    await act(() => result.current.save())
    expect(calls).toHaveLength(0)
    expect(store().draft).toBe(before)
    expect(result.current.error).toBeNull()
  })

  it('bấm hai lần nhanh → một hộp hỏi, một request', async () => {
    route('patch', FORM_URL, () => ok(saved()))
    const { result } = await setup()
    editMockup()
    await act(async () => {
      const a = result.current.save()
      const b = result.current.save()
      const c = result.current.confirm()
      await Promise.all([a, b, c])
    })
    expect(confirmMock()).toHaveBeenCalledTimes(1)
    expect(writes()).toHaveLength(1)
  })

  it('mọi dòng 0 → không hỏi, không request, báo mức phiếu', async () => {
    const { result } = await setup()
    for (const n of [1, 2, 3]) store().updateLine(`m-${n}|u-${n}`, { quantity: 0 })
    await act(() => result.current.save())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
    expect(result.current.error).toBe('Mọi dòng đều 0 — không lưu được, huỷ phiếu trên web')
  })

  it('hạn dùng trước ngày phiếu → không hỏi, báo số dòng và tô các dòng đó', async () => {
    const { result } = await setup()
    store().updateLine('m-2|u-2', { expiryDate: '2026-11-01' })
    await act(() => result.current.save())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
    expect(result.current.error).toBe('Hạn dùng trước ngày phiếu ở 1 dòng')
    expect([...result.current.flagged]).toEqual(['m-2|u-2'])
    await act(async () => result.current.dismissError())
    expect(result.current.error).toBeNull()
    expect(result.current.flagged.size).toBe(0)
  })

  it('lỗi mạng → bản nháp nguyên vẹn, báo lỗi mạng', async () => {
    route('patch', FORM_URL, () => 'network')
    const { result } = await setup()
    editMockup()
    const before = JSON.stringify(store().draft)
    await act(() => result.current.save())
    expect(JSON.stringify(store().draft)).toBe(before)
    expect(result.current.error).toBe('Không kết nối được máy chủ')
    expect(store().saving).toBe(false)
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error')
  })

  it('lỗi khác (422) → câu lỗi của phiếu nhập, bản nháp nguyên', async () => {
    route('patch', FORM_URL, () => failure(422, 101333))
    const { result } = await setup()
    editMockup()
    const before = JSON.stringify(store().draft)
    await act(() => result.current.save())
    expect(result.current.error).toBe('Hạn dùng không được trước ngày nhập của phiếu.')
    expect(JSON.stringify(store().draft)).toBe(before)
  })

  it('đang gửi: saving = true, busy = "save", sửa trên máy bị chặn', async () => {
    let release: (r: ReturnType<typeof ok>) => void = () => undefined
    route('patch', FORM_URL, () => new Promise((r) => (release = r)))
    const { result } = await setup()
    editMockup()
    let pending: Promise<void> = Promise.resolve()
    await act(async () => {
      pending = result.current.save()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(store().saving).toBe(true)
    expect(result.current.busy).toBe('save')
    store().updateLine('m-3|u-3', { quantity: 1 })
    store().toggleCheck('m-1|u-1')
    expect(store().draft!.lines[2]!.quantity).toBe(10)
    expect(store().draft!.lines[0]!.checked).toBe(true)
    await act(async () => {
      release(ok(saved()))
      await pending
    })
    expect(store().saving).toBe(false)
    expect(result.current.busy).toBeNull()
  })

  it('phiên đổi giữa chừng → bỏ kết quả: không đụng bản nháp, không báo', async () => {
    let release: (r: ReturnType<typeof ok>) => void = () => undefined
    route('patch', FORM_URL, () => new Promise((r) => (release = r)))
    const { result } = await setup()
    editMockup()
    const before = JSON.stringify(store().draft)
    let pending: Promise<void> = Promise.resolve()
    await act(async () => {
      pending = result.current.save()
      await new Promise((r) => setTimeout(r, 0))
    })
    await act(async () => useAuthStore.getState().endSession('expired'))
    await act(async () => {
      release(ok(saved()))
      await pending
    })
    expect(JSON.stringify(store().draft)).toBe(before)
    expect(result.current.error).toBeNull()
    expect(Haptics.notificationAsync).not.toHaveBeenCalled()
  })
})

describe('useReceiveActions — lệch version', () => {
  it('PATCH 409 → báo, GET lại, gộp: dòng đổi trên server changedOnServer, dòng không đổi vẫn checked; không gửi lại', async () => {
    route('patch', FORM_URL, () => failure(409, 100800))
    // Server: dòng 2 đổi 10 → 12, dòng 3 bị xoá, dòng 1 như cũ.
    const fresh = form3({
      version: 5,
      items: [makeItem(1), makeItem(2, { quantity: 12 })],
    })
    route('get', FORM_URL, () => ok(fresh))
    const { result } = await setup()
    store().updateLine('m-1|u-1', { quantity: 8 })
    store().toggleCheck('m-2|u-2')
    store().toggleCheck('m-3|u-3')
    await act(() => result.current.save())

    expect(calls.map((c) => c.method)).toEqual(['patch', 'get'])
    expect(result.current.error).toBe(
      'Phiếu đã được người khác thay đổi. Đã tải lại; các dòng đổi trên web cần kiểm lại. Đã bị xoá trên phiếu: Vật tư 3',
    )
    const d = store().draft!
    expect(d.version).toBe(5)
    expect(d.lines.map((l) => l.key)).toEqual(['m-1|u-1', 'm-2|u-2'])
    expect(d.lines[0]).toMatchObject({ quantity: 8, checked: true, changedOnServer: false })
    expect(d.lines[1]).toMatchObject({ quantity: 12, checked: false, changedOnServer: true })
    expect(client.getQueryData(['import-forms', WH, 'detail', 'pn-1'])).toEqual(fresh)
    expect(mockBack).not.toHaveBeenCalled()
    // Không có request thứ hai sau GET, kể cả sau một lúc.
    await act(async () => new Promise((r) => setTimeout(r, 50)))
    expect(writes()).toHaveLength(1)
  })

  it('"Sửa phiếu" (không checklist): PATCH 409 → câu báo không nói "kiểm lại"', async () => {
    route('patch', FORM_URL, () => failure(409, 100800))
    route('get', FORM_URL, () => ok(form3({ version: 5, items: [makeItem(1), makeItem(2)] })))
    const { result } = await setup(form3(), { checklist: false })
    store().updateLine('m-1|u-1', { quantity: 8 })
    await act(() => result.current.save())
    expect(result.current.error).toBe(
      'Phiếu đã được người khác thay đổi. Đã tải lại; xem lại các dòng đổi trên web trước khi Lưu. Đã bị xoá trên phiếu: Vật tư 3',
    )
  })

  it('PATCH 409 mà đầu phiếu sửa trên máy cũng bị đổi trên server → lấy của server, câu báo nêu trường', async () => {
    route('patch', FORM_URL, () => failure(409, 100800))
    route('get', FORM_URL, () =>
      ok(
        form3({
          version: 5,
          invoiceCode: 'HD-WEB',
          items: [makeItem(1), makeItem(2), makeItem(3)],
        }),
      ),
    )
    const { result } = await setup()
    store().setHeader({ invoiceCode: 'HD-MAY', note: 'của tôi' })
    await act(() => result.current.save())
    expect(result.current.error).toBe(
      'Phiếu đã được người khác thay đổi. Đã tải lại; các dòng đổi trên web cần kiểm lại. Đầu phiếu cũng đã bị đổi ở nơi khác — đã lấy theo bản mới: Số hoá đơn.',
    )
    expect(store().draft!.header).toMatchObject({ invoiceCode: 'HD-WEB', note: 'của tôi' })
    expect(writes()).toHaveLength(1)
  })

  it('phiếu không còn Nháp → xoá bản nháp, báo, quay về danh sách', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    route('patch', FORM_URL, () => failure(422, 101314))
    route('get', FORM_URL, () => ok(form3({ version: 6, status: 'CONFIRMED' })))
    const { result } = await setup()
    editMockup()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400)) // bản nháp đã ghi xuống máy
    })
    expect(await AsyncStorage.getItem(KEY)).not.toBeNull()
    const invalidate = jest.spyOn(client, 'invalidateQueries')
    await act(() => result.current.save())
    // Phiếu có thể đã được xác nhận (tồn kho đổi) → làm mới cả tồn kho.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', WH] })
    expect(store().draft).toBeNull()
    expect(await AsyncStorage.getItem(KEY)).toBeNull()
    expect(Alert.alert).toHaveBeenCalledWith(
      'Phiếu đã được người khác thay đổi',
      'Phiếu không còn ở trạng thái Nháp hoặc đã bị xoá. Đã bỏ bản nháp trên máy.',
    )
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(writes()).toHaveLength(1)
  })

  it('phiếu đã bị xoá (GET 101301) → xoá bản nháp, quay về danh sách', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    route('patch', FORM_URL, () => failure(404, 101301))
    route('get', FORM_URL, () => failure(404, 101301))
    const { result } = await setup()
    editMockup()
    await act(() => result.current.save())
    expect(store().draft).toBeNull()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('GET lại lỗi mạng → bản nháp nguyên, báo xung đột kèm lỗi', async () => {
    route('patch', FORM_URL, () => failure(409, 100800))
    route('get', FORM_URL, () => 'network')
    const { result } = await setup()
    editMockup()
    const before = JSON.stringify(store().draft)
    await act(() => result.current.save())
    expect(JSON.stringify(store().draft)).toBe(before)
    expect(result.current.error).toMatch(/^Phiếu đã được người khác thay đổi\. Chưa tải lại được: /)
  })
})

describe('useReceiveActions — Xác nhận nhập kho', () => {
  function checkAll() {
    for (const l of store().draft!.lines) if (!l.checked) store().toggleCheck(l.key)
  }

  it('có thay đổi → PATCH rồi POST confirm với version của PATCH; xong: xoá nháp, làm mới, rung, back', async () => {
    route('patch', FORM_URL, () => ok(saved()))
    let confirmBody: unknown
    route('post', CONFIRM_URL, (config) => {
      confirmBody = body(config)
      return ok(saved(5))
    })
    const { result } = await setup()
    editMockup()
    checkAll()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })
    const invalidate = jest.spyOn(client, 'invalidateQueries')
    await act(() => result.current.confirm())

    expect(writes().map((c) => `${c.method} ${c.url}`)).toEqual([
      `patch ${FORM_URL}`,
      `post ${CONFIRM_URL}`,
    ])
    expect(confirmBody).toEqual({ version: 4 })
    const dialog = lastDialog()
    expect(dialog.title).toBe('Xác nhận nhập kho PN-1?')
    expect(dialog.confirmLabel).toBe('Xác nhận nhập kho')
    expect(nbsp(dialog.message).split('\n')).toEqual([
      'Tồn kho sẽ được cộng ngay và không sửa phiếu được nữa.',
      'Giữ nguyên số trên phiếu: 1 dòng',
      'Vật tư 1 10 → 8 bao',
      'Vật tư 1: HSD chưa có → 01/12/26',
      'Bỏ khỏi phiếu: Vật tư 2',
      'Tổng tiền mới 18.000 đ',
      'Số thực nhận sẽ ghi đè số trên phiếu.',
    ])
    expect(store().draft).toBeNull()
    expect(await AsyncStorage.getItem(KEY)).toBeNull()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['import-forms', WH] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', WH] })
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it('không có thay đổi → chỉ confirm với version đang có', async () => {
    let confirmBody: unknown
    route('post', CONFIRM_URL, (config) => {
      confirmBody = body(config)
      return ok(form3({ version: 4, status: 'CONFIRMED' }))
    })
    const { result } = await setup()
    checkAll()
    await act(() => result.current.confirm())
    expect(writes().map((c) => c.method)).toEqual(['post'])
    expect(confirmBody).toEqual({ version: 3 })
    expect(nbsp(lastDialog().message).split('\n')).toEqual([
      'Tồn kho sẽ được cộng ngay và không sửa phiếu được nữa.',
      'Giữ nguyên số trên phiếu: 3 dòng',
      'Tổng tiền mới 30.000 đ',
    ])
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('confirm 422 sau PATCH thành công → "đã lưu nhưng chưa xác nhận", bản nháp version mới, ở lại', async () => {
    route('patch', FORM_URL, () => ok(saved()))
    route('post', CONFIRM_URL, () => failure(422, 101333))
    const { result } = await setup()
    editMockup()
    checkAll()
    await act(() => result.current.confirm())
    expect(result.current.error).toBe(
      'Đã lưu nhưng chưa xác nhận được: Hạn dùng không được trước ngày nhập của phiếu.',
    )
    const d = store().draft!
    expect(d.version).toBe(4)
    expect(isDirty(d, saved())).toBe(false)
    expect(d.lines.every((l) => l.checked)).toBe(true)
    expect(mockBack).not.toHaveBeenCalled()
    expect(result.current.busy).toBeNull()
  })

  it('confirm 409 khi không PATCH → xử lý như lệch version, không gửi lại', async () => {
    route('post', CONFIRM_URL, () => failure(409, 100800))
    route('get', FORM_URL, () => ok(form3({ version: 7 })))
    const { result } = await setup()
    checkAll()
    await act(() => result.current.confirm())
    expect(calls.map((c) => c.method)).toEqual(['post', 'get'])
    expect(result.current.error).toBe(
      'Phiếu đã được người khác thay đổi. Đã tải lại; các dòng đổi trên web cần kiểm lại.',
    )
    expect(store().draft!.version).toBe(7)
    expect(store().draft!.lines.every((l) => l.checked)).toBe(true)
  })

  it('người dùng huỷ → không request', async () => {
    confirmMock().mockResolvedValue(false)
    const { result } = await setup()
    checkAll()
    await act(() => result.current.confirm())
    expect(calls).toHaveLength(0)
    expect(store().draft).not.toBeNull()
  })
})

describe('useReceiveActions — tóm tắt: hạn dùng và ghi chú', () => {
  it('ghi đè hạn dùng kế toán vừa đổi + đổi ghi chú → hộp hỏi nêu từng dòng, không tính "giữ nguyên"', async () => {
    const form = form3({
      items: [makeItem(1), makeItem(2, { expiryDate: '2028-08-15' }), makeItem(3, { note: 'cũ' })],
    })
    route('patch', FORM_URL, () => ok(form))
    const { result } = await setup(form)
    store().updateLine('m-2|u-2', { expiryDate: '2028-09-01' })
    store().updateLine('m-3|u-3', { note: 'rách 2 bao' })
    await act(() => result.current.save())
    expect(nbsp(lastDialog().message).split('\n')).toEqual([
      'Giữ nguyên số trên phiếu: 1 dòng',
      'Vật tư 2: HSD 15/08/28 → 01/09/28',
      'Vật tư 3: ghi chú đổi',
      'Tổng tiền mới 30.000 đ',
    ])
  })

  it('xoá hạn dùng → "HSD … → chưa có"; Xác nhận cũng liệt kê', async () => {
    const form = form3({
      items: [makeItem(1, { expiryDate: '2028-08-15' }), makeItem(2), makeItem(3)],
    })
    route('patch', FORM_URL, () => ok(form))
    route('post', CONFIRM_URL, () => ok({ ...form, status: 'CONFIRMED' }))
    const { result } = await setup(form)
    store().updateLine('m-1|u-1', { expiryDate: null })
    store().toggleCheck('m-2|u-2')
    store().toggleCheck('m-3|u-3')
    await act(() => result.current.confirm())
    expect(nbsp(lastDialog().message).split('\n')).toEqual([
      'Tồn kho sẽ được cộng ngay và không sửa phiếu được nữa.',
      'Giữ nguyên số trên phiếu: 2 dòng',
      'Vật tư 1: HSD 15/08/28 → chưa có',
      'Tổng tiền mới 30.000 đ',
    ])
  })

  it('10 dòng đổi hạn → 8 dòng rồi "… và 2 dòng khác"', async () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(i + 1))
    const form = makeForm(items, { warehouseSlug: WH })
    route('patch', FORM_URL, () => ok(form))
    const { result } = await setup(form)
    for (let n = 1; n <= 10; n++) store().updateLine(`m-${n}|u-${n}`, { expiryDate: '2027-01-01' })
    await act(() => result.current.save())
    const lines = nbsp(lastDialog().message).split('\n')
    expect(lines.slice(0, 9)).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `Vật tư ${i + 1}: HSD chưa có → 01/01/27`),
      '… và 2 dòng khác',
    ])
    expect(lines).not.toContain('Giữ nguyên số trên phiếu: 0 dòng')
  })
})

describe('useReceiveActions — không có quyền sửa / còn dòng chưa kiểm', () => {
  function checkAll() {
    for (const l of store().draft!.lines) if (!l.checked) store().toggleCheck(l.key)
  }

  it('không quyền sửa + bản nháp có thay đổi → Xác nhận KHÔNG gửi gì (không PATCH 403), báo + gợi ý bỏ thay đổi', async () => {
    route('patch', FORM_URL, () => failure(403, 100003))
    route('post', CONFIRM_URL, () => ok(form3({ status: 'CONFIRMED' })))
    const { result } = await setup(form3(), { canEdit: false })
    store().updateLine('m-1|u-1', { quantity: 8 })
    checkAll()
    const before = JSON.stringify(store().draft)
    await act(() => result.current.confirm())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
    expect(result.current.error).toBe(
      'Bạn không có quyền sửa phiếu này nên không lưu được số, hạn dùng, ghi chú đã sửa trên máy. Bỏ thay đổi trên máy rồi xác nhận theo số trên phiếu.',
    )
    expect(result.current.offerDiscard).toBe(true)
    expect(JSON.stringify(store().draft)).toBe(before)
    await act(async () => result.current.dismissError())
    expect(result.current.offerDiscard).toBe(false)
  })

  it('không quyền sửa, không có thay đổi → chỉ POST confirm', async () => {
    route('post', CONFIRM_URL, () => ok(form3({ version: 4, status: 'CONFIRMED' })))
    const { result } = await setup(form3(), { canEdit: false })
    checkAll()
    await act(() => result.current.confirm())
    expect(writes().map((c) => c.method)).toEqual(['post'])
    expect(result.current.offerDiscard).toBe(false)
  })

  it('không quyền sửa → Lưu không gửi gì', async () => {
    const { result } = await setup(form3(), { canEdit: false })
    store().updateLine('m-1|u-1', { quantity: 8 })
    await act(() => result.current.save())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
    expect(result.current.offerDiscard).toBe(true)
  })

  it('còn dòng chưa kiểm (gọi thẳng confirm) → không hỏi, không gửi, báo mức phiếu và tô dòng chưa kiểm', async () => {
    route('post', CONFIRM_URL, () => ok(form3({ status: 'CONFIRMED' })))
    const { result } = await setup()
    store().toggleCheck('m-1|u-1')
    store().toggleCheck('m-2|u-2')
    await act(() => result.current.confirm())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
    expect(result.current.error).toBe('Còn 1 dòng chưa kiểm — kiểm đủ rồi mới xác nhận nhập kho')
    expect([...result.current.flagged]).toEqual(['m-3|u-3'])
    expect(mockBack).not.toHaveBeenCalled()
  })
})

describe('useReceiveActions — luồng soạn 3 bước (compose), phiếu đã có', () => {
  it('Lưu xong → leave.toView(slug) (nav.finish của luồng); dấu kiểm giữ; không router trực tiếp', async () => {
    route('patch', FORM_URL, () =>
      ok(form3({ version: 4, items: [makeItem(1, { quantity: 8 }), makeItem(2), makeItem(3)] })),
    )
    const { result } = await setup(form3(), { compose: true, checklist: false })
    store().toggleCheck('m-2|u-2')
    store().updateLine('m-1|u-1', { quantity: 8 }, { check: false })
    await act(() => result.current.save())
    expect(callsTo('patch', FORM_URL)).toHaveLength(1)
    expect(leave.toView).toHaveBeenCalledWith('pn-1')
    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(store().draft!.lines.map((l) => l.checked)).toEqual([false, true, false])
  })

  it('Lưu (bước 3 — chính là bước xác nhận) → KHÔNG hỏi lại; PATCH, về màn xem', async () => {
    route('patch', FORM_URL, () => ok(form3({ version: 4 })))
    const { result } = await setup(form3(), { compose: true, checklist: false })
    store().updateLine('m-1|u-1', { note: 'x' }, { check: false })
    await act(() => result.current.save())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(callsTo('patch', FORM_URL)).toHaveLength(1)
    expect(leave.toView).toHaveBeenCalledWith('pn-1')
  })

  it('dòng số 0 là "chưa nhập" → không hỏi, không PATCH, báo qua useFormNotice (không state riêng)', async () => {
    const { result } = await setup(form3(), { compose: true, checklist: false })
    store().updateLine('m-2|u-2', { quantity: 0 }, { check: false })
    await act(() => result.current.save())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
    expect(formNotice()).toMatchObject({
      kind: 'import',
      formSlug: 'pn-1',
      message: 'Chưa nhập số lượng ở 1 dòng',
    })
    expect(result.current.error).toBeNull()
    expect(leave.toView).not.toHaveBeenCalled()
  })

  it('lỗi mạng → useFormNotice của phiếu, ở lại; lần bấm sau bỏ thông báo cũ khi thật sự gửi', async () => {
    route('patch', FORM_URL, () => 'network')
    const { result } = await setup(form3(), { compose: true, checklist: false })
    store().updateLine('m-1|u-1', { quantity: 9 }, { check: false })
    await act(() => result.current.save())
    expect(formNotice()?.message).toBe('Không kết nối được máy chủ')
    expect(leave.toView).not.toHaveBeenCalled()
    route('patch', FORM_URL, () => ok(form3({ version: 4 })))
    await act(() => result.current.save())
    expect(formNotice()).toBeNull()
    expect(leave.toView).toHaveBeenCalledWith('pn-1')
  })

  it('đổi mã trùng phiếu khác (PATCH 101304) → codeError + leave.toInfo (lỗi dưới ô Mã ở bước 1), không báo mức phiếu', async () => {
    route('patch', FORM_URL, () => failure(409, 101304))
    const { result } = await setup(form3(), { compose: true, checklist: false })
    await act(async () => store().setHeader({ code: 'PN-TRUNG' }))
    await act(() => result.current.save())
    expect(leave.toInfo).toHaveBeenCalledTimes(1)
    expect(leave.toView).not.toHaveBeenCalled()
    expect(result.current.codeError).toBe('Mã phiếu đã tồn tại')
    expect(formNotice()).toBeNull()
    expect(store().draft!.header.code).toBe('PN-TRUNG')
    await act(async () => store().setHeader({ code: 'PN-KHAC' }))
    expect(result.current.codeError).toBeNull()
  })

  it('codeError dùng chung mọi bước (store cấp module): hook của màn khác cùng phiếu cũng thấy', async () => {
    route('patch', FORM_URL, () => failure(409, 101305))
    const { result } = await setup(form3(), { compose: true, checklist: false })
    await act(async () => store().setHeader({ code: 'PN-TRUNG' }))
    await act(() => result.current.save())
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const other = await renderHook(
      () =>
        useReceiveActions({
          warehouseSlug: WH,
          form: form3(),
          canEdit: true,
          checklist: false,
          compose: true,
          leave,
        }),
      { wrapper },
    )
    expect(other.result.current.codeError).toBe(
      'Mã phiếu đã dùng cho một phiếu đã xoá — chọn mã khác',
    )
  })

  it('phiếu không còn Nháp (PATCH 409, GET CONFIRMED) → hộp thoại, bỏ bản nháp, leave.toView (không back())', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    route('patch', FORM_URL, () => failure(409, 100800))
    route('get', FORM_URL, () => ok(form3({ version: 5, status: 'CONFIRMED' })))
    const { result } = await setup(form3(), { compose: true, checklist: false })
    store().updateLine('m-1|u-1', { quantity: 9 }, { check: false })
    await act(() => result.current.save())
    expect(alert).toHaveBeenCalledTimes(1)
    expect(leave.toView).toHaveBeenCalledWith('pn-1')
    expect(mockBack).not.toHaveBeenCalled()
    expect(store().draft).toBeNull()
    alert.mockRestore()
  })
})

describe('useReceiveActions — checklist (không compose) giữ nguyên', () => {
  it('checklist save still confirms and stays', async () => {
    route('patch', FORM_URL, () => ok(form3({ version: 4 })))
    const { result } = await setup()
    store().updateLine('m-1|u-1', { quantity: 9 })
    await act(() => result.current.save())
    expect(confirmMock()).toHaveBeenCalledTimes(1)
    expect(callsTo('patch', FORM_URL)).toHaveLength(1)
    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(formNotice()).toBeNull()
  })

  it('checklist: lỗi vẫn là state của hook (error / flagged), KHÔNG vào useFormNotice', async () => {
    const { result } = await setup()
    store().updateLine('m-1|u-1', { quantity: 8, expiryDate: '2026-01-01' })
    await act(() => result.current.save())
    expect(result.current.error).toBe('Hạn dùng trước ngày phiếu ở 1 dòng')
    expect([...result.current.flagged]).toEqual(['m-1|u-1'])
    expect(formNotice()).toBeNull()
  })

  it('checklist: Lưu mà mã phiếu trùng (PATCH 101304) → báo mức phiếu (không nuốt lỗi), ở lại, bản nháp giữ', async () => {
    route('patch', FORM_URL, () => failure(409, 101304))
    const { result } = await setup()
    await act(async () => store().setHeader({ code: 'PN-TRUNG' }))
    await act(() => result.current.save())
    expect(result.current.error).toBe('Mã phiếu đã tồn tại')
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1)
    expect(mockBack).not.toHaveBeenCalled()
    expect(formNotice()).toBeNull()
    expect(store().draft!.header.code).toBe('PN-TRUNG')
  })

  it('checklist: Xác nhận mà mã phiếu trùng (PATCH 101305) → báo mức phiếu, không POST confirm', async () => {
    route('patch', FORM_URL, () => failure(409, 101305))
    const { result } = await setup()
    for (const k of ['m-1|u-1', 'm-2|u-2', 'm-3|u-3']) store().toggleCheck(k)
    await act(async () => store().setHeader({ code: 'PN-TRUNG' }))
    await act(() => result.current.confirm())
    expect(result.current.error).toBe('Mã phiếu đã dùng cho một phiếu đã xoá — chọn mã khác')
    expect(callsTo('post', CONFIRM_URL)).toHaveLength(0)
    expect(mockBack).not.toHaveBeenCalled()
  })
})

describe('useReceiveActions — tóm tắt dài', () => {
  it('200 dòng lệch → liệt kê 8 dòng rồi "… và n dòng khác"; dòng thêm trên máy ghi "mới"', async () => {
    const items = Array.from({ length: 200 }, (_, i) => makeItem(i + 1))
    const form = makeForm(items, { warehouseSlug: WH })
    route('patch', FORM_URL, () => ok(form))
    const { result } = await setup(form)
    for (let n = 1; n <= 199; n++) store().updateLine(`m-${n}|u-${n}`, { quantity: 12.345678 })
    store().updateLine('m-200|u-200', { quantity: 0 })
    store().addLine({
      ...store().draft!.lines[0]!,
      key: 'm-x|u-x',
      materialSlug: 'm-x',
      unitSlug: 'u-x',
      materialName: 'Sơn',
      unitName: 'thùng',
      base: null,
      quantity: 5,
    })
    await act(() => result.current.save())
    const lines = nbsp(lastDialog().message).split('\n')
    expect(lines[0]).toBe('Vật tư 1 10 → 12,345678 bao')
    expect(lines).toContain('… và 192 dòng khác')
    expect(lines.length).toBeLessThanOrEqual(13)
    expect(lines).toContain('Bỏ khỏi phiếu: Vật tư 200')
  })

  it('dòng thêm trên máy → "<tên> mới: 5 thùng"', async () => {
    route('patch', FORM_URL, () => ok(form3()))
    const { result } = await setup()
    store().addLine({
      ...store().draft!.lines[0]!,
      key: 'm-x|u-x',
      materialSlug: 'm-x',
      unitSlug: 'u-x',
      materialName: 'Sơn',
      unitName: 'thùng',
      base: null,
      quantity: 5,
      checked: true,
    })
    await act(() => result.current.save())
    expect(nbsp(lastDialog().message).split('\n')).toEqual([
      'Giữ nguyên số trên phiếu: 3 dòng',
      'Sơn mới: 5 thùng',
      'Tổng tiền mới 35.000 đ',
      'Số thực nhận sẽ ghi đè số trên phiếu.',
    ])
  })
})

describe('useReceiveActions — tóm tắt: sửa ở màn soạn (đơn vị, giá, xoá dòng, đầu phiếu)', () => {
  it('đổi đơn vị → "<tên> 10 bao → 1 thùng" (mỗi bên đơn vị của nó) + cảnh báo ghi đè', async () => {
    route('patch', FORM_URL, () => ok(form3()))
    const { result } = await setup(form3(), { checklist: false })
    store().updateLine(
      'm-1|u-1',
      { unitSlug: 'u-x', unitName: 'thùng', quantity: 1 },
      { check: false },
    )
    await act(() => result.current.save())
    expect(nbsp(lastDialog().message).split('\n')).toEqual([
      'Giữ nguyên số trên phiếu: 2 dòng',
      'Vật tư 1 10 bao → 1 thùng',
      'Tổng tiền mới 21.000 đ',
      'Số thực nhận sẽ ghi đè số trên phiếu.',
    ])
  })

  it('chỉ đổi giá → "<tên>: đơn giá cũ → mới", không tính "giữ nguyên"', async () => {
    route('patch', FORM_URL, () => ok(form3()))
    const { result } = await setup(form3(), { checklist: false })
    store().updateLine('m-2|u-2', { unitPrice: 1200 }, { check: false })
    await act(() => result.current.save())
    expect(nbsp(lastDialog().message).split('\n')).toEqual([
      'Giữ nguyên số trên phiếu: 2 dòng',
      'Vật tư 2: đơn giá 1.000 đ → 1.200 đ',
      'Tổng tiền mới 32.000 đ',
    ])
  })

  it('xoá dòng server → "Bỏ khỏi phiếu: …" + cảnh báo ghi đè', async () => {
    route('patch', FORM_URL, () => ok(form3()))
    const { result } = await setup(form3(), { checklist: false })
    store().removeLine('m-2|u-2')
    await act(() => result.current.save())
    expect(nbsp(lastDialog().message).split('\n')).toEqual([
      'Giữ nguyên số trên phiếu: 2 dòng',
      'Bỏ khỏi phiếu: Vật tư 2',
      'Tổng tiền mới 20.000 đ',
      'Số thực nhận sẽ ghi đè số trên phiếu.',
    ])
  })

  it('chỉ sửa đầu phiếu → "Đổi đầu phiếu: <nhãn ô>", không cảnh báo ghi đè', async () => {
    route('patch', FORM_URL, () => ok(form3()))
    const { result } = await setup(form3(), { checklist: false })
    store().setHeader({ invoiceCode: 'HD-2', note: 'giao trễ' })
    await act(() => result.current.save())
    expect(nbsp(lastDialog().message).split('\n')).toEqual([
      'Đổi đầu phiếu: Số hoá đơn, Ghi chú',
      'Giữ nguyên số trên phiếu: 3 dòng',
      'Tổng tiền mới 30.000 đ',
    ])
  })

  it('MANAGER: sửa ở màn soạn rồi Lưu ở checklist → hộp hỏi cũng nêu đúng', async () => {
    route('patch', FORM_URL, () => ok(form3()))
    const { result } = await setup()
    store().updateLine(
      'm-1|u-1',
      { unitSlug: 'u-x', unitName: 'thùng', quantity: 1 },
      { check: false },
    )
    store().removeLine('m-3|u-3')
    await act(() => result.current.save())
    expect(nbsp(lastDialog().message).split('\n')).toEqual([
      'Giữ nguyên số trên phiếu: 1 dòng',
      'Vật tư 1 10 bao → 1 thùng',
      'Bỏ khỏi phiếu: Vật tư 3',
      'Tổng tiền mới 11.000 đ',
      'Số thực nhận sẽ ghi đè số trên phiếu.',
    ])
  })

  it('200 dòng, xoá 12 dòng → tên gộp "… và n dòng khác"', async () => {
    const items = Array.from({ length: 200 }, (_, i) => makeItem(i + 1))
    const form = makeForm(items, { warehouseSlug: WH })
    route('patch', FORM_URL, () => ok(form))
    const { result } = await setup(form, { checklist: false })
    for (let n = 1; n <= 12; n++) store().removeLine(`m-${n}|u-${n}`)
    await act(() => result.current.save())
    const lines = nbsp(lastDialog().message).split('\n')
    expect(lines).toContain(
      `Bỏ khỏi phiếu: ${Array.from({ length: 8 }, (_, i) => `Vật tư ${i + 1}`).join(', ')} … và 4 dòng khác`,
    )
    expect(lines.length).toBe(4)
  })
})

describe("useReceiveActions — phiếu mới ('new')", () => {
  const CREATE_URL = '/warehouses/wh-a/import-forms'
  const NEW_KEY = draftStorageKey('u', WH, 'new')
  const newCtx = { userSlug: 'u', warehouseSlug: WH, formSlug: 'new' }

  /** Bản nháp phiếu mới: 2 dòng thêm trên máy (đã kiểm, base null). */
  async function setupNew(
    lines = [
      makeLine(1, { base: null, checked: true, quantity: 5, unitPrice: 0, supplierSlug: 's1' }),
      makeLine(2, { base: null, checked: true, quantity: 2.5, unitPrice: 1000 }),
    ],
  ) {
    await store().load(newCtx, null)
    const d = newDraft({
      code: 'PN-MOI',
      invoiceCode: 'HD-9',
      date: '2026-11-04',
      purchaseOrder: null,
      note: null,
      supplierSlug: 's1',
    })
    store().replace({ ...d, lines })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return renderHook(
      () =>
        useReceiveActions({
          warehouseSlug: WH,
          form: undefined,
          isNew: true,
          canEdit: true,
          compose: true,
          leave,
        }),
      { wrapper },
    )
  }

  const created = () =>
    makeForm(
      [
        makeItem(1, { quantity: 5, unitPrice: 0, amount: 0, supplierSlug: 's1' }),
        makeItem(2, { lineNo: 2, quantity: 2.5, amount: 2500 }),
      ],
      { slug: 'pn-9', code: 'PN-MOI', invoiceCode: 'HD-9', version: 1, warehouseSlug: WH },
    )

  it('Lưu (bước 3) → KHÔNG hỏi lại, POST đủ header + items (không version)', async () => {
    let sent: unknown
    route('post', CREATE_URL, (config) => {
      sent = body(config)
      return ok(created())
    })
    const { result } = await setupNew()
    await act(() => result.current.save())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(sent).toEqual({
      code: 'PN-MOI',
      invoiceCode: 'HD-9',
      date: '2026-11-04',
      items: [
        {
          materialSlug: 'm-1',
          unitSlug: 'u-1',
          quantity: 5,
          unitPrice: 0,
          expiryDate: null,
          supplierSlug: 's1',
        },
        { materialSlug: 'm-2', unitSlug: 'u-2', quantity: 2.5, unitPrice: 1000, expiryDate: null },
      ],
    })
    expect(callsTo('patch', `${CREATE_URL}/new`)).toHaveLength(0)
  })

  it("tạo xong: khoá 'new' chuyển sang slug, dấu kiểm giữ, cache chi tiết, leave.toList() (về danh sách)", async () => {
    route('post', CREATE_URL, () => ok(created()))
    const { result } = await setupNew()
    await act(() => result.current.save())
    expect(store().ctx).toEqual({ ...newCtx, formSlug: 'pn-9' })
    expect(store().draft).toMatchObject({ formSlug: 'pn-9', version: 1 })
    expect(store().draft!.lines.map((l) => [l.key, l.checked, l.base?.quantity])).toEqual([
      ['m-1|u-1', true, 5],
      ['m-2|u-2', true, 2.5],
    ])
    expect(client.getQueryData(['import-forms', WH, 'detail', 'pn-9'])).toEqual(created())
    expect(leave.toList).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()
    expect(store().saving).toBe(false)
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success')
    await act(async () => new Promise((r) => setTimeout(r, 350)))
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull()
    expect(
      JSON.parse((await AsyncStorage.getItem(draftStorageKey('u', WH, 'pn-9')))!),
    ).toMatchObject({
      formSlug: 'pn-9',
    })
  })

  /** Danh sách phiếu (tìm theo mã) trả `items`; ghi lại params. */
  const listed: Record<string, unknown>[] = []
  function listing(items: object[]) {
    listed.length = 0
    route('get', CREATE_URL, (config) => {
      listed.push(config.params as Record<string, unknown>)
      return ok({
        items,
        total: items.length,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        hasNext: false,
      })
    })
  }

  it('101304, không có phiếu Nháp nào của mình trùng mã → ở lại phiếu mới, codeError + leave.toInfo (về bước 1), bản nháp nguyên', async () => {
    route('post', CREATE_URL, () => failure(409, 101304))
    listing([])
    const { result } = await setupNew()
    const before = JSON.stringify(store().draft)
    await act(() => result.current.save())
    expect(listed[0]).toMatchObject({ code: 'PN-MOI', status: 'DRAFT' })
    expect(leave.toView).not.toHaveBeenCalled()
    expect(leave.toInfo).toHaveBeenCalledTimes(1)
    expect(result.current.codeError).toBe('Mã phiếu đã tồn tại')
    expect(formNotice()).toBeNull()
    expect(JSON.stringify(store().draft)).toBe(before)
    expect(store().ctx?.formSlug).toBe('new')
    expect(store().saving).toBe(false)
  })

  it('101304, phiếu trùng mã là của người khác → ở lại, codeError; đổi mã thì lỗi mất', async () => {
    route('post', CREATE_URL, () => failure(409, 101304))
    listing([{ ...created(), items: undefined, requesterSlug: 'other' }])
    const { result } = await setupNew()
    await act(() => result.current.save())
    expect(leave.toView).not.toHaveBeenCalled()
    expect(result.current.codeError).toBe('Mã phiếu đã tồn tại')
    await act(async () => store().setHeader({ code: 'PN-KHAC' }))
    expect(result.current.codeError).toBeNull()
    expect(callsTo('get', `${CREATE_URL}/pn-9`)).toHaveLength(0)
    expect(store().ctx?.formSlug).toBe('new')
  })

  it('101304 vì lần Lưu trước đã tạo phiếu (mất phản hồi) → mở lại phiếu đó: adopt, giữ dấu kiểm, leave.reopen (màn xem dưới + bước 2 trong modal), báo cho slug MỚI SAU khi điều hướng, không POST lần nữa', async () => {
    leave.reopen.mockImplementationOnce(() => void (noticeAtReopen = formNotice()))
    route('post', CREATE_URL, () => failure(409, 101304))
    listing([
      { ...created(), slug: 'pn-x', code: 'PN-MOI-2', items: undefined, requesterSlug: 'u' },
      { ...created(), items: undefined, requesterSlug: 'u' },
    ])
    route('get', `${CREATE_URL}/pn-9`, () => ok(created()))
    const { result } = await setupNew()
    await act(() => result.current.save())
    expect(callsTo('post', CREATE_URL)).toHaveLength(1)
    expect(store().ctx).toEqual({ ...newCtx, formSlug: 'pn-9' })
    expect(store().draft).toMatchObject({ formSlug: 'pn-9', version: 1 })
    expect(store().draft!.lines.map((l) => [l.key, l.checked])).toEqual([
      ['m-1|u-1', true],
      ['m-2|u-2', true],
    ])
    expect(leave.reopen).toHaveBeenCalledTimes(1)
    expect(leave.reopen).toHaveBeenCalledWith('pn-9')
    expect(leave.toView).not.toHaveBeenCalled()
    expect(leave.toList).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(noticeAtReopen).toBeNull()
    expect(formNotice()).toEqual({
      kind: 'import',
      formSlug: 'pn-9',
      message: 'Phiếu PN-MOI đã được tạo ở lần Lưu trước (bị ngắt) — đã mở lại phiếu đó.',
    })
    expect(result.current.codeError).toBeNull()
    await act(async () => new Promise((r) => setTimeout(r, 350)))
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull()
  })

  it('101304, phiếu của mình cùng mã nhưng khác số hoá đơn → không coi là lần trước, codeError', async () => {
    route('post', CREATE_URL, () => failure(409, 101304))
    listing([{ ...created(), invoiceCode: 'HD-KHAC', items: undefined, requesterSlug: 'u' }])
    const { result } = await setupNew()
    await act(() => result.current.save())
    expect(leave.toView).not.toHaveBeenCalled()
    expect(result.current.codeError).toBe('Mã phiếu đã tồn tại')
  })

  it('101305 (mã đã dùng cho phiếu đã xoá) → không tra danh sách, codeError', async () => {
    route('post', CREATE_URL, () => failure(409, 101305))
    const { result } = await setupNew()
    await act(() => result.current.save())
    expect(callsTo('get', CREATE_URL)).toHaveLength(0)
    expect(result.current.codeError).toBe('Mã phiếu đã dùng cho một phiếu đã xoá — chọn mã khác')
    // Ở lại màn: Lưu lại được (khoá đã mở).
    route('post', CREATE_URL, () => ok(created()))
    await act(async () => store().setHeader({ code: 'PN-KHAC' }))
    await act(() => result.current.save())
    expect(leave.toList).toHaveBeenCalledTimes(1)
  })

  it('101304, không tra được danh sách (mất mạng) → báo lỗi mức phiếu, ở lại, không về màn tạo', async () => {
    route('post', CREATE_URL, () => failure(409, 101304))
    route('get', CREATE_URL, () => 'network')
    const { result } = await setupNew()
    await act(() => result.current.save())
    expect(leave.toView).not.toHaveBeenCalled()
    expect(leave.toInfo).not.toHaveBeenCalled()
    expect(formNotice()).toMatchObject({
      kind: 'import',
      formSlug: 'new',
      message: 'Không kết nối được máy chủ',
    })
    expect(store().ctx?.formSlug).toBe('new')
  })

  it("tạo xong nhưng phiên đã đổi giữa chừng → vẫn bỏ khoá 'new' trên máy (không tạo trùng lần sau)", async () => {
    let release: (r: ReturnType<typeof ok>) => void = () => undefined
    route('post', CREATE_URL, () => new Promise((r) => (release = r)))
    const { result } = await setupNew()
    await act(async () => new Promise((r) => setTimeout(r, 350)))
    expect(await AsyncStorage.getItem(NEW_KEY)).not.toBeNull()
    let pending: Promise<void> = Promise.resolve()
    await act(async () => {
      pending = result.current.save()
      await new Promise((r) => setTimeout(r, 0))
    })
    await act(async () => useAuthStore.getState().endSession('expired'))
    await act(async () => {
      release(ok(created()))
      await pending
    })
    await act(async () => new Promise((r) => setTimeout(r, 350)))
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull()
    expect(leave.toView).not.toHaveBeenCalled()
  })

  it('lỗi mạng → bản nháp nguyên, báo lỗi mức phiếu, không điều hướng', async () => {
    route('post', CREATE_URL, () => 'network')
    const { result } = await setupNew()
    const before = JSON.stringify(store().draft)
    await act(() => result.current.save())
    expect(JSON.stringify(store().draft)).toBe(before)
    expect(formNotice()?.message).toBe('Không kết nối được máy chủ')
    expect(leave.toView).not.toHaveBeenCalled()
  })

  it('dòng số 0 (màn soạn: chưa nhập) → không hỏi, báo số dòng thiếu số lượng', async () => {
    const { result } = await setupNew([
      makeLine(1, { base: null, quantity: 5 }),
      makeLine(2, { base: null, quantity: 0 }),
    ])
    await act(() => result.current.save())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
    expect(formNotice()?.message).toBe('Chưa nhập số lượng ở 1 dòng')
  })

  it('phiếu mới: Lưu (bước 3) → POST không hỏi lại', async () => {
    route('post', CREATE_URL, () => ok(created()))
    const { result } = await setupNew()
    await act(() => result.current.save())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(callsTo('post', CREATE_URL)).toHaveLength(1)
    expect(leave.toList).toHaveBeenCalledTimes(1)
  })
})

describe('useReceiveActions — Xoá phiếu nháp (luồng soạn)', () => {
  const dialogs = () => confirmMock().mock.calls.map((c) => c[0])

  it('hộp xác nhận (không nháp dở → không có câu nhắc) → DELETE → invalidate danh sách → toList → bỏ bản nháp', async () => {
    route('delete', FORM_URL, () => ok('pn-1'))
    const { result } = await setup(form3(), { compose: true, checklist: false })
    const listKey = [...importFormKeys.warehouse(WH), 'list']
    const detailKey = importFormKeys.detail(WH, 'pn-1')
    client.setQueryData(listKey, { items: [] })
    client.setQueryData(detailKey, form3())
    let detailAtLeave: boolean | undefined
    leave.toList.mockImplementationOnce(() => {
      detailAtLeave = client.getQueryState(detailKey)?.isInvalidated
    })
    await act(() => result.current.remove())
    expect(lastDialog()).toMatchObject({ title: 'Xoá phiếu nháp PN-1?', destructive: true })
    expect(lastDialog().message).not.toContain('Thay đổi chưa lưu')
    expect(callsTo('delete', FORM_URL)).toHaveLength(1)
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true)
    // Chi tiết KHÔNG được làm mới: GET sau khi xoá sẽ 404 → màn lỗi.
    expect(detailAtLeave).toBe(false)
    // ...và sau khi rời màn, cache chi tiết bị bỏ (như đường xoá ở màn xem).
    expect(client.getQueryState(detailKey)).toBeUndefined()
    expect(leave.toList).toHaveBeenCalledTimes(1)
    expect(leave.toView).not.toHaveBeenCalled()
    expect(store().draft).toBeNull()
    expect(await AsyncStorage.getItem(KEY)).toBeNull()
  })

  it('dirty → hộp có câu nhắc thay đổi chưa lưu', async () => {
    route('delete', FORM_URL, () => ok('pn-1'))
    const { result } = await setup(form3(), { compose: true, checklist: false })
    store().updateLine('m-1|u-1', { note: 'x' }, { check: false })
    await act(() => result.current.remove())
    expect(lastDialog().message).toContain('Thay đổi chưa lưu trên máy cũng bị bỏ.')
  })

  it('không đồng ý → không gửi gì, không rời', async () => {
    confirmMock().mockResolvedValueOnce(false)
    const { result } = await setup(form3(), { compose: true, checklist: false })
    await act(() => result.current.remove())
    expect(writes()).toHaveLength(0)
    expect(leave.toList).not.toHaveBeenCalled()
    expect(result.current.busy).toBeNull()
  })

  it('404 (đã xoá nơi khác) → như xoá xong', async () => {
    route('delete', FORM_URL, () => failure(404, 101301))
    const { result } = await setup(form3(), { compose: true, checklist: false })
    await act(() => result.current.remove())
    expect(leave.toList).toHaveBeenCalledTimes(1)
    expect(store().draft).toBeNull()
  })

  it('101314 (không còn Nháp) → "phiếu không còn": hộp thoại, về màn xem, bỏ nháp, không toList', async () => {
    route('delete', FORM_URL, () => failure(400, 101314))
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const { result } = await setup(form3(), { compose: true, checklist: false })
    await act(() => result.current.remove())
    expect(alert).toHaveBeenCalled()
    expect(leave.toView).toHaveBeenCalledWith('pn-1')
    expect(leave.toList).not.toHaveBeenCalled()
    expect(store().draft).toBeNull()
    alert.mockRestore()
  })

  it('lỗi khác → thông báo mức phiếu, ở lại, mở khoá', async () => {
    route('delete', FORM_URL, () => failure(403, 100403))
    const { result } = await setup(form3(), { compose: true, checklist: false })
    await act(() => result.current.remove())
    expect(formNotice()).toMatchObject({ kind: 'import', formSlug: 'pn-1' })
    expect(leave.toList).not.toHaveBeenCalled()
    expect(result.current.busy).toBeNull()
    expect(store().saving).toBe(false)
    expect(store().draft).not.toBeNull()
  })

  it("busy='delete' trong lúc gửi, bấm đôi chỉ 1 request", async () => {
    let release!: () => void
    route('delete', FORM_URL, () => new Promise((r) => (release = () => r(ok('pn-1')))) as never)
    const { result } = await setup(form3(), { compose: true, checklist: false })
    let a!: Promise<void>
    let b!: Promise<void>
    await act(async () => {
      a = result.current.remove()
      b = result.current.remove()
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(result.current.busy).toBe('delete')
    expect(store().saving).toBe(true)
    await act(async () => {
      release()
      await Promise.all([a, b])
    })
    expect(callsTo('delete', FORM_URL)).toHaveLength(1)
    expect(dialogs()).toHaveLength(1)
  })

  it('store đang giữ phiếu khác → vẫn xoá, không đụng bản nháp của phiếu khác', async () => {
    route('delete', FORM_URL, () => ok('pn-1'))
    const { result } = await setup(form3(), { compose: true, checklist: false })
    await store().load({ ...ctx, formSlug: 'pn-2' }, form3({ slug: 'pn-2', code: 'PN-2' }))
    await act(() => result.current.remove())
    expect(leave.toList).toHaveBeenCalledTimes(1)
    expect(store().draft?.formSlug).toBe('pn-2')
  })
})

describe('useReceiveActions — chứng từ đang tải lên', () => {
  const UPLOAD_URL = '/warehouses/wh-a/import-forms/upload-file'
  const S3 = 'https://b.s3.amazonaws.com/import-forms/hd-1762000000000.pdf'
  let restoreFormData: () => void
  beforeEach(() => {
    resetAttachmentUploads()
    restoreFormData = installRnFormData()
  })
  afterEach(() => restoreFormData())

  it('Lưu / Lưu & xác nhận khi đang tải → không request ghi, báo "Đang tải chứng từ lên…"; tải xong thì Lưu chạy', async () => {
    let release!: () => void
    route('post', UPLOAD_URL, () => new Promise((r) => (release = () => r(ok(S3)))))
    route('patch', FORM_URL, () => ok(form3({ version: 4 })))
    const { result } = await setup(form3(), { compose: true, checklist: false })
    store().updateLine('m-1|u-1', { note: 'x' }, { check: false })
    const upload = startAttachmentUpload({
      kind: 'import',
      warehouseSlug: WH,
      formKey: 'k',
      file: { uri: 'file:///hd.pdf', name: 'hd.pdf', mimeType: 'application/pdf' },
      getFormKey: () => 'k',
      onDone: (url) => store().setHeader({ file: url }),
    })

    await act(() => result.current.save())
    await act(() => result.current.confirm())
    expect(writes().filter((c) => c.url !== UPLOAD_URL)).toHaveLength(0)
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(formNotice()).toMatchObject({
      kind: 'import',
      formSlug: 'pn-1',
      message: 'Đang tải chứng từ lên, đợi xong rồi lưu.',
    })
    expect(leave.toView).not.toHaveBeenCalled()

    release()
    await act(() => upload)
    let sent: { file?: string } | undefined
    route('patch', FORM_URL, (config) => {
      sent = body(config)
      return ok(form3({ version: 4, file: S3 }))
    })
    await act(() => result.current.save())
    expect(callsTo('patch', FORM_URL)).toHaveLength(1)
    expect(sent?.file).toBe(S3)
    expect(leave.toView).toHaveBeenCalledWith('pn-1')
  })
})

describe('useReceiveActions — màn duyệt (cờ RECEIVE_CHECKLIST_ENABLED tắt)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/features/receive-checklist/model/flags').__setChecklistEnabled(false)
  })

  /** Hai dòng thêm từ bộ chọn: base null, số 0, chưa kiểm. */
  function pick2() {
    for (const n of [8, 9]) {
      store().addLine({
        ...makeLine(n, { base: null, quantity: 0, checked: false }),
      })
    }
  }

  it('Xác nhận khi chưa kiểm dòng nào, có sửa: hỏi, PATCH rồi confirm với version đã lưu; câu hỏi trung tính', async () => {
    route('patch', FORM_URL, () => ok(saved()))
    route('post', CONFIRM_URL, () => ok(saved(5)))
    const { result } = await setup(form3(), { checklist: false })
    store().updateLine('m-1|u-1', { quantity: 8 }, { check: false })
    await act(() => result.current.confirm())
    expect(writes().map((c) => `${c.method} ${c.url}`)).toEqual([
      `patch ${FORM_URL}`,
      `post ${CONFIRM_URL}`,
    ])
    const msg = nbsp(lastDialog().message)
    expect(msg).toContain('Tồn kho sẽ được cộng ngay')
    expect(msg).not.toMatch(/thực nhận|Giữ nguyên số trên phiếu/)
    expect(msg).toContain('Giữ nguyên: 2 dòng')
  })

  it('confirm với version cũ (409) → tải lại, báo, không gửi lại', async () => {
    route('post', CONFIRM_URL, () => failure(409, 100800))
    route('get', FORM_URL, () => ok(form3({ version: 7 })))
    const { result } = await setup(form3(), { checklist: false })
    await act(() => result.current.confirm())
    expect(calls.map((c) => c.method)).toEqual(['post', 'get'])
    expect(result.current.error).toContain('xem lại các dòng đổi trên web')
    expect(store().draft!.version).toBe(7)
  })

  it('chọn 2 vật tư, để số 0, Xác nhận → chặn: không hỏi, không PATCH / confirm, báo thiếu số và tô 2 dòng', async () => {
    const { result } = await setup(form3(), { checklist: false })
    pick2()
    await act(() => result.current.confirm())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
    expect(result.current.error).toBe('Chưa nhập số lượng ở 2 dòng')
    expect([...result.current.flagged].sort()).toEqual(['m-8|u-8', 'm-9|u-9'])
  })

  it('Lưu cũng bị chặn khi dòng thêm còn số 0', async () => {
    const { result } = await setup(form3(), { checklist: false })
    pick2()
    await act(() => result.current.save())
    expect(writes()).toHaveLength(0)
    expect(result.current.error).toBe('Chưa nhập số lượng ở 2 dòng')
  })

  it('nhập số cho 2 dòng → Xác nhận chạy tiếp (PATCH rồi confirm)', async () => {
    route('patch', FORM_URL, () => ok(form3({ version: 4 })))
    route('post', CONFIRM_URL, () => ok(form3({ version: 5, status: 'CONFIRMED' })))
    const { result } = await setup(form3(), { checklist: false })
    pick2()
    store().updateLine('m-8|u-8', { quantity: 3 }, { check: false })
    store().updateLine('m-9|u-9', { quantity: 4 }, { check: false })
    await act(() => result.current.confirm())
    expect(writes().map((c) => c.method)).toEqual(['patch', 'post'])
  })

  it('dòng server đặt 0 chủ ý vẫn "Bỏ khỏi phiếu" (không bị chặn)', async () => {
    route('patch', FORM_URL, () => ok(saved()))
    route('post', CONFIRM_URL, () => ok(saved(5)))
    const { result } = await setup(form3(), { checklist: false })
    store().updateLine('m-2|u-2', { quantity: 0 }, { check: false })
    await act(() => result.current.confirm())
    expect(nbsp(lastDialog().message)).toContain('Bỏ khỏi phiếu: Vật tư 2')
    expect(writes().map((c) => c.method)).toEqual(['patch', 'post'])
  })
})
