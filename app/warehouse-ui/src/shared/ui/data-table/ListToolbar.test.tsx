import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ListToolbar } from './ListToolbar'

// jsdom không đo kích thước — giả kết quả đo "vừa / không vừa một hàng". Mặc định: vừa.
const fit = vi.hoisted(() => ({ fits: true }))
vi.mock('./toolbar-fit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./toolbar-fit')>()
  return {
    ...actual,
    useToolbarFit: () => ({
      rowRef: { current: null },
      filtersRef: { current: null },
      actionsRef: { current: null },
      fits: fit.fits,
    }),
  }
})

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
  fit.fits = true
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

    // Cụm phải (ml-auto) chứa bộ lọc rồi nút hành động — mỗi phần bọc một lớp để đo bề rộng.
    const right = filter.closest('.ml-auto')
    expect(right).not.toBeNull()
    expect(search.closest('.ml-auto')).toBeNull()
    expect(right).toContainElement(create)
    expect(right!.lastElementChild).toContainElement(create)
  })

  it('không có ô tìm → không dựng cụm trái, bộ lọc và nút vẫn dồn phải', () => {
    const { container } = render(
      <ListToolbar
        filters={<select aria-label="Trạng thái" />}
        actions={<button type="button">Tạo</button>}
      />,
    )
    expect(container.firstElementChild!.children).toHaveLength(1)
    expect(screen.getByLabelText('Trạng thái').closest('.ml-auto')).toBe(
      container.firstElementChild!.firstElementChild,
    )
  })
})

describe('ListToolbar — mobile: chip lướt ngang', () => {
  const filters = (
    <>
      <select aria-label="Trạng thái" />
      <select aria-label="Quản lý" />
    </>
  )

  it('hàng 1: ô tìm + nút hành động; hàng 2: nhóm "Bộ lọc" lướt ngang chứa mọi bộ lọc — không có nút/ngăn "Bộ lọc"', () => {
    fakeMobile()
    render(
      <ListToolbar
        search={<input aria-label="Tìm kiếm" />}
        filters={filters}
        actions={<button type="button">Tạo</button>}
      />,
    )
    const group = screen.getByRole('group', { name: 'Bộ lọc' })
    expect(within(group).getByLabelText('Trạng thái')).toBeInTheDocument()
    expect(within(group).getByLabelText('Quản lý')).toBeInTheDocument()
    expect(group).toHaveClass('overflow-x-auto')
    expect(screen.queryByRole('button', { name: /Bộ lọc/ })).not.toBeInTheDocument()

    const firstRow = screen.getByLabelText('Tìm kiếm').closest('[data-slot="toolbar-row"]')
    expect(firstRow).toContainElement(screen.getByRole('button', { name: 'Tạo' }))
    expect(firstRow).not.toContainElement(group)
  })

  it('có bộ lọc đang áp dụng + onClearFilters → chip "Xoá bộ lọc" cuối hàng', async () => {
    fakeMobile()
    const onClear = vi.fn()
    render(<ListToolbar activeFilterCount={1} onClearFilters={onClear} filters={filters} />)
    const group = screen.getByRole('group', { name: 'Bộ lọc' })
    await userEvent.click(within(group).getByRole('button', { name: 'Xoá bộ lọc' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('không có bộ lọc đang áp dụng → không có chip "Xoá bộ lọc"', () => {
    fakeMobile()
    render(<ListToolbar activeFilterCount={0} onClearFilters={vi.fn()} filters={filters} />)
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument()
  })

  it('màn rộng → bộ lọc nằm thẳng trên thanh, không có nhóm chip', () => {
    render(<ListToolbar filters={filters} />)
    expect(screen.getByLabelText('Trạng thái')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Bộ lọc' })).not.toBeInTheDocument()
  })
})

describe('ListToolbar — tự gom khi không vừa một hàng (desktop)', () => {
  const filters = (
    <>
      <select aria-label="Vai trò" />
      <select aria-label="Kho" />
    </>
  )

  it('vừa một hàng → bộ lọc nằm thẳng trên thanh', () => {
    render(<ListToolbar filters={filters} actions={<button type="button">Thêm</button>} />)
    expect(screen.getByLabelText('Vai trò')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bộ lọc/ })).not.toBeInTheDocument()
  })

  it('không vừa → nút "Bộ lọc (n)" cạnh nút hành động; bấm mở popover chứa đủ bộ lọc', async () => {
    fit.fits = false
    render(
      <ListToolbar
        activeFilterCount={1}
        filters={filters}
        actions={<button type="button">Thêm</button>}
      />,
    )
    expect(screen.queryByLabelText('Vai trò')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Bộ lọc/ }))

    const panel = await screen.findByRole('dialog', { name: 'Bộ lọc' })
    expect(within(panel).getByLabelText('Vai trò')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Kho')).toBeInTheDocument()
  })

  it('có bộ lọc đang áp dụng + onClearFilters → nút "Xoá bộ lọc" trong popover', async () => {
    fit.fits = false
    const onClear = vi.fn()
    render(<ListToolbar activeFilterCount={2} onClearFilters={onClear} filters={filters} />)
    await userEvent.click(screen.getByRole('button', { name: /Bộ lọc/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Xoá bộ lọc' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('không có bộ lọc nào đang áp dụng → không có nút "Xoá bộ lọc"', async () => {
    fit.fits = false
    render(<ListToolbar activeFilterCount={0} onClearFilters={vi.fn()} filters={filters} />)
    await userEvent.click(screen.getByRole('button', { name: /Bộ lọc/ }))
    await screen.findByRole('dialog', { name: 'Bộ lọc' })
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument()
  })
})
