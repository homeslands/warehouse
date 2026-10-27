import { TriangleAlertIcon } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCurrency, formatDate, formatQuantity } from '@/shared/lib/format'
import { roundMoney } from '@/shared/lib/number'
import { Button } from '@/shared/ui/button'
import { SummaryList, type SummaryItem } from '@/shared/ui/SummaryList'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import type { InventoryItem } from '@/entities/inventory'
import type { MaterialBatch } from '@/entities/material-batch'
import type { ExportFormValues } from '../model/export-form-editor.schema'
import type { FallbackMaterial } from '../model/fallback'
import { reviewExportForm, type ReviewWarning } from '../model/review'

/** Ô cần sửa khi bấm "sửa" ở một cảnh báo. */
export type ReviewJumpField = 'quantity' | 'unitPrice' | 'batchSlug'

type ExportFormReviewStepProps = {
  values: ExportFormValues
  /** Vật tư của kho đã tải (theo `materialSlug`) — nguồn số khả dụng, tên và đơn vị. */
  stock: Map<string, InventoryItem>
  /** Lô đã biết (theo slug lô) — khả dụng / hạn dùng của lô chọn tay. */
  batches: Map<string, MaterialBatch>
  /** Tên / đơn vị đã lưu của vật tư không có trong `stock`. */
  fallbackMaterials: ReadonlyMap<string, FallbackMaterial>
  /** Có quyền gửi duyệt: mô tả nhắc "Lưu & gửi duyệt". */
  canSubmit: boolean
  /** Đang sửa nháp: chân sheet có "Lưu" (không phải "Lưu nháp"). */
  editing?: boolean
  disabled?: boolean
  onJumpToLine: (index: number, field: ReviewJumpField) => void
  /** Mốc "hôm nay" để đánh dấu lô hết hạn (truyền vào cho test). */
  now?: Date
}

const money = (value: number | undefined) =>
  value === undefined ? '' : formatCurrency(value, { maximumFractionDigits: 2 })

const amountOf = (quantity: unknown, unitPrice: unknown) =>
  typeof quantity === 'number' && typeof unitPrice === 'number'
    ? roundMoney(quantity * unitPrice)
    : undefined

const JUMP_FIELD: Record<ReviewWarning['kind'], ReviewJumpField> = {
  shortage: 'quantity',
  zeroPrice: 'unitPrice',
  expiredBatch: 'batchSlug',
}

/**
 * Bước ③ "Kiểm tra phiếu xuất": tóm tắt, "Cần xem lại" (dòng vượt khả dụng chặn gửi duyệt — nút gửi ở chân sheet tự
 * khoá; đơn giá 0 và lô hết hạn chỉ là cảnh báo mềm) và bảng chỉ xem các dòng. Nút lưu nằm ở chân sheet.
 */
