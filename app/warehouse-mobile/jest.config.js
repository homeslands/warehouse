module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.ts'],
  // Docs testing của Reanimated 4: resolver nạp bản web (JS) của reanimated/worklets thay cho bản
  // native; `setUpTests()` chạy sau khi có `expect` (thêm matcher `toHaveAnimatedStyle`).
  resolver: 'react-native-reanimated/jest/resolver',
  setupFilesAfterEnv: ['./jest.setup-after-env.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Điều kiện "react-native" của gói trỏ vào bản .mjs mà jest không biên dịch; test dùng bản CJS.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    '^lucide-react-native/icons/(.*)$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
}
