import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { batch, model } = body;
    
    const apiKey = Deno.env.get("OPENAI_API_KEY_2") || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return Response.json({ error: "No OpenAI API key" }, { status: 500 });
    }
    
    const useModel = model || "gpt-4o";
    const results = [];
    
    for (const q of batch) {
      const prompt = `あなたはTheYKHC Towerの事業分析AIである。以下の事業アイデアに対し、V=N/D（存在価値=充足/無明）の5層分析を深度化せよ。

【アイデア】${q.text}
【産業】${q.industry}
【現在のV=N/Dスコア】${q.vnd}/10
【種となった論文】${q.title || '不明'} (DOI: ${q.doi || '不明'})
【現在の分析（参考）】
${q.answer}

以下のJSON形式で返せ。各層は3〜5文で、根拠・具体例・実装方針を含め。

{
  "research": "研究の層（3-5文）。学術的根拠、技術的実現性、先行研究の参照",
  "emotion": "感情の層（3-5文）。顧客の心理的ニーズ、感情的価値、社会的共鳴",
  "wisdom": "知恵の層（3-5文）。長期的視点、哲学的助言、歴史的教訓",
  "market_layer": "市場の層（3-5文）。市場規模の根拠、成長ドライバー、セグメント分析",
  "risk": "リスクの層（3-5文）。5つのD要因（財務D/市場D/時代D/経営者D/道徳D） eachの評価、対策",
  "conclusion": "総合結論（2-3文）",
  "implementation": "実装ロードマップ（Phase 1: 0-6ヶ月 / Phase 2: 6-18ヶ月 / Phase 3: 18-36ヶ月）",
  "kpi": "主要KPI 3つ",
  "differentiator": "競合優位性・差別化ポイント（2-3文）"
}

日本語で出力せよ。JSONのみ。`;

      try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: useModel,
            messages: [
              { role: "system", content: "あなたはTheYKHC Towerの事業分析AIである。V=N/D（Katayama Formula）に基づく5層分析の専門家として、深度のある事業分析を行う。" },
              { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2000
          })
        });
        
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "";
        
        // Extract JSON from response
        let parsed = null;
        try {
          // Try to find JSON in the response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          // If JSON parse fails, store raw content
          parsed = { raw: content };
        }
        
        results.push({
          index: q.index,
          text: q.text,
          enriched: parsed || { raw: content }
        });
      } catch (e) {
        results.push({
          index: q.index,
          text: q.text,
          error: String(e)
        });
      }
    }
    
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});