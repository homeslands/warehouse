import { attachmentName, isImageAttachment, openableAttachmentUrl } from './attachment'

describe('attachmentName', () => {
  it('lấy tên cuối URL và bỏ hậu tố -13 chữ số', () => {
    expect(
      attachmentName('https://b.s3.ap.amazonaws.com/import-forms/hoa-don-1731000000000.pdf'),
    ).toBe('hoa-don.pdf')
  })
  it('giải mã %20', () => {
    expect(
      attachmentName('https://b.s3.amazonaws.com/import-forms/hoa%20don-1731000000000.pdf'),
    ).toBe('hoa don.pdf')
  })
  it('nhận khoá S3 không có host', () => {
    expect(attachmentName('import-forms/x-1731000000000.jpg')).toBe('x.jpg')
  })
  it('bỏ query và hash', () => {
    expect(attachmentName('https://h/x/a-1731000000000.png?sig=1#top')).toBe('a.png')
  })
  it('không có -13 số thì giữ nguyên', () => {
    expect(attachmentName('https://h/x/ban-ve.pdf')).toBe('ban-ve.pdf')
    expect(attachmentName('x/a-12345.pdf')).toBe('a-12345.pdf')
  })
  it('giải mã lỗi thì giữ nguyên', () => {
    expect(attachmentName('x/100%-1731000000000.pdf')).toBe('100%.pdf')
  })
  it('BE mới: bỏ hậu tố -<UUID> trước đuôi (không phân biệt hoa thường)', () => {
    expect(
      attachmentName(
        'https://b.s3.ap.amazonaws.com/import-forms/hoa-don-3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c.pdf',
      ),
    ).toBe('hoa-don.pdf')
    expect(attachmentName('export-forms/file-3F2A9C1E-7B4D-4E8A-9C21-0D5E6F7A8B9C')).toBe('file')
  })
  it('chuỗi giống UUID nằm giữa tên thì giữ', () => {
    expect(attachmentName('x/3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c-ban-ve.pdf')).toBe(
      '3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c-ban-ve.pdf',
    )
  })
})

describe('isImageAttachment', () => {
  it('đuôi ảnh, không phân biệt hoa thường, bỏ query', () => {
    expect(isImageAttachment('https://h/a.JPG?x=1')).toBe(true)
    expect(isImageAttachment('a.jpeg')).toBe(true)
    expect(isImageAttachment('a.png')).toBe(true)
    expect(isImageAttachment('a.webp')).toBe(true)
  })
  it('không phải ảnh', () => {
    expect(isImageAttachment('a.pdf')).toBe(false)
    expect(isImageAttachment('a.xlsx')).toBe(false)
  })
})

describe('openableAttachmentUrl', () => {
  it('chỉ http(s)', () => {
    expect(openableAttachmentUrl('https://h/a.pdf')).toBe('https://h/a.pdf')
    expect(openableAttachmentUrl('http://h/a.pdf')).toBe('http://h/a.pdf')
    expect(openableAttachmentUrl('import-forms/a.pdf')).toBeNull()
    expect(openableAttachmentUrl('javascript:alert(1)')).toBeNull()
  })
})
