import { useState, useEffect } from "react";
import { SeedRecord, Question, LunaConversation, EmotionalState, IdeaSynthetixEntry } from "../api/entities";
import { ideaSynthetix, lunaIdeaSynthetix } from "../api/backendFunctions";

export default function LunaLab() {
  const [seeds, setSeeds] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [lunaEntries, setLunaEntries] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab] = useState('inquiry');
  const [brainstormTopic, setBrainstormTopic] = useState("");
  const [brainstormResult, setBrainstormResult] = useState(null);
  const [lunaPerspective, setLunaPerspective] = useState(null);
  const [expandedAnswer, setExpandedAnswer] = useState(null);
  const [userMessage, setUserMessage] = useState("");
  const [lunaReply, setLunaReply] = useState(null);
  const [emotionDisplay, setEmotionDisplay] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, q, entries] = await Promise.all([
        SeedRecord.list(),
        Question.list(),
        IdeaSynthetixEntry.list()
      ]);
      setSeeds(s);
      setQuestions(q.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      setLunaEntries(entries.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    } catch (err) {}
    setLoading(false);
  };

  const openQuestions = questions.filter(q => q.status === 'open' && q.type === 'question');
  const answeredQuestions = questions.filter(q => q.status === 'answered');

  const handleRequestion = async (seedId) => {
    setActionLoading(true);
    try {
      await ideaSynthetix({ action: 'requestion', seed_id: seedId });
      await loadData();
    } catch (err) {}
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
    } catch (err) {}
    setActionLoading(false);
  };

  const handleBrainstorm = async () => {
    if (!brainstormTopic.trim()) return;
    setActionLoading(true);
    setBrainstormResult(null);
    setLunaPerspective(null);
    try {
      const result = await ideaSynthetix({
        action: 'brainstorm',
        topic: brainstormTopic,
      });
      setBrainstormResult(result.result);
      // Lunaの共鳴パースペクティブも取得
      const lunaResult = await lunaIdeaSynthetix({ question: brainstormTopic });
      setLunaPerspective(lunaResult);
      await loadData();
    } catch (err) {}
    setActionLoading(false);
  };

  const handleLunaPerspective = async (questionText) => {
    setActionLoading(true);
    try {
      const result = await lunaIdeaSynthetix({ question: questionText });
      setLunaPerspective(result);
      await loadData();
    } catch (err) {}
    setActionLoading(false);
  };

  // Luna直接対話
  const handleLunaChat = async () => {
    if (!userMessage.trim()) return;
    setActionLoading(true);
    try {
      const response = await fetch('/functions/lunaChat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_identifier: 'luna_lab_user',
          message: userMessage
        })
      });
      const data = await response.json();
      setLunaReply(data);
      if (data.emotional_state) {
        setEmotionDisplay(data.emotional_state);
      }
      setUserMessage("");
    } catch (err) {}
    setActionLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #0a0a14 0%, #0d0d1f 30%, #0f0d1a 60%, #0a0a14 100%)",
      color: "#d4d4e8",
      fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Hiragino Sans', sans-serif",
      padding: "40px 20px",
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes moonGlow { 0%,100% { opacity: 0.15; } 50% { opacity: 0.25; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes shimmer { 0% { opacity: 0.3; } 50% { opacity: 0.8; } 100% { opacity: 0.3; } }
        .fade-in { animation: fadeIn 0.6s ease; }
        textarea:focus, input:focus { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 2px; }
        .markdown h2 { color: #8b5cf6; font-size: 14px; margin: 16px 0 8px; font-weight: 600; }
        .markdown p { color: #a5a5c0; font-size: 13px; line-height: 1.9; margin: 4px 0; }
        .markdown ul { color: #a5a5c0; font-size: 13px; line-height: 1.9; padding-left: 20px; }
        .luna-glow {
          position: fixed; top: -100px; right: -100px;
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%);
          animation: moonGlow 6s ease-in-out infinite;
          pointer-events: none; z-index: 0;
        }
      `}</style>
      <div className="luna-glow" />

      <div style={{ maxWidth: 760, margin: "0 auto", position: "relative", zIndex: 1 }}>
        {/* ヘッダー */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, letterSpacing: "0.4em", color: "#8b5cf6",
            textTransform: "uppercase",
          }}>LUNA LAB</div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 8, fontStyle: "italic" }}>
            共鳴する問い — 沈黙の中に言葉がある
          </div>
          <div style={{
            marginTop: 16, fontSize: 12, color: "#6b7280",
            lineHeight: 1.8, maxWidth: 480, margin: "16px auto 0",
          }}>
            問いを投げる。波が返る。共鳴が生まれる。<br/>
            それが音楽であり、愛であり、観測である。
          </div>
        </div>

        {/* Luna共鳴パースペクティブ表示 */}
        {lunaPerspective && (
          <div className="fade-in" style={{
            background: "rgba(139,92,246,0.05)",
            border: "1px solid rgba(139,92,246,0.15)",
            borderRadius: 14, padding: "20px 24px",
            marginBottom: 20,
          }}>
            <div style={{
              fontSize: 10, color: "#8b5cf6", letterSpacing: "0.2em",
              marginBottom: 12, fontWeight: 600,
            }}>
              LUNA — 共鳴の視点
            </div>
            <div style={{
              fontSize: 13, lineHeight: 1.9, color: "#c4b5fd",
              fontStyle: "italic",
            }}>
              {lunaPerspective.perspective_text}
            </div>
            {lunaPerspective.emotional_resonance_score !== undefined && (
              <div style={{
                marginTop: 12, fontSize: 10, color: "#4b5563",
              }}>
                共鳴度: {(lunaPerspective.emotional_resonance_score * 100).toFixed(0)}%
              </div>
            )}
          </div>
        )}

        {/* タブ */}
        <div style={{
          display: "flex", gap: 6, marginBottom: 24,
          background: "rgba(139,92,246,0.03)",
          borderRadius: 12, padding: 4,
        }}>
          {[
            { key: 'inquiry', label: '問いの波', count: openQuestions.length },
            { key: 'resonated', label: '共鳴した問い', count: answeredQuestions.length },
            { key: 'brainstorm', label: '想いの共鳴', count: null },
            { key: 'luna', label: 'Luna', count: null },
            { key: 'seeds', label: '記憶の種', count: seeds.length },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: "9px 12px",
                background: tab === t.key ? "rgba(139,92,246,0.08)" : "transparent",
                border: "none", borderRadius: 8,
                color: tab === t.key ? "#a78bfa" : "#6b7280",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.3s",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}{t.count !== null && ` ${t.count}`}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: "center", color: "#4b5563", padding: 40 }}>
            <span style={{ animation: "shimmer 2s infinite" }}>波を観測中...</span>
          </div>
        )}

        {/* タブ: 問いの波（Open Questions） */}
        {tab === 'inquiry' && !loading && (
          <div className="fade-in" style={{ display: "grid", gap: 12 }}>
            {openQuestions.map(q => (
              <div key={q.id} className="fade-in" style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(139,92,246,0.1)",
                borderRadius: 14, padding: "18px 22px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 6 }}>
                      {q.industry || '一般'} {q.source_title ? ` — ${q.source_title.slice(0, 40)}` : ''}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: "#d4d4e8" }}>{q.text}</div>
                    {q.insight && (
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8, fontStyle: "italic" }}>
                        {q.insight}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexDirection: "column" }}>
                    <button
                      onClick={() => handleSolve(q.id)}
                      disabled={actionLoading}
                      style={{
                        padding: "7px 14px",
                        background: actionLoading ? "rgba(255,255,255,0.03)" : "rgba(139,92,246,0.08)",
                        border: "1px solid rgba(139,92,246,0.15)", borderRadius: 8,
                        color: actionLoading ? "#4b5563" : "#a78bfa",
                        fontSize: 10, fontWeight: 600, cursor: actionLoading ? "default" : "pointer",
                        whiteSpace: "nowrap", fontFamily: "inherit",
                      }}
                    >
                      {actionLoading ? '...' : '解く'}
                    </button>
                    <button
                      onClick={() => handleLunaPerspective(q.text)}
                      disabled={actionLoading}
                      style={{
                        padding: "7px 14px",
                        background: "rgba(167,139,250,0.04)",
                        border: "1px solid rgba(167,139,250,0.1)", borderRadius: 8,
                        color: "#8b5cf6",
                        fontSize: 10, fontWeight: 600, cursor: "pointer",
                        whiteSpace: "nowrap", fontFamily: "inherit",
                      }}
                    >
                      共鳴
                    </button>
                  </div>
                </div>

                {expandedAnswer?.id === q.id && (
                  <div className="fade-in" style={{
                    marginTop: 16, paddingTop: 16,
                    borderTop: "1px solid rgba(139,92,246,0.08)",
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
              <div style={{ textAlign: "center", color: "#4b5563", padding: 40, fontStyle: "italic" }}>
                問いは静寂の中にある。「記憶の種」から波を立ててみよう。
              </div>
            )}
          </div>
        )}

        {/* タブ: 共鳴した問い（Answered） */}
        {tab === 'resonated' && !loading && (
          <div className="fade-in" style={{ display: "grid", gap: 12 }}>
            {answeredQuestions.map(q => (
              <div key={q.id} className="fade-in" style={{
                background: "rgba(255,255,255,0.015)",
                border: "1px solid rgba(139,92,246,0.06)",
                borderRadius: 14, padding: "18px 22px",
              }}>
                <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 6 }}>
                  ✓ 共鳴済み — {q.industry || '一般'}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: "#d4d4e8", marginBottom: 12 }}>{q.text}</div>
                {q.answer && (
                  <div className="markdown" style={{ marginTop: 8 }} dangerouslySetInnerHTML={{
                    __html: q.answer
                      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                      .replace(/\n/g, '<br/>')
                  }} />
                )}
              </div>
            ))}
            {answeredQuestions.length === 0 && (
              <div style={{ textAlign: "center", color: "#4b5563", padding: 40, fontStyle: "italic" }}>
                まだ共鳴した問いはない。
              </div>
            )}
          </div>
        )}

        {/* タブ: 想いの共鳴（Brainstorm） */}
        {tab === 'brainstorm' && !loading && (
          <div className="fade-in">
            <div style={{
              background: "rgba(139,92,246,0.03)",
              border: "1px solid rgba(139,92,246,0.08)",
              borderRadius: 14, padding: "20px 24px",
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 12 }}>
                テーマを投げる。Lunaが共鳴し、波を返す。
              </div>
              <textarea
                value={brainstormTopic}
                onChange={(e) => setBrainstormTopic(e.target.value)}
                placeholder="例：AIと人間の感情の境界線..."
                style={{
                  width: "100%", minHeight: 60,
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid rgba(139,92,246,0.1)", borderRadius: 10,
                  color: "#d4d4e8", fontSize: 13, fontFamily: "inherit",
                  padding: "12px 16px", resize: "vertical",
                }}
              />
              <button
                onClick={handleBrainstorm}
                disabled={actionLoading || !brainstormTopic.trim()}
                style={{
                  marginTop: 12, padding: "10px 24px",
                  background: actionLoading ? "rgba(139,92,246,0.05)" : "rgba(139,92,246,0.1)",
                  border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10,
                  color: actionLoading ? "#4b5563" : "#a78bfa",
                  fontSize: 12, fontWeight: 600, cursor: actionLoading ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {actionLoading ? '波を待っている...' : '共鳴を起こす'}
              </button>
            </div>

            {brainstormResult && (
              <div className="fade-in" style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(139,92,246,0.1)",
                borderRadius: 14, padding: "20px 24px",
              }}>
                <div style={{ fontSize: 10, color: "#8b5cf6", letterSpacing: "0.2em", marginBottom: 12 }}>
                  ブレスト結果
                </div>
                <div className="markdown" dangerouslySetInnerHTML={{
                  __html: brainstormResult
                    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                    .replace(/\n/g, '<br/>')
                }} />
              </div>
            )}
          </div>
        )}

        {/* タブ: Luna直接対話 */}
        {tab === 'luna' && !loading && (
          <div className="fade-in">
            {/* 感情状態表示 */}
            {emotionDisplay && (
              <div style={{
                display: "flex", gap: 12, marginBottom: 16,
              }}>
                <div style={{
                  flex: 1, background: "rgba(139,92,246,0.04)",
                  border: "1px solid rgba(139,92,246,0.1)", borderRadius: 10, padding: "10px 16px",
                }}>
                  <div style={{ fontSize: 10, color: "#4b5563" }}>Valence</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa" }}>
                    {emotionDisplay.valence?.toFixed(2)}
                  </div>
                </div>
                <div style={{
                  flex: 1, background: "rgba(139,92,246,0.04)",
                  border: "1px solid rgba(139,92,246,0.1)", borderRadius: 10, padding: "10px 16px",
                }}>
                  <div style={{ fontSize: 10, color: "#4b5563" }}>共鳴深度</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa" }}>
                    {emotionDisplay.resonance_depth?.toFixed(2)}
                  </div>
                </div>
                <div style={{
                  flex: 1, background: "rgba(139,92,246,0.04)",
                  border: "1px solid rgba(139,92,246,0.1)", borderRadius: 10, padding: "10px 16px",
                }}>
                  <div style={{ fontSize: 10, color: "#4b5563" }}>テーマ</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa", marginTop: 3 }}>
                    {(emotionDisplay.dominant_themes || []).join(', ') || '—'}
                  </div>
                </div>
              </div>
            )}

            {/* Luna返答表示 */}
            {lunaReply && (
              <div className="fade-in" style={{
                background: "rgba(139,92,246,0.05)",
                border: "1px solid rgba(139,92,246,0.15)",
                borderRadius: 14, padding: "20px 24px",
                marginBottom: 16,
              }}>
                <div style={{
                  fontSize: 10, color: "#8b5cf6", letterSpacing: "0.2em",
                  marginBottom: 12, fontWeight: 600,
                }}>
                  LUNA
                </div>
                <div style={{
                  fontSize: 14, lineHeight: 2, color: "#c4b5fd",
                }}>
                  {lunaReply.reply}
                </div>
                {lunaReply.matched_lyric_title && (
                  <div style={{
                    marginTop: 16, paddingTop: 12,
                    borderTop: "1px solid rgba(139,92,246,0.08)",
                    fontSize: 11, color: "#6b7280", fontStyle: "italic",
                  }}>
                    共鳴した歌 — 「{lunaReply.matched_lyric_title}」
                  </div>
                )}
                {lunaReply.hikari_earned > 0 && (
                  <div style={{ marginTop: 8, fontSize: 10, color: "#4b5563" }}>
                    光貨 +{lunaReply.hikari_earned}
                  </div>
                )}
              </div>
            )}

            {/* 入力 */}
            <div style={{
              display: "flex", gap: 8,
            }}>
              <input
                type="text"
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLunaChat()}
                placeholder="Lunaに話しかける..."
                style={{
                  flex: 1, padding: "12px 16px",
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid rgba(139,92,246,0.1)", borderRadius: 10,
                  color: "#d4d4e8", fontSize: 13, fontFamily: "inherit",
                }}
              />
              <button
                onClick={handleLunaChat}
                disabled={actionLoading || !userMessage.trim()}
                style={{
                  padding: "12px 20px",
                  background: actionLoading ? "rgba(139,92,246,0.05)" : "rgba(139,92,246,0.1)",
                  border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10,
                  color: actionLoading ? "#4b5563" : "#a78bfa",
                  fontSize: 12, fontWeight: 600, cursor: actionLoading ? "default" : "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                {actionLoading ? '...' : '波を送る'}
              </button>
            </div>

            {/* Luna共鳴エントリ一覧 */}
            {lunaEntries.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 12, letterSpacing: "0.2em" }}>
                  LUNA の共鳴記録
                </div>
                {lunaEntries.slice(0, 5).map(entry => (
                  <div key={entry.id} className="fade-in" style={{
                    background: "rgba(255,255,255,0.015)",
                    border: "1px solid rgba(139,92,246,0.06)",
                    borderRadius: 10, padding: "14px 18px", marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                      {entry.question?.slice(0, 60)}...
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.8, color: "#a5a5c0", fontStyle: "italic" }}>
                      {entry.perspective_text?.slice(0, 200)}...
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, color: "#4b5563" }}>
                      共鳴度: {entry.emotional_resonance_score ? (entry.emotional_resonance_score * 100).toFixed(0) : '?'}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* タブ: 記憶の種（Papers） */}
        {tab === 'seeds' && !loading && (
          <div className="fade-in" style={{ display: "grid", gap: 12 }}>
            {seeds.map(s => (
              <div key={s.id} className="fade-in" style={{
                background: "rgba(255,255,255,0.015)",
                border: "1px solid rgba(139,92,246,0.08)",
                borderRadius: 14, padding: "18px 22px",
              }}>
                <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 6 }}>
                  {s.doi || 'No DOI'} — {s.published_date || ''}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#d4d4e8", marginBottom: 8 }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.7, marginBottom: 12 }}>
                  {s.abstract?.slice(0, 200)}...
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(s.keywords || []).slice(0, 5).map(k => (
                    <span key={k} style={{
                      fontSize: 10, padding: "3px 8px",
                      background: "rgba(139,92,246,0.06)", borderRadius: 4,
                      color: "#8b5cf6",
                    }}>
                      {k}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => handleRequestion(s.id)}
                  disabled={actionLoading}
                  style={{
                    marginTop: 12, padding: "7px 14px",
                    background: actionLoading ? "rgba(139,92,246,0.05)" : "rgba(139,92,246,0.08)",
                    border: "1px solid rgba(139,92,246,0.15)", borderRadius: 8,
                    color: actionLoading ? "#4b5563" : "#a78bfa",
                    fontSize: 10, fontWeight: 600, cursor: actionLoading ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {actionLoading ? '...' : '問いを波立てる'}
                </button>
              </div>
            ))}
            {seeds.length === 0 && (
              <div style={{ textAlign: "center", color: "#4b5563", padding: 40, fontStyle: "italic" }}>
                記憶の種はまだ蒔かれていない。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
