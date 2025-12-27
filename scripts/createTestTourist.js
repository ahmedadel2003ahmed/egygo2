import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../src/models/User.js";

dotenv.config();

async function createTestTourist() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const testEmail = "tourist@test.com";
    const testPassword = "password123";

    // Check if already exists
    const existing = await User.findOne({ email: testEmail });
    if (existing) {
      console.log(`⚠️  User ${testEmail} already exists!`);
      console.log(`   Email: ${testEmail}`);
      console.log(`   Password: ${testPassword}`);
      await mongoose.connection.close();
      return;
    }

    // Create new test tourist
    const user = await User.create({
      email: testEmail,
      password: testPassword, // Will be hashed by pre-save hook
      name: "Test Tourist",
      role: "tourist",
      isEmailVerified: true, // Skip email verification for testing
      isActive: true,
    });

    console.log("\n✅ Test tourist created successfully!\n");
    console.log("📧 Email:", testEmail);
    console.log("🔑 Password:", testPassword);
    console.log("👤 Name: Test Tourist");
    console.log("🎭 Role: tourist");
    console.log("✅ Email Verified: true\n");
    console.log("You can now login with these credentials!");

    await mongoose.connection.close();
    console.log("\n✅ Connection closed");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

createTestTourist();
