document.addEventListener('DOMContentLoaded', async () => {

  const projetoId =
    new URLSearchParams(window.location.search).get('id');

  const form =
    document.getElementById('form');

  const titulo =
    document.getElementById('titulo');

  const resumo =
    document.getElementById('resumoProjeto');

  const statusSelect =
    document.getElementById('status');

  const etapaSelect =
    document.getElementById('etapa');

  const areaSelect =
    document.getElementById('area');

  const prazo90 =
    document.getElementById('prazo90');

  const temposEtapa =
    document.getElementById('temposEtapa');

  const temposEspera =
    document.getElementById('temposEspera');

  const historico =
    document.getElementById('historico');


  // ============================================================
  // FUNÇÕES AUXILIARES
  // ============================================================

  function dataInput(valor) {

    if (!valor) return '';

    return String(valor).substring(0, 10);
  }


  function preencherSelect(select, valores) {

    select.innerHTML = '';

    (valores || []).forEach(valor => {

      const option =
        document.createElement('option');

      option.value = valor;
      option.textContent = valor;

      select.appendChild(option);
    });
  }


  function definirSelect(
    select,
    valor,
    fallback
  ) {

    const valorFinal =
      valor || fallback || '';

    if (!valorFinal) return;


    let existe =
      Array.from(select.options)
        .some(
          option =>
            option.value === valorFinal
        );


    if (!existe) {

      const option =
        document.createElement('option');

      option.value = valorFinal;
      option.textContent = valorFinal;

      select.appendChild(option);
    }


    select.value = valorFinal;
  }


  function preencherCampo(
    nome,
    valor,
    data = false
  ) {

    const campo =
      form.elements.namedItem(nome);

    if (!campo) return;


    campo.value =
      data
        ? dataInput(valor)
        : (valor ?? '');
  }


  // ============================================================
  // CARREGAR PROJETO
  // ============================================================

  async function carregar() {

    if (!projetoId) {

      alert('Projeto não informado.');

      return;
    }


    try {

      // CONFIGURAÇÕES

      const respostaConfig =
        await fetch('/api/config');


      if (!respostaConfig.ok) {

        throw new Error(
          'Falha ao carregar /api/config'
        );
      }


      const config =
        await respostaConfig.json();


      // PROJETO

      const respostaProjeto =
        await fetch(
          `/api/projetos/${projetoId}`
        );


      if (!respostaProjeto.ok) {

        throw new Error(
          `Falha ao carregar projeto: HTTP ${respostaProjeto.status}`
        );
      }


      const dados =
        await respostaProjeto.json();


      const projeto =
        dados.projeto;


      if (!projeto) {

        throw new Error(
          'API não retornou o projeto.'
        );
      }


      // ========================================================
      // SELECTS
      // ========================================================

      preencherSelect(
        statusSelect,
        config.status
      );

      preencherSelect(
        etapaSelect,
        config.etapas
      );

      preencherSelect(
        areaSelect,
        config.areas
      );


      definirSelect(
        statusSelect,
        projeto.status,
        'Em andamento'
      );


      definirSelect(
        etapaSelect,
        projeto.etapa_atual,
        'Entrada / Oportunidade'
      );


      definirSelect(
        areaSelect,
        projeto.area_pendente,
        'Sem pendência'
      );


      // ========================================================
      // CABEÇALHO
      // ========================================================

      titulo.textContent =
        `${projeto.codigo} · ${projeto.nome}`;


      let textoResumo = '';


      textoResumo += `
        <span class="flag">
          ${projeto.situacao_automatica || 'SEM CLASSIFICAÇÃO'}
        </span>
      `;


      textoResumo += `
        <span>
          ${projeto.dias_em_aberto ?? 0}
          dias desde o início
        </span>
      `;


      if (
        projeto.dias_para_90 !== null &&
        projeto.dias_para_90 !== undefined
      ) {

        if (projeto.dias_para_90 >= 0) {

          textoResumo += `
            <span>
              • ${projeto.dias_para_90}
              dias para o prazo de 90 dias
            </span>
          `;

        } else {

          textoResumo += `
            <span>
              • ${Math.abs(projeto.dias_para_90)}
              dias além do prazo de 90 dias
            </span>
          `;
        }
      }


      resumo.innerHTML =
        textoResumo;


      // ========================================================
      // CAMPOS
      // ========================================================

      preencherCampo(
        'cliente',
        projeto.cliente
      );

      preencherCampo(
        'segmento',
        projeto.segmento
      );

      preencherCampo(
        'nome',
        projeto.nome
      );

      preencherCampo(
        'origem_cliente',
        projeto.origem_cliente
      );

      preencherCampo(
        'comercial_responsavel',
        projeto.comercial_responsavel
      );

      preencherCampo(
        'responsavel',
        projeto.responsavel
      );

      preencherCampo(
        'previsao_conclusao',
        projeto.previsao_conclusao,
        true
      );

      preencherCampo(
        'prazo_proxima_acao',
        projeto.prazo_proxima_acao,
        true
      );

      preencherCampo(
        'data_aprovacao',
        projeto.data_aprovacao,
        true
      );

      preencherCampo(
        'proxima_acao',
        projeto.proxima_acao
      );

      preencherCampo(
        'observacoes',
        projeto.observacoes
      );


      prazo90.value =
        dataInput(
          projeto.prazo_90_dias
        );


      // ========================================================
      // TEMPO POR ETAPA
      // ========================================================

      if (
        Array.isArray(dados.tempos_etapa) &&
        dados.tempos_etapa.length
      ) {

        temposEtapa.innerHTML =
          dados.tempos_etapa
            .map(item => `

              <div class="bar-row">

                <span>
                  ${item.etapa || '—'}
                </span>

                <b>
                  ${item.dias ?? 0} d
                </b>

              </div>

            `)
            .join('');

      } else {

        temposEtapa.innerHTML =
          '<span class="muted">Sem dados ainda.</span>';
      }


      // ========================================================
      // TEMPO AGUARDANDO
      // ========================================================

      if (
        Array.isArray(dados.tempos_espera) &&
        dados.tempos_espera.length
      ) {

        temposEspera.innerHTML =
          dados.tempos_espera
            .map(item => `

              <div class="bar-row">

                <span>
                  ${item.area_pendente || '—'}
                </span>

                <b>
                  ${item.dias ?? 0} d
                </b>

              </div>

            `)
            .join('');

      } else {

        temposEspera.innerHTML =
          '<span class="muted">Sem dados ainda.</span>';
      }


      // ========================================================
      // HISTÓRICO
      // ========================================================

      if (
        Array.isArray(dados.historico) &&
        dados.historico.length
      ) {

        historico.innerHTML =
          dados.historico
            .map(item => {

              const data =
                item.data_registro
                  ? new Date(
                      item.data_registro
                    ).toLocaleString(
                      'pt-BR'
                    )
                  : '—';


              const dias =
                Number(
                  item.dias_na_situacao || 0
                );


              return `

                <div class="history">

                  <b>
                    ${data}
                  </b>

                  <span class="muted">
                    • ${dias.toFixed(1)} dias
                  </span>

                  <br>

                  <span class="pill">
                    ${item.situacao || ''}
                  </span>

                  ${item.etapa || ''}

                  <br>

                  <span class="muted">
                    Aguardando:
                    ${item.area_pendente || '—'}
                  </span>

                  ${
                    item.pendencia_proximo_passo
                      ? `<br>${item.pendencia_proximo_passo}`
                      : ''
                  }

                  ${
                    item.observacoes
                      ? `<br><small>${item.observacoes}</small>`
                      : ''
                  }

                </div>

              `;
            })
            .join('');

      } else {

        historico.innerHTML =
          '<span class="muted">Sem histórico.</span>';
      }


    } catch (erro) {

      console.error(
        'Erro ao carregar projeto:',
        erro
      );

      alert(
        `Não foi possível carregar o projeto.\n\n${erro.message}`
      );
    }
  }


  // ============================================================
  // SALVAR
  // ============================================================

  form.addEventListener(
    'submit',
    async event => {

      event.preventDefault();


      try {

        const dadosFormulario =
          Object.fromEntries(
            new FormData(form).entries()
          );


        // Campos críticos

        dadosFormulario.status =
          statusSelect.value ||
          'Em andamento';


        dadosFormulario.etapa_atual =
          etapaSelect.value ||
          'Entrada / Oportunidade';


        dadosFormulario.area_pendente =
          areaSelect.value ||
          'Sem pendência';


        const resposta =
          await fetch(
            `/api/projetos/${projetoId}`,
            {
              method: 'PUT',

              headers: {
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify(
                  dadosFormulario
                )
            }
          );


        let resultado = {};


        try {

          resultado =
            await resposta.json();

        } catch {

          resultado = {};
        }


        if (!resposta.ok) {

          throw new Error(
            resultado.detalhe ||
            resultado.erro ||
            `HTTP ${resposta.status}`
          );
        }


        window.location.reload();


      } catch (erro) {

        console.error(
          'Erro ao salvar:',
          erro
        );

        alert(
          `Erro ao salvar atualização.\n\n${erro.message}`
        );
      }
    }
  );


  // ============================================================
  // INICIAR
  // ============================================================

  await carregar();

});