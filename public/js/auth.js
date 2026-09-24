(() => {
  const perfis = {
    administrador: 'Administrador',
    gestor: 'Gestor',
    editor: 'Editor',
    visualizador: 'Visualizador'
  };

  function irParaLogin() {
    const destino =
      encodeURIComponent(
        window.location.pathname +
        window.location.search
      );

    window.location.href =
      `/login.html?next=${destino}`;
  }

  async function carregarUsuario() {
    const resposta =
      await fetch(
        '/api/auth/me',
        {
          credentials: 'same-origin'
        }
      );

    if (resposta.status === 401) {
      irParaLogin();
      throw new Error(
        'Usuário não autenticado.'
      );
    }

    if (!resposta.ok) {
      throw new Error(
        'Não foi possível validar o usuário.'
      );
    }

    return resposta.json();
  }

  function montarCabecalho(usuario) {
    const header =
      document.querySelector('header');

    const nav =
      header?.querySelector('nav');

    if (!header || !nav) {
      return;
    }

    if (
      usuario.permissoes
        ?.gerenciar_usuarios &&
      !nav.querySelector(
        '[data-admin-link]'
      )
    ) {
      const link =
        document.createElement('a');

      link.href =
        '/usuarios.html';

      link.textContent =
        'Usuários';

      link.dataset.adminLink =
        'true';

      link.className =
        'auth-admin-link';

      nav.appendChild(link);
    }

    if (
      !usuario.permissoes?.criar
    ) {
      document
        .querySelectorAll(
          '[data-permission="criar"]'
        )
        .forEach(
          elemento => {
            elemento.style.display =
              'none';
          }
        );
    }

    if (
      header.querySelector(
        '.header-auth'
      )
    ) {
      return;
    }

    const area =
      document.createElement('div');

    area.className =
      'header-auth';

    area.innerHTML = `
      <div class="header-auth-info">
        <span class="header-auth-name"></span>
        <span class="header-auth-profile"></span>
      </div>

      <button
        type="button"
        class="btn-logout"
      >
        Sair
      </button>
    `;

    area.querySelector(
      '.header-auth-name'
    ).textContent =
      usuario.nome;

    area.querySelector(
      '.header-auth-profile'
    ).textContent =
      perfis[usuario.perfil] ||
      usuario.perfil;

    area.querySelector(
      '.btn-logout'
    ).addEventListener(
      'click',
      async () => {
        try {
          await fetch(
            '/api/auth/logout',
            {
              method: 'POST',
              credentials: 'same-origin'
            }
          );
        } finally {
          window.location.href =
            '/login.html';
        }
      }
    );

    header.appendChild(area);
  }

  const ready =
    carregarUsuario()
      .then(usuario => {
        montarCabecalho(usuario);
        return usuario;
      })
      .catch(erro => {
        console.error(erro);
        throw erro;
      });

  window.LENVIE_AUTH = {
    ready,
    irParaLogin
  };
})();
