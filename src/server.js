import "dotenv/config";
import express from "express";
import http from "http";
import { connectDB } from "./config/db.js";
import { configureCloudinary } from "./config/cloudinary.js";
import { initializeMailer } from "./utils/mailer.js";
import { initializeSocketServer } from "./sockets/index.js";
import app from "./app.js";

const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

// Start server immediately for Railway
server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server listening on", PORT);
  initializeServices();
});

// Initialize services in background
async function initializeServices() {
  try {
    console.log("Initializing services...");
    
    await connectDB();
    configureCloudinary();
    initializeMailer();
    initializeSocketServer(server);
    
    console.log("✅ All services initialized");
  } catch (error) {
    console.error("Service initialization error:", error);
  }
}

process.on("SIGTERM", () => {
  console.log("SIGTERM received");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received");
  process.exit(0);
});
