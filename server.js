require('dotenv').config();

const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
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


// ============================================================
// CONFIGURAÇÕES
// ============================================================

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
  'Concluído / Pedido Fechado',
  'Concluído / Sem Conversão'
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

const codigo = n =>
  `PRJ-${String(n).padStart(3, '0')}`;

const keep = (v, atual) =>
  (v === undefined || v === null || v === '')
    ? atual
    : v;

const nullable = (body, key, atual) =>
  body[key] === undefined
    ? atual
    : (body[key] || null);


// ============================================================
// HELPERS
// ============================================================

function situacaoSQL(alias = 'p') {

  return `CASE

    WHEN ${alias}.status='Concluído'
      THEN 'CONCLUÍDO'

    WHEN ${alias}.status='Cancelado'
      THEN 'CANCELADO'

    WHEN ${alias}.status='Pausado'
      THEN 'PAUSADO'

    WHEN ${alias}.prazo_proxima_acao IS NOT NULL
      AND ${alias}.prazo_proxima_acao < CURRENT_DATE
      THEN 'AÇÃO VENCIDA'

    WHEN ${alias}.prazo_90_dias IS NOT NULL
      AND ${alias}.prazo_90_dias < CURRENT_DATE
      THEN '90 DIAS VENCIDO'

    WHEN ${alias}.previsao_conclusao IS NOT NULL
      AND ${alias}.previsao_conclusao < CURRENT_DATE
      THEN 'ATRASADO'

    WHEN ${alias}.atualizado_em < NOW() - INTERVAL '15 days'
      THEN 'SEM ATUALIZAÇÃO'

    WHEN ${alias}.prazo_90_dias IS NOT NULL
      AND ${alias}.prazo_90_dias <= CURRENT_DATE + 15
      THEN '90 DIAS EM ATENÇÃO'

    WHEN ${alias}.area_pendente <> 'Sem pendência'
      THEN 'AGUARDANDO ' || UPPER(${alias}.area_pendente)

    ELSE 'NO PRAZO'

  END`;
}


function parseIds(valor) {

  if (!valor) {
    return [];
  }

  return [
    ...new Set(
      String(valor)
        .split(',')
        .map(Number)
        .filter(
          id =>
            Number.isInteger(id) &&
            id > 0
        )
    )
  ];
}


function escapeHtml(valor) {

  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function dataBR(valor) {

  if (!valor) {
    return '—';
  }

  const data =
    valor instanceof Date
      ? valor
      : new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return '—';
  }

  return data.toLocaleDateString('pt-BR');
}


function dataHoraBR(valor) {

  if (!valor) {
    return '—';
  }

  const data =
    valor instanceof Date
      ? valor
      : new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return '—';
  }

  return data.toLocaleString('pt-BR');
}


function styleHeader(row) {

  row.font = {
    bold: true,
    color: {
      argb: 'FFFFFFFF'
    }
  };

  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: {
      argb: 'FF66745C'
    }
  };

  row.alignment = {
    vertical: 'middle'
  };
}


function autoWidth(ws) {

  ws.columns.forEach(col => {

    let tamanho = 10;

    col.eachCell(
      { includeEmpty: true },
      cell => {

        tamanho = Math.max(
          tamanho,
          String(cell.value ?? '').length + 2
        );
      }
    );

    col.width =
      Math.min(tamanho, 45);
  });
}


// ============================================================
// CONFIG
// ============================================================

app.get(
  '/api/config',
  (req, res) => {

    res.json({
      etapas,
      areas,
      status: statusProjeto
    });
  }
);


// ============================================================
// INDICADORES
// ============================================================

