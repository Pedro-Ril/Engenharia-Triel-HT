require("dotenv").config();

const express = require("express");
const cors = require("cors");

const itemPdfRoutes = require("./routes/itemPdf.routes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.use((req, res, next) => {
  console.log("----- NOVA REQUISIÇÃO -----");
  console.log("Data:", new Date().toISOString());
  console.log("Método:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Query:", req.query);
  console.log("Body:", req.body);
  console.log("---------------------------");
  next();
});

app.use("/api", itemPdfRoutes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Backend Cadastro Roteiro online",
  });
});

const PORT = process.env.PORT || 3334;

app.listen(PORT, () => {
  console.log(`Servidor Cadastro Roteiro rodando na porta ${PORT}`);
});