const express = require("express");
const axios = require("axios");
const { analisarSentimento } = require("../services/sentiment");

const router = express.Router();

router.get("/buscar", async (req, res) => {
  const query = req.query.q;
  const inicio = new Date(req.query.inicio);
  const fim = new Date(req.query.fim);
  const filtro = req.query.filtro;

  try {
    const response = await axios.get(
      `https://www.reddit.com/search.json?q=${query}&limit=50`
    );

    let posts = response.data.data.children.map(item => {
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

    // 📅 Filtro por data
    posts = posts.filter(post => {
      if (!req.query.inicio || !req.query.fim) return true;
      return post.dataPost >= inicio && post.dataPost <= fim;
    });

    // 🔥 Ordenação
    if (filtro === "comentarios") {
      posts.sort((a, b) => b.comentarios - a.comentarios);
    } else {
      posts.sort((a, b) => b.dataPost - a.dataPost);
    }

    // 📊 MÉTRICAS
    const totalPosts = posts.length;
    const totalComentarios = posts.reduce((acc, p) => acc + p.comentarios, 0);
    const mediaComentarios = totalPosts > 0 ? (totalComentarios / totalPosts).toFixed(2) : 0;

    res.json({
      totalPosts,
      mediaComentarios,
      posts
    });

  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar dados" });
  }
});

module.exports = router;