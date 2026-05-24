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
  const query = req.query.q;

  if (!query) {
    return res.json({ totalPosts: 0, posts: [] });
  }

  try {
    const token = await getAccessToken();

    const response = await axios.get(
      "https://bsky.social/xrpc/app.bsky.feed.searchPosts",
      {
        params: {
          q: query,
          limit: 20
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

  const posts = (response.data.posts || []).map(post => {
  const text =
    post.record?.text ||
    post.record?.embed?.external?.title ||
    "[sem texto]";

  const handle = post.author?.handle || "";
  const uri = post.uri || "";

  let postId = "";
  if (uri) {
    const parts = uri.split("/");
    postId = parts[parts.length - 1];
  }

  const url = handle && postId
    ? `https://bsky.app/profile/${handle}/post/${postId}`
    : "#";

  return {
    text,
    author: handle,
    url,
    likes: post.likeCount || 0,
    replies: post.replyCount || 0,
    reposts: post.repostCount || 0
  };
});

    res.json({
      totalPosts: posts.length,
      posts
    });

  } catch (error) {
    console.error("Erro Bluesky:", error.response?.status, error.message);

    res.status(500).json({
      error: "Erro ao buscar dados do Bluesky",
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;