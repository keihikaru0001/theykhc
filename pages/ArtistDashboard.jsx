import { useState, useEffect } from "react";
import { ArtistProfile, FanRequest, HikariTransaction, ArtistLyric } from "../api/entities";

export default function ArtistDashboard() {
  const [artists, setArtists] = useState([]);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [stats, setStats] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    philosophical_background: "",
    tone_descriptor: "",
    key_phrases: "",
    royalty_rate: 40,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [a, requests, transactions] = await Promise.all([
      ArtistProfile.list(),
      FanRequest.list(),
      HikariTransaction.list(),
    ]);
    setArtists(a);
    if (a.length > 0 && !selectedArtist) {
      calcStats(a[0], requests, transactions);
    }
  };

  const calcStats = async (artist, requests, transactions) => {
    setSelectedArtist(artist);
    const myRequests = requests.filter(r => r.artist_id === artist.id);
    const myTransactions = transactions.filter(t => t.artist_id === artist.id && t.type === "royalty");
    const totalRoyalty = myTransactions.reduce((s, t) => s + (t.amount || 0), 0);

    // 感情分布
    const emotionMap = {};
    myRequests.forEach(r => {
      if (r.detected_emotion) {
        emotionMap[r.detected_emotion] = (emotionMap[r.detected_emotion] || 0) + 1;
      }
    });
    const emotions = Object.entries(emotionMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const lyrics = await ArtistLyric.filter({ artist_id: artist.id });

    setStats({
      totalChats: myRequests.length,
      totalRoyalty,
      emotions,
      lyrics,
      recentRequests: myRequests.slice(-5).reverse(),
    });
  };

  const handleSelectArtist = async (artist) => {
    const [requests, transactions] = await Promise.all([
      FanRequest.list(),
      HikariTransaction.list(),
    ]);
    calcStats(artist, requests, transactions);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = {
      ...form,
      key_phrases: form.key_phrases.split("\n").filter(Boolean),
      royalty_rate: Number(form.royalty_rate),
      lyric_count: 0,
      is_active: true,
    };
    await ArtistProfile.create(data);
    setShowForm(false);
    setForm({ display_name: "", philosophical_background: "", tone_descriptor: "", key_phrases: "", royalty_rate: 40 });
    loadData();
    setSaving(false);
  };

  const emotionColors = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#fb923c"];

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 100%)",
      color: "#e8e8f0",
      fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif",
      padding: "24px 20px",
      maxWidth: 900,
      margin: "0 auto",
    }}>
      <style>{`
        input, textarea, select { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }
      `}</style>

      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
        <a href="/" style={{ color: "#6b7280", textDecoration: "none", fontSize: 18 }}>←</a>
        <div>
          <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "0.1em" }}>Artist Dashboard</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>アーティスト管理・収益確認</div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            marginLeft: "auto",
            background: "linear-gradient(135deg, #a78bfa, #60a5fa)",
            border: "none",
            borderRadius: 10,
            padding: "10px 20px",
            color: "white",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          + アーティスト追加
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
        {/* サイドバー */}
        <div>
          {artists.map(artist => (
            <div
              key={artist.id}
              onClick={() => handleSelectArtist(artist)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: 12,
                cursor: "pointer",
                background: selectedArtist?.id === artist.id
                  ? "rgba(167,139,250,0.12)"
                  : "rgba(255,255,255,0.02)",
                border: selectedArtist?.id === artist.id
                  ? "1px solid rgba(167,139,250,0.3)"
                  : "1px solid transparent",
                marginBottom: 8,
                transition: "all 0.2s",
              }}
            >
              <div style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #a78bfa, #60a5fa)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}>🎤</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{artist.display_name}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{artist.tone_descriptor || "—"}</div>
              </div>
            </div>
          ))}
          {artists.length === 0 && (
            <div style={{
              padding: 20,
              textAlign: "center",
              color: "#4b5563",
              fontSize: 13,
              border: "1px dashed #374151",
              borderRadius: 12,
            }}>
              まだアーティストがいません
            </div>
          )}
        </div>

        {/* メインエリア */}
        {selectedArtist && stats ? (
          <div>
            {/* 統計カード */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
              {[
                { label: "総対話数", value: stats.totalChats, icon: "💬", color: "#a78bfa" },
                { label: "光貨収益", value: `${stats.totalRoyalty} ✨`, icon: "✨", color: "#fbbf24" },
                { label: "楽曲数", value: stats.lyrics.length, icon: "🎵", color: "#34d399" },
              ].map(card => (
                <div key={card.label} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 14,
                  padding: "20px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: card.color }}>{card.value}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* 感情分布 */}
            {stats.emotions.length > 0 && (
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: 20,
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16, fontWeight: 600 }}>
                  ファンの感情分布
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {stats.emotions.map(([emotion, count], i) => (
                    <div key={emotion} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: `${emotionColors[i]}18`,
                      border: `1px solid ${emotionColors[i]}40`,
                      borderRadius: 20,
                      padding: "6px 14px",
                    }}>
                      <span style={{ fontSize: 13, color: emotionColors[i], fontWeight: 600 }}>{emotion}</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>{count}回</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 最近の対話 */}
            {stats.recentRequests.length > 0 && (
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: 20,
              }}>
                <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16, fontWeight: 600 }}>
                  最近の対話
                </div>
                {stats.recentRequests.map(req => (
                  <div key={req.id} style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    paddingBottom: 12,
                    marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                      {new Date(req.created_date).toLocaleString("ja-JP")}
                      {req.detected_emotion && (
                        <span style={{ marginLeft: 8, color: "#a78bfa" }}>#{req.detected_emotion}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 4 }}>
                      Fan: {req.input?.slice(0, 60)}{req.input?.length > 60 ? "…" : ""}
                    </div>
                    <div style={{ fontSize: 13 }}>
                      {req.output?.slice(0, 80)}{req.output?.length > 80 ? "…" : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#4b5563",
            fontSize: 14,
            height: 200,
          }}>
            アーティストを選択してください
          </div>
        )}
      </div>

      {/* 追加モーダル */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, padding: 20,
        }}>
          <div style={{
            background: "#0d0d1a",
            border: "1px solid rgba(167,139,250,0.3)",
            borderRadius: 20,
            padding: 32,
            maxWidth: 500,
            width: "100%",
            maxHeight: "80vh",
            overflowY: "auto",
          }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 24 }}>新しいアーティストを追加</div>

            {[
              { key: "display_name", label: "アーティスト名 *", placeholder: "例: 橘あかり", type: "input" },
              { key: "tone_descriptor", label: "声のトーン・スタイル", placeholder: "例: 穏やかで詩的、核心をつく言葉", type: "input" },
              { key: "philosophical_background", label: "哲学的背景・価値観", placeholder: "例: 音楽と言葉で人と繋がることを信じている", type: "textarea" },
              { key: "key_phrases", label: "特徴的なフレーズ（1行1フレーズ）", placeholder: "例: 言葉は橋だ\nまだ、ここにいる", type: "textarea" },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>
                  {field.label}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    value={form[field.key]}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    rows={3}
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      color: "#e8e8f0",
                      fontSize: 13,
                      resize: "vertical",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <input
                    type="text"
                    value={form[field.key]}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      color: "#e8e8f0",
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                )}
              </div>
            ))}

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>
                ロイヤリティ率 (%)
              </label>
              <input
                type="number"
                value={form.royalty_rate}
                onChange={e => setForm(prev => ({ ...prev, royalty_rate: e.target.value }))}
                min={0} max={100}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#e8e8f0",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  padding: "12px",
                  color: "#9ca3af",
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={!form.display_name || saving}
                style={{
                  flex: 2,
                  background: form.display_name ? "linear-gradient(135deg, #a78bfa, #60a5fa)" : "rgba(255,255,255,0.1)",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: form.display_name ? "pointer" : "not-allowed",
                }}
              >
                {saving ? "保存中..." : "追加する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
