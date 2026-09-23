CREATE TABLE IF NOT EXISTS projetos (
 id SERIAL PRIMARY KEY,
 codigo VARCHAR(20) UNIQUE NOT NULL,
 cliente VARCHAR(160) NOT NULL,
 segmento VARCHAR(80),
 nome VARCHAR(200) NOT NULL,
 responsavel VARCHAR(120),
 data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
 previsao_conclusao DATE,
 data_conclusao DATE,
 status VARCHAR(30) NOT NULL DEFAULT 'Em andamento' CHECK (status IN ('Em andamento','Pausado','Concluído','Cancelado')),
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

CREATE TABLE IF NOT EXISTS historico_etapas (
 id SERIAL PRIMARY KEY,
 projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
 data_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 etapa VARCHAR(100),
 area_pendente VARCHAR(80),
 situacao VARCHAR(50),
 pendencia_proximo_passo TEXT,
 observacoes TEXT
);
CREATE INDEX IF NOT EXISTS idx_historico_projeto ON historico_etapas(projeto_id, data_registro DESC);
CREATE INDEX IF NOT EXISTS idx_projetos_status ON projetos(status);
