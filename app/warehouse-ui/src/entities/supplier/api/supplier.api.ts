import { deleteData, getData, getPaginated, patchData, postData, putData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type {
  Supplier,
  SupplierFilters,
  SupplierInput,
  SupplierMaterial,
  SupplierMaterialFilters,
  SupplierTransaction,
  SupplierTransactionFilters,
  SupplierTransactionInput,
  SupplierUpdateInput,
} from '../model/types'

export const fetchSuppliers = (params: ListParams<SupplierFilters>): Promise<Paginated<Supplier>> =>
  getPaginated<Supplier>('/suppliers', params)

export const fetchSupplier = (slug: string): Promise<Supplier> =>
  getData<Supplier>(`/suppliers/${slug}`)

export const createSupplier = (input: SupplierInput): Promise<Supplier> =>
  postData<Supplier>('/suppliers', input)

export const updateSupplier = (slug: string, input: SupplierUpdateInput): Promise<Supplier> =>
  patchData<Supplier>(`/suppliers/${slug}`, input)

/** Xoá mềm; backend chặn khi còn vật tư (101211). Trả câu thông báo. */
export const removeSupplier = (slug: string): Promise<string> =>
  deleteData<string>(`/suppliers/${slug}`)

export const fetchSupplierMaterials = (
  slug: string,
  params: ListParams<SupplierMaterialFilters>,
): Promise<Paginated<SupplierMaterial>> =>
  getPaginated<SupplierMaterial>(`/suppliers/${slug}/materials`, params)

/** Gắn vật tư vào nhà cung cấp — `PUT` không body. */
export const attachSupplierMaterial = (
  slug: string,
  materialSlug: string,
): Promise<SupplierMaterial> =>
  putData<SupplierMaterial>(`/suppliers/${slug}/materials/${materialSlug}`)

export const detachSupplierMaterial = (slug: string, materialSlug: string): Promise<string> =>
  deleteData<string>(`/suppliers/${slug}/materials/${materialSlug}`)

export const fetchSupplierTransactions = (
  slug: string,
  params: ListParams<SupplierTransactionFilters>,
): Promise<Paginated<SupplierTransaction>> =>
  getPaginated<SupplierTransaction>(`/suppliers/${slug}/transactions`, params)

export const createSupplierTransaction = (
  slug: string,
  input: SupplierTransactionInput,
): Promise<SupplierTransaction> =>
  postData<SupplierTransaction>(`/suppliers/${slug}/transactions`, input)
