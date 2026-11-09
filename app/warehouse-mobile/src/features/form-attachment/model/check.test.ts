import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  checkAttachment,
  documentUploadFile,
  imageUploadFile,
  uploadErrorKey,
} from './check'

describe('checkAttachment', () => {
  it('10 MB đúng biên thì qua, thêm 1 byte thì tooLarge', () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(checkAttachment({ size: ATTACHMENT_MAX_BYTES, mimeType: 'application/pdf' })).toBeNull()
    expect(checkAttachment({ size: ATTACHMENT_MAX_BYTES + 1, mimeType: 'application/pdf' })).toBe(
      'tooLarge',
    )
  })

  it('thiếu size thì không chặn theo cỡ', () => {
    expect(checkAttachment({ mimeType: 'image/jpeg' })).toBeNull()
    expect(checkAttachment({ size: null, mimeType: 'image/jpeg' })).toBeNull()
  })

  it('image/heic → badType; application/pdf qua; mimeType null / thiếu / lạ → badType', () => {
    expect(checkAttachment({ size: 10, mimeType: 'image/heic' })).toBe('badType')
    expect(checkAttachment({ size: 10, mimeType: 'application/pdf' })).toBeNull()
    expect(checkAttachment({ size: 10, mimeType: null })).toBe('badType')
    expect(checkAttachment({ size: 10 })).toBe('badType')
    expect(checkAttachment({ size: 10, mimeType: 'text/plain' })).toBe('badType')
  })

  it('đúng 8 loại backend nhận', () => {
    expect([...ATTACHMENT_MIME_TYPES].sort()).toEqual(
      [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].sort(),
    )
    for (const m of ATTACHMENT_MIME_TYPES) expect(checkAttachment({ mimeType: m })).toBeNull()
  })

  it('cả hai lỗi: sai loại thắng quá cỡ (báo loại trước, cỡ không còn nghĩa)', () => {
    expect(checkAttachment({ size: ATTACHMENT_MAX_BYTES + 1, mimeType: 'image/heic' })).toBe(
      'badType',
    )
  })
})

describe('imageUploadFile', () => {
  const at = new Date(1_762_000_000_000)

  it('ảnh JPEG (iOS .jpg / Android .jpeg) → chung-tu-<timestamp>.jpg, image/jpeg', () => {
    for (const uri of ['file:///c/ImagePicker/ab.jpg', 'file:///c/ImagePicker/ab.JPEG']) {
      expect(imageUploadFile({ uri, fileSize: 123 }, at)).toEqual({
        uri,
        name: `chung-tu-${at.getTime()}.jpg`,
        mimeType: 'image/jpeg',
        size: 123,
      })
    }
  })

  it('loại theo file đã xuất (đuôi uri), không theo mimeType của ảnh gốc', () => {
    // Android: `mimeType` là của ảnh GỐC (heic) dù file xuất (quality < 1) là JPEG.
    const f = imageUploadFile(
      { uri: 'file:///c/ImagePicker/x.jpeg', mimeType: 'image/heic', fileSize: 5 },
      at,
    )
    expect(f.mimeType).toBe('image/jpeg')
  })

  it('PNG / WebP giữ loại và đuôi; HEIC / lạ → mimeType null (bị chặn badType)', () => {
    expect(imageUploadFile({ uri: 'file:///a.png' }, at)).toMatchObject({
      name: `chung-tu-${at.getTime()}.png`,
      mimeType: 'image/png',
      size: null,
    })
    expect(imageUploadFile({ uri: 'file:///a.webp' }, at)).toMatchObject({
      name: `chung-tu-${at.getTime()}.webp`,
      mimeType: 'image/webp',
    })
    expect(imageUploadFile({ uri: 'file:///a.heic' }, at).mimeType).toBeNull()
    expect(checkAttachment(imageUploadFile({ uri: 'file:///a.heic' }, at))).toBe('badType')
  })
})

describe('uploadErrorKey', () => {
  const api = (statusCode: number, code?: number) => ({
    statusCode,
    code,
    timestamp: '',
    path: '',
    method: 'POST',
    message: 'x',
  })

  it('mã quá cỡ (121001) / HTTP 413 → tooLarge; sai loại (101329) → badType; còn lại → uploadFailed', () => {
    expect(uploadErrorKey(api(400, 121001))).toBe('tooLarge')
    expect(uploadErrorKey(api(413))).toBe('tooLarge')
    expect(uploadErrorKey(api(400, 101329))).toBe('badType')
    expect(uploadErrorKey(api(400, 999999))).toBe('uploadFailed')
    expect(uploadErrorKey(new Error('Network Error'))).toBe('uploadFailed')
  })
})

