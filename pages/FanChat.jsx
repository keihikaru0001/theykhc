import { useState, useEffect, useRef } from "react";
import { ArtistProfile, FanProfile, FanRequest } from "../api/entities";
import { echoChat } from "../api/backendFunctions";

function getBiorhythm(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  const days = Math.floor((today - birth) / (1000 * 60 * 60 * 24));
  return {
    physical: Math.sin((2 * Math.PI * days) / 23),
    emotional: Math.sin((2 * Math.PI * days) / 28),
    intellectual: Math.sin((2 * Math.PI * days) / 33),
  };
}

function BioBar({ label, value }) {
  const pct = ((value + 1) / 2) * 100;
  const color = value > 0.3 ? "#34d399" : value < -0.3 ? "#f87171" : "#fbbf24";
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7280", marginBottom: 2 }}>
        <span>{label}</span>
        <span>{value > 0 ? "+" : ""}{value.toFixed(2)}</span>
      </div>
      <div style={{ height: 3, background: "#1f2937", borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.5s" }} />
      </div>
    </div>
  );
}

export default function FanChat() {
  const [artist, setArtist] = useState(null);
  const [fanProfile, setFanProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hikariTotal, setHikariTotal] = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [biorhythm, setBiorhythm] = useState(null);
  const bottomRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const artistId = params.get("artist_id");

  useEffect(() => {
    if (!artistId) {
      setInitialLoading(false);
      return;
    }
    Promise.all([
      ArtistProfile.filter({ id: artistId }),
      FanProfile.list(),
      FanRequest.list(),
    ]).then(([artists, fans, requests]) => {
      const a = artists[0];
      setArtist(a);

      const fan = fans[0];
      if (fan) {
        setFanProfile(fan);
        setHikariTotal(fan.hikari_balance || 0);
        if (fan.birth_date) setBiorhythm(getBiorhythm(fan.birth_date));
      } else {
        setShowSetup(true);
      }

      // 過去の対話履歴
      const history = requests
        .filter(r => r.artist_id === artistId)
        .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
        .slice(-20);

      const msgs = [];
      history.forEach(r => {
        msgs.push({ role: "fan", text: r.input, emotion: null });
        msgs.push({
          role: "artist",
          text: r.output,
          emotion: r.detected_emotion,
          hikari: r.hikari_earned,
          lyric: r.referenced_lyric_title,
        });
      });
      setMessages(msgs);
      setInitialLoading(false);
    }).catch(() => setInitialLoading(false));
  }, [artistId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSetup = async () => {
    const fan = await FanProfile.create({
      birth_date: birthDate || null,
      interaction_count: 0,
      hikari_balance: 0,
      membership_tier: "FREE",
      emotion_history: [],
      followed_artists: artistId ? [artistId] : [],
    });
    setFanProfile(fan);
    if (birthDate) setBiorhythm(getBiorhythm(birthDate));
    setShowSetup(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !artistId) return;
    const text = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "fan", text }]);
    setLoading(true);

    try {
      const result = await echoChat({
        artist_id: artistId,
        message: text,
        fan_profile_id: fanProfile?.id,
      });

      setMessages(prev => [...prev, {
        role: "artist",
        text: result.response,
        emotion: result.detected_emotion,
        hikari: result.hikari_earned,
        lyric: result.referenced_lyric,
      }]);
      setHikariTotal(prev => prev + (result.hikari_earned || 0));
      if (result.biorhythm) setBiorhythm(result.biorhythm);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "artist",
        text: "…（接続が途切れた。もう一度、言葉を投げてほしい）",
        emotion: null,
        hikari: 0,
        lyric: null,
        isError: true,
      }]);
    }
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (initialLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0a0a0f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#6b7280",
        fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16, animation: "spin 2s linear infinite" }}>◎</div>
          <div>読み込み中...</div>
        </div>
      </div>
    );
  }

  if (!artistId || !artist) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0a0a0f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#6b7280",
        fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif",
        flexDirection: "column",
        gap: 16,
      }}>
        <div style={{ fontSize: 32 }}>🎤</div>
        <div>アーティストが見つかりません</div>
        <a href="/" style={{ color: "#a78bfa", fontSize: 13 }}>← トップへ戻る</a>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 100%)",
      color: "#e8e8f0",
      fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif",
      display: "flex",
      flexDirection: "column",
      maxWidth: 760,
      margin: "0 auto",
    }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .msg-enter { animation: fadeIn 0.3s ease; }
        textarea:focus { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }
      `}</style>

      {/* ヘッダー */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky",
        top: 0,
        background: "rgba(10,10,15,0.95)",
        backdropFilter: "blur(12px)",
        zIndex: 10,
      }}>
        <a href="/" style={{ color: "#6b7280", textDecoration: "none", fontSize: 18 }}>←</a>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: artist.avatar_url ? `url(${artist.avatar_url}) center/cover` : "linear-gradient(135deg, #a78bfa, #60a5fa)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
        }}>
          {!artist.avatar_url && "🎤"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{artist.display_name}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{artist.tone_descriptor}</div>
        </div>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(167,139,250,0.1)",
          border: "1px solid rgba(167,139,250,0.2)",
          borderRadius: 20,
          padding: "6px 14px",
          fontSize: 13,
        }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <span style={{ fontWeight: 700, color: "#a78bfa" }}>{hikariTotal}</span>
          <span style={{ color: "#6b7280", fontSize: 11 }}>光貨</span>
        </div>
      </div>

      {/* バイオリズムパネル */}
      {biorhythm && (
        <div style={{
          margin: "12px 20px 0",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          padding: "12px 16px",
        }}>
          <div style={{ fontSize: 10, color: "#4b5563", letterSpacing: "0.1em", marginBottom: 8 }}>今日のバイオリズム</div>
          <BioBar label="体" value={biorhythm.physical} />
          <BioBar label="心" value={biorhythm.emotional} />
          <BioBar label="頭" value={biorhythm.intellectual} />
        </div>
      )}

      {/* メッセージエリア */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: 400,
      }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "#4b5563",
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⟁</div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>言葉を投げてみて</div>
            <div style={{ fontSize: 12, color: "#374151" }}>
              {artist.display_name} があなたを待っている
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className="msg-enter"
            style={{
              display: "flex",
              flexDirection: msg.role === "fan" ? "row-reverse" : "row",
              alignItems: "flex-end",
              gap: 10,
            }}
          >
            {msg.role === "artist" && (
              <div style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: artist.avatar_url ? `url(${artist.avatar_url}) center/cover` : "linear-gradient(135deg, #a78bfa, #60a5fa)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
              }}>
                {!artist.avatar_url && "🎤"}
              </div>
            )}
            <div style={{ maxWidth: "75%" }}>
              <div style={{
                background: msg.role === "fan"
                  ? "linear-gradient(135deg, #4c1d95, #1e3a5f)"
                  : "rgba(255,255,255,0.05)",
                border: msg.role === "fan"
                  ? "1px solid rgba(167,139,250,0.3)"
                  : "1px solid rgba(255,255,255,0.08)",
                borderRadius: msg.role === "fan" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                padding: "12px 16px",
                fontSize: 14,
                lineHeight: 1.7,
                color: msg.isError ? "#6b7280" : "#e8e8f0",
                fontStyle: msg.isError ? "italic" : "normal",
              }}>
                {msg.text}
              </div>
              {msg.role === "artist" && (msg.emotion || msg.hikari || msg.lyric) && (
                <div style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 6,
                  flexWrap: "wrap",
                }}>
                  {msg.emotion && (
                    <span style={{
                      fontSize: 10,
                      color: "#a78bfa",
                      background: "rgba(167,139,250,0.1)",
                      borderRadius: 4,
                      padding: "2px 8px",
                    }}>
                      {msg.emotion}
                    </span>
                  )}
                  {msg.lyric && (
                    <span style={{
                      fontSize: 10,
                      color: "#60a5fa",
                      background: "rgba(96,165,250,0.1)",
                      borderRadius: 4,
                      padding: "2px 8px",
                    }}>
                      ♪ {msg.lyric}
                    </span>
                  )}
                  {msg.hikari > 0 && (
                    <span style={{
                      fontSize: 10,
                      color: "#fbbf24",
                      background: "rgba(251,191,36,0.1)",
                      borderRadius: 4,
                      padding: "2px 8px",
                    }}>
                      +{msg.hikari} ✨
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="msg-enter" style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "linear-gradient(135deg, #a78bfa, #60a5fa)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            }}>🎤</div>
            <div style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "18px 18px 18px 4px",
              padding: "14px 20px",
              display: "flex",
              gap: 6,
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#a78bfa",
                  animation: `pulse 1.2s ease ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <div style={{
        padding: "16px 20px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(10,10,15,0.95)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        bottom: 0,
      }}>
        <div style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20,
          padding: "8px 8px 8px 16px",
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`${artist.display_name} に言葉を投げる…`}
            disabled={loading}
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "#e8e8f0",
              fontSize: 14,
              resize: "none",
              fontFamily: "inherit",
              lineHeight: 1.6,
              maxHeight: 120,
              overflowY: "auto",
            }}
            onInput={e => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: input.trim() && !loading
                ? "linear-gradient(135deg, #a78bfa, #60a5fa)"
                : "rgba(255,255,255,0.08)",
              border: "none",
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            →
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#374151", textAlign: "center", marginTop: 8 }}>
          Enter で送信 · Shift+Enter で改行
        </div>
      </div>

      {/* セットアップモーダル */}
      {showSetup && (
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
            maxWidth: 400,
            width: "100%",
          }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 16 }}>⟁</div>
            <div style={{ fontWeight: 700, fontSize: 18, textAlign: "center", marginBottom: 8 }}>
              あなたの軌跡を始める
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", textAlign: "center", marginBottom: 24 }}>
              生年月日を教えてもらえると、バイオリズムに基づいた応答ができます（任意）
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>
                生年月日（任意）
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#e8e8f0",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={handleSetup}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #a78bfa, #60a5fa)",
                border: "none",
                borderRadius: 12,
                padding: "14px",
                color: "white",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              対話を始める →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
