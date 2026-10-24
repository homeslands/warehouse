import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NameList } from './NameList'

describe('NameList', () => {
  it('≤ 2 tên → hiện đủ, nối bằng dấu phẩy, không có title', () => {
    const { container } = render(<NameList names={['An', 'Bình']} />)
    expect(screen.getByText('An, Bình')).toBeInTheDocument()
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('nhiều tên → 2 tên đầu + "+N"; đủ tên ở title và cho trình đọc màn hình', () => {
    render(<NameList names={['An', 'Bình', 'Chi', 'Dũng']} />)
    const shown = screen.getByText('An, Bình')
    expect(shown.parentElement).toHaveTextContent('An, Bình +2')
    expect(shown.parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(shown.closest('[title]')).toHaveAttribute('title', 'An, Bình, Chi, Dũng')
    expect(screen.getByText('An, Bình, Chi, Dũng')).toHaveClass('sr-only')
  })

  it('max tuỳ chỉnh', () => {
    render(<NameList names={['An', 'Bình', 'Chi']} max={1} />)
    expect(screen.getByText('An').parentElement).toHaveTextContent('An +2')
  })

  it('nameClassName chỉ áp lên phần tên — "+N" nằm ngoài nên không bị cắt theo', () => {
    const { container } = render(
      <NameList
        names={['Công ty A', 'Công ty B', 'Công ty C']}
        max={1}
        nameClassName="line-clamp-2"
      />,
    )
    const clamped = container.querySelector('.line-clamp-2')
    expect(clamped).toHaveTextContent('Công ty A')
    expect(clamped).not.toHaveTextContent('+2')
    expect(container).toHaveTextContent('+2')
  })
})
