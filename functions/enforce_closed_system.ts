// enforce_closed_system — 閉鎖系整合性チェック
// 全取引に対して光貨圏の壁が破られていないか検証する

export default async function(req) {
  const { transaction_id, buyer_id, seller_id, price_hikari, source } = await req.json();

  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    const violations = [];

    // 1. 外部システム参照チェック
    const external_patterns = ["stripe", "paypal", "bank", "wallet", "external", "withdraw", "cashout"];
    const all_fields = [buyer_id, seller_id, source].filter(Boolean).map(f => String(f).toLowerCase());
    for (const field of all_fields) {
      for (const pattern of external_patterns) {
        if (field.includes(pattern)) {
          violations.push(`External system reference detected: ${field}`);
        }
      }
    }

    // 2. 価格が負でないか
    if (price_hikari < 0) {
      violations.push("Negative price detected — impossible in closed system");
    }

    // 3. 売り手と買い手が同じでないか（循環取引チェック）
    if (buyer_id && seller_id && buyer_id === seller_id) {
      violations.push("Self-trade detected — circular trading not allowed");
    }

    // 4. 取引元が内部起源か
    if (source && !["game_reward", "trade", "ipo", "kokyaku_game", "kokyaku_game_initial", null].includes(source)) {
      violations.push(`Unknown source: ${source} — must be internal`);
    }

    const passed = violations.length === 0;

    if (!passed) {
      // 違反をGameEventとして記録
      await client.entities.GameEvent.create({
        event_type: "investigation",
        description: `CLOSED-SYSTEM VIOLATION: ${violations.join("; ")}`,
        impact_level: "critical",
        question_id: null,
        v_before: null,
        v_after: null,
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify({ transaction_id, buyer_id, seller_id, violations })
      });
    }

    return new Response(JSON.stringify({
      passed,
      violations: passed ? [] : violations,
      audit_log: {
        checked_at: new Date().toISOString(),
        buyer_id,
        seller_id,
        price_hikari,
        source
      }
    }), {
      status: passed ? 200 : 403,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, passed: false }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
