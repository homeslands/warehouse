import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { toCodeOrNameQuery } from '@/shared/lib/code'
import { useClampPage, useListParams } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { CodeOrNameEmpty } from '@/shared/ui/data-table/CodeOrNameEmpty'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SearchInput } from '@/shared/ui/data-table/SearchInput'
import { SelectFilter } from '@/shared/ui/data-table/SelectFilter'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import {
  buildMaterialColumns,
  useMaterials,
  type Material,
  type MaterialFilters,
} from '@/entities/material'
import { useMaterialTypeOptions } from '@/entities/material-type'
import { useAuthStore } from '@/entities/session'
import { DeleteMaterialDialog } from '@/features/material-delete'
import { MaterialFormSheet } from '@/features/material-form'
import { materialAbilities } from '../model/abilities'

// `search` là chữ người dùng gõ (→ `code`/`name` lúc gọi, `searchBy` khi người dùng tự đổi); `typeSlug` đi thẳng.
const FILTERS = z.object({
  search: z.string().optional(),
  searchBy: z.enum(['code', 'name']).optional(),
  typeSlug: z.string().optional(),
}) satisfies z.ZodType<Pick<MaterialFilters, 'typeSlug'>>

export function MaterialsPage() {
  const { t } = useTranslation(['materials', 'common'])
  const location = useLocation()
  const navigate = useNavigate()
  // Gửi kèm link tới trang chi tiết: nút "Quay lại danh sách" ở đó đọc lại đúng trang/bộ lọc này.
  const backTo = location.pathname + location.search
  const detailLink = useCallback(
    (m: Material) => ({ to: `/materials/${m.slug}`, state: { backTo } }),
    [backTo],
  )
  const user = useAuthStore((s) => s.user)
  const ability = materialAbilities(user)

  const { page, size, filters, setPage, setSize, setFilters } = useListParams(FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Material | undefined>(undefined)
  const [deleting, setDeleting] = useState<Material | null>(null)

  const types = useMaterialTypeOptions()
  const searchQuery = toCodeOrNameQuery(filters.search, filters.searchBy)
  const { data, isPending, error, isPlaceholderData } = useMaterials({
    page,
    size,
    typeSlug: filters.typeSlug,
    ...searchQuery,
  })
  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  const columns = useMemo<ColumnDef<Material>[]>(() => {
    const actions: ColumnDef<Material> = {
      id: 'actions',
      header: t('materials:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => {
        const material = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('materials:rowActions', { name: material.name })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  const { to, state } = detailLink(material)
                  navigate(to, { state })
                }}
              >
                {t('materials:viewDetail')}
              </DropdownMenuItem>
              {ability.update && (
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(material)
                    setFormOpen(true)
                  }}
                >
                  {t('materials:editAction')}
                </DropdownMenuItem>
              )}
              {ability.delete && <DropdownMenuSeparator />}
              {ability.delete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(material)}>
                  {t('materials:deleteMenu')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }
    return [...buildMaterialColumns(t, { detailLink }), actions]
  }, [t, detailLink, navigate, ability.update, ability.delete])

  // Trống: nói rõ đã tìm theo mã hay tên (kèm "trong loại đang lọc" khi có lọc loại) và cho đổi cách tìm.
  let emptyText: ReactNode = filters.typeSlug ? t('common:noResults') : t('materials:empty')
  if (searchQuery.code !== undefined || searchQuery.name !== undefined) {
    const searchedBy = searchQuery.code !== undefined ? 'code' : 'name'
    const inType = Boolean(filters.typeSlug)
    emptyText = (
      <CodeOrNameEmpty
        message={
          searchedBy === 'code'
            ? t(inType ? 'materials:searchEmptyCodeInType' : 'materials:searchEmptyCode', {
                value: searchQuery.code,
              })
            : t(inType ? 'materials:searchEmptyNameInType' : 'materials:searchEmptyName', {
                value: searchQuery.name,
              })
        }
        searchedBy={searchedBy}
        search={filters.search}
        onSwitch={(field) => setFilters({ searchBy: field })}
      />
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('materials:title')}</h1>

      <ListToolbar
        search={
          <SearchInput
            value={filters.search ?? ''}
            // Gõ lại = đoán lại từ đầu: bỏ cách tìm đã chọn lần trước.
            onChange={(value) =>
              setFilters({ search: value === '' ? undefined : value, searchBy: undefined })
            }
            placeholder={t('materials:searchPlaceholder')}
          />
        }
        filters={
          <SelectFilter
            label={t('materials:filterType')}
            value={filters.typeSlug ?? ''}
            onChange={(value) => setFilters({ typeSlug: value === '' ? undefined : value })}
            options={[
              { value: '', label: t('materials:typeAll') },
              ...(types.data?.items ?? []).map((x) => ({
                value: x.slug,
                label: `${x.code} · ${x.name}`,
              })),
            ]}
          />
        }
        activeFilterCount={filters.typeSlug ? 1 : 0}
        onClearFilters={() => setFilters({ typeSlug: undefined })}
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
              <span className="max-md:sr-only">{t('materials:create')}</span>
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        emptyText={emptyText}
        onRowClick={(row) => {
          const { to, state } = detailLink(row)
          navigate(to, { state })
        }}
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
      <MaterialFormSheet open={formOpen} onOpenChange={setFormOpen} material={editing} />
      <DeleteMaterialDialog
        material={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  )
}
