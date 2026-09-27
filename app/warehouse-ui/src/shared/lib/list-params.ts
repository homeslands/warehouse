import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { z } from 'zod'

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
export const DEFAULT_PAGE = 1
export const DEFAULT_PAGE_SIZE: PageSize = 10

/**
 * `z.object({})` suy ra `Record<string, never>`; ghép với `{ page, size }` thành `never`.
 * Bỏ index signature, chỉ giữ các khoá khai thật.
 */
type KnownKeys<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K]
}

/** Bộ lọc mà màn khai bằng Zod object. Giá trị đọc từ URL là chuỗi — lọc số dùng `z.coerce`. */
export type ListFilters<S extends z.ZodObject> = KnownKeys<z.output<S>>

/**
 * Một cột đang sắp xếp. Backend nhận `sort?: string[]` dạng `['createdAt:DESC']`
 * (`BaseQueryDto`), nên URL cũng dùng đúng dạng `?sort=createdAt:DESC` — một nơi một định dạng.
 * Chỉ hỗ trợ MỘT cột: backend chưa xử lý `sort` nên đa cột là bịa hợp đồng.
 */
export type SortState = { field: string; dir: 'ASC' | 'DESC' }

export type ListParamsState<S extends z.ZodObject> = {
  page: number
  size: number
  filters: ListFilters<S>
  /** `undefined` = chưa chọn cột nào; danh sách dùng thứ tự mặc định của backend. */
  sort: SortState | undefined
  setPage: (page: number) => void
  /** Đổi số dòng → về trang 1. */
  setSize: (size: number) => void
  /** Gộp vào bộ lọc hiện tại; `undefined`/`''` là bỏ lọc. Đổi bộ lọc → về trang 1. */
  setFilters: (patch: Partial<ListFilters<S>>) => void
  /** `undefined` = bỏ sắp xếp. Đổi sắp xếp → về trang 1 (trang 2 của thứ tự cũ là vô nghĩa). */
  setSort: (next: SortState | undefined) => void
}

/** `"name:DESC"` → `{ field: 'name', dir: 'DESC' }`. Sai dạng thì bỏ qua, không ném. */
function parseSort(raw: string | null): SortState | undefined {
  if (raw === null) return undefined
  const parts = raw.split(':')
  if (parts.length !== 2) return undefined
  const [field, rawDir] = parts
  const dir = rawDir.toUpperCase()
  if (field === '' || (dir !== 'ASC' && dir !== 'DESC')) return undefined
  return { field, dir }
}

function formatSort(sort: SortState | undefined): string {
  return sort === undefined ? '' : `${sort.field}:${sort.dir}`
}

/**
 * Đổi sang tham số `getPaginated` gửi lên backend. `BaseQueryDto` khai `sort?: string[]` kèm
 * `@IsArray()`, nên phải là MẢNG dù FE chỉ sắp một cột. Dùng hàm này thay vì tự nối chuỗi.
 */
export function sortToParam(sort: SortState | undefined): string[] | undefined {
  return sort === undefined ? undefined : [formatSort(sort)]
}

function parsePage(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return DEFAULT_PAGE
  const n = Number(raw)
  return Number.isSafeInteger(n) && n >= 1 ? n : DEFAULT_PAGE
}

function parseSize(raw: string | null): PageSize {
  const n = Number(raw)
  return PAGE_SIZE_OPTIONS.find((option) => option === n) ?? DEFAULT_PAGE_SIZE
}

