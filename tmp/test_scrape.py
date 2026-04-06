"""
Diagnostic: Test exactly what Instagram returns for a username scrape.
Run this directly in PowerShell.
"""
import asyncio
import httpx
import re
import json
import sys

USERNAME = "luxurywatchmedia"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "X-IG-App-ID": "936619743392459",
}

async def test():
    results = []
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=15.0) as client:
        url = f"https://www.instagram.com/{USERNAME}/"
        results.append(f"Fetching: {url}")
        res = await client.get(url)
        html = res.text
        results.append(f"Status={res.status_code} Size={len(html)}")

        title_match = re.search(r'<title>(.*?)</title>', html)
        results.append(f"Title={title_match.group(1) if title_match else 'NOT_FOUND'}")

        og_desc = re.search(r'<meta property="og:description" content="([^"]*)"', html, re.I)
        results.append(f"OGDesc={og_desc.group(1)[:150] if og_desc else 'NOT_FOUND'}")

        fn_match = re.search(r'"full_name":"([^"]+)"', html)
        bio_match = re.search(r'"biography":"([^"]*)"', html)
        results.append(f"FullName={fn_match.group(1) if fn_match else 'NOT_FOUND'}")
        results.append(f"Bio={bio_match.group(1)[:100] if bio_match else 'NOT_FOUND'}")

        ld_match = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
        if ld_match:
            try:
                ld = json.loads(ld_match.group(1))
                results.append(f"JSONLD_type={ld.get('@type')}")
                entity = ld.get('mainEntity', ld)
                results.append(f"JSONLD_name={entity.get('name')}")
            except Exception as e:
                results.append(f"JSONLD_parse_error={e}")
        else:
            results.append("JSONLD=NOT_FOUND")

    print("=== DIAGNOSTIC RESULTS ===")
    for r in results:
        print(r)
    print("=== END ===")

if __name__ == "__main__":
    asyncio.run(test())
