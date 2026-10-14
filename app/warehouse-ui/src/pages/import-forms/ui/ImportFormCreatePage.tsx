import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { readBackTo } from '@/shared/lib/back-link'
import { Skeleton } from '@/shared/ui/skeleton'
import { useWarehouse } from '@/entities/warehouse'
import { ImportFormEditor } from '@/features/import-form-editor'
import { IMPORT_FORMS_PATH, detailPath, listPath } from '../model/paths'
import { useWarehouseParam } from './useWarehouseParam'

export function ImportFormCreatePage() {
  const warehouseSlug = useWarehouseParam()
  if (!warehouseSlug) return <Navigate to={IMPORT_FORMS_PATH} replace />
  return <CreateContent warehouseSlug={warehouseSlug} />
}

function CreateContent({ warehouseSlug }: { warehouseSlug: string }) {
  const { t } = useTranslation(['importForms', 'common'])
  const navigate = useNavigate()
  const location = useLocation()
  const warehouse = useWarehouse(warehouseSlug)
  const backTo = readBackTo(location.state, listPath(warehouseSlug))

  if (warehouse.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (!warehouse.data) {
    return (
      <p role="alert" className="bg-card rounded-xl border p-6 text-sm">
        {resolveApiErrorMessage(warehouse.error)}
      </p>
    )
  }
  const title = (
    <h1 className="text-xl font-semibold">
      {t('importForms:createTitle', { warehouse: warehouse.data.name })}
    </h1>
  )
  if (!warehouse.data.isActive) {
    return (
      <div className="space-y-4">
        {title}
        <p role="alert" className="bg-card rounded-xl border p-6 text-sm">
          {t('importForms:warehouseInactive')}
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {title}
      <ImportFormEditor
        warehouseSlug={warehouseSlug}
        onSaved={(saved) =>
          navigate(detailPath(warehouseSlug, saved.slug), { replace: true, state: { backTo } })
        }
        onCancel={() => navigate(backTo)}
        onConflict={() => navigate(backTo)}
      />
    </div>
  )
}
