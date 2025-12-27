#!/usr/bin/env node

/**
 * Test POST /api/tourist/trips response structure
 * Verifies that guides are returned with the created trip
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

async function testCreateTrip() {
  log('\n🧪 Testing POST /api/tourist/trips', 'cyan');
  log('=' .repeat(60));
  
  const payload = {
    startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    meetingAddress: 'Giza Pyramids Main Entrance, Cairo',
    meetingPoint: {
      type: 'Point',
      coordinates: [31.1342, 29.9792]
    },
    totalDurationMinutes: 240,
    itinerary: [],
    notes: 'Test trip creation with guides response'
  };
  
  try {
    log('\n📤 Sending request...', 'cyan');
    log(`Payload: ${JSON.stringify(payload, null, 2)}`);
    
    const response = await axios.post(
      `${BASE_URL}/api/tourist/trips`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${TOURIST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    
    log('\n✅ Response received!', 'green');
    log(`Status: ${response.status}`, response.status === 201 ? 'green' : 'red');
    
    // Verify response structure
    const checks = {
      statusIs201: response.status === 201,
      hasSuccess: response.data.success === true,
      hasData: Array.isArray(response.data.data),
      hasPagination: response.data.pagination !== undefined,
      hasTrip: response.data.trip !== undefined,
      tripHasId: response.data.trip?._id !== undefined,
      paginationHasTotal: response.data.pagination?.total !== undefined,
      paginationHasPage: response.data.pagination?.page === 1,
      paginationHasPages: response.data.pagination?.pages !== undefined,
    };
    
    log('\n📊 Response Structure Validation:', 'cyan');
    log('=' .repeat(60));
    
    Object.entries(checks).forEach(([check, passed]) => {
      const status = passed ? '✅' : '❌';
      const color = passed ? 'green' : 'red';
      log(`${status} ${check}`, color);
    });
    
    log('\n📋 Response Details:', 'cyan');
    log('=' .repeat(60));
    log(`Trip ID: ${response.data.trip?._id}`);
    log(`Trip Status: ${response.data.trip?.status}`);
    log(`Guides Count: ${response.data.data?.length || 0}`);
    log(`Total Guides: ${response.data.pagination?.total || 0}`);
    log(`Page: ${response.data.pagination?.page}`);
    log(`Total Pages: ${response.data.pagination?.pages}`);
    
    if (response.data.data && response.data.data.length > 0) {
      log('\n🧑‍🤝‍🧑 Sample Guide:', 'cyan');
      const guide = response.data.data[0];
      log(`  ID: ${guide._id}`);
      log(`  Verified: ${guide.isVerified}`);
      log(`  Rating: ${guide.rating || 'N/A'}`);
      log(`  Languages: ${guide.languages?.join(', ') || 'N/A'}`);
    } else {
      log('\n⚠️  No guides returned (may be expected if no guides in DB)', 'yellow');
    }
    
    // Overall result
    const allPassed = Object.values(checks).every(v => v === true);
    
    log('\n' + '=' .repeat(60));
    if (allPassed) {
      log('🎉 All checks PASSED! Response structure is correct.', 'green');
      return true;
    } else {
      log('❌ Some checks FAILED. Review the structure above.', 'red');
      return false;
    }
    
  } catch (error) {
    log('\n❌ Request FAILED', 'red');
    
    if (error.response) {
      log(`Status: ${error.response.status}`, 'red');
      log(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      log('No response received from server', 'red');
      log(`Error: ${error.message}`);
    } else {
      log(`Error: ${error.message}`, 'red');
    }
    
    return false;
  }
}

// Run test
testCreateTrip().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  log(`\n💥 Fatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
