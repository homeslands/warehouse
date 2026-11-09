import type { ChipFilters } from './store'
import { timeRange } from './time-filter'

/** Người đang lọc. `name` = nhãn lúc chọn (không tra lại `GET /users/{slug}`). */
export type PersonFilter = { slug: string; name: string }

/** Người đang xem: có `USER_READ` (chọn người bất kỳ) không, và slug của chính mình. */
export type ListViewer = { canReadUsers: boolean; userSlug: string | null }

/**
 * Bộ lọc người THỰC SỰ được gửi. Như web: người bất kỳ chỉ khi có `USER_READ`. Riêng "Phiếu của tôi"
 * (người lập = chính mình) luôn được gửi. Người xác nhận chỉ có chip khi có `USER_READ` → thiếu quyền thì
 * không gửi (kể cả là mình): không bao giờ có bộ lọc ẩn mà người dùng không thấy để bỏ.
 */
export function effectivePeople(
  { requester, approver }: Pick<ChipFilters, 'requester' | 'approver'>,
  viewer: ListViewer,
): { requesterSlug?: string; approverSlug?: string } {
  const mine = (p: PersonFilter | null) => !!p && !!viewer.userSlug && p.slug === viewer.userSlug
  const requesterSlug =
    requester && (viewer.canReadUsers || mine(requester)) ? requester.slug : undefined
  const approverSlug = approver && viewer.canReadUsers ? approver.slug : undefined
  return {
    ...(requesterSlug ? { requesterSlug } : {}),
    ...(approverSlug ? { approverSlug } : {}),
  }
}

/** Phần thời gian + người của query danh sách (cũng là một phần query key). Mốc thời gian tính theo `now`. */
export function listChipQuery(
  chips: ChipFilters,
  viewer: ListViewer,
  now: Date,
): { startDate?: string; endDate?: string; requesterSlug?: string; approverSlug?: string } {
  return { ...timeRange(chips.time, now), ...effectivePeople(chips, viewer) }
}

/** Có bộ lọc chip (thời gian / người) đang có hiệu lực — không tính trạng thái và ô tìm kiếm. */
export function hasChipFilters(chips: ChipFilters, viewer: ListViewer): boolean {
  const people = effectivePeople(chips, viewer)
  return chips.time !== null || !!people.requesterSlug || !!people.approverSlug
}
