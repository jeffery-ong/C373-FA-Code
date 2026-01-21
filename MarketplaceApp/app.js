const express = require("express");
const path = require("path");
const app = express();
const PORT = 3001;

// ---------------- CONFIG ----------------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// ---------------- HOME PAGE ----------------
app.get("/", (req, res) => {
  res.render("index");
});

// ---------------- SERVER ----------------
app.listen(PORT, () => {
  console.log(`FA Marketplace running at http://localhost:${PORT}`);
});
