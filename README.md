# Memory Monitor - Node.js/Express.js Version

Tizim resurslarini kuzatish va Telegram orqali xabar yuborish uchun Node.js/Express.js dasturi.

## Asosiy xususiyatlar

- RAM foydalanishini kuzatish
- CPU foydalanishini kuzatish
- Disk foydalanishini kuzatish
- Swap foydalanishini kuzatish
- Tizim yuklamasini kuzatish
- Tarmoq trafikini kuzatish
- Telegram orqali xabarlar yuborish
- Dinamik alert formati
- Ma'lumotlar bazasi integratsiyasi (SQLite, MySQL, PostgreSQL)
- Prometheus/Grafana integratsiyasi
- RESTful API orqali boshqarish

## O'rnatish

### Talablar

- Node.js (v14 yoki yuqori)
- npm (v6 yoki yuqori)

### O'rnatish qadamlari

1. Loyihani yuklab oling va arxivdan chiqaring:
```bash
unzip memory-monitor-nodejs-express.zip
cd memory-monitor-nodejs-express
```

2. Kerakli paketlarni o'rnating:
```bash
npm install
```

3. Konfiguratsiya faylini sozlang:
```bash
nano config/default.json
```

4. Dasturni ishga tushiring:
```bash
node app.js
```

### Xizmat sifatida o'rnatish

Dasturni systemd xizmati sifatida o'rnatish uchun quyidagi qadamlarni bajaring:

1. Systemd xizmat faylini yarating:
```bash
sudo nano /etc/systemd/system/memory-monitor.service
```

2. Quyidagi matnni fayl ichiga joylashtiring:
```
[Unit]
Description=Memory Monitor Node.js Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/memory-monitor
ExecStart=/usr/bin/node /opt/memory-monitor/app.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=memory-monitor

[Install]
WantedBy=multi-user.target
```

3. Dastur fayllarini `/opt/memory-monitor` katalogiga ko'chiring:
```bash
sudo mkdir -p /opt/memory-monitor
sudo cp -r * /opt/memory-monitor/
```

4. Xizmatni yoqing va ishga tushiring:
```bash
sudo systemctl enable memory-monitor.service
sudo systemctl start memory-monitor.service
```

5. Xizmat holatini tekshiring:
```bash
sudo systemctl status memory-monitor.service
```

## Konfiguratsiya

Konfiguratsiya fayli `config/default.json` manzilida joylashgan. Asosiy sozlamalar:

### Telegram sozlamalari

```json
"telegram": {
  "botToken": "YOUR_TELEGRAM_BOT_TOKEN",
  "chatId": "YOUR_TELEGRAM_CHAT_ID"
}
```

### Monitoring sozlamalari

```json
"monitoring": {
  "threshold": 80,
  "checkInterval": 60,
  "includeTopProcesses": true,
  "topProcessesCount": 10,
  "alertMessageTitle": "🖥️ SYSTEM STATUS ALERT",
  "logFile": "logs/memory-monitor.log",
  "logLevel": "info"
}
```

### CPU, disk, swap, load va network sozlamalari

```json
"cpu": {
  "monitor": true,
  "threshold": 90
},
"disk": {
  "monitor": true,
  "threshold": 90,
  "path": "/"
},
"swap": {
  "monitor": true,
  "threshold": 80
},
"load": {
  "monitor": true,
  "threshold": 5
},
"network": {
  "monitor": true,
  "interface": "",
  "threshold": 90
}
```

### Ma'lumotlar bazasi sozlamalari

```json
"database": {
  "enabled": false,
  "type": "sqlite",
  "sqlite": {
    "path": "data/metrics.db"
  },
  "mysql": {
    "host": "localhost",
    "port": 3306,
    "database": "system_monitor",
    "user": "username",
    "password": "password"
  },
  "postgresql": {
    "host": "localhost",
    "port": 5432,
    "database": "system_monitor",
    "user": "username",
    "password": "password"
  }
}
```

### Prometheus sozlamalari

```json
"prometheus": {
  "enabled": false,
  "port": 9090
}
```

### Alert format sozlamalari

```json
"alertFormat": {
  "enabled": true,
  "topBorder": "┌────────────────────────────────────────────┐",
  "titleBorder": "├────────────────────────────────────────────┤",
  "sectionBorder": "├────────────────────────────────────────────┤",
  "bottomBorder": "└────────────────────────────────────────────┘",
  "linePrefix": "│ ",
  "lineSuffix": " │",
  "width": 44,
  "titleAlign": "center",
  "dateEmoji": "🗓️",
  "ramEmoji": "🧠",
  "cpuEmoji": "🔥",
  "diskEmoji": "💾",
  "topProcessesEmoji": "🧾",
  "diskBreakdownEmoji": "📁",
  "hostnameEmoji": "",
  "ipEmoji": "",
  "uptimeEmoji": "",
  "osEmoji": "",
  "kernelEmoji": "",
  "includeSystemInfo": true,
  "includeResources": true,
  "includeTopProcesses": true,
  "includeDiskBreakdown": true
}
```

## API endpointlari

Dastur quyidagi API endpointlarini taqdim etadi:

- `GET /` - Dastur holati
- `GET /status` - Tizim holati haqida ma'lumot
- `GET /test-telegram` - Telegram xabar yuborishni tekshirish
- `GET /metrics` - Prometheus metrikalarini olish (agar yoqilgan bo'lsa)

## Prometheus/Grafana integratsiyasi

### Prometheus o'rnatish

1. Prometheus konfiguratsiyasiga quyidagi qismni qo'shing:
```yaml
scrape_configs:
  - job_name: 'memory-monitor'
    scrape_interval: 10s
    static_configs:
      - targets: ['localhost:9090']
```

2. Dasturda Prometheus integratsiyasini yoqing:
```json
"prometheus": {
  "enabled": true,
  "port": 9090
}
```

### Grafana dashboard

Grafana uchun tayyor dashboard JSON faylini import qilish mumkin. Dashboard quyidagi metrikalarni o'z ichiga oladi:

- RAM foydalanishi
- CPU foydalanishi
- Disk foydalanishi
- Swap foydalanishi
- Tizim yuklamasi
- Tarmoq trafigi
- Xabarlar soni

## Xatoliklarni bartaraf etish

### Telegram xabar yuborilmayapti

1. Bot token va chat ID to'g'riligini tekshiring
2. Telegram botni ishga tushirganingizni tekshiring (`/start` buyrug'i)
3. Log fayllarini tekshiring

### Ma'lumotlar bazasi xatolari

1. Ma'lumotlar bazasi mavjudligini tekshiring
2. Foydalanuvchi huquqlarini tekshiring
3. Log fayllarini tekshiring

### Prometheus metrikalarini ko'rsatmayapti

1. Prometheus integratsiyasi yoqilganligini tekshiring
2. Port ochiq ekanligini tekshiring
3. Prometheus konfiguratsiyasini tekshiring

## Versiya

1.0.0
