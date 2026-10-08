import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SummaryList } from './SummaryList'

describe('SummaryList', () => {
  it('mỗi mục là một cặp nhãn (dt) – giá trị (dd), đúng thứ tự', () => {
    render(
      <SummaryList
        items={[
          { label: 'Mã', value: 'HN' },
          { label: 'Tên', value: 'Kho Hà Nội' },
        ]}
      />,
    )
    const rows = screen
      .getAllByRole('term')
      .map((term) => [term.textContent, term.nextElementSibling?.textContent])
    expect(rows).toEqual([
      ['Mã', 'HN'],
      ['Tên', 'Kho Hà Nội'],
    ])
  })

  it('giá trị trống → hiện "Chưa có" thay vì ô trống', () => {
    render(<SummaryList items={[{ label: 'Địa chỉ', value: '' }]} />)
    expect(screen.getByRole('definition')).toHaveTextContent('Chưa có')
  })
})
