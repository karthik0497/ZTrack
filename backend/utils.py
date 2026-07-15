import uuid
import urllib.parse
import requests
import yaml
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

def load_config_yaml(file_path="config.yaml"):
    """Loads the YAML configuration file."""
    with open(file_path, "r") as f:
        return yaml.safe_load(f)

def get_details_by_email_pw(email, password, config):
    """Logs in using email/password and returns (app_token, user_id)."""
    enc_config = config["zepp_encryption"]
    key = enc_config["key"].encode()
    iv = enc_config["iv"].encode()

    # Step A: Get temporary tokens via encrypted login credentials
    payload = config["payloads"]["tokens_payload"].copy()
    payload["emailOrPhone"] = email
    payload["password"] = password

    headers = config["headers"]["tokens_headers"]

    encoded = urllib.parse.urlencode(payload, doseq=True).encode()
    cipher = AES.new(key, AES.MODE_CBC, iv=iv)
    encrypted = cipher.encrypt(pad(encoded, AES.block_size))

    tokens_url = config["urls"]["tokens"]
    r = requests.post(
        tokens_url,
        data=encrypted,
        headers=headers,
        allow_redirects=False,
        timeout=15.0
    )
    if r.status_code != 303:
        raise Exception(f"Tokens request failed (status {r.status_code})")

    loc = r.headers.get("Location")
    if not loc:
        raise Exception("Location header missing in token response")

    parsed = urllib.parse.urlparse(loc)
    query = urllib.parse.parse_qs(parsed.query)
    access_token = query.get("access", [None])[0]
    if not access_token:
        raise Exception("Access token not found in login redirection URL.")

    # Step B: Exchange access token for final credentials
    login_payload = config["payloads"]["login_payload"].copy()
    login_payload["code"] = access_token
    login_payload["device_id"] = str(uuid.uuid4())

    login_headers = config["headers"]["login_headers"]
    login_url = config["urls"]["login"]

    r2 = requests.post(
        login_url,
        data=login_payload,
        headers=login_headers,
        timeout=15.0
    )
    if r2.status_code != 200:
        raise Exception(f"Final authorization request failed (status {r2.status_code})")

    res = r2.json()
    token_info = res.get("token_info", {})
    app_token = token_info.get("app_token")
    user_id = token_info.get("user_id")

    if not app_token or not user_id:
        raise Exception("Failed to parse app_token or user_id from authorization response")

    return app_token, user_id

def get_metric(app_token, user_id, metric_name, params, config):
    """Fetches a specific health metric from the Zepp API."""
    if metric_name not in config["urls"]:
        raise ValueError(f"Unknown metric/url key: {metric_name}")

    url_template = config["urls"][metric_name]
    
    # Dynamically extract and format placeholders (like {sport} or {user_id})
    import re
    placeholders = re.findall(r"\{(\w+)\}", url_template)
    
    url_params = {}
    params_copy = params.copy()
    for p in placeholders:
        if p == "user_id":
            url_params["user_id"] = user_id
        elif p in params_copy:
            url_params[p] = params_copy.pop(p)
            
    url = url_template.format(**url_params)
    
    q = {
        "r": str(uuid.uuid4()).upper(),
        **params_copy
    }

    headers = config["headers"]["data_headers"].copy()
    headers["apptoken"] = app_token

    r = requests.get(url, params=q, headers=headers, timeout=15.0)
    r.raise_for_status()
    return r.json()

def get_connect(app_token, user_id, config):
    """Fetches heart rate data from the Zepp API using the provided credentials."""
    import time
    end_time = int(time.time())
    start_time = end_time - (7 * 24 * 60 * 60) # 7 days ago

    params = {
        "startTime": start_time,
        "endTime": end_time,
        "limit": 10,
        "type": 2
    }
    return get_metric(app_token, user_id, "heart_rate", params, config)
