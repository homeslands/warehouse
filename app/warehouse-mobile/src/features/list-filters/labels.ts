import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { can, useAuthStore } from '@/entities/session'

import { effectivePeople, hasChipFilters, type ListViewer, type PersonFilter } from './people'
import type { ChipFilters } from './store'
import { formatRangeLabel } from './time-filter'

/** Người đang xem danh sách: có `USER_READ` không + slug của chính mình. */
export function useListViewer(): ListViewer {
  const user = useAuthStore((s) => s.user)
  return useMemo(
    () => ({ canReadUsers: can(user, 'USER_READ'), userSlug: user?.userSlug ?? null }),
    [user],
  )
}

export type ActiveFilterLabels = {
  /** `null` = bộ lọc đó không có hiệu lực (không lọc, hoặc đã chọn mà không được gửi). */
  time: string | null
  requester: string | null
  approver: string | null
  active: boolean
}

/**
 * Nhãn giá trị ĐANG CÓ HIỆU LỰC của ba bộ lọc (theo `effectivePeople` — đúng cái được gửi): mốc nhanh,
 * "dd/MM – dd/MM", "Phiếu của tôi" / "Tôi xác nhận" khi là chính mình, hoặc tên lưu lúc chọn. Dùng chung
 * cho nút Lọc (đặc khi `active`), dòng tóm tắt dưới ô trạng thái và trang đầu của sheet Lọc.
 */
export function useActiveFilterLabels(viewer: ListViewer, chips: ChipFilters): ActiveFilterLabels {
  const { t } = useTranslation('importForms')
  const { time, requester, approver } = chips
  const sent = effectivePeople({ requester, approver }, viewer)
  const person = (p: PersonFilter | null, slug: string | undefined, mine: string) =>
    !p || !slug ? null : p.slug === viewer.userSlug ? mine : p.name
  return {
    time:
      time === null
        ? null
        : typeof time === 'object'
          ? formatRangeLabel(time, new Date())
          : t(`list.time.${time}`),
    requester: person(requester, sent.requesterSlug, t('list.person.mine')),
    approver: person(approver, sent.approverSlug, t('list.person.approvedByMe')),
    active: hasChipFilters({ time, requester, approver }, viewer),
  }
}
