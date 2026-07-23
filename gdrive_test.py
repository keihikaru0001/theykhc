import json
import os
import sys
import urllib.request

# Get the Google Drive access token from environment
token = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", "")
if not token:
    print("ERROR: GOOGLEDRIVE_ACCESS_TOKEN not set")
    sys.exit(1)

# Test data
data = {
    "test": True,
    "date": "2026-07-23",
    "message": "TheYKHC Question Backup Test"
}

json_data = json.dumps(data, ensure_ascii=False).encode("utf-8")
metadata = json.dumps({
    "name": "TheYKHC_Questions_Backup_Test.json",
    "mimeType": "application/json"
}, ensure_ascii=False).encode("utf-8")

# Create multipart body
boundary = "----FormBoundary7MA4YWxkTrZu0gW"
body = (
    b"--" + boundary.encode() + b"\r\n" +
    b"Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    metadata + b"\r\n" +
    b"--" + boundary.encode() + b"\r\n" +
    b"Content-Type: application/json\r\n\r\n" +
    json_data + b"\r\n" +
    b"--" + boundary.encode() + b"--\r\n"
)

# Upload to Google Drive
url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink"
req = urllib.request.Request(
    url,
    data=body,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/related; boundary={boundary}"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode("utf-8"))
        print(f"SUCCESS: {json.dumps(result, indent=2)}")
except Exception as e:
    print(f"ERROR: {e}")
    if hasattr(e, 'read'):
        print(e.read().decode('utf-8'))
