import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { WizardStep } from '@/shared/lib/wizard-steps'

export type ExportWizardLabels = {
  steps: readonly [string, string, string]
  /** "Bước n/3 · <nhãn bước>" — dòng phụ của tiêu đề. */
  subtitle: string
  more: string
  scan: string
}

/** Chữ của header / vạch tiến độ cho bước `step` của phiếu xuất. */
export function useExportWizardLabels(step: WizardStep): ExportWizardLabels {
  const { t } = useTranslation(['exportForms', 'common'])
  return useMemo(() => {
    const steps = [
      t('exportForms:wizard.steps.info'),
      t('exportForms:wizard.steps.items'),
      t('exportForms:wizard.steps.review'),
    ] as const
    return {
      steps,
      subtitle: t('common:compose.wizard.subtitle', { n: step, step: steps[step - 1] }),
      more: t('exportForms:edit.menu.more'),
      scan: t('exportForms:wizard.scan'),
    }
  }, [t, step])
}
