const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const { analisarSentimento } = require("../services/sentiment");

let cachedToken    = null;
let tokenExpiresAt = 0;

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 🔐 FUNÇÃO DE LOGIN
async function getAccessToken() {
  const now = Date.now();

  // reutiliza token se ainda for válido
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  try {
    const response = await axios.post(
      "https://bsky.social/xrpc/com.atproto.server.createSession",
      {
        identifier: process.env.BSKY_USER,
        password:   process.env.BSKY_PASS,
      }
    );

    cachedToken = response.data.accessJwt;

    // token dura ~2h (margem de segurança)
    tokenExpiresAt = now + (1000 * 60 * 60 * 2);

    return cachedToken;

  } catch (error) {
    console.error("Erro login Bluesky:", error.response?.data || error.message);
    throw new Error("Falha na autenticação Bluesky");
  }
}

// ─── Extrai a URL pública (bsky.app) de um post a partir do uri/handle ───────
function montarUrlPost(handle, uri) {
  if (!handle || !uri) return "#";
  const partes = uri.split("/");
  const postId = partes[partes.length - 1];
  return postId ? `https://bsky.app/profile/${handle}/post/${postId}` : "#";
}

// ─── Busca TODOS os posts da query, paginando via cursor até esgotar ────────
// A API do Bluesky não documenta um limite fixo de total para searchPosts.
// Paginamos até o cursor se esgotar (fim real dos resultados) ou até um teto
// de segurança, o que vier primeiro — isso evita uma busca rodar indefinidamente
// em temas muito amplos, sem impor um corte artificial baixo como antes (200).
const TETO_SEGURANCA_POSTS = 2000;

