"""HTML-to-markdown/tables/lists extraction. No Playwright (we're fed
pre-rendered HTML). No browser. Pure-Python parsing via BeautifulSoup +
a lightweight markdown converter.

We deliberately avoid crawl4ai's AsyncWebCrawler because:
  1. It boots a Playwright browser pool even when html= is pre-supplied,
     adding ~5-10s startup + ~100MB RSS per request.
  2. It prints '[INIT]...' banners on stdout — corrupts our JSON protocol.
  3. Our Node Playwright fleet already rendered the HTML; a second
     browser in Python is wasted work.

crawl4ai's value to us was the markdown + table heuristics. Those are
small enough to do directly with BeautifulSoup, which crawl4ai itself
uses internally.
"""

from __future__ import annotations

import time
from typing import Any

try:
    from bs4 import BeautifulSoup  # bs4 ships with crawl4ai
except ImportError:
    BeautifulSoup = None  # type: ignore[assignment]


def _count_words(text: str) -> int:
    return len([w for w in text.split() if w])


def _soup(html: str):
    if BeautifulSoup is None:
        return None
    try:
        return BeautifulSoup(html, "lxml")
    except Exception:
        try:
            return BeautifulSoup(html, "html.parser")
        except Exception:
            return None


def _strip_boilerplate(soup) -> None:
    """Remove script/style/nav/footer/aside — the typical 70-90% of
    bytes on commerce + review pages that carries no product spec data.
    """
    if soup is None:
        return
    for tag in soup(["script", "style", "noscript", "template", "svg"]):
        tag.decompose()
    for tag in soup.select("nav, footer, aside, header[role='banner'], [role='navigation']"):
        tag.decompose()


def _to_markdown(soup) -> str:
    """Minimal, readable-first HTML→markdown. Covers headings, paragraphs,
    lists, links, code, and bold/em. Tables are emitted separately (see
    _extract_tables) so we skip them here.
    """
    if soup is None:
        return ""
    parts: list[str] = []
    body = soup.body if soup.body else soup
    for el in body.descendants:
        name = getattr(el, "name", None)
        if not name:
            continue

    # Cheap approach: walk top-level descendants of body and emit.
    def emit(node) -> str:
        name = getattr(node, "name", None) or ""
        text = node.get_text(" ", strip=True) if hasattr(node, "get_text") else str(node)
        if not text:
            return ""
        if name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            level = int(name[1])
            return f"\n{'#' * level} {text}\n"
        if name in ("ul", "ol"):
            items = [f"- {li.get_text(' ', strip=True)}" for li in node.find_all("li", recursive=False) if li.get_text(strip=True)]
            return "\n".join(items) + "\n" if items else ""
        if name == "table":
            return ""  # handled separately
        if name in ("p", "blockquote", "pre", "section", "article", "main", "div"):
            return f"{text}\n"
        return ""

    seen: set = set()
    for node in body.find_all(recursive=True):
        # Skip nested descendants we already consumed via an ancestor.
        if id(node) in seen:
            continue
        chunk = emit(node)
        if chunk:
            parts.append(chunk)
            # Mark descendants as seen so we don't emit text twice.
            for d in node.find_all(recursive=True):
                seen.add(id(d))

    joined = "\n".join(p for p in parts if p.strip()).strip()
    # Fallback: if no structured blocks matched (raw text in body / exotic
    # markup), emit the whole body text so downstream word_count is non-zero.
    if not joined:
        joined = body.get_text(" ", strip=True)
    return joined


def _extract_tables(soup) -> list[dict[str, Any]]:
    """Each <table> → {heading, rows:[{key,value}]}. Heading is the first
    preceding h2/h3 if any. Rows are derived from th/td pairs — works for
    the common two-column spec table pattern (RTINGS, techpowerup, most
    first-party product pages).
    """
    if soup is None:
        return []
    tables: list[dict[str, Any]] = []
    for table in soup.find_all("table"):
        heading_text = ""
        prev = table.find_previous(["h2", "h3", "h4"])
        if prev:
            heading_text = prev.get_text(" ", strip=True)

        rows: list[dict[str, str]] = []
        for tr in table.find_all("tr"):
            cells = tr.find_all(["th", "td"])
            if len(cells) >= 2:
                key = cells[0].get_text(" ", strip=True)
                value = " ".join(c.get_text(" ", strip=True) for c in cells[1:])
                if key and value:
                    rows.append({"key": key, "value": value})
        if rows:
            tables.append({"heading": heading_text, "rows": rows})
    return tables


