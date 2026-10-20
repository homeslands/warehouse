import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toMaterialSearchQuery } from '@/shared/lib/code'
import { formatQuantity } from '@/shared/lib/format'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { NumberInput } from '@/shared/ui/NumberInput'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  INVENTORY_DOES_EXIST,
  INVENTORY_WAREHOUSE_INACTIVE,
  useAssignWarehouseMaterial,
  type InventoryThresholdInput,
} from '@/entities/inventory'
import { MATERIAL_NOT_FOUND, useMaterials, type Material } from '@/entities/material'
import { validateAssignThresholds, type ThresholdErrors } from '../model/thresholds'

/** Lỗi ngưỡng của `PUT` (ngưỡng riêng của kho): tối thiểu sai / tối đa sai / tối đa < tối thiểu theo ngưỡng hiệu lực. */
const INVENTORY_MINIMUM_INVALID = 100809
const INVENTORY_MAXIMUM_INVALID = 100810
const INVENTORY_RANGE_INVALID = 100811

/** Dòng đang mở bước nhập ngưỡng trước khi gắn. `tried`: đã bấm xác nhận một lần → kiểm lại mỗi lần sửa. */
type Pending = {
  slug: string
  input: InventoryThresholdInput
  errors: ThresholdErrors
  tried: boolean
}

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
  canAssign: boolean
  /** Hộp đang bận (gắn / tạo, kể cả đoạn sau khi API trả về) — khoá mọi nút. */
  locked?: boolean
  /** `alreadyInWarehouse` = backend trả 100802 (vật tư đã ở kho) — bên gọi vẫn chọn vào dòng. */
  onAssigned: (material: Material, alreadyInWarehouse: boolean) => Promise<void> | void
  /** `true` từ lúc gửi đến khi `onAssigned` xong — bên gọi khoá mọi lối đóng hộp trong lúc đó. */
  onBusyChange?: (busy: boolean) => void
}

/** Số vật tư tải sẵn khi ô tìm trống — BE không lọc được "chưa thuộc kho X" nên FE tự loại trong trang này. */
const BROWSE_SIZE = 50

