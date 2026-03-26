import { useState, useEffect } from "react";
import { ArtistProfile } from "../api/entities";

export default function Home() {
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ArtistProfile.list().then(data => {
      setArtists(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 50%, #0a0f0d 100%)",
      color: "#e8e8f0",
      fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
    }}>
      {/* ロゴ */}
      <div style={{ textAlign: "center", marginBottom: 60 }}>
        <div style={{
          fontSize: 72,
          fontWeight: 900,
          letterSpacing: "0.2em",
          background: "linear-gradient(135deg, #a78bfa, #60a5fa, #34d399)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 8,
        }}>ECHO</div>
        <div style={{ fontSize: 14, color: "#6b7280", letterSpacing: "0.3em" }}>
          ファン × アーティスト AI 対話OS
        </div>
        <div style={{ fontSize: 12, color: "#4b5563", marginTop: 8, fontStyle: "italic" }}>
          模倣ではない。生成でもない。共鳴である。
        </div>
      </div>

      {/* アーティスト選択 */}
      <div style={{ width: "100%", maxWidth: 600 }}>
        <div style={{ fontSize: 13, color: "#6b7280", letterSpacing: "0.2em", marginBottom: 20, textAlign: "center" }}>
          アーティストを選んで対話を始める
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>⟳</div>
            読み込み中...
          </div>
        ) : artists.length === 0 ? (
          <div style={{
            border: "1px dashed #374151",
            borderRadius: 16,
            padding: 40,
            textAlign: "center",
            color: "#4b5563",
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎵</div>
            <div>アーティストがまだ登録されていません</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>
              Artist Dashboard からアーティストを追加してください
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {artists.map(artist => (
              <a
                key={artist.id}
                href={`/FanChat?artist_id=${artist.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(167,139,250,0.2)",
                  borderRadius: 16,
                  padding: "20px 24px",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "all 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "rgba(167,139,250,0.08)";
                  e.currentTarget.style.borderColor = "rgba(167,139,250,0.5)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.borderColor = "rgba(167,139,250,0.2)";
                }}
              >
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: artist.avatar_url
                    ? `url(${artist.avatar_url}) center/cover`
                    : "linear-gradient(135deg, #a78bfa, #60a5fa)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                }}>
                  {!artist.avatar_url && "🎤"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{artist.display_name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    {artist.tone_descriptor || "アーティスト"}
                  </div>
                  {artist.lyric_count > 0 && (
                    <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>
                      {artist.lyric_count} 曲
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 20, color: "#a78bfa" }}>→</div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ナビゲーション */}
      <div style={{
        display: "flex",
        gap: 16,
        marginTop: 60,
        flexWrap: "wrap",
        justifyContent: "center",
      }}>
        {[
          { label: "Artist Dashboard", href: "/ArtistDashboard", icon: "📊" },
          { label: "Lyric Manager", href: "/LyricManager", icon: "🎵" },
          { label: "Wallet", href: "/Wallet", icon: "✨" },
        ].map(nav => (
          <a
            key={nav.href}
            href={nav.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              textDecoration: "none",
              color: "#9ca3af",
              fontSize: 13,
              transition: "all 0.2s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = "#e8e8f0";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = "#9ca3af";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
            }}
          >
            <span>{nav.icon}</span>
            {nav.label}
          </a>
        ))}
      </div>
    </div>
  );
}
