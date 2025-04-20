const config = require('config');
const TelegramBot = require('node-telegram-bot-api');
const { getTopProcesses } = require('./systemUtils');

// Initialize Telegram bot
const botToken = config.get('telegram.botToken');
const chatId = config.get('telegram.chatId');
const bot = new TelegramBot(botToken, { polling: false });

// Format alert message according to configuration settings
async function formatAlert(alertType, usageValue, systemInfo) {
  if (!config.get('alertFormat.enabled')) {
    // Use simple text format if custom formatting is disabled
    const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    let message = `${config.get('monitoring.alertMessageTitle')}\n\n`;
    message += `Date: ${dateStr}\n`;
    message += `Hostname: ${systemInfo.hostname}\n`;
    message += `IP Address: ${systemInfo.ip}\n`;
    message += `Uptime: ${systemInfo.uptime}\n`;
    message += `OS: ${systemInfo.os}\n`;
    message += `Kernel: ${systemInfo.kernel}\n\n`;
    
    // Get current resource usage
    const ramUsage = systemInfo.ramUsage;
    const cpuUsage = systemInfo.cpuUsage;
    const diskUsage = systemInfo.diskUsage;
    
    message += `RAM Usage: ${ramUsage}% of ${systemInfo.totalRam}\n`;
    message += `CPU Usage: ${cpuUsage}%\n`;
    message += `Disk Usage: ${diskUsage}% of ${systemInfo.totalDisk}\n\n`;
    
    // Add top processes if enabled
    if (config.get('monitoring.includeTopProcesses')) {
      const topRamProcesses = await getTopProcesses('RAM', config.get('monitoring.topProcessesCount'));
      const topDiskUsage = await getTopProcesses('Disk', config.get('monitoring.topProcessesCount'));
      
      message += `Top RAM Consumers:\n${topRamProcesses}\n\n`;
      message += `Disk Usage Breakdown:\n${topDiskUsage}`;
    }
    
    return message;
  }
  
  // Use custom box format
  const width = config.get('alertFormat.width');
  const linePrefix = config.get('alertFormat.linePrefix');
  const lineSuffix = config.get('alertFormat.lineSuffix');
  
  // Format title according to alignment
  const title = config.get('monitoring.alertMessageTitle');
  const titleAlign = config.get('alertFormat.titleAlign');
  const contentWidth = width - linePrefix.length - lineSuffix.length;
  
  let titleLine;
  if (titleAlign === 'center') {
    titleLine = linePrefix + title.padStart((contentWidth + title.length) / 2).padEnd(contentWidth) + lineSuffix;
  } else if (titleAlign === 'right') {
    titleLine = linePrefix + title.padStart(contentWidth) + lineSuffix;
  } else {  // left align
    titleLine = linePrefix + title.padEnd(contentWidth) + lineSuffix;
  }
  
  // Start building the message
  const message = [];
  message.push(config.get('alertFormat.topBorder'));
  message.push(titleLine);
  message.push(config.get('alertFormat.titleBorder'));
  
  // Add system info section if enabled
  if (config.get('alertFormat.includeSystemInfo')) {
    const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const dateEmoji = config.get('alertFormat.dateEmoji');
    const hostnameEmoji = config.get('alertFormat.hostnameEmoji');
    const ipEmoji = config.get('alertFormat.ipEmoji');
    const uptimeEmoji = config.get('alertFormat.uptimeEmoji');
    const osEmoji = config.get('alertFormat.osEmoji');
    const kernelEmoji = config.get('alertFormat.kernelEmoji');
    
    message.push(`${linePrefix}${dateEmoji} Date:       ${dateStr}${' '.repeat(contentWidth - dateEmoji.length - ' Date:       '.length - dateStr.length)}${lineSuffix}`);
    message.push(`${linePrefix}${hostnameEmoji} Hostname:     ${systemInfo.hostname}${' '.repeat(contentWidth - hostnameEmoji.length - ' Hostname:     '.length - systemInfo.hostname.length)}${lineSuffix}`);
    message.push(`${linePrefix}${ipEmoji} IP Address:   ${systemInfo.ip}${' '.repeat(contentWidth - ipEmoji.length - ' IP Address:   '.length - systemInfo.ip.length)}${lineSuffix}`);
    message.push(`${linePrefix}${uptimeEmoji} Uptime:       ${systemInfo.uptime}${' '.repeat(contentWidth - uptimeEmoji.length - ' Uptime:       '.length - systemInfo.uptime.length)}${lineSuffix}`);
    message.push(`${linePrefix}${osEmoji} OS:           ${systemInfo.os}${' '.repeat(contentWidth - osEmoji.length - ' OS:           '.length - systemInfo.os.length)}${lineSuffix}`);
    message.push(`${linePrefix}${kernelEmoji} Kernel:       ${systemInfo.kernel}${' '.repeat(contentWidth - kernelEmoji.length - ' Kernel:       '.length - systemInfo.kernel.length)}${lineSuffix}`);
    message.push(config.get('alertFormat.sectionBorder'));
  }
  
  // Add resource usage section if enabled
  if (config.get('alertFormat.includeResources')) {
    const ramEmoji = config.get('alertFormat.ramEmoji');
    const cpuEmoji = config.get('alertFormat.cpuEmoji');
    const diskEmoji = config.get('alertFormat.diskEmoji');
    
    const ramText = `${ramEmoji} RAM Usage:       ${systemInfo.ramUsage}% of ${systemInfo.totalRam}`;
    const cpuText = `${cpuEmoji} CPU Usage:       ${systemInfo.cpuUsage}%`;
    const diskText = `${diskEmoji} Disk Usage:      ${systemInfo.diskUsage}% of ${systemInfo.totalDisk}`;
    
    message.push(`${linePrefix}${ramText}${' '.repeat(contentWidth - ramText.length)}${lineSuffix}`);
    message.push(`${linePrefix}${cpuText}${' '.repeat(contentWidth - cpuText.length)}${lineSuffix}`);
    message.push(`${linePrefix}${diskText}${' '.repeat(contentWidth - diskText.length)}${lineSuffix}`);
    message.push(config.get('alertFormat.sectionBorder'));
  }
  
  // Add top processes section if enabled
  if (config.get('alertFormat.includeTopProcesses') && config.get('monitoring.includeTopProcesses')) {
    const topProcessesEmoji = config.get('alertFormat.topProcessesEmoji');
    const topProcessesHeader = `${topProcessesEmoji} Top RAM Consumers:`;
    message.push(`${linePrefix}${topProcessesHeader}${' '.repeat(contentWidth - topProcessesHeader.length)}${lineSuffix}`);
    
    const topRamProcesses = await getTopProcesses('RAM', 3);  // Limit to 3 processes
    const topRamLines = topRamProcesses.split('\n');
    for (const proc of topRamLines) {
      if (proc.trim()) {
        message.push(`${linePrefix}${proc}${' '.repeat(contentWidth - proc.length)}${lineSuffix}`);
      }
    }
    
    message.push(config.get('alertFormat.sectionBorder'));
  }
  
  // Add disk breakdown section if enabled
  if (config.get('alertFormat.includeDiskBreakdown') && config.get('monitoring.includeTopProcesses')) {
    const diskBreakdownEmoji = config.get('alertFormat.diskBreakdownEmoji');
    const diskBreakdownHeader = `${diskBreakdownEmoji} Disk Usage Breakdown:`;
    message.push(`${linePrefix}${diskBreakdownHeader}${' '.repeat(contentWidth - diskBreakdownHeader.length)}${lineSuffix}`);
    
    const diskBreakdown = await getTopProcesses('Disk', 3);  // Limit to 3 entries
    const diskBreakdownLines = diskBreakdown.split('\n');
    for (const entry of diskBreakdownLines) {
      if (entry.trim()) {
        message.push(`${linePrefix}${entry}${' '.repeat(contentWidth - entry.length)}${lineSuffix}`);
      }
    }
  }
  
  // Add bottom border
  message.push(config.get('alertFormat.bottomBorder'));
  
  return message.join('\n');
}

// Send Telegram message
async function sendTelegramMessage(message) {
  try {
    await bot.sendMessage(chatId, message);
    return true;
  } catch (error) {
    throw new Error(`Failed to send Telegram message: ${error.message}`);
  }
}

// Test Telegram connection
async function testTelegramConnection(systemInfo) {
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
  
  return sendTelegramMessage(message);
}

module.exports = {
  formatAlert,
  sendTelegramMessage,
  testTelegramConnection
};
