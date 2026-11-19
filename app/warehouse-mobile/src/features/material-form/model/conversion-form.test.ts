import { validateConversionForm } from './conversion-form'

const unit = { slug: 'u1', code: 'TH', name: 'Thùng' }

describe('validateConversionForm', () => {
  it('hợp lệ', () => expect(validateConversionForm({ unit, rate: '24' })).toEqual({}))
  it('rate 0 / âm / quá lớn / sai', () => {
    expect(validateConversionForm({ unit, rate: '0' })).toEqual({ rate: 'numberInvalid' })
    expect(validateConversionForm({ unit, rate: '-1' })).toEqual({ rate: 'numberInvalid' })
    expect(validateConversionForm({ unit, rate: '1000000000000' })).toEqual({
      rate: 'numberInvalid',
    })
    expect(validateConversionForm({ unit, rate: 'abc' })).toEqual({ rate: 'numberInvalid' })
  })
  it('rate trống', () =>
    expect(validateConversionForm({ unit, rate: ' ' })).toEqual({ rate: 'required' }))
  it('unit null', () =>
    expect(validateConversionForm({ unit: null, rate: '24' })).toEqual({ unit: 'required' }))
})
