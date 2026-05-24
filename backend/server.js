// 🔐 Carregar variáveis de ambiente corretamente
require("dotenv").config({
  path: require("path").resolve(__dirname, ".env")
});

const express = require("express");
const cors    = require("cors");
const path    = require("path");

// 🔍 DEBUG (pode remover depois)
console.log("=== TESTE ENV ===");
console.log("USER:", process.env.BSKY_USER);
console.log("PASS:", process.env.BSKY_PASS);
console.log("=================");

// 📦 Rotas
const searchRoutes  = require("./routes/search");
const webRoutes     = require("./routes/web");
const blueskyRoutes = require("./routes/bluesky");

const app = express();

// 🔧 Middlewares
app.use(cors());
app.use(express.json());

// 🌐 Rotas da API
app.use("/api", searchRoutes);
app.use("/api", webRoutes);
app.use("/bluesky", blueskyRoutes);

// 🖥️ Servir frontend
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// 🚀 Start servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`);
});