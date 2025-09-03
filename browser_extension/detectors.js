// Enhanced detectors for TITAN Company Limited with comprehensive pattern matching
console.log('🔍 TITAN DLP Detectors loaded');

// =============================================================================
// REGEX PATTERNS FOR SENSITIVE DATA DETECTION
// =============================================================================

// Indian Identity Documents
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
const AADHAAR_12 = /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g;
const AADHAAR_STRICT = /\b\d{12}\b/g;

// Financial Data
const CC_CANDIDATE = /\b(?:\d[ -]*?){13,19}\b/g;
const IFSC_CODE = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
const BANK_ACCOUNT = /\b\d{9,18}\b/g;

// Contact Information
const INDIAN_MOBILE = /\b[6-9]\d{9}\b/g;

// API Keys and Secrets (Enhanced)
const OPENAI_API_KEY = /\bsk-[A-Za-z0-9]{48,}\b/g;
const GEMINI_API_KEY = /\bAIzaSy[A-Za-z0-9_-]{33}\b/g;
const DEEPSEEK_API_KEY = /\bds-[A-Za-z0-9]{32,}\b/g;
const GENERIC_API_KEY = /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|bearer[_-]?token)[\s=:]+[A-Za-z0-9+/=_-]{20,}\b/gi;
const JWT_TOKEN = /\beyJ[A-Za-z0-9+/=_-]+\.[A-Za-z0-9+/=_-]+\.[A-Za-z0-9+/=_-]+\b/g;
const PASSWORD_PATTERN = /\b(?:password|passwd|pwd)[\s=:]+[^\s]{6,}\b/gi;

// Database and Server Credentials
const DATABASE_URL = /\b(?:mongodb|mysql|postgresql|redis):\/\/[^\s]+\b/gi;
const CONNECTION_STRING = /\b(?:server|host|database|user|password)[\s=:]+[^\s;]+/gi;

// =============================================================================
// TITAN COMPANY LIMITED SPECIFIC PATTERNS
// =============================================================================

// TITAN Business Divisions
const TITAN_DIVISIONS = [
  'WATCHES DIVISION', 'JEWELLERY DIVISION', 'EYEWEAR DIVISION',
  'ACCESSORIES DIVISION', 'PRECISION ENGINEERING DIVISION',
  'FRAGRANCES DIVISION', 'EMERGING BUSINESSES'
];

// TITAN Project Code Names (Common patterns)
const TITAN_PROJECT_CODES = [
  /\bProject[\s\-]?[A-Z][a-z]+\b/gi,  // Project Orion, Project Phoenix, etc.
  /\b[A-Z]{2,4}[\-]?\d{2,4}\b/g,      // TT-2024, WD-001, JD-2025, etc.
  /\bTITAN[\-]?[A-Z]{2,3}[\-]?\d{2,4}\b/gi, // TITAN-WD-2024, TITAN-JD-001
  /\b(?:Alpha|Beta|Gamma|Delta|Sigma|Omega)[\s\-]?\d{1,3}\b/gi
];

// TITAN Financial Keywords
const TITAN_FINANCIAL_TERMS = [
  'QUARTERLY RESULTS', 'ANNUAL REPORT', 'BOARD MEETING',
  'INVESTOR PRESENTATION', 'FINANCIAL PERFORMANCE',
  'SALES FIGURES', 'PROFIT MARGINS', 'REVENUE TARGETS',
  'MARKET SHARE', 'EXPANSION PLANS', 'CAPEX', 'BUDGET ALLOCATION'
];

// TITAN R&D and Manufacturing
const TITAN_RND_TERMS = [
  'R&D BLUEPRINT', 'MANUFACTURING PROCESS', 'QUALITY CONTROL',
  'PRODUCTION CAPACITY', 'SUPPLY CHAIN', 'VENDOR DETAILS',
  'COST ANALYSIS', 'MATERIAL SOURCING', 'PRODUCT DESIGN',
  'TECHNICAL SPECIFICATIONS', 'PROTOTYPE', 'PATENT APPLICATION'
];

// TITAN HR and Employee Data
const TITAN_HR_TERMS = [
  'EMPLOYEE ID', 'SALARY STRUCTURE', 'APPRAISAL RATING',
  'PERFORMANCE REVIEW', 'ORGANIZATION CHART', 'HEADCOUNT',
  'RECRUITMENT PLAN', 'TRAINING PROGRAM', 'EMPLOYEE DATABASE',
  'HR POLICY', 'COMPENSATION', 'BENEFITS PACKAGE'
];


