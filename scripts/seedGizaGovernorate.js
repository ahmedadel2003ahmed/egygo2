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

async function seedGizaGovernorate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const gizaDataPath = path.join(
      __dirname,
      "../data/places_by_province/giza.places.json"
    );
    const gizaData = JSON.parse(fs.readFileSync(gizaDataPath, "utf-8"));

    const provinceData = {
      name: "Giza",
      slug: "giza",
      description: "Home to the iconic Giza Pyramids and Great Sphinx",
      coverImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/All_Gizah_Pyramids.jpg/1280px-All_Gizah_Pyramids.jpg",
      location: {
        type: "Point",
        coordinates: [31.2118, 30.0131],
      },
    };

    const province = await Province.findOneAndUpdate(
      { slug: "giza" },
      provinceData,
      { upsert: true, new: true }
    );

    console.log(`✓ Province seeded: ${province.name}`);

    let placesCount = 0;
    const sections = ["archaeological", "entertainment", "hotels", "events"];

    for (const section of sections) {
      const places = gizaData.Giza[section];

      for (const placeData of places) {
        const place = await Place.findOneAndUpdate(
          { slug: placeData.slug },
          {
            ...placeData,
            province: province._id,
          },
          { upsert: true, new: true }
        );
        placesCount++;
        console.log(`  ✓ ${section}: ${place.name}`);
      }
    }

    console.log(
      `\n✓ Successfully seeded ${placesCount} places for Giza governorate`
    );

    process.exit(0);
  } catch (error) {
    console.error("Error seeding Giza governorate:", error);
    process.exit(1);
  }
}

seedGizaGovernorate();
