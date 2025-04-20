const express = require('express');
const config = require('config');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const si = require('systeminformation');
const os = require('os');
const { exec } = require('child_process');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

// Import modules
const { setupDatabase } = require('./database');
const { setupPrometheus } = require('./prometheus');
const { formatAlert } = require('./alertFormatter');

// Create logs directory if it doesn't exist
const logDir = path.dirname(config.get('monitoring.logFile'));
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Configure logger
const logger = winston.createLogger({
  level: config.get('monitoring.logLevel'),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: config.get('monitoring.logFile') }),
    new winston.transports.Console()
  ]
});

// Initialize Express app
const app = express();
const port = 3000;

// Initialize Telegram bot
const botToken = config.get('telegram.botToken');
const chatId = config.get('telegram.chatId');
const bot = new TelegramBot(botToken, { polling: false });

// Initialize database if enabled
let db = null;
if (config.get('database.enabled')) {
  db = setupDatabase();
}

// Initialize Prometheus if enabled
let prometheus = null;
if (config.get('prometheus.enabled')) {
  prometheus = setupPrometheus();
  
  // Setup Prometheus endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', prometheus.register.contentType);
    res.end(await prometheus.register.metrics());
  });
}

// Store last alert times to prevent alert flooding
const lastAlertTimes = {
  ram: 0,
  cpu: 0,
  disk: 0,
  swap: 0,
  load: 0,
  network: 0
};

// Get system information
async function getSystemInfo() {
  try {
    const hostname = os.hostname();
    let ipAddress = '127.0.0.1';
    
    // Get IP address
    const networkInterfaces = os.networkInterfaces();
    Object.keys(networkInterfaces).forEach(ifName => {
      networkInterfaces[ifName].forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal) {
          ipAddress = iface.address;
        }
      });
    });
    
    // Get OS info
    const osInfo = await si.osInfo();
    
    // Get uptime
    const uptimeSeconds = os.uptime();
    const uptimeDays = Math.floor(uptimeSeconds / 86400);
    const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    let uptime = '';
    if (uptimeDays > 0) {
      uptime = `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`;
    } else if (uptimeHours > 0) {
      uptime = `${uptimeHours}h ${uptimeMinutes}m`;
    } else {
      uptime = `${uptimeMinutes}m`;
    }
    
    // Get memory info
    const memInfo = await si.mem();
    const totalMemoryGB = (memInfo.total / (1024 ** 3)).toFixed(1);
    const ramUsage = Math.round((memInfo.used / memInfo.total) * 100);
    
    // Get CPU info
    const cpuInfo = await si.cpu();
    const cpuLoad = await si.currentLoad();
    const cpuUsage = Math.round(cpuLoad.currentLoad);
    
    // Get disk info
    const diskPath = config.get('disk.path');
    const fsSize = await si.fsSize();
    let diskInfo = fsSize.find(fs => fs.mount === diskPath) || fsSize[0];
    const totalDiskGB = (diskInfo.size / (1024 ** 3)).toFixed(1);
    const diskUsage = Math.round(diskInfo.use);
    
    return {
      hostname,
      ip: ipAddress,
      os: `${osInfo.distro} ${osInfo.release}`,
      kernel: osInfo.kernel,
      uptime,
      ramUsage,
      totalRam: `${totalMemoryGB}Gi`,
      cpuUsage,
      diskUsage,
      totalDisk: `${totalDiskGB}G`
    };
  } catch (error) {
    logger.error(`Error getting system info: ${error.message}`);
    return {
      hostname: os.hostname(),
      ip: '127.0.0.1',
      os: 'Unknown',
      kernel: 'Unknown',
      uptime: 'Unknown',
      ramUsage: 0,
      totalRam: '0Gi',
      cpuUsage: 0,
      diskUsage: 0,
      totalDisk: '0G'
    };
  }
}

