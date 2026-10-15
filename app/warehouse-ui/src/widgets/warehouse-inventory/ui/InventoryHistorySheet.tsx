import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { formatDateTime, formatQuantity } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { DetailField, DetailGroup } from '@/shared/ui/detail'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'
import {
  INVENTORY_NOT_FOUND,
  removeBlockReason,
  useInventoryHistory,
  type InventoryItem,
} from '@/entities/inventory'
import { MATERIAL_NOT_FOUND, useMaterial, type Material } from '@/entities/material'
import { formatStock, thresholdRange } from '../model/format'
import { importFormCode, isKnownAction, signed } from '../model/history-labels'

type Summary = {
  materialSlug: string
  code: string
  name: string
  typeName: string | undefined
  unitCode: string | undefined
  quantity: number
  reservedQuantity: number
  availableQuantity: number
  /** `undefined` = không biết (mở bằng URL) → không hiện hàng ngưỡng. */
  threshold: { min: number; max: number } | undefined
  isBelowMinimum: boolean
  isAboveMaximum: boolean
}

function fromItem(item: InventoryItem): Summary {
  return {
    materialSlug: item.materialSlug,
    code: item.materialCode,
    name: item.materialName,
    typeName: item.typeName,
    unitCode: item.baseUnitCode,
    quantity: item.quantity,
    reservedQuantity: item.reservedQuantity,
    availableQuantity: item.availableQuantity,
    threshold: { min: item.effectiveMinimumInventory, max: item.effectiveMaximumInventory },
    isBelowMinimum: item.isBelowMinimum,
    isAboveMaximum: item.isAboveMaximum,
  }
}

/** Mở bằng URL: `GET /materials/{slug}` có tồn của từng kho trong `warehouses[]`, KHÔNG có ngưỡng riêng của kho. */
function fromMaterial(m: Material, warehouseSlug: string): Summary | null {
  const w = m.warehouses.find((x) => x.slug === warehouseSlug)
  if (!w) return null
  return {
    materialSlug: m.slug,
    code: m.code,
    name: m.name,
    typeName: m.type.name,
    unitCode: m.baseUnit?.code,
    quantity: w.quantity,
    reservedQuantity: w.quantity - w.availableQuantity,
    availableQuantity: w.availableQuantity,
    threshold: undefined,
    isBelowMinimum: false,
    isAboveMaximum: false,
  }
}

type Props = {
  warehouseSlug: string
  /** `null` = đóng. */
  materialSlug: string | null
  /** Dòng của bảng nếu có; không có (mở bằng URL) → tự tải `GET /materials/{slug}`. */
  item: InventoryItem | undefined
  canRemove: boolean
  onRemove: (target: { materialSlug: string; materialCode: string; materialName: string }) => void
  onOpenChange: (open: boolean) => void
}

