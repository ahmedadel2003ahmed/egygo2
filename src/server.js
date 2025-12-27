import "dotenv/config"; // Load env vars immediately
import { createServer } from "http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { configureCloudinary } from "./config/cloudinary.js";
import { initializeMailer } from "./utils/mailer.js";
import { initializeSocketServer } from "./sockets/index.js";

// Validate required environment variables
const requiredEnvVars = [
  "MONGO_URI",
  "JWT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "EMAIL_SMTP_HOST",
  "EMAIL_USER",
  "EMAIL_PASS",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error("Error: Missing required environment variables:");
  missingEnvVars.forEach((envVar) => console.error(`  - ${envVar}`));
  process.exit(1);
}

// Create HTTP server for both Express and Socket.io
const httpServer = createServer(app);

/**
 * Start Server
 */
const startServer = async () => {
  try {
    // Initialize services in background
    console.log("Initializing services...");

    // Connect to MongoDB
    await connectDB();

    // Configure Cloudinary
    configureCloudinary();

    // Initialize email transporter
    initializeMailer();

    // Initialize Socket.io server
    const io = initializeSocketServer(httpServer);
    console.log("💬 Socket.io server initialized");

    console.log("✅ All services initialized successfully");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

/**
 * Graceful Shutdown
 */
process.on("SIGTERM", () => {
  console.log("\n👋 SIGTERM signal received: closing HTTP server");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\n👋 SIGINT signal received: closing HTTP server");
  process.exit(0);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  process.exit(1);
});

// Start the server - Railway requires this at the end
const PORT = process.env.PORT || 8080;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server listening on", PORT);
  startServer();
});
