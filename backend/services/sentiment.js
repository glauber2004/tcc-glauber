const { positivo, negativo } = require("./lexicon");

function analisarSentimento(texto) {
  texto = texto.toLowerCase();

  let score = 0;

  positivo.forEach(palavra => {
    if (texto.includes(palavra)) score++;
  });

  negativo.forEach(palavra => {
    if (texto.includes(palavra)) score--;
  });

  let sentimento = "😐 Neutro";

  if (score > 1) sentimento = "😊 Muito positivo";
  else if (score === 1) sentimento = "🙂 Positivo";
  else if (score === -1) sentimento = "🙁 Negativo";
  else if (score < -1) sentimento = "😡 Muito negativo";

  return { sentimento, score };
}

module.exports = { analisarSentimento };