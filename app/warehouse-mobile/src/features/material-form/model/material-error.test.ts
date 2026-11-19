import { classifyConversionError, classifyMaterialError } from './material-error'

const api = (code?: number, statusCode = 422) => ({ statusCode, code, message: 'm' })

describe('classifyMaterialError', () => {
  it('map trường', () => {
    expect(classifyMaterialError(api(100705))).toEqual({ field: 'code' })
    expect(classifyMaterialError(api(100702))).toEqual({ field: 'name' })
    expect(classifyMaterialError(api(100601))).toEqual({ field: 'type' })
    expect(classifyMaterialError(api(100723))).toEqual({ field: 'baseUnit' })
    expect(classifyMaterialError(api(100708))).toEqual({ field: 'min' })
    expect(classifyMaterialError(api(100710))).toEqual({ field: 'max' })
  })
  it('notFound / inUse / general', () => {
    expect(classifyMaterialError(api(100701, 404))).toEqual({ target: 'notFound' })
    expect(classifyMaterialError(api(100712))).toEqual({ target: 'inUse' })
    expect(classifyMaterialError(api(undefined, 403))).toEqual({ target: 'general' })
    expect(classifyMaterialError(new Error('x'))).toEqual({ target: 'general' })
  })
})

describe('classifyConversionError', () => {
  it('map', () => {
    expect(classifyConversionError(api(100716))).toEqual({ field: 'unit' })
    expect(classifyConversionError(api(100901))).toEqual({ field: 'unit' })
    expect(classifyConversionError(api(100717, 404))).toEqual({ target: 'notFound' })
    expect(classifyConversionError(api(100718))).toEqual({ field: 'rate' })
    expect(classifyConversionError(api(100712))).toEqual({ target: 'general' })
  })
})
