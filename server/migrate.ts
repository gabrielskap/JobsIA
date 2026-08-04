import 'dotenv/config';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import {
  assertMigrationDoesNotThreatenUsers,
  assertUsersPreserved,
  lockAndCaptureUsers,
  normalizeMigrationTransaction,
} from './migrationSafety';

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');
const connectionString = process.env.DATABASE_URL;
// Existing untracked databases represent the legacy schema only. Keep later
// migrations executable instead of marking their database changes as done.
const LEGACY_BASELINE_THROUGH = '0020_add_capador_parameters.sql';
const APPLICATION_SCHEMA_BASELINE_THROUGH = '0021_structured_application_checklists.sql';

async function run() {
  if (!connectionString) {
    console.error('❌ Erro: A variável de ambiente DATABASE_URL não está configurada.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });

  try {
    console.log('🔌 Conectando ao banco de dados para executar migrações...');
    await client.connect();

    // Criar tabela de controle de migrations se não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Verificar se o banco de dados ja contem a tabela final "JobsIA_profiles"
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'JobsIA_profiles'
      );
    `);
    const isAlreadyStructured = tableCheck.rows[0].exists;
    const applicationSchemaCheck = await client.query(`
      SELECT
        EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'JobsIA_checklist_catalog_items'
        ) AS has_catalog,
        EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'JobsIA_application_validation_rules'
        ) AS has_application_rules,
        EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'JobsIA_job_checklist_requirements'
        ) AS has_requirements,
        EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'JobsIA_checklists'
            AND column_name = 'schema_version'
        ) AS has_schema_version,
        EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'JobsIA_parameters'
            AND column_name = 'collection_scope'
        ) AS has_collection_scope,
        EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'JobsIA_parameters'
            AND column_name = 'document_only'
        ) AS has_document_only,
        EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'JobsIA_parameters'
            AND column_name = 'collect_in_conversation'
        ) AS has_collection_flag
    `);
    const isAlreadyApplicationV2 = Boolean(
      applicationSchemaCheck.rows[0].has_catalog
      && applicationSchemaCheck.rows[0].has_application_rules
      && applicationSchemaCheck.rows[0].has_requirements
      && applicationSchemaCheck.rows[0].has_schema_version
      && applicationSchemaCheck.rows[0].has_collection_scope
      && applicationSchemaCheck.rows[0].has_document_only
      && applicationSchemaCheck.rows[0].has_collection_flag
    );

    // Listar todos os arquivos da pasta migrations
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.error(`❌ Erro: Diretório de migrações não encontrado em: ${MIGRATIONS_DIR}`);
      process.exit(1);
    }

    const files = fs.readdirSync(MIGRATIONS_DIR);
    const migrationFiles = files
      .filter(f => /^\d{4}_.*\.sql$/.test(f))
      .sort();

    console.log(`🔍 Encontradas ${migrationFiles.length} migrações no diretório.`);

    // Buscar migrations já aplicadas
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const appliedMigrations = new Set(rows.map(r => r.name));

    // Alguns ambientes legados receberam o schema v2 manualmente, mas mantêm
    // uma tabela schema_migrations parcial. Detectar a estrutura efetiva evita
    // reexecutar migrações históricas que podem alterar dados.
    if (isAlreadyApplicationV2) {
      console.log('ℹ️ Detectado schema v2 já existente. Sincronizando o histórico de migrations sem reexecutá-las...');
      for (const file of migrationFiles.filter(file => file <= APPLICATION_SCHEMA_BASELINE_THROUGH)) {
        if (appliedMigrations.has(file)) continue;
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        appliedMigrations.add(file);
        console.log(`  -> Baselined (schema já presente): ${file}`);
      }
    // Bancos legados sem controle de migrations representam apenas o schema
    // até 0020. Evoluções posteriores precisam executar de fato.
    } else if (isAlreadyStructured && appliedMigrations.size === 0) {
      const legacyFiles = migrationFiles.filter(file => file <= LEGACY_BASELINE_THROUGH);
      console.log(`ℹ️ Detectado banco de dados legado. Executando baselining automatico ate ${LEGACY_BASELINE_THROUGH}...`);
      for (const file of legacyFiles) {
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        appliedMigrations.add(file);
        console.log(`  -> Baselined (marcada como aplicada): ${file}`);
      }
    }

    let appliedCount = 0;

    for (const file of migrationFiles) {
      if (appliedMigrations.has(file)) {
        continue;
      }

      console.log(`🚀 Aplicando migração: ${file}`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      assertMigrationDoesNotThreatenUsers(file, sql);
      const migrationSql = normalizeMigrationTransaction(sql);

      // The runner owns the transaction boundary. Historic migration files
      // are normalized so SQL, the users invariant, and migration history are
      // committed or rolled back as one unit.
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL standard_conforming_strings = 'on'");
        const usersBefore = await lockAndCaptureUsers(client);
        await client.query(migrationSql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        // A migration can create a trigger on schema_migrations. Run the
        // invariant only after this insert and force deferred triggers before
        // the final check, while the transaction can still be rolled back.
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');
        await assertUsersPreserved(client, usersBefore);
        await client.query('COMMIT');
        console.log(`✅ Migração ${file} aplicada com sucesso.`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Erro ao aplicar migração ${file}:`, err);
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log('ℹ️ O banco de dados já está atualizado. Nenhuma nova migração para aplicar.');
    } else {
      console.log(`🎉 Sucesso: ${appliedCount} novas migrações aplicadas.`);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Falha crítica na execução das migrações:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
