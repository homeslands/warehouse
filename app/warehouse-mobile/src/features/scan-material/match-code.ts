export type MatchResult<T extends { materialCode: string } = { materialCode: string }> =
  { kind: 'found'; item: T } | { kind: 'none'; text: string }

/**
 * So mã vừa quét với mã vật tư NỘI BỘ (`materialCode`) của danh sách (tồn kho, hoặc các dòng của
 * một phiếu): khớp chính xác sau khi trim, không phân biệt hoa thường. Nhiều phần tử cùng mã thì
 * trả phần tử ĐẦU TIÊN. Giai đoạn 1 không tra mã EAN của nhà sản xuất (đã chốt, spec §8).
 */
export function matchCode<T extends { materialCode: string }>(
  scanned: string,
  items: T[],
): MatchResult<T> {
  const text = scanned.trim()
  const key = text.toUpperCase()
  const item = items.find((i) => i.materialCode.trim().toUpperCase() === key)
  return item ? { kind: 'found', item } : { kind: 'none', text }
}
