import type { Client } from 'pg';

export interface UsersSnapshot {
  exists: boolean;
  relationOid?: string;
  rowCount?: string;
}

function blankPreservingLines(value: string): string {
  return value.replace(/[^\r\n]/g, ' ');
}

function isEscapeStringLiteral(sql: string, quoteIndex: number): boolean {
  const prefixIndex = quoteIndex - 1;
  if (prefixIndex < 0 || !/[Ee]/.test(sql[prefixIndex])) {
    return false;
  }

  const characterBeforePrefix = sql[prefixIndex - 1];
  return !characterBeforePrefix || !/[A-Za-z0-9_$\u0080-\uFFFF]/.test(characterBeforePrefix);
}

function isDollarQuoteStart(sql: string, dollarIndex: number): boolean {
  const characterBeforeDollar = sql[dollarIndex - 1];
  // PostgreSQL requires whitespace between an identifier/keyword and a
  // dollar-quoted string. A dollar within an unquoted identifier is not a
  // delimiter and must remain visible to the transaction-control scanner.
  // Treat every non-ASCII character conservatively as identifier content too.
  // PostgreSQL accepts non-ASCII letters in unquoted identifiers, while a
  // false negative here would hide the rest of a migration from the guard.
  return !characterBeforeDollar || !/[A-Za-z0-9_$\u0080-\uFFFF]/.test(characterBeforeDollar);
}

/**
 * Masks comments and literal bodies while preserving the original length. This
 * lets the migration guard inspect executable SQL without being confused by a
 * comment, a string, or a PL/pgSQL DO block mentioning a destructive command.
 */
function maskSql(sql: string, maskDoubleQuotedIdentifiers: boolean): string {
  let masked = '';

  for (let index = 0; index < sql.length;) {
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index);
      const nextIndex = end === -1 ? sql.length : end;
      masked += blankPreservingLines(sql.slice(index, nextIndex));
      index = nextIndex;
      continue;
    }

    if (sql.startsWith('/*', index)) {
      let cursor = index + 2;
      let depth = 1;
      while (cursor < sql.length && depth > 0) {
        if (sql.startsWith('/*', cursor)) {
          depth++;
          cursor += 2;
        } else if (sql.startsWith('*/', cursor)) {
          depth--;
          cursor += 2;
        } else {
          cursor++;
        }
      }
      masked += blankPreservingLines(sql.slice(index, cursor));
      index = cursor;
      continue;
    }

    if (sql[index] === "'") {
      const escapeStringLiteral = isEscapeStringLiteral(sql, index);
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === "'") {
          if (sql[cursor + 1] === "'") {
            cursor += 2;
            continue;
          }
          cursor++;
          break;
        }
        if (escapeStringLiteral && sql[cursor] === '\\' && cursor + 1 < sql.length) {
          cursor += 2;
          continue;
        }
        cursor++;
      }
      masked += blankPreservingLines(sql.slice(index, cursor));
      index = cursor;
      continue;
    }

    if (maskDoubleQuotedIdentifiers && sql[index] === '"') {
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === '"') {
          if (sql[cursor + 1] === '"') {
            cursor += 2;
            continue;
          }
          cursor++;
          break;
        }
        cursor++;
      }
      masked += blankPreservingLines(sql.slice(index, cursor));
      index = cursor;
      continue;
    }

    if (sql[index] === '$' && isDollarQuoteStart(sql, index)) {
      const dollarTag = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (dollarTag) {
        const end = sql.indexOf(dollarTag, index + dollarTag.length);
        const nextIndex = end === -1 ? sql.length : end + dollarTag.length;
        masked += blankPreservingLines(sql.slice(index, nextIndex));
        index = nextIndex;
        continue;
      }
    }

    masked += sql[index];
    index++;
  }

  return masked;
}

/**
 * Historic migrations include their own BEGIN/COMMIT statements. The runner
 * owns the transaction boundary so that the SQL and schema_migrations record
 * are committed or rolled back together.
 */
