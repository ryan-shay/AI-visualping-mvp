#!/usr/bin/env node

// Test script to verify headless mode and Xvfb functionality
// Run with: node test-headless.js

import { newContext, closeSharedBrowser } from './dist/src/browser.js';
import { XvfbManager, getGlobalXvfb } from './dist/src/xvfb.js';

async function testXvfbCapabilities() {
  console.log('🖥️  Testing Xvfb capabilities...');
  
  // Test Xvfb availability
  const isAvailable = await XvfbManager.isXvfbAvailable();
  console.log(`   Xvfb available: ${isAvailable ? '✅' : '❌'}`);
  
  if (!isAvailable) {
    console.log(`   Installation command: ${XvfbManager.getInstallationInstructions()}`);
  }
  
  // Test headless environment detection
  const isHeadless = XvfbManager.isHeadlessEnvironment();
  console.log(`   Headless environment: ${isHeadless ? '✅' : '❌'}`);
  
  // Test if Xvfb should be used
  const shouldUse = XvfbManager.shouldUseXvfb();
  console.log(`   Should use Xvfb: ${shouldUse ? '✅' : '❌'}`);
  
  return { isAvailable, isHeadless, shouldUse };
}

async function testHeadlessMode() {
  console.log('🧪 Testing browser modes with Xvfb integration...');
  console.log('');
  
  try {
    // Test Xvfb capabilities first
    const xvfbInfo = await testXvfbCapabilities();
    console.log('');
    
    // Test headless mode (should be invisible)
    console.log('📱 Testing headless=true (invisible browser)...');
    const headlessContext = await newContext(true);
    const headlessPage = await headlessContext.newPage();
    await headlessPage.goto('https://example.com');
    const headlessTitle = await headlessPage.title();
    console.log(`✅ Headless mode works - page title: "${headlessTitle}"`);
    await headlessContext.close();
    console.log('');
    
    // Test headfull mode (may use Xvfb in headless environments)
    console.log('🖥️  Testing headless=false (visible/virtual browser)...');
    
    if (xvfbInfo.shouldUse && xvfbInfo.isAvailable) {
      console.log('   Xvfb will be used for virtual display...');
      
      // Get Xvfb instance to check status
      const xvfb = await getGlobalXvfb();
      if (xvfb) {
        const status = xvfb.getStatus();
        console.log(`   Xvfb status: ${status.running ? 'Running' : 'Stopped'} on ${status.display} (${status.resolution})`);
      }
    } else if (!xvfbInfo.isHeadless) {
      console.log('   Physical display available - browser window should appear...');
    } else {
      console.log('   ⚠️  No Xvfb available in headless environment - this may fail...');
    }
    
    const headfullContext = await newContext(false);
    const headfullPage = await headfullContext.newPage();
    await headfullPage.goto('https://example.com');
    const headfullTitle = await headfullPage.title();
    console.log(`✅ Headfull mode works - page title: "${headfullTitle}"`);
    
    // Test some interaction to verify the browser is functional
    console.log('   Testing page interaction...');
    const bodyText = await headfullPage.locator('body').innerText();
    console.log(`   Page content length: ${bodyText.length} characters`);
    
    // Keep the browser open briefly
    if (!xvfbInfo.isHeadless) {
      console.log('   Keeping browser open for 3 seconds so you can see it...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    await headfullContext.close();
    console.log('');
    
    // Test Tock-specific functionality if we're testing with a Tock URL
    console.log('🎯 Testing Tock scraper compatibility...');
    const tockTestUrl = 'https://exploretock.com/dhamaka';
    
    try {
      const tockContext = await newContext(false); // Use headfull for better Tock interaction
      const tockPage = await tockContext.newPage();
      
      console.log(`   Navigating to Tock test site: ${tockTestUrl}`);
      await tockPage.goto(tockTestUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Wait for dynamic content
      await tockPage.waitForTimeout(5000);
      
      const tockTitle = await tockPage.title();
      console.log(`   Tock page title: "${tockTitle}"`);
      
      // Check for reservation elements
      const reservationElements = await tockPage.locator('[data-testid="time-slot"], .time-slot, button:has-text("Reserve")').count();
      console.log(`   Found ${reservationElements} potential reservation elements`);
      
      await tockContext.close();
      console.log('✅ Tock compatibility test completed');
    } catch (tockError) {
      console.log(`⚠️  Tock test failed (this is normal): ${tockError.message}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await closeSharedBrowser();
    console.log('');
    console.log('🏁 All tests completed');
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Browser and Xvfb Test Script');
  console.log('');
  console.log('Usage: node test-headless.js [options]');
  console.log('');
  console.log('This script tests:');
  console.log('  - Headless browser functionality');
  console.log('  - Headfull browser functionality');
  console.log('  - Xvfb integration and virtual display');
  console.log('  - Tock scraper compatibility');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h    Show this help message');
  console.log('');
  process.exit(0);
}

testHeadlessMode();

