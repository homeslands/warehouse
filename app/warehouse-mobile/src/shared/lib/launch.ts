import { create } from 'zustand'

/**
 * Lớp phủ logo lúc mở app (`bootstrap/LaunchOverlay`) đã chạy xong chưa — để màn bên dưới (màn chào)
 * chỉ bắt đầu chuyển động khi người dùng thực sự nhìn thấy nó. Chỉ một lần trong đời app.
 */
export const useLaunch = create<{ done: boolean }>(() => ({ done: false }))

export function markLaunchDone(): void {
  useLaunch.setState({ done: true })
}
