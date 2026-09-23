# LENVIE Projetos V1

V1 simples baseada na planilha de acompanhamento: Dashboard, Projetos, Histórico automático e indicadores.

## Rodar localmente
1. Instale Node.js 20+ e PostgreSQL.
2. Copie `.env.example` para `.env` e ajuste `DATABASE_URL`.
3. Rode `npm install`.
4. Rode `npm run db:init`.
5. Rode `npm start`.
6. Abra `http://localhost:3000`.

## Render
1. Crie um PostgreSQL no Render.
2. Envie esta pasta para um repositório GitHub.
3. Crie um Web Service no Render conectado ao repositório.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Adicione a variável `DATABASE_URL` usando a URL interna do PostgreSQL do Render.
7. Antes do primeiro uso, execute o conteúdo de `database/schema.sql` no banco (ou rode `npm run db:init` em um ambiente com acesso ao banco).

## V1
- Dashboard: cadastrados, em andamento, pausados, concluídos, aguardando cliente/produtos e atrasados.
- Cadastro de projeto com ID automático PRJ-xxx.
- Status e etapas padronizados.
- Página de detalhe e edição.
- Histórico automático quando status, etapa, pendência ou próxima ação muda.
- Data de conclusão automática ao marcar Concluído.
- Prazo de 90 dias calculado a partir da data de aprovação.

## Próximas versões sugeridas
- Login/autenticação.
- Importação da planilha atual.
- Relatórios por período e tempo por etapa.
- Alertas por e-mail.
