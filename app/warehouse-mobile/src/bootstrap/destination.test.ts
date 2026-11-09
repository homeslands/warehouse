import type { CurrentUser } from '@/entities/session'

import { destinationFor, hrefFor } from './destination'

const user = (scope: string[]): CurrentUser => ({ userName: 'u', roleName: 'MANAGER', scope })
const reader = user(['IMPORT_FORM_READ'])
const nobody = user([])

describe('destinationFor', () => {
  it('loading → splash', () => {
    expect(destinationFor('loading', null, null)).toBe('splash')
  })

  it('offline → offline', () => {
    expect(destinationFor('offline', null, null)).toBe('offline')
  })

  it('unauthenticated → login (kể cả khi store kho còn dữ liệu cũ)', () => {
    expect(destinationFor('unauthenticated', 'selected', null)).toBe('login')
  })

  it('authenticated nhưng kho chưa resolve xong → splash', () => {
    expect(destinationFor('authenticated', null, reader)).toBe('splash')
  })

  it('authenticated, kho none → noWarehouse', () => {
    expect(destinationFor('authenticated', 'none', reader)).toBe('noWarehouse')
  })

  it('authenticated, kho choose → select-warehouse (kể cả khi không có tab nghiệp vụ)', () => {
    expect(destinationFor('authenticated', 'choose', reader)).toBe('select-warehouse')
    expect(destinationFor('authenticated', 'choose', nobody)).toBe('select-warehouse')
  })

  it('authenticated, kho selected, không có tab nghiệp vụ → noAccess', () => {
    expect(destinationFor('authenticated', 'selected', nobody)).toBe('noAccess')
  })

  it('authenticated, kho selected, có tab nghiệp vụ → tabs', () => {
    expect(destinationFor('authenticated', 'selected', reader)).toBe('tabs')
  })

  it('authenticated, tải danh sách kho lỗi (ADMIN+) → select-warehouse (màn đó có Thử lại), không phải no-access', () => {
    expect(destinationFor('authenticated', 'error', reader)).toBe('select-warehouse')
    expect(destinationFor('authenticated', 'error', nobody)).toBe('select-warehouse')
  })
})

describe('hrefFor', () => {
  it('mỗi đích có route riêng; tabs → tab đầu tiên user được thấy', () => {
    expect(hrefFor('login', null)).toBe('/login')
    expect(hrefFor('select-warehouse', reader)).toBe('/select-warehouse')
    expect(hrefFor('noWarehouse', reader)).toBe('/no-access')
    expect(hrefFor('noAccess', nobody)).toBe('/no-access')
    expect(hrefFor('tabs', reader)).toBe('/import')
    expect(hrefFor('tabs', user(['MATERIAL_READ', 'WAREHOUSE_READ']))).toBe('/stock')
  })

  it('splash / offline không phải route', () => {
    expect(hrefFor('splash', null)).toBeNull()
    expect(hrefFor('offline', null)).toBeNull()
  })
})
