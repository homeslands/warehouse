import type { ColorTokens } from '@/shared/theme/tokens'

import type { ExportFormStatus } from './types'

/** Màu vòng icon theo trạng thái phiếu xuất (dùng chung dòng danh sách và đầu màn xem). */
export function exportStatusTone(colors: ColorTokens, status: ExportFormStatus) {
  return {
    DRAFT: { bg: colors.warningSoft, fg: colors.warningText },
    PENDING: { bg: colors.accentSoft, fg: colors.accentText },
    CONFIRMED: { bg: colors.successSoft, fg: colors.successText },
    CANCELLED: { bg: colors.fill, fg: colors.mutedForeground },
  }[status]
}
