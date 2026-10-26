import { describe, expect, it } from 'vitest'
import { EXPORT_FORMS_PATH, detailPath, listPath } from './paths'

describe('paths', () => {
  it('luôn kèm ?warehouse, mã hoá slug', () => {
    expect(EXPORT_FORMS_PATH).toBe('/export-forms')
    expect(listPath('w a')).toBe('/export-forms?warehouse=w%20a')
    expect(detailPath('w-a', 'xf-1')).toBe('/export-forms/xf-1?warehouse=w-a')
  })
})
