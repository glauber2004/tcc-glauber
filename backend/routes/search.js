const express = require("express");
const axios = require("axios");
const { analisarSentimento } = require("../services/sentiment");

const router = express.Router();

router.get("/buscar", async (req, res) => {
  const query = req.query.q;

  try {
    const response = await axios.get(
      `https://www.reddit.com/search.json?q=${query}&limit=10`
    );

    const posts = response.data.data.children.map(item => {
      const texto = item.data.title;

      return {
        texto,
        sentimento: analisarSentimento(texto)
      };
    });

    res.json(posts);

  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar dados" });
  }
});

module.exports = router;