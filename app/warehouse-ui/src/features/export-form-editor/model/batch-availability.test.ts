import { describe, expect, it } from 'vitest'
import type { MaterialBatch } from '@/entities/material-batch'
import { knownBatches } from './batch-availability'

const batch = (slug: string, availableQuantity: number, materialSlug = 'm-1') =>
  ({ slug, materialSlug, availableQuantity, expiryDate: '2026-12-31' }) as MaterialBatch

const line = (batchSlug: string, materialSlug = 'm-1') => ({ materialSlug, batchSlug })

describe('knownBatches', () => {
  it('danh sách mới thắng bản chụp lúc chọn', () => {
    const map = knownBatches(
      [line('b-1')],
      new Map([['b-1', batch('b-1', 50)]]),
      new Map([['m-1', [batch('b-1', 7)]]]),
      100,
    )
    expect(map.get('b-1')?.availableQuantity).toBe(7)
  })

  it('lô đã chọn không còn trong danh sách đã tải → khả dụng 0 (giữ HSD của bản chụp)', () => {
    const map = knownBatches(
      [line('b-1')],
      new Map([['b-1', batch('b-1', 50)]]),
      new Map([['m-1', []]]),
      100,
    )
    expect(map.get('b-1')).toMatchObject({ availableQuantity: 0, expiryDate: '2026-12-31' })
  })

  it('lô của nháp chưa từng biết, không còn trong danh sách → vẫn có mục khả dụng 0', () => {
    const map = knownBatches([line('b-x')], new Map(), new Map([['m-1', [batch('b-2', 5)]]]), 100)
    expect(map.get('b-x')?.availableQuantity).toBe(0)
    expect(map.get('b-2')?.availableQuantity).toBe(5)
  })

  it('danh sách chưa tải → giữ bản chụp; danh sách đủ trang → không kết luận', () => {
    const picked = new Map([['b-1', batch('b-1', 50)]])
    expect(knownBatches([line('b-1')], picked, new Map(), 100).get('b-1')?.availableQuantity).toBe(
      50,
    )
    const full = new Map([['m-1', [batch('b-2', 1), batch('b-3', 1)]]])
    expect(knownBatches([line('b-1')], picked, full, 2).get('b-1')?.availableQuantity).toBe(50)
  })

  it('dòng tự chọn lô không bị đụng', () => {
    expect(knownBatches([line('')], new Map(), new Map([['m-1', []]]), 100).size).toBe(0)
  })
})
