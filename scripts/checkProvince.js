import mongoose from "mongoose";
import dotenv from "dotenv";
import Province from "../src/models/Province.js";

dotenv.config();

async function checkProvince() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const province = await Province.findOne({ slug: "giza" }).lean();

    if (province) {
      console.log("\nProvince found:");
      console.log("Name:", province.name);
      console.log("Slug:", province.slug);
      console.log("Has coverImage:", !!province.coverImage);
      console.log("coverImage value:", province.coverImage);
      console.log("\nFull province data:", JSON.stringify(province, null, 2));
    } else {
      console.log("Province not found");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkProvince();
