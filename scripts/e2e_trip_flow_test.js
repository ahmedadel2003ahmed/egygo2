#!/usr/bin/env node

/**
 * EGYGO Trip-First Flow - End-to-End Automated Test
 * 
 * Tests the complete new trip flow:
 * 1. Create Trip (without guide)
 * 2. Get Compatible Guides
 * 3. Select Guide
 * 4. Initiate Trip-Based Call
 * 5. End Call (with summary + negotiated price)
 * 6. Guide Accept Trip
 * 7. Verify Final Status
 * 
 * Environment Variables:
 * - BASE_URL: API base URL (default: http://localhost:5000)
 * - TOURIST_TOKEN: Tourist auth token (REQUIRED)
 * - GUIDE_TOKEN: Guide auth token (REQUIRED for guide accept)
 * - PLACE_ID: Optional place ID for trip creation
 * - TIMEOUT: Request timeout in ms (default: 10000)
 * - DEBUG: Set to 'true' for verbose logging
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  BASE_URL: process.env.BASE_URL || 'http://localhost:5000',
  TOURIST_TOKEN:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTJlMGEzNGVhMWM1ODNiNjI2Yzk0M2YiLCJyb2xlIjoidG91cmlzdCIsImlhdCI6MTc2NDY4NzA3NywiZXhwIjoxNzY1MjkxODc3fQ.Bzi9qbbHSboCzc1qWRA0hqnEMrLMHI_NS39uXG0vjdQ',
  GUIDE_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTJkYjY5Yjk2ZDVjNDk4NzQ0NWU4ZmYiLCJyb2xlIjoiZ3VpZGUiLCJpYXQiOjE3NjQ2ODk0OTgsImV4cCI6MTc2NTI5NDI5OH0.nYNgLrqdFlUo_34u_D80ztA191psT7Tv_9ZbL4RIBUI',
  PLACE_ID: 'p692ad117dacdab51c1e076b0' || null,
  TIMEOUT: parseInt(process.env.TIMEOUT) || 10000,
  DEBUG: process.env.DEBUG === 'true',
  RESULTS_DIR: path.join(__dirname, '..', 'e2e-results'),
};

// Validate required config
if (!CONFIG.TOURIST_TOKEN) {
  console.error('❌ ERROR: TOURIST_TOKEN environment variable is required');
  console.error('Usage: TOURIST_TOKEN=xxx GUIDE_TOKEN=yyy node scripts/e2e_trip_flow_test.js');
  process.exit(1);
}

if (!CONFIG.GUIDE_TOKEN) {
  console.error('⚠️  WARNING: GUIDE_TOKEN not provided. Guide accept step will be skipped.');
}

// Create results directory
if (!fs.existsSync(CONFIG.RESULTS_DIR)) {
  fs.mkdirSync(CONFIG.RESULTS_DIR, { recursive: true });
}

// ============================================================================
// UTILITIES
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${'='.repeat(70)}`, 'bright');
  log(`STEP ${step}: ${message}`, 'cyan');
  log('='.repeat(70), 'bright');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logDebug(message, data = null) {
  if (CONFIG.DEBUG) {
    log(`🔍 ${message}`, 'blue');
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

function saveResponse(filename, data) {
  const filepath = path.join(CONFIG.RESULTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  logDebug(`Saved response to ${filepath}`);
}

// ============================================================================
// API CLIENT
// ============================================================================

const api = axios.create({
  baseURL: CONFIG.BASE_URL,
  timeout: CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(config => {
  logDebug(`→ ${config.method.toUpperCase()} ${config.url}`, config.data);
  return config;
});

// Response interceptor for logging
api.interceptors.response.use(
  response => {
    logDebug(`← ${response.status} ${response.config.url}`, response.data);
    return response;
  },
  error => {
    if (error.response) {
      logDebug(`← ${error.response.status} ${error.config.url}`, error.response.data);
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// TEST STATE
// ============================================================================

const testState = {
  trip_id: null,
  guide_id: null,
  call_id: null,
  startTime: Date.now(),
  errors: [],
  warnings: [],
  results: {},
};

// ============================================================================
// TEST STEPS
// ============================================================================

/**
 * STEP 1: Create Trip
 */
