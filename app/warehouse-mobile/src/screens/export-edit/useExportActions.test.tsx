// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Alert } from 'react-native'

import { exportFormAbilities, type ExportForm } from '@/entities/export-form'
import { item as stockItem } from '@/entities/inventory/model/fixtures'
import {
  exportDraftStorageKey,
  stopExportDraftPersistence,
  useExportDraft,
  type DraftContext,
} from '@/features/export-draft'
import { resetAttachmentUploads, startAttachmentUpload } from '@/features/form-attachment'
import { installRnFormData } from '@/shared/api/testing/rn-form-data'
import { makeForm, makeItem, makeLine } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { confirmAction } from '@/shared/lib/native-confirm'
import { kv } from '@/shared/storage/kv'

import { useExportActions } from './useExportActions'
import { useExportStepNotices } from './useExportStepNotices'

jest.mock('@/shared/lib/native-confirm', () => ({ confirmAction: jest.fn() }))

/** Điều hướng sau ghi do màn truyền (`nav` của luồng 3 bước) — ở đây chỉ ghi lại lời gọi. */
const leave = {
  toView: jest.fn(),
  toList: jest.fn(),
  toItems: jest.fn(),
  toInfo: jest.fn(),
  reopen: jest.fn(),
}
/** Thông báo mức phiếu lúc `leave.reopen` được gọi (phải hiện SAU khi điều hướng). */
let noticeAtReopen: unknown = 'chưa gọi'

const WH = 'wh-a'
const LIST_URL = `/warehouses/${WH}/export-forms`
const FORM_URL = `${LIST_URL}/px-1`
const SUBMIT_URL = `${FORM_URL}/submit`
const STOCK_URL = `/warehouses/${WH}/materials`
const BATCH_URL = `/warehouses/${WH}/material-batches`
const ctx: DraftContext = { userSlug: 'u', warehouseSlug: WH, formSlug: 'px-1' }
const newCtx: DraftContext = { ...ctx, formSlug: 'new' }
const KEY = exportDraftStorageKey('u', WH, 'px-1')
const NEW_KEY = exportDraftStorageKey('u', WH, 'new')

const ALL = [
  'EXPORT_FORM_READ',
  'EXPORT_FORM_CREATE',
  'EXPORT_FORM_UPDATE_DRAFT',
  'EXPORT_FORM_DELETE_DRAFT',
]
const access = (scope: string[] = ALL) => ({
  can: (c: string) => scope.includes(c),
  userSlug: 'u',
})

/** Phiếu 2 dòng: dòng 1 tự động 10 hộp × 1.000 đ, dòng 2 chọn lô b-2, 10 hộp × 1.000 đ. */
const form2 = (over: Partial<ExportForm> = {}) =>
  makeForm([makeItem(1), makeItem(2, { batchSlug: 'b-2', batchExpiryDate: '2027-03-12' })], {
    warehouseSlug: WH,
    ...over,
  })

let client: QueryClient
const store = () => useExportDraft.getState()
const writes = () => calls.filter((c) => c.method !== 'get')
const confirmMock = () => jest.mocked(confirmAction)
const lastDialog = () => confirmMock().mock.calls.at(-1)![0]
const body = (config: { data?: unknown }) => JSON.parse(String(config.data))
const page = (items: unknown[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })

async function setup(form: ExportForm | null = form2(), scope: string[] = ALL) {
  const c = form ? ctx : newCtx
  await store().load(c, form)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(
    (props: { form: ExportForm | undefined }) => {
      const actions = useExportActions({
        ctx: c,
        form: props.form,
        abilities: exportFormAbilities(access(scope), props.form ?? 'new'),
        leave,
      })
      // Thông báo mức phiếu không còn là state của hook: đọc như màn bước đọc (store dùng chung).
      const notices = useExportStepNotices(c.formSlug)
      return {
        ...actions,
        notice: notices.formNotice,
        shortages: notices.shortages,
        dismissNotice: notices.dismiss,
      }
    },
    { wrapper, initialProps: { form: form ?? undefined } },
  )
}

/** Bản nháp phiếu mới: mã PX-MOI, một dòng 5 hộp × 2.000 đ. */
async function seedNew() {
  await store().load(newCtx, null)
  store().setHeader({ code: 'PX-MOI', purchaseOrder: 'PO-9', receiver: 'Tổ hàn A' })
  store().addLine(makeLine(1, { base: null, quantity: 5, unitPrice: 2000 }))
}

const created = (over: Partial<ExportForm> = {}) =>
  makeForm([makeItem(1, { quantity: 5, unitPrice: 2000, amount: 10000 })], {
    slug: 'px-9',
    code: 'PX-MOI',
    version: 1,
    warehouseSlug: WH,
    ...over,
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
  useFormNotice.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  confirmMock().mockResolvedValue(true)
})