export function normalizeMigrationTransaction(sql: string): string {
  const masked = maskSql(sql, true);
  const transactionPattern = /(^|;)(\s*)(?:BEGIN(?:\s+(?:WORK|TRANSACTION))?|COMMIT(?:\s+(?:WORK|TRANSACTION))?|ROLLBACK(?:\s+(?:WORK|TRANSACTION))?)(?:\s+AND\s+CHAIN)?\s*;/gi;
  const ranges: Array<{ start: number; end: number }> = [];

  for (const match of masked.matchAll(transactionPattern)) {
    const prefixLength = match[1].length + match[2].length;
    const start = (match.index ?? 0) + prefixLength;
    ranges.push({ start, end: (match.index ?? 0) + match[0].length });
  }

  let normalized = '';
  let cursor = 0;
  for (const range of ranges) {
    normalized += sql.slice(cursor, range.start);
    normalized += blankPreservingLines(sql.slice(range.start, range.end));
    cursor = range.end;
  }
  normalized += sql.slice(cursor);

  // END is an alias for COMMIT and ABORT is an alias for ROLLBACK in
  // PostgreSQL. Prepared-transaction statements are also rejected: allowing
  // any of them would let a migration escape the transaction owned by runner.
  const remainingTransactionControl = /(?:^|;)\s*(?:BEGIN\b[^;]*|START\s+TRANSACTION\b[^;]*|COMMIT\b[^;]*|END\b[^;]*|ROLLBACK\b[^;]*|ABORT\b[^;]*|PREPARE\s+TRANSACTION\b[^;]*)(?:;|$)/i;
  if (remainingTransactionControl.test(maskSql(normalized, true))) {
    throw new Error('A migration cannot control its own transaction; use no BEGIN, COMMIT, END, ROLLBACK, ABORT, or prepared transaction commands.');
  }

  // The runner forces standard_conforming_strings to `on` before execution.
  // Migrations cannot change session state: a different parser setting could
  // make a backslash mean something different to PostgreSQL and this scanner.
  const changesSessionState = /(?:^|;)\s*(?:SET|RESET|DISCARD)\b[^;]*(?:;|$)/i;
  if (changesSessionState.test(maskSql(normalized, true))) {
    throw new Error('A migration cannot execute standalone SET, RESET, or DISCARD commands.');
  }

  return normalized;
}

const usersIdentifier = '(?:"?public"?\\s*\\.\\s*)?"?users"?';

function containsUsersRelation(list: string): boolean {
  const relationInList = new RegExp(`(?:^|,)\\s*(?:ONLY\\s+)?${usersIdentifier}(?=\\s|,|;|$)`, 'i');
  return relationInList.test(list);
}

/**
 * Reject destructive SQL before it reaches PostgreSQL. The transaction-level
 * snapshot below is a second line of defense if a future migration evades a
 * textual pattern.
 */
export function findUsersDestructiveOperation(sql: string): string | undefined {
  const executableSql = maskSql(sql, false);

  const destructiveTableStatements = [
    { pattern: /\bDROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+([\s\S]*?)(?:;|$)/gi, operation: 'DROP TABLE' },
    { pattern: /\bTRUNCATE(?:\s+TABLE)?\s+([\s\S]*?)(?:;|$)/gi, operation: 'TRUNCATE' },
  ];

  for (const { pattern, operation } of destructiveTableStatements) {
    for (const match of executableSql.matchAll(pattern)) {
      if (containsUsersRelation(match[1])) {
        return operation;
      }
    }
  }

  const deleteUsers = new RegExp(`\\bDELETE\\s+FROM\\s+(?:ONLY\\s+)?${usersIdentifier}(?=\\s|;|$)`, 'i');
  if (deleteUsers.test(executableSql)) {
    return 'DELETE FROM';
  }

  if (/\bDROP\s+SCHEMA(?:\s+IF\s+EXISTS)?\s+"?public"?(?=\s|;|$)/i.test(executableSql)) {
    return 'DROP SCHEMA public';
  }

  if (/\bDROP\s+OWNED\b/i.test(executableSql)) {
    return 'DROP OWNED';
  }

  return undefined;
}

export function assertMigrationDoesNotThreatenUsers(file: string, sql: string): void {
  const operation = findUsersDestructiveOperation(sql);
  if (operation) {
    throw new Error(`Migração ${file} bloqueada: ${operation} pode apagar a tabela ou os registros de public.users.`);
  }
}

export async function lockAndCaptureUsers(client: Client): Promise<UsersSnapshot> {
  const initial = await captureUsersSnapshot(client);
  if (!initial.exists) {
    return initial;
  }

  // Keep the row count stable while the migration is evaluated and committed.
  await client.query('LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE');
  return captureUsersSnapshot(client);
}

export async function assertUsersPreserved(client: Client, before: UsersSnapshot): Promise<void> {
  const after = await captureUsersSnapshot(client);
  if (!after.exists) {
    throw new Error('Proteção de migração acionada: public.users não existe após a migration.');
  }

  if (before.exists && after.relationOid !== before.relationOid) {
    throw new Error('Proteção de migração acionada: public.users foi recriada durante a migration.');
  }

  if (before.exists && after.rowCount !== before.rowCount) {
    throw new Error('Proteção de migração acionada: a quantidade de registros em public.users foi alterada.');
  }
}

async function captureUsersSnapshot(client: Client): Promise<UsersSnapshot> {
  const relation = await client.query<{ oid: string }>(`
    SELECT c.oid::text AS oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'users'
      AND c.relkind IN ('r', 'p')
  `);

  if (relation.rows.length === 0) {
    return { exists: false };
  }

  const count = await client.query<{ row_count: string }>('SELECT COUNT(*)::bigint::text AS row_count FROM public.users');
  return {
    exists: true,
    relationOid: relation.rows[0].oid,
    rowCount: count.rows[0].row_count,
  };
}
