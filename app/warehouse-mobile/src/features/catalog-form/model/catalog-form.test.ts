import type { CatalogItem } from '@/shared/lib/catalog'
import {
  EMPTY_CATALOG_FORM,
  isCatalogDirty,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  validateCatalogForm,
} from './catalog-form'

const orig: CatalogItem = { slug: 's', code: 'KG', name: 'Kilogam', description: 'x' }

describe('validateCatalogForm', () => {
  it('hợp lệ → {}', () => {
    expect(validateCatalogForm('unit', { code: 'K', name: 'Kg', description: '' })).toEqual({})
  })
  it('loại vật tư cần mã >= 2 ký tự', () => {
    expect(
      validateCatalogForm('material-type', { code: 'K', name: 'Kg', description: '' }),
    ).toEqual({
      code: 'codeInvalid',
    })
  })
  it('mã sai định dạng / rỗng', () => {
    expect(validateCatalogForm('unit', { code: '-KG', name: 'Kg', description: '' })).toEqual({
      code: 'codeInvalid',
    })
    expect(validateCatalogForm('unit', { code: '  ', name: 'Kg', description: '' })).toEqual({
      code: 'required',
    })
  })
  it('tên rỗng / quá dài, mô tả quá dài', () => {
    expect(validateCatalogForm('unit', { code: 'KG', name: '  ', description: '' })).toEqual({
      name: 'required',
    })
    expect(
      validateCatalogForm('unit', { code: 'KG', name: 'a'.repeat(256), description: '' }),
    ).toEqual({ name: 'tooLong' })
    expect(
      validateCatalogForm('unit', { code: 'KG', name: 'a', description: 'a'.repeat(256) }),
    ).toEqual({ description: 'tooLong' })
  })
})

describe('toFormValues / toCreateInput', () => {
  it('mô tả null → rỗng', () => {
    expect(toFormValues({ slug: 's', code: 'A', name: 'B', description: null })).toEqual({
      code: 'A',
      name: 'B',
      description: '',
    })
  })
  it('chuẩn hoá, bỏ mô tả rỗng', () => {
    expect(toCreateInput({ code: ' kg ', name: ' Kilogam ', description: ' ' })).toEqual({
      code: 'KG',
      name: 'Kilogam',
    })
    expect(toCreateInput({ code: 'kg', name: 'K', description: ' d ' })).toEqual({
      code: 'KG',
      name: 'K',
      description: 'd',
    })
  })
})

describe('toUpdateInput / isCatalogDirty', () => {
  const same = { code: 'kg', name: 'Kilogam', description: 'x' }
  it('không đổi (khác hoa/thường mã) → {}', () => {
    expect(toUpdateInput(same, orig)).toEqual({})
    expect(isCatalogDirty(same, orig)).toBe(false)
  })
  it('xoá mô tả → description rỗng', () => {
    expect(
      toUpdateInput(
        { code: 'KG', name: 'Kilogam', description: '   ' },
        { ...orig, description: 'cũ' },
      ),
    ).toEqual({ description: '' })
  })
  it('gốc null + ô rỗng → {}', () => {
    expect(
      toUpdateInput(
        { code: 'KG', name: 'Kilogam', description: '' },
        { ...orig, description: null },
      ),
    ).toEqual({})
  })
  it('chỉ gửi trường đổi', () => {
    expect(toUpdateInput({ code: ' kg2 ', name: ' Kilogam ', description: 'x' }, orig)).toEqual({
      code: 'KG2',
    })
    expect(toUpdateInput({ code: 'KG', name: 'Gam', description: 'x' }, orig)).toEqual({
      name: 'Gam',
    })
    expect(isCatalogDirty({ ...same, name: 'Gam' }, orig)).toBe(true)
  })
  it('tạo mới', () => {
    expect(isCatalogDirty(EMPTY_CATALOG_FORM, null)).toBe(false)
    expect(isCatalogDirty({ ...EMPTY_CATALOG_FORM, code: '  ' }, null)).toBe(false)
    expect(isCatalogDirty({ ...EMPTY_CATALOG_FORM, name: 'A' }, null)).toBe(true)
  })
})
