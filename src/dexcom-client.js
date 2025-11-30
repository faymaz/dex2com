import https from 'https';

/**
 * DexcomClient - Dexcom Share API client with read and write capabilities
 * @class DexcomClient
 */
class DexcomClient {
  static Regions = {
    US: 'us',
    OUS: 'ous',
    JP: 'jp'
  };

  static BaseUrls = {
    us: 'https://share2.dexcom.com',
    ous: 'https://shareous1.dexcom.com',
    jp: 'https://shareous1.dexcom.com'
  };

  constructor(username, password, region = 'ous') {
    this.username = username;
    this.password = password;
    this.region = region.toLowerCase();
    this.baseUrl = DexcomClient.BaseUrls[this.region] || DexcomClient.BaseUrls.ous;
    this.applicationId = 'd89443d2-327c-4a6f-89e5-496bbb0317db';
    this.sessionId = null;
    this.accountId = null;
  }

  makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          const response = {
            status: res.statusCode,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            json: () => {
              try {
                return JSON.parse(responseData);
              } catch {
                return null;
              }
            },
            text: () => responseData
          };
          resolve(response);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  parseUrl(url, method = 'GET', extraHeaders = {}) {
    const parsedUrl = new URL(url);
    return {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      port: 443,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Dexcom Share/3.0.2.11',
        ...extraHeaders
      }
    };
  }

  async authenticate() {
    try {
      if (!this.accountId) {
        const authUrl = `${this.baseUrl}/ShareWebServices/Services/General/AuthenticatePublisherAccount`;
        const authOptions = this.parseUrl(authUrl, 'POST');

        const response = await this.makeRequest(authOptions, {
          accountName: this.username,
          password: this.password,
          applicationId: this.applicationId
        });

        if (!response.ok) {
          throw new Error(`Account authentication failed: ${response.status}`);
        }

        this.accountId = response.text().replace(/"/g, '');

        if (this.accountId === '00000000-0000-0000-0000-000000000000') {
          throw new Error('Invalid credentials');
        }
      }

      const loginUrl = `${this.baseUrl}/ShareWebServices/Services/General/LoginPublisherAccountById`;
      const loginOptions = this.parseUrl(loginUrl, 'POST');

      const loginResponse = await this.makeRequest(loginOptions, {
        accountId: this.accountId,
        password: this.password,
        applicationId: this.applicationId
      });

      if (!loginResponse.ok) {
        throw new Error(`Session login failed: ${loginResponse.status}`);
      }

      this.sessionId = loginResponse.text().replace(/"/g, '');

      if (this.sessionId === '00000000-0000-0000-0000-000000000000') {
        throw new Error('Login failed');
      }

      return this.sessionId;
    } catch (error) {
      throw new Error(`Authentication error: ${error.message}`);
    }
  }

  /**
   * Read glucose values from Dexcom Share
   * @param {number} minutes - Minutes of data to fetch
   * @param {number} maxCount - Maximum number of readings
   * @returns {Promise<Array>} Array of glucose readings
   */
  async readGlucoseValues(minutes = 1440, maxCount = 288) {
    if (!this.sessionId) {
      await this.authenticate();
    }

    try {
      const url = `${this.baseUrl}/ShareWebServices/Services/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${this.sessionId}&minutes=${minutes}&maxCount=${maxCount}`;
      const options = this.parseUrl(url, 'POST');
      const response = await this.makeRequest(options);

      if (response.status === 500) {
        const error = response.json();
        const errorMessage = error?.Message || 'Unknown';
        const isSessionError = error?.Code === 'SessionIdNotFound' ||
                               errorMessage.includes('Session not active') ||
                               errorMessage.includes('timed out');

        if (isSessionError) {
          this.sessionId = null;
          this.accountId = null;
          await this.authenticate();
          return this.readGlucoseValues(minutes, maxCount);
        }
        throw new Error(`Server error: ${errorMessage}`);
      }

      if (!response.ok) {
        throw new Error(`Failed to get readings: ${response.status}`);
      }

      const readings = response.json();
      if (!Array.isArray(readings)) {
        return [];
      }

      return readings;
    } catch (error) {
      const isSessionError = error.message.includes('SessionIdNotFound') ||
                             error.message.includes('Session not active') ||
                             error.message.includes('timed out');

      if (isSessionError) {
        this.sessionId = null;
        this.accountId = null;
        await this.authenticate();
        return this.readGlucoseValues(minutes, maxCount);
      }
      throw error;
    }
  }

  /**
   * Write glucose values to Dexcom Share
   * @param {string} serialNumber - Receiver serial number
   * @param {Array} egvs - Array of glucose readings to upload
   * @returns {Promise<boolean>} Success status
   */
  async writeGlucoseValues(serialNumber, egvs) {
    if (!this.sessionId) {
      await this.authenticate();
    }

    try {
      const url = `${this.baseUrl}/ShareWebServices/Services/Publisher/PostReceiverEgvRecords?sessionId=${this.sessionId}`;
      const options = this.parseUrl(url, 'POST');

      const payload = {
        SN: serialNumber,
        Egvs: egvs,
        TA: -new Date().getTimezoneOffset()
      };

      const response = await this.makeRequest(options, payload);

      if (response.status === 500) {
        const error = response.json();
        const errorMessage = error?.Message || response.text();
        const isSessionError = error?.Code === 'SessionIdNotFound' ||
                               errorMessage.includes('Session not active') ||
                               errorMessage.includes('timed out');

        if (isSessionError) {
          this.sessionId = null;
          this.accountId = null;
          await this.authenticate();
          return this.writeGlucoseValues(serialNumber, egvs);
        }
        throw new Error(`Server error: ${errorMessage}`);
      }

      if (!response.ok) {
        throw new Error(`Failed to write readings: ${response.status} - ${response.text()}`);
      }

      return true;
    } catch (error) {
      const isSessionError = error.message.includes('SessionIdNotFound') ||
                             error.message.includes('Session not active') ||
                             error.message.includes('timed out');

      if (isSessionError) {
        this.sessionId = null;
        this.accountId = null;
        await this.authenticate();
        return this.writeGlucoseValues(serialNumber, egvs);
      }
      throw error;
    }
  }

  /**
   * Register/update receiver for the account
   * @param {string} serialNumber - Receiver serial number
   * @returns {Promise<boolean>} Success status
   */
  async registerReceiver(serialNumber) {
    if (!this.sessionId) {
      await this.authenticate();
    }

    try {
      const url = `${this.baseUrl}/ShareWebServices/Services/Publisher/ReplacePublisherAccountMonitoredReceiver?sessionId=${this.sessionId}&sn=${serialNumber}`;
      const options = this.parseUrl(url, 'POST');

      const response = await this.makeRequest(options);

      if (!response.ok && response.status !== 500) {
        throw new Error(`Failed to register receiver: ${response.status}`);
      }

      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the latest single glucose reading
   * @returns {Promise<Object|null>} Latest reading or null
   */
  async getLatestReading() {
    const readings = await this.readGlucoseValues(10, 1);
    return readings.length > 0 ? readings[0] : null;
  }
}

export default DexcomClient;
