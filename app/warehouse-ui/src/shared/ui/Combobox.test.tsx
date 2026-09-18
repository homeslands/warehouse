import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Combobox, type ComboboxOption } from './Combobox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog'

const OPTIONS: ComboboxOption[] = [
  { value: 'hn', label: 'Hà Nội' },
  { value: 'hcm', label: 'Hồ Chí Minh' },
  { value: 'dn', label: 'Đà Nẵng' },
]

function setup(initial?: string) {
  const onChange = vi.fn()
  function Harness() {
    const [value, setValue] = useState<string | undefined>(initial)
    return (
      <Combobox
        aria-label="Tỉnh"
        options={OPTIONS}
        value={value}
        onChange={(next) => {
          onChange(next)
          setValue(next)
        }}
      />
    )
  }
  render(<Harness />)
  return { onChange, user: userEvent.setup() }
}

describe('Combobox', () => {
  it('mở ra thấy mọi lựa chọn, chọn một → onChange(value) và đóng', async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))

    expect(screen.getAllByRole('option')).toHaveLength(3)
    await user.click(screen.getByRole('option', { name: 'Đà Nẵng' }))

    expect(onChange).toHaveBeenLastCalledWith('dn')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tỉnh' })).toHaveTextContent('Đà Nẵng')
  })

  it('gõ để lọc, không phân biệt dấu', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    // Ô tìm có tên truy cập được (placeholder không phải nhãn).
    await user.type(screen.getByRole('combobox', { name: 'Tìm...' }), 'da nang')

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Đà Nẵng'])
  })

  it('không khớp gì → hiện "Không có kết quả."', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    await user.type(screen.getByPlaceholderText('Tìm...'), 'xyz')

    expect(screen.getByText('Không có kết quả.')).toBeInTheDocument()
  })

  it('mục đang chọn được đánh dấu', async () => {
    const { user } = setup('hcm')
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))

    expect(screen.getByRole('option', { name: 'Hồ Chí Minh' })).toHaveAttribute(
      'data-checked',
      'true',
    )
    expect(screen.getByRole('option', { name: 'Hà Nội' })).toHaveAttribute('data-checked', 'false')
  })

  it('bàn phím: ↓ rồi Enter chọn mục thứ hai', async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenLastCalledWith('hcm')
  })

  it('Esc đóng mà không chọn gì', async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('nút xoá → onChange(undefined), trở về placeholder', async () => {
    const { onChange, user } = setup('hn')
    await user.click(screen.getByRole('button', { name: 'Xoá lựa chọn' }))

    expect(onChange).toHaveBeenLastCalledWith(undefined)
    expect(screen.getByRole('combobox', { name: 'Tỉnh' })).toHaveTextContent('Chọn...')
    // Nút xoá biến mất — focus về nút mở, không rơi xuống <body>.
    expect(screen.getByRole('combobox', { name: 'Tỉnh' })).toHaveFocus()
  })

  it('ref ngoài vẫn trỏ vào nút mở (RHF focus ô lỗi)', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <Combobox
        ref={ref}
        aria-label="Tỉnh"
        options={OPTIONS}
        value={undefined}
        onChange={vi.fn()}
      />,
    )
    expect(ref.current).toBe(screen.getByRole('combobox', { name: 'Tỉnh' }))
  })

  it('nằm trong Dialog: mở, gõ lọc, chọn được và Dialog vẫn mở', async () => {
    const onChange = vi.fn()
    function Harness() {
      const [value, setValue] = useState<string | undefined>()
      return (
        <Dialog open>
          <DialogContent>
            <DialogTitle>Hộp</DialogTitle>
            <DialogDescription>Mô tả</DialogDescription>
            <Combobox
              aria-label="Tỉnh"
              options={OPTIONS}
              value={value}
              onChange={(next) => {
                onChange(next)
                setValue(next)
              }}
            />
          </DialogContent>
        </Dialog>
      )
    }
    render(<Harness />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }))
    await user.type(screen.getByRole('combobox', { name: 'Tìm...' }), 'da nang')
    await user.click(screen.getByRole('option', { name: 'Đà Nẵng' }))

    expect(onChange).toHaveBeenLastCalledWith('dn')
    expect(screen.getByRole('dialog', { name: 'Hộp' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tỉnh' })).toHaveTextContent('Đà Nẵng')
  })

  it('disabled → không mở được, không có nút xoá', async () => {
    const onChange = vi.fn()
    render(<Combobox aria-label="Tỉnh" options={OPTIONS} value="hn" onChange={onChange} disabled />)
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Tỉnh' }))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xoá lựa chọn' })).not.toBeInTheDocument()
  })
})
