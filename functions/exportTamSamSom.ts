// TAM/SAM/SOM集計 — GO判定のQuestionから市場規模を抽出し業界別に集計
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function parseMarketSize(answer: string): { tam: number; sam: number; som: number; cagr: number } {
  if (!answer) return { tam: 0, sam: 0, som: 0, cagr: 0 };
  
  const extract = (pattern: string): number => {
    const regex = new RegExp(pattern + "[】】]?\\s*([0-9,]+)\\s*億円");
    const match = answer.match(regex);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''));
    }
    return 0;
  };
  
  const tam = extract("【TAM】");
  const sam = extract("【SAM】");
  const som = extract("【SOM】");
  
  const cagrMatch = answer.match(/【成長率\(CAGR\)】\s*([0-9.]+)%/);
  const cagr = cagrMatch ? parseFloat(cagrMatch[1]) : 0;
  
  return { tam, sam, som, cagr };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    
    // Read all answered questions
    let allRecords: any[] = [];
    let skip = 0;
    const limit = 500;
    
    while (true) {
      const result = await base44.asServiceRole.entities.Question.list({
        limit: limit,
        skip: skip,
        filter: { status: "answered" }
      });
      
      if (!result || result.length === 0) break;
      allRecords = allRecords.concat(result);
      if (result.length < limit) break;
      skip += limit;
    }
    
    // Filter GO verdicts and parse market sizes
    const goRecords = allRecords.filter(r => 
      r.tags && Array.isArray(r.tags) && r.tags.includes("verdict:go")
    );
    
    // Aggregate by industry
    const industryMap: Record<string, {
      industry: string;
      count: number;
      tamTotal: number;
      samTotal: number;
      somTotal: number;
      avgVnd: number;
      avgCagr: number;
      ideas: { text: string; tam: number; sam: number; som: number; vnd: number; cagr: number }[];
    }> = {};
    
    for (const record of goRecords) {
      const industry = record.industry || "未分類";
      const { tam, sam, som, cagr } = parseMarketSize(record.answer || "");
      
      // Extract V=N/D score from tags
      let vnd = 0;
      if (record.tags) {
        const vndTag = record.tags.find((t: string) => t.startsWith("vnd:"));
        if (vndTag) vnd = parseFloat(vndTag.split(":")[1]);
      }
      
      if (!industryMap[industry]) {
        industryMap[industry] = {
          industry,
          count: 0,
          tamTotal: 0,
          samTotal: 0,
          somTotal: 0,
          avgVnd: 0,
          avgCagr: 0,
          ideas: []
        };
      }
      
      const entry = industryMap[industry];
      entry.count++;
      entry.tamTotal += tam;
      entry.samTotal += sam;
      entry.somTotal += som;
      entry.avgVnd += vnd;
      entry.avgCagr += cagr;
      entry.ideas.push({ text: record.text || "", tam, sam, som, vnd, cagr });
    }
    
    // Calculate averages and format output
    const industries = Object.values(industryMap).map(entry => ({
      industry: entry.industry,
      ideaCount: entry.count,
      tamBillionYen: entry.tamTotal,
      samBillionYen: entry.samTotal,
      somBillionYen: entry.somTotal,
      avgVndScore: Math.round((entry.avgVnd / entry.count) * 100) / 100,
      avgCagr: Math.round((entry.avgCagr / entry.count) * 100) / 100,
      ideas: entry.ideas
    }));
    
    // Sort by TAM descending
    industries.sort((a, b) => b.tamBillionYen - a.tamBillionYen);
    
    // Grand totals
    const grandTotal = {
      totalIdeas: goRecords.length,
      totalTam: industries.reduce((s, i) => s + i.tamBillionYen, 0),
      totalSam: industries.reduce((s, i) => s + i.samBillionYen, 0),
      totalSom: industries.reduce((s, i) => s + i.somBillionYen, 0),
      industryCount: industries.length
    };
    
    return new Response(JSON.stringify({
      grandTotal,
      industries: industries.map(i => ({
        industry: i.industry,
        ideaCount: i.ideaCount,
        tamBillionYen: i.tamBillionYen,
        samBillionYen: i.samBillionYen,
        somBillionYen: i.somBillionYen,
        avgVndScore: i.avgVndScore,
        avgCagr: i.avgCagr,
        ideaCountWithMarket: i.ideas.filter(idea => idea.tam > 0).length
      }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
