const { pool, conectar: conectarBase } = require("./db");

let tabelasCriadas = false;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS clientes (
    id                      SERIAL PRIMARY KEY,
    telefone                VARCHAR(20) UNIQUE NOT NULL,
    nome                    VARCHAR(150),
    email                   VARCHAR(150),
    primeiro_pedido_em      DATE,
    ultimo_pedido_em        DATE,
    total_pedidos           INT NOT NULL DEFAULT 0,
    total_gasto             NUMERIC(12,2) NOT NULL DEFAULT 0,
    ticket_medio            NUMERIC(10,2) NOT NULL DEFAULT 0,
    intervalo_medio_dias    NUMERIC(6,2),
    recencia_dias           INT,
    segmento                VARCHAR(30),
    score_valor             INT  NOT NULL DEFAULT 0,
    score_risco             INT  NOT NULL DEFAULT 0,
    chance_abandono         NUMERIC(5,2) NOT NULL DEFAULT 0,
    valor_estimado_perdido  NUMERIC(10,2) NOT NULL DEFAULT 0,
    tags                    TEXT[] DEFAULT '{}',
    observacoes             TEXT,
    recalculado_em          TIMESTAMPTZ,
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_clientes_segmento     ON clientes(segmento);
  CREATE INDEX IF NOT EXISTS idx_clientes_score_risco  ON clientes(score_risco DESC);
  CREATE INDEX IF NOT EXISTS idx_clientes_ultimo       ON clientes(ultimo_pedido_em DESC);

  CREATE TABLE IF NOT EXISTS pedidos (
    id           SERIAL PRIMARY KEY,
    cliente_id   INT REFERENCES clientes(id) ON DELETE CASCADE,
    external_id  VARCHAR(80),
    origem       VARCHAR(30) NOT NULL DEFAULT 'olaclick',
    data_pedido  TIMESTAMPTZ NOT NULL,
    valor        NUMERIC(10,2) NOT NULL CHECK (valor > 0),
    itens        JSONB,
    cupom        VARCHAR(40),
    payload      JSONB,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uniq_pedido_externo
    ON pedidos(origem, external_id) WHERE external_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id);
  CREATE INDEX IF NOT EXISTS idx_pedidos_data    ON pedidos(data_pedido DESC);

  CREATE TABLE IF NOT EXISTS campanhas_envios (
    id                SERIAL PRIMARY KEY,
    cliente_id        INT REFERENCES clientes(id) ON DELETE CASCADE,
    segmento          VARCHAR(30) NOT NULL,
    template          VARCHAR(50) NOT NULL,
    incentivo         VARCHAR(50),
    cupom             VARCHAR(40),
    mensagem          TEXT,
    enviado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status            VARCHAR(20) NOT NULL DEFAULT 'enviado',
    comprou_em        TIMESTAMPTZ,
    valor_recuperado  NUMERIC(10,2),
    erro              TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_campanhas_cliente ON campanhas_envios(cliente_id);
  CREATE INDEX IF NOT EXISTS idx_campanhas_status  ON campanhas_envios(status);
  CREATE INDEX IF NOT EXISTS idx_campanhas_enviado ON campanhas_envios(enviado_em DESC);
`;

async function conectar() {
  await conectarBase();
  if (tabelasCriadas) return pool;
  await pool.query(SCHEMA_SQL);
  tabelasCriadas = true;
  console.log("✅ Tabelas de clientes/pedidos/campanhas prontas");
  return pool;
}

function normalizarTelefone(raw) {
  if (!raw) return null;
  const digitos = String(raw).replace(/\D/g, "");
  if (digitos.length < 10) return null;
  if (digitos.startsWith("55")) return digitos;
  return "55" + digitos;
}

async function upsertCliente({ telefone, nome, email }) {
  const tel = normalizarTelefone(telefone);
  if (!tel) return null;
  await conectar();
  const { rows } = await pool.query(
    `INSERT INTO clientes (telefone, nome, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (telefone) DO UPDATE
       SET nome  = COALESCE(EXCLUDED.nome,  clientes.nome),
           email = COALESCE(EXCLUDED.email, clientes.email),
           atualizado_em = NOW()
     RETURNING *`,
    [tel, nome || null, email || null]
  );
  return rows[0];
}

async function registrarPedido({
  clienteId,
  externalId,
  origem = "olaclick",
  dataPedido,
  valor,
  itens,
  cupom,
  payload,
}) {
  await conectar();
  const { rows } = await pool.query(
    `INSERT INTO pedidos (cliente_id, external_id, origem, data_pedido, valor, itens, cupom, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (origem, external_id) DO NOTHING
     RETURNING *`,
    [
      clienteId,
      externalId || null,
      origem,
      dataPedido,
      valor,
      itens ? JSON.stringify(itens) : null,
      cupom || null,
      payload ? JSON.stringify(payload) : null,
    ]
  );
  return rows[0] || null;
}

async function listarClientes({ segmento, limite = 200, offset = 0, busca } = {}) {
  await conectar();
  const where = [];
  const params = [];
  if (segmento) { params.push(segmento); where.push(`segmento = $${params.length}`); }
  if (busca)    { params.push(`%${busca}%`); where.push(`(nome ILIKE $${params.length} OR telefone ILIKE $${params.length})`); }
  const sql = `
    SELECT * FROM clientes
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY score_risco DESC, total_gasto DESC
    LIMIT ${Math.min(limite, 500)} OFFSET ${Math.max(offset, 0)}
  `;
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function buscarClienteId(id) {
  await conectar();
  const { rows } = await pool.query("SELECT * FROM clientes WHERE id = $1", [id]);
  return rows[0] || null;
}

async function pedidosDoCliente(id, limite = 50) {
  await conectar();
  const { rows } = await pool.query(
    "SELECT * FROM pedidos WHERE cliente_id = $1 ORDER BY data_pedido DESC LIMIT $2",
    [id, limite]
  );
  return rows;
}

async function enviosDoCliente(id, limite = 20) {
  await conectar();
  const { rows } = await pool.query(
    "SELECT * FROM campanhas_envios WHERE cliente_id = $1 ORDER BY enviado_em DESC LIMIT $2",
    [id, limite]
  );
  return rows;
}

async function contagemPorSegmento() {
  await conectar();
  const { rows } = await pool.query(`
    SELECT
      COALESCE(segmento, 'sem_segmento') AS segmento,
      COUNT(*)::INT          AS total,
      AVG(ticket_medio)::NUMERIC(10,2)  AS ticket_medio,
      SUM(valor_estimado_perdido)::NUMERIC(12,2) AS perda_potencial
    FROM clientes
    GROUP BY 1
    ORDER BY total DESC
  `);
  return rows;
}

async function metricas() {
  await conectar();
  const [{ rows: tot }, { rows: rec }, { rows: env }] = await Promise.all([
    pool.query(`SELECT COUNT(*)::INT AS total_clientes,
                       COALESCE(SUM(total_gasto),0)::NUMERIC(12,2) AS receita_total
                FROM clientes`),
    pool.query(`SELECT
                  COUNT(*) FILTER (WHERE status = 'comprou')::INT AS recuperados,
                  COALESCE(SUM(valor_recuperado) FILTER (WHERE status = 'comprou'), 0)::NUMERIC(12,2) AS valor_recuperado,
                  COUNT(*)::INT AS total_envios
                FROM campanhas_envios
                WHERE enviado_em > NOW() - INTERVAL '30 days'`),
    pool.query(`SELECT segmento, COUNT(*)::INT AS qtd
                FROM campanhas_envios
                WHERE enviado_em > NOW() - INTERVAL '30 days'
                GROUP BY segmento`),
  ]);
  const totalEnvios = rec[0]?.total_envios || 0;
  const recuperados = rec[0]?.recuperados || 0;
  return {
    totalClientes:   tot[0]?.total_clientes || 0,
    receitaTotal:    Number(tot[0]?.receita_total || 0),
    enviosUltimos30: totalEnvios,
    recuperados,
    valorRecuperado: Number(rec[0]?.valor_recuperado || 0),
    taxaRecuperacao: totalEnvios ? +(100 * recuperados / totalEnvios).toFixed(2) : 0,
    envioPorSegmento: env,
  };
}

async function marcarRecuperacao(clienteId, valor) {
  await conectar();
  await pool.query(
    `UPDATE campanhas_envios
       SET status = 'comprou', comprou_em = NOW(), valor_recuperado = $2
     WHERE id = (
       SELECT id FROM campanhas_envios
       WHERE cliente_id = $1
         AND status = 'enviado'
         AND enviado_em > NOW() - INTERVAL '21 days'
       ORDER BY enviado_em DESC LIMIT 1
     )`,
    [clienteId, valor]
  );
}

async function jaEnviouRecentemente(clienteId, dias = 7) {
  await conectar();
  const { rows } = await pool.query(
    `SELECT 1 FROM campanhas_envios
     WHERE cliente_id = $1 AND enviado_em > NOW() - ($2 || ' days')::INTERVAL
     LIMIT 1`,
    [clienteId, dias]
  );
  return rows.length > 0;
}

async function registrarEnvio({ clienteId, segmento, template, incentivo, cupom, mensagem, status = "enviado", erro }) {
  await conectar();
  const { rows } = await pool.query(
    `INSERT INTO campanhas_envios (cliente_id, segmento, template, incentivo, cupom, mensagem, status, erro)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [clienteId, segmento, template, incentivo || null, cupom || null, mensagem || null, status, erro || null]
  );
  return rows[0];
}

module.exports = {
  pool,
  conectar,
  normalizarTelefone,
  upsertCliente,
  registrarPedido,
  listarClientes,
  buscarClienteId,
  pedidosDoCliente,
  enviosDoCliente,
  contagemPorSegmento,
  metricas,
  marcarRecuperacao,
  jaEnviouRecentemente,
  registrarEnvio,
};
