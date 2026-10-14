import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import viCommon from './locales/vi/common.json'
import viAuth from './locales/vi/auth.json'
import viExamples from './locales/vi/examples.json'
import viAccount from './locales/vi/account.json'
import viPermissions from './locales/vi/permissions.json'
import viWarehouses from './locales/vi/warehouses.json'
import viStores from './locales/vi/stores.json'
import viSuppliers from './locales/vi/suppliers.json'
import viUsers from './locales/vi/users.json'
import viRoles from './locales/vi/roles.json'
import viUnits from './locales/vi/units.json'
import viMaterialTypes from './locales/vi/materialTypes.json'
import viMaterials from './locales/vi/materials.json'
import viImportForms from './locales/vi/importForms.json'
import viErrors from './locales/vi/errors.json'
import viErrorPages from './locales/vi/errorPages.json'
import viNav from './locales/vi/nav.json'
import enCommon from './locales/en/common.json'
import enAuth from './locales/en/auth.json'
import enExamples from './locales/en/examples.json'
import enAccount from './locales/en/account.json'
import enPermissions from './locales/en/permissions.json'
import enWarehouses from './locales/en/warehouses.json'
import enStores from './locales/en/stores.json'
import enSuppliers from './locales/en/suppliers.json'
import enUsers from './locales/en/users.json'
import enRoles from './locales/en/roles.json'
import enUnits from './locales/en/units.json'
import enMaterialTypes from './locales/en/materialTypes.json'
import enMaterials from './locales/en/materials.json'
import enImportForms from './locales/en/importForms.json'
import enErrors from './locales/en/errors.json'
import enErrorPages from './locales/en/errorPages.json'
import enNav from './locales/en/nav.json'

export const defaultNS = 'common'

// `errors` (số nhiều) — bản dịch cho 26 mã lỗi backend, tra qua `src/shared/api/error-codes.ts`.
// `errorPages` — chuỗi của ba trang lỗi (ErrorPage / NotFoundPage / ForbiddenPage).
// `nav` — nhãn menu, breadcrumb, tên nhóm menu và trang Tổng quan.
// `warehouses` — chuỗi của màn Kho (cột, form, dialog, toast).
// `account` — màn Tài khoản: hồ sơ, bảo mật, thiết bị đang đăng nhập.
// `stores` — chuỗi của màn Cửa hàng.
// `suppliers` — chuỗi của màn Nhà cung cấp.
// `units` — chuỗi của màn Đơn vị.
// `materialTypes` — chuỗi của màn Loại vật tư.
// `materials` — chuỗi của màn Vật tư (danh sách, chi tiết, đơn vị quy đổi).
// `importForms` — chuỗi của màn Phiếu nhập kho (danh sách, form, xác nhận, in).
// `users` — chuỗi của màn Người dùng (bảng, form tạo/sửa, reset mật khẩu, khoá/xoá).
// `roles` — chuỗi của màn Vai trò (bảng, form tạo/sửa mô tả, hộp xoá).
// `permissions` — bảng ma trận phân quyền role × authority.
export const resources = {
  vi: {
    common: viCommon,
    auth: viAuth,
    examples: viExamples,
    warehouses: viWarehouses,
    account: viAccount,
    stores: viStores,
    suppliers: viSuppliers,
    users: viUsers,
    roles: viRoles,
    units: viUnits,
    materialTypes: viMaterialTypes,
    materials: viMaterials,
    importForms: viImportForms,
    errors: viErrors,
    errorPages: viErrorPages,
    nav: viNav,
    permissions: viPermissions,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    examples: enExamples,
    warehouses: enWarehouses,
    account: enAccount,
    stores: enStores,
    suppliers: enSuppliers,
    users: enUsers,
    roles: enRoles,
    units: enUnits,
    materialTypes: enMaterialTypes,
    materials: enMaterials,
    importForms: enImportForms,
    errors: enErrors,
    errorPages: enErrorPages,
    nav: enNav,
    permissions: enPermissions,
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
    ns: [
      'common',
      'auth',
      'examples',
      'warehouses',
      'stores',
      'suppliers',
      'users',
      'roles',
      'account',
      'units',
      'materialTypes',
      'materials',
      'importForms',
      'errors',
      'errorPages',
      'nav',
      'permissions',
    ],
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
