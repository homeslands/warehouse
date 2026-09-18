import { renderEnvError } from '@/app/render-env-error'
import { getEnv } from '@/shared/config/env'

const container = document.getElementById('root')!

// `import` tĩnh được hoisted và chạy TRƯỚC mọi câu lệnh trong file này. `shared/api/http`
// gọi getEnv() ở top-level, nên nếu nó được import tĩnh ở đây thì lỗi thiếu env sẽ ném ra
// trước khi dòng try dưới đây kịp tồn tại — và người dùng lại thấy màn hình trắng.
// Vì vậy phần còn lại của app nạp bằng import() ĐỘNG, sau khi env đã được xác nhận.
try {
  getEnv()
  void import('@/app/bootstrap').then(({ bootstrap }) => bootstrap(container))
} catch (error) {
  renderEnvError(container, error)
}
