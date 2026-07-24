// reduce_d_via_research — プレイヤーの研究によりDを削減しVを上昇させる
// 実質的な研究貢献のみHikari報酬を付与

export default async function(req) {
  const { company_id, question_id, research_payload } = await req.json();

  if (!company_id || !question_id || !research_payload) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // 研究貢献のバリデーション
  if (typeof research_payload !== "string" || research_payload.trim().length < 50) {
    return new Response(JSON.stringify({ 
      error: "Research contribution too short. Minimum 50 characters required.",
      hint: "実質的な研究貢献が必要です。アイデアのsource_doiを参照し、具体的な知見を述べてください。"
    }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    // GameCompanyを取得
    const company = await client.entities.GameCompany.get(company_id);
    if (!company) throw new Error("Company not found");
    if (company.data.status === "suspended") throw new Error("Company is suspended");

    // GameHoldingを確認（プレイヤーがこのアイデアを保有しているか）
    const holdings = await client.entities.GameHolding.list({
      filter: { company_id, question_id, status: "held" }
    });
    if (!holdings || holdings.length === 0) {
      return new Response(JSON.stringify({ error: "You don't hold this asset" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    const holding = holdings[0];

    // 現在のD値を取得
    const current_d = holding.data.current_d || 5;
    const current_v = holding.data.current_v || 100;

    // D削減量を計算（研究の深さに比例、最大0.5削減、Dは1未満にならない）
    const research_depth = Math.min(research_payload.length / 500, 1); // 500文字で最大評価
    const d_reduction = Math.min(current_d * 0.1 * research_depth, 0.5);
    const new_d = Math.max(current_d - d_reduction, 0.5); // Dは0.5未満にならない

    // 新しいVを計算（Nは不変、Dが減少）
    const n_value = current_v * current_d; // V = N/D → N = V*D
    const new_v = Math.round((n_value / new_d) * 100) / 100;

    // V上昇量
    const v_increase = new_v - current_v;

    // Hikari報酬 = V上昇量の10%（整数に丸める）
    const hikari_reward = Math.max(1, Math.round(v_increase * 0.1));

    // GameHoldingを更新
    await client.entities.GameHolding.update(holding.id, {
      current_d: Math.round(new_d * 100) / 100,
      current_v: new_v
    });

    // GameCompanyの光貨残高とD_scoreを更新
    await client.entities.GameCompany.update(company_id, {
      hikari_balance: (company.data.hikari_balance || 0) + hikari_reward,
      d_score: (company.data.d_score || 0) + d_reduction
    });

    // HikariTransactionを記録
    await client.entities.HikariTransaction.create({
      user_id: company.data.user_id,
      amount: hikari_reward,
      type: "game_reward",
      source: "kokyaku_game",
      description: `D-reduction reward for Question ${question_id}`,
      related_request_id: question_id,
      artist_id: null
    });

    // GameEventを作成
    const impact = v_increase > 50 ? "high" : v_increase > 10 ? "medium" : "low";
    await client.entities.GameEvent.create({
      event_type: "d_reduction",
      description: `D-reduction by ${company.data.name}: D ${current_d}→${Math.round(new_d * 100) / 100}, V ${current_v}→${new_v}`,
      impact_level: impact,
      question_id,
      v_before: current_v,
      v_after: new_v,
      timestamp: new Date().toISOString(),
      metadata: JSON.stringify({
        company_id,
        research_length: research_payload.length,
        d_reduction: Math.round(d_reduction * 100) / 100,
        hikari_reward
      })
    });

    return new Response(JSON.stringify({
      success: true,
      company_id,
      question_id,
      old_d: Math.round(current_d * 100) / 100,
      new_d: Math.round(new_d * 100) / 100,
      old_v: current_v,
      new_v,
      v_increase: Math.round(v_increase * 100) / 100,
      d_reduction: Math.round(d_reduction * 100) / 100,
      hikari_reward,
      new_balance: (company.data.hikari_balance || 0) + hikari_reward,
      message: `研究によりDが減少し、Vが上昇しました。${hikari_reward}光貨を獲得。`
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
