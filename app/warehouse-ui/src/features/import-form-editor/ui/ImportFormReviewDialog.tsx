import { ClipboardListIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { AvailableMaterial } from '@/entities/import-form'
import { formatCurrency, formatQuantity } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { DialogIcon } from '@/shared/ui/DialogIcon'
import { SummaryList, type SummaryItem } from '@/shared/ui/SummaryList'
import { formTotal, type ImportFormValues } from '../model/import-form-editor.schema'
import { reviewImportForm, type ReviewWarning } from '../model/review'

type ImportFormReviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  values: ImportFormValues
  materials: ReadonlyMap<string, AvailableMaterial>
  supplierName: (slug: string) => string
  /** Nhãn đang hiển thị của vật tư không có trong `materials` (vừa thêm từ hộp, dòng cũ) — tên dự phòng cho cảnh báo. */
  materialLabel?: (slug: string) => string | undefined
  /** Có IMPORT_FORM_CONFIRM: hiện thêm nút "Lưu & xác nhận". */
  canConfirm: boolean
  isPending: boolean
  onSaveDraft: () => void
  onSaveAndConfirm: () => void
  /** Gọi SAU khi hộp đã đóng hẳn, để focus không bị trả về nút đã mở hộp. */
  onJumpToLine: (index: number) => void
}

/**
 * Hộp "Kiểm tra phiếu nhập" hiện sau khi form tạo mới đã hợp lệ: tóm tắt phiếu, cảnh báo mềm (không bao giờ
 * chặn lưu) và thông tin NCC sẽ được gắn. Hình dáng như `ConfirmDialog`; đang gửi thì khoá mọi lối đóng.
 */
export function ImportFormReviewDialog({
  open,
  onOpenChange,
  values,
  materials,
  supplierName,
  materialLabel,
  canConfirm,
  isPending,
  onSaveDraft,
  onSaveAndConfirm,
  onJumpToLine,
}: ImportFormReviewDialogProps) {
  const { t } = useTranslation(['importForms'])
  const pendingJump = useRef<number | null>(null)
  const { warnings, newLinks, supplierSlugs } = reviewImportForm(values, materials)

  const summary: SummaryItem[] = [
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
    { label: t('importForms:reviewLines'), value: String(values.items.length) },
    {
      label: t('importForms:fieldTotal'),
      value: formatCurrency(formTotal(values.items), { maximumFractionDigits: 2 }),
    },
  ]

  const warningText = (w: ReviewWarning) => {
    const slug = values.items[w.index]?.materialSlug ?? ''
    const name = materials.get(slug)?.name ?? materialLabel?.(slug)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role="alertdialog"
        // Cùng tiền tố `sm:` với `sm:max-w-sm` của DialogContent — class trần thua và chân 3 nút tràn ra ngoài hộp.
        className="sm:max-w-lg"
        showCloseButton={!isPending}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          if (pendingJump.current === null) return
          event.preventDefault()
          const index = pendingJump.current
          pendingJump.current = null
          onJumpToLine(index)
        }}
      >
        <DialogHeader className="items-center text-center">
          <DialogIcon tone="default">
            <ClipboardListIcon />
          </DialogIcon>
          <DialogTitle>{t('importForms:reviewTitle')}</DialogTitle>
          <DialogDescription>
            {canConfirm
              ? t('importForms:reviewDescription')
              : t('importForms:reviewDescriptionDraftOnly')}
          </DialogDescription>
        </DialogHeader>

        <SummaryList items={summary} />

        {warnings.length > 0 && (
          <section className="space-y-2 text-sm">
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
                    disabled={isPending}
                    onClick={() => {
                      pendingJump.current = w.index
                      onOpenChange(false)
                    }}
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

        <DialogFooter className="flex-col border-t-0 bg-transparent sm:flex-row [&>button]:flex-1">
          <Button
            type="button"
            variant="outline"
            size="xl"
            className="rounded-xl"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('importForms:backToEdit')}
          </Button>
          <Button
            type="button"
            variant={canConfirm ? 'outline' : 'default'}
            size="xl"
            className="rounded-xl"
            disabled={isPending}
            onClick={onSaveDraft}
          >
            {t('importForms:saveDraft')}
          </Button>
          {canConfirm && (
            <Button
              type="button"
              size="xl"
              className="rounded-xl"
              disabled={isPending}
              onClick={onSaveAndConfirm}
            >
              {t('importForms:saveAndConfirm')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
