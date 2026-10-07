import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DateRangeFilter, type DateRangeValue } from './DateRangeFilter'
import { FilterDisplayProvider } from './filter-display'

function setup(initial: DateRangeValue = {}) {
  const onChange = vi.fn()
  function Harness() {
    const [value, setValue] = useState<DateRangeValue>(initial)
    return (
      <DateRangeFilter
        label="Ngày tạo"
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

const trigger = () => screen.getByRole('button', { name: /^Ngày tạo/ })

describe('DateRangeFilter', () => {
  it('chưa lọc → nút hiện nhãn, không có nút xoá', () => {
    setup()
    expect(trigger()).toHaveTextContent('Ngày tạo')
    expect(screen.queryByRole('button', { name: 'Xoá lựa chọn' })).not.toBeInTheDocument()
  })

  it('có khoảng → hiện "từ – đến" theo formatDate', () => {
    setup({ from: '2026-09-01', to: '2026-09-30' })
    expect(trigger()).toHaveTextContent('01/09/2026 – 30/09/2026')
  })

  it('chỉ có một đầu → hiện "Từ …" / "Đến …"', () => {
    setup({ from: '2026-09-01' })
    expect(trigger()).toHaveTextContent('Từ 01/09/2026')
  })

  it('chỉ có đầu cuối → hiện "Đến …"', () => {
    setup({ to: '2026-09-30' })
    expect(trigger()).toHaveTextContent('Đến 30/09/2026')
  })

  it('bấm 2 ngày → onChange một lần với cả hai đầu và đóng lịch', async () => {
    const { onChange, user } = setup({ from: '2026-09-10', to: '2026-09-12' })
    await user.click(trigger())
    // Lần bấm đầu mở khoảng MỚI (không nối vào khoảng cũ) và chưa áp dụng.
    await user.click(screen.getByText('20'))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByText('25'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-20', to: '2026-09-25' })
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })

  it('bấm ngày sau trước ngày trước → tự đảo cho from ≤ to', async () => {
    const { onChange, user } = setup({ from: '2026-09-10', to: '2026-09-12' })
    await user.click(trigger())
    await user.click(screen.getByText('25'))
    await user.click(screen.getByText('20'))
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-20', to: '2026-09-25' })
  })

  it('bấm cùng một ngày hai lần → khoảng một ngày', async () => {
    const { onChange, user } = setup({ from: '2026-09-10', to: '2026-09-12' })
    await user.click(trigger())
    await user.click(screen.getByText('20'))
    await user.click(screen.getByText('20'))
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-20', to: '2026-09-20' })
  })

  it('bấm một ngày rồi đóng lịch → lọc "từ ngày đó"', async () => {
    const { onChange, user } = setup({ from: '2026-09-10', to: '2026-09-12' })
    await user.click(trigger())
    await user.click(screen.getByText('20'))
    await user.keyboard('{Escape}')

    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-20', to: undefined })
    expect(trigger()).toHaveTextContent('Từ 20/09/2026')
  })

  it('mở rồi đóng không bấm gì → không đổi', async () => {
    const { onChange, user } = setup({ from: '2026-09-10', to: '2026-09-12' })
    await user.click(trigger())
    await user.keyboard('{Escape}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('nút xoá → onChange({}) và focus về nút mở', async () => {
    const { onChange, user } = setup({ from: '2026-09-01', to: '2026-09-30' })
    await user.click(screen.getByRole('button', { name: 'Xoá lựa chọn' }))
    expect(onChange).toHaveBeenLastCalledWith({})
    expect(trigger()).toHaveTextContent('Ngày tạo')
    expect(trigger()).toHaveFocus()
  })
})

describe('DateRangeFilter — dạng chip (mobile)', () => {
  it('đánh dấu đang bật theo giá trị (data-active) để chip đổi màu', () => {
    const { rerender } = render(
      <FilterDisplayProvider value="chip">
        <DateRangeFilter label="Ngày tạo" value={{}} onChange={vi.fn()} />
      </FilterDisplayProvider>,
    )
    expect(
      screen.getByRole('button', { name: 'Ngày tạo' }).closest('[data-active]'),
    ).toHaveAttribute('data-active', 'false')
    rerender(
      <FilterDisplayProvider value="chip">
        <DateRangeFilter label="Ngày tạo" value={{ from: '2026-09-01' }} onChange={vi.fn()} />
      </FilterDisplayProvider>,
    )
    expect(
      screen.getByRole('button', { name: /^Ngày tạo: / }).closest('[data-active]'),
    ).toHaveAttribute('data-active', 'true')
  })
})
