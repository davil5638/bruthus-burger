require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs   = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrar() {
  const arquivo = path.resolve(__dirname, "../data/financeiro.json");

  if (!fs.existsSync(arquivo)) {
    console.error("❌ Arquivo data/financeiro.json não encontrado");
    process.exit(1);
  }

  const { entradas } = JSON.parse(fs.readFileSync(arquivo, "utf-8"));
  console.log(`📂 ${entradas.length} registros encontrados no JSON`);

  // Garante que a tabela existe
  await pool.query(`
    CREATE TABLE IF NOT EXISTS financeiro (
      id        SERIAL PRIMARY KEY,
      tipo      VARCHAR(10)   NOT NULL CHECK (tipo IN ('receita','despesa')),
      valor     NUMERIC(10,2) NOT NULL CHECK (valor > 0),
      categoria VARCHAR(100)  NOT NULL DEFAULT 'Outros',
      descricao TEXT          NOT NULL DEFAULT '',
      data      DATE          NOT NULL,
      criado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  let ok = 0;
  let erros = 0;

  for (const e of entradas) {
    try {
      await pool.query(
        `INSERT INTO financeiro (tipo, valor, categoria, descricao, data, criado_em)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          e.tipo,
          parseFloat(e.valor),
          e.categoria || "Outros",
          e.descricao || "",
          e.data,
          e.criadoEm || e.data,
        ]
      );
      ok++;
      process.stdout.write(`\r✅ ${ok}/${entradas.length} inseridos...`);
    } catch (err) {
      erros++;
      console.error(`\n❌ Erro no registro ${e.id}: ${err.message}`);
    }
  }

  console.log(`\n\n✅ Migração concluída: ${ok} inseridos, ${erros} erros`);
  await pool.end();
}

migrar().catch(e => {
  console.error("❌ Erro fatal:", e.message);
  process.exit(1);
});
