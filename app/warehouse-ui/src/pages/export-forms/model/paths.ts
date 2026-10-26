export const EXPORT_FORMS_PATH = '/export-forms'

const q = (warehouseSlug: string) => `?warehouse=${encodeURIComponent(warehouseSlug)}`

export const listPath = (warehouseSlug: string) => `${EXPORT_FORMS_PATH}${q(warehouseSlug)}`
export const detailPath = (warehouseSlug: string, slug: string) =>
  `${EXPORT_FORMS_PATH}/${slug}${q(warehouseSlug)}`
