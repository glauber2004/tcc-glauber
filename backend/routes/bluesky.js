const express = require("express");
const router = express.Router();
const axios = require("axios");

let cachedToken = null;
let tokenExpiresAt = 0;

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
        password: process.env.BSKY_PASS
      }
    );

    cachedToken = response.data.accessJwt;

    // token dura ~2h (segurança)
    tokenExpiresAt = now + (1000 * 60 * 60 * 2);

    return cachedToken;

  } catch (error) {
    console.error("Erro login Bluesky:", error.response?.data || error.message);
    throw new Error("Falha na autenticação Bluesky");
  }
}

// 🔎 ROTA DE BUSCA
router.get("/", async (req, res) => {
  const query  = req.query.q;
  const limit  = Math.min(parseInt(req.query.limit) || 100, 100);
  const cursor = req.query.cursor || undefined;

  // Datas opcionais (formato YYYY-MM-DD vindas do frontend)
  const since = req.query.since || undefined; // ex: "2025-01-01"
  const until = req.query.until || undefined; // ex: "2025-12-31"

  if (!query) {
    return res.json({ totalPosts: 0, posts: [], cursor: null });
  }

  try {
    const token = await getAccessToken();

    const params = { q: query, limit };
    if (cursor) params.cursor = cursor;
    // A API do Bluesky aceita since/until em formato ISO-8601
    if (since) params.since = new Date(since + "T00:00:00Z").toISOString();
    if (until) params.until = new Date(until + "T23:59:59Z").toISOString();

    const response = await axios.get(
      "https://bsky.social/xrpc/app.bsky.feed.searchPosts",
      {
        params,
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const posts = (response.data.posts || []).map(post => {
      const text =
        post.record?.text ||
        post.record?.embed?.external?.title ||
        "[sem texto]";

      const handle = post.author?.handle || "";
      const uri    = post.uri || "";

      let postId = "";
      if (uri) {
        const parts = uri.split("/");
        postId = parts[parts.length - 1];
      }

      const url = handle && postId
        ? `https://bsky.app/profile/${handle}/post/${postId}`
        : "#";

      // Retorna a data de criação do post
      const createdAt = post.record?.createdAt || post.indexedAt || null;

      return {
        text,
        author: handle,
        url,
        createdAt,
        likes:   post.likeCount    || 0,
        replies: post.replyCount   || 0,
        reposts: post.repostCount  || 0
      };
    });

    res.json({
      totalPosts: posts.length,
      posts,
      cursor: response.data.cursor || null
    });

  } catch (error) {
    console.error("Erro Bluesky:", error.response?.status, error.message);

    res.status(500).json({
      error:   "Erro ao buscar dados do Bluesky",
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
