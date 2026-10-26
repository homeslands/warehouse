import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { ImportForm } from '@/entities/import-form'
import { apiError, ok } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { CancelImportFormDialog } from './CancelImportFormDialog'

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
      expiryDate: null,
      note: null,
    },
  ],
}

const URL_X = 'http://localhost:8085/api/v1/warehouses/w-a/import-forms/if-1/cancel'

describe('CancelImportFormDialog', () => {
  it('nêu tồn không đổi; huỷ → POST { version } → đóng', async () => {
    let body: unknown
    server.use(
      mswHttp.post(URL_X, async ({ request }) => {
        body = await request.json()
        return ok({ ...draftForm, status: 'CANCELLED' })
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <CancelImportFormDialog warehouseSlug="w-a" form={draftForm} onOpenChange={onOpenChange} />,
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent('tồn kho không đổi')
    await confirmDialog(user, 'Huỷ phiếu')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ version: 3 })
  })

  it('409 → đóng hộp', async () => {
    server.use(mswHttp.post(URL_X, () => apiError(409, 100800, 'conflict')))
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <CancelImportFormDialog warehouseSlug="w-a" form={draftForm} onOpenChange={onOpenChange} />,
    )
    await confirmDialog(user, 'Huỷ phiếu')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
