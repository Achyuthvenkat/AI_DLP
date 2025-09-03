import os
from dotenv import load_dotenv

load_dotenv()

SERVER_URL = os.getenv("SERVER_URL")

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
    "ai_classification": {"enabled": True, "model": "gpt-4o-mini"},
    "sklearn_classification": {"enabled": True, "model_path": "dlp_model.pkl"},
    "patterns": {
        # Enhanced API Keys
        "openai_api_key": r"sk-[A-Za-z0-9_-]{48,}",
        "gemini_api_key": r"AIza[A-Za-z0-9_-]{35}",
        "deepseek_api_key": r"ds-[A-Za-z0-9_-]{32,}",
        "general_secrets": r"(?i)(secret|password|token|key)[\s:=]+['\"]?[\w\-@#$%^&*()+=]{8,}['\"]?",
        "aws_secret": r"AKIA[0-9A-Z]{16}",
        "private_key": r"-----BEGIN (?:RSA|EC|DSA)? PRIVATE KEY-----",
        "password": r"(?i)password\s*[:=]\s*['\"]?.+['\"]?",
        # Enhanced PII Data
        "pan_flexible": r"[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}",  # Allow lowercase
        "aadhaar_flexible": r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
        "credit_card_strict": r"\b(?:\d[ -]*?){15,19}\b",
        # Database related
        "database_password": r"(?i)(db_pass|database_password|mysql_pass|postgres_pass)\s*[:=]\s*['\"]?.+['\"]?",
        "database_connection": r"(?i)(connection_string|jdbc:|mongodb://|mysql://|postgres://)",
        # Titan Company Specific
        "titan_confidential": r"(?i)(titan company limited.*(?:r&d|blueprint|confidential|financial report|Q[1-4]-202[4-9]))",
        "titan_rd_blueprint": r"(?i)titan company limited r&d blueprint for \w+ project",
        "titan_financial": r"(?i)confidential titan financial report q[1-4]-202[4-9]",
        # HR and Medical
        "hr_docs": r"(?i)(hr\s+doc|human resource|employee handbook|salary slip|payroll)",
        "medical_reports": r"(?i)(medical report|health record|prescription|diagnosis|patient)",
        # Internal Communications
        "meeting_notes": r"(?i)(meeting notes|minutes of meeting|mom|action items)",
        "internal_email": r"(?i)(internal email|confidential email|for internal use)",
        "budget_allocation": r"(?i)(budget allocation|team budget|quarterly budget)",
        "project_kickoff": r"(?i)(project kickoff|project scheduled|milestone)",
        # Public/Marketing
        "titan_announcement": r"(?i)titan company limited announces launch",
        "titan_brochure": r"(?i)this brochure describes features of titan",
        "titan_press_release": r"(?i)press release.*titan.*sales grew",
        "titan_marketing": r"(?i)marketing flyer for titan watches",
        "titan_website": r"(?i)titan website content",
    },
}

# Exclude system/program folders
EXCLUDE_DIRS = [
    r"C:\Windows",
    r"C:\Program Files",
    r"C:\Program Files (x86)",
    r"C:\ProgramData",
    r"C:\$Recycle.Bin",
    r"C:\Recovery",
    r"C:\System Volume Information",
    # Development environments - Python
    r"venv",
    r"env",
    r".venv",
    r".env",
    r"virtualenv",
    r"__pycache__",
    r".pytest_cache",
    r".tox",
    r"site-packages",
    # Development environments - Node.js
    r"node_modules",
    r".npm",
    r".yarn",
    r"bower_components",
    # Development environments - Java
    r"target",
    r".m2",
    r".gradle",
    r"build",
    # Development environments - .NET
    r"bin",
    r"obj",
    r"packages",
    r".nuget",
    # Development environments - Ruby
    r".bundle",
    r"vendor/bundle",
    r".gem",
    # Development environments - PHP
    r"vendor",
    r"composer",
    # Version control
    r".git",
    r".svn",
    r".hg",
    r".bzr",
    # IDE and editor directories
    r".vscode",
    r".idea",
    r".vs",
    r".android",
    r".cisco",
    r".config",
    r".gradle",
    r".ipython",
    r".local",
    r".mysqlsh-gui",
    r".ollama",
    r".skiko",
    r".ssh",
    r".u2net",
    r"__MACOSX",
    # Cache and temporary directories
    r".cache",
    r"cache",
    r"tmp",
    r"temp",
    r".tmp",
    r".temp",
    r"AppData\Local\Temp",
    r"AppData\Local\Microsoft\Windows\Temporary Internet Files",
    # Docker and containers
    r".docker",
    r"docker-compose",
    # Windows system and user cache directories
    r"AppData\Local",
    r"AppData\LocalLow",
    r"AppData\Roaming\Microsoft\Windows\Recent",
    r"AppData\Roaming\Microsoft\Windows\SendTo",
    r"AppData\Roaming\Microsoft\Windows\Start Menu",
    r"NTUSER.DAT",
    r"UsrClass.dat",
    # Browser cache and temporary data
    r"Google\Chrome\User Data\Default\Cache",
    r"Mozilla\Firefox\Profiles\.*\cache2",
    r"Microsoft\Edge\User Data\Default\Cache",
    r"BraveSoftware\Brave-Browser\User Data\Default\Cache",
    # Gaming platforms
    r"Steam\steamapps",
    r"Epic Games\Launcher\Portal\Binaries",
    r"Origin Games",
    r"Battle.net",
    # Virtual machine files
    r"VirtualBox VMs",
    r"VMware",
    r".vagrant",
    # Media cache and thumbnails
    r"Thumbs.db",
    r"desktop.ini",
    r".DS_Store",
    r"Temporary Internet Files",
    # Log directories
    r"logs",
    r".log",
    r"crash-reports",
    # Package managers and build tools
    r".cargo",
    r".rustup",
    r"go\pkg",
    r".pub-cache",
    r"flutter\.pub-cache",
    # Large binary/media processing
    r"ffmpeg",
    r"ImageMagick",
    r"opencv",
    # System restore and backup
    r"System Volume Information",
    r"$WINDOWS.~BT",
    r"Windows.old",
]

OUTPUT_SCHEMA = {
    "type": "json_schema",
    "name": "dlp_classification_result",
    "strict": True,
    "description": "Classification result from DLP AI model",
    "schema": {
        "type": "object",
        "properties": {
            "label": {
                "type": "string",
                "description": "Classification label for the content",
                "enum": ["Public", "Internal", "Sensitive", "Confidential", "Safe"],
            },
            "confidence": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0,
                "description": "Confidence score for the classification",
            },
            "reason": {
                "type": "string",
                "description": "Reason for the classification decision",
            },
        },
        "required": ["label", "confidence", "reason"],
        "additionalProperties": False,
    },
}
