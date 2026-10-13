import { waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { ImportForm } from '@/entities/import-form'
import { apiError, ok } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { DeleteImportFormDialog } from './DeleteImportFormDialog'

const draftForm: ImportForm = {
  slug: 'if-1',
  createdAt: '2026-10-12T02:00:00.000Z',
  updatedAt: '2026-10-12T02:00:00.000Z',
  version: 3,
  code: 'PN-0001',
  purchaseOrder: 'PO-12',
  invoiceCode: 'HD-123',
  requesterSlug: 'u-sup',
  requesterName: 'Nguyễn Văn A',
  approverSlug: null,
  approverName: null,
  date: '2026-10-12',
  total: 3_750_000,
  file: 'hoa-don-1760000000000.pdf',
  note: 'Giao buổi sáng',
  status: 'DRAFT',
  warehouseSlug: 'w-a',
  items: [
    {
      slug: 'it-1',
      createdAt: '',
      updatedAt: '',
      lineNo: 1,
      materialSlug: 'm-flour',
      materialCode: 'VT-01',
      materialName: 'Bột mì',
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      supplierSlug: 's-1',
      supplierCode: 'NCC-01',
      supplierName: 'NCC Bột',
      supplierTaxCode: '0101',
      supplierAddress: 'Hà Nội',
      quantity: 10,
      conversionRate: 25,
      baseQuantity: 250,
      unitPrice: 375_000,
      amount: 3_750_000,
      note: null,
    },
  ],
}

const URL_D = 'http://localhost:8085/api/v1/warehouses/w-a/import-forms/if-1'

describe('DeleteImportFormDialog', () => {
  it('xoá → DELETE → onDeleted + đóng', async () => {
    const del = vi.fn(() => ok('1 import form have been deleted successfully'))
    server.use(mswHttp.delete(URL_D, del))
    const onOpenChange = vi.fn()
    const onDeleted = vi.fn()
    const { user } = renderWithProviders(
      <DeleteImportFormDialog
        warehouseSlug="w-a"
        form={draftForm}
        onOpenChange={onOpenChange}
        onDeleted={onDeleted}
      />,
    )
    await confirmDialog(user, 'Xoá')
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(del).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('101315 (không phải chủ phiếu) → đóng hộp, không gọi onDeleted', async () => {
    server.use(mswHttp.delete(URL_D, () => apiError(403, 101315, 'not owner')))
    const onOpenChange = vi.fn()
    const onDeleted = vi.fn()
    const { user } = renderWithProviders(
      <DeleteImportFormDialog
        warehouseSlug="w-a"
        form={draftForm}
        onOpenChange={onOpenChange}
        onDeleted={onDeleted}
      />,
    )
    await confirmDialog(user, 'Xoá')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
