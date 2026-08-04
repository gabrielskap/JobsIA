import { Pool } from 'pg';

const isTestMode = process.env.JOBSIA_TEST_MODE === '1';
if (isTestMode && !process.env.DATABASE_URL_TEST) {
  throw new Error('JOBSIA_TEST_MODE requer DATABASE_URL_TEST; a suíte não pode usar DATABASE_URL compartilhada.');
}

export const pool = new Pool({
  connectionString: isTestMode ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL,
});
