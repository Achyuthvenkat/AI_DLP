# -*- coding: utf-8 -*-
import os, re, time, logging, requests, threading, json
from pathlib import Path
import win32clipboard
from openpyxl import load_workbook
from docx import Document
from PyPDF2 import PdfReader
from dotenv import load_dotenv
from openai import OpenAI
from pynput import keyboard

# ---------------- ENV & CONFIG ----------------
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SERVER_URL = os.getenv("SERVER_URL", "http://127.0.0.1:8000")
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

DEBUG_CONSOLE = True

# Exclude system/program folders
EXCLUDE_DIRS = [
    r"C:\Windows",
    r"C:\Program Files",
    r"C:\Program Files (x86)",
    r"C:\ProgramData",
    r"C:\$Recycle.Bin",
    r"C:\Recovery",
    r"C:\System Volume Information",
]

CONFIG = {
    "scan_dirs": [],  # populated with all drives
    "file_extensions": [
        ".txt",
        ".csv",
        ".xlsx",
        ".xls",
        ".docx",
        ".pdf",
        ".py",
        ".js",
        ".java",
        ".go",
        ".ts",
    ],
    "server_url": f"{SERVER_URL}/api/report",
    "sync_url": f"{SERVER_URL}/api/sync_files",
    "ai_classification": {"enabled": True, "model": "gpt-4o-mini"},  # lighter default
    "patterns": {
        "email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}",
        "credit_card": r"\b(?:\d[ -]*?){13,16}\b",
        "pan": r"[A-Z]{5}[0-9]{4}[A-Z]",
        "aadhaar": r"\b\d{4}\s\d{4}\s\d{4}\b",
        "financial": r"(revenue|profit|balance sheet|invoice|bank account)",
        "design_doc": r"(blueprint|design spec|architecture|CAD|drawing)",
        "api_key": r"(?:api|secret|token|key)[-_]?[\w]{16,50}",
        "password": r"(?i)password\s*[:=]\s*['\"]?.+['\"]?",
        "aws_secret": r"AKIA[0-9A-Z]{16}",
        "private_key": r"-----BEGIN (?:RSA|EC|DSA)? PRIVATE KEY-----",
    },
}

# Add all drives except excluded
for drive_letter in range(65, 91):
    drive = f"{chr(drive_letter)}:\\"
    if os.path.exists(drive):
        CONFIG["scan_dirs"].append(drive)

PATTERNS = {k: re.compile(v, re.IGNORECASE) for k, v in CONFIG["patterns"].items()}

