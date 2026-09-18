import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*'],
      // KHÔNG bỏ dòng này. Thiếu resolver, boundaries không phân giải nổi alias `@/...`
      // và mọi rule im lặng cho qua — lint xanh trong khi luật không hề có hiệu lực.
      'import/resolver': { typescript: { project: './tsconfig.app.json' } },
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**' },
        { type: 'pages', pattern: 'src/pages/*', capture: ['slice'] },
        { type: 'widgets', pattern: 'src/widgets/*', capture: ['slice'] },
        { type: 'features', pattern: 'src/features/*', capture: ['slice'] },
        { type: 'entities', pattern: 'src/entities/*', capture: ['slice'] },
        { type: 'shared', pattern: 'src/shared/*', capture: ['segment'] },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: [{ element: { type: 'app' } }],
              allow: [
                { to: { element: { type: 'pages' } } },
                { to: { element: { type: 'widgets' } } },
                { to: { element: { type: 'features' } } },
                { to: { element: { type: 'entities' } } },
                { to: { element: { type: 'shared' } } },
              ],
            },
            {
              from: [{ element: { type: 'pages' } }],
              allow: [
                { to: { element: { type: 'widgets' } } },
                { to: { element: { type: 'features' } } },
                { to: { element: { type: 'entities' } } },
                { to: { element: { type: 'shared' } } },
              ],
            },
            {
              from: [{ element: { type: 'widgets' } }],
              allow: [
                { to: { element: { type: 'features' } } },
                { to: { element: { type: 'entities' } } },
                { to: { element: { type: 'shared' } } },
              ],
            },
            {
              from: [{ element: { type: 'features' } }],
              allow: [
                { to: { element: { type: 'entities' } } },
                { to: { element: { type: 'shared' } } },
              ],
            },
            {
              from: [{ element: { type: 'entities' } }],
              allow: [{ to: { element: { type: 'shared' } } }],
            },
            {
              from: [{ element: { type: 'shared' } }],
              allow: [{ to: { element: { type: 'shared' } } }],
            },
          ],
        },
      ],
      'boundaries/entry-point': [
        'error',
        {
          default: 'disallow',
          rules: [
            { target: ['pages', 'widgets', 'features', 'entities'], allow: 'index.ts' },
            { target: ['shared', 'app'], allow: '**' },
          ],
        },
      ],
      'boundaries/no-unknown-files': 'error',
    },
  },
  prettier,
)
