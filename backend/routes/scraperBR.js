/**
 * scraperBR.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scraping da busca interna dos 10 maiores portais de notícias do Brasil
 * (ranking Similarweb / Semrush 2025-2026):
 *
 *  1. Globo / G1        → g1.globo.com
 *  2. UOL Notícias      → noticias.uol.com.br
 *  3. CNN Brasil        → cnnbrasil.com.br
 *  4. Metrópoles        → metropoles.com
 *  5. Folha de S.Paulo  → folha.uol.com.br
 *  6. R7 / Record       → noticias.r7.com
 *  7. Terra             → terra.com.br
 *  8. Estadão           → estadao.com.br
 *  9. Correio Braziliense → correiobraziliense.com.br
 * 10. O Globo (jornal)  → oglobo.globo.com
 *
 * Cada scraper:
 *   - Faz GET na URL de busca do portal
 *   - Usa cheerio para extrair título, link, descrição e data
 *   - Normaliza para o formato padrão do sistema
 *   - Tem seletor CSS documentado para facilitar manutenção
 *
 * Dependências:
 *   npm install axios cheerio
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const axios   = require("axios");
const cheerio = require("cheerio");
const { analisarSentimento } = require("../services/sentiment");

// ─── Configuração global de HTTP ────────────────────────────────────────────

const HTTP = axios.create({
  timeout: 14000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  },
  // Segue redirects automaticamente
  maxRedirects: 5,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Remove tags HTML e normaliza espaços.
 */
