import { ArrowLeftIcon, MoreHorizontalIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { fileDisplayName } from '@/shared/api/file.api'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { readBackTo } from '@/shared/lib/back-link'
import { formatCurrency, formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { DetailCard, DetailField, DetailGroup, DetailMeta } from '@/shared/ui/detail'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import { Skeleton } from '@/shared/ui/skeleton'
import { ExportFormStatusBadge, useExportForm, type ExportForm } from '@/entities/export-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouse } from '@/entities/warehouse'
import { CancelExportFormDialog } from '@/features/export-form-cancel'
import { ConfirmExportFormDialog } from '@/features/export-form-confirm'
import { DeleteExportFormDialog } from '@/features/export-form-delete'
import { ExportFormSheet } from '@/features/export-form-editor'
import { SubmitExportFormDialog } from '@/features/export-form-submit'
import { useCrumbTitle } from '@/widgets/app-shell'
import { exportFormAbilities } from '../model/abilities'
import { EXPORT_FORMS_PATH, listPath } from '../model/paths'
import { toastExportSaveOutcome } from '../model/saveToast'
import { ExportFormItemsTable } from './ExportFormItemsTable'
import { ExportFormPrintView } from './ExportFormPrintView'
import { useWarehouseParam } from './useWarehouseParam'
import { IconTooltip } from '@/shared/ui/IconTooltip'

export function ExportFormDetailPage() {
  const warehouseSlug = useWarehouseParam()
  if (!warehouseSlug) return <Navigate to={EXPORT_FORMS_PATH} replace />
  return <DetailContent warehouseSlug={warehouseSlug} />
}

type SecondaryAction = { key: string; label: string; destructive?: boolean; onSelect: () => void }

function DetailContent({ warehouseSlug }: { warehouseSlug: string }) {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t } = useTranslation(['exportForms', 'common'])
  const location = useLocation()
  const navigate = useNavigate()
  const hintId = useId()
  const itemsHeadingId = useId()
  const user = useAuthStore((s) => s.user)
  const { data: form, isPending, error, refetch } = useExportForm(warehouseSlug, slug)
  const warehouse = useWarehouse(warehouseSlug)
  useCrumbTitle(form?.code)

  const [submitting, setSubmitting] = useState<ExportForm | null>(null)
  const [confirming, setConfirming] = useState<ExportForm | null>(null)
  const [cancelling, setCancelling] = useState<ExportForm | null>(null)
  const [deleting, setDeleting] = useState<ExportForm | null>(null)
  const [editing, setEditing] = useState(false)

  const backTo = readBackTo(location.state, listPath(warehouseSlug))
  const backLink = (
    <Link
      to={backTo}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
    >
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
      {t('common:backToList')}
    </Link>
  )

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!form) {
    const notFound = isApiError(error) && error.statusCode === 404
    return (
      <div className="space-y-4">
        {backLink}
        <div role="alert" className="bg-card space-y-3 rounded-xl border p-6">
          <p className="text-sm">
            {notFound ? t('exportForms:notFound') : resolveApiErrorMessage(error)}
          </p>
          {!notFound && (
            <Button variant="outline" onClick={() => void refetch()}>
              {t('common:retry')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  const ability = exportFormAbilities(user, {
    form,
    warehouseActive: warehouse.data?.isActive ?? false,
  })
  const warehouseName = warehouse.data
    ? `${warehouse.data.code} · ${warehouse.data.name}`
    : warehouseSlug
  const baseUnitCode = (materialSlug: string) =>
    form.items?.find((i) => i.materialSlug === materialSlug && i.conversionRate === 1)?.unitCode

  // Nút chính theo trạng thái (spec §4.2): Nháp → Gửi duyệt · Sửa; Chờ duyệt → Xác nhận. Huỷ / Xoá / In là thao tác phụ.
  const secondary: SecondaryAction[] = [
    ...(ability.cancel
      ? [{ key: 'cancel', label: t('exportForms:cancel'), onSelect: () => setCancelling(form) }]
      : []),
    ...(ability.delete
      ? [
          {
            key: 'delete',
            label: t('exportForms:delete'),
            destructive: true,
            onSelect: () => setDeleting(form),
          },
        ]
      : []),
    ...(ability.print
      ? [{ key: 'print', label: t('exportForms:print'), onSelect: () => window.print() }]
      : []),
  ]

  const approverLabel =
    form.status === 'DRAFT' || form.status === 'PENDING'
      ? t('exportForms:fieldApprover')
      : form.status === 'CANCELLED'
        ? t('exportForms:fieldCancelledBy')
        : t('exportForms:fieldConfirmedBy')

  return (
    <>
      <div className="space-y-6 print:hidden">
        <div className="space-y-3">
          {backLink}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h1 className="min-w-0 text-xl font-semibold break-words">{form.code}</h1>
              <ExportFormStatusBadge status={form.status} />
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap justify-end gap-2">
                {(ability.confirm || ability.disposalBlocked) && (
                  <Button
                    disabled={!ability.confirm}
                    aria-describedby={ability.disposalBlocked ? hintId : undefined}
                    onClick={() => setConfirming(form)}
                  >
                    {t('exportForms:confirm')}
                  </Button>
                )}
                {ability.submit && (
                  <Button onClick={() => setSubmitting(form)}>{t('exportForms:submit')}</Button>
                )}
                {ability.update && (
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    {t('exportForms:editAction')}
                  </Button>
                )}
                {secondary.length === 1 && (
                  <Button
                    variant={secondary[0].destructive ? 'destructive' : 'outline'}
                    onClick={secondary[0].onSelect}
                  >
                    {secondary[0].label}
                  </Button>
                )}
                {secondary.length >= 2 && (
                  <DropdownMenu>
                    <IconTooltip label={t('common:moreActions')}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" aria-label={t('common:moreActions')}>
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                    </IconTooltip>
                    <DropdownMenuContent align="end">
                      {secondary.map((a) => (
                        <DropdownMenuItem
                          key={a.key}
                          variant={a.destructive ? 'destructive' : 'default'}
                          onSelect={a.onSelect}
                        >
                          {a.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {ability.disposalBlocked && (
                <p id={hintId} className="text-muted-foreground max-w-72 text-right text-xs">
                  {t('exportForms:disposalNeedsApproval')}
                </p>
              )}
            </div>
          </div>
        </div>

        <DetailCard
          title={t('common:sectionOverview')}
          footer={
            <DetailMeta
              items={[
                { label: t('common:createdAt'), value: formatDateTime(form.createdAt) },
                { label: t('common:updatedAt'), value: formatDateTime(form.updatedAt) },
              ]}
            />
          }
        >
          <DetailGroup>
            <DetailField label={t('exportForms:fieldWarehouse')}>{warehouseName}</DetailField>
            <DetailField label={t('exportForms:fieldType')}>
              {t(`exportForms:type.${form.type}`)}
            </DetailField>
            <DetailField label={t('exportForms:fieldReceiver')}>
              <span className="break-words">{form.receiver}</span>
            </DetailField>
            <DetailField label={t('exportForms:fieldPurchaseOrder')}>
              <span className="break-words">{form.purchaseOrder}</span>
            </DetailField>
            <DetailField label={t('exportForms:fieldInvoiceCode')}>
              {form.invoiceCode ? (
                <span className="break-words">{form.invoiceCode}</span>
              ) : (
                <EmptyValue />
              )}
            </DetailField>
            <DetailField label={t('exportForms:fieldRequester')}>{form.requesterName}</DetailField>
            <DetailField label={approverLabel}>{form.approverName || <EmptyValue />}</DetailField>
            {form.type === 'SALE' && (
              <DetailField label={t('exportForms:fieldTotal')}>
                {formatCurrency(form.totalAmount, { maximumFractionDigits: 2 })}
              </DetailField>
            )}
            <DetailField label={t('exportForms:fieldFile')}>
              {form.file ? (
                fileDisplayName(form.file.split('/').pop() ?? form.file)
              ) : (
                <EmptyValue />
              )}
            </DetailField>
            <DetailField label={t('exportForms:fieldNote')} span="full">
              {form.note || <EmptyValue />}
            </DetailField>
          </DetailGroup>
        </DetailCard>

        <section
          aria-labelledby={itemsHeadingId}
          className="bg-card space-y-4 rounded-xl border p-5 sm:p-6"
        >
          <h2 id={itemsHeadingId} className="font-heading text-base font-semibold">
            {t('exportForms:items')}
          </h2>
          <ExportFormItemsTable form={form} baseUnitCode={baseUnitCode} />
        </section>
      </div>

      <ExportFormPrintView form={form} warehouseName={warehouseName} baseUnitCode={baseUnitCode} />

      <ExportFormSheet
        open={editing}
        onOpenChange={setEditing}
        warehouseSlug={warehouseSlug}
        warehouseName={warehouse.data?.name ?? warehouseSlug}
        formSlug={form.slug}
        formCode={form.code}
        canSubmit={ability.submit}
        canConfirm={ability.confirmOnSave}
        canApproveDisposal={ability.approveDisposal}
        canReadWarehouses={ability.readWarehouses}
        canPickBatch={ability.pickBatch}
        onSaved={(outcome) => toastExportSaveOutcome(t, outcome, false)}
      />
      <SubmitExportFormDialog
        warehouseSlug={warehouseSlug}
        form={submitting}
        onOpenChange={(open) => !open && setSubmitting(null)}
      />
      <ConfirmExportFormDialog
        warehouseSlug={warehouseSlug}
        form={confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
      />
      <CancelExportFormDialog
        warehouseSlug={warehouseSlug}
        form={cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
      />
      <DeleteExportFormDialog
        warehouseSlug={warehouseSlug}
        form={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={() => navigate(listPath(warehouseSlug), { replace: true })}
      />
    </>
  )
}
