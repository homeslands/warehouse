import { useTranslation } from 'react-i18next'
import { formatCurrency, formatQuantity } from '@/shared/lib/format'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'
import type { ImportForm } from '@/entities/import-form'

/** Đơn vị gốc không có trong dòng phiếu → suy từ `conversionRate = 1`; khác 1 thì hiện "= N <đv gốc của dòng 1:1>". */
export function ImportFormItemsTable({
  form,
  baseUnitCode,
}: {
  form: ImportForm
  baseUnitCode?: (materialSlug: string) => string | undefined
}) {
  const { t } = useTranslation(['importForms', 'common'])
  const items = form.items ?? []
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">{t('importForms:lineNo')}</TableHead>
          <TableHead>{t('importForms:fieldMaterial')}</TableHead>
          <TableHead>{t('importForms:fieldSupplier')}</TableHead>
          <TableHead>{t('importForms:fieldUnit')}</TableHead>
          <TableHead className="text-right">{t('importForms:fieldQuantity')}</TableHead>
          <TableHead className="text-right">{t('importForms:fieldBaseQuantity')}</TableHead>
          <TableHead className="text-right">{t('importForms:fieldUnitPrice')}</TableHead>
          <TableHead className="text-right">{t('importForms:fieldAmount')}</TableHead>
          <TableHead>{t('importForms:fieldLineNote')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.slug}>
            <TableCell className="tabular-nums">{item.lineNo}</TableCell>
            <TableCell>
              <span className="block max-w-56 whitespace-normal break-words">
                <span className="font-medium">{item.materialCode}</span> · {item.materialName}
              </span>
            </TableCell>
            <TableCell>
              {item.supplierName ? (
                <span className="block max-w-48 whitespace-normal break-words">
                  {item.supplierName}
                </span>
              ) : (
                <EmptyValue />
              )}
            </TableCell>
            <TableCell>{item.unitCode}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatQuantity(item.quantity)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {item.conversionRate !== 1
                ? t('importForms:converted', {
                    value:
                      `${formatQuantity(item.baseQuantity)} ${baseUnitCode?.(item.materialSlug) ?? ''}`.trim(),
                  })
                : '—'}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(item.unitPrice, { maximumFractionDigits: 2 })}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(item.amount, { maximumFractionDigits: 2 })}
            </TableCell>
            <TableCell>
              {item.note ? (
                <span className="block max-w-48 whitespace-normal break-words">{item.note}</span>
              ) : (
                <EmptyValue />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={7} className="text-right font-medium">
            {t('importForms:fieldTotal')}
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatCurrency(form.total, { maximumFractionDigits: 2 })}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  )
}
