// zenodoMorningHarvest.ts
// Fetches recent Zenodo records (excluding 会長's own) for question harvesting
// Called every morning by the workflow

export default async function(req: Request): Promise<Response> {
  try {
    // Fetch recent Zenodo records — broad search, most recent first
    // Type: publication (research papers only)
    const url = new URL("https://zenodo.org/api/records");
    url.searchParams.set("sort", "mostrecent");
    url.searchParams.set("size", "30");
    url.searchParams.set("type", "publication");
    url.searchParams.set("communities", "false"); // Don't restrict to communities

    const res = await fetch(url.toString(), {
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({
        status: "error",
        message: `Zenodo API returned ${res.status}`,
        records: []
      }), { headers: { "Content-Type": "application/json" } });
    }

    const data = await res.json();
    const hits = data?.hits?.hits || [];

    // Filter out 会長's own records (Katayama, Yoshimitsu)
    const filtered = hits.filter((hit: any) => {
      const creators = hit?.metadata?.creators || [];
      const isOwn = creators.some((c: any) =>
        (c.name || "").includes("Katayama") || (c.name || "").includes("片山")
      );
      return !isOwn;
    });

    // Extract relevant fields for question generation
    const records = filtered.slice(0, 20).map((hit: any) => {
      const m = hit.metadata || {};
      return {
        doi: m.doi || "",
        title: m.title || "",
        abstract: (m.description || "").replace(/<[^>]*>/g, "").substring(0, 800),
        publication_date: m.publication_date || "",
        type: m.resource_type?.title || "",
        creators: (m.creators || []).map((c: any) => c.name || "").join(", "),
        keywords: (m.keywords || []).join(", "),
        subject: (m.subjects || []).map((s: any) => s.term || s).join(", "),
      };
    });

    return new Response(JSON.stringify({
      status: "ok",
      count: records.length,
      total_fetched: hits.length,
      records
    }), { headers: { "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({
      status: "error",
      message: e.message,
      records: []
    }), { headers: { "Content-Type": "application/json" } });
  }
}