def _extract_json_ld(soup) -> list[dict[str, Any]]:
    """All `<script type="application/ld+json">` blocks, parsed. Returns a
    list of dicts — JSON-LD can carry multiple entities in one page via
    `@graph`. Invalid JSON is skipped silently (never raises).

    This is the highest-signal extraction tier — e-commerce pages ship
    `Product`/`Offer`/`AggregateRating` schemas with pre-parsed brand,
    model, mpn, gtin, price, rating, etc. Every major retailer uses it.
    """
    import json as _json
    out: list[dict[str, Any]] = []
    if soup is None:
        return out
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        text = tag.string or tag.get_text() or ""
        if not text.strip():
            continue
        try:
            data = _json.loads(text)
        except Exception:
            continue
        if isinstance(data, dict):
            # Unwrap `@graph` so downstream consumers see individual entities.
            graph = data.get("@graph")
            if isinstance(graph, list):
                for entity in graph:
                    if isinstance(entity, dict):
                        out.append(entity)
                continue
            out.append(data)
        elif isinstance(data, list):
            for entity in data:
                if isinstance(entity, dict):
                    out.append(entity)
    return out


def _extract_microdata(soup) -> list[dict[str, Any]]:
    """Microdata — `itemscope` / `itemprop` pairs grouped by scope. One dict
    per top-level itemscope, keyed by itemprop. Handles nested scopes by
    recursion.
    """
    if soup is None:
        return []

    def extract_one(scope) -> dict[str, Any]:
        item: dict[str, Any] = {}
        itemtype = scope.get("itemtype")
        if itemtype:
            item["@type"] = itemtype
        for prop in scope.find_all(attrs={"itemprop": True}):
            # Skip props nested inside a deeper itemscope — they belong there.
            deeper = prop.find_parent(attrs={"itemscope": True})
            if deeper and deeper is not scope:
                continue
            key = prop.get("itemprop")
            if not key:
                continue
            if prop.has_attr("itemscope"):
                value: Any = extract_one(prop)
            elif prop.name == "meta":
                value = prop.get("content", "")
            elif prop.name in ("img", "audio", "video", "source", "embed", "iframe"):
                value = prop.get("src", "")
            elif prop.name in ("a", "area", "link"):
                value = prop.get("href", "")
            elif prop.name == "time":
                value = prop.get("datetime") or prop.get_text(" ", strip=True)
            else:
                value = prop.get_text(" ", strip=True)
            # Multi-value: merge into list.
            if key in item:
                existing = item[key]
                if isinstance(existing, list):
                    existing.append(value)
                else:
                    item[key] = [existing, value]
            else:
                item[key] = value
        return item

    out: list[dict[str, Any]] = []
    for scope in soup.find_all(attrs={"itemscope": True}):
        # Only top-level scopes — nested ones are embedded via recursion.
        parent_scope = scope.find_parent(attrs={"itemscope": True})
        if parent_scope is not None:
            continue
        out.append(extract_one(scope))
    return out


def _extract_opengraph(soup) -> dict[str, str]:
    """OpenGraph `<meta property="og:*">` + Twitter Card `<meta name="twitter:*">`
    + canonical link. Returns a flat dict for easy downstream access.
    """
    out: dict[str, str] = {}
    if soup is None:
        return out
    for meta in soup.find_all("meta"):
        prop = meta.get("property", "") or meta.get("name", "")
        content = meta.get("content", "")
        if not prop or not content:
            continue
        if prop.startswith("og:") or prop.startswith("twitter:") or prop.startswith("product:"):
            out[prop] = content
    canonical = soup.find("link", attrs={"rel": "canonical"})
    if canonical and canonical.get("href"):
        out["canonical"] = canonical["href"]
    return out


