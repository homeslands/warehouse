import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { toCodeOrNameQuery } from '@/shared/lib/code'
import { formatNumber } from '@/shared/lib/format'
import { useClampPage, useListParams } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { CodeOrNameEmpty } from '@/shared/ui/data-table/CodeOrNameEmpty'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SearchInput } from '@/shared/ui/data-table/SearchInput'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemHint,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useAuthStore } from '@/entities/session'
import { buildUnitColumns, useUnits, type Unit } from '@/entities/unit'
import { DeleteUnitDialog } from '@/features/unit-delete'
import { UnitFormSheet } from '@/features/unit-form'
import { unitAbilities } from '../model/abilities'

// Trên URL chỉ có chữ người dùng gõ (+ cách tìm tự chọn khi đoán sai); `code` / `name` suy ra lúc gọi.
const FILTERS = z.object({
  search: z.string().optional(),
  searchBy: z.enum(['code', 'name']).optional(),
})

export function UnitsPage() {
  const { t } = useTranslation(['units', 'common'])
  const user = useAuthStore((s) => s.user)
  const ability = unitAbilities(user)

  const { page, size, filters, setPage, setSize, setFilters } = useListParams(FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Unit | undefined>(undefined)
  const [deleting, setDeleting] = useState<Unit | null>(null)

  const searchQuery = toCodeOrNameQuery(filters.search, filters.searchBy)
  const { data, isPending, error, isPlaceholderData } = useUnits({ page, size, ...searchQuery })
  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  const hasActions = ability.update || ability.delete
  const columns = useMemo<ColumnDef<Unit>[]>(() => {
    const base = buildUnitColumns(t)
    if (!hasActions) return base
    const actions: ColumnDef<Unit> = {
      id: 'actions',
      header: t('units:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => {
        const unit = row.original
        const inUse = unit.materialCount.total > 0
        const hintId = `unit-delete-hint-${unit.slug}`
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('units:rowActions', { name: unit.name })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ability.update && (
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(unit)
                    setFormOpen(true)
                  }}
                >
                  {t('units:editAction')}
                </DropdownMenuItem>
              )}
              {ability.update && ability.delete && <DropdownMenuSeparator />}
              {ability.delete && (
                <>
                  <DropdownMenuItem
                    variant="destructive"
                    // Backend chặn xoá khi còn vật tư dùng (100909) — khoá sẵn khi đã biết.
                    disabled={inUse}
                    aria-describedby={inUse ? hintId : undefined}
                    onSelect={() => setDeleting(unit)}
                  >
                    {t('units:deleteMenu')}
                  </DropdownMenuItem>
                  {inUse && (
                    <DropdownMenuItemHint id={hintId}>
                      {t('units:deleteBlocked', { total: formatNumber(unit.materialCount.total) })}
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
  }, [t, hasActions, ability.update, ability.delete])

  let emptyText: ReactNode = t('units:empty')
  if (searchQuery.code !== undefined || searchQuery.name !== undefined) {
    const searchedBy = searchQuery.code !== undefined ? 'code' : 'name'
    emptyText = (
      <CodeOrNameEmpty
        message={
          searchedBy === 'code'
            ? t('units:searchEmptyCode', { value: searchQuery.code })
            : t('units:searchEmptyName', { value: searchQuery.name })
        }
        searchedBy={searchedBy}
        search={filters.search}
        onSwitch={(field) => setFilters({ searchBy: field })}
      />
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('units:title')}</h1>

      <ListToolbar
        search={
          <SearchInput
            value={filters.search ?? ''}
            // Gõ lại = đoán lại từ đầu: bỏ cách tìm đã chọn lần trước.
            onChange={(value) =>
              setFilters({ search: value === '' ? undefined : value, searchBy: undefined })
            }
            placeholder={t('units:searchPlaceholder')}
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
              <span className="max-md:sr-only">{t('units:create')}</span>
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        emptyText={emptyText}
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
      <UnitFormSheet open={formOpen} onOpenChange={setFormOpen} unit={editing} />
      <DeleteUnitDialog unit={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </div>
  )
}
