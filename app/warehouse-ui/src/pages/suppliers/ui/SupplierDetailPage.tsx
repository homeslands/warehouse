import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, MoreHorizontalIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BACKEND_SUPPORTS } from '@/shared/api/backend-capabilities'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { readBackTo } from '@/shared/lib/back-link'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { DetailCard, DetailContact, DetailField, DetailGroup, DetailMeta } from '@/shared/ui/detail'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import { Skeleton } from '@/shared/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useAuthStore } from '@/entities/session'
import { supplierKeys, useSupplier, useSupplierMaterials } from '@/entities/supplier'
import { DeleteSupplierDialog } from '@/features/supplier-delete'
import { SupplierFormSheet } from '@/features/supplier-form'
import { useCrumbTitle } from '@/widgets/app-shell'
import { SupplierMaterials } from '@/widgets/supplier-materials'
import { SupplierTransactions } from '@/widgets/supplier-transactions'
import { resolveDetailTab, type SupplierDetailTab } from '../model/detail-tab'
import { supplierAbilities } from '../model/abilities'

const LIST_PATH = '/suppliers'

export function SupplierDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t } = useTranslation(['suppliers', 'common'])
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const ability = supplierAbilities(user, BACKEND_SUPPORTS)

  const { data: supplier, isPending, error, refetch } = useSupplier(slug)
  useCrumbTitle(supplier?.name)

  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Tổng vật tư lấy từ chính query của tab Vật tư (cùng key mặc định → dùng chung cache) nên biết
  // ngay cả khi mở thẳng ?tab=transactions. Chưa biết (thiếu MATERIAL_READ / chưa tải) → không khoá Xoá.
  const materialsQuery = useSupplierMaterials(
    slug,
    { page: 1, size: 10 },
    { enabled: ability.viewMaterials },
  )
  // `keepPreviousData` giữ số của slug trước khi đổi :slug → coi là chưa biết, đừng khoá Xoá nhầm.
  const materialsTotal = materialsQuery.isPlaceholderData
    ? null
    : (materialsQuery.data?.total ?? null)

  // Xoá xong thì gỡ bản ghi khỏi cache NGAY LÚC trang unmount, không phải trước navigate: observer
  // còn gắn sẽ dựng lại query vừa gỡ và tải lại nó (rồi báo 404 cho bản ghi đã xoá).
  const deletedSlug = useRef<string | null>(null)
  useEffect(
    () => () => {
      const slug = deletedSlug.current
      if (!slug) return
      qc.removeQueries({ queryKey: supplierKeys.detail(slug) })
      qc.removeQueries({ queryKey: supplierKeys.materials(slug) })
      qc.removeQueries({ queryKey: supplierKeys.transactions(slug) })
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

  const tab = resolveDetailTab(params.get('tab'), {
    materials: ability.viewMaterials,
    transactions: ability.viewTransactions,
  })
  const goToTab = (next: SupplierDetailTab) =>
    setParams(
      (p) => {
        p.set('tab', next)
        return p
      },
      { replace: true },
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
  if (!supplier) {
    const notFound = isApiError(error) && error.statusCode === 404
    return (
      <div className="space-y-4">
        {backLink}
        <div role="alert" className="bg-card space-y-3 rounded-xl border p-6">
          <p className="text-sm">
            {notFound ? t('suppliers:notFound') : resolveApiErrorMessage(error)}
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

  const blocked = ability.viewMaterials && materialsTotal !== null && materialsTotal > 0

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="min-w-0 text-xl font-semibold break-words">
            {supplier.code} · {supplier.name}
          </h1>
          <div className="flex gap-2">
            {ability.update && (
              <Button onClick={() => setFormOpen(true)}>{t('suppliers:editAction')}</Button>
            )}
            {ability.delete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t('common:moreActions')}>
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    // Backend chặn xoá khi còn vật tư gắn (101211) — khoá sẵn kèm lý do khi đã biết tổng.
                    disabled={blocked}
                    title={blocked ? t('suppliers:deleteBlocked') : undefined}
                    onSelect={() => setDeleting(true)}
                  >
                    {t('suppliers:deleteMenu')}
                  </DropdownMenuItem>
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
              { label: t('common:createdAt'), value: formatDateTime(supplier.createdAt) },
              { label: t('common:updatedAt'), value: formatDateTime(supplier.updatedAt) },
            ]}
          />
        }
      >
        <DetailGroup>
          <DetailField label={t('suppliers:fieldTaxCode')}>
            {supplier.taxCode || <EmptyValue />}
          </DetailField>
          <DetailField label={t('suppliers:fieldPhonenumber')}>
            <DetailContact kind="tel" value={supplier.phonenumber} />
          </DetailField>
          <DetailField label={t('suppliers:fieldEmail')}>
            <DetailContact kind="mailto" value={supplier.email} />
          </DetailField>
          <DetailField label={t('suppliers:fieldContactPerson')}>
            {supplier.contactPerson || <EmptyValue />}
          </DetailField>
          <DetailField label={t('suppliers:fieldAddress')} span="full">
            {supplier.address || <EmptyValue />}
          </DetailField>
          <DetailField label={t('suppliers:fieldNote')} span="full">
            {supplier.note || <EmptyValue />}
          </DetailField>
        </DetailGroup>
      </DetailCard>

      {tab !== null && (
        <Tabs value={tab} onValueChange={(v) => goToTab(v as SupplierDetailTab)}>
          <TabsList aria-label={t('suppliers:tabsLabel')}>
            {ability.viewMaterials && (
              <TabsTrigger value="materials">
                {materialsTotal === null
                  ? t('suppliers:tabMaterials')
                  : t('suppliers:tabMaterialsCount', { count: materialsTotal })}
              </TabsTrigger>
            )}
            {ability.viewTransactions && (
              <TabsTrigger value="transactions">{t('suppliers:tabTransactions')}</TabsTrigger>
            )}
          </TabsList>
          {ability.viewMaterials && (
            <TabsContent value="materials">
              <SupplierMaterials
                supplier={supplier}
                canManage={ability.manageMaterials}
                canFilter={ability.filterMaterials}
              />
            </TabsContent>
          )}
          {ability.viewTransactions && (
            <TabsContent value="transactions">
              <SupplierTransactions
                supplier={supplier}
                canRecord={ability.recordTransaction}
                canViewMaterials={ability.viewMaterials}
                onGoToMaterials={() => goToTab('materials')}
              />
            </TabsContent>
          )}
        </Tabs>
      )}

      <SupplierFormSheet open={formOpen} onOpenChange={setFormOpen} supplier={supplier} />
      {/* Luôn mounted: mutate callbacks (onDeleted / lỗi 101211) bị bỏ nếu hộp unmount giữa chừng. */}
      <DeleteSupplierDialog
        supplier={deleting ? supplier : null}
        onOpenChange={(open) => !open && setDeleting(false)}
        onDeleted={() => {
          deletedSlug.current = supplier.slug
          navigate(backTo, { replace: true })
        }}
      />
    </div>
  )
}
