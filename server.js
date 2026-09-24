require('dotenv').config();
const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const etapas =   [
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
const areas = ['Sem pendência','Cliente','Comercial','Produtos','Fornecedor','Compras','PCP / Produção','Outro'];
const statusProjeto = ['Em andamento','Pausado','Concluído','Cancelado'];

const codigo = n => `PRJ-${String(n).padStart(3, '0')}`;
const keep = (v, atual) => (v === undefined || v === null || v === '') ? atual : v;
const nullable = (body, key, atual) => body[key] === undefined ? atual : (body[key] || null);

function situacaoSQL(alias='p') {
  return `CASE
    WHEN ${alias}.status='Concluído' THEN 'CONCLUÍDO'
    WHEN ${alias}.status='Cancelado' THEN 'CANCELADO'
    WHEN ${alias}.status='Pausado' THEN 'PAUSADO'
    WHEN ${alias}.prazo_proxima_acao IS NOT NULL AND ${alias}.prazo_proxima_acao < CURRENT_DATE THEN 'AÇÃO VENCIDA'
    WHEN ${alias}.prazo_90_dias IS NOT NULL AND ${alias}.prazo_90_dias < CURRENT_DATE THEN '90 DIAS VENCIDO'
    WHEN ${alias}.previsao_conclusao IS NOT NULL AND ${alias}.previsao_conclusao < CURRENT_DATE THEN 'ATRASADO'
    WHEN ${alias}.atualizado_em < NOW() - INTERVAL '15 days' THEN 'SEM ATUALIZAÇÃO'
    WHEN ${alias}.prazo_90_dias IS NOT NULL AND ${alias}.prazo_90_dias <= CURRENT_DATE + 15 THEN '90 DIAS EM ATENÇÃO'
    WHEN ${alias}.area_pendente <> 'Sem pendência' THEN 'AGUARDANDO ' || UPPER(${alias}.area_pendente)
    ELSE 'NO PRAZO' END`;
}

app.get('/api/config', (req,res) => res.json({etapas,areas,status:statusProjeto}));

app.get('/api/indicadores', async (req,res,next) => {
  try {
    const resumo = await pool.query(`SELECT
      COUNT(*)::int cadastrados,
      COUNT(*) FILTER(WHERE status='Em andamento')::int em_andamento,
      COUNT(*) FILTER(WHERE status='Pausado')::int pausados,
      COUNT(*) FILTER(WHERE status='Concluído')::int concluidos,
      COUNT(*) FILTER(WHERE area_pendente='Cliente' AND status NOT IN ('Concluído','Cancelado'))::int aguardando_cliente,
      COUNT(*) FILTER(WHERE area_pendente='Produtos' AND status NOT IN ('Concluído','Cancelado'))::int aguardando_produtos,
      COUNT(*) FILTER(WHERE previsao_conclusao<CURRENT_DATE AND status NOT IN ('Concluído','Cancelado'))::int atrasados,
      COUNT(*) FILTER(WHERE prazo_proxima_acao<CURRENT_DATE AND status NOT IN ('Concluído','Cancelado'))::int acoes_vencidas,
      COUNT(*) FILTER(WHERE atualizado_em<NOW()-INTERVAL '15 days' AND status NOT IN ('Concluído','Cancelado'))::int sem_atualizacao,
      COUNT(*) FILTER(WHERE prazo_90_dias<CURRENT_DATE AND status NOT IN ('Concluído','Cancelado'))::int prazo90_vencido,
      COUNT(*) FILTER(WHERE prazo_90_dias BETWEEN CURRENT_DATE AND CURRENT_DATE+15 AND status NOT IN ('Concluído','Cancelado'))::int prazo90_atencao,
      COUNT(*) FILTER(WHERE criado_em>=date_trunc('month',CURRENT_DATE))::int entradas_mes,
      COUNT(*) FILTER(WHERE data_conclusao>=date_trunc('month',CURRENT_DATE))::int concluidos_mes,
      COALESCE(ROUND(AVG((COALESCE(data_conclusao,CURRENT_DATE)-data_inicio)) FILTER(WHERE status<>'Cancelado'),1),0)::float tempo_medio_dias
      FROM projetos`);
    const etapasQ = await pool.query(`SELECT etapa_atual nome, COUNT(*)::int total FROM projetos WHERE status NOT IN ('Concluído','Cancelado') GROUP BY etapa_atual ORDER BY total DESC, nome`);
    const areasQ = await pool.query(`SELECT area_pendente nome, COUNT(*)::int total FROM projetos WHERE status NOT IN ('Concluído','Cancelado') GROUP BY area_pendente ORDER BY total DESC, nome`);
    const atencao = await pool.query(`SELECT id,codigo,cliente,nome,status,etapa_atual,area_pendente,proxima_acao,prazo_proxima_acao,previsao_conclusao,prazo_90_dias,atualizado_em, ${situacaoSQL('p')} situacao FROM projetos p WHERE status NOT IN ('Concluído','Cancelado') ORDER BY CASE WHEN prazo_proxima_acao<CURRENT_DATE THEN 0 WHEN previsao_conclusao<CURRENT_DATE THEN 1 WHEN atualizado_em<NOW()-INTERVAL '15 days' THEN 2 ELSE 3 END, COALESCE(prazo_proxima_acao,previsao_conclusao,prazo_90_dias) NULLS LAST LIMIT 12`);
    res.json({...resumo.rows[0], por_etapa:etapasQ.rows, por_area:areasQ.rows, atencao:atencao.rows});
  } catch(e){next(e)}
});

app.get('/api/projetos', async (req,res,next) => {
  try {
    const q=await pool.query(`SELECT p.*, ${situacaoSQL('p')} situacao_automatica,
      (CURRENT_DATE-p.data_inicio)::int dias_em_aberto,
      GREATEST(0,(CURRENT_DATE-p.atualizado_em::date))::int dias_sem_atualizacao,
      CASE WHEN p.prazo_90_dias IS NULL THEN NULL ELSE (p.prazo_90_dias-CURRENT_DATE)::int END dias_para_90
      FROM projetos p ORDER BY atualizado_em DESC`);
    res.json(q.rows);
  }catch(e){next(e)}
});

app.get('/api/projetos/:id', async (req,res,next) => {
  try {
    const p=await pool.query(`SELECT p.*, ${situacaoSQL('p')} situacao_automatica,
      (CURRENT_DATE-p.data_inicio)::int dias_em_aberto,
      CASE WHEN p.prazo_90_dias IS NULL THEN NULL ELSE (p.prazo_90_dias-CURRENT_DATE)::int END dias_para_90
      FROM projetos p WHERE id=$1`,[req.params.id]);
    if(!p.rowCount)return res.status(404).json({erro:'Projeto não encontrado'});
    const h=await pool.query(`SELECT h.*,
      ROUND(EXTRACT(EPOCH FROM (COALESCE(LEAD(h.data_registro) OVER(ORDER BY h.data_registro),NOW())-h.data_registro))/86400.0,1) dias_na_situacao
      FROM historico_etapas h WHERE projeto_id=$1 ORDER BY data_registro DESC`,[req.params.id]);
    const tempos=await pool.query(`WITH mov AS (
      SELECT etapa,area_pendente,data_registro,COALESCE(LEAD(data_registro) OVER(ORDER BY data_registro),NOW()) fim
      FROM historico_etapas WHERE projeto_id=$1)
      SELECT etapa, ROUND(SUM(EXTRACT(EPOCH FROM(fim-data_registro))/86400.0),1)::float dias
      FROM mov GROUP BY etapa ORDER BY MIN(data_registro)`,[req.params.id]);
    const esperas=await pool.query(`WITH mov AS (
      SELECT area_pendente,data_registro,COALESCE(LEAD(data_registro) OVER(ORDER BY data_registro),NOW()) fim
      FROM historico_etapas WHERE projeto_id=$1)
      SELECT area_pendente, ROUND(SUM(EXTRACT(EPOCH FROM(fim-data_registro))/86400.0),1)::float dias
      FROM mov WHERE area_pendente IS NOT NULL AND area_pendente<>'Sem pendência' GROUP BY area_pendente ORDER BY dias DESC`,[req.params.id]);
    res.json({projeto:p.rows[0],historico:h.rows,tempos_etapa:tempos.rows,tempos_espera:esperas.rows});
  }catch(e){next(e)}
});

app.post('/api/projetos', async(req,res,next)=>{
  const c=await pool.connect();
  try{
    await c.query('BEGIN'); const b=req.body;
    if(!b.cliente||!b.nome){await c.query('ROLLBACK');return res.status(400).json({erro:'Cliente e nome do projeto são obrigatórios.'})}
    const seq=await c.query('SELECT COALESCE(MAX(id),0)+1 n FROM projetos');
    const sql=`INSERT INTO projetos(codigo,cliente,segmento,nome,responsavel,data_inicio,previsao_conclusao,status,etapa_atual,area_pendente,proxima_acao,prazo_proxima_acao,data_aprovacao,prazo_90_dias,observacoes,origem_cliente,comercial_responsavel)
      VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9,$10,$11,$12,$13,CASE WHEN $13::date IS NULL THEN NULL ELSE ($13::date+INTERVAL '90 days')::date END,$14,$15,$16) RETURNING *`;
    const vals=[codigo(seq.rows[0].n),b.cliente,b.segmento||null,b.nome,b.responsavel||'Erika',b.data_inicio||null,b.previsao_conclusao||null,b.status||'Em andamento',b.etapa_atual||etapas[0],b.area_pendente||areas[0],b.proxima_acao||null,b.prazo_proxima_acao||null,b.data_aprovacao||null,b.observacoes||null,b.origem_cliente||null,b.comercial_responsavel||null];
    const p=await c.query(sql,vals);
    await c.query(`INSERT INTO historico_etapas(projeto_id,etapa,area_pendente,situacao,pendencia_proximo_passo,observacoes) VALUES($1,$2,$3,'Projeto cadastrado',$4,'Cadastro inicial')`,[p.rows[0].id,p.rows[0].etapa_atual,p.rows[0].area_pendente,p.rows[0].proxima_acao]);
    await c.query('COMMIT');res.status(201).json(p.rows[0]);
  }catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}
});

