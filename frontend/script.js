async function buscar() {
  const termo = document.getElementById("searchInput").value;
  const container = document.getElementById("resultados");

  container.innerHTML = "🔎 Buscando...";

  try {
    const response = await fetch(
      `http://localhost:3000/api/buscar?q=${termo}`
    );

    const data = await response.json();

    container.innerHTML = "";

    data.forEach(item => {
      const card = document.createElement("div");
      card.classList.add("card");

      card.innerHTML = `
        <p>${item.texto}</p>
        <p><strong>${item.sentimento}</strong></p>
      `;

      container.appendChild(card);
    });

  } catch (error) {
    container.innerHTML = "Erro ao buscar 😢";
  }
}