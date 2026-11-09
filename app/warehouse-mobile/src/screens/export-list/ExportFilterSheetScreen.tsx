import { useTranslation } from 'react-i18next'

import { ListFilterSheet } from '@/features/list-filters'

import { useExportListFilter } from './export-list.store'
import { TypeFilterSection } from './TypeFilterSection'

/**
 * Route `/export-filter` — sheet Lọc của danh sách phiếu xuất: thân sheet dùng chung (`ListFilterSheet`:
 * thời gian / người lập / người xác nhận) + thẻ "Loại" của riêng tab. "Xoá lọc" cũng tắt Loại.
 */
export function ExportFilterSheetScreen() {
  const { t } = useTranslation('exportForms')
  const type = useExportListFilter((s) => s.type)
  return (
    <ListFilterSheet
      store={useExportListFilter}
      title={t('list.filters.title')}
      extra={<TypeFilterSection />}
      extraActive={type !== null}
      onClearExtra={() => useExportListFilter.getState().setType(null)}
      testID="export-filter-sheet"
    />
  )
}
