import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useClampPage, useListParams } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { useAuthStore, hasRole } from '@/entities/session'
import {
  buildExampleColumns,
  useDeleteExample,
  useExamples,
  type Example,
} from '@/entities/example'
import { DeleteExampleDialog } from '@/features/example-delete'
import { ExampleFormDialog } from '@/features/example-form'

// Backend Example không lọc theo gì — schema rỗng, URL chỉ mang trang và số dòng.
const FILTERS = z.object({})

export function ExamplesPage() {
  const user = useAuthStore((s) => s.user)
  const { t } = useTranslation(['examples', 'common'])
  // Gác bằng hasRole, KHÔNG bằng can(): backend chặn bằng @HasRoles(Admin, SuperAdmin),
  // và can() luôn trả false vì không authority nào được seed.
  const canWrite = hasRole(user, 'ADMIN', 'SUPER_ADMIN')

  const { page, size, filters, setPage, setSize } = useListParams(FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Example | undefined>(undefined)
  const [deleting, setDeleting] = useState<Example | null>(null)

  const { data, isPending, error, isPlaceholderData } = useExamples({ page, size, ...filters })
  const remove = useDeleteExample()

  // Dữ liệu giữ chỗ là của trang khác — không dùng nó để tính trang hợp lệ.
  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  const columns = useMemo<ColumnDef<Example>[]>(() => {
    const base = buildExampleColumns(t)
    if (!canWrite) return base

    const actionsColumn: ColumnDef<Example> = {
      id: 'actions',
      header: t('examples:actions'),
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(row.original)
              setFormOpen(true)
            }}
          >
            {t('examples:editAction')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleting(row.original)}>
            {t('examples:deleteAction')}
          </Button>
        </div>
      ),
    }

    return [...base, actionsColumn]
  }, [canWrite, t])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('examples:title')}</h1>
        {canWrite && (
          <Button
            onClick={() => {
              setEditing(undefined)
              setFormOpen(true)
            }}
          >
            {t('examples:create')}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
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

      <ExampleFormDialog open={formOpen} onOpenChange={setFormOpen} example={editing} />

      <DeleteExampleDialog
        example={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        isPending={remove.isPending}
        onConfirm={(slug) => remove.mutate(slug, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  )
}
