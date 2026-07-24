// generate_leaderboard_data — 光貨圏GAME リーダーボード生成

export default async function(req) {
  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    // 全アクティブGameCompanyを取得
    const companies = await client.entities.GameCompany.list({
      filter: { status: "active" },
      limit: 500
    });

    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ leaderboard: [], total: 0 }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }

    // 各Companyのスコアを計算
    const scores = [];
    for (const comp of companies) {
      // HoldingsからV合計を計算
      const holdings = await client.entities.GameHolding.list({
        filter: { company_id: comp.id, status: "held" },
        limit: 100
      });
      let v_score = 0;
      if (holdings) {
        for (const h of holdings) {
          v_score += (h.data.current_v || 0);
        }
      }

      // HikariTransactionから共鳴スコアを計算
      const rewards = await client.entities.HikariTransaction.list({
        filter: { user_id: comp.data.user_id, type: "game_reward" },
        limit: 100
      });
      let resonance_score = 0;
      if (rewards) {
        for (const r of rewards) {
          resonance_score += (r.data.amount || 0);
        }
      }

      scores.push({
        company_id: comp.id,
        name: comp.data.name,
        v_score: Math.round(v_score * 100) / 100,
        d_score: comp.data.d_score || 0,
        d_reduction_total: comp.data.d_score || 0,
        resonance_score: Math.round(resonance_score * 100) / 100,
        hikari_balance: comp.data.hikari_balance || 0,
        assets_held: holdings ? holdings.length : 0
      });
    }

    // V_scoreで降順ソート
    scores.sort((a, b) => b.v_score - a.v_score);

    // ランク付け
    const ranked = scores.map((s, i) => ({
      ...s,
      rank: i + 1
    }));

    // GameLeaderboardに保存（all_time）
    for (const r of ranked) {
      await client.entities.GameLeaderboard.create({
        company_id: r.company_id,
        rank: r.rank,
        v_score: r.v_score,
        d_reduction_total: r.d_score,
        resonance_score: r.resonance_score,
        period: "all_time",
        snapshot_date: new Date().toISOString()
      });
    }

    return new Response(JSON.stringify({
      total: ranked.length,
      top_10: ranked.slice(0, 10),
      full: ranked
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