async function createTrip() {
  logStep(1, 'Create Trip (Without Guide)');

  // Prepare trip creation body with multiple fallback strategies
  const tripBodies = [
    // Strategy 1: Minimal body (no meta, no createdFromPlaceId)
    {
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      meetingAddress: 'Pyramids of Giza, Al Haram, Giza Governorate, Egypt',
      meetingPoint: {
        type: 'Point',
        coordinates: [31.1342, 29.9765],
      },
      totalDurationMinutes: 240,
    //   itinerary: [],
      notes: 'E2E Test Trip - Auto-generated',
    },
    // Strategy 2: With meta.agreementSource = 'new_flow'
    {
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      meetingAddress: 'Pyramids of Giza, Al Haram, Giza Governorate, Egypt',
      meetingPoint: {
        type: 'Point',
        coordinates: [31.1342, 29.9765],
      },
      totalDurationMinutes: 240,
      itinerary: [],
      notes: 'E2E Test Trip - Auto-generated',
      meta: {
        agreementSource: 'new_flow',
      },
    },
    // Strategy 3: With place ID (if provided)
    CONFIG.PLACE_ID ? {
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      meetingAddress: 'Pyramids of Giza, Al Haram, Giza Governorate, Egypt',
      meetingPoint: {
        type: 'Point',
        coordinates: [31.1342, 29.9765],
      },
      totalDurationMinutes: 240,
      itinerary: [],
      notes: 'E2E Test Trip - Auto-generated',
      createdFromPlaceId: CONFIG.PLACE_ID,
      meta: {
        agreementSource: 'new_flow',
      },
    } : null,
  ].filter(Boolean);

  let lastError = null;

  for (let i = 0; i < tripBodies.length; i++) {
    const body = tripBodies[i];
    const strategyName = i === 0 ? 'Minimal' : i === 1 ? 'With meta' : 'With place ID';
    
    try {
      log(`Attempting strategy ${i + 1}/${tripBodies.length}: ${strategyName}`);
      
      const response = await api.post('/api/tourist/trips', body, {
        headers: {
          Authorization: `Bearer ${CONFIG.TOURIST_TOKEN}`,
        },
      });

      if (response.data.success && response.data.data.trip) {
        testState.trip_id = response.data.data.trip._id;
        testState.results.createTrip = response.data;
        
        saveResponse('01_trip_create.json', response.data);
        
        logSuccess(`Trip created successfully with strategy: ${strategyName}`);
        logSuccess(`Trip ID: ${testState.trip_id}`);
        logSuccess(`Status: ${response.data.data.trip.status}`);
        
        // Verify status
        if (response.data.data.trip.status !== 'selecting_guide') {
          logWarning(`Expected status 'selecting_guide', got '${response.data.data.trip.status}'`);
          testState.warnings.push(`Unexpected initial status: ${response.data.data.trip.status}`);
        }
        
        return response.data;
      }
    } catch (error) {
      lastError = error;
      const errorMsg = error.response?.data?.message || error.message;
      logWarning(`Strategy ${i + 1} failed: ${errorMsg}`);
      
      // Check if it's a meta-related error
      if (errorMsg.includes('meta') || errorMsg.includes('agreementSource')) {
        logDebug('Meta validation error detected, trying next strategy...');
        continue;
      }
      
      // Check if it's a place-related error
      if (errorMsg.includes('Place not found') || errorMsg.includes('placeId')) {
        logDebug('Place error detected, trying next strategy...');
        continue;
      }
      
      // Other errors - might want to retry
      logWarning(`Unexpected error: ${errorMsg}`);
    }
  }

  // All strategies failed
  logError('All trip creation strategies failed!');
  if (lastError?.response?.data) {
    logError(`Last error: ${JSON.stringify(lastError.response.data, null, 2)}`);
  }
  throw new Error('Failed to create trip after trying all strategies');
}

/**
 * STEP 2: Get Compatible Guides
 */
