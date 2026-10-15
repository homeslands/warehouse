import { render, screen } from '@testing-library/react'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { buildMaterialColumns } from './columns'
import type { Material } from '../model/types'

const legacy: Material = {
  slug: 'm-1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  code: 'VT-01',
  name: 'Xi măng',
  minimumInventory: 0,
  maximumInventory: 12.5,
  type: { slug: 'mt-1', code: 'MT-01', name: 'Vật liệu' },
  baseUnit: null,
  hasSupplier: false,
  suppliers: [],
  warehouses: [],
}

function Table({ rows }: { rows: Material[] }) {
  const { t } = useTranslation(['materials', 'common'])
  const table = useReactTable({
    data: rows,
    columns: buildMaterialColumns(t),
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

describe('buildMaterialColumns', () => {
  it('vật tư cũ chưa có đơn vị gốc (`baseUnit: null`) → "Chưa có"; ngưỡng giữ số lẻ', () => {
    render(<Table rows={[legacy, { ...legacy, slug: 'm-2' }]} />)
    expect(screen.getAllByText('Chưa có')).toHaveLength(2)
    expect(screen.getAllByText('12,5')).toHaveLength(2)
  })

  it('dữ liệu xấu: mã / đơn vị gốc dài xuống dòng tại dấu gạch; tên và loại không khoảng trắng được ngắt', () => {
    const code = 'XM-PCB40-HATIEN-50KG-LO-2026-10A'
    const unitCode = 'THUNG-24CHAI-500ML-PET-XK-202601'
    const name = 'ỐngNhựaPVCBìnhMinhPhi114x4,9mmClass3TiêuChuẩnISO1452'
    const typeName = 'HoáChấtTẩyRửaCôngNghiệpNồngĐộCaoKhôngPhaLoãng'
    render(
      <Table
        rows={[
          {
            ...legacy,
            code,
            name,
            type: { ...legacy.type, name: typeName },
            baseUnit: { slug: 'u-x', code: unitCode, name: 'Thùng' },
          },
        ]}
      />,
    )

    expect(screen.getAllByText(code).find((el) => el.className.includes('@sm:hidden'))).toHaveClass(
      'break-words',
      'whitespace-normal',
    )
    const codeCell = screen.getAllByText(code).find((el) => !el.className.includes('@sm:hidden'))
    expect(codeCell).toHaveClass('whitespace-normal', 'break-words')
    expect(screen.getByText(unitCode)).toHaveClass('whitespace-normal', 'break-words')
    expect(screen.getByText(name)).toHaveClass('break-words')
    expect(screen.getByText(typeName)).toHaveClass('break-words')
  })
})
