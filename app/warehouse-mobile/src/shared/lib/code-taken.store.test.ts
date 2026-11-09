import { act, renderHook } from '@testing-library/react-native'

import { useCodeTaken, useCodeTakenMessage } from './code-taken.store'

const A = { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'new' }

beforeEach(() => useCodeTaken.setState({ taken: {} }))

describe('useCodeTaken', () => {
  it('lỗi của (loại, người dùng, kho, phiếu) với đúng mã đã gửi → câu lỗi; mã đổi → null', async () => {
    const { result, rerender } = await renderHook(
      ({ code }: { code: string }) => useCodeTakenMessage('import', A, code),
      { initialProps: { code: 'PN-1' } },
    )
    expect(result.current).toBeNull()
    await act(async () => useCodeTaken.getState().set('import', A, 'PN-1', 'Mã phiếu đã tồn tại'))
    expect(result.current).toBe('Mã phiếu đã tồn tại')
    await rerender({ code: 'PN-2' })
    expect(result.current).toBeNull()
  })

  it('phiếu nhập và phiếu xuất giữ riêng (hai tab cùng mở `new`); phiếu / kho khác không thấy', async () => {
    useCodeTaken.getState().set('import', A, 'PN-1', 'nhập')
    useCodeTaken.getState().set('export', A, 'PX-1', 'xuất')
    const imp = await renderHook(() => useCodeTakenMessage('import', A, 'PN-1'))
    const exp = await renderHook(() => useCodeTakenMessage('export', A, 'PX-1'))
    const other = await renderHook(() =>
      useCodeTakenMessage('import', { ...A, warehouseSlug: 'wh-b' }, 'PN-1'),
    )
    const none = await renderHook(() => useCodeTakenMessage('import', null, 'PN-1'))
    expect(imp.result.current).toBe('nhập')
    expect(exp.result.current).toBe('xuất')
    expect(other.result.current).toBeNull()
    expect(none.result.current).toBeNull()
  })

  it('clear chỉ bỏ lỗi của đúng loại + bản nháp', () => {
    useCodeTaken.getState().set('import', A, 'PN-1', 'nhập')
    useCodeTaken.getState().set('export', A, 'PX-1', 'xuất')
    useCodeTaken.getState().clear('import', { ...A, formSlug: 'pn-9' })
    expect(useCodeTaken.getState().taken.import?.message).toBe('nhập')
    useCodeTaken.getState().clear('import', A)
    expect(useCodeTaken.getState().taken.import).toBeUndefined()
    expect(useCodeTaken.getState().taken.export?.message).toBe('xuất')
  })
})
