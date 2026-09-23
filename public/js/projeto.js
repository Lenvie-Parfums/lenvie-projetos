const id = new URLSearchParams(location.search).get('id');

const fill = (el, itens) => {
  el.innerHTML = itens
    .map(item => `<option value="${item}">${item}</option>`)
    .join('');
};

const dataInput = valor => {
  if (!valor) return '';
  return String(valor).slice(0, 10);
};

const bars = (dados, elemento, chave) => {
  elemento.innerHTML =
    dados.map(item => `
      <div class="bar-row">
        <span>${item[chave] || '—'}</span>
        <b>${item.dias} d</b>
      </div>
    `).join('') ||
    '<span class="muted">Sem dados ainda.</span>';
};

async function carregarProjeto() {
  try {
    const [configResponse, projetoResponse] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/projetos/' + id)
    ]);

    if (!configResponse.ok || !projetoResponse.ok) {
      throw new Error('Erro ao carregar projeto.');
    }

    const config = await configResponse.json();
    const dados = await projetoResponse.json();

    const p = dados.projeto;

    // ---------------------------------------------------------
    // MONTA OS SELECTS
    // ---------------------------------------------------------

    fill(status, config.status || []);
    fill(etapa, config.etapas || []);
    fill(area, config.areas || []);

    // ---------------------------------------------------------
    // CABEÇALHO
    // ---------------------------------------------------------

    titulo.textContent = `${p.codigo} · ${p.nome}`;

    const diasAberto = p.dias_em_aberto ?? 0;

    let prazo90Texto = '';

    if (p.dias_para_90 !== null && p.dias_para_90 !== undefined) {
      prazo90Texto =
        p.dias_para_90 >= 0
          ? ` <span>• ${p.dias_para_90} dias para o prazo de 90 dias</span>`
          : ` <span>• ${Math.abs(p.dias_para_90)} dias além do prazo de 90 dias</span>`;
    }

    resumoProjeto.innerHTML = `
      <span class="flag">${p.situacao_automatica || 'SEM CLASSIFICAÇÃO'}</span>
      <span>${diasAberto} dias desde o início</span>
      ${prazo90Texto}
    `;

    // ---------------------------------------------------------
    // CAMPOS DE TEXTO / DATAS
    // ---------------------------------------------------------

    const camposData = [
      'data_inicio',
      'previsao_conclusao',
      'prazo_proxima_acao',
      'data_aprovacao',
      'data_conclusao'
    ];

    for (const [campo, valor] of Object.entries(p)) {
      const elemento = form.elements[campo];

      if (!elemento) continue;

      // Selects serão definidos explicitamente abaixo.
      if (
        campo === 'status' ||
        campo === 'etapa_atual' ||
        campo === 'area_pendente'
      ) {
        continue;
      }

      if (camposData.includes(campo)) {
        elemento.value = dataInput(valor);
      } else {
        elemento.value = valor ?? '';
      }
    }

    // ---------------------------------------------------------
    // SELECTS
    // ---------------------------------------------------------

    status.value = p.status || 'Em andamento';
    etapa.value = p.etapa_atual || config.etapas?.[0] || '';
    area.value = p.area_pendente || 'Sem pendência';

    // Segurança caso algum valor antigo não exista mais na configuração.
    if (!status.value && p.status) {
      status.add(new Option(p.status, p.status));
      status.value = p.status;
    }

    if (!etapa.value && p.etapa_atual) {
      etapa.add(new Option(p.etapa_atual, p.etapa_atual));
      etapa.value = p.etapa_atual;
    }

    if (!area.value && p.area_pendente) {
      area.add(new Option(p.area_pendente, p.area_pendente));
      area.value = p.area_pendente;
    }

    // ---------------------------------------------------------
    // PRAZO 90 DIAS
    // ---------------------------------------------------------

    prazo90.value = dataInput(p.prazo_90_dias);

    // ---------------------------------------------------------
    // TEMPOS
    // ---------------------------------------------------------

    bars(
      dados.tempos_etapa || [],
      temposEtapa,
      'etapa'
    );

    bars(
      dados.tempos_espera || [],
      temposEspera,
      'area_pendente'
    );

    // ---------------------------------------------------------
    // HISTÓRICO
    // ---------------------------------------------------------

    historico.innerHTML =
      (dados.historico || []).map(h => {

        const dataRegistro = h.data_registro
          ? new Date(h.data_registro).toLocaleString('pt-BR')
          : '—';

        const dias = Number(h.dias_na_situacao || 0);

        return `
          <div class="history">

            <b>${dataRegistro}</b>

            <span class="muted">
              • ${dias.toFixed(1)} dias
            </span>

            <br>

            <span class="pill">
              ${h.situacao || ''}
            </span>

            ${h.etapa || ''}

            <br>

            <span class="muted">
              Aguardando: ${h.area_pendente || '—'}
            </span>

            ${
              h.pendencia_proximo_passo
                ? `<br>${h.pendencia_proximo_passo}`
                : ''
            }

            ${
              h.observacoes
                ? `<br><small>${h.observacoes}</small>`
                : ''
            }

          </div>
        `;
      }).join('') || 'Sem histórico.';

  } catch (erro) {
    console.error(erro);
    alert('Não foi possível carregar o projeto.');
  }
}

// ---------------------------------------------------------
// SALVAR ATUALIZAÇÃO
// ---------------------------------------------------------

form.onsubmit = async event => {
  event.preventDefault();

  try {
    const data = Object.fromEntries(
      new FormData(form)
    );

    // Segurança adicional.
    // Um projeto nunca deve ser enviado sem status.
    if (!data.status) {
      data.status = 'Em andamento';
    }

    if (!data.etapa_atual) {
      data.etapa_atual = 'Entrada / Oportunidade';
    }

    if (!data.area_pendente) {
      data.area_pendente = 'Sem pendência';
    }

    const response = await fetch(
      '/api/projetos/' + id,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      }
    );

    const resultado = await response.json();

    if (!response.ok) {
      alert(
        resultado.detalhe ||
        resultado.erro ||
        'Erro ao atualizar projeto.'
      );

      return;
    }

    location.reload();

  } catch (erro) {
    console.error(erro);
    alert('Erro ao salvar atualização.');
  }
};

carregarProjeto();