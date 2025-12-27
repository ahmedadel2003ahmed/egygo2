import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../src/models/User.js';
import Guide from '../src/models/Guide.js';
import Attraction from '../src/models/Attraction.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/localguide';

// Test user credentials
const TEST_TOURIST_EMAIL = 'test_tourist@example.com';
const TEST_TOURIST_PASSWORD = 'tourist123';
const TEST_GUIDE_EMAIL = 'test_guide@example.com';
const TEST_GUIDE_PASSWORD = 'guide123';

// Sample attractions data
const SAMPLE_ATTRACTIONS = [
  {
    name: 'Great Pyramid of Giza',
    description: 'The Great Pyramid of Giza is the oldest and largest of the three pyramids in the Giza pyramid complex. Built as a tomb for Pharaoh Khufu, it is one of the Seven Wonders of the Ancient World.',
    location: {
      type: 'Point',
      coordinates: [31.1342, 29.9792], // [longitude, latitude]
      address: 'Al Haram, Nazlet El-Semman, Giza Governorate',
      city: 'Giza',
    },
    openingHours: '8:00 AM - 5:00 PM',
    ticketPrice: 200,
    category: 'historical',
    isActive: true,
  },
  {
    name: 'The Sphinx',
    description: 'The Great Sphinx of Giza is a limestone statue of a reclining sphinx with the head of a human and the body of a lion. It is the oldest known monumental sculpture in Egypt.',
    location: {
      type: 'Point',
      coordinates: [31.1376, 29.9753],
      address: 'Al Haram, Giza Governorate',
      city: 'Giza',
    },
    openingHours: '8:00 AM - 5:00 PM',
    ticketPrice: 80,
    category: 'historical',
    isActive: true,
  },
  {
    name: 'Egyptian Museum',
    description: 'The Museum of Egyptian Antiquities, known as the Egyptian Museum, houses the largest collection of ancient Egyptian antiquities in the world, including the treasures of Tutankhamun.',
    location: {
      type: 'Point',
      coordinates: [31.2336, 30.0478],
      address: 'Midan El Tahrir, Ismailia, Cairo Governorate',
      city: 'Cairo',
    },
    openingHours: '9:00 AM - 7:00 PM',
    ticketPrice: 150,
    category: 'museum',
    isActive: true,
  },
];

