import { describe, expect, it } from 'vitest'
import { makeRoleCreateSchema, toCreateInput } from './role-form.schema'

const schema = makeRoleCreateSchema({
  maxLevel: 29,
  takenNames: ['SUPER_ADMIN', 'ADMIN', 'Quản trị viên', 'Administrator', 'Quản lý', 'Trưởng nhóm'],
})
const firstIssue = (values: Record<string, unknown>, path: string) =>
  schema.safeParse(values).error?.issues.find((i) => i.path[0] === path)?.message
const valid = { name: 'Trưởng kho', level: 5, description: '' }

describe('makeRoleCreateSchema', () => {
  it('tên: bắt buộc, trim, 2–50 ký tự', () => {
    expect(firstIssue({ ...valid, name: '   ' }, 'name')).toBe('roles:nameRequired')
    expect(firstIssue({ ...valid, name: ' a ' }, 'name')).toBe('roles:nameTooShort')
    expect(firstIssue({ ...valid, name: 'x'.repeat(51) }, 'name')).toBe('roles:nameTooLong')
    expect(firstIssue({ ...valid, name: ` ${'x'.repeat(50)} ` }, 'name')).toBeUndefined()
  })

  it('tên: trùng mã / nhãn / vai trò đang có — không phân biệt hoa thường, bỏ khoảng trắng hai đầu', () => {
    expect(firstIssue({ ...valid, name: '  admin ' }, 'name')).toBe('roles:nameTaken')
    expect(firstIssue({ ...valid, name: 'QUẢN LÝ' }, 'name')).toBe('roles:nameTaken')
    expect(firstIssue({ ...valid, name: 'administrator' }, 'name')).toBe('roles:nameTaken')
    expect(firstIssue({ ...valid, name: 'trưởng nhóm' }, 'name')).toBe('roles:nameTaken')
    expect(firstIssue(valid, 'name')).toBeUndefined()
  })

  it('cấp: bắt buộc, nguyên, ≥ 1, ≤ trần', () => {
    expect(firstIssue({ ...valid, level: undefined }, 'level')).toBe('roles:levelRequired')
    expect(firstIssue({ ...valid, level: 0 }, 'level')).toBe('roles:levelInvalid')
    expect(firstIssue({ ...valid, level: 1.5 }, 'level')).toBe('roles:levelInvalid')
    expect(firstIssue({ ...valid, level: 30 }, 'level')).toBe('roles:levelTooHigh')
    expect(firstIssue({ ...valid, level: 29 }, 'level')).toBeUndefined()
    expect(firstIssue({ ...valid, level: 1 }, 'level')).toBeUndefined()
  })

  it('không tạo được (maxLevel 0): mọi cấp đều vượt', () => {
    const none = makeRoleCreateSchema({ maxLevel: 0, takenNames: [] })
    expect(none.safeParse({ ...valid, level: 1 }).error?.issues[0]?.message).toBe(
      'roles:levelTooHigh',
    )
  })

  it('mô tả ≤ 255', () => {
    expect(firstIssue({ ...valid, description: 'x'.repeat(256) }, 'description')).toBe(
      'roles:descriptionTooLong',
    )
  })

  it('toCreateInput: trim tên + mô tả, bỏ mô tả trống', () => {
    expect(toCreateInput({ name: '  Trưởng kho ', level: 15, description: ' ' })).toEqual({
      name: 'Trưởng kho',
      level: 15,
    })
    expect(toCreateInput({ name: 'A b', level: 3, description: ' kho ' })).toEqual({
      name: 'A b',
      level: 3,
      description: 'kho',
    })
  })
})
