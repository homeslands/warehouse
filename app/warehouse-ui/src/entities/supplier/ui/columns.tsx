import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import { formatDateTime } from '@/shared/lib/format'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import type { Supplier, SupplierMaterial } from '../model/types'

/** Đường dẫn trang chi tiết do tầng page cấp — entity không biết route của app. */
export type DetailLink<T> = (row: T) => { to: string; state?: unknown }

/**
 * Cột danh sách nhà cung cấp. Khung bảng hẹp ẩn cột phụ (`meta.hideBelow`, theo container);
 * chuỗi do người nhập (tên, người liên hệ, email) được xuống dòng thay vì làm bảng tràn.
 */
export function buildSupplierColumns(
  t: TFunction<readonly ['suppliers', 'common']>,
  options: { detailLink?: DetailLink<Supplier> } = {},
): ColumnDef<Supplier>[] {
  const { detailLink } = options
  return [
    {
      accessorKey: 'code',
      header: t('suppliers:columnCode'),
      meta: { sortField: 'code', hideBelow: '@sm' },
    },
    {
      accessorKey: 'name',
      header: t('suppliers:columnName'),
      meta: { sortField: 'name' },
      cell: ({ row }) => {
        const { name, code } = row.original
        // Khung hẹp ẩn cột Mã → hiện mã ở dòng phụ dưới tên để vẫn nhận ra nhà cung cấp.
        const subCode = (
          <span className="text-muted-foreground block text-xs @sm:hidden">{code}</span>
        )
        if (!detailLink)
          return (
            <>
              <span className="block max-w-64 min-w-40 whitespace-normal">{name}</span>
              {subCode}
            </>
          )
        const { to, state } = detailLink(row.original)
        return (
          <>
            <Link
              to={to}
              state={state}
              className="block max-w-64 min-w-40 font-medium break-words whitespace-normal underline-offset-4 hover:underline"
            >
              {name}
            </Link>
            {subCode}
          </>
        )
      },
    },
    {
      accessorKey: 'taxCode',
      header: t('suppliers:columnTaxCode'),
      meta: { sortField: 'taxCode', hideBelow: '@2xl' },
      cell: ({ row }) => row.original.taxCode || <EmptyValue />,
    },
    {
      accessorKey: 'phonenumber',
      header: t('suppliers:columnPhonenumber'),
      meta: { sortField: 'phonenumber', hideBelow: '@sm' },
      cell: ({ row }) => row.original.phonenumber || <EmptyValue />,
    },
    {
      accessorKey: 'contactPerson',
      header: t('suppliers:columnContactPerson'),
      meta: { hideBelow: '@2xl' },
      cell: ({ row }) =>
        row.original.contactPerson ? (
          <span className="block max-w-48 min-w-36 whitespace-normal">
            {row.original.contactPerson}
          </span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      accessorKey: 'email',
      header: t('suppliers:columnEmail'),
      // Bảng 8 cột cần ~1140px: laptop 1280–1400 có sidebar (khung 974–1094px) bỏ email rồi ngày tạo trước, đừng
      // để bảng cuộn ngang và cột Thao tác (ghim phải) che mất cột cuối.
      meta: { hideBelow: '@5xl' },
      cell: ({ row }) =>
        row.original.email ? (
          <span className="block max-w-60 min-w-40 break-words whitespace-normal">
            {row.original.email}
          </span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      accessorKey: 'createdAt',
      header: t('suppliers:columnCreatedAt'),
      meta: { sortField: 'createdAt', hideBelow: '@6xl' },
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}

/** Cột vật tư của một nhà cung cấp (tab Vật tư ở trang chi tiết). Cột thao tác do tầng trên thêm. */
export function buildSupplierMaterialColumns(
  t: TFunction<readonly ['suppliers', 'common']>,
): ColumnDef<SupplierMaterial>[] {
  return [
    { accessorKey: 'code', header: t('suppliers:columnCode') },
    {
      accessorKey: 'name',
      header: t('suppliers:columnName'),
      cell: ({ row }) => (
        <span className="block max-w-64 min-w-40 whitespace-normal">{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'typeName',
      header: t('suppliers:columnMaterialType'),
      meta: { hideBelow: '@2xl' },
      cell: ({ row }) => row.original.typeName || <EmptyValue />,
    },
    {
      accessorKey: 'baseUnitName',
      header: t('suppliers:columnBaseUnit'),
      meta: { hideBelow: '@2xl' },
      cell: ({ row }) => row.original.baseUnitName || <EmptyValue />,
    },
    {
      // Ngày tạo VẬT TƯ (không phải ngày gắn với NCC) — chính là trường bộ lọc khoảng ngày của tab dùng.
      accessorKey: 'createdAt',
      header: t('suppliers:columnCreatedAt'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}
