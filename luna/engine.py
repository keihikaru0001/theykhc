"""Evidence-aware venture generation over the archived TheYKHC datasets.

This module deliberately treats archive entries as *records*, not verified facts.
It never converts a DOI, a market-size sentence, or a prior GO label into proof.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable


DATASETS = {
    "doi": "doi_catalog_final.json",
    "questions": "go_full_clean_748.json",
    "evaluated_businesses": "go-ideas-export.json",
    "catalog": "kika_catalog_data.json",
    "archive": "all_data_export.json",
}

RISK_TERMS = {
    "medical": ("治療", "患者", "医療", "移植", "再生", "脊髄", "神経", "筋肉", "臓器", "オルガン", "health", "medical"),
    "financial": ("投資", "金融", "価格予測", "金市場", "資産", "通貨", "return", "market prediction"),
    "safety_critical": ("自律運転", "航空", "原子力", "診断", "手術", "defense"),
    "minors": ("未成年", "子ども", "児童", "学校", "生徒"),
}

SCIENCE_TERMS = ("仮説", "研究", "実験", "論文", "科学", "細胞", "宇宙", "観測")
DESIGN_TERMS = ("設計", "アプリ", "システム", "プラットフォーム", "サービス", "SaaS", "デザイン")
PHILOSOPHY_TERMS = ("思想", "哲学", "世界観", "良心", "徳", "借財", "V=N/D")


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return " ".join(_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(_text(item) for item in value.values())
    return str(value)


def _fingerprint(text: str) -> str:
    normalized = re.sub(r"\s+", "", text).lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def _layer(text: str) -> str:
    scores = {
        "science_candidate": sum(term.lower() in text.lower() for term in SCIENCE_TERMS),
        "design": sum(term.lower() in text.lower() for term in DESIGN_TERMS),
        "philosophy": sum(term.lower() in text.lower() for term in PHILOSOPHY_TERMS),
    }
    winner, score = max(scores.items(), key=lambda item: item[1])
    return winner if score else "narrative_or_unclassified"


def _risks(text: str) -> list[str]:
    lowered = text.lower()
    return [name for name, terms in RISK_TERMS.items() if any(term.lower() in lowered for term in terms)]


def _evidence_state(record: dict[str, Any], risks: list[str]) -> str:
    text = _text(record)
    has_doi = bool(re.search(r"10\.\d{4,9}/\S+", text))
    has_method = any(term in text for term in ("標本", "解析", "方法", "実験", "効果量", "再現"))
    if risks or not (has_doi and has_method):
        return "unverified"
    return "review_required"


@dataclass(frozen=True)
class Record:
    id: str
    source: str
    title: str
    text: str
    industry: str
    doi: str
    layer: str
    risks: tuple[str, ...]
    evidence_state: str


class LunaEngine:
    """Load, classify and synthesize TheYKHC records without asserting truth."""

    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.records: list[Record] = []
        self.dataset_status: dict[str, dict[str, Any]] = {}

    def load(self) -> "LunaEngine":
        records: list[Record] = []
        for source, filename in DATASETS.items():
            path = self.root / filename
            if not path.exists():
                self.dataset_status[source] = {"file": filename, "status": "missing", "raw_count": 0}
                continue
            data = json.loads(path.read_text(encoding="utf-8"))
            items = list(self._items(source, data))
            self.dataset_status[source] = {"file": filename, "status": "loaded", "raw_count": len(items)}
            records.extend(self._normalize(source, item) for item in items)

        unique: dict[str, Record] = {}
        for record in records:
            unique.setdefault(record.id, record)
        self.records = list(unique.values())
        return self

    @staticmethod
    def _items(source: str, data: Any) -> Iterable[dict[str, Any]]:
        if source == "questions" and isinstance(data, dict):
            data = data.get("questions", [])
        elif source == "catalog" and isinstance(data, dict):
            data = data.get("ideas", [])
        elif source == "archive" and isinstance(data, dict):
            data = data.get("new_business_domains", [])
        if isinstance(data, list):
            yield from (item for item in data if isinstance(item, dict))

    @staticmethod
    def _normalize(source: str, item: dict[str, Any]) -> Record:
        title = _text(item.get("title") or item.get("Title") or item.get("name"))
        body = _text(item.get("text") or item.get("description") or item.get("insight") or title)
        answer = _text(item.get("answer"))
        combined = " ".join(part for part in (title, body, answer) if part)
        doi = _text(item.get("doi") or item.get("DOI") or item.get("source_doi"))
        risks = _risks(combined)
        return Record(
            id=f"{source}:{_fingerprint(combined or json.dumps(item, ensure_ascii=False, sort_keys=True))}",
            source=source,
            title=title or body[:100],
            text=body,
            industry=_text(item.get("industry") or item.get("Category") or "unclassified"),
            doi=doi,
            layer=_layer(combined),
            risks=tuple(risks),
            evidence_state=_evidence_state(item, risks),
        )

    def inventory(self) -> dict[str, Any]:
        return {
            "engine": "Luna",
            "status": "operational_local",
            "scope": "repository_snapshot",
            "records": len(self.records),
            "datasets": self.dataset_status,
            "sources": dict(Counter(record.source for record in self.records)),
            "layers": dict(Counter(record.layer for record in self.records)),
            "risk_flags": dict(Counter(risk for record in self.records for risk in record.risks)),
            "evidence_states": dict(Counter(record.evidence_state for record in self.records)),
            "limitations": [
                "Archive inclusion is not scientific verification.",
                "DOI registration is not peer review or asset valuation.",
                "Market figures are not accepted without independent source verification.",
                "Generated ventures are research candidates, not investment or medical advice.",
            ],
        }

    def generate(self, count: int = 5, allow_high_risk: bool = False) -> list[dict[str, Any]]:
        candidates = [r for r in self.records if r.source in {"questions", "evaluated_businesses", "archive"}]
        candidates.sort(key=lambda r: (bool(r.risks), r.industry == "unclassified", r.id))
        results: list[dict[str, Any]] = []
        used: set[tuple[str, str]] = set()

        for index, left in enumerate(candidates):
            for right in candidates[index + 1:]:
                if left.id == right.id or left.industry == right.industry:
                    continue
                pair = tuple(sorted((left.id, right.id)))
                if pair in used:
                    continue
                used.add(pair)
                risks = sorted(set(left.risks) | set(right.risks))
                if risks and not allow_high_risk:
                    continue
                results.append(self._venture(left, right, risks))
                if len(results) >= count:
                    return results
        return results

    @staticmethod
    def _venture(left: Record, right: Record, risks: list[str]) -> dict[str, Any]:
        title = f"{left.industry} × {right.industry} 検証工房"
        gates = ["顧客課題インタビュー", "既存代替手段の調査", "小規模プロトタイプ", "成功・中止基準の事前登録"]
        if "medical" in risks:
            gates += ["独立一次文献レビュー", "倫理・規制確認", "臨床効果を表示しない"]
        if "financial" in risks:
            gates += ["アウト・オブ・サンプル検証", "取引費用込み評価", "投資商品として販売しない"]
        if "safety_critical" in risks:
            gates += ["安全工学レビュー", "人命に関わる実運用を禁止"]
        if "minors" in risks:
            gates += ["保護者・倫理審査", "個人データ最小化"]
        return {
            "title": title,
            "status": "candidate_not_validated",
            "concept": f"「{left.title[:60]}」の問いと「{right.title[:60]}」の設計要素を組み合わせ、共通課題を検証する小規模サービス候補。",
            "source_records": [asdict(left), asdict(right)],
            "hypothesis": "二つの領域を横断することで、単独領域では解けなかった顧客摩擦を減らせる可能性がある。",
            "first_customer_test": "対象者5〜10名への問題インタビュー後、購入を伴わない試作品で利用意向を確認する。",
            "metrics": ["課題を自発的に述べた比率", "試作品の完遂率", "再利用意向", "重大な反対理由"],
            "stop_conditions": ["課題保有者が5名中2名未満", "安全ゲートを満たせない", "既存手段に対する明確な改善がない"],
            "risk_flags": risks,
            "required_gates": gates,
            "claims_policy": "市場規模・治療効果・収益性・因果関係を確定表現しない。",
        }

    def write_snapshot(self, output: str | Path, ventures: int = 10) -> Path:
        path = Path(output)
        payload = {
            "inventory": self.inventory(),
            "generated_ventures": self.generate(ventures),
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return path
