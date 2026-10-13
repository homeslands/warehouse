import { useTranslation } from 'react-i18next'
import { formatDate } from '@/shared/lib/format'
import type { ImportForm } from '@/entities/import-form'
import { ImportFormItemsTable } from './ImportFormItemsTable'

type Props = {
  form: ImportForm
  warehouseName: string
  baseUnitCode: (materialSlug: string) => string | undefined
}

/** Chỉ hiện khi in (`hidden print:block`). Phiếu chưa xác nhận in kèm nhãn nổi bật để không nhầm. */
export function ImportFormPrintView({ form, warehouseName, baseUnitCode }: Props) {
  const { t } = useTranslation(['importForms', 'common'])
  const status = t(`importForms:status.${form.status}`)
  return (
    <div className="hidden text-black print:block">
      <h1 className="text-center text-xl font-bold">{t('importForms:printTitle')}</h1>
      <p className="mt-1 text-center text-sm">
        {form.code} · {formatDate(form.date)}
      </p>
      {form.status !== 'CONFIRMED' && (
        <p className="mt-2 border-2 border-black py-1 text-center text-sm font-bold uppercase">
          {t('importForms:printNotValid', { status })}
        </p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="inline font-medium">{t('importForms:fieldWarehouse')}: </dt>
          <dd className="inline">{warehouseName}</dd>
        </div>
        <div>
          <dt className="inline font-medium">{t('importForms:fieldInvoiceCode')}: </dt>
          <dd className="inline">{form.invoiceCode}</dd>
        </div>
        <div>
          <dt className="inline font-medium">{t('importForms:fieldPurchaseOrder')}: </dt>
          <dd className="inline">{form.purchaseOrder ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline font-medium">{t('importForms:fieldRequester')}: </dt>
          <dd className="inline">{form.requesterName}</dd>
        </div>
        <div>
          <dt className="inline font-medium">{t('importForms:fieldStatus')}: </dt>
          <dd className="inline">{status}</dd>
        </div>
        {form.note && (
          <div className="col-span-2">
            <dt className="inline font-medium">{t('importForms:fieldNote')}: </dt>
            <dd className="inline">{form.note}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4">
        <ImportFormItemsTable form={form} baseUnitCode={baseUnitCode} />
      </div>
      <div className="mt-10 grid grid-cols-3 text-center text-sm">
        {(['signRequester', 'signApprover', 'signKeeper'] as const).map((k) => (
          <div key={k}>
            <p className="font-medium">{t(`importForms:${k}`)}</p>
            <p className="text-xs italic">{t('importForms:signHint')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
