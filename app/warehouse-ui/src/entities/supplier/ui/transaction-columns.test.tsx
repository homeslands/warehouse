import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { renderWithProviders } from '@/shared/test/render'
import type { SupplierTransaction } from '../model/types'
import { buildSupplierTransactionColumns } from './transaction-columns'

const base: SupplierTransaction = {
  slug: 'gd-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  type: 'PURCHASE',
  materialSlug: 'bot-mi',
  materialCode: 'MAT-001',
  materialName: 'Bột mì',
  quantity: 1.123456,
  unitPrice: 15000,
  amount: 12345678900,
  transactionDate: '2026-09-18T08:05:00.000Z',
  note: null,
}

const payment: SupplierTransaction = {
  ...base,
  slug: 'gd-3',
  type: 'PAYMENT',
  materialSlug: null,
  materialCode: null,
  materialName: null,
  quantity: null,
  unitPrice: null,
  amount: 500000,
}

function Table({ rows }: { rows: SupplierTransaction[] }) {
  const { t } = useTranslation(['suppliers', 'common'])
  return <DataTable columns={buildSupplierTransactionColumns(t)} data={rows} isLoading={false} />
}

describe('buildSupplierTransactionColumns', () => {
  it('đủ tiêu đề cột', () => {
    renderWithProviders(<Table rows={[base]} />)

    for (const name of [
      'Thời gian',
      'Loại',
      'Vật tư',
      'Số lượng',
      'Đơn giá',
      'Thành tiền',
      'Người ghi',
      'Ghi chú',
    ]) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
  })

  it('nhãn loại giao dịch theo tông: Mua hàng success, Trả hàng warning, Thanh toán info', () => {
    renderWithProviders(<Table rows={[base, { ...base, slug: 'gd-2', type: 'RETURN' }, payment]} />)

    expect(screen.getByText('Mua hàng').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'success',
    )
    expect(screen.getByText('Trả hàng').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'warning',
    )
    expect(screen.getByText('Thanh toán').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'info',
    )
  })

  it('PAYMENT: cột vật tư hiện "Chưa có"', () => {
    renderWithProviders(<Table rows={[payment]} />)

    expect(screen.getAllByText('Chưa có').length).toBeGreaterThan(0)
  })

  it('vật tư hiện "mã · tên"', () => {
    renderWithProviders(<Table rows={[base]} />)

    expect(screen.getByText('MAT-001 · Bột mì')).toBeInTheDocument()
  })

  it('break-ui: ô vật tư có min-w để tên dài không bị bóp thành cột 1 từ mỗi dòng', () => {
    renderWithProviders(<Table rows={[base]} />)

    expect(screen.getByText('MAT-001 · Bột mì')).toHaveClass('min-w-40', 'max-w-64')
  })

  it('thành tiền định dạng tiền tệ, căn phải, tabular-nums', () => {
    renderWithProviders(<Table rows={[base]} />)

    const cell = screen.getByText(/12\.345\.678\.900/)
    expect(cell).toHaveClass('tabular-nums', 'text-right')
  })

  it('số lượng hiện đủ 6 số lẻ', () => {
    renderWithProviders(<Table rows={[base]} />)

    expect(screen.getByText('1,123456')).toBeInTheDocument()
  })

  it('ghi chú dài có title và truncate', () => {
    const note = 'Ghi chú rất dài '.repeat(10).trim()
    renderWithProviders(<Table rows={[{ ...base, note }]} />)

    const el = screen.getByTitle(note)
    expect(el).toHaveClass('truncate')
    expect(el).toHaveTextContent(note)
  })

  it('F9: Người ghi dài bị cắt (truncate) kèm title', () => {
    const name = 'Nguyễn Văn Rất Rất Rất Rất Dài Người Ghi Sổ'
    renderWithProviders(<Table rows={[{ ...base, performedByName: name }]} />)

    const el = screen.getByText(name)
    expect(el).toHaveClass('block', 'max-w-40', 'truncate')
    expect(el).toHaveAttribute('title', name)
  })
})
