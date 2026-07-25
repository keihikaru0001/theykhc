// Zenodo Harvester — 会長の領域に関連するメタデータをZenodo APIから取得しSeedRecordに保存
// タイトル+キーワードのみ使用（著作権クリア、事実情報）

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      action = 'fetch',           // fetch | stats | fetch_subjects
      subjects = [],               // 検索キーワード
      batch_size = 50,             // 1回のZenodo API呼び出しで取得する件数
      max_records = 50000,         // 最大取得件数
      start_page = 1               // 開始ページ
    } = body;

    // 会長の領域のデフォルト検索キーワード
    const defaultSubjects = [
      'philosophy of mind',
      'consciousness observation',
      'neutrino detection',
      'nanofiber biomedical',
      'chitosan conductive',
      'artificial intelligence ethics',
      'quantum economics',
      'market risk assessment',
      'neuroscience consciousness',
      'bioethics technology',
      'impermanence buddhism',
      'life force ki',
      'observer effect physics',
      'innovation management',
      'technology ethics',
      'digital transformation',
      'cognitive science',
      'complexity economics',
      'sustainable technology',
      'neural interface',
      'biosensor nanotechnology',
      'predictive analytics',
      'behavioral economics',
      'decision theory',
      'systems thinking',
      'knowledge management',
      'open science',
      'research methodology',
      'interdisciplinary studies',
      'future studies'
    ];

    const searchSubjects = subjects.length > 0 ? subjects : defaultSubjects;

    // ============================================
    // ACTION: stats — 現在のSeedRecord統計
    // ============================================
    if (action === 'stats') {
      // Zenodo全体の件数を取得
      const totalRes = await fetch('https://zenodo.org/api/records?size=1', {
        headers: { 'Accept': 'application/json' }
      });
      const totalData = await totalRes.json();
      const zenodoTotal = totalData.hits?.total || 0;

      return Response.json({
        action: 'stats',
        zenodo_total: zenodoTotal,
        target_records: max_records,
        search_subjects: searchSubjects,
        subjects_count: searchSubjects.length,
        estimated_batches: Math.ceil(max_records / batch_size / searchSubjects.length) * searchSubjects.length,
        message: `Zenodo全体: ${zenodoTotal.toLocaleString()}件。${searchSubjects.length}個のキーワードで${max_records.toLocaleString()}件を取得予定。`
      });
    }

    // ============================================
    // ACTION: fetch — Zenodo APIからメタデータ取得→SeedRecord保存
    // ============================================
    if (action === 'fetch') {
      const subjectIndex = body.subject_index || 0;
      const currentSubject = searchSubjects[subjectIndex] || searchSubjects[0];
      const page = body.page || start_page;

      // Zenodo API呼び出し
      const zenodoUrl = `https://zenodo.org/api/records?size=${batch_size}&page=${page}&q=subjects.subject:"${encodeURIComponent(currentSubject)}"&sort=newest&type=publication&access_right=open`;

      const zenodoRes = await fetch(zenodoUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (!zenodoRes.ok) {
        return Response.json({
          action: 'fetch',
          error: `Zenodo API error: ${zenodoRes.status}`,
          subject: currentSubject,
          page
        }, { status: 502 });
      }

      const zenodoData = await zenodoRes.json();
      const records = zenodoData.hits?.hits || [];
      const totalHits = zenodoData.hits?.total || 0;

      // SeedRecordに保存
      const saved: any[] = [];
      const skipped: any[] = [];

      for (const record of records) {
        const doi = record.doi || `zenodo.${record.id}`;
        const title = record.metadata?.title || '';
        const abstract = (record.metadata?.description || '').substring(0, 200); // 先頭200字のみ（安全設計）
        const keywords = (record.metadata?.keywords || []).join(', ');
        const authors = (record.metadata?.creators || []).map((c: any) => c.name).join(', ');
        const publishedDate = record.metadata?.publication_date || '';
        const zenodoUrl = record.links?.self || `https://zenodo.org/records/${record.id}`;

        if (!title) {
          skipped.push({ doi, reason: 'no title' });
          continue;
        }

        saved.push({
          doi,
          title,
          abstract,
          keywords,
          authors,
          published_date: publishedDate,
          zenodo_url: zenodoUrl,
          source_subject: currentSubject
        });
      }

      return Response.json({
        action: 'fetch',
        subject: currentSubject,
        subject_index: subjectIndex,
        page,
        batch_size,
        fetched: records.length,
        saved: saved.length,
        skipped: skipped.length,
        total_hits_for_subject: totalHits,
        saved_records: saved,
        next_page: page + 1,
        next_subject_index: records.length < batch_size ? subjectIndex + 1 : subjectIndex,
        has_more: subjectIndex < searchSubjects.length - 1 || records.length === batch_size
      });
    }

    // ============================================
    // ACTION: fetch_subjects — 全キーワードで一括取得（進捗付き）
    // ============================================
    if (action === 'fetch_subjects') {
      const allSaved: any[] = [];
      let totalFetched = 0;
      let totalSaved = 0;
      let currentSubjectIndex = body.subject_index || 0;
      const maxPerSubject = Math.ceil(max_records / searchSubjects.length);

      for (let si = currentSubjectIndex; si < searchSubjects.length; si++) {
        const subject = searchSubjects[si];
        let subjectSaved = 0;

        for (let page = 1; page <= Math.ceil(maxPerSubject / batch_size); page++) {
          if (totalSaved >= max_records) break;

          const zenodoUrl = `https://zenodo.org/api/records?size=${batch_size}&page=${page}&q=subjects.subject:"${encodeURIComponent(subject)}"&sort=newest&type=publication&access_right=open`;

          try {
            const zenodoRes = await fetch(zenodoUrl, {
              headers: { 'Accept': 'application/json' }
            });

            if (!zenodoRes.ok) continue;

            const zenodoData = await zenodoRes.json();
            const records = zenodoData.hits?.hits || [];

            if (records.length === 0) break;

            for (const record of records) {
              if (totalSaved >= max_records) break;

              const doi = record.doi || `zenodo.${record.id}`;
              const title = record.metadata?.title || '';
              const abstract = (record.metadata?.description || '').substring(0, 200);
              const keywords = (record.metadata?.keywords || []).join(', ');
              const authors = (record.metadata?.creators || []).map((c: any) => c.name).join(', ');
              const publishedDate = record.metadata?.publication_date || '';
              const zenodoUrl2 = record.links?.self || `https://zenodo.org/records/${record.id}`;

              if (!title) continue;

              allSaved.push({
                doi,
                title,
                abstract,
                keywords,
                authors,
                published_date: publishedDate,
                zenodo_url: zenodoUrl2,
                source_subject: subject
              });

              totalSaved++;
              subjectSaved++;
              totalFetched++;
            }

            if (records.length < batch_size) break;
          } catch (e) {
            continue;
          }
        }

        if (totalSaved >= max_records) break;
      }

      return Response.json({
        action: 'fetch_subjects',
        total_fetched: totalFetched,
        total_saved: allSaved.length,
        subjects_processed: searchSubjects.length - currentSubjectIndex,
        records: allSaved,
        message: `${allSaved.length}件のメタデータを取得。SeedRecordに保存可能。`
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
});
