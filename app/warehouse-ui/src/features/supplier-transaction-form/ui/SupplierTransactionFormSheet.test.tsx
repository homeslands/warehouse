import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { formatCurrency } from '@/shared/lib/format'
import { apiError, ok, paginated } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { supplierKeys, type SupplierMaterial, type SupplierTransaction } from '@/entities/supplier'
import { SupplierTransactionFormSheet } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const supplier = { slug: 's-1', code: 'NCC-HN-01' }

const material: SupplierMaterial = {
  slug: 'm-2',
  createdAt: '',
  updatedAt: '',
  code: 'NL04',
  name: 'Bột giặt',
  baseUnitName: 'kg',
}
const recorded = { slug: 't-1', type: 'PURCHASE', amount: 1250000 } as SupplierTransaction

let body: unknown

function renderSheet(canViewMaterials = true) {
  const onOpenChange = vi.fn()
  const onGoToMaterials = vi.fn()
  return {
    onOpenChange,
    onGoToMaterials,
    ...renderWithProviders(
      <SupplierTransactionFormSheet
        open
        onOpenChange={onOpenChange}
        supplier={supplier}
        canViewMaterials={canViewMaterials}
        onGoToMaterials={onGoToMaterials}
      />,
      { auth: 'admin' },
    ),
  }
}
type User = ReturnType<typeof renderSheet>['user']

const quantityField = () => screen.getByLabelText(/^Số lượng/)
const unitPriceField = () => screen.getByLabelText(/^Đơn giá/)
const amountField = () => screen.getByLabelText(/^Số tiền/)
const dateField = () => screen.getByLabelText(/^Ngày giao dịch/)

async function pickType(user: User, label: string) {
  await user.click(screen.getByRole('combobox', { name: /^Loại/ }))
  await user.click(await screen.findByRole('option', { name: label }))
}

async function pickMaterial(user: User) {
  await user.click(await screen.findByRole('combobox', { name: /^Vật tư/ }))
  await user.click(await screen.findByText('NL04 · Bột giặt'))
}

async function fillPurchase(user: User) {
  await pickMaterial(user)
  await user.type(quantityField(), '10')
  await user.type(unitPriceField(), '125000')
}

