async function buscar() {
  const termo = document.getElementById("searchInput").value;
  const dataInicio = document.getElementById("dataInicio").value;
  const dataFim = document.getElementById("dataFim").value;
  const filtro = document.getElementById("filtro").value;

  const container = document.getElementById("resultados");

  container.innerHTML = "🔎 Buscando...";

  try {
    const response = await fetch(
      `http://localhost:3000/api/buscar?q=${termo}&inicio=${dataInicio}&fim=${dataFim}&filtro=${filtro}`
    );

    const data = await response.json();

    container.innerHTML = `
      <div class="metrics">
        <p>📊 Total de publicações: <strong>${data.totalPosts}</strong></p>
        <p>💬 Média de comentários: <strong>${data.mediaComentarios}</strong></p>
      </div>
    `;

    data.posts.forEach(item => {
      const card = document.createElement("div");
      card.classList.add("card");

      const dataFormatada = new Date(item.dataPost).toLocaleDateString();

      card.innerHTML = `
        <h3>${item.texto}</h3>
        <p>📅 ${dataFormatada}</p>
        <p>💬 ${item.comentarios} comentários</p>
        <p><strong>${item.sentimento}</strong> (score: ${item.score})</p>
        <a href="${item.link}" target="_blank">🔗 Ver publicação</a>
      `;

      container.appendChild(card);
    });

  } catch (error) {
    container.innerHTML = "Erro ao buscar 😢";
  }
}