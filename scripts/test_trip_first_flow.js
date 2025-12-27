#!/usr/bin/env node

/**
 * Test Trip-First Flow Updates
 * 
 * Tests the newly implemented features:
 * 1. Create trip without guideId (optional)
 * 2. Create trip with empty itinerary
 * 3. Create trip with meta.agreementSource="new_flow"
 * 4. Create trip with invalid createdFromPlaceId (should not fail)
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const TOURIST_TOKEN = process.env.TOURIST_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTJlMGEzNGVhMWM1ODNiNjI2Yzk0M2YiLCJyb2xlIjoidG91cmlzdCIsImlhdCI6MTc2NDY4NzA3NywiZXhwIjoxNzY1MjkxODc3fQ.Bzi9qbbHSboCzc1qWRA0hqnEMrLMHI_NS39uXG0vjdQ';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testTripCreation(testName, payload) {
  try {
    log(`\n📝 Testing: ${testName}`, 'cyan');
    log(`Payload: ${JSON.stringify(payload, null, 2)}`);
    
    const response = await axios.post(
      `${BASE_URL}/api/tourist/trips`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${TOURIST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    log(`✅ SUCCESS: ${testName}`, 'green');
    log(`Status: ${response.status}`);
    log(`Trip ID: ${response.data.trip._id}`);
    log(`Trip Status: ${response.data.trip.status}`);
    log(`Message: ${response.data.message}`);
    
    // Verify meta normalization if applicable
    if (payload.meta?.agreementSource === 'new_flow') {
      log(`Meta Agreement Source: ${response.data.trip.meta.agreementSource}`, 'yellow');
      log(`Meta Agreement Note: ${response.data.trip.meta.agreementNote}`, 'yellow');
      
      if (response.data.trip.meta.agreementSource === 'in_app') {
        log(`✅ Meta normalized correctly (new_flow → in_app)`, 'green');
      }
    }
    
    return { success: true, tripId: response.data.trip._id, data: response.data };
  } catch (error) {
    log(`❌ FAILED: ${testName}`, 'red');
    if (error.response) {
      log(`Status: ${error.response.status}`, 'red');
      log(`Error: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    } else if (error.request) {
      log(`No response received from server`, 'red');
      log(`Error: ${error.message}`, 'red');
    } else {
      log(`Error: ${error.message}`, 'red');
      console.error(error);
    }
    return { success: false, error: error.message };
  }
}

async function runTests() {
  log('\n🚀 Starting Trip-First Flow Update Tests', 'cyan');
  log('=' .repeat(60));
  
  const results = [];
  
  // Test 1: Basic trip without guideId
  const test1 = await testTripCreation('Create trip without guideId', {
    startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    meetingAddress: 'Giza Pyramids Main Entrance, Cairo',
    meetingPoint: {
      type: 'Point',
      coordinates: [31.1342, 29.9792]
    },
    totalDurationMinutes: 240,
    notes: 'Test trip without guide - flexible itinerary'
  });
  results.push({ test: 'Without guideId', ...test1 });
  
  // Test 2: Trip with empty itinerary
  const test2 = await testTripCreation('Create trip with empty itinerary', {
    startAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    meetingAddress: 'Egyptian Museum, Cairo',
    itinerary: [], // Empty array
    notes: 'Open to guide suggestions'
  });
  results.push({ test: 'Empty itinerary', ...test2 });
  
  // Test 3: Trip with meta.agreementSource="new_flow"
  const test3 = await testTripCreation('Create trip with meta.agreementSource="new_flow"', {
    startAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    meetingAddress: 'Luxor Temple, Luxor',
    meta: {
      agreementSource: 'new_flow',
      agreementNote: 'Created via new trip-first workflow'
    }
  });
  results.push({ test: 'Meta new_flow', ...test3 });
  
  // Test 4: Trip with invalid createdFromPlaceId
  const test4 = await testTripCreation('Create trip with invalid createdFromPlaceId', {
    startAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    meetingAddress: 'Abu Simbel Temple, Aswan',
    createdFromPlaceId: 'invalid-place-id-12345', // Invalid ID
    notes: 'Should not fail on invalid place ID'
  });
  results.push({ test: 'Invalid createdFromPlaceId', ...test4 });
  
  // Test 5: Combined - all optional fields
  const test5 = await testTripCreation('Create trip with all new optional fields', {
    startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    meetingAddress: 'Karnak Temple, Luxor',
    itinerary: [],
    createdFromPlaceId: 'some-invalid-id',
    meta: {
      agreementSource: 'new_flow',
      agreementNote: 'Testing all features together'
    },
    notes: 'Comprehensive test with all new features'
  });
  results.push({ test: 'All features combined', ...test5 });
  
  // Print summary
  log('\n' + '=' .repeat(60));
  log('📊 TEST SUMMARY', 'cyan');
  log('=' .repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach((result, idx) => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    const color = result.success ? 'green' : 'red';
    log(`${idx + 1}. ${status} - ${result.test}`, color);
  });
  
  log('\n' + '=' .repeat(60));
  log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`, 
      failed === 0 ? 'green' : 'yellow');
  
  if (failed === 0) {
    log('\n🎉 All tests passed! Trip-first flow is working correctly!', 'green');
  } else {
    log('\n⚠️  Some tests failed. Check the errors above.', 'yellow');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
  log(`\n💥 Fatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
