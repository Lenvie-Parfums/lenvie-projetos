require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const etapas = [
  'Entrada / Oportunidade',
  'Entendimento / Briefing',
  'Análise de Viabilidade',
  'Envolvimento de Produtos',
  'Definição / Amostras',
  'Cotação / Custos',
  'Orçamento',
  'Ajustes / Novos Testes',
  'Aprovação do Cliente',
  'Produção / 90 dias',
  'Entrega',
  'Concluído'
];

const areas = [
  'Sem pendência',
  'Cliente',
  'Comercial',
  'Produtos',
  'Fornecedor',
  'Compras',
  'PCP / Produção',
  'Outro'
];

const statusProjeto = [
  'Em andamento',
  'Pausado',
  'Concluído',
  'Cancelado'
];

function codigo(numero) {
  return `PRJ-${String(numero).padStart(3, '0')}`;
}

function valorOuAtual(novoValor, valorAtual) {
  if (novoValor === undefined || novoValor === null || novoValor === '') {
    return valorAtual;
  }

  return novoValor;
}

// ======================================================
// CONFIG
// ======================================================

app.get('/api/config', (req, res) => {
  res.json({
    etapas,
    areas,
    status: statusProjeto
  });
});

// ======================================================
// INDICADORES
// ======================================================

app.get('/api/indicadores', async (req, res, next) => {
  try {
    const q = await pool.query(`
      SELECT
        COUNT(*)::int AS cadastrados,

        COUNT(*) FILTER (
          WHERE status = 'Em andamento'
        )::int AS em_andamento,

        COUNT(*) FILTER (
          WHERE status = 'Pausado'
        )::int AS pausados,

        COUNT(*) FILTER (
          WHERE status = 'Concluído'
        )::int AS concluidos,

        COUNT(*) FILTER (
          WHERE area_pendente = 'Cliente'
          AND status NOT IN ('Concluído', 'Cancelado')
        )::int AS aguardando_cliente,

        COUNT(*) FILTER (
          WHERE area_pendente = 'Produtos'
          AND status NOT IN ('Concluído', 'Cancelado')
        )::int AS aguardando_produtos,

        COUNT(*) FILTER (
          WHERE previsao_conclusao < CURRENT_DATE
          AND status NOT IN ('Concluído', 'Cancelado')
        )::int AS atrasados

      FROM projetos
    `);

    res.json(q.rows[0]);

  } catch (e) {
    next(e);
  }
});

// ======================================================
// LISTAR PROJETOS
// ======================================================

app.get('/api/projetos', async (req, res, next) => {
  try {
    const q = await pool.query(`
      SELECT *
      FROM projetos
      ORDER BY atualizado_em DESC
    `);

    res.json(q.rows);

  } catch (e) {
    next(e);
  }
});

// ======================================================
// BUSCAR PROJETO + HISTÓRICO
// ======================================================

app.get('/api/projetos/:id', async (req, res, next) => {
  try {
    const projeto = await pool.query(
      'SELECT * FROM projetos WHERE id = $1',
      [req.params.id]
    );

    if (!projeto.rowCount) {
      return res.status(404).json({
        erro: 'Projeto não encontrado'
      });
    }

    const historico = await pool.query(`
      SELECT *
      FROM historico_etapas
      WHERE projeto_id = $1
      ORDER BY data_registro DESC
    `, [req.params.id]);

    res.json({
      projeto: projeto.rows[0],
      historico: historico.rows
    });

  } catch (e) {
    next(e);
  }
});

// ======================================================
// CRIAR PROJETO
// ======================================================

