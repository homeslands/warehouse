import { describe, expect, it } from 'vitest'
import { resolveDetailTab } from './detail-tab'

describe('resolveDetailTab', () => {
  const both = { materials: true, members: true }
  it('mặc định Vật tư', () => expect(resolveDetailTab(null, both)).toBe('materials'))
  it('?tab=members khi có quyền', () => expect(resolveDetailTab('members', both)).toBe('members'))
  it('?tab=members mà không có quyền → Vật tư', () =>
    expect(resolveDetailTab('members', { materials: true, members: false })).toBe('materials'))
  it('?tab=materials mà không có quyền → Thành viên', () =>
    expect(resolveDetailTab('materials', { materials: false, members: true })).toBe('members'))
  it('giá trị lạ → tab hợp lệ đầu tiên', () =>
    expect(resolveDetailTab('xyz', both)).toBe('materials'))
  it('không tab nào → null', () =>
    expect(resolveDetailTab(null, { materials: false, members: false })).toBeNull())
})
