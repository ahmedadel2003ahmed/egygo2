import http from "http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { configureCloudinary } from "./config/cloudinary.js";
import { initializeMailer } from "./utils/mailer.js";
import { initializeSocketServer } from "./sockets/index.js";

const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server listening on port", PORT);
  initServices();
});

async function initServices() {
  try {
    await connectDB();
    configureCloudinary();
    initializeMailer();
    initializeSocketServer(server);
    console.log("Services initialized");
  } catch (err) {
    console.error("Service init error:", err.message);
  }
}
