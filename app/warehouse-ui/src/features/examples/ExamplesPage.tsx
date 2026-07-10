import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
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
import type { Example } from './api'
import { exampleColumns } from './columns'
import { DeleteExampleDialog } from './DeleteExampleDialog'
import { ExampleFormDialog } from './ExampleFormDialog'
import { useCreateExample, useDeleteExample, useExamples, useUpdateExample } from './hooks'

const PAGE_SIZE = 10

export function ExamplesPage() {
  const user = useAuthStore((s) => s.user)
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
    if (!canWrite) return exampleColumns

    const actionsColumn: ColumnDef<Example> = {
      id: 'actions',
      header: 'Thao tác',
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
            Sửa
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleting(row.original)}>
            Xoá
          </Button>
        </div>
      ),
    }

    return [...exampleColumns, actionsColumn]
  }, [canWrite])

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isError) return <p className="text-red-600">{error.message}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Examples</h1>
        {canWrite && (
          <Button
            onClick={() => {
              setEditing(undefined)
              setFormOpen(true)
            }}
          >
            Tạo example
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
                <TableCell colSpan={columns.length}>Đang tải...</TableCell>
              </TableRow>
            )}

            {!isPending && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length}>Chưa có dữ liệu.</TableCell>
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
        <span className="text-sm text-slate-500">
          Trang {data?.page ?? page} / {data?.totalPages ?? 1} — {data?.total ?? 0} bản ghi
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.hasPrevious}
          onClick={() => setPage((p) => p - 1)}
        >
          Trang trước
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          Trang sau
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