/** Danh mục vật tư chưa có ở kho (ô trống: 50 vật tư đầu; có chữ: tìm phía BE) và gắn vào kho. */
export function AssignExistingSection({
  warehouseSlug,
  search,
  canAssign,
  locked = false,
  onAssigned,
  onBusyChange,
}: Props) {
  const { t } = useTranslation(['inventory'])
  const hintId = useId()
  const debounced = useDebouncedValue(search.trim(), 300)
  const query = toMaterialSearchQuery(debounced)
  // Ô trống → liệt kê sẵn trang đầu danh mục (kho mới không phải đoán tên để gõ). Có chữ mà toàn ký tự BE không nhận
  // (sanitize ra rỗng) → không gọi API, hiện câu gợi ý.
  const browsing = debounced === ''
  const enabled = browsing || Object.keys(query).length > 0
  const materials = useMaterials(
    browsing ? { page: 1, size: BROWSE_SIZE } : { page: 1, size: 20, ...query },
    { enabled },
  )
  const assign = useAssignWarehouseMaterial()
  const [rowError, setRowError] = useState<{ search: string; message: string } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const inFlight = useRef(false)

  if (!enabled) return <p className="text-muted-foreground text-sm">{t('inventory:catalogHint')}</p>

  const found = materials.data?.items ?? []
  // Đã ở kho này thì chọn thẳng trong dòng / bảng — theo `warehouses` của chính vật tư nên không phụ thuộc 100 bản ghi đầu.
  const candidates = found.filter((m) => !m.warehouses.some((w) => w.slug === warehouseSlug))
  // Lỗi gắn gắn với từ khoá đã tìm: đổi từ khoá thì tự ẩn; refetch có thể gỡ dòng nên hiển thị ở mức section.
  const sectionError = rowError?.search === debounced ? rowError.message : null

  const thresholdDefaults = (m: Material) => ({
    minimumInventory: m.minimumInventory,
    maximumInventory: m.maximumInventory,
  })

  const editThreshold = (m: Material, key: keyof InventoryThresholdInput, value?: number) =>
    setPending((prev) => {
      if (!prev || prev.slug !== m.slug) return prev
      const input = { ...prev.input, [key]: value }
      return {
        ...prev,
        input,
        errors: prev.tried ? validateAssignThresholds(input, thresholdDefaults(m)) : {},
      }
    })

  const confirmAssign = (m: Material) => {
    if (!pending || pending.slug !== m.slug) return
    const errors = validateAssignThresholds(pending.input, thresholdDefaults(m))
    setPending({ ...pending, errors, tried: true })
    if (Object.keys(errors).length === 0) onAssign(m, pending.input)
  }

  const onAssign = (m: Material, thresholds: InventoryThresholdInput) => {
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
      { warehouseSlug, materialSlug: m.slug, thresholds },
      {
        onSuccess: () => {
          setPending(null)
          void done(false)
        },
        onError: (error) => {
          if (isApiError(error) && error.code === INVENTORY_DOES_EXIST) {
            void done(true)
            return
          }
          inFlight.current = false
          onBusyChange?.(false)
          // Lỗi ngưỡng → báo tại ô của dòng đang mở (FE đã kiểm trước, chỉ lọt khi ngưỡng vật tư vừa bị đổi).
          const thresholdError = isApiError(error) ? thresholdErrorOf(error.code, thresholds) : null
          if (thresholdError) {
            setPending((prev) =>
              prev && prev.slug === m.slug
                ? { ...prev, errors: thresholdError, tried: true }
                : prev,
            )
            return
          }
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
    <section className="space-y-2" aria-label={t('inventory:catalogNotInWarehouse')}>
      <h3 className="text-sm font-medium">{t('inventory:catalogNotInWarehouse')}</h3>
      {sectionError && (
        <p role="alert" className="text-destructive text-sm">
          {sectionError}
        </p>
      )}
      {materials.isPending ? (
        <Skeleton className="h-16" />
      ) : candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {!browsing && found.length === 1
            ? t('inventory:catalogAlreadyInWarehouse')
            : t('inventory:catalogEmpty')}
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
                    {t('inventory:catalogTypeUnit', {
                      type: m.type.name,
                      unit: m.units.length
                        ? m.units.map((u) => u.unitCode).join(', ')
                        : (m.baseUnit?.code ?? t('inventory:noBaseUnit')),
                    })}
                    {m.suppliers.length > 0 && (
                      <>
                        {' · '}
                        <SupplierNames names={m.suppliers.map((s) => s.name)} />
                      </>
                    )}
                  </p>
                </div>
                {pending?.slug !== m.slug && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canAssign || locked || assign.isPending || noBaseUnit}
                    aria-describedby={!canAssign ? hintId : noBaseUnit ? rowHintId : undefined}
                    onClick={() =>
                      setPending({ slug: m.slug, input: {}, errors: {}, tried: false })
                    }
                  >
                    {t('inventory:assignAction')}
                  </Button>
                )}
                {noBaseUnit && (
                  <p id={rowHintId} className="text-muted-foreground w-full text-xs">
                    {t('inventory:noBaseUnit')}
                  </p>
                )}
                {pending?.slug === m.slug && (
                  <ThresholdStep
                    material={m}
                    pending={pending}
                    busy={assign.isPending || locked}
                    onChange={(key, value) => editThreshold(m, key, value)}
                    onCancel={() => setPending(null)}
                    onConfirm={() => confirmAssign(m)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
      {/* Chỉ tải trang đầu: còn vật tư chưa hiện thì nói rõ để người dùng gõ tìm (kể cả khi trang đầu đều đã ở kho). */}
      {browsing && materials.data && materials.data.total > found.length && (
        <p className="text-muted-foreground text-xs">
          {t('inventory:catalogBrowseLimit', { count: found.length })}
        </p>
      )}
      {!canAssign && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {t('inventory:needAssignPermission')}
        </p>
      )}
    </section>
  )
}

const MAX_SUPPLIERS_SHOWN = 2

/** Nhiều nhà cung cấp: 2 tên đầu + "+N" (như cột Kho của màn Người dùng); đủ tên ở `title` và cho trình đọc màn hình. */
function SupplierNames({ names }: { names: string[] }) {
  const all = names.join(', ')
  if (names.length <= MAX_SUPPLIERS_SHOWN) return <span>{all}</span>
  return (
    <span title={all}>
      <span aria-hidden="true">
        <span>{names.slice(0, MAX_SUPPLIERS_SHOWN).join(', ')}</span> +
        {names.length - MAX_SUPPLIERS_SHOWN}
      </span>
      <span className="sr-only">{all}</span>
    </span>
  )
}

/** Lỗi ngưỡng backend → lỗi tại ô; 100811 đặt ở ô người dùng đã nhập (ô tối đa nếu có). Không phải lỗi ngưỡng → null. */
function thresholdErrorOf(
  code: number | undefined,
  input: InventoryThresholdInput,
): ThresholdErrors | null {
  if (code === INVENTORY_MINIMUM_INVALID)
    return { minimumInventory: { key: 'inventory:thresholdInvalid' } }
  if (code === INVENTORY_MAXIMUM_INVALID)
    return { maximumInventory: { key: 'inventory:thresholdInvalid' } }
  if (code === INVENTORY_RANGE_INVALID)
    return input.maximumInventory !== undefined
      ? { maximumInventory: { key: 'inventory:thresholdRange' } }
      : { minimumInventory: { key: 'inventory:thresholdRange' } }
  return null
}

/**
 * Bước nhập ngưỡng RIÊNG của kho, mở ngay trong dòng vật tư sau khi bấm "Gắn vào kho". Trống = theo ngưỡng mặc định của
 * vật tư (hiện làm gợi ý trong ô). Lỗi theo ô (khoá i18n) nối `aria-describedby`.
 */
function ThresholdStep({
  material,
  pending,
  busy,
  onChange,
  onCancel,
  onConfirm,
}: {
  material: Material
  pending: Pending
  busy: boolean
  onChange: (key: keyof InventoryThresholdInput, value?: number) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation(['inventory', 'common'])
  const id = useId()
  const shown = (n: number) => (n > 0 ? formatQuantity(n) : t('inventory:thresholdNotSet'))
  const fields = [
    {
      key: 'minimumInventory',
      label: t('inventory:fieldMinimum'),
      fallback: material.minimumInventory,
    },
    {
      key: 'maximumInventory',
      label: t('inventory:fieldMaximum'),
      fallback: material.maximumInventory,
    },
  ] as const

  return (
    <div
      role="group"
      aria-labelledby={`${id}-title`}
      className="bg-muted/40 w-full space-y-3 rounded-md border p-3"
    >
      <div>
        <p id={`${id}-title`} className="text-sm font-medium">
          {t('inventory:assignThresholdTitle')}
        </p>
        <p className="text-muted-foreground text-xs">
          {t('inventory:assignThresholdDefaults', {
            min: shown(material.minimumInventory),
            max: shown(material.maximumInventory),
          })}
          {' · '}
          {t('inventory:assignThresholdHint')}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f, i) => {
          const error = pending.errors[f.key]
          const inputId = `${id}-${f.key}`
          return (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={inputId}>{f.label}</Label>
              <NumberInput
                id={inputId}
                autoFocus={i === 0}
                value={pending.input[f.key]}
                onChange={(v) => onChange(f.key, v)}
                placeholder={f.fallback > 0 ? formatQuantity(f.fallback) : undefined}
                disabled={busy}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
              />
              {error && (
                <p id={`${inputId}-error`} className="text-destructive text-sm">
                  {t(error.key, error.values ?? {})}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          {t('common:cancel')}
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={onConfirm}>
          {busy ? t('inventory:assigning') : t('inventory:assignConfirm')}
        </Button>
      </div>
    </div>
  )
}
