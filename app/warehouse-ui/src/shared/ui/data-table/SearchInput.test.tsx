import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEARCH_DEBOUNCE_MS, SearchInput } from './SearchInput'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SearchInput', () => {
  it('gõ → chỉ gọi onChange sau 300 ms, với giá trị cuối cùng', () => {
    const onChange = vi.fn()
    render(<SearchInput value="" onChange={onChange} />)
    const input = screen.getByRole('searchbox', { name: 'Tìm kiếm' })

    fireEvent.change(input, { target: { value: 'o' } })
    act(() => vi.advanceTimersByTime(200))
    fireEvent.change(input, { target: { value: 'oc' } })
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1))
    expect(onChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('oc')
  })

  it('nút xoá → gọi onChange("") ngay, huỷ lần gọi đang chờ', () => {
    const onChange = vi.fn()
    render(<SearchInput value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'oc' } })

    fireEvent.click(screen.getByRole('button', { name: 'Xoá tìm kiếm' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('')
    expect(screen.getByRole('searchbox')).toHaveValue('')

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('value đổi từ ngoài (Back) → ô hiện theo', () => {
    const { rerender } = render(<SearchInput value="oc" onChange={vi.fn()} />)
    expect(screen.getByRole('searchbox')).toHaveValue('oc')

    rerender(<SearchInput value="bu long" onChange={vi.fn()} />)
    expect(screen.getByRole('searchbox')).toHaveValue('bu long')
  })
})
