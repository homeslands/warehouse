import { describe, expect, it } from 'vitest'
import {
  BUSINESS_CODE_REGEX,
  canSearchByCode,
  isCodeLike,
  toCodeOrNameQuery,
  UNIT_CODE_REGEX,
} from './code'

describe('BUSINESS_CODE_REGEX / UNIT_CODE_REGEX (khớp code.util.ts của backend)', () => {
  it.each(['MAT-001', 'ab', 'A1', 'x'.repeat(32)])('mã vật tư hợp lệ: %s', (v) => {
    expect(BUSINESS_CODE_REGEX.test(v)).toBe(true)
  })
  it.each(['M', '-AB', 'AB-', 'A B', 'x'.repeat(33), 'Ă1'])('mã vật tư sai: %s', (v) => {
    expect(BUSINESS_CODE_REGEX.test(v)).toBe(false)
  })
  it('mã đơn vị nhận 1 ký tự, vẫn chặn gạch đầu/cuối và quá 32', () => {
    expect(UNIT_CODE_REGEX.test('M')).toBe(true)
    expect(UNIT_CODE_REGEX.test('KG')).toBe(true)
    expect(UNIT_CODE_REGEX.test('-')).toBe(false)
    expect(UNIT_CODE_REGEX.test('KG-')).toBe(false)
    expect(UNIT_CODE_REGEX.test('x'.repeat(33))).toBe(false)
  })
})

describe('isCodeLike', () => {
  it.each(['NL04', 'mat-001', 'NCC-HN-01'])('trông như mã: %s', (v) => {
    expect(isCodeLike(v)).toBe(true)
  })
  it.each(['abc', 'Xi măng', '123', 'bao 50kg'])('không phải mã: %s', (v) => {
    expect(isCodeLike(v)).toBe(false)
  })
})

describe('toCodeOrNameQuery', () => {
  it('trống / chỉ khoảng trắng → không lọc', () => {
    expect(toCodeOrNameQuery(undefined)).toEqual({})
    expect(toCodeOrNameQuery('   ')).toEqual({})
  })
  it('trông như mã → code viết hoa (khớp đúng)', () => {
    expect(toCodeOrNameQuery(' mat-001 ')).toEqual({ code: 'MAT-001' })
  })
  it('còn lại → name đã trim', () => {
    expect(toCodeOrNameQuery(' Xi măng ')).toEqual({ name: 'Xi măng' })
  })
})

describe('toCodeOrNameQuery — mã toàn chữ cái', () => {
  it('gõ toàn chữ hoa một từ (KG, BAG, M, NVL) → code', () => {
    expect(toCodeOrNameQuery('KG')).toEqual({ code: 'KG' })
    expect(toCodeOrNameQuery('M')).toEqual({ code: 'M' })
    expect(toCodeOrNameQuery(' NVL ')).toEqual({ code: 'NVL' })
  })
  it('chữ thường / có dấu / nhiều từ → name', () => {
    expect(toCodeOrNameQuery('kg')).toEqual({ name: 'kg' })
    expect(toCodeOrNameQuery('ĐÁ')).toEqual({ name: 'ĐÁ' })
    expect(toCodeOrNameQuery('BAO XI')).toEqual({ name: 'BAO XI' })
  })
  it('người dùng chọn cách tìm (`prefer`) thắng phần đoán; code luôn viết hoa', () => {
    expect(toCodeOrNameQuery('kg', 'code')).toEqual({ code: 'KG' })
    expect(toCodeOrNameQuery('KG', 'name')).toEqual({ name: 'KG' })
  })
  it('chuỗi không thể là mã thì bỏ qua prefer = code', () => {
    expect(toCodeOrNameQuery('Xi măng', 'code')).toEqual({ name: 'Xi măng' })
  })
})

describe('canSearchByCode', () => {
  it('một từ chỉ gồm chữ Latin / số / gạch → có thể là mã', () => {
    expect(canSearchByCode('kg')).toBe(true)
    expect(canSearchByCode('MAT-001')).toBe(true)
  })
  it('có khoảng trắng / dấu / trống → không', () => {
    expect(canSearchByCode('Xi măng')).toBe(false)
    expect(canSearchByCode('đá')).toBe(false)
    expect(canSearchByCode('  ')).toBe(false)
    expect(canSearchByCode(undefined)).toBe(false)
  })
})
