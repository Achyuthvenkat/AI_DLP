// Backend relay
const SERVER_URL = "http://127.0.0.1:5000/api/logs";

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "sensitive_detected" || msg.type === "form_blocked") {
    console.log("Reporting to server:", msg);

    fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: "BrowserUser",
        event: msg.type,
        matches: msg.matches,
        snippet: msg.snippet,
        url: msg.url,
        timestamp: Date.now()
      })
    }).catch(err => console.error("Report failed:", err));
  }
});
