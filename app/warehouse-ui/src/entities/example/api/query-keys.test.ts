import { describe, expect, it } from 'vitest'
import { exampleKeys } from './query-keys'

describe('exampleKeys', () => {
  it('list nằm dưới lists, lists nằm dưới all — invalidate all trúng mọi danh sách', () => {
    expect(exampleKeys.all).toEqual(['examples'])
    expect(exampleKeys.lists()).toEqual(['examples', 'list'])
    expect(exampleKeys.list({ page: 2, size: 10 })).toEqual([
      'examples',
      'list',
      { page: 2, size: 10 },
    ])
  })
})
