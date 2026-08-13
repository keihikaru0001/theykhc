import tempfile
import unittest
from pathlib import Path

from luna.engine import LunaEngine


ROOT = Path(__file__).resolve().parents[1]


class LunaEngineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = LunaEngine(ROOT).load()

    def test_loads_real_archive(self):
        self.assertGreater(self.engine.inventory()["records"], 1000)
        self.assertEqual(self.engine.dataset_status["doi"]["status"], "loaded")

    def test_doi_does_not_become_verified(self):
        doi_records = [record for record in self.engine.records if record.source == "doi"]
        self.assertTrue(doi_records)
        self.assertTrue(all(record.evidence_state != "verified" for record in doi_records))

    def test_default_generation_excludes_high_risk(self):
        ventures = self.engine.generate(8)
        self.assertEqual(len(ventures), 8)
        self.assertTrue(all(not venture["risk_flags"] for venture in ventures))
        self.assertTrue(all(venture["status"] == "candidate_not_validated" for venture in ventures))

    def test_snapshot_is_utf8_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.engine.write_snapshot(Path(directory) / "snapshot.json", ventures=2)
            self.assertIn("Luna", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
