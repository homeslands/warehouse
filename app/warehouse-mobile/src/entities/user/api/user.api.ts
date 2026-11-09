import { getPaginated } from '@/shared/api/http'

import { fullName } from '../model/person'
import type { UserOption } from '../model/types'

/** Một trang kết quả cho ô chọn người — không phân trang, người cần tìm thì gõ thêm (như web). */
export const USER_SEARCH_PAGE_SIZE = 20

type UserResponse = {
  slug: string
  phonenumber: string
  firstName?: string | null
  lastName?: string | null
}

/**
 * Backend tìm tên (`name`) và SĐT (`phonenumber`) riêng: toàn chữ số (bỏ khoảng trắng) → `phonenumber`,
 * còn lại → `name`. Giống `PersonFilter` của web.
 */
export function userSearchParams(text: string): { name?: string; phonenumber?: string } {
  const term = text.trim()
  if (term === '') return {}
  const digits = term.replace(/\s+/g, '')
  return /^\d+$/.test(digits) ? { phonenumber: digits } : { name: term }
}

/** `GET /users` trang 1 (cần `USER_READ`). */
export async function fetchUserOptions(search: string): Promise<UserOption[]> {
  const res = await getPaginated<UserResponse>('/users', {
    page: 1,
    size: USER_SEARCH_PAGE_SIZE,
    ...userSearchParams(search),
  })
  return res.items.map((u) => ({ slug: u.slug, name: fullName(u), phonenumber: u.phonenumber }))
}
