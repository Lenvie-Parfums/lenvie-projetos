require('dotenv').config();

const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

app.use(express.json());

app.set('trust proxy', 1);

const PUBLIC_DIR =
  path.join(__dirname, 'public');

app.use(
  '/css',
  express.static(
    path.join(PUBLIC_DIR, 'css')
  )
);

app.use(
  '/js',
  express.static(
    path.join(PUBLIC_DIR, 'js')
  )
);

app.use(
  '/assets',
  express.static(
    path.join(PUBLIC_DIR, 'assets')
  )
);


// ============================================================
// AUTENTICAÇÃO E PERMISSÕES
// ============================================================

const COOKIE_SESSAO =
  'lenvie_session';

const DURACAO_SESSAO_HORAS =
  8;

const PERFIS = [
  'administrador',
  'gestor',
  'editor',
  'visualizador'
];

const PERMISSOES = {
  administrador: {
    criar: true,
    editar: true,
    exportar: true,
    gerenciar_usuarios: true
  },
  gestor: {
    criar: true,
    editar: true,
    exportar: true,
    gerenciar_usuarios: false
  },
  editor: {
    criar: false,
    editar: true,
    exportar: true,
    gerenciar_usuarios: false
  },
  visualizador: {
    criar: false,
    editar: false,
    exportar: true,
    gerenciar_usuarios: false
  }
};

function normalizarEmail(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase();
}

