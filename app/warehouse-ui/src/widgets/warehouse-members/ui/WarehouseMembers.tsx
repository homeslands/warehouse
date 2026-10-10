import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useAuthStore, useRoleLabel } from '@/entities/session'
import {
  UserDetailSheet,
  buildUserColumns,
  isSameUser,
  useUser,
  useUsers,
  userDisplayName,
  type User,
} from '@/entities/user'
import { AddWarehouseMemberDialog } from '@/features/warehouse-member-add'
import { RemoveWarehouseMemberDialog } from '@/features/warehouse-member-remove'

const KEEP = new Set(['name', 'phonenumber', 'role', 'status'])

type Props = {
  warehouse: { slug: string; name: string }
  /** Có thêm/gỡ thành viên không. `false` → không nút Thêm, không cột thao tác. */
  canManage: boolean
}

/** Khối "Thành viên" của trang chi tiết kho: `GET /users?warehouseSlug=` + thêm/gỡ. */
export function WarehouseMembers({ warehouse, canManage }: Props) {
  const { t } = useTranslation(['warehouses', 'common'])
  const { t: tUsers } = useTranslation(['users', 'common'])
  const roleLabel = useRoleLabel()
  const me = useAuthStore((s) => s.user)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<User | null>(null)
  // Bấm thành viên → cùng sheet chi tiết của màn Người dùng, chỉ xem (thao tác trên người dùng ở `/users`).
  const [viewingSlug, setViewingSlug] = useState<string | null>(null)

  const { data, isPending, error, isPlaceholderData } = useUsers({
    page,
    size,
    warehouseSlug: warehouse.slug,
  })

  // Gỡ người cuối của trang cuối → trang hiện tại không còn: kéo về trang cuối còn lại.
  const totalPages = data?.totalPages
  useEffect(() => {
    if (totalPages !== undefined && page > Math.max(1, totalPages)) setPage(Math.max(1, totalPages))
  }, [totalPages, page])

  const detail = useUser(viewingSlug, {
    placeholderData: data?.items.find((u) => u.slug === viewingSlug),
  })

  const isSelf = (u: User) => isSameUser(me, u)
  const openDetail = (u: User) => setViewingSlug(u.slug)
  const columns: ColumnDef<User>[] = buildUserColumns(tUsers, {
    roleLabel,
    isSelf,
    onOpen: openDetail,
  }).filter((c) => KEEP.has(c.id ?? ('accessorKey' in c ? String(c.accessorKey) : '')))
  if (canManage) {
    columns.push({
      id: 'actions',
      header: tUsers('users:actions'),
      meta: { compactHeader: true },
      // Cùng dạng với mọi bảng khác: thao tác nằm trong menu ⋯, không phải nút chữ trên dòng.
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tUsers('users:rowActions', { name: userDisplayName(row.original) })}
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(row.original)}>
              {t('warehouses:removeMemberMenu')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('warehouses:sectionMembers')}</h2>
        {canManage && <Button onClick={() => setAdding(true)}>{t('warehouses:addMember')}</Button>}
      </div>
      <DataTable
        columns={columns}
        data={data?.items}
        isLoading={isPending}
        error={error}
        emptyText={t('warehouses:noMembers')}
        onRowClick={openDetail}
        pagination={{
          page: data?.page ?? page,
          size,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: setPage,
          onSizeChange: setSize,
          isFetching: isPlaceholderData,
        }}
      />
      <UserDetailSheet
        open={viewingSlug !== null}
        user={viewingSlug === null ? undefined : detail.data}
        error={detail.error}
        onOpenChange={(open) => !open && setViewingSlug(null)}
        roleLabel={roleLabel}
        isSelf={isSelf}
      />
      {canManage && (
        <>
          <AddWarehouseMemberDialog
            warehouse={adding ? warehouse : null}
            onOpenChange={(open) => !open && setAdding(false)}
          />
          <RemoveWarehouseMemberDialog
            warehouseSlug={warehouse.slug}
            member={removing}
            onOpenChange={(open) => !open && setRemoving(null)}
          />
        </>
      )}
    </section>
  )
}