describe('documentUploadFile', () => {
  it('giữ tên có đuôi đúng; mimeType / size thiếu → null', () => {
    expect(
      documentUploadFile({
        uri: 'file:///a.pdf',
        name: 'hoa-don.pdf',
        mimeType: 'application/pdf',
        size: 9,
      }),
    ).toEqual({ uri: 'file:///a.pdf', name: 'hoa-don.pdf', mimeType: 'application/pdf', size: 9 })
    expect(documentUploadFile({ uri: 'file:///a', name: 'x.bin' })).toMatchObject({
      mimeType: null,
      size: null,
    })
  })

  it('backend lấy đuôi theo dấu chấm THỨ HAI: chấm thừa trong tên → "-"; thiếu đuôi → thêm theo MIME', () => {
    expect(
      documentUploadFile({
        uri: 'u',
        name: 'HĐ 01.11.2026.xlsx',
        mimeType: 'application/vnd.ms-excel',
      }).name,
    ).toBe('HĐ 01-11-2026.xlsx')
    expect(
      documentUploadFile({ uri: 'u', name: 'hoa-don', mimeType: 'application/pdf' }).name,
    ).toBe('hoa-don.pdf')
  })

  describe('MIME Android (octet-stream / thiếu / lạ)', () => {
    const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    it('octet-stream + .xlsx → MIME xlsx, qua kiểm', () => {
      const f = documentUploadFile({
        uri: 'u',
        name: 'bao-cao.xlsx',
        mimeType: 'application/octet-stream',
        size: 5,
      })
      expect(f.mimeType).toBe(XLSX)
      expect(checkAttachment(f)).toBeNull()
    })
    it('octet-stream + .exe → badType', () => {
      const f = documentUploadFile({
        uri: 'u',
        name: 'virus.exe',
        mimeType: 'application/octet-stream',
      })
      expect(f.mimeType).toBeNull()
      expect(checkAttachment(f)).toBe('badType')
    })
    it('thiếu MIME + HOA-DON.PDF → application/pdf', () => {
      expect(documentUploadFile({ uri: 'u', name: 'HOA-DON.PDF' }).mimeType).toBe('application/pdf')
    })
    it('MIME lạ ngoài danh sách + .docx → MIME docx; xls / doc / docx đủ', () => {
      expect(documentUploadFile({ uri: 'u', name: 'a.xls', mimeType: 'x/y' }).mimeType).toBe(
        'application/vnd.ms-excel',
      )
      expect(documentUploadFile({ uri: 'u', name: 'a.doc', mimeType: 'x/y' }).mimeType).toBe(
        'application/msword',
      )
      expect(documentUploadFile({ uri: 'u', name: 'a.docx', mimeType: 'x/y' }).mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
    })
    it('BE mới bắt đuôi khớp MIME: đuôi đã biết thì MIME theo đuôi (bỏ MIME báo lệch)', () => {
      expect(
        documentUploadFile({ uri: 'u', name: 'a.xlsx', mimeType: 'application/pdf' }).mimeType,
      ).toBe(XLSX)
      expect(
        documentUploadFile({
          uri: 'u',
          name: 'HĐ 01.11.2026.xlsx',
          mimeType: 'application/vnd.ms-excel',
        }).mimeType,
      ).toBe(XLSX)
      expect(
        documentUploadFile({ uri: 'u', name: 'scan.JPG', mimeType: 'image/png' }),
      ).toMatchObject({
        name: 'scan.JPG',
        mimeType: 'image/jpeg',
      })
    })
    it('đuôi lạ nhưng MIME báo hợp lệ → gắn đuôi theo MIME vào cả tên', () => {
      expect(
        documentUploadFile({ uri: 'u', name: 'HĐ 01.11.2026', mimeType: 'application/pdf' }),
      ).toMatchObject({ name: 'HĐ 01-11-2026.pdf', mimeType: 'application/pdf' })
    })
    it('đuôi lạ và MIME báo không hợp lệ → badType', () => {
      expect(documentUploadFile({ uri: 'u', name: 'a.bin', mimeType: 'x/y' }).mimeType).toBeNull()
    })
  })
})
