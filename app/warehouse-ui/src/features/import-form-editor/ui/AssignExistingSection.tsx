import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toCodeOrNameQuery } from '@/shared/lib/code'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  INVENTORY_DOES_EXIST,
  INVENTORY_WAREHOUSE_INACTIVE,
  useAssignWarehouseMaterial,
} from '@/entities/inventory'
import { useMaterials, type Material } from '@/entities/material'

const MATERIAL_NOT_FOUND = 100701

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

type Props = {
  warehouseSlug: string
  search: string
  /** Slug vật tư đã có ở kho (từ `available-materials`) — loại khỏi kết quả. */
  availableSlugs: string[]
  canAssign: boolean
  /** `alreadyInWarehouse` = backend trả 100802 (vật tư đã ở kho) — bên gọi vẫn chọn vào dòng. */
  onAssigned: (material: { slug: string; name: string }, alreadyInWarehouse: boolean) => Promise<void> | void
}

/** Tìm danh mục vật tư (chưa có ở kho) và gắn vào kho. */
export function AssignExistingSection({ warehouseSlug, search, availableSlugs, canAssign, onAssigned }: Props) {
  const { t } = useTranslation(['importForms', 'common'])
  const hintId = useId()
  const debounced = useDebouncedValue(search.trim(), 300)
  const query = toCodeOrNameQuery(debounced)
  const enabled = debounced !== ''
  // `enabled`: option thêm vào `useMaterials` ở ghi chú dưới — ô tìm trống thì không gọi API.
  const materials = useMaterials({ page: 1, size: 20, ...query }, { enabled })
  const assign = useAssignWarehouseMaterial()
  const [rowError, setRowError] = useState<{ slug: string; message: string } | null>(null)

  if (!enabled) return null

  const found = materials.data?.items ?? []
  const candidates = found.filter((m) => !availableSlugs.includes(m.slug))

  const onAssign = (m: Material) => {
    if (assign.isPending) return
    setRowError(null)
    assign.mutate(
      { warehouseSlug, materialSlug: m.slug },
      {
        onSuccess: () => void onAssigned({ slug: m.slug, name: m.name }, false),
        onError: (error) => {
          if (isApiError(error) && error.code === INVENTORY_DOES_EXIST) {
            void onAssigned({ slug: m.slug, name: m.name }, true)
            return
          }
          if (
            isApiError(error) &&
            (error.code === INVENTORY_WAREHOUSE_INACTIVE || error.code === MATERIAL_NOT_FOUND)
          ) {
            setRowError({ slug: m.slug, message: resolveApiErrorMessage(error) })
            void materials.refetch()
            return
          }
          toastApiError(error)
        },
      },
    )
  }

  return (
    <section className="space-y-2" aria-label={t('importForms:catalogNotInWarehouse')}>
      <h3 className="text-sm font-medium">{t('importForms:catalogNotInWarehouse')}</h3>
      {materials.isPending ? (
        <Skeleton className="h-16" />
      ) : candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {found.length > 0 ? t('importForms:catalogAlreadyInWarehouse') : t('importForms:catalogEmpty')}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {candidates.map((m) => (
            <li key={m.slug} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words">
                  <span className="font-medium">{m.code}</span> · {m.name}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('importForms:catalogTypeUnit', {
                    type: m.type.name,
                    unit: m.baseUnit?.code ?? t('importForms:noBaseUnit'),
                  })}
                  {m.supplier && ` · ${m.supplier.name}`}
                </p>
                {rowError?.slug === m.slug && (
                  <p role="alert" className="text-destructive mt-1 text-sm">
                    {rowError.message}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canAssign || assign.isPending}
                aria-describedby={canAssign ? undefined : hintId}
                onClick={() => onAssign(m)}
              >
                {assign.isPending && assign.variables?.materialSlug === m.slug
                  ? t('importForms:assigning')
                  : t('importForms:assignAction')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!canAssign && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {t('importForms:needAssignPermission')}
        </p>
      )}
    </section>
  )
}
