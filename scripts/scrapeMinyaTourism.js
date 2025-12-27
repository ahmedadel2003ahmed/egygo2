import { load } from "cheerio";

const BASE_URL = "https://tourism.minya.gov.eg";

function normalizeWhitespace(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function stripInvisible(text) {
  return normalizeWhitespace(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function splitIntoSentences(text) {
  const cleaned = stripInvisible(text);
  if (!cleaned) return [];
  // Simple sentence splitter that works OK for English/Arabic-mixed content.
  return cleaned
    .split(/(?<=[.!?\u061F])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clamp(text, maxLen) {
  const t = stripInvisible(text);
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1).trimEnd() + "…";
}

function slugify(input) {
  return stripInvisible(input)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function ensureUniqueSlug(baseSlug, used) {
  let slug = baseSlug;
  let i = 2;
  while (used.has(slug) || !slug) {
    slug = `${baseSlug}-${i}`;
    i += 1;
  }
  used.add(slug);
  return slug;
}

function absolutizeUrl(url) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
    return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${BASE_URL}${trimmed}`;
  return `${BASE_URL}/${trimmed}`;
}

function isProbablyImageUrl(url) {
  return /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(url);
}

function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (!v) continue;
    const key = v.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function extractFirstNumber(text) {
  const t = stripInvisible(text);
  if (!t) return null;
  if (
    /\bfree\b/i.test(t) ||
    /\bno\s*fees\b/i.test(t) ||
    /\bwithout\s*charge\b/i.test(t)
  )
    return 0;
  // Arabic for free: "مجانا" or "مجاناً"
  if (/مجان[اأ]ً?/i.test(t)) return 0;
  const match = t.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

function extractCoordinatesFromUrl(url) {
  if (!url) return null;
  const decoded = decodeURIComponent(url);

  // @lat,lng
  let m = decoded.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  // q=lat,lng or query=lat,lng or destination=lat,lng
  m = decoded.match(
    /(?:[?&](?:q|query|destination|daddr|ll|center)=)(-?\d+\.\d+),\s*(-?\d+\.\d+)/
  );
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  // query=place_id:... won't help.

  // (lat,lng) in path (rare)
  m = decoded.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  return null;
}

async function fetchHtml(path) {
  const candidates = path.endsWith("/") ? [path] : [path, `${path}/`];
  let lastErr = null;
  for (const p of candidates) {
    const url = `${BASE_URL}${p.startsWith("/") ? p : `/${p}`}`;
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; egygo-scraper/1.0)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        continue;
      }
      const html = await res.text();
      // Basic guard: avoid generic 404 pages.
      if (!html || html.length < 200) {
        lastErr = new Error(`Empty HTML for ${url}`);
        continue;
      }
      return { url, html };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`Failed to fetch ${path}`);
}

function pickBestDescription($) {
  // Prefer main content paragraphs.
  const candidates = [];

  // Common patterns: first paragraph under main/section
  $("main p, article p, .content p, .entry-content p, .container p")
    .slice(0, 6)
    .each((_, el) => {
      const t = stripInvisible($(el).text());
      if (t && t.length >= 40) candidates.push(t);
    });

  // Fallback: any paragraph
  $("p")
    .slice(0, 10)
    .each((_, el) => {
      const t = stripInvisible($(el).text());
      if (t && t.length >= 40) candidates.push(t);
    });

  const best = candidates.sort((a, b) => b.length - a.length)[0] || "";
  const sentences = splitIntoSentences(best);
  if (sentences.length >= 2) return `${sentences[0]} ${sentences[1]}`;
  if (sentences.length === 1) return sentences[0];
  return clamp(best, 240);
}

function extractKeyValueFacts($) {
  // Try to read label/value lists and definition lists.
  const facts = new Map();

  // dl dt/dd
  $("dl")
    .find("dt")
    .each((_, dt) => {
      const label = stripInvisible($(dt).text()).toLowerCase();
      const dd = $(dt).next("dd");
      const value = stripInvisible(dd.text());
      if (label && value) facts.set(label, value);
    });

  // list items with colon
  $("li")
    .slice(0, 200)
    .each((_, li) => {
      const t = stripInvisible($(li).text());
      const m = t.match(/^(.{2,40}?):\s*(.{2,200})$/);
      if (!m) return;
      const label = stripInvisible(m[1]).toLowerCase();
      const value = stripInvisible(m[2]);
      if (label && value) facts.set(label, value);
    });

  // Strong label in a row, then value
  $("p, div")
    .slice(0, 200)
    .each((_, node) => {
      const strong = $(node).find("strong").first();
      if (!strong.length) return;
      const label = stripInvisible(strong.text())
        .replace(/:$/, "")
        .toLowerCase();
      const full = stripInvisible($(node).text());
      const value = stripInvisible(
        full.replace(strong.text(), "").replace(/^:\s*/, "")
      );
      if (label && value && label.length <= 40 && value.length <= 200)
        facts.set(label, value);
    });

  return facts;
}

function extractImages($) {
  const urls = [];

  // hero images
  $("img")
    .slice(0, 200)
    .each((_, img) => {
      const $img = $(img);
      const src =
        $img.attr("data-src") ||
        $img.attr("data-lazy-src") ||
        $img.attr("src") ||
        $img.attr("data-original");
      const abs = absolutizeUrl(src);
      if (!abs) return;
      if (!isProbablyImageUrl(abs) && !/wp-content|uploads|images\//i.test(abs))
        return;
      urls.push(abs);
    });

  // background images in style attributes
  $("[style]")
    .slice(0, 200)
    .each((_, el) => {
      const style = $(el).attr("style") || "";
      const m = style.match(/url\(("|')?(.*?)\1\)/i);
      if (!m) return;
      const abs = absolutizeUrl(m[2]);
      if (!abs) return;
      if (!isProbablyImageUrl(abs) && !/wp-content|uploads|images\//i.test(abs))
        return;
      urls.push(abs);
    });

  return uniq(urls).slice(0, 3);
}

function extractCoordinates($) {
  const hrefs = [];
  $("a[href]")
    .slice(0, 400)
    .each((_, a) => {
      const href = $(a).attr("href");
      if (!href) return;
      if (/google\.(com|maps)/i.test(href) || /goo\.gl\/maps/i.test(href))
        hrefs.push(href);
    });

  $("iframe[src]")
    .slice(0, 50)
    .each((_, iframe) => {
      const src = $(iframe).attr("src");
      if (!src) return;
      if (/google\.(com|maps)/i.test(src)) hrefs.push(src);
    });

  for (const href of hrefs) {
    const coords = extractCoordinatesFromUrl(href);
    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
      return { type: "Point", coordinates: [coords.lng, coords.lat] };
    }
  }

  return null;
}

function extractContact($) {
  const out = { phone: null, email: null, website: null };

  // mailto/tel
  $("a[href^='tel:']").each((_, a) => {
    if (out.phone) return;
    out.phone = stripInvisible($(a).attr("href")?.replace(/^tel:/, ""));
  });

  $("a[href^='mailto:']").each((_, a) => {
    if (out.email) return;
    out.email = stripInvisible(
      $(a)
        .attr("href")
        ?.replace(/^mailto:/, "")
    );
  });

  // website: first external link on page (excluding maps)
  $("a[href]")
    .slice(0, 300)
    .each((_, a) => {
      if (out.website) return;
      const href = $(a).attr("href");
      if (!href) return;
      if (!/^https?:\/\//i.test(href)) return;
      if (/tourism\.minya\.gov\.eg/i.test(href)) return;
      if (/google\.(com|maps)/i.test(href)) return;
      out.website = href;
    });

  return out;
}

function extractTags($, name, kind) {
  const tags = new Set();
  const add = (t) => {
    const s = slugify(t);
    if (s) tags.add(s);
  };

  // badges/labels
  $(".badge, .tag, .category, .categories a, .post-categories a")
    .slice(0, 30)
    .each((_, el) => add($(el).text()));

  // keyword-based tags
  const lower = stripInvisible(name).toLowerCase();
  if (/museum/.test(lower)) add("museum");
  if (/monaster|church|mosque|temple|relig/i.test(lower)) add("religious");
  if (/tomb|necropolis|catacomb/i.test(lower)) add("tombs");
  if (/nile|corniche|park|garden|island|scenic|view/i.test(lower))
    add("scenic");
  if (/palace|fort|castle/i.test(lower)) add("historic");

  if (kind === "service") {
    add("service");
  }

  return Array.from(tags);
}

function classifyAttractionType(name, tags) {
  const lower = stripInvisible(name).toLowerCase();
  const leisure =
    /corniche|park|garden|island|nile|scenic|view|promenade|resort/i.test(
      lower
    ) ||
    tags.includes("scenic") ||
    tags.includes("park") ||
    tags.includes("garden");
  return leisure ? "entertainment" : "archaeological";
}

function extractAmenities($) {
  const amenities = [];

  // try lists under headings that contain "Amenities" or Arabic equivalents
  const headings = $("h1, h2, h3, h4, h5").toArray();
  for (const h of headings) {
    const title = stripInvisible($(h).text()).toLowerCase();
    if (!title) continue;
    if (!/amenit|facilit|services|\u062e\u062f\u0645\u0627\u062a/i.test(title))
      continue;
    const list = $(h).nextAll("ul, ol").first();
    if (!list.length) continue;
    list
      .find("li")
      .slice(0, 20)
      .each((_, li) => {
        const t = stripInvisible($(li).text());
        if (t && t.length <= 60) amenities.push(t);
      });
    break;
  }

  return uniq(amenities);
}

function coerceShortDescription(description, name) {
  const s = description || name || "";
  const sentences = splitIntoSentences(s);
  const first = sentences[0] || s;
  return clamp(first, 120);
}

function buildPlaceFromPage({ kind, sourceUrl, html, slugSuffix }) {
  const $ = load(html);
  const name =
    stripInvisible($("h1").first().text()) ||
    stripInvisible(
      $("title")
        .text()
        .replace(/\s*\|\s*.*$/, "")
    ) ||
    null;

  if (!name) return { place: null, issues: ["missing-name"] };

  const location = extractCoordinates($);
  const images = extractImages($);
  const facts = extractKeyValueFacts($);
  const contact = extractContact($);
  const amenities = extractAmenities($);

  const description = pickBestDescription($);
  const shortDescription = coerceShortDescription(description, name);

  const tags = extractTags($, name, kind);

  let type = "archaeological";
  if (kind === "hotel") type = "hotels";
  if (kind === "service") type = "entertainment";
  if (kind === "attraction") type = classifyAttractionType(name, tags);

  // Fact extraction with flexible labels
  const findFact = (...needles) => {
    for (const n of needles) {
      const needle = n.toLowerCase();
      for (const [k, v] of facts.entries()) {
        if (k.includes(needle)) return v;
      }
    }
    return null;
  };

  const address =
    findFact("address", "location", "مكان", "العنوان") ||
    stripInvisible($(".address").first().text()) ||
    null;

  const openingHours =
    findFact(
      "opening",
      "hours",
      "working",
      "time",
      "\u0645\u0648\u0627\u0639\u064a\u062f"
    ) || null;
  const ticketRaw =
    findFact(
      "ticket",
      "price",
      "fees",
      "admission",
      "\u062a\u0630\u0643\u0631"
    ) || null;
  const ticketPrice = ticketRaw ? extractFirstNumber(ticketRaw) : null;

  const starsRaw =
    kind === "hotel" ? findFact("stars", "\u0646\u062c\u0648\u0645") : null;
  const starsNum = starsRaw ? extractFirstNumber(starsRaw) : null;

  const ratingRaw = findFact("rating") || null;
  const rating = ratingRaw ? extractFirstNumber(ratingRaw) : null;

  const reviewsRaw = findFact("reviews") || null;
  const reviewsCount = reviewsRaw ? extractFirstNumber(reviewsRaw) : null;

  const issues = [];
  if (!location) issues.push("missing-coordinates");
  if (!images || images.length === 0) issues.push("missing-image");

  const baseSlug = `${slugify(name)}${slugSuffix}`;

  const place = {
    name,
    slug: baseSlug, // unique-ified later
    type,
    description: clamp(description, 260),
    shortDescription,
    images,
    location,
    ...(address ? { address } : {}),
    ...(ticketPrice !== null ? { ticketPrice } : {}),
    ...(openingHours ? { openingHours: clamp(openingHours, 140) } : {}),
    ...(rating !== null ? { rating } : {}),
    ...(reviewsCount !== null ? { reviewsCount } : {}),
    ...(starsNum !== null ? { stars: starsNum } : {}),
    ...(contact.phone ? { phone: contact.phone } : {}),
    ...(contact.email ? { email: contact.email } : {}),
    ...(contact.website ? { website: contact.website } : {}),
    ...(amenities.length ? { amenities } : {}),
    tags,
    sources: [sourceUrl],
  };

  return { place, issues };
}

async function scrapeMinya() {
  const usedSlugs = new Set();

  const attractions = [];
  const entertainment = [];
  const hotels = [];
  const services = [];

  const skipped = [];

  // Attractions 1..23
  for (let id = 1; id <= 23; id += 1) {
    const path = `/attractions/${id}`;
    let fetched;
    try {
      fetched = await fetchHtml(path);
    } catch (e) {
      skipped.push({
        kind: "attraction",
        id,
        reason: `fetch-failed: ${String(e?.message || e)}`,
      });
      continue;
    }

    const { place, issues } = buildPlaceFromPage({
      kind: "attraction",
      sourceUrl: fetched.url,
      html: fetched.html,
      slugSuffix: "-minya",
    });

    if (!place) {
      skipped.push({ kind: "attraction", id, reason: "parse-failed" });
      continue;
    }

    place.slug = ensureUniqueSlug(place.slug, usedSlugs);

    if (issues.length) {
      skipped.push({
        kind: "attraction",
        id,
        name: place.name,
        reason: issues.join(","),
      });
      continue;
    }

    if (place.type === "entertainment") entertainment.push(place);
    else attractions.push(place);
  }

  // Hotels 1..17
  for (let id = 1; id <= 17; id += 1) {
    const path = `/hotels/${id}`;
    let fetched;
    try {
      fetched = await fetchHtml(path);
    } catch (e) {
      skipped.push({
        kind: "hotel",
        id,
        reason: `fetch-failed: ${String(e?.message || e)}`,
      });
      continue;
    }

    const { place, issues } = buildPlaceFromPage({
      kind: "hotel",
      sourceUrl: fetched.url,
      html: fetched.html,
      slugSuffix: "-hotel-minya",
    });

    if (!place) {
      skipped.push({ kind: "hotel", id, reason: "parse-failed" });
      continue;
    }

    place.slug = ensureUniqueSlug(place.slug, usedSlugs);

    if (issues.length) {
      skipped.push({
        kind: "hotel",
        id,
        name: place.name,
        reason: issues.join(","),
      });
      continue;
    }

    hotels.push(place);
  }

  // Featured Services (top ~5) from /services
  let servicesPage;
  try {
    servicesPage = await fetchHtml("/services");
  } catch (e) {
    skipped.push({
      kind: "service",
      id: null,
      reason: `services-page-fetch-failed: ${String(e?.message || e)}`,
    });
    servicesPage = null;
  }

  if (servicesPage) {
    const $ = load(servicesPage.html);

    // Locate a section containing "Featured Services"
    let featuredRoot = null;
    const headings = $("h1,h2,h3,h4").toArray();
    for (const h of headings) {
      const t = stripInvisible($(h).text()).toLowerCase();
      if (t.includes("featured") && t.includes("service")) {
        featuredRoot = $(h).parent();
        break;
      }
    }

    // Fallback: just parse first few service cards/links on page
    const linkSet = new Set();
    const serviceLinks = [];

    const scope =
      featuredRoot && featuredRoot.length ? featuredRoot : $("body");
    scope
      .find("a[href]")
      .slice(0, 400)
      .each((_, a) => {
        const href = $(a).attr("href");
        if (!href) return;
        if (!/^\/services\//.test(href)) return;
        const abs = absolutizeUrl(href);
        if (!abs || linkSet.has(abs)) return;
        linkSet.add(abs);
        serviceLinks.push(abs);
      });

    // take top ~5
    for (const link of serviceLinks.slice(0, 5)) {
      const path = link.replace(BASE_URL, "");
      let fetched;
      try {
        fetched = await fetchHtml(path);
      } catch (e) {
        skipped.push({
          kind: "service",
          id: path,
          reason: `fetch-failed: ${String(e?.message || e)}`,
        });
        continue;
      }

      const { place, issues } = buildPlaceFromPage({
        kind: "service",
        sourceUrl: fetched.url,
        html: fetched.html,
        slugSuffix: "-service-minya",
      });

      if (!place) {
        skipped.push({ kind: "service", id: path, reason: "parse-failed" });
        continue;
      }

      // Force tag "service" per requirement
      place.tags = uniq([...(place.tags || []), "service"]);

      place.slug = ensureUniqueSlug(place.slug, usedSlugs);

      if (issues.length) {
        skipped.push({
          kind: "service",
          id: path,
          name: place.name,
          reason: issues.join(","),
        });
        continue;
      }

      services.push(place);
    }
  }

  // Merge services into entertainment bucket
  entertainment.push(...services);

  return {
    grouped: {
      Minya: {
        archaeological: attractions,
        entertainment,
        hotels,
        events: [],
      },
    },
    skipped,
  };
}

async function main() {
  const { grouped, skipped } = await scrapeMinya();

  // Final validation: ensure every item has coords + >=1 image
  const invalid = [];
  for (const [type, arr] of Object.entries(grouped.Minya)) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (
        !item?.location?.coordinates ||
        item.location.coordinates.length !== 2
      )
        invalid.push({ type, name: item?.name, reason: "no-coordinates" });
      if (!item?.images?.length)
        invalid.push({ type, name: item?.name, reason: "no-images" });
    }
  }

  const fs = await import("node:fs/promises");
  const outPath = new URL(
    "../data/places_by_province/minya.places.json",
    import.meta.url
  );
  await fs.mkdir(new URL("../data/places_by_province/", import.meta.url), {
    recursive: true,
  });
  await fs.writeFile(outPath, JSON.stringify(grouped, null, 2) + "\n", "utf8");

  const reportPath = new URL(
    "../data/places_by_province/minya.scrape.report.json",
    import.meta.url
  );
  await fs.writeFile(
    reportPath,
    JSON.stringify({ skipped, invalid }, null, 2) + "\n",
    "utf8"
  );

  const counts = {
    archaeological: grouped.Minya.archaeological.length,
    entertainment: grouped.Minya.entertainment.length,
    hotels: grouped.Minya.hotels.length,
    events: grouped.Minya.events.length,
    skipped: skipped.length,
    invalid: invalid.length,
  };

  console.log(
    JSON.stringify(
      { counts, outFile: outPath.pathname, reportFile: reportPath.pathname },
      null,
      2
    )
  );
  if (invalid.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
