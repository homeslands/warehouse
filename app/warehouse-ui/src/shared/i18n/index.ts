import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import viCommon from './locales/vi/common.json'
import viAuth from './locales/vi/auth.json'
import viExamples from './locales/vi/examples.json'
import viErrors from './locales/vi/errors.json'
import viErrorPages from './locales/vi/errorPages.json'
import viNav from './locales/vi/nav.json'
import enCommon from './locales/en/common.json'
import enAuth from './locales/en/auth.json'
import enExamples from './locales/en/examples.json'
import enErrors from './locales/en/errors.json'
import enErrorPages from './locales/en/errorPages.json'
import enNav from './locales/en/nav.json'

export const defaultNS = 'common'

// `errors` (số nhiều) — bản dịch cho 26 mã lỗi backend, tra qua `src/shared/api/error-codes.ts`.
// `errorPages` — chuỗi của ba trang lỗi (ErrorPage / NotFoundPage / ForbiddenPage).
// `nav` — nhãn menu, breadcrumb, tên nhóm menu và trang Tổng quan.
export const resources = {
  vi: {
    common: viCommon,
    auth: viAuth,
    examples: viExamples,
    errors: viErrors,
    errorPages: viErrorPages,
    nav: viNav,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    examples: enExamples,
    errors: enErrors,
    errorPages: enErrorPages,
    nav: enNav,
  },
} as const

export const SUPPORTED_LANGUAGES = ['vi', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    ns: ['common', 'auth', 'examples', 'errors', 'errorPages', 'nav'],
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
