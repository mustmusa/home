import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

const ALLOWED_HOSTS = [
  "panda.com.sa",
  "danube.sa",
  "tamimimarkets.com",
  "luluhypermarket.com",
  "gcc.luluhypermarket.com",
  "aljazeramarkets.com.sa",
  "d4donline.com",
];

function hostAllowed(hostname: string) {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_HOSTS.some((a) => h === a || h.endsWith("." + a));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "أضف ?url=" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "رابط غير صالح" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" || !hostAllowed(parsed.hostname)) {
    return NextResponse.json(
      { error: "النطاق غير مسموح", allowed: ALLOWED_HOSTS },
      { status: 400 }
    );
  }

  const res = await fetch(parsed.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ar-SA,ar;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });

  const body = await res.text();

  const jsonLd = [...body.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
  )].map((m) => m[1].trim().slice(0, 1200));

  const nextData = body.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );

  const apiRefs = [...new Set(
    [...body.matchAll(/["'`](\/(?:api|graphql|_next\/data)\/[^"'`\s]{3,120})["'`]/g)].map((m) => m[1])
  )].slice(0, 40);

  const absApi = [...new Set(
    [...body.matchAll(/https?:\/\/[a-z0-9.-]+\/(?:api|graphql)\/[^"'`\s<>]{3,120}/gi)].map((m) => m[0])
  )].slice(0, 25);

  const priceHits = (body.match(/\d+[.,]\d{2}\s*(?:ر\.?س|SAR|SR)|(?:ر\.?س|SAR|SR)\s*\d+/gi) || []).slice(0, 25);

  const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || null;

  const isBotChallenge =
    res.status === 429 ||
    res.status === 403 ||
    /security checkpoint|just a moment|checking your browser|attention required|cf-browser-verification/i.test(
      (title || "") + body.slice(0, 3000)
    );

  const imgSrcs = [...new Set(
    [...body.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']{6,300})["']/gi)].map((m) => m[1])
  )];
  const ogImages = [...new Set(
    [...body.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)].map((m) => m[1])
  )];
  const bigImages = imgSrcs
    .filter((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u) && !/logo|icon|sprite|avatar|flag/i.test(u))
    .slice(0, 30);

  return NextResponse.json({
    finalUrl: res.url,
    status: res.status,
    title,
    isBotChallenge,
    contentType: res.headers.get("content-type"),
    htmlLength: body.length,
    jsonLdCount: jsonLd.length,
    jsonLdSamples: jsonLd.slice(0, 3),
    hasNextData: !!nextData,
    nextDataSample: nextData ? nextData[1].slice(0, 2500) : null,
    apiRefs,
    absApi,
    priceHitsFound: priceHits.length,
    priceHits,
    imageCount: imgSrcs.length,
    ogImages,
    bigImages,
    headSample: body.slice(0, 400),
  });
}
