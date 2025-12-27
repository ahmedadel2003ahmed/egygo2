import express from "express";
import http from "http";

const app = express();

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

const server = http.createServer(app);

const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log("TEST SERVER RUNNING ON", PORT);
});
