import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { BACKEND_SUPPORTS } from '@/shared/api/backend-capabilities'
import { sortToParam, useClampPage, useListParams } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SearchInput } from '@/shared/ui/data-table/SearchInput'
import { DateRangeFilter } from '@/shared/ui/data-table/DateRangeFilter'
import { SelectFilter } from '@/shared/ui/data-table/SelectFilter'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { can, useAuthStore, useRoleLabel } from '@/entities/session'
import {
  assignableRoles,
  buildUserColumns,
  UserDetailSheet,
  useSetUserActive,
  useRoles,
  useUser,
  useUsers,
  userDisplayName,
  type User,
} from '@/entities/user'
import { useWarehouses } from '@/entities/warehouse'
import { ChangeUserRoleDialog } from '@/features/user-change-role'
import { UserFormSheet } from '@/features/user-form'
import { ToggleUserActiveDialog } from '@/features/user-toggle-active'
import { ResetPasswordDialog } from '@/features/user-reset-password'
import { hasAnyRowAbility, isSelf, userAbilities } from '../model/abilities'
import { toUserSearchQuery } from '../model/search-query'

// `search` / `isActive` / `warehouseSlug` / `startDate` / `endDate` chỉ gửi khi cờ `userSearch` bật.
const FILTERS = z.object({
  roleSlug: z.string().optional(),
  isActive: z.stringbool().optional(),
  // Một ô tìm kiếm trên URL; khi gửi đi tách thành `name` / `phonenumber` (`toUserSearchQuery`).
  search: z.string().optional(),
  warehouseSlug: z.string().optional(),
  // Ngày tạo tài khoản. Sai định dạng trên URL → bỏ riêng khoá đó (`useListParams`).
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
})

/** URL sửa tay ngược chiều → đảo lại thay vì để backend trả 400 (100422). `YYYY-MM-DD` so sánh được như chuỗi. */
function toCreatedRange(startDate?: string, endDate?: string) {
  const [from, to] =
    startDate && endDate && startDate > endDate ? [endDate, startDate] : [startDate, endDate]
  return { ...(from ? { startDate: from } : {}), ...(to ? { endDate: to } : {}) }
}

