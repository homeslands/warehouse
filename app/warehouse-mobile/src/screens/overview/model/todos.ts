import { can, type CurrentUser } from '@/entities/session'

export type TodoKey = 'importDraft' | 'exportPending' | 'exportDraft' | 'stockLow' | 'stockHigh'
/** Màu nhãn + icon của ô: `default` = xám, `muted` = ô bằng 0 / chưa có số / lỗi. */
export type TodoTone = 'muted' | 'default' | 'accent' | 'warning' | 'info'
export type TodoCount = { count?: number; failed: boolean }
/**
 * `preset`: import `DRAFT`; export `DRAFT` | `PENDING`; stock `high` | `all`. `stockLow` mở màn
 * "Đề xuất đặt hàng" (`/stock/reorder`, không có param).
 */
export type OverviewHref = {
  pathname: '/import' | '/export' | '/stock' | '/stock/reorder'
  params: { preset?: string }
}
/**
 * Sheet "Hạn dùng" (route sheet gốc): cuộn tới nhóm `focus`. Mở bằng `router.push` như các sheet khác
 * (từ banner và thẻ Hạn dùng; lưới "Việc cần làm" không còn ô hạn dùng).
 */
export type ExpiryHref = {
  pathname: '/expiry-batches'
  params: { focus: 'expired' | 'soon' }
}
export type Todo = {
  key: TodoKey
  count?: number
  failed: boolean
  tone: TodoTone
  href: OverviewHref
}

export const STOCK_HREF: OverviewHref = { pathname: '/stock', params: { preset: 'all' } }

/** Sheet "Hạn dùng" mở ở nhóm quá hạn nếu có lô quá hạn, ngược lại nhóm sắp hết hạn. */
export const expiryHref = (expired: number | undefined): ExpiryHref => ({
  pathname: '/expiry-batches',
  params: { focus: expired !== undefined && expired > 0 ? 'expired' : 'soon' },
})

type Def = {
  key: TodoKey
  visible: (user: CurrentUser) => boolean
  href: OverviewHref
  tone: (user: CurrentUser) => TodoTone
}

const canStock = (u: CurrentUser) => can(u, 'MATERIAL_READ') && can(u, 'WAREHOUSE_READ')

const DEFS: Def[] = [
  {
    key: 'importDraft',
    visible: (u) => can(u, 'IMPORT_FORM_READ'),
    href: { pathname: '/import', params: { preset: 'DRAFT' } },
    tone: () => 'accent',
  },
  // Chờ duyệt đứng trước xuất nháp: việc gấp hơn (spec dashboard §1).
  {
    key: 'exportPending',
    visible: (u) => can(u, 'EXPORT_FORM_READ'),
    href: { pathname: '/export', params: { preset: 'PENDING' } },
    tone: (u) => (can(u, 'EXPORT_FORM_CONFIRM') ? 'accent' : 'default'),
  },
  {
    key: 'exportDraft',
    visible: (u) => can(u, 'EXPORT_FORM_READ'),
    href: { pathname: '/export', params: { preset: 'DRAFT' } },
    tone: () => 'default',
  },
  {
    key: 'stockLow',
    visible: canStock,
    href: { pathname: '/stock/reorder', params: {} },
    tone: () => 'warning',
  },
  {
    key: 'stockHigh',
    visible: canStock,
    href: { pathname: '/stock', params: { preset: 'high' } },
    tone: () => 'info',
  },
]

/** Các ô "Việc cần làm" người dùng được thấy, thứ tự cố định; count 0/chưa có/lỗi → `muted`. */
export function overviewTodos(
  user: CurrentUser | null,
  counts: Partial<Record<TodoKey, TodoCount>>,
): Todo[] {
  if (!user) return []
  return DEFS.filter((d) => d.visible(user)).map((d) => {
    const c = counts[d.key]
    const count = c?.count
    const failed = c?.failed ?? false
    const tone: TodoTone = !failed && count !== undefined && count > 0 ? d.tone(user) : 'muted'
    return { key: d.key, count, failed, tone, href: d.href }
  })
}
