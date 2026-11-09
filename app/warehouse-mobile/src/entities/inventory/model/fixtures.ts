import type { InventoryItem, InventoryUnit } from './types'

export function unit(over: Partial<InventoryUnit> = {}): InventoryUnit {
  return {
    unitSlug: 'u-bag',
    unitCode: 'BAG',
    unitName: 'Bao',
    conversionRate: 1,
    isBaseUnit: true,
    ...over,
  }
}

export function item(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    slug: 'inv-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    quantity: 42,
    reservedQuantity: 0,
    availableQuantity: 42,
    minimumInventory: null,
    maximumInventory: null,
    effectiveMinimumInventory: 10,
    effectiveMaximumInventory: 100,
    isBelowMinimum: false,
    isAboveMaximum: false,
    warehouseSlug: 'wh-1',
    materialSlug: 'mat-1',
    materialCode: 'VT-XM',
    materialName: 'Xi măng Hà Tiên PCB40',
    typeSlug: 'type-1',
    typeName: 'Xi măng',
    baseUnit: { slug: 'u-bag', code: 'BAG', name: 'Bao' },
    units: [],
    ...over,
  }
}
