import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer backend/.env (this repo uses backend/.env), fall back to repo-root .env.
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const DATA_DIR = path.join(__dirname, "..", "data", "places_by_province");
const SECTIONS = ["archaeological", "entertainment", "hotels", "events"];

function parseArgs(argv) {
  const args = {
    province: null,
    dryRun: false,
    folder: "egygo/places",
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--province" && argv[i + 1]) {
      args.province = String(argv[i + 1])
        .trim()
        .toLowerCase();
      i++;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--folder" && argv[i + 1]) {
      args.folder = String(argv[i + 1])
        .trim()
        .replace(/\\/g, "/");
      i++;
      continue;
    }
  }

  return args;
}

function ensureCloudinaryConfigured() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.error("❌ Missing Cloudinary credentials.");
    console.error("Set these in your .env:");
    console.error("- CLOUDINARY_CLOUD_NAME");
    console.error("- CLOUDINARY_API_KEY");
    console.error("- CLOUDINARY_API_SECRET");
    process.exit(1);
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

function normalizeGroupedRoot(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (Array.isArray(raw)) return null;

  // Supports:
  // { "Cairo": { ...sections } }
  // { archaeological: [...], ... }
  const keys = Object.keys(raw);
  if (SECTIONS.some((s) => Array.isArray(raw?.[s]))) {
    return { provinceName: null, grouped: raw };
  }

  if (keys.length === 1 && raw[keys[0]] && typeof raw[keys[0]] === "object") {
    return { provinceName: keys[0], grouped: raw[keys[0]] };
  }

  return null;
}

async function checkUrl(url) {
  const common = {
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      "User-Agent": "EGYGO-image-fixer/1.0",
      "Api-User-Agent": "EGYGO-image-fixer/1.0",
      Accept: "image/*,*/*;q=0.8",
    },
  };

  try {
    const res = await axios.head(url, common);
    if (res.status >= 200 && res.status < 400)
      return { ok: true, status: res.status, method: "HEAD" };
    // fall through to GET
  } catch {
    // fall through
  }

  try {
    const res = await axios.get(url, {
      ...common,
      responseType: "arraybuffer",
      headers: {
        ...common.headers,
        Range: "bytes=0-0",
      },
    });

    if (res.status >= 200 && res.status < 400)
      return { ok: true, status: res.status, method: "GET" };
    return { ok: false, status: res.status, method: "GET" };
  } catch (e) {
    return {
      ok: false,
      status: null,
      method: "GET",
      error: e?.message || String(e),
    };
  }
}

function extractWikipediaTitle(pageUrl) {
  try {
    const u = new URL(pageUrl);
    if (!u.hostname.endsWith("wikipedia.org")) return null;
    if (!u.pathname.startsWith("/wiki/")) return null;
    const rawTitle = u.pathname.slice("/wiki/".length);
    if (!rawTitle) return null;
    return decodeURIComponent(rawTitle);
  } catch {
    return null;
  }
}

