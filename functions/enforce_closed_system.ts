// enforce_closed_system — 閉鎖系整合性チェック
// 事業売買は廃止。光貨の流出入検証のみ。

export default async function(req) {
  const { transaction_id, user_id, amount, source } = await req.json();

  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    const violations = [];

    // 1. 外部システム参照チェック
    const external_patterns = ["stripe", "paypal", "bank", "wallet", "external", "withdraw", "cashout"];
    const all_fields = [user_id, source].filter(Boolean).map(f => String(f).toLowerCase());
    for (const field of all_fields) {
      for (const pattern of external_patterns) {
        if (field.includes(pattern)) {
          violations.push(`External system reference detected: ${field}`);
        }
      }
    }

    // 2. 金額が負でないか
    if (amount < 0) {
      violations.push("Negative amount detected — impossible in closed system");
    }

    // 3. 取引元が内部起源か（事業売買は廃止）
    const valid_sources = ["game_reward", "research", "kokyaku_game", "kokyaku_game_initial", "purchase", "service_consumption", null];
    if (source && !valid_sources.includes(source)) {
      violations.push(`Unknown source: ${source} — must be internal`);
    }

    const passed = violations.length === 0;

    if (!passed) {
      await client.entities.GameEvent.create({
        event_type: "investigation",
        description: `CLOSED-SYSTEM VIOLATION: ${violations.join("; ")}`,
        impact_level: "critical",
        question_id: null,
        v_before: null,
        v_after: null,
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify({ transaction_id, user_id, violations })
      });
    }

    return new Response(JSON.stringify({
      passed,
      violations: passed ? [] : violations,
      audit_log: {
        checked_at: new Date().toISOString(),
        user_id,
        amount,
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
