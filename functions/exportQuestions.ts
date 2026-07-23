import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Read all Question records in batches
    let allRecords: any[] = [];
    let skip = 0;
    let hasMore = true;
    const batchSize = 500;
    
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.Question.list({
        limit: batchSize,
        skip: skip,
        sort: "-created_date"
      });
      
      allRecords = allRecords.concat(batch.results || []);
      hasMore = batch.has_more || false;
      skip += batchSize;
      
      if (allRecords.length >= 5000) break; // Safety limit
    }
    
    // Format as JSON
    const data = {
      export_date: new Date().toISOString(),
      total_count: allRecords.length,
      records: allRecords
    };
    
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
