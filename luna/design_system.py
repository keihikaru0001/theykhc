"""Replay human/AI authored design briefs with archive grounding and feedback gates.
Not an autonomous invention model or a validated complex-systems simulation.
"""
import argparse
import hashlib
import json
from pathlib import Path


def run(root, brief_file, feedback_file=None):
    catalog_path = root / 'go_full_clean_748.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))['questions']
    briefs = json.loads(brief_file.read_text(encoding='utf-8'))
    feedback = json.loads(feedback_file.read_text(encoding='utf-8')) if feedback_file else {}
    outputs = []
    for brief in briefs:
        sources = []
        for doi in brief['source_dois']:
            matches = [r for r in catalog if r.get('doi') == doi]
            if not matches:
                raise ValueError('Missing archive source: ' + doi)
            record = matches[0]
            sources.append({'doi': doi, 'title': record.get('title'), 'question': record['text'],
                            'access': 'github_saved_record_not_doi_fulltext'})
        observations = feedback.get(brief['id'], [])
        if any(o.get('blocking_issue') is True for o in observations):
            next_action = '制約違反の解消まで試験を止め、構成を修正する'
        elif any(o.get('paid_order') is True for o in observations):
            next_action = '契約範囲で納品し、工数・利用結果・再依頼を測る'
        elif observations:
            next_action = '観察された不便と代替手段を使って問い・構成を改訂する'
        else:
            next_action = brief['prototype']
        outputs.append({**brief, 'sources': sources, 'status': 'design_hypothesis',
                        'authorship': 'AI_authored_brief_replayed_by_code',
                        'feedback': observations, 'next_action': next_action})
    return {'system': 'TheYKHC DOI-to-design loop', 'version': '0.1',
            'source_sha256': hashlib.sha256(catalog_path.read_bytes()).hexdigest(),
            'steps': ['問い', '資料との照合', '核心', 'コンセプト', '構成', '相互作用', '試作', '観察', '再設計'],
            'scope': '制約と反応を取り込む設計ループの最小実装。科学的な複雑系モデルの実証ではない。',
            'proposals': outputs}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--briefs', required=True, type=Path)
    parser.add_argument('--feedback', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    result = run(Path(__file__).resolve().parents[1], args.briefs, args.feedback)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f"Generated {len(result['proposals'])} grounded design briefs: {args.output}")

if __name__ == '__main__':
    main()
