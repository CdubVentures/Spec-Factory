"""Python-side tests for the crawl4ai sidecar.

These only run when Python + pytest are available locally. CI should run
them conditionally; Node tests cover the client side with a subprocess stub.
"""

from __future__ import annotations

from pipeline_extraction_sidecar.extract import extract_from_html


def test_empty_html_returns_ok_with_zero_metrics() -> None:
    result = extract_from_html(url="", html="", features=["markdown", "tables", "lists"])
    assert result["markdown"] == ""
    assert result["tables"] == []
    assert result["lists"] == []
    assert result["metrics"]["word_count"] == 0
    assert result["metrics"]["table_count"] == 0


def test_two_column_spec_table_yields_one_table_with_two_rows() -> None:
    html = """
    <html><body>
      <h2>Specs</h2>
      <table>
        <tr><th>Weight</th><td>54g</td></tr>
        <tr><th>DPI</th><td>30000</td></tr>
      </table>
    </body></html>
    """
    result = extract_from_html(url="https://x", html=html, features=["tables"])
    assert result["metrics"]["table_count"] == 1
    assert len(result["tables"]) == 1
    assert len(result["tables"][0]["rows"]) == 2
    assert result["tables"][0]["rows"][0] == {"key": "Weight", "value": "54g"}


def test_single_cell_table_is_skipped() -> None:
    # Tables with no key/value structure are not spec tables — skip them.
    html = "<html><body><table><tr><td>a</td></tr></table></body></html>"
    result = extract_from_html(url="https://x", html=html, features=["tables"])
    assert result["metrics"]["table_count"] == 0


def test_features_gate_output_fields() -> None:
    html = "<html><body>hello world</body></html>"
    result = extract_from_html(url="https://x", html=html, features=["lists"])
    assert result["markdown"] == ""


def test_markdown_feature_populates_word_count() -> None:
    html = "<html><body><p>hello world there</p></body></html>"
    result = extract_from_html(url="https://x", html=html, features=["markdown"])
    assert result["metrics"]["word_count"] > 0
    assert "hello world" in result["markdown"]


def test_json_ld_product_schema_is_extracted() -> None:
    html = """
    <html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"M75 Wireless","sku":"CH-931D010-NA","brand":{"@type":"Brand","name":"Corsair"},"offers":{"@type":"Offer","price":"69.99","priceCurrency":"USD","availability":"https://schema.org/InStock"}}
      </script>
    </head><body><p>ignored</p></body></html>
    """
    result = extract_from_html(url="https://x", html=html, features=["markdown"])
    assert result["metrics"]["json_ld_count"] == 1
    assert result["metrics"]["has_product_jsonld"] is True
    product = result["json_ld"][0]
    assert product["sku"] == "CH-931D010-NA"
    assert product["brand"]["name"] == "Corsair"
    assert product["offers"]["price"] == "69.99"


def test_json_ld_graph_is_unwrapped() -> None:
    html = """
    <html><head>
      <script type="application/ld+json">
      {"@graph":[{"@type":"BreadcrumbList"},{"@type":"Product","name":"X"}]}
      </script>
    </head></html>
    """
    result = extract_from_html(url="https://x", html=html, features=[])
    assert result["metrics"]["json_ld_count"] == 2
    types = sorted(e.get("@type", "") for e in result["json_ld"])
    assert types == ["BreadcrumbList", "Product"]


def test_opengraph_extraction() -> None:
    html = """
    <html><head>
      <meta property="og:title" content="Razer Viper V3 Pro">
      <meta property="og:image" content="https://x/img.jpg">
      <meta name="twitter:card" content="summary_large_image">
      <link rel="canonical" href="https://x/canonical">
    </head></html>
    """
    result = extract_from_html(url="https://x", html=html, features=[])
    og = result["opengraph"]
    assert og.get("og:title") == "Razer Viper V3 Pro"
    assert og.get("og:image") == "https://x/img.jpg"
    assert og.get("twitter:card") == "summary_large_image"
    assert og.get("canonical") == "https://x/canonical"


def test_definition_list_becomes_spec_table() -> None:
    html = """
    <html><body>
      <h2>Specs</h2>
      <dl>
        <dt>Weight</dt><dd>54 grams</dd>
        <dt>DPI</dt><dd>30000</dd>
      </dl>
    </body></html>
    """
    result = extract_from_html(url="https://x", html=html, features=["tables"])
    # definition list merges into tables[] with the same row shape
    dl_tables = [t for t in result["tables"] if len(t["rows"]) == 2]
    assert dl_tables, "dl/dt/dd should produce a table entry"
    keys = {r["key"] for r in dl_tables[0]["rows"]}
    assert keys == {"Weight", "DPI"}


def test_malformed_json_ld_is_skipped_gracefully() -> None:
    html = """
    <html><head>
      <script type="application/ld+json">{not valid json</script>
      <script type="application/ld+json">{"@type":"Product","name":"OK"}</script>
    </head></html>
    """
    result = extract_from_html(url="https://x", html=html, features=[])
    # Only the valid one is extracted; the invalid one is dropped silently.
    assert result["metrics"]["json_ld_count"] == 1
    assert result["json_ld"][0]["name"] == "OK"


def test_boilerplate_stripping_removes_nav_and_footer() -> None:
    html = """
    <html><body>
      <nav>menu items</nav>
      <main><p>real content</p></main>
      <footer>copyright</footer>
    </body></html>
    """
    result = extract_from_html(url="https://x", html=html, features=["markdown"])
    assert "real content" in result["markdown"]
    assert "menu items" not in result["markdown"]
    assert "copyright" not in result["markdown"]
