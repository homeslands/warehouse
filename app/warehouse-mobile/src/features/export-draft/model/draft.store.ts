import { create } from 'zustand'

import type { ExportForm } from '@/entities/export-form'
import { createDraftPersistence } from '@/shared/lib/draft-persistence'
import { kv } from '@/shared/storage/kv'

import {
  draftFromForm,
  exportLineKey,
  hasEdits,
  newExportDraft,
  type ExportDraft,
  type ExportHeader,
  type ExportHeaderField,
  type ExportLine,
} from './draft'
import { mergeAfterConflict } from './merge'

export type DraftContext = { userSlug: string; warehouseSlug: string; formSlug: string | 'new' }

/**
 * Trường sửa được của một dòng đã có. Đổi đơn vị phải đổi cả ba trường `unitSlug` / `unitName` /
 * `conversionRate`; dòng giữ vị trí và `base` (khoá mới tính lại, trùng dòng khác thì bị từ chối).
 */
export type LinePatch = Partial<
  Pick<
    ExportLine,
    | 'unitSlug'
    | 'unitName'
    | 'conversionRate'
    | 'quantity'
    | 'unitPrice'
    | 'batchSlug'
    | 'batchExpiryDate'
    | 'note'
  >
>

/**
 * Kết quả `load`, để màn báo người dùng khi phần làm trên máy bị ảnh hưởng:
 * - `local`: có bản nháp đã lưu trên máy cho phiếu này;
 * - `edited`: bản lưu đó có sửa thật so với phiếu lúc tải (`hasEdits` — cả đầu phiếu lẫn dòng);
 * - `merged`: version trên server khác bản lưu → đã gộp (`mergeAfterConflict`);
 * - `removed`: tên vật tư của các dòng trên máy không còn trên server;
 * - `headerConflicts`: trường đầu phiếu đã sửa trên máy nhưng server đổi khác → đã lấy của server.
 */
export type LoadResult = {
  local: boolean
  edited: boolean
  merged: boolean
  removed: string[]
  headerConflicts: ExportHeaderField[]
}

/**
 * Kết quả `addLine` / `updateLine`: `ok` kèm khoá (mới) của dòng; `duplicate` = sẽ trùng khoá dòng
 * `existingKey` nên không đổi gì; `ignored` = không áp dụng (đang lưu, chưa có bản nháp, không có dòng).
 */
export type LineChange =
  | { ok: true; key: string }
  | { ok: false; reason: 'duplicate'; existingKey: string }
  | { ok: false; reason: 'ignored' }

const IGNORED: LineChange = { ok: false, reason: 'ignored' }

const NOTHING_LOADED: LoadResult = {
  local: false,
  edited: false,
  merged: false,
  removed: [],
  headerConflicts: [],
}

export function exportDraftStorageKey(
  userSlug: string,
  warehouseSlug: string,
  formSlug: string,
): string {
  return `warehouse.exportDraft.${userSlug}.${warehouseSlug}.${formSlug}`
}

const keyOf = (c: DraftContext) => exportDraftStorageKey(c.userSlug, c.warehouseSlug, c.formSlug)

