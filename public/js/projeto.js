document.addEventListener('DOMContentLoaded', async () => {

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  const params =
    new URLSearchParams(window.location.search);

  const projetoId =
    params.get('id');

  const modoEdicao =
    Boolean(projetoId);


  // ============================================================
  // ELEMENTOS
  // ============================================================

  const form =
    document.getElementById('form');

  const titulo =
    document.getElementById('titulo');

  const resumoProjeto =
    document.getElementById('resumoProjeto');

  const statusSelect =
    document.getElementById('status');

  const etapaSelect =
    document.getElementById('etapa');

  const areaSelect =
    document.getElementById('area');

  const prazo90 =
    document.getElementById('prazo90');

  const btnSalvar =
    document.getElementById('btnSalvar');

  const btnExportar =
    document.getElementById('btnExportar');

  const blocoMovimentacao =
    document.getElementById('blocoMovimentacao');

  const blocoAcompanhamento =
    document.getElementById('blocoAcompanhamento');

  const temposEtapa =
    document.getElementById('temposEtapa');

  const temposEspera =
    document.getElementById('temposEspera');

  const historico =
    document.getElementById('historico');


  // ============================================================
  // AUXILIARES
  // ============================================================

  function dataInput(valor) {

    if (!valor) {
      return '';
    }

    return String(valor).substring(0, 10);
  }


  function preencherSelect(
    select,
    valores = []
  ) {

    select.innerHTML = '';

    valores.forEach(valor => {

      const option =
        document.createElement('option');

      option.value = valor;
      option.textContent = valor;

      select.appendChild(option);
    });
  }


  function selecionar(
    select,
    valor,
    fallback = ''
  ) {

    const valorFinal =
      valor || fallback;

    if (!valorFinal) {
      return;
    }


    const existe =
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


    select.value =
      valorFinal;
  }


  function preencherCampo(
    nome,
    valor,
    ehData = false
  ) {

    const campo =
      form.elements.namedItem(nome);

    if (!campo) {
      return;
    }


    campo.value =
      ehData
        ? dataInput(valor)
        : (valor ?? '');
  }


  function hojeInput() {

    const agora =
      new Date();

    const ano =
      agora.getFullYear();

    const mes =
      String(
        agora.getMonth() + 1
      ).padStart(2, '0');

    const dia =
      String(
        agora.getDate()
      ).padStart(2, '0');


    return `${ano}-${mes}-${dia}`;
  }


  // ============================================================
  // CARREGAR CONFIG
  // ============================================================

  let config;


  try {

    const resposta =
      await fetch('/api/config');


    if (!resposta.ok) {

      throw new Error(
        `Erro HTTP ${resposta.status}`
      );
    }


    config =
      await resposta.json();


    preencherSelect(
      statusSelect,
      config.status || []
    );


    preencherSelect(
      etapaSelect,
      config.etapas || []
    );


    preencherSelect(
      areaSelect,
      config.areas || []
    );


  } catch (erro) {

    console.error(
      'Erro ao carregar configurações:',
      erro
    );


    alert(
      'Não foi possível carregar as configurações do sistema.'
    );


    return;
  }


  // ============================================================
  // NOVO PROJETO
  // ============================================================

  if (!modoEdicao) {

    titulo.textContent =
      'Novo Projeto';


    resumoProjeto.innerHTML = `
      <span class="muted">
        Cadastre um novo projeto para iniciar o acompanhamento.
      </span>
    `;


    btnSalvar.textContent =
      'Cadastrar Projeto';


    btnExportar.style.display =
      'none';


    blocoMovimentacao.style.display =
      'none';


    blocoAcompanhamento.style.display =
      'none';


    // Valores automáticos

    selecionar(
      statusSelect,
      'Em andamento'
    );


    selecionar(
      etapaSelect,
      'Entrada / Oportunidade'
    );


    selecionar(
      areaSelect,
      'Sem pendência'
    );


    preencherCampo(
      'responsavel',
      'Erika'
    );


    preencherCampo(
      'data_inicio',
      hojeInput()
    );
  }


  // ============================================================
  // EDITAR PROJETO
  // ============================================================

  if (modoEdicao) {

    btnSalvar.textContent =
      'Salvar atualização';


    btnExportar.style.display =
      'inline-flex';


    blocoMovimentacao.style.display =
      'block';


    blocoAcompanhamento.style.display =
      'block';


    try {

      const resposta =
        await fetch(
          `/api/projetos/${projetoId}`
        );


      if (!resposta.ok) {

        throw new Error(
          `Erro HTTP ${resposta.status}`
        );
      }


      const dados =
        await resposta.json();


      const projeto =
        dados.projeto;


      if (!projeto) {

        throw new Error(
          'Projeto não encontrado.'
        );
      }


      // ========================================================
      // CABEÇALHO
      // ========================================================

      titulo.textContent =
        `${projeto.codigo} · ${projeto.nome}`;


      let resumo = `
        <span class="flag">
          ${projeto.situacao_automatica || 'SEM CLASSIFICAÇÃO'}
        </span>

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

          resumo += `
            <span>
              • ${projeto.dias_para_90}
              dias para o prazo de 90 dias
            </span>
          `;

        } else {

          resumo += `
            <span>
              • ${Math.abs(
                projeto.dias_para_90
              )}
              dias além do prazo de 90 dias
            </span>
          `;
        }
      }


      resumoProjeto.innerHTML =
        resumo;


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
        'data_inicio',
        projeto.data_inicio,
        true
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


      // ========================================================
      // SELECTS
      // ========================================================

      selecionar(
        statusSelect,
        projeto.status,
        'Em andamento'
      );


      selecionar(
        etapaSelect,
        projeto.etapa_atual,
        'Entrada / Oportunidade'
      );


      selecionar(
        areaSelect,
        projeto.area_pendente,
        'Sem pendência'
      );


      prazo90.value =
        dataInput(
          projeto.prazo_90_dias
        );


      // ========================================================
      // TEMPO POR ETAPA
      // ========================================================

      if (
        Array.isArray(
          dados.tempos_etapa
        ) &&
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
        Array.isArray(
          dados.tempos_espera
        ) &&
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
        Array.isArray(
          dados.historico
        ) &&
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
  // AUTOMAÇÃO DA CONCLUSÃO
  // ============================================================

  etapaSelect.addEventListener(
    'change',
    () => {

      const etapa =
        etapaSelect.value;


      if (
        etapa ===
          'Concluído / Pedido Fechado' ||
        etapa ===
          'Concluído / Sem Conversão'
      ) {

        selecionar(
          statusSelect,
          'Concluído'
        );


        selecionar(
          areaSelect,
          'Sem pendência'
        );
      }


      if (
        etapa ===
        'Aprovação do Cliente'
      ) {

        const campoAprovacao =
          form.elements.namedItem(
            'data_aprovacao'
          );


        if (
          campoAprovacao &&
          !campoAprovacao.value
        ) {

          campoAprovacao.value =
            hojeInput();
        }
      }
    }
  );


  // ============================================================
  // PREVISÃO VISUAL DOS 90 DIAS
  // ============================================================

  const campoAprovacao =
    form.elements.namedItem(
      'data_aprovacao'
    );


  campoAprovacao.addEventListener(
    'change',
    () => {

      if (!campoAprovacao.value) {

        prazo90.value = '';

        return;
      }


      const partes =
        campoAprovacao.value
          .split('-')
          .map(Number);


      const data =
        new Date(
          partes[0],
          partes[1] - 1,
          partes[2]
        );


      data.setDate(
        data.getDate() + 90
      );


      const ano =
        data.getFullYear();

      const mes =
        String(
          data.getMonth() + 1
        ).padStart(2, '0');

      const dia =
        String(
          data.getDate()
        ).padStart(2, '0');


      prazo90.value =
        `${ano}-${mes}-${dia}`;
    }
  );


  // ============================================================
  // SALVAR
  // ============================================================

  form.addEventListener(
    'submit',
    async event => {

      event.preventDefault();


      try {

        const dados =
          Object.fromEntries(
            new FormData(form).entries()
          );


        // Garantias

        dados.status =
          statusSelect.value ||
          'Em andamento';


        dados.etapa_atual =
          etapaSelect.value ||
          'Entrada / Oportunidade';


        dados.area_pendente =
          areaSelect.value ||
          'Sem pendência';


        let url;
        let metodo;


        if (modoEdicao) {

          url =
            `/api/projetos/${projetoId}`;

          metodo =
            'PUT';

        } else {

          url =
            '/api/projetos';

          metodo =
            'POST';
        }


        const resposta =
          await fetch(
            url,
            {
              method: metodo,

              headers: {
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify(dados)
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


        // NOVO PROJETO:
        // redireciona diretamente para ele

        if (
          !modoEdicao &&
          resultado.id
        ) {

          window.location.href =
            `/projeto.html?id=${resultado.id}`;

          return;
        }


        // EDIÇÃO

        window.location.reload();


      } catch (erro) {

        console.error(
          'Erro ao salvar projeto:',
          erro
        );


        alert(
          `Não foi possível salvar o projeto.\n\n${erro.message}`
        );
      }
    }
  );

});
