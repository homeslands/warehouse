import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import {
  buildConversionUnitColumns,
  useConversionUnits,
  type Material,
  type MaterialConversionUnit,
} from '@/entities/material'
import { ConversionUnitDialog } from '@/features/material-conversion-unit-form'
import { DetachConversionUnitDialog } from '@/features/material-conversion-unit-detach'

type Props = {
  material: Pick<Material, 'slug' | 'baseUnit'>
  /** Gắn / sửa tỉ lệ / gỡ (`MATERIAL_UPDATE` + `UNIT_UPDATE` + `UNIT_READ`). */
  canManage: boolean
}

/**
 * Bảng đơn vị quy đổi ở trang chi tiết vật tư. Dòng đơn vị gốc (`isBaseUnit`) luôn có trong danh sách và KHÔNG có
 * thao tác (backend chặn sửa tỉ lệ 100721 / gỡ 100722). Vật tư chưa có đơn vị gốc → không gọi API.
 */
export function MaterialConversionUnits({ material, canManage }: Props) {
  const { t } = useTranslation(['materials', 'common'])
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MaterialConversionUnit | null>(null)
  const [detaching, setDetaching] = useState<MaterialConversionUnit | null>(null)

  const baseUnitCode = material.baseUnit?.code ?? null
  const { data, isPending, error, isPlaceholderData } = useConversionUnits(
    material.slug,
    { page, size },
    { enabled: baseUnitCode !== null },
  )

  // Gỡ dòng cuối của trang cuối → kéo về trang cuối còn lại.
  const totalPages = data?.totalPages
  useEffect(() => {
    if (totalPages !== undefined && page > Math.max(1, totalPages)) setPage(Math.max(1, totalPages))
  }, [totalPages, page])

  const columns = useMemo<ColumnDef<MaterialConversionUnit>[]>(() => {
    const base = buildConversionUnitColumns(t, baseUnitCode ?? '')
    if (!canManage) return base
    const actions: ColumnDef<MaterialConversionUnit> = {
      id: 'actions',
      header: t('materials:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) =>
        row.original.isBaseUnit ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('materials:conversionRowActions', { unit: row.original.unitCode })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setEditing(row.original)
                  setDialogOpen(true)
                }}
              >
                {t('materials:editRateMenu')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDetaching(row.original)}>
                {t('materials:detachMenu')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
    }
    return [...base, actions]
  }, [t, baseUnitCode, canManage])

  return (
    <section className="space-y-3" aria-labelledby="material-conversions-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="material-conversions-title" className="text-base font-semibold">
            {t('materials:conversionsTitle')}
          </h2>
          {baseUnitCode && (
            <p className="text-muted-foreground text-sm">
              {t('materials:conversionsDescription', { unit: baseUnitCode })}
            </p>
          )}
        </div>
        {canManage && baseUnitCode && (
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <PlusIcon aria-hidden />
            {/* Mobile: chỉ còn dấu ＋; tên nút vẫn đọc được. */}
            <span className="max-md:sr-only">{t('materials:addConversion')}</span>
          </Button>
        )}
      </div>

      {baseUnitCode === null ? (
        <p className="bg-card text-muted-foreground rounded-xl border p-6 text-sm">
          {t('materials:noBaseUnit')}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items}
          isLoading={isPending}
          error={error}
          emptyText={t('materials:noConversions')}
          pagination={{
            page: data?.page ?? page,
            size,
            total: data?.total ?? 0,
            totalPages: data?.totalPages ?? 0,
            onPageChange: setPage,
            // Đổi số dòng = về trang 1 (như `useListParams`), không gửi `page` cũ với `size` mới.
            onSizeChange: (next) => {
              setSize(next)
              setPage(1)
            },
            isFetching: isPlaceholderData,
          }}
        />
      )}

      {/* Luôn mount khi có quyền: callback của mutation bị bỏ qua nếu hộp unmount giữa chừng. */}
      {canManage && baseUnitCode && (
        <>
          <ConversionUnitDialog
            material={{ slug: material.slug, baseUnitCode }}
            open={dialogOpen}
            editing={editing}
            onOpenChange={setDialogOpen}
          />
          <DetachConversionUnitDialog
            materialSlug={material.slug}
            unit={detaching}
            onOpenChange={(open) => !open && setDetaching(null)}
          />
        </>
      )}
    </section>
  )
}
