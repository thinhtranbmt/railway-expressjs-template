const express = require("express");
const { MongoClient } = require("mongodb");

const app     = express();
const PORT    = process.env.PORT || 3000;
const SECRET  = process.env.API_SECRET;
const MONGO   = process.env.MONGODB_URI;

app.use(express.json({ limit: "1mb" }));

let db;
MongoClient.connect(MONGO)
  .then(client => {
    db = client.db("roxane_analytics");
    console.log("✅ MongoDB connected");
  })
  .catch(err => console.error("❌ MongoDB error:", err));

// POST /api/events — Unity gửi events vào đây
app.post("/api/events", async (req, res) => {
  if (req.headers["x-api-secret"] !== SECRET)
    return res.status(401).json({ error: "Unauthorized" });

  const { events } = req.body;
  if (!Array.isArray(events) || events.length === 0)
    return res.status(400).json({ error: "No events" });

  try {
    const docs = events.map(e => ({ ...e, received_at: new Date() }));
    await db.collection("events").insertMany(docs);
    res.json({ ok: true, received: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/summary — xem thống kê
app.get("/api/summary", async (req, res) => {
  if (req.headers["x-api-secret"] !== SECRET)
    return res.status(401).json({ error: "Unauthorized" });

  try {
    const col = db.collection("events");
    const [total, users, levels] = await Promise.all([
      col.countDocuments(),
      col.distinct("user_id").then(r => r.length),
      col.aggregate([
        { $match: { event_name: { $in: ["LevelStart","LevelComplete","LevelFail"] } } },
        { $group: {
            _id: "$level_id",
            started:   { $sum: { $cond: [{ $eq: ["$event_name","LevelStart"]   }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ["$event_name","LevelComplete"]}, 1, 0] } },
            failed:    { $sum: { $cond: [{ $eq: ["$event_name","LevelFail"]    }, 1, 0] } },
        }},
        { $sort: { _id: 1 } }
      ]).toArray()
    ]);
    res.json({ total_events: total, total_users: users, levels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/health", (_, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
