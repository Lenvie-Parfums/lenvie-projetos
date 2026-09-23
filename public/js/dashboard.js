const fmt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
function barras(lista,el){el.innerHTML=lista.map(x=>`<div class="bar-row"><span>${x.nome||'—'}</span><b>${x.total}</b></div>`).join('')||'<span class="muted">Sem dados.</span>'}
fetch('/api/indicadores').then(r=>{if(!r.ok)throw new Error('Falha');return r.json()}).then(x=>{
  cadastrados.textContent=x.cadastrados;andamento.textContent=x.em_andamento;pausados.textContent=x.pausados;concluidos.textContent=x.concluidos;atrasados.textContent=x.atrasados;acoesVencidas.textContent=x.acoes_vencidas;semAtualizacao.textContent=x.sem_atualizacao;prazo90Vencido.textContent=x.prazo90_vencido;entradasMes.textContent=x.entradas_mes;concluidosMes.textContent=x.concluidos_mes;cliente.textContent=x.aguardando_cliente;tempoMedio.textContent=x.tempo_medio_dias;
  barras(x.por_etapa,porEtapa);barras(x.por_area,porArea);
  atencaoLista.innerHTML=x.atencao.map(p=>`<tr><td><a href="/projeto.html?id=${p.id}">${p.codigo}</a></td><td>${p.cliente}</td><td>${p.nome}</td><td><span class="flag">${p.situacao}</span></td><td>${p.proxima_acao||'—'}</td><td>${fmt(p.prazo_proxima_acao||p.previsao_conclusao||p.prazo_90_dias)}</td></tr>`).join('')||'<tr><td colspan="6">Nenhum projeto exigindo atenção.</td></tr>';
}).catch(()=>alert('Não foi possível carregar os indicadores.'));
