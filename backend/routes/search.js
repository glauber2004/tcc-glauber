const express = require("express");
const axios = require("axios");
const { analisarSentimento } = require("../services/sentiment");

const router = express.Router();

const BASE_URL = "https://arctic-shift.photon-reddit.com";

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Normaliza texto removendo acentos (ex: "Grêmio" bate com "Gremio")
const normalizar = str =>
  str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const SUBREDDITS = [
  "soccer", "football", "brasileirao", "futebol",
  "coxinha", "flamengo", "corinthians", "palmeiras",
  "saopaulo", "libertadores"
];

async function buscarEmSubreddit(subreddit, query, limite = 500) {
  let posts = [];
  let before = null;
  let pagina = 1;

  while (posts.length < limite) {
    try {
      const params = {
        subreddit,
        title: query,
        limit: 100,
        sort: "desc",
      };

      if (before) params.before = String(before);

      const response = await axios.get(`${BASE_URL}/api/posts/search`, {
        params,
        timeout: 20000,
        headers: {
          "User-Agent": "TCC-MonitoramentoApp/1.0",
          "Accept": "application/json",
        }
      });

      const rateLimit = response.headers["x-ratelimit-remaining"];
      if (rateLimit) console.log(`[r/${subreddit}] página ${pagina} | Rate limit restante: ${rateLimit}`);

      const novos = response.data?.data;

      if (!novos || novos.length === 0) {
        console.log(`[r/${subreddit}] sem mais posts na página ${pagina}`);
        break;
      }

      posts = posts.concat(novos);
      console.log(`[r/${subreddit}] página ${pagina}: ${novos.length} posts (total: ${posts.length})`);

      if (novos.length < 100) break;

      const ultimo = novos[novos.length - 1];
      before = ultimo?.created_utc ?? null;
      if (!before) break;

      pagina++;
      await esperar(500);

    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfter = err.response.headers["retry-after"] || 10;
        console.warn(`Rate limit em r/${subreddit}. Aguardando ${retryAfter}s...`);
        await esperar(retryAfter * 1000);
        continue;
      }
      console.warn(`Erro em r/${subreddit} página ${pagina}: ${err.message}`);
      break;
    }
  }

  return posts;
}

router.get("/buscar", async (req, res) => {
  const query = req.query.q;
  const inicio = req.query.inicio ? new Date(req.query.inicio) : null;
  const fim = req.query.fim ? new Date(req.query.fim) : null;
  const filtro = req.query.filtro;
  const palavra2 = req.query.extra?.toLowerCase() || "";

  if (!query) {
    return res.status(400).json({ erro: "Parâmetro 'q' é obrigatório" });
  }

  try {
    console.log(`\n=== Iniciando busca: "${query}" ===`);

    const resultados = await Promise.all(
      SUBREDDITS.map(sub => buscarEmSubreddit(sub, query, 500))
    );

    const todosPosts = resultados.flat();
    const unicos = [...new Map(todosPosts.map(p => [p.id, p])).values()];
    console.log(`\nTotal bruto: ${todosPosts.length} | Únicos: ${unicos.length}`);

    let posts = unicos.map(item => {
      const titulo = item.title || "";
      const descricao = item.selftext || "";
      const textoCompleto = `${titulo} ${descricao}`;

      const dataPost = new Date(item.created_utc * 1000);
      const link = item.permalink
        ? `https://www.reddit.com${item.permalink}`
        : `https://www.reddit.com/r/${item.subreddit}/comments/${item.id}`;

      const analise = analisarSentimento(textoCompleto.toLowerCase());

      return {
        texto: titulo,
        descricao,
        textoCompleto,
        dataPost,
        link,
        comentarios: item.num_comments || 0,
        autor: item.author || "[deletado]",
        upvotes: item.score || 0,
        subreddit: item.subreddit || "",
        sentimento: analise.sentimento,
        score: analise.score,
      };
    });

    // A API já filtrou por título — aqui só filtra pela palavra extra se informada
    if (palavra2) {
      const palavra2Norm = normalizar(palavra2);
      posts = posts.filter(post =>
        normalizar(post.textoCompleto).includes(palavra2Norm)
      );
    }

    // Filtro por data
    if (inicio && fim) {
      posts = posts.filter(post => post.dataPost >= inicio && post.dataPost <= fim);
    }

    // Ordenação
    if (filtro === "comentarios") {
      posts.sort((a, b) => b.comentarios - a.comentarios);
    } else {
      posts.sort((a, b) => b.dataPost - a.dataPost);
    }

    const totalPosts = posts.length;
    const totalComentarios = posts.reduce((acc, p) => acc + p.comentarios, 0);
    const mediaComentarios = totalPosts > 0 ? (totalComentarios / totalPosts).toFixed(2) : 0;

    console.log(`Posts retornados após filtros: ${totalPosts}`);

    res.json({ totalPosts, mediaComentarios, posts });

  } catch (error) {
    console.error("Erro geral:", error.message);
    res.status(500).json({ erro: "Erro ao buscar dados. Tente novamente." });
  }
});

module.exports = router;
