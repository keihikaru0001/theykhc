// get_player_portfolio — プレイヤーの研究貢献ポートフォリオ
// 事業売買は廃止。研究貢献（D削減）とランキングを表示。

export default async function(req) {
  const url = new URL(req.url);
  const company_id = url.searchParams.get("company_id");

  if (!company_id) {
    return new Response(JSON.stringify({ error: "company_id required" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    // GameCompanyを取得
    const company = await client.entities.GameCompany.get(company_id);
    if (!company) throw new Error("Company not found");

    // リーダーボード順位を取得
    const leaderboard = await client.entities.GameLeaderboard.list({
      filter: { company_id, period: "all_time" },
      limit: 1
    });
    const rank = leaderboard && leaderboard.length > 0 ? leaderboard[0].data.rank : null;
    const d_reduction_total = leaderboard && leaderboard.length > 0 ? leaderboard[0].data.d_reduction_total : 0;
    const resonance_score = leaderboard && leaderboard.length > 0 ? leaderboard[0].data.resonance_score : 0;

    // 研究貢献イベントを取得
    const researchEvents = await client.entities.GameEvent.list({
      filter: { question_id: null, event_type: "research_contribution" },
      limit: 20
    });

    return new Response(JSON.stringify({
      company: {
        id: company.id,
        name: company.data.name,
        hikari_balance: company.data.hikari_balance,
        v_score: company.data.v_score,
        d_score: company.data.d_score,
        status: company.data.status,
        rank,
        d_reduction_total,
        resonance_score
      },
      research_contributions: researchEvents ? researchEvents.map(e => ({
        id: e.id,
        description: e.data.description,
        impact_level: e.data.impact_level,
        timestamp: e.data.timestamp
      })) : []
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
