import { act, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { renderWithProviders } from '@/shared/test/render'
import { MoneyInput } from './MoneyInput'

function Controlled({
  initial,
  onValue,
}: {
  initial?: number
  onValue?: (v: number | undefined) => void
}) {
  const [value, setValue] = useState<number | undefined>(initial)
  return (
    <>
      <MoneyInput
        aria-label="Số tiền"
        value={value}
        onChange={(v) => {
          setValue(v)
          onValue?.(v)
        }}
      />
      <button type="button" onClick={() => setValue(2500)}>
        đặt 2500
      </button>
      <output>{String(value)}</output>
    </>
  )
}

const box = () => screen.getByRole('textbox', { name: 'Số tiền' })

describe('MoneyInput', () => {
  it('gõ 1500000 → hiện 1.500.000, giá trị 1500000; có hậu tố ₫', async () => {
    const onValue = vi.fn()
    const { user } = renderWithProviders(<Controlled onValue={onValue} />)
    await user.type(box(), '1500000')
    expect(box()).toHaveValue('1.500.000')
    expect(onValue).toHaveBeenLastCalledWith(1500000)
    expect(screen.getByText('₫')).toBeInTheDocument()
  })

  it('phần lẻ dùng dấu phẩy, tối đa 2 số; rời ô thì bỏ dấu thập phân treo', async () => {
    const { user } = renderWithProviders(<Controlled />)
    await user.type(box(), '1500,567')
    expect(box()).toHaveValue('1.500,56')
    expect(screen.getByRole('status')).toHaveTextContent('1500.56')
    await user.clear(box())
    await user.type(box(), '1500,')
    await user.tab()
    expect(box()).toHaveValue('1.500')
  })

  it('dán "1,500,000" vẫn là một triệu rưỡi', async () => {
    const { user } = renderWithProviders(<Controlled />)
    await user.click(box())
    await user.paste('1,500,000')
    expect(box()).toHaveValue('1.500.000')
    expect(screen.getByRole('status')).toHaveTextContent('1500000')
  })

  it('xoá trắng → undefined; giá trị đổi từ ngoài thì ô hiện theo', async () => {
    const { user } = renderWithProviders(<Controlled initial={1000} />)
    expect(box()).toHaveValue('1.000')
    await user.clear(box())
    expect(screen.getByRole('status')).toHaveTextContent('undefined')
    await user.click(screen.getByRole('button', { name: 'đặt 2500' }))
    expect(box()).toHaveValue('2.500')
  })

  it('gõ giữa chuỗi không làm con trỏ nhảy về cuối', async () => {
    const { user } = renderWithProviders(<Controlled initial={1500} />)
    const input = box() as HTMLInputElement
    await user.click(input)
    input.setSelectionRange(1, 1) // sau "1" của "1.500"
    await user.keyboard('2')
    expect(input).toHaveValue('12.500')
    expect(input.selectionStart).toBe(2)
  })

  it('tiếng Anh: 1,500,000.5', async () => {
    await act(() => i18n.changeLanguage('en'))
    try {
      const { user } = renderWithProviders(<Controlled />)
      await user.type(box(), '1500000.5')
      expect(box()).toHaveValue('1,500,000.5')
    } finally {
      await act(() => i18n.changeLanguage('vi'))
    }
  })
})
