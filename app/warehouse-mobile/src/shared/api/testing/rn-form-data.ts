/**
 * Jest chạy trên Node, nơi `FormData` là của undici (biến object `{ uri, name, type }` thành chuỗi
 * "[object Object]"). RN thật giữ nguyên object trong `_parts`. Hàm này thay `FormData` toàn cục bằng
 * bản ghi lại đúng kiểu RN để test thấy được phần thân đã gửi; trả hàm khôi phục.
 */
export function installRnFormData(): () => void {
  const original = globalThis.FormData
  class RnFormData {
    _parts: [string, unknown][] = []
    // axios nhận ra FormData qua `instanceof` hoặc tag này; thiếu thì nó chuyển object sang FormData khác.
    get [Symbol.toStringTag]() {
      return 'FormData'
    }
    append(key: string, value: unknown) {
      this._parts.push([key, value])
    }
  }
  globalThis.FormData = RnFormData as unknown as typeof FormData
  return () => {
    globalThis.FormData = original
  }
}
