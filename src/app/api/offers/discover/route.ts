import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const maxDuration = 30;

const INDEX_URL = "https://d4donline.com/en/saudi-arabia/riyadh/offers";

const MALL_SLUGS: Record<string, string> = {
  "بندا": "hyper-panda-70",
  "الجزيرة": "aljazera-shopping-center-210",
  "الدانوب": "danube-74",
  "أسواق التميمي": "tamimi-market-68",
  "اللولو": "lulu-hypermarket-63",
};

// ".../riyadh-saudi-arabia-hyper-panda-offers-best-5-riyal-offers" -> "best 5 riyal offers"
function campaignTitle(lastSegment: string) {
  const afterOffers = lastSegment.split("-offers-").slice(1).join("-offers-");
  return (afterOffers || lastSegment).replace(/-/g, " ").trim();
}

export async function GET() {
  const session = await getSession();
  if (!session || !["admin", "warehouse"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const res = await fetch(INDEX_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ar-SA,ar;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `D4D رجّع ${res.status}` }, { status: 502 });
    }
    const html = await res.text();

    const byMall: Record<string, { url: string; title: string; campaignId: string }[]> = {};

    for (const [mall, slug] of Object.entries(MALL_SLUGS)) {
      const re = new RegExp(
        `/en/saudi-arabia/riyadh/offers/${slug}/(\\d+)/([a-z0-9-]+)`,
        "gi"
      );
      const seen = new Set<string>();
      const found: { url: string; title: string; campaignId: string }[] = [];
      for (const m of html.matchAll(re)) {
        const [path, campaignId, last] = m;
        if (seen.has(campaignId)) continue;
        seen.add(campaignId);
        found.push({
          url: `https://d4donline.com${path}`,
          title: campaignTitle(last),
          campaignId,
        });
      }
      byMall[mall] = found;
    }

    return NextResponse.json({
      source: INDEX_URL,
      fetchedAt: new Date().toISOString(),
      malls: byMall,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