type DraftState = {
  ctx: DraftContext | null
  draft: ExportDraft | null
  /**
   * Đang ghi lên server (Lưu / Gửi duyệt). Trong lúc này mọi sửa trên máy bị bỏ qua: kết quả về sẽ
   * thay bản nháp bằng phiếu đã lưu (`adoptServerForm`), sửa gõ giữa chừng sẽ mất không báo.
   */
  saving: boolean
  /**
   * Phiên của bản nháp: tăng khi bản nháp bị bỏ (`discard`) hay hết phiên (`reset`); nạp / sửa / gộp
   * cùng phiếu không đổi. Kết quả async gắn vào bản nháp (vd chứng từ tải lên xong) so phiên này để
   * không gắn vào bản nháp mở lại sau khi bỏ.
   */
  session: number
  setSaving: (saving: boolean) => void
  /** `form` null + `formSlug` 'new' → bản trắng (chưa ghi gì tới khi người dùng sửa). */
  load: (ctx: DraftContext, form: ExportForm | null) => Promise<LoadResult>
  /** Khoá dòng luôn duy nhất trong bản nháp: dòng trùng khoá bị từ chối. */
  addLine: (line: ExportLine) => LineChange
  updateLine: (key: string, patch: LinePatch) => LineChange
  removeLine: (key: string) => void
  setHeader: (patch: Partial<ExportHeader>) => void
  /**
   * Thay cả bản nháp (bản đã gộp sau lệch version — `mergeAfterConflict`) rồi hẹn ghi. Chạy cả khi
   * đang khoá `saving` (chính luồng Lưu / Gửi duyệt gọi). Chưa nạp phiếu nào → bỏ qua.
   */
  replace: (draft: ExportDraft) => void
  /**
   * Đặt bản nháp TRONG BỘ NHỚ, không hẹn ghi (bản trắng có mã gợi ý của phiếu mới): chưa có gì của
   * người dùng nên chưa lưu `kv` — lần sửa đầu tiên mới ghi. Chưa nạp phiếu nào → bỏ qua.
   */
  seed: (draft: ExportDraft) => void
  /** "Bỏ thay đổi": xoá bản lưu và bản trong bộ nhớ. */
  discard: () => Promise<void>
  /**
   * Sau Lưu / Tạo thành công: dựng lại từ phiếu server. Không còn gì chỉ có trên máy nên xoá bản lưu
   * cũ (cả khoá `new` lẫn khoá của phiếu) — để bản cũ lại sẽ hồi sinh phần đã gửi ở lần mở sau.
   */
  adoptServerForm: (form: ExportForm) => void
  /** Hết phiên: chỉ xoá bộ nhớ (sau khi ghi nốt phần đang chờ); bản đã lưu được GIỮ. */
  reset: () => void
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Bản lưu cũ / hỏng không được làm sập `mergeAfterConflict` hay màn hình. */
export function isValidDraft(v: unknown): v is ExportDraft {
  if (!isObj(v) || !isObj(v.header) || !Array.isArray(v.lines)) return false
  if (v.version !== null && typeof v.version !== 'number') return false
  // Bản lưu cũ chưa có `headerBase` vẫn hợp lệ (`load` bổ sung).
  if (v.headerBase !== undefined && v.headerBase !== null && !isObj(v.headerBase)) return false
  return v.lines.every(
    (l) =>
      isObj(l) &&
      typeof l.key === 'string' &&
      typeof l.materialSlug === 'string' &&
      typeof l.unitSlug === 'string' &&
      typeof l.quantity === 'number' &&
      typeof l.conversionRate === 'number',
  )
}

/**
 * Bản lưu trước khi có `headerBase`: không biết đầu phiếu lúc tải nên coi đầu phiếu đang lưu là gốc
 * (phần đầu phiếu đã sửa khi đó không phân biệt được — gộp sau lệch version lấy của server như trước).
 * Phiếu mới (`version` null) không có gốc.
 */
function withHeaderBase(d: ExportDraft): ExportDraft {
  // Bản lưu trước khi có `file`: cả hai đầu phiếu đọc ra `null` (PATCH không gửi `file`).
  const header = d.header.file === undefined ? { ...d.header, file: null } : d.header
  const headerBase =
    d.headerBase === undefined
      ? d.version === null
        ? null
        : header
      : d.headerBase !== null && d.headerBase.file === undefined
        ? { ...d.headerBase, file: null }
        : d.headerBase
  return header === d.header && headerBase === d.headerBase ? d : { ...d, header, headerBase }
}

// Tăng mỗi khi load/reset/discard: kết quả async cũ không được ghi đè trạng thái mới.
let epoch = 0
const persistence = createDraftPersistence(() => {
  const { ctx, draft } = useExportDraft.getState()
  return ctx && draft ? { key: keyOf(ctx), value: { ...draft, savedAt: Date.now() } } : null
})
const { flush, schedule: schedulePersist, cancel: cancelTimer } = persistence

/** Gỡ lắng nghe `AppState` và huỷ ghi đang chờ. Dùng ở teardown của test. */
export const stopExportDraftPersistence = persistence.stop

export const useExportDraft = create<DraftState>((set, get) => {
  /** Áp thay đổi lên bản nháp hiện có rồi hẹn ghi; `false` khi bị bỏ qua. */
  const change = (fn: (d: ExportDraft) => ExportDraft): boolean => {
    const { draft, saving } = get()
    if (!draft || saving) return false
    set({ draft: fn(draft) })
    schedulePersist()
    return true
  }

  return {
    ctx: null,
    draft: null,
    saving: false,
    session: 0,

    setSaving: (saving) => set({ saving }),

    async load(ctx, form) {
      persistence.ensureAppStateSync()
      await flush() // ghi nốt phiếu đang mở trước khi chuyển sang phiếu khác
      const mine = ++epoch
      const raw = await kv.get<unknown>(keyOf(ctx))
      if (mine !== epoch) return NOTHING_LOADED
      const valid = isValidDraft(raw)
      if (raw !== null && !valid) await kv.remove(keyOf(ctx))
      if (mine !== epoch) return NOTHING_LOADED
      const saved = valid ? withHeaderBase(raw) : null
      let draft: ExportDraft | null
      let removed: string[] = []
      let headerConflicts: ExportHeaderField[] = []
      let merged = false
      if (saved && form && saved.version !== form.version) {
        merged = true
        ;({ draft, removed, headerConflicts } = mergeAfterConflict(saved, form))
      } else if (saved) draft = saved
      else if (form) draft = draftFromForm(form)
      else draft = ctx.formSlug === 'new' ? newExportDraft() : null
      set({ ctx, draft })
      // Chỉ ghi khi đã có thay đổi của người dùng: bản dựng mới không ghi; bản đã gộp thì ghi.
      if (saved && draft !== saved) schedulePersist()
      return {
        local: !!saved,
        edited: !!saved && hasEdits(saved),
        merged,
        removed,
        headerConflicts,
      }
    },

    addLine(line) {
      const { draft, saving } = get()
      if (!draft || saving) return IGNORED
      const key = exportLineKey(line) // không tin `line.key` của người gọi
      if (draft.lines.some((l) => l.key === key)) {
        return { ok: false, reason: 'duplicate', existingKey: key }
      }
      change((d) => ({ ...d, lines: [...d.lines, { ...line, key }] }))
      return { ok: true, key }
    },

    updateLine(key, patch) {
      const { draft, saving } = get()
      const i = draft?.lines.findIndex((l) => l.key === key) ?? -1
      if (!draft || saving || i < 0) return IGNORED
      const next = { ...draft.lines[i]!, ...patch }
      // Đổi đơn vị / lô đổi khoá dòng (khoá = vật tư + đơn vị + lô).
      next.key = exportLineKey(next)
      if (next.key !== key && draft.lines.some((l) => l.key === next.key)) {
        return { ok: false, reason: 'duplicate', existingKey: next.key }
      }
      change((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? next : l)) }))
      return { ok: true, key: next.key }
    },

    removeLine: (key) =>
      change((d) => {
        const i = d.lines.findIndex((l) => l.key === key)
        return i < 0 ? d : { ...d, lines: d.lines.filter((_, j) => j !== i) }
      }),

    setHeader: (patch) => change((d) => ({ ...d, header: { ...d.header, ...patch } })),

    replace(draft) {
      if (!get().ctx) return
      set({ draft })
      schedulePersist()
    },

    seed(draft) {
      if (!get().ctx) return
      set({ draft })
    },

    async discard() {
      const { ctx } = get()
      ++epoch
      cancelTimer()
      set((st) => ({ draft: null, session: st.session + 1 }))
      if (ctx) await kv.remove(keyOf(ctx))
    },

    adoptServerForm(form) {
      const { ctx } = get()
      if (!ctx) return
      const nextCtx = { ...ctx, formSlug: form.slug }
      cancelTimer()
      void kv.remove(keyOf(ctx))
      void kv.remove(keyOf(nextCtx))
      set({ ctx: nextCtx, draft: draftFromForm(form) })
    },

    reset() {
      void flush()
      ++epoch
      set((st) => ({ ctx: null, draft: null, saving: false, session: st.session + 1 }))
    },
  }
})
