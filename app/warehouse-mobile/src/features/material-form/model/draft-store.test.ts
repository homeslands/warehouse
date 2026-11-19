import { useMaterialDraft } from './draft-store'

beforeEach(() => useMaterialDraft.getState().reset())

describe('useMaterialDraft — scannedCode', () => {
  it('mặc định null; setScannedCode ghi, null xoá', () => {
    expect(useMaterialDraft.getState().scannedCode).toBeNull()
    useMaterialDraft.getState().setScannedCode('ABC-12')
    expect(useMaterialDraft.getState().scannedCode).toBe('ABC-12')
    useMaterialDraft.getState().setScannedCode(null)
    expect(useMaterialDraft.getState().scannedCode).toBeNull()
  })

  it('reset xoá cả scannedCode', () => {
    useMaterialDraft.getState().setScannedCode('X1')
    useMaterialDraft.getState().reset()
    expect(useMaterialDraft.getState().scannedCode).toBeNull()
  })
})

describe('useMaterialDraft — warehouses', () => {
  it('mặc định null (chưa khởi tạo); setWarehouses ghi, reset về null', () => {
    expect(useMaterialDraft.getState().warehouses).toBeNull()
    useMaterialDraft.getState().setWarehouses(['w1', 'w2'])
    expect(useMaterialDraft.getState().warehouses).toEqual(['w1', 'w2'])
    useMaterialDraft.getState().setWarehouses([])
    expect(useMaterialDraft.getState().warehouses).toEqual([])
    useMaterialDraft.getState().reset()
    expect(useMaterialDraft.getState().warehouses).toBeNull()
  })
})

describe('useMaterialDraft — suppliers', () => {
  it('mặc định null; setSuppliers ghi, reset về null', () => {
    expect(useMaterialDraft.getState().suppliers).toBeNull()
    useMaterialDraft.getState().setSuppliers(['s1', 's2'])
    expect(useMaterialDraft.getState().suppliers).toEqual(['s1', 's2'])
    useMaterialDraft.getState().setSuppliers([])
    expect(useMaterialDraft.getState().suppliers).toEqual([])
    useMaterialDraft.getState().reset()
    expect(useMaterialDraft.getState().suppliers).toBeNull()
  })
})
