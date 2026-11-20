import { useTranslation } from 'react-i18next'

import { useAppearance, type AppearancePreference } from '@/shared/theme/appearance'

export const APPEARANCE_LABEL_KEY = {
  system: 'common:appearanceSystem',
  light: 'common:appearanceLight',
  dark: 'common:appearanceDark',
} as const

/** Lựa chọn giao diện đang dùng + tên của nó ("Theo hệ thống", "Sáng", "Tối"). */
export function useCurrentAppearance(): { current: AppearancePreference; label: string } {
  const { t } = useTranslation(['common'])
  const current = useAppearance((s) => s.preference)
  return { current, label: t(APPEARANCE_LABEL_KEY[current]) }
}
