# Crawl4AI Extraction Sidecar

Python subprocess spawned by the Node runtime (one per IndexLab run) to
extract clean markdown, spec tables, and lists from pre-rendered HTML.

## Install

```
pip install -r pipeline-extraction-sidecar/pipeline_extraction_sidecar/requirements.txt
```

We intentionally do NOT run `playwright install` — crawl4ai is fed
pre-rendered HTML from the existing Node Playwright fleet via
`arun(url=None, html=<raw>)`. Keeps the install ~50MB instead of ~400MB.

## Protocol

Line-delimited JSON over stdin/stdout.

Request (Node → Python):
```
{"id":"req-42","url":"https://example.com","html":"<html>…</html>","features":["markdown","tables","lists"]}
```

Response (Python → Node):
```
{"id":"req-42","ok":true,"markdown":"…","tables":[…],"lists":[…],"metrics":{"duration_ms":240,"word_count":3412,"table_count":3}}
```

Error:
```
{"id":"req-42","ok":false,"error":"TypeError: …"}
```

## Security

The sidecar receives ONLY `{id, url, html, features}`. The Node client
strips any other keys before send. No env vars, no secrets, no tokens.

## Fallback

If crawl4ai import fails or raises, the sidecar returns a minimal envelope
(raw HTML as markdown, naive table-tag scan, empty lists) so the pipeline
continues. Node logs the error; the Node plugin's plugin_status flips
to `failed` with the exception name as reason.
