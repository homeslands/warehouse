import type { TFunction } from 'i18next'
import { MoreHorizontalIcon } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemHint,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { removeBlockReason, type InventoryItem } from '@/entities/inventory'
import { formatStock } from '../model/format'

export type InventoryRowHandlers = {
  canRemove: boolean
  onViewHistory: (item: InventoryItem) => void
  onRemove: (item: InventoryItem) => void
}

export function StockCell({
  item,
  t,
}: {
  item: InventoryItem
  t: TFunction<readonly ['inventory', 'common']>
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 tabular-nums">
      {formatStock(item.quantity, item.baseUnit?.code)}
      {item.isBelowMinimum && <Badge variant="destructive">{t('inventory:badgeBelow')}</Badge>}
      {item.isAboveMaximum && <Badge variant="destructive">{t('inventory:badgeAbove')}</Badge>}
    </span>
  )
}

export function InventoryRowActions({
  item,
  t,
  canRemove,
  onViewHistory,
  onRemove,
}: InventoryRowHandlers & { item: InventoryItem; t: TFunction<readonly ['inventory', 'common']> }) {
  const blocked = removeBlockReason(item)
  const hintId = `remove-hint-${item.materialSlug}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('inventory:rowActions', { code: item.materialCode })}
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onViewHistory(item)}>
          {t('inventory:viewHistory')}
        </DropdownMenuItem>
        {canRemove && (
          <>
            <DropdownMenuItem
              variant="destructive"
              disabled={blocked !== null}
              aria-describedby={blocked ? hintId : undefined}
              onSelect={() => onRemove(item)}
            >
              {t('inventory:removeMenu')}
            </DropdownMenuItem>
            {blocked && (
              <DropdownMenuItemHint id={hintId}>
                {t(
                  blocked === 'stock'
                    ? 'inventory:removeBlockedStock'
                    : 'inventory:removeBlockedReserved',
                )}
              </DropdownMenuItemHint>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
