// Simple regex detectors
const RULES = {
  credit_card: /\b(?:\d[ -]*?){13,16}\b/g,
  pan: /[A-Z]{5}[0-9]{4}[A-Z]{1}/g,
  email: /[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+/g,
  secret: /(api[_-]?key|password|secret|token)/gi
};

function detectSensitive(text) {
  let matches = [];
  for (let [name, regex] of Object.entries(RULES)) {
    if (regex.test(text)) {
      matches.push(name);
    }
  }
  return matches;
}
