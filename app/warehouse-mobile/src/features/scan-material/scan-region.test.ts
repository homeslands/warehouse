import { acceptsBarcode, barcodeBox, barcodeCenter, MIN_INSIDE, REGION_SLACK } from './scan-region'

const view = { width: 390, height: 844 }
// Khung ngắm 260×260 giữa màn: x 65..325, y 292..552.
const region = { x: 65, y: 292, width: 260, height: 260 }
const corners = (x: number, y: number, w = 40, h = 20) => ({
  cornerPoints: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
})

describe('barcodeBox / barcodeCenter', () => {
  it('khung bao từ các góc; không có góc thì bounds; không có gì → null', () => {
    expect(barcodeBox(corners(100, 400))).toEqual({ x: 100, y: 400, width: 40, height: 20 })
    expect(barcodeCenter(corners(100, 400))).toEqual({ x: 120, y: 410 })
    expect(
      barcodeCenter({
        cornerPoints: [],
        bounds: { origin: { x: 10, y: 20 }, size: { width: 100, height: 40 } },
      }),
    ).toEqual({ x: 60, y: 40 })
    expect(
      barcodeBox({
        cornerPoints: [],
        bounds: { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } },
      }),
    ).toBeNull()
    expect(barcodeCenter({})).toBeNull()
  })
})

describe('acceptsBarcode', () => {
  it('nhận mã nằm gọn trong khung, kể cả chạm sát mép (nới REGION_SLACK)', () => {
    expect(acceptsBarcode(corners(170, 410), region, view)).toBe(true)
    // Mép trái mã lệch ra ngoài khung đúng REGION_SLACK → vẫn trọn trong khung đã nới.
    expect(acceptsBarcode(corners(65 - REGION_SLACK, 410), region, view)).toBe(true)
  })

  it('bỏ mã chỉ lọt MỘT PHẦN vào khung (lướt qua khi đưa máy lên) dù tâm đã trong khung', () => {
    // Mã 100×40, chỉ ~60% nằm trong khung (tâm vẫn trong khung) → bỏ.
    const x = 325 + REGION_SLACK - 60
    expect(barcodeCenter(corners(x, 410, 100, 40))!.x).toBeLessThan(325 + REGION_SLACK)
    expect(acceptsBarcode(corners(x, 410, 100, 40), region, view)).toBe(false)
    // Lệch ít hơn: đúng MIN_INSIDE trong khung → nhận.
    const x2 = 325 + REGION_SLACK - 100 * MIN_INSIDE
    expect(acceptsBarcode(corners(x2, 410, 100, 40), region, view)).toBe(true)
  })

  it('bỏ mã lọt ở vùng tối ngoài khung (nhãn khác ở mép hình)', () => {
    expect(acceptsBarcode(corners(10, 100), region, view)).toBe(false)
    expect(acceptsBarcode(corners(170, 700), region, view)).toBe(false)
  })

  it('không đủ thông tin → nhận như cũ (không chặn nhầm)', () => {
    expect(acceptsBarcode(corners(10, 100), null, view)).toBe(true)
    expect(acceptsBarcode(corners(10, 100), region, null)).toBe(true)
    expect(acceptsBarcode({ cornerPoints: [] }, region, view)).toBe(true)
    // Toạ độ ngoài khung camera (lạ) → không lọc.
    expect(acceptsBarcode(corners(2000, 3000), region, view)).toBe(true)
  })
})
