import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemHint,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useAuthStore, useRoleLabel } from '@/entities/session'
import {
  buildRoleColumns,
  isBuiltInRole,
  sortRolesByLevel,
  useRoles,
  type Role,
} from '@/entities/user'
import { DeleteRoleDialog } from '@/features/role-delete'
import { RoleFormSheet } from '@/features/role-form'
import { canActOnRole, roleAbilities } from '../model/abilities'

export function RolesPage() {
  const { t } = useTranslation(['roles', 'common'])
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const roleLabel = useRoleLabel()
  const ability = roleAbilities(user)
  const { data, isPending, error } = useRoles()
  // Không phân trang: vài chục vai trò là cùng; cấp cao trước, cùng thứ tự cột ma trận phân quyền.
  const roles = useMemo(() => sortRolesByLevel(data ?? []), [data])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Role | undefined>(undefined)
  const [deleting, setDeleting] = useState<Role | null>(null)

  const columns = useMemo<ColumnDef<Role>[]>(() => {
    const base = buildRoleColumns(t, { roleLabel, currentRoleName: user?.roleName })
    // Dòng ngang / cao hơn mình (gồm dòng của chính mình): không có nút ⋯ — backend chặn mọi thao tác (100104).
    const itemsFor = (role: Role) => {
      if (!canActOnRole(user, role, roles)) return null
      const items = {
        edit: ability.update,
        permissions: ability.openPermissions,
        remove: ability.delete,
      }
      return items.edit || items.permissions || items.remove ? items : null
    }
    if (!roles.some((role) => itemsFor(role) !== null)) return base

    const actions: ColumnDef<Role> = {
      id: 'actions',
      header: t('roles:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => {
        const role = row.original
        const items = itemsFor(role)
        if (items === null) return null
        const builtIn = isBuiltInRole(role.name)
        const hintId = `role-delete-hint-${role.slug}`
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('roles:rowActions', {
                  name: builtIn ? roleLabel(role.name) : role.name,
                })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {items.edit && (
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(role)
                    setFormOpen(true)
                  }}
                >
                  {t('roles:editAction')}
                </DropdownMenuItem>
              )}
              {items.permissions && (
                <DropdownMenuItem onSelect={() => navigate('/permissions')}>
                  {t('roles:openPermissions')}
                </DropdownMenuItem>
              )}
              {items.remove && (items.edit || items.permissions) && <DropdownMenuSeparator />}
              {items.remove && (
                <>
                  <DropdownMenuItem
                    variant="destructive"
                    // Backend chặn xoá vai trò có sẵn (100105) — khoá sẵn kèm lý do.
                    disabled={builtIn}
                    aria-describedby={builtIn ? hintId : undefined}
                    onSelect={() => setDeleting(role)}
                  >
                    {t('roles:deleteMenu')}
                  </DropdownMenuItem>
                  {builtIn && (
                    <DropdownMenuItemHint id={hintId}>
                      {t('roles:deleteBuiltInHint')}
                    </DropdownMenuItemHint>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }
    return [...base, actions]
  }, [t, roleLabel, user, roles, ability.update, ability.delete, ability.openPermissions, navigate])

  return (
    <div className="space-y-4">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{t('roles:title')}</h1>
        <p className="text-muted-foreground text-sm">{t('roles:description')}</p>
      </div>

      <ListToolbar
        actions={
          ability.create && (
            <Button
              onClick={() => {
                setEditing(undefined)
                setFormOpen(true)
              }}
            >
              <PlusIcon aria-hidden />
              {/* Mobile: chỉ còn dấu ＋; tên nút vẫn đọc được. */}
              <span className="max-md:sr-only">{t('roles:create')}</span>
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={data === undefined ? undefined : roles}
        isLoading={isPending}
        error={error}
        emptyText={t('roles:empty')}
      />

      {/* Luôn mount, điều khiển bằng state: callback của mutation bị bỏ qua nếu sheet / hộp unmount. */}
      <RoleFormSheet open={formOpen} onOpenChange={setFormOpen} role={editing} roles={data ?? []} />
      <DeleteRoleDialog
        role={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        canViewUsers={ability.viewUsers}
      />
    </div>
  )
}