function normalizarNome(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatarDataBR(valor) {
  if (!valor) return '—';

  const texto =
    String(valor).slice(0, 10);

  const partes =
    texto.split('-');

  if (partes.length !== 3) {
    return texto;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}


async function resolverDestinatariosNotificacao(
  client,
  projeto,
  body
) {

  const emails =
    new Set();

  const nomesEncontrados =
    [];

  const nomesNaoEncontrados =
    [];

  const usuarios =
    (
      await client.query(`
        SELECT
          nome,
          email
        FROM usuarios
        WHERE ativo=TRUE
      `)
    ).rows;


  const localizarPorNome =
    nome => {

      const alvo =
        normalizarNome(nome);

      if (!alvo) {
        return null;
      }

      return (
        usuarios.find(
          usuario =>
            normalizarNome(
              usuario.nome
            ) === alvo
        ) ||
        null
      );
    };


  const adicionarResponsavel =
    (
      nome,
      tipo
    ) => {

      if (!nome) {
        return;
      }


      // Também permite que o próprio
      // campo contenha um e-mail.

      if (
        String(nome).includes('@')
      ) {

        const email =
          normalizarEmail(nome);

        if (email) {
          emails.add(email);
        }

        nomesEncontrados.push(
          `${tipo}: ${nome}`
        );

        return;
      }


      const usuario =
        localizarPorNome(nome);


      if (
        usuario?.email
      ) {

        emails.add(
          normalizarEmail(
            usuario.email
          )
        );

        nomesEncontrados.push(
          `${tipo}: ${usuario.nome}`
        );

      } else {

        nomesNaoEncontrados.push(
          `${tipo}: ${nome}`
        );
      }
    };


  if (
    body.notificar_comercial
  ) {

    adicionarResponsavel(
      projeto.comercial_responsavel,
      'Comercial'
    );
  }


  if (
    body.notificar_projeto
  ) {

    adicionarResponsavel(
      projeto.responsavel,
      'Projeto'
    );
  }


  const adicional =
    normalizarEmail(
      body.notificacao_email_adicional
    );


  if (adicional) {

    emails.add(
      adicional
    );

    nomesEncontrados.push(
      `E-mail adicional: ${adicional}`
    );
  }


  return {

    emails:
      [...emails],

    nomesEncontrados,

    nomesNaoEncontrados
  };
}


async function enviarNotificacaoProjeto({
  projeto,
  body,
  destinatarios,
  usuarioNome
}) {

  const apiKey =
    process.env.RESEND_API_KEY;

  const remetente =
    process.env.NOTIFICATION_FROM;


  if (
    !apiKey ||
    !remetente
  ) {

    throw new Error(
      'Configure RESEND_API_KEY e NOTIFICATION_FROM no Render.'
    );
  }


  if (
    !destinatarios.length
  ) {

    throw new Error(
      'Nenhum e-mail de destinatário foi encontrado. Cadastre o responsável como usuário ou informe um e-mail adicional.'
    );
  }


  const motivo =
    String(
      body.notificacao_motivo ||
      'Atualização do projeto'
    ).trim();


  const mensagemAdicional =
    String(
      body.notificacao_mensagem ||
      ''
    ).trim();


  const observacao =
    String(
      body.movimentacao_observacao ||
      ''
    ).trim();


  const assunto =
    `LENVIE | ${motivo} – ${projeto.cliente} / ${projeto.nome}`;


  const html = `
    <div
      style="
        font-family:Arial,sans-serif;
        line-height:1.55;
        color:#222
      "
    >

      <h2 style="margin-bottom:6px">
        Atualização de projeto LENVIE
      </h2>

      <p style="margin-top:0">
        <strong>
          ${escaparHtml(motivo)}
        </strong>
      </p>

      <table
        cellpadding="6"
        cellspacing="0"
        style="border-collapse:collapse"
      >

        <tr>
          <td>
            <strong>Projeto</strong>
          </td>

          <td>
            ${escaparHtml(projeto.codigo)}
            ·
            ${escaparHtml(projeto.nome)}
          </td>
        </tr>

        <tr>
          <td>
            <strong>Cliente</strong>
          </td>

          <td>
            ${escaparHtml(projeto.cliente)}
          </td>
        </tr>

        <tr>
          <td>
            <strong>Status</strong>
          </td>

          <td>
            ${escaparHtml(projeto.status)}
          </td>
        </tr>

        <tr>
          <td>
            <strong>Etapa</strong>
          </td>

          <td>
            ${escaparHtml(projeto.etapa_atual)}
          </td>
        </tr>

        <tr>
          <td>
            <strong>Pendência</strong>
          </td>

          <td>
            ${
              escaparHtml(
                projeto.area_pendente ||
                'Sem pendência'
              )
            }
          </td>
        </tr>

        <tr>
          <td>
            <strong>Próxima ação</strong>
          </td>

          <td>
            ${
              escaparHtml(
                projeto.proxima_acao ||
                '—'
              )
            }
          </td>
        </tr>

        <tr>
          <td>
            <strong>Prazo</strong>
          </td>

          <td>
            ${
              escaparHtml(
                formatarDataBR(
                  projeto.prazo_proxima_acao
                )
              )
            }
          </td>
        </tr>

        <tr>
          <td>
            <strong>
              Data da movimentação
            </strong>
          </td>

          <td>
            ${
              escaparHtml(
                formatarDataBR(
                  body.data_movimentacao ||
                  new Date()
                    .toISOString()
                    .slice(0, 10)
                )
              )
            }
          </td>
        </tr>

      </table>


      ${
        observacao

          ? `
            <p>
              <strong>
                Movimentação:
              </strong>

              <br>

              ${
                escaparHtml(
                  observacao
                ).replace(
                  /\n/g,
                  '<br>'
                )
              }
            </p>
          `

          : ''
      }


      ${
        mensagemAdicional

          ? `
            <p>
              <strong>
                Mensagem:
              </strong>

              <br>

              ${
                escaparHtml(
                  mensagemAdicional
                ).replace(
                  /\n/g,
                  '<br>'
                )
              }
            </p>
          `

          : ''
      }


      <p
        style="
          color:#666;
          font-size:12px
        "
      >

        Atualizado por:
        ${
          escaparHtml(
            usuarioNome ||
            'LENVIE'
          )
        }

      </p>

    </div>
  `;


  const resposta =
    await fetch(
      'https://api.resend.com/emails',
      {

        method:
          'POST',

        headers: {

          Authorization:
            `Bearer ${apiKey}`,

          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify({

            from:
              remetente,

            to:
              destinatarios,

            subject:
              assunto,

            html
          })
      }
    );


  let retorno =
    {};


  try {

    retorno =
      await resposta.json();

  } catch {

    retorno =
      {};
  }


  if (
    !resposta.ok
  ) {

    throw new Error(
      retorno.message ||
      retorno.error ||
      `Falha no envio de e-mail (HTTP ${resposta.status}).`
    );
  }


  return retorno;
}


function parseCookies(req) {
  const cabecalho =
    req.headers.cookie || '';

  return Object.fromEntries(
    cabecalho
      .split(';')
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const indice =
          item.indexOf('=');

        if (indice < 0) {
          return [item, ''];
        }

        return [
          decodeURIComponent(
            item.slice(0, indice)
          ),
          decodeURIComponent(
            item.slice(indice + 1)
          )
        ];
      })
  );
}

function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

function hashSenha(senha) {
  const salt =
    crypto
      .randomBytes(16)
      .toString('hex');

  const hash =
    crypto
      .scryptSync(
        String(senha),
        salt,
        64
      )
      .toString('hex');

  return `scrypt$${salt}$${hash}`;
}

function validarSenha(
  senha,
  senhaHash
) {
  try {
    const [
      algoritmo,
      salt,
      hashSalvo
    ] =
      String(senhaHash || '')
        .split('$');

    if (
      algoritmo !== 'scrypt' ||
      !salt ||
      !hashSalvo
    ) {
      return false;
    }

    const hashInformado =
      crypto.scryptSync(
        String(senha),
        salt,
        64
      );

    const hashBanco =
      Buffer.from(
        hashSalvo,
        'hex'
      );

    return (
      hashBanco.length ===
        hashInformado.length &&
      crypto.timingSafeEqual(
        hashBanco,
        hashInformado
      )
    );

  } catch {
    return false;
  }
}

function cookieSessao(
  token,
  limpar = false
) {
  const partes = [
    `${COOKIE_SESSAO}=${
      limpar
        ? ''
        : encodeURIComponent(token)
    }`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];

  if (
    process.env.NODE_ENV ===
    'production'
  ) {
    partes.push('Secure');
  }

  partes.push(
    limpar
      ? 'Max-Age=0'
      : `Max-Age=${
          DURACAO_SESSAO_HORAS *
          60 *
          60
        }`
  );

  return partes.join('; ');
}

function permissoesDoPerfil(perfil) {
  return (
    PERMISSOES[perfil] ||
    PERMISSOES.visualizador
  );
}

async function carregarUsuario(req) {
  const token =
    parseCookies(req)[COOKIE_SESSAO];

  if (!token) {
    return null;
  }

  const q =
    await pool.query(
      `
      SELECT
        u.id,
        u.nome,
        u.email,
        u.perfil,
        u.ativo
      FROM sessoes s
      JOIN usuarios u
        ON u.id=s.usuario_id
      WHERE
        s.token_hash=$1
        AND s.expira_em>NOW()
        AND u.ativo=TRUE
      LIMIT 1
      `,
      [hashToken(token)]
    );

  return q.rows[0] || null;
}

async function exigirLogin(
  req,
  res,
  next
) {
  try {
    const usuario =
      await carregarUsuario(req);

    if (!usuario) {
      return res
        .status(401)
        .json({
          erro:
            'Sessão expirada ou usuário não autenticado.'
        });
    }

    req.usuario =
      usuario;

    next();

  } catch (erro) {
    next(erro);
  }
}

function exigirPermissao(permissao) {
  return (
    req,
    res,
    next
  ) => {
    const permissoes =
      permissoesDoPerfil(
        req.usuario?.perfil
      );

    if (!permissoes[permissao]) {
      return res
        .status(403)
        .json({
          erro:
            'Seu perfil não possui permissão para esta ação.'
        });
    }

    next();
  };
}
async function exigirPaginaLogada(
  req,
  res,
  next
) {
  try {
    const usuario =
      await carregarUsuario(req);

    if (!usuario) {
      return res.redirect(
        '/login.html'
      );
    }

    req.usuario =
      usuario;

    next();

  } catch (erro) {
    next(erro);
  }
}

async function exigirPaginaAdmin(
  req,
  res,
  next
) {
  try {
    const usuario =
      await carregarUsuario(req);

    if (!usuario) {
      return res.redirect(
        '/login.html'
      );
    }

    if (
      !permissoesDoPerfil(
        usuario.perfil
      ).gerenciar_usuarios
    ) {
      return res.redirect('/');
    }

    req.usuario =
      usuario;

    next();

  } catch (erro) {
    next(erro);
  }
}

async function registrarAuditoria({
  usuarioId = null,
  usuarioNome = null,
  acao,
  entidade,
  entidadeId = null,
  detalhes = null
}) {
  try {
    await pool.query(
      `
      INSERT INTO auditoria (
        usuario_id,
        usuario_nome,
        acao,
        entidade,
        entidade_id,
        detalhes
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
        usuarioId,
        usuarioNome,
        acao,
        entidade,
        entidadeId,
        detalhes
          ? JSON.stringify(detalhes)
          : null
      ]
    );

  } catch (erro) {
    console.error(
      'Falha ao registrar auditoria:',
      erro.message
    );
  }
}


// ============================================================
// CONFIGURAÇÕES DE NEGÓCIO
// ============================================================

const statusProjetos = [
  'Em andamento',
  'Pausado',
  'Concluído',
  'Cancelado'
];

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

function codigo(numero) {
  return (
    'PRJ-' +
    String(numero)
      .padStart(4, '0')
  );
}

function keep(
  valor,
  atual
) {
  return (
    valor === undefined
      ? atual
      : valor
  );
}

function nullable(
  body,
  campo,
  atual
) {
  if (
    !Object.prototype
      .hasOwnProperty
      .call(body, campo)
  ) {
    return atual;
  }

  const valor =
    body[campo];

  if (
    valor === '' ||
    valor === undefined
  ) {
    return null;
  }

  return valor;
}

function situacaoSQL(alias = 'p') {
  return `
    CASE

      WHEN ${alias}.status='Concluído'
        THEN 'CONCLUÍDO'

      WHEN ${alias}.status='Cancelado'
        THEN 'CANCELADO'

      WHEN ${alias}.status='Pausado'
        THEN 'PAUSADO'

      WHEN
        ${alias}.prazo_90_dias IS NOT NULL
        AND ${alias}.prazo_90_dias<CURRENT_DATE
        THEN 'PRAZO 90 DIAS VENCIDO'

      WHEN
        ${alias}.prazo_proxima_acao IS NOT NULL
        AND ${alias}.prazo_proxima_acao<CURRENT_DATE
        THEN 'AÇÃO VENCIDA'

      WHEN
        ${alias}.previsao_conclusao IS NOT NULL
        AND ${alias}.previsao_conclusao<CURRENT_DATE
        THEN 'ATRASADO'

      WHEN
        ${alias}.area_pendente='Cliente'
        THEN 'AGUARDANDO CLIENTE'

      WHEN
        ${alias}.area_pendente IS NOT NULL
        AND ${alias}.area_pendente<>'Sem pendência'
        THEN 'AGUARDANDO ' ||
          UPPER(${alias}.area_pendente)

      WHEN
        ${alias}.atualizado_em<
          NOW()-INTERVAL '15 days'
        THEN 'SEM ATUALIZAÇÃO'

      ELSE 'EM ANDAMENTO'

    END
  `;
}


// ============================================================
// INICIALIZAÇÃO DO BANCO
// ============================================================

async function inicializarBanco() {
  const c =
    await pool.connect();

  try {
    await c.query('BEGIN');

    await c.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        perfil TEXT NOT NULL
          DEFAULT 'visualizador',
        ativo BOOLEAN NOT NULL
          DEFAULT TRUE,
        criado_em TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL
          DEFAULT NOW()
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS sessoes (
        id BIGSERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL
          REFERENCES usuarios(id)
          ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        criado_em TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),
        expira_em TIMESTAMPTZ NOT NULL
      )
    `);

    await c.query(`
      CREATE INDEX IF NOT EXISTS
        idx_sessoes_token_hash
      ON sessoes(token_hash)
    `);

    await c.query(`
      CREATE INDEX IF NOT EXISTS
        idx_sessoes_expira_em
      ON sessoes(expira_em)
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS auditoria (
        id BIGSERIAL PRIMARY KEY,
        usuario_id INTEGER NULL,
        usuario_nome TEXT NULL,
        acao TEXT NOT NULL,
        entidade TEXT NOT NULL,
        entidade_id TEXT NULL,
        detalhes JSONB NULL,
        criado_em TIMESTAMPTZ NOT NULL
          DEFAULT NOW()
      )
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS projetos (
        id SERIAL PRIMARY KEY,
        codigo TEXT NOT NULL UNIQUE,
        cliente TEXT NOT NULL,
        segmento TEXT,
        nome TEXT NOT NULL,
        responsavel TEXT,
        data_inicio DATE NOT NULL
          DEFAULT CURRENT_DATE,
        previsao_conclusao DATE,
        status TEXT NOT NULL
          DEFAULT 'Em andamento',
        etapa_atual TEXT NOT NULL
          DEFAULT 'Entrada / Oportunidade',
        area_pendente TEXT NOT NULL
          DEFAULT 'Sem pendência',
        proxima_acao TEXT,
        prazo_proxima_acao DATE,
        data_aprovacao DATE,
        prazo_90_dias DATE,
        data_conclusao DATE,
        observacoes TEXT,
        origem_cliente TEXT,
        comercial_responsavel TEXT,
        criado_em TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL
          DEFAULT NOW()
      )
    `);

    await c.query(`
      ALTER TABLE projetos
      ADD COLUMN IF NOT EXISTS
        origem_cliente TEXT
    `);

    await c.query(`
      ALTER TABLE projetos
      ADD COLUMN IF NOT EXISTS
        comercial_responsavel TEXT
    `);

    await c.query(`
      ALTER TABLE projetos
      ADD COLUMN IF NOT EXISTS
        data_conclusao DATE
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS historico_etapas (
        id BIGSERIAL PRIMARY KEY,
        projeto_id INTEGER NOT NULL
          REFERENCES projetos(id)
          ON DELETE CASCADE,
        data_registro TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),
        data_movimentacao DATE,
        etapa TEXT,
        area_pendente TEXT,
        situacao TEXT,
        pendencia_proximo_passo TEXT,
        observacoes TEXT,
        usuario_id INTEGER,
        usuario_nome TEXT
      )
    `);

    await c.query(`
      ALTER TABLE historico_etapas
      ADD COLUMN IF NOT EXISTS
        data_movimentacao DATE
    `);

    await c.query(`
      ALTER TABLE historico_etapas
      ADD COLUMN IF NOT EXISTS
        usuario_id INTEGER
    `);

    await c.query(`
      ALTER TABLE historico_etapas
      ADD COLUMN IF NOT EXISTS
        usuario_nome TEXT
    `);

    await c.query(`
      CREATE INDEX IF NOT EXISTS
        idx_historico_projeto
      ON historico_etapas(projeto_id)
    `);

    await c.query(`
      CREATE INDEX IF NOT EXISTS
        idx_historico_movimentacao
      ON historico_etapas(
        projeto_id,
        data_movimentacao
      )
    `);

    await c.query(`
      DELETE FROM sessoes
      WHERE expira_em<=NOW()
    `);


    // ========================================================
    // ADMINISTRADOR INICIAL
    // ========================================================

    const adminEmail =
      normalizarEmail(
        process.env.ADMIN_EMAIL
      );

    const adminSenha =
      process.env.ADMIN_PASSWORD;

    const adminNome =
      String(
        process.env.ADMIN_NAME ||
        'Administrador'
      ).trim();


    if (
      adminEmail &&
      adminSenha
    ) {
      const existe =
        await c.query(
          `
          SELECT id
          FROM usuarios
          WHERE LOWER(email)=LOWER($1)
          LIMIT 1
          `,
          [adminEmail]
        );

      if (!existe.rowCount) {
        await c.query(
          `
          INSERT INTO usuarios (
            nome,
            email,
            senha_hash,
            perfil,
            ativo
          )
          VALUES (
            $1,
            $2,
            $3,
            'administrador',
            TRUE
          )
          `,
          [
            adminNome,
            adminEmail,
            hashSenha(adminSenha)
          ]
        );

        console.log(
          'Administrador inicial criado.'
        );
      }
    }

    await c.query('COMMIT');

  } catch (erro) {
    await c.query('ROLLBACK');
    throw erro;

  } finally {
    c.release();
  }
}


// ============================================================
// ROTAS PÚBLICAS DE AUTENTICAÇÃO
// ============================================================

app.get(
  '/api/auth/me',
  async (
    req,
    res,
    next
  ) => {
    try {
      const usuario =
        await carregarUsuario(req);

      if (!usuario) {
        return res
          .status(401)
          .json({
            autenticado: false
          });
      }

      res.json({
        autenticado: true,

        usuario: {
          id:
            usuario.id,

          nome:
            usuario.nome,

          email:
            usuario.email,

          perfil:
            usuario.perfil,

          permissoes:
            permissoesDoPerfil(
              usuario.perfil
            )
        }
      });

    } catch (erro) {
      next(erro);
    }
  }
);


app.post(
  '/api/auth/login',
  async (
    req,
    res,
    next
  ) => {
    try {
      const email =
        normalizarEmail(
          req.body?.email
        );

      const senha =
        String(
          req.body?.senha ||
          ''
        );


      if (
        !email ||
        !senha
      ) {
        return res
          .status(400)
          .json({
            erro:
              'Informe e-mail e senha.'
          });
      }


      const q =
        await pool.query(
          `
          SELECT
            id,
            nome,
            email,
            senha_hash,
            perfil,
            ativo
          FROM usuarios
          WHERE LOWER(email)=LOWER($1)
          LIMIT 1
          `,
          [email]
        );


      const usuario =
        q.rows[0];


      if (
        !usuario ||
        !usuario.ativo ||
        !validarSenha(
          senha,
          usuario.senha_hash
        )
      ) {
        return res
          .status(401)
          .json({
            erro:
              'E-mail ou senha inválidos.'
          });
      }


      const token =
        crypto
          .randomBytes(32)
          .toString('hex');


      await pool.query(
        `
        INSERT INTO sessoes (
          usuario_id,
          token_hash,
          expira_em
        )
        VALUES (
          $1,
          $2,
          NOW() +
            ($3 || ' hours')::interval
        )
        `,
        [
          usuario.id,
          hashToken(token),
          DURACAO_SESSAO_HORAS
        ]
      );


      res.setHeader(
        'Set-Cookie',
        cookieSessao(token)
      );


      await registrarAuditoria({
        usuarioId:
          usuario.id,

        usuarioNome:
          usuario.nome,

        acao:
          'LOGIN',

        entidade:
          'SESSAO',

        entidadeId:
          usuario.id
      });


      res.json({
        ok: true,

        usuario: {
          id:
            usuario.id,

          nome:
            usuario.nome,

          email:
            usuario.email,

          perfil:
            usuario.perfil,

          permissoes:
            permissoesDoPerfil(
              usuario.perfil
            )
        }
      });

    } catch (erro) {
      next(erro);
    }
  }
);


app.post(
  '/api/auth/logout',
  async (
    req,
    res,
    next
  ) => {
    try {
      const token =
        parseCookies(req)[
          COOKIE_SESSAO
        ];

      if (token) {
        await pool.query(
          `
          DELETE FROM sessoes
          WHERE token_hash=$1
          `,
          [hashToken(token)]
        );
      }


      res.setHeader(
        'Set-Cookie',
        cookieSessao('', true)
      );


      res.json({
        ok: true
      });

    } catch (erro) {
      next(erro);
    }
  }
);


// ============================================================
// PROTEÇÃO DAS PÁGINAS
// ============================================================

app.get(
  '/',
  exigirPaginaLogada,
  (
    req,
    res
  ) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        'index.html'
      )
    );
  }
);


