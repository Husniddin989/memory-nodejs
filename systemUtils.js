const si = require('systeminformation');
const os = require('os');
const { exec } = require('child_process');
const config = require('config');

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
    console.error(`Error getting system info: ${error.message}`);
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
    console.error(`Error getting top processes: ${error.message}`);
    return `Could not get ${resourceType} process information`;
  }
}

// Check RAM usage
async function checkRamUsage() {
  try {
    const memInfo = await si.mem();
    return Math.round((memInfo.used / memInfo.total) * 100);
  } catch (error) {
    console.error(`Error checking RAM usage: ${error.message}`);
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
    console.error(`Error checking CPU usage: ${error.message}`);
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
    console.error(`Error checking disk usage: ${error.message}`);
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
    console.error(`Error checking swap usage: ${error.message}`);
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
    console.error(`Error checking load average: ${error.message}`);
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
    console.error(`Error checking network usage: ${error.message}`);
    return [0, 0];
  }
}

module.exports = {
  getSystemInfo,
  getTopProcesses,
  checkRamUsage,
  checkCpuUsage,
  checkDiskUsage,
  checkSwapUsage,
  checkLoadAverage,
  checkNetworkUsage
};
