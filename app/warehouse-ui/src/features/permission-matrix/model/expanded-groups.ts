/**
 * Nhóm quyền đang MỞ ở màn `/permissions` (mặc định gập hết). Chỉ là tiện ích theo trình duyệt — đọc / ghi hỏng
 * (chế độ riêng tư, bị chặn site data, dữ liệu sai dạng) thì coi như gập hết, không bao giờ làm vỡ màn.
 */
export const EXPANDED_GROUPS_KEY = 'warehouse.permissions.expandedGroups'

export function readExpandedGroups(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(EXPANDED_GROUPS_KEY) ?? '[]')
    return Array.isArray(parsed) && parsed.every((name) => typeof name === 'string') ? parsed : []
  } catch {
    return []
  }
}

export function writeExpandedGroups(names: Iterable<string>): void {
  try {
    localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify([...names]))
  } catch {
    // Không nhớ được thì thôi — trạng thái trong phiên vẫn đúng.
  }
}
