/**
 * Seed Cairo places only (does NOT seed provinces).
 *
 * Requires:
 * - MONGO_URI (or MONGODB_URI) in backend/.env
 * - Cairo province already exists in DB with slug: "cairo"
 *
 * Run:
 *   node scripts/seedCairoPlacesOnly.js
 */

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import Province from "../src/models/Province.js";
import Place from "../src/models/Place.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const DATA_DIR = path.join(__dirname, "..", "data");
const PLACES_DIR = path.join(DATA_DIR, "places_by_province");

function validateCoordinates(coordinates, placeName) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return `Invalid coordinates format for ${placeName}`;
  }

  const [lng, lat] = coordinates;

  if (typeof lng !== "number" || typeof lat !== "number") {
    return `Coordinates must be numbers for ${placeName}`;
  }

  if (lng < -180 || lng > 180) {
    return `Longitude out of range (-180 to 180) for ${placeName}: ${lng}`;
  }

  if (lat < -90 || lat > 90) {
    return `Latitude out of range (-90 to 90) for ${placeName}: ${lat}`;
  }

  return null;
}

function normalizePlacesData(placesRaw, provinceName) {
  if (Array.isArray(placesRaw)) return placesRaw;
  if (!placesRaw || typeof placesRaw !== "object") return [];

  const sections = ["archaeological", "entertainment", "hotels", "events"];

  let grouped = placesRaw;
  if (Object.prototype.hasOwnProperty.call(placesRaw, provinceName)) {
    grouped = placesRaw[provinceName];
  } else {
    const keys = Object.keys(placesRaw);
    if (keys.length === 1 && typeof placesRaw[keys[0]] === "object") {
      grouped = placesRaw[keys[0]];
    }
  }

  if (!grouped || typeof grouped !== "object") return [];

  const isGrouped = sections.some((section) => Array.isArray(grouped[section]));
  if (!isGrouped) return [];

  return sections.flatMap((section) => {
    const items = Array.isArray(grouped[section]) ? grouped[section] : [];
    return items.map((item) => ({
      ...item,
      type: item?.type || section,
    }));
  });
}

async function main() {
  if (!MONGO_URI) {
    console.error("❌ ERROR: MONGO_URI environment variable is not set!");
    process.exit(1);
  }

  const provinceSlug = "cairo";
  const provinceName = "Cairo";
  const placesFile = path.join(PLACES_DIR, `${provinceSlug}.places.json`);

  if (!fs.existsSync(placesFile)) {
    console.error(`❌ Places file not found: ${placesFile}`);
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  const province = await Province.findOne({ slug: provinceSlug });
  if (!province) {
    console.error(`❌ Province not found in DB: ${provinceSlug}`);
    console.error(
      "   You said provinces are already seeded; please confirm Cairo exists."
    );
    process.exit(1);
  }

  const placesRaw = JSON.parse(fs.readFileSync(placesFile, "utf8"));
  const places = normalizePlacesData(placesRaw, provinceName);

  if (places.length === 0) {
    console.error(`❌ No seedable places found in: ${placesFile}`);
    process.exit(1);
  }

  console.log(`\n🎯 Seeding Cairo places only (${places.length} records)...`);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const placeData of places) {
    try {
      const coordErr =
        placeData.location && placeData.location.coordinates
          ? validateCoordinates(placeData.location.coordinates, placeData.name)
          : `Missing coordinates for ${placeData.name}`;

      if (coordErr) {
        errors++;
        console.error(`   ❌ ${coordErr}`);
        continue;
      }

      const payload = {
        ...placeData,
        province: province._id,
      };

      const result = await Place.findOneAndUpdate(
        { slug: placeData.slug },
        payload,
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );

      // Heuristic: treat as created if document version is 0 right after upsert
      if (result && result.__v === 0) created++;
      else updated++;

      console.log(`   ✓ ${placeData.type}: ${placeData.name}`);
    } catch (e) {
      errors++;
      console.error(`   ❌ Error seeding ${placeData.name}: ${e.message}`);
    }
  }

  const totalInDb = await Place.countDocuments({ province: province._id });

  console.log("\n" + "=".repeat(60));
  console.log("📊 CAIRO PLACES SEED SUMMARY");
  console.log("=".repeat(60));
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors:  ${errors}`);
  console.log(`Total Cairo places in DB: ${totalInDb}`);
  console.log("=".repeat(60) + "\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("💥 FATAL:", err);
  process.exit(1);
});
