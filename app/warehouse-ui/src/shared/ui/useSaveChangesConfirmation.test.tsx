import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSaveChangesConfirmation } from './useSaveChangesConfirmation'

type V = { name: string }

function setup(initial: { open?: boolean; changed?: string[] } = {}) {
  const onConfirm = vi.fn<(v: V) => void>()
  const hook = renderHook(
    (props: { open: boolean }) =>
      useSaveChangesConfirmation<V>({
        open: props.open,
        entity: 'kho',
        name: 'Kho A',
        changed: initial.changed ?? ['Tên', 'Mã'],
        icon: null,
        onConfirm,
      }),
    { initialProps: { open: initial.open ?? true } },
  )
  return { ...hook, onConfirm }
}

describe('useSaveChangesConfirmation', () => {
  it('chưa request thì đóng', () => {
    const { result } = setup()
    expect(result.current.confirmation.open).toBe(false)
  })

  it('request mở hộp với tiêu đề, mô tả, nhãn đúng', () => {
    const { result } = setup()
    act(() => result.current.request({ name: 'x' }))
    const c = result.current.confirmation
    expect(c.open).toBe(true)
    expect(c.title).toBe('Lưu thay đổi kho Kho A?')
    expect(c.description).toBe('Đã sửa: Tên, Mã')
    expect(c.confirmLabel).toBe('Lưu thay đổi')
    expect(c.cancelLabel).toBe('Quay lại')
  })

  it('không có gì đổi thì bỏ dòng "Đã sửa"', () => {
    const { result } = setup({ changed: [] })
    act(() => result.current.request({ name: 'x' }))
    expect(result.current.confirmation.description).toBe('')
  })

  it('onConfirm nhận đúng giá trị đã request', () => {
    const { result, onConfirm } = setup()
    act(() => result.current.request({ name: 'x' }))
    act(() => result.current.confirmation.onConfirm())
    expect(onConfirm).toHaveBeenCalledWith({ name: 'x' })
  })

  it('close() và onOpenChange(false) đóng hộp', () => {
    const { result } = setup()
    act(() => result.current.request({ name: 'x' }))
    act(() => result.current.close())
    expect(result.current.confirmation.open).toBe(false)
    act(() => result.current.request({ name: 'y' }))
    act(() => result.current.confirmation.onOpenChange(false))
    expect(result.current.confirmation.open).toBe(false)
  })

  it('sheet đóng (open=false) thì hộp đóng, mở lại sheet không tự bật hộp', () => {
    const { result, rerender } = setup()
    act(() => result.current.request({ name: 'x' }))
    rerender({ open: false })
    expect(result.current.confirmation.open).toBe(false)
    rerender({ open: true })
    expect(result.current.confirmation.open).toBe(false)
  })
})
