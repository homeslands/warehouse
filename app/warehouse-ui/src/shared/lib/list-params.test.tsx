import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import type { ListParams } from '@/shared/api/types'
import { PAGE_SIZE_OPTIONS, useClampPage, useListParams } from './list-params'

const FILTERS = z.object({
  name: z.string().optional(),
  code: z
    .string()
    .regex(/^[A-Z0-9]+$/)
    .optional(),
})

const location = { search: '', navigationType: '' }

function LocationProbe() {
  location.search = useLocation().search
  location.navigationType = useNavigationType()
  return null
}

function setup(url: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      {children}
      <LocationProbe />
    </MemoryRouter>
  )
  return renderHook(() => useListParams(FILTERS), { wrapper })
}

describe('useListParams — đọc', () => {
  it('URL trống → trang 1, 10 dòng, không bộ lọc', () => {
    const { result } = setup('/list')
    expect(result.current.page).toBe(1)
    expect(result.current.size).toBe(10)
    expect(result.current.filters).toEqual({})
  })

  it('đọc trang, số dòng, bộ lọc từ URL', () => {
    const { result } = setup('/list?page=3&size=20&name=oc&code=AB1')
    expect(result.current).toMatchObject({
      page: 3,
      size: 20,
      filters: { name: 'oc', code: 'AB1' },
    })
  })

  it('PAGE_SIZE_OPTIONS là 10 / 20 / 50', () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 20, 50])
  })

  it.each(['abc', '0', '-2', '1.5', ''])('page=%s không hợp lệ → 1', (raw) => {
    expect(setup(`/list?page=${raw}`).result.current.page).toBe(1)
  })

  it.each(['9999', '15', 'abc'])('size=%s không thuộc 10/20/50 → 10', (raw) => {
    expect(setup(`/list?size=${raw}`).result.current.size).toBe(10)
  })

  it('bộ lọc sai schema → bỏ riêng bộ lọc đó, giữ bộ lọc đúng', () => {
    const { result } = setup('/list?name=oc&code=sai-dinh-dang')
    expect(result.current.filters).toEqual({ name: 'oc' })
  })

  it('bộ lọc rỗng trên URL coi như không có', () => {
    expect(setup('/list?name=').result.current.filters).toEqual({})
  })
})

describe('useListParams — ghi', () => {
  it('setPage ghi page, giữ size và bộ lọc', () => {
    const { result } = setup('/list?size=20&name=oc')
    act(() => result.current.setPage(2))
    expect(result.current.page).toBe(2)
    expect(location.search).toBe('?page=2&size=20&name=oc')
  })

  it('setFilters gộp bộ lọc và về trang 1', () => {
    const { result } = setup('/list?page=3&size=20&name=oc')
    act(() => result.current.setFilters({ code: 'AB1' }))
    expect(result.current).toMatchObject({
      page: 1,
      size: 20,
      filters: { name: 'oc', code: 'AB1' },
    })
    expect(location.search).toBe('?size=20&name=oc&code=AB1')
  })

  it('setSize về trang 1', () => {
    const { result } = setup('/list?page=3')
    act(() => result.current.setSize(50))
    expect(result.current).toMatchObject({ page: 1, size: 50 })
    expect(location.search).toBe('?size=50')
  })

  it('không ghi giá trị mặc định, bộ lọc rỗng/undefined bị xoá khỏi URL', () => {
    const { result } = setup('/list?page=2&size=20&name=oc')
    act(() => result.current.setSize(10))
    expect(location.search).toBe('?name=oc')
    act(() => result.current.setFilters({ name: '' }))
    expect(location.search).toBe('')
    act(() => result.current.setFilters({ name: 'x' }))
    act(() => result.current.setFilters({ name: undefined }))
    expect(location.search).toBe('')
  })

  it('giữ nguyên tham số URL không thuộc hook', () => {
    const { result } = setup('/list?tab=nhap&page=3')
    act(() => result.current.setPage(4))
    expect(location.search).toBe('?tab=nhap&page=4')
  })

  it('ghi bằng replace, không push', () => {
    const { result } = setup('/list')
    expect(location.navigationType).toBe('POP')
    act(() => result.current.setPage(2))
    expect(location.navigationType).toBe('REPLACE')
  })

  it('hai lần setFilters trong cùng một tick → giữ cả hai thay đổi', () => {
    const { result } = setup('/list?name=oc&code=A1')
    act(() => {
      result.current.setFilters({ name: undefined })
      result.current.setFilters({ code: undefined })
    })
    expect(location.search).toBe('')
    expect(result.current.filters).toEqual({})
  })

  it('setFilters rồi setSize trong cùng một tick → giữ cả bộ lọc lẫn số dòng', () => {
    const { result } = setup('/list?page=3')
    act(() => {
      result.current.setFilters({ name: 'x' })
      result.current.setSize(20)
    })
    expect(location.search).toBe('?size=20&name=x')
    expect(result.current).toMatchObject({ page: 1, size: 20, filters: { name: 'x' } })
  })

  it('setter giữ nguyên identity khi URL đổi', () => {
    const { result } = setup('/list')
    const before = result.current
    act(() => result.current.setPage(2))
    expect(result.current.page).toBe(2)
    expect(result.current.setPage).toBe(before.setPage)
    expect(result.current.setSize).toBe(before.setSize)
    expect(result.current.setFilters).toBe(before.setFilters)
  })
})

describe('ListFilters — kiểu', () => {
  it('schema rỗng z.object({}) không làm page/size thành never', () => {
    const EMPTY = z.object({})
    const { result } = renderHook(() => useListParams(EMPTY), { wrapper: MemoryRouter })
    const { page, size, filters } = result.current
    const params: ListParams<typeof filters> = { page, size, ...filters }
    expect(params).toEqual({ page: 1, size: 10 })
    expectTypeOf(params.page).toEqualTypeOf<number>()
    expectTypeOf(params.size).toEqualTypeOf<number>()
  })
})

describe('useClampPage', () => {
  it('page vượt totalPages → lùi về trang cuối', () => {
    const setPage = vi.fn()
    renderHook(() => useClampPage(3, 5, setPage))
    expect(setPage).toHaveBeenCalledExactlyOnceWith(3)
  })

  it('page hợp lệ → không làm gì', () => {
    const setPage = vi.fn()
    renderHook(() => useClampPage(3, 3, setPage))
    expect(setPage).not.toHaveBeenCalled()
  })

  it.each([0, undefined])('totalPages=%s (rỗng / dữ liệu giữ chỗ) → không làm gì', (total) => {
    const setPage = vi.fn()
    renderHook(() => useClampPage(total, 4, setPage))
    expect(setPage).not.toHaveBeenCalled()
  })
})
