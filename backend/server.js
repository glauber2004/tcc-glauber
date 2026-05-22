const express = require("express");
const cors    = require("cors");
const path    = require("path");

const searchRoutes = require("./routes/search");
const webRoutes    = require("./routes/web");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", searchRoutes);
app.use("/api", webRoutes);

// Servir frontend
app.use(express.static(path.join(__dirname, "../frontend")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(3000, () => {
  console.log("Backend rodando em http://localhost:3000");
});