import mongoose from 'mongoose';
import Trip from '../models/Trip.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration: Trip Flow Redesign
 * 
 * Migrates existing trips from old flow to new flow:
 * - Maps old statuses to new statuses
 * - Populates selectedGuide from guide field
 * - Migrates callId to callSessions array
 * - Ensures backward compatibility
 */

const statusMapping = {
  'pending': 'pending_confirmation',      // Old pending → waiting for guide confirmation
  'confirmed': 'confirmed',               // Keep confirmed
  'in_progress': 'in_progress',           // Keep in_progress
  'completed': 'completed',               // Keep completed
  'cancelled': 'cancelled',               // Keep cancelled
  'rejected': 'rejected',                 // Keep rejected
  'archived': 'archived',                 // Keep archived
  'proposal': 'pending_confirmation',     // Old proposal → pending confirmation
};

async function migrateTrips() {
  try {
    console.log('🚀 Starting Trip Flow Redesign Migration...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all trips
    const trips = await Trip.find({});
    console.log(`📊 Found ${trips.length} trips to migrate\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const trip of trips) {
      try {
        const updates = {};
        let needsUpdate = false;

        // 1. Map old status to new status
        if (statusMapping[trip.status]) {
          const newStatus = statusMapping[trip.status];
          if (trip.status !== newStatus) {
            updates.status = newStatus;
            needsUpdate = true;
            console.log(`   Mapping status: ${trip.status} → ${newStatus}`);
          }
        }

        // 2. Populate selectedGuide from guide field (if guide exists)
        if (trip.guide && !trip.selectedGuide) {
          updates.selectedGuide = trip.guide;
          needsUpdate = true;
          console.log(`   Setting selectedGuide from guide field`);
        }

        // 3. Migrate callId to callSessions array
        if (trip.callId && (!trip.callSessions || trip.callSessions.length === 0)) {
          updates.callSessions = [{
            callId: trip.callId,
            guideId: trip.guide,
            startedAt: trip.createdAt,
            summary: 'Migrated from old call flow',
            negotiatedPrice: trip.negotiatedPrice,
            createdAt: trip.createdAt,
          }];
          needsUpdate = true;
          console.log(`   Migrating callId to callSessions`);
        }

        // 4. Ensure offers array exists
        if (!trip.offers) {
          updates.offers = [];
          needsUpdate = true;
        }

        // 5. Ensure candidateGuides array exists
        if (!trip.candidateGuides) {
          updates.candidateGuides = trip.guide ? [trip.guide] : [];
          needsUpdate = true;
        }

        // Apply updates
        if (needsUpdate) {
          await Trip.updateOne({ _id: trip._id }, { $set: updates });
          migratedCount++;
          console.log(`✅ Migrated trip ${trip._id}`);
        } else {
          skippedCount++;
          console.log(`⏭️  Skipped trip ${trip._id} (already migrated)`);
        }

      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating trip ${trip._id}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`Total trips:      ${trips.length}`);
    console.log(`Migrated:         ${migratedCount}`);
    console.log(`Skipped:          ${skippedCount}`);
    console.log(`Errors:           ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    if (errorCount === 0) {
      console.log('✅ Migration completed successfully!\n');
    } else {
      console.log('⚠️  Migration completed with errors. Please review.\n');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run migration
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateTrips();
}

export default migrateTrips;