app.get(
  '/projetos.html',
  exigirPaginaLogada,
  (
    req,
    res
  ) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        'projetos.html'
      )
    );
  }
);


app.get(
  '/projeto.html',
  exigirPaginaLogada,
  (
    req,
    res
  ) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        'projeto.html'
      )
    );
  }
);


app.get(
  '/usuarios.html',
  exigirPaginaAdmin,
  (
    req,
    res
  ) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        'usuarios.html'
      )
    );
  }
);

// ============================================================
// ARQUIVOS PÚBLICOS PERMITIDOS
// ============================================================

app.get(
  '/login.html',
  (
    req,
    res
  ) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        'login.html'
      )
    );
  }
);


// ============================================================
// API - CONFIGURAÇÕES
// ============================================================

app.get(
  '/api/config',
  exigirLogin,
  (
    req,
    res
  ) => {

    res.json({
      status:
        statusProjetos,

      etapas,

      areas,

      usuario: {
        id:
          req.usuario.id,

        nome:
          req.usuario.nome,

        email:
          req.usuario.email,

        perfil:
          req.usuario.perfil,

        permissoes:
          permissoesDoPerfil(
            req.usuario.perfil
          )
      }
    });
  }
);


// ============================================================
// API - USUÁRIOS
// ============================================================

app.get(
  '/api/usuarios',
  exigirLogin,
  exigirPermissao(
    'gerenciar_usuarios'
  ),
  async (
    req,
    res,
    next
  ) => {

    try {

      const q =
        await pool.query(`
          SELECT
            id,
            nome,
            email,
            perfil,
            ativo,
            criado_em,
            atualizado_em

          FROM usuarios

          ORDER BY
            ativo DESC,
            nome ASC
        `);


      res.json(
        q.rows
      );

    } catch (erro) {

      next(erro);
    }
  }
);


