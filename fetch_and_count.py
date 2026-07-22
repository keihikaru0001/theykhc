import os
import requests

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
    print(f"Fetching skip={skip}...")
    res = requests.get(url, headers=headers, params={"limit": limit, "skip": skip})
    if res.status_code != 200:
        print(f"Error fetching skip={skip}: {res.status_code}")
        break
    records = res.json()
    if not records:
        print("No more records returned.")
        break
    all_records.extend(records)
    print(f"Fetched {len(records)} records. Total: {len(all_records)}")
    if len(records) < limit:
        print("Reached end of records.")
        break
    skip += limit

go_records = []
for r in all_records:
    tags = r.get("tags", []) or []
    if "verdict:go" in tags:
        go_records.append(r)

print(f"\nTotal records: {len(all_records)}")
print(f"GO records: {len(go_records)}")

if go_records:
    print("\nSample GO record tags and SOM:")
    import re
    for r in go_records[:10]:
        answer = r.get("answer", "") or ""
        som_m = re.search(r'【SOM】([^\n]*)', answer)
        som_val = som_m.group(1).strip() if som_m else "None"
        print(f"ID: {r.get('id')}, Tags: {r.get('tags')}, SOM: {som_val}")
