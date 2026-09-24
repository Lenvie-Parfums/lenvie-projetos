document.addEventListener(
  'DOMContentLoaded',
  () => {
    const form =
      document.getElementById(
        'loginForm'
      );

    const erro =
      document.getElementById(
        'loginErro'
      );

    const botao =
      document.getElementById(
        'loginButton'
      );

    form.addEventListener(
      'submit',
      async event => {
        event.preventDefault();

        erro.textContent = '';
        botao.disabled = true;
        botao.textContent =
          'Entrando...';

        try {
          const dados =
            Object.fromEntries(
              new FormData(form)
            );

          const resposta =
            await fetch(
              '/api/auth/login',
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json'
                },
                credentials:
                  'same-origin',
                body:
                  JSON.stringify(dados)
              }
            );

          const resultado =
            await resposta.json();

          if (!resposta.ok) {
            throw new Error(
              resultado.erro ||
              'Não foi possível entrar.'
            );
          }

          const params =
            new URLSearchParams(
              window.location.search
            );

          const next =
            params.get('next');

          window.location.href =
            next && next.startsWith('/')
              ? next
              : '/';

        } catch (falha) {
          erro.textContent =
            falha.message;

          botao.disabled = false;
          botao.textContent =
            'Entrar';
        }
      }
    );
  }
);
