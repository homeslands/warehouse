import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import viCommon from './locales/vi/common.json'
import viAuth from './locales/vi/auth.json'
import viExamples from './locales/vi/examples.json'
import viErrors from './locales/vi/errors.json'
import enCommon from './locales/en/common.json'
import enAuth from './locales/en/auth.json'
import enExamples from './locales/en/examples.json'
import enErrors from './locales/en/errors.json'

export const defaultNS = 'common'

export const resources = {
  vi: { common: viCommon, auth: viAuth, examples: viExamples, errors: viErrors },
  en: { common: enCommon, auth: enAuth, examples: enExamples, errors: enErrors },
} as const

export const SUPPORTED_LANGUAGES = ['vi', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    ns: ['common', 'auth', 'examples', 'errors'],
    fallbackLng: 'vi',
    supportedLngs: SUPPORTED_LANGUAGES,
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'warehouse.language',
    },
    interpolation: { escapeValue: false },
  })

// Screen reader và CSS theo :lang() cần thuộc tính này khớp với ngôn ngữ đang hiển thị.
function syncHtmlLang(lng: string): void {
  document.documentElement.lang = lng
}

syncHtmlLang(i18n.resolvedLanguage ?? 'vi')
i18n.on('languageChanged', syncHtmlLang)

export default i18n
