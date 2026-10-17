import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { toCodeOrNameQuery } from '@/shared/lib/code'
import { BACKEND_SUPPORTS } from '@/shared/api/backend-capabilities'
import { sortToParam, useClampPage, useListParams } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { CodeOrNameEmpty } from '@/shared/ui/data-table/CodeOrNameEmpty'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SearchInput } from '@/shared/ui/data-table/SearchInput'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import {
  buildMaterialTypeColumns,
  useMaterialTypes,
  type MaterialType,
} from '@/entities/material-type'
import { useAuthStore } from '@/entities/session'
import { DeleteMaterialTypeDialog } from '@/features/material-type-delete'
import { MaterialTypeFormSheet } from '@/features/material-type-form'
import { materialTypeAbilities } from '../model/abilities'

// Trên URL chỉ có chữ người dùng gõ (+ cách tìm tự chọn khi đoán sai); `code` / `name` suy ra lúc gọi.
const FILTERS = z.object({
  search: z.string().optional(),
  searchBy: z.enum(['code', 'name']).optional(),
})

/** Trường backend cho phép sắp xếp (cột khai `sortField` ở entity). */
const MATERIAL_TYPE_SORT_FIELDS = ['createdAt', 'name', 'code'] as const

export function MaterialTypesPage() {
  const { t } = useTranslation(['materialTypes', 'common'])
  const user = useAuthStore((s) => s.user)
  const ability = materialTypeAbilities(user)

  const { page, size, filters, sort, setPage, setSize, setFilters, setSort } = useListParams(FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MaterialType | undefined>(undefined)
  const [deleting, setDeleting] = useState<MaterialType | null>(null)

  const searchQuery = toCodeOrNameQuery(filters.search, filters.searchBy)
  const { data, isPending, error, isPlaceholderData } = useMaterialTypes({
    page,
    size,
    ...(BACKEND_SUPPORTS.materialTypeSort ? sortToParam(sort, MATERIAL_TYPE_SORT_FIELDS) : {}),
    ...searchQuery,
  })
  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  const hasActions = ability.update || ability.delete
  const columns = useMemo<ColumnDef<MaterialType>[]>(() => {
    const base = buildMaterialTypeColumns(t)
    if (!hasActions) return base
    const actions: ColumnDef<MaterialType> = {
      id: 'actions',
      header: t('materialTypes:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => {
        const type = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('materialTypes:rowActions', { name: type.name })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ability.update && (
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(type)
                    setFormOpen(true)
                  }}
                >
                  {t('materialTypes:editAction')}
                </DropdownMenuItem>
              )}
              {ability.update && ability.delete && <DropdownMenuSeparator />}
              {ability.delete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(type)}>
                  {t('materialTypes:deleteMenu')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }
    return [...base, actions]
  }, [t, hasActions, ability.update, ability.delete])

  let emptyText: ReactNode = t('materialTypes:empty')
  if (searchQuery.code !== undefined || searchQuery.name !== undefined) {
    const searchedBy = searchQuery.code !== undefined ? 'code' : 'name'
    emptyText = (
      <CodeOrNameEmpty
        message={
          searchedBy === 'code'
            ? t('materialTypes:searchEmptyCode', { value: searchQuery.code })
            : t('materialTypes:searchEmptyName', { value: searchQuery.name })
        }
        searchedBy={searchedBy}
        search={filters.search}
        onSwitch={(field) => setFilters({ searchBy: field })}
      />
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('materialTypes:title')}</h1>

      <ListToolbar
        search={
          <SearchInput
            value={filters.search ?? ''}
            // Gõ lại = đoán lại từ đầu: bỏ cách tìm đã chọn lần trước.
            onChange={(value) =>
              setFilters({ search: value === '' ? undefined : value, searchBy: undefined })
            }
            placeholder={t('materialTypes:searchPlaceholder')}
          />
        }
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
              <span className="max-md:sr-only">{t('materialTypes:create')}</span>
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        emptyText={emptyText}
        sorting={BACKEND_SUPPORTS.materialTypeSort ? { value: sort, onChange: setSort } : undefined}
        data={data?.items}
        isLoading={isPending}
        error={error}
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

      {/* Luôn mount, điều khiển bằng state: callback của mutation bị bỏ qua nếu hộp unmount. */}
      <MaterialTypeFormSheet open={formOpen} onOpenChange={setFormOpen} materialType={editing} />
      <DeleteMaterialTypeDialog
        materialType={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  )
}
