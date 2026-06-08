import globals from 'globals';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';

const recommendedRules = {
  ...security.configs.recommended.rules,
  ...sonarjs.configs.recommended.rules,
};

function asWarningRule(ruleConfig) {
  // 保留 'off' 规则不转换，避免意外启用已禁用的规则
  if (ruleConfig === 'off' || ruleConfig === 0) return 'off';
  if (Array.isArray(ruleConfig)) {
    if (ruleConfig[0] === 'off' || ruleConfig[0] === 0) return ruleConfig;
    return ['warn', ...ruleConfig.slice(1)];
  }
  return 'warn';
}

const recommendedWarningRules = Object.fromEntries(
  Object.entries(recommendedRules).map(([ruleName, ruleConfig]) => [
    ruleName,
    asWarningRule(ruleConfig),
  ])
);

const maintainabilityWarnings = {
  // 历史文件暂不做大范围拆分，先用 warning 暴露复杂度债务。
  'sonarjs/cognitive-complexity': 'warn',
  'sonarjs/file-header': 'off',
  'sonarjs/max-lines': 'warn',
  'sonarjs/max-lines-per-function': 'warn',
};

export default [
  {
    // 忽略构建产物和第三方目录。
    ignores: ['node_modules/', 'netlify/functions-build/', 'dist/', '.vite/'],
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    plugins: {
      security,
      sonarjs,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      ...recommendedWarningRules,
      ...maintainabilityWarnings,
      'no-eval': 'error',
      'no-var': 'warn',
      'prefer-const': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['test/**/*.{js,cjs,mjs}'],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'sonarjs/no-duplicate-string': 'warn',
    },
  },
];
