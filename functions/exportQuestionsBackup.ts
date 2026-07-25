async function exportQuestionsBackup() {
  const base44 = (await import('@base44/sdk')).default;
  
  const allRecords = [];
  let skip = 0;
  const limit = 500;
  let hasMore = true;
  
  while (hasMore) {
    const batch = await base44.asServiceRole.entities.Question.list({ limit, skip });
    allRecords.push(...batch);
    if (batch.length < limit) {
      hasMore = false;
    } else {
      skip += limit;
    }
  }
  
  return {
    total_count: allRecords.length,
    export_date: new Date().toISOString(),
    records: allRecords
  };
}