/** Xem nhanh tồn + lịch sử biến động của một vật tư trong kho (`GET /warehouses/{w}/materials/{m}/history`). */
export function InventoryHistorySheet({
  warehouseSlug,
  materialSlug,
  item,
  canRemove,
  onRemove,
  onOpenChange,
}: Props) {
  const { t } = useTranslation(['inventory', 'common'])
  const open = materialSlug !== null
  const material = useMaterial(materialSlug ?? '', { enabled: open && item === undefined })
  const history = useInventoryHistory(warehouseSlug, materialSlug, { enabled: open })

  const current =
    item && open
      ? fromItem(item)
      : material.data && item === undefined
        ? fromMaterial(material.data, warehouseSlug)
        : undefined
  const notInWarehouse =
    (isApiError(history.error) && history.error.code === INVENTORY_NOT_FOUND) ||
    (isApiError(material.error) && material.error.code === MATERIAL_NOT_FOUND) ||
    (material.data !== undefined && item === undefined && current === null)

  // Giữ bản tóm tắt cuối khi sheet đang trượt ra — không trống trơn giữa chừng.
  const [last, setLast] = useState<Summary | undefined>(undefined)
  // `current` dựng mới mỗi lần render nên so theo nội dung, không so tham chiếu.
  if (current && JSON.stringify(current) !== JSON.stringify(last)) setLast(current)
  const summary = open ? (current ?? undefined) : (last ?? undefined)

  const rows = history.data?.pages.flatMap((p) => p.items) ?? []
  const blocked = summary ? removeBlockReason(summary) : null
  const showRemove = canRemove && summary !== undefined && !notInWarehouse
  const hintId = useId()
  const historyFailed = history.isError && !notInWarehouse
  const materialFailed = material.isError && item === undefined && !notInWarehouse

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]"
        // Sheet chỉ để xem: focus vào khung sheet, không vào nút "Gỡ khỏi kho" ở chân (Enter nhầm = mở hộp gỡ).
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        }}
      >
        <SheetHeader className="gap-2 border-b pr-12">
          {summary && !notInWarehouse ? (
            <>
              <SheetTitle className="break-words">{`${summary.code} · ${summary.name}`}</SheetTitle>
              <SheetDescription>{summary.typeName}</SheetDescription>
            </>
          ) : (
            <SheetTitle>{t('inventory:historyTitle')}</SheetTitle>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          {notInWarehouse ? (
            <p role="alert" className="text-sm">
              {t('inventory:notInWarehouse')}
            </p>
          ) : materialFailed && !summary ? (
            <LoadError error={material.error} onRetry={() => void material.refetch()} />
          ) : !summary ? (
            <div aria-busy="true" className="space-y-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <>
              <DetailGroup className="lg:grid-cols-2">
                <DetailField label={t('inventory:columnQuantity')}>
                  <span className="inline-flex flex-wrap items-center gap-1.5 tabular-nums">
                    {formatStock(summary.quantity, summary.unitCode)}
                    {summary.isBelowMinimum && (
                      <Badge variant="destructive">{t('inventory:badgeBelow')}</Badge>
                    )}
                    {summary.isAboveMaximum && (
                      <Badge variant="secondary">{t('inventory:badgeAbove')}</Badge>
                    )}
                  </span>
                </DetailField>
                <DetailField label={t('inventory:columnReserved')}>
                  <span className="tabular-nums">
                    {formatStock(summary.reservedQuantity, summary.unitCode)}
                  </span>
                </DetailField>
                <DetailField label={t('inventory:columnAvailable')}>
                  <span className="tabular-nums">
                    {formatStock(summary.availableQuantity, summary.unitCode)}
                  </span>
                </DetailField>
                {summary.threshold && (
                  <DetailField label={t('inventory:columnThreshold')}>
                    <span className="tabular-nums">
                      {thresholdRange(summary.threshold.min, summary.threshold.max) ??
                        t('inventory:thresholdNotSet')}
                    </span>
                  </DetailField>
                )}
              </DetailGroup>

              <section className="space-y-3">
                <h3 className="text-sm font-medium">{t('inventory:historySection')}</h3>
                {historyFailed && !history.data ? (
                  <LoadError error={history.error} onRetry={() => void history.refetch()} />
                ) : history.isPending ? (
                  <Skeleton aria-busy="true" className="h-24" />
                ) : rows.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('inventory:historyEmpty')}</p>
                ) : (
                  <ol className="divide-y">
                    {rows.map((h) => {
                      const code = importFormCode(h.note)
                      return (
                        <li key={h.slug} className="space-y-0.5 py-3 text-sm">
                          <p className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-muted-foreground tabular-nums">
                              {formatDateTime(h.createdAt)}
                            </span>
                            <span className="font-medium">
                              {isKnownAction(h.action)
                                ? t(`inventory:action.${h.action}`)
                                : h.action}
                            </span>
                          </p>
                          {h.quantityDelta !== 0 && (
                            <p className="tabular-nums">
                              <span
                                className={
                                  h.quantityDelta > 0 ? 'text-success' : 'text-destructive'
                                }
                              >
                                {signed(h.quantityDelta)}
                              </span>{' '}
                              <span>
                                {formatStock(h.quantityBefore, summary.unitCode)} →{' '}
                                {formatStock(h.quantityAfter, summary.unitCode)}
                              </span>
                            </p>
                          )}
                          {h.reservedDelta !== 0 && (
                            <p className="tabular-nums">
                              {t('inventory:reservedChange', {
                                delta: signed(h.reservedDelta),
                                before: formatQuantity(h.reservedBefore),
                                after: formatQuantity(h.reservedAfter),
                              })}
                            </p>
                          )}
                          {h.note !== null && h.note !== '' && (
                            <p className="break-words">
                              {code !== null ? t('inventory:importFormNote', { code }) : h.note}
                            </p>
                          )}
                          <p className="text-muted-foreground text-xs">
                            {t('inventory:changedBy', {
                              name: h.changedByName || t('common:unnamedUser'),
                            })}
                          </p>
                        </li>
                      )
                    })}
                  </ol>
                )}
                {history.isFetchNextPageError && (
                  <p role="alert" className="text-destructive text-sm">
                    {resolveApiErrorMessage(history.error)}
                  </p>
                )}
                {history.hasNextPage && (
                  <Button
                    variant="outline"
                    onClick={() => void history.fetchNextPage()}
                    disabled={history.isFetchingNextPage}
                  >
                    {t('inventory:loadMore')}
                  </Button>
                )}
              </section>
            </>
          )}
        </div>

        <SheetFooter className="flex-row flex-wrap gap-2 border-t [&>*]:flex-auto">
          {showRemove && summary && (
            <div className="flex flex-col gap-1">
              <Button
                variant="destructive"
                disabled={blocked !== null}
                aria-describedby={blocked ? hintId : undefined}
                onClick={() =>
                  onRemove({
                    materialSlug: summary.materialSlug,
                    materialCode: summary.code,
                    materialName: summary.name,
                  })
                }
              >
                {t('inventory:removeMenu')}
              </Button>
              {blocked && (
                <p id={hintId} className="text-muted-foreground text-xs">
                  {t(
                    blocked === 'stock'
                      ? 'inventory:removeBlockedStock'
                      : 'inventory:removeBlockedReserved',
                  )}
                </p>
              )}
            </div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:close')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** Lỗi tải lần đầu hiện tại chỗ (không toast) + nút thử lại. */
function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation('common')
  return (
    <div role="alert" className="space-y-2 text-sm">
      <p className="font-medium">{resolveApiErrorMessage(error)}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  )
}
