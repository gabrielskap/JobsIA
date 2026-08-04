import { spawnSync } from 'node:child_process';

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  console.error('DATABASE_URL_TEST é obrigatória para executar testes de integração. Nenhum teste foi iniciado.');
  process.exit(1);
}

const defaultFiles = [
  'server/tests/auth_cycle.test.ts',
  'server/tests/chat_persistence.test.ts',
  'server/tests/checklist_security.test.ts',
  'server/tests/interaction.test.ts',
  'server/tests/jobs.test.ts',
  'server/tests/knowledge_integration.test.ts',
  'server/tests/pdf.test.ts',
  'server/tests/rbac.test.ts',
  'server/tests/system_prompts.test.ts',
  'server/tests/validation.test.ts',
];

const requestedFiles = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=1', ...(requestedFiles.length > 0 ? requestedFiles : defaultFiles)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      JOBSIA_TEST_MODE: '1',
      DATABASE_URL: testDatabaseUrl,
    },
  }
);

process.exit(result.status ?? 1);
