/**
 * Fix/refresh place image URLs using Wikipedia REST summary API thumbnails.
 *
 * Why: many hand-written upload.wikimedia.org URLs are easy to get wrong.
 * This script replaces each place's `images` array with a single reliable
 * thumbnail URL fetched from Wikipedia.
 *
 * Usage:
 *   node scripts/fixPlaceImagesFromWikipedia.js --province alexandria
 *   node scripts/fixPlaceImagesFromWikipedia.js --province cairo
 *
 * Notes:
 * - Requires outbound access to https://en.wikipedia.org/api/rest_v1
 * - Does not modify DB; only updates JSON files.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "data");
const PLACES_DIR = path.join(DATA_DIR, "places_by_province");

const SECTIONS = ["archaeological", "entertainment", "hotels", "events"];

function parseArgs(argv) {
  const args = { province: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--province" && argv[i + 1]) {
      args.province = String(argv[i + 1])
        .trim()
        .toLowerCase();
      i++;
    }
  }
  return args;
}

function decodeWikiTitleFromUrl(url) {
  try {
    const idx = url.indexOf("/wiki/");
    if (idx === -1) return null;
    const title = url.slice(idx + "/wiki/".length);
    if (!title) return null;
    // Keep underscores (API accepts both), but decode percent-encoding.
    return decodeURIComponent(title);
  } catch {
    return null;
  }
}

async function fetchWikiThumb(title) {
  const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title
  )}`;
  const res = await axios.get(apiUrl, {
    timeout: 15000,
    validateStatus: () => true,
    headers: {
      "User-Agent": "EGYGO/1.0 (places-image-refresh)",
      Accept: "application/json",
    },
  });

  if (res.status !== 200 || !res.data) return null;

  const thumb = res.data.thumbnail?.source;
  const original = res.data.originalimage?.source;

  // Prefer original if available, else thumbnail.
  return original || thumb || null;
}

function pickFallbackTitle(place, provinceTitle) {
  const website =
    typeof place.website === "string" ? place.website.toLowerCase() : "";
  const sources = Array.isArray(place.sources)
    ? place.sources.map((s) => String(s).toLowerCase())
    : [];

  if (
    website.includes("fourseasons.com") ||
    sources.some((s) => s.includes("fourseasons.com"))
  ) {
    return "Four Seasons Hotels and Resorts";
  }

  if (
    website.includes("hilton.com") ||
    sources.some((s) => s.includes("hilton.com"))
  ) {
    return "Hilton Hotels & Resorts";
  }

  if (
    website.includes("kempinski.com") ||
    sources.some((s) => s.includes("kempinski.com"))
  ) {
    return "Kempinski";
  }

  if (
    website.includes("steigenberger.com") ||
    sources.some((s) => s.includes("steigenberger.com"))
  ) {
    return "Steigenberger Hotels & Resorts";
  }

  if (
    website.includes("cairojazzfestival.com") ||
    sources.some((s) => s.includes("cairojazzfestival.com"))
  ) {
    return "Cairo";
  }

  return provinceTitle;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.province) {
    console.error("❌ Missing --province <slug> (e.g. cairo, alexandria)");
    process.exit(1);
  }

  const filePath = path.join(PLACES_DIR, `${args.province}.places.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!raw || typeof raw !== "object") {
    console.error("❌ Invalid JSON root");
    process.exit(1);
  }

  const provinceKey = Object.keys(raw)[0];
  if (
    !provinceKey ||
    !raw[provinceKey] ||
    typeof raw[provinceKey] !== "object"
  ) {
    console.error('❌ Expected grouped format: { "ProvinceName": { ... } }');
    process.exit(1);
  }

  const provinceTitle = provinceKey;

  for (const section of SECTIONS) {
    const places = raw[provinceKey][section];
    if (!Array.isArray(places)) continue;

    for (const place of places) {
      const sources = Array.isArray(place.sources) ? place.sources : [];
      const wikiSource = sources.find(
        (s) => typeof s === "string" && s.includes("wikipedia.org/wiki/")
      );

      const title = wikiSource
        ? decodeWikiTitleFromUrl(wikiSource)
        : pickFallbackTitle(place, provinceTitle);

      if (!title) continue;

      const img = await fetchWikiThumb(title);
      if (!img) {
        continue;
      }

      place.images = [img];
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf8");
  console.log(`✅ Updated images in: ${filePath}`);
}

main().catch((err) => {
  console.error("💥 FATAL:", err?.message || err);
  process.exit(1);
});
