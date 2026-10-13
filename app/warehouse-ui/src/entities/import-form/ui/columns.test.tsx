import { getCoreRowModel, useReactTable, flexRender } from '@tanstack/react-table'
import { screen } from '@testing-library/react'
import { useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { buildImportFormColumns } from './columns'
import { draftForm } from '../model/fixtures'
import type { ImportForm } from '../model/types'

function Table({ rows }: { rows: ImportForm[] }) {
  const { t } = useTranslation(['importForms', 'common'])
  const table = useReactTable({
    data: rows,
    columns: buildImportFormColumns(t, {
      detailLink: (f) => ({ to: `/import-forms/${f.slug}?warehouse=${f.warehouseSlug}` }),
    }),
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <table>
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

describe('buildImportFormColumns', () => {
  it('mã là link sang chi tiết, tổng VND, trạng thái dịch', () => {
    renderWithProviders(<Table rows={[draftForm]} />)
    expect(screen.getByRole('link', { name: 'PN-0001' })).toHaveAttribute(
      'href',
      '/import-forms/if-1?warehouse=w-a',
    )
    expect(screen.getByText(/3\.750\.000/)).toBeInTheDocument()
    expect(screen.getByText('Nháp')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
  })

  it('CANCELLED / CONFIRMED hiện đúng nhãn', () => {
    renderWithProviders(
      <Table
        rows={[
          { ...draftForm, slug: 'a', status: 'CONFIRMED' },
          { ...draftForm, slug: 'b', code: 'PN-0002', status: 'CANCELLED' },
        ]}
      />,
    )
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument()
    expect(screen.getByText('Đã huỷ')).toBeInTheDocument()
  })
})
