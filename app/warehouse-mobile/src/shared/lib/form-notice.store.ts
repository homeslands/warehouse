import { create } from 'zustand'

/**
 * Thông báo MỨC PHIẾU của form 3 bước (lỗi ghi server, gộp sau lệch version, thiếu hàng…), thấy được ở
 * MỌI bước của đúng phiếu — mỗi bước là một route riêng nên thông báo không thể là state của một màn.
 * `kind` vì phiếu nhập và phiếu xuất có thể cùng mở ở hai tab, cả hai trên `'new'`.
 * `shortageKeys`: khoá các dòng thiếu hàng (phiếu xuất) để bước 2 tô; `detail`: dữ liệu kèm theo do
 * chính nơi ghi (`kind`) hiểu — store giữ NGUYÊN như được đưa, không đọc / sao chép (vd phiếu xuất: chi
 * tiết thiếu hàng từng dòng cho "Thiếu n …"); `offerDiscard`: thông báo kèm nút "Bỏ thay đổi trên máy".
 * Chỉ trong bộ nhớ, một thông báo một lúc (thông báo mới thay thông báo cũ).
 */
export type FormNotice = {
  kind: 'import' | 'export'
  formSlug: string
  message: string
  shortageKeys?: readonly string[]
  detail?: unknown
  offerDiscard?: boolean
}

type State = {
  notice: FormNotice | null
  show: (notice: FormNotice) => void
  /** Bỏ thông báo của đúng loại + phiếu; thông báo của phiếu khác giữ nguyên. */
  dismiss: (kind: FormNotice['kind'], formSlug: string) => void
  /** Bỏ mọi thông báo (hết phiên, đổi kho — nối ở `session-wiring.ts`). */
  reset: () => void
}

export const useFormNotice = create<State>((set, get) => ({
  notice: null,
  show: (notice) => set({ notice }),
  dismiss: (kind, formSlug) => {
    const n = get().notice
    if (n && n.kind === kind && n.formSlug === formSlug) set({ notice: null })
  },
  reset: () => set({ notice: null }),
}))
