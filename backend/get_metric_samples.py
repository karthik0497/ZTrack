import sys
import os
import yaml
import json
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

def main():
    app_token, user_id = get_session()
    config = load_config_yaml("config.yaml")

    now = datetime.now(timezone.utc)
    today = now.date()
    seven_days_ago = today - timedelta(days=7)
    
    now_ts = int(now.timestamp())
    seven_days_ago_ts = int((now - timedelta(days=7)).timestamp())
    
    now_ms = int(now_ts * 1000)
    seven_days_ago_ms = int(seven_days_ago_ts * 1000)

    # 1. PAI Score Sample
    print("\n--- [PAI Score Sample] ---")
    try:
        pai_data = get_metric(app_token, user_id, "user_events", {
            "eventType": "PaiHealthInfo",
            "from": seven_days_ago_ms,
            "to": now_ms,
            "limit": 1,
            "reverse": 1,
            "userId": user_id
        }, config)
        items = pai_data.get("items") or []
        if items:
            print(json.dumps(items[0], indent=2))
        else:
            print("No PAI records found in the last 7 days.")
    except Exception as e:
        print(f"Error: {e}")

    # 2. Stress Level Sample
    print("\n--- [Stress Level Sample] ---")
    try:
        stress_data = get_metric(app_token, user_id, "user_events", {
            "eventType": "all_day_stress",
            "from": seven_days_ago_ms,
            "to": now_ms,
            "limit": 1,
            "reverse": 1,
            "userId": user_id
        }, config)
        items = stress_data.get("items") or []
        if items:
            print(json.dumps(items[0], indent=2))
        else:
            print("No stress records found.")
    except Exception as e:
        print(f"Error: {e}")

    # 3. Blood Oxygen (SpO2) Sample
    print("\n--- [Blood Oxygen Spot Checks Sample] ---")
    try:
        spo2_data = get_metric(app_token, user_id, "user_events", {
            "eventType": "blood_oxygen",
            "subType": "click",
            "from": seven_days_ago_ms,
            "to": now_ms,
            "limit": 1,
            "reverse": 1,
            "userId": user_id
        }, config)
        items = spo2_data.get("items") or []
        if items:
            print(json.dumps(items[0], indent=2))
        else:
            print("No SpO2 spot records found.")
    except Exception as e:
        print(f"Error: {e}")

    # 4. Biocharge / Body Battery Sample
    print("\n--- [Body Battery / Biocharge Sample] ---")
    try:
        battery_data = get_metric(app_token, user_id, "readiness_events", {
            "eventType": "Charge",
            "subType": "real_data",
            "from": seven_days_ago_ms,
            "to": now_ms,
            "limit": 1
        }, config)
        items = battery_data.get("items") or []
        if items:
            print(json.dumps(items[0], indent=2))
        else:
            print("No Body Battery records found.")
    except Exception as e:
        print(f"Error: {e}")

    # 5. Calories Burning / Steps (Band Data) Sample
    print("\n--- [Band Data / Daily Calories Sample] ---")
    try:
        band_data = get_metric(app_token, user_id, "band_data", {
            "userid": user_id,
            "from_date": (today - timedelta(days=1)).isoformat(),
            "to_date": today.isoformat(),
            "query_type": "summary",
            "byteLength": 8,
            "device_type": 0
        }, config)
        if band_data:
            # Print just one item summary to avoid huge print
            print(json.dumps(band_data[:1], indent=2))
        else:
            print("No Band Data found.")
    except Exception as e:
        print(f"Error: {e}")

    # 6. Altitude / Workout History Sample
    print("\n--- [Workout History / Altitude Sample] ---")
    try:
        workout_data = get_metric(app_token, user_id, "sport_history", {
            "sport": "run",
            "userid": user_id,
            "startTrackId": 0,
            "stopTrackId": 0,
            "need_sub_data": 1,
            "type": ""
        }, config)
        items = workout_data.get("data", {}).get("summary", [])
        if items:
            print(json.dumps(items[0], indent=2))
        else:
            print("No running workout history records found.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