app.put('/api/projetos/:id',async(req,res,next)=>{
  const c=await pool.connect();
  try{
    await c.query('BEGIN'); const old=await c.query('SELECT * FROM projetos WHERE id=$1',[req.params.id]);
    if(!old.rowCount){await c.query('ROLLBACK');return res.status(404).json({erro:'Projeto não encontrado'})}
    const o=old.rows[0],b=req.body;
    const v={
      cliente:keep(b.cliente,o.cliente), segmento:nullable(b,'segmento',o.segmento), nome:keep(b.nome,o.nome), responsavel:nullable(b,'responsavel',o.responsavel),
      previsao:nullable(b,'previsao_conclusao',o.previsao_conclusao), status:keep(b.status,o.status), etapa:keep(b.etapa_atual,o.etapa_atual), area:keep(b.area_pendente,o.area_pendente),
      acao:nullable(b,'proxima_acao',o.proxima_acao), prazoAcao:nullable(b,'prazo_proxima_acao',o.prazo_proxima_acao), obs:nullable(b,'observacoes',o.observacoes), aprovacao:nullable(b,'data_aprovacao',o.data_aprovacao),
      origem:nullable(b,'origem_cliente',o.origem_cliente), comercial:nullable(b,'comercial_responsavel',o.comercial_responsavel)
    };
    let conclusao=o.data_conclusao;
    if(v.status==='Concluído'&&o.status!=='Concluído'&&!conclusao)conclusao=new Date();
    if(v.status!=='Concluído'&&o.status==='Concluído')conclusao=null;
    const q=await c.query(`UPDATE projetos SET cliente=$1,segmento=$2,nome=$3,responsavel=$4,previsao_conclusao=$5,status=$6,etapa_atual=$7,area_pendente=$8,proxima_acao=$9,prazo_proxima_acao=$10,observacoes=$11,data_aprovacao=$12,prazo_90_dias=CASE WHEN $12::date IS NULL THEN NULL ELSE ($12::date+INTERVAL '90 days')::date END,data_conclusao=$13,origem_cliente=$14,comercial_responsavel=$15,atualizado_em=NOW() WHERE id=$16 RETURNING *`,[v.cliente,v.segmento,v.nome,v.responsavel,v.previsao,v.status,v.etapa,v.area,v.acao,v.prazoAcao,v.obs,v.aprovacao,conclusao,v.origem,v.comercial,req.params.id]);
    const mudou=o.status!==v.status||o.etapa_atual!==v.etapa||o.area_pendente!==v.area||o.proxima_acao!==v.acao||String(o.prazo_proxima_acao||'')!==String(v.prazoAcao||'');
    if(mudou){const det=[];if(o.status!==v.status)det.push(`Status: ${o.status} → ${v.status}`);if(o.etapa_atual!==v.etapa)det.push(`Etapa: ${o.etapa_atual} → ${v.etapa}`);if(o.area_pendente!==v.area)det.push(`Aguardando: ${o.area_pendente} → ${v.area}`);if(o.proxima_acao!==v.acao)det.push('Próxima ação atualizada');if(String(o.prazo_proxima_acao||'')!==String(v.prazoAcao||''))det.push('Prazo da próxima ação atualizado');
      await c.query(`INSERT INTO historico_etapas(projeto_id,etapa,area_pendente,situacao,pendencia_proximo_passo,observacoes) VALUES($1,$2,$3,$4,$5,$6)`,[req.params.id,v.etapa,v.area,v.status,v.acao,b.movimentacao_observacao||det.join(' | ')||'Atualização do projeto']);}
    await c.query('COMMIT');res.json(q.rows[0]);
  }catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}
});

