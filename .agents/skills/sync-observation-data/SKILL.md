# sync-observation-data

観測データをGoogle Sheetsに保存し、GitHub Pages用JSONを更新するスキル。

## 実行方法
```
python3 .agents/skills/sync-observation-data/scripts/run.py
```

## 必須環境変数
- `GOOGLESHEETS_ACCESS_TOKEN` — Google Sheets API用トークン
- `GITHUB_ACCESS_TOKEN` — GitHub API用トークン

## 処理内容
1. `observation-data.json`を読み込み
2. Google Sheets（ID: 1MI_IncRsxr6ZcJiXq1lDlj7E2K8-iSBgu0HGW9v2y9E）の「観測データ」シートに全データを書き込み
3. 同じJSONをGitHub（keihikaru0001/theykhc）の`observation-data.json`にpush

## データ構造
- NeutrinoEvent（ニュートリノ観測）
- BiorhythmReading（バイオリズム観測）
- FxTickSnapshot（金市場観測）
- BrainwaveProxy（脳波プロキシ）
- KnowledgeStandard（知識本位制）
