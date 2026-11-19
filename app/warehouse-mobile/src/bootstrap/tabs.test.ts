import type { CurrentUser } from '@/entities/session'

import { hasBusinessTab, tabsFor } from './tabs'

const user = (scope: string[], roleName = 'MANAGER'): CurrentUser => ({
  userName: 'u',
  roleName,
  scope,
})

const ALL = ['IMPORT_FORM_READ', 'EXPORT_FORM_READ', 'MATERIAL_READ', 'WAREHOUSE_READ']

describe('tabsFor', () => {
  it('scope rỗng → chỉ có tab Tài khoản', () => {
    expect(tabsFor(user([]))).toEqual(['account'])
  })

  it('chưa có user → chỉ có tab Tài khoản', () => {
    expect(tabsFor(null)).toEqual(['account'])
  })

  it('đủ quyền → đủ 5 tab, thứ tự cố định overview, import, export, stock, account', () => {
    expect(tabsFor(user([...ALL].reverse()))).toEqual([
      'overview',
      'import',
      'export',
      'stock',
      'account',
    ])
  })

  it('có MATERIAL_READ mà thiếu WAREHOUSE_READ → không có tab Tồn kho', () => {
    expect(tabsFor(user(['MATERIAL_READ']))).toEqual(['account'])
    expect(tabsFor(user(['WAREHOUSE_READ']))).toEqual(['account'])
    expect(tabsFor(user(['MATERIAL_READ', 'WAREHOUSE_READ']))).toEqual([
      'overview',
      'stock',
      'account',
    ])
  })

  it('mỗi tab nghiệp vụ chỉ cần quyền đọc của nó; Tổng quan hiện khi có ít nhất một tab nghiệp vụ', () => {
    expect(tabsFor(user(['IMPORT_FORM_READ']))).toEqual(['overview', 'import', 'account'])
    expect(tabsFor(user(['EXPORT_FORM_READ']))).toEqual(['overview', 'export', 'account'])
  })

  it('SUPER_ADMIN scope rỗng → đủ 5 tab', () => {
    expect(tabsFor(user([], 'SUPER_ADMIN'))).toEqual([
      'overview',
      'import',
      'export',
      'stock',
      'account',
    ])
  })
})

describe('hasBusinessTab', () => {
  it('false khi chỉ có tab Tài khoản', () => {
    expect(hasBusinessTab(user([]))).toBe(false)
    expect(hasBusinessTab(null)).toBe(false)
  })

  it('Tổng quan không tính là tab nghiệp vụ (thiếu quyền thì vẫn về /no-access)', () => {
    expect(tabsFor(user(['USER_READ']))).toEqual(['account'])
    expect(hasBusinessTab(user(['USER_READ']))).toBe(false)
  })

  it('true khi có ít nhất một tab nghiệp vụ', () => {
    expect(hasBusinessTab(user(['EXPORT_FORM_READ']))).toBe(true)
  })
})
