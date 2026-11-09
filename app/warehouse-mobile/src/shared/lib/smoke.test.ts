import { add } from '@/shared/lib/example'

describe('smoke', () => {
  it('runs jest', () => {
    expect(1 + 1).toBe(2)
  })

  it('resolves the @/ alias', () => {
    expect(add(2, 3)).toBe(5)
  })
})
