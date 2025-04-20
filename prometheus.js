const client = require('prom-client');
const config = require('config');

// Initialize Prometheus client
function setupPrometheus() {
  if (!config.get('prometheus.enabled')) {
    console.log('Prometheus integration is disabled');
    return null;
  }
  
  try {
    // Create a Registry to register metrics
    const register = new client.Registry();
    
    // Add default metrics (CPU, memory usage, etc.)
    client.collectDefaultMetrics({ register });
    
    // Create custom metrics
    
    // Resource usage gauges
    const ramUsage = new client.Gauge({
      name: 'system_ram_usage_percent',
      help: 'Current RAM usage in percent',
      registers: [register]
    });
    
    const cpuUsage = new client.Gauge({
      name: 'system_cpu_usage_percent',
      help: 'Current CPU usage in percent',
      registers: [register]
    });
    
    const diskUsage = new client.Gauge({
      name: 'system_disk_usage_percent',
      help: 'Current disk usage in percent',
      labelNames: ['path'],
      registers: [register]
    });
    
    const swapUsage = new client.Gauge({
      name: 'system_swap_usage_percent',
      help: 'Current swap usage in percent',
      registers: [register]
    });
    
    const loadAverage = new client.Gauge({
      name: 'system_load_average_per_core',
      help: 'Current system load average per CPU core',
      registers: [register]
    });
    
    const networkRx = new client.Gauge({
      name: 'system_network_rx_mbps',
      help: 'Current network receive rate in Mbps',
      labelNames: ['interface'],
      registers: [register]
    });
    
    const networkTx = new client.Gauge({
      name: 'system_network_tx_mbps',
      help: 'Current network transmit rate in Mbps',
      labelNames: ['interface'],
      registers: [register]
    });
    
    // Alert counters
    const ramAlerts = new client.Counter({
      name: 'system_ram_alerts_total',
      help: 'Total number of RAM usage alerts',
      registers: [register]
    });
    
    const cpuAlerts = new client.Counter({
      name: 'system_cpu_alerts_total',
      help: 'Total number of CPU usage alerts',
      registers: [register]
    });
    
    const diskAlerts = new client.Counter({
      name: 'system_disk_alerts_total',
      help: 'Total number of disk usage alerts',
      registers: [register]
    });
    
    const swapAlerts = new client.Counter({
      name: 'system_swap_alerts_total',
      help: 'Total number of swap usage alerts',
      registers: [register]
    });
    
    const loadAlerts = new client.Counter({
      name: 'system_load_alerts_total',
      help: 'Total number of load average alerts',
      registers: [register]
    });
    
    const networkAlerts = new client.Counter({
      name: 'system_network_alerts_total',
      help: 'Total number of network usage alerts',
      registers: [register]
    });
    
    console.log(`Prometheus metrics initialized on port ${config.get('prometheus.port')}`);
    
    // Return Prometheus interface
    return {
      register,
      ramUsage,
      cpuUsage,
      diskUsage,
      swapUsage,
      loadAverage,
      networkRx,
      networkTx,
      ramAlerts,
      cpuAlerts,
      diskAlerts,
      swapAlerts,
      loadAlerts,
      networkAlerts
    };
  } catch (error) {
    console.error(`Error setting up Prometheus: ${error.message}`);
    return null;
  }
}

module.exports = {
  setupPrometheus
};