afterEach(() => {
  stopExportDraftPersistence()
  store().reset()
  client.clear()
})

describe('useExportActions — Lưu', () => {
  it('saving a new form goes back to the list', async () => {
    let sent: unknown
    route('post', LIST_URL, (config) => {
      sent = body(config)
      return ok(created())
    })
    const { result } = await setup(null)
    await act(async () => seedNew())
    await act(() => result.current.save())
    expect(lastDialog().title).toBe('Tạo phiếu nháp PX-MOI?')
    expect(sent).toEqual({
      code: 'PX-MOI',
      type: 'PRODUCTION',
      purchaseOrder: 'PO-9',
      receiver: 'Tổ hàn A',
      items: [{ materialSlug: 'm-1', unitSlug: 'u-1', quantity: 5, unitPrice: 2000 }],
    })
    expect(store().ctx?.formSlug).toBe('px-9')
    expect(store().draft?.version).toBe(1)
    expect(await kv.get(NEW_KEY)).toBeNull()
    expect(client.getQueryData(['export-forms', WH, 'detail', 'px-9'])).toEqual(created())
    // Hỏi lại → POST → về DANH SÁCH (`nav.finishToList` bỏ mọi bước của 'new') — chốt 2026-11-08.
    expect(leave.toList).toHaveBeenCalledTimes(1)
    expect(leave.toView).not.toHaveBeenCalled()
    expect(result.current.notice).toBeNull()
  })

  it('phiếu mới ở kho đã tắt (101417) → câu kho ngừng hoạt động, ở lại, bản nháp giữ nguyên', async () => {
    route('post', LIST_URL, () => failure(400, 101417))
    const { result } = await setup(null)
    await act(async () => seedNew())
    await act(() => result.current.save())
    expect(result.current.notice).toBe('Kho đang ngừng hoạt động — không tạo được phiếu.')
    expect(store().ctx?.formSlug).toBe('new')
    expect(store().draft?.lines).toHaveLength(1)
    expect(leave.toView).not.toHaveBeenCalled()
    expect(result.current.busy).toBeNull()
  })

  it('code taken stays and exposes codeError', async () => {
    route('post', LIST_URL, () => failure(409, 101404))
    route('get', LIST_URL, () => page([]))
    const { result } = await setup(null)
    await act(async () => seedNew())
    await act(() => result.current.save())
    // Trùng mã của phiếu khác: ở lại phiếu mới, về bước 1 — báo tại ô Mã phiếu (không phải thông báo
    // mức phiếu).
    expect(leave.toView).not.toHaveBeenCalled()
    expect(leave.toInfo).toHaveBeenCalledTimes(1)
    expect(result.current.codeError).toBe('Mã phiếu đã tồn tại.')
    expect(result.current.notice).toBeNull()
    expect(result.current.busy).toBeNull()
    expect(store().ctx?.formSlug).toBe('new')
    expect(store().draft?.lines).toHaveLength(1)
    // Sửa mã → hết báo.
    await act(async () => store().setHeader({ code: 'PX-KHAC' }))
    expect(result.current.codeError).toBeNull()
  })

  it('mã đang giữ bởi phiếu đã xoá (101405) → codeError riêng; lần Lưu sau chạy được (không khoá)', async () => {
    route('post', LIST_URL, () => failure(409, 101405))
    const { result } = await setup(null)
    await act(async () => seedNew())
    await act(() => result.current.save())
    expect(result.current.codeError).toBe('Mã phiếu đang được giữ bởi một phiếu đã xoá.')
    expect(callsTo('get', LIST_URL)).toHaveLength(0)
    route('post', LIST_URL, () => ok(created()))
    await act(async () => store().setHeader({ code: 'PX-MOI-2' }))
    await act(() => result.current.save())
    expect(callsTo('post', LIST_URL)).toHaveLength(2)
    expect(result.current.codeError).toBeNull()
  })

  it('Gửi duyệt phiếu mới mà trùng mã với phiếu Nháp của CHÍNH mình (lần trước mất phản hồi) → mở lại phiếu đó, KHÔNG gửi duyệt; thông báo theo sang màn mới', async () => {
    route('post', LIST_URL, () => failure(409, 101404))
    const own = created({ requesterSlug: 'u', purchaseOrder: 'PO-9', receiver: 'Tổ hàn A' })
    route('get', LIST_URL, () => page([own]))
    route('get', `${LIST_URL}/px-9`, () => ok(own))
    const { result } = await setup(null)
    await act(async () => seedNew())
    leave.reopen.mockImplementationOnce(
      () => void (noticeAtReopen = useFormNotice.getState().notice),
    )
    await act(() => result.current.submit())
    expect(callsTo('post', `${LIST_URL}/px-9/submit`)).toHaveLength(0)
    expect(store().ctx?.formSlug).toBe('px-9')
    // Màn xem px-9 lên đỉnh Stack tab, modal giữ mở ở bước 2 của px-9 (`nav.reopen`).
    expect(leave.reopen).toHaveBeenCalledTimes(1)
    expect(leave.reopen).toHaveBeenCalledWith('px-9')
    expect(leave.toView).not.toHaveBeenCalled()
    expect(noticeAtReopen).toBeNull()
    // Thông báo thuộc phiếu MỚI (px-9) — các bước của 'new' rời đi không xoá nó.
    expect(useFormNotice.getState().notice).toEqual({
      kind: 'export',
      formSlug: 'px-9',
      message: 'Phiếu PX-MOI đã được tạo ở lần Lưu trước (bị ngắt) — đã mở lại phiếu đó.',
    })
  })

  it('Lưu phiếu có mà lô đã chọn hết hàng (101432) → tải tồn + lô còn hàng, tô dòng "Lô chỉ còn 0"', async () => {
    route('patch', FORM_URL, () => failure(400, 101432))
    route('get', STOCK_URL, () =>
      page([
        stockItem({ materialSlug: 'm-1', availableQuantity: 100 }),
        stockItem({ materialSlug: 'm-2', availableQuantity: 100 }),
      ]),
    )
    route('get', BATCH_URL, (config) =>
      page(
        (config.params as { materialSlug: string }).materialSlug === 'm-1'
          ? [
              {
                slug: 'b-1',
                materialSlug: 'm-1',
                entryDate: '2026-10-01',
                expiryDate: null,
                availableQuantity: 50,
              },
            ]
          : [],
      ),
    )
    const { result } = await setup()
    await act(() => result.current.save())
    expect(result.current.shortages).toEqual(
      new Map([['m-2|u-2|b-2', { kind: 'batch', available: 0 }]]),
    )
    // Đang Lưu (không phải gửi duyệt) → câu "lưu lại", không "gửi lại".
    expect(result.current.notice).toBe(
      'Không đủ hàng cho 1 dòng — giảm số lượng hoặc đổi lô rồi lưu lại.',
    )
    // Dòng thiếu nằm ở bước 2 → về bước 2 (thẻ thiếu được tô ở đó).
    expect(leave.toItems).toHaveBeenCalledTimes(1)
    expect(useFormNotice.getState().notice?.shortageKeys).toEqual(['m-2|u-2|b-2'])
    // Chỉ lô còn hàng.
    expect(callsTo('get', BATCH_URL).length).toBe(2)
  })

  it('tạo phiếu mới mà lô đã chọn hết hàng (101432) → tô dòng, ở lại màn phiếu mới', async () => {
    route('post', LIST_URL, () => failure(400, 101432))
    route('get', STOCK_URL, () =>
      page([stockItem({ materialSlug: 'm-1', availableQuantity: 100 })]),
    )
    route('get', BATCH_URL, () => page([]))
    const { result } = await setup(null)
    await act(async () => {
      await seedNew()
      store().updateLine('m-1|u-1|', { batchSlug: 'b-9' })
    })
    await act(() => result.current.save())
    expect(result.current.shortages).toEqual(
      new Map([['m-1|u-1|b-9', { kind: 'batch', available: 0 }]]),
    )
    expect(result.current.notice).toBe(
      'Không đủ hàng cho 1 dòng — giảm số lượng hoặc đổi lô rồi lưu lại.',
    )
    expect(leave.toView).not.toHaveBeenCalled()
    expect(leave.toItems).toHaveBeenCalledTimes(1)
    expect(store().ctx?.formSlug).toBe('new')
  })

  it('Gửi duyệt mà bước Lưu trước đó gặp 101432 → giữ câu "…rồi gửi lại"', async () => {
    route('patch', FORM_URL, () => failure(400, 101432))
    route('get', STOCK_URL, () =>
      page([
        stockItem({ materialSlug: 'm-1', availableQuantity: 100 }),
        stockItem({ materialSlug: 'm-2', availableQuantity: 100 }),
      ]),
    )
    route('get', BATCH_URL, () => page([]))
    const { result } = await setup()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 8 }))
    await act(() => result.current.submit())
    expect(callsTo('post', SUBMIT_URL)).toHaveLength(0)
    expect(result.current.notice).toBe(
      'Không đủ hàng cho 2 dòng — giảm số lượng hoặc đổi lô rồi gửi lại.',
    )
  })

  it('101432 mà không dò ra dòng nào → câu chung', async () => {
    route('patch', FORM_URL, () => failure(400, 101432))
    route('get', STOCK_URL, () =>
      page([
        stockItem({ materialSlug: 'm-1', availableQuantity: 100 }),
        stockItem({ materialSlug: 'm-2', availableQuantity: 100 }),
      ]),
    )
    route('get', BATCH_URL, (config) => {
      const m = (config.params as { materialSlug: string }).materialSlug
      return page([
        {
          slug: m === 'm-1' ? 'b-1' : 'b-2',
          materialSlug: m,
          entryDate: '2026-10-01',
          expiryDate: null,
          availableQuantity: 50,
        },
      ])
    })
    const { result } = await setup()
    await act(() => result.current.save())
    expect(result.current.shortages.size).toBe(0)
    expect(result.current.notice).toBe(
      'Kho không đủ hàng cho phiếu này — kiểm tra số lượng / lô đã chọn',
    )
    // Không biết dòng nào: vẫn về bước 2 (sửa số lượng / lô ở đó), không tô thẻ nào.
    expect(leave.toItems).toHaveBeenCalledTimes(1)
    expect(useFormNotice.getState().notice?.shortageKeys).toBeUndefined()
  })

  it('saving an existing form leaves to view', async () => {
    let sent: { version?: number; items?: unknown[] } = {}
    const saved = form2({ version: 4, items: [makeItem(1, { quantity: 8 }), makeItem(2)] })
    route('patch', FORM_URL, (config) => {
      sent = body(config)
      return ok(saved)
    })
    const { result } = await setup()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 8 }))
    await act(() => result.current.save())
    expect(lastDialog().title).toBe('Lưu phiếu PX-1?')
    expect(sent).toMatchObject({
      code: 'PX-1',
      purchaseOrder: 'PO-1',
      invoiceCode: 'HD-1',
      receiver: 'Bếp A',
      version: 3,
    })
    expect(sent.items).toEqual([
      { materialSlug: 'm-1', unitSlug: 'u-1', quantity: 8, unitPrice: 1000 },
      { materialSlug: 'm-2', unitSlug: 'u-2', quantity: 10, unitPrice: 1000, batchSlug: 'b-2' },
    ])
    expect(store().draft?.version).toBe(4)
    // Về màn xem (một lần).
    expect(leave.toView).toHaveBeenCalledTimes(1)
    expect(leave.toView).toHaveBeenCalledWith('px-1')
    expect(result.current.notice).toBeNull()
  })

  it('đổi mã trùng phiếu khác (PATCH 101404) → codeError + leave.toInfo (lỗi dưới ô Mã ở bước 1), không báo mức phiếu', async () => {
    route('patch', FORM_URL, () => failure(409, 101404))
    const { result } = await setup()
    await act(async () => store().setHeader({ code: 'PX-TRUNG' }))
    await act(() => result.current.save())
    expect(leave.toInfo).toHaveBeenCalledTimes(1)
    expect(leave.toView).not.toHaveBeenCalled()
    expect(result.current.codeError).toBe('Mã phiếu đã tồn tại.')
    expect(result.current.notice).toBeNull()
    expect(result.current.busy).toBeNull()
    expect(store().draft?.header.code).toBe('PX-TRUNG')
    // Không tra phiếu "của chính mình" như POST: phiếu đã có, không có phiếu thứ hai để mở lại.
    expect(callsTo('get', LIST_URL)).toHaveLength(0)
    await act(async () => store().setHeader({ code: 'PX-KHAC' }))
    expect(result.current.codeError).toBeNull()
  })

  it('Gửi duyệt phiếu có mà mã đã sửa đang giữ bởi phiếu đã xoá (PATCH 101405) → codeError + leave.toInfo, không gửi duyệt', async () => {
    route('patch', FORM_URL, () => failure(409, 101405))
    const { result } = await setup()
    await act(async () => store().setHeader({ code: 'PX-TRUNG' }))
    await act(() => result.current.submit())
    expect(callsTo('post', SUBMIT_URL)).toHaveLength(0)
    expect(leave.toInfo).toHaveBeenCalledTimes(1)
    expect(result.current.codeError).toBe('Mã phiếu đang được giữ bởi một phiếu đã xoá.')
    expect(result.current.notice).toBeNull()
  })

  it('save still asks confirmAction', async () => {
    route('patch', FORM_URL, () => ok(form2({ version: 4 })))
    const { result } = await setup()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 8 }))
    confirmMock().mockResolvedValueOnce(false)
    await act(() => result.current.save())
    expect(confirmMock()).toHaveBeenCalledTimes(1)
    expect(lastDialog()).toMatchObject({ title: 'Lưu phiếu PX-1?', confirmLabel: 'Lưu' })
    expect(writes()).toHaveLength(0)
    expect(leave.toView).not.toHaveBeenCalled()
    await act(() => result.current.save())
    expect(confirmMock()).toHaveBeenCalledTimes(2)
    expect(callsTo('patch', FORM_URL)).toHaveLength(1)
  })

  it('409 → tải lại phiếu, gộp (giữ số đã sửa trên máy), báo; KHÔNG tự gửi lại', async () => {
    route('patch', FORM_URL, () => failure(409, 100800))
    const fresh = form2({ version: 5, receiver: 'Bếp B' })
    route('get', FORM_URL, () => ok(fresh))
    const { result } = await setup()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 8 }))
    await act(() => result.current.save())
    expect(callsTo('patch', FORM_URL)).toHaveLength(1)
    expect(store().draft?.version).toBe(5)
    expect(store().draft?.header.receiver).toBe('Bếp B')
    expect(store().draft?.lines[0]?.quantity).toBe(8)
    expect(result.current.notice).toMatch(/đã được sửa ở nơi khác/)
    expect(client.getQueryData(['export-forms', WH, 'detail', 'px-1'])).toEqual(fresh)
  })

  it('409 khi chỉ sửa đầu phiếu → giữ trường đã sửa; trường server đổi khác → lấy server + báo tên trường', async () => {
    route('patch', FORM_URL, () => failure(409, 100800))
    route('get', FORM_URL, () => ok(form2({ version: 5, type: 'SALE' })))
    const { result } = await setup()
    await act(async () => void store().setHeader({ type: 'DISPOSAL', receiver: 'Bếp C' }))
    await act(() => result.current.save())
    expect(store().draft?.header).toMatchObject({ type: 'SALE', receiver: 'Bếp C' })
    expect(result.current.notice).toBe(
      'Phiếu đã được sửa ở nơi khác — đã tải bản mới nhất và gộp với thay đổi trên máy. Xem lại các dòng rồi gửi lại. Đầu phiếu cũng đã bị đổi ở nơi khác — đã lấy theo bản mới: Loại.',
    )
  })

  it('canSave không ok (dòng chưa có đơn giá) → báo, không hỏi, không gửi', async () => {
    const { result } = await setup()
    await act(async () => void store().updateLine('m-1|u-1|', { unitPrice: null }))
    await act(() => result.current.save())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
    expect(result.current.notice).toBe('1 dòng chưa có đơn giá.')
  })

  it('huỷ hộp hỏi → không gửi gì; bấm đôi → một hộp hỏi', async () => {
    confirmMock().mockResolvedValue(false)
    const { result } = await setup()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 8 }))
    await act(async () => {
      await Promise.all([result.current.save(), result.current.save(), result.current.submit()])
    })
    expect(confirmMock()).toHaveBeenCalledTimes(1)
    expect(writes()).toHaveLength(0)
  })
})

