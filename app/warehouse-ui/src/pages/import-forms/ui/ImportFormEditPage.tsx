import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { Skeleton } from '@/shared/ui/skeleton'
import { importFormKeys, useImportForm } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { ImportFormEditor } from '@/features/import-form-editor'
import { importFormAbilities } from '../model/abilities'
import { IMPORT_FORMS_PATH, detailPath } from '../model/paths'
import { useWarehouseParam } from './useWarehouseParam'

export function ImportFormEditPage() {
  const warehouseSlug = useWarehouseParam()
  if (!warehouseSlug) return <Navigate to={IMPORT_FORMS_PATH} replace />
  return <EditContent warehouseSlug={warehouseSlug} />
}

function EditContent({ warehouseSlug }: { warehouseSlug: string }) {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t } = useTranslation(['importForms', 'common'])
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { data: form, isPending, error } = useImportForm(warehouseSlug, slug)
  const toDetail = detailPath(warehouseSlug, slug)

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (!form) {
    const notFound = isApiError(error) && error.statusCode === 404
    return (
      <p role="alert" className="bg-card rounded-xl border p-6 text-sm">
        {notFound ? t('importForms:notFound') : resolveApiErrorMessage(error)}
      </p>
    )
  }

  const title = (
    <h1 className="text-xl font-semibold">{t('importForms:editTitle', { code: form.code })}</h1>
  )
  if (!importFormAbilities(user, { form, warehouseActive: true }).update) {
    return (
      <div className="space-y-4">
        {title}
        <div role="alert" className="bg-card space-y-3 rounded-xl border p-6 text-sm">
          <p>{t('importForms:notEditable')}</p>
          <Link to={toDetail} className="underline underline-offset-4">
            {t('importForms:backToDetail')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {title}
      <ImportFormEditor
        key={`${form.slug}:${form.version}`}
        warehouseSlug={warehouseSlug}
        form={form}
        onSaved={() => navigate(toDetail, { replace: true, state: location.state })}
        onCancel={() => navigate(toDetail, { state: location.state })}
        onConflict={() => {
          toast.error(t('importForms:conflict'))
          void qc.invalidateQueries({ queryKey: importFormKeys.warehouse(warehouseSlug) })
          navigate(toDetail, { replace: true, state: location.state })
        }}
      />
    </div>
  )
}
