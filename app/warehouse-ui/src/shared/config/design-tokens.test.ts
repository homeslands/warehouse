import { describe, expect, it } from 'vitest'
import contractTokens from '../../../../../docs/project/baseline/contracts/design-tokens.json'
import { designTokens } from './design-tokens'

describe('designTokens', () => {
  it('khớp đúng hợp đồng R2 docs/project/baseline/contracts/design-tokens.json', () => {
    expect(designTokens).toEqual(contractTokens)
  })
})
