import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import {
  findUsersDestructiveOperation,
  normalizeMigrationTransaction,
} from '../migrationSafety';

const migrationsDirectory = path.join(process.cwd(), 'migrations');

test('removes only top-level transaction statements from historic migrations', () => {
  const sql = `BEGIN;
DO $$
BEGIN
  PERFORM 1;
END
$$;
COMMIT;`;

  const normalized = normalizeMigrationTransaction(sql);

  assert.doesNotMatch(normalized, /^BEGIN;$/m);
  assert.doesNotMatch(normalized, /^COMMIT;$/m);
  assert.match(normalized, /DO \$\$\nBEGIN\n  PERFORM 1;/);
});

test('blocks destructive operations directed at public.users', () => {
  const destructiveStatements = [
    'DROP TABLE users;',
    'DROP TABLE IF EXISTS public.users CASCADE;',
    'TRUNCATE TABLE "users" RESTART IDENTITY;',
    'DELETE FROM ONLY public.users WHERE true;',
    'DROP SCHEMA public CASCADE;',
    'DROP OWNED BY jobsia_user;',
  ];

  for (const sql of destructiveStatements) {
    assert.notEqual(findUsersDestructiveOperation(sql), undefined, sql);
  }
});

test('rejects alternative PostgreSQL transaction-ending commands', () => {
  const controls = [
    'END;',
    'ABORT;',
    'START TRANSACTION;',
    "PREPARE TRANSACTION 'migration-guard';",
    "COMMIT PREPARED 'migration-guard';",
    "ROLLBACK PREPARED 'migration-guard';",
  ];

  for (const control of controls) {
    assert.throws(() => normalizeMigrationTransaction(`BEGIN;\n${control}`), Error, control);
  }
});

test('rejects END at EOF before a dynamic users drop can escape the transaction', () => {
  const sql = `DO $$
BEGIN
  EXECUTE 'DROP TABLE public.users';
END
$$;
END`;

  assert.equal(findUsersDestructiveOperation(sql), undefined);
  assert.throws(() => normalizeMigrationTransaction(sql), Error);
});

test('does not treat a backslash as an escape in an ordinary PostgreSQL string', () => {
  const sql = "DO $$\nBEGIN\n  EXECUTE 'DROP TABLE public.users';\nEND\n$$;\nSELECT 'x\\'; END";

  assert.equal(findUsersDestructiveOperation(sql), undefined);
  assert.throws(() => normalizeMigrationTransaction(sql), Error);
});

test('does not treat a dollar inside an identifier as a dollar-quote delimiter', () => {
  const sql = `DO $$
BEGIN
  EXECUTE 'DROP TABLE public.users';
END
$$;
SELECT 1 AS safe$tag$;
END`;

  assert.equal(findUsersDestructiveOperation(sql), undefined);
  assert.throws(() => normalizeMigrationTransaction(sql), Error);
});

test('does not treat a dollar after a Unicode identifier as a dollar-quote delimiter', () => {
  const sql = `DO $$
BEGIN
  EXECUTE 'DROP TABLE public.users';
END
$$;
SELECT 1 AS é$tag$;
END`;

  assert.equal(findUsersDestructiveOperation(sql), undefined);
  assert.throws(() => normalizeMigrationTransaction(sql), Error);
});

test('does not treat a string after a Unicode identifier as an E string', () => {
  const sql = "DO $$\nBEGIN\n  EXECUTE 'DROP TABLE public.users';\nEND\n$$;\nSELECT éE'x\\'; END";

  assert.equal(findUsersDestructiveOperation(sql), undefined);
  assert.throws(() => normalizeMigrationTransaction(sql), Error);
});

test('continues to recognize escaped quotes inside PostgreSQL E strings', () => {
  const sql = "BEGIN;\nSELECT E'foo\\'; END';\nCOMMIT;";

  assert.doesNotThrow(() => normalizeMigrationTransaction(sql));
});

test('rejects standalone PostgreSQL session-setting commands', () => {
  assert.throws(() => normalizeMigrationTransaction("SET standard_conforming_strings = 'off';"), Error);
  assert.throws(() => normalizeMigrationTransaction('SET search_path = public;'), Error);
  assert.throws(() => normalizeMigrationTransaction('RESET ALL;'), Error);
  assert.throws(() => normalizeMigrationTransaction('DISCARD ALL;'), Error);
});

test('does not flag comments or the non-destructive historical users migration', () => {
  assert.equal(findUsersDestructiveOperation('-- DROP TABLE users;'), undefined);

  const rbacMigration = fs.readFileSync(path.join(migrationsDirectory, '0011_add_rbac.sql'), 'utf8');
  assert.equal(findUsersDestructiveOperation(rbacMigration), undefined);
});

test('every numeric migration can run inside the runner transaction and preserves users', () => {
  const files = fs.readdirSync(migrationsDirectory)
    .filter(file => /^\d{4}_.*\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDirectory, file), 'utf8');
    assert.equal(findUsersDestructiveOperation(sql), undefined, file);
    assert.doesNotThrow(() => normalizeMigrationTransaction(sql), file);
  }
});
