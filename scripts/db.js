const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
});

let tabelaCriada = false;

async function conectar() {
  if (tabelaCriada) return pool;

  if (!process.env.DATABASE_URL) {
    throw new Error("❌ DATABASE_URL não configurado no .env");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS financeiro (
      id         SERIAL PRIMARY KEY,
      tipo       VARCHAR(10)  NOT NULL CHECK (tipo IN ('receita','despesa')),
      valor      NUMERIC(10,2) NOT NULL CHECK (valor > 0),
      categoria  VARCHAR(100) NOT NULL DEFAULT 'Outros',
      descricao  TEXT         NOT NULL DEFAULT '',
      data       DATE         NOT NULL,
      criado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  tabelaCriada = true;
  console.log("✅ PostgreSQL (Neon) conectado");
  return pool;
}

module.exports = { conectar, pool };