function parseFilters<S extends z.ZodObject>(
  schema: S,
  keys: string[],
  searchParams: URLSearchParams,
): ListFilters<S> {
  const raw: Record<string, string> = {}
  for (const key of keys) {
    const value = searchParams.get(key)
    if (value !== null && value !== '') raw[key] = value
  }
  const parsed = schema.safeParse(raw)
  if (parsed.success) return parsed.data as ListFilters<S>
  // URL sửa tay sai một bộ lọc không được xoá các bộ lọc đúng: bỏ riêng khoá lỗi rồi thử lại.
  const invalid = new Set(parsed.error.issues.map((issue) => String(issue.path[0])))
  const valid = Object.fromEntries(Object.entries(raw).filter(([key]) => !invalid.has(key)))
  const retried = schema.safeParse(valid)
  return (retried.success ? retried.data : {}) as ListFilters<S>
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Trang, số dòng và bộ lọc của một màn danh sách, lưu trên URL — F5, gửi link, Back đều giữ đúng
 * chỗ. Giá trị sai trên URL rơi về mặc định, không ném lỗi. URL chỉ ghi giá trị khác mặc định;
 * tham số không thuộc hook được giữ nguyên. Ghi bằng `replace`: Back rời màn thay vì lùi từng trang.
 *
 * `schema` phải là hằng khai ngoài component (vd `const FILTERS = z.object({...})`).
 */
export function useListParams<S extends z.ZodObject>(schema: S): ListParamsState<S> {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterKeys = useMemo(() => Object.keys(schema.shape), [schema])

  const page = parsePage(searchParams.get('page'))
  const size = parseSize(searchParams.get('size'))
  const sortRaw = searchParams.get('sort')
  const sort = useMemo(() => parseSort(sortRaw), [sortRaw])
  const filters = useMemo(
    () => parseFilters(schema, filterKeys, searchParams),
    [schema, filterKeys, searchParams],
  )

  // `setSearchParams(prev => …)` của React Router 7 truyền `searchParams` của lần render trước,
  // không phải giá trị vừa ghi → hai setter gọi liền nhau trong một tick, lần sau đè mất lần trước.
  // Nên mọi lần ghi tính từ `latest`: URL vừa ghi, hoặc URL mới nhất router trả về. Chỉ đồng bộ khi
  // router đưa ra `searchParams` mới — render lại với object cũ không được đè giá trị vừa ghi.
  const latest = useRef(searchParams)
  const seen = useRef(searchParams)
  if (seen.current !== searchParams) {
    seen.current = searchParams
    latest.current = searchParams
  }
  // Setter đọc qua ref để giữ nguyên identity khi URL đổi (`setSearchParams` đổi theo mỗi URL).
  const deps = useRef({ schema, filterKeys, setSearchParams })
  deps.current = { schema, filterKeys, setSearchParams }

  const setters = useMemo(() => {
    type State = {
      page: number
      size: number
      filters: Record<string, unknown>
      sort: SortState | undefined
    }

    const write = (change: (current: State) => State) => {
      const { schema: currentSchema, filterKeys: keys, setSearchParams: set } = deps.current
      const prev = latest.current
      const next = change({
        page: parsePage(prev.get('page')),
        size: parseSize(prev.get('size')),
        filters: parseFilters(currentSchema, keys, prev),
        sort: parseSort(prev.get('sort')),
      })

      const out = new URLSearchParams(prev)
      for (const key of ['page', 'size', 'sort', ...keys]) out.delete(key)
      if (next.page !== DEFAULT_PAGE) out.set('page', String(next.page))
      if (next.size !== DEFAULT_PAGE_SIZE) out.set('size', String(next.size))
      for (const [key, value] of Object.entries(next.filters)) {
        if (!isEmpty(value)) out.set(key, String(value))
      }
      if (!isEmpty(formatSort(next.sort))) out.set('sort', formatSort(next.sort))
      latest.current = out
      set(out, { replace: true })
    }

    return {
      setPage: (nextPage: number) => write((current) => ({ ...current, page: nextPage })),
      setSize: (nextSize: number) =>
        write((current) => ({ ...current, page: DEFAULT_PAGE, size: nextSize })),
      setFilters: (patch: Partial<ListFilters<S>>) =>
        write((current) => ({
          ...current,
          page: DEFAULT_PAGE,
          filters: { ...current.filters, ...patch },
        })),
      setSort: (next: SortState | undefined) =>
        write((current) => ({ ...current, page: DEFAULT_PAGE, sort: next })),
    }
  }, [])

  return { page, size, filters, sort, ...setters }
}

/**
 * Xoá nốt bản ghi cuối của trang cuối làm `totalPages` giảm, nhưng `page` trên URL thì không tự
 * biết → người dùng kẹt ở trang rỗng. Hook lùi về trang cuối hợp lệ.
 *
 * - `totalPages < 1` (danh sách rỗng hoàn toàn, backend trả 0): không làm gì — `setPage(0)` gửi
 *   page=0, trang không tồn tại, gây vòng lặp request.
 * - Dữ liệu giữ chỗ (keepPreviousData) là của trang khác: bên gọi truyền `undefined`.
 */
export function useClampPage(
  totalPages: number | undefined,
  page: number,
  setPage: (page: number) => void,
): void {
  useEffect(() => {
    if (totalPages === undefined || totalPages < 1) return
    if (page > totalPages) setPage(totalPages)
  }, [totalPages, page, setPage])
}
