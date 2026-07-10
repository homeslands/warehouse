import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuthStore } from '@/shared/auth/auth.store'
import { hasRole } from '@/shared/auth/permissions'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import type { Example } from './api'
import { buildExampleColumns } from './columns'
import { DeleteExampleDialog } from './DeleteExampleDialog'
import { ExampleFormDialog } from './ExampleFormDialog'
import { useCreateExample, useDeleteExample, useExamples, useUpdateExample } from './hooks'

const PAGE_SIZE = 10

export function ExamplesPage() {
  const user = useAuthStore((s) => s.user)
  const { t } = useTranslation(['examples', 'common'])
  // Gác bằng hasRole, KHÔNG bằng can(): backend chặn bằng @HasRoles(Admin, SuperAdmin),
  // và can() luôn trả false vì không authority nào được seed.
  const canWrite = hasRole(user, 'ADMIN', 'SUPER_ADMIN')

  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Example | undefined>(undefined)
  const [deleting, setDeleting] = useState<Example | null>(null)

  const { data, isPending, isError, error } = useExamples(page, PAGE_SIZE)
  const create = useCreateExample()
  const update = useUpdateExample()
  const remove = useDeleteExample()

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

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isError) return <p className="text-destructive">{resolveApiErrorMessage(error)}</p>

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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={columns.length}>{t('common:loading')}</TableCell>
              </TableRow>
            )}

            {!isPending && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length}>{t('examples:empty')}</TableCell>
              </TableRow>
            )}

            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.original.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-muted-foreground text-sm">
          {t('examples:pageInfo', {
            page: data?.page ?? page,
            totalPages: data?.totalPages ?? 1,
            total: data?.total ?? 0,
          })}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.hasPrevious}
          onClick={() => setPage((p) => p - 1)}
        >
          {t('examples:prevPage')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('examples:nextPage')}
        </Button>
      </div>

      <ExampleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        example={editing}
        isPending={create.isPending || update.isPending}
        onSubmit={(input) => {
          const onSuccess = () => setFormOpen(false)
          if (editing) update.mutate({ slug: editing.slug, input }, { onSuccess })
          else create.mutate(input, { onSuccess })
        }}
      />

      <DeleteExampleDialog
        example={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        isPending={remove.isPending}
        onConfirm={(slug) => remove.mutate(slug, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  )
}