// General Confidential Keywords (Enhanced)
const CONFIDENTIAL_KEYWORDS = [
  'CONFIDENTIAL', 'CLASSIFIED', 'RESTRICTED', 'PROPRIETARY',
  'INTERNAL ONLY', 'NOT FOR DISTRIBUTION', 'PRIVILEGED',
  'TRADE SECRET', 'SENSITIVE', 'PRIVATE', 'INTERNAL USE ONLY',
  'STRICTLY CONFIDENTIAL', 'TOP SECRET', 'BUSINESS SENSITIVE',
  'COMMERCIALLY SENSITIVE', 'FOR INTERNAL USE', 'CONFIDENTIAL INFORMATION'
];

// Document Classification Keywords
const CLASSIFICATION_KEYWORDS = [
  'CONFIDENTIAL DOCUMENT', 'INTERNAL DOCUMENT', 'RESTRICTED ACCESS',
  'AUTHORIZED PERSONNEL ONLY', 'MANAGEMENT CONFIDENTIAL',
  'BOARD CONFIDENTIAL', 'EXECUTIVE SUMMARY', 'STRATEGIC DOCUMENT'
];

// =============================================================================
// VALIDATION ALGORITHMS
// =============================================================================

// Verhoeff algorithm tables for Aadhaar validation
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
  const s = String(num).replace(/\D/g, '');
  if (!/^[0-9]{12}$/.test(s)) return false;
  let c = 0;
  const arr = s.split('').reverse();
  for (let i = 0; i < arr.length; i++) {
    c = _d[c][_p[i % 8][parseInt(arr[i], 10)]];
  }
  return c === 0;
}

