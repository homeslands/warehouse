import { useTranslation } from 'react-i18next'
import { StatusIndicator, type StatusTone } from '@/shared/ui/StatusIndicator'
import type { SupplierTransactionType } from '../model/types'

const TONE: Record<SupplierTransactionType, StatusTone> = {
  PURCHASE: 'success',
  RETURN: 'warning',
  PAYMENT: 'info',
}

export function TransactionTypeIndicator({ type }: { type: SupplierTransactionType }) {
  const { t } = useTranslation(['suppliers'])
  return <StatusIndicator tone={TONE[type]}>{t(`suppliers:type.${type}`)}</StatusIndicator>
}
