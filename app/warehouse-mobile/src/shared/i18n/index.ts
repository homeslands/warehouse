import { createInstance } from 'i18next'
import { getLocales } from 'expo-localization'
import { initReactI18next } from 'react-i18next'

import { kv } from '@/shared/storage/kv'

import enAccount from './locales/en/account.json'
import enAuth from './locales/en/auth.json'
import enCommon from './locales/en/common.json'
import enErrors from './locales/en/errors.json'
import enExportForms from './locales/en/exportForms.json'
import enImportForms from './locales/en/importForms.json'
import enInventory from './locales/en/inventory.json'
import enNav from './locales/en/nav.json'
import viAccount from './locales/vi/account.json'
import viAuth from './locales/vi/auth.json'
import viCommon from './locales/vi/common.json'
import viErrors from './locales/vi/errors.json'
import viExportForms from './locales/vi/exportForms.json'
import viImportForms from './locales/vi/importForms.json'
import viInventory from './locales/vi/inventory.json'
import viNav from './locales/vi/nav.json'

const i18n = createInstance()

export const SUPPORTED_LANGUAGES = ['vi', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const defaultNS = 'common'
const FALLBACK_LANGUAGE: SupportedLanguage = 'vi'
const STORAGE_KEY = 'warehouse.language'

export const resources = {
  vi: {
    common: viCommon,
    auth: viAuth,
    account: viAccount,
    nav: viNav,
    errors: viErrors,
    inventory: viInventory,
    importForms: viImportForms,
    exportForms: viExportForms,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    account: enAccount,
    nav: enNav,
    errors: enErrors,
    inventory: enInventory,
    importForms: enImportForms,
    exportForms: enExportForms,
  },
} as const

function isSupported(value: unknown): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly unknown[]).includes(value)
}

function deviceLanguage(): SupportedLanguage {
  try {
    const code = getLocales()[0]?.languageCode
    return isSupported(code) ? code : FALLBACK_LANGUAGE
  } catch {
    return FALLBACK_LANGUAGE
  }
}

// Ưu tiên: ngôn ngữ đã lưu > ngôn ngữ máy > vi.
export async function initI18n(): Promise<void> {
  const saved = await kv.get<string>(STORAGE_KEY)
  const lng = isSupported(saved) ? saved : deviceLanguage()

  if (i18n.isInitialized) {
    await i18n.changeLanguage(lng)
    return
  }
  await i18n.use(initReactI18next).init({
    resources,
    defaultNS,
    ns: ['common', 'auth', 'account', 'nav', 'errors', 'inventory', 'importForms', 'exportForms'],
    lng,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
    returnNull: false,
  })
}

export async function changeLanguage(lng: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lng)
  await kv.set(STORAGE_KEY, lng)
}

export default i18n
