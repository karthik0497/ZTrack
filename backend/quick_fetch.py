import sys
import getpass
import json
import os
import yaml
from utils import load_config_yaml, get_details_by_email_pw, get_connect

SESSION_FILE = "session.yaml"

def main():
    # Load config from YAML file
    try:
        config = load_config_yaml("config.yaml")
    except Exception as e:
        print(f"Error loading config.yaml: {e}", file=sys.stderr)
        sys.exit(1)

    app_token = None
    user_id = None

    # 1. Try to load existing session from session.yaml
    if os.path.exists(SESSION_FILE):
        try:
            with open(SESSION_FILE, "r") as f:
                session_data = yaml.safe_load(f)
                if session_data:
                    app_token = session_data.get("app_token")
                    user_id = session_data.get("user_id")
                    if app_token and user_id:
                        print(f"Loaded saved session for User ID: {user_id}")
        except Exception as e:
            print(f"Warning: Could not read {SESSION_FILE}: {e}")

    # 2. If no saved session, prompt for email/password and authenticate
    if not app_token or not user_id:
        email = input("Enter Zepp Email: ").strip()
        password = getpass.getpass("Enter Zepp Password: ")

        if not email or not password:
            print("Email and Password cannot be empty.", file=sys.stderr)
            sys.exit(1)

        try:
            print("\nConnecting to Zepp Health API...")
            app_token, user_id = get_details_by_email_pw(email, password, config)
            
            # Save session to session.yaml
            session_data = {
                "app_token": app_token,
                "user_id": str(user_id)
            }
            with open(SESSION_FILE, "w") as f:
                yaml.safe_dump(session_data, f)
            print(f"Authentication Successful! Session saved to {SESSION_FILE}\n")

        except Exception as e:
            print(f"\nLogin Error: {e}", file=sys.stderr)
            sys.exit(1)

    # 3. Retrieve the watch data
    try:
        print("Retrieving watch data...")
        data = get_connect(app_token, user_id, config)
        
        # Pretty print the final retrieved health data
        print(json.dumps(data, indent=2))

    except Exception as e:
        # If credentials failed or expired, clean up the session file
        if "401" in str(e) or "403" in str(e) or "unauthorized" in str(e).lower():
            print(f"\nSession expired or unauthorized. Deleting {SESSION_FILE}...")
            if os.path.exists(SESSION_FILE):
                try:
                    os.remove(SESSION_FILE)
                except OSError:
                    pass
        print(f"\nError retrieving data: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
