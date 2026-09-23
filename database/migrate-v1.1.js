require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE projetos ADD COLUMN IF NOT EXISTS origem_cliente VARCHAR(120);
      ALTER TABLE projetos ADD COLUMN IF NOT EXISTS comercial_responsavel VARCHAR(120);
      CREATE INDEX IF NOT EXISTS idx_projetos_prazo_acao ON projetos(prazo_proxima_acao);
      CREATE INDEX IF NOT EXISTS idx_projetos_atualizado ON projetos(atualizado_em DESC);
      CREATE INDEX IF NOT EXISTS idx_projetos_area ON projetos(area_pendente);
      CREATE INDEX IF NOT EXISTS idx_projetos_aprovacao ON projetos(data_aprovacao);
    `);
    await client.query('COMMIT');
    console.log('Migração V1.1 concluída com sucesso.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Falha na migração V1.1:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