app.post('/api/projetos', async (req, res, next) => {

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const b = req.body;

    if (!b.cliente || !b.nome) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        erro: 'Cliente e nome do projeto são obrigatórios.'
      });
    }

    const seq = await client.query(`
      SELECT COALESCE(MAX(id), 0) + 1 AS n
      FROM projetos
    `);

    const cod = codigo(seq.rows[0].n);

    const prazo90 = b.data_aprovacao
      ? `($12::date + INTERVAL '90 days')::date`
      : 'NULL';

    const sql = `
      INSERT INTO projetos (
        codigo,
        cliente,
        segmento,
        nome,
        responsavel,
        data_inicio,
        previsao_conclusao,
        status,
        etapa_atual,
        area_pendente,
        proxima_acao,
        data_aprovacao,
        prazo_90_dias,
        observacoes
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        COALESCE($6::date, CURRENT_DATE),
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        ${prazo90},
        $13
      )
      RETURNING *
    `;

    const valores = [
      cod,
      b.cliente,
      b.segmento || null,
      b.nome,
      b.responsavel || null,
      b.data_inicio || null,
      b.previsao_conclusao || null,
      b.status || 'Em andamento',
      b.etapa_atual || etapas[0],
      b.area_pendente || areas[0],
      b.proxima_acao || null,
      b.data_aprovacao || null,
      b.observacoes || null
    ];

    const projeto = await client.query(sql, valores);

    await client.query(`
      INSERT INTO historico_etapas (
        projeto_id,
        etapa,
        area_pendente,
        situacao,
        pendencia_proximo_passo,
        observacoes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      projeto.rows[0].id,
      projeto.rows[0].etapa_atual,
      projeto.rows[0].area_pendente,
      'Projeto cadastrado',
      projeto.rows[0].proxima_acao,
      'Cadastro inicial'
    ]);

    await client.query('COMMIT');

    res.status(201).json(projeto.rows[0]);

  } catch (e) {

    await client.query('ROLLBACK');
    next(e);

  } finally {

    client.release();
  }
});

// ======================================================
// ATUALIZAR PROJETO
// ======================================================

app.put('/api/projetos/:id', async (req, res, next) => {

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const atual = await client.query(
      'SELECT * FROM projetos WHERE id = $1',
      [req.params.id]
    );

    if (!atual.rowCount) {

      await client.query('ROLLBACK');

      return res.status(404).json({
        erro: 'Projeto não encontrado'
      });
    }

    const antigo = atual.rows[0];
    const b = req.body;

    // --------------------------------------------------
    // Mantém o valor atual caso o frontend não envie
    // determinado campo.
    // --------------------------------------------------

    const cliente = valorOuAtual(
      b.cliente,
      antigo.cliente
    );

    const segmento =
      b.segmento !== undefined
        ? (b.segmento || null)
        : antigo.segmento;

    const nome = valorOuAtual(
      b.nome,
      antigo.nome
    );

    const responsavel =
      b.responsavel !== undefined
        ? (b.responsavel || null)
        : antigo.responsavel;

    const previsaoConclusao =
      b.previsao_conclusao !== undefined
        ? (b.previsao_conclusao || null)
        : antigo.previsao_conclusao;

    const status = valorOuAtual(
      b.status,
      antigo.status
    );

    const etapaAtual = valorOuAtual(
      b.etapa_atual,
      antigo.etapa_atual
    );

    const areaPendente = valorOuAtual(
      b.area_pendente,
      antigo.area_pendente
    );

    const proximaAcao =
      b.proxima_acao !== undefined
        ? (b.proxima_acao || null)
        : antigo.proxima_acao;

    const prazoProximaAcao =
      b.prazo_proxima_acao !== undefined
        ? (b.prazo_proxima_acao || null)
        : antigo.prazo_proxima_acao;

    const observacoes =
      b.observacoes !== undefined
        ? (b.observacoes || null)
        : antigo.observacoes;

    const dataAprovacao =
      b.data_aprovacao !== undefined
        ? (b.data_aprovacao || null)
        : antigo.data_aprovacao;

    // --------------------------------------------------
    // DATA DE CONCLUSÃO
    // --------------------------------------------------

    let dataConclusao = antigo.data_conclusao;

    if (
      status === 'Concluído' &&
      antigo.status !== 'Concluído' &&
      !antigo.data_conclusao
    ) {
      dataConclusao = new Date();
    }

    if (
      status !== 'Concluído' &&
      antigo.status === 'Concluído'
    ) {
      dataConclusao = null;
    }

    // --------------------------------------------------
    // UPDATE
    // --------------------------------------------------

    const atualizado = await client.query(`
      UPDATE projetos
      SET
        cliente = $1,
        segmento = $2,
        nome = $3,
        responsavel = $4,
        previsao_conclusao = $5,
        status = $6,
        etapa_atual = $7,
        area_pendente = $8,
        proxima_acao = $9,
        prazo_proxima_acao = $10,
        observacoes = $11,
        data_aprovacao = $12,

        prazo_90_dias =
          CASE
            WHEN $12::date IS NULL
              THEN NULL
            ELSE ($12::date + INTERVAL '90 days')::date
          END,

        data_conclusao = $13,
        atualizado_em = NOW()

      WHERE id = $14

      RETURNING *
    `, [
      cliente,
      segmento,
      nome,
      responsavel,
      previsaoConclusao,
      status,
      etapaAtual,
      areaPendente,
      proximaAcao,
      prazoProximaAcao,
      observacoes,
      dataAprovacao,
      dataConclusao,
      req.params.id
    ]);

    // --------------------------------------------------
    // VERIFICA SE HOUVE MOVIMENTAÇÃO
    // --------------------------------------------------

    const mudou =
      antigo.status !== status ||
      antigo.etapa_atual !== etapaAtual ||
      antigo.area_pendente !== areaPendente ||
      antigo.proxima_acao !== proximaAcao;

    // --------------------------------------------------
    // HISTÓRICO AUTOMÁTICO
    // --------------------------------------------------

    if (mudou) {

      const detalhes = [];

      if (antigo.status !== status) {
        detalhes.push(
          `Status: ${antigo.status} → ${status}`
        );
      }

      if (antigo.etapa_atual !== etapaAtual) {
        detalhes.push(
          `Etapa: ${antigo.etapa_atual} → ${etapaAtual}`
        );
      }

      if (antigo.area_pendente !== areaPendente) {
        detalhes.push(
          `Aguardando: ${antigo.area_pendente} → ${areaPendente}`
        );
      }

      if (antigo.proxima_acao !== proximaAcao) {
        detalhes.push(
          'Próxima ação atualizada'
        );
      }

      const observacaoMovimentacao =
        b.movimentacao_observacao ||
        detalhes.join(' | ') ||
        'Atualização do projeto';

      await client.query(`
        INSERT INTO historico_etapas (
          projeto_id,
          etapa,
          area_pendente,
          situacao,
          pendencia_proximo_passo,
          observacoes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        req.params.id,
        etapaAtual,
        areaPendente,
        status,
        proximaAcao,
        observacaoMovimentacao
      ]);
    }

    await client.query('COMMIT');

    res.json(atualizado.rows[0]);

  } catch (e) {

    await client.query('ROLLBACK');
    next(e);

  } finally {

    client.release();
  }
});

// ======================================================
// TRATAMENTO DE ERROS
// ======================================================

app.use((e, req, res, next) => {

  console.error('ERRO:', e);

  res.status(500).json({
    erro: 'Erro interno',
    detalhe:
      process.env.NODE_ENV === 'production'
        ? undefined
        : e.message
  });
});

// ======================================================
// SERVIDOR
// ======================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `LENVIE Projetos em http://localhost:${PORT}`
  );
});