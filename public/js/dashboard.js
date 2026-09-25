const fmt = valor =>
  valor
    ? String(valor).slice(0, 10).split('-').reverse().join('/')
    : '—';


function escaparHtml(valor) {

  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

}


function barras(lista, elemento) {

  const itens =
    Array.isArray(lista)
      ? lista
      : [];

  if (!itens.length) {

    elemento.innerHTML =
      '<span class="muted">Sem dados.</span>';

    return;

  }

  const maior =
    Math.max(
      ...itens.map(
        item => Number(item.total) || 0
      ),
      1
    );


  elemento.innerHTML =
    itens
      .map(item => {

        const total =
          Number(item.total) || 0;

        const percentual =
          total === 0
            ? 0
            : Math.max(
                5,
                Math.round(
                  (total / maior) * 100
                )
              );

        return `

          <div class="bi-bar-item">

            <div class="bi-bar-info">

              <span>
                ${escaparHtml(item.nome || '—')}
              </span>

              <strong>
                ${total}
              </strong>

            </div>

            <div class="bi-bar-track">

              <div
                class="bi-bar-fill"
                style="width:${percentual}%"
              ></div>

            </div>

          </div>

        `;

      })
      .join('');

}


function textoLembrete(dias) {

  const numero =
    Number(dias);

  if (numero < 0) {

    return `Vencida há ${Math.abs(numero)} dia${
      Math.abs(numero) === 1
        ? ''
        : 's'
    }`;

  }

  if (numero === 0)
    return 'Vence hoje';

  if (numero === 1)
    return 'Vence amanhã';

  return `Vence em ${numero} dias`;

}


function classeLembrete(dias) {

  const numero =
    Number(dias);

  if (numero < 0)
    return 'danger';

  if (numero <= 1)
    return 'warning';

  return 'normal';

}


function mesAtualInput() {

  const agora =
    new Date();

  return `${agora.getFullYear()}-${String(
    agora.getMonth() + 1
  ).padStart(2, '0')}`;

}


function nomeMes(valor) {

  if (
    !valor ||
    !/^\d{4}-\d{2}$/.test(valor)
  ) {
    return '';
  }

  const [ano, mes] =
    valor
      .split('-')
      .map(Number);

  return new Intl.DateTimeFormat(
    'pt-BR',
    {
      month: 'long',
      year: 'numeric'
    }
  ).format(
    new Date(
      ano,
      mes - 1,
      1
    )
  );

}


function atualizarComposicao(dados) {

  const andamento =
    Number(dados.em_andamento) || 0;

  const pausados =
    Number(dados.pausados) || 0;

  const concluidos =
    Number(dados.concluidos) || 0;

  const semConversao =
    Number(dados.sem_conversao) || 0;


  const total =
    andamento +
    pausados +
    concluidos +
    semConversao;


  document.getElementById(
    'donutTotal'
  ).textContent =
    total;


  document.getElementById(
    'legendaAndamento'
  ).textContent =
    andamento;


  document.getElementById(
    'legendaPausados'
  ).textContent =
    pausados;


  document.getElementById(
    'legendaConcluidos'
  ).textContent =
    concluidos;


  document.getElementById(
    'legendaSemConversao'
  ).textContent =
    semConversao;


  const grafico =
    document.getElementById(
      'graficoCarteira'
    );


  if (total <= 0) {

    grafico.style.background =
      '#edf1ee';

    return;

  }


  const p1 =
    (andamento / total) * 100;

  const p2 =
    p1 +
    (pausados / total) * 100;

  const p3 =
    p2 +
    (concluidos / total) * 100;


  grafico.style.background =
    `
      conic-gradient(
        #315c48 0% ${p1}%,
        #c89b45 ${p1}% ${p2}%,
        #72967f ${p2}% ${p3}%,
        #aab4ae ${p3}% 100%
      )
    `;

}


function atualizarFluxo(dados) {

  const andamento =
    Number(dados.em_andamento) || 0;

  const pausados =
    Number(dados.pausados) || 0;

  const concluidos =
    Number(dados.concluidos) || 0;

  const semConversao =
    Number(dados.sem_conversao) || 0;


  const encerrados =
    concluidos +
    semConversao;


  const conversao =
    encerrados > 0
      ? Math.round(
          (concluidos / encerrados) * 100
        )
      : 0;


  document.getElementById(
    'taxaConversao'
  ).textContent =
    `${conversao}%`;


  document.getElementById(
    'projetosAbertos'
  ).textContent =
    andamento + pausados;


  document.getElementById(
    'fluxoCliente'
  ).textContent =
    Number(
      dados.aguardando_cliente_mes
    ) || 0;


  document.getElementById(
    'fluxoEntradas'
  ).textContent =
    Number(
      dados.entradas_mes
    ) || 0;


  document.getElementById(
    'fluxoConclusoes'
  ).textContent =
    Number(
      dados.concluidos_mes
    ) || 0;

}


