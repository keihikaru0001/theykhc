import { useState, useEffect } from "react";
import { ArtistProfile, ArtistLyric } from "../api/entities";

export default function LyricManager() {
  const [artists, setArtists] = useState([]);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [lyrics, setLyrics] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingLyric, setEditingLyric] = useState(null);
  const [form, setForm] = useState({
    title: "", lyrics: "", emotion_tags: "", themes: "", key_phrases: "", year: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ArtistProfile.list().then(data => {
      setArtists(data);
      if (data.length > 0) selectArtist(data[0]);
    });
  }, []);

  const selectArtist = async (artist) => {
    setSelectedArtist(artist);
    const lyr = await ArtistLyric.filter({ artist_id: artist.id });
    setLyrics(lyr.sort((a, b) => (b.year || 0) - (a.year || 0)));
  };

  const openForm = (lyric = null) => {
    if (lyric) {
      setEditingLyric(lyric);
      setForm({
        title: lyric.title || "",
        lyrics: lyric.lyrics || "",
        emotion_tags: (lyric.emotion_tags || []).join(", "),
        themes: (lyric.themes || []).join(", "),
        key_phrases: (lyric.key_phrases || []).join("\n"),
        year: lyric.year || "",
      });
    } else {
      setEditingLyric(null);
      setForm({ title: "", lyrics: "", emotion_tags: "", themes: "", key_phrases: "", year: "" });
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title || !selectedArtist) return;
    setSaving(true);
    const data = {
      artist_id: selectedArtist.id,
      title: form.title,
      lyrics: form.lyrics,
      emotion_tags: form.emotion_tags.split(",").map(s => s.trim()).filter(Boolean),
      themes: form.themes.split(",").map(s => s.trim()).filter(Boolean),
      key_phrases: form.key_phrases.split("\n").map(s => s.trim()).filter(Boolean),
      year: form.year ? Number(form.year) : null,
      usage_count: editingLyric?.usage_count || 0,
    };

    if (editingLyric) {
      await ArtistLyric.update(editingLyric.id, data);
    } else {
      await ArtistLyric.create(data);
      // lyric_count更新
      await ArtistProfile.update(selectedArtist.id, {
        lyric_count: (selectedArtist.lyric_count || 0) + 1,
      });
    }

    setShowForm(false);
    const updated = await ArtistLyric.filter({ artist_id: selectedArtist.id });
    setLyrics(updated.sort((a, b) => (b.year || 0) - (a.year || 0)));
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("この楽曲を削除しますか？")) return;
    await ArtistLyric.delete(id);
    setLyrics(prev => prev.filter(l => l.id !== id));
  };

  const emotionSuggestions = ["孤独", "希望", "愛", "再生", "悲しみ", "怒り", "喜び", "不安", "懐かしさ", "喪失"];
  const themeSuggestions = ["別れ", "出会い", "夜", "朝", "記憶", "未来", "故郷", "旅", "夢", "時間"];

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
          <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "0.1em" }}>Lyric Manager</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>歌詞登録・感情タグ管理</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
        {/* アーティスト選択 */}
        <div>
          {artists.map(artist => (
            <div
              key={artist.id}
              onClick={() => selectArtist(artist)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                cursor: "pointer",
                background: selectedArtist?.id === artist.id
                  ? "rgba(167,139,250,0.12)"
                  : "rgba(255,255,255,0.02)",
                border: selectedArtist?.id === artist.id
                  ? "1px solid rgba(167,139,250,0.3)"
                  : "1px solid transparent",
                marginBottom: 6,
                fontSize: 14,
                fontWeight: selectedArtist?.id === artist.id ? 600 : 400,
                transition: "all 0.2s",
              }}
            >
              {artist.display_name}
            </div>
          ))}
        </div>

        {/* 歌詞リスト */}
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button
              onClick={() => openForm()}
              disabled={!selectedArtist}
              style={{
                background: selectedArtist ? "linear-gradient(135deg, #a78bfa, #60a5fa)" : "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: 10,
                padding: "10px 20px",
                color: "white",
                fontWeight: 700,
                fontSize: 13,
                cursor: selectedArtist ? "pointer" : "not-allowed",
              }}
            >
              + 楽曲を追加
            </button>
          </div>

          {lyrics.length === 0 ? (
            <div style={{
              border: "1px dashed #374151",
              borderRadius: 16,
              padding: 40,
              textAlign: "center",
              color: "#4b5563",
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎵</div>
              <div>まだ楽曲が登録されていません</div>
              <div style={{ fontSize: 12, marginTop: 8 }}>「楽曲を追加」から始めましょう</div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {lyrics.map(lyric => (
                <div key={lyric.id} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 14,
                  padding: 20,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 16 }}>♪ {lyric.title}</span>
                        {lyric.year && (
                          <span style={{ fontSize: 11, color: "#6b7280" }}>{lyric.year}</span>
                        )}
                        {lyric.usage_count > 0 && (
                          <span style={{
                            fontSize: 10,
                            color: "#34d399",
                            background: "rgba(52,211,153,0.1)",
                            borderRadius: 4,
                            padding: "2px 8px",
                          }}>
                            使用{lyric.usage_count}回
                          </span>
                        )}
                      </div>

                      {lyric.lyrics && (
                        <div style={{
                          fontSize: 12,
                          color: "#9ca3af",
                          marginBottom: 10,
                          lineHeight: 1.6,
                          maxHeight: 60,
                          overflow: "hidden",
                        }}>
                          {lyric.lyrics.slice(0, 120)}{lyric.lyrics.length > 120 ? "…" : ""}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(lyric.emotion_tags || []).map(tag => (
                          <span key={tag} style={{
                            fontSize: 10,
                            color: "#a78bfa",
                            background: "rgba(167,139,250,0.1)",
                            borderRadius: 4,
                            padding: "2px 8px",
                          }}>{tag}</span>
                        ))}
                        {(lyric.themes || []).map(theme => (
                          <span key={theme} style={{
                            fontSize: 10,
                            color: "#60a5fa",
                            background: "rgba(96,165,250,0.1)",
                            borderRadius: 4,
                            padding: "2px 8px",
                          }}>{theme}</span>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => openForm(lyric)}
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          padding: "6px 12px",
                          color: "#9ca3af",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >編集</button>
                      <button
                        onClick={() => handleDelete(lyric.id)}
                        style={{
                          background: "rgba(248,113,113,0.08)",
                          border: "1px solid rgba(248,113,113,0.2)",
                          borderRadius: 8,
                          padding: "6px 12px",
                          color: "#f87171",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >削除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* フォームモーダル */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, padding: 20,
        }}>
          <div style={{
            background: "#0d0d1a",
            border: "1px solid rgba(167,139,250,0.3)",
            borderRadius: 20,
            padding: 32,
            maxWidth: 560,
            width: "100%",
            maxHeight: "85vh",
            overflowY: "auto",
          }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 24 }}>
              {editingLyric ? "楽曲を編集" : "楽曲を追加"}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>タイトル *</label>
              <input
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="例: 夜明けまで"
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#e8e8f0", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>年</label>
              <input
                type="number"
                value={form.year}
                onChange={e => setForm(p => ({ ...p, year: e.target.value }))}
                placeholder="例: 2023"
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#e8e8f0", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>歌詞</label>
              <textarea
                value={form.lyrics}
                onChange={e => setForm(p => ({ ...p, lyrics: e.target.value }))}
                placeholder="歌詞を入力..."
                rows={5}
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#e8e8f0", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>感情タグ（カンマ区切り）</label>
              <input
                value={form.emotion_tags}
                onChange={e => setForm(p => ({ ...p, emotion_tags: e.target.value }))}
                placeholder="例: 孤独, 希望, 再生"
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#e8e8f0", fontSize: 13, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {emotionSuggestions.map(s => (
                  <span
                    key={s}
                    onClick={() => setForm(p => ({ ...p, emotion_tags: p.emotion_tags ? `${p.emotion_tags}, ${s}` : s }))}
                    style={{ fontSize: 10, color: "#a78bfa", background: "rgba(167,139,250,0.1)", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}
                  >{s}</span>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>テーマ（カンマ区切り）</label>
              <input
                value={form.themes}
                onChange={e => setForm(p => ({ ...p, themes: e.target.value }))}
                placeholder="例: 別れ, 夜, 記憶"
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#e8e8f0", fontSize: 13, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {themeSuggestions.map(s => (
                  <span
                    key={s}
                    onClick={() => setForm(p => ({ ...p, themes: p.themes ? `${p.themes}, ${s}` : s }))}
                    style={{ fontSize: 10, color: "#60a5fa", background: "rgba(96,165,250,0.1)", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}
                  >{s}</span>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>キーフレーズ（1行1フレーズ）</label>
              <textarea
                value={form.key_phrases}
                onChange={e => setForm(p => ({ ...p, key_phrases: e.target.value }))}
                placeholder="例: 夜が明けるまで走り続けた&#10;あの日の声が聞こえる"
                rows={3}
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#e8e8f0", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px", color: "#9ca3af", cursor: "pointer" }}>
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title || saving}
                style={{ flex: 2, background: form.title ? "linear-gradient(135deg, #a78bfa, #60a5fa)" : "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "12px", color: "white", fontWeight: 700, fontSize: 14, cursor: form.title ? "pointer" : "not-allowed" }}
              >
                {saving ? "保存中..." : editingLyric ? "更新する" : "追加する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