export function ExportFormReviewStep({
  values,
  stock,
  batches,
  fallbackMaterials,
  canSubmit,
  editing = false,
  disabled,
  onJumpToLine,
  now = new Date(),
}: ExportFormReviewStepProps) {
  const { t } = useTranslation(['exportForms'])
  const linesTitleId = useId()
  const sale = values.type === 'SALE'
  const { warnings } = reviewExportForm(values, { stock, batches, now })

  const materialName = (slug: string) => {
    const m = stock.get(slug)
    if (m) return { full: `${m.materialCode} · ${m.materialName}`, short: m.materialName }
    const f = fallbackMaterials.get(slug)
    return f ? { full: `${f.code} · ${f.name}`, short: f.name } : undefined
  }
  const unitCode = (materialSlug: string, unitSlug: string) =>
    (stock.get(materialSlug)?.units ?? fallbackMaterials.get(materialSlug)?.units ?? []).find(
      (u) => u.unitSlug === unitSlug,
    )?.unitCode ?? ''

  const total = values.items.reduce((sum, i) => sum + (amountOf(i.quantity, i.unitPrice) ?? 0), 0)
  const summary: SummaryItem[] = [
    {
      label: t('exportForms:fieldType'),
      value: values.type ? t(`exportForms:type.${values.type}`) : '',
    },
    { label: t('exportForms:fieldReceiver'), value: values.receiver.trim() },
    { label: t('exportForms:fieldPurchaseOrder'), value: values.purchaseOrder.trim() },
    { label: t('exportForms:reviewLines'), value: String(values.items.length) },
    ...(sale ? [{ label: t('exportForms:reviewTotal'), value: money(roundMoney(total)) }] : []),
  ]

  const warningText = (w: ReviewWarning) => {
    const name = materialName(values.items[w.index]?.materialSlug ?? '')?.short
    // Không có tên thì bỏ hẳn phần tên — tránh "Dòng 3 ·  — …".
    const line = name
      ? t('exportForms:warnLineNamed', { line: w.index + 1, name })
      : t('exportForms:warnLine', { line: w.index + 1 })
    switch (w.kind) {
      case 'shortage':
        return t('exportForms:warnShortage', {
          line,
          available: formatQuantity(w.available),
          requested: formatQuantity(w.requested),
          unit: w.baseUnitCode ?? '',
        })
      case 'zeroPrice':
        return t('exportForms:warnZeroPrice', { line })
      case 'expiredBatch':
        return t('exportForms:warnExpiredBatch', { line, date: formatDate(w.expiryDate) })
    }
  }

  const batchText = (batchSlug: string) => {
    if (batchSlug === '') return t('exportForms:reviewBatchAuto')
    const batch = batches.get(batchSlug)
    if (!batch) return t('exportForms:batchUnknown')
    return batch.expiryDate
      ? t('exportForms:batchExpiry', { date: formatDate(batch.expiryDate) })
      : t('exportForms:batchNoExpiry')
  }

  // Một nguồn cho cả hai cách hiện các dòng (danh sách xếp chồng ở khung hẹp, bảng ở khung rộng).
  const lines = values.items.map((item, index) => ({
    index,
    name: materialName(item.materialSlug)?.full ?? '',
    batch: batchText(item.batchSlug),
    quantity:
      `${formatQuantity(item.quantity)} ${unitCode(item.materialSlug, item.unitSlug)}`.trim(),
    price: money(item.unitPrice),
    amount: money(amountOf(item.quantity, item.unitPrice)),
  }))

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 tabIndex={-1} className="text-base font-semibold outline-none">
          {t('exportForms:reviewTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {editing
            ? canSubmit
              ? t('exportForms:reviewDescriptionEdit')
              : t('exportForms:reviewDescriptionEditDraftOnly')
            : canSubmit
              ? t('exportForms:reviewDescription')
              : t('exportForms:reviewDescriptionDraftOnly')}
        </p>
      </div>

      <SummaryList items={summary} />

      {warnings.length > 0 && (
        <section className="space-y-2 text-sm">
          <h3 className="flex items-center gap-1.5 font-medium">
            <TriangleAlertIcon className="text-warning size-4" aria-hidden />
            {t('exportForms:reviewNeedsAttention', { count: warnings.length })}
          </h3>
          <ul className="space-y-1.5">
            {warnings.map((w) => (
              <li key={`${w.kind}-${w.index}`} className="flex items-start justify-between gap-3">
                <span
                  className={
                    w.kind === 'shortage'
                      ? 'text-destructive min-w-0 break-words'
                      : 'min-w-0 break-words'
                  }
                >
                  {warningText(w)}
                </span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto shrink-0 p-0"
                  disabled={disabled}
                  onClick={() => onJumpToLine(w.index, JUMP_FIELD[w.kind])}
                >
                  {t('exportForms:fixLine')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Container query theo bề rộng khung (như lưới dòng ở bước ②): hẹp hơn `@3xl` thì mỗi dòng là một mục xếp chồng. */}
      <section className="@container space-y-2">
        <h3 id={linesTitleId} className="text-sm font-medium">
          {t('exportForms:reviewLinesTitle')}
        </h3>
        <ol aria-labelledby={linesTitleId} className="divide-y text-sm @3xl:hidden">
          {lines.map(({ index, name, batch, quantity, price, amount }) => (
            <li key={index} className="space-y-1 py-2.5 first:pt-0">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-5 shrink-0 tabular-nums">{index + 1}</span>
                <span className="min-w-0 break-words">{name}</span>
              </div>
              <p className="text-muted-foreground pl-7 text-xs break-words">{batch}</p>
              <div className="flex flex-wrap justify-end gap-x-1.5 pl-7 text-right tabular-nums">
                <span className="whitespace-nowrap">{quantity}</span>
                {sale && (
                  <>
                    <span className="whitespace-nowrap">
                      <span className="text-muted-foreground">·</span> {price}
                    </span>
                    <span className="font-medium whitespace-nowrap">
                      <span className="text-muted-foreground font-normal">→</span> {amount}
                    </span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="hidden @3xl:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead className="min-w-56">{t('exportForms:fieldMaterial')}</TableHead>
                <TableHead className="min-w-36">{t('exportForms:fieldBatch')}</TableHead>
                <TableHead className="text-right">{t('exportForms:fieldQuantity')}</TableHead>
                {sale && (
                  <TableHead className="text-right">{t('exportForms:fieldUnitPrice')}</TableHead>
                )}
                {sale && (
                  <TableHead className="text-right">{t('exportForms:fieldAmount')}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(({ index, name, batch, quantity, price, amount }) => (
                <TableRow key={index}>
                  <TableCell className="text-muted-foreground align-top tabular-nums">
                    {index + 1}
                  </TableCell>
                  {/* `anywhere` (không phải `break-words`): bảng tự co cột theo min-content — tên dài liền một khối
                      (mã vật tư, tên không dấu cách) sẽ đẩy các cột Lô / Số lượng ra khỏi khung. Cột đã có `min-w-56`
                      nên tên thường không bị bóp. */}
                  <TableCell className="align-top whitespace-normal [overflow-wrap:anywhere]">
                    {name}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-48 align-top break-words whitespace-normal">
                    {batch}
                  </TableCell>
                  <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                    {quantity}
                  </TableCell>
                  {sale && (
                    <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                      {price}
                    </TableCell>
                  )}
                  {sale && (
                    <TableCell className="text-right align-top font-medium whitespace-nowrap tabular-nums">
                      {amount}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
