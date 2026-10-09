export type SupplierDetailTab = 'materials' | 'transactions'

/**
 * `?tab=` trên URL → tab hợp lệ, `null` khi không tab nào hiện (trang chỉ còn Hồ sơ). Tab Vật tư cần
 * MATERIAL_READ; tab Giao dịch cần backend mở API (`supplierTransactions`).
 */
export function resolveDetailTab(
  raw: string | null,
  visible: { materials: boolean; transactions: boolean },
): SupplierDetailTab | null {
  if (raw === 'transactions' && visible.transactions) return 'transactions'
  if (visible.materials) return 'materials'
  return visible.transactions ? 'transactions' : null
}
