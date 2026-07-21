import { useState, useEffect } from "react";
import { SeedRecord, Question } from "../api/entities";
import { ideaSynthetix } from "../api/backendFunctions";

export default function Brainstorm() {
  const [seeds, setSeeds] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab] = useState('questions'); // questions | brainstorm | seeds
  const [brainstormTopic, setBrainstormTopic] = useState("");
  const [brainstormIndustry, setBrainstormIndustry] = useState("");
  const [brainstormResult, setBrainstormResult] = useState(null);
  const [expandedAnswer, setExpandedAnswer] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, q] = await Promise.all([SeedRecord.list(), Question.list()]);
      setSeeds(s);
      setQuestions(q.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    } catch (err) {}
    setLoading(false);
  };

  const openQuestions = questions.filter(q => q.status === 'open' && q.type === 'question');
  const answeredQuestions = questions.filter(q => q.status === 'answered');
  const productIdeas = questions.filter(q => q.type === 'product');
  const businessIdeas = questions.filter(q => q.type === 'business');

  const handleRequestion = async (seedId) => {
    setActionLoading(true);
    try {
      const result = await ideaSynthetix({ action: 'requestion', seed_id: seedId });
      await loadData();
    } catch (err) {
      alert('問い直しに失敗しました: ' + (err.message || err));
    }
    setActionLoading(false);
  };

  const handleSolve = async (questionId) => {
    setActionLoading(true);
    try {
      const result = await ideaSynthetix({ action: 'solve', question_id: questionId });
      if (result.answer) {
        setExpandedAnswer({ id: questionId, answer: result.answer });
        await loadData();
      }
    } catch (err) {
      alert('解くのに失敗しました: ' + (err.message || err));
    }
    setActionLoading(false);
  };

  const handleBrainstorm = async () => {
    if (!brainstormTopic.trim()) return;
    setActionLoading(true);
    setBrainstormResult(null);
    try {
      const result = await ideaSynthetix({
        action: 'brainstorm',
        topic: brainstormTopic,
        industry: brainstormIndustry || undefined,
      });
      setBrainstormResult(result.result);
      await loadData();
    } catch (err) {
      alert('ブレストに失敗しました: ' + (err.message || err));
    }
    setActionLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 50%, #0a0f0d 100%)",
      color: "#e8e8f0",
      fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif",
      padding: "40px 20px",
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .fade-in { animation: fadeIn 0.4s ease; }
        textarea:focus, input:focus { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }
        .markdown h2 { color: #a78bfa; font-size: 15px; margin: 16px 0 8px; }
        .markdown p { color: #9ca3af; font-size: 13px; line-height: 1.8; margin: 4px 0; }
        .markdown ul { color: #9ca3af; font-size: 13px; line-height: 1.8; padding-left: 20px; }
      `}</style>

      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* ヘッダー */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, letterSpacing: "0.3em", color: "#34d399",
          }}>IDEASYNTHETIX</div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
            問い直す → 解く → ブレストする
          </div>
        </div>

        {/* タブ */}
        <div style={{
          display: "flex", gap: 8, marginBottom: 24,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12, padding: 4,
        }}>
          {[
            { key: 'questions', label: '問い', count: openQuestions.length },
            { key: 'answered', label: '解いた問い', count: answeredQuestions.length },
            { key: 'brainstorm', label: 'ブレスト', count: null },
            { key: 'seeds', label: '論文', count: seeds.length },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: "10px 16px",
                background: tab === t.key ? "rgba(52,211,153,0.1)" : "transparent",
                border: "none", borderRadius: 8,
                color: tab === t.key ? "#34d399" : "#6b7280",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
            >
              {t.label}{t.count !== null && ` (${t.count})`}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>
            <span style={{ animation: "pulse 1.5s infinite" }}>読み込み中...</span>
          </div>
        )}

        {/* タブ: 問い（Open） */}
        {tab === 'questions' && !loading && (
          <div className="fade-in" style={{ display: "grid", gap: 12 }}>
            {/* Product/Business ideas summary */}
            {(productIdeas.length > 0 || businessIdeas.length > 0) && (
              <div style={{
                display: "flex", gap: 12, marginBottom: 8,
              }}>
                {productIdeas.length > 0 && (
                  <div style={{
                    flex: 1, background: "rgba(96,165,250,0.04)",
                    border: "1px solid rgba(96,165,250,0.12)", borderRadius: 10, padding: "10px 16px",
                  }}>
                    <div style={{ fontSize: 10, color: "#4b5563" }}>プロダクト案</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#60a5fa" }}>{productIdeas.length}</div>
                  </div>
                )}
                {businessIdeas.length > 0 && (
                  <div style={{
                    flex: 1, background: "rgba(167,139,250,0.04)",
                    border: "1px solid rgba(167,139,250,0.12)", borderRadius: 10, padding: "10px 16px",
                  }}>
                    <div style={{ fontSize: 10, color: "#4b5563" }}>ビジネス案</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#a78bfa" }}>{businessIdeas.length}</div>
                  </div>
                )}
              </div>
            )}

            {openQuestions.map(q => (
              <div key={q.id} className="fade-in" style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(52,211,153,0.12)",
                borderRadius: 14, padding: "18px 22px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 6 }}>
                      {q.industry || '一般'} {q.source_title ? `— ${q.source_title.slice(0, 40)}` : ''}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: "#e8e8f0" }}>{q.text}</div>
                    {q.insight && (
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8, fontStyle: "italic" }}>
                        {q.insight}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleSolve(q.id)}
                    disabled={actionLoading}
                    style={{
                      padding: "8px 16px",
                      background: actionLoading ? "rgba(255,255,255,0.05)" : "rgba(52,211,153,0.1)",
                      border: "1px solid rgba(52,211,153,0.2)", borderRadius: 8,
                      color: actionLoading ? "#4b5563" : "#34d399",
                      fontSize: 11, fontWeight: 600, cursor: actionLoading ? "default" : "pointer",
                      whiteSpace: "nowrap", fontFamily: "inherit",
                    }}
                  >
                    {actionLoading ? '...' : '解く'}
                  </button>
                </div>

                {expandedAnswer?.id === q.id && (
                  <div className="fade-in" style={{
                    marginTop: 16, paddingTop: 16,
                    borderTop: "1px solid rgba(52,211,153,0.1)",
                  }}>
                    <div className="markdown" dangerouslySetInnerHTML={{
                      __html: (expandedAnswer.answer || '')
                        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                        .replace(/\n/g, '<br/>')
                    }} />
                  </div>
                )}
              </div>
            ))}

            {openQuestions.length === 0 && (
              <div style={{ textAlign: "center", color: "#4b5563", padding: 40 }}>
                未解決の問いはありません。「論文」タブから問い直してください。
              </div>
            )}
          </div>
        )}

        {/* タブ: 解いた問い */}
        {tab === 'answered' && !loading && (
          <div className="fade-in" style={{ display: "grid", gap: 12 }}>
            {answeredQuestions.map(q => (
              <div key={q.id} className="fade-in" style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14, padding: "18px 22px",
              }}>
                <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 6 }}>
                  ✓ 解決済み — {q.industry || '一般'}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#e8e8f0", marginBottom: 12 }}>{q.text}</div>
                <button
                  onClick={() => setExpandedAnswer(expandedAnswer?.id === q.id ? null : { id: q.id, answer: q.answer })}
                  style={{
                    padding: "6px 12px", background: "transparent",
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                    color: "#9ca3af", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {expandedAnswer?.id === q.id ? '閉じる' : '回答を見る'}
                </button>
                {expandedAnswer?.id === q.id && (
                  <div className="fade-in" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <div className="markdown" dangerouslySetInnerHTML={{
                      __html: (expandedAnswer.answer || '')
                        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                        .replace(/\n/g, '<br/>')
                    }} />
                  </div>
                )}
              </div>
            ))}
            {answeredQuestions.length === 0 && (
              <div style={{ textAlign: "center", color: "#4b5563", padding: 40 }}>
                まだ解いた問いはありません。
              </div>
            )}
          </div>
        )}

        {/* タブ: ブレスト */}
        {tab === 'brainstorm' && (
          <div className="fade-in">
            <div style={{
              background: "rgba(52,211,153,0.03)",
              border: "1px solid rgba(52,211,153,0.15)",
              borderRadius: 16, padding: "24px", marginBottom: 20,
            }}>
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>
                仕事のテーマを入力。ECHO内の既存データ（論文・問い）を参照しながらブレストします。
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input
                  type="text"
                  value={brainstormTopic}
                  onChange={e => setBrainstormTopic(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !actionLoading) handleBrainstorm(); }}
                  placeholder="例: 物流コストを半分にする / 新しい教育サービス / ニュートリノ観測をビジネスにする"
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
                    padding: "14px 18px", color: "#e8e8f0", fontSize: 14,
                    fontFamily: "inherit",
                  }}
                />
                <div style={{ display: "flex", gap: 12 }}>
                  <select
                    value={brainstormIndustry}
                    onChange={e => setBrainstormIndustry(e.target.value)}
                    style={{
                      flex: 1, background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
                      padding: "12px 16px", color: "#9ca3af", fontSize: 13,
                      fontFamily: "inherit",
                    }}
                  >
                    <option value="">業界（自由入力可）</option>
                    <option value="仕事とビジネス">仕事とビジネス</option>
                    <option value="科学と技術">科学と技術</option>
                    <option value="社会と倫理">社会と倫理</option>
                    <option value="生活と健康">生活と健康</option>
                    <option value="教育と学習">教育と学習</option>
                  </select>
                  <button
                    onClick={handleBrainstorm}
                    disabled={actionLoading || !brainstormTopic.trim()}
                    style={{
                      padding: "12px 28px",
                      background: actionLoading || !brainstormTopic.trim()
                        ? "rgba(255,255,255,0.05)"
                        : "linear-gradient(135deg, #34d399, #60a5fa)",
                      border: "none", borderRadius: 10,
                      color: actionLoading || !brainstormTopic.trim() ? "#4b5563" : "white",
                      fontWeight: 700, fontSize: 14, cursor: "pointer",
                      fontFamily: "inherit", transition: "all 0.2s",
                    }}
                  >
                    {actionLoading ? '思考中...' : 'ブレスト'}
                  </button>
                </div>
              </div>
            </div>

            {actionLoading && !brainstormResult && (
              <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>
                <span style={{ animation: "pulse 1.5s infinite" }}>アイデアを紡いでいます...</span>
              </div>
            )}

            {brainstormResult && (
              <div className="fade-in" style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(52,211,153,0.15)",
                borderRadius: 16, padding: "24px",
              }}>
                <div className="markdown" dangerouslySetInnerHTML={{
                  __html: brainstormResult
                    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                    .replace(/\n/g, '<br/>')
                }} />
              </div>
            )}
          </div>
        )}

        {/* タブ: 論文 */}
        {tab === 'seeds' && !loading && (
          <div className="fade-in" style={{ display: "grid", gap: 12 }}>
            {seeds.map(seed => {
              const seedQuestions = questions.filter(q => q.source_doi === seed.doi);
              return (
                <div key={seed.id} className="fade-in" style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14, padding: "20px 22px",
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#e8e8f0", marginBottom: 8 }}>
                    {seed.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
                    {seed.authors?.join(', ')} — {seed.doi}
                  </div>
                  <div style={{
                    fontSize: 12, color: "#9ca3af", lineHeight: 1.7,
                    maxHeight: 80, overflow: "hidden",
                  }}>
                    {(seed.abstract || '').slice(0, 300)}...
                  </div>
                  {(seed.keywords || []).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                      {seed.keywords.slice(0, 5).map((kw, i) => (
                        <span key={i} style={{
                          fontSize: 10, padding: "3px 8px",
                          background: "rgba(52,211,153,0.06)", borderRadius: 4, color: "#34d399",
                        }}>{kw}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                    <div style={{ fontSize: 11, color: "#4b5563" }}>
                      この論文から生成された問い: {seedQuestions.length}件
                    </div>
                    <button
                      onClick={() => handleRequestion(seed.id)}
                      disabled={actionLoading}
                      style={{
                        padding: "8px 18px",
                        background: actionLoading ? "rgba(255,255,255,0.05)" : "rgba(52,211,153,0.1)",
                        border: "1px solid rgba(52,211,153,0.2)", borderRadius: 8,
                        color: actionLoading ? "#4b5563" : "#34d399",
                        fontSize: 11, fontWeight: 600, cursor: actionLoading ? "default" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {actionLoading ? '生成中...' : '問い直す'}
                    </button>
                  </div>
                </div>
              );
            })}
            {seeds.length === 0 && (
              <div style={{ textAlign: "center", color: "#4b5563", padding: 40 }}>
                論文シードがありません。
              </div>
            )}
          </div>
        )}

        {/* ナビゲーション */}
        <div style={{
          display: "flex", gap: 12, justifyContent: "center", marginTop: 40,
        }}>
          <a href="/" style={{
            padding: "10px 20px", background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
            textDecoration: "none", color: "#9ca3af", fontSize: 13,
          }}>← ECHO ホーム</a>
        </div>
      </div>
    </div>
  );
}
