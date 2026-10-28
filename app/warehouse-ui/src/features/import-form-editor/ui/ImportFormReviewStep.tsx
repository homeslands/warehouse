import { InfoIcon, PencilIcon, TriangleAlertIcon } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { AvailableMaterial } from '@/entities/import-form'
import { formatCurrency, formatDate, formatQuantity } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import { MetaList, type MetaItem } from '@/shared/ui/MetaList'
import { SectionHeading } from '@/shared/ui/SectionHeading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { formTotal, lineAmount, type ImportFormValues } from '../model/import-form-editor.schema'
import { reviewImportForm, type ReviewWarning } from '../model/review'

type ImportFormReviewStepProps = {
  values: ImportFormValues
  materials: ReadonlyMap<string, AvailableMaterial>
  supplierName: (slug: string) => string
  /** Nhãn đang hiển thị của vật tư không có trong `materials` (vừa thêm từ hộp, dòng cũ). */
  materialLabel: (slug: string) => string | undefined
  /** Nhãn đơn vị dạng `mã · tên`; bảng chỉ lấy phần mã. */
  unitLabel: (materialSlug: string, unitSlug: string) => string | undefined
  /** Có IMPORT_FORM_CONFIRM: mô tả nhắc thêm "Lưu & xác nhận". */
  canConfirm: boolean
  /** Đang sửa nháp: chân sheet có "Lưu" (không phải "Lưu nháp") — mô tả nói theo nút đó. */
  editing?: boolean
  disabled?: boolean
  onJumpToLine: (index: number) => void
  /** Nút "Sửa" của từng phần: về bước ① (thông tin) hoặc ② (dòng vật tư) — sửa được mọi bước, kể cả khi sửa nháp. */
  onEditStep: (step: 'info' | 'items') => void
}

const money = (value: number | undefined) =>
  value === undefined ? '' : formatCurrency(value, { maximumFractionDigits: 2 })

/**
 * Trang "Kiểm tra phiếu nhập" (bước ③): tóm tắt phiếu, cảnh báo mềm (không bao giờ chặn lưu), thông tin NCC sẽ
 * được gắn và bảng chỉ xem các dòng. Nút lưu nằm ở chân sheet, không ở đây.
 */
