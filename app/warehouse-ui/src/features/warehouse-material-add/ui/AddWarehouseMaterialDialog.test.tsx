import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http as mswHttp } from 'msw'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import type { AddedMaterial } from '@/entities/inventory'
import { supplierKeys } from '@/entities/supplier'
import type { Material } from '@/entities/material'
import { apiError, ok, paginated } from '@/shared/test/api'
import { confirmStep } from '@/shared/test/confirm'
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
  suppliers: [],
  warehouses: [],
  units: [],
}
const CEMENT_ADDED: AddedMaterial = {
  slug: 'm-cement',
  label: 'VT-09 · Xi măng PCB40',
  baseUnit: { slug: 'u-kg', label: 'KG · Kilogram' },
}
const ALL = { search: true, assign: true, create: true, attachSupplier: true }

function Harness({
  onAdded,
  initialSearch = 'xi măng',
  abilities = ALL,
}: {
  onAdded: (a: AddedMaterial) => void
  initialSearch?: string
  abilities?: typeof ALL
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
        description="Mô tả thử"
        abilities={abilities}
        onAdded={onAdded}
      />
    </>
  )
}

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

/** Gắn vật tư = bấm "Gắn vào kho" (mở bước nhập ngưỡng của dòng) rồi "Xác nhận gắn" (để trống = theo ngưỡng vật tư). */
async function assignFirst(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
  await user.click(await screen.findByRole('button', { name: 'Xác nhận gắn' }))
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
    await assignFirst(user)
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(CEMENT_ADDED))
    expect(toast.success).toHaveBeenCalledWith('Đã gắn Xi măng PCB40 vào kho')
    expect(order).toEqual(['available-refreshed', 'added'])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    inv.mockRestore()
  })

  it('100802 (đã có ở kho) → toast thông tin, không toast thành công, vẫn onAdded', async () => {
    vi.mocked(toast.success).mockClear()
    server.use(
      mswHttp.get(`${BASE}/materials`, () => paginated([cement])),
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100802, 'exists')),
    )
    const onAdded = vi.fn()
    const { user } = renderWithProviders(<Harness onAdded={onAdded} />, { auth: 'admin' })
    await assignFirst(user)
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(CEMENT_ADDED))
    expect(toast.info).toHaveBeenCalledWith('Xi măng PCB40 đã có trong kho')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('hiện câu mô tả do bên gọi truyền', () => {
    server.use(mswHttp.get(`${BASE}/materials`, () => paginated([])))
    renderWithProviders(<Harness onAdded={vi.fn()} />, { auth: 'admin' })
    expect(screen.getByText('Mô tả thử')).toBeInTheDocument()
  })

  it('gắn xong chờ cả vật tư khả dụng của phiếu nhập lẫn danh sách tồn của kho tải lại rồi mới onAdded', async () => {
    server.use(
      mswHttp.get(`${BASE}/materials`, () => paginated([cement])),
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => ok({ materialSlug: 'm-cement' })),
    )
    const awaited: string[] = []
    const onAdded = vi.fn()
    const { user, queryClient } = renderWithProviders(<Harness onAdded={onAdded} />, {
      auth: 'admin',
    })
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async (filters) => {
      const key = JSON.stringify(filters?.queryKey)
      await new Promise((r) => setTimeout(r, 10))
      awaited.push(key)
    })
    await assignFirst(user)
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(awaited).toContain(JSON.stringify(['inventory', 'w-a']))
    expect(awaited.some((k) => k.includes('available'))).toBe(true)
  })

  it('đóng rồi mở lại → ô tìm lấy lại chữ ban đầu, form tạo đóng', async () => {
    server.use(mswHttp.get(`${BASE}/materials`, () => paginated([])))
    const { user } = renderWithProviders(<Harness onAdded={vi.fn()} />, { auth: 'admin' })
    const input = screen.getByRole('textbox', { name: /Tìm vật tư trong danh mục/ })
    await user.clear(input)
    await user.type(input, 'khác')
    await user.click(screen.getByRole('tab', { name: 'Tạo vật tư mới' }))
    // Nút × cũng mang nhãn "Đóng" — nút chân hộp là nút cuối.
    await user.click(
      within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Đóng' }).at(-1)!,
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'MỞ' }))
    expect(screen.getByRole('textbox', { name: /Tìm vật tư trong danh mục/ })).toHaveValue(
      'xi măng',
    )
    expect(screen.queryByRole('form', { name: 'Tạo vật tư mới' })).not.toBeInTheDocument()
  })

  it('đang gắn: Esc và nút Đóng không đóng được; xong thì onAdded + đóng', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      mswHttp.get(`${BASE}/materials`, () => paginated([cement])),
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, async () => {
        await gate
        return ok({ materialSlug: 'm-cement' })
      }),
    )
    const onAdded = vi.fn()
    const { user } = renderWithProviders(<Harness onAdded={onAdded} />, { auth: 'admin' })
    await assignFirst(user)
    await screen.findByRole('button', { name: 'Đang gắn…' })
    await user.keyboard('{Escape}')
    const close = within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Đóng' })
    expect(close).toHaveLength(1)
    expect(close[0]).toBeDisabled()
    await user.click(close[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    release()
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(CEMENT_ADDED))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('invalidate available-materials đang chờ: không gắn được dòng thứ hai, onAdded đúng một lần', async () => {
    let puts = 0
    const other: Material = { ...cement, slug: 'm-other', code: 'VT-10', name: 'Xi măng đen' }
    server.use(
      mswHttp.get(`${BASE}/materials`, () => paginated([cement, other])),
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => {
        puts++
        return ok({ materialSlug: 'm-cement' })
      }),
    )
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const onAdded = vi.fn()
    const { user, queryClient } = renderWithProviders(<Harness onAdded={onAdded} />, {
      auth: 'admin',
    })
    const inv = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async (filters) => {
      if (JSON.stringify(filters?.queryKey).includes('available')) await gate
    })
    const buttons = await screen.findAllByRole('button', { name: 'Gắn vào kho' })
    await user.click(buttons[0])
    await user.click(screen.getByRole('button', { name: 'Xác nhận gắn' }))
    await waitFor(() => expect(puts).toBe(1))
    await new Promise((r) => setTimeout(r, 50))
    for (const b of screen.getAllByRole('button', { name: 'Gắn vào kho' })) {
      expect(b).toBeDisabled()
      await user.click(b)
    }
    expect(puts).toBe(1)
    release()
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1))
    inv.mockRestore()
  })

  it('tạo mới + NCC → toast thành công (không cảnh báo), invalidate NCC, onAdded(AddedMaterial)', async () => {
    const stamp = { createdAt: '', updatedAt: '' }
    server.use(
      mswHttp.get(`${BASE}/materials`, () => paginated([])),
      mswHttp.get(`${BASE}/material-types`, () =>
        paginated([{ slug: 'mt-1', code: 'MT', name: 'Vật liệu', ...stamp }]),
      ),
      mswHttp.get(`${BASE}/units`, () =>
        paginated([
          {
            slug: 'u-kg',
            code: 'KG',
            name: 'Kilogram',
            materialCount: { asBaseUnit: 0, asConversionUnit: 0, total: 0 },
            ...stamp,
          },
        ]),
      ),
      mswHttp.get(`${BASE}/suppliers`, () =>
        paginated([{ slug: 's-1', code: 'NCC-1', name: 'NCC Bột', ...stamp }]),
      ),
      mswHttp.post(`${BASE}/warehouses/w-a/materials`, () =>
        ok({ materialSlug: 'm-new', materialName: 'Xi măng mới' }),
      ),
    )
    const onAdded = vi.fn()
    const parentSubmit = vi.fn((e: FormEvent) => e.preventDefault())
    // Như trong app: hộp mở từ trong <form> của phiếu nhập — submit tạo vật tư không được nổi lên phiếu.
    const { user, queryClient } = renderWithProviders(
      <form onSubmit={parentSubmit}>
        <Harness onAdded={onAdded} initialSearch="Xi măng mới" />
      </form>,
      { auth: 'admin' },
    )
    const inv = vi.spyOn(queryClient, 'invalidateQueries')
    await user.click(screen.getByRole('tab', { name: 'Tạo vật tư mới' }))
    await user.type(await screen.findByRole('textbox', { name: /^Mã vật tư/ }), ' vt-99 ')
    const pick = async (field: RegExp, label: string) => {
      await user.click(screen.getByRole('combobox', { name: field }))
      await user.click(await screen.findByText(label))
    }
    await pick(/^Loại vật tư/, 'MT · Vật liệu')
    await pick(/^Đơn vị gốc/, 'KG · Kilogram')
    await pick(/^Nhà cung cấp/, 'NCC-1 · NCC Bột')
    await user.click(screen.getByRole('button', { name: 'Tạo và gắn vào kho' }))
    await confirmStep(user, 'Xác nhận tạo vật tư')
    await waitFor(() =>
      expect(onAdded).toHaveBeenCalledWith({
        slug: 'm-new',
        label: 'VT-99 · Xi măng mới',
        baseUnit: { slug: 'u-kg', label: 'KG · Kilogram' },
      }),
    )
    expect(parentSubmit).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
    expect(
      inv.mock.calls.some(
        ([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(supplierKeys.all),
      ),
    ).toBe(true)
  })

  it('nút "Tạo và gắn vào kho" nằm ở chân hộp cạnh "Đóng", chỉ ở tab tạo', async () => {
    server.use(mswHttp.get(`${BASE}/materials`, () => paginated([])))
    const { user } = renderWithProviders(<Harness onAdded={vi.fn()} />, { auth: 'admin' })
    const footer = () =>
      screen.getByRole('dialog').querySelector<HTMLElement>('[data-slot="dialog-footer"]')!
    expect(within(footer()).queryByRole('button', { name: 'Tạo và gắn vào kho' })).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Tạo vật tư mới' }))
    const submit = within(footer()).getByRole('button', { name: 'Tạo và gắn vào kho' })
    expect(submit).toHaveAttribute('type', 'submit')
    expect(submit).toHaveAttribute(
      'form',
      screen.getByRole('form', { name: 'Tạo vật tư mới' }).getAttribute('id'),
    )
    expect(within(footer()).getByRole('button', { name: 'Đóng' })).toBeInTheDocument()
  })

  it('thiếu quyền tạo → nút ở chân hộp khoá, mô tả bằng lý do', async () => {
    server.use(mswHttp.get(`${BASE}/materials`, () => paginated([])))
    const { user } = renderWithProviders(
      <Harness onAdded={vi.fn()} abilities={{ ...ALL, create: false }} />,
      { auth: 'admin' },
    )
    await user.click(screen.getByRole('tab', { name: 'Tạo vật tư mới' }))
    const submit = screen.getByRole('button', { name: 'Tạo và gắn vào kho' })
    expect(submit).toBeDisabled()
    expect(submit).toHaveAccessibleDescription(
      'Cần quyền tạo / sửa vật tư, sửa kho và xem đơn vị — liên hệ quản trị.',
    )
  })

  it('hai tab: ô tìm trống liệt kê sẵn danh mục; qua lại giữa hai tab giữ phần đã nhập ở form tạo', async () => {
    server.use(mswHttp.get(`${BASE}/materials`, () => paginated([cement])))
    const { user } = renderWithProviders(<Harness onAdded={vi.fn()} initialSearch="" />, {
      auth: 'admin',
    })
    expect(screen.getByRole('tab', { name: 'Chọn từ danh mục' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // Kho chưa có vật tư nào: không cần gõ, danh mục hiện sẵn để chọn.
    expect(await screen.findByRole('button', { name: 'Gắn vào kho' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Tạo vật tư mới' }))
    await user.type(screen.getByRole('textbox', { name: /^Tên vật tư/ }), 'Thép cuộn')
    await user.click(screen.getByRole('tab', { name: 'Chọn từ danh mục' }))
    expect(screen.queryByRole('button', { name: 'Tạo và gắn vào kho' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Tìm vật tư trong danh mục/ })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Tạo vật tư mới' }))
    expect(screen.getByRole('textbox', { name: /^Tên vật tư/ })).toHaveValue('Thép cuộn')
  })

  describe('tab "Tạo vật tư mới" — bước xác nhận trong hộp', () => {
    const stamp = { createdAt: '', updatedAt: '' }
    function mockCreateCatalog(post: Parameters<typeof mswHttp.post>[1]) {
      server.use(
        mswHttp.get(`${BASE}/materials`, () => paginated([])),
        mswHttp.get(`${BASE}/material-types`, () =>
          paginated([{ slug: 'mt-1', code: 'MT', name: 'Vật liệu', ...stamp }]),
        ),
        mswHttp.get(`${BASE}/units`, () =>
          paginated([
            {
              slug: 'u-kg',
              code: 'KG',
              name: 'Kilogram',
              materialCount: { asBaseUnit: 0, asConversionUnit: 0, total: 0 },
              ...stamp,
            },
          ]),
        ),
        mswHttp.get(`${BASE}/suppliers`, () =>
          paginated([{ slug: 's-1', code: 'NCC-1', name: 'NCC Bột', ...stamp }]),
        ),
        mswHttp.post(`${BASE}/warehouses/w-a/materials`, post),
      )
    }
    async function fillCreate(user: UserEvent, withSupplier = true) {
      await user.click(screen.getByRole('tab', { name: 'Tạo vật tư mới' }))
      await user.type(await screen.findByRole('textbox', { name: /^Mã vật tư/ }), 'vt-99')
      const pick = async (field: RegExp, label: string) => {
        await user.click(screen.getByRole('combobox', { name: field }))
        await user.click(await screen.findByText(label))
      }
      await pick(/^Loại vật tư/, 'MT · Vật liệu')
      await pick(/^Đơn vị gốc/, 'KG · Kilogram')
      if (withSupplier) await pick(/^Nhà cung cấp/, 'NCC-1 · NCC Bột')
    }

    it('hỏi "Tạo vật tư … và gắn vào kho …?" kèm tóm tắt, chưa POST; "Quay lại" giữ dữ liệu', async () => {
      const posted = vi.fn()
      mockCreateCatalog(() => {
        posted()
        return ok({ materialSlug: 'm-new', materialName: 'Xi măng mới' })
      })
      const { user } = renderWithProviders(
        <Harness onAdded={vi.fn()} initialSearch="Xi măng mới" />,
        {
          auth: 'admin',
        },
      )
      await fillCreate(user)
      await user.click(screen.getByRole('button', { name: 'Tạo và gắn vào kho' }))

      const dialog = await screen.findByRole('dialog', {
        name: 'Tạo vật tư VT-99 và gắn vào kho Kho A?',
      })
      expect(dialog).toHaveTextContent('Xi măng mới')
      expect(dialog).toHaveTextContent('KG · Kilogram')
      expect(dialog).toHaveTextContent('NCC-1 · NCC Bột')
      expect(dialog).toHaveTextContent('Vật tư mới được thêm vào danh mục và gắn vào kho ngay.')
      expect(posted).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Quay lại' }))

      expect(screen.getByRole('textbox', { name: /^Mã vật tư/ })).toHaveValue('vt-99')
      expect(screen.getByRole('textbox', { name: /^Tên vật tư/ })).toHaveValue('Xi măng mới')
      expect(screen.getByRole('combobox', { name: /^Đơn vị gốc/ })).toHaveTextContent(
        'KG · Kilogram',
      )
      await user.click(screen.getByRole('button', { name: 'Tạo và gắn vào kho' }))
      expect(
        await screen.findByRole('dialog', { name: 'Tạo vật tư VT-99 và gắn vào kho Kho A?' }),
      ).toBeInTheDocument()
      expect(posted).not.toHaveBeenCalled()
    })

    it('không chọn NCC → tóm tắt không có dòng nhà cung cấp', async () => {
      mockCreateCatalog(() => ok({ materialSlug: 'm-new', materialName: 'Xi măng mới' }))
      const { user } = renderWithProviders(
        <Harness onAdded={vi.fn()} initialSearch="Xi măng mới" />,
        {
          auth: 'admin',
        },
      )
      await fillCreate(user, false)
      await user.click(screen.getByRole('button', { name: 'Tạo và gắn vào kho' }))

      const dialog = await screen.findByRole('dialog', { name: /^Tạo vật tư VT-99/ })
      // Form ẩn vẫn nằm trong DOM → chỉ xét phần tóm tắt.
      expect(within(dialog).getByText('Mã vật tư', { selector: 'dt' })).toBeInTheDocument()
      expect(within(dialog).queryByText('Nhà cung cấp', { selector: 'dt' })).not.toBeInTheDocument()
    })

    it('mã trùng (100705) sau xác nhận → về màn nhập, lỗi tại ô Mã, hộp vẫn mở', async () => {
      mockCreateCatalog(() => apiError(400, 100705, 'dup'))
      const onAdded = vi.fn()
      const { user } = renderWithProviders(
        <Harness onAdded={onAdded} initialSearch="Xi măng mới" />,
        {
          auth: 'admin',
        },
      )
      await fillCreate(user)
      await user.click(screen.getByRole('button', { name: 'Tạo và gắn vào kho' }))
      await confirmStep(user, 'Xác nhận tạo vật tư')

      expect(await screen.findByText('Mã vật tư đã tồn tại')).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /^Mã vật tư/ })).toHaveValue('vt-99')
      expect(screen.getByRole('button', { name: 'Tạo và gắn vào kho' })).toBeEnabled()
      expect(onAdded).not.toHaveBeenCalled()
    })

    it('bấm đúp nút xác nhận chỉ gửi một POST', async () => {
      const posted = vi.fn()
      mockCreateCatalog(async () => {
        posted()
        await new Promise((resolve) => setTimeout(resolve, 150))
        return ok({ materialSlug: 'm-new', materialName: 'Xi măng mới' })
      })
      const onAdded = vi.fn()
      const { user } = renderWithProviders(
        <Harness onAdded={onAdded} initialSearch="Xi măng mới" />,
        {
          auth: 'admin',
        },
      )
      await fillCreate(user)
      await user.click(screen.getByRole('button', { name: 'Tạo và gắn vào kho' }))

      await user.dblClick(await screen.findByRole('button', { name: 'Xác nhận tạo vật tư' }))

      await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1))
      expect(posted).toHaveBeenCalledTimes(1)
    })
  })
})