describe('useExportActions — Gửi duyệt', () => {
  it('có thay đổi: KHÔNG hỏi (bước 3 là bước xác nhận) → PATCH rồi submit với version mới → bỏ bản nháp, về màn xem', async () => {
    const saved = form2({ version: 4 })
    route('patch', FORM_URL, () => ok(saved))
    let submitted: unknown
    route('post', SUBMIT_URL, (config) => {
      submitted = body(config)
      return ok(form2({ version: 5, status: 'PENDING' }))
    })
    const { result } = await setup()
    await act(async () => void store().updateLine('m-1|u-1|', { unitPrice: 0 }))
    await act(() => result.current.submit())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(callsTo('patch', FORM_URL)).toHaveLength(1)
    expect(submitted).toEqual({ version: 4 })
    expect(store().draft).toBeNull()
    expect(await kv.get(KEY)).toBeNull()
    expect(leave.toView).toHaveBeenCalledTimes(1)
    expect(leave.toView).toHaveBeenCalledWith('px-1')
  })

  it('submit (bước 3 — chính là bước xác nhận) → KHÔNG hỏi lại; gửi duyệt, về màn xem; thông báo cũ bỏ', async () => {
    route('post', SUBMIT_URL, () => ok(form2({ version: 4, status: 'PENDING' })))
    useFormNotice.getState().show({ kind: 'export', formSlug: 'px-1', message: 'Lỗi cũ' })
    const { result } = await setup()
    await act(() => result.current.submit())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(callsTo('post', SUBMIT_URL)).toHaveLength(1)
    expect(leave.toView).toHaveBeenCalledWith('px-1')
    // Thông báo cũ của phiếu bỏ khi thao tác bắt đầu.
    expect(useFormNotice.getState().notice).toBeNull()
  })

  it('không có thay đổi: chỉ submit với version của phiếu', async () => {
    let submitted: unknown
    route('post', SUBMIT_URL, (config) => {
      submitted = body(config)
      return ok(form2({ version: 4, status: 'PENDING' }))
    })
    const { result } = await setup()
    await act(() => result.current.submit())
    expect(callsTo('patch', FORM_URL)).toHaveLength(0)
    expect(submitted).toEqual({ version: 3 })
    expect(leave.toView).toHaveBeenCalledTimes(1)
  })

  it('phiếu mới: POST tạo rồi submit → về danh sách, không còn bản nháp new', async () => {
    route('post', LIST_URL, () => ok(created()))
    let submitted: unknown
    route('post', `${LIST_URL}/px-9/submit`, (config) => {
      submitted = body(config)
      return ok(created({ version: 2, status: 'PENDING' }))
    })
    const { result } = await setup(null)
    await act(async () => seedNew())
    await act(() => result.current.submit())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(submitted).toEqual({ version: 1 })
    expect(store().draft).toBeNull()
    expect(await kv.get(NEW_KEY)).toBeNull()
    expect(leave.toList).toHaveBeenCalledTimes(1)
  })

  it('phiếu mới: đã POST nhưng gửi duyệt thiếu hàng → về màn xem phiếu mới rồi bước 2 của nó; thông báo + dòng thiếu thuộc phiếu MỚI', async () => {
    route('post', LIST_URL, () => ok(created()))
    route('post', `${LIST_URL}/px-9/submit`, () => failure(409, 100817))
    route('get', STOCK_URL, () => page([stockItem({ materialSlug: 'm-1', availableQuantity: 2 })]))
    route('get', BATCH_URL, () => page([]))
    const { result } = await setup(null)
    await act(async () => seedNew())
    await act(() => result.current.submit())
    expect(store().ctx?.formSlug).toBe('px-9')
    expect(leave.reopen).toHaveBeenCalledTimes(1)
    expect(leave.reopen).toHaveBeenCalledWith('px-9')
    expect(leave.toView).not.toHaveBeenCalled()
    // Không về bước 2 của 'new' (phiếu đó không còn).
    expect(leave.toItems).not.toHaveBeenCalled()
    expect(useFormNotice.getState().notice).toMatchObject({
      kind: 'export',
      formSlug: 'px-9',
      message: 'Không đủ hàng cho 1 dòng — giảm số lượng hoặc đổi lô rồi gửi lại.',
      shortageKeys: ['m-1|u-1|'],
    })
    // Màn của phiếu 'new' không thấy thông báo đó.
    expect(result.current.notice).toBeNull()
  })

  it('thiếu hàng (101502): tải tồn + lô, đánh dấu dòng thiếu ("Thiếu" / "Lô chỉ còn"), báo số dòng', async () => {
    route('post', SUBMIT_URL, () => failure(409, 101502))
    route('get', STOCK_URL, () =>
      page([
        stockItem({ materialSlug: 'm-1', availableQuantity: 100 }),
        stockItem({ materialSlug: 'm-2', availableQuantity: 100 }),
      ]),
    )
    route('get', BATCH_URL, (config) => {
      const m = (config.params as { materialSlug: string }).materialSlug
      return page(
        m === 'm-1'
          ? [
              {
                slug: 'b-1',
                materialSlug: 'm-1',
                entryDate: '2026-10-01',
                expiryDate: null,
                availableQuantity: 4,
              },
            ]
          : [
              {
                slug: 'b-2',
                materialSlug: 'm-2',
                entryDate: '2026-10-05',
                expiryDate: '2027-03-12',
                availableQuantity: 6,
              },
            ],
      )
    })
    const { result } = await setup()
    await act(() => result.current.submit())
    expect(result.current.shortages).toEqual(
      new Map([
        ['m-1|u-1|', { kind: 'stock', missing: 6 }],
        ['m-2|u-2|b-2', { kind: 'batch', available: 6 }],
      ]),
    )
    expect(result.current.notice).toBe(
      'Không đủ hàng cho 2 dòng — giảm số lượng hoặc đổi lô rồi gửi lại.',
    )
    // Lô của mọi vật tư trên phiếu, chỉ lô còn hàng.
    expect(callsTo('get', BATCH_URL)).toHaveLength(2)
    expect(store().draft).not.toBeNull()
    expect(leave.toView).not.toHaveBeenCalled()
    // Thiếu hàng → về bước 2 và tô thẻ (spec §6). Chi tiết từng dòng đi kèm thông báo (`detail`).
    expect(leave.toItems).toHaveBeenCalledTimes(1)
    expect(useFormNotice.getState().notice?.detail).toBeInstanceOf(Map)
  })

  it('thiếu hàng (100817) mà không dò ra dòng nào → câu chung, không tô dòng', async () => {
    route('post', SUBMIT_URL, () => failure(409, 100817))
    route('get', STOCK_URL, () =>
      page([
        stockItem({ materialSlug: 'm-1', availableQuantity: 100 }),
        stockItem({ materialSlug: 'm-2', availableQuantity: 100 }),
      ]),
    )
    route('get', BATCH_URL, (config) =>
      page([
        {
          slug: (config.params as { materialSlug: string }).materialSlug === 'm-1' ? 'b-1' : 'b-2',
          materialSlug: 'x',
          entryDate: '2026-10-01',
          expiryDate: null,
          availableQuantity: 50,
        },
      ]),
    )
    const { result } = await setup()
    await act(() => result.current.submit())
    expect(result.current.shortages.size).toBe(0)
    expect(result.current.notice).toBe(
      'Kho không đủ hàng cho phiếu này — kiểm tra số lượng / lô đã chọn',
    )
    expect(leave.toItems).toHaveBeenCalledTimes(1)
  })

  it('thiếu hàng mà tải tồn lỗi → câu chung', async () => {
    route('post', SUBMIT_URL, () => failure(409, 100817))
    route('get', STOCK_URL, () => failure(500))
    route('get', BATCH_URL, () => page([]))
    const { result } = await setup()
    await act(() => result.current.submit())
    expect(result.current.shortages.size).toBe(0)
    expect(result.current.notice).toBe(
      'Kho không đủ hàng cho phiếu này — kiểm tra số lượng / lô đã chọn',
    )
    expect(leave.toItems).toHaveBeenCalledTimes(1)
  })

  it('dấu thiếu chỉ còn khi dòng còn y như lúc dò: sửa số lượng dòng bị tô → dấu của dòng đó mất', async () => {
    route('post', SUBMIT_URL, () => failure(409, 101502))
    route('get', STOCK_URL, () =>
      page([
        stockItem({ materialSlug: 'm-1', availableQuantity: 0 }),
        stockItem({ materialSlug: 'm-2', availableQuantity: 0 }),
      ]),
    )
    route('get', BATCH_URL, () => page([]))
    const { result } = await setup()
    await act(() => result.current.submit())
    expect([...result.current.shortages.keys()]).toEqual(['m-1|u-1|', 'm-2|u-2|b-2'])
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 3 }))
    expect([...result.current.shortages.keys()]).toEqual(['m-2|u-2|b-2'])
    // Đổi về đúng số lúc dò → dấu hiện lại (vẫn là dòng đã dò).
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 10 }))
    expect(result.current.shortages.has('m-1|u-1|')).toBe(true)
  })

  it('Gửi duyệt lỗi thiếu hàng, rồi "Lưu nháp" → "Xem lại" (huỷ hộp hỏi) → GIỮ thông báo và dấu thiếu hàng cũ', async () => {
    route('post', SUBMIT_URL, () => failure(409, 101502))
    route('get', STOCK_URL, () => page([stockItem({ materialSlug: 'm-1', availableQuantity: 0 })]))
    route('get', BATCH_URL, () => page([]))
    const { result } = await setup()
    await act(() => result.current.submit())
    const notice = result.current.notice
    const marks = [...result.current.shortages.keys()]
    expect(marks.length).toBeGreaterThan(0)
    confirmMock().mockResolvedValue(false)
    await act(() => result.current.save())
    expect(lastDialog().cancelLabel).toBe('Xem lại')
    expect(result.current.notice).toBe(notice)
    expect([...result.current.shortages.keys()]).toEqual(marks)
  })

  it('lần gửi sau bỏ dấu thiếu hàng cũ; đóng thông báo cũng bỏ', async () => {
    route('post', SUBMIT_URL, () => failure(409, 101502))
    route('get', STOCK_URL, () => page([stockItem({ materialSlug: 'm-1', availableQuantity: 0 })]))
    route('get', BATCH_URL, () => page([]))
    const { result } = await setup()
    await act(() => result.current.submit())
    expect(result.current.shortages.size).toBeGreaterThan(0)
    await act(async () => result.current.dismissNotice())
    expect(result.current.shortages.size).toBe(0)
    expect(result.current.notice).toBeNull()
  })

  it('phiếu không còn Nháp (101415) → báo, bỏ bản nháp, về màn xem', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    route('post', SUBMIT_URL, () => failure(409, 101415))
    route('get', FORM_URL, () => ok(form2({ version: 4, status: 'PENDING' })))
    const { result } = await setup()
    await act(() => result.current.submit())
    expect(alert).toHaveBeenCalledWith(
      'Phiếu đã thay đổi',
      'Phiếu không còn ở trạng thái Nháp hoặc đã bị xoá — bản nháp trên máy đã được bỏ.',
    )
    expect(store().draft).toBeNull()
    expect(leave.toView).toHaveBeenCalledTimes(1)
    expect(leave.toView).toHaveBeenCalledWith('px-1')
  })

  it('phiếu bị xoá (101401 khi tải lại) → báo, bỏ bản nháp, về màn xem', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    route('post', SUBMIT_URL, () => failure(404, 101401))
    route('get', FORM_URL, () => failure(404, 101401))
    const { result } = await setup()
    await act(() => result.current.submit())
    expect(alert).toHaveBeenCalledTimes(1)
    expect(store().draft).toBeNull()
    expect(leave.toView).toHaveBeenCalledTimes(1)
    expect(leave.toView).toHaveBeenCalledWith('px-1')
  })

  it('đã lưu xong nhưng submit lỗi khác → báo "đã lưu nhưng chưa gửi duyệt", bản nháp theo phiếu đã lưu', async () => {
    route('patch', FORM_URL, () => ok(form2({ version: 4 })))
    route('post', SUBMIT_URL, () => 'network')
    const { result } = await setup()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 8 }))
    await act(() => result.current.submit())
    expect(result.current.notice).toMatch(/^Đã lưu phiếu nhưng chưa gửi duyệt được: /)
    expect(store().draft?.version).toBe(4)
    expect(leave.toView).not.toHaveBeenCalled()
    // Không phải thiếu hàng → ở lại bước đang đứng.
    expect(leave.toItems).not.toHaveBeenCalled()
  })
})

