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
res1 = requests.get(url, headers=headers, params={"limit": 2, "skip": 0})
res2 = requests.get(url, headers=headers, params={"limit": 2, "skip": 2})

print("Batch 1:", [r['id'] for r in res1.json()])
print("Batch 2:", [r['id'] for r in res2.json()])
