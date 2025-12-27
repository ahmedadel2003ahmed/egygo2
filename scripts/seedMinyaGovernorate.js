import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Province from "../src/models/Province.js";
import Place from "../src/models/Place.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function validatePlace(placeData) {
  const requiredFields = [
    "name",
    "slug",
    "type",
    "description",
    "images",
    "location",
  ];

  for (const field of requiredFields) {
    if (!placeData[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!Array.isArray(placeData.images) || placeData.images.length === 0) {
    throw new Error("Images must be a non-empty array");
  }

  if (!placeData.location || placeData.location.type !== "Point") {
    throw new Error("Location must be a GeoJSON Point");
  }

  if (
    !Array.isArray(placeData.location.coordinates) ||
    placeData.location.coordinates.length !== 2
  ) {
    throw new Error("Location coordinates must be [lng, lat]");
  }

  const [lng, lat] = placeData.location.coordinates;
  if (typeof lng !== "number" || typeof lat !== "number") {
    throw new Error("Location coordinates must be numbers");
  }

  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new Error("Location coordinates out of valid range");
  }

  const validTypes = ["archaeological", "entertainment", "hotels", "events"];
  if (!validTypes.includes(placeData.type)) {
    throw new Error(
      `Invalid type: ${placeData.type}. Must be one of: ${validTypes.join(
        ", "
      )}`
    );
  }
}

async function seedMinyaGovernorate() {
  try {
    const mongoUri =
      "mongodb+srv://kerolles:5QgSmXevROdOVf2J@cluster0.x5khqfy.mongodb.net/egygo2?retryWrites=true&w=majority";
    if (!mongoUri) {
      throw new Error("Missing MONGODB_URI (or MONGO_URI) in environment");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    console.log("Loading Minya places data...");
    const dataPath = path.join(
      __dirname,
      "..",
      "data",
      "places_by_province",
      "minya.places.json"
    );
    const placesData = JSON.parse(fs.readFileSync(dataPath, "utf8"));

    if (!placesData.Minya) {
      throw new Error('Invalid data format: expected top-level key "Minya"');
    }

    const province = await Province.findOne({ slug: "minya" });
    if (!province) {
      throw new Error(
        'Province "minya" not found in database. (Places-only seeding expects it to already exist.)'
      );
    }

    console.log(`Found province: ${province.name} (${province.slug})`);

    const categories = Object.keys(placesData.Minya);
    let totalPlaces = 0;
    let upserted = 0;

    for (const category of categories) {
      const places = placesData.Minya[category];

      if (!Array.isArray(places)) {
        console.warn(`Skipping non-array category: ${category}`);
        continue;
      }

      console.log(`\nSeeding ${places.length} places in category: ${category}`);
      totalPlaces += places.length;

      for (const placeData of places) {
        const enrichedPlaceData = {
          ...placeData,
          province: province._id,
          type: placeData.type || category,
        };

        validatePlace(enrichedPlaceData);

        await Place.findOneAndUpdate(
          { slug: enrichedPlaceData.slug },
          enrichedPlaceData,
          {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          }
        );

        upserted += 1;
      }
    }

    console.log(
      `\n✅ Minya seeding completed: ${upserted}/${totalPlaces} places upserted.`
    );
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => undefined);
    console.log("Disconnected from MongoDB");
  }
}

seedMinyaGovernorate();