# ---------------- LOGGING ----------------
logging.basicConfig(
    filename="agent.log",
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

# ---------------- GLOBAL STATS ----------------
stats = {"files_scanned": 0, "hits_detected": 0, "reports_sent": 0}

# ---------------- FILE TRACKING ----------------
existing_files_in_db = set()  # Files that exist in the database
scanned_files = {}  # Cache of files we've already scanned this session
findings_summary = []
findings_lock = threading.Lock()


# ---------------- UTILS ----------------
def should_exclude(path: str):
    path_l = path.lower()
    for ex in EXCLUDE_DIRS:
        if path_l.startswith(ex.lower()):
            return True
    return False


def debug_print(msg):
    if DEBUG_CONSOLE:
        print(msg)
    logging.info(msg)


def get_file_hash(filepath: Path):
    """Simple file hash based on size and modification time"""
    try:
        stat = filepath.stat()
        return f"{stat.st_size}_{int(stat.st_mtime)}"
    except:
        return None


# ---------------- JWT FETCH ----------------
def fetch_jwt_token():
    device_id = os.environ.get("COMPUTERNAME", "local_device")
    try:
        resp = requests.post(
            f"{SERVER_URL}/api/token", json={"device_id": device_id}, timeout=5
        )
        if resp.status_code == 200:
            response_data = resp.json()
            token = response_data.get("token")
            existing_files = response_data.get("existing_files", [])

            # Store existing files from database
            global existing_files_in_db
            existing_files_in_db = set(existing_files)

            if token:
                debug_print(
                    f"[JWT FETCHED] {token[:8]}... with {len(existing_files)} existing files"
                )
                return token
        debug_print(f"[JWT FETCH FAILED] {resp.status_code}: {resp.text}")
        return None
    except Exception as e:
        debug_print(f"[JWT FETCH ERROR] {e}")
        return None


def sync_file_states():
    """Sync current file state with server"""
    device_id = os.environ.get("COMPUTERNAME", "local_device")

    # Get all current files on device
    current_files = []
    for base_dir in CONFIG["scan_dirs"]:
        if should_exclude(base_dir):
            continue
        try:
            for file in Path(base_dir).rglob("*"):
                if (
                    file.is_file()
                    and file.suffix.lower() in CONFIG["file_extensions"]
                    and not should_exclude(str(file))
                ):
                    current_files.append(str(file))
        except Exception as e:
            logging.error(f"Error scanning {base_dir}: {e}")

    # Send to server for sync
    try:
        headers = {"Authorization": f"Bearer {JWT_TOKEN}"}
        resp = requests.post(
            CONFIG["sync_url"],
            json={"device_id": device_id, "current_files": current_files},
            headers=headers,
            timeout=10,
        )

        if resp.status_code == 200:
            result = resp.json()
            debug_print(
                f"[FILE SYNC] Deleted: {result['deleted_files_count']}, New files to scan: {len(result['new_files_to_scan'])}"
            )
            return result["new_files_to_scan"]
        else:
            debug_print(f"[FILE SYNC FAILED] {resp.status_code}: {resp.text}")
            return current_files  # Fallback to scan all files

    except Exception as e:
        debug_print(f"[FILE SYNC ERROR] {e}")
        return current_files  # Fallback to scan all files


JWT_TOKEN = fetch_jwt_token() or "secrettoken"


# ---------------- DETECTION ----------------
def detect_sensitive(text: str):
    hits = {}
    if not text:
        return hits
    for name, pattern in PATTERNS.items():
        found = pattern.findall(text)
        if found:
            hits[name] = found
    return hits


# ---------------- AI CLASSIFICATION ----------------


def ai_classify(text: str):
    if not CONFIG["ai_classification"]["enabled"] or not client:
        return {"label": "N/A", "confidence": 0.0}

    try:
        response = client.chat.completions.create(
            model=CONFIG["ai_classification"]["model"],
            messages=[
                {
                    "role": "user",
                    "content": (
                        "You are a Data Loss Prevention (DLP) classifier. Analyze the following text and classify it into one of these security categories.\n\n"
                        "CATEGORIES & CONFIDENCE RANGES:\n"
                        "• Public (0.0-0.25): Marketing content, public documentation, general information\n"
                        "• Internal (0.25-0.50): Company memos, internal procedures, non-sensitive business data\n"
                        "• Sensitive (0.50-0.75): Customer data, financial reports, employee information, project details\n"
                        "• Confidential (0.75-1.0): Trade secrets, legal documents, executive communications, security credentials\n\n"
                        "DETECTION INDICATORS:\n"
                        "High Confidence (0.8-1.0):\n"
                        "- API keys, passwords, tokens, private keys\n"
                        "- Social Security Numbers, credit card numbers, bank accounts\n"
                        "- Legal contracts, NDAs, patent applications\n"
                        "- Executive strategy documents, M&A information\n"
                        "- Source code with proprietary algorithms\n\n"
                        "Medium-High Confidence (0.6-0.8):\n"
                        "- Employee personal data (addresses, phone numbers)\n"
                        "- Financial statements, revenue reports\n"
                        "- Customer databases, user information\n"
                        "- Internal project specifications\n"
                        "- Technical architecture documents\n\n"
                        "Medium Confidence (0.4-0.6):\n"
                        "- Internal meeting notes with business discussions\n"
                        "- Company policies and procedures\n"
                        "- Internal communications about projects\n"
                        "- Operational reports and metrics\n\n"
                        "Low Confidence (0.0-0.4):\n"
                        "- Public marketing materials\n"
                        "- General documentation and tutorials\n"
                        "- Public announcements and press releases\n"
                        "- Generic code snippets and examples\n\n"
                        "RESPONSE FORMAT:\n"
                        "Respond with ONLY valid JSON in this exact format:\n"
                        '{"label": "Confidential", "confidence": 0.92}\n\n'
                        "IMPORTANT RULES:\n"
                        "1. Confidence must be a decimal between 0.0 and 1.0\n"
                        "2. Label must be exactly one of: Public, Internal, Sensitive, Confidential\n"
                        "3. Higher confidence = higher sensitivity/risk\n"
                        "4. Consider context, not just individual data points\n"
                        "5. When in doubt, err on the side of higher sensitivity\n\n"
                        f"TEXT TO CLASSIFY:\n{text[:1000]}"
                    ),
                }
            ],
            temperature=0.1,  # Low temperature for consistency
            max_tokens=50,  # Reduced since we only need JSON response
        )

        raw_content = (response.choices[0].message.content or "").strip()
        debug_print(f"[AI RAW RESPONSE] {raw_content}")

        # Clean JSON response
        if raw_content.startswith("```json"):
            raw_content = raw_content[7:-3].strip()
        elif raw_content.startswith("```"):
            raw_content = raw_content[3:-3].strip()

        # Remove any extra text after JSON
        if "}" in raw_content:
            raw_content = raw_content[: raw_content.find("}") + 1]

        import json

        parsed = json.loads(raw_content)

        label = parsed.get("label", "Unknown")
        confidence = parsed.get("confidence", 0.0)

        # Validate confidence range
        try:
            confidence = float(confidence)
            if confidence < 0.0:
                confidence = 0.0
            elif confidence > 1.0:
                confidence = 1.0
            # Round to 3 decimal places
            confidence = round(confidence, 3)
        except (ValueError, TypeError):
            debug_print(f"[AI CONFIDENCE ERROR] Invalid confidence: {confidence}")
            confidence = 0.0

        # Validate label
        valid_labels = ["Public", "Internal", "Sensitive", "Confidential"]
        if label not in valid_labels:
            debug_print(
                f"[AI LABEL ERROR] Invalid label '{label}', defaulting to 'Internal'"
            )
            label = "Internal"
            confidence = 0.4

        result = {"label": label, "confidence": confidence}
        debug_print(f"[AI CLASSIFICATION SUCCESS] {result}")

        return result

    except json.JSONDecodeError as e:
        debug_print(f"[AI JSON PARSE ERROR] {e} | Raw response: {raw_content}")
        return {"label": "Internal", "confidence": 0.4}

    except Exception as e:
        debug_print(f"[AI CLASSIFICATION ERROR] {e}")
        logging.error(f"AI classification failed: {e}")
        return {"label": "Internal", "confidence": 0.4}


# ---------------- SUMMARY BUFFER ----------------
def add_to_summary(event_type, target, snippet, hits):
    ai_result = ai_classify(snippet)
    with findings_lock:
        findings_summary.append(
            {
                "device_id": os.environ.get("COMPUTERNAME", "local_device"),
                "user_email": os.getlogin(),
                "event_type": event_type,
                "target": str(target),
                "snippet": (snippet or "")[:200],
                "detector_hits": hits,
                "ai_classification": ai_result,
            }
        )
    stats["hits_detected"] += len(hits)


def send_summary_to_server():
    while True:
        time.sleep(60)  # every 1 minutes
        to_send = None
        with findings_lock:
            if findings_summary:
                to_send = list(findings_summary)
                findings_summary.clear()
        if to_send:
            headers = {"Authorization": f"Bearer {JWT_TOKEN}"}
            try:
                response = requests.post(
                    CONFIG["server_url"],
                    json={"events": to_send},
                    headers=headers,
                    timeout=20,
                )
                if response.status_code == 200:
                    debug_print(f"[SUMMARY SENT] {len(to_send)} findings")
                    stats["reports_sent"] += 1
                else:
                    debug_print(
                        f"[SUMMARY FAILED] {response.status_code}: {response.text}"
                    )
                    # Put them back to buffer if failed
                    with findings_lock:
                        findings_summary[:0] = to_send
            except Exception as e:
                logging.error(f"Failed to send summary: {e}")
                with findings_lock:
                    findings_summary[:0] = to_send


# ---------------- FILE SCANNING ----------------
def scan_file(filepath: Path, force_scan=False):
    """Scan a file and return hits"""
    file_str = str(filepath)
    file_hash = get_file_hash(filepath)

    # Skip if we've already scanned this file recently (unless forced)
    if not force_scan and file_str in scanned_files:
        if scanned_files[file_str] == file_hash:
            return  # File hasn't changed, skip

    hits = {}
    ext = filepath.suffix.lower()
    try:
        if ext in [".txt", ".csv", ".py", ".js", ".java", ".go", ".ts"]:
            with open(filepath, "r", errors="ignore") as f:
                for idx, line in enumerate(f, start=1):
                    line_hits = detect_sensitive(line)
                    if line_hits:
                        for k, v in line_hits.items():
                            hits.setdefault(k, []).append(
                                {"line": idx, "snippet": line[:200], "matches": v}
                            )
        elif ext == ".docx":
            doc = Document(filepath)
            for idx, p in enumerate(doc.paragraphs, start=1):
                line_hits = detect_sensitive(p.text)
                if line_hits:
                    for k, v in line_hits.items():
                        hits.setdefault(k, []).append(
                            {"line": idx, "snippet": p.text[:200], "matches": v}
                        )
        elif ext in [".xlsx", ".xls"]:
            wb = load_workbook(filepath, data_only=True)
            for sheet in wb:
                for row_idx, row in enumerate(
                    sheet.iter_rows(values_only=True), start=1
                ):
                    for col_idx, cell in enumerate(row, start=1):
                        if cell:
                            cell_hits = detect_sensitive(str(cell))
                            if cell_hits:
                                for k, v in cell_hits.items():
                                    hits.setdefault(k, []).append(
                                        {
                                            "line": f"Sheet:{sheet.title} Row:{row_idx} Col:{col_idx}",
                                            "snippet": str(cell)[:200],
                                            "matches": v,
                                        }
                                    )
        elif ext == ".pdf":
            reader = PdfReader(filepath)
            for page_idx, page in enumerate(reader.pages, start=1):
                text = page.extract_text() or ""
                for line_idx, line in enumerate(text.splitlines(), start=1):
                    line_hits = detect_sensitive(line)
                    if line_hits:
                        for k, v in line_hits.items():
                            hits.setdefault(k, []).append(
                                {
                                    "line": f"Page:{page_idx} Line:{line_idx}",
                                    "snippet": line[:200],
                                    "matches": v,
                                }
                            )
    except Exception as e:
        logging.error(f"Failed to scan {filepath}: {e}")
        return

    # Update our cache
    scanned_files[file_str] = file_hash
    stats["files_scanned"] += 1

    # Only add to summary if there are hits OR if this is a new file
    if hits or file_str not in existing_files_in_db:
        if hits:
            debug_print(f"[FILE DETECTED] {filepath}")
        add_to_summary("file_scan", filepath, str(filepath), hits)


def get_current_files():
    """Get list of all current files on the device"""
    current_files = []
    for base_dir in CONFIG["scan_dirs"]:
        if should_exclude(base_dir):
            continue
        try:
            for file in Path(base_dir).rglob("*"):
                if (
                    file.is_file()
                    and file.suffix.lower() in CONFIG["file_extensions"]
                    and not should_exclude(str(file))
                ):
                    current_files.append(str(file))
        except Exception as e:
            logging.error(f"Error getting files from {base_dir}: {e}")
    return current_files


def incremental_file_scan():
    """Perform incremental file scanning"""
    debug_print("[INCREMENTAL SCAN] Starting file sync...")

    # Get files that need to be scanned (new files only)
    files_to_scan = sync_file_states()

    if not files_to_scan:
        debug_print("[INCREMENTAL SCAN] No new files to scan")
        return

    debug_print(f"[INCREMENTAL SCAN] Scanning {len(files_to_scan)} new files...")

    # Scan only new files
    for file_path in files_to_scan:
        try:
            filepath = Path(file_path)
            if filepath.exists():
                scan_file(filepath, force_scan=True)
        except Exception as e:
            logging.error(f"Error scanning {file_path}: {e}")

    debug_print(f"[INCREMENTAL SCAN] Completed scanning {len(files_to_scan)} files")


def sync_file_states():
    """Sync file states with server and get list of new files to scan"""
    device_id = os.environ.get("COMPUTERNAME", "local_device")
    current_files = get_current_files()

    try:
        headers = {"Authorization": f"Bearer {JWT_TOKEN}"}
        resp = requests.post(
            CONFIG["sync_url"],
            json={"device_id": device_id, "current_files": current_files},
            headers=headers,
            timeout=10,
        )

        if resp.status_code == 200:
            result = resp.json()
            deleted_count = result["deleted_files_count"]
            new_files = result["new_files_to_scan"]

            debug_print(f"[FILE SYNC] Deleted: {deleted_count}, New: {len(new_files)}")

            # Update our tracking
            global existing_files_in_db
            existing_files_in_db.update(new_files)
            for deleted_file in result.get("deleted_files", []):
                existing_files_in_db.discard(deleted_file)

            return new_files
        else:
            debug_print(f"[FILE SYNC FAILED] {resp.status_code}: {resp.text}")
            return []

    except Exception as e:
        debug_print(f"[FILE SYNC ERROR] {e}")
        return []


def scan_dirs():
    """Main scanning loop - now does incremental scanning"""
    # Initial sync and scan
    incremental_file_scan()

    while True:
        time.sleep(1800)  # Check every 30 minutes (reduced frequency)
        try:
            incremental_file_scan()
        except Exception as e:
            logging.error(f"Incremental scan error: {e}")


# ---------------- CLIPBOARD ----------------
def monitor_clipboard():
    last_data = ""
    while True:
        try:
            win32clipboard.OpenClipboard()
            data = win32clipboard.GetClipboardData()
            win32clipboard.CloseClipboard()
        except Exception:
            data = ""
        if isinstance(data, str) and data and data != last_data:
            hits = detect_sensitive(data)
            if hits:
                debug_print(f"[CLIPBOARD DETECTED] {hits}")
                add_to_summary("clipboard", "clipboard", data, hits)
            last_data = data
        time.sleep(1)


# ---------------- KEYLOGGER ----------------
typed_buffer = ""


def on_press(key):
    global typed_buffer
    try:
        if hasattr(key, "char") and key.char:
            typed_buffer += key.char
        elif key == keyboard.Key.space:
            typed_buffer += " "
        elif key == keyboard.Key.enter:
            typed_buffer += "\n"
        if len(typed_buffer) > 50 or "\n" in typed_buffer:
            hits = detect_sensitive(typed_buffer)
            if hits:
                debug_print(f"[KEYSTROKE DETECTED] {hits}")
                add_to_summary("keystroke", "keyboard", typed_buffer, hits)
            typed_buffer = ""
    except Exception as e:
        logging.error(f"Keylogger error: {e}")


def start_keylogger():
    listener = keyboard.Listener(on_press=on_press)
    listener.daemon = True
    listener.start()


# ---------------- MAIN ----------------
if __name__ == "__main__":
    debug_print("🚀 DLP Agent starting incremental monitoring...")
    threading.Thread(target=monitor_clipboard, daemon=True).start()
    start_keylogger()
    threading.Thread(target=scan_dirs, daemon=True).start()
    threading.Thread(target=send_summary_to_server, daemon=True).start()
    debug_print(
        "📋 Clipboard, ⌨️ Keystrokes, and 📂 Incremental file scanning running..."
    )

    # Show initial stats
    debug_print(
        f"[INITIAL STATE] {len(existing_files_in_db)} files already in database"
    )

    while True:
        time.sleep(5)
        # Periodically show stats
        if stats["files_scanned"] % 100 == 0 and stats["files_scanned"] > 0:
            debug_print(
                f"[STATS] Files: {stats['files_scanned']}, Hits: {stats['hits_detected']}, Reports: {stats['reports_sent']}"
            )
