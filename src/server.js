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

const PORT = process.env.PORT || 5001;

// Create HTTP server for both Express and Socket.io
const httpServer = createServer(app);

/**
 * Start Server
 */
const startServer = async () => {
  try {
    // Start HTTP server immediately (Railway requires quick response)
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`\n🚀 LocalGuide Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔗 API URL: http://localhost:${PORT}`);
      console.log(`💬 Socket.io URL: ws://localhost:${PORT}`);
      console.log(`💚 Health check: http://localhost:${PORT}/health`);
      console.log(`💚 API Docs: http://localhost:${PORT}/api-docs\n`);
    });

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

// Start the server
startServer();
