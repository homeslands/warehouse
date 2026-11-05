// Rule clean-code (task be-clean-code-20261104). ID BE-... tra ở .agents/skills/warehouse-api-dev (local).
// Chỉ thêm rule có baseline 0 (error) hoặc KHÔNG fixable (warn): `eslint --fix` (hook, `npm run lint`) áp fix
// cả rule warn, nên rule fixable còn vi phạm cũ (no-unnecessary-type-assertion, return-await,
// consistent-type-assertions) KHÔNG được đưa vào đây khi chưa dọn về 0.
// ESLint 8: mỗi rule 1 mức và `no-restricted-syntax` ở override GHI ĐÈ list gốc ⇒ selector chỉ có nhóm error;
// selector nhóm warn (BE-FUNC-03 params, BE-ERR-02 catch, BE-TX-01, BE-DATA-02 LIKE, BE-LOG-01 new Logger) để review.

// [BE-ARCH-04] process.env chỉ ở main.ts, src/config/**, src/app/app.module.ts.
const NO_PROCESS_ENV = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: '[BE-ARCH-04] Đọc cấu hình qua ConfigService, không process.env.',
};
// [BE-DATA-02] raw SQL chỉ ở migration và authority-seed.util.ts.
const NO_RAW_QUERY = {
  selector: "CallExpression[callee.property.name='query'][arguments.0.type=/Literal|TemplateLiteral/]",
  message: '[BE-DATA-02] Raw SQL .query(...) — dùng find options/QueryBuilder có tham số.',
};
const COMMON_RESTRICTED = [
  {
    selector:
      "Decorator > CallExpression[callee.name=/^(Body|Query)$/]:not(:has(NewExpression[callee.name='ValidationPipe']))",
    message: '[BE-DTO-01] @Body/@Query thiếu new ValidationPipe({ transform, whitelist }).',
  },
  {
    selector: "Decorator > CallExpression[callee.name='ApiResponse']",
    message: '[BE-API-01] @ApiResponse thô — dùng @ApiResponseWithType/@ApiPaginatedResponse.',
  },
  {
    selector: "Decorator > CallExpression[callee.name='HasRole']",
    message: '[BE-AUTH-01] @HasRole — dùng @RequireAuthority + migration seed.',
  },
  {
    selector: "CallExpression[callee.name='IsNumber'] Property[key.name='maxDecimalPlaces']",
    message: '[BE-DATA-01] @IsNumber({ maxDecimalPlaces }) — dùng IsDecimalWithScale.',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='trunc']",
    message:
      '[BE-DATA-01] Không dùng Math.trunc — dùng roundToScale cho DECIMAL; nếu cần trunc ở chỗ khác, eslint-disable kèm lý do.',
  },
  {
    selector:
      "ObjectExpression:has(> Property[key.name='type'][value.value='decimal']):not(:has(> Property[key.name='transformer']))",
    message: '[BE-DATA-01] Cột decimal thiếu transformer decimalToNumber.',
  },
];
// [BE-ARCH-01] Controller không inject repository.
const NO_REPO_IN_CONTROLLER = {
  selector: "Decorator > CallExpression[callee.name='InjectRepository']",
  message: '[BE-ARCH-01] Controller không @InjectRepository — đi qua service.',
};
// [BE-ERR-01] Service ném <Module>Exception + mã lỗi.
const SERVICE_ERRORS = [
  {
    selector:
      'ThrowStatement > NewExpression[callee.name=/^(BadRequest|NotFound|Conflict|UnprocessableEntity|InternalServerError)Exception$/]',
    message: '[BE-ERR-01] Service không ném HttpException dựng sẵn — dùng <Module>Exception + mã lỗi.',
  },
  {
    selector: "ThrowStatement > NewExpression[callee.name='Error']",
    message: '[BE-ERR-01] Service không throw new Error — dùng <Module>Exception + mã lỗi.',
  },
];
const restricted = (...items) => ['error', ...items];