app.get(
  '/api/indicadores',
  async (req, res, next) => {

    try {

      const resumo =
        await pool.query(`
          SELECT

            COUNT(*)::int cadastrados,

            COUNT(*) FILTER(
              WHERE status='Em andamento'
            )::int em_andamento,

            COUNT(*) FILTER(
              WHERE status='Pausado'
            )::int pausados,

            COUNT(*) FILTER(
              WHERE status='Concluído'
            )::int concluidos,

            COUNT(*) FILTER(
              WHERE etapa_atual='Concluído / Pedido Fechado'
            )::int pedidos_fechados,

            COUNT(*) FILTER(
              WHERE etapa_atual='Concluído / Sem Conversão'
            )::int sem_conversao,

            COUNT(*) FILTER(
              WHERE area_pendente='Cliente'
              AND status NOT IN ('Concluído','Cancelado')
            )::int aguardando_cliente,

            COUNT(*) FILTER(
              WHERE area_pendente='Produtos'
              AND status NOT IN ('Concluído','Cancelado')
            )::int aguardando_produtos,

            COUNT(*) FILTER(
              WHERE previsao_conclusao<CURRENT_DATE
              AND status NOT IN ('Concluído','Cancelado')
            )::int atrasados,

            COUNT(*) FILTER(
              WHERE prazo_proxima_acao<CURRENT_DATE
              AND status NOT IN ('Concluído','Cancelado')
            )::int acoes_vencidas,

            COUNT(*) FILTER(
              WHERE atualizado_em<NOW()-INTERVAL '15 days'
              AND status NOT IN ('Concluído','Cancelado')
            )::int sem_atualizacao,

            COUNT(*) FILTER(
              WHERE prazo_90_dias<CURRENT_DATE
              AND status NOT IN ('Concluído','Cancelado')
            )::int prazo90_vencido,

            COUNT(*) FILTER(
              WHERE prazo_90_dias
                BETWEEN CURRENT_DATE
                AND CURRENT_DATE+15
              AND status NOT IN ('Concluído','Cancelado')
            )::int prazo90_atencao,

            COUNT(*) FILTER(
              WHERE criado_em>=date_trunc('month',CURRENT_DATE)
            )::int entradas_mes,

            COUNT(*) FILTER(
              WHERE data_conclusao>=date_trunc('month',CURRENT_DATE)
            )::int concluidos_mes,

            COALESCE(
              ROUND(
                AVG(
                  COALESCE(data_conclusao,CURRENT_DATE)
                  - data_inicio
                )
                FILTER(
                  WHERE status<>'Cancelado'
                ),
                1
              ),
              0
            )::float tempo_medio_dias

          FROM projetos
        `);


      const etapasQ =
        await pool.query(`
          SELECT
            etapa_atual nome,
            COUNT(*)::int total

          FROM projetos

          WHERE status NOT IN (
            'Concluído',
            'Cancelado'
          )

          GROUP BY etapa_atual

          ORDER BY
            total DESC,
            nome
        `);


      const areasQ =
        await pool.query(`
          SELECT
            area_pendente nome,
            COUNT(*)::int total

          FROM projetos

          WHERE status NOT IN (
            'Concluído',
            'Cancelado'
          )

          GROUP BY area_pendente

          ORDER BY
            total DESC,
            nome
        `);


      const atencao =
        await pool.query(`
          SELECT

            id,
            codigo,
            cliente,
            nome,
            status,
            etapa_atual,
            area_pendente,
            proxima_acao,
            prazo_proxima_acao,
            previsao_conclusao,
            prazo_90_dias,
            atualizado_em,

            ${situacaoSQL('p')} situacao

          FROM projetos p

          WHERE status NOT IN (
            'Concluído',
            'Cancelado'
          )

          ORDER BY

            CASE

              WHEN prazo_proxima_acao<CURRENT_DATE
                THEN 0

              WHEN previsao_conclusao<CURRENT_DATE
                THEN 1

              WHEN atualizado_em<NOW()-INTERVAL '15 days'
                THEN 2

              ELSE 3

            END,

            COALESCE(
              prazo_proxima_acao,
              previsao_conclusao,
              prazo_90_dias
            ) NULLS LAST

          LIMIT 12
        `);


      res.json({
        ...resumo.rows[0],
        por_etapa: etapasQ.rows,
        por_area: areasQ.rows,
        atencao: atencao.rows
      });

    } catch (erro) {

      next(erro);
    }
  }
);


// ============================================================
// LISTA DE PROJETOS
// ============================================================

app.get(
  '/api/projetos',
  async (req, res, next) => {

    try {

      const q =
        await pool.query(`
          SELECT

            p.*,

            ${situacaoSQL('p')}
              situacao_automatica,

            (
              CURRENT_DATE
              - p.data_inicio
            )::int dias_em_aberto,

            GREATEST(
              0,
              CURRENT_DATE
              - p.atualizado_em::date
            )::int dias_sem_atualizacao,

            CASE

              WHEN p.prazo_90_dias IS NULL
                THEN NULL

              ELSE (
                p.prazo_90_dias
                - CURRENT_DATE
              )::int

            END dias_para_90

          FROM projetos p

          ORDER BY atualizado_em DESC
        `);


      res.json(q.rows);

    } catch (erro) {

      next(erro);
    }
  }
);


// ============================================================
// DETALHE
// ============================================================

