// get_player_portfolio — プレイヤーのポートフォリオ取得

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

    // Holdingsを取得
    const holdings = await client.entities.GameHolding.list({
      filter: { company_id, status: "held" },
      limit: 100
    });

    const portfolio = [];
    let total_v = 0;
    if (holdings && holdings.length > 0) {
      for (const h of holdings) {
        const q = await client.entities.Question.get(h.data.question_id);
        portfolio.push({
          holding_id: h.id,
          question_id: h.data.question_id,
          title: q ? q.data.text : "Unknown",
          industry: q ? q.data.industry : "Unknown",
          purchase_price: h.data.purchase_price_hikari,
          current_v: h.data.current_v,
          current_d: h.data.current_d,
          v_change: ((h.data.current_v || 0) - (h.data.purchase_price_hikari || 0)),
          held_since: h.data.held_since
        });
        total_v += (h.data.current_v || 0);
      }
    }

    // リーダーボード順位を取得
    const leaderboard = await client.entities.GameLeaderboard.list({
      filter: { company_id, period: "all_time" },
      limit: 1
    });
    const rank = leaderboard && leaderboard.length > 0 ? leaderboard[0].data.rank : null;

    // 直近取引履歴を取得
    const transactions = await client.entities.GameTransaction.list({
      filter: { buyer_id: company_id },
      sort: "-timestamp",
      limit: 10
    });

    return new Response(JSON.stringify({
      company: {
        id: company.id,
        name: company.data.name,
        hikari_balance: company.data.hikari_balance,
        assets_held: holdings ? holdings.length : 0,
        v_score: total_v,
        d_score: company.data.d_score,
        status: company.data.status,
        rank
      },
      portfolio,
      recent_transactions: transactions ? transactions.map(t => ({
        id: t.id,
        question_id: t.data.question_id,
        price: t.data.price_hikari,
        type: t.data.trade_type,
        v_at_trade: t.data.v_at_trade,
        timestamp: t.data.timestamp
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