async function seedDatabase() {
  try {
    console.log('🌱 Starting trip sample seeder...\n');

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // ==================== SEED TOURIST USER ====================
    console.log('👤 Seeding test tourist user...');
    let tourist = await User.findOne({ email: TEST_TOURIST_EMAIL });

    if (!tourist) {
      // Hash password manually (pre-save hook won't work with updateOne)
      const hashedPassword = await bcrypt.hash(TEST_TOURIST_PASSWORD, 10);

      tourist = await User.create({
        email: TEST_TOURIST_EMAIL,
        password: hashedPassword,
        name: 'Test Tourist',
        phone: '+201234567890',
        role: 'tourist',
        isEmailVerified: true,
        isActive: true,
      });

      console.log('✅ Tourist user created');
      console.log(`   Email: ${TEST_TOURIST_EMAIL}`);
      console.log(`   Password: ${TEST_TOURIST_PASSWORD}`);
      console.log(`   User ID: ${tourist._id}\n`);
    } else {
      console.log('ℹ️  Tourist user already exists');
      console.log(`   Email: ${TEST_TOURIST_EMAIL}`);
      console.log(`   User ID: ${tourist._id}\n`);
    }

    // ==================== SEED GUIDE USER ====================
    console.log('🧑‍🏫 Seeding test guide user...');
    let guideUser = await User.findOne({ email: TEST_GUIDE_EMAIL });

    if (!guideUser) {
      const hashedPassword = await bcrypt.hash(TEST_GUIDE_PASSWORD, 10);

      guideUser = await User.create({
        email: TEST_GUIDE_EMAIL,
        password: hashedPassword,
        name: 'Test Guide',
        phone: '+201234567891',
        role: 'guide',
        isEmailVerified: true,
        isActive: true,
      });

      console.log('✅ Guide user created');
      console.log(`   Email: ${TEST_GUIDE_EMAIL}`);
      console.log(`   Password: ${TEST_GUIDE_PASSWORD}`);
      console.log(`   User ID: ${guideUser._id}\n`);
    } else {
      console.log('ℹ️  Guide user already exists');
      console.log(`   Email: ${TEST_GUIDE_EMAIL}`);
      console.log(`   User ID: ${guideUser._id}\n`);
    }

    // ==================== SEED GUIDE PROFILE ====================
    console.log('📋 Seeding guide profile...');
    let guide = await Guide.findOne({ user: guideUser._id });

    if (!guide) {
      guide = await Guide.create({
        user: guideUser._id,
        isVerified: true,
        canEnterArchaeologicalSites: true,
        isLicensed: true,
        languages: ['English', 'Arabic'],
        pricePerHour: 20,
        bio: 'Experienced tour guide specializing in ancient Egyptian history and archaeology. Licensed and certified with 5+ years of experience.',
        availability: [
          { dayOfWeek: 0, startTime: '09:00', endTime: '17:00' }, // Sunday
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }, // Monday
          { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' }, // Tuesday
          { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }, // Wednesday
          { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' }, // Thursday
        ],
      });

      console.log('✅ Guide profile created');
      console.log(`   Guide ID: ${guide._id}`);
      console.log(`   Price per hour: $${guide.pricePerHour}`);
      console.log(`   Languages: ${guide.languages.join(', ')}`);
      console.log(`   Verified: ${guide.isVerified}\n`);
    } else {
      // Update guide to ensure verified and has pricePerHour
      await Guide.updateOne(
        { _id: guide._id },
        {
          $set: {
            isVerified: true,
            pricePerHour: 20,
            languages: ['English', 'Arabic'],
          },
        }
      );

      console.log('ℹ️  Guide profile already exists (updated to verified)');
      console.log(`   Guide ID: ${guide._id}\n`);
    }

    // ==================== SEED ATTRACTIONS ====================
    console.log('🏛️  Seeding sample attractions...');
    const createdAttractions = [];

    for (const attractionData of SAMPLE_ATTRACTIONS) {
      const existing = await Attraction.findOne({ name: attractionData.name });

      if (!existing) {
        const attraction = await Attraction.create(attractionData);
        createdAttractions.push(attraction);
        console.log(`✅ Created: ${attraction.name}`);
        console.log(`   ID: ${attraction._id}`);
        console.log(`   City: ${attraction.location.city}`);
        console.log(`   Ticket Price: $${attraction.ticketPrice}`);
        console.log(`   Coordinates: [${attraction.location.coordinates.join(', ')}]\n`);
      } else {
        createdAttractions.push(existing);
        console.log(`ℹ️  Already exists: ${existing.name} (ID: ${existing._id})\n`);
      }
    }

    // ==================== SUMMARY ====================
    console.log('═══════════════════════════════════════════════════');
    console.log('🎉 SEEDING COMPLETE\n');
    console.log('📋 SUMMARY:');
    console.log('───────────────────────────────────────────────────');
    console.log('\n👤 TEST USERS:');
    console.log(`   Tourist: ${TEST_TOURIST_EMAIL} / ${TEST_TOURIST_PASSWORD}`);
    console.log(`   Tourist ID: ${tourist._id}`);
    console.log(`   Guide: ${TEST_GUIDE_EMAIL} / ${TEST_GUIDE_PASSWORD}`);
    console.log(`   Guide User ID: ${guideUser._id}`);
    console.log(`   Guide Profile ID: ${guide._id}`);
    console.log('\n🏛️  ATTRACTIONS:');
    createdAttractions.forEach((attr, idx) => {
      console.log(`   ${idx + 1}. ${attr.name}`);
      console.log(`      ID: ${attr._id}`);
      console.log(`      Ticket: $${attr.ticketPrice}`);
    });
    console.log('\n💡 NEXT STEPS:');
    console.log('   1. Login as tourist or guide to get auth tokens');
    console.log('   2. Use the Postman collection to test trip workflows');
    console.log('   3. Try creating trips with the attraction IDs above');
    console.log('═══════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

// Run seeder
seedDatabase();
