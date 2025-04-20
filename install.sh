#!/bin/bash

# Memory Monitor Node.js o'rnatish skripti
# Muallif: Manus AI
# Versiya: 1.0.0

echo "====================================================="
echo "MEMORY MONITOR NODE.JS - O'rnatish skripti"
echo "Versiya: 1.0.0"
echo "====================================================="
echo ""

# Root tekshirish
if [ "$(id -u)" != "0" ]; then
   echo "Bu skriptni ishga tushirish uchun root huquqiga ega bo'lishingiz kerak." 1>&2
   echo "Maslahat: 'sudo ./install.sh' buyrug'ini ishlatib ko'ring" 1>&2
   exit 1
fi

# Node.js borligini tekshirish
if ! command -v node &> /dev/null; then
    echo "Node.js topilmadi. O'rnatilmoqda..."
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
    apt-get install -y nodejs
fi

# npm borligini tekshirish
if ! command -v npm &> /dev/null; then
    echo "npm topilmadi. O'rnatilmoqda..."
    apt-get install -y npm
fi

# Kerakli paketlarni o'rnatish
echo "Kerakli paketlarni o'rnatish..."
apt-get update
apt-get install -y curl

# Kataloglarni yaratish
echo "Kataloglarni yaratish..."
mkdir -p /opt/memory-monitor
mkdir -p /opt/memory-monitor/config
mkdir -p /opt/memory-monitor/logs
mkdir -p /opt/memory-monitor/data

# Fayllarni nusxalash
echo "Fayllarni nusxalash..."
cp app.js /opt/memory-monitor/
cp telegramNotifier.js /opt/memory-monitor/
cp systemUtils.js /opt/memory-monitor/
cp database.js /opt/memory-monitor/
cp prometheus.js /opt/memory-monitor/
cp README.md /opt/memory-monitor/
cp -r node_modules /opt/memory-monitor/
cp package.json /opt/memory-monitor/

# Konfiguratsiya faylini yaratish
if [ ! -f "/opt/memory-monitor/config/default.json" ]; then
    echo "Konfiguratsiya faylini yaratish..."
    mkdir -p /opt/memory-monitor/config
    cp config/default.json /opt/memory-monitor/config/
else
    echo "Konfiguratsiya fayli mavjud, yangilanmaydi."
    echo "Yangi konfiguratsiya fayli default.json.new sifatida saqlandi."
    cp config/default.json /opt/memory-monitor/config/default.json.new
fi

# Systemd service faylini yaratish
echo "Systemd service faylini yaratish..."
cat > /etc/systemd/system/memory-monitor.service << EOF
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
EOF

# Huquqlarni o'rnatish
echo "Huquqlarni o'rnatish..."
chmod 644 /etc/systemd/system/memory-monitor.service
chmod -R 755 /opt/memory-monitor

# Systemd ni yangilash
echo "Systemd ni yangilash..."
systemctl daemon-reload

echo ""
echo "O'rnatish muvaffaqiyatli yakunlandi!"
echo ""
echo "Telegram xabar yuborishni tekshirish uchun:"
echo "  cd /opt/memory-monitor && node app.js test-telegram"
echo ""
echo "Xizmatni yoqish uchun:"
echo "  sudo systemctl enable memory-monitor.service"
echo ""
echo "Xizmatni ishga tushirish uchun:"
echo "  sudo systemctl start memory-monitor.service"
echo ""
echo "Xizmat holatini tekshirish uchun:"
echo "  sudo systemctl status memory-monitor.service"
echo ""
echo "Konfiguratsiya fayli:"
echo "  /opt/memory-monitor/config/default.json"
echo ""
echo "Log fayli:"
echo "  /opt/memory-monitor/logs/memory-monitor.log"
echo ""
echo "====================================================="
