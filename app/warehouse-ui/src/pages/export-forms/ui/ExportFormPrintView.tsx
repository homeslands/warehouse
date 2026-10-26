import { useTranslation } from 'react-i18next'
import { formatDate } from '@/shared/lib/format'
import type { ExportForm } from '@/entities/export-form'
import { ExportFormItemsTable } from './ExportFormItemsTable'

type Props = {
  form: ExportForm
  warehouseName: string
  baseUnitCode: (materialSlug: string) => string | undefined
}

/**
 * Chỉ hiện khi in (`hidden print:block`) — khung chép từ bản in phiếu nhập. Phiếu chưa xác nhận in kèm nhãn nổi bật để
 * không nhầm là đã xuất kho. Phiếu xuất không có ngày xuất → in ngày lập.
 */
export function ExportFormPrintView({ form, warehouseName, baseUnitCode }: Props) {
  const { t } = useTranslation(['exportForms', 'common'])
  const status = t(`exportForms:status.${form.status}`)
  const fields: { key: string; label: string; value: string }[] = [
    { key: 'warehouse', label: t('exportForms:fieldWarehouse'), value: warehouseName },
    { key: 'type', label: t('exportForms:fieldType'), value: t(`exportForms:type.${form.type}`) },
    { key: 'receiver', label: t('exportForms:fieldReceiver'), value: form.receiver },
    { key: 'po', label: t('exportForms:fieldPurchaseOrder'), value: form.purchaseOrder },
    { key: 'invoice', label: t('exportForms:fieldInvoiceCode'), value: form.invoiceCode || '—' },
    { key: 'requester', label: t('exportForms:fieldRequester'), value: form.requesterName },
    { key: 'status', label: t('exportForms:fieldStatus'), value: status },
  ]
  return (
    <div
      data-testid="export-form-print"
      className="hidden bg-white text-black print:block print:[&_[data-slot=table-container]]:overflow-visible print:[&_td]:whitespace-normal print:[&_th]:whitespace-normal"
    >
      <h1 className="text-center text-xl font-bold">{t('exportForms:printTitle')}</h1>
      <p className="mt-1 text-center text-sm">
        {form.code} · {formatDate(form.createdAt)}
      </p>
      {form.status !== 'CONFIRMED' && (
        <p className="mt-2 border-2 border-black py-1 text-center text-sm font-bold uppercase">
          {t('exportForms:printNotValid', { status })}
        </p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {fields.map((f) => (
          <div key={f.key} className="break-words">
            <dt className="inline font-medium">{f.label}: </dt>
            <dd className="inline">{f.value}</dd>
          </div>
        ))}
        {form.note && (
          <div className="col-span-2 break-words">
            <dt className="inline font-medium">{t('exportForms:fieldNote')}: </dt>
            <dd className="inline">{form.note}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4">
        <ExportFormItemsTable form={form} baseUnitCode={baseUnitCode} />
      </div>
      <div className="mt-10 grid grid-cols-4 text-center text-sm">
        {(['signRequester', 'signReceiver', 'signKeeper', 'signApprover'] as const).map((k) => (
          <div key={k}>
            <p className="font-medium">{t(`exportForms:${k}`)}</p>
            <p className="text-xs italic">{t('exportForms:signHint')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
