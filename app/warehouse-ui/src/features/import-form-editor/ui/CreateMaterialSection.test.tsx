import { screen, waitFor } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { MaterialType } from '@/entities/material-type'
import type { Supplier } from '@/entities/supplier'
import type { Unit } from '@/entities/unit'
import { CreateMaterialSection } from './CreateMaterialSection'

const BASE = 'http://localhost:8085/api/v1'

const stamp = { createdAt: '', updatedAt: '' }
const MATERIAL_TYPES: MaterialType[] = [{ slug: 'mt-1', code: 'MT', name: 'Vật liệu', ...stamp }]
const UNITS: Unit[] = [
  {
    slug: 'u-kg',
    code: 'KG',
    name: 'Kilogram',
    materialCount: { asBaseUnit: 0, asConversionUnit: 0, total: 0 },
    ...stamp,
  },
]
const SUPPLIERS: Supplier[] = [{ slug: 's-1', code: 'NCC-1', name: 'NCC Bột', ...stamp }]

function mockCatalog() {
  server.use(
    mswHttp.get(`${BASE}/material-types`, () => paginated(MATERIAL_TYPES)),
    mswHttp.get(`${BASE}/units`, () => paginated(UNITS)),
    mswHttp.get(`${BASE}/suppliers`, () => paginated(SUPPLIERS)),
  )
}

async function pick(user: UserEvent, field: RegExp, label: string) {
  await user.click(screen.getByRole('combobox', { name: field }))
  await user.click(await screen.findByText(label))
}

function setup(
  opts: { canCreate?: boolean; canAttachSupplier?: boolean; initialSearch?: string } = {},
) {
  mockCatalog()
  const onCreated = vi.fn()
  const r = renderWithProviders(
    <CreateMaterialSection
      warehouseSlug="w-a"
      initialSearch={opts.initialSearch ?? 'xi măng'}
      canCreate={opts.canCreate ?? true}
      canAttachSupplier={opts.canAttachSupplier ?? true}
      onCreated={onCreated}
      onBusyChange={vi.fn()}
      onWarehouseInactive={vi.fn()}
    />,
    { auth: 'admin' },
  )
  return { ...r, onCreated }
}

async function fill(user: UserEvent) {
  await user.type(screen.getByRole('textbox', { name: /^Mã vật tư/ }), 'VT-09')
  await pick(user, /^Loại vật tư/, 'MT · Vật liệu')
  await pick(user, /^Đơn vị gốc/, 'KG · Kilogram')
}

describe('CreateMaterialSection', () => {
  it('điền sẵn tên từ chữ đã gõ; tạo → POST { material, quantity: 0 } → onCreated(…, null)', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/warehouses/w-a/materials`, async ({ request }) => {
        body = await request.json()
        return ok({ materialSlug: 'm-new', materialName: 'xi măng' })
      }),
    )
    const { user, onCreated } = setup()
    expect(screen.getByRole('textbox', { name: /^Tên vật tư/ })).toHaveValue('xi măng')
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Tạo và gắn vào kho' }))
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ slug: 'm-new', name: 'xi măng' }, null),
    )
    expect(body).toEqual({
      material: { code: 'VT-09', name: 'xi măng', typeSlug: 'mt-1', baseUnitSlug: 'u-kg' },
      quantity: 0,
    })
  })

  it('có chọn NCC → gắn NCC sau khi tạo; NCC lỗi → onCreated(…, false)', async () => {
    let attachBody: unknown
    server.use(
      mswHttp.post(`${BASE}/warehouses/w-a/materials`, () =>
        ok({ materialSlug: 'm-new', materialName: 'xi măng' }),
      ),
      mswHttp.put(`${BASE}/suppliers/s-1/materials`, async ({ request }) => {
        attachBody = await request.json()
        return apiError(500, undefined, 'boom')
      }),
    )
    const { user, onCreated } = setup()
    await fill(user)
    await pick(user, /^Nhà cung cấp/, 'NCC-1 · NCC Bột')
    await user.click(screen.getByRole('button', { name: 'Tạo và gắn vào kho' }))
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ slug: 'm-new', name: 'xi măng' }, false),
    )
    expect(attachBody).toEqual({ materialSlugs: ['m-new'] })
  })

  it('100705 (mã trùng) → lỗi tại ô Mã', async () => {
    server.use(mswHttp.post(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100705, 'dup')))
    const { user, onCreated } = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Tạo và gắn vào kho' }))
    expect(await screen.findByText('Mã vật tư đã tồn tại')).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('thiếu quyền tạo → nút khoá kèm lý do; không quyền NCC → không có ô NCC', () => {
    setup({ canCreate: false, canAttachSupplier: false })
    const btn = screen.getByRole('button', { name: 'Tạo và gắn vào kho' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAccessibleDescription(
      'Cần quyền tạo / sửa vật tư, sửa kho và xem đơn vị — liên hệ quản trị.',
    )
    expect(screen.queryByRole('combobox', { name: /^Nhà cung cấp/ })).not.toBeInTheDocument()
  })

  it('chữ giống mã → điền ô Mã', () => {
    setup({ initialSearch: 'vt-77' })
    expect(screen.getByRole('textbox', { name: /^Mã vật tư/ })).toHaveValue('VT-77')
  })
})
