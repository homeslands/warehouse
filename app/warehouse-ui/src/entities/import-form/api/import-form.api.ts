import { deleteData, getData, getPaginated, patchData, postData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type {
  AvailableMaterial,
  ImportForm,
  ImportFormFilters,
  ImportFormInput,
  ImportFormUpdateInput,
} from '../model/types'

/** Phiếu nhập luôn lồng dưới kho: `/warehouses/:warehouseSlug/import-forms`. */
const base = (warehouseSlug: string) => `/warehouses/${warehouseSlug}/import-forms`

export const fetchImportForms = (
  warehouseSlug: string,
  params: ListParams<ImportFormFilters>,
): Promise<Paginated<ImportForm>> => getPaginated<ImportForm>(base(warehouseSlug), params)

export const fetchImportForm = (warehouseSlug: string, slug: string): Promise<ImportForm> =>
  getData<ImportForm>(`${base(warehouseSlug)}/${slug}`)

/** Gác bằng `IMPORT_FORM_CREATE` (không phải READ) ở backend. */
export const fetchAvailableMaterials = (
  warehouseSlug: string,
  params: ListParams<{ code?: string; name?: string }>,
): Promise<Paginated<AvailableMaterial>> =>
  getPaginated<AvailableMaterial>(`${base(warehouseSlug)}/available-materials`, params)

export const createImportForm = (
  warehouseSlug: string,
  input: ImportFormInput,
): Promise<ImportForm> => postData<ImportForm>(base(warehouseSlug), input)

export const updateImportForm = (
  warehouseSlug: string,
  slug: string,
  input: ImportFormUpdateInput,
): Promise<ImportForm> => patchData<ImportForm>(`${base(warehouseSlug)}/${slug}`, input)

/** Xoá mềm — mã phiếu vẫn bị giữ (101305). */
export const removeImportForm = (warehouseSlug: string, slug: string): Promise<string> =>
  deleteData<string>(`${base(warehouseSlug)}/${slug}`)

/** `DRAFT → CONFIRMED`, cộng tồn kho cùng transaction. */
export const confirmImportForm = (
  warehouseSlug: string,
  slug: string,
  version: number,
): Promise<ImportForm> =>
  postData<ImportForm>(`${base(warehouseSlug)}/${slug}/confirm`, { version })

/** `DRAFT → CANCELLED`, không đụng tồn. */
export const cancelImportForm = (
  warehouseSlug: string,
  slug: string,
  version: number,
): Promise<ImportForm> => postData<ImportForm>(`${base(warehouseSlug)}/${slug}/cancel`, { version })
