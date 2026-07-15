import os
import sys
import yaml
import json
import base64
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Query, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Add current folder to sys.path to resolve utils.py
sys.path.append(os.path.dirname(__file__))
from utils import load_config_yaml, get_metric, get_details_by_email_pw

app = FastAPI(title="Zepp Health CLI API Server")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSION_FILE = os.path.join(os.path.dirname(__file__), "session.yaml")
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.yaml")

def get_session():
    if not os.path.exists(SESSION_FILE):
        raise HTTPException(status_code=401, detail="Session not initialized. Please authenticate first.")
    with open(SESSION_FILE, "r") as f:
        data = yaml.safe_load(f)
        return data.get("app_token"), data.get("user_id")

@app.post("/api/login")
def login(payload: dict = Body(...)):
    email = payload.get("email")
    password = payload.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    
    try:
        config = load_config_yaml(CONFIG_FILE)
        app_token, user_id = get_details_by_email_pw(email, password, config)
        
        session_data = {
            "app_token": app_token,
            "user_id": str(user_id)
        }
        with open(SESSION_FILE, "w") as f:
            yaml.safe_dump(session_data, f)
            
        return {"status": "success", "user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/api/logout")
def logout():
    try:
        if os.path.exists(SESSION_FILE):
            os.remove(SESSION_FILE)
        return {"status": "success", "detail": "Logged out successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def parse_band_detail(band_raw):
    """Parses band_data with query_type: 'detail' to extract steps, sleep, and minute-by-minute heart rates."""
    results = {}
    items = band_raw.get("data") or []
    for item in items:
        date_str = item.get("date_time")
        summary_b64 = item.get("summary")
        data_hr_b64 = item.get("data_hr")
        
        if not date_str or not summary_b64:
            continue
            
        try:
            # 1. Parse steps/calories/sleep from summary
            decoded_bytes = base64.b64decode(summary_b64)
            decoded_json = json.loads(decoded_bytes.decode())
            
            stp = decoded_json.get("stp", {})
            slp = decoded_json.get("slp", {})
            
            # 2. Parse heart rate details
            hr_values = []
            hr_timeline = []
            if data_hr_b64:
                hr_bytes = base64.b64decode(data_hr_b64)
                for idx, val in enumerate(hr_bytes):
                    # 255 is off-wrist indicator
                    if 30 <= val <= 220:
                        hr_values.append(val)
                        hr_timeline.append({"minute": idx, "hr": val})
                    else:
                        hr_timeline.append({"minute": idx, "hr": None})
            
            results[date_str] = {
                "steps": stp.get("ttl") or 0,
                "distance_meters": stp.get("dis") or 0,
                "calories_burned_kcal": stp.get("cal") or 0,
                "sleep": {
                    "deep_sleep_minutes": slp.get("dp") or 0 if not isinstance(slp.get("dp"), bool) else 0,
                    "light_sleep_minutes": slp.get("lt") or 0 if not isinstance(slp.get("lt"), bool) else 0,
                    "rem_sleep_minutes": slp.get("supRem") or 0 if (isinstance(slp.get("supRem"), int) and not isinstance(slp.get("supRem"), bool)) else (120 if slp.get("supRem") is True else 0),
                    "awake_minutes": slp.get("wk") or 0 if not isinstance(slp.get("wk"), bool) else 0,
                    "resting_heart_rate": slp.get("rhr") or 0 if not isinstance(slp.get("rhr"), bool) else 0
                },
                "hr_stats": {
                    "min": min(hr_values) if hr_values else "N/A",
                    "max": max(hr_values) if hr_values else "N/A",
                    "avg": round(sum(hr_values) / len(hr_values), 1) if hr_values else "N/A"
                },
                "hr_timeline": hr_timeline
            }
        except Exception as e:
            print(f"Error parsing detail for {date_str}: {e}")
            continue
    return results

@app.get("/api/health-summary")
def get_health_summary(days: int = Query(1, ge=1, le=90)):
    try:
        app_token, user_id = get_session()
        config = load_config_yaml(CONFIG_FILE)
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    # Calculate date range
    local_now = datetime.now()
    local_today = local_now.date()
    local_midnight = datetime(local_now.year, local_now.month, local_now.day, 0, 0, 0)
    
    now_ts = int(local_now.timestamp())
    now_ms = int(now_ts * 1000)
    
    if days == 1:
        start_date = local_today
        start_ts = int(local_midnight.timestamp())
    else:
        start_date = local_today - timedelta(days=days - 1)
        start_datetime = datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0)
        start_ts = int(start_datetime.timestamp())
        
    start_ms = int(start_ts * 1000)

    # 1. Fetch band data (detail)
    try:
        band_raw = get_metric(app_token, user_id, "band_data", {
            "userid": user_id,
            "from_date": start_date.isoformat(),
            "to_date": local_today.isoformat(),
            "query_type": "detail",
            "byteLength": 8,
            "device_type": 0
        }, config)
        daily_reports = parse_band_detail(band_raw)
    except Exception as e:
        print(f"Error fetching band data: {e}")
        daily_reports = {}

    # Initialize all days in range with default schema
    for i in range(days):
        day_str = (local_today - timedelta(days=i)).isoformat()
        if day_str not in daily_reports:
            daily_reports[day_str] = {
                "steps": 0,
                "distance_meters": 0,
                "calories_burned_kcal": 0,
                "sleep": {"deep_sleep_minutes": 0, "light_sleep_minutes": 0, "rem_sleep_minutes": 0, "awake_minutes": 0, "resting_heart_rate": 0},
                "hr_stats": {"min": "N/A", "max": "N/A", "avg": "N/A"},
                "hr_timeline": []
            }

    # 2. Fetch PAI Scores
    try:
        pai_raw = get_metric(app_token, user_id, "user_events", {
            "eventType": "PaiHealthInfo",
            "from": start_ms,
            "to": now_ms,
            "limit": 100,
            "reverse": 0,
            "userId": user_id
        }, config)
        for item in (pai_raw.get("items") or []):
            ts = item.get("timestamp", 0) / 1000
            date_str = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
            if date_str in daily_reports:
                daily_reports[date_str]["pai_score"] = float(item.get("totalPai", 0.0))
    except Exception as e:
        print(f"Error PAI: {e}")

    # 3. Fetch Stress Levels
    try:
        stress_raw = get_metric(app_token, user_id, "user_events", {
            "eventType": "all_day_stress",
            "from": start_ms,
            "to": now_ms,
            "limit": 100,
            "reverse": 0,
            "userId": user_id
        }, config)
        for item in (stress_raw.get("items") or []):
            ts = item.get("timestamp", 0) / 1000
            date_str = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
            if date_str in daily_reports:
                daily_reports[date_str]["average_stress"] = int(item.get("avgStress", 0))
                daily_reports[date_str]["max_stress"] = int(item.get("maxStress", 0))
    except Exception as e:
        print(f"Error Stress: {e}")

    # 4. Fetch Blood Oxygen (SpO2) Spot Checks
    try:
        spo2_raw = get_metric(app_token, user_id, "user_events", {
            "eventType": "blood_oxygen",
            "subType": "click",
            "from": start_ms,
            "to": now_ms,
            "limit": 100,
            "reverse": 0,
            "userId": user_id
        }, config)
        for item in (spo2_raw.get("items") or []):
            ts = item.get("timestamp", 0) / 1000
            date_str = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
            if date_str in daily_reports:
                extra = json.loads(item.get("extra", "{}"))
                val = extra.get("spo2")
                if val:
                    if "spo2_spot_checks" not in daily_reports[date_str]:
                        daily_reports[date_str]["spo2_spot_checks"] = []
                    daily_reports[date_str]["spo2_spot_checks"].append(val)
    except Exception as e:
        print(f"Error SpO2: {e}")

    # 5. Fetch Body Battery / Biocharge
    try:
        battery_raw = get_metric(app_token, user_id, "readiness_events", {
            "eventType": "Charge",
            "subType": "real_data",
            "from": start_ms,
            "to": now_ms,
            "limit": 100
        }, config)
        for item in (battery_raw.get("items") or []):
            ts = item.get("timestamp", 0) / 1000
            date_str = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
            if date_str in daily_reports:
                val = item.get("value", {})
                samples = val.get("samples", [])
                if samples:
                    scores = [s.get("total") for s in samples if s.get("total") is not None and s.get("total") <= 100]
                    if scores:
                        daily_reports[date_str]["average_body_battery"] = round(sum(scores) / len(scores), 1)
    except Exception as e:
        print(f"Error battery: {e}")

    # 6. Fetch VO2 Max (query last 90 days to show latest computed value)
    latest_vo2_max = "N/A"
    try:
        vo2_raw = get_metric(app_token, user_id, "vo2_max", {
            "startDay": (local_today - timedelta(days=90)).isoformat(),
            "endDay": local_today.isoformat(),
            "limit": 10,
            "isReverse": "true"
        }, config)
        items = vo2_raw.get("items") or vo2_raw.get("data") or []
        if items:
            # Check standard fields for vo2Max value
            latest_vo2_max = items[0].get("value") or items[0].get("vo2Max") or "N/A"
    except Exception as e:
        print(f"Error VO2 Max: {e}")

    # 7. Fetch Workout history (last 90 days to get details)
    workouts = []
    try:
        workout_raw = get_metric(app_token, user_id, "sport_history", {
            "sport": "run",
            "userid": user_id,
            "startTrackId": 0,
            "stopTrackId": 0,
            "need_sub_data": 1,
            "type": ""
        }, config)
        items = workout_raw.get("data", {}).get("summary", [])
        for it in items[:10]:
            workouts.append({
                "date": datetime.fromtimestamp(it.get("startTime", 0), tz=timezone.utc).date().isoformat(),
                "duration_minutes": round(it.get("duration", 0) / 60, 1),
                "distance_km": round(it.get("dis", 0) / 1000, 2),
                "avg_heart_rate": it.get("avgHr", 0),
                "calories_burned": it.get("calorie", 0),
                "max_altitude": it.get("maxAltitude", 0),
                "min_altitude": it.get("minAltitude", 0)
            })
    except Exception as e:
        print(f"Error workouts: {e}")

    # Sort days
    sorted_days = [
        {"date": d, **daily_reports[d]}
        for d in sorted(daily_reports.keys(), reverse=True)
    ]

    return {
        "user_id": user_id,
        "latest_vo2_max": latest_vo2_max,
        "workouts": workouts,
        "days": sorted_days
    }

# Serve the frontend directory at the root URL
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
