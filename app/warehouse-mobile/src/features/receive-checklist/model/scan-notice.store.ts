import { create } from 'zustand'

import { useWarehouseStore } from '@/entities/warehouse'

/**
 * Mã vừa quét trong phiếu mà không xử lý được: sheet `/scan-line` ghi vào đây rồi đóng, màn phiếu hiện
 * thông báo mức phiếu. `reason`: `notFound` (checklist: không có trên phiếu; màn soạn: không có trên
 * phiếu lẫn trong vật tư của kho), `notOnForm` (màn soạn, người thiếu IMPORT_FORM_CREATE: không có trên
 * phiếu — không tra / thêm vật tư mới), `full` (màn soạn: phiếu đủ 200 dòng), `noUnit` (màn soạn: vật tư
 * chưa khai đơn vị), `notInWarehouse` (màn soạn: vật tư có trong danh mục nhưng chưa gắn vào kho — kèm
 * `material`; màn phiếu cho gắn rồi thêm dòng). `notFound` của màn soạn kèm `canCreate`: tra danh mục xong
 * mà không có mã (true) / không tra được (lỗi mạng, thiếu MATERIAL_READ → false, không gợi ý tạo). Gắn với phiếu (`formSlug` của bản nháp lúc quét) — màn phiếu chỉ hiện khi trùng phiếu
 * của nó. Chỉ trong bộ nhớ; xoá khi đóng thông báo, quét khớp, rời màn, kết thúc phiên và đổi kho
 * (`session-wiring.ts`).
 */
export type ScanNoticeReason = 'notFound' | 'notOnForm' | 'full' | 'noUnit' | 'notInWarehouse'
export type ScanNoticeMaterial = {
  slug: string
  code: string
  name: string
  /** Bên bán THẬT của vật tư (danh mục) — dòng thêm sau khi gắn kho dùng đúng danh sách này. */
  suppliers: { slug: string; code: string; name: string }[]
}
export type ScanNotice = {
  formSlug: string
  code: string
  reason: ScanNoticeReason
  /** `notInWarehouse`: vật tư của danh mục. */
  material?: ScanNoticeMaterial
  /** `notFound` (màn soạn): được gợi ý "Tạo vật tư" (đã tra danh mục và không có mã). */
  canCreate?: boolean
}

type ScanNoticeState = {
  notice: ScanNotice | null
  show: (
    formSlug: string,
    code: string,
    reason?: ScanNoticeReason,
    extra?: { material?: ScanNoticeMaterial; canCreate?: boolean },
  ) => void
  clear: () => void
}

export const useScanNotice = create<ScanNoticeState>((set) => ({
  notice: null,
  show: (formSlug, code, reason = 'notFound', extra) =>
    set({ notice: { formSlug, code, reason, ...extra } }),
  clear: () => set({ notice: null }),
}))

/** Đổi kho → bỏ thông báo (của phiếu thuộc kho cũ). Trả hàm gỡ. */
export function resetScanNoticeOnWarehouseChange(): () => void {
  return useWarehouseStore.subscribe((state, prev) => {
    if (state.current?.slug !== prev.current?.slug) useScanNotice.getState().clear()
  })
}
