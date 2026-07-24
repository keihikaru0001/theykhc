// execute_trade — 光貨圏GAME 取引実行関数
// 買い手・売り手間でGO アイデアを光貨で取引する

export default async function(req) {
  const { buyer_company_id, seller_company_id, question_id, price_hikari } = await req.json();

  if (!buyer_company_id || !question_id || !price_hikari) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    // 1. 買い手のGameCompanyを取得
    const buyer = await client.entities.GameCompany.get(buyer_company_id);
    if (!buyer) throw new Error("Buyer company not found");
    if (buyer.data.status === "suspended") throw new Error("Buyer company is suspended");
    if (buyer.data.hikari_balance < price_hikari) throw new Error("Insufficient Hikari balance");

    // 2. 売り手がいる場合、GameHoldingを確認
    let seller = null;
    let holding = null;
    if (seller_company_id && seller_company_id !== "ipo") {
      seller = await client.entities.GameCompany.get(seller_company_id);
      if (!seller) throw new Error("Seller company not found");
      if (seller.data.status === "suspended") throw new Error("Seller company is suspended");

      // 売り手がこのアイデアを保有しているか確認
      const holdings = await client.entities.GameHolding.list({
        filter: { company_id: seller_company_id, question_id, status: "held" }
      });
      if (!holdings || holdings.length === 0) throw new Error("Seller does not hold this asset");
      holding = holdings[0];
    }

    // 3. V=N/D を計算
    const question = await client.entities.Question.get(question_id);
    if (!question) throw new Error("Question not found");

    const n_value = question.data.insight ? 500 : 100; // TAM proxy
    const d_value = question.data.depth || 5;
    const v_at_trade = n_value / d_value;

    // 4. 取引実行
    // 買い手の光貨残高を減らす
    await client.entities.GameCompany.update(buyer_company_id, {
      hikari_balance: buyer.data.hikari_balance - price_hikari,
      assets_held_count: (buyer.data.assets_held_count || 0) + 1
    });

    // 売り手の光貨残高を増やす
    if (seller) {
      await client.entities.GameCompany.update(seller_company_id, {
        hikari_balance: (seller.data.hikari_balance || 0) + price_hikari,
        assets_held_count: Math.max(0, (seller.data.assets_held_count || 0) - 1)
      });

      // 売り手のholdingをsoldにする
      await client.entities.GameHolding.update(holding.id, { status: "sold" });
    }

    // 買い手の新しいGameHoldingを作成
    const newHolding = await client.entities.GameHolding.create({
      company_id: buyer_company_id,
      question_id,
      purchase_price_hikari: price_hikari,
      current_v: v_at_trade,
      current_d: d_value,
      held_since: new Date().toISOString(),
      status: "held"
    });

    // 5. GameTransactionを記録
    const transaction = await client.entities.GameTransaction.create({
      buyer_id: buyer_company_id,
      seller_id: seller_company_id || null,
      question_id,
      price_hikari,
      v_at_trade,
      d_at_trade: d_value,
      trade_type: seller ? "trade" : "ipo",
      timestamp: new Date().toISOString()
    });

    // 6. GameEventを作成（取引額が大きい場合はhigh impact）
    const impact = price_hikari > 1000 ? "high" : price_hikari > 100 ? "medium" : "low";
    if (impact !== "low") {
      await client.entities.GameEvent.create({
        event_type: "major_trade",
        description: `Trade executed: ${price_hikari} Hikari — Question ${question_id}`,
        impact_level: impact,
        question_id,
        v_before: v_at_trade,
        v_after: v_at_trade,
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify({ buyer: buyer_company_id, seller: seller_company_id })
      });
    }

    return new Response(JSON.stringify({
      success: true,
      transaction_id: transaction.id,
      holding_id: newHolding.id,
      v_at_trade,
      d_at_trade: d_value,
      buyer_balance: buyer.data.hikari_balance - price_hikari
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
