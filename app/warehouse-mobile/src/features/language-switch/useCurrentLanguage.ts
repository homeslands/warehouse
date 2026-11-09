import { useTranslation } from 'react-i18next'

import type { SupportedLanguage } from '@/shared/i18n'

export const LANGUAGE_LABEL_KEY = { vi: 'common:languageVi', en: 'common:languageEn' } as const

/** Ngôn ngữ đang dùng + tên của nó viết bằng chính ngôn ngữ đó ("Tiếng Việt", "English"). */
export function useCurrentLanguage(): { current: SupportedLanguage; label: string } {
  const { t, i18n } = useTranslation(['common'])
  const current: SupportedLanguage = i18n.resolvedLanguage === 'en' ? 'en' : 'vi'
  return { current, label: t(LANGUAGE_LABEL_KEY[current]) }
}
