CREATE TABLE IF NOT EXISTS projetos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(20) UNIQUE NOT NULL,
  cliente VARCHAR(160) NOT NULL,
  segmento VARCHAR(80),
  nome VARCHAR(200) NOT NULL,
  responsavel VARCHAR(120),
  origem_cliente VARCHAR(120),
  comercial_responsavel VARCHAR(120),
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  previsao_conclusao DATE,
  data_conclusao DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'Em andamento'
    CHECK (
      status IN (
        'Em andamento',
        'Pausado',
        'Concluído',
        'Cancelado'
      )
    ),
  etapa_atual VARCHAR(100) NOT NULL DEFAULT 'Entrada / Oportunidade',
  area_pendente VARCHAR(80) NOT NULL DEFAULT 'Sem pendência',
  proxima_acao TEXT,
  prazo_proxima_acao DATE,
  observacoes TEXT,
  data_aprovacao DATE,
  prazo_90_dias DATE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(180) UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  perfil VARCHAR(30) NOT NULL DEFAULT 'visualizador',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_acesso TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS historico_etapas (
  id SERIAL PRIMARY KEY,
  projeto_id INTEGER NOT NULL
    REFERENCES projetos(id)
    ON DELETE CASCADE,
  data_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_movimentacao DATE NOT NULL DEFAULT CURRENT_DATE,
  etapa VARCHAR(100),
  area_pendente VARCHAR(80),
  situacao VARCHAR(50),
  pendencia_proximo_passo TEXT,
  observacoes TEXT,
  usuario_id INTEGER
    REFERENCES usuarios(id)
    ON DELETE SET NULL,
  usuario_nome VARCHAR(120)
);

CREATE INDEX IF NOT EXISTS idx_historico_projeto
  ON historico_etapas(
    projeto_id,
    data_movimentacao DESC,
    data_registro DESC
  );

CREATE INDEX IF NOT EXISTS idx_projetos_status
  ON projetos(status);

CREATE INDEX IF NOT EXISTS idx_projetos_prazo_acao
  ON projetos(prazo_proxima_acao);

CREATE INDEX IF NOT EXISTS idx_projetos_atualizado
  ON projetos(atualizado_em DESC);

CREATE INDEX IF NOT EXISTS idx_projetos_area
  ON projetos(area_pendente);

CREATE INDEX IF NOT EXISTS idx_projetos_aprovacao
  ON projetos(data_aprovacao);

CREATE TABLE IF NOT EXISTS sessoes (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL
    REFERENCES usuarios(id)
    ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessoes_token
  ON sessoes(token_hash);

CREATE INDEX IF NOT EXISTS idx_sessoes_expira
  ON sessoes(expira_em);

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER
    REFERENCES usuarios(id)
    ON DELETE SET NULL,
  usuario_nome VARCHAR(120),
  acao VARCHAR(80) NOT NULL,
  entidade VARCHAR(80),
  entidade_id INTEGER,
  detalhes JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);