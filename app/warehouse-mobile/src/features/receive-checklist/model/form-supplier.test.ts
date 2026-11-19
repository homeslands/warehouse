import type { CurrentUser } from '@/entities/session'

import { makeDraft, makeLine } from './fixtures'
import { formSupplierSlug, supplierNameLookup, willAttachToSupplier } from './form-supplier'

const user = (scope: string[], roleName = 'STAFF'): CurrentUser => ({
  userSlug: 'u',
  userName: 'an',
  roleName,
  scope,
})
const READER = user(['SUPPLIER_READ'])
const NO_READ = user(['IMPORT_FORM_CREATE'])

const header = (supplierSlug: string | null) => ({ ...makeDraft([]).header, supplierSlug })
const sup = (n: number, slug: string | null) =>
  makeLine(n, { supplierSlug: slug, supplierName: slug ? `Tên ${slug}` : null })

describe('formSupplierSlug', () => {
  it('phiếu mới → bên bán đã chọn ở bước 1 (header), không cần nhìn dòng / quyền', () => {
    const d = makeDraft([sup(1, 's9')], { formSlug: 'new', version: null, header: header('s2') })
    expect(formSupplierSlug(d, NO_READ)).toBe('s2')
    expect(formSupplierSlug(d, null)).toBe('s2')
    expect(formSupplierSlug({ ...d, header: header(null) }, READER)).toBeNull()
  })

  it('phiếu đã có, một bên bán trên mọi dòng có bên bán + SUPPLIER_READ → bên bán đó', () => {
    const d = makeDraft([sup(1, 's1'), sup(2, null), sup(3, 's1')], { header: header('s1') })
    expect(formSupplierSlug(d, READER)).toBe('s1')
  })

  it('SUPER_ADMIN luôn có quyền (can bypass)', () => {
    const d = makeDraft([sup(1, 's1')], { header: header('s1') })
    expect(formSupplierSlug(d, user([], 'SUPER_ADMIN'))).toBe('s1')
  })

  it('phiếu đã có, cùng một bên bán nhưng KHÔNG có SUPPLIER_READ → null', () => {
    const d = makeDraft([sup(1, 's1'), sup(2, 's1')], { header: header('s1') })
    expect(formSupplierSlug(d, NO_READ)).toBeNull()
    expect(formSupplierSlug(d, null)).toBeNull()
  })

  it('phiếu đã có nhiều bên bán (header suy ra s1) → null, dù có SUPPLIER_READ', () => {
    const d = makeDraft([sup(1, 's1'), sup(2, 's1'), sup(3, 's2')], { header: header('s1') })
    expect(formSupplierSlug(d, READER)).toBeNull()
  })

  it('chỉ xét dòng của server: dòng thêm trên máy (đoán theo lineSupplier) không biến thành bên bán của phiếu', () => {
    const guessed = makeLine(9, { base: null, supplierSlug: 'sx', materialSupplierSlugs: ['sx'] })
    expect(formSupplierSlug(makeDraft([sup(1, null), guessed]), READER)).toBeNull()
    // Dòng máy khác bên bán không phá bên bán chắc chắn của các dòng server.
    expect(formSupplierSlug(makeDraft([sup(1, 's1'), guessed]), READER)).toBe('s1')
  })

  it('phiếu đã có không dòng nào có bên bán → null', () => {
    expect(formSupplierSlug(makeDraft([sup(1, null)]), READER)).toBeNull()
    expect(formSupplierSlug(makeDraft([]), READER)).toBeNull()
  })
})

describe('willAttachToSupplier', () => {
  it('theo bên bán CỦA DÒNG (thứ được gửi), không theo đầu phiếu', () => {
    expect(willAttachToSupplier({ supplierSlug: 's1', materialSupplierSlugs: [] })).toBe(true)
    expect(willAttachToSupplier({ supplierSlug: 's1', materialSupplierSlugs: ['s2'] })).toBe(true)
    expect(willAttachToSupplier({ supplierSlug: 's1', materialSupplierSlugs: ['s1'] })).toBe(false)
    expect(willAttachToSupplier({ supplierSlug: null, materialSupplierSlugs: [] })).toBe(false)
    // Dòng của server / bản nháp cũ: không biết NCC của vật tư → không bao giờ coi là gắn mới.
    expect(willAttachToSupplier({ supplierSlug: 's1' })).toBe(false)
  })
})

describe('supplierNameLookup', () => {
  it('danh sách bên bán → dòng cùng slug → material.suppliers → null', () => {
    const nameOf = supplierNameLookup({
      suppliers: [{ slug: 's1', name: 'Từ danh sách' }],
      lines: [
        makeLine(1, { supplierSlug: 's1', supplierName: 'Từ dòng s1' }),
        makeLine(2, { supplierSlug: 's2', supplierName: null }),
        makeLine(3, { supplierSlug: 's2', supplierName: 'Từ dòng s2' }),
      ],
      materials: [
        { suppliers: [{ slug: 's3', code: 'C3', name: 'Từ vật tư' }] },
        { suppliers: [{ slug: 's2', code: 'C2', name: 'Không dùng' }] },
      ],
    })
    expect(nameOf('s1')).toBe('Từ danh sách')
    expect(nameOf('s2')).toBe('Từ dòng s2')
    expect(nameOf('s3')).toBe('Từ vật tư')
    expect(nameOf('s4')).toBeNull()
  })

  it('nguồn vắng không lỗi', () => {
    expect(supplierNameLookup({})('s1')).toBeNull()
  })
})
