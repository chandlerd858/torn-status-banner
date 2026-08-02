import express from "express";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.TORN_API_KEY;

// Torn changes this occasionally (25-30 pts historically) - check Points page in-game
// and update if it drifts. It's only used for display, not for spending anything.
const REFILL_COST = Number(process.env.ENERGY_REFILL_COST || 25);

// Minimum time between real API calls. Torn allows 100 req/min per key, but a forum
// banner could get hit far more often than that if the thread is popular, so we
// cache aggressively and always serve the cached copy while it's fresh.
const CACHE_MS = 60_000;

let cache = { data: null, fetchedAt: 0, error: null };

async function getTornData() {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_MS) return cache.data;

  if (!API_KEY) throw new Error("TORN_API_KEY is not set");

  const url = `https://api.torn.com/user/?selections=bars,cooldowns,refills&key=${API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.error) {
    throw new Error(`Torn API error ${json.error.code}: ${json.error.error}`);
  }

  const missing = ["energy", "cooldowns", "refills"].filter((k) => !json[k]);
  if (missing.length) {
    throw new Error(
      `Key response is missing selection(s): ${missing.join(", ")}. ` +
      `Received keys: ${Object.keys(json).join(", ")}. ` +
      `Your key likely wasn't created with all of bars,cooldowns,refills enabled.`
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
    <rect x="${x}" y="${y}" width="215" height="34" rx="8" fill="${color}"/>
    <text x="${x + 107}" y="${y + 22}" font-family="Verdana, sans-serif" font-size="14"
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

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
  <rect width="300" height="200" rx="12" fill="#1e1e28"/>
  <text x="50" y="25" font-family="Verdana, sans-serif" font-size="24" fill="#ffffff">
    Energy: ${energy.current}/${energy.maximum}
  </text>
  ${pill(50, 50, drugReady ? "Drug CD: READY" : `Drug CD: ${formatSeconds(drugSecs)}`, drugReady)}
  ${pill(50, 100, boosterReady ? "Booster CD: EMPTY" : `Booster CD: ${formatSeconds(boosterSecs)}`, boosterReady)}
  ${pill(50, 150, refillAvailable ? `Refill: AVAILABLE (${REFILL_COST}pts)` : "Refill: USED TODAY", refillAvailable)}
  <text x="60" y="190" font-family="Verdana, sans-serif" font-size="11" fill="#888888">
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
