import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'assets/**', 'client/public/gen/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // plantilla del service worker: vite.config.ts rellena __PRECACHE__ al compilar
    files: ['client/pwa/**/*.js'],
    languageOptions: { globals: { ...globals.serviceworker, __PRECACHE__: 'readonly' } },
  },
  {
    // La simulación debe ser determinista: nada de Math.random ni relojes.
    files: ['shared/src/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Usa el RNG con semilla (sim/rng.ts).' },
        {
          object: 'Math',
          property: 'hypot',
          message: 'Math.hypot no es idéntico entre motores: usa dist() de sim/math.ts.',
        },
        { object: 'Math', property: 'pow', message: 'Math.pow no es exacto entre motores.' },
        { object: 'Date', property: 'now', message: 'La simulación no puede leer el reloj.' },
      ],
    },
  },
);
