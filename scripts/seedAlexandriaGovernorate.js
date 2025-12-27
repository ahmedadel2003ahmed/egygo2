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

function validatePlace(placeData) {
  if (!placeData || typeof placeData !== "object")
    return "Place must be an object";

  const requiredStringFields = ["name", "slug", "type", "description"];
  for (const field of requiredStringFields) {
    if (
      typeof placeData[field] !== "string" ||
      placeData[field].trim().length === 0
    ) {
      return `Missing/invalid field '${field}' for place: ${
        placeData?.name || placeData?.slug || "(unknown)"
      }`;
    }
  }

  if (!Array.isArray(placeData.images) || placeData.images.length === 0) {
    return `Missing/invalid 'images' for place: ${placeData.name}`;
  }

  if (!placeData.location || placeData.location.type !== "Point") {
    return `Missing/invalid 'location.type' for place: ${placeData.name}`;
  }

  const coords = placeData.location.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) {
    return `Missing/invalid 'location.coordinates' for place: ${placeData.name}`;
  }

  const [lng, lat] = coords;
  if (typeof lng !== "number" || typeof lat !== "number") {
    return `Coordinates must be numbers for place: ${placeData.name}`;
  }

  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return `Coordinates out of range for place: ${placeData.name}`;
  }

  const validTypes = ["archaeological", "entertainment", "hotels", "events"];
  if (!validTypes.includes(placeData.type)) {
    return `Invalid 'type' for place: ${placeData.name} (${placeData.type})`;
  }

  return null;
}

async function seedAlexandriaGovernorate() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error("❌ MONGO_URI (or MONGODB_URI) is not set");
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const alexandriaDataPath = path.join(
      __dirname,
      "../data/places_by_province/alexandria.places.json"
    );
    const alexandriaData = JSON.parse(
      fs.readFileSync(alexandriaDataPath, "utf-8")
    );

    // Ensure same structure as giza.places.json: { "Alexandria": { archaeological: [...], entertainment: [...], hotels: [...], events: [...] } }
    if (
      !alexandriaData ||
      typeof alexandriaData !== "object" ||
      !alexandriaData.Alexandria
    ) {
      console.error(
        "❌ Invalid Alexandria JSON structure: expected top-level key 'Alexandria'"
      );
      process.exit(1);
    }

    const sections = ["archaeological", "entertainment", "hotels", "events"];
    for (const section of sections) {
      if (!Array.isArray(alexandriaData.Alexandria[section])) {
        console.error(
          `❌ Invalid Alexandria JSON structure: Alexandria.${section} must be an array`
        );
        process.exit(1);
      }
    }

    // IMPORTANT: do NOT seed/update province (assumed already in DB)
    const province = await Province.findOne({ slug: "alexandria" });
    if (!province) {
      console.error("❌ Province not found in DB: alexandria");
      console.error(
        "   Please confirm Alexandria province exists (slug: 'alexandria')."
      );
      process.exit(1);
    }

    console.log(
      `✓ Using existing province: ${province.name} (${province.slug})`
    );

    let placesCount = 0;
    let validationErrors = 0;

    for (const section of sections) {
      const places = alexandriaData.Alexandria[section];

      for (const placeData of places) {
        const normalized = {
          ...placeData,
          type: placeData.type || section,
        };

        const err = validatePlace(normalized);
        if (err) {
          validationErrors++;
          console.error(`  ❌ ${section}: ${err}`);
          continue;
        }

        const place = await Place.findOneAndUpdate(
          { slug: normalized.slug },
          {
            ...normalized,
            province: province._id,
          },
          {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          }
        );

        placesCount++;
        console.log(`  ✓ ${section}: ${place.name}`);
      }
    }

    if (validationErrors > 0) {
      console.log(
        `\n⚠️ Completed with ${validationErrors} validation errors (see above).`
      );
    }

    console.log(
      `\n✓ Successfully seeded/updated ${placesCount} places for Alexandria`
    );

    process.exit(0);
  } catch (error) {
    console.error("Error seeding Alexandria governorate:", error);
    process.exit(1);
  }
}

seedAlexandriaGovernorate();
