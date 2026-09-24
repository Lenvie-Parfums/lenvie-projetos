document.addEventListener(
  'DOMContentLoaded',
  async () => {

    const params =
      new URLSearchParams(
        window.location.search
      );

    const projetoId =
      params.get('id');

    const modoEdicao =
      Boolean(projetoId);

    const usuario =
      await window.LENVIE_AUTH.ready;

    const podeCriar =
      Boolean(
        usuario.permissoes?.criar
      );

    const podeEditar =
      Boolean(
        usuario.permissoes?.editar
      );

    const somenteLeitura =
      modoEdicao &&
      !podeEditar;


    if (
      !modoEdicao &&
      !podeCriar
    ) {

      window.location.href =
        '/projetos.html';

      return;
    }


    const form =
      document.getElementById(
        'form'
      );

    const titulo =
      document.getElementById(
        'titulo'
      );

    const resumoProjeto =
      document.getElementById(
        'resumoProjeto'
      );

    const statusSelect =
      document.getElementById(
        'status'
      );

    const etapaSelect =
      document.getElementById(
        'etapa'
      );

    const areaSelect =
      document.getElementById(
        'area'
      );

    const prazo90 =
      document.getElementById(
        'prazo90'
      );

    const btnSalvar =
      document.getElementById(
        'btnSalvar'
      );

    const acoesExportacao =
      document.getElementById(
        'acoesExportacao'
      );

    const btnPdf =
      document.getElementById(
        'btnPdf'
      );

    const btnXlsx =
      document.getElementById(
        'btnXlsx'
      );

    const blocoMovimentacao =
      document.getElementById(
        'blocoMovimentacao'
      );

    const blocoAcompanhamento =
      document.getElementById(
        'blocoAcompanhamento'
      );

    const temposEtapa =
      document.getElementById(
        'temposEtapa'
      );

    const temposEspera =
      document.getElementById(
        'temposEspera'
      );

    const historico =
      document.getElementById(
        'historico'
      );

    const dataMovimentacao =
      document.getElementById(
        'dataMovimentacao'
      );


    function dataInput(valor) {

      if (!valor) {
        return '';
      }

      return String(valor)
        .substring(0, 10);
    }


    function preencherSelect(
      select,
      valores = []
    ) {

      select.innerHTML = '';

      valores.forEach(
        valor => {

          const option =
            document.createElement(
              'option'
            );

          option.value =
            valor;

          option.textContent =
            valor;

          select.appendChild(
            option
          );
        }
      );
    }


    function selecionar(
      select,
      valor,
      fallback = ''
    ) {

      const valorFinal =
        valor ||
        fallback;

      if (!valorFinal) {
        return;
      }

      const existe =
        Array.from(
          select.options
        ).some(
          option =>
            option.value ===
            valorFinal
        );

      if (!existe) {

        const option =
          document.createElement(
            'option'
          );

        option.value =
          valorFinal;

        option.textContent =
          valorFinal;

        select.appendChild(
          option
        );
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
        form.elements.namedItem(
          nome
        );

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
        ).padStart(
          2,
          '0'
        );

      const dia =
        String(
          agora.getDate()
        ).padStart(
          2,
          '0'
        );

      return `${ano}-${mes}-${dia}`;
    }


    function renderizarTempos(
      dados,
      elemento,
      campo
    ) {

      if (
        !Array.isArray(dados) ||
        !dados.length
      ) {

        elemento.innerHTML =
          '<span class="muted">Sem dados ainda.</span>';

        return;
      }

      elemento.innerHTML =
        dados
          .map(
            item => `
              <div class="bar-row">

                <span>
                  ${item[campo] || '—'}
                </span>

                <b>
                  ${item.dias ?? 0} d
                </b>

              </div>
            `
          )
          .join('');
    }


    let config;

    try {

      const resposta =
        await fetch(
          '/api/config'
        );

      if (!resposta.ok) {

        throw new Error(
          `HTTP ${resposta.status}`
        );
      }

      config =
        await resposta.json();

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

    } catch (erro) {

      console.error(erro);

      alert(
        'Não foi possível carregar as configurações.'
      );

      return;
    }


    if (!modoEdicao) {

      titulo.textContent =
        'Novo Projeto';

      resumoProjeto.innerHTML = `
        <span class="muted">
          Cadastre um novo projeto para iniciar o acompanhamento.
        </span>
      `;

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

      btnSalvar.textContent =
        'Cadastrar Projeto';

      acoesExportacao.style.display =
        'none';

      blocoMovimentacao.style.display =
        'none';

      blocoAcompanhamento.style.display =
        'none';
    }


    if (modoEdicao) {

      btnSalvar.textContent =
        'Salvar atualização';

      acoesExportacao.style.display =
        'flex';

      blocoMovimentacao.style.display =
        'block';

      if (dataMovimentacao) {
        dataMovimentacao.value =
          hojeInput();
      }

      blocoAcompanhamento.style.display =
        'block';


      btnXlsx.addEventListener(
        'click',
        () => {

          window.location.href =
            `/api/relatorios/projetos.xlsx?ids=${projetoId}`;
        }
      );


      btnPdf.addEventListener(
        'click',
        () => {

          window.open(
            `/relatorios/projetos.pdf?ids=${projetoId}`,
            '_blank'
          );
        }
      );


      try {

        const resposta =
          await fetch(
            `/api/projetos/${projetoId}`
          );

        if (!resposta.ok) {

          throw new Error(
            `HTTP ${resposta.status}`
          );
        }

        const dados =
          await resposta.json();

        const projeto =
          dados.projeto;


        titulo.textContent =
          `${projeto.codigo} · ${projeto.nome}`;


        let resumo = `
          <span class="flag">
            ${
              projeto.situacao_automatica ||
              'SEM CLASSIFICAÇÃO'
            }
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

          resumo +=
            projeto.dias_para_90 >= 0

              ? `
                <span>
                  •
                  ${projeto.dias_para_90}
                  dias para o prazo de 90 dias
                </span>
              `

              : `
                <span>
                  •
                  ${Math.abs(
                    projeto.dias_para_90
                  )}
                  dias além do prazo de 90 dias
                </span>
              `;
        }


        resumoProjeto.innerHTML =
          resumo;


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


        renderizarTempos(
          dados.tempos_etapa,
          temposEtapa,
          'etapa'
        );

        renderizarTempos(
          dados.tempos_espera,
          temposEspera,
          'area_pendente'
        );


        if (
          Array.isArray(
            dados.historico
          ) &&
          dados.historico.length
        ) {

          historico.innerHTML =
            dados.historico

              .map(
                item => {

                  const data =
                    item.data_movimentacao

                      ? String(
                          item.data_movimentacao
                        )
                          .slice(0, 10)
                          .split('-')
                          .reverse()
                          .join('/')

                      : item.data_registro

                        ? new Date(
                            item.data_registro
                          ).toLocaleString(
                            'pt-BR'
                          )

                        : '—';


                  const dias =
                    Number(
                      item.dias_na_situacao ||
                      0
                    );


                  return `
                    <div class="history">

                      <b>
                        ${data}
                      </b>

                      <span class="muted">
                        • ${dias.toFixed(1)}
                        dias
                      </span>

                      <br>

                      <span class="pill">
                        ${item.situacao || ''}
                      </span>

                      ${item.etapa || ''}

                      <br>

                      <span class="muted">
                        Aguardando:
                        ${
                          item.area_pendente ||
                          '—'
                        }
                      </span>

                      ${
                        item.pendencia_proximo_passo

                          ? `
                            <br>
                            ${item.pendencia_proximo_passo}
                          `

                          : ''
                      }

                      ${
                        item.observacoes

                          ? `
                            <br>
                            <small>
                              ${item.observacoes}
                            </small>
                          `

                          : ''
                      }

                      ${
                        item.usuario_nome

                          ? `
                            <br>
                            <small>
                              Alterado por:
                              ${item.usuario_nome}
                            </small>
                          `

                          : ''
                      }

                    </div>
                  `;
                }
              )

              .join('');

        } else {

          historico.innerHTML =
            '<span class="muted">Sem histórico.</span>';
        }

      } catch (erro) {

        console.error(erro);

        alert(
          `Não foi possível carregar o projeto.\n\n${erro.message}`
        );
      }
    }


    if (somenteLeitura) {

      const aviso =
        document.createElement(
          'div'
        );

      aviso.className =
        'readonly-notice';

      aviso.textContent =
        'Seu perfil possui acesso somente para visualização deste projeto.';

      form.parentNode.insertBefore(
        aviso,
        form
      );

      Array.from(
        form.elements
      ).forEach(
        campo => {
          campo.disabled = true;
        }
      );

      btnSalvar.style.display =
        'none';

      blocoMovimentacao.style.display =
        'none';
    }


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

          const campo =
            form.elements.namedItem(
              'data_aprovacao'
            );

          if (
            campo &&
            !campo.value
          ) {

            campo.value =
              hojeInput();

            campo.dispatchEvent(
              new Event('change')
            );
          }
        }
      }
    );


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

        const [
          ano,
          mes,
          dia
        ] =
          campoAprovacao.value
            .split('-')
            .map(Number);

        const data =
          new Date(
            ano,
            mes - 1,
            dia
          );

        data.setDate(
          data.getDate() + 90
        );

        const prazoAno =
          data.getFullYear();

        const prazoMes =
          String(
            data.getMonth() + 1
          ).padStart(
            2,
            '0'
          );

        const prazoDia =
          String(
            data.getDate()
          ).padStart(
            2,
            '0'
          );

        prazo90.value =
          `${prazoAno}-${prazoMes}-${prazoDia}`;
      }
    );


    form.addEventListener(
      'submit',
      async event => {

        event.preventDefault();

        if (somenteLeitura) {
          return;
        }

        try {

          const dados =
            Object.fromEntries(
              new FormData(
                form
              ).entries()
            );


          dados.status =
            statusSelect.value ||
            'Em andamento';

          dados.etapa_atual =
            etapaSelect.value ||
            'Entrada / Oportunidade';

          dados.area_pendente =
            areaSelect.value ||
            'Sem pendência';


          const url =
            modoEdicao
              ? `/api/projetos/${projetoId}`
              : '/api/projetos';

          const metodo =
            modoEdicao
              ? 'PUT'
              : 'POST';


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
                  JSON.stringify(
                    dados
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


          if (
            !modoEdicao &&
            resultado.id
          ) {

            window.location.href =
              `/projeto.html?id=${resultado.id}`;

            return;
          }


          window.location.reload();

        } catch (erro) {

          console.error(erro);

          alert(
            `Não foi possível salvar o projeto.\n\n${erro.message}`
          );
        }
      }
    );
  }
);