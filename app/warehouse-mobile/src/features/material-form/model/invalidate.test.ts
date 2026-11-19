import { QueryClient } from '@tanstack/react-query'
import { invalidateAfterMaterialWrite } from './invalidate'

describe('invalidateAfterMaterialWrite', () => {
  it('làm mới đúng các key liên quan', async () => {
    const qc = new QueryClient()
    const keys = [
      ['materials', 'list', { query: '' }],
      ['materials', 'detail', 'm1'],
      ['units', 'list'],
      ['inventory', 'wh'],
      ['import-forms', 'wh', 'available', 'xi'],
      ['import-forms', 'wh', 'available', { all: true }],
    ]
    const untouched = ['import-forms', 'wh', 'list', {}]
    for (const k of [...keys, untouched]) qc.setQueryData(k, 1)
    await invalidateAfterMaterialWrite(qc, 'm1')
    for (const k of keys) expect(qc.getQueryState(k)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(untouched)?.isInvalidated).toBe(false)
  })
  it('không slug → vẫn làm mới danh sách', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['materials', 'list', {}], 1)
    qc.setQueryData(['materials', 'detail', 'm1'], 1)
    await invalidateAfterMaterialWrite(qc)
    expect(qc.getQueryState(['materials', 'list', {}])?.isInvalidated).toBe(true)
    expect(qc.getQueryState(['materials', 'detail', 'm1'])?.isInvalidated).toBe(false)
  })
})