app.get(
  '/api/projetos/:id',
  async (req, res, next) => {

    try {

      const p =
        await pool.query(
          `
          SELECT

            p.*,

            ${situacaoSQL('p')}
              situacao_automatica,

            (
              CURRENT_DATE
              - p.data_inicio
            )::int dias_em_aberto,

            CASE

              WHEN p.prazo_90_dias IS NULL
                THEN NULL

              ELSE (
                p.prazo_90_dias
                - CURRENT_DATE
              )::int

            END dias_para_90

          FROM projetos p

          WHERE id=$1
          `,
          [req.params.id]
        );


      if (!p.rowCount) {

        return res
          .status(404)
          .json({
            erro:
              'Projeto não encontrado'
          });
      }


      const h =
        await pool.query(
          `
          SELECT

            h.*,

            ROUND(
              EXTRACT(
                EPOCH FROM (
                  COALESCE(
                    LEAD(h.data_registro)
                    OVER(
                      ORDER BY h.data_registro
                    ),
                    NOW()
                  )
                  - h.data_registro
                )
              ) / 86400.0,
              1
            ) dias_na_situacao

          FROM historico_etapas h

          WHERE projeto_id=$1

          ORDER BY
            data_registro DESC
          `,
          [req.params.id]
        );


      const tempos =
        await pool.query(
          `
          WITH mov AS (

            SELECT

              etapa,
              area_pendente,
              data_registro,

              COALESCE(
                LEAD(data_registro)
                OVER(
                  ORDER BY data_registro
                ),
                NOW()
              ) fim

            FROM historico_etapas

            WHERE projeto_id=$1
          )

          SELECT

            etapa,

            ROUND(
              SUM(
                EXTRACT(
                  EPOCH FROM (
                    fim-data_registro
                  )
                ) / 86400.0
              ),
              1
            )::float dias

          FROM mov

          GROUP BY etapa

          ORDER BY
            MIN(data_registro)
          `,
          [req.params.id]
        );


      const esperas =
        await pool.query(
          `
          WITH mov AS (

            SELECT

              area_pendente,
              data_registro,

              COALESCE(
                LEAD(data_registro)
                OVER(
                  ORDER BY data_registro
                ),
                NOW()
              ) fim

            FROM historico_etapas

            WHERE projeto_id=$1
          )

          SELECT

            area_pendente,

            ROUND(
              SUM(
                EXTRACT(
                  EPOCH FROM (
                    fim-data_registro
                  )
                ) / 86400.0
              ),
              1
            )::float dias

          FROM mov

          WHERE
            area_pendente IS NOT NULL
            AND area_pendente <> 'Sem pendência'

          GROUP BY
            area_pendente

          ORDER BY dias DESC
          `,
          [req.params.id]
        );


      res.json({
        projeto: p.rows[0],
        historico: h.rows,
        tempos_etapa: tempos.rows,
        tempos_espera: esperas.rows
      });

    } catch (erro) {

      next(erro);
    }
  }
);


// ============================================================
// NOVO PROJETO
// ============================================================

