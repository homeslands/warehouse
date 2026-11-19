import { SEARCH_CODE_REGEX } from '@/shared/lib/code'
import type { MaterialSearch } from './types'

/** Cắt `s` trước ký tự ĐẦU TIÊN không khớp `allowed` (tìm theo phần đầu). */
function leadingPart(s: string, allowed: RegExp): string {
  let end = 0
  for (const ch of s) {
    if (!allowed.test(ch)) break
    end += ch.length
  }
  return s.slice(0, end)
}

const TEXT_CHAR = /^[\p{L}\p{M}\p{N}\s]$/u
const CODE_CHAR = /^[A-Z0-9_-]$/

export function toMaterialSearch(query: string): MaterialSearch {
  const q = query.trim()
  if (q === '') return { kind: 'all' }
  const name = leadingPart(q, TEXT_CHAR).trim()
  const codePart = leadingPart(q.toUpperCase(), CODE_CHAR)
  const code = SEARCH_CODE_REGEX.test(codePart) ? codePart : ''
  if (name === '' && code === '') return { kind: 'invalid' }
  return { kind: 'search', ...(name && { name }), ...(code && { code }) }
}
