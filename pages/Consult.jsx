import { useState, useEffect } from "react";
import { BusinessProfile, ConsultationSession } from "../api/entities";
import { businessConsult } from "../api/backendFunctions";

export default function Consult() {
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [founderName, setFounderName] = useState("");
  const [industry, setIndustry] = useState("");
  const [stage, setStage] = useState("idea");
  const [challenge, setChallenge] = useState("");

  useEffect(() => {
    Promise.all([
      BusinessProfile.list(),
      ConsultationSession.list(),
    ]).then(([profiles, sess]) => {
      if (profiles.length > 0) {
        setProfile(profiles[0]);
        setCompanyName(profiles[0].company_name || "");
        setFounderName(profiles[0].founder_name || "");
        setIndustry(profiles[0].industry || "");
        setStage(profiles[0].stage || "idea");
        setChallenge(profiles[0].challenge_summary || "");
      } else {
        setShowForm(true);
      }
      setSessions(sess.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const saveProfile = async () => {
    const data = {
      company_name: companyName,
      founder_name: founderName,
      industry,
      stage,
      challenge_summary: challenge,
    };
    if (profile) {
      const updated = await BusinessProfile.update(profile.id, data);
      setProfile(updated);
    } else {
      const created = await BusinessProfile.create(data);
      setProfile(created);
    }
    setShowForm(false);
  };

  const submitConsult = async () => {
    if (!challenge.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);

    try {
      const res = await businessConsult({
        company_name: companyName,
        founder_name: founderName,
        industry,
        stage,
        challenge_summary: challenge,
      });

      setResult(res);

      // Refresh sessions
      const sess = await ConsultationSession.list();
      setSessions(sess.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    } catch (err) {
      setResult({
        error: true,
        message: "診断エンジンへの接続に失敗しました。しばらくしてから再試行してください。",
      });
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16, animation: "spin 2s linear infinite" }}>◎</div>
          <div>読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 50%, #0a0f0d 100%)",
      color: "#e8e8f0",
      fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif",
      padding: "40px 20px",
    }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { max-height: 0; opacity: 0; } to { max-height: 2000px; opacity: 1; } }
        .fade-in { animation: fadeIn 0.4s ease; }
        .accordion-content { animation: slideDown 0.4s ease; overflow: hidden; }
        textarea:focus, input:focus, select:focus { outline: none; border-color: #c9a84c !important; }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <a href="/" style={{ color: "#6b7280", textDecoration: "none", fontSize: 14 }}>← ECHO</a>
          <div style={{ fontSize: 11, color: "#c9a84c", letterSpacing: "0.3em", marginTop: 16, textTransform: "uppercase" }}>TheYKHC Tower × ECHO</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 12, color: "#c9a84c", letterSpacing: "0.05em" }}>V=N/D 事業リスク診断</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12, lineHeight: 1.8 }}>
            研究・感情・知恵・市場・リスクの5層から、あなたの事業を診断します。<br />
            1,466 DOIの知見を、あなたのD（リスク密度）に当てはめる。
          </p>
        </div>

        {/* D Factors */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 }}>
          {[
            { label: "財務D", desc: "資金繰り・利益率" },
            { label: "市場D", desc: "競争・需要" },
            { label: "時代D", desc: "タイミング・趨勢" },
            { label: "経営者D", desc: "人物・判断力" },
            { label: "道徳D", desc: "倫理・償い" },
          ].map((d, i) => (
            <div key={i} style={{
              background: "rgba(201,168,76,0.05)",
              border: "1px solid rgba(201,168,76,0.2)",
              borderRadius: 8,
              padding: "8px 14px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 13, color: "#c9a84c", fontWeight: 600 }}>{d.label}</div>
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{d.desc}</div>
            </div>
          ))}
        </div>

        {/* Profile Section */}
        {showForm ? (
          <div className="fade-in" style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 28,
            marginBottom: 32,
          }}>
            <div style={{ fontSize: 14, color: "#c9a84c", fontWeight: 600, marginBottom: 20 }}>事業プロファイル</div>

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 6 }}>会社名・プロジェクト名</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                  placeholder="例: TheYKHC Tower"
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 14px", color: "#e8e8f0", fontSize: 14, fontFamily: "inherit" }} />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 6 }}>代表者名</label>
                <input type="text" value={founderName} onChange={e => setFounderName(e.target.value)}
                  placeholder="例: 片山義光"
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 14px", color: "#e8e8f0", fontSize: 14, fontFamily: "inherit" }} />
              </div>

              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 6 }}>業界</label>
                  <input type="text" value={industry} onChange={e => setIndustry(e.target.value)}
                    placeholder="例: バイオ素材・AI"
                    style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 14px", color: "#e8e8f0", fontSize: 14, fontFamily: "inherit" }} />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 6 }}>ステージ</label>
                  <select value={stage} onChange={e => setStage(e.target.value)}
                    style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 14px", color: "#e8e8f0", fontSize: 14, fontFamily: "inherit" }}>
                    <option value="idea" style={{ background: "#1a1a2e" }}>アイデア</option>
                    <option value="seed" style={{ background: "#1a1a2e" }}>シード</option>
                    <option value="early" style={{ background: "#1a1a2e" }}>アーリー</option>
                    <option value="growth" style={{ background: "#1a1a2e" }}>グロース</option>
                    <option value="mature" style={{ background: "#1a1a2e" }}>成熟期</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 6 }}>現在の課題</label>
                <textarea value={challenge} onChange={e => setChallenge(e.target.value)}
                  placeholder="あなたの事業が直面している課題を自由に記述してください..."
                  rows={5}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 14px", color: "#e8e8f0", fontSize: 14, fontFamily: "inherit", resize: "vertical" }} />
              </div>

              <button onClick={saveProfile}
                style={{
                  background: "rgba(201,168,76,0.1)", border: "1px solid #c9a84c", color: "#c9a84c",
                  borderRadius: 10, padding: "12px 32px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit", transition: "all 0.2s",
                }}>
                プロファイルを保存
              </button>
            </div>
          </div>
        ) : (
          <div className="fade-in" style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: "20px 24px",
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#e8e8f0" }}>{profile?.company_name || "未設定"}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                {profile?.founder_name} · {profile?.industry} · {profile?.stage}
              </div>
            </div>
            <button onClick={() => setShowForm(true)}
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#6b7280", borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              編集
            </button>
          </div>
        )}

        {/* Consultation Input */}
        {!showForm && (
          <div className="fade-in" style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(201,168,76,0.15)",
            borderRadius: 16,
            padding: 24,
            marginBottom: 32,
          }}>
            <div style={{ fontSize: 14, color: "#c9a84c", fontWeight: 600, marginBottom: 16 }}>5層共鳴診断</div>
            <textarea value={challenge} onChange={e => setChallenge(e.target.value)}
              placeholder="診断したい事業課題を入力してください。例：新素材の市場参入タイミング、資金調達の優先順位、チーム構築の方向性..."
              rows={4}
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10, padding: "14px 16px", color: "#e8e8f0", fontSize: 14, fontFamily: "inherit", resize: "vertical",
              }} />

            <button onClick={submitConsult} disabled={submitting || !challenge.trim()}
              style={{
                marginTop: 16, width: "100%",
                background: submitting ? "rgba(201,168,76,0.05)" : "rgba(201,168,76,0.1)",
                border: "1px solid #c9a84c", color: "#c9a84c",
                borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "all 0.2s", opacity: submitting ? 0.5 : 1,
              }}>
              {submitting ? "5層診断中..." : "5層診断を実行 →"}
            </button>
          </div>
        )}

        {/* Results */}
        {result && !result.error && (
          <div className="fade-in" style={{ marginBottom: 32 }}>
            {/* V=N/D Score */}
            {result.risk_layer && result.risk_layer.vnd_score !== undefined && (
              <div style={{
                background: "linear-gradient(135deg, rgba(201,168,76,0.08), rgba(201,168,76,0.02))",
                border: "1px solid rgba(201,168,76,0.3)",
                borderRadius: 16, padding: 28, marginBottom: 24, textAlign: "center",
              }}>
                <div style={{ fontSize: 11, color: "#c9a84c", letterSpacing: "0.2em", marginBottom: 12 }}>V=N/D スコア</div>
                <div style={{ fontSize: 48, fontWeight: 900, color: "#c9a84c", lineHeight: 1 }}>
                  {result.risk_layer.vnd_score}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>/ 10</div>
                {result.risk_layer.assessment && (
                  <div style={{ fontSize: 13, color: "#e8e8f0", marginTop: 16, lineHeight: 1.8 }}>
                    {result.risk_layer.assessment}
                  </div>
                )}
              </div>
            )}

            {/* 5 Layers Accordion */}
            {[
              { key: "research_layer", label: "研究の層", icon: "◈", color: "#60a5fa", desc: "IdeaSynthetix × Zenodo論文" },
              { key: "emotion_layer", label: "感情の層", icon: "✦", color: "#a78bfa", desc: "Luna (TYPE-3) 共鳴" },
              { key: "wisdom_layer", label: "知恵の層", icon: "典雅", color: "#34d399", desc: "歴史上の偉人の助言" },
              { key: "market_layer", label: "市場の層", icon: "◆", color: "#fbbf24", desc: "観測者効果（ニュートリノ×金）" },
              { key: "risk_layer", label: "リスクの層", icon: "▲", color: "#f87171", desc: "V=N/D Risk Assessment" },
            ].map((layer, i) => {
              const content = result[layer.key];
              if (!content) return null;
              return <LayerAccordion key={i} layer={layer} content={content} />;
            })}

            {/* Synthesized Response */}
            {result.synthesized_response && (
              <div style={{
                background: "rgba(201,168,76,0.05)",
                border: "1px solid rgba(201,168,76,0.2)",
                borderRadius: 16, padding: 28, marginBottom: 24,
              }}>
                <div style={{ fontSize: 11, color: "#c9a84c", letterSpacing: "0.2em", marginBottom: 16 }}>統合診断</div>
                <div style={{ fontSize: 14, lineHeight: 2, color: "#e8e8f0", whiteSpace: "pre-wrap" }}>
                  {result.synthesized_response}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {result && result.error && (
          <div className="fade-in" style={{
            background: "rgba(248,113,113,0.05)",
            border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: 12, padding: 20, marginBottom: 24, textAlign: "center",
          }}>
            <div style={{ fontSize: 14, color: "#f87171" }}>{result.message}</div>
          </div>
        )}

        {/* History */}
        {sessions.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 12, color: "#6b7280", letterSpacing: "0.2em", marginBottom: 16 }}>診断履歴</div>
            {sessions.slice(0, 5).map((s, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: 10, padding: "14px 18px", marginBottom: 8,
              }}>
                <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.6 }}>
                  {s.user_message ? s.user_message.substring(0, 80) + (s.user_message.length > 80 ? "..." : "") : "—"}
                </div>
                <div style={{ fontSize: 10, color: "#4b5563", marginTop: 6 }}>
                  {new Date(s.created_date).toLocaleString("ja-JP")}
                  {s.emotion_state && ` · ${s.emotion_state}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "40px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <a href="https://theykhc.com" target="_blank" style={{ color: "#c9a84c", textDecoration: "none", fontSize: 12, letterSpacing: "0.1em" }}>
            TheYKHC Tower →
          </a>
          <div style={{ fontSize: 10, color: "#4b5563", marginTop: 12 }}>
            塔は無料で残す。だが、塔をあなたの事業に当てはめる仕事は、有料だ。
          </div>
        </div>
      </div>
    </div>
  );
}

function LayerAccordion({ layer, content }) {
  const [open, setOpen] = useState(false);
  const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);

  return (
    <div style={{ marginBottom: 12, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", background: "rgba(255,255,255,0.02)", border: "none",
          padding: "16px 20px", textAlign: "left", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 12, fontFamily: "inherit",
        }}>
        <span style={{ fontSize: 16, color: layer.color }}>{layer.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0" }}>{layer.label}</div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{layer.desc}</div>
        </div>
        <span style={{ fontSize: 12, color: "#6b7280" }}>{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="accordion-content" style={{ padding: "16px 20px", background: "rgba(255,255,255,0.01)" }}>
          <div style={{ fontSize: 13, lineHeight: 2, color: "#e8e8f0", whiteSpace: "pre-wrap" }}>
            {text}
          </div>
        </div>
      )}
    </div>
  );
}
