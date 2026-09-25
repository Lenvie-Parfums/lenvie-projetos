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

    const email =
      document.getElementById(
        'email'
      );

    const senha =
      document.getElementById(
        'senha'
      );

    const lembrar =
      document.getElementById(
        'lembrarEmail'
      );

    const toggleSenha =
      document.getElementById(
        'toggleSenha'
      );


    // ========================================================
    // LEMBRAR E-MAIL
    // ========================================================

    const emailSalvo =
      localStorage.getItem(
        'lenvie_login_email'
      );


    if (emailSalvo) {

      email.value =
        emailSalvo;

      lembrar.checked =
        true;

    }


    // ========================================================
    // MOSTRAR / OCULTAR SENHA
    // ========================================================

    toggleSenha.addEventListener(
      'click',
      () => {

        const mostrando =
          senha.type === 'text';


        senha.type =
          mostrando
            ? 'password'
            : 'text';


        toggleSenha.setAttribute(
          'aria-label',
          mostrando
            ? 'Mostrar senha'
            : 'Ocultar senha'
        );

      }
    );


    // ========================================================
    // LOGIN
    // ========================================================

    form.addEventListener(
      'submit',
      async event => {

        event.preventDefault();


        erro.textContent =
          '';


        botao.disabled =
          true;


        const textoOriginal =
          botao.innerHTML;


        botao.innerHTML = `
          <span>Entrando...</span>
        `;


        try {

          const dados =
            Object.fromEntries(
              new FormData(form)
            );


          const resposta =
            await fetch(
              '/api/auth/login',
              {

                method:
                  'POST',

                headers: {
                  'Content-Type':
                    'application/json'
                },

                credentials:
                  'same-origin',

                body:
                  JSON.stringify(
                    dados
                  )
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


          // ==================================================
          // SALVA SOMENTE O E-MAIL
          // ==================================================

          if (lembrar.checked) {

            localStorage.setItem(
              'lenvie_login_email',
              email.value.trim()
            );

          } else {

            localStorage.removeItem(
              'lenvie_login_email'
            );

          }


          // ==================================================
          // REDIRECIONAMENTO ORIGINAL
          // ==================================================

          const params =
            new URLSearchParams(
              window.location.search
            );


          const next =
            params.get('next');


          window.location.href =
            next &&
            next.startsWith('/')

              ? next

              : '/';


        } catch (falha) {

          erro.textContent =
            falha.message;


          botao.disabled =
            false;


          botao.innerHTML =
            textoOriginal;

        }

      }
    );

  }
);