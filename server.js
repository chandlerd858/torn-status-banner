import express from "express";
import "dotenv/config";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.TORN_API_KEY;

const REFILL_COST = Number(process.env.ENERGY_REFILL_COST || 30);

const OPEN_IMAGE_PATH = process.env.OPEN_IMAGE_PATH || "./public/open.png";
const CLOSED_IMAGE_PATH = process.env.CLOSED_IMAGE_PATH || "./public/closed.png";
const BADGE_WIDTH = Number(process.env.BADGE_WIDTH || 100);
const BADGE_HEIGHT = Number(process.env.BADGE_HEIGHT || 40);

const MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

// Images are small and rarely change, so read + base64-encode once at startup
// and keep them in memory rather than hitting the filesystem on every request.
function loadImageAsDataUri(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext];
    if (!mime) {
      console.warn(`Unsupported image type for ${filePath}, skipping`);
      return null;
    }
    const buffer = fs.readFileSync(filePath);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.warn(`Could not load image at ${filePath}: ${err.message}`);
    return null;
  }
}

const openImageDataUri = loadImageAsDataUri(OPEN_IMAGE_PATH);
const closedImageDataUri = loadImageAsDataUri(CLOSED_IMAGE_PATH);

// Minimum time between real API calls. Torn allows 100 req/min per key, but a forum
// banner could get hit far more often than that if the thread is popular, so we
// cache aggressively and always serve the cached copy while it's fresh.
const CACHE_MS = 60_000;

// --- Layout constants (your vertical stacked-pill layout, kept as-is) ---
const SVG_WIDTH = 300;
const PILL_WIDTH = 200;
const PILL_X = Math.floor((SVG_WIDTH - PILL_WIDTH) / 2);
const BADGE_X = Math.floor((SVG_WIDTH - BADGE_WIDTH) / 2);

// Row y-positions, top to bottom: energy text, badge, drug pill, booster pill, refill pill
const ENERGY_Y = 32;
const BADGE_Y = 50;
const PILL1_Y = 100;
const PILL2_Y = 150;
const PILL3_Y = 200;
const FOOTER_MARGIN = 30; // space below the last pill for the "updated" text
const SVG_HEIGHT = PILL3_Y + 30 + FOOTER_MARGIN; // grows automatically if rows move

let cache = { data: null, fetchedAt: 0, error: null };

async function getTornData() {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_MS) return cache.data;

  if (!API_KEY) throw new Error("TORN_API_KEY is not set");

  const url = `https://api.torn.com/user/?selections=bars,cooldowns,refills,profile&key=${API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.error) {
    throw new Error(`Torn API error ${json.error.code}: ${json.error.error}`);
  }

  const missing = ["energy", "cooldowns", "refills", "last_action"].filter((k) => !json[k]);
  if (missing.length) {
    throw new Error(
      `Key response is missing selection(s): ${missing.join(", ")}. ` +
      `Received keys: ${Object.keys(json).join(", ")}. ` +
      `Your key likely wasn't created with all of bars,cooldowns,refills,profile enabled.`
    );
  }

  cache = { data: json, fetchedAt: now, error: null };
  return json;
}

function formatSeconds(s) {
  if (s <= 0) return "READY";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function pill(x, y, label, ready) {
  const color = ready ? "#2ecc71" : "#57606f";
  return `
    <rect x="${x}" y="${y}" width="200" height="30" rx="8" fill="${color}"/>
    <text x="${x + 100}" y="${y + 20}" font-family="Verdana, sans-serif" font-size="14"
      fill="#ffffff" text-anchor="middle">${label}</text>`;
}

function errorSvg(message) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="60">
    <rect width="700" height="60" rx="10" fill="#c0392b"/>
    <text x="20" y="35" font-family="Verdana, sans-serif" font-size="14" fill="#fff">${message}</text>
  </svg>`;
}

app.get("/banner.svg", async (req, res) => {
  res.set("Content-Type", "image/svg+xml");
  res.set("Cache-Control", "public, max-age=60");

  try {
    const data = await getTornData();

    const drugSecs = data.cooldowns.drug;
    const boosterSecs = data.cooldowns.booster;
    const drugReady = drugSecs === 0;
    const boosterReady = boosterSecs === 0;
    const refillAvailable = data.refills.energy_refill_used === 0;
    const energy = data.energy;

    const onlineStatus = data.last_action.status; // "Online" | "Idle" | "Offline"
    const isOpen = onlineStatus === "Online";
    const openColor = isOpen ? "#2ecc71" : "#c0392b";
    const openLabel = isOpen ? "OPEN" : "CLOSED";

    const badgeImage = isOpen ? openImageDataUri : closedImageDataUri;
    const badgeSvg = badgeImage
      ? `<image x="${BADGE_X}" y="${BADGE_Y}" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" href="${badgeImage}"/>`
      : `<rect x="${BADGE_X}" y="${BADGE_Y}" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" rx="8" fill="${openColor}"/>
         <text x="${BADGE_X + BADGE_WIDTH / 2}" y="${BADGE_Y + BADGE_HEIGHT / 2 + 5}" font-family="Verdana, sans-serif"
           font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">${openLabel}</text>`;

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}">
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="12" fill="#1e1e28"/>
  <text x="${SVG_WIDTH / 2}" y="${ENERGY_Y}" font-family="Verdana, sans-serif" font-size="22" fill="#ffffff" text-anchor="middle">
    Energy: ${energy.current}/${energy.maximum}
  </text>
  ${badgeSvg}
  ${pill(PILL_X, PILL1_Y, drugReady ? "Drug CD: READY" : `Drug CD: ${formatSeconds(drugSecs)}`, drugReady)}
  ${pill(PILL_X, PILL2_Y, boosterReady ? "Booster CD: EMPTY" : `Booster CD: ${formatSeconds(boosterSecs)}`, boosterReady)}
  ${pill(PILL_X, PILL3_Y, refillAvailable ? `Refill: AVAILABLE (${REFILL_COST}pts)` : "Refill: USED TODAY", refillAvailable)}
  <text x="${SVG_WIDTH / 2}" y="${SVG_HEIGHT - 5}" font-family="Verdana, sans-serif" font-size="10" fill="#888888" text-anchor="middle">
    Updated ${new Date(cache.fetchedAt).toUTCString()}
  </text>
</svg>`.trim();

    res.send(svg);
  } catch (err) {
    console.error(err.message);
    res.send(errorSvg("Status banner temporarily unavailable"));
  }
});

app.listen(PORT, () => console.log(`Banner server running on port ${PORT}`));
