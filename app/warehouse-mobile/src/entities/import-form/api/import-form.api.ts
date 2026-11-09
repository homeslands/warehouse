import {
  deleteData,
  getData,
  getPaginated,
  patchData,
  postData,
  postFile,
  type UploadFile,
} from '@/shared/api/http'
import type { Paginated } from '@/shared/api/types'
import type {
  AvailableMaterial,
  ImportForm,
  ImportFormFilters,
  ImportFormInput,
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

/** Tải chứng từ lên trước khi lưu phiếu; trả URL để gửi ở trường `file`. */
export function uploadImportFormFile(warehouseSlug: string, file: UploadFile): Promise<string> {
  return postFile<string>(`${base(warehouseSlug)}/upload-file`, file)
}
