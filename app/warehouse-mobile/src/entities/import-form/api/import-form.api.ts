import {
  deleteData,
  getData,
  getPaginated,
  patchData,
  postData,
  postFile,
  putData,
  type UploadFile,
} from '@/shared/api/http'
import { fetchPagesUpToCap } from '@/shared/api/fetch-all-pages'
import type { SlimForm } from '@/shared/lib/slim-form'
import type { Paginated } from '@/shared/api/types'
import type {
  AvailableMaterial,
  ImportForm,
  ImportFormFilters,
  ImportFormInput,
  ImportFormStatus,
  ImportFormUpdateInput,
  SupplierOption,
} from '../model/types'

export const LIST_PAGE_SIZE = 20
export const AVAILABLE_PAGE_SIZE = 50
const SUPPLIER_PAGE_SIZE = 100

const base = (warehouseSlug: string) => `/warehouses/${warehouseSlug}/import-forms`

const CODE_SEARCH = /^[A-Z0-9_-]+$/

const emptyPage = (page: number): Paginated<ImportForm> => ({
  items: [],
  total: 0,
  page,
  pageSize: LIST_PAGE_SIZE,
  totalPages: 0,
  hasNext: false,
  hasPrevious: page > 1,
})

export async function fetchImportForms(
  warehouseSlug: string,
  {
    page,
    status,
    field,
    query,
    startDate,
    endDate,
    requesterSlug,
    approverSlug,
  }: { page: number } & ImportFormFilters,
): Promise<Paginated<ImportForm>> {
  let search: Record<string, string> = {}
  const text = query?.trim()
  if (field && text) {
    if (field === 'code') {
      // Mã phiếu lưu viết hoa; backend chỉ nhận [A-Z0-9_-] (sai → 400) nên chữ lạ = không khớp, khỏi hỏi.
      const code = text.toUpperCase()
      if (!CODE_SEARCH.test(code)) return emptyPage(page)
      search = { code }
    } else {
      search = { [field]: text }
    }
  }
  return getPaginated<ImportForm>(base(warehouseSlug), {
    page,
    size: LIST_PAGE_SIZE,
    sort: 'DESC',
    status,
    startDate,
    endDate,
    requesterSlug,
    approverSlug,
    ...search,
  })
}

export type ImportFormSum = {
  sum: number
  count: number
  truncated: boolean
}

/**
 * Tổng tiền (`total`) các phiếu theo trạng thái của cả kho trong khoảng ngày lập (YYYY-MM-DD, gồm hai đầu).
 * Đi hết các trang; chạm trần trang thì `truncated: true` (tổng chỉ là phần đã tải), không ném lỗi.
 */
export async function fetchImportFormSum(
  warehouseSlug: string,
  status: ImportFormStatus,
  range?: { startDate: string; endDate: string },
): Promise<ImportFormSum> {
  const { items, truncated } = await fetchPagesUpToCap<ImportForm>(base(warehouseSlug), {
    status,
    ...range,
  })
  // Phân trang offset: dữ liệu đổi giữa chừng có thể lặp phiếu → mỗi `slug` chỉ tính một lần.
  const unique = [...new Map(items.map((f) => [f.slug, f])).values()]
  return {
    sum: unique.reduce((acc, f) => acc + f.total, 0),
    count: unique.length,
    truncated,
  }
}

/** Đếm phiếu theo trạng thái của cả kho: xin 1 phần tử, đọc `total`. `day` (YYYY-MM-DD) = chỉ phiếu lập ngày đó. */
export const fetchImportFormCount = async (
  warehouseSlug: string,
  status: ImportFormStatus,
  day?: string,
): Promise<number> =>
  (
    await getPaginated<ImportForm>(base(warehouseSlug), {
      page: 1,
      size: 1,
      status,
      ...(day ? { startDate: day, endDate: day } : null),
    })
  ).total

export const fetchImportForm = (warehouseSlug: string, slug: string): Promise<ImportForm> =>
  getData<ImportForm>(`${base(warehouseSlug)}/${slug}`)

const CODE_LIKE = /^[A-Za-z0-9-]+$/

/**
 * Backend không tìm gộp mã/tên: luôn gọi `name`, query dạng mã (chữ-số-gạch) gọi thêm `code`, gộp
 * theo `slug` (kết quả `name` trước); query rỗng = mọi vật tư của kho. Gác bằng `IMPORT_FORM_CREATE` ở
 * backend.
 */
export async function fetchAvailableMaterials(
  warehouseSlug: string,
  { query, page }: { query: string; page: number },
): Promise<Paginated<AvailableMaterial>> {
  const url = `${base(warehouseSlug)}/available-materials`
  // Ô tìm trống → mọi vật tư của kho (backend sắp theo mã), không gửi `name` / `code`.
  if (query === '') return getPaginated<AvailableMaterial>(url, { page, size: AVAILABLE_PAGE_SIZE })
  const get = (key: 'name' | 'code') =>
    getPaginated<AvailableMaterial>(url, { page, size: AVAILABLE_PAGE_SIZE, [key]: query })
  const [byName, byCode] = await Promise.all([
    get('name'),
    CODE_LIKE.test(query) ? get('code') : Promise.resolve(null),
  ])
  if (!byCode) return byName

  const seen = new Set<string>()
  const items = [...byName.items, ...byCode.items].filter((m) => {
    if (seen.has(m.slug)) return false
    seen.add(m.slug)
    return true
  })
  return {
    ...byName,
    items,
    total: items.length,
    hasNext: byName.hasNext || byCode.hasNext,
  }
}

