import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      // Laravel 參考片段・宿主環境 globals・非 monorepo 建置目標
      'examples/laravel/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 安全鐵律：HTML sink 只准走 HtmlPolicy，全域禁止 innerHTML 等 sink
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: '禁止 `.innerHTML =`，走 HtmlPolicy',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: '禁止 insertAdjacentHTML，走 HtmlPolicy',
        },
        {
          selector: "CallExpression[callee.object.name='document'][callee.property.name='write']",
          message: '禁止 document.write，走 HtmlPolicy',
        },
      ],
    },
  },
  {
    // policy 模組是唯一受控 HTML sink，允許 innerHTML 等 sink
    files: ['packages/core/src/policy/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
)
