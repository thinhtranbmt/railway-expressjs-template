import express from "express";
import { MongoClient } from "mongodb";

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.API_SECRET;
const MONGO  = process.env.MONGODB_URI;

app.use(express.json({ limit: "1mb" }));

let db;

async function startServer() {
  try {
    const client = await MongoClient.connect(MONGO);
    db = client.db("roxane_analytics");
    console.log("MongoDB connected");

    app.post("/api/events", async (req, res) => {
      if (req.headers["x-api-secret"] !== SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { events } = req.body;
      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: "No events" });
      }
      try {
        const docs = events.map(e => ({ ...e, received_at: new Date() }));
        await db.collection("events").insertMany(docs);
        res.json({ ok: true, received: docs.length });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/summary", async (req, res) => {
      if (req.headers["x-api-secret"] !== SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      try {
        const col = db.collection("events");
        const total = await col.countDocuments();
        const users = await col.distinct("user_id");
        const recent = await col.find({}).sort({ received_at: -1 }).limit(10).toArray();
        res.json({ total_events: total, total_users: users.length, recent_events: recent });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/health", (req, res) => {
      res.json({ status: "ok", db: "connected" });
    });

    app.listen(PORT, () => {
      console.log("Server running on port " + PORT);
    });

  } catch (err) {
    console.error("Failed to connect MongoDB:", err);
    process.exit(1);
  }
}

startServer();
