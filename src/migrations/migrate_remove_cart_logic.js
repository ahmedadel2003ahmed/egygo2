import mongoose from 'mongoose';
import Trip from '../models/Trip.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Migration Script: Remove Cart Logic from Trips
 * 
 * Purpose:
 * - Identify and archive trips that were created with cart-like behavior
 * - Archive trips without guide assignment
 * - Archive trips that never had agreement (no callId, no status progression)
 * 
 * Criteria for archiving:
 * 1. Trip has no guide (guide field is null/undefined)
 * 2. Trip status is 'pending' for more than 30 days
 * 3. Trip has no callId and was never confirmed
 * 
 * This migration is idempotent - safe to run multiple times
 */

// Statistics tracking
const stats = {
  scanned: 0,
  archived: 0,
  skipped: 0,
  errors: 0,
  archivedIds: [],
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/egygo';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Check if trip should be archived
 */
function shouldArchive(trip) {
  // Criterion 1: No guide assigned (cart-like behavior)
  if (!trip.guide) {
    return { should: true, reason: 'no_guide_assigned' };
  }

  // Criterion 2: Pending for more than 30 days without callId
  if (trip.status === 'pending' && !trip.callId && !trip.meta?.createdFromCallId) {
    const daysSincecreation = (Date.now() - trip.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincecreation > 30) {
      return { should: true, reason: 'stale_pending_no_agreement' };
    }
  }

  // Criterion 3: Has itinerary but no negotiatedPrice (old cart behavior)
  if (
    trip.itinerary &&
    trip.itinerary.length > 0 &&
    !trip.negotiatedPrice &&
    trip.status === 'pending'
  ) {
    return { should: true, reason: 'cart_like_no_negotiated_price' };
  }

  return { should: false };
}

/**
 * Archive a trip document
 */
async function archiveTrip(trip, reason) {
  try {
    await Trip.findByIdAndUpdate(
      trip._id,
      {
        $set: {
          status: 'archived',
          'meta.archivedReason': reason,
          'meta.archivedAt': new Date(),
          'meta.archivedBy': 'migration_remove_cart_logic',
        },
      },
      { runValidators: false }
    );

    stats.archived++;
    stats.archivedIds.push(trip._id.toString());

    console.log(`  📦 Archived trip ${trip._id} - Reason: ${reason}`);
  } catch (error) {
    stats.errors++;
    console.error(`  ❌ Failed to archive trip ${trip._id}:`, error.message);
  }
}

/**
 * Run migration
 */
async function runMigration() {
  console.log('🔄 Starting Trip Cart Logic Removal Migration\n');
  console.log('Scanning for trips to archive...\n');

  try {
    // Find all trips that are not already archived
    const trips = await Trip.find({
      status: { $ne: 'archived' },
    }).lean();

    stats.scanned = trips.length;
    console.log(`📊 Found ${stats.scanned} trips to scan\n`);

    // Process each trip
    for (const trip of trips) {
      const archiveCheck = shouldArchive(trip);

      if (archiveCheck.should) {
        await archiveTrip(trip, archiveCheck.reason);
      } else {
        stats.skipped++;
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total trips scanned:  ${stats.scanned}`);
    console.log(`Trips archived:       ${stats.archived}`);
    console.log(`Trips skipped:        ${stats.skipped}`);
    console.log(`Errors:               ${stats.errors}`);
    console.log('='.repeat(60));

    if (stats.archived > 0) {
      console.log('\n📦 Archived Trip IDs:');
      stats.archivedIds.forEach((id, index) => {
        console.log(`  ${index + 1}. ${id}`);
      });
    }

    if (stats.errors > 0) {
      console.log('\n⚠️  Migration completed with errors. Please review the logs above.');
      process.exit(1);
    } else {
      console.log('\n✅ Migration completed successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main() {
  await connectDB();
  await runMigration();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runMigration, shouldArchive };
