import { getCoreRowModel, useReactTable, flexRender } from '@tanstack/react-table'
import { screen } from '@testing-library/react'
import { useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { buildExportFormColumns } from './columns'
import { exportFormFixture } from '../model/fixtures'
import type { ExportForm } from '../model/types'

function Table({ rows }: { rows: ExportForm[] }) {
  const { t } = useTranslation(['exportForms', 'common'])
  const columns = buildExportFormColumns(t, {
    detailLink: (f) => ({ to: `/export-forms/${f.slug}?warehouse=${f.warehouseSlug}` }),
  })
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })
  return (
    <table>
      <thead>
        <tr>
          {table.getHeaderGroups()[0].headers.map((h) => (
            <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.getRowModel().rows.map((r) => (
          <tr key={r.id}>
            {r.getVisibleCells().map((c) => (
              <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

describe('buildExportFormColumns', () => {
  it('thứ tự cột theo spec §4.1, chỉ cột Mã sắp được', () => {
    const { container } = renderWithProviders(<Table rows={[]} />)
    expect(Array.from(container.querySelectorAll('th')).map((th) => th.textContent)).toEqual([
      'Mã phiếu',
      'Lý do xuất',
      'Người nhận',
      'Trạng thái',
      'Người lập',
      'Ngày tạo',
      'Tổng tiền',
    ])
  })

  it('mã là link, lý do + trạng thái dịch, phiếu Bán hiện tổng tiền', () => {
    renderWithProviders(<Table rows={[exportFormFixture()]} />)
    expect(screen.getByRole('link', { name: 'PX-0001' })).toHaveAttribute(
      'href',
      '/export-forms/xf-1?warehouse=w-a',
    )
    expect(screen.getByText('Bán')).toBeInTheDocument()
    expect(screen.getByText('Nháp')).toBeInTheDocument()
    expect(screen.getByText(/200\.000/)).toBeInTheDocument()
  })

  it('phiếu không phải Bán → tổng tiền "—"', () => {
    renderWithProviders(<Table rows={[exportFormFixture({ type: 'DISPOSAL' })]} />)
    expect(screen.getByText('Xuất huỷ')).toBeInTheDocument()
    expect(screen.queryByText(/200\.000/)).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('người nhận dài bị cắt, đủ chữ ở title', () => {
    const receiver = 'Kho: KHO-02 · Kho chi nhánh miền Trung rất dài rất dài'
    renderWithProviders(<Table rows={[exportFormFixture({ receiver })]} />)
    expect(screen.getByText(receiver)).toHaveAttribute('title', receiver)
  })

  it('cột Mã khai sortField "code"', () => {
    const cols = buildExportFormColumns(((k: string) => k) as never)
    expect(cols[0].meta).toMatchObject({ sortField: 'code' })
  })
})