function luhnOk(str) {
  const digits = str.replace(/\D/g, '').split('').map(Number);
  if (digits.length < 13 || digits.length > 19) return false;
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

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

function detectIdentityDocuments(text) {
  const matches = [];
  
  // PAN Card Detection
  const panMatches = text.match(PAN_REGEX) || [];
  if (panMatches.length > 0) {
    matches.push('PAN_CARD');
  }
  
  // Aadhaar Detection with Verhoeff validation
  const aadhaarMatches = text.match(AADHAAR_12) || [];
  for (const aadhaar of aadhaarMatches) {
    const cleanAadhaar = aadhaar.replace(/\D/g, '');
    if (cleanAadhaar.length === 12 && verhoeffOk(cleanAadhaar)) {
      matches.push('AADHAAR_NUMBER');
      break;
    }
  }
  
  return matches;
}

function detectFinancialData(text) {
  const matches = [];
  
  // Credit Card Detection with Luhn validation
  const ccMatches = text.match(CC_CANDIDATE) || [];
  for (const cc of ccMatches) {
    if (luhnOk(cc)) {
      matches.push('CREDIT_CARD');
      break;
    }
  }
  
  // IFSC Code Detection
  if (IFSC_CODE.test(text)) {
    matches.push('IFSC_CODE');
  }
  
  // Bank Account Numbers (basic detection)
  const bankMatches = text.match(BANK_ACCOUNT) || [];
  if (bankMatches.length > 0) {
    // Additional validation - not just phone numbers
    for (const account of bankMatches) {
      if (!INDIAN_MOBILE.test(account) && account.length >= 9) {
        matches.push('BANK_ACCOUNT');
        break;
      }
    }
  }
  
  return matches;
}

function detectAPIKeysAndSecrets(text) {
  const matches = [];
  
  // OpenAI API Keys
  if (OPENAI_API_KEY.test(text)) {
    matches.push('OPENAI_API_KEY');
  }
  
  // Gemini API Keys
  if (GEMINI_API_KEY.test(text)) {
    matches.push('GEMINI_API_KEY');
  }
  
  // DeepSeek API Keys
  if (DEEPSEEK_API_KEY.test(text)) {
    matches.push('DEEPSEEK_API_KEY');
  }
  
  // Generic API Keys
  if (GENERIC_API_KEY.test(text)) {
    matches.push('API_KEY');
  }
  
  // JWT Tokens
  if (JWT_TOKEN.test(text)) {
    matches.push('JWT_TOKEN');
  }
  
  // Passwords
  if (PASSWORD_PATTERN.test(text)) {
    matches.push('PASSWORD');
  }
  
  // Database URLs and Connection Strings
  if (DATABASE_URL.test(text) || CONNECTION_STRING.test(text)) {
    matches.push('DATABASE_CREDENTIALS');
  }
  
  return matches;
}

function detectTitanSpecificData(text) {
  const matches = [];
  const upperText = text.toUpperCase();
  
  // TITAN Business Divisions
  for (const division of TITAN_DIVISIONS) {
    if (upperText.includes(division)) {
      matches.push('TITAN_DIVISION_INFO');
      break;
    }
  }
  
  // TITAN Project Codes
  for (const projectPattern of TITAN_PROJECT_CODES) {
    if (projectPattern.test(text)) {
      matches.push('TITAN_PROJECT_CODE');
      break;
    }
  }
  
  // TITAN Financial Information
  for (const term of TITAN_FINANCIAL_TERMS) {
    if (upperText.includes(term)) {
      matches.push('TITAN_FINANCIAL_DATA');
      break;
    }
  }
  
  // TITAN R&D and Manufacturing
  for (const term of TITAN_RND_TERMS) {
    if (upperText.includes(term)) {
      matches.push('TITAN_RND_DATA');
      break;
    }
  }
  
  // TITAN HR Information
  for (const term of TITAN_HR_TERMS) {
    if (upperText.includes(term)) {
      matches.push('TITAN_HR_DATA');
      break;
    }
  }
  
  
  return matches;
}

function detectConfidentialKeywords(text) {
  const matches = [];
  const upperText = text.toUpperCase();
  
  // General Confidential Keywords
  for (const keyword of CONFIDENTIAL_KEYWORDS) {
    if (upperText.includes(keyword)) {
      matches.push('CONFIDENTIAL_KEYWORD');
      break;
    }
  }
  
  // Document Classification
  for (const keyword of CLASSIFICATION_KEYWORDS) {
    if (upperText.includes(keyword)) {
      matches.push('CLASSIFIED_DOCUMENT');
      break;
    }
  }
  
  return matches;
}

// =============================================================================
// MAIN DETECTION FUNCTION
// =============================================================================

function detectSensitive(text) {
  if (!text || typeof text !== 'string') return [];
  
  let matches = [];
  
  try {
    // Identity Documents Detection
    matches = matches.concat(detectIdentityDocuments(text));
    
    // Financial Data Detection
    matches = matches.concat(detectFinancialData(text));
    
    // API Keys and Secrets Detection
    matches = matches.concat(detectAPIKeysAndSecrets(text));
    
    // TITAN Specific Data Detection
    matches = matches.concat(detectTitanSpecificData(text));
    
    // Confidential Keywords Detection
    matches = matches.concat(detectConfidentialKeywords(text));
    
    // Remove duplicates and return
    return [...new Set(matches)];
    
  } catch (error) {
    console.error('Error in detectSensitive:', error);
    return [];
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function getSensitivityLevel(matches) {
  const highRisk = [
    'AADHAAR_NUMBER', 'PAN_CARD', 'CREDIT_CARD', 'BANK_ACCOUNT',
    'OPENAI_API_KEY', 'GEMINI_API_KEY', 'PASSWORD', 'JWT_TOKEN',
    'TITAN_FINANCIAL_DATA', 'TITAN_RND_DATA', 'DATABASE_CREDENTIALS'
  ];
  
  const mediumRisk = [
    'IFSC_CODE', 'API_KEY',
    'TITAN_PROJECT_CODE', 'TITAN_HR_DATA', 'CLASSIFIED_DOCUMENT'
  ];
  
  const lowRisk = [
    'CONFIDENTIAL_KEYWORD'
  ];
  
  for (const match of matches) {
    if (highRisk.includes(match)) return 'HIGH';
  }
  
  for (const match of matches) {
    if (mediumRisk.includes(match)) return 'MEDIUM';
  }
  
  for (const match of matches) {
    if (lowRisk.includes(match)) return 'LOW';
  }
  
  return 'NONE';
}

function getMatchDescription(match) {
  const descriptions = {
    'PAN_CARD': 'Indian PAN Card Number',
    'AADHAAR_NUMBER': 'Indian Aadhaar Number (Verified)',
    'CREDIT_CARD': 'Credit Card Number (Luhn Verified)',
    'BANK_ACCOUNT': 'Bank Account Number',
    'IFSC_CODE': 'Indian Bank IFSC Code',
    'OPENAI_API_KEY': 'OpenAI API Key',
    'GEMINI_API_KEY': 'Google Gemini API Key',
    'DEEPSEEK_API_KEY': 'DeepSeek API Key',
    'API_KEY': 'Generic API Key/Secret',
    'JWT_TOKEN': 'JSON Web Token',
    'PASSWORD': 'Password/Credential',
    'DATABASE_CREDENTIALS': 'Database Connection Details',
    'TITAN_DIVISION_INFO': 'TITAN Business Division Data',
    'TITAN_PROJECT_CODE': 'TITAN Project Code/Identifier',
    'TITAN_FINANCIAL_DATA': 'TITAN Financial Information',
    'TITAN_RND_DATA': 'TITAN R&D/Manufacturing Data',
    'TITAN_HR_DATA': 'TITAN HR/Employee Information',
    'CONFIDENTIAL_KEYWORD': 'Confidential Document Marker',
    'CLASSIFIED_DOCUMENT': 'Document Classification Marker'
  };
  
  return descriptions[match] || match;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectSensitive,
    getSensitivityLevel,
    getMatchDescription
  };
}

console.log('✅ TITAN DLP Detectors initialized with', Object.keys({
  'Identity Documents': 2,
  'Financial Data': 3,
  'Contact Information': 2,
  'API Keys & Secrets': 6,
  'TITAN Specific': 7,
  'Confidential Keywords': 2
}).length, 'detection categories');