// Injected into every webpage
document.addEventListener("input", function (e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    let value = e.target.value;
    let matches = detectSensitive(value);
    if (matches.length > 0) {
      console.warn("Blocked sensitive data:", matches, value);
      e.target.value = ""; // Clear
      e.target.style.border = "2px solid red";

      chrome.runtime.sendMessage({
        type: "sensitive_detected",
        matches: matches,
        snippet: value.substring(0, 50),
        url: window.location.href
      });
    }
  }
});

// Block form submissions with sensitive data
document.addEventListener("submit", function (e) {
  let inputs = e.target.querySelectorAll("input, textarea");
  for (let input of inputs) {
    let matches = detectSensitive(input.value);
    if (matches.length > 0) {
      alert("?? Sensitive data blocked (" + matches.join(", ") + ")");
      e.preventDefault();
      chrome.runtime.sendMessage({
        type: "form_blocked",
        matches: matches,
        snippet: input.value.substring(0, 50),
        url: window.location.href
      });
      break;
    }
  }
});
