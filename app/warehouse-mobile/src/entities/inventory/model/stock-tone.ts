import type { ColorTokens } from '@/shared/theme/tokens'

import type { StockLevel } from './stock-level'

/** Màu vòng icon theo mức tồn (dùng chung dòng danh sách Tồn kho và thẻ số tồn). */
export function stockLevelTone(colors: ColorTokens, level: StockLevel) {
  return {
    out: { bg: colors.destructiveSoft, fg: colors.destructive },
    low: { bg: colors.warningSoft, fg: colors.warningText },
    high: { bg: colors.accentSoft, fg: colors.accentText },
    ok: { bg: colors.fill, fg: colors.foreground },
  }[level]
}
