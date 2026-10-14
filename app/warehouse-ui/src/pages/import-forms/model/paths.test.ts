import { describe, expect, it } from 'vitest'
import { detailPath, listPath } from './paths'

describe('paths', () => {
  it('luôn kèm ?warehouse, mã hoá slug', () => {
    expect(listPath('w a')).toBe('/import-forms?warehouse=w%20a')
    expect(detailPath('w-a', 'if-1')).toBe('/import-forms/if-1?warehouse=w-a')
  })
})
