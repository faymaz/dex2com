import 'dotenv/config';
import Dex2ComSyncer from './src/syncer.js';

// Parse command line arguments
const args = process.argv.slice(2);
const isOnce = args.includes('--once');
const isDaemon = args.includes('--daemon');
const isTest = args.includes('--test');
const isVerify = args.includes('--verify');

// Load configuration from environment
const config = {
  source: {
    username: process.env.SOURCE_USERNAME,
    password: process.env.SOURCE_PASSWORD,
    region: process.env.SOURCE_REGION || 'us'
  },
  dest: {
    username: process.env.DEST_USERNAME,
    password: process.env.DEST_PASSWORD,
    region: process.env.DEST_REGION || 'ous'
  },
  syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 5,
  maxReadingsPerSync: parseInt(process.env.MAX_READINGS_PER_SYNC) || 12,
  serialNumber: process.env.SERIAL_NUMBER || 'DEX2COM0001'
};

// Validate configuration
function validateConfig() {
  const required = [
    ['SOURCE_USERNAME', config.source.username],
    ['SOURCE_PASSWORD', config.source.password],
    ['DEST_USERNAME', config.dest.username],
    ['DEST_PASSWORD', config.dest.password]
  ];

  const missing = required.filter(([name, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(name => console.error(`  - ${name}`));
    console.error('\nPlease copy .env.example to .env and fill in your credentials.');
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
Dex2Com - Dexcom Share Account Sync Tool

Usage:
  node index.js [options]

Options:
  --once     Run a single sync and exit
  --daemon   Run continuous sync at configured interval
  --test     Test connections to both accounts
  --verify   Read latest values from EU to verify upload

Environment Variables:
  SOURCE_USERNAME, SOURCE_PASSWORD, SOURCE_REGION
  DEST_USERNAME, DEST_PASSWORD, DEST_REGION
  SYNC_INTERVAL_MINUTES, MAX_READINGS_PER_SYNC

Example:
  # Copy and edit configuration
  cp .env.example .env
  nano .env

  # Test connections
  node index.js --test

  # Run once
  node index.js --once

  # Run as daemon
  node index.js --daemon
`);
}

async function main() {
  console.log('Dex2Com v1.0.0 - Dexcom Share Account Sync');
  console.log('==========================================\n');

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  validateConfig();

  const syncer = new Dex2ComSyncer(config);

  if (isTest) {
    console.log('Testing connections...\n');
    const results = await syncer.testConnections();

    console.log('\nResults:');
    console.log(`  Source (${config.source.region.toUpperCase()}): ${results.source.success ? '✓ OK' : '✗ FAILED'}`);
    if (results.source.latestValue) {
      console.log(`    Latest reading: ${results.source.latestValue} mg/dL`);
    }
    console.log(`  Destination (${config.dest.region.toUpperCase()}): ${results.dest.success ? '✓ OK' : '✗ FAILED'}`);

    if (!results.source.success || !results.dest.success) {
      process.exit(1);
    }
    return;
  }

  if (isVerify) {
    console.log('Verifying EU account data...\n');

    try {
      const readings = await syncer.destClient.readGlucoseValues(60, 10);

      if (readings.length === 0) {
        console.log('No readings found in EU account.');
        console.log('\nPossible reasons:');
        console.log('  - Data not yet uploaded');
        console.log('  - Share feature not enabled on EU account');
        console.log('  - Dexcom may not accept external uploads');
      } else {
        console.log(`Found ${readings.length} readings in EU account:\n`);

        readings.slice(0, 5).forEach((reading, i) => {
          const timestamp = new Date(parseInt(reading.WT.match(/\d+/)[0]));
          console.log(`  ${i + 1}. ${reading.Value} mg/dL (${reading.Trend}) - ${timestamp.toLocaleString()}`);
        });

        if (readings.length > 5) {
          console.log(`  ... and ${readings.length - 5} more`);
        }

        console.log('\n✓ Data successfully uploaded to EU account!');
      }
    } catch (error) {
      console.error('Failed to read from EU:', error.message);
      process.exit(1);
    }
    return;
  }

  if (isOnce) {
    const result = await syncer.sync();
    if (!result.success) {
      process.exit(1);
    }
    console.log(`\nSync complete: ${result.writeCount} readings synced`);
    return;
  }

  if (isDaemon || (!isOnce && !isTest)) {
    await syncer.runDaemon(config.syncIntervalMinutes);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
