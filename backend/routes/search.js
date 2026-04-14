const express = require("express");
const axios = require("axios");
const { analisarSentimento } = require("../services/sentiment");

const router = express.Router();

// Aguarda ms milissegundos entre requisições para evitar bloqueio do Reddit
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Busca todos os posts com paginação para um determinado sort
async function buscarComPaginacao(query, sort, totalDesejado = 300) {
  let posts = [];
  let after = "";

  while (posts.length < totalDesejado) {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=100&sort=${sort}&after=${after}`;
    const response = await axios.get(url, {
      headers: { "User-Agent": "MonitoramentoApp/1.0" }
    });

    const data = response.data.data;
    const novos = data.children;

    if (!novos || novos.length === 0) break;

    posts = posts.concat(novos);
    after = data.after;

    if (!after) break;

    await esperar(1000); // delay de 1s entre páginas
  }

  return posts;
}

router.get("/buscar", async (req, res) => {
  const query = req.query.q;
  const inicio = new Date(req.query.inicio);
  const fim = new Date(req.query.fim);
  const filtro = req.query.filtro;

  try {
    // Busca com 4 ordenações diferentes para maximizar resultados
    const sorts = ["new", "hot", "top", "relevance"];
    let todosPosts = [];

    for (const sort of sorts) {
      const resultado = await buscarComPaginacao(query, sort, 300);
      todosPosts = todosPosts.concat(resultado);
      await esperar(1000); // delay entre cada tipo de sort
    }

    // Remove duplicatas pelo ID do post
    const unicos = [...new Map(todosPosts.map(p => [p.data.id, p])).values()];

    // Transforma os dados e analisa sentimento
    let posts = unicos.map(item => {
      const texto = item.data.title;
      const dataPost = new Date(item.data.created_utc * 1000);
      const link = `https://www.reddit.com${item.data.permalink}`;
      const comentarios = item.data.num_comments;

      const analise = analisarSentimento(texto);

      return {
        texto,
        dataPost,
        link,
        comentarios,
        sentimento: analise.sentimento,
        score: analise.score
      };
    });

    // Filtro por data
    posts = posts.filter(post => {
      if (!req.query.inicio || !req.query.fim) return true;
      return post.dataPost >= inicio && post.dataPost <= fim;
    });

    // Ordenação
    if (filtro === "comentarios") {
      posts.sort((a, b) => b.comentarios - a.comentarios);
    } else {
      posts.sort((a, b) => b.dataPost - a.dataPost);
    }

    // Métricas
    const totalPosts = posts.length;
    const totalComentarios = posts.reduce((acc, p) => acc + p.comentarios, 0);
    const mediaComentarios = totalPosts > 0 ? (totalComentarios / totalPosts).toFixed(2) : 0;

    res.json({
      totalPosts,
      mediaComentarios,
      posts
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar dados" });
  }
});

module.exports = router;