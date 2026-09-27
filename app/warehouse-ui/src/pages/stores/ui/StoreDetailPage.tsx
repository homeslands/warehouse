import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, MoreHorizontalIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BACKEND_SUPPORTS } from '@/shared/api/backend-capabilities'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { readBackTo } from '@/shared/lib/back-link'
import { EMPTY_VALUE, formatDateTime } from '@/shared/lib/format'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { DetailCard, DetailContact, DetailField, DetailGroup, DetailMeta } from '@/shared/ui/detail'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Skeleton } from '@/shared/ui/skeleton'
import { useAuthStore } from '@/entities/session'
import {
  StoreStatusBadge,
  storeKeys,
  useDeleteStore,
  useStore,
  useUpdateStore,
  type Store,
} from '@/entities/store'
import { AssignStoreWarehouseDialog } from '@/features/store-assign-warehouse'
import { ToggleStoreActiveDialog } from '@/features/store-toggle-active'
import { DeleteStoreDialog } from '@/features/store-delete'
import { StoreFormSheet } from '@/features/store-form'
import { useCrumbTitle } from '@/widgets/app-shell'
import { storeAbilities } from '../model/abilities'

const LIST_PATH = '/stores'

export function StoreDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t } = useTranslation(['stores', 'common'])
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const ability = storeAbilities(user, BACKEND_SUPPORTS)

  const { data: store, isPending, error, refetch } = useStore(slug)
  useCrumbTitle(store?.name)
  const update = useUpdateStore()
  const remove = useDeleteStore()

  const [formOpen, setFormOpen] = useState(false)
  const [assigning, setAssigning] = useState<Store | null>(null)
  const [toggling, setToggling] = useState<Store | null>(null)
  const [deleting, setDeleting] = useState<Store | null>(null)

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
  if (!store) {
    const notFound = isApiError(error) && error.statusCode === 404
    return (
      <div className="space-y-4">
        {backLink}
        <div role="alert" className="bg-card space-y-3 rounded-xl border p-6">
          <p className="text-sm">
            {notFound ? t('stores:notFound') : resolveApiErrorMessage(error)}
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

  const hasMenu = ability.assignWarehouse || ability.update || ability.delete

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold break-words">{store.name}</h1>
              <StoreStatusBadge isActive={store.isActive} />
            </div>
            <p className="text-muted-foreground text-sm">{store.code}</p>
          </div>
          <div className="flex gap-2">
            {ability.update && (
              <Button onClick={() => setFormOpen(true)}>{t('stores:editAction')}</Button>
            )}
            {hasMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t('common:moreActions')}>
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {ability.assignWarehouse && (
                    <DropdownMenuItem onSelect={() => setAssigning(store)}>
                      {t('stores:assignWarehouseAction')}
                    </DropdownMenuItem>
                  )}
                  {ability.update && (
                    <DropdownMenuItem onSelect={() => setToggling(store)}>
                      {store.isActive ? t('stores:deactivateAction') : t('stores:activateAction')}
                    </DropdownMenuItem>
                  )}
                  {ability.delete && (ability.update || ability.assignWarehouse) && (
                    <DropdownMenuSeparator />
                  )}
                  {ability.delete && (
                    <DropdownMenuItem
                      variant="destructive"
                      // Backend từ chối xoá cửa hàng đang hoạt động (101016) — khoá sẵn kèm lý do.
                      disabled={store.isActive}
                      title={store.isActive ? t('stores:deleteNeedsInactive') : undefined}
                      onSelect={() => setDeleting(store)}
                    >
                      {t('stores:deleteAction')}
                    </DropdownMenuItem>
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
              { label: t('common:createdAt'), value: formatDateTime(store.createdAt) },
              { label: t('common:updatedAt'), value: formatDateTime(store.updatedAt) },
            ]}
          />
        }
      >
        <DetailGroup>
          <DetailField label={t('stores:columnCode')}>{store.code}</DetailField>
          <DetailField label={t('stores:sectionWarehouse')}>
            {store.warehouseSlug ? (
              ability.viewWarehouse ? (
                <Link
                  to={`/warehouses/${store.warehouseSlug}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {store.warehouseName || store.warehouseSlug}
                </Link>
              ) : (
                store.warehouseName || store.warehouseSlug
              )
            ) : (
              t('stores:noWarehouse')
            )}
          </DetailField>
          <DetailField label={t('stores:fieldPhonenumber')}>
            <DetailContact kind="tel" value={store.phonenumber} />
          </DetailField>
          <DetailField label={t('stores:fieldEmail')}>
            <DetailContact kind="mailto" value={store.email} />
          </DetailField>
          <DetailField label={t('stores:fieldAddress')}>{store.address || EMPTY_VALUE}</DetailField>
        </DetailGroup>
        <DetailGroup title={t('stores:sectionLegal')}>
          <DetailField label={t('stores:columnLegalName')}>{store.legalName}</DetailField>
          <DetailField label={t('stores:columnTaxCode')}>{store.taxCode}</DetailField>
          <DetailField label={t('stores:fieldInvoiceAddress')}>
            {store.invoiceAddress || EMPTY_VALUE}
          </DetailField>
        </DetailGroup>
      </DetailCard>

      <StoreFormSheet open={formOpen} onOpenChange={setFormOpen} store={store} />
      {ability.assignWarehouse && (
        <AssignStoreWarehouseDialog
          store={assigning}
          // Trang chi tiết không có trang dữ liệu cửa hàng để tính kho đã bị chiếm — truyền [] và để
          // backend là chốt chặn (101019/101020 hiện tại ô chọn).
          assignedWarehouseSlugs={[]}
          onOpenChange={(open) => !open && setAssigning(null)}
        />
      )}
      <ToggleStoreActiveDialog
        store={toggling}
        onOpenChange={(open) => !open && setToggling(null)}
        isPending={update.isPending}
        onConfirm={(s) =>
          update.mutate(
            { slug: s.slug, input: { isActive: !s.isActive } },
            { onSuccess: () => setToggling(null), onError: toastApiError },
          )
        }
      />
      <DeleteStoreDialog
        store={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        isPending={remove.isPending}
        onConfirm={(target) =>
          remove.mutate(target, {
            onSuccess: () => {
              // Gỡ khỏi cache trước khi rời trang: không để bản ghi vừa xoá bị tải lại rồi báo 404.
              qc.removeQueries({ queryKey: storeKeys.detail(target) })
              navigate(backTo, { replace: true })
            },
          })
        }
      />
    </div>
  )
}
