import { Tag } from '@/shared/ui/icons'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { EXPORT_FORM_TYPES } from '@/entities/export-form'
import { FilterSection, OptionPill } from '@/features/list-filters'
import { haptics } from '@/shared/lib/haptics'

import { useExportListFilter } from './export-list.store'

/** Loại mặc định khi bật công tắc (đầu danh sách, như mốc "7 ngày qua" của Thời gian). */
const DEFAULT_TYPE = EXPORT_FORM_TYPES[0]

/**
 * Thẻ "Loại" của sheet Lọc phiếu xuất (cùng dáng thẻ Thời gian): BẬT → áp dụng ngay loại đầu tiên và
 * mở 5 viên; chọn viên là gửi `type` ngay; TẮT → mọi loại.
 */
export function TypeFilterSection() {
  const { t } = useTranslation(['exportForms', 'importForms'])
  const type = useExportListFilter((s) => s.type)
  const setType = useExportListFilter((s) => s.setType)
  return (
    <FilterSection
      testID="filter-section-type"
      icon={Tag}
      label={t('exportForms:list.filters.type')}
      on={type !== null}
      onToggle={(on) => setType(on ? DEFAULT_TYPE : null)}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {EXPORT_FORM_TYPES.map((option) => (
          <OptionPill
            key={option}
            label={t(`exportForms:type.${option}`)}
            selected={type === option}
            onPress={() => {
              if (option === type) return
              haptics.selection()
              setType(option)
            }}
          />
        ))}
      </View>
    </FilterSection>
  )
}
