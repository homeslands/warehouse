import { describe, expect, it } from 'vitest'
import { createPath, detailPath, editPath, listPath } from './paths'

describe('paths', () => {
  it('luôn kèm ?warehouse, mã hoá slug', () => {
    expect(listPath('w a')).toBe('/import-forms?warehouse=w%20a')
    expect(createPath('w-a')).toBe('/import-forms/new?warehouse=w-a')
    expect(detailPath('w-a', 'if-1')).toBe('/import-forms/if-1?warehouse=w-a')
    expect(editPath('w-a', 'if-1')).toBe('/import-forms/if-1/edit?warehouse=w-a')
  })
})
