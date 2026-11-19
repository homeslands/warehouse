import { parseLabel } from './parse-label'

export type MatchResult<T extends { materialCode: string } = { materialCode: string }> =
  { kind: 'found'; item: T } | { kind: 'none'; text: string }

/**
 * So mã vừa quét với mã vật tư NỘI BỘ (`materialCode`) của danh sách (tồn kho, hoặc các dòng của
 * một phiếu): khớp chính xác sau khi trim, không phân biệt hoa thường. Nhiều phần tử cùng mã thì
 * trả phần tử ĐẦU TIÊN. Giai đoạn 1 không tra mã EAN của nhà sản xuất (đã chốt, spec §8). Nhãn
 * `<MÃ>*<SERIAL>`: nguyên chuỗi khớp một mã (mã có `*`) thì lấy luôn, không thì so bằng phần Mã
 * (`parseLabel`); `none.text` vẫn là chuỗi gốc đã trim.
 */
export function matchCode<T extends { materialCode: string }>(
  scanned: string,
  items: T[],
): MatchResult<T> {
  const text = scanned.trim()
  const item = findByCode(text, items) ?? findByCode(parseLabel(text).code, items)
  return item ? { kind: 'found', item } : { kind: 'none', text }
}

/** Phần tử đầu tiên có `materialCode` bằng `code` (trim, không phân biệt hoa thường); mã rỗng → không. */
function findByCode<T extends { materialCode: string }>(code: string, items: T[]): T | undefined {
  const key = code.trim().toUpperCase()
  if (key === '') return undefined
  return items.find((i) => i.materialCode.trim().toUpperCase() === key)
}
