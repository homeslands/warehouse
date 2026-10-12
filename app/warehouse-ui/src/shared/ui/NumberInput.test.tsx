import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NumberInput } from './NumberInput'

function setup(props: { initial?: number; min?: number; max?: number; integer?: boolean } = {}) {
  const { initial, ...rest } = props
  const onChange = vi.fn()
  function Harness() {
    const [value, setValue] = useState<number | undefined>(initial)
    return (
      <>
        <NumberInput
          aria-label="Số lượng"
          value={value}
          onChange={(next) => {
            onChange(next)
            setValue(next)
          }}
          {...rest}
        />
        <button type="button" onClick={() => setValue(42)}>
          Đặt 42
        </button>
        <output>{String(value)}</output>
      </>
    )
  }
  render(<Harness />)
  return { onChange, user: userEvent.setup(), input: screen.getByLabelText('Số lượng') }
}

describe('NumberInput', () => {
  it('gõ số → onChange(number)', async () => {
    const { onChange, user, input } = setup()
    await user.type(input, '12.5')
    expect(onChange).toHaveBeenLastCalledWith(12.5)
  })

  it('dấu phẩy thập phân cũng được hiểu', async () => {
    const { onChange, user, input } = setup()
    await user.type(input, '1,5')
    expect(onChange).toHaveBeenLastCalledWith(1.5)
  })

  it('xoá trắng → onChange(undefined), không bao giờ NaN', async () => {
    const { onChange, user, input } = setup({ initial: 7 })
    await user.clear(input)
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    expect(onChange.mock.calls.flat().some((v) => Number.isNaN(v))).toBe(false)
  })

  it('ký tự không phải số bị bỏ qua', async () => {
    const { onChange, user, input } = setup()
    await user.type(input, '1a2')
    expect(input).toHaveValue('12')
    expect(onChange).toHaveBeenLastCalledWith(12)
  })

  it('chỉ có "-" → undefined; rời ô thì dọn về rỗng', async () => {
    const { onChange, user, input } = setup()
    await user.type(input, '-')
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    await user.tab()
    expect(input).toHaveValue('')
  })

  it('integer: dấu thập phân bị bỏ qua', async () => {
    const { onChange, user, input } = setup({ integer: true })
    await user.type(input, '1.5')
    expect(input).toHaveValue('15')
    expect(onChange).toHaveBeenLastCalledWith(15)
  })

  it('max: vượt → rời ô thì kẹp về max', async () => {
    const { onChange, user, input } = setup({ max: 100 })
    await user.type(input, '150')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(100)
    expect(input).toHaveValue('100')
  })

  it('min: thấp hơn → rời ô thì kẹp về min', async () => {
    const { onChange, user, input } = setup({ min: 1 })
    await user.type(input, '0')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(input).toHaveValue('1')
  })

  it('giá trị đổi từ ngoài (form.reset) → ô hiện theo', async () => {
    const { user, input } = setup({ initial: 3 })
    expect(input).toHaveValue('3')
    await user.click(screen.getByRole('button', { name: 'Đặt 42' }))
    expect(input).toHaveValue('42')
  })

  it('số rất nhỏ: rời ô vẫn giữ chuỗi đã gõ (không ra 1e-7), xoá lùi được', async () => {
    const { onChange, user, input } = setup()
    await user.type(input, '0.0000001')
    await user.tab()
    expect(input).toHaveValue('0.0000001')
    expect(onChange).toHaveBeenLastCalledWith(1e-7)
    await user.type(input, '{Backspace}')
    expect(input).toHaveValue('0.000000')
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('dấu phẩy: rời ô vẫn hiện như đã gõ', async () => {
    const { user, input } = setup()
    await user.type(input, '1,5')
    await user.tab()
    expect(input).toHaveValue('1,5')
  })

  it('giá trị từ ngoài là số rất nhỏ → hiện dạng thường, không dạng mũ', () => {
    const small = setup({ initial: 1e-7 })
    expect(small.input).toHaveValue('0.0000001')
  })

  it('"1.000" / "1,000" là 1 (dấu thập phân) → rời ô viết lại thành "1" để người dùng thấy giá trị thật', async () => {
    const { onChange, user, input } = setup()
    await user.type(input, '1.000')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(input).toHaveValue('1')

    await user.clear(input)
    await user.type(input, '1,000')
    await user.tab()
    expect(input).toHaveValue('1')
  })

  it('dấu phẩy được giữ khi viết lại: "2,50" → "2,5"', async () => {
    const { user, input } = setup()
    await user.type(input, '2,50')
    await user.tab()
    expect(input).toHaveValue('2,5')
  })
})
