function analisarSentimento(texto) {
  texto = texto.toLowerCase();

  if (
    texto.includes("bom") ||
    texto.includes("ótimo") ||
    texto.includes("sucesso")
  ) {
    return "😊 Positivo";
  } else if (
    texto.includes("ruim") ||
    texto.includes("crise") ||
    texto.includes("problema")
  ) {
    return "😡 Negativo";
  } else {
    return "😐 Neutro";
  }
}

module.exports = { analisarSentimento };