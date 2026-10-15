import { screen, waitFor } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { Material } from '@/entities/material'
import type { MaterialType } from '@/entities/material-type'
import type { Unit } from '@/entities/unit'
import { MaterialFormSheet } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const type: MaterialType = {
  slug: 'mt-1',
  createdAt: '',
  updatedAt: '',
  code: 'MT-01',
  name: 'Vật liệu',
}
const kg: Unit = {
  slug: 'u-kg',
  createdAt: '',
  updatedAt: '',
  code: 'KG',
  name: 'Kilogram',
  materialCount: { asBaseUnit: 0, asConversionUnit: 0, total: 0 },
}
const material: Material = {
  slug: 'm-1',
  createdAt: '',
  updatedAt: '',
  code: 'VT-01',
  name: 'Xi măng',
  minimumInventory: 10,
  maximumInventory: 100,
  type: { slug: 'mt-9', code: 'MT-09', name: 'Loại ngoài trang đầu' },
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  hasSupplier: false,
  suppliers: [],
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  server.use(
    mswHttp.get(`${BASE}/material-types`, () => paginated([type])),
    mswHttp.get(`${BASE}/units`, () => paginated([kg])),
  )
})

function renderSheet(target?: Material) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(
      <MaterialFormSheet open onOpenChange={onOpenChange} material={target} />,
      { auth: 'admin' },
    ),
  }
}

async function pick(user: UserEvent, field: RegExp, label: string) {
  await user.click(screen.getByRole('combobox', { name: field }))
  await user.click(await screen.findByText(label))
}

describe('MaterialFormSheet', () => {
  it('tạo: chọn loại + đơn vị gốc, xác nhận → POST đúng body', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/materials`, async ({ request }) => {
        body = await request.json()
        return ok(material)
      }),
    )
    const { user, onOpenChange } = renderSheet()

    await user.type(screen.getByLabelText(/^Mã/), 'vt-02')
    await user.type(screen.getByLabelText(/^Tên/), 'Cát')
    await pick(user, /^Loại vật tư/, 'MT-01 · Vật liệu')
    await pick(user, /^Đơn vị gốc/, 'KG · Kilogram')
    await user.type(screen.getByLabelText(/^Tồn tối đa/), '1,5')
    await user.click(screen.getByRole('button', { name: 'Thêm vật tư' }))
    await confirmDialog(user, 'Thêm')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({
      code: 'vt-02',
      name: 'Cát',
      typeSlug: 'mt-1',
      baseUnitSlug: 'u-kg',
      maximumInventory: 1.5,
    })
  })

  it('tạo: tối đa < tối thiểu → lỗi tại ô Tồn tối đa, không gửi', async () => {
    const posted = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/materials`, () => {
        posted()
        return ok(material)
      }),
    )
    const { user } = renderSheet()

    await user.type(screen.getByLabelText(/^Tồn tối thiểu/), '10')
    await user.type(screen.getByLabelText(/^Tồn tối đa/), '5')
    await user.click(screen.getByRole('button', { name: 'Thêm vật tư' }))

    expect(
      await screen.findByText('Tồn tối đa phải lớn hơn hoặc bằng tồn tối thiểu'),
    ).toBeInTheDocument()
    expect(posted).not.toHaveBeenCalled()
  })

  it('sửa: loại hiện tại ngoài 100 bản ghi đầu vẫn hiện đúng trong ô chọn', async () => {
    renderSheet(material)
    expect(await screen.findByRole('combobox', { name: /^Loại vật tư/ })).toHaveTextContent(
      'MT-09 · Loại ngoài trang đầu',
    )
  })

  it('sửa: đổi đơn vị gốc bị khoá (100723) → lỗi tại ô Đơn vị gốc, có gợi ý sẵn', async () => {
    server.use(
      mswHttp.get(`${BASE}/units`, () =>
        paginated([kg, { ...kg, slug: 'u-g', code: 'G', name: 'Gram' }]),
      ),
      mswHttp.patch(`${BASE}/materials/m-1`, () => apiError(422, 100723)),
    )
    const { user } = renderSheet(material)

    expect(
      screen.getByText('Không đổi được khi vật tư đã có tồn kho hoặc đã gắn đơn vị quy đổi khác'),
    ).toBeInTheDocument()
    await pick(user, /^Đơn vị gốc/, 'G · Gram')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(
      await screen.findByText(
        'Không đổi được đơn vị gốc: vật tư đã có tồn kho hoặc đã gắn đơn vị quy đổi khác',
      ),
    ).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('sửa vật tư cũ chưa có đơn vị gốc: gợi ý chọn đơn vị gốc (không phải câu "không đổi được"); bấm Lưu báo bắt buộc', async () => {
    const legacy = { ...material, baseUnit: null }
    const { user } = renderSheet(legacy)

    expect(
      screen.getByText('Đơn vị lưu tồn kho — mọi đơn vị quy đổi tính theo đơn vị này'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Không đổi được khi vật tư đã có tồn kho hoặc đã gắn đơn vị quy đổi khác'),
    ).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Tên/), ' PCB40')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('Vui lòng chọn đơn vị gốc')).toBeInTheDocument()
  })
})
