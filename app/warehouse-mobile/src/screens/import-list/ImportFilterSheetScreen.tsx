import { useTranslation } from 'react-i18next'

import { ListFilterSheet } from '@/features/list-filters'

import { useImportListFilter } from './import-list.store'

/** Route `/import-filter` — sheet Lọc của danh sách phiếu nhập (thân sheet: `ListFilterSheet`). */
export function ImportFilterSheetScreen() {
  const { t } = useTranslation('importForms')
  return (
    <ListFilterSheet
      store={useImportListFilter}
      title={t('list.filters.title')}
      testID="import-filter-sheet"
    />
  )
}
