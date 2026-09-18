import { describe, expect, it } from 'vitest'
import { renderEnvError } from './render-env-error'

const ENV_ERROR = new Error(
  'Thiếu biến môi trường VITE_API_BASE_URL. Chạy `cp .env.example .env` rồi điền giá trị.',
)

describe('renderEnvError', () => {
  it('hiện tên biến còn thiếu để người đọc biết phải sửa gì', () => {
    const container = document.createElement('div')

    renderEnvError(container, ENV_ERROR)

    expect(container.textContent).toContain('VITE_API_BASE_URL')
  })

  it('hiện cả câu lệnh khắc phục, không bắt người dùng tự đoán', () => {
    const container = document.createElement('div')

    renderEnvError(container, ENV_ERROR)

    expect(container.textContent).toContain('cp .env.example .env')
  })

  it('không ném khi error không phải Error — lưới an toàn không được tự sập', () => {
    const container = document.createElement('div')

    expect(() => renderEnvError(container, 'hỏng ở đâu đó')).not.toThrow()
    expect(container.textContent).toContain('hỏng ở đâu đó')
  })

  it('ghi đè nội dung cũ thay vì nối thêm', () => {
    const container = document.createElement('div')
    container.textContent = 'nội dung cũ'

    renderEnvError(container, ENV_ERROR)

    expect(container.textContent).not.toContain('nội dung cũ')
  })
})
