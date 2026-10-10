import "dotenv/config";
import http from "http";
import app from "./app";
import { connectDB } from "./config/db";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

async function bootstrap(): Promise<void> {
  // Connect to MongoDB
  await connectDB();

  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`\n🚀 StudyForge API running on http://localhost:${PORT}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV ?? "development"}`);
    console.log(`   Frontend: ${process.env.FRONTEND_URL ?? "http://localhost:5173"}`);
    console.log(`   Health:   http://localhost:${PORT}/health\n`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n[Server] ${signal} received, shutting down gracefully...`);
    server.close(async () => {
      const mongoose = await import("mongoose");
      await mongoose.default.disconnect();
      console.log("[Server] MongoDB disconnected. Bye!");
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown stalls
    setTimeout(() => {
      console.error("[Server] Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    console.error("[Server] Unhandled rejection:", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("[Server] Uncaught exception:", err);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error("[Server] Bootstrap failed:", err);
  process.exit(1);
});