function limparTexto(str = "") {
  return str
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Monta o objeto padrão de post já com análise de sentimento.
 */
function montar(titulo, link, descricao, dataStr, nomeFonte) {
  titulo    = limparTexto(titulo).slice(0, 200);
  descricao = limparTexto(descricao).slice(0, 500);

  if (!titulo) return null;

  // Chave de deduplicação: URL > título slug
  const chave = (link || titulo.toLowerCase().replace(/\s+/g, "-").slice(0, 80));

  // Tenta parsear a data; se falhar usa agora
  let dataPost;
  try { dataPost = dataStr ? new Date(dataStr) : new Date(); }
  catch (_) { dataPost = new Date(); }
  if (isNaN(dataPost)) dataPost = new Date();

  const textoCompleto = `${titulo} ${descricao}`.toLowerCase();
  const analise = analisarSentimento(textoCompleto);

  return {
    _chave:      chave,
    fonte:       "web",
    texto:       titulo,
    descricao,
    textoCompleto,
    dataPost,
    link:        link || "#",
    comentarios: 0,
    autor:       nomeFonte,
    upvotes:     0,
    subreddit:   "",
    sentimento:  analise.sentimento,
    score:       analise.score,
  };
}

/**
 * Busca genérica: GET na URL, parseia com cheerio usando a config do portal.
 *
 * @param {string} url          - URL de busca do portal
 * @param {string} nomeFonte    - Nome amigável
 * @param {object} seletores    - { item, titulo, link, descricao, data }
 *   Cada campo pode ser:
 *     - string  → seletor CSS aplicado dentro do item
 *     - função  → recebe ($item, $) e retorna string
 */
async function scrapePortal(url, nomeFonte, seletores) {
  const resp = await HTTP.get(url);
  const $    = cheerio.load(resp.data);
  const posts = [];

  $(seletores.item).each((_, el) => {
    const $el = $(el);

    const obter = (campo) => {
      if (!seletores[campo]) return "";
      if (typeof seletores[campo] === "function") return seletores[campo]($el, $) || "";
      return $el.find(seletores[campo]).first().text() || "";
    };

    const titulo    = obter("titulo");
    const descricao = obter("descricao");
    const dataStr   = obter("data");

    // Link: tenta seletor ou atributo href do item
    let link = "";
    if (seletores.link) {
      if (typeof seletores.link === "function") {
        link = seletores.link($el, $) || "";
      } else {
        link = $el.find(seletores.link).first().attr("href") ||
               $el.find(seletores.link).first().text() || "";
      }
    }
    if (!link) link = $el.find("a").first().attr("href") || "";

    // Garante URL absoluta
    if (link && link.startsWith("/")) {
      const base = new URL(url);
      link = `${base.protocol}//${base.host}${link}`;
    }

    const post = montar(titulo, link, descricao, dataStr, nomeFonte);
    if (post) posts.push(post);
  });

  return posts;
}

// ─── Scrapers por portal ──────────────────────────────────────────────────────

// 1. G1 / Globo ──────────────────────────────────────────────────────────────
// URL de busca: https://g1.globo.com/busca/?q=QUERY
// Estrutura: cada resultado fica em .widget--info__text-container
async function scrapeG1(query) {
  const url = `https://g1.globo.com/busca/?q=${encodeURIComponent(query)}&species=noticia&orderby=recent`;
  return scrapePortal(url, "G1 / Globo", {
    item:      ".widget--info__text-container, .bastian-feed-item",
    titulo:    ".widget--info__title, .feed-post-body-title",
    link:      ($el) => $el.find("a.widget--info__title, a.feed-post-link").first().attr("href"),
    descricao: ".widget--info__description, .feed-post-body-resumo",
    data:      ".widget--info__meta time, .feed-post-metadata-updated",
  });
}

// 2. UOL Notícias ─────────────────────────────────────────────────────────────
// URL de busca: https://busca.uol.com.br/result.htm?q=QUERY&site=noticias.uol.com.br
async function scrapeUOL(query) {
  const url = `https://busca.uol.com.br/result.htm?q=${encodeURIComponent(query)}&site=noticias.uol.com.br`;
  return scrapePortal(url, "UOL Notícias", {
    item:      ".results-list li, .search-results .result",
    titulo:    "h2, h3, .title",
    link:      ($el) => $el.find("a").first().attr("href"),
    descricao: "p, .description",
    data:      "time, .date, .publish-date",
  });
}

// 3. CNN Brasil ───────────────────────────────────────────────────────────────
// URL de busca: https://www.cnnbrasil.com.br/?s=QUERY
async function scrapeCNNBrasil(query) {
  const url = `https://www.cnnbrasil.com.br/?s=${encodeURIComponent(query)}`;
  return scrapePortal(url, "CNN Brasil", {
    item:      ".home__list__tag article, article.post",
    titulo:    "h3.news-item-header__title, h2.entry-title, .post__title",
    link:      ($el) => $el.find("a").first().attr("href"),
    descricao: "p.post__excerpt, .entry-summary",
    data:      "time.post__data, time[datetime]",
  });
}

// 4. Metrópoles ───────────────────────────────────────────────────────────────
// URL de busca: https://www.metropoles.com/?s=QUERY
async function scrapeMetropoles(query) {
  const url = `https://www.metropoles.com/?s=${encodeURIComponent(query)}`;
  return scrapePortal(url, "Metrópoles", {
    item:      "article.post-card, .search-results article",
    titulo:    "h2.post-card__title, h2.entry-title",
    link:      ($el) => $el.find("a").first().attr("href"),
    descricao: "p.post-card__description, .entry-summary p",
    data:      ($el) =>
      $el.find("time").attr("datetime") || $el.find(".post-card__date").text(),
  });
}

// 5. Folha de S.Paulo ─────────────────────────────────────────────────────────
// URL de busca: https://search.folha.uol.com.br/search?q=QUERY&site=todos&period=30
async function scrapeFolha(query) {
  const url =
    `https://search.folha.uol.com.br/search?q=${encodeURIComponent(query)}&site=todos&periodo=30&results_count=25&search_time=1&url=https%3A%2F%2Fsearch.folha.uol.com.br%2Fsearch`;
  return scrapePortal(url, "Folha de S.Paulo", {
    item:      "li.c-headline",
    titulo:    "h2.c-headline__title",
    link:      ($el) => $el.find("a.c-headline__url").first().attr("href"),
    descricao: "p.c-headline__standfirst",
    data:      "time.c-headline__dateline",
  });
}

// 6. R7 / Record ──────────────────────────────────────────────────────────────
// URL de busca: https://noticias.r7.com/busca#q=QUERY
// R7 usa JS para busca; usamos endpoint alternativo via Google RSS filtrado
async function scrapeR7(query) {
  // Fallback: RSS do R7 via Google News filtrado por site:r7.com
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}+site:r7.com&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  // Usa o parser de RSS já existente no sistema via helper inline
  const resp = await HTTP.get(url);
  const itens = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(resp.data)) !== null) {
    const bloco = match[1];
    const titulo  = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(bloco) || /<title>(.*?)<\/title>/.exec(bloco) || [])[1] || "";
    const link    = (/<link>(.*?)<\/link>/.exec(bloco) || [])[1]?.trim() || "";
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(bloco) || [])[1] || "";
    const desc    = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(bloco) || /<description>(.*?)<\/description>/.exec(bloco) || [])[1] || "";
    const post = montar(titulo, link, desc, pubDate, "R7 / Record");
    if (post) itens.push(post);
  }
  return itens;
}

