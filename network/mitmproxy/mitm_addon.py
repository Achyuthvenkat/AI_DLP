from mitmproxy import http, ctx
import re, requests

AI_DOMAINS_DEFAULT = [
    "openai.com","chatgpt.com","api.openai.com",
    "claude.ai","poe.com","perplexity.ai",
    "bard.google.com","gemini.google.com",
    "copilot.microsoft.com","bing.com","huggingface.co"
]

def load(l):
    l.add_option("block", bool, True, "Block when sensitive detected")
    l.add_option("server", str, "http://127.0.0.1:8000", "DLP server base URL")
    l.add_option("jwt", str, "", "JWT for server")
    l.add_option("device_id", str, "proxy-001", "Device ID label")
    l.add_option("domains", str, ",".join(AI_DOMAINS_DEFAULT), "Comma-separated target domains")

def detect_simple(body: str):
    hits = {}
    if re.search(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", body): hits['pan']=1
    if re.search(r"\b\d{12}\b", body): hits['aadhaar']=1
    if re.search(r"\b(?:\d[ -]*?){13,19}\b", body):
        digits = re.findall(r"(?:\d[ -]*?){13,19}", body)
        def luhn(s):
            s = re.sub(r"\D","", s)
            if len(s)<13: return False
            tot, alt = 0, False
            for d in s[::-1]:
                n=ord(d)-48
                if alt: n=n*2 - (9 if n*2>9 else 0)
                tot += n; alt = not alt
            return tot%10==0
        if any(luhn(d) for d in digits): hits['credit_card']=1
    if "AKIA" in body or "PRIVATE KEY" in body or "BEGIN RSA" in body: hits['secrets_entropy']=1
    return hits

def send_event(server, jwt, device_id, event_type, target, snippet, hits):
    try:
        requests.post(server + "/api/events",
            headers={"Authorization": "Bearer "+jwt,"Content-Type":"application/json"},
            json={"device_id": device_id, "event_type": event_type, "target": target,
                  "snippet": (snippet or "")[:800], "detector_hits": hits}, timeout=5)
    except Exception as e:
        ctx.log.warn(f"DLP event send failed: {e}")

class DlpBlocker:
    def __init__(self):
        self.domains = []
    def configure(self, updates):
        self.domains = [d.strip() for d in ctx.options.domains.split(",") if d.strip()]
    def request(self, flow: http.HTTPFlow):
        host = (flow.request.host or "").lower()
        if not any(d in host for d in self.domains):
            return
        body = flow.request.get_text() or ""
        hits = detect_simple(body)
        if hits:
            send_event(ctx.options.server, ctx.options.jwt, ctx.options.device_id, "BLOCKED_PROXY", host, body[:300], hits)
            if ctx.options.block:
                flow.response = http.Response.make(403, b"DLP: sensitive content blocked", {"Content-Type":"text/plain"})

addons = [DlpBlocker()]
