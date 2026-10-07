import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import { storeAbilities } from './abilities'

const user = (roleName: string, scope: string[] = []): CurrentUser => ({
  userName: 't',
  roleName,
  scope,
})

const NONE = {
  create: false,
  update: false,
  assignWarehouse: false,
  delete: false,
  viewWarehouse: false,
}
const ALL = { create: true, update: true, assignWarehouse: true, delete: true, viewWarehouse: true }
const OFF = { authorityGuards: false, storeAuthorityGuards: false }
const ON = { authorityGuards: true, storeAuthorityGuards: true }

describe('storeAbilities — cờ TẮT (backend còn @HasRole)', () => {
  it('ADMIN làm được mọi thứ', () => {
    expect(storeAbilities(user('ADMIN'), OFF)).toEqual(ALL)
  })

  it('MANAGER có đủ mã vẫn KHÔNG làm được gì (nhưng vẫn xem được kho — cờ TẮT dùng vai trò)', () => {
    const scope = ['STORE_CREATE', 'STORE_UPDATE', 'STORE_DELETE', 'WAREHOUSE_UPDATE']
    // `readWarehouses` khi cờ TẮT xét theo vai trò (ADMIN/MANAGER/SUPERVISOR) — MANAGER lọt qua dù
    // không có mã quyền nào, nên `viewWarehouse` vẫn true.
    expect(storeAbilities(user('MANAGER', scope), OFF)).toEqual({ ...NONE, viewWarehouse: true })
  })
})

describe('storeAbilities — cờ BẬT', () => {
  it('ADMIN scope rỗng → không làm được gì', () => {
    expect(storeAbilities(user('ADMIN'), ON)).toEqual(NONE)
  })

  it('mỗi thao tác hỏi đúng một mã', () => {
    expect(storeAbilities(user('MANAGER', ['STORE_CREATE']), ON)).toEqual({ ...NONE, create: true })
    expect(storeAbilities(user('MANAGER', ['STORE_UPDATE']), ON).update).toBe(true)
    expect(storeAbilities(user('MANAGER', ['STORE_DELETE']), ON).delete).toBe(true)
  })

  describe('gán kho = `PUT /stores/:slug/warehouse` — backend đòi ĐỦ STORE_UPDATE + WAREHOUSE_UPDATE', () => {
    // Backend không có mã riêng cho việc gán (`STORE_ASSIGN_WAREHOUSE` chỉ từng là tên đề xuất).
    // Route nối hai tài nguyên dùng `@RequireAuthority(StoreUpdate, WarehouseUpdate)` — AND. Hộp gán
    // còn tải `GET /warehouses` nên cần thêm quyền đọc kho.
    const FULL = ['STORE_UPDATE', 'WAREHOUSE_UPDATE', 'WAREHOUSE_READ']

    it('đủ ba mã → gán được', () => {
      expect(storeAbilities(user('MANAGER', FULL), ON).assignWarehouse).toBe(true)
    })

    it.each(FULL)('thiếu %s → KHÔNG gán được', (missing) => {
      const scope = FULL.filter((code) => code !== missing)
      expect(storeAbilities(user('MANAGER', scope), ON).assignWarehouse).toBe(false)
    })

    it('chỉ STORE_UPDATE → sửa được nhưng KHÔNG gán được', () => {
      const ability = storeAbilities(user('MANAGER', ['STORE_UPDATE']), ON)
      expect(ability.update).toBe(true)
      expect(ability.assignWarehouse).toBe(false)
    })
  })

  it('SUPER_ADMIN làm được mọi thứ', () => {
    expect(storeAbilities(user('SUPER_ADMIN'), ON)).toEqual(ALL)
  })
})
