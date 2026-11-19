import {
  deleteData,
  getData,
  getPaginated,
  patchData,
  postData,
  postFile,
  type UploadFile,
} from '@/shared/api/http'
import { fetchPagesUpToCap } from '@/shared/api/fetch-all-pages'
import type { SlimForm } from '@/shared/lib/slim-form'
import type { Paginated } from '@/shared/api/types'
import type {
  ExportForm,
  ExportFormFilters,
  ExportFormInput,
  ExportFormStatus,
  ExportFormUpdateInput,
} from '../model/types'

export const LIST_PAGE_SIZE = 20
/** Số phiếu mới nhất dùng để gợi ý người nhận (`useRecentReceivers`). */
export const RECENT_RECEIVERS_PAGE_SIZE = 50

const base = (warehouseSlug: string) => `/warehouses/${warehouseSlug}/export-forms`

const CODE_SEARCH = /^[A-Z0-9_-]+$/

const emptyPage = (page: number): Paginated<ExportForm> => ({
  items: [],
  total: 0,
  page,
  pageSize: LIST_PAGE_SIZE,
  totalPages: 0,
  hasNext: false,
  hasPrevious: page > 1,
})

export async function fetchExportForms(
  warehouseSlug: string,
  {
    page,
    size = LIST_PAGE_SIZE,
    status,
    type,
    field,
    query,
    startDate,
    endDate,
    requesterSlug,
    approverSlug,
  }: { page: number; size?: number } & ExportFormFilters,
): Promise<Paginated<ExportForm>> {
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
  return getPaginated<ExportForm>(base(warehouseSlug), {
    page,
    size,
    sort: 'DESC',
    status,
    type,
    startDate,
    endDate,
    requesterSlug,
    approverSlug,
    ...search,
  })
}

export type ExportFormSum = {
  sum: number
  count: number
  truncated: boolean
}

/**
 * Tổng tiền (`totalAmount`) các phiếu theo trạng thái của cả kho trong khoảng ngày lập (YYYY-MM-DD, gồm hai đầu).
 * Đi hết các trang; chạm trần trang thì `truncated: true` (tổng chỉ là phần đã tải), không ném lỗi.
 */
export async function fetchExportFormSum(
  warehouseSlug: string,
  status: ExportFormStatus,
  range?: { startDate: string; endDate: string },
): Promise<ExportFormSum> {
  const { items, truncated } = await fetchPagesUpToCap<ExportForm>(base(warehouseSlug), {
    status,
    ...range,
  })
  // Phân trang offset: dữ liệu đổi giữa chừng có thể lặp phiếu → mỗi `slug` chỉ tính một lần.
  const unique = [...new Map(items.map((f) => [f.slug, f])).values()]
  return {
    sum: unique.reduce((acc, f) => acc + f.totalAmount, 0),
    count: unique.length,
    truncated,
  }
}

/** Đếm phiếu theo trạng thái của cả kho: xin 1 phần tử, đọc `total`. `day` (YYYY-MM-DD) = chỉ phiếu lập ngày đó. */
export const fetchExportFormCount = async (
  warehouseSlug: string,
  status: ExportFormStatus,
  day?: string,
): Promise<number> =>
  (
    await getPaginated<ExportForm>(base(warehouseSlug), {
      page: 1,
      size: 1,
      status,
      ...(day ? { startDate: day, endDate: day } : null),
    })
  ).total

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

/** `DRAFT → PENDING`: giữ chỗ tồn / lô (lô đã chọn, hoặc hạn gần nhất trước). Body `{ version }`. */
export const submitExportForm = (
  warehouseSlug: string,
  slug: string,
  version: number,
): Promise<ExportForm> => postData<ExportForm>(`${base(warehouseSlug)}/${slug}/submit`, { version })

/** `PENDING → CONFIRMED`: trừ tồn đã giữ chỗ. Cần `EXPORT_FORM_CONFIRM` (+ APPROVE_DISPOSAL cho xuất huỷ). */
export const confirmExportForm = (
  warehouseSlug: string,
  slug: string,
  version: number,
): Promise<ExportForm> =>
  postData<ExportForm>(`${base(warehouseSlug)}/${slug}/confirm`, { version })

/** `DRAFT | PENDING → CANCELLED`; huỷ phiếu Chờ duyệt trả lại phần đã giữ chỗ. */
export const cancelExportForm = (
  warehouseSlug: string,
  slug: string,
  version: number,
): Promise<ExportForm> => postData<ExportForm>(`${base(warehouseSlug)}/${slug}/cancel`, { version })

/** Chỉ xoá được Nháp; không body. */
export const deleteExportForm = (warehouseSlug: string, slug: string): Promise<string> =>
  deleteData<string>(`${base(warehouseSlug)}/${slug}`)

/** Tải chứng từ lên trước khi lưu phiếu; trả URL để gửi ở trường `file`. */
export function uploadExportFormFile(warehouseSlug: string, file: UploadFile): Promise<string> {
  return postFile<string>(`${base(warehouseSlug)}/upload-file`, file)
}

/**
 * Mọi phiếu ĐÃ XÁC NHẬN của cả kho trong khoảng ngày lập (đi hết các trang, bỏ trùng slug) ở dạng gọn
 * cho tab Tổng quan. `party` = `receiver` (bên nhận).
 * `truncated` = chạm trần trang (dữ liệu không đủ).
 */
export async function fetchConfirmedForms(
  warehouseSlug: string,
  range: { startDate: string; endDate: string },
  signal?: AbortSignal,
): Promise<{ forms: SlimForm[]; truncated: boolean }> {
  const { items, truncated } = await fetchPagesUpToCap<ExportForm>(
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
      amount: f.totalAmount,
      party: f.receiver || null,
      kind: 'export' as const,
    })),
    truncated,
  }
}
