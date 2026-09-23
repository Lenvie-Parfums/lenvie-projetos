let dados = [];

// ======================================================
// FORMATAÇÃO DE DATA
// ======================================================

function fmt(valor) {
  if (!valor) {
    return '—';
  }

  // PostgreSQL pode retornar:
  // 2026-09-30
  // ou
  // 2026-09-30T00:00:00.000Z

  const dataString = String(valor).slice(0, 10);

  const partes = dataString.split('-');

  if (partes.length !== 3) {
    return '—';
  }

  const [ano, mes, dia] = partes;

  if (!ano || !mes || !dia) {
    return '—';
  }

  return `${dia}/${mes}/${ano}`;
}

// ======================================================
// RENDERIZAÇÃO DA TABELA
// ======================================================

function render() {
  const termo = busca.value.toLowerCase().trim();
  const statusSelecionado = filtro.value;

  const projetosFiltrados = dados.filter(projeto => {

    const correspondeStatus =
      !statusSelecionado ||
      projeto.status === statusSelecionado;

    const textoBusca = `
      ${projeto.cliente || ''}
      ${projeto.nome || ''}
      ${projeto.codigo || ''}
    `.toLowerCase();

    const correspondeBusca =
      textoBusca.includes(termo);

    return correspondeStatus && correspondeBusca;
  });

  if (!projetosFiltrados.length) {
    lista.innerHTML = `
      <tr>
        <td colspan="7">
          Nenhum projeto encontrado.
        </td>
      </tr>
    `;

    return;
  }

  lista.innerHTML = projetosFiltrados
    .map(projeto => {

      return `
        <tr>

          <td>
            <a href="/projeto.html?id=${projeto.id}">
              ${projeto.codigo || '—'}
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
            ${projeto.etapa_atual || '—'}
          </td>

          <td>
            ${projeto.area_pendente || '—'}
          </td>

          <td>
            ${fmt(projeto.previsao_conclusao)}
          </td>

        </tr>
      `;
    })
    .join('');
}

// ======================================================
// CARREGAR PROJETOS
// ======================================================

async function carregarProjetos() {
  try {

    const resposta = await fetch('/api/projetos');

    if (!resposta.ok) {
      throw new Error(
        `Erro HTTP ${resposta.status}`
      );
    }

    dados = await resposta.json();

    render();

  } catch (erro) {

    console.error(
      'Erro ao carregar projetos:',
      erro
    );

    lista.innerHTML = `
      <tr>
        <td colspan="7">
          Não foi possível carregar os projetos.
        </td>
      </tr>
    `;
  }
}

// ======================================================
// EVENTOS
// ======================================================

busca.addEventListener(
  'input',
  render
);

filtro.addEventListener(
  'change',
  render
);

// ======================================================
// INICIALIZAÇÃO
// ======================================================

carregarProjetos();