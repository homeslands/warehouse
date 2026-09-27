import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { renderWithProviders } from '@/shared/test/render'
import type { Store } from '../model/types'
import { buildStoreColumns } from './columns'

const store: Store = {
  slug: 'ch-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Cửa hàng Hà Nội 1',
  code: 'ST-HN-01',
  legalName: 'Công ty ABC',
  taxCode: '0101234567',
  isActive: true,
}

function Table({ withLink }: { withLink: boolean }) {
  const { t } = useTranslation(['stores', 'common'])
  const columns = buildStoreColumns(
    t,
    withLink ? { detailLink: (s) => ({ to: `/stores/${s.slug}` }) } : {},
  )
  return <DataTable columns={columns} data={[store]} isLoading={false} />
}

describe('buildStoreColumns', () => {
  it('có detailLink → tên cửa hàng là link tới trang chi tiết', () => {
    renderWithProviders(<Table withLink />)

    expect(screen.getByRole('link', { name: 'Cửa hàng Hà Nội 1' })).toHaveAttribute(
      'href',
      '/stores/ch-ha-noi',
    )
  })

  it('không có detailLink → tên là chữ thường', () => {
    renderWithProviders(<Table withLink={false} />)

    expect(screen.getByText('Cửa hàng Hà Nội 1')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Cửa hàng Hà Nội 1' })).not.toBeInTheDocument()
  })

  it('cột trạng thái dùng StoreStatusBadge', () => {
    renderWithProviders(<Table withLink={false} />)

    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument()
  })
})
