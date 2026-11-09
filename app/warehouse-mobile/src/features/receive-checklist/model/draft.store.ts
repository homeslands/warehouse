import { create } from 'zustand'

import type { ImportForm } from '@/entities/import-form'
import { createDraftPersistence } from '@/shared/lib/draft-persistence'
import { kv } from '@/shared/storage/kv'

import {
  draftFromForm,
  hasEdits,
  lineKey,
  type ImportHeaderField,
  type LineBase,
  type LocalLine,
  type ReceiveDraft,
} from './draft'
import { mergeAfterConflict } from './merge'

export type DraftContext = { userSlug: string; warehouseSlug: string; formSlug: string | 'new' }

/**
 * Trường sửa được của một dòng đã có. Đổi đơn vị phải đổi cả `unitSlug` / `unitName` (kèm `units` nếu
 * có); dòng giữ vị trí và `base` (khoá mới tính lại, trùng dòng khác thì bị từ chối).
 */
export type LinePatch = Partial<
  Pick<
    LocalLine,
    'quantity' | 'expiryDate' | 'note' | 'unitPrice' | 'unitSlug' | 'unitName' | 'units'
  >
>

/**
 * Kết quả `addLine` / `updateLine`: `ok` kèm khoá (mới) của dòng; `duplicate` = sẽ trùng khoá dòng
 * `existingKey` nên không đổi gì; `ignored` = không áp dụng (đang lưu, chưa có bản nháp, không có dòng).
 */
export type LineChange =
  | { ok: true; key: string }
  | { ok: false; reason: 'duplicate'; existingKey: string }
  | { ok: false; reason: 'ignored' }

const IGNORED: LineChange = { ok: false, reason: 'ignored' }

/**
 * Kết quả `load`, để màn báo người dùng khi phần làm trên máy bị ảnh hưởng:
 * - `local`: có bản nháp đã lưu trên máy (người dùng đã kiểm / sửa) cho phiếu này;
 * - `edited`: bản lưu đó có sửa thật (`hasEdits`: đầu phiếu / đơn vị / số / giá / hạn / ghi chú / dòng
 *   thêm) — không tính dấu đã kiểm (chế độ "Sửa phiếu" chỉ quan tâm cái này);
 * - `merged`: version trên server khác bản lưu → đã gộp (`mergeAfterConflict`);
 * - `removed`: tên các dòng trên máy không còn trên server (bị xoá trên web);
 * - `headerConflicts`: trường đầu phiếu đã sửa trên máy nhưng server đổi khác → đã lấy của server.
 */
export type LoadResult = {
  local: boolean
  edited: boolean
  merged: boolean
  removed: string[]
  headerConflicts: ImportHeaderField[]
}

const NOTHING_LOADED: LoadResult = {
  local: false,
  edited: false,
  merged: false,
  removed: [],
  headerConflicts: [],
}

export function draftStorageKey(userSlug: string, warehouseSlug: string, formSlug: string): string {
  return `warehouse.receiveDraft.${userSlug}.${warehouseSlug}.${formSlug}`
}

const keyOf = (c: DraftContext) => draftStorageKey(c.userSlug, c.warehouseSlug, c.formSlug)