export const createImportForm = (
  warehouseSlug: string,
  input: ImportFormInput,
): Promise<ImportForm> => postData<ImportForm>(base(warehouseSlug), input)

export const updateImportForm = (
  warehouseSlug: string,
  slug: string,
  input: ImportFormUpdateInput,
): Promise<ImportForm> => patchData<ImportForm>(`${base(warehouseSlug)}/${slug}`, input)

/** `DRAFT → CONFIRMED`, cộng tồn kho cùng transaction. Dùng `version` trả về từ PATCH ngay trước. */
export const confirmImportForm = (
  warehouseSlug: string,
  slug: string,
  version: number,
): Promise<ImportForm> =>
  postData<ImportForm>(`${base(warehouseSlug)}/${slug}/confirm`, { version })

/** `DRAFT → CANCELLED`: tồn kho không đổi. Cần `IMPORT_FORM_CONFIRM`. */
export const cancelImportForm = (
  warehouseSlug: string,
  slug: string,
  version: number,
): Promise<ImportForm> => postData<ImportForm>(`${base(warehouseSlug)}/${slug}/cancel`, { version })

/** Chỉ xoá được Nháp; không body. */
export const deleteImportForm = (warehouseSlug: string, slug: string): Promise<string> =>
  deleteData<string>(`${base(warehouseSlug)}/${slug}`)

/** Cần `SUPPLIER_READ`. Một trang 100 — đủ cho danh sách chọn bên bán. */
export async function fetchSuppliers(): Promise<SupplierOption[]> {
  const res = await getPaginated<SupplierOption>('/suppliers', {
    page: 1,
    size: SUPPLIER_PAGE_SIZE,
  })
  return res.items.map(({ slug, code, name }) => ({ slug, code, name }))
}

/**
 * Gắn MỘT vật tư vào bên bán (`PUT /suppliers/:slug/materials`, body `{ materialSlugs }`; BE cần SUPPLIER_UPDATE
 * + MATERIAL_UPDATE). BE thêm vào danh sách vật tư của bên bán, không thay thế.
 */
export async function attachMaterialToSupplier(
  supplierSlug: string,
  materialSlug: string,
): Promise<void> {
  await putData<unknown>(`/suppliers/${supplierSlug}/materials`, { materialSlugs: [materialSlug] })
}

/** Tải chứng từ lên trước khi lưu phiếu; trả URL để gửi ở trường `file`. */
export function uploadImportFormFile(warehouseSlug: string, file: UploadFile): Promise<string> {
  return postFile<string>(`${base(warehouseSlug)}/upload-file`, file)
}

/** Kết quả tải hết vật tư của kho: `truncated` = chạm trần 50 trang (kho quá lớn) — chỉ có phần đầu. */
export type AllAvailableMaterials = { items: AvailableMaterial[]; truncated: boolean }

/**
 * Mọi vật tư của kho cho bộ chọn phiếu nhập: đi hết các trang `available-materials` (size 100, tối đa 50
 * trang — quá thì trả phần đã tải + `truncated: true`, không ném lỗi), khử trùng theo `slug` (trang sau có
 * thể lặp khi dữ liệu đổi giữa chừng).
 */
export async function fetchAllAvailableMaterials(
  warehouseSlug: string,
): Promise<AllAvailableMaterials> {
  const { items, truncated } = await fetchPagesUpToCap<AvailableMaterial>(
    `${base(warehouseSlug)}/available-materials`,
  )
  const seen = new Set<string>()
  return {
    items: items.filter((m) => (seen.has(m.slug) ? false : (seen.add(m.slug), true))),
    truncated,
  }
}

/**
 * Mọi phiếu ĐÃ XÁC NHẬN của cả kho trong khoảng ngày lập (đi hết các trang, bỏ trùng slug) ở dạng gọn
 * cho tab Tổng quan. `party` = `requesterName` (người lập — phiếu nhập ở danh sách không có tên NCC).
 * `truncated` = chạm trần trang (dữ liệu không đủ).
 */
export async function fetchConfirmedForms(
  warehouseSlug: string,
  range: { startDate: string; endDate: string },
  signal?: AbortSignal,
): Promise<{ forms: SlimForm[]; truncated: boolean }> {
  const { items, truncated } = await fetchPagesUpToCap<ImportForm>(
    base(warehouseSlug),
    {
      status: 'CONFIRMED',
      ...range,
    },
    signal,
  )
  const unique = [...new Map(items.map((f) => [f.slug, f])).values()]
  return {
    forms: unique.map((f) => ({
      slug: f.slug,
      code: f.code,
      createdAt: f.createdAt,
      amount: f.total,
      party: f.requesterName || null,
      kind: 'import' as const,
    })),
    truncated,
  }
}
