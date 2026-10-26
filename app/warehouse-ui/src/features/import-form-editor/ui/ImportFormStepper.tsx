import { useTranslation } from 'react-i18next'
import { WizardStepper } from '@/shared/ui/WizardStepper'
import type { WizardStep } from '../model/wizard'

type Props = {
  /** Bước đang xem — nút của nó được tô đậm (`aria-current="step"`). */
  current: WizardStep
  infoDone: boolean
  itemsDone: boolean
  /** Số dòng đã đủ thông tin — hiện cạnh bước ② khi > 0. */
  lineCount: number
  /** Mọi nút đều gọi nó — luật cho/không cho đi là việc của nơi dùng. */
  onSelect: (step: WizardStep) => void
  /** Khoá cả ba nút (đang gửi). */
  disabled?: boolean
  /** Khoá các bước đứng sau `current` (đang upload chứng từ — chưa được tiến); lùi vẫn được. */
  lockForward?: boolean
}

/** Dải 3 bước ① Thông tin phiếu ── ② Chi tiết vật tư ── ③ Kiểm tra & lưu — bọc mỏng quanh `WizardStepper`. */
export function ImportFormStepper({
  current,
  infoDone,
  itemsDone,
  lineCount,
  onSelect,
  disabled,
  lockForward,
}: Props) {
  const { t } = useTranslation('importForms')
  return (
    <WizardStepper
      ariaLabel={t('stepsLabel')}
      current={current}
      onSelect={(key) => onSelect(key as WizardStep)}
      disabled={disabled}
      lockForward={lockForward}
      steps={[
        { key: 'info', label: t('stepSeller'), done: infoDone },
        {
          key: 'items',
          label: t('stepItems'),
          extra: lineCount > 0 ? t('stepLineCount', { count: lineCount }) : undefined,
          done: itemsDone,
        },
        { key: 'review', label: t('stepReview'), done: false },
      ]}
    />
  )
}
