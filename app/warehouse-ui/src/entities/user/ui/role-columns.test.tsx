import { screen } from '@testing-library/react'
import { useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { buildRoleColumns } from './role-columns'
import type { Role } from '../model/types'

const LONG = 'TrưởngNhómKhoTổngHợpMiềnBắcVàMiềnTrungKhôngKhoảngTrắng'
const rows: Role[] = [
  {
    slug: 'r-manager',
    name: 'MANAGER',
    level: 20,
    authorityCodes: ['A', 'B'],
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  { slug: 'r-tl', name: LONG, level: 15, authorityCodes: [], description: 'Mô tả dài' },
]

function Table({ me }: { me?: string }) {
  const { t } = useTranslation(['roles', 'common'])
  const columns = buildRoleColumns(t, {
    roleLabel: (name) => (name === 'MANAGER' ? 'Quản lý' : name),
    currentRoleName: me,
  })
  return <DataTable columns={columns} data={rows} isLoading={false} error={null} />
}

describe('buildRoleColumns', () => {
  it('có sẵn: nhãn + mã dòng phụ + badge "Có sẵn"; badge "Bạn" ở dòng của mình', async () => {
    renderWithProviders(<Table me="MANAGER" />)
    expect(await screen.findByText('Quản lý')).toBeInTheDocument()
    expect(screen.getByText('MANAGER')).toBeInTheDocument()
    expect(screen.getAllByText('Có sẵn')).toHaveLength(1)
    expect(screen.getAllByText('Bạn')).toHaveLength(1)
    // Ô tên không giữ bề rộng tối thiểu riêng — badge nằm sát tên ở màn hẹp (break-ui 375px).
    expect(screen.getByText('Quản lý')).not.toHaveClass('min-w-32')
  })

  it('tự tạo: nguyên tên, ngắt được chuỗi dài; mô tả 2 dòng có title; số quyền', async () => {
    renderWithProviders(<Table />)
    // `min-w-0`: ô tên là flex item — không có thì bề rộng tối thiểu = cả chuỗi, `break-words` không ngắt được.
    expect(await screen.findByText(LONG)).toHaveClass('break-words', 'min-w-0')
    expect(screen.getByText('Mô tả dài')).toHaveClass('line-clamp-2')
    // `block` đè `display: -webkit-box` của line-clamp → mô tả hiện hết các dòng (break-ui 2026-10-11).
    expect(screen.getByText('Mô tả dài')).not.toHaveClass('block')
    expect(screen.getByText('Mô tả dài')).toHaveAttribute('title', 'Mô tả dài')
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText('Bạn')).not.toBeInTheDocument()
  })
})