describe('useExportActions — Xoá nháp', () => {
  it('hỏi lại (nguy hiểm) → DELETE → bỏ bản nháp, về danh sách', async () => {
    route('delete', FORM_URL, () => ok('px-1'))
    const { result } = await setup()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 8 }))
    await act(() => result.current.remove())
    expect(lastDialog()).toMatchObject({
      title: 'Xoá phiếu nháp PX-1?',
      confirmLabel: 'Xoá nháp',
      destructive: true,
    })
    expect(callsTo('delete', FORM_URL)).toHaveLength(1)
    expect(store().draft).toBeNull()
    expect(await kv.get(KEY)).toBeNull()
    expect(leave.toList).toHaveBeenCalledTimes(1)
  })

  it('không đồng ý → không xoá', async () => {
    confirmMock().mockResolvedValue(false)
    const { result } = await setup()
    await act(() => result.current.remove())
    expect(writes()).toHaveLength(0)
    expect(store().draft).not.toBeNull()
  })

  it('không có quyền xoá → không làm gì', async () => {
    const { result } = await setup(
      form2(),
      ALL.filter((c) => c !== 'EXPORT_FORM_DELETE_DRAFT'),
    )
    await act(() => result.current.remove())
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
  })

  it('lỗi mạng → báo, ở lại, bản nháp giữ nguyên', async () => {
    route('delete', FORM_URL, () => 'network')
    const { result } = await setup()
    await act(() => result.current.remove())
    expect(result.current.notice).not.toBeNull()
    expect(store().draft).not.toBeNull()
    expect(leave.toList).not.toHaveBeenCalled()
  })
})

