const config = require('config');
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
let dbConnection = null;

// Initialize database based on configuration
function setupDatabase() {
  const dbType = config.get('database.type');
  
  if (!config.get('database.enabled')) {
    console.log('Database integration is disabled');
    return null;
  }
  
  try {
    if (dbType === 'sqlite') {
      return setupSqlite();
    } else if (dbType === 'mysql') {
      return setupMysql();
    } else if (dbType === 'postgresql') {
      return setupPostgresql();
    } else {
      console.error(`Unsupported database type: ${dbType}`);
      return null;
    }
  } catch (error) {
    console.error(`Error setting up database: ${error.message}`);
    return null;
  }
}

// Setup SQLite database
function setupSqlite() {
  try {
    const dbPath = config.get('database.sqlite.path');
    
    // Create directory if it doesn't exist
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // Create database connection
    const db = new sqlite3.Database(dbPath);
    
    // Create tables if they don't exist
    db.serialize(() => {
      // Metrics table
      db.run(`CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        hostname TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        ram_usage REAL NOT NULL,
        cpu_usage REAL NOT NULL,
        disk_usage REAL NOT NULL,
        swap_usage REAL NOT NULL,
        load_average REAL NOT NULL,
        network_rx REAL NOT NULL,
        network_tx REAL NOT NULL,
        extra_data TEXT
      )`);
      
      // Alerts table
      db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        hostname TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        value TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_successfully INTEGER NOT NULL
      )`);
    });
    
    console.log(`SQLite database initialized at ${dbPath}`);
    
    // Return database interface
    return {
      storeMetrics: async (timestamp, hostname, ipAddress, ramUsage, cpuUsage, diskUsage, swapUsage, loadAverage, networkRx, networkTx, extraData) => {
        return new Promise((resolve, reject) => {
          const stmt = db.prepare(`INSERT INTO metrics (
            timestamp, hostname, ip_address, ram_usage, cpu_usage, disk_usage, 
            swap_usage, load_average, network_rx, network_tx, extra_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          
          stmt.run(
            timestamp, hostname, ipAddress, ramUsage, cpuUsage, diskUsage,
            swapUsage, loadAverage, networkRx, networkTx, extraData,
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve(this.lastID);
              }
            }
          );
          
          stmt.finalize();
        });
      },
      
      storeAlert: async (timestamp, hostname, alertType, value, message, sentSuccessfully) => {
        return new Promise((resolve, reject) => {
          const stmt = db.prepare(`INSERT INTO alerts (
            timestamp, hostname, alert_type, value, message, sent_successfully
          ) VALUES (?, ?, ?, ?, ?, ?)`);
          
          stmt.run(
            timestamp, hostname, alertType, value, message, sentSuccessfully ? 1 : 0,
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve(this.lastID);
              }
            }
          );
          
          stmt.finalize();
        });
      },
      
      getRecentMetrics: async (limit = 100) => {
        return new Promise((resolve, reject) => {
          db.all(`SELECT * FROM metrics ORDER BY timestamp DESC LIMIT ?`, [limit], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
      },
      
      getRecentAlerts: async (limit = 100) => {
        return new Promise((resolve, reject) => {
          db.all(`SELECT * FROM alerts ORDER BY timestamp DESC LIMIT ?`, [limit], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
      },
      
      close: () => {
        db.close();
      }
    };
  } catch (error) {
    console.error(`Error setting up SQLite database: ${error.message}`);
    return null;
  }
}

// Setup MySQL database
async function setupMysql() {
  try {
    const dbConfig = {
      host: config.get('database.mysql.host'),
      port: config.get('database.mysql.port'),
      database: config.get('database.mysql.database'),
      user: config.get('database.mysql.user'),
      password: config.get('database.mysql.password'),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
    
    // Create connection pool
    const pool = mysql.createPool(dbConfig);
    
    // Test connection
    const connection = await pool.getConnection();
    connection.release();
    
    // Create tables if they don't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS metrics (
      id INT AUTO_INCREMENT PRIMARY KEY,
      timestamp DATETIME NOT NULL,
      hostname VARCHAR(255) NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      ram_usage FLOAT NOT NULL,
      cpu_usage FLOAT NOT NULL,
      disk_usage FLOAT NOT NULL,
      swap_usage FLOAT NOT NULL,
      load_average FLOAT NOT NULL,
      network_rx FLOAT NOT NULL,
      network_tx FLOAT NOT NULL,
      extra_data JSON
    )`);
    
    await pool.query(`CREATE TABLE IF NOT EXISTS alerts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      timestamp DATETIME NOT NULL,
      hostname VARCHAR(255) NOT NULL,
      alert_type VARCHAR(50) NOT NULL,
      value VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      sent_successfully BOOLEAN NOT NULL
    )`);
    
    console.log(`MySQL database initialized at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    
    // Return database interface
    return {
      storeMetrics: async (timestamp, hostname, ipAddress, ramUsage, cpuUsage, diskUsage, swapUsage, loadAverage, networkRx, networkTx, extraData) => {
        const [result] = await pool.query(
          `INSERT INTO metrics (
            timestamp, hostname, ip_address, ram_usage, cpu_usage, disk_usage, 
            swap_usage, load_average, network_rx, network_tx, extra_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            timestamp, hostname, ipAddress, ramUsage, cpuUsage, diskUsage,
            swapUsage, loadAverage, networkRx, networkTx, extraData
          ]
        );
        
        return result.insertId;
      },
      
      storeAlert: async (timestamp, hostname, alertType, value, message, sentSuccessfully) => {
        const [result] = await pool.query(
          `INSERT INTO alerts (
            timestamp, hostname, alert_type, value, message, sent_successfully
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            timestamp, hostname, alertType, value, message, sentSuccessfully
          ]
        );
        
        return result.insertId;
      },
      
      getRecentMetrics: async (limit = 100) => {
        const [rows] = await pool.query(
          `SELECT * FROM metrics ORDER BY timestamp DESC LIMIT ?`,
          [limit]
        );
        
        return rows;
      },
      
      getRecentAlerts: async (limit = 100) => {
        const [rows] = await pool.query(
          `SELECT * FROM alerts ORDER BY timestamp DESC LIMIT ?`,
          [limit]
        );
        
        return rows;
      },
      
      close: async () => {
        await pool.end();
      }
    };
  } catch (error) {
    console.error(`Error setting up MySQL database: ${error.message}`);
    return null;
  }
}

// Setup PostgreSQL database
async function setupPostgresql() {
  try {
    const dbConfig = {
      host: config.get('database.postgresql.host'),
      port: config.get('database.postgresql.port'),
      database: config.get('database.postgresql.database'),
      user: config.get('database.postgresql.user'),
      password: config.get('database.postgresql.password'),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    };
    
    // Create connection pool
    const pool = new Pool(dbConfig);
    
    // Test connection
    const client = await pool.connect();
    client.release();
    
    // Create tables if they don't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS metrics (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP NOT NULL,
      hostname VARCHAR(255) NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      ram_usage FLOAT NOT NULL,
      cpu_usage FLOAT NOT NULL,
      disk_usage FLOAT NOT NULL,
      swap_usage FLOAT NOT NULL,
      load_average FLOAT NOT NULL,
      network_rx FLOAT NOT NULL,
      network_tx FLOAT NOT NULL,
      extra_data JSONB
    )`);
    
    await pool.query(`CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP NOT NULL,
      hostname VARCHAR(255) NOT NULL,
      alert_type VARCHAR(50) NOT NULL,
      value VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      sent_successfully BOOLEAN NOT NULL
    )`);
    
    console.log(`PostgreSQL database initialized at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    
    // Return database interface
    return {
      storeMetrics: async (timestamp, hostname, ipAddress, ramUsage, cpuUsage, diskUsage, swapUsage, loadAverage, networkRx, networkTx, extraData) => {
        const result = await pool.query(
          `INSERT INTO metrics (
            timestamp, hostname, ip_address, ram_usage, cpu_usage, disk_usage, 
            swap_usage, load_average, network_rx, network_tx, extra_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [
            timestamp, hostname, ipAddress, ramUsage, cpuUsage, diskUsage,
            swapUsage, loadAverage, networkRx, networkTx, extraData
          ]
        );
        
        return result.rows[0].id;
      },
      
      storeAlert: async (timestamp, hostname, alertType, value, message, sentSuccessfully) => {
        const result = await pool.query(
          `INSERT INTO alerts (
            timestamp, hostname, alert_type, value, message, sent_successfully
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [
            timestamp, hostname, alertType, value, message, sentSuccessfully
          ]
        );
        
        return result.rows[0].id;
      },
      
      getRecentMetrics: async (limit = 100) => {
        const result = await pool.query(
          `SELECT * FROM metrics ORDER BY timestamp DESC LIMIT $1`,
          [limit]
        );
        
        return result.rows;
      },
      
      getRecentAlerts: async (limit = 100) => {
        const result = await pool.query(
          `SELECT * FROM alerts ORDER BY timestamp DESC LIMIT $1`,
          [limit]
        );
        
        return result.rows;
      },
      
      close: async () => {
        await pool.end();
      }
    };
  } catch (error) {
    console.error(`Error setting up PostgreSQL database: ${error.message}`);
    return null;
  }
}

module.exports = {
  setupDatabase
};