async function getWikipediaSummaryImage(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title
  )}`;
  const res = await axios.get(url, {
    timeout: 15000,
    maxRedirects: 3,
    validateStatus: () => true,
    headers: {
      "User-Agent": "EGYGO-image-fixer/1.0",
      "Api-User-Agent": "EGYGO-image-fixer/1.0",
      Accept: "application/json,*/*;q=0.8",
    },
  });

  if (res.status < 200 || res.status >= 300) return null;
  const data = res.data;
  const candidate = data?.originalimage?.source || data?.thumbnail?.source;
  if (typeof candidate === "string" && candidate.startsWith("http"))
    return candidate;
  return null;
}

function extractOgImageFromHtml(html) {
  if (typeof html !== "string") return null;

  const patterns = [
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']\s*\/?\s*>/i,
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']\s*\/?\s*>/i,
    /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']\s*\/?\s*>/i,
    /<meta\s+content=["']([^"']+)["']\s+name=["']twitter:image["']\s*\/?\s*>/i,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    const url = m[1];
    if (!url) continue;
    if (url.startsWith("//")) return `https:${url}`;
    return url;
  }

  return null;
}

function extractFirstImageUrlFromHtml(html) {
  if (typeof html !== "string") return null;

  const candidates = [];
  const re =
    /(?:https?:)?\/\/[^\"'\s>]+\.(?:jpg|jpeg|png|webp|svg)(?:\?[^\"'\s>]*)?/gi;
  for (const m of html.matchAll(re)) {
    let url = m[0];
    if (!url) continue;
    if (url.startsWith("//")) url = `https:${url}`;
    candidates.push(url);
    if (candidates.length >= 50) break;
  }

  const banned = [
    "OOjs_UI_icon",
    "Symbol_category_class",
    "Wikisource-logo",
    "Lock-green",
    "Lock-gray",
    "Lock-red",
  ];

  for (const url of candidates) {
    // Try HEAD first (fast), then fallback to GET. Many hosts return misleading
    // statuses for HEAD (or block it entirely), so we don't early-return on HEAD failure.
    if (banned.some((b) => url.includes(b))) continue;
    return url;
  }

  // Fall back to the first candidate (even if small/icon) if that's all we found.
  return candidates[0] || null;
}

async function getHtml(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Api-User-Agent": "EGYGO-image-fixer/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (res.status < 200 || res.status >= 300) return null;
  return typeof res.data === "string" ? res.data : null;
}

async function findFallbackImageUrl(place) {
  const candidatePages = [];

  if (Array.isArray(place?.sources)) {
    for (const s of place.sources) {
      if (typeof s === "string" && s.startsWith("http")) candidatePages.push(s);
    }
  }

  if (typeof place?.website === "string" && place.website.startsWith("http")) {
    candidatePages.push(place.website);
  }

  for (const pageUrl of candidatePages) {
    const wikiTitle = extractWikipediaTitle(pageUrl);
    if (wikiTitle) {
      try {
        const fromSummary = await getWikipediaSummaryImage(wikiTitle);
        if (fromSummary) {
          const ok = await checkUrl(fromSummary);
          if (ok.ok) return fromSummary;
        }
      } catch {
        // ignore
      }
    }

    try {
      const html = await getHtml(pageUrl);
      if (!html) continue;
      const ogImage = extractOgImageFromHtml(html);
      if (ogImage && typeof ogImage === "string") {
        const ok = await checkUrl(ogImage);
        if (ok.ok) return ogImage;
      }

      const anyImage = extractFirstImageUrlFromHtml(html);
      if (anyImage && typeof anyImage === "string") {
        const ok = await checkUrl(anyImage);
        if (ok.ok) return anyImage;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

async function uploadToCloudinary(imageUrl, { folder, publicId }) {
  const result = await cloudinary.uploader.upload(imageUrl, {
    folder,
    public_id: publicId,
    overwrite: true,
    resource_type: "image",
  });

  return result?.secure_url || null;
}

async function processFile(filePath, { folderBase, dryRun }) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const normalized = normalizeGroupedRoot(raw);

  if (!normalized) {
    console.warn(`⚠️  Unsupported JSON structure: ${path.basename(filePath)}`);
    return { changed: false, processedPlaces: 0, fixedPlaces: 0 };
  }

  const { provinceName, grouped } = normalized;

  let processedPlaces = 0;
  let fixedPlaces = 0;
  let changed = false;

  for (const section of SECTIONS) {
    const items = Array.isArray(grouped?.[section]) ? grouped[section] : [];

    for (const place of items) {
      processedPlaces++;

      const images = Array.isArray(place.images) ? place.images : [];
      const checks = await Promise.all(
        images.map(async (url) => ({ url, ...(await checkUrl(url)) }))
      );

      const broken = checks.filter((c) => !c.ok);
      if (broken.length === 0) continue;

      const firstReachable = checks.find((c) => c.ok)?.url || null;
      let uploadSource = firstReachable;

      if (!uploadSource) {
        uploadSource = await findFallbackImageUrl(place);
      }

      if (!uploadSource) {
        console.warn(
          `❌ No usable image source for ${path.basename(filePath)} :: ${
            place.slug
          } (${place.name})`
        );
        continue;
      }

      const provinceSlug = path
        .basename(filePath)
        .replace(/\.places\.json$/i, "");
      const folder = `${folderBase}/${provinceSlug}`;

      if (dryRun) {
        console.log(
          `DRY-RUN: Would upload and replace broken images for ${provinceSlug} :: ${place.slug} using ${uploadSource}`
        );
        continue;
      }

      const cloudUrl = await uploadToCloudinary(uploadSource, {
        folder,
        publicId: place.slug,
      });

      if (!cloudUrl) {
        console.warn(`❌ Cloudinary upload failed for ${place.slug}`);
        continue;
      }

      // Replace only the broken URLs; keep the good ones.
      const newImages = checks.map((c) => (c.ok ? c.url : cloudUrl));
      // Ensure at least one image exists.
      place.images = newImages.length > 0 ? newImages : [cloudUrl];

      fixedPlaces++;
      changed = true;
      console.log(
        `✅ Fixed images: ${provinceSlug} :: ${place.slug} -> ${cloudUrl}`
      );
    }
  }

  if (!dryRun && changed) {
    const updatedRoot = provinceName ? { [provinceName]: grouped } : grouped;
    fs.writeFileSync(
      filePath,
      JSON.stringify(updatedRoot, null, 2) + "\n",
      "utf8"
    );
  }

  return { changed, processedPlaces, fixedPlaces };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ Places directory not found: ${DATA_DIR}`);
    process.exit(1);
  }

  ensureCloudinaryConfigured();

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".places.json"))
    .filter((f) =>
      args.province ? f === `${args.province}.places.json` : true
    );

  if (files.length === 0) {
    console.error("❌ No matching places JSON files found.");
    process.exit(1);
  }

  let changedFiles = 0;
  let totalPlaces = 0;
  let totalFixed = 0;

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    console.log(`\n📄 Processing ${file}...`);

    const res = await processFile(filePath, {
      folderBase: args.folder,
      dryRun: args.dryRun,
    });

    totalPlaces += res.processedPlaces;
    totalFixed += res.fixedPlaces;
    if (res.changed) changedFiles++;
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Places scanned:  ${totalPlaces}`);
  console.log(`Places fixed:   ${totalFixed}`);
  console.log(`Files changed:  ${changedFiles}`);
  console.log(`Mode:          ${args.dryRun ? "DRY-RUN" : "WRITE"}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("💥 FATAL:", err);
  process.exit(1);
});
