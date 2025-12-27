import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import Guide from "../src/models/Guide.js";
import User from "../src/models/User.js";
import Province from "../src/models/Province.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env") });

const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const toBool = (value, fallback = false) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeLanguages = (value) => {
  if (!value) return [];
  if (Array.isArray(value))
    return value.filter((v) => typeof v === "string" && v.trim().length > 0);
  if (typeof value === "string" && value.trim().length > 0)
    return [value.trim()];
  return [];
};

const normalizeLocation = (value, fallbackCoordinates) => {
  const coordinates = Array.isArray(value?.coordinates)
    ? value.coordinates
    : undefined;
  if (
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    Number.isFinite(Number(coordinates[0])) &&
    Number.isFinite(Number(coordinates[1]))
  ) {
    return {
      type: "Point",
      coordinates: [Number(coordinates[0]), Number(coordinates[1])],
    };
  }

  return {
    type: "Point",
    coordinates: [
      Number(fallbackCoordinates[0]),
      Number(fallbackCoordinates[1]),
    ],
  };
};

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const pickRandomMany = (arr, minCount, maxCount) => {
  const count = Math.max(
    minCount,
    Math.min(
      maxCount,
      Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount
    )
  );
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
};

const seedGuides = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const guidesPath = join(__dirname, "../guides.json");
    const guidesData = JSON.parse(readFileSync(guidesPath, "utf-8"));

    if (!Array.isArray(guidesData) || guidesData.length === 0) {
      throw new Error("Invalid guides data");
    }

    const provinces = await Province.find({}).select("_id location").lean();
    if (!provinces || provinces.length === 0) {
      throw new Error("No provinces found in database");
    }

    await Guide.deleteMany({});
    console.log("🗑️  Cleared existing guides");

    await User.deleteMany({ email: { $regex: /^seed-guide\+/i } });

    const seededGuides = [];

    for (let index = 0; index < guidesData.length; index++) {
      const seed = guidesData[index] || {};

      const baseName =
        typeof seed.name === "string" && seed.name.trim().length > 0
          ? seed.name.trim()
          : `Seed Guide ${index + 1}`;
      const baseSlug =
        typeof seed.slug === "string" && seed.slug.trim().length > 0
          ? slugify(seed.slug)
          : slugify(baseName);
      const uniqueSlug = `${baseSlug}-${Date.now()}-${index}`;
      const email = `seed-guide+${uniqueSlug}@example.com`;

      const user = await User.create({
        name: baseName,
        email,
        password: "password123",
        role: "guide",
        isEmailVerified: true,
        isActive: true,
      });

      const selectedProvinceDocs = pickRandomMany(
        provinces,
        1,
        Math.min(3, provinces.length)
      );
      const provinceIds = selectedProvinceDocs.map(
        (p) => new mongoose.Types.ObjectId(p._id)
      );
      const fallbackCoordinates = pickRandom(selectedProvinceDocs)?.location
        ?.coordinates ||
        pickRandom(provinces).location?.coordinates || [31.2357, 30.0444];

      const guideDoc = {
        user: new mongoose.Types.ObjectId(user._id),
        name: baseName,
        slug: uniqueSlug,
        provinces: provinceIds,
        languages: normalizeLanguages(seed.languages),
        pricePerHour: toNumber(seed.pricePerHour, 0),
        bio: typeof seed.bio === "string" ? seed.bio : "",
        location: normalizeLocation(seed.location, fallbackCoordinates),
        isVerified: toBool(seed.isVerified, false),
        isLicensed: toBool(seed.isLicensed, false),
        canEnterArchaeologicalSites: toBool(
          seed.canEnterArchaeologicalSites,
          false
        ),
        isActive: toBool(seed.isActive, true),
        photo: {
          url: typeof seed.photo?.url === "string" ? seed.photo.url : null,
          publicId:
            typeof seed.photo?.publicId === "string"
              ? seed.photo.publicId
              : null,
        },
        documents: [
          {
            url: "https://example.com/seed/id-document.jpg",
            publicId: `seed/${uniqueSlug}/id-document`,
            type: "id_document",
            status: "pending",
          },
          ...(toBool(seed.isLicensed, false)
            ? [
                {
                  url: "https://example.com/seed/tourism-card.jpg",
                  publicId: `seed/${uniqueSlug}/tourism-card`,
                  type: "tourism_card",
                  status: "pending",
                },
              ]
            : []),
        ],
        rating: 0,
        ratingCount: 0,
        totalTrips: 0,
      };

      seededGuides.push(guideDoc);
    }

    const result = await Guide.insertMany(seededGuides, { ordered: false });

    console.log(
      `✅ Successfully inserted ${result.length} guides into the database`
    );

    await mongoose.connection.close();
    console.log("✅ Database connection closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding guides:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

seedGuides();
