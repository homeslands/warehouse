import type { UseQueryResult } from '@tanstack/react-query'

import {
  createMaterialType,
  deleteMaterialType,
  materialTypeAbilities,
  materialTypeKeys,
  updateMaterialType,
  useMaterialType,
} from '@/entities/material-type'
import type { CurrentUser } from '@/entities/session'
import {
  createUnit,
  deleteUnit,
  unitAbilities,
  unitKeys,
  updateUnit,
  useUnit,
  type Unit,
} from '@/entities/unit'
import type { CatalogAbilities, CatalogItem } from '@/shared/lib/catalog'

import type { CatalogKind } from './catalog-form'

/** Bản ghi danh mục như sheet / màn chi tiết cần: mã + tên + mô tả + ngày tạo / cập nhật, kèm số vật tư đang dùng (chỉ Đơn vị có). */
export type CatalogRecord = CatalogItem & {
  createdAt?: string
  updatedAt?: string
  materialCount?: Unit['materialCount']
}

type WriteInput = { code?: string; name?: string; description?: string }

export type CatalogConfig = {
  abilities: (user: CurrentUser | null) => CatalogAbilities
  useItem: (slug: string | undefined) => UseQueryResult<CatalogRecord>
  create: (input: { code: string; name: string; description?: string }) => Promise<unknown>
  update: (slug: string, input: WriteInput) => Promise<unknown>
  remove: (slug: string) => Promise<unknown>
  /** Số vật tư đang dùng bản ghi (> 0 thì không xoá được; 0 cũng là "chưa biết" — BE vẫn chặn 100909). Loại vật tư: BE chặn khi xoá (lỗi 100609). */
  usageCount: (item: CatalogRecord) => number
  listKey: readonly unknown[]
  detailKey: (slug: string) => readonly unknown[]
  i18nPrefix: 'unit' | 'materialType'
  formRoute: '/unit-form' | '/material-type-form'
}

export const CATALOG_CONFIG: Record<CatalogKind, CatalogConfig> = {
  unit: {
    abilities: unitAbilities,
    useItem: useUnit,
    create: createUnit,
    update: updateUnit,
    remove: deleteUnit,
    usageCount: (item) => item.materialCount?.total ?? 0,
    listKey: unitKeys.list(),
    detailKey: unitKeys.detail,
    i18nPrefix: 'unit',
    formRoute: '/unit-form',
  },
  'material-type': {
    abilities: materialTypeAbilities,
    useItem: useMaterialType,
    create: createMaterialType,
    update: updateMaterialType,
    remove: deleteMaterialType,
    usageCount: () => 0,
    listKey: materialTypeKeys.list(),
    detailKey: materialTypeKeys.detail,
    i18nPrefix: 'materialType',
    formRoute: '/material-type-form',
  },
}
