import type { QueryClient } from '@tanstack/react-query'
import { importFormKeys } from '@/entities/import-form'
import { materialKeys } from '@/entities/material'
import { unitKeys } from '@/entities/unit'

/** Làm mới mọi cache bị ảnh hưởng sau khi ghi vật tư / đơn vị quy đổi. */
export async function invalidateAfterMaterialWrite(qc: QueryClient, slug?: string): Promise<void> {
  const tasks: Promise<void>[] = [
    qc.invalidateQueries({ queryKey: materialKeys.lists() }),
    qc.invalidateQueries({ queryKey: unitKeys.list() }),
    qc.invalidateQueries({ queryKey: ['inventory'] }),
    qc.invalidateQueries({
      queryKey: importFormKeys.all,
      predicate: (q) => q.queryKey[2] === 'available',
    }),
  ]
  if (slug !== undefined) {
    tasks.push(
      qc.invalidateQueries({ queryKey: materialKeys.detail(slug) }),
      qc.invalidateQueries({ queryKey: materialKeys.available(slug) }),
    )
  }
  await Promise.all(tasks)
}