export function ImportFormReviewStep({
  values,
  materials,
  supplierName,
  materialLabel,
  unitLabel,
  canConfirm,
  editing = false,
  disabled,
  onJumpToLine,
  onEditStep,
}: ImportFormReviewStepProps) {
  const { t } = useTranslation(['importForms'])
  const linesTitleId = useId()
  const infoTitleId = useId()
  const { warnings, newLinks, supplierSlugs } = reviewImportForm(values, materials)

  const meta: MetaItem[] = [
    ...(supplierSlugs.length > 0
      ? [
          {
            label: t('importForms:reviewSeller'),
            value:
              supplierSlugs.length > 1
                ? t('importForms:reviewMultipleSellers', { count: supplierSlugs.length })
                : supplierName(supplierSlugs[0]),
          },
        ]
      : []),
    { label: t('importForms:fieldInvoiceCode'), value: values.invoiceCode.trim() },
    { label: t('importForms:fieldDate'), value: formatDate(values.date ?? '') },
    ...(values.purchaseOrder.trim()
      ? [{ label: t('importForms:fieldPurchaseOrderShort'), value: values.purchaseOrder.trim() }]
      : []),
  ]

  const materialName = (slug: string) => {
    const m = materials.get(slug)
    return m ? `${m.code} · ${m.name}` : materialLabel(slug)
  }

  const warningText = (w: ReviewWarning) => {
    const slug = values.items[w.index]?.materialSlug ?? ''
    const name = materials.get(slug)?.name ?? materialLabel(slug)
    // Không có tên thì bỏ hẳn phần tên — tránh "Dòng 3 ·  — …".
    const line = name
      ? t('importForms:warnLineNamed', { line: w.index + 1, name })
      : t('importForms:warnLine', { line: w.index + 1 })
    switch (w.kind) {
      case 'zeroPrice':
        return t('importForms:warnZeroPrice', { line })
      case 'nonBaseUnit':
        return t('importForms:warnNonBaseUnit', {
          line,
          quantity: formatQuantity(w.quantity),
          unit: w.unitCode,
          baseQuantity: formatQuantity(w.baseQuantity),
          baseUnit: w.baseUnitCode,
        })
      case 'overMax':
        return t('importForms:warnOverMax', {
          line,
          after: formatQuantity(w.after),
          max: formatQuantity(w.max),
          unit: w.baseUnitCode,
        })
    }
  }

  // Một nguồn cho cả hai cách hiện các dòng (danh sách xếp chồng ở khung hẹp, bảng ở khung rộng).
  const lines = values.items.map((item, index) => {
    const unit = unitLabel(item.materialSlug, item.unitSlug)?.split(' · ')[0] ?? ''
    return {
      index,
      name: materialName(item.materialSlug),
      quantity: `${formatQuantity(item.quantity)} ${unit}`.trim(),
      price: money(item.unitPrice),
      amount: money(lineAmount(item.quantity, item.unitPrice)),
      expiry: item.expiryDate,
    }
  })

  const editButton = (step: 'info' | 'items', label: string) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-label={label}
      onClick={() => onEditStep(step)}
    >
      <PencilIcon aria-hidden />
      {t('importForms:editSection')}
    </Button>
  )

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 tabIndex={-1} className="text-base font-semibold outline-none">
          {t('importForms:reviewTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {editing
            ? canConfirm
              ? t('importForms:reviewDescriptionEdit')
              : t('importForms:reviewDescriptionEditDraftOnly')
            : canConfirm
              ? t('importForms:reviewDescription')
              : t('importForms:reviewDescriptionDraftOnly')}
        </p>
      </div>

      <section aria-labelledby={infoTitleId} className="space-y-2">
        <SectionHeading
          id={infoTitleId}
          title={t('importForms:stepSeller')}
          action={editButton('info', t('importForms:editInfoSection'))}
        />
        <MetaList items={meta} />
      </section>

      {warnings.length > 0 && (
        <section className="border-warning/40 bg-warning/5 space-y-2 rounded-lg border p-3 text-sm">
          <h3 className="flex items-center gap-1.5 font-medium">
            <TriangleAlertIcon className="text-warning size-4" aria-hidden />
            {t('importForms:reviewNeedsAttention', { count: warnings.length })}
          </h3>
          <ul className="space-y-1.5">
            {warnings.map((w) => (
              <li key={`${w.kind}-${w.index}`} className="flex items-start justify-between gap-3">
                <span className="min-w-0">{warningText(w)}</span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto shrink-0 p-0"
                  disabled={disabled}
                  onClick={() => onJumpToLine(w.index)}
                >
                  {t('importForms:fixLine')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {newLinks.length > 0 && (
        <ul className="text-muted-foreground space-y-1.5 text-sm">
          {newLinks.map((link) => (
            <li key={link.supplierSlug} className="flex items-start gap-2">
              <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {t('importForms:infoNewSupplier', {
                  supplier: supplierName(link.supplierSlug),
                  count: link.materialSlugs.length,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Container query theo bề rộng khung (như lưới dòng ở bước ②): khung hẹp hơn `@3xl` thì mỗi dòng là một mục xếp
          chồng — bảng 5 cột ở đó bóp cột Vật tư còn một từ mỗi dòng và đẩy cột tiền ra sau thanh cuộn ngang. */}
      <section aria-labelledby={linesTitleId} className="@container space-y-2">
        <SectionHeading
          id={linesTitleId}
          title={t('importForms:items')}
          action={editButton('items', t('importForms:editItemsSection'))}
        />
        <ol aria-labelledby={linesTitleId} className="divide-y text-sm @3xl:hidden">
          {lines.map(({ index, name, quantity, price, amount, expiry }) => (
            <li key={index} className="space-y-1 py-2.5 first:pt-0">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-5 shrink-0 tabular-nums">{index + 1}</span>
                <span className="min-w-0 break-words">{name}</span>
              </div>
              <div className="flex flex-wrap justify-end gap-x-1.5 pl-7 text-right tabular-nums">
                {/* Dấu nối đi liền với số phía sau: xuống dòng thì dấu đứng đầu dòng mới, không treo cuối dòng trên. */}
                <span className="whitespace-nowrap">{quantity}</span>
                <span className="whitespace-nowrap">
                  <span className="text-muted-foreground">·</span> {price}
                </span>
                <span className="font-medium whitespace-nowrap">
                  <span className="text-muted-foreground font-normal">→</span> {amount}
                </span>
              </div>
              {expiry && (
                <div className="text-muted-foreground pl-7 text-right text-xs tabular-nums">
                  {t('importForms:fieldExpiryDate')}: {formatDate(expiry)}
                </div>
              )}
            </li>
          ))}
        </ol>
        <div className="hidden @3xl:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead className="min-w-56">{t('importForms:fieldMaterial')}</TableHead>
                <TableHead className="text-right">{t('importForms:fieldQuantity')}</TableHead>
                <TableHead className="text-right">{t('importForms:fieldUnitPrice')}</TableHead>
                <TableHead className="text-right">{t('importForms:fieldAmount')}</TableHead>
                <TableHead>{t('importForms:fieldExpiryDate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(({ index, name, quantity, price, amount, expiry }) => (
                <TableRow key={index}>
                  <TableCell className="text-muted-foreground align-top tabular-nums">
                    {index + 1}
                  </TableCell>
                  <TableCell className="align-top break-words whitespace-normal">{name}</TableCell>
                  <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                    {quantity}
                  </TableCell>
                  <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                    {price}
                  </TableCell>
                  <TableCell className="text-right align-top font-medium whitespace-nowrap tabular-nums">
                    {amount}
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap tabular-nums">
                    {expiry ? formatDate(expiry) : <EmptyValue />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {/* Tổng cộng kiểu chứng từ: căn phải dưới bảng, ngăn bằng gạch trên. */}
        <dl
          data-testid="review-totals"
          className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 border-t pt-3 text-sm"
        >
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{t('importForms:reviewLines')}</dt>
            <dd className="font-medium tabular-nums">{values.items.length}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{t('importForms:fieldTotal')}</dt>
            <dd className="text-base font-semibold tabular-nums">
              {money(formTotal(values.items))}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
