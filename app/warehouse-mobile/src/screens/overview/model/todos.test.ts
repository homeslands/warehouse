import type { CurrentUser } from '@/entities/session'

import { STOCK_HREF, overviewTodos, type TodoKey } from './todos'

const user = (scope: string[], roleName = 'STAFF'): CurrentUser => ({
  userName: 'a',
  roleName,
  scope,
})
const keys = (u: CurrentUser | null, counts = {}) => overviewTodos(u, counts).map((t) => t.key)
const find = (u: CurrentUser | null, key: TodoKey, counts = {}) =>
  overviewTodos(u, counts).find((t) => t.key === key)!

describe('overviewTodos', () => {
  it('SUPER_ADMIN scope rỗng thấy đủ 5 ô đúng thứ tự (chờ duyệt lên vị trí 2; hạn dùng là thẻ riêng)', () => {
    expect(keys(user([], 'SUPER_ADMIN'))).toEqual([
      'importDraft',
      'exportPending',
      'exportDraft',
      'stockLow',
      'stockHigh',
    ])
  })

  it('chỉ EXPORT_FORM_READ → hai dòng xuất; tone chờ duyệt theo quyền duyệt', () => {
    const read = user(['EXPORT_FORM_READ'])
    expect(keys(read)).toEqual(['exportPending', 'exportDraft'])
    expect(find(read, 'exportPending', { exportPending: { count: 2, failed: false } }).tone).toBe(
      'default',
    )
    const confirm = user(['EXPORT_FORM_READ', 'EXPORT_FORM_CONFIRM'])
    expect(
      find(confirm, 'exportPending', { exportPending: { count: 2, failed: false } }).tone,
    ).toBe('accent')
  })

  it('tồn cần cả MATERIAL_READ và WAREHOUSE_READ', () => {
    expect(keys(user(['MATERIAL_READ']))).toEqual([])
    expect(keys(user(['MATERIAL_READ', 'WAREHOUSE_READ']))).toEqual(['stockLow', 'stockHigh'])
  })

  it('count 0 hoặc chưa có → muted, vẫn nằm trong danh sách', () => {
    const u = user(['IMPORT_FORM_READ'])
    expect(find(u, 'importDraft', { importDraft: { count: 0, failed: false } }).tone).toBe('muted')
    expect(find(u, 'importDraft').tone).toBe('muted')
    expect(find(u, 'importDraft').count).toBeUndefined()
  })

  it('tone theo bảng khi count > 0', () => {
    const u = user([], 'SUPER_ADMIN')
    const counts = {
      importDraft: { count: 1, failed: false },
      exportDraft: { count: 2, failed: false },
      stockLow: { count: 6, failed: false },
      stockHigh: { count: 3, failed: false },
    }
    expect(find(u, 'importDraft', counts).tone).toBe('accent')
    expect(find(u, 'exportDraft', counts).tone).toBe('default')
    expect(find(u, 'stockLow', counts).tone).toBe('warning')
    expect(find(u, 'stockHigh', counts).tone).toBe('info')
  })

  it('lỗi giữ cờ failed và tone muted', () => {
    const t = find(user([], 'SUPER_ADMIN'), 'stockLow', { stockLow: { failed: true } })
    expect(t).toMatchObject({ failed: true, tone: 'muted' })
  })

  it('href khớp bảng', () => {
    const u = user([], 'SUPER_ADMIN')
    const href = (k: TodoKey) => find(u, k).href
    expect(href('importDraft')).toEqual({ pathname: '/import', params: { preset: 'DRAFT' } })
    expect(href('exportDraft')).toEqual({ pathname: '/export', params: { preset: 'DRAFT' } })
    expect(href('exportPending')).toEqual({ pathname: '/export', params: { preset: 'PENDING' } })
    expect(href('stockLow')).toEqual({ pathname: '/stock/reorder', params: {} })
    expect(href('stockHigh')).toEqual({ pathname: '/stock', params: { preset: 'high' } })
    expect(STOCK_HREF).toEqual({ pathname: '/stock', params: { preset: 'all' } })
  })

  it('user null → []', () => {
    expect(overviewTodos(null, {})).toEqual([])
  })
})
