import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { readBackTo } from '@/shared/lib/back-link'
import { formatDateTime, formatQuantity } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { DetailCard, DetailField, DetailGroup, DetailMeta } from '@/shared/ui/detail'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import { Skeleton } from '@/shared/ui/skeleton'
import { materialKeys, useMaterial } from '@/entities/material'
import { useAuthStore } from '@/entities/session'
import { DeleteMaterialDialog } from '@/features/material-delete'
import { MaterialFormSheet } from '@/features/material-form'
import { useCrumbTitle } from '@/widgets/app-shell'
import { MaterialConversionUnits } from '@/widgets/material-conversion-units'
import { materialAbilities } from '../model/abilities'

const LIST_PATH = '/materials'

export function MaterialDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t } = useTranslation(['materials', 'common'])
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const ability = materialAbilities(user)

  const { data: material, isPending, error, refetch } = useMaterial(slug)
  useCrumbTitle(material?.name)

  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Xoá xong thì gỡ cache NGAY LÚC trang unmount (không phải trước navigate): observer còn gắn sẽ dựng lại query
  // vừa gỡ và tải lại nó (rồi báo 404 cho bản ghi đã xoá).
  const deletedSlug = useRef<string | null>(null)
  useEffect(
    () => () => {
      const removed = deletedSlug.current
      if (!removed) return
      qc.removeQueries({ queryKey: materialKeys.detail(removed) })
      qc.removeQueries({ queryKey: materialKeys.conversions(removed) })
    },
    [qc],
  )

  const backTo = readBackTo(location.state, LIST_PATH)
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

  // Gác bằng `data === undefined`, KHÔNG bằng truthy `error` (500 không body → reject chuỗi rỗng).
  if (!material) {
    const notFound = isApiError(error) && error.statusCode === 404
    return (
      <div className="space-y-4">
        {backLink}
        <div role="alert" className="bg-card space-y-3 rounded-xl border p-6">
          <p className="text-sm">
            {notFound ? t('materials:notFound') : resolveApiErrorMessage(error)}
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

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="min-w-0 text-xl font-semibold break-words">
            {material.code} · {material.name}
          </h1>
          <div className="flex gap-2">
            {ability.update && (
              <Button onClick={() => setFormOpen(true)}>{t('materials:editAction')}</Button>
            )}
            {ability.delete && (
              // Backend chặn xoá khi còn gán vào kho (100712) — FE không biết trước, hộp xoá báo tại chỗ.
              <Button variant="destructive" onClick={() => setDeleting(true)}>
                {t('materials:deleteAction')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <DetailCard
        title={t('common:sectionOverview')}
        footer={
          <DetailMeta
            items={[
              { label: t('common:createdAt'), value: formatDateTime(material.createdAt) },
              { label: t('common:updatedAt'), value: formatDateTime(material.updatedAt) },
            ]}
          />
        }
      >
        <DetailGroup>
          <DetailField label={t('materials:fieldType')}>
            {material.type.code} · {material.type.name}
          </DetailField>
          <DetailField label={t('materials:fieldBaseUnit')}>
            {material.baseUnit ? (
              `${material.baseUnit.code} · ${material.baseUnit.name}`
            ) : (
              <EmptyValue />
            )}
          </DetailField>
          <DetailField label={t('materials:fieldDefaultMinimum')}>
            {formatQuantity(material.minimumInventory)}
          </DetailField>
          <DetailField label={t('materials:fieldDefaultMaximum')}>
            {formatQuantity(material.maximumInventory)}
          </DetailField>
        </DetailGroup>
      </DetailCard>

      {ability.viewConversions && (
        <MaterialConversionUnits material={material} canManage={ability.manageConversions} />
      )}

      <MaterialFormSheet open={formOpen} onOpenChange={setFormOpen} material={material} />
      {/* Luôn mounted: callback onDeleted / lỗi 100712 bị bỏ nếu hộp unmount giữa chừng. */}
      <DeleteMaterialDialog
        material={deleting ? material : null}
        onOpenChange={(open) => !open && setDeleting(false)}
        onDeleted={() => {
          deletedSlug.current = material.slug
          navigate(backTo, { replace: true })
        }}
      />
    </div>
  )
}
