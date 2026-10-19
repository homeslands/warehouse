import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import type { InventoryItem } from '@/entities/inventory'
import { formatStock, thresholdRange } from '../model/format'
import { InventoryRowActions, StockCell, type InventoryRowHandlers } from './InventoryCells'

export function buildInventoryColumns(
  t: TFunction<readonly ['inventory', 'common']>,
  handlers: InventoryRowHandlers,
  /** Danh sách hiện tại (`pathname + search`) — trang vật tư dùng làm đích "Quay lại danh sách". */
  backTo: string,
): ColumnDef<InventoryItem>[] {
  return [
    {
      id: 'material',
      header: t('inventory:columnMaterial'),
      cell: ({ row }) => (
        <span className="block max-w-72 min-w-40 whitespace-normal break-words">
          <Link
            to={`/materials/${row.original.materialSlug}`}
            state={{ backTo }}
            className="font-medium hover:underline"
          >
            {row.original.materialCode}
          </Link>{' '}
          · {row.original.materialName}
        </span>
      ),
    },
    {
      id: 'type',
      header: t('inventory:columnType'),
      meta: { hideBelow: '@2xl' },
      cell: ({ row }) => row.original.typeName,
    },
    {
      id: 'quantity',
      header: t('inventory:columnQuantity'),
      cell: ({ row }) => <StockCell item={row.original} t={t} />,
    },
    {
      id: 'reserved',
      header: t('inventory:columnReserved'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) => formatStock(row.original.reservedQuantity, row.original.baseUnitCode),
    },
    {
      id: 'available',
      header: t('inventory:columnAvailable'),
      meta: { hideBelow: '@sm' },
      cell: ({ row }) => formatStock(row.original.availableQuantity, row.original.baseUnitCode),
    },
    {
      id: 'threshold',
      header: t('inventory:columnThreshold'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) =>
        thresholdRange(
          row.original.effectiveMinimumInventory,
          row.original.effectiveMaximumInventory,
        ) ?? <span className="text-muted-foreground">{t('inventory:thresholdNotSet')}</span>,
    },
    {
      id: 'actions',
      header: t('inventory:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => <InventoryRowActions item={row.original} t={t} {...handlers} />,
    },
  ]
}
