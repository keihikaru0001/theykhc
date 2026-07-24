#!/usr/bin/env python3
"""
観測データをGoogle Sheetsに保存 + GitHub JSONを更新
Usage: python3 sync_observation_data.py
"""
import json, urllib.request, urllib.parse, os, base64

GOOGLE_SHEET_ID = "1MI_IncRsxr6ZcJiXq1lDlj7E2K8-iSBgu0HGW9v2y9E"
GITHUB_REPO = "keihikaru0001/theykhc"
SHEET_NAME = "観測データ"

def get_token():
    return os.environ.get("GOOGLESHEETS_ACCESS_TOKEN", "")

def get_github_token():
    return os.environ.get("GITHUB_ACCESS_TOKEN", "")

def clear_sheet(token):
    """Clear existing data in the sheet"""
    range_name = urllib.parse.quote(SHEET_NAME) + "!A1:Z200"
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{GOOGLE_SHEET_ID}/values/{range_name}:clear"
    req = urllib.request.Request(url, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    urllib.request.urlopen(req)

def write_sheet(token, rows):
    """Write rows to the sheet"""
    write_range = urllib.parse.quote(SHEET_NAME) + "!A1"
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{GOOGLE_SHEET_ID}/values/{write_range}:append?valueInputOption=RAW"
    payload = json.dumps({"values": rows}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

def push_to_github(json_content, gh_token):
    """Push observation-data.json to GitHub"""
    # Check if file exists
    api_url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/observation-data.json"
    req = urllib.request.Request(api_url,
        headers={"Authorization": f"Bearer {gh_token}", "Accept": "application/vnd.github.v3+json"})
    try:
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read())
        sha = data['sha']
    except:
        sha = None

    encoded = base64.b64encode(json_content.encode('utf-8')).decode('ascii')
    payload = json.dumps({
        "message": "観測データ自動更新 — workflow",
        "content": encoded,
        "branch": "main",
        **({"sha": sha} if sha else {})
    }).encode('utf-8')

    req = urllib.request.Request(api_url, data=payload, method="PUT",
        headers={"Authorization": f"Bearer {gh_token}", "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

def build_rows(obs_data):
    """Build sheet rows from observation data dict"""
    rows = []
    rows.append(["=== 観測データ — Live Observation Layer ==="])
    rows.append(["生成日時", obs_data.get("generated_at", "")])
    rows.append([])

    # Origin
    rows.append(["=== ORIGIN POINT ==="])
    rows.append(["event_id", "HIKARI-19890707-PEAK"])
    rows.append(["origin_date", "1989-07-07"])
    summ = obs_data.get("observation_summary", {})
    rows.append(["description", summ.get("origin_description", "会長の原点。幸せの絶頂。V=N/DにおいてN最大・D最大の同時極値。")])
    rows.append([])

    # Neutrino Events
    rows.append(["=== ニュートリノ観測 — Neutrino Events ==="])
    rows.append(["event_id", "type", "energy_tev", "ra", "dec", "gcn_publish_time", "session", "note"])
    for e in obs_data.get("neutrino_events", []):
        rows.append([e.get("event_id",""), e.get("event_type",""), e.get("energy_tev",""),
                     e.get("ra",""), e.get("dec",""), e.get("gcn_publish_time",""),
                     e.get("session",""), e.get("note","")])
    rows.append([])

    # Biorhythm
    rows.append(["=== バイオリズム観測 — Biorhythm Readings ==="])
    rows.append(["date", "vnd_score", "observer_effect", "physical", "emotional", "intellectual", "notes"])
    for r in obs_data.get("biorhythm_readings", []):
        rows.append([r.get("date",""), r.get("vnd_score",""), r.get("observer_effect_score",""),
                     r.get("physical_cycle",""), r.get("emotional_cycle",""),
                     r.get("intellectual_cycle",""), r.get("notes","")])
    rows.append([])

    # FX Ticks
    rows.append(["=== 金市場観測 — Gold Market (XAUUSD) ==="])
    rows.append(["symbol", "bid", "ask", "spread", "note", "window"])
    for t in obs_data.get("fx_ticks", []):
        rows.append([t.get("symbol",""), t.get("bid",""), t.get("ask",""),
                     t.get("spread",""), t.get("note",""), t.get("window","")])
    rows.append([])

    # Brainwave
    rows.append(["=== 脳波プロキシ観測 — Brainwave Proxy ==="])
    if obs_data.get("brainwave_proxies"):
        rows.append(["proxy_type", "proxy_value", "resonance_score", "note"])
        for b in obs_data["brainwave_proxies"]:
            rows.append([b.get("proxy_type",""), b.get("proxy_value",""),
                         b.get("resonance_score",""), b.get("note","")])
    else:
        rows.append(["まだ波は観測されていない。枠組みだけがここにある。"])
    rows.append([])

    # Knowledge Standard
    rows.append(["=== Knowledge Standard — 知識本位制 ==="])
    ks = obs_data.get("knowledge_standard", {})
    if ks:
        rows.append(["TAM（兆円）", ks.get("tam_trillion_yen", "")])
        rows.append(["SAM（兆円）", ks.get("sam_trillion_yen", "")])
        rows.append(["SOM（兆円）", ks.get("som_trillion_yen", "")])
        rows.append(["DOI数", ks.get("doi_count", "")])
        rows.append(["GO判定アイデア数", ks.get("go_idea_count", "")])
        rows.append(["観測日", ks.get("observation_date", "")])
    rows.append([])

    # Summary
    rows.append(["=== 観測サマリー ==="])
    s = obs_data.get("observation_summary", {})
    rows.append(["Neutrino Events", s.get("neutrino_count", 0)])
    rows.append(["Biorhythm Readings", s.get("biorhythm_count", 0)])
    rows.append(["FX Tick Snapshots", s.get("fx_tick_count", 0)])
    rows.append(["Brainwave Proxies", s.get("brainwave_count", 0)])

    return rows

if __name__ == "__main__":
    token = get_token()
    gh_token = get_github_token()

    if not token:
        print("ERROR: GOOGLESHEETS_ACCESS_TOKEN not set")
        exit(1)
    if not gh_token:
        print("ERROR: GITHUB_ACCESS_TOKEN not set")
        exit(1)

    # Read observation data from local JSON
    obs_path = os.path.join(os.path.dirname(__file__), "..", "observation-data.json")
    if not os.path.exists(obs_path):
        obs_path = "observation-data.json"

    with open(obs_path, 'r', encoding='utf-8') as f:
        obs_data = json.load(f)

    # 1. Write to Google Sheets
    clear_sheet(token)
    rows = build_rows(obs_data)
    result = write_sheet(token, rows)
    print(f"Google Sheets: {len(rows)} rows written")

    # 2. Push JSON to GitHub
    with open(obs_path, 'r', encoding='utf-8') as f:
        json_content = f.read()
    gh_result = push_to_github(json_content, gh_token)
    print(f"GitHub: observation-data.json updated (commit: {gh_result['commit']['sha'][:12]})")

    print("Done.")