app.post(
  '/api/usuarios',
  exigirLogin,
  exigirPermissao(
    'gerenciar_usuarios'
  ),
  async (
    req,
    res,
    next
  ) => {

    try {

      const nome =
        String(
          req.body?.nome ||
          ''
        ).trim();


      const email =
        normalizarEmail(
          req.body?.email
        );


      const senha =
        String(
          req.body?.senha ||
          ''
        );


      const perfil =
        String(
          req.body?.perfil ||
          'visualizador'
        ).toLowerCase();


      if (
        !nome ||
        !email ||
        !senha
      ) {

        return res
          .status(400)
          .json({
            erro:
              'Nome, e-mail e senha são obrigatórios.'
          });
      }


      if (
        !PERFIS.includes(
          perfil
        )
      ) {

        return res
          .status(400)
          .json({
            erro:
              'Perfil de usuário inválido.'
          });
      }


      if (
        senha.length < 6
      ) {

        return res
          .status(400)
          .json({
            erro:
              'A senha deve possuir pelo menos 6 caracteres.'
          });
      }


      const existente =
        await pool.query(
          `
          SELECT id
          FROM usuarios
          WHERE LOWER(email)=LOWER($1)
          LIMIT 1
          `,
          [email]
        );


      if (
        existente.rowCount
      ) {

        return res
          .status(409)
          .json({
            erro:
              'Já existe um usuário com este e-mail.'
          });
      }


      const q =
        await pool.query(
          `
          INSERT INTO usuarios (
            nome,
            email,
            senha_hash,
            perfil,
            ativo
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            TRUE
          )

          RETURNING
            id,
            nome,
            email,
            perfil,
            ativo,
            criado_em,
            atualizado_em
          `,
          [
            nome,
            email,
            hashSenha(senha),
            perfil
          ]
        );


      await registrarAuditoria({

        usuarioId:
          req.usuario.id,

        usuarioNome:
          req.usuario.nome,

        acao:
          'CRIAR_USUARIO',

        entidade:
          'USUARIO',

        entidadeId:
          q.rows[0].id,

        detalhes: {
          nome,
          email,
          perfil
        }
      });


      res
        .status(201)
        .json(
          q.rows[0]
        );

    } catch (erro) {

      next(erro);
    }
  }
);