export function UsersPage() {
  const { t } = useTranslation(['users', 'common'])
  const me = useAuthStore((s) => s.user)
  const roleLabel = useRoleLabel()

  // MANAGER không có ROLE_READ: không gọi /roles (chắc chắn 403), luật cấp lùi về bảng vai trò có sẵn.
  const readRoles = can(me, 'ROLE_READ')
  const rolesQuery = useRoles({ enabled: readRoles })
  const roles = readRoles ? rolesQuery.data : undefined
  const ability = useMemo(() => userAbilities(me, roles, BACKEND_SUPPORTS), [me, roles])
  const assignable = useMemo(() => (me && roles ? assignableRoles(me, roles) : []), [me, roles])

  const { page, size, filters, sort, setPage, setSize, setFilters, setSort } =
    useListParams(FILTERS)
  const readWarehouses = can(me, 'WAREHOUSE_READ')
  // Ô lọc kho: MANAGER/SUPERVISOR nhận về đúng kho của mình (backend lọc), ADMIN nhận toàn bộ.
  const warehousesQuery = useWarehouses(
    { page: 1, size: 100 },
    { enabled: ability.search && readWarehouses },
  )
  const { data, isPending, error, isPlaceholderData } = useUsers({
    page,
    size,
    // Cờ riêng `userSort`, không dùng `sort` chung (Kho/Cửa hàng chưa có).
    sort: BACKEND_SUPPORTS.userSort ? sortToParam(sort) : undefined,
    ...(ability.filterByRole && filters.roleSlug ? { roleSlug: filters.roleSlug } : {}),
    ...(ability.search ? toUserSearchQuery(filters.search) : {}),
    ...(ability.search && filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(ability.search && readWarehouses && filters.warehouseSlug
      ? { warehouseSlug: filters.warehouseSlug }
      : {}),
    ...(ability.search ? toCreatedRange(filters.startDate, filters.endDate) : {}),
  })
  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<User | undefined>(undefined)
  const [resetting, setResetting] = useState<User | null>(null)
  const [changingRole, setChangingRole] = useState<User | null>(null)
  const [toggling, setToggling] = useState<User | null>(null)
  // Sheet chi tiết: slug trên URL (`?user=`) — gửi link / F5 / Back mở lại đúng người, kể cả người không nằm ở
  // trang đang xem. `useListParams` giữ nguyên khoá lạ nên đổi trang / lọc không làm mất nó.
  const [searchParams, setSearchParams] = useSearchParams()
  const viewingSlug = searchParams.get('user')
  const setViewingSlug = useCallback(
    (slug: string | null) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (slug === null) next.delete('user')
          else next.set('user', slug)
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )
  const setActive = useSetUserActive()
  const openEdit = useCallback((user: User) => {
    setEditing(user)
    setFormOpen(true)
  }, [])

  const selfCheck = useCallback((user: User) => isSelf(me, user), [me])
  // Phạm vi do backend lọc (WMS-13-be: dưới ADMIN chỉ thấy manager + thành viên các kho mình thuộc về) — hiện
  // đúng những gì trả về. Người ngang/cao hơn cùng kho vẫn hiện nhưng không có thao tác (luật cấp ở `ability.row`).
  const rows = data?.items
  // Dòng của danh sách hiện ngay làm placeholder; `GET /users/{slug}` nạp bản mới (và người ngoài trang hiện tại).
  const detail = useUser(viewingSlug, {
    placeholderData: rows?.find((user) => user.slug === viewingSlug),
  })
  const viewing = viewingSlug === null ? null : (detail.data ?? null)
  const openDetail = useCallback((user: User) => setViewingSlug(user.slug), [setViewingSlug])
  // Không dòng nào có thao tác → không dựng cột, thay vì một cột toàn ô trống.
  const hasRowActions = (rows ?? []).some((user) => hasAnyRowAbility(ability.row(user)))

  const columns = useMemo<ColumnDef<User>[]>(() => {
    const base = buildUserColumns(t, { roleLabel, isSelf: selfCheck, onOpen: openDetail })
    if (!hasRowActions) return base

    const actions: ColumnDef<User> = {
      id: 'actions',
      header: t('users:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => {
        const user = row.original
        const can_ = ability.row(user)
        if (!hasAnyRowAbility(can_)) return null

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('users:rowActions', { name: userDisplayName(user) })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {can_.edit && (
                <DropdownMenuItem onSelect={() => openEdit(user)}>
                  {t('users:editAction')}
                </DropdownMenuItem>
              )}
              {can_.changeRole && (
                <DropdownMenuItem onSelect={() => setChangingRole(user)}>
                  {t('users:changeRoleAction')}
                </DropdownMenuItem>
              )}
              {can_.resetPassword && (
                <DropdownMenuItem onSelect={() => setResetting(user)}>
                  {t('users:resetPasswordAction')}
                </DropdownMenuItem>
              )}
              {can_.toggleActive && (
                <DropdownMenuItem
                  variant={user.isActive ? 'destructive' : 'default'}
                  onSelect={() => setToggling(user)}
                >
                  {user.isActive ? t('users:lockAction') : t('users:unlockAction')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }
    return [...base, actions]
  }, [t, roleLabel, selfCheck, hasRowActions, ability, openDetail, openEdit])

  // Chân sheet chi tiết: đúng các thao tác của menu ⋯ trên dòng đó, cùng luật quyền `ability.row`.
  const viewingCan = viewing ? ability.row(viewing) : null
  const detailActions = viewing && viewingCan && hasAnyRowAbility(viewingCan) && (
    <>
      {viewingCan.toggleActive && (
        <Button
          variant={viewing.isActive ? 'destructive' : 'outline'}
          onClick={() => setToggling(viewing)}
        >
          {viewing.isActive ? t('users:lockAction') : t('users:unlockAction')}
        </Button>
      )}
      {viewingCan.resetPassword && (
        <Button variant="outline" onClick={() => setResetting(viewing)}>
          {t('users:resetPasswordAction')}
        </Button>
      )}
      {viewingCan.changeRole && (
        <Button variant="outline" onClick={() => setChangingRole(viewing)}>
          {t('users:changeRoleAction')}
        </Button>
      )}
      {viewingCan.edit && (
        <Button onClick={() => openEdit(viewing)}>{t('users:editAction')}</Button>
      )}
    </>
  )

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('users:title')}</h1>

      <ListToolbar
        onClearFilters={() =>
          setFilters({
            roleSlug: undefined,
            isActive: undefined,
            warehouseSlug: undefined,
            startDate: undefined,
            endDate: undefined,
          })
        }
        activeFilterCount={
          [
            filters.roleSlug,
            filters.isActive !== undefined,
            filters.warehouseSlug,
            filters.startDate || filters.endDate,
          ].filter(Boolean).length
        }
        search={
          ability.search && (
            <SearchInput
              value={filters.search ?? ''}
              onChange={(value) => setFilters({ search: value === '' ? undefined : value })}
              placeholder={t('users:searchPlaceholder')}
            />
          )
        }
        filters={
          <>
            {ability.filterByRole && (
              <SelectFilter
                label={t('users:columnRole')}
                value={filters.roleSlug ?? ''}
                onChange={(value) => setFilters({ roleSlug: value === '' ? undefined : value })}
                options={[
                  { value: '', label: t('users:roleAll') },
                  ...(roles ?? []).map((role) => ({
                    value: role.slug,
                    label: roleLabel(role.name),
                  })),
                ]}
              />
            )}
            {ability.search && (
              <SelectFilter
                label={t('users:columnStatus')}
                value={filters.isActive === undefined ? '' : String(filters.isActive)}
                onChange={(value) =>
                  setFilters({ isActive: value === '' ? undefined : value === 'true' })
                }
                options={[
                  { value: '', label: t('users:statusAll') },
                  { value: 'true', label: t('users:active') },
                  { value: 'false', label: t('users:inactive') },
                ]}
              />
            )}
            {ability.search && readWarehouses && (
              <SelectFilter
                label={t('users:columnWarehouses')}
                value={filters.warehouseSlug ?? ''}
                onChange={(value) =>
                  setFilters({ warehouseSlug: value === '' ? undefined : value })
                }
                options={[
                  { value: '', label: t('users:warehouseAll') },
                  ...(warehousesQuery.data?.items ?? []).map((w) => ({
                    value: w.slug,
                    label: w.name,
                  })),
                ]}
              />
            )}
            {ability.search && (
              <DateRangeFilter
                label={t('users:columnCreatedAt')}
                value={{ from: filters.startDate, to: filters.endDate }}
                onChange={({ from, to }) => setFilters({ startDate: from, endDate: to })}
              />
            )}
          </>
        }
        actions={
          ability.create && (
            <Button
              // `GET /roles` chưa xong (hoặc lỗi) → ô chọn vai trò trong sheet rỗng, không submit
              // được — khoá nút thay vì để mở một form chắc chắn không dùng nổi.
              disabled={!rolesQuery.isSuccess}
              onClick={() => {
                setEditing(undefined)
                setFormOpen(true)
              }}
            >
              <PlusIcon aria-hidden />
              {/* Mobile: chỉ còn dấu ＋ để ô tìm cùng hàng không bị cắt chữ; tên nút vẫn đọc được. */}
              <span className="max-md:sr-only">{t('users:create')}</span>
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isPending}
        error={error}
        onRowClick={openDetail}
        sorting={BACKEND_SUPPORTS.userSort ? { value: sort, onChange: setSort } : undefined}
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

      {/* Khai TRƯỚC các hộp thao tác: hộp mở từ chân sheet phải nằm trên sheet. */}
      <UserDetailSheet
        open={viewingSlug !== null}
        user={viewing ?? undefined}
        error={detail.error}
        onOpenChange={(open) => !open && setViewingSlug(null)}
        roleLabel={roleLabel}
        isSelf={selfCheck}
        actions={detailActions || undefined}
      />

      <UserFormSheet open={formOpen} onOpenChange={setFormOpen} user={editing} roles={assignable} />

      <ResetPasswordDialog user={resetting} onOpenChange={(open) => !open && setResetting(null)} />

      <ChangeUserRoleDialog
        user={changingRole}
        roles={assignable}
        onOpenChange={(open) => !open && setChangingRole(null)}
      />

      <ToggleUserActiveDialog
        user={toggling}
        onOpenChange={(open) => !open && setToggling(null)}
        isPending={setActive.isPending}
        onConfirm={(user) =>
          setActive.mutate(
            { slug: user.slug, isActive: !user.isActive },
            { onSuccess: () => setToggling(null) },
          )
        }
      />
    </div>
  )
}
