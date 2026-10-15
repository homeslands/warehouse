import { ArrowLeftIcon, MoreHorizontalIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { fileDisplayName } from '@/shared/api/file.api'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { readBackTo } from '@/shared/lib/back-link'
import { formatCurrency, formatDate, formatDateTime } from '@/shared/lib/format'
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
import { ImportFormStatusBadge, useImportForm, type ImportForm } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouse } from '@/entities/warehouse'
import { CancelImportFormDialog } from '@/features/import-form-cancel'
import { ConfirmImportFormDialog } from '@/features/import-form-confirm'
import { DeleteImportFormDialog } from '@/features/import-form-delete'
import { ImportFormSheet } from '@/features/import-form-editor'
import { AddWarehouseMaterialDialog, materialAddAbilities } from '@/features/warehouse-material-add'
import { useCrumbTitle } from '@/widgets/app-shell'
import { importFormAbilities } from '../model/abilities'
import { IMPORT_FORMS_PATH, listPath } from '../model/paths'
import { ImportFormItemsTable } from './ImportFormItemsTable'
import { ImportFormPrintView } from './ImportFormPrintView'
import { useWarehouseParam } from './useWarehouseParam'

export function ImportFormDetailPage() {
  const warehouseSlug = useWarehouseParam()
  if (!warehouseSlug) return <Navigate to={IMPORT_FORMS_PATH} replace />
  return <DetailContent warehouseSlug={warehouseSlug} />
}

type SecondaryAction = { key: string; label: string; destructive?: boolean; onSelect: () => void }

function DetailContent({ warehouseSlug }: { warehouseSlug: string }) {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t } = useTranslation(['importForms', 'common'])
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { data: form, isPending, error, refetch } = useImportForm(warehouseSlug, slug)
  const warehouse = useWarehouse(warehouseSlug)
  useCrumbTitle(form?.code)

  const [confirming, setConfirming] = useState<ImportForm | null>(null)
  const [cancelling, setCancelling] = useState<ImportForm | null>(null)
  const [deleting, setDeleting] = useState<ImportForm | null>(null)
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
            {notFound ? t('importForms:notFound') : resolveApiErrorMessage(error)}
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

  const ability = importFormAbilities(user, {
    form,
    warehouseActive: warehouse.data?.isActive ?? false,
  })
  const warehouseName = warehouse.data
    ? `${warehouse.data.code} · ${warehouse.data.name}`
    : warehouseSlug
  const baseUnitCode = (materialSlug: string) =>
    form.items?.find((i) => i.materialSlug === materialSlug && i.conversionRate === 1)?.unitCode

  const secondary: SecondaryAction[] = [
    ...(ability.cancel
      ? [{ key: 'cancel', label: t('importForms:cancel'), onSelect: () => setCancelling(form) }]
      : []),
    ...(ability.delete
      ? [
          {
            key: 'delete',
            label: t('importForms:delete'),
            destructive: true,
            onSelect: () => setDeleting(form),
          },
        ]
      : []),
    ...(ability.print
      ? [{ key: 'print', label: t('importForms:print'), onSelect: () => window.print() }]
      : []),
  ]

  const approverLabel =
    form.status === 'CANCELLED'
      ? t('importForms:fieldCancelledBy')
      : t('importForms:fieldConfirmedBy')

  return (
    <>
      <div className="space-y-6 print:hidden">
        <div className="space-y-3">
          {backLink}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h1 className="min-w-0 text-xl font-semibold break-words">{form.code}</h1>
              <ImportFormStatusBadge status={form.status} />
            </div>
            <div className="flex flex-wrap gap-2">
              {ability.confirm && (
                <Button onClick={() => setConfirming(form)}>{t('importForms:confirm')}</Button>
              )}
              {ability.update && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  {t('importForms:editAction')}
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
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label={t('common:moreActions')}>
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
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
            <DetailField label={t('importForms:fieldWarehouse')}>{warehouseName}</DetailField>
            <DetailField label={t('importForms:fieldDate')}>{formatDate(form.date)}</DetailField>
            <DetailField label={t('importForms:fieldInvoiceCode')}>{form.invoiceCode}</DetailField>
            <DetailField label={t('importForms:fieldPurchaseOrder')}>
              {form.purchaseOrder || <EmptyValue />}
            </DetailField>
            <DetailField label={t('importForms:fieldRequester')}>{form.requesterName}</DetailField>
            <DetailField
              label={form.status === 'DRAFT' ? t('importForms:fieldApprover') : approverLabel}
            >
              {form.approverName || <EmptyValue />}
            </DetailField>
            <DetailField label={t('importForms:fieldTotal')}>
              {formatCurrency(form.total, { maximumFractionDigits: 2 })}
            </DetailField>
            <DetailField label={t('importForms:fieldFile')}>
              {form.file ? fileDisplayName(form.file) : <EmptyValue />}
            </DetailField>
            <DetailField label={t('importForms:fieldNote')} span="full">
              {form.note || <EmptyValue />}
            </DetailField>
          </DetailGroup>
        </DetailCard>

        <section className="bg-card space-y-4 rounded-xl border p-5 sm:p-6">
          <h2 className="font-heading text-base font-semibold">{t('importForms:items')}</h2>
          <ImportFormItemsTable form={form} baseUnitCode={baseUnitCode} />
        </section>
      </div>

      <ImportFormPrintView form={form} warehouseName={warehouseName} baseUnitCode={baseUnitCode} />

      <ImportFormSheet
        open={editing}
        onOpenChange={setEditing}
        warehouseSlug={warehouseSlug}
        warehouseName={warehouse.data?.name ?? warehouseSlug}
        formSlug={form.slug}
        formCode={form.code}
        materialAbilities={materialAddAbilities(user)}
        AddMaterialDialog={AddWarehouseMaterialDialog}
      />
      <ConfirmImportFormDialog
        warehouseSlug={warehouseSlug}
        form={confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
      />
      <CancelImportFormDialog
        warehouseSlug={warehouseSlug}
        form={cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
      />
      <DeleteImportFormDialog
        warehouseSlug={warehouseSlug}
        form={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={() => navigate(listPath(warehouseSlug), { replace: true })}
      />
    </>
  )
}
