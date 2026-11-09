import { personLabel } from './person'

describe('personLabel', () => {
  it('có tên → tên; chưa có tên → số điện thoại định dạng', () => {
    expect(personLabel({ slug: 'a', name: 'Nguyễn Văn An', phonenumber: '0901234567' })).toBe(
      'Nguyễn Văn An',
    )
    expect(personLabel({ slug: 'b', name: '', phonenumber: '0901234567' })).toBe('0901 234 567')
  })
})
