/**
 * Validate place image URLs are reachable.
 *
 * Usage:
 *   node scripts/validatePlaceImages.js
 *   node scripts/validatePlaceImages.js --province alexandria
 *   node scripts/validatePlaceImages.js --province cairo
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

function normalizePlacesData(placesRaw) {
  if (Array.isArray(placesRaw)) return placesRaw;
  if (!placesRaw || typeof placesRaw !== "object") return [];

  // Support grouped format:
  // { "Giza": { archaeological: [...], entertainment: [...], hotels: [...], events: [...] } }
  // { archaeological: [...], entertainment: [...], hotels: [...], events: [...] }
  let grouped = placesRaw;

  const keys = Object.keys(placesRaw);
  if (keys.length === 1 && typeof placesRaw[keys[0]] === "object") {
    grouped = placesRaw[keys[0]];
  }

  if (!grouped || typeof grouped !== "object") return [];

  const isGrouped = SECTIONS.some((s) => Array.isArray(grouped[s]));
  if (!isGrouped) return [];

  return SECTIONS.flatMap((section) => {
    const items = Array.isArray(grouped[section]) ? grouped[section] : [];
    return items.map((item) => ({ ...item, type: item?.type || section }));
  });
}

async function checkUrl(url) {
  const common = {
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      "User-Agent": "EGYGO-image-validator/1.0",
      Accept: "image/*,*/*;q=0.8",
    },
  };

  // Try HEAD first (fast), then fallback to GET for hosts that block HEAD.
  try {
    const res = await axios.head(url, common);
    if (res.status >= 200 && res.status < 400)
      return { ok: true, status: res.status, method: "HEAD" };
    if (res.status === 405 || res.status === 403) {
      // fall through to GET
    } else {
      return { ok: false, status: res.status, method: "HEAD" };
    }
  } catch (e) {
    // fall through to GET
  }

  try {
    const res = await axios.get(url, {
      ...common,
      responseType: "arraybuffer",
      // Limit download size by asking for the first byte when supported
      headers: {
        ...common.headers,
        Range: "bytes=0-0",
      },
    });

    if (res.status >= 200 && res.status < 400)
      return { ok: true, status: res.status, method: "GET" };
    return { ok: false, status: res.status, method: "GET" };
  } catch (e) {
    return { ok: false, status: null, method: "GET", error: e.message };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(PLACES_DIR)) {
    console.error(`❌ Places directory not found: ${PLACES_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(PLACES_DIR)
    .filter((f) => f.endsWith(".places.json"))
    .filter((f) =>
      args.province ? f === `${args.province}.places.json` : true
    );

  if (files.length === 0) {
    console.error("❌ No matching places JSON files found.");
    process.exit(1);
  }

  const all = [];

  for (const file of files) {
    const fullPath = path.join(PLACES_DIR, file);
    const raw = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const places = normalizePlacesData(raw);

    for (const place of places) {
      const images = Array.isArray(place.images) ? place.images : [];
      for (const img of images) {
        all.push({
          file,
          slug: place.slug,
          name: place.name,
          url: img,
        });
      }
    }
  }

  const unique = new Map();
  for (const item of all) {
    if (typeof item.url !== "string" || !item.url.startsWith("http")) {
      unique.set(`${item.file}|${item.slug}|${item.url}`, {
        ...item,
        invalid: true,
      });
      continue;
    }
    // de-dupe by URL, but keep first origin info
    if (!unique.has(item.url)) unique.set(item.url, item);
  }

  const urls = Array.from(unique.values());
  console.log(`🖼️  Checking ${urls.length} unique image URLs...`);

  const concurrency = 10;
  let index = 0;
  let ok = 0;
  let fail = 0;

  const failures = [];

  async function worker() {
    while (index < urls.length) {
      const currentIndex = index++;
      const item = urls[currentIndex];

      if (item.invalid) {
        fail++;
        failures.push({
          ...item,
          ok: false,
          status: null,
          method: null,
          error: "Invalid URL",
        });
        continue;
      }

      const result = await checkUrl(item.url);
      if (result.ok) {
        ok++;
      } else {
        fail++;
        failures.push({ ...item, ...result });
      }

      if ((ok + fail) % 10 === 0 || ok + fail === urls.length) {
        process.stdout.write(
          `\rProgress: ${ok + fail}/${urls.length} checked...`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  process.stdout.write("\n");

  console.log(`✅ Reachable: ${ok}`);
  console.log(`❌ Failed:    ${fail}`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.slice(0, 50).forEach((f) => {
      const where =
        f.file && f.slug ? `${f.file} :: ${f.slug}` : f.file || "(unknown)";
      const extra = f.status
        ? `status=${f.status}`
        : f.error
        ? `error=${f.error}`
        : "";
      console.log(`- ${where} -> ${f.url} ${extra ? `(${extra})` : ""}`);
    });

    if (failures.length > 50) {
      console.log(`... plus ${failures.length - 50} more`);
    }

    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error("💥 FATAL:", err);
  process.exit(1);
});
