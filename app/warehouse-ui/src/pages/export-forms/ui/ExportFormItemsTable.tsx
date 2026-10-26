import { useTranslation } from 'react-i18next'
import { formatCurrency, formatDate, formatQuantity } from '@/shared/lib/format'
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
import type { ExportForm, ExportFormItem } from '@/entities/export-form'

/**
 * Bảng dòng phiếu xuất (trang chi tiết + bản in). Mỗi dòng BE trả là một hàng, khoá theo `slug` — sau gửi duyệt BE có thể
 * tách một dòng thành nhiều dòng cùng vật tư khác lô (FEFO), bảng hiện đủ, không gộp và không coi là trùng. Đơn vị gốc
 * không có trong dòng → suy từ dòng `conversionRate = 1` của cùng vật tư (như phiếu nhập). Giá chỉ có nghĩa với lý do Bán.
 */
export function ExportFormItemsTable({
  form,
  baseUnitCode,
}: {
  form: ExportForm
  baseUnitCode?: (materialSlug: string) => string | undefined
}) {
  const { t } = useTranslation(['exportForms', 'common'])
  const items = form.items ?? []
  const priced = form.type === 'SALE'
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">{t('exportForms:lineNo')}</TableHead>
          <TableHead>{t('exportForms:fieldMaterial')}</TableHead>
          <TableHead>{t('exportForms:fieldBatch')}</TableHead>
          <TableHead>{t('exportForms:fieldUnit')}</TableHead>
          <TableHead className="text-right">{t('exportForms:fieldQuantity')}</TableHead>
          <TableHead className="text-right">{t('exportForms:fieldBaseQuantity')}</TableHead>
          {priced && (
            <TableHead className="text-right">{t('exportForms:fieldUnitPrice')}</TableHead>
          )}
          {priced && <TableHead className="text-right">{t('exportForms:fieldAmount')}</TableHead>}
          <TableHead>{t('exportForms:fieldLineNote')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.slug}>
            <TableCell className="tabular-nums">{item.lineNo}</TableCell>
            <TableCell>
              <span className="block max-w-56 break-words whitespace-normal">
                <span className="font-medium">{item.materialCode}</span> · {item.materialName}
              </span>
            </TableCell>
            <TableCell>
              <BatchCell item={item} draft={form.status === 'DRAFT'} />
            </TableCell>
            <TableCell>{item.unitCode}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatQuantity(item.quantity)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {item.conversionRate !== 1
                ? t('exportForms:converted', {
                    value:
                      `${formatQuantity(item.baseQuantity)} ${baseUnitCode?.(item.materialSlug) ?? ''}`.trim(),
                  })
                : '—'}
            </TableCell>
            {priced && (
              <TableCell className="text-right tabular-nums">
                {formatCurrency(item.unitPrice, { maximumFractionDigits: 2 })}
              </TableCell>
            )}
            {priced && (
              <TableCell className="text-right tabular-nums">
                {formatCurrency(item.amount, { maximumFractionDigits: 2 })}
              </TableCell>
            )}
            <TableCell>
              {item.note ? (
                <span className="block max-w-48 break-words whitespace-normal">{item.note}</span>
              ) : (
                <EmptyValue />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      {priced && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={7} className="text-right font-medium">
              {t('exportForms:fieldTotal')}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatCurrency(form.totalAmount, { maximumFractionDigits: 2 })}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      )}
    </Table>
  )
}

/**
 * Dòng chỉ có `batchSlug` + `batchExpiryDate` (không có mã / ngày nhập của lô — spec §4.2, không gọi thêm
 * `material-batches`). Chưa có lô: nháp → BE tự chọn khi gửi duyệt; phiếu khác (huỷ từ nháp) → "Chưa có".
 */
function BatchCell({ item, draft }: { item: ExportFormItem; draft: boolean }) {
  const { t } = useTranslation(['exportForms'])
  if (!item.batchSlug) {
    return draft ? (
      <span className="text-muted-foreground whitespace-nowrap">
        {t('exportForms:batchAutoOnSubmit')}
      </span>
    ) : (
      <EmptyValue />
    )
  }
  return (
    <span className="whitespace-nowrap">
      {item.batchExpiryDate
        ? t('exportForms:batchExpiry', { date: formatDate(item.batchExpiryDate) })
        : t('exportForms:batchNoExpiryLot')}
    </span>
  )
}
