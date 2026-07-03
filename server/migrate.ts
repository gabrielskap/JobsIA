import 'dotenv/config';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');
const connectionString = process.env.DATABASE_URL;

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

    let appliedCount = 0;

    for (const file of migrationFiles) {
      if (appliedMigrations.has(file)) {
        continue;
      }

      console.log(`🚀 Aplicando migração: ${file}`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Executar a migração dentro de uma transação
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
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
