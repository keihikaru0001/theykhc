// check_membership_access — メンバーシップ資格確認

export default async function(req) {
  const url = new URL(req.url);
  const user_id = url.searchParams.get("user_id");

  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    // FanProfileを取得
    const profiles = await client.entities.FanProfile.list({
      filter: { user_id },
      limit: 1
    });

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({
        access: false,
        reason: "No FanProfile found",
        redirect: "https://theykhc.com"
      }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }

    const profile = profiles[0];
    const tier = profile.data.membership_tier;

    // 既にGameCompanyが存在するか確認
    const companies = await client.entities.GameCompany.list({
      filter: { user_id, status: "active" },
      limit: 1
    });
    const has_company = companies && companies.length > 0;

    // membership_tierが設定されていればアクセス許可
    // (招待制なので、tierが存在すること自体が招待済みの証)
    const access = tier != null && tier !== "";

    return new Response(JSON.stringify({
      access,
      tier: tier || "none",
      hikari_balance: profile.data.hikari_balance || 0,
      has_company: has_company,
      company_id: has_company ? companies[0].id : null,
      redirect: access ? null : "https://theykhc.com"
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
