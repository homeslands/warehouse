import { create } from 'zustand'

/**
 * Mã vừa quét trong phiếu xuất mà không dùng được: sheet `/scan-export-line` ghi vào đây rồi đóng, màn
 * sửa phiếu hiện thông báo mức phiếu. `reason`: `notFound` — không khớp dòng nào cũng không khớp vật tư
 * nào của kho; `full` — khớp vật tư chưa có dòng nhưng phiếu đã đủ 200 dòng; `noUnit` — vật tư chưa khai
 * đơn vị nên không thêm dòng được. Gắn với phiếu (`formSlug` của bản nháp lúc quét) — màn chỉ hiện khi
 * trùng phiếu của nó. Chỉ trong bộ nhớ; xoá khi đóng thông báo, quét khớp và rời màn sửa (kết thúc
 * phiên / đổi kho cũng rời màn).
 */
export type ScanNoticeReason = 'notFound' | 'full' | 'noUnit'
export type ExportScanNotice = { formSlug: string; code: string; reason: ScanNoticeReason }

type State = {
  notice: ExportScanNotice | null
  show: (formSlug: string, code: string, reason?: ScanNoticeReason) => void
  clear: () => void
}

export const useExportScanNotice = create<State>((set) => ({
  notice: null,
  show: (formSlug, code, reason = 'notFound') => set({ notice: { formSlug, code, reason } }),
  clear: () => set({ notice: null }),
}))
