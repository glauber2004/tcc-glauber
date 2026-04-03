async function buscar() {
  const termo = document.getElementById("searchInput").value;
  const container = document.getElementById("resultados");

  container.innerHTML = "🔎 Buscando...";

  try {
    const response = await fetch(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${termo}&format=json&origin=*`);
    const data = await response.json();

    container.innerHTML = "";

    data.query.search.forEach(item => {
      const sentimento = analisarSentimento(item.snippet);

      const card = document.createElement("div");
      card.classList.add("card");

      card.innerHTML = `
        <h3>${item.title}</h3>
        <p>${item.snippet}</p>
        <p><strong>Sentimento:</strong> ${sentimento}</p>
      `;

      container.appendChild(card);
    });

  } catch (error) {
    container.innerHTML = "Erro ao buscar dados 😢";
  }
}

// Simulação simples de PLN
function analisarSentimento(texto) {
  texto = texto.toLowerCase();

  if (texto.includes("bom") || texto.includes("sucesso")) {
    return "😊 Positivo";
  } else if (texto.includes("crise") || texto.includes("problema")) {
    return "😡 Negativo";
  } else {
    return "😐 Neutro";
  }
}