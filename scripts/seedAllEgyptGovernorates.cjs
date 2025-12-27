/**
 * Seed All Egypt Governorates Script
 * Idempotent seeder for provinces and places data
 * Run: node scripts/seedAllEgyptGovernorates.cjs
 */

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// ES6 __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Import models
import Province from "../src/models/Province.js";
import Place from "../src/models/Place.js";

// Configuration
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const DATA_DIR = path.join(__dirname, "..", "data");
const PLACES_DIR = path.join(DATA_DIR, "places_by_province");

// Stats tracking
const stats = {
  provinces: { created: 0, updated: 0, errors: [] },
  places: { created: 0, updated: 0, errors: [] },
  sources: [],
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  if (!MONGO_URI) {
    console.error("❌ ERROR: MONGO_URI environment variable is not set!");
    console.error("Please set MONGO_URI in your .env file");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");
    console.log(`   Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
}

/**
 * Ensure indexes exist
 */
async function ensureIndexes() {
  try {
    console.log("\n📊 Ensuring database indexes...");

    await Province.createIndexes();
    console.log("   ✓ Province indexes created");

    await Place.createIndexes();
    console.log(
      "   ✓ Place indexes created (including 2dsphere for geospatial queries)"
    );
  } catch (error) {
    console.error("   ❌ Error creating indexes:", error.message);
    throw error;
  }
}

/**
 * Validate coordinates
 */
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

  // Egypt-specific validation (rough bounding box)
  if (lng < 24 || lng > 37 || lat < 22 || lat > 32) {
    console.warn(
      `   ⚠️  Warning: Coordinates for ${placeName} are outside typical Egypt bounds`
    );
  }

  return null;
}

/**
 * Seed provinces
 */
async function seedProvinces() {
  console.log("\n🏛️  Seeding provinces...");

  const provincesFile = path.join(DATA_DIR, "eg_gov_provinces.json");

  if (!fs.existsSync(provincesFile)) {
    throw new Error(`Provinces data file not found: ${provincesFile}`);
  }

  const provincesData = JSON.parse(fs.readFileSync(provincesFile, "utf8"));
  console.log(`   Found ${provincesData.length} provinces to seed`);

  for (const provinceData of provincesData) {
    try {
      // Validate coordinates if present
      if (provinceData.location && provinceData.location.coordinates) {
        const error = validateCoordinates(
          provinceData.location.coordinates,
          provinceData.name
        );
        if (error) {
          stats.provinces.errors.push({ name: provinceData.name, error });
          console.error(`   ❌ ${error}`);
          continue;
        }
      }

      const result = await Province.findOneAndUpdate(
        { slug: provinceData.slug },
        provinceData,
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );

      if (result.isNew || result.__v === 0) {
        stats.provinces.created++;
        console.log(
          `   ✓ Created: ${provinceData.name} (${provinceData.slug})`
        );
      } else {
        stats.provinces.updated++;
        console.log(
          `   ↻ Updated: ${provinceData.name} (${provinceData.slug})`
        );
      }
    } catch (error) {
      stats.provinces.errors.push({
        name: provinceData.name,
        error: error.message,
      });
      console.error(`   ❌ Error seeding ${provinceData.name}:`, error.message);
    }
  }
}

/**
 * Seed places for a province
 */
async function seedPlacesForProvince(provinceName, provinceSlug) {
  const placesFile = path.join(PLACES_DIR, `${provinceSlug}.places.json`);

  if (!fs.existsSync(placesFile)) {
    console.warn(
      `   ⚠️  No places file found for ${provinceName}: ${placesFile}`
    );
    return;
  }

  const placesRaw = JSON.parse(fs.readFileSync(placesFile, "utf8"));

  const placesData = normalizePlacesData(placesRaw, provinceName);
  if (!Array.isArray(placesData) || placesData.length === 0) {
    console.warn(
      `   ⚠️  Places file for ${provinceName} had no seedable places (expected an array or grouped object): ${placesFile}`
    );
    return;
  }

  // Get province ID
  const province = await Province.findOne({ slug: provinceSlug });
  if (!province) {
    console.error(`   ❌ Province not found: ${provinceSlug}`);
    return;
  }

  for (const placeData of placesData) {
    try {
      // Validate coordinates
      if (placeData.location && placeData.location.coordinates) {
        const error = validateCoordinates(
          placeData.location.coordinates,
          placeData.name
        );
        if (error) {
          stats.places.errors.push({
            name: placeData.name,
            province: provinceName,
            error,
          });
          console.error(`      ❌ ${error}`);
          continue;
        }
      }

      // Add province reference
      const placeWithProvince = {
        ...placeData,
        province: province._id,
      };

      const result = await Place.findOneAndUpdate(
        { slug: placeData.slug },
        placeWithProvince,
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );

      if (result.isNew || result.__v === 0) {
        stats.places.created++;
      } else {
        stats.places.updated++;
      }

      // Collect sources
      if (placeData.sources && Array.isArray(placeData.sources)) {
        stats.sources.push({
          place: placeData.name,
          slug: placeData.slug,
          province: provinceName,
          type: placeData.type,
          sources: placeData.sources,
        });
      }
    } catch (error) {
      stats.places.errors.push({
        name: placeData.name,
        province: provinceName,
        error: error.message,
      });
      console.error(`      ❌ Error seeding ${placeData.name}:`, error.message);
    }
  }
}

function normalizePlacesData(placesRaw, provinceName) {
  if (Array.isArray(placesRaw)) return placesRaw;

  if (!placesRaw || typeof placesRaw !== "object") return [];

  // Support grouped format:
  // { "Giza": { archaeological: [...], entertainment: [...], hotels: [...], events: [...] } }
  // or { archaeological: [...], entertainment: [...], ... }
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
      type: (item && item.type) || section,
    }));
  });
}

/**
 * Seed all places
 */
async function seedPlaces() {
  console.log("\n🎯 Seeding places...");

  if (!fs.existsSync(PLACES_DIR)) {
    throw new Error(`Places directory not found: ${PLACES_DIR}`);
  }

  const provinces = await Province.find().sort("name");
  console.log(`   Processing places for ${provinces.length} provinces`);

  for (const province of provinces) {
    console.log(`\n   📍 ${province.name}:`);
    await seedPlacesForProvince(province.name, province.slug);

    const count = await Place.countDocuments({ province: province._id });
    console.log(`      Total places: ${count}`);
  }
}

/**
 * Write sources.json file
 */
async function writeSources() {
  console.log("\n📝 Writing sources.json...");

  const sourcesFile = path.join(DATA_DIR, "sources.json");

  const sourcesData = {
    generated: new Date().toISOString(),
    description:
      "Data sources and citations for all places in the EGYGO tourism database",
    totalPlaces: stats.sources.length,
    sources: stats.sources,
  };

  fs.writeFileSync(sourcesFile, JSON.stringify(sourcesData, null, 2), "utf8");
  console.log(`   ✓ Sources file written: ${sourcesFile}`);
  console.log(`   ✓ Total citations: ${stats.sources.length}`);
}

/**
 * Print summary
 */
async function printSummary() {
  console.log("\n" + "=".repeat(60));
  console.log("📊 SEEDING SUMMARY");
  console.log("=".repeat(60));

  // Provinces
  console.log("\n🏛️  PROVINCES:");
  console.log(`   Created:  ${stats.provinces.created}`);
  console.log(`   Updated:  ${stats.provinces.updated}`);
  console.log(`   Errors:   ${stats.provinces.errors.length}`);
  console.log(
    `   Total:    ${stats.provinces.created + stats.provinces.updated}`
  );

  if (stats.provinces.errors.length > 0) {
    console.log("\n   Province Errors:");
    stats.provinces.errors.forEach((err) => {
      console.log(`      - ${err.name}: ${err.error}`);
    });
  }

  // Places
  console.log("\n🎯 PLACES:");
  console.log(`   Created:  ${stats.places.created}`);
  console.log(`   Updated:  ${stats.places.updated}`);
  console.log(`   Errors:   ${stats.places.errors.length}`);
  console.log(`   Total:    ${stats.places.created + stats.places.updated}`);

  if (stats.places.errors.length > 0) {
    console.log("\n   Place Errors (first 10):");
    stats.places.errors.slice(0, 10).forEach((err) => {
      console.log(`      - ${err.name} (${err.province}): ${err.error}`);
    });
    if (stats.places.errors.length > 10) {
      console.log(
        `      ... and ${stats.places.errors.length - 10} more errors`
      );
    }
  }

  // Database stats
  console.log("\n💾 DATABASE:");
  const provincesCount = await Province.countDocuments();
  const placesCount = await Place.countDocuments();
  const placesCount2dsphere = await Place.countDocuments({
    "location.coordinates": { $exists: true },
  });

  console.log(`   Total provinces in DB: ${provincesCount}`);
  console.log(`   Total places in DB:    ${placesCount}`);
  console.log(`   Places with coords:    ${placesCount2dsphere}`);

  // Type breakdown
  const typeStats = await Place.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log("\n   Places by type:");
  typeStats.forEach((stat) => {
    console.log(`      ${stat._id.padEnd(15)}: ${stat.count}`);
  });

  console.log("\n" + "=".repeat(60));

  // Final status
  const totalErrors =
    stats.provinces.errors.length + stats.places.errors.length;
  if (totalErrors > 0) {
    console.log(`\n⚠️  Completed with ${totalErrors} errors (see above)`);
    console.log("   Review errors and re-run if needed (script is idempotent)");
  } else {
    console.log("\n✅ Seeding completed successfully with no errors!");
  }

  console.log(
    `\n✨ Task 1 complete — seeded ${provincesCount} provinces and ${placesCount} places\n`
  );
}

/**
 * Main execution
 */
async function main() {
  console.log("🌍 EGYGO Egypt Governorates Seeder");
  console.log("=".repeat(60));

  try {
    await connectDB();
    await ensureIndexes();
    await seedProvinces();
    await seedPlaces();
    await writeSources();
    await printSummary();

    process.exit(0);
  } catch (error) {
    console.error("\n💥 FATAL ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
