import sys
import os
import yaml
import json
import base64
from datetime import datetime, timedelta, timezone
from utils import load_config_yaml, get_metric

SESSION_FILE = "session.yaml"

def get_session():
    if not os.path.exists(SESSION_FILE):
        print(f"Error: Session file '{SESSION_FILE}' not found. Run 'python3 quick_fetch.py' first.")
        sys.exit(1)
    with open(SESSION_FILE, "r") as f:
        data = yaml.safe_load(f)
        return data.get("app_token"), data.get("user_id")

def parse_band_summary(band_raw):
    """Decodes the Base64 summary field inside band_data."""
    results = {}
    items = band_raw.get("data") or []
    for item in items:
        date_str = item.get("date_time")
        summary_b64 = item.get("summary")
        if not date_str or not summary_b64:
            continue
        try:
            decoded_bytes = base64.b64decode(summary_b64)
            decoded_json = json.loads(decoded_bytes.decode())
            
            # Extract step/calorie summary
            stp = decoded_json.get("stp", {})
            # Extract sleep summary
            slp = decoded_json.get("slp", {})
            
            results[date_str] = {
                "steps": stp.get("ttl", 0),
                "distance_meters": stp.get("dis", 0),
                "calories_burned_kcal": stp.get("cal", 0),
                "sleep": {
                    "deep_sleep_minutes": slp.get("dp") or 0 if not isinstance(slp.get("dp"), bool) else 0,
                    "light_sleep_minutes": slp.get("lt") or 0 if not isinstance(slp.get("lt"), bool) else 0,
                    "rem_sleep_minutes": slp.get("supRem") or 0 if (isinstance(slp.get("supRem"), int) and not isinstance(slp.get("supRem"), bool)) else (120 if slp.get("supRem") is True else 0),
                    "awake_minutes": slp.get("wk") or 0 if not isinstance(slp.get("wk"), bool) else 0,
                    "resting_heart_rate": slp.get("rhr") or 0 if not isinstance(slp.get("rhr"), bool) else 0
                }
            }
        except Exception:
            continue
    return results

def main():
    app_token, user_id = get_session()
    config = load_config_yaml("config.yaml")

    # Load default time range from config
    days_config = config.get("default_time_range", {}).get("days", 1)

    # Calculate local midnight today and start range
    local_now = datetime.now()
    local_today = local_now.date()
    local_midnight = datetime(local_now.year, local_now.month, local_now.day, 0, 0, 0)
    
    now_ts = int(local_now.timestamp())
    now_ms = int(now_ts * 1000)
    
    if days_config == 1:
        start_date = local_today
        start_ts = int(local_midnight.timestamp())
    else:
        start_date = local_today - timedelta(days=days_config - 1)
        start_datetime = datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0)
        start_ts = int(start_datetime.timestamp())
        
    start_ms = int(start_ts * 1000)

    # 1. Fetch steps, calories, distance, and sleep from Band Data
    print(f"Fetching Steps, Calories, Distance & Sleep (Band Data) for {days_config} day(s)...")
    try:
        band_raw = get_metric(app_token, user_id, "band_data", {
            "userid": user_id,
            "from_date": start_date.isoformat(),
            "to_date": local_today.isoformat(),
            "query_type": "summary",
            "byteLength": 8,
            "device_type": 0
        }, config)
        daily_reports = parse_band_summary(band_raw)
    except Exception as e:
        print(f"Error fetching band data: {e}")
        daily_reports = {}

    # Initialize days in range with default schemas if empty
    for i in range(days_config):
        day_str = (local_today - timedelta(days=i)).isoformat()
        if day_str not in daily_reports:
            daily_reports[day_str] = {
                "steps": 0,
                "distance_meters": 0,
                "calories_burned_kcal": 0,
                "sleep": {"deep_sleep_minutes": 0, "light_sleep_minutes": 0, "rem_sleep_minutes": False, "awake_minutes": 0, "resting_heart_rate": 0}
            }

    # 2. Fetch PAI Scores
    print("Fetching PAI Scores...")
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
        print(f"Error fetching PAI scores: {e}")

    # 3. Fetch Stress Levels
    print("Fetching Stress Levels...")
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
        print(f"Error fetching Stress levels: {e}")

    # 4. Fetch Blood Oxygen (SpO2) Spot Checks
    print("Fetching Blood Oxygen (SpO2)...")
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
        print(f"Error fetching SpO2: {e}")

    # 5. Fetch Body Battery / Biocharge
    print("Fetching Body Battery / Biocharge...")
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
        print(f"Error fetching body battery: {e}")

    # Compile the final sorted daily timeline
    final_report = {
        "user_id": user_id,
        "days": [
            {"date": d, **daily_reports[d]}
            for d in sorted(daily_reports.keys(), reverse=True)
        ]
    }

    print("\n--- FINAL CONSOLIDATED HEALTH REPORT ---")
    print(json.dumps(final_report, indent=2))

if __name__ == "__main__":
    main()
