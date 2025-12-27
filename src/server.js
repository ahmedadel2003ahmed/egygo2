import http from "http";
import app from "./app.js";

const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server listening on port", PORT);
});
