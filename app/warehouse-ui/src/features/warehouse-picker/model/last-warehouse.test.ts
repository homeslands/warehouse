import { afterEach, describe, expect, it, vi } from 'vitest'
import { recallWarehouse, rememberWarehouse, resolveWarehouse } from './last-warehouse'

const list = [{ slug: 'w-a' }, { slug: 'w-b' }]

describe('resolveWarehouse', () => {
  it('URL hợp lệ thắng', () => {
    expect(resolveWarehouse(list, 'w-b', 'w-a')).toBe('w-b')
  })
  it('URL sai / thiếu → kho nhớ nếu còn trong danh sách', () => {
    expect(resolveWarehouse(list, 'w-x', 'w-b')).toBe('w-b')
    expect(resolveWarehouse(list, undefined, 'w-b')).toBe('w-b')
  })
  it('kho nhớ không còn → kho đầu tiên', () => {
    expect(resolveWarehouse(list, undefined, 'w-gone')).toBe('w-a')
  })
  it('danh sách rỗng → undefined', () => {
    expect(resolveWarehouse([], 'w-a', 'w-a')).toBeUndefined()
  })
})

describe('recall / remember', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })
  it('ghi rồi đọc lại', () => {
    rememberWarehouse('w-b')
    expect(recallWarehouse()).toBe('w-b')
  })
  it('localStorage ném lỗi (private mode) → không vỡ, trả null', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => rememberWarehouse('w-a')).not.toThrow()
    expect(recallWarehouse()).toBeNull()
  })
})
