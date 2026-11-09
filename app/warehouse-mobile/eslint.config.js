const { defineConfig, globalIgnores } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')
const prettier = require('eslint-config-prettier/flat')

module.exports = defineConfig([
  expoConfig,
  prettier,
  globalIgnores(['dist/*', '.expo/*', 'node_modules/*']),
  {
    // Icon chỉ import qua `shared/ui/icons` (subpath từng icon): barrel gốc làm bundle phình ~1.9 MB.
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react-native',
              message: "Import icon từ '@/shared/ui/icons' (xem docs/agents/ui-foundations.md).",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/ui/icons.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
])
