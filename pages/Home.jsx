import { useState, useEffect } from "react";
import { ArtistProfile, NeutrinoEvent, FxTickSnapshot, Question } from "../api/entities";

export default function Home() {
  const [artists, setArtists] = useState([]);
  const [neutrinoEvents, setNeutrinoEvents] = useState([]);
  const [fxSnapshots, setFxSnapshots] = useState([]);
  const [openQuestions, setOpenQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      ArtistProfile.list(),
      NeutrinoEvent.list(),
      FxTickSnapshot.list(),
      Question.list(),
    ]).then(([a, n, f, q]) => {
      setArtists(a);
      setNeutrinoEvents(n.sort((x, y) => new Date(y.created_date) - new Date(x.created_date)));
      setFxSnapshots(f.sort((x, y) => new Date(y.created_date) - new Date(x.created_date)));
      setOpenQuestions(q.filter(item => item.type === 'question' && item.status === 'open'));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const modernArtists = artists.filter(a => a.era === 'modern' || (!a.era && a.display_name !== '紫式部' && a.display_name !== '光源氏'));
  const historicalArtists = artists.filter(a => a.era === 'heian' || a.display_name === '紫式部' || a.display_name === '光源氏');

  const latestGold = fxSnapshots[0]?.bid || 0;
  const oldestGold = fxSnapshots[fxSnapshots.length - 1]?.bid || 0;
  const goldTrend = oldestGold > 0 ? ((latestGold - oldestGold) / oldestGold * 100).toFixed(1) : '0.0';

  const latestObserver = neutrinoEvents.find(e => e.event_type === 'OBSERVER');
  const latestGoldEvent = neutrinoEvents.find(e => e.event_type === 'GOLD');

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 50%, #0a0f0d 100%)",
      color: "#e8e8f0",
      fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif",
      padding: "40px 20px",
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease; }
      `}</style>

      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        {/* ロゴ */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            fontSize: 72, fontWeight: 900, letterSpacing: "0.2em",
            background: "linear-gradient(135deg, #a78bfa, #60a5fa, #34d399)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            marginBottom: 8,
          }}>ECHO</div>
          <div style={{ fontSize: 13, color: "#6b7280", letterSpacing: "0.3em" }}>
            共鳴 × 観測 × 光貨 — 統合OS
          </div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 8, fontStyle: "italic" }}>
            模倣ではない。生成でもない。共鳴である。
          </div>
        </div>

        {/* 観測者パネル */}
        <div className="fade-in" style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(96,165,250,0.15)",
          borderRadius: 16, padding: "20px 24px", marginBottom: 32,
        }}>
          <div style={{ fontSize: 10, color: "#4b5563", letterSpacing: "0.2em", marginBottom: 12 }}>OBSERVER EFFECT — V=N/D</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px" }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>ニュートリノ</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: latestGoldEvent ? "#34d399" : "#374151",
                  animation: latestGoldEvent ? "pulse 2s infinite" : "none",
                }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {latestGoldEvent ? latestGoldEvent.event_id : '静寂'}
                </span>
              </div>
              {latestGoldEvent && (
                <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2 }}>
                  {latestGoldEvent.energy_tev} TeV — {latestGoldEvent.session}
                </div>
              )}
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>金 (XAU/USD)</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>${latestGold.toFixed(2)}</div>
              <div style={{
                fontSize: 11,
                color: parseFloat(goldTrend) > 0 ? "#34d399" : parseFloat(goldTrend) < 0 ? "#f87171" : "#6b7280"
              }}>
                {parseFloat(goldTrend) > 0 ? '↑' : parseFloat(goldTrend) < 0 ? '↓' : '→'} {Math.abs(goldTrend)}%
              </div>
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>観測者</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: latestObserver ? "#60a5fa" : "#6b7280" }}>
                {latestObserver ? '観測中' : '休止'}
              </div>
              {latestObserver && (
                <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2 }}>{latestObserver.event_id}</div>
              )}
            </div>
          </div>
        </div>

        {/* 歴史上の人物 */}
        {historicalArtists.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, color: "#6b7280", letterSpacing: "0.2em", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span>ECHO OF THE PAST — 歴史上の偉人</span>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {historicalArtists.map(artist => (
                <a key={artist.id} href={`/FanChat?artist_id=${artist.id}`} className="fade-in"
                  style={{
                    display: "flex", alignItems: "center", gap: 16,
                    background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.2)",
                    borderRadius: 14, padding: "18px 22px", textDecoration: "none", color: "inherit", transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(167,139,250,0.1)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.5)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(167,139,250,0.04)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.2)"; }}
                >
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: artist.avatar_url ? `url(${artist.avatar_url}) center/cover` : "linear-gradient(135deg, #a78bfa, #7c3aed)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    {!artist.avatar_url && "✦"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{artist.display_name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{artist.tone_descriptor}</div>
                  </div>
                  <div style={{ fontSize: 18, color: "#a78bfa" }}>→</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* 現代アーティスト */}
        {modernArtists.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, color: "#6b7280", letterSpacing: "0.2em", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span>現代の思想家・アーティスト</span>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {modernArtists.map(artist => (
                <a key={artist.id} href={`/FanChat?artist_id=${artist.id}`} className="fade-in"
                  style={{
                    display: "flex", alignItems: "center", gap: 16,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(96,165,250,0.15)",
                    borderRadius: 14, padding: "18px 22px", textDecoration: "none", color: "inherit", transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(96,165,250,0.08)"; e.currentTarget.style.borderColor = "rgba(96,165,250,0.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(96,165,250,0.15)"; }}
                >
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: artist.avatar_url ? `url(${artist.avatar_url}) center/cover` : "linear-gradient(135deg, #60a5fa, #34d399)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    {!artist.avatar_url && "◈"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{artist.display_name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{artist.tone_descriptor}</div>
                  </div>
                  <div style={{ fontSize: 18, color: "#60a5fa" }}>→</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* IdeaSynthetix — 世界からの問い */}
        {openQuestions.length > 0 && (
          <div style={{
            background: "rgba(52,211,153,0.03)", border: "1px solid rgba(52,211,153,0.15)",
            borderRadius: 16, padding: "20px 24px", marginBottom: 32,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#4b5563", letterSpacing: "0.2em" }}>IDEASYNTHETIX — 世界からの問い</div>
              <a href="/Brainstorm" style={{ fontSize: 11, color: "#34d399", textDecoration: "none" }}>問い直す・解く・ブレスト →</a>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {openQuestions.slice(0, 3).map((q, i) => (
                <div key={i} style={{
                  padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, fontSize: 13, color: "#9ca3af",
                }}>
                  <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 4 }}>{q.industry || 'general'}</div>
                  {q.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ナビゲーション */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 40 }}>
          {[
            { label: "Brainstorm", href: "/Brainstorm", icon: "◇" },
            { label: "Artist Dashboard", href: "/ArtistDashboard", icon: "◈" },
            { label: "Lyric Manager", href: "/LyricManager", icon: "♪" },
            { label: "Wallet", href: "/Wallet", icon: "✦" },
          ].map(nav => (
            <a key={nav.href} href={nav.href}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 20px", background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
                textDecoration: "none", color: "#9ca3af", fontSize: 13, transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#e8e8f0"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#9ca3af"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
            >
              <span>{nav.icon}</span>{nav.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