app.put(
  '/api/usuarios/:id',
  exigirLogin,
  exigirPermissao(
    'gerenciar_usuarios'
  ),
  async (
    req,
    res,
    next
  ) => {

    const c =
      await pool.connect();


    try {

      await c.query(
        'BEGIN'
      );


      const atual =
        await c.query(
          `
          SELECT *
          FROM usuarios
          WHERE id=$1
          FOR UPDATE
          `,
          [req.params.id]
        );


      if (
        !atual.rowCount
      ) {

        await c.query(
          'ROLLBACK'
        );

        return res
          .status(404)
          .json({
            erro:
              'Usuário não encontrado.'
          });
      }


      const usuarioAtual =
        atual.rows[0];


      const nome =
        req.body.nome !== undefined
          ? String(
              req.body.nome ||
              ''
            ).trim()
          : usuarioAtual.nome;


      const email =
        req.body.email !== undefined
          ? normalizarEmail(
              req.body.email
            )
          : usuarioAtual.email;


      const perfil =
        req.body.perfil !== undefined
          ? String(
              req.body.perfil
            ).toLowerCase()
          : usuarioAtual.perfil;


      const ativo =
        req.body.ativo !== undefined
          ? Boolean(
              req.body.ativo
            )
          : usuarioAtual.ativo;


      if (
        !nome ||
        !email
      ) {

        await c.query(
          'ROLLBACK'
        );

        return res
          .status(400)
          .json({
            erro:
              'Nome e e-mail são obrigatórios.'
          });
      }


      if (
        !PERFIS.includes(
          perfil
        )
      ) {

        await c.query(
          'ROLLBACK'
        );

        return res
          .status(400)
          .json({
            erro:
              'Perfil de usuário inválido.'
          });
      }


      const duplicado =
        await c.query(
          `
          SELECT id
          FROM usuarios
          WHERE
            LOWER(email)=LOWER($1)
            AND id<>$2
          LIMIT 1
          `,
          [
            email,
            req.params.id
          ]
        );


      if (
        duplicado.rowCount
      ) {

        await c.query(
          'ROLLBACK'
        );

        return res
          .status(409)
          .json({
            erro:
              'Já existe outro usuário com este e-mail.'
          });
      }


      let senhaHash =
        usuarioAtual.senha_hash;


      if (
        req.body.senha
      ) {

        const novaSenha =
          String(
            req.body.senha
          );


        if (
          novaSenha.length < 6
        ) {

          await c.query(
            'ROLLBACK'
          );

          return res
            .status(400)
            .json({
              erro:
                'A senha deve possuir pelo menos 6 caracteres.'
            });
        }


        senhaHash =
          hashSenha(
            novaSenha
          );
      }


      const q =
        await c.query(
          `
          UPDATE usuarios

          SET
            nome=$1,
            email=$2,
            perfil=$3,
            ativo=$4,
            senha_hash=$5,
            atualizado_em=NOW()

          WHERE id=$6

          RETURNING
            id,
            nome,
            email,
            perfil,
            ativo,
            criado_em,
            atualizado_em
          `,
          [
            nome,
            email,
            perfil,
            ativo,
            senhaHash,
            req.params.id
          ]
        );


      if (
        !ativo
      ) {

        await c.query(
          `
          DELETE FROM sessoes
          WHERE usuario_id=$1
          `,
          [req.params.id]
        );
      }


      await c.query(
        'COMMIT'
      );


      await registrarAuditoria({

        usuarioId:
          req.usuario.id,

        usuarioNome:
          req.usuario.nome,

        acao:
          'ALTERAR_USUARIO',

        entidade:
          'USUARIO',

        entidadeId:
          req.params.id,

        detalhes: {
          nome,
          email,
          perfil,
          ativo
        }
      });


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
// PROTEÇÃO DAS APIs ABAIXO
// ============================================================

app.use(
  '/api',
  exigirLogin
);


// ============================================================
// DASHBOARD
// ============================================================

app.get(
  '/api/dashboard',
  async (
    req,
    res,
    next
  ) => {

    try {

      const resumo =
        await pool.query(`
          SELECT

            COUNT(*)::int
              AS total,

            COUNT(*) FILTER (
              WHERE status='Em andamento'
            )::int
              AS em_andamento,

            COUNT(*) FILTER (
              WHERE status='Pausado'
            )::int
              AS pausados,

            COUNT(*) FILTER (
              WHERE status='Concluído'
            )::int
              AS concluidos,

            COUNT(*) FILTER (
              WHERE
                etapa_atual=
                'Concluído / Sem Conversão'
            )::int
              AS sem_conversao,

            COUNT(*) FILTER (
              WHERE
                area_pendente='Cliente'
                AND status NOT IN (
                  'Concluído',
                  'Cancelado'
                )
            )::int
              AS aguardando_cliente,

            COUNT(*) FILTER (
              WHERE
                prazo_proxima_acao<
                  CURRENT_DATE
                AND status NOT IN (
                  'Concluído',
                  'Cancelado'
                )
            )::int
              AS acoes_vencidas,

            COUNT(*) FILTER (
              WHERE
                previsao_conclusao<
                  CURRENT_DATE
                AND status NOT IN (
                  'Concluído',
                  'Cancelado'
                )
            )::int
              AS atrasados,

            COUNT(*) FILTER (
              WHERE
                atualizado_em<
                  NOW()-INTERVAL '15 days'
                AND status NOT IN (
                  'Concluído',
                  'Cancelado'
                )
            )::int
              AS sem_atualizacao

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

          WHERE
            status NOT IN (
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

            ${situacaoSQL('p')}
              situacao

          FROM projetos p

          WHERE
            status NOT IN (
              'Concluído',
              'Cancelado'
            )

          ORDER BY

            CASE

              WHEN
                prazo_proxima_acao<
                  CURRENT_DATE
                THEN 0

              WHEN
                previsao_conclusao<
                  CURRENT_DATE
                THEN 1

              WHEN
                atualizado_em<
                  NOW()-INTERVAL '15 days'
                THEN 2

              ELSE 3

            END,

            COALESCE(
              prazo_proxima_acao,
              previsao_conclusao,
              prazo_90_dias
            )
            NULLS LAST

          LIMIT 12
        `);


      res.json({

        ...resumo.rows[0],

        por_etapa:
          etapasQ.rows,

        por_area:
          areasQ.rows,

        atencao:
          atencao.rows
      });


    } catch (erro) {

      next(erro);
    }
  }
);


// ============================================================
// MOVIMENTO DO MÊS
// ============================================================

app.get(
  '/api/dashboard/movimento-mes',
  async (
    req,
    res,
    next
  ) => {

    try {

      const agora =
        new Date();


      let ano =
        Number(
          req.query.ano
        );


      let mes =
        Number(
          req.query.mes
        );


      if (
        !Number.isInteger(ano) ||
        ano < 2000 ||
        ano > 2100
      ) {

        ano =
          agora.getFullYear();
      }


      if (
        !Number.isInteger(mes) ||
        mes < 1 ||
        mes > 12
      ) {

        mes =
          agora.getMonth() + 1;
      }


      const inicio =
        `${ano}-${String(mes)
          .padStart(2, '0')}-01`;


      const proximoMes =
        mes === 12
          ? `${ano + 1}-01-01`
          : `${ano}-${String(
              mes + 1
            ).padStart(2, '0')}-01`;


      const cadastrados =
        await pool.query(
          `
          SELECT COUNT(*)::int total

          FROM projetos

          WHERE
            data_inicio >= $1::date
            AND data_inicio < $2::date
          `,
          [
            inicio,
            proximoMes
          ]
        );


      const movimentos =
        await pool.query(
          `
          SELECT

            COUNT(*)::int
              AS movimentos,

            COUNT(*) FILTER (
              WHERE
                etapa=
                'Concluído / Pedido Fechado'
            )::int
              AS concluidos_convertidos,

            COUNT(*) FILTER (
              WHERE
                etapa=
                'Concluído / Sem Conversão'
            )::int
              AS concluidos_sem_conversao

          FROM historico_etapas

          WHERE
            COALESCE(
              data_movimentacao,
              data_registro::date
            ) >= $1::date

            AND

            COALESCE(
              data_movimentacao,
              data_registro::date
            ) < $2::date
          `,
          [
            inicio,
            proximoMes
          ]
        );


      res.json({

        ano,

        mes,

        cadastrados:
          cadastrados.rows[0]
            .total,

        movimentos:
          movimentos.rows[0]
            .movimentos,

        concluidos:
          movimentos.rows[0]
            .concluidos_convertidos,

        sem_conversao:
          movimentos.rows[0]
            .concluidos_sem_conversao
      });


    } catch (erro) {

      next(erro);
    }
  }
);


// ============================================================
// LEMBRETES DE PRÓXIMA AÇÃO
// ============================================================

app.get(
  '/api/dashboard/lembretes',
  async (
    req,
    res,
    next
  ) => {

    try {

      const q =
        await pool.query(`
          SELECT

            id,
            codigo,
            cliente,
            nome,
            responsavel,
            comercial_responsavel,
            status,
            etapa_atual,
            area_pendente,
            proxima_acao,
            prazo_proxima_acao,

            (
              prazo_proxima_acao -
              CURRENT_DATE
            )::int
              AS dias_para_acao

          FROM projetos

          WHERE

            status NOT IN (
              'Concluído',
              'Cancelado'
            )

            AND

            prazo_proxima_acao
              IS NOT NULL

            AND

            prazo_proxima_acao
              <= CURRENT_DATE +
                INTERVAL '7 days'

          ORDER BY

            prazo_proxima_acao ASC,

            cliente ASC
        `);


      res.json(
        q.rows
      );


    } catch (erro) {

      next(erro);
    }
  }
);


// ============================================================
// LISTAGEM DE PROJETOS
// ============================================================

app.get(
  '/api/projetos',
  async (
    req,
    res,
    next
  ) => {

    try {

      const q =
        await pool.query(`
          SELECT

            p.*,

            ${situacaoSQL('p')}
              situacao_automatica,

            (
              CURRENT_DATE -
              p.data_inicio
            )::int
              dias_em_aberto,

            GREATEST(
              0,
              (
                CURRENT_DATE -
                p.atualizado_em::date
              )
            )::int
              dias_sem_atualizacao,

            CASE

              WHEN
                p.prazo_90_dias
                  IS NULL
                THEN NULL

              ELSE
                (
                  p.prazo_90_dias -
                  CURRENT_DATE
                )::int

            END
              dias_para_90

          FROM projetos p

          ORDER BY
            atualizado_em DESC
        `);


      res.json(
        q.rows
      );


    } catch (erro) {

      next(erro);
    }
  }
);
// ============================================================
// DETALHE DO PROJETO
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


      // ========================================================
      // HISTÓRICO
      // ========================================================

      const h =
        await pool.query(
          `
          SELECT

            h.*,

            ROUND(
              (
                COALESCE(
                  LEAD(
                    COALESCE(
                      h.data_movimentacao,
                      h.data_registro::date
                    )
                  )
                  OVER(
                    ORDER BY
                      COALESCE(
                        h.data_movimentacao,
                        h.data_registro::date
                      ),
                      h.data_registro
                  ),
                  CURRENT_DATE
                )
                -
                COALESCE(
                  h.data_movimentacao,
                  h.data_registro::date
                )
              )::numeric,
              1
            ) dias_na_situacao

          FROM historico_etapas h

          WHERE projeto_id=$1

          ORDER BY
            COALESCE(
              data_movimentacao,
              data_registro::date
            ) DESC,
            data_registro DESC
          `,
          [req.params.id]
        );


      // ========================================================
      // TEMPO POR ETAPA
      // ========================================================

      const tempos =
        await pool.query(
          `
          WITH mov AS (

            SELECT

              etapa,

              area_pendente,

              COALESCE(
                data_movimentacao,
                data_registro::date
              ) data_movimentacao,

              COALESCE(

                LEAD(
                  COALESCE(
                    data_movimentacao,
                    data_registro::date
                  )
                )
                OVER(
                  ORDER BY
                    COALESCE(
                      data_movimentacao,
                      data_registro::date
                    ),
                    data_registro
                ),

                CURRENT_DATE

              ) fim

            FROM historico_etapas

            WHERE projeto_id=$1
          )

          SELECT

            etapa,

            ROUND(
              SUM(
                fim-data_movimentacao
              )::numeric,
              1
            )::float dias

          FROM mov

          GROUP BY etapa

          ORDER BY
            MIN(data_movimentacao)
          `,
          [req.params.id]
        );


      // ========================================================
      // TEMPO AGUARDANDO
      // ========================================================

      const esperas =
        await pool.query(
          `
          WITH mov AS (

            SELECT

              area_pendente,

              COALESCE(
                data_movimentacao,
                data_registro::date
              ) data_movimentacao,

              COALESCE(

                LEAD(
                  COALESCE(
                    data_movimentacao,
                    data_registro::date
                  )
                )
                OVER(
                  ORDER BY
                    COALESCE(
                      data_movimentacao,
                      data_registro::date
                    ),
                    data_registro
                ),

                CURRENT_DATE

              ) fim

            FROM historico_etapas

            WHERE projeto_id=$1
          )

          SELECT

            area_pendente,

            ROUND(
              SUM(
                fim-data_movimentacao
              )::numeric,
              1
            )::float dias

          FROM mov

          WHERE
            area_pendente IS NOT NULL
            AND
            area_pendente <>
              'Sem pendência'

          GROUP BY
            area_pendente

          ORDER BY dias DESC
          `,
          [req.params.id]
        );


      res.json({

        projeto:
          p.rows[0],

        historico:
          h.rows,

        tempos_etapa:
          tempos.rows,

        tempos_espera:
          esperas.rows
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

  exigirPermissao(
    'criar'
  ),

  async (req, res, next) => {

    const c =
      await pool.connect();


    try {

      await c.query(
        'BEGIN'
      );


      const b =
        req.body;


      if (
        !b.cliente ||
        !b.nome
      ) {

        await c.query(
          'ROLLBACK'
        );

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


      // ========================================================
      // CONCLUSÃO AUTOMÁTICA
      // ========================================================

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

          COALESCE(
            $6::date,
            CURRENT_DATE
          ),

          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,

          CASE

            WHEN
              $13::date IS NULL

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

            WHEN
              $8='Concluído'

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

        b.segmento ||
          null,

        b.nome,

        b.responsavel ||
          'Erika',

        b.data_inicio ||
          null,

        b.previsao_conclusao ||
          null,

        statusFinal,

        etapaFinal,

        areaFinal,

        b.proxima_acao ||
          null,

        b.prazo_proxima_acao ||
          null,

        b.data_aprovacao ||
          null,

        b.observacoes ||
          null,

        b.origem_cliente ||
          null,

        b.comercial_responsavel ||
          null
      ];


      const p =
        await c.query(
          sql,
          valores
        );


      // ========================================================
      // HISTÓRICO INICIAL
      // ========================================================

      await c.query(
        `
        INSERT INTO historico_etapas (

          projeto_id,
          etapa,
          area_pendente,
          situacao,
          pendencia_proximo_passo,
          observacoes,
          usuario_id,
          usuario_nome,
          data_movimentacao

        )

        VALUES (

          $1,
          $2,
          $3,
          'Projeto cadastrado',
          $4,
          'Cadastro inicial',
          $5,
          $6,

          COALESCE(
            $7::date,
            CURRENT_DATE
          )
        )
        `,
        [

          p.rows[0].id,

          p.rows[0].etapa_atual,

          p.rows[0].area_pendente,

          p.rows[0].proxima_acao,

          req.usuario.id,

          req.usuario.nome,

          b.data_inicio ||
            null
        ]
      );


      await registrarAuditoria(
        c,
        req,
        'CRIAR_PROJETO',
        'projeto',
        p.rows[0].id,
        {

          codigo:
            p.rows[0].codigo,

          cliente:
            p.rows[0].cliente,

          nome:
            p.rows[0].nome
        }
      );


      await c.query(
        'COMMIT'
      );


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

  exigirPermissao(
    'editar'
  ),

  async (req, res, next) => {

    const c =
      await pool.connect();


    try {

      await c.query(
        'BEGIN'
      );


      // ========================================================
      // PROJETO ATUAL
      // ========================================================

      const old =
        await c.query(
          `
          SELECT *
          FROM projetos
          WHERE id=$1
          `,
          [req.params.id]
        );


      if (
        !old.rowCount
      ) {

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


      // ========================================================
      // NOVOS VALORES
      // ========================================================

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


      // ========================================================
      // CONCLUSÃO AUTOMÁTICA PELA ETAPA
      // ========================================================

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


      // ========================================================
      // DATA DE CONCLUSÃO
      // ========================================================

      let conclusao =
        o.data_conclusao;


      if (
        v.status ===
          'Concluído' &&

        o.status !==
          'Concluído' &&

        !conclusao
      ) {

        conclusao =
          b.data_movimentacao ||
          new Date();
      }


      if (
        v.status !==
          'Concluído' &&

        o.status ===
          'Concluído'
      ) {

        conclusao =
          null;
      }


      // ========================================================
      // ATUALIZA PROJETO
      // ========================================================

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

                WHEN
                  $12::date IS NULL

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


      // ========================================================
      // IDENTIFICA MOVIMENTAÇÃO
      // ========================================================

      const mudou =

        o.status !==
          v.status ||

        o.etapa_atual !==
          v.etapa ||

        o.area_pendente !==
          v.area ||

        o.proxima_acao !==
          v.acao ||

        String(
          o.prazo_proxima_acao ||
          ''
        ) !==
        String(
          v.prazoAcao ||
          ''
        ) ||

        Boolean(
          String(
            b.movimentacao_observacao ||
            ''
          ).trim()
        );


      const detalhes =
        [];


      // ========================================================
      // HISTÓRICO DA MOVIMENTAÇÃO
      // ========================================================

      if (
        mudou
      ) {


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
            o.prazo_proxima_acao ||
            ''
          ) !==
          String(
            v.prazoAcao ||
            ''
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
            observacoes,
            usuario_id,
            usuario_nome,
            data_movimentacao

          )

          VALUES (

            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,

            COALESCE(
              $9::date,
              CURRENT_DATE
            )
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
              'Atualização do projeto',

            req.usuario.id,

            req.usuario.nome,

            b.data_movimentacao ||
              null
          ]
        );
      }


      // ========================================================
      // AUDITORIA
      // ========================================================

      await registrarAuditoria(
        c,
        req,
        'ATUALIZAR_PROJETO',
        'projeto',
        Number(
          req.params.id
        ),
        {

          codigo:
            o.codigo,

          alteracoes:
            detalhes.length
              ? detalhes
              : [
                  'Dados gerais atualizados'
                ]
        }
      );


      // ========================================================
      // PREPARA DESTINATÁRIOS ANTES DO COMMIT
      // ========================================================

      const desejaNotificar =
        Boolean(
          b.notificar_responsaveis
        );


      let dadosDestinatarios =
        null;


      if (
        desejaNotificar
      ) {

        dadosDestinatarios =
          await resolverDestinatariosNotificacao(
            c,
            q.rows[0],
            b
          );
      }


      // ========================================================
      // SALVA PRIMEIRO
      // ========================================================

      await c.query(
        'COMMIT'
      );


      // ========================================================
      // NOTIFICAÇÃO
      // ========================================================

      let notificacao =
        null;


      if (
        desejaNotificar
      ) {

        try {

          const retornoEnvio =
            await enviarNotificacaoProjeto({

              projeto:
                q.rows[0],

              body:
                b,

              destinatarios:
                dadosDestinatarios.emails,

              usuarioNome:
                req.usuario.nome
            });


          notificacao = {

            enviada:
              true,

            destinatarios:
              dadosDestinatarios.emails,

            aviso:
              dadosDestinatarios
                .nomesNaoEncontrados
                .length

                ? `Sem e-mail cadastrado para: ${
                    dadosDestinatarios
                      .nomesNaoEncontrados
                      .join(', ')
                  }`

                : null,

            id:
              retornoEnvio.id ||
              null
          };


          // ====================================================
          // REGISTRA A NOTIFICAÇÃO NO HISTÓRICO
          // ====================================================

          await pool.query(
            `
            INSERT INTO historico_etapas (

              projeto_id,
              etapa,
              area_pendente,
              situacao,
              pendencia_proximo_passo,
              observacoes,
              usuario_id,
              usuario_nome,
              data_movimentacao

            )

            VALUES (

              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,

              COALESCE(
                $9::date,
                CURRENT_DATE
              )
            )
            `,
            [

              req.params.id,

              q.rows[0]
                .etapa_atual,

              q.rows[0]
                .area_pendente,

              'Notificação enviada',

              q.rows[0]
                .proxima_acao,

              `Motivo: ${
                b.notificacao_motivo ||
                'Atualização do projeto'
              } | Destinatários: ${
                dadosDestinatarios
                  .emails
                  .join(', ')
              }`,

              req.usuario.id,

              req.usuario.nome,

              b.data_movimentacao ||
                null
            ]
          );


          await registrarAuditoria(
            pool,
            req,
            'ENVIAR_NOTIFICACAO',
            'projeto',
            Number(
              req.params.id
            ),
            {

              motivo:
                b.notificacao_motivo ||
                'Atualização do projeto',

              destinatarios:
                dadosDestinatarios
                  .emails
            }
          );


        } catch (
          erroNotificacao
        ) {

          console.error(
            'Erro ao enviar notificação:',
            erroNotificacao
          );


          // O projeto JÁ FOI SALVO.
          // Falha de e-mail não desfaz a movimentação.

          notificacao = {

            enviada:
              false,

            erro:
              erroNotificacao.message,

            destinatarios:
              dadosDestinatarios
                ?.emails ||
              []
          };
        }
      }


      // ========================================================
      // RESPOSTA
      // ========================================================

      res.json({

        ...q.rows[0],

        notificacao
      });


    } catch (erro) {

      // Se o COMMIT ainda não ocorreu,
      // desfaz a transação.

      try {

        await c.query(
          'ROLLBACK'
        );

      } catch {
        // ignora rollback após commit
      }


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
  exigirPermissao(
    'exportar'
  ),
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


      // ========================================================
      // RESUMO
      // ========================================================

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


      // ========================================================
      // PROJETOS
      // ========================================================

      const ws =
        wb.addWorksheet(
          'Projetos'
        );


      ws.columns = [

        {
          header: 'ID',
          key: 'codigo'
        },

        {
          header: 'Cliente',
          key: 'cliente'
        },

        {
          header: 'Segmento',
          key: 'segmento'
        },

        {
          header: 'Projeto',
          key: 'nome'
        },

        {
          header: 'Origem',
          key: 'origem_cliente'
        },

        {
          header: 'Comercial',
          key: 'comercial_responsavel'
        },

        {
          header: 'Responsável',
          key: 'responsavel'
        },

        {
          header: 'Início',
          key: 'data_inicio'
        },

        {
          header: 'Previsão',
          key: 'previsao_conclusao'
        },

        {
          header: 'Status',
          key: 'status'
        },

        {
          header: 'Situação automática',
          key: 'situacao_automatica'
        },

        {
          header: 'Etapa',
          key: 'etapa_atual'
        },

        {
          header: 'Aguardando',
          key: 'area_pendente'
        },

        {
          header: 'Próxima ação',
          key: 'proxima_acao'
        },

        {
          header: 'Prazo ação',
          key: 'prazo_proxima_acao'
        },

        {
          header: 'Aprovação',
          key: 'data_aprovacao'
        },

        {
          header: 'Prazo 90 dias',
          key: 'prazo_90_dias'
        },

        {
          header: 'Conclusão',
          key: 'data_conclusao'
        },

        {
          header: 'Tempo total (dias)',
          key: 'tempo_total_dias'
        },

        {
          header: 'Observações',
          key: 'observacoes'
        }
      ];


      styleHeader(
        ws.getRow(1)
      );


      projetos.forEach(
        projeto => {

          ws.addRow(
            projeto
          );
        }
      );


      autoWidth(ws);


      // ========================================================
      // HISTÓRICO
      // ========================================================

      const wh =
        wb.addWorksheet(
          'Histórico'
        );


      wh.columns = [

        {
          header: 'ID',
          key: 'codigo'
        },

        {
          header: 'Cliente',
          key: 'cliente'
        },

        {
          header: 'Projeto',
          key: 'projeto'
        },

        {
          header: 'Data',
          key: 'data_registro'
        },

        {
          header: 'Etapa',
          key: 'etapa'
        },

        {
          header: 'Aguardando',
          key: 'area_pendente'
        },

        {
          header: 'Situação',
          key: 'situacao'
        },

        {
          header: 'Próximo passo',
          key: 'pendencia_proximo_passo'
        },

        {
          header: 'Observações',
          key: 'observacoes'
        }
      ];


      styleHeader(
        wh.getRow(1)
      );


      hist.forEach(
        item => {

          wh.addRow(
            item
          );
        }
      );


      autoWidth(wh);


      // ========================================================
      // TEMPOS
      // ========================================================

      const wt =
        wb.addWorksheet(
          'Tempos'
        );


      wt.columns = [

        {
          header: 'ID',
          key: 'codigo'
        },

        {
          header: 'Cliente',
          key: 'cliente'
        },

        {
          header: 'Etapa',
          key: 'etapa'
        },

        {
          header: 'Aguardando',
          key: 'area_pendente'
        },

        {
          header: 'Dias',
          key: 'dias'
        }
      ];


      styleHeader(
        wt.getRow(1)
      );


      tempos.forEach(
        item => {

          wt.addRow(
            item
          );
        }
      );


      autoWidth(wt);


      // ========================================================
      // ENVIO DO XLSX
      // ========================================================

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );


      res.setHeader(
        'Content-Disposition',
        'attachment; filename="relatorio-projetos-lenvie.xlsx"'
      );


      await wb.xlsx.write(
        res
      );


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
  exigirPermissao(
    'exportar'
  ),
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


      const linhasProjetos =
        projetos
          .map(
            p => `
              <tr>

                <td>
                  ${escapeHtml(p.codigo)}
                </td>

                <td>
                  ${escapeHtml(p.cliente)}
                </td>

                <td>
                  ${escapeHtml(p.nome)}
                </td>

                <td>
                  ${escapeHtml(p.status)}
                </td>

                <td>
                  ${escapeHtml(p.etapa_atual)}
                </td>

                <td>
                  ${escapeHtml(p.area_pendente)}
                </td>

                <td>
                  ${escapeHtml(
                    p.situacao_automatica
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    p.tempo_total_dias
                  )}
                </td>

              </tr>
            `
          )
          .join('');


      const blocosHistorico =
        projetos
          .map(
            projeto => {

              const movimentos =
                hist.filter(
                  item =>
                    Number(
                      item.projeto_id
                    ) ===
                    Number(
                      projeto.id
                    )
                );


              const linhas =
                movimentos.length

                  ? movimentos
                      .map(
                        h => `
                          <tr>

                            <td>
                              ${escapeHtml(
                                fmtDataHora(
                                  h.data_registro
                                )
                              )}
                            </td>

                            <td>
                              ${escapeHtml(
                                h.etapa
                              )}
                            </td>

                            <td>
                              ${escapeHtml(
                                h.area_pendente
                              )}
                            </td>

                            <td>
                              ${escapeHtml(
                                h.situacao
                              )}
                            </td>

                            <td>
                              ${escapeHtml(
                                h.pendencia_proximo_passo
                              )}
                            </td>

                            <td>
                              ${escapeHtml(
                                h.observacoes
                              )}
                            </td>

                          </tr>
                        `
                      )
                      .join('')

                  : `
                      <tr>
                        <td
                          colspan="6"
                        >
                          Sem histórico.
                        </td>
                      </tr>
                    `;


              return `
                <section
                  class="project-block"
                >

                  <h2>
                    ${escapeHtml(
                      projeto.codigo
                    )}
                    ·
                    ${escapeHtml(
                      projeto.cliente
                    )}
                    —
                    ${escapeHtml(
                      projeto.nome
                    )}
                  </h2>

                  <div
                    class="project-meta"
                  >

                    <span>
                      <strong>Status:</strong>
                      ${escapeHtml(
                        projeto.status
                      )}
                    </span>

                    <span>
                      <strong>Etapa:</strong>
                      ${escapeHtml(
                        projeto.etapa_atual
                      )}
                    </span>

                    <span>
                      <strong>Aguardando:</strong>
                      ${escapeHtml(
                        projeto.area_pendente
                      )}
                    </span>

                  </div>

                  <table>

                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Etapa</th>
                        <th>Aguardando</th>
                        <th>Situação</th>
                        <th>Próximo passo</th>
                        <th>Observações</th>
                      </tr>
                    </thead>

                    <tbody>
                      ${linhas}
                    </tbody>

                  </table>

                </section>
              `;
            }
          )
          .join('');


      const html = `
        <!DOCTYPE html>

        <html lang="pt-BR">

        <head>

          <meta charset="UTF-8">

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          >

          <title>
            Relatório de Projetos - LENVIE
          </title>

          <style>

            * {
              box-sizing:
                border-box;
            }

            body {
              margin:
                0;
              padding:
                28px;
              font-family:
                Arial,
                Helvetica,
                sans-serif;
              color:
                #252525;
              background:
                #ffffff;
            }

            h1 {
              margin:
                0 0 5px;
              color:
                #354133;
              font-size:
                25px;
            }

            h2 {
              color:
                #354133;
              margin-top:
                26px;
              font-size:
                18px;
            }

            .sub {
              margin-bottom:
                22px;
              color:
                #666;
              font-size:
                12px;
            }

            .cards {
              display:
                grid;
              grid-template-columns:
                repeat(6, 1fr);
              gap:
                8px;
              margin:
                18px 0 24px;
            }

            .card {
              border:
                1px solid #d8ddd4;
              border-radius:
                8px;
              padding:
                10px;
              background:
                #f8f9f7;
            }

            .card strong {
              display:
                block;
              font-size:
                20px;
              color:
                #354133;
              margin-top:
                5px;
            }

            table {
              width:
                100%;
              border-collapse:
                collapse;
              margin:
                10px 0 20px;
              font-size:
                11px;
            }

            th {
              background:
                #354133;
              color:
                white;
              text-align:
                left;
              padding:
                7px;
            }

            td {
              border-bottom:
                1px solid #e1e4df;
              padding:
                7px;
              vertical-align:
                top;
            }

            .project-block {
              page-break-inside:
                avoid;
              margin-top:
                25px;
            }

            .project-meta {
              display:
                flex;
              flex-wrap:
                wrap;
              gap:
                14px;
              font-size:
                12px;
              margin-bottom:
                8px;
            }

            .toolbar {
              margin-bottom:
                20px;
            }

            button {
              background:
                #354133;
              color:
                #fff;
              border:
                0;
              padding:
                10px 15px;
              border-radius:
                6px;
              cursor:
                pointer;
            }

            @media print {

              .toolbar {
                display:
                  none;
              }

              body {
                padding:
                  0;
              }

              @page {
                size:
                  landscape;
                margin:
                  10mm;
              }
            }

          </style>

        </head>

        <body>

          <div class="toolbar">

            <button
              onclick="window.print()"
            >
              Imprimir / Salvar em PDF
            </button>

          </div>


          <h1>
            Relatório de Projetos — LENVIE
          </h1>

          <div class="sub">
            Gerado em
            ${escapeHtml(
              new Date()
                .toLocaleString(
                  'pt-BR'
                )
            )}
            ·
            ${total}
            projeto(s) selecionado(s)
          </div>


          <div class="cards">

            <div class="card">
              Selecionados
              <strong>
                ${total}
              </strong>
            </div>

            <div class="card">
              Em andamento
              <strong>
                ${andamento}
              </strong>
            </div>

            <div class="card">
              Pausados
              <strong>
                ${pausados}
              </strong>
            </div>

            <div class="card">
              Concluídos
              <strong>
                ${concluidos}
              </strong>
            </div>

            <div class="card">
              Sem conversão
              <strong>
                ${semConversao}
              </strong>
            </div>

            <div class="card">
              Conversão
              <strong>
                ${conversao}%
              </strong>
            </div>

          </div>


          <h2>
            Resumo dos projetos
          </h2>

          <table>

            <thead>

              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Projeto</th>
                <th>Status</th>
                <th>Etapa</th>
                <th>Aguardando</th>
                <th>Situação</th>
                <th>Dias</th>
              </tr>

            </thead>

            <tbody>
              ${linhasProjetos}
            </tbody>

          </table>


          ${blocosHistorico}


          <script>

            if (
              new URLSearchParams(
                window.location.search
              ).get('print') === '1'
            ) {

              window.addEventListener(
                'load',
                () => {

                  setTimeout(
                    () =>
                      window.print(),
                    250
                  );
                }
              );
            }

          </script>

        </body>

        </html>
      `;


      res.setHeader(
        'Content-Type',
        'text/html; charset=utf-8'
      );


      res.send(
        html
      );


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


// ============================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================

const PORT =
  process.env.PORT ||
  3000;


async function iniciarServidor() {

  try {

    await inicializarBanco();

    app.listen(
      PORT,
      () => {

        console.log(
          `LENVIE Projetos em http://localhost:${PORT}`
        );
      }
    );

  } catch (erro) {

    console.error(
      'Falha ao iniciar o servidor:',
      erro
    );

    process.exit(1);
  }
}


iniciarServidor();