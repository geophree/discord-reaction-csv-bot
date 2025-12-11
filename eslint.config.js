import prettier from 'eslint-plugin-prettier/recommended';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import globals from 'globals';
import { fileURLToPath } from 'node:url';

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url));

export default [
  includeIgnoreFile(gitignorePath, 'Imported .gitignore patterns'),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  js.configs.recommended,
  prettier,
];
