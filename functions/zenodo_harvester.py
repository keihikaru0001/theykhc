#!/usr/bin/env python3
"""
Zenodo Harvester — 會長の領域のメタデータをZenodo APIから取得
bash環境（サンドボックス）から実行。バックエンド関数のIP制限を回避。

使用法: python3 functions/zenodo_harvester.py [--max-records 50000] [--output seed_zenodo.json]
"""
import json
import time
import sys
import os
import urllib.request
import argparse

SUBJECTS = [
    'philosophy consciousness',
    'neutrino detection',
    'nanofiber biomedical',
    'chitosan conductive',
    'artificial intelligence ethics',
    'quantum economics',
    'market risk assessment',
    'neuroscience consciousness',
    'bioethics technology',
    'observer effect',
    'innovation management',
    'technology ethics',
    'digital transformation',
    'cognitive science',
    'complexity economics',
    'sustainable technology',
    'neural interface',
    'biosensor nanotechnology',
    'predictive analytics',
    'behavioral economics',
    'decision theory',
    'systems thinking',
    'knowledge management',
    'open science',
    'interdisciplinary research',
    'future studies',
    'nanofiber tissue engineering',
    'conductive polymer',
    'risk management framework',
    'impermanence mindfulness',
]

BATCH_SIZE = 10  # Zenodo API制限
DELAY = 0.3      # レートリミット対策（秒）

def fetch_zenodo(subject, page=1, batch_size=BATCH_SIZE):
    """Zenodo APIから1ページ分のメタデータを取得"""
    q = 'title:' + subject.replace(' ', '+')
    url = f'https://zenodo.org/api/records?size={batch_size}&page={page}&q={q}&sort=newest&type=publication&access_right=open'
    
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read())
        return data
    except Exception as e:
        print(f'  ERROR: {e}', file=sys.stderr)
        return None

def extract_records(data, subject):
    """Zenodo APIレスポンスから必要なフィールドを抽出"""
    records = []
    hits = data.get('hits', {}).get('hits', [])
    for record in hits:
        meta = record.get('metadata', {})
        title = meta.get('title', '')
        if not title:
            continue
        
        description = meta.get('description', '')
        # HTMLタグ除去 + 先頭200字
        import re
        abstract = re.sub(r'<[^>]+>', '', description)[:200]
        
        keywords_raw = meta.get('keywords', [])
        if isinstance(keywords_raw, list):
            keywords = ', '.join(keywords_raw)
        else:
            keywords = str(keywords_raw)
        
        authors = ', '.join([c.get('name', '') for c in meta.get('creators', [])])
        published_date = meta.get('publication_date', '')
        doi = record.get('doi', f'zenodo.{record.get("id")}')
        record_url = f'https://zenodo.org/records/{record.get("id")}'
        
        records.append({
            'doi': doi,
            'title': title,
            'abstract': abstract,
            'keywords': keywords,
            'authors': authors,
            'published_date': published_date,
            'zenodo_url': record_url,
            'source_subject': subject
        })
    
    return records

def main():
    parser = argparse.ArgumentParser(description='Zenodo Harvester')
    parser.add_argument('--max-records', type=int, default=50000, help='最大取得件数')
    parser.add_argument('--output', type=str, default='functions/seed_zenodo.json', help='出力ファイル')
    parser.add_argument('--max-pages-per-subject', type=int, default=20, help='1キーワードあたりの最大ページ')
    parser.add_argument('--subjects', type=str, nargs='*', help='カスタムキーワード（デフォルトは内蔵リスト）')
    parser.add_argument('--dry-run', action='store_true', help='取得のみ（保存しない）')
    args = parser.parse_args()
    
    subjects = args.subjects if args.subjects else SUBJECTS
    max_per_subject = args.max_records // len(subjects) + 1
    
    all_records = []
    stats = {}
    
    print(f'Zenodo Harvester 開始')
    print(f'キーワード数: {len(subjects)}')
    print(f'1キーワードあたり最大: {max_per_subject}件 ({args.max_pages_per_subject}ページ)')
    print(f'全体目標: {args.max_records}件')
    print(f'出力: {args.output}')
    print()
    
    for si, subject in enumerate(subjects):
        subject_saved = 0
        subject_pages = 0
        
        for page in range(1, args.max_pages_per_subject + 1):
            if subject_saved >= max_per_subject:
                break
            if len(all_records) >= args.max_records:
                break
            
            data = fetch_zenodo(subject, page)
            if data is None:
                print(f'  [{si+1}/{len(subjects)}] {subject} - page {page}: エラー、スキップ')
                break
            
            total_hits = data.get('hits', {}).get('total', 0)
            records = extract_records(data, subject)
            
            if len(records) == 0:
                break
            
            all_records.extend(records)
            subject_saved += len(records)
            subject_pages += 1
            
            if page == 1:
                print(f'  [{si+1}/{len(subjects)}] {subject}: {total_hits}件ヒット → {subject_saved}件取得')
            
            if len(records) < BATCH_SIZE:
                break
            
            time.sleep(DELAY)
        
        stats[subject] = {
            'hits': total_hits if 'total_hits' in dir() else 0,
            'saved': subject_saved,
            'pages': subject_pages
        }
        
        if len(all_records) >= args.max_records:
            print(f'\n最大件数 {args.max_records} に到達。停止。')
            break
    
    # 重複排除（DOIベース）
    seen_dois = set()
    unique_records = []
    for r in all_records:
        doi = r['doi']
        if doi not in seen_dois:
            seen_dois.add(doi)
            unique_records.append(r)
    
    print(f'\n=== 取得完了 ===')
    print(f'総取得件数: {len(all_records)}')
    print(f'重複排除後: {len(unique_records)}')
    print(f'キーワード別統計:')
    for subject, s in stats.items():
        print(f'  {subject}: {s["saved"]}件 ({s["pages"]}ページ)')
    
    if not args.dry_run:
        # JSONファイルに保存
        output = {
            'total': len(unique_records),
            'subjects': len(subjects),
            'stats': stats,
            'records': unique_records
        }
        
        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        
        print(f'\n保存完了: {args.output}')
        
        # Base44 seedImporter用のバッチファイルも生成
        batch_dir = os.path.dirname(args.output)
        batch_size = 100
        for i in range(0, len(unique_records), batch_size):
            batch = unique_records[i:i+batch_size]
            batch_file = os.path.join(batch_dir, f'seed_zenodo_batch_{i//batch_size:03d}.json')
            with open(batch_file, 'w', encoding='utf-8') as f:
                json.dump(batch, f, ensure_ascii=False, indent=2)
        
        num_batches = (len(unique_records) + batch_size - 1) // batch_size
        print(f'バッチファイル: {num_batches}個 (100件/バッチ)')
    
    return unique_records

if __name__ == '__main__':
    records = main()
