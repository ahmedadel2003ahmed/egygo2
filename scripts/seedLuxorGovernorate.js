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

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected...");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

const seedLuxorGovernorate = async () => {
  await connectDB();

  try {
    const provinceName = "Luxor";
    const sections = ["archaeological", "entertainment", "hotels", "events"];

    let province = await Province.findOne({ name: provinceName });

    if (!province) {
      console.log(`Province ${provinceName} not found. Creating it...`);
      province = await Province.create({
        name: "Luxor",
        slug: "luxor",
        description: "Luxor, known as the 'World's Greatest Open-Air Museum', is home to the vast Karnak Temple Complex, the majestic Luxor Temple, and the royal tombs of the Valley of the Kings and Queens.",
        cardImage: "luxor_card.jpg",
        coverImage: "luxor_cover.jpg",
        sections: sections
      });
    } else {
        // Update sections if province exists
        province.sections = sections;
        await province.save();
        console.log(`Province ${provinceName} updated with new sections.`);
    }

    const placesPath = path.join(__dirname, "../data/places_by_province/luxor.places.json");
    const data = JSON.parse(fs.readFileSync(placesPath, "utf-8"));
    const luxorData = data.Luxor;

    for (const section of sections) {
      if (luxorData[section]) {
        for (const place of luxorData[section]) {
          const placeData = {
            ...place,
            province: province._id,
            location: {
              type: "Point",
              coordinates: place.coordinates
            }
          };
          delete placeData.coordinates;

          // Clean up fields based on type if necessary (optional, but good for consistency)
          if (placeData.type !== 'hotels') {
             delete placeData.stars;
             delete placeData.amenities;
          }
           if (placeData.type !== 'events') {
             delete placeData.eventDate;
          }

          await Place.findOneAndUpdate(
            { slug: place.slug },
            placeData,
            { upsert: true, new: true, runValidators: true }
          );
          console.log(`Seeded: ${place.name} (${section})`);
        }
      }
    }

    console.log("Seeding Luxor Governorate Completed Successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding Luxor:", error);
    process.exit(1);
  }
};

seedLuxorGovernorate();
