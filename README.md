# Dex2Com

Synchronize glucose data between Dexcom Share accounts across different regions.

## Why This Project Exists

This tool was created to solve a specific problem: using the Omnipod 5 iPhone App with an Omnipod 5 PDM device outside the United States. The Omnipod 5 App is only available in the US and requires access to US-based Dexcom Share servers and the Glooko app's US infrastructure. For users outside the US, this creates a barrier to using their preferred diabetes management tools.

Dex2Com bridges this gap by automatically synchronizing glucose readings from a US Dexcom Share account to a European (or other region) Dexcom Share account. This enables users to maintain glucose data in both regions simultaneously, making it possible to use region-specific diabetes management applications that rely on Dexcom Share data.

While originally built for the Omnipod 5 use case, this tool can be used by anyone who needs to mirror glucose data between two separate Dexcom accounts, regardless of the reason.

## Features

- Real-time glucose data synchronization between Dexcom Share accounts
- Support for US, EU/OUS, and JP Dexcom regions
- Automatic duplicate filtering to prevent data redundancy
- Daemon mode for continuous background synchronization
- Connection testing to verify account credentials
- Configurable sync intervals and data limits
- Zero dependencies beyond the standard Node.js runtime

## Requirements

- Node.js 18 or higher
- Two Dexcom Share accounts (source and destination)
- Dexcom Share feature enabled on both accounts

## Installation

### From npm

```bash
npm install -g dex2com
```

### From source

```bash
git clone https://github.com/faymaz/dex2com.git
cd dex2com
npm install
```

## Configuration

Create a `.env` file in your project directory:

```bash
cp .env.example .env
```

Edit the `.env` file with your account credentials:

```env
# Source account (where data is read from)
SOURCE_USERNAME=your_us_username
SOURCE_PASSWORD=your_us_password
SOURCE_REGION=us

# Destination account (where data is written to)
DEST_USERNAME=your_eu_username
DEST_PASSWORD=your_eu_password
DEST_REGION=ous

# Synchronization settings
SYNC_INTERVAL_MINUTES=5
MAX_READINGS_PER_SYNC=12
```

### Supported Regions

- `us` - United States (share2.dexcom.com)
- `ous` - Europe/International (shareous1.dexcom.com)
- `jp` - Japan

## Usage

### Test Connection

Verify that both accounts can be accessed successfully:

```bash
node index.js --test
```

### One-Time Sync

Perform a single synchronization:

```bash
node index.js --once
# or
npm run sync
```

### Daemon Mode

Run continuous synchronization in the background:

```bash
node index.js --daemon
# or
npm run daemon
```

### Running as a System Service

For Linux systems using systemd, you can set up Dex2Com to run automatically at boot.

Create a service file at `/etc/systemd/system/dex2com.service`:

```ini
[Unit]
Description=Dex2Com Glucose Sync Service
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/dex2com
ExecStart=/usr/bin/node index.js --daemon
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl enable dex2com
sudo systemctl start dex2com
sudo systemctl status dex2com
```

## How It Works

Dex2Com operates in three steps:

1. **Authentication**: Logs into both source and destination Dexcom Share accounts
2. **Data Retrieval**: Fetches the latest glucose readings from the source account
3. **Data Upload**: Writes new readings to the destination account using a virtual receiver

The synchronization process respects the Dexcom API rate limits and only uploads readings that don't already exist in the destination account.

## Example Output

```
Dex2Com v1.0.0 - Dexcom Share Account Sync
==========================================

[2024-01-15T10:30:00.000Z] [INFO] Starting Dex2Com daemon (interval: 5 minutes)
[2024-01-15T10:30:00.100Z] [INFO] Source: US -> Destination: OUS
[2024-01-15T10:30:01.500Z] [INFO] Registered receiver: DEX2COM0001
[2024-01-15T10:30:01.600Z] [INFO] Starting sync from US to OUS
[2024-01-15T10:30:02.000Z] [INFO] Read 3 readings from source
[2024-01-15T10:30:02.100Z] [INFO] 3 new readings to sync
[2024-01-15T10:30:03.000Z] [INFO] Successfully synced 3 readings
[2024-01-15T10:30:03.100Z] [INFO] Latest: 125 mg/dL (Flat) at 10:29:00
```

## Troubleshooting

### Invalid Credentials Error

- Verify your username and password are correct
- Ensure you can log into the Dexcom Share mobile app with the same credentials
- Check that you're using the correct region code

### No Readings Available

- Confirm that Share is enabled on the source account
- Verify that your Dexcom device is actively transmitting data
- Check that readings are visible in the Dexcom Share app

### Data Not Appearing in Destination Account

- Ensure Share is enabled on the destination account
- Run `node index.js --test` to verify both connections work
- Check the logs for any error messages during sync

## Technical Details

### API Endpoints

- Authentication: `AuthenticatePublisherAccount`
- Login: `LoginPublisherAccountById`
- Read: `ReadPublisherLatestGlucoseValues`
- Write: `PostReceiverEgvRecords`
- Register: `ReplacePublisherAccountMonitoredReceiver`

### Data Format

Glucose readings use the Dexcom proprietary date format:

```json
{
  "WT": "/Date(1705312140000)/",
  "ST": "/Date(1705312140000)/",
  "DT": "/Date(1705312140000+0300)/",
  "Value": 125,
  "Trend": "Flat"
}
```

## Privacy and Security

- All credentials are stored locally in your `.env` file
- No data is sent to any third-party servers
- Communication occurs directly between your machine and Dexcom's official API servers
- Passwords are transmitted over HTTPS only

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests on GitHub.

## License

MIT License - see LICENSE file for details

## Author

[faymaz](https://github.com/faymaz)

## Related Projects

- [jsdexcom](https://github.com/faymaz/jsdexcom) - JavaScript library for Dexcom Share API

## Disclaimer

This is an unofficial tool and is not affiliated with, endorsed by, or connected to Dexcom, Inc. or Insulet Corporation. Use at your own risk. Always verify glucose readings with your primary monitoring device.
