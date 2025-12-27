import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import Place from "../src/models/Place.js";

// ⬇️ مهم جدًا
dotenv.config({
  path: path.resolve(process.cwd(), "../.env"),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadPlaceImages() {
  try {
    // Verify Cloudinary configuration
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      console.error(
        "❌ ERROR: Cloudinary credentials are missing in .env file"
      );
      console.error(
        "Required variables: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
      );
      process.exit(1);
    }
    console.log("✓ Cloudinary configured:", process.env.CLOUDINARY_CLOUD_NAME);

    await mongoose.connect(
      "mongodb+srv://kerolles:5QgSmXevROdOVf2J@cluster0.x5khqfy.mongodb.net/egygo2?retryWrites=true&w=majority"
    );
    console.log("✓ Connected to MongoDB\n");

    const baseDir = path.join(__dirname, "../data/places/giza/Events");

    if (!fs.existsSync(baseDir)) {
      console.error("Base directory does not exist:", baseDir);
      process.exit(1);
    }

    const folders = fs.readdirSync(baseDir);
    let successCount = 0;
    let skipCount = 0;

    for (const folder of folders) {
      const folderPath = path.join(baseDir, folder);

      if (!fs.statSync(folderPath).isDirectory()) {
        continue;
      }

      // Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(folder)) {
        console.log(`❌ SKIP: ${folder} - Invalid ObjectId`);
        skipCount++;
        continue;
      }

      const placeId = folder;

      // Check if place exists in database
      const place = await Place.findById(placeId);
      if (!place) {
        console.log(`❌ SKIP: ${placeId} - Place not found in database`);
        skipCount++;
        continue;
      }

      // Get all image files from folder
      const files = fs.readdirSync(folderPath);
      const imageFiles = files.filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
      });

      if (imageFiles.length === 0) {
        console.log(`❌ SKIP: ${placeId} - No images found`);
        skipCount++;
        continue;
      }

      console.log(`📤 Processing ${place.name} (${placeId})`);
      console.log(`   Found ${imageFiles.length} images`);

      const uploadedUrls = [];

      // Upload each image to Cloudinary
      for (const imageFile of imageFiles) {
        const imagePath = path.join(folderPath, imageFile);
        try {
          const result = await cloudinary.uploader.upload(imagePath, {
            folder: `egypt/giza/Events/${placeId}`,
            resource_type: "image",
            use_filename: true,
            unique_filename: true,
          });

          uploadedUrls.push(result.secure_url);
          console.log(`   ✓ Uploaded: ${imageFile}`);
        } catch (uploadError) {
          console.error(
            `   ✗ Failed to upload ${imageFile}:`,
            uploadError.message ||
              uploadError.error?.message ||
              JSON.stringify(uploadError)
          );
        }
      }

      if (uploadedUrls.length === 0) {
        console.log(`❌ SKIP: ${placeId} - No images uploaded successfully`);
        skipCount++;
        continue;
      }

      // Update database
      await Place.updateOne(
        { _id: new mongoose.Types.ObjectId(placeId) },
        { $set: { images: uploadedUrls } }
      );

      console.log(
        `✅ SUCCESS: Updated ${place.name} with ${uploadedUrls.length} images\n`
      );
      successCount++;
    }

    console.log("\n" + "=".repeat(60));
    console.log(`✅ Successfully processed: ${successCount} places`);
    console.log(`⏭️  Skipped: ${skipCount} places`);
    console.log("=".repeat(60));

    // Verification
    console.log("\n📊 Verifying updates...");
    for (const folder of folders) {
      if (mongoose.Types.ObjectId.isValid(folder)) {
        const place = await Place.findById(folder).select("name images").lean();
        if (place && place.images && place.images.length > 0) {
          console.log(
            `✓ ${place.name}: ${place.images.length} images in database`
          );
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

uploadPlaceImages();
