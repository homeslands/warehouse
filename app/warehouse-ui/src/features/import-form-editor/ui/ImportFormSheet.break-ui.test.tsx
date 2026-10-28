/**
 * `break-ui`: dựng sheet phiếu nhập với dữ liệu demo và worst-case (`worst-case.fixtures.ts`). Chạy thường thì chỉ kiểm
 * vài bất biến; đặt `BREAK_UI_OUT=<thư mục>` thì ghi HTML từng trạng thái ra đó để dựng trang so sánh có toggle
 * (CSS build thật + Chrome headless) — chỉ dùng khi dev, không phải một phần của app.
 */
import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial, ImportForm } from '@/entities/import-form'
import type { Supplier } from '@/entities/supplier'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormMaterialPicker } from './ImportFormMaterialPicker'
import { ImportFormReviewStep } from './ImportFormReviewStep'
import { ImportFormSheet } from './ImportFormSheet'
import { toFormValues } from '../model/import-form-editor.schema'
import {
  DEMO_DRAFT,
  DEMO_MATERIALS,
  DEMO_SUPPLIERS,
  WORST_DRAFT,
  WORST_LONG_MATERIAL,
  WORST_MATERIALS,
  WORST_PICKER_MATERIALS,
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

/** `form` = sửa phiếu đó; `null` = tạo mới. */
function renderSheet(
  form: ImportForm | null,
  materials: AvailableMaterial[],
  suppliers: Supplier[],
  warehouseName: string,
) {
  server.use(
    mswHttp.get(`${BASE}/suppliers`, () => paginated(suppliers)),
    mswHttp.get(`${URL_W}/available-materials`, () => paginated(materials)),
    ...(form ? [mswHttp.get(`${URL_W}/${form.slug}`, () => ok(form))] : []),
  )
  return renderWithProviders(
    <ImportFormSheet
      open
      onOpenChange={vi.fn()}
      warehouseSlug="w-a"
      warehouseName={warehouseName}
      formSlug={form?.slug}
      formCode={form?.code}
      canPickSupplier
      canConfirm
    />,
    { auth: 'admin' },
  )
}

describe('ImportFormSheet — break-ui', () => {
  it('demo', async () => {
    const { user } = renderSheet(DEMO_DRAFT, DEMO_MATERIALS, DEMO_SUPPLIERS, 'Kho A')
    // Sửa mở ở bước ② (dòng vật tư).
    await screen.findByText(/Tồn:/)
    await dump('demo')
    await user.click(screen.getByRole('button', { name: /Thông tin phiếu$/ }))
    expect(await screen.findByRole('combobox', { name: /Bên bán/ })).toHaveTextContent('NCC Bột')
    await dump('demo-info')
  })

  it('worst case: ô bên bán tên dài cắt "…" trong cột, không tràn sang ô Số hoá đơn', async () => {
    const { user } = renderSheet(
      WORST_DRAFT,
      WORST_MATERIALS,
      WORST_SUPPLIERS,
      WORST_WAREHOUSE_NAME,
    )
    // Bước ② (sửa mở ở đây): dòng tóm tắt bước ① có tên bên bán dài.
    await screen.findAllByText(/Tồn:/)
    // Lưới 8 cột (thêm Hạn dùng) chỉ bật từ khung 56rem (`@4xl`) — ở 48rem tổng cột tối thiểu tràn khung, đẩy nút
    // ghi chú / xoá ra ngoài. Cột Hạn dùng đủ cho nút ngày + nút xoá ngày; thành tiền lớn xuống dòng trong cột.
    const row3 = screen.getByTestId('line-2')
    expect(row3.className).toContain('@4xl:grid-cols-')
    expect(row3.className).toContain('minmax(10.25rem,1fr)')
    expect(within(row3).getByRole('button', { name: /Hạn dùng dòng 3/ })).toHaveTextContent(
      '31/12/2099',
    )
    expect(screen.getByTestId('line-amount-0').className).toContain('[overflow-wrap:anywhere]')
    expect(screen.getByTestId('line-amount-2')).toHaveTextContent(/1\.140\.000\.000/)
    // Dòng meta bước ① (bên bán tên dài…) chỉ để xem — không có nút "sửa".
    expect(screen.getAllByText('Bên bán', { selector: 'dt' })[0]).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'sửa' })).not.toBeInTheDocument()
    await dump('worst-step-items')

    await user.click(screen.getByRole('button', { name: /Thông tin phiếu$/ }))
    const seller = await screen.findByRole('combobox', { name: /Bên bán/ })
    await waitFor(() => expect(seller).toHaveTextContent('Ngọc Minh Phát Đạt'))
    // Lớp vỏ của Combobox phải co được trong ô lưới (min-width: 0), nếu không nhãn dài đẩy nó tràn ra ngoài.
    expect(seller.parentElement?.className).toContain('min-w-0')
    await dump('worst-step-info')

    await user.click(screen.getByRole('button', { name: /Chi tiết vật tư/ }))
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    await screen.findByText(/Hàng thường mua của/)
    await dump('worst-material-open')
  })

  it('worst case: bước Kiểm tra', async () => {
    const values = toFormValues(WORST_DRAFT, { canPickSupplier: true })
    const byName = new Map(WORST_SUPPLIERS.map((s) => [s.slug, `${s.code} · ${s.name}`]))
    const units = new Map(
      WORST_DRAFT.items!.map((i) => [i.unitSlug, `${i.unitCode} · ${i.unitName}`]),
    )
    renderWithProviders(
      <ImportFormReviewStep
        values={{ ...values, items: [...values.items, { ...values.items[1], unitPrice: 0 }] }}
        materials={new Map(WORST_MATERIALS.map((m) => [m.slug, m]))}
        supplierName={(slug) => byName.get(slug) ?? slug}
        materialLabel={() => undefined}
        unitLabel={(_, unitSlug) => units.get(unitSlug)}
        canConfirm
        onJumpToLine={vi.fn()}
        onEditStep={vi.fn()}
      />,
    )
    await screen.findByRole('heading', { name: 'Kiểm tra phiếu nhập' })
    await dump('worst-review')
  })

  it('worst case: bước ③ trong sheet (chân sheet + bảng dòng)', async () => {
    const { user } = renderSheet(
      WORST_DRAFT,
      WORST_MATERIALS,
      WORST_SUPPLIERS,
      WORST_WAREHOUSE_NAME,
    )
    await screen.findAllByText(/Tồn:/)
    await user.click(screen.getByRole('button', { name: /Kiểm tra & lưu$/ }))
    await screen.findByRole('heading', { name: 'Kiểm tra phiếu nhập' })
    await dump('worst-step-review')
  })

  it('worst case: tạo mới tới bước ③ (chân sheet Quay lại · Lưu nháp · Lưu & xác nhận + Tổng)', async () => {
    const { user } = renderSheet(null, WORST_MATERIALS, WORST_SUPPLIERS, WORST_WAREHOUSE_NAME)
    await user.click(await screen.findByRole('combobox', { name: /Bên bán/ }))
    await user.click(await screen.findByText(new RegExp(`^${WORST_SUPPLIERS[0].code} · `)))
    await user.type(screen.getByRole('textbox', { name: /^Số hoá đơn/ }), 'HD-2026-000000123456')
    await dump('worst-create-info')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    const [first] = await screen.findAllByRole('option', {
      name: new RegExp(`^${WORST_MATERIALS[0].code} · `),
    })
    await user.click(first)
    await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '123456789')
    await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '987654321')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await screen.findByRole('heading', { name: 'Kiểm tra phiếu nhập' })
    await dump('worst-create-review')
  })

  it('worst case: ô xổ vật tư mở ở dòng CUỐI (sát đáy sheet) — tên 100 ký tự xuống dòng, không cắt', async () => {
    const { user } = renderSheet(
      WORST_DRAFT,
      WORST_PICKER_MATERIALS,
      WORST_SUPPLIERS,
      WORST_WAREHOUSE_NAME,
    )
    await screen.findAllByText(/Tồn:/)
    // 3 dòng có sẵn + 3 dòng trống → ô của dòng 6 nằm sát chân sheet.
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Thêm dòng' }))
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 6' }))
    const option = await screen.findByRole('option', {
      name: new RegExp(`^${WORST_LONG_MATERIAL.code} · `),
    })
    expect(option).toHaveTextContent(WORST_LONG_MATERIAL.name)
    expect(screen.getByRole('listbox').className).toContain('max-h-[60vh]')
    // Cột theo bề rộng THẬT của danh sách (container query, không theo cửa sổ) và cố định → các mục thẳng cột; hẹp thì
    // xếp dọc thay vì bóp tên còn vài chữ một dòng (Chrome 720px: tên 100 ký tự thành 8 dòng).
    const cell = within(option).getByText(WORST_LONG_MATERIAL.code).closest('[class*="@container"]')
    expect(cell?.firstElementChild?.className).toContain(
      '@2xl:grid-cols-[minmax(0,1fr)_12rem_8rem]',
    )
    await dump('worst-material-open-last')
  })

  it('worst case: hộp "Chọn vật tư" mở từ sheet — vật tư đã có, 3 NCC, tên 100 ký tự', async () => {
    const { user } = renderSheet(
      WORST_DRAFT,
      WORST_PICKER_MATERIALS,
      WORST_SUPPLIERS,
      WORST_WAREHOUSE_NAME,
    )
    await screen.findAllByText(/Tồn:/)
    await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
    const dialog = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    const steelRow = within(dialog).getByTestId('picker-row-m-steel')
    expect(steelRow).toHaveTextContent('đã có')
    expect(within(steelRow).getByRole('checkbox')).toBeDisabled()
    expect(within(dialog).getByTestId(`picker-row-${WORST_LONG_MATERIAL.slug}`)).toHaveTextContent(
      WORST_LONG_MATERIAL.name,
    )
    await dump('worst-picker')
  })

  it('worst case: hộp "Chọn vật tư" còn 1 chỗ — câu giới hạn, tick xong thì khoá các ô còn lại', async () => {
    const byName = new Map(WORST_SUPPLIERS.map((s) => [s.slug, s.name]))
    const { user } = renderWithProviders(
      <ImportFormMaterialPicker
        open
        onOpenChange={vi.fn()}
        warehouseSlug="w-a"
        materials={WORST_PICKER_MATERIALS}
        headerSupplierSlug="s-long"
        supplierName={(slug) => byName.get(slug) ?? slug}
        existingSlugs={new Set(['m-steel'])}
        capacity={1}
        onConfirm={vi.fn()}
      />,
    )
    await screen.findByText('Phiếu tối đa 200 dòng — còn chọn được 1')
    // Số tồn không bao giờ gãy giữa chữ số (Chrome 1440px: "98.765.432,123 / 456" trong cột 6,5rem).
    expect(screen.getByText('98.765.432,123456').className).toContain('whitespace-nowrap')
    // Bảng nhiều cột chỉ từ `lg` (hộp rộng 5xl); 720px trở xuống xếp dọc thay vì bóp cột tên còn ~15 ký tự.
    const row = screen.getByTestId(`picker-row-${WORST_LONG_MATERIAL.slug}`)
    expect(row.className).toContain('lg:grid-cols-[1rem_minmax(0,1fr)_11rem_8rem_12rem]')
    expect(row.className).not.toContain('sm:grid-cols-')
    expect(screen.getByRole('dialog').className).toContain('lg:max-w-5xl')
    await dump('worst-picker-limit')
    await user.click(
      screen.getByRole('checkbox', { name: new RegExp(`^${WORST_LONG_MATERIAL.code} · `) }),
    )
    await screen.findByText('Phiếu tối đa 200 dòng — còn chọn được 0')
    expect(screen.getByRole('checkbox', { name: /^DA · / })).toBeDisabled()
    await dump('worst-picker-limit-full')
  })
})
