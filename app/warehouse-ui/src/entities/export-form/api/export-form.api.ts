import { deleteData, getData, getPaginated, patchData, postData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type {
  ExportForm,
  ExportFormFilters,
  ExportFormInput,
  ExportFormUpdateInput,
} from '../model/types'

/** Phiếu xuất luôn lồng dưới kho: `/warehouses/:warehouseSlug/export-forms`. */
const base = (warehouseSlug: string) => `/warehouses/${warehouseSlug}/export-forms`

export const fetchExportForms = (
  warehouseSlug: string,
  params: ListParams<ExportFormFilters>,
): Promise<Paginated<ExportForm>> => getPaginated<ExportForm>(base(warehouseSlug), params)

export const fetchExportForm = (warehouseSlug: string, slug: string): Promise<ExportForm> =>
  getData<ExportForm>(`${base(warehouseSlug)}/${slug}`)

export const createExportForm = (
  warehouseSlug: string,
  input: ExportFormInput,
): Promise<ExportForm> => postData<ExportForm>(base(warehouseSlug), input)

export const updateExportForm = (
  warehouseSlug: string,
  slug: string,
  input: ExportFormUpdateInput,
): Promise<ExportForm> => patchData<ExportForm>(`${base(warehouseSlug)}/${slug}`, input)

/** Xoá mềm — mã phiếu vẫn bị giữ (101405). Chỉ phiếu `DRAFT`. */
export const removeExportForm = (warehouseSlug: string, slug: string): Promise<string> =>
  deleteData<string>(`${base(warehouseSlug)}/${slug}`)

/** `DRAFT → PENDING`: giữ chỗ tồn kho + lô (BE có thể tách dòng theo lô). Thiếu hàng → 409 100817 / 101502. */
export const submitExportForm = (
  warehouseSlug: string,
  slug: string,
  version: number,
): Promise<ExportForm> => postData<ExportForm>(`${base(warehouseSlug)}/${slug}/submit`, { version })

/** `PENDING → CONFIRMED`: trừ tồn kho thật. */
export const confirmExportForm = (
  warehouseSlug: string,
  slug: string,
  version: number,
): Promise<ExportForm> =>
  postData<ExportForm>(`${base(warehouseSlug)}/${slug}/confirm`, { version })

/** `DRAFT | PENDING → CANCELLED`: nhả phần giữ chỗ nếu có. */
export const cancelExportForm = (
  warehouseSlug: string,
  slug: string,
  version: number,
): Promise<ExportForm> => postData<ExportForm>(`${base(warehouseSlug)}/${slug}/cancel`, { version })

/**
 * Tải chứng từ lên S3, trả về link để gửi ở field `file` của create / update. Multipart field
 * `file`; axios tự đặt `Content-Type` kèm boundary khi body là `FormData` nên không đặt tay.
 */
export const uploadExportFormFile = (warehouseSlug: string, file: File): Promise<string> => {
  const body = new FormData()
  body.append('file', file)
  return postData<string>(`${base(warehouseSlug)}/upload-file`, body)
}
