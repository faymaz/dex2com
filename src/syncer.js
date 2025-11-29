import DexcomClient from './dexcom-client.js';

/**
 * Dex2Com Syncer - Synchronizes glucose data between two Dexcom Share accounts
 * @class Dex2ComSyncer
 */
class Dex2ComSyncer {
  constructor(config) {
    this.config = config;

    this.sourceClient = new DexcomClient(
      config.source.username,
      config.source.password,
      config.source.region
    );

    this.destClient = new DexcomClient(
      config.dest.username,
      config.dest.password,
      config.dest.region
    );

    this.lastSyncTime = null;
    this.syncedTimestamps = new Set();
    this.serialNumber = config.serialNumber || 'DEX2COM0001';
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * Extract timestamp from Dexcom date format
   * @param {string} dexcomDate - Date string like "/Date(1234567890000)/"
   * @returns {number} Unix timestamp in milliseconds
   */
  extractTimestamp(dexcomDate) {
    const match = dexcomDate.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  /**
   * Perform a single sync operation
   * @returns {Promise<Object>} Sync result with statistics
   */
  async sync() {
    const result = {
      success: false,
      readCount: 0,
      writeCount: 0,
      skippedCount: 0,
      errors: []
    };

    try {
      this.log('info', `Starting sync from ${this.config.source.region.toUpperCase()} to ${this.config.dest.region.toUpperCase()}`);

      // Read from source
      const minutes = this.config.syncIntervalMinutes * 3 || 15;
      const maxCount = this.config.maxReadingsPerSync || 12;

      const readings = await this.sourceClient.readGlucoseValues(minutes, maxCount);
      result.readCount = readings.length;

      if (readings.length === 0) {
        this.log('info', 'No readings available from source');
        result.success = true;
        return result;
      }

      this.log('info', `Read ${readings.length} readings from source`);

      // Filter out already synced readings
      const newReadings = readings.filter(reading => {
        const timestamp = this.extractTimestamp(reading.WT);
        return !this.syncedTimestamps.has(timestamp);
      });

      result.skippedCount = readings.length - newReadings.length;

      if (newReadings.length === 0) {
        this.log('info', 'All readings already synced');
        result.success = true;
        return result;
      }

      this.log('info', `${newReadings.length} new readings to sync`);

      // Format readings for upload
      const egvs = newReadings.map(reading => ({
        Trend: reading.Trend,
        ST: reading.ST,
        DT: reading.DT,
        Value: reading.Value
      }));

      // Write to destination
      await this.destClient.writeGlucoseValues(this.serialNumber, egvs);
      result.writeCount = egvs.length;

      // Mark as synced
      newReadings.forEach(reading => {
        const timestamp = this.extractTimestamp(reading.WT);
        this.syncedTimestamps.add(timestamp);
      });

      // Cleanup old timestamps (keep last 24 hours)
      this.cleanupOldTimestamps();

      this.lastSyncTime = new Date();
      result.success = true;

      this.log('info', `Successfully synced ${result.writeCount} readings`);

      // Log latest reading info
      const latest = newReadings[0];
      const latestTime = new Date(this.extractTimestamp(latest.WT));
      this.log('info', `Latest: ${latest.Value} mg/dL (${latest.Trend}) at ${latestTime.toLocaleTimeString()}`);

    } catch (error) {
      result.errors.push(error.message);
      this.log('error', `Sync failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Clean up timestamps older than 24 hours
   */
  cleanupOldTimestamps() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    const oldSize = this.syncedTimestamps.size;

    this.syncedTimestamps = new Set(
      [...this.syncedTimestamps].filter(ts => ts > cutoff)
    );

    const cleaned = oldSize - this.syncedTimestamps.size;
    if (cleaned > 0) {
      this.log('debug', `Cleaned ${cleaned} old timestamps`);
    }
  }

  /**
   * Run continuous sync at specified interval
   * @param {number} intervalMinutes - Sync interval in minutes
   */
  async runDaemon(intervalMinutes = 5) {
    this.log('info', `Starting Dex2Com daemon (interval: ${intervalMinutes} minutes)`);
    this.log('info', `Source: ${this.config.source.region.toUpperCase()} -> Destination: ${this.config.dest.region.toUpperCase()}`);

    // Register receiver on destination
    try {
      await this.destClient.registerReceiver(this.serialNumber);
      this.log('info', `Registered receiver: ${this.serialNumber}`);
    } catch (error) {
      this.log('warn', `Could not register receiver: ${error.message}`);
    }

    // Initial sync
    await this.sync();

    // Set up interval
    const intervalMs = intervalMinutes * 60 * 1000;

    setInterval(async () => {
      await this.sync();
    }, intervalMs);

    this.log('info', 'Daemon running. Press Ctrl+C to stop.');
  }

  /**
   * Test connection to both accounts
   * @returns {Promise<Object>} Connection test results
   */
  async testConnections() {
    const results = {
      source: { success: false, error: null },
      dest: { success: false, error: null }
    };

    // Test source
    try {
      await this.sourceClient.authenticate();
      const reading = await this.sourceClient.getLatestReading();
      results.source.success = true;
      results.source.latestValue = reading?.Value;
      this.log('info', `Source (${this.config.source.region.toUpperCase()}) connection OK`);
    } catch (error) {
      results.source.error = error.message;
      this.log('error', `Source connection failed: ${error.message}`);
    }

    // Test destination
    try {
      await this.destClient.authenticate();
      results.dest.success = true;
      this.log('info', `Destination (${this.config.dest.region.toUpperCase()}) connection OK`);
    } catch (error) {
      results.dest.error = error.message;
      this.log('error', `Destination connection failed: ${error.message}`);
    }

    return results;
  }
}

export default Dex2ComSyncer;