function styleHeader(row){row.font={bold:true,color:{argb:'FFFFFFFF'}};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E78'}};row.alignment={vertical:'middle'};}
function autoWidth(ws){ws.columns.forEach(col=>{let m=10;col.eachCell({includeEmpty:true},c=>{m=Math.max(m,String(c.value??'').length+2)});col.width=Math.min(m,42)});}

app.get('/api/relatorios/projetos.xlsx',async(req,res,next)=>{
  try{
    const projetos=(await pool.query(`SELECT p.*, ${situacaoSQL('p')} situacao_automatica,(COALESCE(data_conclusao,CURRENT_DATE)-data_inicio)::int tempo_total_dias FROM projetos p ORDER BY criado_em DESC`)).rows;
    const hist=(await pool.query(`SELECT p.codigo,p.cliente,p.nome projeto,h.data_registro,h.etapa,h.area_pendente,h.situacao,h.pendencia_proximo_passo,h.observacoes FROM historico_etapas h JOIN projetos p ON p.id=h.projeto_id ORDER BY h.data_registro DESC`)).rows;
    const tempos=(await pool.query(`WITH mov AS (SELECT p.codigo,p.cliente,h.etapa,h.area_pendente,h.data_registro,COALESCE(LEAD(h.data_registro) OVER(PARTITION BY h.projeto_id ORDER BY h.data_registro),NOW()) fim FROM historico_etapas h JOIN projetos p ON p.id=h.projeto_id) SELECT codigo,cliente,etapa,area_pendente,ROUND(SUM(EXTRACT(EPOCH FROM(fim-data_registro))/86400.0),1)::float dias FROM mov GROUP BY codigo,cliente,etapa,area_pendente ORDER BY codigo,etapa`)).rows;
    const ind=(await pool.query(`SELECT COUNT(*)::int cadastrados,COUNT(*) FILTER(WHERE status='Em andamento')::int em_andamento,COUNT(*) FILTER(WHERE status='Pausado')::int pausados,COUNT(*) FILTER(WHERE status='Concluído')::int concluidos,COUNT(*) FILTER(WHERE previsao_conclusao<CURRENT_DATE AND status NOT IN('Concluído','Cancelado'))::int atrasados,COUNT(*) FILTER(WHERE prazo_proxima_acao<CURRENT_DATE AND status NOT IN('Concluído','Cancelado'))::int acoes_vencidas FROM projetos`)).rows[0];
    const wb=new ExcelJS.Workbook();wb.creator='LENVIE Projetos';wb.created=new Date();
    const resumo=wb.addWorksheet('Resumo Executivo');resumo.addRow(['RELATÓRIO DE PROJETOS - LENVIE']);resumo.mergeCells('A1:D1');resumo.getCell('A1').font={bold:true,size:16};resumo.addRow(['Gerado em',new Date().toLocaleString('pt-BR')]);resumo.addRow([]);resumo.addRow(['Indicador','Valor']);styleHeader(resumo.getRow(4));[['Projetos cadastrados',ind.cadastrados],['Em andamento',ind.em_andamento],['Pausados',ind.pausados],['Concluídos',ind.concluidos],['Atrasados',ind.atrasados],['Próximas ações vencidas',ind.acoes_vencidas]].forEach(r=>resumo.addRow(r));autoWidth(resumo);
    const ws=wb.addWorksheet('Projetos');ws.columns=[['ID','codigo'],['Cliente','cliente'],['Segmento','segmento'],['Projeto','nome'],['Origem','origem_cliente'],['Comercial','comercial_responsavel'],['Responsável','responsavel'],['Início','data_inicio'],['Previsão','previsao_conclusao'],['Status','status'],['Situação automática','situacao_automatica'],['Etapa','etapa_atual'],['Aguardando','area_pendente'],['Próxima ação','proxima_acao'],['Prazo ação','prazo_proxima_acao'],['Aprovação','data_aprovacao'],['Prazo 90 dias','prazo_90_dias'],['Conclusão','data_conclusao'],['Tempo total (dias)','tempo_total_dias'],['Observações','observacoes']].map(([header,key])=>({header,key}));projetos.forEach(p=>ws.addRow(p));styleHeader(ws.getRow(1));ws.autoFilter={from:'A1',to:'T1'};autoWidth(ws);
    const wh=wb.addWorksheet('Histórico');wh.columns=[['ID','codigo'],['Cliente','cliente'],['Projeto','projeto'],['Data/Hora','data_registro'],['Etapa','etapa'],['Aguardando','area_pendente'],['Situação','situacao'],['Próximo passo','pendencia_proximo_passo'],['Observações','observacoes']].map(([header,key])=>({header,key}));hist.forEach(x=>wh.addRow(x));styleHeader(wh.getRow(1));wh.autoFilter={from:'A1',to:'I1'};autoWidth(wh);
    const wt=wb.addWorksheet('Tempos');wt.columns=[['ID','codigo'],['Cliente','cliente'],['Etapa','etapa'],['Aguardando','area_pendente'],['Dias','dias']].map(([header,key])=>({header,key}));tempos.forEach(x=>wt.addRow(x));styleHeader(wt.getRow(1));wt.autoFilter={from:'A1',to:'E1'};autoWidth(wt);
    const nome=`Relatorio_Projetos_LENVIE_${new Date().toISOString().slice(0,10)}.xlsx`;res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${nome}"`);await wb.xlsx.write(res);res.end();
  }catch(e){next(e)}
});

app.use((e,req,res,next)=>{console.error('ERRO:',e);res.status(500).json({erro:'Erro interno',detalhe:process.env.NODE_ENV==='production'?undefined:e.message})});
const PORT=process.env.PORT||3000;app.listen(PORT,()=>console.log(`LENVIE Projetos em http://localhost:${PORT}`));
