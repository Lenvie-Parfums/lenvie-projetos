document.addEventListener(
  'DOMContentLoaded',
  async () => {
    const usuarioAtual =
      await window.LENVIE_AUTH.ready;

    if (
      !usuarioAtual.permissoes
        ?.gerenciar_usuarios
    ) {
      window.location.href = '/';
      return;
    }

    const form =
      document.getElementById(
        'formUsuario'
      );

    const lista =
      document.getElementById(
        'listaUsuarios'
      );

    const mensagem =
      document.getElementById(
        'mensagemUsuario'
      );

    const perfis = [
      'administrador',
      'gestor',
      'editor',
      'visualizador'
    ];

    const dataHora = valor => {
      if (!valor) {
        return '—';
      }

      return new Date(valor)
        .toLocaleString('pt-BR');
    };

    function opcoesPerfil(
      selecionado
    ) {
      return perfis
        .map(
          perfil => `
            <option
              value="${perfil}"
              ${
                perfil === selecionado
                  ? 'selected'
                  : ''
              }
            >
              ${perfil}
            </option>
          `
        )
        .join('');
    }

    async function carregar() {
      const resposta =
        await fetch(
          '/api/usuarios'
        );

      if (!resposta.ok) {
        throw new Error(
          'Não foi possível carregar os usuários.'
        );
      }

      const usuarios =
        await resposta.json();

      lista.innerHTML =
        usuarios
          .map(
            usuario => `
              <tr data-id="${usuario.id}">
                <td>
                  <input
                    class="u-nome"
                    value="${usuario.nome.replaceAll('"', '&quot;')}"
                  >
                </td>

                <td>
                  <input
                    class="u-email"
                    value="${usuario.email.replaceAll('"', '&quot;')}"
                  >
                </td>

                <td>
                  <select class="u-perfil">
                    ${opcoesPerfil(usuario.perfil)}
                  </select>
                </td>

                <td>
                  <label class="user-status">
                    <input
                      type="checkbox"
                      class="u-ativo"
                      ${usuario.ativo ? 'checked' : ''}
                    >
                    Ativo
                  </label>
                </td>

                <td>
                  ${dataHora(usuario.ultimo_acesso)}
                </td>

                <td>
                  <input
                    type="password"
                    class="u-senha"
                    placeholder="Nova senha opcional"
                  >
                </td>

                <td>
                  <button
                    type="button"
                    class="btn salvar-usuario"
                  >
                    Salvar
                  </button>
                </td>
              </tr>
            `
          )
          .join('');

      document
        .querySelectorAll(
          '.salvar-usuario'
        )
        .forEach(
          botao => {
            botao.addEventListener(
              'click',
              async () => {
                const linha =
                  botao.closest('tr');

                const id =
                  linha.dataset.id;

                const dados = {
                  nome:
                    linha.querySelector(
                      '.u-nome'
                    ).value,
                  email:
                    linha.querySelector(
                      '.u-email'
                    ).value,
                  perfil:
                    linha.querySelector(
                      '.u-perfil'
                    ).value,
                  ativo:
                    linha.querySelector(
                      '.u-ativo'
                    ).checked,
                  senha:
                    linha.querySelector(
                      '.u-senha'
                    ).value
                };

                const resposta =
                  await fetch(
                    `/api/usuarios/${id}`,
                    {
                      method: 'PUT',
                      headers: {
                        'Content-Type':
                          'application/json'
                      },
                      body:
                        JSON.stringify(dados)
                    }
                  );

                const resultado =
                  await resposta.json();

                if (!resposta.ok) {
                  alert(
                    resultado.erro ||
                    'Não foi possível salvar.'
                  );
                  return;
                }

                mensagem.textContent =
                  'Usuário atualizado com sucesso.';

                await carregar();
              }
            );
          }
        );
    }

    form.addEventListener(
      'submit',
      async event => {
        event.preventDefault();

        mensagem.textContent = '';

        const dados =
          Object.fromEntries(
            new FormData(form)
          );

        const resposta =
          await fetch(
            '/api/usuarios',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json'
              },
              body:
                JSON.stringify(dados)
            }
          );

        const resultado =
          await resposta.json();

        if (!resposta.ok) {
          alert(
            resultado.erro ||
            'Não foi possível criar o usuário.'
          );
          return;
        }

        form.reset();
        mensagem.textContent =
          'Usuário criado com sucesso.';

        await carregar();
      }
    );

    try {
      await carregar();
    } catch (erro) {
      console.error(erro);
      alert(erro.message);
    }
  }
);
