#!/usr/bin/env python3
"""
TheYKHC Question Backup → Google Drive
Reads Question records from a JSON file and uploads to Google Drive.
Used by the MorningHarvest workflow's Google Drive backup step.

Usage:
  python3 gdrive_backup.py <input_json_file>

Environment:
  GOOGLEDRIVE_ACCESS_TOKEN - Google Drive OAuth token (set by get_connector_token)
"""
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime

def upload_to_gdrive(file_name, data_bytes, token, folder_name="TheYKHC"):
    """Upload a file to Google Drive, optionally in a specific folder."""
    
    # Step 1: Search for the folder
    folder_id = None
    search_url = f"https://www.googleapis.com/drive/v3/files?q=name='{folder_name}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)"
    
    req = urllib.request.Request(
        search_url,
        headers={"Authorization": f"Bearer {token}"},
        method="GET"
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))
            files = result.get("files", [])
            if files:
                folder_id = files[0]["id"]
                print(f"Found folder '{folder_name}' (ID: {folder_id})")
    except Exception as e:
        print(f"Warning: Could not search for folder: {e}")
    
    # Step 2: Create folder if not found
    if not folder_id:
        create_url = "https://www.googleapis.com/drive/v3/files"
        folder_metadata = json.dumps({
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder"
        }).encode("utf-8")
        
        req = urllib.request.Request(
            create_url,
            data=folder_metadata,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode("utf-8"))
                folder_id = result["id"]
                print(f"Created folder '{folder_name}' (ID: {folder_id})")
        except Exception as e:
            print(f"Warning: Could not create folder: {e}")
    
    # Step 3: Upload file with multipart upload
    boundary = "----FormBoundary7MA4YWxkTrZu0gW"
    
    metadata_dict = {
        "name": file_name,
        "mimeType": "application/json"
    }
    if folder_id:
        metadata_dict["parents"] = [folder_id]
    
    metadata = json.dumps(metadata_dict, ensure_ascii=False).encode("utf-8")
    
    body = (
        b"--" + boundary.encode() + b"\r\n" +
        b"Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        metadata + b"\r\n" +
        b"--" + boundary.encode() + b"\r\n" +
        b"Content-Type: application/json\r\n\r\n" +
        data_bytes + b"\r\n" +
        b"--" + boundary.encode() + b"--\r\n"
    )
    
    upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size"
    
    req = urllib.request.Request(
        upload_url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/related; boundary={boundary}"
        },
        method="POST"
    )
    
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode("utf-8"))
        return result

def main():
    token = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", "")
    if not token:
        print("ERROR: GOOGLEDRIVE_ACCESS_TOKEN not set")
        sys.exit(1)
    
    if len(sys.argv) < 2:
        print("Usage: python3 gdrive_backup.py <input_json_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    with open(input_file, "rb") as f:
        data_bytes = f.read()
    
    today = datetime.now().strftime("%Y-%m-%d")
    file_name = f"TheYKHC_Questions_Backup_{today}.json"
    
    print(f"Uploading {len(data_bytes)} bytes as '{file_name}' to Google Drive...")
    
    result = upload_to_gdrive(file_name, data_bytes, token)
    
    print(f"\nSUCCESS!")
    print(f"  File ID: {result.get('id')}")
    print(f"  File Name: {result.get('name')}")
    print(f"  Size: {result.get('size')} bytes")
    print(f"  View Link: {result.get('webViewLink')}")

if __name__ == "__main__":
    main()
