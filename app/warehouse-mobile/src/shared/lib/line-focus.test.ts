import { useLineFocus } from './line-focus'

const st = () => useLineFocus.getState()

beforeEach(() => st().clear())

describe('useLineFocus — yêu cầu theo loại phiếu', () => {
  it("ask ghi loại + phiếu + dòng; phiếu nhập và phiếu xuất cùng 'new' là hai yêu cầu khác nhau", () => {
    st().ask('import', 'new', 'm-1|u-1')
    expect(st().request).toEqual({ kind: 'import', formSlug: 'new', key: 'm-1|u-1' })
    expect(st().requestFor('import', 'new')).toEqual({
      kind: 'import',
      formSlug: 'new',
      key: 'm-1|u-1',
    })
    expect(st().requestFor('export', 'new')).toBeNull()
  })

  it('clear(kind, formSlug) chỉ bỏ yêu cầu của đúng loại + phiếu đó', () => {
    st().ask('import', 'new', 'm-1|u-1')
    st().clear('export', 'new')
    expect(st().request).not.toBeNull()
    st().clear('import', 'pn-1')
    expect(st().request).not.toBeNull()
    st().clear('import', 'new')
    expect(st().request).toBeNull()
  })

  it('clear() không tham số bỏ mọi yêu cầu', () => {
    st().ask('export', 'px-1', 'a|kg|')
    st().clear()
    expect(st().request).toBeNull()
  })
})
