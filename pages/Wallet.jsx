import { useState, useEffect } from "react";
import { FanProfile, HikariTransaction } from "../api/entities";

export default function Wallet() {
  const [fanProfile, setFanProfile] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([FanProfile.list(), HikariTransaction.list()]).then(([fans, txs]) => {
      const fan = fans[0];
      setFanProfile(fan);
      const sorted = txs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      setTransactions(sorted);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const tierConfig = {
    FREE: { label: "FREE", color: "#6b7280", next: "MEMBER", cost: 30, desc: "通常アクセス" },
    MEMBER: { label: "MEMBER", color: "#a78bfa", next: "DEEP", cost: 100, desc: "より深い応答" },
    DEEP: { label: "DEEP", color: "#fbbf24", next: null, cost: null, desc: "名前認識・完全な感情反映" },
  };

  const tier = fanProfile?.membership_tier || "FREE";
  const tc = tierConfig[tier];
  const balance = fanProfile?.hikari_balance || 0;
  const canUpgrade = tc.next && balance >= tc.cost;

  const handleUpgrade = async () => {
    if (!canUpgrade || !fanProfile) return;
    const nextTier = tc.next;
    const cost = tc.cost;
    await FanProfile.update(fanProfile.id, {
      membership_tier: nextTier,
      hikari_balance: balance - cost,
    });
    await HikariTransaction.create({
      user_id: fanProfile.id,
      amount: -cost,
      type: "spend",
      source: "club",
      description: `${nextTier}ランクへアップグレード`,
    });
    const updated = await FanProfile.list();
    setFanProfile(updated[0]);
  };

  const typeLabel = {
    earn: { label: "獲得", color: "#34d399", icon: "+" },
    spend: { label: "使用", color: "#f87171", icon: "-" },
    royalty: { label: "ロイヤリティ", color: "#fbbf24", icon: "→" },
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif" }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 100%)",
      color: "#e8e8f0",
      fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif",
      padding: "24px 20px",
      maxWidth: 600,
      margin: "0 auto",
    }}>
      <style>{`::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }`}</style>

      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
        <a href="/" style={{ color: "#6b7280", textDecoration: "none", fontSize: 18 }}>←</a>
        <div>
          <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "0.1em" }}>Wallet</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>光貨残高・履歴</div>
        </div>
      </div>

      {!fanProfile ? (
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          color: "#4b5563",
          border: "1px dashed #374151",
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✨</div>
          <div>まずアーティストとの対話を始めてください</div>
          <a href="/" style={{ color: "#a78bfa", fontSize: 13, marginTop: 12, display: "block" }}>
            → トップへ
          </a>
        </div>
      ) : (
        <>
          {/* 残高カード */}
          <div style={{
            background: "linear-gradient(135deg, rgba(167,139,250,0.15), rgba(96,165,250,0.1))",
            border: "1px solid rgba(167,139,250,0.3)",
            borderRadius: 20,
            padding: 32,
            textAlign: "center",
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, color: "#9ca3af", letterSpacing: "0.2em", marginBottom: 12 }}>光貨残高</div>
            <div style={{ fontSize: 56, fontWeight: 900, color: "#a78bfa", lineHeight: 1 }}>
              {balance.toLocaleString()}
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginTop: 8 }}>✨ 光貨</div>

            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginTop: 16,
              background: `${tc.color}20`,
              border: `1px solid ${tc.color}40`,
              borderRadius: 20,
              padding: "6px 16px",
            }}>
              <span style={{ fontSize: 12, color: tc.color, fontWeight: 700 }}>{tc.label}</span>
              <span style={{ fontSize: 11, color: "#6b7280" }}>{tc.desc}</span>
            </div>
          </div>

          {/* アップグレード */}
          {tc.next && (
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: 20,
              marginBottom: 20,
            }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                次のランク: {tc.next}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                {tierConfig[tc.next].desc} — {tc.cost} 光貨
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: 6, background: "#1f2937", borderRadius: 3 }}>
                  <div style={{
                    width: `${Math.min(100, (balance / tc.cost) * 100)}%`,
                    height: "100%",
                    background: canUpgrade ? "linear-gradient(90deg, #a78bfa, #60a5fa)" : "#374151",
                    borderRadius: 3,
                    transition: "width 0.5s",
                  }} />
                </div>
                <span style={{ fontSize: 11, color: "#6b7280", flexShrink: 0 }}>
                  {balance}/{tc.cost}
                </span>
              </div>
              {canUpgrade && (
                <button
                  onClick={handleUpgrade}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    background: "linear-gradient(135deg, #a78bfa, #60a5fa)",
                    border: "none",
                    borderRadius: 10,
                    padding: "12px",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  {tc.next} へアップグレード ({tc.cost} 光貨)
                </button>
              )}
            </div>
          )}

          {/* 統計 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            {[
              { label: "総対話数", value: fanProfile.interaction_count || 0, icon: "💬" },
              { label: "獲得光貨（累計）", value: transactions.filter(t => t.type === "earn").reduce((s, t) => s + t.amount, 0), icon: "✨" },
            ].map(item => (
              <div key={item.label} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                padding: "16px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{item.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{item.value.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* 履歴 */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            overflow: "hidden",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontWeight: 600, fontSize: 14 }}>
              取引履歴
            </div>
            {transactions.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#4b5563", fontSize: 13 }}>
                まだ取引履歴がありません
              </div>
            ) : (
              transactions.slice(0, 30).map(tx => {
                const t = typeLabel[tx.type] || { label: tx.type, color: "#9ca3af", icon: "·" };
                return (
                  <div key={tx.id} style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "14px 20px",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    gap: 14,
                  }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: `${t.color}15`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      color: t.color,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>{t.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, marginBottom: 2 }}>{tx.description || t.label}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {new Date(tx.created_date).toLocaleString("ja-JP")}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: tx.type === "earn" ? "#34d399" : tx.type === "spend" ? "#f87171" : "#fbbf24",
                    }}>
                      {tx.type === "earn" ? "+" : tx.type === "spend" ? "-" : ""}{Math.abs(tx.amount)}✨
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
