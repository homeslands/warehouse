import { act, renderHook } from '@testing-library/react-native'

import { useFormNotice } from './form-notice.store'
import { useStepNoticeLifetime, wizardVisit } from './wizard-screen'

const show = (kind: 'import' | 'export', formSlug: string) =>
  useFormNotice.getState().show({ kind, formSlug, message: 'm' })

beforeEach(() => {
  jest.useFakeTimers()
  useFormNotice.getState().reset()
})

afterEach(() => jest.useRealTimers())

describe('useStepNoticeLifetime', () => {
  it('còn màn bước nào của phiếu → giữ thông báo; màn cuối tháo ra → bỏ (sau một nhịp)', async () => {
    show('export', 'px-1')
    const a = await renderHook(() => useStepNoticeLifetime('export', 'px-1'))
    const b = await renderHook(() => useStepNoticeLifetime('export', 'px-1'))
    await a.unmount()
    await act(async () => jest.runAllTimers())
    expect(useFormNotice.getState().notice).not.toBeNull()
    await b.unmount()
    expect(useFormNotice.getState().notice).not.toBeNull()
    await act(async () => jest.runAllTimers())
    expect(useFormNotice.getState().notice).toBeNull()
  })

  it('đổi bước (tháo màn cũ trước khi màn mới gắn, cùng nhịp) → thông báo còn', async () => {
    show('import', 'new')
    const a = await renderHook(() => useStepNoticeLifetime('import', 'new'))
    await a.unmount()
    const b = await renderHook(() => useStepNoticeLifetime('import', 'new'))
    await act(async () => jest.runAllTimers())
    expect(useFormNotice.getState().notice).not.toBeNull()
    await b.unmount()
  })

  it('đếm riêng theo loại phiếu: màn phiếu xuất `new` tháo ra không bỏ thông báo phiếu nhập `new`', async () => {
    show('import', 'new')
    const imp = await renderHook(() => useStepNoticeLifetime('import', 'new'))
    const exp = await renderHook(() => useStepNoticeLifetime('export', 'new'))
    await exp.unmount()
    await act(async () => jest.runAllTimers())
    expect(useFormNotice.getState().notice).not.toBeNull()
    await imp.unmount()
  })
})

describe('wizardVisit', () => {
  it('đổi bước (qua 0 trong một nhịp) giữ lượt; rời hẳn luồng rồi mở lại → lượt mới', async () => {
    const v0 = wizardVisit('import', 'pn-9')
    const a = await renderHook(() => useStepNoticeLifetime('import', 'pn-9'))
    expect(wizardVisit('import', 'pn-9')).toBe(v0)
    await a.unmount()
    const b = await renderHook(() => useStepNoticeLifetime('import', 'pn-9'))
    await act(async () => jest.runAllTimers())
    expect(wizardVisit('import', 'pn-9')).toBe(v0)
    await b.unmount()
    await act(async () => jest.runAllTimers())
    const v1 = wizardVisit('import', 'pn-9')
    expect(v1).not.toBe(v0)
    // Phiếu khác / loại khác không đổi theo.
    expect(wizardVisit('export', 'pn-9')).toBe(wizardVisit('export', 'pn-9'))
    const c = await renderHook(() => useStepNoticeLifetime('import', 'pn-9'))
    expect(wizardVisit('import', 'pn-9')).toBe(v1)
    await c.unmount()
  })
})
