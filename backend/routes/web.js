const express = require("express");
const axios   = require("axios");
const { analisarSentimento } = require("../services/sentiment");

const router = express.Router();

// ─── Filtro local de relevância ───────────────────────────────────────────────
// O Google/Bing RSS às vezes retorna notícias "relacionadas" que não contêm
// de fato os termos buscados. Por isso validamos localmente:
//   - A 1ª palavra da busca é OBRIGATÓRIA (precisa aparecer no texto)
//   - A 2ª palavra (se houver) também precisa aparecer, mas em qualquer lugar
//     do texto — não precisa estar ao lado da primeira nem em ordem específica
function normalizar(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos para comparação mais tolerante
}

function extrairPalavrasChave(query) {
  // Divide a query em palavras, ignorando aspas e espaços extras
  return query
    .replace(/["']/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function itemContemPalavra(textoNormalizado, palavra) {
  const p = normalizar(palavra);

  // Match exato com word boundary primeiro (mais preciso)
  const regexExata = new RegExp(`\\b${escapeRegex(p)}\\w*`, "i");
  if (regexExata.test(textoNormalizado)) return true;

  // Fallback por radical: remove a última vogal (o/a/e) para cobrir variações
  // de gênero/número, ex: "suspeito" deve casar com "suspeita" e "suspeitos"
  if (p.length > 4 && /[oae]$/.test(p)) {
    const radical = p.slice(0, -1);
    const regexRadical = new RegExp(`\\b${escapeRegex(radical)}\\w*`, "i");
    if (regexRadical.test(textoNormalizado)) return true;
  }

  return false;
}

function filtrarPorRelevancia(itens, query) {
  const palavras = extrairPalavrasChave(query);
  if (palavras.length === 0) return itens;

  const [primeira, segunda] = palavras;

  return itens.filter(item => {
    const textoAlvo = normalizar(`${item.texto} ${item.descricao}`);

    // 1ª palavra é sempre obrigatória
    if (!itemContemPalavra(textoAlvo, primeira)) return false;

    // 2ª palavra (se foi digitada) também precisa estar presente, em qualquer lugar
    if (segunda && !itemContemPalavra(textoAlvo, segunda)) return false;

    return true;
  });
}

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

  // Datas opcionais vindas do frontend (YYYY-MM-DD)
  const inicio = req.query.inicio ? new Date(req.query.inicio + "T00:00:00Z") : null;
  const fim    = req.query.fim    ? new Date(req.query.fim    + "T23:59:59Z") : null;

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
  let unicos = [...new Map(posts.map(p => [p.texto, p])).values()];

  // Filtro de relevância: garante que a 1ª palavra sempre apareça no texto,
  // e a 2ª (se digitada) também precisa aparecer, em qualquer ordem/posição
  unicos = filtrarPorRelevancia(unicos, query);

  // Filtro por data (se datas foram informadas)
  if (inicio && fim) {
    unicos = unicos.filter(p => {
      const d = new Date(p.dataPost);
      return d >= inicio && d <= fim;
    });
  }

  res.json({
    totalPosts:       unicos.length,
    mediaComentarios: 0,
    posts:            unicos
  });
});

module.exports = router;