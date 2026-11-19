import { fetchAllPages } from '@/shared/api/fetch-all-pages'
import { deleteData, getData, getPaginated, patchData, postData } from '@/shared/api/http'
import type { Paginated } from '@/shared/api/types'
import type { CatalogItem } from '@/shared/lib/catalog'
import { toMaterialSearch } from '../model/search'
import type {
  Material,
  MaterialInput,
  MaterialListParams,
  MaterialUpdateInput,
} from '../model/types'

export const MATERIAL_PAGE_SIZE = 30

/** Gộp tìm theo tên + mã (khuôn `fetchAvailableMaterials`): `name` trước, khử trùng trong trang. */
export async function fetchMaterialsPage({
  query,
  typeSlug,
  page,
}: MaterialListParams & { page: number }): Promise<Paginated<Material>> {
  const search = toMaterialSearch(query)
  if (search.kind === 'invalid') {
    return {
      items: [],
      total: 0,
      page,
      pageSize: MATERIAL_PAGE_SIZE,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false,
    }
  }
  const get = (extra: Record<string, string>) =>
    getPaginated<Material>('/materials', {
      page,
      size: MATERIAL_PAGE_SIZE,
      sortBy: 'code',
      sort: 'ASC',
      typeSlug,
      ...extra,
    })
  if (search.kind === 'all') return get({})

  const [byName, byCode] = await Promise.all([
    search.name ? get({ name: search.name }) : null,
    search.code ? get({ code: search.code }) : null,
  ])
  const results = [byName, byCode].filter((r): r is Paginated<Material> => r !== null)
  const seen = new Set<string>()
  const items = results
    .flatMap((r) => r.items)
    .filter((m) => {
      if (seen.has(m.slug)) return false
      seen.add(m.slug)
      return true
    })
  return {
    ...results[0],
    items,
    total: items.length,
    page,
    hasNext: results.some((r) => r.hasNext),
  }
}

/**
 * Vật tư của DANH MỤC có ĐÚNG mã `code` (không phân biệt hoa thường) hoặc `null`. `code` của API là lọc
 * TIỀN TỐ (mặc định sắp theo createdAt DESC) nên sắp theo mã tăng dần — mã chính xác đứng đầu — rồi lấy vài kết quả đầu rồi so chính xác; lỗi mạng / quyền → ném (nơi gọi quyết định).
 */
export async function fetchMaterialByCode(code: string): Promise<Material | null> {
  const wanted = code.trim().toUpperCase()
  const res = await getPaginated<Material>('/materials', {
    code: wanted,
    page: 1,
    size: 5,
    sortBy: 'code',
    sort: 'ASC',
  })
  return res.items.find((m) => m.code.trim().toUpperCase() === wanted) ?? null
}

export const fetchMaterial = (slug: string): Promise<Material> =>
  getData<Material>(`/materials/${slug}`)

export const createMaterial = (input: MaterialInput): Promise<Material> =>
  postData<Material>('/materials', input)

export const updateMaterial = (slug: string, input: MaterialUpdateInput): Promise<Material> =>
  patchData<Material>(`/materials/${slug}`, input)

export const deleteMaterial = (slug: string): Promise<void> =>
  deleteData<void>(`/materials/${slug}`)

export const fetchAvailableConversionUnits = (slug: string): Promise<CatalogItem[]> =>
  fetchAllPages<CatalogItem>(`/materials/${slug}/conversion-units/available`)

export const addConversionUnit = (
  slug: string,
  body: { unitSlug: string; conversionRate: number },
): Promise<Material> => postData<Material>(`/materials/${slug}/conversion-units`, body)

export const updateConversionUnit = (
  slug: string,
  unitSlug: string,
  body: { conversionRate: number },
): Promise<Material> => patchData<Material>(`/materials/${slug}/conversion-units/${unitSlug}`, body)

export const removeConversionUnit = (slug: string, unitSlug: string): Promise<void> =>
  deleteData<void>(`/materials/${slug}/conversion-units/${unitSlug}`)