async function carregarDashboard() {

  const seletor =
    document.getElementById(
      'mesMovimento'
    );

  const periodo =
    seletor?.value ||
    mesAtualInput();

  const [ano, mes] =
    periodo.split('-');


  const resposta =
    await fetch(
      `/api/indicadores?ano=${ano}&mes=${mes}`
    );


  if (!resposta.ok) {

    throw new Error(
      'Falha ao carregar indicadores'
    );

  }


  const dados =
    await resposta.json();


  document.getElementById(
    'cadastrados'
  ).textContent =
    dados.cadastrados ?? 0;


  document.getElementById(
    'andamento'
  ).textContent =
    dados.em_andamento ?? 0;


  document.getElementById(
    'pausados'
  ).textContent =
    dados.pausados ?? 0;


  document.getElementById(
    'concluidos'
  ).textContent =
    dados.concluidos ?? 0;


  document.getElementById(
    'semConversao'
  ).textContent =
    dados.sem_conversao ?? 0;


  document.getElementById(
    'atrasados'
  ).textContent =
    dados.atrasados ?? 0;


  document.getElementById(
    'acoesVencidas'
  ).textContent =
    dados.acoes_vencidas ?? 0;


  document.getElementById(
    'semAtualizacao'
  ).textContent =
    dados.sem_atualizacao ?? 0;


  document.getElementById(
    'prazo90Vencido'
  ).textContent =
    dados.prazo90_vencido ?? 0;


  document.getElementById(
    'entradasMes'
  ).textContent =
    dados.entradas_mes ?? 0;


  document.getElementById(
    'concluidosMes'
  ).textContent =
    dados.concluidos_mes ?? 0;


  document.getElementById(
    'cliente'
  ).textContent =
    dados.aguardando_cliente_mes ?? 0;


  document.getElementById(
    'tempoMedio'
  ).textContent =
    dados.tempo_medio_mes_dias ?? 0;


  const textoPeriodo =
    document.getElementById(
      'periodoMovimentoTexto'
    );


  if (textoPeriodo) {

    const nome =
      nomeMes(periodo);

    textoPeriodo.textContent =
      nome.charAt(0).toUpperCase() +
      nome.slice(1);

  }


  barras(
    dados.por_etapa,
    document.getElementById(
      'porEtapa'
    )
  );


  barras(
    dados.por_area,
    document.getElementById(
      'porArea'
    )
  );


  atualizarComposicao(dados);
  atualizarFluxo(dados);


  const lembretesLista =
    document.getElementById(
      'lembretesLista'
    );


  lembretesLista.innerHTML =
    (dados.lembretes || [])
      .map(projeto => `

        <tr>

          <td>
            <strong>
              ${fmt(
                projeto.prazo_proxima_acao
              )}
            </strong>
          </td>

          <td>

            <a
              class="bi-project-link"
              href="/projeto.html?id=${projeto.id}"
            >
              ${escaparHtml(
                projeto.codigo
              )}
              ·
              ${escaparHtml(
                projeto.nome
              )}
            </a>

          </td>

          <td>
            ${escaparHtml(
              projeto.cliente
            )}
          </td>

          <td>
            ${escaparHtml(
              projeto.proxima_acao ||
              '—'
            )}
          </td>

          <td>

            <span
              class="bi-status ${classeLembrete(
                projeto.dias_para_acao
              )}"
            >
              ${textoLembrete(
                projeto.dias_para_acao
              )}
            </span>

          </td>

        </tr>

      `)
      .join('') ||

    `
      <tr>

        <td
          colspan="5"
          class="bi-empty"
        >
          Nenhuma próxima ação vencida ou
          prevista para os próximos 7 dias.
        </td>

      </tr>
    `;


  const atencaoLista =
    document.getElementById(
      'atencaoLista'
    );


  atencaoLista.innerHTML =
    (dados.atencao || [])
      .map(projeto => `

        <tr>

          <td>

            <a
              class="bi-code"
              href="/projeto.html?id=${projeto.id}"
            >
              ${escaparHtml(
                projeto.codigo
              )}
            </a>

          </td>

          <td>
            ${escaparHtml(
              projeto.cliente
            )}
          </td>

          <td>
            ${escaparHtml(
              projeto.nome
            )}
          </td>

          <td>

            <span class="bi-status warning">
              ${escaparHtml(
                projeto.situacao
              )}
            </span>

          </td>

          <td>
            ${escaparHtml(
              projeto.proxima_acao ||
              '—'
            )}
          </td>

          <td>

            ${fmt(
              projeto.prazo_proxima_acao ||
              projeto.previsao_conclusao ||
              projeto.prazo_90_dias
            )}

          </td>

        </tr>

      `)
      .join('') ||

    `
      <tr>

        <td
          colspan="6"
          class="bi-empty"
        >
          Nenhum projeto exigindo atenção.
        </td>

      </tr>
    `;

}


document.addEventListener(
  'DOMContentLoaded',
  () => {

    const seletor =
      document.getElementById(
        'mesMovimento'
      );


    if (seletor) {

      seletor.value =
        mesAtualInput();


      seletor.addEventListener(
        'change',
        () => {

          carregarDashboard()
            .catch(erro => {

              console.error(erro);

              alert(
                'Não foi possível carregar os indicadores do mês selecionado.'
              );

            });

        }
      );

    }


    carregarDashboard()
      .catch(erro => {

        console.error(erro);

        alert(
          'Não foi possível carregar os indicadores.'
        );

      });

  }
);