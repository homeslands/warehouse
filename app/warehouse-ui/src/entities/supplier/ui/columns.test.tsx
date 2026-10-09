import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { renderWithProviders } from '@/shared/test/render'
import type { Supplier, SupplierMaterial } from '../model/types'
import { buildSupplierColumns, buildSupplierMaterialColumns } from './columns'

const supplier: Supplier = {
  slug: 'ncc-abc',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  code: 'NCC-001',
  name: 'Công ty TNHH Nhà cung cấp ABC',
  taxCode: null,
  phonenumber: '0901234567',
  contactPerson: 'Nguyễn Văn A',
  email: 'ncc@example.com',
}

const material: SupplierMaterial = {
  slug: 'bot-mi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  code: 'MAT-001',
  name: 'Bột mì',
  typeName: 'Nguyên liệu',
  baseUnitName: 'Kg',
}

function Table({ withLink = true }: { withLink?: boolean }) {
  const { t } = useTranslation(['suppliers', 'common'])
  const columns = buildSupplierColumns(
    t,
    withLink ? { detailLink: (s) => ({ to: `/suppliers/${s.slug}` }) } : {},
  )
  return <DataTable columns={columns} data={[supplier]} isLoading={false} />
}

function MaterialTable() {
  const { t } = useTranslation(['suppliers', 'common'])
  return <DataTable columns={buildSupplierMaterialColumns(t)} data={[material]} isLoading={false} />
}

describe('buildSupplierColumns', () => {
  it('đủ tiêu đề cột', () => {
    renderWithProviders(<Table />)

    for (const name of [
      'Mã',
      'Tên',
      'Mã số thuế',
      'Điện thoại',
      'Người liên hệ',
      'Email',
      'Ngày tạo',
    ]) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
  })

  it('tên là link tới trang chi tiết, bọc whitespace-normal', () => {
    renderWithProviders(<Table />)

    const link = screen.getByRole('link', { name: 'Công ty TNHH Nhà cung cấp ABC' })
    expect(link).toHaveAttribute('href', '/suppliers/ncc-abc')
    expect(link).toHaveClass('whitespace-normal')
  })

  it('không có detailLink → tên là chữ thường', () => {
    renderWithProviders(<Table withLink={false} />)

    expect(screen.getByText('Công ty TNHH Nhà cung cấp ABC')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('F9: cột Mã ẩn ở khung hẹp; mã hiện ở dòng phụ dưới tên chỉ khi khung < @sm', () => {
    renderWithProviders(<Table />)

    const codeHeader = screen.getByRole('columnheader', { name: 'Mã' })
    expect(codeHeader).toHaveClass('hidden', '@sm:table-cell')
    const sub = screen.getAllByText('NCC-001').find((el) => el.className.includes('@sm:hidden'))
    expect(sub).toHaveClass('text-muted-foreground', 'block', 'text-xs', '@sm:hidden')
  })

  it('ô trống (taxCode null) hiện "Chưa có"', () => {
    renderWithProviders(<Table />)

    expect(screen.getByText('Chưa có')).toBeInTheDocument()
  })

  it('email và người liên hệ nằm trong phần tử xuống dòng được', () => {
    renderWithProviders(<Table />)

    expect(screen.getByText('ncc@example.com')).toHaveClass('whitespace-normal', 'break-words')
    expect(screen.getByText('Nguyễn Văn A')).toHaveClass('whitespace-normal')
  })

  it('break-ui: ô chuỗi người nhập có min-w để bảng hẹp không bóp thành cột 1 ký tự', () => {
    renderWithProviders(<Table />)

    expect(screen.getByRole('link', { name: 'Công ty TNHH Nhà cung cấp ABC' })).toHaveClass(
      'min-w-40',
    )
    expect(screen.getByText('ncc@example.com')).toHaveClass('min-w-40')
    expect(screen.getByText('Nguyễn Văn A')).toHaveClass('min-w-36')
  })
})

describe('buildSupplierMaterialColumns', () => {
  it('hiện mã, tên, loại và đơn vị cơ sở', () => {
    renderWithProviders(<MaterialTable />)

    for (const name of ['Mã', 'Tên', 'Loại vật tư', 'Đơn vị cơ sở']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
    for (const text of ['MAT-001', 'Bột mì', 'Nguyên liệu', 'Kg']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })

  it('break-ui: tên vật tư có min-w để không bị bóp thành cột 1 từ mỗi dòng', () => {
    renderWithProviders(<MaterialTable />)

    expect(screen.getByText('Bột mì')).toHaveClass('min-w-40')
  })
})