async function getCompatibleGuides() {
  logStep(2, 'Get Trip-Compatible Guides');

  if (!testState.trip_id) {
    throw new Error('trip_id not available. Cannot proceed.');
  }

  try {
    const response = await api.get(`/api/tourist/trips/${testState.trip_id}/guides`, {
      headers: {
        Authorization: `Bearer ${CONFIG.TOURIST_TOKEN}`,
      },
    });

    if (response.data.success && response.data.data.guides) {
      const guides = response.data.data.guides;
      testState.results.getGuides = response.data;
      
      saveResponse('02_guides_list.json', response.data);
      
      logSuccess(`Found ${guides.length} compatible guides`);
      
      if (guides.length === 0) {
        throw new Error('No compatible guides found. Cannot proceed with test.');
      }

      // Select first guide
      testState.guide_id = guides[0]._id;
      logSuccess(`Selected guide: ${guides[0].fullName || guides[0]._id}`);
      logDebug('Guide details:', guides[0]);
      
      return response.data;
    } else {
      throw new Error('Invalid response format from guides endpoint');
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logError(`Failed to get guides: ${errorMsg}`);
    throw error;
  }
}

/**
 * STEP 3: Select Guide
 */
async function selectGuide() {
  logStep(3, 'Select Guide for Trip');

  if (!testState.trip_id || !testState.guide_id) {
    throw new Error('trip_id or guide_id not available. Cannot proceed.');
  }

  try {
    const response = await api.post(
      `/api/tourist/trips/${testState.trip_id}/select-guide`,
      { guideId: testState.guide_id },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.TOURIST_TOKEN}`,
        },
      }
    );

    if (response.data.success) {
      testState.results.selectGuide = response.data;
      
      saveResponse('03_guide_selected.json', response.data);
      
      logSuccess('Guide selected successfully');
      
      const trip = response.data.data.trip;
      logSuccess(`Trip status: ${trip.status}`);
      
      // Verify status changed to awaiting_call
      if (trip.status !== 'awaiting_call') {
        logWarning(`Expected status 'awaiting_call', got '${trip.status}'`);
        testState.warnings.push(`Unexpected status after guide selection: ${trip.status}`);
      }
      
      return response.data;
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logError(`Failed to select guide: ${errorMsg}`);
    throw error;
  }
}

/**
 * STEP 4: Initiate Trip-Based Call
 */
async function initiateCall() {
  logStep(4, 'Initiate Trip-Based Call');

  if (!testState.trip_id) {
    throw new Error('trip_id not available. Cannot proceed.');
  }

  try {
    const response = await api.post(
      `/api/trips/${testState.trip_id}/calls/initiate`,
      {},
      {
        headers: {
          Authorization: `Bearer ${CONFIG.TOURIST_TOKEN}`,
        },
      }
    );

    if (response.data.success && response.data.data.call) {
      testState.call_id = response.data.data.call._id;
      testState.results.initiateCall = response.data;
      
      saveResponse('04_call_initiated.json', response.data);
      
      logSuccess('Call initiated successfully');
      logSuccess(`Call ID: ${testState.call_id}`);
      
      if (response.data.data.agoraToken) {
        logSuccess('Agora token received');
      }
      
      return response.data;
    } else {
      throw new Error('Invalid response format from call initiate endpoint');
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logError(`Failed to initiate call: ${errorMsg}`);
    throw error;
  }
}

/**
 * STEP 5: End Call with Summary and Negotiated Price
 */
async function endCall() {
  logStep(5, 'End Call (Summary + Negotiated Price)');

  if (!testState.call_id) {
    throw new Error('call_id not available. Cannot proceed.');
  }

  const callSummary = {
    endReason: 'completed',
    summary: 'E2E Test: Successfully discussed trip details. Guide agreed to visit Pyramids and Egyptian Museum. Safety protocols reviewed.',
    negotiatedPrice: 450,
  };

  try {
    const response = await api.post(
      `/api/calls/${testState.call_id}/end`,
      callSummary,
      {
        headers: {
          Authorization: `Bearer ${CONFIG.TOURIST_TOKEN}`,
        },
      }
    );

    if (response.data.success) {
      testState.results.endCall = response.data;
      
      saveResponse('05_call_ended.json', response.data);
      
      logSuccess('Call ended successfully');
      logSuccess(`Summary saved: ${callSummary.summary.substring(0, 50)}...`);
      logSuccess(`Negotiated price: ${callSummary.negotiatedPrice}`);
      
      const trip = response.data.data.trip;
      if (trip) {
        logSuccess(`Trip status: ${trip.status}`);
        
        // Verify status changed to awaiting_guide_confirmation or pending_confirmation
        if (!['awaiting_guide_confirmation', 'pending_confirmation'].includes(trip.status)) {
          logWarning(`Expected status 'awaiting_guide_confirmation' or 'pending_confirmation', got '${trip.status}'`);
          testState.warnings.push(`Unexpected status after call end: ${trip.status}`);
        }
      }
      
      return response.data;
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logError(`Failed to end call: ${errorMsg}`);
    throw error;
  }
}

/**
 * STEP 6: Guide Accept Trip
 */
async function guideAcceptTrip() {
  logStep(6, 'Guide Accept Trip');

  if (!testState.trip_id) {
    throw new Error('trip_id not available. Cannot proceed.');
  }

  if (!CONFIG.GUIDE_TOKEN) {
    logWarning('GUIDE_TOKEN not provided. Skipping guide accept step.');
    testState.warnings.push('Guide accept step skipped - no guide token');
    return { skipped: true };
  }

  try {
    const response = await api.put(
      `/api/guide/trips/${testState.trip_id}/accept`,
      { finalPrice: 450 },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.GUIDE_TOKEN}`,
        },
      }
    );

    if (response.data.success) {
      testState.results.guideAccept = response.data;
      
      saveResponse('06_guide_accepted.json', response.data);
      
      logSuccess('Guide accepted trip successfully');
      
      const trip = response.data.data.trip;
      logSuccess(`Trip status: ${trip.status}`);
      logSuccess(`Final price: ${trip.finalPrice}`);
      
      // Verify status changed to confirmed
      if (trip.status !== 'confirmed') {
        logWarning(`Expected status 'confirmed', got '${trip.status}'`);
        testState.warnings.push(`Unexpected status after guide accept: ${trip.status}`);
      }
      
      return response.data;
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logError(`Failed to accept trip: ${errorMsg}`);
    throw error;
  }
}

