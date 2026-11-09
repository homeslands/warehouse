// Kiểu cho matcher mà `setUpTests()` của Reanimated thêm vào (jest.setup-after-env.ts); gói không
// tự khai báo.
declare namespace jest {
  interface Matchers<R> {
    toHaveAnimatedStyle(
      style: Record<string, unknown>,
      config?: { shouldMatchAllProps?: boolean },
    ): R
  }
}
