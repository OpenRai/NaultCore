const angularPlugin = require('@angular-eslint/eslint-plugin');
const templatePlugin = require('@angular-eslint/eslint-plugin-template');
const templateParser = require('@angular-eslint/template-parser');
const typescriptParser = require('@typescript-eslint/parser');

function recommendedRules(plugin, namespace) {
  return Object.fromEntries(
    Object.entries(plugin.rules)
      .filter(([, rule]) => rule.meta.docs.recommended === 'recommended')
      .map(([name]) => [`${namespace}/${name}`, 'error']),
  );
}

module.exports = [
  {
    ignores: ['projects/**/*'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: ['tsconfig.json', 'e2e/tsconfig.json'],
      },
    },
    plugins: {
      '@angular-eslint': angularPlugin,
      '@angular-eslint/template': templatePlugin,
    },
    processor: templatePlugin.processors['extract-inline-html'],
    rules: {
      ...recommendedRules(angularPlugin, '@angular-eslint'),
      '@angular-eslint/component-selector': ['error', {
        prefix: 'app',
        style: 'kebab-case',
        type: 'element',
      }],
      '@angular-eslint/directive-selector': ['error', {
        prefix: 'app',
        style: 'camelCase',
        type: 'attribute',
      }],
      '@angular-eslint/no-empty-lifecycle-method': 'off',
      // Wallet state is mutable and is updated by existing services; migrate this
      // deliberately with the standalone architecture rather than changing it
      // incidentally during the framework upgrade.
      '@angular-eslint/prefer-on-push-component-change-detection': 'off',
      '@angular-eslint/prefer-standalone': 'off',
    },
  },
  {
    files: ['**/*.html'],
    languageOptions: {
      parser: templateParser,
    },
    plugins: {
      '@angular-eslint/template': templatePlugin,
    },
    rules: {
      ...recommendedRules(templatePlugin, '@angular-eslint/template'),
      '@angular-eslint/template/eqeqeq': 'off',
    },
  },
];
