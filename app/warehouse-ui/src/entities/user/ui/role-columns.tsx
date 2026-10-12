import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import { isBuiltInRole } from '../model/role-level'
import type { Role } from '../model/types'

/**
 * Cột bảng vai trò. `roleLabel` (nhãn vi/en của vai trò có sẵn) và vai trò của người đang đăng nhập do page
 * truyền vào — entity không được import `entities/session`. Cột thao tác do page thêm.
 */
export function buildRoleColumns(
  t: TFunction<readonly ['roles', 'common']>,
  opts: { roleLabel: (name: string) => string; currentRoleName?: string },
): ColumnDef<Role>[] {
  return [
    {
      accessorKey: 'name',
      header: t('roles:columnName'),
      cell: ({ row }) => {
        const { name } = row.original
        const builtIn = isBuiltInRole(name)
        return (
          <span className="flex max-w-64 min-w-32 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 font-medium break-words whitespace-normal">
                {builtIn ? opts.roleLabel(name) : name}
              </span>
              {builtIn && <Badge variant="secondary">{t('roles:builtInBadge')}</Badge>}
              {name === opts.currentRoleName && (
                <Badge variant="outline">{t('roles:meBadge')}</Badge>
              )}
            </span>
            {builtIn && <span className="text-muted-foreground text-xs">{name}</span>}
          </span>
        )
      },
    },
    {
      accessorKey: 'level',
      header: t('roles:columnLevel'),
      cell: ({ row }) =>
        row.original.level === undefined ? (
          <EmptyValue />
        ) : (
          <span className="tabular-nums">{formatNumber(row.original.level)}</span>
        ),
    },
    {
      accessorKey: 'description',
      header: t('roles:columnDescription'),
      meta: { hideBelow: '@2xl' },
      cell: ({ row }) =>
        row.original.description ? (
          <span
            title={row.original.description}
            className="line-clamp-2 max-w-80 min-w-40 break-words whitespace-normal"
          >
            {row.original.description}
          </span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      id: 'authorities',
      header: t('roles:columnAuthorities'),
      meta: { hideBelow: '@sm' },
      cell: ({ row }) => (
        <span className="tabular-nums">{formatNumber(row.original.authorityCodes.length)}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: t('roles:columnCreatedAt'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) =>
        row.original.createdAt ? formatDateTime(row.original.createdAt) : <EmptyValue />,
    },
  ]
}
