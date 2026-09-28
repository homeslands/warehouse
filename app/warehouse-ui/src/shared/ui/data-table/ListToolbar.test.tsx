import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ListToolbar } from './ListToolbar'

/** useIsMobile đọc matchMedia('(max-width: 767px)'). */
function fakeMobile() {
  const realMatchMedia = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    ...realMatchMedia(query),
    matches: query === '(max-width: 767px)',
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ListToolbar — bố cục', () => {
  it('ô tìm ở cụm trái; bộ lọc rồi nút hành động ở cụm phải, nút hành động ngoài cùng', () => {
    render(
      <ListToolbar
        search={<input aria-label="Tìm kiếm" />}
        filters={<select aria-label="Trạng thái" />}
        actions={<button type="button">Tạo</button>}
      />,
    )
    const search = screen.getByLabelText('Tìm kiếm')
    const filter = screen.getByLabelText('Trạng thái')
    const create = screen.getByRole('button', { name: 'Tạo' })

    expect(search.parentElement).not.toBe(filter.parentElement)
    expect(filter.parentElement).toBe(create.parentElement)
    expect(filter.parentElement).toHaveClass('ml-auto')
    expect(create.parentElement!.lastElementChild).toBe(create)
  })

  it('không có ô tìm → không dựng cụm trái, bộ lọc và nút vẫn dồn phải', () => {
    const { container } = render(
      <ListToolbar
        filters={<select aria-label="Trạng thái" />}
        actions={<button type="button">Tạo</button>}
      />,
    )
    expect(container.firstElementChild!.children).toHaveLength(1)
    expect(screen.getByLabelText('Trạng thái').parentElement).toHaveClass('ml-auto')
  })
})

describe('ListToolbar — gom bộ lọc trên màn < 768px', () => {
  const filters = (
    <>
      <select aria-label="Trạng thái" />
      <select aria-label="Quản lý" />
    </>
  )

  it('màn hẹp + collapseFiltersOnMobile → nút "Bộ lọc" kèm số đang áp dụng; bấm mở ngăn chứa bộ lọc', async () => {
    fakeMobile()
    render(
      <ListToolbar
        collapseFiltersOnMobile
        activeFilterCount={2}
        filters={filters}
        actions={<button type="button">Tạo</button>}
      />,
    )

    expect(screen.queryByLabelText('Trạng thái')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: /Bộ lọc/ })
    expect(within(trigger).getByLabelText('2 bộ lọc đang áp dụng')).toHaveTextContent('2')

    await userEvent.click(trigger)

    const sheet = await screen.findByRole('dialog', { name: 'Bộ lọc' })
    expect(within(sheet).getByLabelText('Trạng thái')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Quản lý')).toBeInTheDocument()
  })

  it('không có bộ lọc nào đang áp dụng → nút không hiện số', () => {
    fakeMobile()
    render(<ListToolbar collapseFiltersOnMobile filters={filters} />)
    expect(screen.getByRole('button', { name: 'Bộ lọc' })).toBeInTheDocument()
  })

  it('màn rộng → bộ lọc nằm thẳng trên thanh, không có nút "Bộ lọc"', () => {
    render(<ListToolbar collapseFiltersOnMobile filters={filters} />)
    expect(screen.getByLabelText('Trạng thái')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bộ lọc/ })).not.toBeInTheDocument()
  })

  it('màn hẹp nhưng không bật collapseFiltersOnMobile (vd chỉ một ô lọc) → vẫn để thẳng', () => {
    fakeMobile()
    render(<ListToolbar filters={<select aria-label="Trạng thái" />} />)
    expect(screen.getByLabelText('Trạng thái')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bộ lọc/ })).not.toBeInTheDocument()
  })
})
