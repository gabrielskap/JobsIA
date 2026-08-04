import 'dotenv/config';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

// This test executes rollback_schema.sql and must use a dedicated test database.
const connectionString = process.env.DATABASE_URL_TEST;

async function main() {
  if (process.env.NODE_ENV?.toLowerCase() === 'production') {
    console.error('test:schema é bloqueado em produção porque executa rollback_schema.sql.');
    process.exit(1);
  }

  if (!connectionString) {
    console.error('DATABASE_URL_TEST is required for test:schema. DATABASE_URL is never used as a fallback.');
    process.exit(1);
  }

  if (process.env.JOBSIA_ALLOW_DESTRUCTIVE_SCHEMA_TEST !== '1') {
    console.error('Set JOBSIA_ALLOW_DESTRUCTIVE_SCHEMA_TEST=1 to run this destructive test on a dedicated test database.');
    process.exit(1);
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL === connectionString) {
    console.error('DATABASE_URL_TEST must not be the same connection string as DATABASE_URL.');
    process.exit(1);
  }

  console.log(`🔌 Conectando ao banco de dados para testes...`);
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    const dbName = (client as any).connectionParameters?.database || 'desconhecido';
    if (!/(^|[_-])test([_-]|$)/i.test(dbName)) {
      throw new Error(`test:schema only accepts a database whose name contains a test marker; received "${dbName}".`);
    }
    console.log(`✅ Conectado à base de dados: "${dbName}"`);

    // =========================================================================
    // TESTE FLUXO 1: EXECUÇÃO HISTÓRICA E VALIDAÇÃO
    // =========================================================================
    console.log('\n--- Iniciando Teste do Fluxo Histórico ---');
    
    console.log('🔄 Executando Rollback inicial para limpar o banco...');
    await runSqlFile(client, path.join(MIGRATIONS_DIR, 'rollback_schema.sql'));

    console.log('📦 Aplicando sequência de migrações históricas...');
    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => /^\d{4}_.*\.sql$/.test(f))
      .sort(); // Ordenar numericamente (ex: 0001, 0002...)

    for (const file of migrationFiles) {
      console.log(`  -> Aplicando migração: ${file}`);
      await runSqlFile(client, path.join(MIGRATIONS_DIR, file));
    }

    console.log('🔍 Validando integridade do schema gerado pelo fluxo histórico...');
    await validateSchema(client);
    console.log('✅ Validação do Fluxo Histórico concluída com sucesso!');

    // =========================================================================
    // TESTE FLUXO 2: EXECUÇÃO BASELINE E VALIDAÇÃO
    // =========================================================================
    console.log('\n--- Iniciando Teste do Fluxo Baseline ---');
    
    console.log('🔄 Executando Rollback intermediário...');
    await runSqlFile(client, path.join(MIGRATIONS_DIR, 'rollback_schema.sql'));

    console.log('📦 Aplicando migração baseline diretamente...');
    await runSqlFile(client, path.join(MIGRATIONS_DIR, 'baseline_schema.sql'));

    console.log('🔍 Validando integridade do schema gerado pelo baseline...');
    await validateSchema(client);
    console.log('✅ Validação do Fluxo Baseline concluída com sucesso!');

    // =========================================================================
    // RESTAURAÇÃO / LIMPEZA FINAL
    // =========================================================================
    if (!process.env.DATABASE_URL_TEST) {
      console.log('\n📦 Restaurando o Baseline Schema para o ambiente de desenvolvimento...');
      await runSqlFile(client, path.join(MIGRATIONS_DIR, 'baseline_schema.sql'));
      console.log('✅ Baseline restaurado.');
    } else {
      console.log('\n🔄 Executando Rollback final de limpeza para base de testes...');
      await runSqlFile(client, path.join(MIGRATIONS_DIR, 'rollback_schema.sql'));
      console.log('✅ Base de testes limpa.');
    }

    console.log('\n🚀 TESTES CONCLUÍDOS COM SUCESSO! O BANCO DE DADOS É INSTALÁVEL E ATUALIZÁVEL.');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Erro durante a validação do schema do banco:');
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

async function runSqlFile(client: Client, filePath: string) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await client.query(sql);
}

async function validateSchema(client: Client) {
  // 1. Validar Tabelas Esperadas
  const expectedTables = [
    'users',
    'JobsIA_profiles',
    'JobsIA_types',
    'JobsIA_parameters',
    'JobsIA_conversations',
    'JobsIA_messages',
    'JobsIA_checklists',
    'JobsIA_dictionary_terms',
    'JobsIA_norm_rules',
    'JobsIA_system_prompts'
  ];

  for (const table of expectedTables) {
    const res = await client.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_name = $1
       )`,
      [table]
    );
    if (!res.rows[0].exists) {
      throw new Error(`A tabela "${table}" não foi criada no banco de dados.`);
    }
    console.log(`  [OK] Tabela "${table}" existe.`);
  }

  // 2. Validar Views Esperadas
  const expectedViews = ['v_checklist_kpis', 'v_checklist_history'];
  for (const view of expectedViews) {
    const res = await client.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.views 
         WHERE table_schema = 'public' AND table_name = $1
       )`,
      [view]
    );
    if (!res.rows[0].exists) {
      throw new Error(`A view "${view}" não foi criada no banco de dados.`);
    }
    console.log(`  [OK] View "${view}" existe.`);
  }

  // 3. Validar Colunas Críticas em JobsIA_profiles
  const expectedProfileColumns = ['matricula', 'avatar_url', 'is_active'];
  for (const col of expectedProfileColumns) {
    const res = await client.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = 'JobsIA_profiles' AND column_name = $1
       )`,
      [col]
    );
    if (!res.rows[0].exists) {
      throw new Error(`A tabela "JobsIA_profiles" está sem a coluna crítica: "${col}".`);
    }
    console.log(`  [OK] Coluna "JobsIA_profiles.${col}" existe.`);
  }

  // 4. Validar FK user_id em JobsIA_checklists referenciando users(id)
  const fkRes = await client.query(`
    SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_name = 'JobsIA_checklists'
      AND kcu.column_name = 'user_id'
  `);

  if (fkRes.rows.length === 0) {
    throw new Error('A tabela "JobsIA_checklists" não possui a chave estrangeira (FK) na coluna "user_id".');
  }

  const fk = fkRes.rows[0];
  if (fk.foreign_table_name !== 'users' || fk.foreign_column_name !== 'id') {
    throw new Error(`A FK "user_id" em "JobsIA_checklists" aponta para "${fk.foreign_table_name}.${fk.foreign_column_name}" ao invés de "users.id".`);
  }
  console.log(`  [OK] FK "JobsIA_checklists.user_id" -> "users.id" validada.`);

  // 5. Validar constraint CHECK de parameter_type em JobsIA_parameters
  const checkRes = await client.query(`
    SELECT cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
    WHERE tc.table_name = 'JobsIA_parameters' AND tc.constraint_type = 'CHECK'
      AND cc.check_clause LIKE '%parameter_type%'
  `);

  if (checkRes.rows.length === 0) {
    throw new Error('A constraint CHECK em "parameter_type" não foi encontrada na tabela "JobsIA_parameters".');
  }
  console.log(`  [OK] Constraint CHECK de "parameter_type" validada.`);
}

main();