describe('useExportActions — chứng từ đang tải lên', () => {
  const UPLOAD_URL = `/warehouses/${WH}/export-forms/upload-file`
  const S3 = 'https://b.s3.amazonaws.com/export-forms/pg-1762000000000.jpg'
  let restoreFormData: () => void
  beforeEach(() => {
    resetAttachmentUploads()
    restoreFormData = installRnFormData()
  })
  afterEach(() => restoreFormData())

  it('Lưu nháp / Gửi duyệt khi đang tải → không request ghi, báo; tải xong thì Lưu chạy, gửi kèm file', async () => {
    let release!: () => void
    route('post', UPLOAD_URL, () => new Promise((r) => (release = () => r(ok(S3)))))
    const { result } = await setup()
    await act(async () => void store().updateLine('m-1|u-1|', { quantity: 8 }))
    const upload = startAttachmentUpload({
      kind: 'export',
      warehouseSlug: WH,
      formKey: 'k',
      file: { uri: 'file:///pg.jpg', name: 'pg.jpg', mimeType: 'image/jpeg' },
      getFormKey: () => 'k',
      onDone: (url) => store().setHeader({ file: url }),
    })

    await act(() => result.current.save())
    await act(() => result.current.submit())
    expect(writes().filter((c) => c.url !== UPLOAD_URL)).toHaveLength(0)
    expect(confirmMock()).not.toHaveBeenCalled()
    expect(result.current.notice).toBe('Đang tải chứng từ lên, đợi xong rồi lưu.')
    expect(leave.toView).not.toHaveBeenCalled()

    release()
    await act(() => upload)
    let sent: { file?: string } = {}
    route('patch', FORM_URL, (config) => {
      sent = body(config)
      return ok(form2({ version: 4, file: S3 }))
    })
    await act(() => result.current.save())
    expect(callsTo('patch', FORM_URL)).toHaveLength(1)
    expect(sent.file).toBe(S3)
    expect(leave.toView).toHaveBeenCalledWith('px-1')
  })
})
