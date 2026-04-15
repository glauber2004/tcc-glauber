async function buscar() {
  const termo = document.getElementById("searchInput").value;
  const extra = document.getElementById("extraInput").value;
  const dataInicio = document.getElementById("dataInicio").value;
  const dataFim = document.getElementById("dataFim").value;
  const filtro = document.getElementById("filtro").value;

  const container = document.getElementById("resultados");
  container.innerHTML = "🔎 Buscando...";

  try {
    const response = await fetch(
      `http://localhost:3000/api/buscar?q=${termo}&extra=${extra}&inicio=${dataInicio}&fim=${dataFim}&filtro=${filtro}`
    );

    const data = await response.json();

    container.innerHTML = `
      <div class="metrics">
        <div><strong>${data.totalPosts}</strong><span>Publicações</span></div>
        <div><strong>${data.mediaComentarios}</strong><span>Média Comentários</span></div>
      </div>
    `;

    data.posts.forEach(item => {
      const card = document.createElement("div");
      card.classList.add("card");

      const dataFormatada = new Date(item.dataPost).toLocaleDateString();

      card.innerHTML = `
        <h3>${item.texto}</h3>
        <p class="descricao">${item.descricao || ""}</p>
        <div class="info">
          <span>📅 ${dataFormatada}</span>
          <span>💬 ${item.comentarios}</span>
          <span>${item.sentimento}</span>
        </div>
        <a href="${item.link}" target="_blank">Abrir publicação →</a>
      `;

      container.appendChild(card);
    });

  } catch (error) {
    container.innerHTML = "Erro ao buscar 😢";
  }
}