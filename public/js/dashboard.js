const fmt = valor =>
  valor
    ? String(valor).slice(0,10).split('-').reverse().join('/')
    : '—';

function barras(lista, elemento) {
  elemento.innerHTML =
    lista
      .map(item => `
        <div class="bar-row">
          <span>${item.nome || '—'}</span>
          <b>${item.total}</b>
        </div>
      `)
      .join('') ||
    '<span class="muted">Sem dados.</span>';
}

function textoLembrete(dias) {
  const numero = Number(dias);

  if (numero < 0) {
    return `Vencida há ${Math.abs(numero)} dia${Math.abs(numero) === 1 ? '' : 's'}`;
  }

  if (numero === 0) return 'Vence hoje';
  if (numero === 1) return 'Vence amanhã';

  return `Vence em ${numero} dias`;
}

function mesAtualInput() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

function nomeMes(valor) {
  if (!valor || !/^\d{4}-\d{2}$/.test(valor)) return '';
  const [ano, mes] = valor.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(ano, mes - 1, 1));
}

async function carregarDashboard() {
  const seletor = document.getElementById('mesMovimento');
  const periodo = seletor?.value || mesAtualInput();
  const [ano, mes] = periodo.split('-');

  const resposta = await fetch(`/api/indicadores?ano=${ano}&mes=${mes}`);

  if (!resposta.ok) {
    throw new Error('Falha ao carregar indicadores');
  }

  const dados = await resposta.json();

  cadastrados.textContent = dados.cadastrados;
  andamento.textContent = dados.em_andamento;
  pausados.textContent = dados.pausados;
  concluidos.textContent = dados.concluidos;
  semConversao.textContent = dados.sem_conversao;

  atrasados.textContent = dados.atrasados;
  acoesVencidas.textContent = dados.acoes_vencidas;
  semAtualizacao.textContent = dados.sem_atualizacao;
  prazo90Vencido.textContent = dados.prazo90_vencido;

  entradasMes.textContent = dados.entradas_mes;
  concluidosMes.textContent = dados.concluidos_mes;
  cliente.textContent = dados.aguardando_cliente_mes;
  tempoMedio.textContent = dados.tempo_medio_mes_dias;

  const textoPeriodo = document.getElementById('periodoMovimentoTexto');
  if (textoPeriodo) {
    const nome = nomeMes(periodo);
    textoPeriodo.textContent = `Movimentações registradas em ${nome}.`;
  }

  barras(dados.por_etapa, porEtapa);
  barras(dados.por_area, porArea);

  lembretesLista.innerHTML =
    (dados.lembretes || [])
      .map(projeto => `
        <tr>
          <td>${fmt(projeto.prazo_proxima_acao)}</td>
          <td>
            <a href="/projeto.html?id=${projeto.id}">
              ${projeto.codigo} · ${projeto.nome}
            </a>
          </td>
          <td>${projeto.cliente}</td>
          <td>${projeto.proxima_acao || '—'}</td>
          <td><span class="flag">${textoLembrete(projeto.dias_para_acao)}</span></td>
        </tr>
      `)
      .join('') ||
    '<tr><td colspan="5">Nenhuma próxima ação vencida ou prevista para os próximos 7 dias.</td></tr>';

  atencaoLista.innerHTML =
    dados.atencao
      .map(projeto => `
        <tr>
          <td><a href="/projeto.html?id=${projeto.id}">${projeto.codigo}</a></td>
          <td>${projeto.cliente}</td>
          <td>${projeto.nome}</td>
          <td><span class="flag">${projeto.situacao}</span></td>
          <td>${projeto.proxima_acao || '—'}</td>
          <td>${fmt(projeto.prazo_proxima_acao || projeto.previsao_conclusao || projeto.prazo_90_dias)}</td>
        </tr>
      `)
      .join('') ||
    '<tr><td colspan="6">Nenhum projeto exigindo atenção.</td></tr>';
}

document.addEventListener('DOMContentLoaded', () => {
  const seletor = document.getElementById('mesMovimento');

  if (seletor) {
    seletor.value = mesAtualInput();
    seletor.addEventListener('change', () => {
      carregarDashboard().catch(erro => {
        console.error(erro);
        alert('Não foi possível carregar os indicadores do mês selecionado.');
      });
    });
  }

  carregarDashboard().catch(erro => {
    console.error(erro);
    alert('Não foi possível carregar os indicadores.');
  });
});
