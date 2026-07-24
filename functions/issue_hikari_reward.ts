// issue_hikari_reward — 閉鎖系内での光貨報酬発行

export default async function(req) {
  const { user_id, amount, reason, related_event_id } = await req.json();

  if (!user_id || !amount || amount <= 0) {
    return new Response(JSON.stringify({ error: "Invalid reward parameters" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    // HikariTransactionを記録（内部起源のみ）
    const tx = await client.entities.HikariTransaction.create({
      user_id,
      amount,
      type: "game_reward",
      source: "kokyaku_game",
      description: reason || "Game reward",
      related_request_id: related_event_id || null,
      artist_id: null
    });

    // GameCompanyの残高を更新（user_idからcompanyを探す）
    const companies = await client.entities.GameCompany.list({
      filter: { user_id, status: "active" },
      limit: 1
    });
    if (companies && companies.length > 0) {
      const company = companies[0];
      await client.entities.GameCompany.update(company.id, {
        hikari_balance: (company.data.hikari_balance || 0) + amount
      });
    }

    return new Response(JSON.stringify({
      success: true,
      transaction_id: tx.id,
      user_id,
      amount,
      reason,
      source: "kokyaku_game"
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