// Get top processes by resource usage
async function getTopProcesses(resourceType, count = 3) {
  try {
    if (resourceType === 'RAM') {
      const processes = await si.processes();
      const sortedProcesses = processes.list
        .sort((a, b) => b.memPercent - a.memPercent)
        .slice(0, count);
      
      return sortedProcesses.map(proc => {
        return `  - ${proc.name.padEnd(15)} (${proc.memPercent.toFixed(1)}%)`;
      }).join('\n');
    } else if (resourceType === 'CPU') {
      const processes = await si.processes();
      const sortedProcesses = processes.list
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, count);
      
      return sortedProcesses.map(proc => {
        return `  - ${proc.name.padEnd(15)} (${proc.cpu.toFixed(1)}%)`;
      }).join('\n');
    } else if (resourceType === 'Disk') {
      return new Promise((resolve, reject) => {
        const diskPath = config.get('disk.path');
        exec(`du -h ${diskPath}/* 2>/dev/null | sort -rh | head -n ${count}`, (error, stdout) => {
          if (error && error.code !== 1) {
            resolve('Could not get disk usage information');
            return;
          }
          
          const lines = stdout.trim().split('\n');
          const result = lines.map(line => {
            if (!line) return '';
            const parts = line.split('\t');
            if (parts.length !== 2) return '';
            
            const size = parts[0];
            const path = parts[1].split('/').pop();
            return `  - /${path.padEnd(15)} ${size}`;
          }).filter(line => line);
          
          resolve(result.join('\n'));
        });
      });
    }
    
    return 'Unknown resource type';
  } catch (error) {
    logger.error(`Error getting top processes: ${error.message}`);
    return `Could not get ${resourceType} process information`;
  }
}

// Check RAM usage
async function checkRamUsage() {
  try {
    const memInfo = await si.mem();
    return Math.round((memInfo.used / memInfo.total) * 100);
  } catch (error) {
    logger.error(`Error checking RAM usage: ${error.message}`);
    return 0;
  }
}

// Check CPU usage
async function checkCpuUsage() {
  if (!config.get('cpu.monitor')) {
    return 0;
  }
  
  try {
    const cpuLoad = await si.currentLoad();
    return Math.round(cpuLoad.currentLoad);
  } catch (error) {
    logger.error(`Error checking CPU usage: ${error.message}`);
    return 0;
  }
}

// Check disk usage
async function checkDiskUsage() {
  if (!config.get('disk.monitor')) {
    return 0;
  }
  
  try {
    const diskPath = config.get('disk.path');
    const fsSize = await si.fsSize();
    const diskInfo = fsSize.find(fs => fs.mount === diskPath) || fsSize[0];
    return Math.round(diskInfo.use);
  } catch (error) {
    logger.error(`Error checking disk usage: ${error.message}`);
    return 0;
  }
}

// Check swap usage
async function checkSwapUsage() {
  if (!config.get('swap.monitor')) {
    return 0;
  }
  
  try {
    const memInfo = await si.mem();
    if (memInfo.swaptotal === 0) {
      return 0;
    }
    return Math.round((memInfo.swapused / memInfo.swaptotal) * 100);
  } catch (error) {
    logger.error(`Error checking swap usage: ${error.message}`);
    return 0;
  }
}

// Check load average
async function checkLoadAverage() {
  if (!config.get('load.monitor')) {
    return 0;
  }
  
  try {
    const load = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const loadPerCore = load / cpuCount;
    
    // Convert to percentage for threshold comparison
    return Math.round(loadPerCore * 100);
  } catch (error) {
    logger.error(`Error checking load average: ${error.message}`);
    return 0;
  }
}

// Check network usage
async function checkNetworkUsage() {
  if (!config.get('network.monitor')) {
    return [0, 0];
  }
  
  try {
    const networkInterface = config.get('network.interface');
    const networkStats1 = await si.networkStats(networkInterface);
    
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const networkStats2 = await si.networkStats(networkInterface);
    
    // Calculate rates in Mbps
    const rxRate = ((networkStats2[0].rx_bytes - networkStats1[0].rx_bytes) * 8) / 1024 / 1024;
    const txRate = ((networkStats2[0].tx_bytes - networkStats1[0].tx_bytes) * 8) / 1024 / 1024;
    
    return [rxRate, txRate];
  } catch (error) {
    logger.error(`Error checking network usage: ${error.message}`);
    return [0, 0];
  }
}