app.post(
  '/api/projetos',
  async (req, res, next) => {

    const c =
      await pool.connect();

    try {

      await c.query('BEGIN');

      const b =
        req.body;


      if (!b.cliente || !b.nome) {

        await c.query('ROLLBACK');

        return res
          .status(400)
          .json({
            erro:
              'Cliente e nome do projeto são obrigatórios.'
          });
      }


      let statusFinal =
        b.status ||
        'Em andamento';

      let etapaFinal =
        b.etapa_atual ||
        etapas[0];

      let areaFinal =
        b.area_pendente ||
        areas[0];


      if (
        etapaFinal ===
          'Concluído / Pedido Fechado' ||
        etapaFinal ===
          'Concluído / Sem Conversão'
      ) {

        statusFinal =
          'Concluído';

        areaFinal =
          'Sem pendência';
      }


      const seq =
        await c.query(`
          SELECT
            COALESCE(MAX(id),0)+1 n
          FROM projetos
        `);


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
          prazo_proxima_acao,
          data_aprovacao,
          prazo_90_dias,
          observacoes,
          origem_cliente,
          comercial_responsavel,
          data_conclusao

        )

        VALUES (

          $1,
          $2,
          $3,
          $4,
          $5,
          COALESCE($6::date,CURRENT_DATE),
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,

          CASE
            WHEN $13::date IS NULL
              THEN NULL
            ELSE (
              $13::date
              + INTERVAL '90 days'
            )::date
          END,

          $14,
          $15,
          $16,

          CASE
            WHEN $8='Concluído'
              THEN CURRENT_DATE
            ELSE NULL
          END

        )

        RETURNING *
      `;


      const valores = [

        codigo(
          seq.rows[0].n
        ),

        b.cliente,

        b.segmento || null,

        b.nome,

        b.responsavel || 'Erika',

        b.data_inicio || null,

        b.previsao_conclusao || null,

        statusFinal,

        etapaFinal,

        areaFinal,

        b.proxima_acao || null,

        b.prazo_proxima_acao || null,

        b.data_aprovacao || null,

        b.observacoes || null,

        b.origem_cliente || null,

        b.comercial_responsavel || null
      ];


      const p =
        await c.query(
          sql,
          valores
        );


      await c.query(
        `
        INSERT INTO historico_etapas (

          projeto_id,
          etapa,
          area_pendente,
          situacao,
          pendencia_proximo_passo,
          observacoes

        )

        VALUES (
          $1,
          $2,
          $3,
          'Projeto cadastrado',
          $4,
          'Cadastro inicial'
        )
        `,
        [
          p.rows[0].id,
          p.rows[0].etapa_atual,
          p.rows[0].area_pendente,
          p.rows[0].proxima_acao
        ]
      );


      await c.query('COMMIT');


      res
        .status(201)
        .json(
          p.rows[0]
        );

    } catch (erro) {

      await c.query(
        'ROLLBACK'
      );

      next(erro);

    } finally {

      c.release();
    }
  }
);


// ============================================================
// ATUALIZAR PROJETO
// ============================================================

app.put(
  '/api/projetos/:id',
  async (req, res, next) => {

    const c =
      await pool.connect();

    try {

      await c.query('BEGIN');


      const old =
        await c.query(
          `
          SELECT *
          FROM projetos
          WHERE id=$1
          `,
          [req.params.id]
        );


      if (!old.rowCount) {

        await c.query(
          'ROLLBACK'
        );

        return res
          .status(404)
          .json({
            erro:
              'Projeto não encontrado'
          });
      }


      const o =
        old.rows[0];

      const b =
        req.body;


      const v = {

        cliente:
          keep(
            b.cliente,
            o.cliente
          ),

        segmento:
          nullable(
            b,
            'segmento',
            o.segmento
          ),

        nome:
          keep(
            b.nome,
            o.nome
          ),

        responsavel:
          nullable(
            b,
            'responsavel',
            o.responsavel
          ),

        previsao:
          nullable(
            b,
            'previsao_conclusao',
            o.previsao_conclusao
          ),

        status:
          keep(
            b.status,
            o.status
          ),

        etapa:
          keep(
            b.etapa_atual,
            o.etapa_atual
          ),

        area:
          keep(
            b.area_pendente,
            o.area_pendente
          ),

        acao:
          nullable(
            b,
            'proxima_acao',
            o.proxima_acao
          ),

        prazoAcao:
          nullable(
            b,
            'prazo_proxima_acao',
            o.prazo_proxima_acao
          ),

        obs:
          nullable(
            b,
            'observacoes',
            o.observacoes
          ),

        aprovacao:
          nullable(
            b,
            'data_aprovacao',
            o.data_aprovacao
          ),

        origem:
          nullable(
            b,
            'origem_cliente',
            o.origem_cliente
          ),

        comercial:
          nullable(
            b,
            'comercial_responsavel',
            o.comercial_responsavel
          )
      };


      // Conclusão automática pelo tipo de etapa.

      if (
        v.etapa ===
          'Concluído / Pedido Fechado' ||
        v.etapa ===
          'Concluído / Sem Conversão'
      ) {

        v.status =
          'Concluído';

        v.area =
          'Sem pendência';
      }


      let conclusao =
        o.data_conclusao;


      if (
        v.status === 'Concluído' &&
        o.status !== 'Concluído' &&
        !conclusao
      ) {

        conclusao =
          new Date();
      }


      if (
        v.status !== 'Concluído' &&
        o.status === 'Concluído'
      ) {

        conclusao =
          null;
      }


      const q =
        await c.query(
          `
          UPDATE projetos

          SET

            cliente=$1,
            segmento=$2,
            nome=$3,
            responsavel=$4,
            previsao_conclusao=$5,
            status=$6,
            etapa_atual=$7,
            area_pendente=$8,
            proxima_acao=$9,
            prazo_proxima_acao=$10,
            observacoes=$11,
            data_aprovacao=$12,

            prazo_90_dias=
              CASE
                WHEN $12::date IS NULL
                  THEN NULL
                ELSE (
                  $12::date
                  + INTERVAL '90 days'
                )::date
              END,

            data_conclusao=$13,
            origem_cliente=$14,
            comercial_responsavel=$15,
            atualizado_em=NOW()

          WHERE id=$16

          RETURNING *
          `,
          [
            v.cliente,
            v.segmento,
            v.nome,
            v.responsavel,
            v.previsao,
            v.status,
            v.etapa,
            v.area,
            v.acao,
            v.prazoAcao,
            v.obs,
            v.aprovacao,
            conclusao,
            v.origem,
            v.comercial,
            req.params.id
          ]
        );


      const mudou =

        o.status !== v.status ||

        o.etapa_atual !== v.etapa ||

        o.area_pendente !== v.area ||

        o.proxima_acao !== v.acao ||

        String(
          o.prazo_proxima_acao || ''
        ) !==
        String(
          v.prazoAcao || ''
        );


      if (mudou) {

        const detalhes = [];


        if (
          o.status !==
          v.status
        ) {

          detalhes.push(
            `Status: ${o.status} → ${v.status}`
          );
        }


        if (
          o.etapa_atual !==
          v.etapa
        ) {

          detalhes.push(
            `Etapa: ${o.etapa_atual} → ${v.etapa}`
          );
        }


        if (
          o.area_pendente !==
          v.area
        ) {

          detalhes.push(
            `Aguardando: ${o.area_pendente} → ${v.area}`
          );
        }


        if (
          o.proxima_acao !==
          v.acao
        ) {

          detalhes.push(
            'Próxima ação atualizada'
          );
        }


        if (
          String(
            o.prazo_proxima_acao || ''
          ) !==
          String(
            v.prazoAcao || ''
          )
        ) {

          detalhes.push(
            'Prazo da próxima ação atualizado'
          );
        }


        await c.query(
          `
          INSERT INTO historico_etapas (

            projeto_id,
            etapa,
            area_pendente,
            situacao,
            pendencia_proximo_passo,
            observacoes

          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          `,
          [
            req.params.id,
            v.etapa,
            v.area,
            v.status,
            v.acao,

            b.movimentacao_observacao ||
            detalhes.join(' | ') ||
            'Atualização do projeto'
          ]
        );
      }


      await c.query(
        'COMMIT'
      );


      res.json(
        q.rows[0]
      );

    } catch (erro) {

      await c.query(
        'ROLLBACK'
      );

      next(erro);

    } finally {

      c.release();
    }
  }
);


// ============================================================
// XLSX SELECIONADO
// ============================================================

app.get(
  '/api/relatorios/projetos.xlsx',
  async (req, res, next) => {

    try {

      const ids =
        parseIds(
          req.query.ids
        );


      if (!ids.length) {

        return res
          .status(400)
          .send(
            'Selecione pelo menos um projeto para gerar o relatório.'
          );
      }


      const projetos =
        (
          await pool.query(
            `
            SELECT

              p.*,

              ${situacaoSQL('p')}
                situacao_automatica,

              (
                COALESCE(
                  data_conclusao,
                  CURRENT_DATE
                )
                - data_inicio
              )::int tempo_total_dias

            FROM projetos p

            WHERE id =
              ANY($1::int[])

            ORDER BY
              criado_em DESC
            `,
            [ids]
          )
        ).rows;


      if (!projetos.length) {

        return res
          .status(404)
          .send(
            'Nenhum projeto encontrado.'
          );
      }


      const hist =
        (
          await pool.query(
            `
            SELECT

              p.id projeto_id,
              p.codigo,
              p.cliente,
              p.nome projeto,

              h.data_registro,
              h.etapa,
              h.area_pendente,
              h.situacao,
              h.pendencia_proximo_passo,
              h.observacoes

            FROM historico_etapas h

            JOIN projetos p
              ON p.id=h.projeto_id

            WHERE p.id =
              ANY($1::int[])

            ORDER BY
              p.codigo,
              h.data_registro DESC
            `,
            [ids]
          )
        ).rows;


      const tempos =
        (
          await pool.query(
            `
            WITH mov AS (

              SELECT

                p.id projeto_id,
                p.codigo,
                p.cliente,

                h.etapa,
                h.area_pendente,
                h.data_registro,

                COALESCE(

                  LEAD(h.data_registro)
                  OVER(
                    PARTITION BY h.projeto_id
                    ORDER BY h.data_registro
                  ),

                  NOW()

                ) fim

              FROM historico_etapas h

              JOIN projetos p
                ON p.id=h.projeto_id

              WHERE p.id =
                ANY($1::int[])
            )

            SELECT

              codigo,
              cliente,
              etapa,
              area_pendente,

              ROUND(
                SUM(
                  EXTRACT(
                    EPOCH FROM (
                      fim-data_registro
                    )
                  ) / 86400.0
                ),
                1
              )::float dias

            FROM mov

            GROUP BY
              codigo,
              cliente,
              etapa,
              area_pendente

            ORDER BY
              codigo,
              etapa
            `,
            [ids]
          )
        ).rows;


      const total =
        projetos.length;

      const andamento =
        projetos.filter(
          p =>
            p.status ===
            'Em andamento'
        ).length;

      const pausados =
        projetos.filter(
          p =>
            p.status ===
            'Pausado'
        ).length;

      const concluidos =
        projetos.filter(
          p =>
            p.status ===
            'Concluído'
        ).length;

      const pedidosFechados =
        projetos.filter(
          p =>
            p.etapa_atual ===
            'Concluído / Pedido Fechado'
        ).length;

      const semConversao =
        projetos.filter(
          p =>
            p.etapa_atual ===
            'Concluído / Sem Conversão'
        ).length;

      const encerrados =
        pedidosFechados +
        semConversao;

      const conversao =
        encerrados
          ? (
              pedidosFechados /
              encerrados *
              100
            ).toFixed(1)
          : '0.0';


      const wb =
        new ExcelJS.Workbook();

      wb.creator =
        'LENVIE Projetos';

      wb.created =
        new Date();


      // RESUMO

      const resumo =
        wb.addWorksheet(
          'Resumo Executivo'
        );


      resumo.addRow([
        'RELATÓRIO DE PROJETOS - LENVIE'
      ]);

      resumo.mergeCells(
        'A1:D1'
      );

      resumo.getCell('A1').font = {
        bold: true,
        size: 17,
        color: {
          argb: 'FF354133'
        }
      };


      resumo.addRow([
        'Gerado em',
        new Date()
          .toLocaleString(
            'pt-BR'
          )
      ]);

      resumo.addRow([
        'Projetos selecionados',
        total
      ]);

      resumo.addRow([]);


      resumo.addRow([
        'Indicador',
        'Valor'
      ]);

      styleHeader(
        resumo.getRow(5)
      );


      [
        [
          'Projetos selecionados',
          total
        ],

        [
          'Em andamento',
          andamento
        ],

        [
          'Pausados',
          pausados
        ],

        [
          'Concluídos',
          concluidos
        ],

        [
          'Pedidos fechados',
          pedidosFechados
        ],

        [
          'Sem conversão',
          semConversao
        ],

        [
          'Taxa de conversão',
          `${conversao}%`
        ]

      ].forEach(
        linha =>
          resumo.addRow(linha)
      );


      autoWidth(resumo);


      // PROJETOS

      const ws =
        wb.addWorksheet(
          'Projetos'
        );


      ws.columns = [

        ['ID', 'codigo'],
        ['Cliente', 'cliente'],
        ['Segmento', 'segmento'],
        ['Projeto', 'nome'],
        ['Origem', 'origem_cliente'],
        ['Comercial', 'comercial_responsavel'],
        ['Responsável', 'responsavel'],
        ['Início', 'data_inicio'],
        ['Previsão', 'previsao_conclusao'],
        ['Status', 'status'],
        ['Situação automática', 'situacao_automatica'],
        ['Etapa', 'etapa_atual'],
        ['Aguardando', 'area_pendente'],
        ['Próxima ação', 'proxima_acao'],
        ['Prazo ação', 'prazo_proxima_acao'],
        ['Aprovação', 'data_aprovacao'],
        ['Prazo 90 dias', 'prazo_90_dias'],
        ['Conclusão', 'data_conclusao'],
        ['Tempo total (dias)', 'tempo_total_dias'],
        ['Observações', 'observacoes']

      ].map(
        ([header, key]) => ({
          header,
          key
        })
      );


      projetos.forEach(
        p =>
          ws.addRow(p)
      );


      styleHeader(
        ws.getRow(1)
      );

      ws.autoFilter = {
        from: 'A1',
        to: 'T1'
      };

      ws.views = [
        {
          state: 'frozen',
          ySplit: 1
        }
      ];

      autoWidth(ws);


      // HISTÓRICO

      const wh =
        wb.addWorksheet(
          'Histórico'
        );


      wh.columns = [

        ['ID', 'codigo'],
        ['Cliente', 'cliente'],
        ['Projeto', 'projeto'],
        ['Data/Hora', 'data_registro'],
        ['Etapa', 'etapa'],
        ['Aguardando', 'area_pendente'],
        ['Situação', 'situacao'],
        ['Próximo passo', 'pendencia_proximo_passo'],
        ['Observações', 'observacoes']

      ].map(
        ([header, key]) => ({
          header,
          key
        })
      );


      hist.forEach(
        item =>
          wh.addRow(item)
      );


      styleHeader(
        wh.getRow(1)
      );

      wh.autoFilter = {
        from: 'A1',
        to: 'I1'
      };

      wh.views = [
        {
          state: 'frozen',
          ySplit: 1
        }
      ];

      autoWidth(wh);


      // TEMPOS

      const wt =
        wb.addWorksheet(
          'Tempos'
        );


      wt.columns = [

        ['ID', 'codigo'],
        ['Cliente', 'cliente'],
        ['Etapa', 'etapa'],
        ['Aguardando', 'area_pendente'],
        ['Dias', 'dias']

      ].map(
        ([header, key]) => ({
          header,
          key
        })
      );


      tempos.forEach(
        item =>
          wt.addRow(item)
      );


      styleHeader(
        wt.getRow(1)
      );

      wt.autoFilter = {
        from: 'A1',
        to: 'E1'
      };

      autoWidth(wt);


      const prefixo =
        projetos.length === 1
          ? projetos[0].codigo
          : `${projetos.length}_Projetos`;


      const nome =
        `Relatorio_LENVIE_${prefixo}_${new Date()
          .toISOString()
          .slice(0,10)}.xlsx`;


      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );


      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${nome}"`
      );


      await wb.xlsx.write(res);

      res.end();

    } catch (erro) {

      next(erro);
    }
  }
);