// [BE-FUNC-01][BE-FUNC-02] Kích thước/độ phức tạp — áp mọi file src (tắt cho spec/migration/mapper ở overrides).
const SIZE_RULES = {
  'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
  complexity: ['warn', 12],
  'max-depth': ['warn', 3],
};
const SIZE_RULES_OFF = Object.fromEntries(Object.keys(SIZE_RULES).map((rule) => [rule, 'off']));

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    // Bắt buộc cho rule typed (no-floating-promises, no-misused-promises, await-thenable).
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

    // --- error: baseline 0 ---
    'no-console': 'error', // [BE-LOG-01]
    'no-else-return': ['error', { allowElseIf: false }], // [BE-FUNC-04] fixable, baseline 0
    '@typescript-eslint/no-floating-promises': 'error', // [BE-TYPE-03]
    '@typescript-eslint/no-misused-promises': 'error', // [BE-TYPE-03]
    '@typescript-eslint/await-thenable': 'error', // [BE-TYPE-03]
    'no-restricted-syntax': restricted(...COMMON_RESTRICTED, NO_PROCESS_ENV, NO_RAW_QUERY),

    // --- warn: còn vi phạm cũ, KHÔNG fixable ---
    '@typescript-eslint/no-explicit-any': ['warn', { fixToUnknown: false }], // [BE-TYPE-01] giữ fixToUnknown: false
    '@typescript-eslint/no-non-null-assertion': 'warn', // [BE-TYPE-02] chỉ có suggestion
    '@typescript-eslint/naming-convention': [
      'warn', // [BE-NAME-01]
      { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
      { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
      { selector: 'function', format: ['camelCase', 'PascalCase'] },
      { selector: 'typeLike', format: ['PascalCase'] },
      { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
      { selector: 'import', format: null },
      { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
      { selector: 'classProperty', modifiers: ['static'], format: ['camelCase', 'UPPER_CASE'] },
    ],
    ...SIZE_RULES,
  },
  // CẢNH BÁO: file khớp nhiều glob override thì override khai SAU thay hẳn list `no-restricted-syntax` của override
  // trước (không merge). Thêm glob mới chồng lên glob cũ phải tự gộp đủ selector cần giữ.
  overrides: [
    {
      files: ['src/**/*.controller.ts'],
      rules: {
        'no-restricted-syntax': restricted(...COMMON_RESTRICTED, NO_PROCESS_ENV, NO_RAW_QUERY, NO_REPO_IN_CONTROLLER),
      },
    },
    {
      files: ['src/**/*.service.ts'],
      rules: {
        'no-restricted-syntax': restricted(...COMMON_RESTRICTED, NO_PROCESS_ENV, NO_RAW_QUERY, ...SERVICE_ERRORS),
        // [BE-FUNC-05]
        'no-magic-numbers': [
          'warn',
          { ignore: [-1, 0, 1, 2], ignoreDefaultValues: true, ignoreArrayIndexes: true },
        ],
        '@typescript-eslint/explicit-module-boundary-types': 'warn', // [BE-TYPE-04]
      },
    },
    {
      // [BE-ARCH-04] nơi được đọc process.env
      files: ['src/main.ts', 'src/config/**/*.ts', 'src/app/app.module.ts'],
      rules: { 'no-restricted-syntax': restricted(...COMMON_RESTRICTED, NO_RAW_QUERY) },
    },
    {
      // [BE-DATA-02] nơi được viết raw SQL
      files: ['src/authority/authority-seed.util.ts'],
      rules: { 'no-restricted-syntax': restricted(...COMMON_RESTRICTED, NO_PROCESS_ENV) },
    },
    {
      // [BE-NAME-01] tên biến môi trường UPPER_CASE
      files: ['src/app/env.validation.ts'],
      rules: { '@typescript-eslint/naming-convention': 'off' },
    },
    {
      // [BE-FUNC-01][BE-FUNC-02] mapper là khai báo map dài, không phải logic
      files: ['src/**/*.mapper.ts'],
      rules: SIZE_RULES_OFF,
    },
    {
      files: ['src/migrations/**/*.ts'],
      rules: {
        ...SIZE_RULES_OFF,
        '@typescript-eslint/naming-convention': 'off',
        'no-restricted-syntax': 'off',
      },
    },
    {
      files: ['src/**/*.spec.ts', 'test/**/*.ts'],
      rules: {
        ...SIZE_RULES_OFF,
        '@typescript-eslint/naming-convention': 'off',
        'no-restricted-syntax': 'off',
      },
    },
  ],
};
