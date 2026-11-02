import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Layer boundaries. Domain code must stay pure so it translates directly to
    // C# later without untangling framework imports.
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'next/*', '@supabase/*'],
              message: 'domain code must stay framework-free',
            },
            {
              group: ['@/app/*', '@/components/*', '@/lib/supabase/*'],
              message: 'domain code must not depend on app or infrastructure',
            },
          ],
        },
      ],
    },
  },
  {
    // Pages and components must not reach into repositories or the admin client.
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/supabase/admin'],
              message: 'the service-role client is for services and cron routes only',
            },
          ],
        },
      ],
    },
  },
];

export default config;
