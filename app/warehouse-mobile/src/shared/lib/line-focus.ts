import { create } from 'zustand'

/** Màn soạn nào nhận yêu cầu: phiếu nhập hay phiếu xuất (mỗi loại một tab, cùng mở được). */
export type LineFocusKind = 'import' | 'export'

/**
 * Yêu cầu MỞ SHEET SỬA của một dòng trên bước 2 của màn soạn phiếu (xuất và nhập, dùng chung; plan
 * wizard-apple Task 6 — trước đây là focus ô số trên thẻ) — bộ chọn vật tư thêm dòng mới (dòng ĐẦU) hoặc
 * quét mã khớp / thêm dòng rồi đóng sheet của nó; màn soạn của đúng loại (`kind`) và đúng phiếu
 * (`formSlug`) đợi được focus lại, bỏ yêu cầu (`clear(kind, formSlug)`, tiêu thụ MỘT lần) rồi mở sheet dòng
 * đó với ô số được focus (`useComposeLineOpen`). Có `kind` vì hai màn soạn có thể cùng mở ở hai tab, cả hai
 * trên phiếu `'new'`. Chỉ trong bộ nhớ; rời màn soạn cũng xoá (chỉ yêu cầu của nó).
 */
export type LineFocusRequest = { kind: LineFocusKind; formSlug: string; key: string }

type State = {
  request: LineFocusRequest | null
  ask: (kind: LineFocusKind, formSlug: string, key: string) => void
  /** Yêu cầu đang chờ của đúng loại + phiếu, không có thì `null`. */
  requestFor: (kind: LineFocusKind, formSlug: string | undefined) => LineFocusRequest | null
  /** Bỏ yêu cầu của đúng loại + phiếu (yêu cầu của màn khác giữ nguyên); không tham số = bỏ mọi yêu cầu. */
  clear: (kind?: LineFocusKind, formSlug?: string) => void
}

const matches = (r: LineFocusRequest | null, kind: LineFocusKind, formSlug: string | undefined) =>
  r !== null && formSlug !== undefined && r.kind === kind && r.formSlug === formSlug

export const useLineFocus = create<State>((set, get) => ({
  request: null,
  ask: (kind, formSlug, key) => set({ request: { kind, formSlug, key } }),
  requestFor: (kind, formSlug) => {
    const r = get().request
    return matches(r, kind, formSlug) ? r : null
  },
  clear: (kind, formSlug) => {
    if (kind === undefined || matches(get().request, kind, formSlug)) set({ request: null })
  },
}))
