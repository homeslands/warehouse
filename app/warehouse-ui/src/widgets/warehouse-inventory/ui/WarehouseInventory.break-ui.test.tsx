/**
 * `break-ui`: bảng tồn kho với số lớn + mã đơn vị dài (`CUON-2T-TC`), ngưỡng "min – max CODE", vật tư tên rất dài.
 * Chạy thường chỉ kiểm bất biến; `BREAK_UI_OUT=<thư mục>` ghi HTML từng trạng thái để chụp bằng Chrome headless.
 */
import { screen } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { InventoryItem } from '@/entities/inventory'
import { WarehouseInventory } from './WarehouseInventory'

const BASE = 'http://localhost:8085/api/v1'
const OUT = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .BREAK_UI_OUT
const FS_MODULE = 'node:fs'

async function dump(name: string) {
  if (!OUT) return
  const fs = (await import(/* @vite-ignore */ FS_MODULE)) as {
    mkdirSync: (p: string, o: { recursive: boolean }) => void
    writeFileSync: (p: string, data: string) => void
  }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(`${OUT}/${name}.html`, document.body.innerHTML)
}

const base: InventoryItem = {
  slug: 'inv-1',
  createdAt: '',
  updatedAt: '',
  quantity: 30,
  reservedQuantity: 0,
  availableQuantity: 30,
  minimumInventory: 20,
  maximumInventory: 70,
  effectiveMinimumInventory: 20,
  effectiveMaximumInventory: 70,
  isBelowMinimum: false,
  isAboveMaximum: false,
  warehouseSlug: 'w-a',
  materialSlug: 'm-1',
  materialCode: 'NL04',
  materialName: 'Matcha',
  typeSlug: 'mt-1',
  typeName: 'Nguyên liệu',
  baseUnit: { slug: 'u-1', code: 'KG', name: 'Kilogram' },
  units: [],
}

const LONG_CODE = 'CUON-2T-TC'
const ROWS: InventoryItem[] = [
  base,
  {
    ...base,
    slug: 'inv-2',
    materialSlug: 'm-2',
    materialCode: 'VT-VERY-LONG-CODE-000000000000001',
    materialName:
      'Màng bọc thực phẩm cuộn lớn hai lớp tái chế chống dính loại đặc biệt dày dặn không giới hạn',
    quantity: 123_456_789.125,
    reservedQuantity: 98_765_432.5,
    availableQuantity: 24_691_356.625,
    effectiveMinimumInventory: 1_000_000_000,
    effectiveMaximumInventory: 99_999_999_999,
    isAboveMaximum: true,
    baseUnit: { slug: 'u-2', code: LONG_CODE, name: 'Cuộn hai lớp thành phẩm' },
  },
  {
    ...base,
    slug: 'inv-3',
    materialSlug: 'm-3',
    materialCode: 'THRESH',
    materialName: 'Chỉ có ngưỡng tối thiểu',
    quantity: 3,
    availableQuantity: 3,
    isBelowMinimum: true,
    // BE: tồn > 0 mà max hiệu lực = 0 thì vượt max.
    isAboveMaximum: true,
    effectiveMinimumInventory: 5,
    effectiveMaximumInventory: 0,
    baseUnit: { slug: 'u-2', code: LONG_CODE, name: 'Cuộn' },
  },
  {
    ...base,
    slug: 'inv-4',
    materialSlug: 'm-4',
    materialCode: 'NOUNIT',
    materialName: 'Chưa khai đơn vị',
    baseUnit: null,
  },
]

describe('WarehouseInventory — break-ui', () => {
  it('số lớn + mã đơn vị dài', async () => {
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/materials`, () => paginated(ROWS)),
      mswHttp.get(`${BASE}/material-types`, () => paginated([])),
    )
    renderWithProviders(
      <WarehouseInventory
        warehouse={{ slug: 'w-a', name: 'Kho A', isActive: true }}
        addAbilities={{ search: true, assign: true, create: true, attachSupplier: true }}
        canRemove
        searchEnabled={false}
      />,
      { auth: 'admin', route: '/warehouses/w-a?tab=materials' },
    )
    await screen.findByText(/Màng bọc thực phẩm/)
    expect(screen.getAllByText(new RegExp(LONG_CODE)).length).toBeGreaterThan(0)
    await dump('inventory')
  })
})
