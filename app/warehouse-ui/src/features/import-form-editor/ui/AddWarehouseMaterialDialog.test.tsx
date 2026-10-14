import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Material } from '@/entities/material'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { AddWarehouseMaterialDialog } from './AddWarehouseMaterialDialog'

const BASE = 'http://localhost:8085/api/v1'
const cement: Material = {
  slug: 'm-cement',
  createdAt: '',
  updatedAt: '',
  code: 'VT-09',
  name: 'Xi măng PCB40',
  minimumInventory: 0,
  maximumInventory: 0,
  type: { slug: 'mt-1', code: 'MT', name: 'Vật liệu' },
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  hasSupplier: false,
  supplier: null,
}
const ALL = { search: true, assign: true, create: true, attachSupplier: true }

function Harness({
  onAdded,
  initialSearch = 'xi măng',
}: {
  onAdded: (s: string) => void
  initialSearch?: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        MỞ
      </button>
      <AddWarehouseMaterialDialog
        open={open}
        onOpenChange={setOpen}
        warehouseSlug="w-a"
        warehouseName="Kho A"
        initialSearch={initialSearch}
        availableSlugs={[]}
        abilities={ALL}
        onAdded={onAdded}
      />
    </>
  )
}

describe('AddWarehouseMaterialDialog', () => {
  it('ô tìm điền sẵn; gắn → chờ available-materials tải lại → onAdded + đóng', async () => {
    const order: string[] = []
    server.use(
      mswHttp.get(`${BASE}/materials`, () => paginated([cement])),
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => ok({ materialSlug: 'm-cement' })),
    )
    const onAdded = vi.fn(() => order.push('added'))
    const { user, queryClient } = renderWithProviders(<Harness onAdded={onAdded} />, {
      auth: 'admin',
    })
    const inv = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async (filters) => {
      if (JSON.stringify(filters?.queryKey).includes('available')) {
        await new Promise((r) => setTimeout(r, 30))
        order.push('available-refreshed')
      }
    })
    expect(screen.getByRole('textbox', { name: /Tìm vật tư trong danh mục/ })).toHaveValue(
      'xi măng',
    )
    await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('m-cement'))
    expect(order).toEqual(['available-refreshed', 'added'])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    inv.mockRestore()
  })

  it('đóng rồi mở lại → ô tìm lấy lại chữ ban đầu, form tạo đóng', async () => {
    server.use(mswHttp.get(`${BASE}/materials`, () => paginated([])))
    const { user } = renderWithProviders(<Harness onAdded={vi.fn()} />, { auth: 'admin' })
    const input = screen.getByRole('textbox', { name: /Tìm vật tư trong danh mục/ })
    await user.clear(input)
    await user.type(input, 'khác')
    await user.click(screen.getByRole('button', { name: /Tạo vật tư mới/ }))
    // Nút × cũng mang nhãn "Đóng" — nút chân hộp là nút cuối.
    await user.click(
      within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Đóng' }).at(-1)!,
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'MỞ' }))
    expect(screen.getByRole('textbox', { name: /Tìm vật tư trong danh mục/ })).toHaveValue(
      'xi măng',
    )
    expect(screen.queryByRole('group', { name: 'Tạo vật tư mới' })).not.toBeInTheDocument()
  })
})
