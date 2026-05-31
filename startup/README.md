# Dashboard Background Startup Guide

This directory contains scripts and configurations to run the Obsidian Vaults Overview Dashboard automatically in the background on startup, making it always available at `http://localhost:3000` without having to run commands in a terminal.

---

## 💻 Windows Setup (Recommended)

On Windows, we use the `launch-silently.vbs` VBScript file in this directory to start the Node.js process silently without leaving a Command Prompt window open.

### 1. Enable Run on Startup
1. Press `Win + R` to open the **Run** dialog.
2. Type `shell:startup` and press **Enter**. This opens your Windows **Startup** folder.
3. Right-click `launch-silently.vbs` inside the `_vault_dashboard/startup/` directory and select **Show more options > Create shortcut** (or hold `Alt` while dragging the file to create a shortcut).
4. Move or copy this new shortcut file into the **Startup** folder.

*Now, every time you boot Windows, the dashboard server will start silently in the background.*

### 2. How to Stop the Background Server
If you ever need to stop the background server (for updates or to free up port 3000):
1. Open a PowerShell terminal.
2. Run this command:
   ```powershell
   Stop-Process -Name node -Force
   ```
   *(Or open **Task Manager**, find the **Node.js JavaScript Runtime** background processes, and select **End Task**).*

---

## 🍏 macOS Setup

On macOS, you can configure a standard User Launch Agent (`plist`) to manage the background server.

### 1. Create a Plist File
Create a file named `com.obsidian.dashboard.plist` inside `~/Library/LaunchAgents/` with the following content (update the path to your exact Node path and project directory):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.obsidian.dashboard</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/your/01_Obsidian_Vaults/_vault_dashboard</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/obsidian-dashboard.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/obsidian-dashboard.err.log</string>
</dict>
</plist>
```

### 2. Load the Agent
Run this command in Terminal to start it immediately:
```bash
launchctl load ~/Library/LaunchAgents/com.obsidian.dashboard.plist
```

---

## 🐧 Linux Setup

On Linux, you can configure a `systemd` user service to manage the process.

### 1. Create a Systemd User Service
Create a file named `obsidian-dashboard.service` inside `~/.config/systemd/user/`:

```ini
[Unit]
Description=Obsidian Vaults Dashboard Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/your/01_Obsidian_Vaults/_vault_dashboard
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=default.target
```

### 2. Enable and Start the Service
Run the following commands in your terminal:
```bash
systemctl --user daemon-reload
systemctl --user enable obsidian-dashboard.service
systemctl --user start obsidian-dashboard.service
```
