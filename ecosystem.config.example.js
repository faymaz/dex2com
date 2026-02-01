module.exports = {
  apps: [
    {
      name: 'dex2com',
      script: 'index.js',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        // Source account (US - where data is read from)
        SOURCE_USERNAME: 'your_us_username',
        SOURCE_PASSWORD: 'your_us_password',
        SOURCE_REGION: 'us',

        // Destination account (EU - where data is written to)
        DEST_USERNAME: 'your_eu_username',
        DEST_PASSWORD: 'your_eu_password',
        DEST_REGION: 'ous',

        // Sync settings
        SYNC_INTERVAL_MINUTES: '5',
        MAX_READINGS_PER_SYNC: '12',

        // Logging
        LOG_LEVEL: 'info'
      }
    }
  ]
};

// Usage:
// 1. Copy this file: cp ecosystem.config.example.js ecosystem.config.js
// 2. Edit ecosystem.config.js with your credentials
// 3. Start with PM2: pm2 start ecosystem.config.js
//
// PM2 Commands:
// pm2 logs dex2com     - View logs
// pm2 stop dex2com     - Stop the service
// pm2 restart dex2com  - Restart the service
// pm2 delete dex2com   - Remove from PM2
// pm2 save             - Save process list for auto-start on reboot
// pm2 startup          - Generate startup script
