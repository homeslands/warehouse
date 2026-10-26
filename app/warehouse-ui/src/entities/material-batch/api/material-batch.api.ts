import { getPaginated } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type { MaterialBatch, MaterialBatchFilters } from '../model/types'

/** Lô luôn lồng dưới kho: `/warehouses/:warehouseSlug/material-batches`. */
const base = (warehouseSlug: string) => `/warehouses/${warehouseSlug}/material-batches`

export const fetchMaterialBatches = (
  warehouseSlug: string,
  params: ListParams<MaterialBatchFilters>,
): Promise<Paginated<MaterialBatch>> => getPaginated<MaterialBatch>(base(warehouseSlug), params)
