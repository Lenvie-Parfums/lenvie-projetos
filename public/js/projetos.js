document.addEventListener(
  'DOMContentLoaded',
  () => {

    let dados = [];

    const selecionados =
      new Set();


    const busca =
      document.getElementById(
        'busca'
      );

    const filtro =
      document.getElementById(
        'filtro'
      );

    const lista =
      document.getElementById(
        'lista'
      );

    const selecionarTodos =
      document.getElementById(
        'selecionarTodos'
      );

    const contador =
      document.getElementById(
        'contadorSelecionados'
      );

    const exportarPdf =
      document.getElementById(
        'exportarPdf'
      );

    const exportarXlsx =
      document.getElementById(
        'exportarXlsx'
      );


    function fmt(valor) {

      if (!valor) {
        return '—';
      }

      return String(valor)
        .slice(0,10)
        .split('-')
        .reverse()
        .join('/');
    }


    function filtrados() {

      const texto =
        busca.value
          .toLowerCase()
          .trim();

      const status =
        filtro.value;


      return dados.filter(
        projeto => {

          const bateStatus =
            !status ||
            projeto.status ===
              status;


          const conteudo = `
            ${projeto.cliente || ''}
            ${projeto.nome || ''}
            ${projeto.codigo || ''}
          `
            .toLowerCase();


          return (
            bateStatus &&
            conteudo.includes(
              texto
            )
          );
        }
      );
    }


    function atualizarContador() {

      const quantidade =
        selecionados.size;


      contador.textContent =
        `${quantidade} ${
          quantidade === 1
            ? 'selecionado'
            : 'selecionados'
        }`;
    }


    function atualizarSelecionarTodos() {

      const visiveis =
        filtrados();


      if (!visiveis.length) {

        selecionarTodos.checked =
          false;

        selecionarTodos.indeterminate =
          false;

        return;
      }


      const quantidade =
        visiveis.filter(
          p =>
            selecionados.has(
              p.id
            )
        ).length;


      selecionarTodos.checked =
        quantidade ===
        visiveis.length;


      selecionarTodos.indeterminate =
        quantidade > 0 &&
        quantidade <
          visiveis.length;
    }


    function render() {

      const projetos =
        filtrados();


      if (!projetos.length) {

        lista.innerHTML = `
          <tr>
            <td colspan="9">
              Nenhum projeto encontrado.
            </td>
          </tr>
        `;

        atualizarSelecionarTodos();

        return;
      }


      lista.innerHTML =
        projetos
          .map(
            projeto => `
              <tr>

                <td class="check-column">

                  <input
                    type="checkbox"
                    class="project-check"
                    data-id="${projeto.id}"
                    ${
                      selecionados.has(
                        projeto.id
                      )
                        ? 'checked'
                        : ''
                    }
                  >

                </td>


                <td>

                  <a
                    href="/projeto.html?id=${projeto.id}"
                  >
                    ${projeto.codigo}
                  </a>

                </td>


                <td>
                  ${projeto.cliente || '—'}
                </td>


                <td>
                  ${projeto.nome || '—'}
                </td>


                <td>

                  <span class="pill">
                    ${projeto.status || '—'}
                  </span>

                </td>


                <td>

                  <span class="flag">
                    ${projeto.situacao_automatica || '—'}
                  </span>

                </td>


                <td>
                  ${projeto.etapa_atual || '—'}
                </td>


                <td>
                  ${projeto.area_pendente || '—'}
                </td>


                <td>
                  ${fmt(
                    projeto.previsao_conclusao
                  )}
                </td>

              </tr>
            `
          )
          .join('');


      document
        .querySelectorAll(
          '.project-check'
        )
        .forEach(
          checkbox => {

            checkbox.addEventListener(
              'change',
              () => {

                const id =
                  Number(
                    checkbox.dataset.id
                  );


                if (
                  checkbox.checked
                ) {

                  selecionados.add(
                    id
                  );

                } else {

                  selecionados.delete(
                    id
                  );
                }


                atualizarContador();

                atualizarSelecionarTodos();
              }
            );
          }
        );


      atualizarSelecionarTodos();
    }


    selecionarTodos.addEventListener(
      'change',
      () => {

        filtrados().forEach(
          projeto => {

            if (
              selecionarTodos.checked
            ) {

              selecionados.add(
                projeto.id
              );

            } else {

              selecionados.delete(
                projeto.id
              );
            }
          }
        );


        atualizarContador();

        render();
      }
    );


    function obterIds() {

      return Array.from(
        selecionados
      );
    }


    exportarXlsx.addEventListener(
      'click',
      () => {

        const ids =
          obterIds();


        if (!ids.length) {

          alert(
            'Selecione pelo menos um projeto para exportar.'
          );

          return;
        }


        window.location.href =
          `/api/relatorios/projetos.xlsx?ids=${ids.join(',')}`;
      }
    );


    exportarPdf.addEventListener(
      'click',
      () => {

        const ids =
          obterIds();


        if (!ids.length) {

          alert(
            'Selecione pelo menos um projeto para exportar.'
          );

          return;
        }


        window.open(
          `/relatorios/projetos.pdf?ids=${ids.join(',')}`,
          '_blank'
        );
      }
    );


    busca.addEventListener(
      'input',
      render
    );


    filtro.addEventListener(
      'change',
      render
    );


    fetch('/api/projetos')

      .then(
        resposta => {

          if (!resposta.ok) {

            throw new Error(
              'Erro ao carregar projetos.'
            );
          }

          return resposta.json();
        }
      )

      .then(
        resultado => {

          dados =
            resultado;

          render();

          atualizarContador();
        }
      )

      .catch(
        erro => {

          console.error(
            erro
          );

          lista.innerHTML = `
            <tr>
              <td colspan="9">
                Não foi possível carregar os projetos.
              </td>
            </tr>
          `;
        }
      );
  }
);