async function buscarTodosPosts(query, since, until) {
  const posts = [];
  let cursor  = undefined;
  let pagina  = 0;

  const token = await getAccessToken();

  while (posts.length < TETO_SEGURANCA_POSTS) {
    const params = { q: query, limit: 100 };
    if (cursor) params.cursor = cursor;
    if (since)  params.since  = since;
    if (until)  params.until  = until;

    const response = await axios.get(
      "https://bsky.social/xrpc/app.bsky.feed.searchPosts",
      { params, headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );

    const itens = response.data.posts || [];
    if (!itens.length) break; // cursor esgotado — não há mais resultados

    posts.push(...itens);

    cursor = response.data.cursor || null;
    pagina++;
    if (!cursor) break; // API sinalizou que não há próxima página

    await esperar(250); // respiro entre páginas para não pressionar o rate limit
  }

  console.log(`[Bluesky] ${posts.length} posts coletados em ${pagina} página(s) para "${query}"`);
  return posts.slice(0, TETO_SEGURANCA_POSTS);
}

// ─── Busca a thread completa de um post para extrair os replies (comentários) ─
// A API do Bluesky não tem um endpoint de "buscar replies por texto" — só é
// possível obter respostas pegando a thread completa de UM post específico.
// Por isso fazemos 1 chamada extra (getPostThread) por post processado.
async function buscarReplies(uri, maxReplies = 50) {
  try {
    const token = await getAccessToken();
    const response = await axios.get(
      "https://bsky.social/xrpc/app.bsky.feed.getPostThread",
      {
        params: { uri, depth: 1 }, // depth:1 = só respostas diretas, não sub-respostas
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      }
    );

    const replies = response.data.thread?.replies || [];
    return replies.slice(0, maxReplies);

  } catch (err) {
    // Thread pode não existir mais, post removido, etc — ignora e segue
    console.warn(`[Bluesky] Erro ao buscar replies de ${uri}: ${err.response?.status || err.message}`);
    return [];
  }
}

// 🔎 ROTA DE BUSCA
router.get("/", async (req, res) => {
  const query = req.query.q;

  // Datas opcionais (formato YYYY-MM-DD vindas do frontend) → ISO-8601 para a API
  const since = req.query.since ? new Date(req.query.since + "T00:00:00Z").toISOString() : undefined;
  const until = req.query.until ? new Date(req.query.until + "T23:59:59Z").toISOString() : undefined;

  if (!query) {
    return res.json({ totalPosts: 0, posts: [] });
  }

  try {
    const postsBrutos = await buscarTodosPosts(query, since, until);

// Filtro extra: garante que só passam posts em português
const postsFiltrados = postsBrutos.filter(post => {
  const langs = post.record?.langs;
  if (!langs || langs.length === 0) return true; // sem tag de idioma → deixa passar
  return langs.some(l => l.startsWith("pt"));
});

    const posts = [];

    // Processa em lotes de 5 para não disparar centenas de chamadas simultâneas
    // de getPostThread (cada post = 1 chamada extra de replies)
    for (let i = 0; i < postsBrutos.length; i += 5) {
      const lote = postsBrutos.slice(i, i + 5);

      const resultados = await Promise.all(
        lote.map(async (post) => {
          const texto = post.record?.text || post.record?.embed?.external?.title || "[sem texto]";
          const handle = post.author?.handle || "desconhecido";
          const uri    = post.uri || "";
          const url    = montarUrlPost(handle, uri);
          const dataPost = post.record?.createdAt ? new Date(post.record.createdAt)
                          : post.indexedAt ? new Date(post.indexedAt)
                          : new Date();

          const textoCompletoPost = texto.toLowerCase();
          const analisePost = analisarSentimento(textoCompletoPost);

          const postFormatado = {
            tipo:          "post",
            fonte:         "bluesky",
            uri:           uri, // chave de agrupamento — bate com postUri dos comentários
            texto:         texto.slice(0, 300),
            descricao:     "",
            textoCompleto: textoCompletoPost,
            dataPost,
            link:          url,
            comentarios:   0, // preenchido abaixo com replies reais coletados
            autor:         handle,
            upvotes:       post.likeCount   || 0,
            reposts:       post.repostCount || 0,
            subreddit:     "",
            sentimento:    analisePost.sentimento,
            score:         analisePost.score,
          };

          // Busca os replies (comentários) reais desse post
          let comentariosFormatados = [];
          if (uri) {
            const replies = await buscarReplies(uri, 50);
            postFormatado.comentarios = replies.length;

            comentariosFormatados = replies
              .map(r => r.post) // cada reply vem como { post: {...} }
              .filter(Boolean)
              .map(rp => {
                const textoReply  = rp.record?.text || "[sem texto]";
                const handleReply = rp.author?.handle || "desconhecido";
                const uriReply    = rp.uri || "";
                const urlReply    = montarUrlPost(handleReply, uriReply);
                const dataReply   = rp.record?.createdAt ? new Date(rp.record.createdAt)
                                   : rp.indexedAt ? new Date(rp.indexedAt)
                                   : dataPost;

                const textoCompletoReply = textoReply.toLowerCase();
                const analiseReply = analisarSentimento(textoCompletoReply);

                return {
                  tipo:          "comentario",
                  fonte:         "bluesky",
                  postUri:       uri,
                  postTexto:     texto,
                  texto:         textoReply.slice(0, 300),
                  descricao:     "",
                  textoCompleto: textoCompletoReply,
                  dataPost:      dataReply,
                  link:          urlReply,
                  comentarios:   0,
                  autor:         handleReply,
                  upvotes:       rp.likeCount   || 0,
                  reposts:       rp.repostCount || 0,
                  subreddit:     "",
                  sentimento:    analiseReply.sentimento,
                  score:         analiseReply.score,
                };
              });
          }

          return [postFormatado, ...comentariosFormatados];
        })
      );

      resultados.forEach(r => posts.push(...r));
      await esperar(200);
    }

    res.json({
      totalPosts: posts.length,
      posts,
    });

  } catch (error) {
    console.error("Erro Bluesky:", error.response?.status, error.message);

    res.status(500).json({
      error:   "Erro ao buscar dados do Bluesky",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;