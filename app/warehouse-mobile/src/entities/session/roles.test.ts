import { ROLES, isWarehouseScoped, seesAllWarehouses } from './roles'

describe('seesAllWarehouses', () => {
  it('ADMIN và SUPER_ADMIN thấy mọi kho', () => {
    expect(seesAllWarehouses(ROLES.ADMIN)).toBe(true)
    expect(seesAllWarehouses(ROLES.SUPER_ADMIN)).toBe(true)
  })

  it('MANAGER, SUPERVISOR, vai trò tự tạo, thiếu vai trò → không (giữ kho của /auth/me)', () => {
    expect(seesAllWarehouses(ROLES.MANAGER)).toBe(false)
    expect(seesAllWarehouses(ROLES.SUPERVISOR)).toBe(false)
    expect(seesAllWarehouses('KE_TOAN')).toBe(false)
    expect(seesAllWarehouses('admin')).toBe(false)
    expect(seesAllWarehouses(undefined)).toBe(false)
    // Khác phủ định của `isWarehouseScoped`: vai trò tự tạo không bị giới hạn ở `/stores` nhưng vẫn
    // không thấy mọi kho.
    expect(isWarehouseScoped('KE_TOAN')).toBe(false)
  })
})
