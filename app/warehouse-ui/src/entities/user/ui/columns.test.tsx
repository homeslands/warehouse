import { screen } from '@testing-library/react'
import { useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { buildUserColumns, userDisplayName } from './columns'
import type { User } from '../model/types'

const base: User = {
  slug: 'u1',
  createdAt: 'Wed Sep 30 2026 11:22:59 GMT+0700 (Indochina Time)',
  updatedAt: 'Wed Sep 30 2026 11:22:59 GMT+0700 (Indochina Time)',
  phonenumber: '0384940599',
  firstName: 'Lan',
  lastName: 'Trần',
  dob: null,
  email: null,
  address: null,
  isActive: true,
  roleSlug: 'r-supervisor',
  roleName: 'SUPERVISOR',
}
const root: User = {
  ...base,
  slug: 'u-root',
  phonenumber: 'root',
  firstName: '',
  lastName: '',
  roleName: 'SUPER_ADMIN',
  isActive: false,
}

function Table({ rows, self }: { rows: User[]; self?: string }) {
  const { t } = useTranslation(['users', 'common'])
  const columns = buildUserColumns(t, {
    roleLabel: (name) => `role:${name}`,
    isSelf: (u) => u.slug === self,
  })
  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={false}
      error={null}
      pagination={{
        page: 1,
        size: 10,
        total: rows.length,
        totalPages: 1,
        onPageChange: () => {},
        onSizeChange: () => {},
        isFetching: false,
      }}
    />
  )
}

describe('userDisplayName', () => {
  it('họ trước tên; chưa khai tên → định danh đăng nhập', () => {
    expect(userDisplayName(base)).toBe('Trần Lan')
    expect(userDisplayName(root)).toBe('root')
  })
})

describe('buildUserColumns', () => {
  it('hiện họ tên, định danh, vai trò qua roleLabel, trạng thái, ngày tạo parse được chuỗi Date.toString()', async () => {
    renderWithProviders(<Table rows={[base]} />)

    expect(await screen.findByText('Trần Lan')).toBeInTheDocument()
    expect(screen.getByText('0384940599')).toBeInTheDocument()
    const role = screen.getByText('role:SUPERVISOR')
    // Vai trò là chữ thường, không bọc badge.
    expect(role.closest('[data-slot="badge"]')).toBeNull()
    expect(screen.getByText('Hoạt động')).toBeInTheDocument()
    expect(screen.getByText(/30\/09\/2026/)).toBeInTheDocument()
  })

  it('tài khoản cũ không tên (root) → cột Họ tên hiện "root", không trống; bị khoá → "Đã khoá"', async () => {
    renderWithProviders(<Table rows={[root]} />)

    expect(await screen.findAllByText('root')).toHaveLength(2)
    expect(screen.getByText('Đã khoá')).toBeInTheDocument()
  })

  it('dòng của chính mình có nhãn "Bạn"', async () => {
    renderWithProviders(<Table rows={[base, root]} self="u1" />)

    const you = await screen.findAllByText('Bạn')
    expect(you).toHaveLength(1)
    // Cùng kiểu badge nền xám mà cột Vai trò từng dùng.
    expect(you[0].closest('[data-slot="badge"]')).toHaveAttribute('data-variant', 'secondary')
  })

  it('cột Kho liệt kê tên kho là thành viên; không có kho → "Chưa có"', async () => {
    renderWithProviders(
      <Table
        rows={[
          {
            ...base,
            email: 'lan@example.com',
            warehouses: [
              { slug: 'a', code: 'A', name: 'Kho A' },
              { slug: 'b', code: 'B', name: 'Kho B' },
            ],
          },
          { ...root, email: 'root@example.com', warehouses: [] },
        ]}
      />,
    )
    expect(await screen.findByText('Kho A, Kho B')).toBeInTheDocument()
    expect(screen.getByText('Chưa có')).toBeInTheDocument()
  })

  it('khai sortField cho Họ tên / Tên đăng nhập / Ngày tạo', () => {
    const columns = buildUserColumns(((k: string) => k) as never, {
      roleLabel: (n) => n,
      isSelf: () => false,
    })
    const sortFields = Object.fromEntries(
      columns.map((c) => [
        c.id ?? (c as { accessorKey?: string }).accessorKey,
        (c.meta as { sortField?: string } | undefined)?.sortField,
      ]),
    )
    expect(sortFields).toMatchObject({
      name: 'firstName',
      phonenumber: 'phonenumber',
      createdAt: 'createdAt',
    })
  })

  it('nhiều kho → hiện 2 kho đầu + "+N"; title và trình đọc màn hình có đủ danh sách', async () => {
    const names = ['Kho A', 'Kho B', 'Kho C', 'Kho D', 'Kho E', 'Kho F']
    renderWithProviders(
      <Table
        rows={[
          {
            ...base,
            warehouses: names.map((name, i) => ({ slug: `w${i}`, code: `W${i}`, name })),
          },
        ]}
      />,
    )
    const visible = await screen.findByText('Kho A, Kho B')
    const cell = visible.closest('td') as HTMLElement
    expect(cell).toHaveTextContent('+4')
    expect(cell.querySelector('[title]')).toHaveAttribute('title', names.join(', '))
    expect(cell.querySelector('.sr-only')).toHaveTextContent(names.join(', '))
  })

  it('vai trò dài bị cắt "…" → ô mang title là tên đầy đủ', async () => {
    renderWithProviders(<Table rows={[{ ...base, roleName: 'Trưởng kho khu vực miền Bắc' }]} />)
    const role = await screen.findByText('role:Trưởng kho khu vực miền Bắc')
    expect(role).toHaveAttribute('title', 'role:Trưởng kho khu vực miền Bắc')
    expect(role).toHaveClass('truncate')
  })

  it('nhãn "Bạn" chạy theo dòng chữ của tên (cùng một khối văn bản), không là cột flex riêng', async () => {
    renderWithProviders(<Table rows={[base]} self="u1" />)
    const badge = (await screen.findByText('Bạn')).closest('[data-slot="badge"]') as HTMLElement
    const nameBlock = badge.parentElement as HTMLElement
    expect(nameBlock).toHaveTextContent('Trần Lan')
    expect(nameBlock).not.toHaveClass('inline-flex')
  })
})
