import { useTranslation } from 'react-i18next'

import { SegmentedControl } from '@/shared/ui'

export type DetailTab = 'batches' | 'history'

export type DetailTabsProps = {
  value: DetailTab
  onChange: (next: DetailTab) => void
  /** Số lô còn hàng; chưa biết (đang tải/lỗi) thì nhãn không kèm số. */
  batchCount?: number
}

/** Segmented "Theo lô · n" / "Lịch sử" của chi tiết vật tư (dựng trên `SegmentedControl`). */
export function DetailTabs({ value, onChange, batchCount }: DetailTabsProps) {
  const { t } = useTranslation('inventory')
  return (
    <SegmentedControl<DetailTab>
      items={[
        {
          value: 'batches',
          label:
            batchCount === undefined
              ? t('tabBatches')
              : t('tabBatchesCount', { count: batchCount }),
        },
        { value: 'history', label: t('tabHistory') },
      ]}
      value={value}
      onChange={onChange}
    />
  )
}