type DraftState = {
  ctx: DraftContext | null
  draft: ReceiveDraft | null
  /**
   * Đang ghi lên server (Lưu / Xác nhận). Trong lúc này mọi sửa trên máy bị bỏ qua: kết quả về sẽ
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
  load: (ctx: DraftContext, form: ImportForm | null) => Promise<LoadResult>
  toggleCheck: (key: string) => void
  /**
   * Sửa một dòng. `check` (mặc định `true`, checklist): sửa = đánh dấu đã kiểm; màn soạn truyền
   * `{ check: false }` (dấu kiểm giữ nguyên). Đổi `unitSlug` → khoá mới, dòng giữ vị trí + `base`.
   */
  updateLine: (key: string, patch: LinePatch, opts?: { check?: boolean }) => LineChange
  /** Khoá dòng luôn duy nhất trong bản nháp: dòng trùng khoá bị từ chối. */
  addLine: (line: LocalLine) => LineChange
  removeLine: (key: string) => void
  setHeader: (patch: Partial<ReceiveDraft['header']>) => void
  replace: (draft: ReceiveDraft) => void
  /**
   * Đặt bản nháp CHỈ trong bộ nhớ (không hẹn ghi `kv`): bản trắng của phiếu mới (mã gợi ý, ngày hôm
   * nay) — chỉ được ghi khi người dùng sửa lần đầu. Chưa nạp phiếu nào (`ctx` null) → không làm gì.
   */
  seed: (draft: ReceiveDraft) => void
  /** "Bỏ thay đổi": xoá bản lưu và bản trong bộ nhớ. */
  discard: () => Promise<void>
  /** Sau Lưu/Tạo thành công: dựng lại từ phiếu server, giữ dấu đã kiểm theo `lineKey`. */
  adoptServerForm: (form: ImportForm) => void
  /** Hết phiên: chỉ xoá bộ nhớ (sau khi ghi nốt phần đang chờ); bản đã lưu được GIỮ. */
  reset: () => void
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Bản lưu cũ / hỏng không được làm sập `mergeAfterConflict` hay màn hình. */
export function isValidDraft(v: unknown, formSlug: string): v is ReceiveDraft {
  if (!isObj(v) || v.formSlug !== formSlug || !isObj(v.header) || !Array.isArray(v.lines)) {
    return false
  }
  // Bản lưu cũ chưa có `headerBase` vẫn hợp lệ (`load` bổ sung).
  if (v.headerBase !== undefined && v.headerBase !== null && !isObj(v.headerBase)) return false
  return v.lines.every(
    (l) =>
      isObj(l) &&
      typeof l.key === 'string' &&
      typeof l.materialSlug === 'string' &&
      typeof l.unitSlug === 'string' &&
      typeof l.quantity === 'number' &&
      typeof l.checked === 'boolean' &&
      (l.units === undefined || Array.isArray(l.units)),
  )
}

/**
 * Bản lưu trước khi có `headerBase` / `base.unitSlug` / `base.unitPrice`:
 * - `headerBase` thiếu → coi đầu phiếu đang lưu là gốc (phần đã sửa khi đó không phân biệt được — gộp
 *   sau lệch version lấy của server như trước); phiếu mới (`version` null) không có gốc;
 * - `base` thiếu đơn vị / đơn giá → lấy của dòng (trước đây không đổi được hai trường này trên máy).
 */
function upgradeSaved(d: ReceiveDraft): ReceiveDraft {
  const lines = d.lines.map((l) => {
    const b = l.base as Partial<LineBase> | null
    if (b === null || (b.unitSlug !== undefined && b.unitPrice !== undefined)) return l
    return {
      ...l,
      base: {
        ...l.base!,
        unitSlug: b.unitSlug ?? l.unitSlug,
        unitPrice: b.unitPrice ?? l.unitPrice,
      },
    }
  })
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
  const same =
    header === d.header && headerBase === d.headerBase && lines.every((l, i) => l === d.lines[i])
  return same ? d : { ...d, header, headerBase, lines }
}

// Tăng mỗi khi load/reset/discard: kết quả async cũ không được ghi đè trạng thái mới.
let epoch = 0
const persistence = createDraftPersistence(() => {
  const { ctx, draft } = useReceiveDraft.getState()
  return ctx && draft ? { key: keyOf(ctx), value: { ...draft, savedAt: Date.now() } } : null
})
const { flush, schedule: schedulePersist, cancel: cancelTimer } = persistence

/** Gỡ lắng nghe `AppState` và huỷ ghi đang chờ. Dùng ở teardown của test. */
export const stopDraftPersistence = persistence.stop

export const useReceiveDraft = create<DraftState>((set, get) => {
  /** Áp thay đổi lên bản nháp hiện có rồi hẹn ghi. */
  const change = (fn: (d: ReceiveDraft) => ReceiveDraft) => {
    const { draft, saving } = get()
    if (!draft || saving) return
    set({ draft: fn(draft) })
    schedulePersist()
  }
  const mapLine = (key: string, fn: (l: LocalLine) => LocalLine) =>
    change((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? fn(l) : l)) }))
  const ok = (key: string): LineChange => ({ ok: true, key })

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
      const valid = isValidDraft(raw, ctx.formSlug)
      if (raw !== null && !valid) await kv.remove(keyOf(ctx))
      if (mine !== epoch) return NOTHING_LOADED
      const saved = valid ? upgradeSaved(raw) : null
      let draft: ReceiveDraft | null
      let removed: string[] = []
      let headerConflicts: ImportHeaderField[] = []
      let merged = false
      if (saved && form && saved.version !== form.version) {
        merged = true
        ;({ draft, removed, headerConflicts } = mergeAfterConflict(saved, form))
      } else if (saved) draft = saved
      else draft = form ? draftFromForm(form) : null
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

    toggleCheck: (key) => mapLine(key, (l) => ({ ...l, checked: !l.checked })),

    updateLine(key, patch, { check = true } = {}) {
      const { draft, saving } = get()
      const i = draft?.lines.findIndex((l) => l.key === key) ?? -1
      if (!draft || saving || i < 0) return IGNORED
      const next = { ...draft.lines[i]!, ...patch, ...(check && { checked: true }) }
      // Đổi đơn vị đổi khoá dòng (khoá = vật tư + đơn vị).
      next.key = lineKey(next)
      if (next.key !== key && draft.lines.some((l) => l.key === next.key)) {
        return { ok: false, reason: 'duplicate', existingKey: next.key }
      }
      change((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? next : l)) }))
      return ok(next.key)
    },

    addLine(line) {
      const { draft, saving } = get()
      if (!draft || saving) return IGNORED
      const key = lineKey(line) // không tin `line.key` của người gọi
      if (draft.lines.some((l) => l.key === key)) {
        return { ok: false, reason: 'duplicate', existingKey: key }
      }
      change((d) => ({ ...d, lines: [...d.lines, { ...line, key }] }))
      return ok(key)
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
      const { ctx, draft } = get()
      if (!ctx) return
      const old = draft?.lines ?? []
      const checked = new Set(old.filter((l) => l.checked).map((l) => l.key))
      const units = new Map(old.flatMap((l) => (l.units ? [[l.key, l.units] as const] : [])))
      const next = draftFromForm(form)
      // `draftFromForm` đã rebase `base` (và `headerBase`) về phiếu vừa lưu, kể cả dòng thêm trên máy.
      // Giữ dấu kiểm và snapshot đơn vị theo khoá dòng.
      next.lines = next.lines.map((l) => {
        const u = units.get(l.key)
        return { ...l, checked: checked.has(l.key), ...(u && { units: u }) }
      })
      const nextCtx = { ...ctx, formSlug: form.slug }
      if (ctx.formSlug !== form.slug) void kv.remove(keyOf(ctx))
      set({ ctx: nextCtx, draft: next })
      schedulePersist()
    },

    reset() {
      void flush()
      ++epoch
      set((st) => ({ ctx: null, draft: null, saving: false, session: st.session + 1 }))
    },
  }
})
