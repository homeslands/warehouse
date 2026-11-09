import { useFormNotice, type FormNotice } from './form-notice.store'

const notice = (over: Partial<FormNotice> = {}): FormNotice => ({
  kind: 'export',
  formSlug: 'new',
  message: 'Lỗi',
  ...over,
})

afterEach(() => useFormNotice.getState().reset())

describe('useFormNotice', () => {
  it('show replaces the current notice (one at a time)', () => {
    useFormNotice.getState().show(notice({ message: 'a' }))
    useFormNotice.getState().show(notice({ kind: 'import', formSlug: 'f-1', message: 'b' }))
    expect(useFormNotice.getState().notice).toEqual(
      notice({ kind: 'import', formSlug: 'f-1', message: 'b' }),
    )
  })

  it('dismiss only clears matching kind+formSlug', () => {
    const n = notice({ shortageKeys: ['k1'], offerDiscard: true })
    useFormNotice.getState().show(n)
    useFormNotice.getState().dismiss('import', 'new')
    useFormNotice.getState().dismiss('export', 'f-1')
    expect(useFormNotice.getState().notice).toEqual(n)
    useFormNotice.getState().dismiss('export', 'new')
    expect(useFormNotice.getState().notice).toBeNull()
  })

  it('reset clears any notice', () => {
    useFormNotice.getState().show(notice())
    useFormNotice.getState().reset()
    expect(useFormNotice.getState().notice).toBeNull()
  })
})
