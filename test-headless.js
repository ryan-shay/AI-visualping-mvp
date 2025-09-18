#!/usr/bin/env node

// Simple test script to verify headless mode works
// Run with: node test-headless.js

import { newContext, closeSharedBrowser } from './dist/src/browser.js';

async function testHeadlessMode() {
  console.log('🧪 Testing headless mode...');
  
  try {
    // Test headless mode (should be invisible)
    console.log('Testing headless=true (invisible browser)...');
    const headlessContext = await newContext(true);
    const headlessPage = await headlessContext.newPage();
    await headlessPage.goto('https://example.com');
    console.log('✅ Headless mode works - browser was invisible');
    await headlessContext.close();
    
    // Test headfull mode (should show browser window)
    console.log('Testing headless=false (visible browser)...');
    console.log('You should see a browser window appear...');
    const headfullContext = await newContext(false);
    const headfullPage = await headfullContext.newPage();
    await headfullPage.goto('https://example.com');
    console.log('✅ Headfull mode works - browser window should be visible');
    
    // Keep the browser open for a few seconds so you can see it
    console.log('Keeping browser open for 5 seconds so you can see it...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await headfullContext.close();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await closeSharedBrowser();
    console.log('🏁 Test completed');
  }
}

testHeadlessMode();