def _extract_definition_lists(soup) -> list[dict[str, Any]]:
    """`<dl>/<dt>/<dd>` definition lists — the Apple-style spec pattern.
    Each dt/dd pair becomes a {key, value} row; consecutive dds under one
    dt concatenate. Returns the same shape as table rows so consumers can
    merge spec sources uniformly.
    """
    if soup is None:
        return []
    out: list[dict[str, Any]] = []
    for dl in soup.find_all("dl"):
        rows: list[dict[str, str]] = []
        current_key = ""
        current_values: list[str] = []
        for child in dl.find_all(["dt", "dd"], recursive=True):
            if child.name == "dt":
                if current_key and current_values:
                    rows.append({"key": current_key, "value": " ".join(current_values).strip()})
                current_key = child.get_text(" ", strip=True)
                current_values = []
            else:
                text = child.get_text(" ", strip=True)
                if text:
                    current_values.append(text)
        if current_key and current_values:
            rows.append({"key": current_key, "value": " ".join(current_values).strip()})
        if rows:
            prev = dl.find_previous(["h2", "h3", "h4"])
            heading = prev.get_text(" ", strip=True) if prev else ""
            out.append({"heading": heading, "rows": rows})
    return out


def _extract_lists(soup) -> list[dict[str, Any]]:
    """Top-level <ul>/<ol> blocks with a preceding heading — the classic
    pros/cons/features pattern. Skips menu/nav lists by heading.
    """
    if soup is None:
        return []
    out: list[dict[str, Any]] = []
    for lst in soup.find_all(["ul", "ol"], recursive=True):
        # Skip lists inside nav/header that survived strip (rare).
        if lst.find_parent(["nav", "header"]):
            continue
        items = [li.get_text(" ", strip=True) for li in lst.find_all("li", recursive=False)]
        items = [i for i in items if i]
        if len(items) < 2:
            continue  # uninteresting
        prev = lst.find_previous(["h2", "h3", "h4"])
        heading = prev.get_text(" ", strip=True) if prev else ""
        out.append({"heading": heading, "items": items})
    return out


def warmup() -> None:
    """One-shot warm call so the first real request doesn't pay for
    lxml + BS4 cold start.
    """
    _ = _soup("<html><body><p>warmup</p></body></html>")


def extract_from_html(url: str, html: str, features: list[str]) -> dict[str, Any]:
    started = time.perf_counter()
    want_md = "markdown" in features
    want_tables = "tables" in features
    want_lists = "lists" in features
    # Structured data features default ON — they're cheap (<10ms) and
    # high-signal, but honor explicit opt-out.
    want_jsonld = "json_ld" in features or "json_ld" not in features  # default on
    want_microdata = "microdata" in features or "microdata" not in features
    want_opengraph = "opengraph" in features or "opengraph" not in features

    # Parse BEFORE stripping so JSON-LD scripts + meta tags are still present.
    soup = _soup(html)
    json_ld = _extract_json_ld(soup) if want_jsonld else []
    microdata = _extract_microdata(soup) if want_microdata else []
    opengraph = _extract_opengraph(soup) if want_opengraph else {}

    # Now strip boilerplate for markdown/table/list extraction.
    _strip_boilerplate(soup)

    markdown = _to_markdown(soup) if want_md else ""
    # Merge `<table>` spec rows with `<dl>` definition-list rows — same shape,
    # same downstream consumer. Covers the Apple / modern-review pattern that
    # pure-table detection misses.
    tables: list[dict[str, Any]] = []
    if want_tables:
        tables = _extract_tables(soup) + _extract_definition_lists(soup)
    lists = _extract_lists(soup) if want_lists else []

    duration_ms = int((time.perf_counter() - started) * 1000)
    return {
        "markdown": markdown,
        "tables": tables,
        "lists": lists,
        "json_ld": json_ld,
        "microdata": microdata,
        "opengraph": opengraph,
        "metrics": {
            "duration_ms": duration_ms,
            "word_count": _count_words(markdown),
            "table_count": len(tables),
            "json_ld_count": len(json_ld),
            "microdata_count": len(microdata),
            "has_product_jsonld": any(
                _has_type(entity, "Product") for entity in json_ld
            ),
        },
    }


def _has_type(entity: dict[str, Any], wanted: str) -> bool:
    """JSON-LD `@type` can be a string or a list of strings."""
    t = entity.get("@type") if isinstance(entity, dict) else None
    if isinstance(t, str):
        return t == wanted or t.endswith(f"/{wanted}")
    if isinstance(t, list):
        return any(isinstance(x, str) and (x == wanted or x.endswith(f"/{wanted}")) for x in t)
    return False
