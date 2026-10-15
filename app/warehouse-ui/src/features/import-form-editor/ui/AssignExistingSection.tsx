import { useEffect, useId, useRef, useState } from 'react'
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
import { MATERIAL_NOT_FOUND, useMaterials, type Material } from '@/entities/material'

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
  /** Hộp đang bận (gắn / tạo, kể cả đoạn sau khi API trả về) — khoá mọi nút. */
  locked?: boolean
  /** `alreadyInWarehouse` = backend trả 100802 (vật tư đã ở kho) — bên gọi vẫn chọn vào dòng. */
  onAssigned: (material: Material, alreadyInWarehouse: boolean) => Promise<void> | void
  /** `true` từ lúc gửi đến khi `onAssigned` xong — bên gọi khoá mọi lối đóng hộp trong lúc đó. */
  onBusyChange?: (busy: boolean) => void
}

/** Tìm danh mục vật tư (chưa có ở kho) và gắn vào kho. */
export function AssignExistingSection({
  warehouseSlug,
  search,
  availableSlugs,
  canAssign,
  locked = false,
  onAssigned,
  onBusyChange,
}: Props) {
  const { t } = useTranslation(['importForms'])
  const hintId = useId()
  const debounced = useDebouncedValue(search.trim(), 300)
  const query = toCodeOrNameQuery(debounced)
  const enabled = debounced !== ''
  // Ô tìm trống thì không gọi API.
  const materials = useMaterials({ page: 1, size: 20, ...query }, { enabled })
  const assign = useAssignWarehouseMaterial()
  const [rowError, setRowError] = useState<{ search: string; message: string } | null>(null)
  const inFlight = useRef(false)

  if (!enabled)
    return <p className="text-muted-foreground text-sm">{t('importForms:catalogHint')}</p>

  const found = materials.data?.items ?? []
  const candidates = found.filter((m) => !availableSlugs.includes(m.slug))
  // Lỗi gắn gắn với từ khoá đã tìm: đổi từ khoá thì tự ẩn; refetch có thể gỡ dòng nên hiển thị ở mức section.
  const sectionError = rowError?.search === debounced ? rowError.message : null

  const onAssign = (m: Material) => {
    if (inFlight.current) return
    inFlight.current = true
    setRowError(null)
    onBusyChange?.(true)
    const done = async (already: boolean) => {
      try {
        await onAssigned(m, already)
      } finally {
        inFlight.current = false
        onBusyChange?.(false)
      }
    }
    assign.mutate(
      { warehouseSlug, materialSlug: m.slug },
      {
        onSuccess: () => void done(false),
        onError: (error) => {
          if (isApiError(error) && error.code === INVENTORY_DOES_EXIST) {
            void done(true)
            return
          }
          inFlight.current = false
          onBusyChange?.(false)
          if (
            isApiError(error) &&
            (error.code === INVENTORY_WAREHOUSE_INACTIVE || error.code === MATERIAL_NOT_FOUND)
          ) {
            setRowError({
              search: debounced,
              message: `${m.code} · ${m.name}: ${resolveApiErrorMessage(error)}`,
            })
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
      {sectionError && (
        <p role="alert" className="text-destructive text-sm">
          {sectionError}
        </p>
      )}
      {materials.isPending ? (
        <Skeleton className="h-16" />
      ) : candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {found.length === 1
            ? t('importForms:catalogAlreadyInWarehouse')
            : t('importForms:catalogEmpty')}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {candidates.map((m) => {
            const noBaseUnit = m.baseUnit === null
            const rowHintId = `${hintId}-${m.slug}`
            return (
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
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canAssign || locked || assign.isPending || noBaseUnit}
                  aria-describedby={!canAssign ? hintId : noBaseUnit ? rowHintId : undefined}
                  onClick={() => onAssign(m)}
                >
                  {assign.isPending && assign.variables?.materialSlug === m.slug
                    ? t('importForms:assigning')
                    : t('importForms:assignAction')}
                </Button>
                {noBaseUnit && (
                  <p id={rowHintId} className="text-muted-foreground w-full text-xs">
                    {t('importForms:noBaseUnit')}
                  </p>
                )}
              </li>
            )
          })}
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