// ============================================================
// RELATÓRIO PDF / IMPRESSÃO
// ============================================================

app.get(
  '/relatorios/projetos.pdf',
  async (req, res, next) => {

    try {

      const ids =
        parseIds(
          req.query.ids
        );


      if (!ids.length) {

        return res
          .status(400)
          .send(
            'Selecione pelo menos um projeto.'
          );
      }


      const projetos =
        (
          await pool.query(
            `
            SELECT

              p.*,

              ${situacaoSQL('p')}
                situacao_automatica,

              (
                COALESCE(
                  data_conclusao,
                  CURRENT_DATE
                )
                - data_inicio
              )::int tempo_total_dias

            FROM projetos p

            WHERE id =
              ANY($1::int[])

            ORDER BY
              codigo
            `,
            [ids]
          )
        ).rows;


      const historico =
        (
          await pool.query(
            `
            SELECT

              h.*,
              p.codigo

            FROM historico_etapas h

            JOIN projetos p
              ON p.id=h.projeto_id

            WHERE p.id =
              ANY($1::int[])

            ORDER BY
              p.codigo,
              h.data_registro DESC
            `,
            [ids]
          )
        ).rows;


      if (!projetos.length) {

        return res
          .status(404)
          .send(
            'Nenhum projeto encontrado.'
          );
      }


      const projetosHtml =
        projetos
          .map(projeto => {

            const hist =
              historico.filter(
                h =>
                  h.projeto_id ===
                  projeto.id
              );


            const historicoHtml =
              hist.length
                ? hist
                    .map(item => `
                      <div class="hist">
                        <strong>
                          ${escapeHtml(
                            dataHoraBR(
                              item.data_registro
                            )
                          )}
                        </strong>

                        <div>
                          ${escapeHtml(
                            item.situacao ||
                            ''
                          )}
                          ·
                          ${escapeHtml(
                            item.etapa ||
                            ''
                          )}
                        </div>

                        <div class="muted">
                          Aguardando:
                          ${escapeHtml(
                            item.area_pendente ||
                            '—'
                          )}
                        </div>

                        ${
                          item.pendencia_proximo_passo
                            ? `
                              <div>
                                ${escapeHtml(
                                  item.pendencia_proximo_passo
                                )}
                              </div>
                            `
                            : ''
                        }

                        ${
                          item.observacoes
                            ? `
                              <small>
                                ${escapeHtml(
                                  item.observacoes
                                )}
                              </small>
                            `
                            : ''
                        }
                      </div>
                    `)
                    .join('')
                : '<p>Sem histórico.</p>';


            return `
              <section class="projeto">

                <div class="titulo-projeto">

                  <div>

                    <h1>
                      ${escapeHtml(
                        projeto.codigo
                      )}
                      ·
                      ${escapeHtml(
                        projeto.nome
                      )}
                    </h1>

                    <span class="situacao">
                      ${escapeHtml(
                        projeto.situacao_automatica
                      )}
                    </span>

                  </div>

                  <div class="cliente">
                    ${escapeHtml(
                      projeto.cliente
                    )}
                  </div>

                </div>


                <div class="grid">

                  <div>
                    <label>Cliente</label>
                    <p>
                      ${escapeHtml(
                        projeto.cliente
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Segmento</label>
                    <p>
                      ${escapeHtml(
                        projeto.segmento ||
                        '—'
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Responsável</label>
                    <p>
                      ${escapeHtml(
                        projeto.responsavel ||
                        '—'
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Comercial</label>
                    <p>
                      ${escapeHtml(
                        projeto.comercial_responsavel ||
                        '—'
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Status</label>
                    <p>
                      ${escapeHtml(
                        projeto.status
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Etapa</label>
                    <p>
                      ${escapeHtml(
                        projeto.etapa_atual
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Aguardando</label>
                    <p>
                      ${escapeHtml(
                        projeto.area_pendente
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Tempo total</label>
                    <p>
                      ${escapeHtml(
                        projeto.tempo_total_dias
                      )}
                      dias
                    </p>
                  </div>

                  <div>
                    <label>Data de início</label>
                    <p>
                      ${dataBR(
                        projeto.data_inicio
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Previsão</label>
                    <p>
                      ${dataBR(
                        projeto.previsao_conclusao
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Data de aprovação</label>
                    <p>
                      ${dataBR(
                        projeto.data_aprovacao
                      )}
                    </p>
                  </div>

                  <div>
                    <label>Prazo 90 dias</label>
                    <p>
                      ${dataBR(
                        projeto.prazo_90_dias
                      )}
                    </p>
                  </div>

                </div>


                <div class="bloco">

                  <label>
                    Próxima ação
                  </label>

                  <p>
                    ${escapeHtml(
                      projeto.proxima_acao ||
                      '—'
                    )}
                  </p>

                </div>


                <div class="bloco">

                  <label>
                    Observações
                  </label>

                  <p>
                    ${escapeHtml(
                      projeto.observacoes ||
                      '—'
                    )}
                  </p>

                </div>


                <h2>
                  Histórico
                </h2>

                ${historicoHtml}

              </section>
            `;
          })
          .join('');


      res.type('html').send(`
        <!doctype html>

        <html lang="pt-BR">

        <head>

          <meta charset="utf-8">

          <meta
            name="viewport"
            content="width=device-width,initial-scale=1"
          >

          <title>
            Relatório LENVIE
          </title>

          <style>

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family:
                Arial,
                sans-serif;
              color: #1d281d;
              background: #f3f5f0;
            }

            .topo {
              height: 110px;
              background:
                #a9b79e
                url('/img/lenvie-topo.png')
                center / cover
                no-repeat;
            }

            main {
              max-width: 1000px;
              margin: 25px auto;
              padding: 0 20px;
            }

            .acoes {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 15px;
            }

            button {
              border: 0;
              background: #66745c;
              color: white;
              padding: 11px 18px;
              border-radius: 8px;
              cursor: pointer;
            }

            .projeto {
              background: white;
              padding: 28px;
              border-radius: 14px;
              margin-bottom: 25px;
              box-shadow:
                0 5px 20px
                rgba(0,0,0,.08);
              page-break-after: always;
            }

            .projeto:last-child {
              page-break-after: auto;
            }

            .titulo-projeto {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              border-bottom:
                2px solid #dce2d8;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }

            h1 {
              margin: 0 0 8px;
              font-size: 24px;
            }

            h2 {
              margin-top: 25px;
              font-size: 18px;
            }

            .cliente {
              font-weight: bold;
              color: #66745c;
            }

            .situacao {
              display: inline-block;
              background: #f6e7a9;
              padding: 5px 9px;
              border-radius: 999px;
              font-size: 12px;
              font-weight: bold;
            }

            .grid {
              display: grid;
              grid-template-columns:
                repeat(2,1fr);
              gap: 12px;
            }

            .grid div,
            .bloco {
              border: 1px solid #dfe5dc;
              border-radius: 8px;
              padding: 10px;
            }

            label {
              display: block;
              font-size: 11px;
              font-weight: bold;
              color: #66745c;
              text-transform: uppercase;
            }

            p {
              margin: 5px 0 0;
              white-space: pre-wrap;
            }

            .bloco {
              margin-top: 12px;
            }

            .hist {
              border-left:
                3px solid #829278;
              padding: 8px 12px;
              margin: 12px 0;
            }

            .muted,
            small {
              color: #687467;
            }

            @media print {

              body {
                background: white;
              }

              .acoes {
                display: none;
              }

              main {
                max-width: none;
                margin: 0;
                padding: 0;
              }

              .topo {
                height: 80px;
              }

              .projeto {
                box-shadow: none;
                border-radius: 0;
              }
            }

          </style>

        </head>

        <body>

          <div class="topo"></div>

          <main>

            <div class="acoes">
              <button
                onclick="window.print()"
              >
                Salvar / Imprimir PDF
              </button>
            </div>

            ${projetosHtml}

          </main>

          <script>
            window.addEventListener(
              'load',
              () => {
                setTimeout(
                  () => window.print(),
                  500
                );
              }
            );
          </script>

        </body>

        </html>
      `);

    } catch (erro) {

      next(erro);
    }
  }
);


// ============================================================
// ERROS
// ============================================================

app.use(
  (erro, req, res, next) => {

    console.error(
      'ERRO:',
      erro
    );

    res
      .status(500)
      .json({
        erro:
          'Erro interno',

        detalhe:
          process.env.NODE_ENV ===
          'production'
            ? undefined
            : erro.message
      });
  }
);


const PORT =
  process.env.PORT ||
  3000;


app.listen(
  PORT,
  () =>
    console.log(
      `LENVIE Projetos em http://localhost:${PORT}`
    )
);