async function submit(user: User) {
  await user.click(screen.getByRole('button', { name: 'Ghi giao dịch' }))
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  body = undefined
  server.use(
    mswHttp.get(`${BASE}/suppliers/s-1/materials`, () => paginated([material])),
    mswHttp.post(`${BASE}/suppliers/s-1/transactions`, async ({ request }) => {
      body = await request.json()
      return ok(recorded)
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SupplierTransactionFormSheet', () => {
  it('mặc định Mua hàng: ô Vật tư/SL/Đơn giá, thành tiền tạm tính cập nhật khi gõ, không có ô Số tiền', async () => {
    const { user } = renderSheet()

    await pickMaterial(user)
    expect(screen.getByRole('combobox', { name: /^Vật tư/ })).toHaveTextContent('NL04 · Bột giặt')
    expect(screen.getByText('kg')).toBeInTheDocument()

    await user.type(quantityField(), '10')
    await user.type(unitPriceField(), '125000')

    expect(screen.getByLabelText('Thành tiền (tạm tính)')).toHaveValue(formatCurrency(1250000))
    expect(screen.queryByLabelText(/^Số tiền/)).not.toBeInTheDocument()
  })

  it('tạm tính 0.1 × 3 hiện 0,3 (làm tròn 2 số lẻ), không phải 0.30000000000000004', async () => {
    const { user } = renderSheet()

    await user.type(quantityField(), '0.1')
    await user.type(unitPriceField(), '3')

    expect(screen.getByLabelText('Thành tiền (tạm tính)')).toHaveValue(
      formatCurrency(0.3, { maximumFractionDigits: 2 }),
    )
    expect(screen.getByLabelText('Thành tiền (tạm tính)').getAttribute('value')).toContain('0,3')
  })

  it('SL 7 số lẻ / đơn giá 3 số lẻ bị báo lỗi ngay tại ô', async () => {
    const { user } = renderSheet()

    await user.type(quantityField(), '1.1234567')
    await user.type(unitPriceField(), '1.005')
    await user.tab()

    expect(quantityField()).toHaveAccessibleDescription(
      'Số lượng phải lớn hơn 0, tối đa 6 chữ số thập phân',
    )
    expect(unitPriceField()).toHaveAccessibleDescription(
      'Đơn giá không âm, tối đa 2 chữ số thập phân',
    )
  })

  it('chọn Thanh toán → ẩn Vật tư/SL/Đơn giá, hiện Số tiền', async () => {
    const { user } = renderSheet()

    await pickType(user, 'Thanh toán')

    expect(amountField()).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Số lượng/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Đơn giá/)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /^Vật tư/ })).not.toBeInTheDocument()
  })

  it('chưa gắn vật tư (Mua hàng) → nhắc gắn trước, nút mở tab Vật tư, nút Ghi khoá', async () => {
    server.use(mswHttp.get(`${BASE}/suppliers/s-1/materials`, () => paginated([])))
    const { user, onGoToMaterials } = renderSheet()

    expect(
      await screen.findByText('Hãy gắn vật tư trước khi ghi mua/trả hàng.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ghi giao dịch' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Mở tab Vật tư' }))
    expect(onGoToMaterials).toHaveBeenCalledTimes(1)
  })

  it('hợp lệ → hộp xác nhận tóm tắt → Ghi → POST đúng body, đóng sheet, toast', async () => {
    const { user, onOpenChange } = renderSheet()

    await fillPurchase(user)
    await submit(user)

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Ghi giao dịch này?')
    expect(dialog).toHaveTextContent('Mua hàng')
    expect(dialog).toHaveTextContent('NL04 · Bột giặt')
    expect(dialog).toHaveTextContent('10 kg × 125.000')
    expect(dialog).toHaveTextContent('1.250.000')
    expect(body).toBeUndefined()

    await confirmDialog(user, 'Ghi')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({
      type: 'PURCHASE',
      materialSlug: 'm-2',
      quantity: 10,
      unitPrice: 125000,
      transactionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string,
    })
    expect(toast.success).toHaveBeenCalledWith('Đã ghi giao dịch')
  })

  it('Huỷ trong hộp xác nhận → không gửi', async () => {
    const { user, onOpenChange } = renderSheet()

    await fillPurchase(user)
    await submit(user)
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())

    expect(body).toBeUndefined()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('nhập vật tư/SL/đơn giá rồi đổi sang Thanh toán → body không mang vật tư/SL/đơn giá (Review Focus #2)', async () => {
    const { user, onOpenChange } = renderSheet()

    await fillPurchase(user)
    await pickType(user, 'Thanh toán')
    await user.type(amountField(), '500000')
    await submit(user)
    await confirmDialog(user, 'Ghi')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({
      type: 'PAYMENT',
      amount: 500000,
      transactionDate: expect.any(String) as string,
    })
    expect(body).not.toHaveProperty('materialSlug')
    expect(body).not.toHaveProperty('quantity')
    expect(body).not.toHaveProperty('unitPrice')
  })

  it('đổi ngược Thanh toán → Mua hàng: body Mua hàng không mang amount', async () => {
    const { user, onOpenChange } = renderSheet()

    await pickType(user, 'Thanh toán')
    await user.type(amountField(), '999')
    await pickType(user, 'Mua hàng')
    await fillPurchase(user)
    await submit(user)
    await confirmDialog(user, 'Ghi')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).not.toHaveProperty('amount')
  })

  it.each([
    ['PURCHASE', 101213, 'Vật tư không còn gắn với nhà cung cấp này', /^Vật tư/],
    ['PURCHASE', 101216, 'Số lượng phải lớn hơn 0, tối đa 6 chữ số thập phân', /^Số lượng/],
    ['PURCHASE', 101217, 'Đơn giá không âm, tối đa 2 chữ số thập phân', /^Đơn giá/],
    ['PAYMENT', 101218, 'Số tiền phải lớn hơn 0, tối đa 2 chữ số thập phân', /^Số tiền/],
    ['PURCHASE', 101219, 'Ngày giao dịch không hợp lệ', /^Ngày giao dịch/],
  ])(
    'lỗi backend %s/%i hiện dưới đúng ô, không toast, hộp xác nhận đã đóng',
    async (type, code, message, label) => {
      server.use(mswHttp.post(`${BASE}/suppliers/s-1/transactions`, () => apiError(422, code)))
      const { user } = renderSheet()

      if (type === 'PAYMENT') {
        await pickType(user, 'Thanh toán')
        await user.type(amountField(), '500000')
      } else {
        await fillPurchase(user)
      }
      await submit(user)
      await confirmDialog(user, 'Ghi')

      // Đợi lỗi hiện (yêu cầu đã trả về) rồi mới khẳng định "không toast".
      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(toast.error).not.toHaveBeenCalled()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
        expect.stringContaining(message),
      )
    },
  )

  it('hộp xác nhận: SL + ĐVT, đơn giá, thành tiền không bị ngắt giữa số (whitespace-nowrap)', async () => {
    const { user } = renderSheet()

    await fillPurchase(user)
    await submit(user)

    const dialog = await screen.findByRole('alertdialog')
    for (const text of [/^10\s+kg$/, /^125\.000/, /^1\.250\.000/]) {
      const el = within(dialog).getByText(text)
      expect(el).toHaveClass('whitespace-nowrap')
    }
  })

  it('tải vật tư lỗi → câu lỗi dưới ô Vật tư, ô bị khoá', async () => {
    server.use(mswHttp.get(`${BASE}/suppliers/s-1/materials`, () => apiError(500, 1, 'boom')))
    renderSheet()

    const combobox = await screen.findByRole('combobox', { name: /^Vật tư/ })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/\S/)
    expect(combobox).toBeDisabled()
  })

  it('101213 → tải lại vật tư NCC (lỗi vẫn ở ô Vật tư)', async () => {
    server.use(mswHttp.post(`${BASE}/suppliers/s-1/transactions`, () => apiError(422, 101213)))
    const { user, queryClient } = renderSheet()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await fillPurchase(user)
    await submit(user)
    await confirmDialog(user, 'Ghi')

    expect(await screen.findByText('Vật tư không còn gắn với nhà cung cấp này')).toBeInTheDocument()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.materials('s-1') })
  })

  it('canViewMaterials=false → chỉ còn Thanh toán (mặc định), kèm gợi ý, không gọi API vật tư', async () => {
    let materialHits = 0
    server.use(
      mswHttp.get(`${BASE}/suppliers/s-1/materials`, () => {
        materialHits += 1
        return paginated([material])
      }),
    )
    const { user, onOpenChange } = renderSheet(false)

    const select = screen.getByRole('combobox', { name: /^Loại/ })
    expect(select).toHaveTextContent('Thanh toán')
    expect(screen.getByText('Cần quyền xem vật tư để ghi mua/trả hàng')).toBeInTheDocument()
    await user.click(select)
    expect(await screen.findAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Escape}')

    await user.type(amountField(), '500000')
    await submit(user)
    await confirmDialog(user, 'Ghi')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toMatchObject({ type: 'PAYMENT', amount: 500000 })
    expect(materialHits).toBe(0)
  })

  it('chọn ngày mai → lỗi "Ngày giao dịch không được ở tương lai" dưới ô ngày, không gửi', async () => {
    // Chỉ giả `Date` để mốc "hôm nay" cố định (8/10/2026); timer thật nên user-event/MSW chạy bình thường.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 15, 0))
    const { user } = renderSheet()

    await pickMaterial(user)
    await user.type(quantityField(), '1')
    await user.type(unitPriceField(), '1000')
    await user.click(dateField())
    await user.click(await screen.findByText('9'))
    await submit(user)

    expect(await screen.findByText('Ngày giao dịch không được ở tương lai')).toBeInTheDocument()
    expect(dateField()).toHaveAccessibleDescription('Ngày giao dịch không được ở tương lai')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(body).toBeUndefined()
  })
})
