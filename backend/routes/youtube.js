const express = require("express");
const axios   = require("axios");

const router = express.Router();

const API_KEY  = process.env.YOUTUBE_API_KEY;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Busca vídeos por palavra-chave
async function buscarVideos(query, maxVideos = 50) {
  const videos = [];
  let pageToken = "";

  while (videos.length < maxVideos) {
    const params = {
      part:       "snippet",
      q:          query,
      type:       "video",
      maxResults: 50,
      order:      "relevance",
      key:        API_KEY,
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

// Busca comentários de um vídeo
async function buscarComentarios(videoId, maxComentarios = 100) {
  const comentarios = [];
  let pageToken     = "";

  while (comentarios.length < maxComentarios) {
    try {
      const params = {
        part:       "snippet",
        videoId,
        maxResults: 100,
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

  try {
    console.log(`\n[YouTube] Buscando vídeos: "${query}"`);
    const videos = await buscarVideos(query, 30); // 30 vídeos por busca
    console.log(`[YouTube] ${videos.length} vídeos encontrados`);

    // Busca comentários de cada vídeo em paralelo (lotes de 5 para não sobrecarregar)
    const posts = [];
    for (let i = 0; i < videos.length; i += 5) {
      const lote  = videos.slice(i, i + 5);
      const resultados = await Promise.all(
        lote.map(async (video) => {
          const snippet  = video.snippet;
          const videoId  = video.id?.videoId;
          const dataPost = new Date(snippet.publishedAt);

          // Post do próprio vídeo (título + descrição)
          const postVideo = {
            tipo:          "video",
            videoId,
            texto:         snippet.title || "",
            descricao:     snippet.description || "",
            textoCompleto: `${snippet.title} ${snippet.description}`.toLowerCase(),
            dataPost,
            link:          `https://www.youtube.com/watch?v=${videoId}`,
            comentarios:   0, // será preenchido abaixo
            autor:         snippet.channelTitle || "",
            upvotes:       0,
            canal:         snippet.channelTitle || "",
            thumbnail:     snippet.thumbnails?.medium?.url || "",
            fonte:         "youtube",
          };

          // Busca comentários do vídeo
          let comentariosFormatados = [];
          if (videoId) {
            try {
              const comentarios = await buscarComentarios(videoId, 50);
              postVideo.comentarios = comentarios.length;

              comentariosFormatados = comentarios.map(c => {
                const top      = c.snippet?.topLevelComment?.snippet || {};
                const texto    = top.textDisplay || top.textOriginal || "";
                const likes    = top.likeCount   || 0;
                const dataComt = new Date(top.publishedAt || dataPost);

                return {
                  tipo:          "comentario",
                  videoId,
                  videoTitulo:   snippet.title,
                  texto,
                  descricao:     "",
                  textoCompleto: texto.toLowerCase(),
                  dataPost:      dataComt,
                  link:          `https://www.youtube.com/watch?v=${videoId}&lc=${c.id}`,
                  comentarios:   c.snippet?.totalReplyCount || 0,
                  autor:         top.authorDisplayName || "",
                  upvotes:       likes,
                  canal:         snippet.channelTitle || "",
                  thumbnail:     "",
                  fonte:         "youtube",
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

    // Filtro por data
    let filtrados = posts;
    if (inicio && fim) {
      filtrados = posts.filter(p => p.dataPost >= inicio && p.dataPost <= fim);
    }

    // Ordenação
    if (filtro === "comentarios") {
      filtrados.sort((a, b) => b.comentarios - a.comentarios);
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