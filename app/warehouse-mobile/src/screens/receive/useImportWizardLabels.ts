import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { WizardStep } from '@/shared/lib/wizard-steps'

export type ImportWizardLabels = {
  steps: readonly [string, string, string]
  /** "Bước n/3 · <nhãn bước>" — dòng phụ của tiêu đề. */
  subtitle: string
  more: string
  scan: string
}

/**
 * Chữ của header / vạch tiến độ cho bước `step` của phiếu nhập. Menu `⋯` của phiếu nhập KHÔNG có "Lưu
 * nháp" (người dùng chốt — phiếu nhập chỉ lưu ở bước 3; thoát giữa chừng vẫn giữ bản nháp trên máy).
 */
export function useImportWizardLabels(step: WizardStep): ImportWizardLabels {
  const { t } = useTranslation(['importForms', 'common'])
  return useMemo(() => {
    const steps = [
      t('importForms:wizard.steps.info'),
      t('importForms:wizard.steps.items'),
      t('importForms:wizard.steps.review'),
    ] as const
    return {
      steps,
      subtitle: t('common:compose.wizard.subtitle', { n: step, step: steps[step - 1] }),
      more: t('importForms:receive.menu.more'),
      scan: t('importForms:wizard.scan'),
    }
  }, [t, step])
}
