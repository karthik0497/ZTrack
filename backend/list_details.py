import sys
import os
import yaml
from datetime import datetime, timedelta, timezone
from utils import load_config_yaml, get_metric

SESSION_FILE = "session.yaml"

def get_session():
    if not os.path.exists(SESSION_FILE):
        print(f"Error: Session file '{SESSION_FILE}' not found. Please run 'python3 quick_fetch.py' first to log in.")
        sys.exit(1)
    with open(SESSION_FILE, "r") as f:
        data = yaml.safe_load(f)
        return data.get("app_token"), data.get("user_id")

def test_metric(app_token, user_id, metric_name, params, config):
    try:
        res = get_metric(app_token, user_id, metric_name, params, config)
        return True, res
    except Exception as e:
        return False, str(e)

def main():
    app_token, user_id = get_session()
    config = load_config_yaml("config.yaml")

    print("=" * 60)
    print("      ZEPP WATCH DATA METRICS DISCOVERY REPORT")
    print("=" * 60)
    print(f"User ID: {user_id}\n")

    # Load default time range from config
    days_config = config.get("default_time_range", {}).get("days", 1)

    # Time parameters
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

    metrics_to_test = [
        {
            "name": "User Info / Profile",
            "key": "user_info",
            "params": {"userid": user_id},
            "desc": "Personal profile information (gender, height, weight, birthday, etc.)"
        },
        {
            "name": "Heart Rate",
            "key": "heart_rate",
            "params": {
                "startTime": start_ts,
                "endTime": now_ts,
                "limit": 5,
                "type": 2
            },
            "desc": "Recent heart rate measurements and rest heart rate logs"
        },
        {
            "name": "Band Data (Sleep & Steps)",
            "key": "band_data",
            "params": {
                "userid": user_id,
                "from_date": start_date.isoformat(),
                "to_date": local_today.isoformat(),
                "query_type": "detail",
                "byteLength": 8,
                "device_type": 0
            },
            "desc": "Step counts, sleep duration, sleep stages, calories, and distances"
        },
        {
            "name": "Weight Records",
            "key": "weight",
            "params": {
                "fromTime": start_ts,
                "toTime": now_ts,
                "limit": 5,
                "isForward": 0
            },
            "desc": "Weight and body composition scales metrics"
        },
        {
            "name": "VO2 Max",
            "key": "vo2_max",
            "params": {
                "startDay": start_date.isoformat(),
                "endDay": local_today.isoformat(),
                "limit": 5,
                "isReverse": "true"
            },
            "desc": "Cardiorespiratory fitness / VO2 Max estimation series"
        },
        {
            "name": "Sport Load",
            "key": "sport_load",
            "params": {
                "startDay": start_date.isoformat(),
                "endDay": local_today.isoformat(),
                "limit": 5,
                "isReverse": "true"
            },
            "desc": "Watch-calculated training/exercise loads"
        },
        {
            "name": "Blood Pressure",
            "key": "blood_pressure",
            "params": {
                "days": days_config,
                "sourceArrayStr": "com.huami.midong.associated,com.huami.midong",
                "toDate": local_today.isoformat()
            },
            "desc": "Systolic and diastolic blood pressure logs"
        },
        {
            "name": "Workouts / Activity History",
            "key": "sport_history",
            "params": {
                "sport": "run",
                "userid": user_id,
                "startTrackId": 0,
                "stopTrackId": 0,
                "need_sub_data": 1,
                "type": ""
            },
            "desc": "Workout history list (GPS coordinates, active speed, calories, etc.)"
        },
        {
            "name": "Stress & PAI Events",
            "key": "user_events",
            "params": {
                "eventType": "all_day_stress",
                "from": start_ms,
                "to": now_ms,
                "limit": 5,
                "reverse": 1,
                "userId": user_id
            },
            "desc": "All day stress timelines and PAI values"
        },
        {
            "name": "Readiness & HRV Score",
            "key": "readiness_events",
            "params": {
                "eventType": "readiness",
                "subType": "watch_score",
                "from": start_ms,
                "to": now_ms,
                "limit": 5
            },
            "desc": "Daily body readiness indices, HRV (Heart Rate Variability), and skin temperature"
        },
        {
            "name": "Continuous HR File Index",
            "key": "second_hr_files",
            "params": {
                "eventType": "second_heart_rate",
                "subType": "real_data",
                "from": start_ms,
                "to": now_ms,
                "limit": 5
            },
            "desc": "Per-second highly granular heart rate data files"
        },
        {
            "name": "Manual Data (Logged in App)",
            "key": "manual_data",
            "params": {
                "userid": user_id,
                "type": "sleep"
            },
            "desc": "Manually added entries (manual sleep logs, manually typed weights, etc.)"
        },
        {
            "name": "Blood Oxygen (SpO2) Spot Checks",
            "key": "user_events",
            "params": {
                "eventType": "blood_oxygen",
                "subType": "click",
                "from": start_ms,
                "to": now_ms,
                "limit": 5,
                "reverse": 1,
                "userId": user_id
            },
            "desc": "Manual/spot check blood oxygen saturation level (SpO2) measurements"
        },
        {
            "name": "Body Battery / Energy Charge",
            "key": "readiness_events",
            "params": {
                "eventType": "Charge",
                "subType": "real_data",
                "from": start_ms,
                "to": now_ms,
                "limit": 5
            },
            "desc": "Real-time body energy recharge and drain timeline statistics"
        },
        {
            "name": "Heart Rate Variability (HRV)",
            "key": "readiness_events",
            "params": {
                "eventType": "hrv_sdnn",
                "subType": "real_data",
                "from": start_ms,
                "to": now_ms,
                "limit": 5
            },
            "desc": "Heart Rate Variability (SDNN/RMSSD) data"
        },
        {
            "name": "Oxygen Desaturation Index (ODI)",
            "key": "user_events_date_string",
            "params": {
                "eventType": "blood_oxygen",
                "subType": "odi",
                "from": start_date.isoformat(),
                "to": local_today.isoformat(),
                "timeZone": "UTC",
                "limit": 5,
                "reverse": 1,
                "userId": user_id
            },
            "desc": "Oxygen desaturation indicators during sleep (helpful for sleep apnea detection)"
        }
    ]

    for m in metrics_to_test:
        print(f"Checking: {m['name']} ...")
        success, response = test_metric(app_token, user_id, m["key"], m["params"], config)
        
        status_text = "[SUCCESS]" if success else "[FAILED/EMPTY]"
        print(f"Status: {status_text}")
        print(f"Description: {m['desc']}")
        
        if success:
            if isinstance(response, dict):
                # Count items if list is present
                items = response.get("items") or response.get("data") or []
                if isinstance(items, list):
                    print(f"Result: Found {len(items)} records in the last {days_config} day(s).")
                elif "nickName" in response:
                    print(f"Result: Profile details parsed successfully (Nickname: {response.get('nickName')}).")
                else:
                    print(f"Result: Query succeeded. Keys returned: {list(response.keys())}")
            else:
                print(f"Result: Query succeeded.")
        else:
            print(f"Reason: {response}")
        print("-" * 60)

if __name__ == "__main__":
    main()
