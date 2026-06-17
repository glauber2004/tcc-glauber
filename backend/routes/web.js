const express = require("express");
const axios   = require("axios");
const { analisarSentimento } = require("../services/sentiment");
const { buscarTodosBR }      = require("./scraperBR"); // ← novo módulo

const router = express.Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function stripHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 800);
}

function parsearRSS(xmlString, nomeFonte) {
  const itens = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xmlString)) !== null) {
    const bloco = match[1];

    const titulo  = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/s.exec(bloco)  || /<title>(.*?)<\/title>/s.exec(bloco)  || [])[1] || "";
    const link    = (/<link>(.*?)<\/link>/s.exec(bloco)                    || [])[1]?.trim() || "";
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/s.exec(bloco)              || [])[1] || "";
    const desc    = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/s.exec(bloco) || /<description>(.*?)<\/description>/s.exec(bloco) || [])[1] || "";
    const source  = (/<source[^>]*>(.*?)<\/source>/s.exec(bloco)          || [])[1] || nomeFonte;

    const tituloLimpo = stripHtml(titulo);
    if (!tituloLimpo) continue;

    const textoCompleto = `${tituloLimpo} ${stripHtml(desc)}`.toLowerCase();
    const analise = analisarSentimento(textoCompleto);
    const chave   = link || tituloLimpo.toLowerCase().replace(/\s+/g, "-").slice(0, 80);

    itens.push({
      _chave:      chave,
      fonte:       "web",
      texto:       tituloLimpo.slice(0, 200),
      descricao:   stripHtml(desc).slice(0, 500),
      textoCompleto,
      dataPost:    pubDate ? new Date(pubDate) : new Date(),
      link:        link || "#",
      comentarios: 0,
      autor:       stripHtml(source) || nomeFonte,
      upvotes:     0,
      subreddit:   "",
      sentimento:  analise.sentimento,
      score:       analise.score,
    });
  }
  return itens;
}

async function buscarRSS(url, nome) {
  const resp = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MonitoramentoApp/1.0)" },
    timeout: 12000,
    decompress: true,
  });
  return parsearRSS(resp.data, nome);
}

// Google RSS — 3 páginas em paralelo
async function buscarGoogleRSS(query) {
  const base = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const resultados = await Promise.all(
    [0, 10, 20].map(start =>
      buscarRSS(`${base}&start=${start}`, "Google Notícias")
        .catch(e => { console.warn(`[Google RSS p${start}]:`, e.message); return []; })
    )
  );
  return resultados.flat();
}

// Bing RSS — 3 páginas em paralelo
async function buscarBingRSS(query) {
  const resultados = await Promise.all(
    [1, 11, 21].map(first =>
      buscarRSS(
        `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&first=${first}`,
        "Bing Notícias"
      ).catch(e => { console.warn(`[Bing RSS p${first}]:`, e.message); return []; })
    )
  );
  return resultados.flat();
}

// ─── route ──────────────────────────────────────────────────────────────────

router.get("/web", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ totalPosts: 0, posts: [] });

  const inicio = req.query.inicio ? new Date(req.query.inicio + "T00:00:00Z") : null;
  const fim    = req.query.fim    ? new Date(req.query.fim    + "T23:59:59Z") : null;

  // ── Dispara tudo em paralelo ──────────────────────────────────────────────
  // Grupo 1: Agregadores RSS (Google + Bing)
  // Grupo 2: Scraping direto dos 10 maiores portais BR
  const [googleItens, bingItens, scraperItens] = await Promise.all([
    buscarGoogleRSS(query),
    buscarBingRSS(query),
    buscarTodosBR(query),   // ← os 10 portais rodando em paralelo internamente
  ]);

  const todos = [...googleItens, ...bingItens, ...scraperItens];

  // ── Deduplicação por URL ──────────────────────────────────────────────────
  const visto = new Map();
  for (const item of todos) {
    if (!visto.has(item._chave)) visto.set(item._chave, item);
  }
  let unicos = [...visto.values()];
  unicos.forEach(p => delete p._chave);

  // ── Filtro por data ───────────────────────────────────────────────────────
  if (inicio && fim) {
    unicos = unicos.filter(p => {
      const d = new Date(p.dataPost);
      return d >= inicio && d <= fim;
    });
  }

  // ── Ordena por data decrescente ───────────────────────────────────────────
  unicos.sort((a, b) => new Date(b.dataPost) - new Date(a.dataPost));

  res.json({
    totalPosts:       unicos.length,
    mediaComentarios: 0,
    posts:            unicos,
  });
});

module.exports = router;