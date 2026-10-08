import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  useSetUserActive,
  useRoles,
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
  const setActive = useSetUserActive()

  const selfCheck = useCallback((user: User) => isSelf(me, user), [me])
  // TẠM: backend chưa lọc `GET /users` theo phạm vi — người dưới ADMIN chỉ thấy mình + người cấp thấp hơn
  // (`ability.visible`). Phân trang vẫn theo backend nên một trang có thể ít dòng hơn số dòng mỗi trang.
  const rows = useMemo(() => data?.items.filter((user) => ability.visible(user)), [data, ability])
  const hiddenCount = (data?.items.length ?? 0) - (rows?.length ?? 0)
  // Không dòng nào có thao tác → không dựng cột, thay vì một cột toàn ô trống.
  const hasRowActions = (rows ?? []).some((user) => hasAnyRowAbility(ability.row(user)))

  const columns = useMemo<ColumnDef<User>[]>(() => {
    const base = buildUserColumns(t, { roleLabel, isSelf: selfCheck })
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
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(user)
                    setFormOpen(true)
                  }}
                >
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
  }, [t, roleLabel, selfCheck, hasRowActions, ability])

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
      {hiddenCount > 0 && <p className="text-muted-foreground text-sm">{t('users:rowsHidden')}</p>}

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
