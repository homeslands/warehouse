export const IMPORT_FORMS_PATH = '/import-forms'

const q = (warehouseSlug: string) => `?warehouse=${encodeURIComponent(warehouseSlug)}`

export const listPath = (warehouseSlug: string) => `${IMPORT_FORMS_PATH}${q(warehouseSlug)}`
export const detailPath = (warehouseSlug: string, slug: string) =>
  `${IMPORT_FORMS_PATH}/${slug}${q(warehouseSlug)}`
