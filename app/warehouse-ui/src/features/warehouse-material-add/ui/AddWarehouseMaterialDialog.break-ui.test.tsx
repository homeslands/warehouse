/**
 * `break-ui`: hộp thêm vật tư vào kho với dữ liệu worst-case (tên vật tư / loại / NCC dài 70–100 ký tự, 3+ NCC, mã 24
 * ký tự, ngưỡng lớn). Đặt `BREAK_UI_OUT=<thư mục>` để ghi HTML từng trạng thái ra trang so sánh — chỉ dùng khi dev.
 */
import { screen } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, it, vi } from 'vitest'
import type { Material } from '@/entities/material'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { AddWarehouseMaterialDialog } from './AddWarehouseMaterialDialog'

const BASE = 'http://localhost:8085/api/v1'
const stamp = { createdAt: '', updatedAt: '' }

/** Chỉ chạy dưới Node (Vitest) khi có `BREAK_UI_OUT`; tsconfig của app không có type Node nên nạp `fs` động. */
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

const ncc = (slug: string, name: string) => ({ slug, code: slug.toUpperCase(), name })
const material = (over: Partial<Material>): Material => ({
  slug: 'm',
  ...stamp,
  code: 'VT',
  name: 'Vật tư',
  minimumInventory: 0,
  maximumInventory: 0,
  type: { slug: 'mt-1', code: 'MT', name: 'Vật liệu' },
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  hasSupplier: false,
  suppliers: [],
  warehouses: [],
  units: [],
  ...over,
})

const WORST: Material[] = [
  material({
    slug: 'm-steel',
    code: 'MAT-THEP-CUON-CB300V-D10',
    name: 'Thép cuộn cán nóng CB300-V phi 10 mạ kẽm nhúng nóng tiêu chuẩn TCVN 1651-2:2018 (cuộn 2 tấn)',
    minimumInventory: 1_500_000.5,
    maximumInventory: 999_999_999_999.99,
    type: { slug: 'mt-2', code: 'KL', name: 'Kim loại đen và hợp kim thép xây dựng công nghiệp' },
    units: [
      {
        unitSlug: 'u-kg',
        unitCode: 'KG',
        unitName: 'Kilogram',
        conversionRate: 1,
        isBaseUnit: true,
      },
      {
        unitSlug: 'u-coil',
        unitCode: 'CUON-2T-TC',
        unitName: 'Cuộn 2 tấn',
        conversionRate: 2000,
        isBaseUnit: false,
      },
      {
        unitSlug: 'u-t',
        unitCode: 'TAN',
        unitName: 'Tấn',
        conversionRate: 1000,
        isBaseUnit: false,
      },
    ],
    hasSupplier: true,
    suppliers: [
      ncc('s-1', 'Công ty TNHH Thương mại Dịch vụ Xuất nhập khẩu Vật tư Ngọc Minh Phát Đạt'),
      ncc('s-2', 'Công ty Cổ phần Thép Hòa Phát Hải Dương'),
      ncc('s-3', 'An'),
    ],
  }),
  material({ slug: 'm-da', code: 'DA', name: 'Đá' }),
  material({
    slug: 'm-nobase',
    code: 'VT-CU-2019',
    name: 'Vật tư cũ chưa có đơn vị gốc',
    baseUnit: null,
  }),
]

function renderDialog(found: Material[]) {
  server.use(
    mswHttp.get(`${BASE}/materials`, () => paginated(found, { size: 50, total: 1284 })),
    mswHttp.get(`${BASE}/material-types`, () => paginated([])),
    mswHttp.get(`${BASE}/units`, () => paginated([])),
    mswHttp.get(`${BASE}/suppliers`, () => paginated([])),
  )
  return renderWithProviders(
    <AddWarehouseMaterialDialog
      open
      onOpenChange={vi.fn()}
      warehouseSlug="w-a"
      warehouseName="Kho A"
      initialSearch=""
      description="Vật tư thêm ở đây được chọn ngay vào dòng phiếu nhập."
      abilities={{ search: true, assign: true, create: true, attachSupplier: true }}
      onAdded={vi.fn()}
    />,
    { auth: 'admin' },
  )
}

describe('AddWarehouseMaterialDialog — break-ui', () => {
  it('worst case: danh mục + bước nhập ngưỡng + tab tạo mới', async () => {
    const { user } = renderDialog(WORST)
    await user.click((await screen.findAllByRole('button', { name: 'Gắn vào kho' }))[0])
    await user.type(screen.getByRole('textbox', { name: 'Tồn tối thiểu' }), '2000000000000')
    await user.click(screen.getByRole('button', { name: 'Xác nhận gắn' }))
    await dump('add-catalog-worst')
    await user.click(screen.getByRole('tab', { name: 'Tạo vật tư mới' }))
    await user.type(
      screen.getByRole('textbox', { name: /^Tên vật tư/ }),
      'Ống nhựa uPVC Bình Minh hệ inch class 3 phi 114 dày 4,9mm dài 4m',
    )
    await user.type(screen.getByRole('textbox', { name: 'Tồn tối thiểu' }), '5')
    await user.click(screen.getByRole('button', { name: 'Tạo và gắn vào kho' }))
    await screen.findByText('Tồn tối đa phải lớn hơn hoặc bằng tồn tối thiểu')
    await dump('add-create-worst')
  })
})
