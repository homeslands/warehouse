import { describe, expect, it } from 'vitest'
import { cn } from '@/shared/lib/cn'

describe('cn', () => {
  it('ghép các class thường', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('bỏ class falsy', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c')
  })

  it('class tailwind sau ghi đè class trước cùng nhóm', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
