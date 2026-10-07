import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilterDisplayProvider } from './filter-display'
import { SelectFilter } from './SelectFilter'

const OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'true', label: 'Đang hoạt động' },
  { value: 'false', label: 'Ngừng hoạt động' },
]

function renderFilter(value = '', onChange = vi.fn()) {
  const user = userEvent.setup()
  render(<SelectFilter label="Trạng thái" value={value} onChange={onChange} options={OPTIONS} />)
  return { user, onChange }
}

describe('SelectFilter', () => {
  it('nút mở hiện nhãn của giá trị đang chọn, không phải giá trị thô', async () => {
    renderFilter('false')

    // Nút mở chỉ hiện nhãn ĐANG CHỌN. (Với `<select>` gốc, phần tử chứa text của MỌI option nên
    // một khẳng định `toHaveTextContent` đơn lẻ sẽ xanh bừa — vì thế phải khẳng định cả phần vắng.)
    const trigger = screen.getByRole('combobox', { name: 'Trạng thái' })
    expect(trigger).toHaveTextContent('Ngừng hoạt động')
    expect(trigger).not.toHaveTextContent('Đang hoạt động')
    expect(trigger).not.toHaveTextContent('Tất cả')
  })

  it('mở ra thấy đủ lựa chọn; chọn một mục thì báo giá trị lên trên', async () => {
    const { user, onChange } = renderFilter('')

    await user.click(screen.getByRole('combobox', { name: 'Trạng thái' }))

    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Tất cả',
      'Đang hoạt động',
      'Ngừng hoạt động',
    ])

    await user.click(screen.getByRole('option', { name: 'Ngừng hoạt động' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('false')
  })

  it('mục đang chọn được đánh dấu cho trình đọc màn hình', async () => {
    const { user } = renderFilter('true')

    await user.click(screen.getByRole('combobox', { name: 'Trạng thái' }))

    expect(await screen.findByRole('option', { name: 'Đang hoạt động' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('nhãn dài bị cắt "…" → nút mở mang title là nhãn đầy đủ để đọc được', () => {
    const long = 'Kho Tổng Miền Bắc – Khu Công nghiệp Thăng Long II, Đông Anh'
    render(
      <SelectFilter
        label="Kho"
        value="hn"
        onChange={vi.fn()}
        options={[
          { value: '', label: 'Tất cả kho' },
          { value: 'hn', label: long },
        ]}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Kho' })).toHaveAttribute('title', long)
  })
})

describe('SelectFilter — dạng chip (mobile)', () => {
  function renderChip(value: string, onChange = vi.fn()) {
    render(
      <FilterDisplayProvider value="chip">
        <SelectFilter label="Trạng thái" value={value} onChange={onChange} options={OPTIONS} />
      </FilterDisplayProvider>,
    )
    return { onChange, user: userEvent.setup() }
  }

  it('chưa chọn → chip ghi TÊN bộ lọc, không ghi "Tất cả"; không có nút bỏ', () => {
    renderChip('')
    const trigger = screen.getByRole('combobox', { name: 'Trạng thái' })
    expect(trigger).toHaveTextContent('Trạng thái')
    expect(trigger).not.toHaveTextContent('Tất cả')
    expect(screen.queryByRole('button', { name: 'Bỏ lọc Trạng thái' })).not.toBeInTheDocument()
  })

  it('đã chọn → chip ghi GIÁ TRỊ, đánh dấu đang bật; nút ✕ bỏ lọc → onChange("")', async () => {
    const { onChange, user } = renderChip('false')
    const trigger = screen.getByRole('combobox', { name: 'Trạng thái' })
    expect(trigger).toHaveTextContent('Ngừng hoạt động')
    expect(trigger.closest('[data-active]')).toHaveAttribute('data-active', 'true')

    await user.click(screen.getByRole('button', { name: 'Bỏ lọc Trạng thái' }))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
