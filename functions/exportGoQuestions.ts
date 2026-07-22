export default async function(req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  
  // Read all answered questions in batches
  let allQuestions: any[] = [];
  let skip = 0;
  let hasMore = true;
  
  while (hasMore) {
    const batch = await base44.asServiceRole.entities.Question.list({
      limit: 500,
      skip: skip,
      sort: "-created_date",
      filter: { status: "answered" }
    });
    
    allQuestions.push(...batch);
    hasMore = batch.length === 500;
    skip += 500;
  }
  
  // Filter for GO verdict and parse market data
  const goQuestions = allQuestions
    .filter(q => q.tags && q.tags.some((t: string) => t.includes("verdict:go")))
    .map(q => {
      const answer = q.answer || "";
      
      // Parse market size from answer field
      const tamMatch = answer.match(/【TAM】([^\n]+)/);
      const samMatch = answer.match(/【SAM】([^\n]+)/);
      const somMatch = answer.match(/【SOM】([^\n]+)/);
      const growthMatch = answer.match(/【成長率\(CAGR\)】([^\n]+)/);
      const marketOverviewMatch = answer.match(/【市場概要】([^\n]+)/);
      const targetMatch = answer.match(/【ターゲット】([^\n]+)/);
      const competitorMatch = answer.match(/【競合状況】([^\n]+)/);
      
      // Parse V=N/D score from tags
      const vndTag = q.tags?.find((t: string) => t.startsWith("vnd:"));
      const vndScore = vndTag ? vndTag.split(":")[1] : "";
      
      // Parse 5 layers from answer
      const researchLayer = answer.match(/【研究の層】([^\n【]+)/)?.[1]?.trim() || "";
      const emotionLayer = answer.match(/【感情の層】([^\n【]+)/)?.[1]?.trim() || "";
      const wisdomLayer = answer.match(/【知恵の層】([^\n【]+)/)?.[1]?.trim() || "";
      const marketLayer = answer.match(/【市場の層】([^\n【]+)/)?.[1]?.trim() || "";
      const riskLayer = answer.match(/【リスクの層】([^\n【]+)/)?.[1]?.trim() || "";
      const conclusion = answer.match(/【結論】([^\n]+)/)?.[1]?.trim() || "";
      
      return {
        id: q.id,
        question: q.text || "",
        industry: q.industry || "",
        vnd_score: vndScore,
        verdict: "go",
        insight: q.insight || "",
        source_doi: q.source_doi || "",
        source_title: q.source_title || "",
        tam: tamMatch ? tamMatch[1].trim() : "",
        sam: samMatch ? samMatch[1].trim() : "",
        som: somMatch ? somMatch[1].trim() : "",
        growth_rate: growthMatch ? growthMatch[1].trim() : "",
        market_overview: marketOverviewMatch ? marketOverviewMatch[1].trim() : "",
        target: targetMatch ? targetMatch[1].trim() : "",
        competitors: competitorMatch ? competitorMatch[1].trim() : "",
        research_layer: researchLayer,
        emotion_layer: emotionLayer,
        wisdom_layer: wisdomLayer,
        market_layer: marketLayer,
        risk_layer: riskLayer,
        conclusion: conclusion,
        depth: q.depth || 0,
        created_date: q.created_date || ""
      };
    })
    .sort((a, b) => {
      // Sort by SOM descending (parse numeric value)
      const somA = parseFloat(a.som.replace(/[^\d.]/g, "")) || 0;
      const somB = parseFloat(b.som.replace(/[^\d.]/g, "")) || 0;
      return somB - somA;
    });
  
  return Response.json({
    total: goQuestions.length,
    questions: goQuestions
  });
}