/**
 * STEP 7: Verify Final Trip Status
 */
async function verifyFinalStatus() {
  logStep(7, 'Verify Final Trip Status');

  if (!testState.trip_id) {
    throw new Error('trip_id not available. Cannot proceed.');
  }

  try {
    const response = await api.get(`/api/tourist/trips/${testState.trip_id}`, {
      headers: {
        Authorization: `Bearer ${CONFIG.TOURIST_TOKEN}`,
      },
    });

    if (response.data.success && response.data.data) {
      const trip = response.data.data;
      testState.results.finalStatus = response.data;
      
      saveResponse('07_final_status.json', response.data);
      
      logSuccess('Final trip status retrieved');
      logSuccess(`Status: ${trip.status}`);
      logSuccess(`Guide: ${trip.guide || trip.selectedGuide || 'N/A'}`);
      
      if (trip.finalPrice) {
        logSuccess(`Final Price: ${trip.finalPrice}`);
      }
      
      if (trip.callSessions && trip.callSessions.length > 0) {
        logSuccess(`Call sessions recorded: ${trip.callSessions.length}`);
      }
      
      // Final verification
      if (CONFIG.GUIDE_TOKEN) {
        if (trip.status === 'confirmed') {
          logSuccess('✅ FINAL VERIFICATION PASSED: Trip is confirmed!');
        } else {
          logWarning(`Expected final status 'confirmed', got '${trip.status}'`);
          testState.warnings.push('Final status is not confirmed');
        }
      } else {
        logSuccess('✅ PARTIAL VERIFICATION: Trip created and call completed (guide accept skipped)');
      }
      
      return response.data;
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logError(`Failed to verify final status: ${errorMsg}`);
    throw error;
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runE2ETest() {
  log('\n' + '='.repeat(70), 'bright');
  log('EGYGO TRIP-FIRST FLOW - E2E TEST', 'bright');
  log('='.repeat(70), 'bright');
  log(`Base URL: ${CONFIG.BASE_URL}`, 'cyan');
  log(`Tourist Token: ${CONFIG.TOURIST_TOKEN.substring(0, 20)}...`, 'cyan');
  log(`Guide Token: ${CONFIG.GUIDE_TOKEN ? CONFIG.GUIDE_TOKEN.substring(0, 20) + '...' : 'NOT PROVIDED'}`, 'cyan');
  log(`Results Directory: ${CONFIG.RESULTS_DIR}`, 'cyan');
  log('='.repeat(70) + '\n', 'bright');

  try {
    // Execute all steps sequentially
    await createTrip();
    await getCompatibleGuides();
    await selectGuide();
    await initiateCall();
    await endCall();
    await guideAcceptTrip();
    await verifyFinalStatus();

    // Generate summary report
    generateSummaryReport(true);

    logSuccess('\n🎉 E2E TEST COMPLETED SUCCESSFULLY! 🎉\n');
    process.exit(0);
  } catch (error) {
    testState.errors.push({
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
    });

    logError('\n❌ E2E TEST FAILED ❌\n');
    logError(`Error: ${error.message}`);
    
    if (error.response?.data) {
      logError('Response data:');
      console.error(JSON.stringify(error.response.data, null, 2));
    }

    // Generate summary report even on failure
    generateSummaryReport(false);

    process.exit(1);
  }
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateSummaryReport(success) {
  const duration = Date.now() - testState.startTime;
  const durationSeconds = (duration / 1000).toFixed(2);

  const report = {
    testName: 'EGYGO Trip-First Flow E2E Test',
    timestamp: new Date().toISOString(),
    duration: `${durationSeconds}s`,
    success,
    configuration: {
      baseUrl: CONFIG.BASE_URL,
      timeout: CONFIG.TIMEOUT,
      hasGuideToken: !!CONFIG.GUIDE_TOKEN,
      hasPlaceId: !!CONFIG.PLACE_ID,
    },
    testState: {
      trip_id: testState.trip_id,
      guide_id: testState.guide_id,
      call_id: testState.call_id,
    },
    warnings: testState.warnings,
    errors: testState.errors,
    results: testState.results,
  };

  // Save JSON report
  const reportPath = path.join(CONFIG.RESULTS_DIR, 'test_summary.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Save text summary
  const textReport = generateTextSummary(report, success, durationSeconds);
  const textReportPath = path.join(CONFIG.RESULTS_DIR, 'test_summary.txt');
  fs.writeFileSync(textReportPath, textReport);

  logSuccess(`\nReports saved to ${CONFIG.RESULTS_DIR}`);
  logSuccess(`- JSON: test_summary.json`);
  logSuccess(`- Text: test_summary.txt`);
}

function generateTextSummary(report, success, durationSeconds) {
  const lines = [];
  lines.push('='.repeat(70));
  lines.push('EGYGO TRIP-FIRST FLOW - E2E TEST SUMMARY');
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`Test Date: ${report.timestamp}`);
  lines.push(`Duration: ${durationSeconds}s`);
  lines.push(`Result: ${success ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('');
  lines.push('CONFIGURATION:');
  lines.push(`  Base URL: ${report.configuration.baseUrl}`);
  lines.push(`  Timeout: ${report.configuration.timeout}ms`);
  lines.push(`  Guide Token Provided: ${report.configuration.hasGuideToken ? 'Yes' : 'No'}`);
  lines.push(`  Place ID Provided: ${report.configuration.hasPlaceId ? 'Yes' : 'No'}`);
  lines.push('');
  lines.push('TEST STATE:');
  lines.push(`  Trip ID: ${report.testState.trip_id || 'N/A'}`);
  lines.push(`  Guide ID: ${report.testState.guide_id || 'N/A'}`);
  lines.push(`  Call ID: ${report.testState.call_id || 'N/A'}`);
  lines.push('');
  
  if (report.warnings.length > 0) {
    lines.push('WARNINGS:');
    report.warnings.forEach((warning, i) => {
      lines.push(`  ${i + 1}. ${warning}`);
    });
    lines.push('');
  }
  
  if (report.errors.length > 0) {
    lines.push('ERRORS:');
    report.errors.forEach((error, i) => {
      lines.push(`  ${i + 1}. ${error.message}`);
      if (error.response) {
        lines.push(`     Response: ${JSON.stringify(error.response)}`);
      }
    });
    lines.push('');
  }
  
  lines.push('STEP RESULTS:');
  if (report.results.createTrip) {
    lines.push('  ✅ Step 1: Create Trip');
  }
  if (report.results.getGuides) {
    lines.push('  ✅ Step 2: Get Compatible Guides');
  }
  if (report.results.selectGuide) {
    lines.push('  ✅ Step 3: Select Guide');
  }
  if (report.results.initiateCall) {
    lines.push('  ✅ Step 4: Initiate Call');
  }
  if (report.results.endCall) {
    lines.push('  ✅ Step 5: End Call');
  }
  if (report.results.guideAccept) {
    lines.push('  ✅ Step 6: Guide Accept');
  } else if (!report.configuration.hasGuideToken) {
    lines.push('  ⏭️  Step 6: Guide Accept (Skipped - No token)');
  }
  if (report.results.finalStatus) {
    lines.push('  ✅ Step 7: Verify Final Status');
  }
  lines.push('');
  lines.push('='.repeat(70));
  
  return lines.join('\n');
}

// ============================================================================
// RUN TEST
// ============================================================================

runE2ETest();