// 7. Terra ────────────────────────────────────────────────────────────────────
// URL de busca: https://busca.terra.com.br/result?q=QUERY
async function scrapeTerra(query) {
  const url = `https://busca.terra.com.br/result?q=${encodeURIComponent(query)}`;
  return scrapePortal(url, "Terra", {
    item:      ".search-list-item, .card-news",
    titulo:    "h2, h3, .card-news__title",
    link:      ($el) => $el.find("a").first().attr("href"),
    descricao: "p.card-news__description, .search-result-description",
    data:      "time, .card-news__date",
  });
}

// 8. Estadão ──────────────────────────────────────────────────────────────────
// URL de busca: https://www.estadao.com.br/busca/?q=QUERY
async function scrapeEstadao(query) {
  const url = `https://www.estadao.com.br/busca/?q=${encodeURIComponent(query)}`;
  return scrapePortal(url, "Estadão", {
    item:      "article.news-item, .search-result-item, li.resultado",
    titulo:    "h3.news-item__title, h2, .resultado-titulo",
    link:      ($el) => $el.find("a").first().attr("href"),
    descricao: "p.news-item__description, .resultado-chamada",
    data:      ($el) =>
      $el.find("time").attr("datetime") || $el.find(".news-item__date").text(),
  });
}

// 9. Correio Braziliense ──────────────────────────────────────────────────────
// URL de busca: https://www.correiobraziliense.com.br/busca/?q=QUERY
async function scrapeCorreio(query) {
  const url = `https://www.correiobraziliense.com.br/busca/?q=${encodeURIComponent(query)}`;
  return scrapePortal(url, "Correio Braziliense", {
    item:      ".list-post article, .search-item",
    titulo:    "h2.list-post__title, h3",
    link:      ($el) => $el.find("a").first().attr("href"),
    descricao: "p.list-post__description, p",
    data:      "time, .list-post__date",
  });
}

// 10. O Globo (jornal) ────────────────────────────────────────────────────────
// URL de busca: https://oglobo.globo.com/busca/?q=QUERY
async function scrapeOGlobo(query) {
  const url = `https://oglobo.globo.com/busca/?q=${encodeURIComponent(query)}&orderby=recent`;
  return scrapePortal(url, "O Globo", {
    item:      ".widget--info__text-container, .bastian-feed-item",
    titulo:    ".widget--info__title, .feed-post-body-title",
    link:      ($el) => $el.find("a").first().attr("href"),
    descricao: ".widget--info__description, .feed-post-body-resumo",
    data:      ($el) =>
      $el.find("time").attr("datetime") || $el.find(".widget--info__meta").text(),
  });
}

// ─── Exportação ──────────────────────────────────────────────────────────────

/**
 * Lista dos 10 scrapers com nome e função.
 * Fácil de iterar em paralelo em web.js.
 */
const SCRAPERS_BR = [
  { nome: "G1 / Globo",            fn: scrapeG1         },
  { nome: "UOL Notícias",          fn: scrapeUOL        },
  { nome: "CNN Brasil",            fn: scrapeCNNBrasil  },
  { nome: "Metrópoles",            fn: scrapeMetropoles },
  { nome: "Folha de S.Paulo",      fn: scrapeFolha      },
  { nome: "R7 / Record",           fn: scrapeR7         },
  { nome: "Terra",                 fn: scrapeTerra      },
  { nome: "Estadão",               fn: scrapeEstadao    },
  { nome: "Correio Braziliense",   fn: scrapeCorreio    },
  { nome: "O Globo",               fn: scrapeOGlobo     },
];

/**
 * Roda todos os scrapers em paralelo e retorna posts deduplicados.
 * Erros individuais são logados mas não quebram os outros.
 *
 * @param {string} query - Termo de busca
 * @returns {Promise<Array>} - Array de posts normalizados
 */
async function buscarTodosBR(query) {
  const resultados = await Promise.allSettled(
    SCRAPERS_BR.map(s =>
      s.fn(query).catch(err => {
        console.warn(`[Scraper ${s.nome}] falhou:`, err.message);
        return [];
      })
    )
  );

  const todos = resultados
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value);

  // Deduplicação por URL (_chave)
  const vistos = new Map();
  for (const p of todos) {
    if (!vistos.has(p._chave)) vistos.set(p._chave, p);
  }

  return [...vistos.values()];
}

module.exports = { buscarTodosBR, SCRAPERS_BR };