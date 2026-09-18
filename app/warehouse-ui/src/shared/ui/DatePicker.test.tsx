import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { DatePicker } from './DatePicker'

function setup(initial?: string) {
  const onChange = vi.fn()
  function Harness() {
    const [value, setValue] = useState<string | undefined>(initial)
    return (
      <DatePicker
        aria-label="Ngày nhập"
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

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('vi')
  })
})

describe('DatePicker', () => {
  it('chưa có giá trị → hiện placeholder', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Ngày nhập' })).toHaveTextContent('Chọn ngày')
  })

  it('có giá trị → hiện theo formatDate (dd/MM/yyyy với vi)', () => {
    setup('2026-09-18')
    expect(screen.getByRole('button', { name: 'Ngày nhập' })).toHaveTextContent('18/09/2026')
  })

  it('chọn ngày → onChange("YYYY-MM-DD") và đóng lịch', async () => {
    const { onChange, user } = setup('2026-09-18')
    await user.click(screen.getByRole('button', { name: 'Ngày nhập' }))
    await user.click(screen.getByText('20'))

    expect(onChange).toHaveBeenLastCalledWith('2026-09-20')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ngày nhập' })).toHaveTextContent('20/09/2026')
  })

  it('lịch theo ngôn ngữ đang chọn', async () => {
    const { user } = setup('2026-09-18')
    await user.click(screen.getByRole('button', { name: 'Ngày nhập' }))
    const viCaption = screen.getByRole('grid').getAttribute('aria-label')
    expect(viCaption).toMatch(/^tháng .+ 2026$/i)
    await user.keyboard('{Escape}')

    await act(async () => {
      await i18n.changeLanguage('en')
    })
    await user.click(screen.getByRole('button', { name: 'Ngày nhập' }))

    expect(screen.getByRole('grid')).toHaveAttribute('aria-label', 'September 2026')
  })

  it('nút xoá → onChange(undefined)', async () => {
    const { onChange, user } = setup('2026-09-18')
    await user.click(screen.getByRole('button', { name: 'Xoá lựa chọn' }))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    expect(screen.getByRole('button', { name: 'Ngày nhập' })).toHaveTextContent('Chọn ngày')
    // Nút xoá biến mất — focus về nút mở, không rơi xuống <body>.
    expect(screen.getByRole('button', { name: 'Ngày nhập' })).toHaveFocus()
  })
})
