const express = require("express");
const cors = require("cors");

const searchRoutes = require("./routes/search");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", searchRoutes);

app.listen(3000, () => {
  console.log("Backend rodando em http://localhost:3000");
});


const path = require("path");

// Servir frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// Rota principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});