# 📊 Zepp Health Live Dashboard & CLI Tool

An elegant, glassmorphic web-based dashboard and CLI tool to extract, process, and visualize physiological metrics directly from your Zepp (Amazfit) cloud account.

![Dashboard Preview](file:///home/leapmile/.gemini/antigravity/brain/31198ffd-8cd6-4180-a397-24b5f0760c1c/overview_7days_corrected_1784107026203.png)

---

## ✨ Features

- **Glassmorphic UI**: A dark, premium aesthetic dashboard optimized with Outfit typography and FontAwesome icons.
- **Integrated Login Screen**: A beautiful login page allows clients to sign in securely using their Zepp credentials, automatically storing and caching credentials in `session.yaml`.
- **Biometric Timeline**: Track minute-by-minute heart rate telemetry (aggregated into clean 15-minute buckets for performance) and daily steps via interactive Chart.js visualizations.
- **Sleep Stage Analysis**: Comprehensive breakdown of Deep Sleep, Light Sleep, REM Sleep, and Wake periods.
- **Cardiovascular Indices**: Review your VO2 Max capacities and rolling weekly/monthly PAI scores.
- **Fitness & Altimeter GPS Telemetry**: Track altitude range changes, elevations, running durations, and distance traveled.
- **Flexible Timeframes**: Instantly toggle between single-day snapshots and historical trends (7 Days & 30 Days).
- **Session Persistence**: Auto-caches your encrypted access token so you only log in once.

---

## 🚀 Quick Setup & Installation

### Option A: Local Python Environment (Recommended for development)

1. **Install Python dependencies**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Start the Web Dashboard**:
   ```bash
   python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
   ```
   Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser. 
   
   *Note: If no session is initialized, you will be automatically prompted by the secure login screen to input your Zepp account credentials.*

---

### Option B: Docker Container Deployment (Recommended for production)

Use the Docker container environment to keep the web application completely isolated and self-contained.

#### ⚡ Quick Launch (using Orchestrator Script)
We provide a helper bash launcher that verifies dependencies and boots the stack with one command:
```bash
./run_docker.sh
```

#### 🛠️ Manual docker commands
If you prefer executing docker commands manually:

1. **Build and start the container in the background**:
   ```bash
   docker compose up -d --build
   ```

2. **Inspect live logs**:
   ```bash
   docker compose logs -f
   ```

3. **Check container status**:
   ```bash
   docker compose ps
   ```

4. **Shutdown the stack**:
   ```bash
   docker compose down
   ```

The dashboard will be served at **[http://localhost:8000](http://localhost:8000)**. Your session tokens are preserved on your host machine via Docker volume bindings mapping to `./backend/session.yaml`.

---

## 🛠️ Script Reference (CLI mode)

If you prefer terminal-only metrics extraction:

- **Check raw API discovery logs**:
  ```bash
  python3 backend/list_details.py
  ```
- **Fetch daily summary**:
  ```bash
  python3 backend/fetch_processed_summary.py
  ```
  *Tip:* To modify the time windows for CLI outputs, change the `default_time_range` value inside `backend/config.yaml`.