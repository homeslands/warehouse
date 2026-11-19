import { classifyCatalogError } from './catalog-error'

const api = (code: number, statusCode = 422) => ({ statusCode, code, message: 'm' })

describe('classifyCatalogError', () => {
  it('đơn vị', () => {
    expect(classifyCatalogError('unit', api(100906))).toEqual({ field: 'code' })
    expect(classifyCatalogError('unit', api(100904))).toEqual({ field: 'code' })
    expect(classifyCatalogError('unit', api(100903))).toEqual({ field: 'name' })
    expect(classifyCatalogError('unit', api(100901, 404))).toEqual({ target: 'notFound' })
    expect(classifyCatalogError('unit', api(100909))).toEqual({ target: 'inUse' })
  })
  it('loại vật tư', () => {
    expect(classifyCatalogError('material-type', api(100607))).toEqual({ field: 'code' })
    expect(classifyCatalogError('material-type', api(100602))).toEqual({ field: 'name' })
    expect(classifyCatalogError('material-type', api(100601, 404))).toEqual({ target: 'notFound' })
    expect(classifyCatalogError('material-type', api(100609))).toEqual({ target: 'inUse' })
  })
  it('mã của loại kia / lỗi khác → general', () => {
    expect(classifyCatalogError('unit', api(100609))).toEqual({ target: 'general' })
    expect(
      classifyCatalogError('unit', { statusCode: 403, message: 'Forbidden resource' }),
    ).toEqual({ target: 'general' })
    expect(classifyCatalogError('unit', new Error('x'))).toEqual({ target: 'general' })
  })
})
