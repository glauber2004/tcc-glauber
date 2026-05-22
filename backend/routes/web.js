const express = require("express");
const axios   = require("axios");
const { analisarSentimento } = require("../services/sentiment");

const router = express.Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function stripHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 600);
}

// Google RSS Search — sem chave, acesso público
async function buscarGoogleRSS(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const resp = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MonitoramentoApp/1.0)" },
    timeout: 10000
  });

  const itens = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(resp.data)) !== null) {
    const bloco = match[1];
    const titulo  = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(bloco) || /<title>(.*?)<\/title>/.exec(bloco) || [])[1] || "";
    const link    = (/<link>(.*?)<\/link>/.exec(bloco) || [])[1] || "";
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(bloco) || [])[1] || "";
    const desc    = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(bloco) || /<description>(.*?)<\/description>/.exec(bloco) || [])[1] || "";
    const source  = (/<source[^>]*>(.*?)<\/source>/.exec(bloco) || [])[1] || "Notícia";

    if (!titulo) continue;

    const textoCompleto = `${titulo} ${stripHtml(desc)}`.toLowerCase();
    const analise = analisarSentimento(textoCompleto);

    itens.push({
      fonte:        "web",
      texto:        titulo.slice(0, 200),
      descricao:    stripHtml(desc).slice(0, 400),
      textoCompleto,
      dataPost:     pubDate ? new Date(pubDate) : new Date(),
      link:         link || "#",
      comentarios:  0,
      autor:        source,
      upvotes:      0,
      subreddit:    "",
      sentimento:   analise.sentimento,
      score:        analise.score
    });
  }

  return itens;
}

// Bing RSS — fallback público
async function buscarBingRSS(query) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
  const resp = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MonitoramentoApp/1.0)" },
    timeout: 10000
  });

  const itens = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(resp.data)) !== null) {
    const bloco = match[1];
    const titulo  = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(bloco) || /<title>(.*?)<\/title>/.exec(bloco) || [])[1] || "";
    const link    = (/<link>(.*?)<\/link>/.exec(bloco) || [])[1] || "";
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(bloco) || [])[1] || "";
    const desc    = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(bloco) || /<description>(.*?)<\/description>/.exec(bloco) || [])[1] || "";

    if (!titulo) continue;

    const textoCompleto = `${titulo} ${stripHtml(desc)}`.toLowerCase();
    const analise = analisarSentimento(textoCompleto);

    itens.push({
      fonte:        "web",
      texto:        titulo.slice(0, 200),
      descricao:    stripHtml(desc).slice(0, 400),
      textoCompleto,
      dataPost:     pubDate ? new Date(pubDate) : new Date(),
      link:         link || "#",
      comentarios:  0,
      autor:        "Bing News",
      upvotes:      0,
      subreddit:    "",
      sentimento:   analise.sentimento,
      score:        analise.score
    });
  }

  return itens;
}

// ─── route ──────────────────────────────────────────────────────────────────

router.get("/web", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ totalPosts: 0, posts: [] });

  let posts = [];

  try { posts = await buscarGoogleRSS(query); } catch(e) {
    console.warn("[Web] Google RSS falhou:", e.message);
  }

  if (posts.length < 5) {
    try {
      const bing = await buscarBingRSS(query);
      posts = [...posts, ...bing];
    } catch(e) {
      console.warn("[Web] Bing RSS falhou:", e.message);
    }
  }

  // Remove duplicatas por título
  const unicos = [...new Map(posts.map(p => [p.texto, p])).values()];

  res.json({
    totalPosts:       unicos.length,
    mediaComentarios: 0,
    posts:            unicos
  });
});

module.exports = router;
