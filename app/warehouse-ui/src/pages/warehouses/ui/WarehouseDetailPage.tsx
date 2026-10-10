import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, MoreHorizontalIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BACKEND_SUPPORTS } from '@/shared/api/backend-capabilities'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { readBackTo } from '@/shared/lib/back-link'
import { formatDateTime } from '@/shared/lib/format'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import { formatPersonLabel } from '@/shared/lib/person-name'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { DetailCard, DetailContact, DetailField, DetailGroup, DetailMeta } from '@/shared/ui/detail'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemHint,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Skeleton } from '@/shared/ui/skeleton'
import { useAuthStore } from '@/entities/session'
import {
  WarehouseStatusBadge,
  useDeleteWarehouse,
  useUpdateWarehouse,
  useWarehouse,
  warehouseKeys,
  type Warehouse,
} from '@/entities/warehouse'
import { AssignWarehouseManagerDialog } from '@/features/warehouse-assign-manager'
import { ToggleWarehouseActiveDialog } from '@/features/warehouse-toggle-active'
import { DeleteWarehouseDialog } from '@/features/warehouse-delete'
import { WarehouseFormSheet } from '@/features/warehouse-form'
import { useCrumbTitle } from '@/widgets/app-shell'
import { WarehouseMembers } from '@/widgets/warehouse-members'
import { warehouseAbilities } from '../model/abilities'

const LIST_PATH = '/warehouses'

export function WarehouseDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t } = useTranslation(['warehouses', 'common'])
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const ability = warehouseAbilities(user, BACKEND_SUPPORTS)

  const { data: warehouse, isPending, error, refetch } = useWarehouse(slug)
  useCrumbTitle(warehouse?.name)
  const update = useUpdateWarehouse()
  const remove = useDeleteWarehouse()

  const [formOpen, setFormOpen] = useState(false)
  const [assigning, setAssigning] = useState<Warehouse | null>(null)
  const [toggling, setToggling] = useState<Warehouse | null>(null)
  const [deleting, setDeleting] = useState<Warehouse | null>(null)

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

  // Gác bằng `data === undefined`, KHÔNG bằng truthy `error`: 500 không body làm axios reject bằng
  // chuỗi rỗng (xem CLAUDE.md, mục toRejection).
  if (!warehouse) {
    const notFound = isApiError(error) && error.statusCode === 404
    return (
      <div className="space-y-4">
        {backLink}
        <div role="alert" className="bg-card space-y-3 rounded-xl border p-6">
          <p className="text-sm">
            {notFound ? t('warehouses:notFound') : resolveApiErrorMessage(error)}
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

  const hasMenu = ability.assignManager || ability.update || ability.delete

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold break-words">{warehouse.name}</h1>
              <WarehouseStatusBadge isActive={warehouse.isActive} />
            </div>
            <p className="text-muted-foreground text-sm">{warehouse.code}</p>
          </div>
          <div className="flex gap-2">
            {ability.update && (
              <Button onClick={() => setFormOpen(true)}>{t('warehouses:editAction')}</Button>
            )}
            {hasMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t('common:moreActions')}>
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {ability.assignManager && (
                    <DropdownMenuItem onSelect={() => setAssigning(warehouse)}>
                      {t('warehouses:assignManagerAction')}
                    </DropdownMenuItem>
                  )}
                  {ability.update && (
                    <DropdownMenuItem onSelect={() => setToggling(warehouse)}>
                      {warehouse.isActive
                        ? t('warehouses:deactivateAction')
                        : t('warehouses:activateAction')}
                    </DropdownMenuItem>
                  )}
                  {ability.delete && (ability.update || ability.assignManager) && (
                    <DropdownMenuSeparator />
                  )}
                  {ability.delete && (
                    <>
                      <DropdownMenuItem
                        variant="destructive"
                        // Backend từ chối xoá kho đang hoạt động (100517) — khoá sẵn kèm lý do.
                        disabled={warehouse.isActive}
                        aria-describedby={
                          warehouse.isActive ? `delete-hint-${warehouse.slug}` : undefined
                        }
                        onSelect={() => setDeleting(warehouse)}
                      >
                        {t('warehouses:deleteAction')}
                      </DropdownMenuItem>
                      {warehouse.isActive && (
                        <DropdownMenuItemHint id={`delete-hint-${warehouse.slug}`}>
                          {t('warehouses:deleteNeedsInactive')}
                        </DropdownMenuItemHint>
                      )}
                    </>
                  )}
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
              { label: t('common:createdAt'), value: formatDateTime(warehouse.createdAt) },
              { label: t('common:updatedAt'), value: formatDateTime(warehouse.updatedAt) },
            ]}
          />
        }
      >
        <DetailGroup>
          <DetailField label={t('warehouses:columnCode')}>{warehouse.code}</DetailField>
          <DetailField label={t('warehouses:fieldManager')}>
            {warehouse.manager ? formatPersonLabel(warehouse.manager) : t('warehouses:noManager')}
          </DetailField>
          <DetailField label={t('warehouses:columnPhonenumber')}>
            <DetailContact kind="tel" value={warehouse.phonenumber} />
          </DetailField>
          <DetailField label={t('warehouses:columnAddress')} span="full">
            {warehouse.address}
          </DetailField>
          <DetailField label={t('warehouses:fieldDescription')} span="full">
            {warehouse.description || <EmptyValue />}
          </DetailField>
        </DetailGroup>
      </DetailCard>

      {ability.viewMembers && (
        <WarehouseMembers
          key={warehouse.slug}
          warehouse={warehouse}
          canManage={ability.manageMembers}
        />
      )}

      <WarehouseFormSheet open={formOpen} onOpenChange={setFormOpen} warehouse={warehouse} />
      {ability.assignManager && (
        <AssignWarehouseManagerDialog
          warehouse={assigning}
          onOpenChange={(open) => !open && setAssigning(null)}
        />
      )}
      <ToggleWarehouseActiveDialog
        warehouse={toggling}
        onOpenChange={(open) => !open && setToggling(null)}
        isPending={update.isPending}
        onConfirm={(w) =>
          update.mutate(
            { slug: w.slug, input: { isActive: !w.isActive } },
            { onSuccess: () => setToggling(null), onError: toastApiError },
          )
        }
      />
      <DeleteWarehouseDialog
        warehouse={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        isPending={remove.isPending}
        onConfirm={(target) =>
          remove.mutate(target, {
            onSuccess: () => {
              // Gỡ khỏi cache trước khi rời trang: không để bản ghi vừa xoá bị tải lại rồi báo 404.
              qc.removeQueries({ queryKey: warehouseKeys.detail(target) })
              navigate(backTo, { replace: true })
            },
          })
        }
      />
    </div>
  )
}
