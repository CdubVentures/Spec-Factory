"""Crawl4AI extraction sidecar — stdio JSON-RPC over subprocess stdio.

Spawned by the Node client (see src/features/extraction/plugins/crawl4ai/
crawl4aiClient.js). One subprocess per IndexLab run, one JSON request per
line of stdin, one JSON response per line of stdout.
"""

__all__ = ["__main__", "extract"]
