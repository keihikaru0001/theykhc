import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

//===============================================
// DOI Seed Importer — Zenodo 1,020件をSeedRecordに一括投入
//===============================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { records, batch_size = 50 } = body;

    if (!records || !Array.isArray(records)) {
      return Response.json({ error: 'records array required' }, { status: 400 });
    }

    const total = records.length;
    let imported = 0;
    let errors = 0;
    const errorList = [];

    // バッチサイズごとに分割して投入
    for (let i = 0; i < total; i += batch_size) {
      const batch = records.slice(i, i + batch_size);
      try {
        // 各レコードを個別に作成（バルクAPIが不安定なため）
        for (const r of batch) {
          try {
            await base44.asServiceRole.entities.SeedRecord.create({
              doi: r.doi || '',
              title: (r.title || '').slice(0, 500),
              abstract: (r.abstract || '').slice(0, 2000),
              keywords: (r.keywords || '').slice(0, 500),
              published_date: r.published_date || '',
              zenodo_url: r.zenodo_url || '',
              authors: (r.authors || '').slice(0, 300)
            });
            imported++;
          } catch (e) {
            errors++;
            if (errorList.length < 10) {
              errorList.push({ doi: r.doi, error: e.message });
            }
          }
        }
      } catch (e) {
        errors++;
        if (errorList.length < 10) {
          errorList.push({ batch: i, error: e.message });
        }
      }
    }

    return Response.json({
      total: total,
      imported: imported,
      errors: errors,
      error_samples: errorList
    });

  } catch (error) {
    console.error('seedImporter error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
