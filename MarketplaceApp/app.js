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

app.get("/track", (req, res) => {
  res.render("track");
});

app.get("/create", (req, res) => {
  res.render("create");
});

// ---------------- ABOUT US PAGE ----------------
app.get("/aboutus", (req, res) => {
  res.render("aboutus");
});

// =================================================
// 🔍 TRACKING ROUTES (ZAC001 / ZAC002 support)
// =================================================

// Handle search form submission (?trackingId=ZAC002)
app.get("/trackdelivery", (req, res) => {
  const trackingId = (req.query.trackingId || "").trim().toUpperCase();
  if (!trackingId) return res.redirect("/track");
  return res.redirect(`/trackdelivery/${trackingId}`);
});

// Display tracking details page
app.get("/trackdelivery/:trackingId", (req, res) => {
  const trackingId = (req.params.trackingId || "").trim().toUpperCase();
  res.render("trackdelivery", { trackingId });
});

// ---------------- SERVER ----------------
app.listen(PORT, () => {
  console.log(`FA Marketplace running at http://localhost:${PORT}`);
});
