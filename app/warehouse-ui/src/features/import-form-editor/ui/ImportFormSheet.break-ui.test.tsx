/**
 * `break-ui`: dựng sheet phiếu nhập với dữ liệu demo và worst-case (`worst-case.fixtures.ts`). Chạy thường thì chỉ kiểm
 * vài bất biến; đặt `BREAK_UI_OUT=<thư mục>` thì ghi HTML từng trạng thái ra đó để dựng trang so sánh có toggle
 * (CSS build thật + Chrome headless) — chỉ dùng khi dev, không phải một phần của app.
 */
import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial, ImportForm } from '@/entities/import-form'
import type { Supplier } from '@/entities/supplier'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormReviewDialog } from './ImportFormReviewDialog'
import { ImportFormSheet } from './ImportFormSheet'
import { toFormValues } from '../model/import-form-editor.schema'
import {
  DEMO_DRAFT,
  DEMO_MATERIALS,
  DEMO_SUPPLIERS,
  WORST_DRAFT,
  WORST_MATERIALS,
  WORST_SUPPLIERS,
  WORST_WAREHOUSE_NAME,
} from './worst-case.fixtures'

const BASE = 'http://localhost:8085/api/v1'
const URL_W = `${BASE}/warehouses/w-a/import-forms`

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

function renderSheet(
  form: ImportForm,
  materials: AvailableMaterial[],
  suppliers: Supplier[],
  warehouseName: string,
) {
  server.use(
    mswHttp.get(`${BASE}/suppliers`, () => paginated(suppliers)),
    mswHttp.get(`${URL_W}/available-materials`, () => paginated(materials)),
    mswHttp.get(`${URL_W}/${form.slug}`, () => ok(form)),
  )
  return renderWithProviders(
    <ImportFormSheet
      open
      onOpenChange={vi.fn()}
      warehouseSlug="w-a"
      warehouseName={warehouseName}
      formSlug={form.slug}
      formCode={form.code}
      canPickSupplier
      canConfirm
    />,
    { auth: 'admin' },
  )
}

describe('ImportFormSheet — break-ui', () => {
  it('demo', async () => {
    renderSheet(DEMO_DRAFT, DEMO_MATERIALS, DEMO_SUPPLIERS, 'Kho A')
    expect(await screen.findByRole('combobox', { name: /Bên bán/ })).toHaveTextContent('NCC Bột')
    await screen.findByText(/Tồn:/)
    await dump('demo')
  })

  it('worst case: ô bên bán tên dài cắt "…" trong cột, không tràn sang ô Số hoá đơn', async () => {
    const { user } = renderSheet(
      WORST_DRAFT,
      WORST_MATERIALS,
      WORST_SUPPLIERS,
      WORST_WAREHOUSE_NAME,
    )
    const seller = await screen.findByRole('combobox', { name: /Bên bán/ })
    await waitFor(() => expect(seller).toHaveTextContent('Ngọc Minh Phát Đạt'))
    // Lớp vỏ của Combobox phải co được trong ô lưới (min-width: 0), nếu không nhãn dài đẩy nó tràn ra ngoài.
    expect(seller.parentElement?.className).toContain('min-w-0')
    await screen.findAllByText(/Tồn:/)
    await dump('worst')

    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    await screen.findByText(/Hàng thường mua của/)
    await dump('worst-material-open')
  })

  it('worst case: hộp Kiểm tra', async () => {
    const values = toFormValues(WORST_DRAFT, { canPickSupplier: true })
    const byName = new Map(WORST_SUPPLIERS.map((s) => [s.slug, `${s.code} · ${s.name}`]))
    renderWithProviders(
      <ImportFormReviewDialog
        open
        onOpenChange={vi.fn()}
        values={{ ...values, items: [...values.items, { ...values.items[1], unitPrice: 0 }] }}
        materials={new Map(WORST_MATERIALS.map((m) => [m.slug, m]))}
        supplierName={(slug) => byName.get(slug) ?? slug}
        canConfirm
        isPending={false}
        onSaveDraft={vi.fn()}
        onSaveAndConfirm={vi.fn()}
        onJumpToLine={vi.fn()}
      />,
    )
    await screen.findByRole('alertdialog')
    await dump('worst-review')
  })
})
