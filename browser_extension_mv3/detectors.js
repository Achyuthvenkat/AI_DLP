// Enhanced detectors with proper validation
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
const AADHAAR_12 = /\b\d{12}\b/g;
const CC_CANDIDATE = /\b(?:\d[ -]*?){12,19}\b/g;

// Verhoeff algorithm tables
const _d = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,2,3,4,0,6,7,8,9,5],
  [2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],
  [7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0]
];
const _p = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,5,7,6,2,8,3,0,9,4],
  [5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],
  [7,0,4,6,9,1,3,2,5,8]
];

function verhoeffOk(num) {
  const s = String(num);
  if (!/^[0-9]+$/.test(s)) return false;
  let c = 0;
  const arr = s.split('').reverse();
  for (let i = 0; i < arr.length; i++) {
    c = _d[c][_p[i % 8][parseInt(arr[i], 10)]];
  }
  return c === 0;
}

function luhnOk(str) {
  const digits = str.replace(/\D/g, '').split('').map(Number);
  if (digits.length < 12) return false;
  let sum = 0;
  const parity = digits.length % 2;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    if (i % 2 === parity) {
      d = d * 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function containsConfKeyword(text) {
  if (!text) return false;
  const up = text.toUpperCase();
  return CONF_KEYWORDS.some(k => up.includes(k));
}

function detectSensitive(text) {
  if (!text) return [];
  let matches = [];
  
  // PAN detection
  if (PAN_REGEX.test(text)) {
    matches.push("PAN");
  }
  
  // Aadhaar detection with Verhoeff validation
  const aad = text.match(AADHAAR_12) || [];
  for (const a of aad) {
    if (verhoeffOk(a)) {
      matches.push("AADHAAR");
      break;
    }
  }
  
  // Credit card detection with Luhn validation
  const cc = text.match(CC_CANDIDATE) || [];
  for (const c of cc) {
    if (luhnOk(c)) {
      matches.push("CREDIT_CARD");
      break;
    }
  }
  
  
  // API keys and secrets
  if (/(api[_-]?key|password|secret|token)/gi.test(text)) {
    matches.push("API_KEY");
  }
  
  return matches;
}