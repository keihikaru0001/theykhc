/**
 * Tower Status API
 * Returns current DOI count, latest publications, and tower metadata.
 */

export default async function towerStatus(req, res) {
  try {
    const { createClientFromRequest } = await import('npm:@base44/sdk@0.8.23');
    const base44 = createClientFromRequest(req);
    
    const allRecords = await base44.asServiceRole.entities.SeedRecord.list({
      limit: 500,
      fields: ['doi', 'title', 'published_date', 'authors', 'abstract', 'keywords', 'zenodo_url']
    });
    
    const totalCount = allRecords.count || 0;
    const records = allRecords.records || [];
    
    const sorted = records
      .filter(r => r.data && r.data.published_date)
      .sort((a, b) => new Date(b.data.published_date) - new Date(a.data.published_date));
    
    const latest = sorted.slice(0, 10).map(r => ({
      doi: r.data.doi,
      title: r.data.title,
      published_date: r.data.published_date,
      zenodo_url: r.data.zenodo_url
    }));
    
    const lastUpdated = sorted.length > 0 
      ? sorted[0].data.published_date 
      : null;
    
    return new Response(JSON.stringify({
      success: true,
      total_dois: totalCount,
      last_updated: lastUpdated,
      latest_publications: latest,
      generated_at: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      total_dois: 0,
      latest_publications: [],
      generated_at: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
