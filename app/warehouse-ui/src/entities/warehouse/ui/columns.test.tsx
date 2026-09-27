import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { renderWithProviders } from '@/shared/test/render'
import type { Warehouse } from '../model/types'
import { buildWarehouseColumns } from './columns'

const warehouse: Warehouse = {
  slug: 'kho-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Kho Hà Nội 1',
  code: 'WH-HN-01',
  address: 'Số 1, Cầu Giấy, Hà Nội',
  isActive: false,
}

function Table({ withLink }: { withLink: boolean }) {
  const { t } = useTranslation(['warehouses', 'common'])
  const columns = buildWarehouseColumns(
    t,
    withLink ? { detailLink: (w) => ({ to: `/warehouses/${w.slug}` }) } : {},
  )
  return <DataTable columns={columns} data={[warehouse]} isLoading={false} />
}

describe('buildWarehouseColumns', () => {
  it('có detailLink → tên kho là link tới trang chi tiết', () => {
    renderWithProviders(<Table withLink />)

    expect(screen.getByRole('link', { name: 'Kho Hà Nội 1' })).toHaveAttribute(
      'href',
      '/warehouses/kho-ha-noi',
    )
  })

  it('không có detailLink → tên là chữ thường', () => {
    renderWithProviders(<Table withLink={false} />)

    expect(screen.getByText('Kho Hà Nội 1')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Kho Hà Nội 1' })).not.toBeInTheDocument()
  })

  it('cột trạng thái dùng WarehouseStatusBadge', () => {
    renderWithProviders(<Table withLink={false} />)

    expect(screen.getByText('Ngừng hoạt động')).toBeInTheDocument()
  })
})
