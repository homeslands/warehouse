import { formatPhone } from '@/shared/lib/phone'

import type { UserOption } from './types'

/** Họ tên theo thứ tự tiếng Việt (họ trước): `{ lastName: 'Nguyễn', firstName: 'Văn A' }` → "Nguyễn Văn A". */
export function fullName(person: { firstName?: string | null; lastName?: string | null }): string {
  return [person.lastName, person.firstName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}

/** Nhãn hiển thị một người: tên; chưa khai tên → số điện thoại (định dạng). */
export function personLabel(user: UserOption): string {
  return user.name || formatPhone(user.phonenumber)
}
