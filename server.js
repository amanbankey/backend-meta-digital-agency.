// index.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

// routes
const serviceRoutes = require("./routes/serviceroutes.js");
const authRoutes = require("./routes/auth.js");
const blogRoutes = require("./routes/blogRoutes.js");
const contactRoutes = require("./routes/contactRoutes.js");

// Crash handlers
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

const app = express();
const PORT = process.env.PORT || 5001;

// ✅ Mongo URI env se hi aayega (Render me MONGO_URI set hona chahiye)
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGO || 
  "mongodb://localhost:27017/mydb";

console.log("📦 index.js loaded");
console.log("MONGO_URI present:", !!process.env.MONGO_URI);

// ✅ CORS: yahi pe allowed origins define kiye
const allowedOrigins = [
  "http://localhost:5173",         // local dev (Vite)
  "http://localhost:3000",         // local dev (agar React CRA use ho)
  "https://metadigitalagency.in",  // live site
  "https://www.metadigitalagency.in",
  "https://meta-digital-agency.vercel.app"
];

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

// ✅ Simplified CORS yahi pe (koi FRONTEND_URL env ki zarurat nahi)
app.use(
  cors({
    origin: (origin, callback) => {
      // Postman / curl / server-side requests ke liye
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("CORS policy: This origin is not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ["Content-Range", "X-Total-Count"],
    credentials: true,
  })
);

// Simple request logger
app.use((req, res, next) => {
  console.log(`➡️ ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

/* ---------- Rate limiter ---------- */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.GLOBAL_RATE_LIMIT || "300"),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: parseInt(process.env.CONTACT_RATE_LIMIT || "100"),
  message: { ok: false, error: "Too many contact requests from this IP, please try later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ---------- Routes ---------- */
app.use(
  "/api/services",
  (req, res, next) => {
    console.log("👉 Request :", req.method, req.url);
    next();
  },
  serviceRoutes
);

app.use("/api/auth", authRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/contact", contactLimiter, contactRoutes);

/* ---------- Health ---------- */
app.get("/api/health", (req, res) => res.json({ ok: true, uptime: process.uptime() }));

/* ---------- 404 handler ---------- */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

/* ---------- Error handler ---------- */
app.use((err, req, res, next) => {
  console.error("❗ Express error:", err && err.stack ? err.stack : err);
  const status = err.status || 500;
  const payload = {
    ok: false,
    error: err.message || "Server error",
  };
  if (process.env.NODE_ENV !== "production") payload.stack = err.stack;
  res.status(status).json(payload);
});

/* ---------- Start: connect to MongoDB then listen ---------- */
async function start() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected");

    const server = app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT} (env=${process.env.NODE_ENV || "development"})`)
    );

    const graceful = async (signal) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log("HTTP server closed.");
        mongoose.connection.close(false, () => {
          console.log("Mongo connection closed.");
          process.exit(0);
        });
      });
      setTimeout(() => {
        console.error("Forcing shutdown after 10s");
        process.exit(1);
      }, 10000).unref();
    };

    process.on("SIGTERM", () => graceful("SIGTERM"));
    process.on("SIGINT", () => graceful("SIGINT"));
  } catch (err) {
    console.error("❌ Failed to start server:", err && err.message ? err.message : err);
    process.exit(1);
  }
}

start();