// Send Telegram alert
async function sendTelegramAlert(alertType, usageValue) {
  const currentTime = Math.floor(Date.now() / 1000);
  const alertInterval = config.get('monitoring.checkInterval') * 10; // Minimum time between alerts
  
  // Check if we should send an alert (rate limiting)
  const alertKey = alertType.toLowerCase();
  if (!lastAlertTimes[alertKey]) {
    lastAlertTimes[alertKey] = 0;
  }
  
  const timeSinceLastAlert = currentTime - lastAlertTimes[alertKey];
  if (timeSinceLastAlert < alertInterval) {
    logger.debug(`${alertType} alert rate limited (${timeSinceLastAlert}s since last alert)`);
    return false;
  }
  
  try {
    // Get system info for alert
    const systemInfo = await getSystemInfo();
    
    // Format alert message
    const message = await formatAlert(alertType, usageValue, systemInfo);
    
    // Log the message
    logger.info('-'.repeat(40));
    logger.info(message);
    
    // Send to Telegram with retry
    const maxRetries = 3;
    let retry = 0;
    let success = false;
    
    while (retry < maxRetries && !success) {
      try {
        logger.debug(`Sending Telegram message: ${alertType}`);
        
        await bot.sendMessage(chatId, message);
        
        logger.info(`${alertType} alert message successfully sent to Telegram`);
        success = true;
        lastAlertTimes[alertKey] = currentTime;
        
        // Update Prometheus counter if enabled
        if (prometheus && config.get('prometheus.enabled')) {
          switch (alertType) {
            case 'RAM':
              prometheus.ramAlerts.inc();
              break;
            case 'CPU':
              prometheus.cpuAlerts.inc();
              break;
            case 'Disk':
              prometheus.diskAlerts.inc();
              break;
            case 'Swap':
              prometheus.swapAlerts.inc();
              break;
            case 'Load':
              prometheus.loadAlerts.inc();
              break;
            case 'Network':
              prometheus.networkAlerts.inc();
              break;
          }
        }
        
        // Store alert in database if enabled
        if (db && config.get('database.enabled')) {
          await storeAlert(alertType, usageValue, message, true);
        }
      } catch (error) {
        retry++;
        logger.warn(`Error sending Telegram message (attempt ${retry}/${maxRetries}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
      }
    }
    
    // If all retries failed
    if (!success) {
      logger.error(`Failed to send Telegram message after ${maxRetries} attempts`);
      logger.error(`BOT_TOKEN: ${botToken.substring(0, 5)}...${botToken.substring(botToken.length - 5)}`);
      logger.error(`CHAT_ID: ${chatId}`);
      
      // Store failed alert in database if enabled
      if (db && config.get('database.enabled')) {
        await storeAlert(alertType, usageValue, message, false);
      }
      
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error(`Error in sendTelegramAlert: ${error.message}`);
    return false;
  }
}

// Test Telegram connection
async function testTelegramConnection() {
  logger.info('Testing Telegram connection...');
  
  try {
    // Get system info for test message
    const systemInfo = await getSystemInfo();
    const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // Format test message
    let message;
    
    if (config.get('alertFormat.enabled')) {
      const width = config.get('alertFormat.width');
      const linePrefix = config.get('alertFormat.linePrefix');
      const lineSuffix = config.get('alertFormat.lineSuffix');
      const contentWidth = width - linePrefix.length - lineSuffix.length;
      
      message = [];
      message.push(config.get('alertFormat.topBorder'));
      message.push(`${linePrefix}🔄 SYSTEM MONITOR TEST MESSAGE${' '.repeat(contentWidth - '🔄 SYSTEM MONITOR TEST MESSAGE'.length)}${lineSuffix}`);
      message.push(config.get('alertFormat.titleBorder'));
      message.push(`${linePrefix}🖥️ Hostname:     ${systemInfo.hostname}${' '.repeat(contentWidth - '🖥️ Hostname:     '.length - systemInfo.hostname.length)}${lineSuffix}`);
      message.push(`${linePrefix}🌐 IP Address:   ${systemInfo.ip}${' '.repeat(contentWidth - '🌐 IP Address:   '.length - systemInfo.ip.length)}${lineSuffix}`);
      message.push(`${linePrefix}⏱️ Time:         ${dateStr}${' '.repeat(contentWidth - '⏱️ Time:         '.length - dateStr.length)}${lineSuffix}`);
      message.push(config.get('alertFormat.bottomBorder'));
      message = message.join('\n');
    } else {
      message = "🔄 SYSTEM MONITOR TEST MESSAGE\n\n";
      message += `🖥️ Hostname: ${systemInfo.hostname}\n`;
      message += `🌐 IP Address: ${systemInfo.ip}\n`;
      message += `⏱️ Time: ${dateStr}`;
    }
    
    // Send test message
    await bot.sendMessage(chatId, message);
    
    logger.info('Telegram connection test successful');
    return true;
  } catch (error) {
    logger.error(`Telegram connection test failed: ${error.message}`);
    logger.error(`BOT_TOKEN: ${botToken.substring(0, 5)}...${botToken.substring(botToken.length - 5)}`);
    logger.error(`CHAT_ID: ${chatId}`);
    return false;
  }
}

// Store metrics in database
async function storeMetrics(metrics, systemInfo) {
  if (!db || !config.get('database.enabled')) {
    return false;
  }
  
  try {
    // Extract network metrics
    let networkRx = 0;
    let networkTx = 0;
    if (metrics.network && Array.isArray(metrics.network) && metrics.network.length === 2) {
      [networkRx, networkTx] = metrics.network;
    }
    
    // Prepare extra data (anything not in standard columns)
    const extraData = {};
    Object.keys(metrics).forEach(key => {
      if (!['ram', 'cpu', 'disk', 'swap', 'load', 'network'].includes(key)) {
        extraData[key] = metrics[key];
      }
    });
    
    const extraDataJson = Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null;
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    await db.storeMetrics(
      timestamp,
      systemInfo.hostname,
      systemInfo.ip,
      metrics.ram || 0,
      metrics.cpu || 0,
      metrics.disk || 0,
      metrics.swap || 0,
      metrics.load || 0,
      networkRx,
      networkTx,
      extraDataJson
    );
    
    logger.debug('Metrics stored in database successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to store metrics in database: ${error.message}`);
    return false;
  }
}

// Store alert in database
async function storeAlert(alertType, value, message, sentSuccessfully) {
  if (!db || !config.get('database.enabled')) {
    return false;
  }
  
  try {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const systemInfo = await getSystemInfo();
    
    await db.storeAlert(
      timestamp,
      systemInfo.hostname,
      alertType,
      String(value),
      message,
      sentSuccessfully
    );
    
    logger.debug(`Alert stored in database successfully: ${alertType}`);
    return true;
  } catch (error) {
    logger.error(`Failed to store alert in database: ${error.message}`);
    return false;
  }
}

// Update Prometheus metrics
function updatePrometheusMetrics(metrics) {
  if (!prometheus || !config.get('prometheus.enabled')) {
    return false;
  }
  
  try {
    // Update resource usage gauges
    prometheus.ramUsage.set(metrics.ram || 0);
    prometheus.cpuUsage.set(metrics.cpu || 0);
    prometheus.diskUsage.set(metrics.disk || 0);
    prometheus.swapUsage.set(metrics.swap || 0);
    prometheus.loadAverage.set(metrics.load || 0);
    
    // Update network metrics
    if (metrics.network && Array.isArray(metrics.network) && metrics.network.length === 2) {
      prometheus.networkRx.set(metrics.network[0]);
      prometheus.networkTx.set(metrics.network[1]);
    }
    
    logger.debug('Prometheus metrics updated successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to update Prometheus metrics: ${error.message}`);
    return false;
  }
}

// Update status file
function updateStatusFile(metrics) {
  try {
    const statusFile = path.join(os.tmpdir(), 'memory-monitor-status.tmp');
    const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    let statusContent = `Last check: ${dateStr}\n`;
    
    Object.keys(metrics).forEach(key => {
      if (key === 'ram') {
        statusContent += `RAM: ${metrics[key]}%\n`;
      } else if (key === 'cpu' && config.get('cpu.monitor')) {
        statusContent += `CPU: ${metrics[key]}%\n`;
      } else if (key === 'disk' && config.get('disk.monitor')) {
        statusContent += `Disk (${config.get('disk.path')}): ${metrics[key]}%\n`;
      } else if (key === 'swap' && config.get('swap.monitor') && metrics[key] > 0) {
        statusContent += `Swap: ${metrics[key]}%\n`;
      } else if (key === 'load' && config.get('load.monitor')) {
        const loadPerCore = metrics[key] / 100; // Convert back from percentage
        const load1min = loadPerCore * os.cpus().length;
        statusContent += `Load: ${load1min.toFixed(2)} (per core: ${loadPerCore.toFixed(2)})\n`;
      } else if (key === 'network' && config.get('network.monitor')) {
        const [rxRate, txRate] = metrics[key];
        statusContent += `Network (${config.get('network.interface') || 'default'}): RX: ${rxRate.toFixed(2)} Mbps, TX: ${txRate.toFixed(2)} Mbps\n`;
      }
    });
    
    fs.writeFileSync(statusFile, statusContent);
  } catch (error) {
    logger.error(`Error updating status file: ${error.message}`);
  }
}

// Main monitoring function
async function runMonitoring() {
  logger.info(`Monitoring started. Interval: ${config.get('monitoring.checkInterval')} seconds`);
  
  // Test Telegram connection at startup
  await testTelegramConnection();
  
  // Schedule monitoring task
  cron.schedule(`*/${config.get('monitoring.checkInterval')} * * * * *`, async () => {
    try {
      // Collect all metrics
      const metrics = {
        ram: await checkRamUsage(),
        cpu: await checkCpuUsage(),
        disk: await checkDiskUsage(),
        swap: await checkSwapUsage(),
        load: await checkLoadAverage(),
        network: await checkNetworkUsage()
      };
      
      // Get system info for database and alerts
      const systemInfo = await getSystemInfo();
      
      // Store metrics in database if enabled
      if (config.get('database.enabled')) {
        await storeMetrics(metrics, systemInfo);
      }
      
      // Update Prometheus metrics if enabled
      if (config.get('prometheus.enabled')) {
        updatePrometheusMetrics(metrics);
      }
      
      // Update status file
      updateStatusFile(metrics);
      
      // Check thresholds and send alerts
      
      // RAM check
      if (metrics.ram >= config.get('monitoring.threshold')) {
        logger.warn(`High RAM usage: ${metrics.ram}%`);
        await sendTelegramAlert('RAM', `${metrics.ram}%`);
      }
      
      // CPU check
      if (config.get('cpu.monitor') && metrics.cpu >= config.get('cpu.threshold')) {
        logger.warn(`High CPU usage: ${metrics.cpu}%`);
        await sendTelegramAlert('CPU', `${metrics.cpu}%`);
      }
      
      // Disk check
      if (config.get('disk.monitor') && metrics.disk >= config.get('disk.threshold')) {
        logger.warn(`High disk usage (${config.get('disk.path')}): ${metrics.disk}%`);
        await sendTelegramAlert('Disk', `${metrics.disk}%`);
      }
      
      // Swap check
      if (config.get('swap.monitor') && metrics.swap >= config.get('swap.threshold') && metrics.swap > 0) {
        logger.warn(`High swap usage: ${metrics.swap}%`);
        await sendTelegramAlert('Swap', `${metrics.swap}%`);
      }
      
      // Load check
      if (config.get('load.monitor') && metrics.load >= config.get('load.threshold')) {
        const loadPerCore = metrics.load / 100; // Convert back from percentage
        const load1min = loadPerCore * os.cpus().length;
        logger.warn(`High load average: ${load1min.toFixed(2)} (per core: ${loadPerCore.toFixed(2)})`);
        await sendTelegramAlert('Load', `${load1min.toFixed(2)} (per core: ${loadPerCore.toFixed(2)})`);
      }
      
      // Network check
      if (config.get('network.monitor')) {
        const [rxRate, txRate] = metrics.network;
        if (rxRate >= config.get('network.threshold') || txRate >= config.get('network.threshold')) {
          logger.warn(`High network traffic (${config.get('network.interface') || 'default'}): RX: ${rxRate.toFixed(2)} Mbps, TX: ${txRate.toFixed(2)} Mbps`);
          await sendTelegramAlert('Network', `RX: ${rxRate.toFixed(2)} Mbps, TX: ${txRate.toFixed(2)} Mbps`);
        }
      }
    } catch (error) {
      logger.error(`Error in monitoring process: ${error.message}`);
    }
  });
}

// API routes
app.get('/', (req, res) => {
  res.send('Memory Monitor API is running');
});

app.get('/status', async (req, res) => {
  try {
    const systemInfo = await getSystemInfo();
    const ramUsage = await checkRamUsage();
    const cpuUsage = await checkCpuUsage();
    const diskUsage = await checkDiskUsage();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      system: systemInfo,
      metrics: {
        ram: ramUsage,
        cpu: cpuUsage,
        disk: diskUsage
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

app.get('/test-telegram', async (req, res) => {
  try {
    const result = await testTelegramConnection();
    if (result) {
      res.json({
        status: 'ok',
        message: 'Telegram test message sent successfully'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Failed to send Telegram test message'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Start server and monitoring
async function startServer() {
  try {
    // Create data directory if database is enabled
    if (config.get('database.enabled')) {
      const dbType = config.get('database.type');
      if (dbType === 'sqlite') {
        const dbPath = config.get('database.sqlite.path');
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
      }
    }
    
    // Start Express server
    app.listen(port, () => {
      logger.info(`Memory Monitor server listening on port ${port}`);
      
      // Start monitoring
      runMonitoring();
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// Start the application
startServer();

module.exports = app;
