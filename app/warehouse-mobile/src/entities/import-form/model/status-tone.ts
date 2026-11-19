import type { ColorTokens } from '@/shared/theme/tokens'

import type { ImportFormStatus } from './types'

/** Màu vòng icon theo trạng thái phiếu nhập (dùng chung dòng danh sách và đầu màn xem). */
export function importStatusTone(colors: ColorTokens, status: ImportFormStatus) {
  return {
    DRAFT: { bg: colors.warningSoft, fg: colors.warningText },
    CONFIRMED: { bg: colors.successSoft, fg: colors.successText },
    CANCELLED: { bg: colors.fill, fg: colors.mutedForeground },
  }[status]
}
