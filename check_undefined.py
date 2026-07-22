import os
import requests
import re

backend_url = os.environ.get("VITE_BASE44_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BASE44_BACKEND_URL")
app_id = os.environ.get("VITE_BASE44_APP_ID") or os.environ.get("EXPO_PUBLIC_BASE44_APP_ID")
token = os.environ.get("BASE44_SERVICE_TOKEN")

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

url = f"{backend_url}/api/apps/{app_id}/entities/Question"

all_records = []
skip = 0
limit = 200

while True:
    res = requests.get(url, headers=headers, params={"limit": limit, "skip": skip})
    records = res.json()
    if not records:
        break
    all_records.extend(records)
    if len(records) < limit:
        break
    skip += limit

for r in all_records:
    tags = r.get("tags", []) or []
    if "verdict:go" in tags:
        answer = r.get("answer", "") or ""
        som_m = re.search(r'【SOM】([^\n]*)', answer)
        som_val = som_m.group(1).strip() if som_m else "None"
        if 'undefined' in som_val:
            print(f"ID: {r.get('id')}, Answer slice:\n{answer[-200:]}\n")
