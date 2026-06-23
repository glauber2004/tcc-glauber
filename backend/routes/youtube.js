const express = require("express");
const axios   = require("axios");
const { analisarSentimento } = require("../services/sentiment");

const router = express.Router();

const API_KEY  = process.env.YOUTUBE_API_KEY;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Detecção leve de idioma português ───────────────────────────────────────
// O parâmetro relevanceLanguage da API é só uma "dica" de preferência — não
// garante que o resultado esteja de fato em português. Para garantir, fazemos
// uma checagem extra no texto: palavras funcionais (artigos, preposições,
// pronomes) e/ou caracteres acentuados típicos do PT-BR.
const PALAVRAS_FUNCIONAIS_PT = new Set([
  "o","a","os","as","de","do","da","dos","das","em","no","na","nos","nas",
  "que","com","para","por","um","uma","uns","umas","é","são","não","mais",
  "como","mas","ou","se","já","muito","também","foi","ser","está","essa",
  "esse","isso","ele","ela","você","eu","nós","ao","aos","pelo","pela",
]);

// Caracteres quase exclusivos do português entre os idiomas mais comuns no YouTube
const REGEX_ACENTOS_PT = /[ãõçáàâéêíóôú]/i;

function pareceTextoEmPortugues(texto = "") {
  if (!texto.trim()) return false;

  const textoLower = texto.toLowerCase();

  // Sinal forte: presença de caracteres tipicamente portugueses (ã, õ, ç...)
  if (REGEX_ACENTOS_PT.test(textoLower)) return true;

  // Sinal por contagem de palavras funcionais em PT
  const tokens = textoLower
    .replace(/[^\wáàãâäéèêëíìîïóòõôöúùûüçñ\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return false;

  const acertosPt = tokens.filter(t => PALAVRAS_FUNCIONAIS_PT.has(t)).length;
  const proporcao = acertosPt / tokens.length;

  // Textos curtos (títulos, comentários) costumam ter poucas palavras —
  // por isso o limiar é baixo: basta ~15% de palavras funcionais em PT
  return proporcao >= 0.15;
}

// Busca vídeos por palavra-chave
async function buscarVideos(query, maxVideos = 50) {
  const videos = [];
  let pageToken = "";

  while (videos.length < maxVideos) {
    const params = {
      part:              "snippet",
      q:                 query,
      type:              "video",
      maxResults:        50,
      order:             "relevance",
      relevanceLanguage: "pt", // prioriza/filtra resultados em português
      key:               API_KEY,
    };
    if (pageToken) params.pageToken = pageToken;

    const response = await axios.get(`${BASE_URL}/search`, { params, timeout: 15000 });
    const items    = response.data.items || [];
    if (!items.length) break;

    videos.push(...items);
    pageToken = response.data.nextPageToken || "";
    if (!pageToken || videos.length >= maxVideos) break;
    await esperar(300);
  }

  return videos.slice(0, maxVideos);
}

// Busca estatísticas (views, likes, comentários) de vídeos em lotes de 50 IDs
// (limite da API: até 50 IDs por chamada em videos.list)
async function buscarEstatisticas(videoIds) {
  const estatisticasPorId = {};

  for (let i = 0; i < videoIds.length; i += 50) {
    const lote = videoIds.slice(i, i + 50);
    const params = {
      part: "statistics",
      id:   lote.join(","),
      key:  API_KEY,
    };

    const response = await axios.get(`${BASE_URL}/videos`, { params, timeout: 15000 });
    const items     = response.data.items || [];

    items.forEach(item => {
      estatisticasPorId[item.id] = {
        likeCount:    parseInt(item.statistics?.likeCount    || "0", 10),
        viewCount:    parseInt(item.statistics?.viewCount    || "0", 10),
        commentCount: parseInt(item.statistics?.commentCount || "0", 10),
      };
    });

    await esperar(200);
  }

  return estatisticasPorId;
}

// Busca comentários de um vídeo
async function buscarComentarios(videoId, maxComentarios = 100) {
  const comentarios = [];
  let pageToken     = "";

  while (comentarios.length < maxComentarios) {
    try {
      const params = {
        part:       "snippet",
        videoId,
        maxResults: 50, // limite máximo da API por página (commentThreads.list)
        order:      "relevance",
        key:        API_KEY,
      };
      if (pageToken) params.pageToken = pageToken;

      const response = await axios.get(`${BASE_URL}/commentThreads`, { params, timeout: 15000 });
      const items    = response.data.items || [];
      if (!items.length) break;

      comentarios.push(...items);
      pageToken = response.data.nextPageToken || "";
      if (!pageToken || comentarios.length >= maxComentarios) break;
      await esperar(200);

    } catch (err) {
      // Comentários desativados no vídeo — ignora e continua
      if (err.response?.status === 403) break;
      throw err;
    }
  }

  return comentarios.slice(0, maxComentarios);
}

router.get("/buscar", async (req, res) => {
  const query  = req.query.q;
  const inicio = req.query.inicio ? new Date(req.query.inicio) : null;
  const fim    = req.query.fim    ? new Date(req.query.fim)    : null;
  const filtro = req.query.filtro;

  if (!query) return res.status(400).json({ erro: "Parâmetro 'q' é obrigatório" });
  if (!API_KEY) return res.status(500).json({ erro: "YOUTUBE_API_KEY não configurada no .env" });

  const POOL_VIDEOS = 150; // pool amplo para garantir bons candidatos a "mais curtidos"
  const TOP_VIDEOS  = 50;  // quantidade final de vídeos a processar (comentários etc.)

  try {
    console.log(`\n[YouTube] Buscando vídeos: "${query}"`);
    const poolBruto = await buscarVideos(query, POOL_VIDEOS);
    console.log(`[YouTube] ${poolBruto.length} vídeos no pool inicial`);

    // Filtra por data ANTES de buscar estatísticas, para não gastar cota
    // com vídeos que serão descartados de qualquer forma
    let pool = poolBruto;
    if (inicio && fim) {
      pool = pool.filter(v => {
        const d = new Date(v.snippet.publishedAt);
        return d >= inicio && d <= fim;
      });
    }
    console.log(`[YouTube] ${pool.length} vídeos após filtro de data`);

    // Filtra vídeos que não parecem estar em português (verifica título + descrição)
    // relevanceLanguage da busca é só uma preferência, não uma garantia — esse
    // filtro garante de fato que o conteúdo analisado está em PT-BR
    pool = pool.filter(v => {
      const textoVideo = `${v.snippet.title} ${v.snippet.description}`;
      return pareceTextoEmPortugues(textoVideo);
    });
    console.log(`[YouTube] ${pool.length} vídeos após filtro de idioma (PT)`);

    // Busca estatísticas (likes) de todo o pool filtrado
    const videoIds   = pool.map(v => v.id?.videoId).filter(Boolean);
    const stats       = await buscarEstatisticas(videoIds);

    // Ordena por likeCount (mais curtidos primeiro) e corta nos TOP_VIDEOS
    // Se houver menos vídeos que TOP_VIDEOS, mostra todos os disponíveis
    pool.sort((a, b) => {
      const likesA = stats[a.id?.videoId]?.likeCount || 0;
      const likesB = stats[b.id?.videoId]?.likeCount || 0;
      return likesB - likesA;
    });
    const videos = pool.slice(0, TOP_VIDEOS);
    console.log(`[YouTube] ${videos.length} vídeos selecionados (mais curtidos)`);

    // Busca comentários de cada vídeo em paralelo (lotes de 5 para não sobrecarregar)
    const posts = [];
    for (let i = 0; i < videos.length; i += 5) {
      const lote  = videos.slice(i, i + 5);
      const resultados = await Promise.all(
        lote.map(async (video) => {
          const snippet  = video.snippet;
          const videoId  = video.id?.videoId;
          const dataPost = new Date(snippet.publishedAt);
          const statVideo = stats[videoId] || {};

          // Post do próprio vídeo (título + descrição)
          const textoCompletoVideo = `${snippet.title} ${snippet.description}`.toLowerCase();
          const analiseVideo = analisarSentimento(textoCompletoVideo);

          const postVideo = {
            tipo:          "video",
            videoId,
            texto:         snippet.title || "",
            descricao:     snippet.description || "",
            textoCompleto: textoCompletoVideo,
            dataPost,
            link:          `https://www.youtube.com/watch?v=${videoId}`,
            comentarios:   0, // será preenchido abaixo
            autor:         snippet.channelTitle || "",
            upvotes:       statVideo.likeCount || 0, // likes reais do vídeo
            views:         statVideo.viewCount || 0,
            canal:         snippet.channelTitle || "",
            thumbnail:     snippet.thumbnails?.medium?.url || "",
            fonte:         "youtube",
            sentimento:    analiseVideo.sentimento,
            score:         analiseVideo.score,
          };

          // Busca comentários do vídeo
          let comentariosFormatados = [];
          if (videoId) {
            try {
              const comentarios = await buscarComentarios(videoId, 50);

              // Filtra comentários que não parecem estar em português
              const comentariosPt = comentarios.filter(c => {
                const texto = c.snippet?.topLevelComment?.snippet?.textDisplay || "";
                return pareceTextoEmPortugues(texto);
              });

              postVideo.comentarios = comentariosPt.length;

              comentariosFormatados = comentariosPt.map(c => {
                const top      = c.snippet?.topLevelComment?.snippet || {};
                const texto    = top.textDisplay || top.textOriginal || "";
                const likes    = top.likeCount   || 0;
                const dataComt = new Date(top.publishedAt || dataPost);
                const textoCompletoComt = texto.toLowerCase();
                const analiseComt = analisarSentimento(textoCompletoComt);

                return {
                  tipo:          "comentario",
                  videoId,
                  videoTitulo:   snippet.title,
                  texto,
                  descricao:     "",
                  textoCompleto: textoCompletoComt,
                  dataPost:      dataComt,
                  link:          `https://www.youtube.com/watch?v=${videoId}&lc=${c.id}`,
                  comentarios:   c.snippet?.totalReplyCount || 0,
                  autor:         top.authorDisplayName || "",
                  upvotes:       likes,
                  canal:         snippet.channelTitle || "",
                  thumbnail:     "",
                  fonte:         "youtube",
                  sentimento:    analiseComt.sentimento,
                  score:         analiseComt.score,
                };
              });
            } catch (err) {
              console.warn(`[YouTube] Erro ao buscar comentários de ${videoId}: ${err.message}`);
            }
          }

          return [postVideo, ...comentariosFormatados];
        })
      );

      resultados.forEach(r => posts.push(...r));
      await esperar(300);
    }

    console.log(`[YouTube] Total de itens (vídeos + comentários): ${posts.length}`);

    // Filtro de data já foi aplicado no pool de vídeos antes de buscar estatísticas.
    // Comentários herdam a relevância do próprio vídeo, então não são refiltrados aqui.
    let filtrados = posts;

    // Ordenação dentro do resultado final
    if (filtro === "comentarios") {
      filtrados.sort((a, b) => b.comentarios - a.comentarios);
    } else if (filtro === "curtidas") {
      filtrados.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
    } else {
      filtrados.sort((a, b) => b.dataPost - a.dataPost);
    }

    const totalPosts       = filtrados.length;
    const totalComentarios = filtrados.reduce((acc, p) => acc + (p.comentarios || 0), 0);
    const mediaComentarios = totalPosts > 0 ? (totalComentarios / totalPosts).toFixed(2) : 0;

    res.json({ totalPosts, mediaComentarios, posts: filtrados });

  } catch (error) {
    console.error("[YouTube] Erro:", error.response?.data || error.message);
    const msg = error.response?.data?.error?.message || "Erro ao buscar dados do YouTube.";
    res.status(500).json({ erro: msg });
  }
});

module.exports = router;