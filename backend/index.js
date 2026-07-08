import "dotenv/config";
import { errorHandler } from "./src/middleware/error-handler.js";
import express from "express";
import cors from "cors";
import { db } from "./db/config.js";
import { mainRoutes } from "./src/api/routes.js";
const app = express();
const port = Number(process.env.PORT ?? 3778);
const maxPortAttempts = 10;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
  }),
);
// app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.use("/api", mainRoutes);

app.use(errorHandler);

const startServerOnPort = async (candidatePort, dbUnavailable) => {
  return new Promise((resolve, reject) => {
    const server = app.listen(candidatePort);

    server.on("listening", () => {
      const address = server.address();
      const actualPort =
        typeof address === "object" && address ? address.port : candidatePort;
      console.log(
        `Server running on port http://localhost:${actualPort}${dbUnavailable ? " (DB unavailable)" : ""}`,
      );
      resolve(server);
    });

    server.on("error", (err) => {
      if (
        err.code === "EADDRINUSE" &&
        candidatePort < port + maxPortAttempts - 1
      ) {
        const nextPort = candidatePort + 1;
        console.warn(
          `Port ${candidatePort} is busy. Trying ${nextPort} instead.`,
        );
        server.close(() => resolve(startServerOnPort(nextPort, dbUnavailable)));
        return;
      }

      console.error("Failed to start the server:", err.message);
      reject(err);
    });
  });
};

// Start server
const startServer = async () => {
  try {
    const connection = await db.getConnection();

    console.log("Database connection established successfully");
    connection.release();

    await startServerOnPort(port, false);
  } catch (error) {
    console.error(
      "Database connection failed:",
      error && error.message ? error.message : error,
    );
    if (process.env.NODE_ENV === "production") {
      console.error(
        "Exiting because NODE_ENV=production and DB connection is required.",
      );
      process.exit(1);
    }

    console.warn(
      "Continuing to start server without DB connection (dev mode).",
    );
    await startServerOnPort(port, true);
  }
};

startServer();
