# -*- coding: utf-8 -*-
import os
import json
import pymysql
import jwt
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    flash,
    jsonify,
)
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

# ---------------- LOAD ENV ----------------
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "super-secret")

# ---------------- DB CONFIG ----------------
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "ai_dlp")

# ---------------- JWT CONFIG ----------------
JWT_SECRET = os.getenv("JWT_SECRET", "superjwtsecret")
JWT_ALGORITHM = "HS256"
JWT_EXP_HOURS = int(os.getenv("JWT_EXP_HOURS", "12"))


# ---------------- DB CONNECTION HELPERS ----------------
def get_server_connection():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def get_db():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor,
    )


def init_db():
    try:
        srv = get_server_connection()
        cur = srv.cursor()
    except Exception as e:
        print(f"Error connecting to MySQL server: {e}")
        return
    cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`")
    cur.close()
    srv.close()

    con = get_db()
    cur = con.cursor()

    # Users
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(120) UNIQUE,
            full_name VARCHAR(120),
            role VARCHAR(20),
            password_hash VARCHAR(255)
        )
    """
    )

    # Devices
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS devices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            device_id VARCHAR(120) UNIQUE,
            owner_email VARCHAR(120),
            registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_device_id (device_id),
            INDEX idx_registered_at (registered_at)
        )
    """
    )

    # Policies
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS policies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(120),
            description TEXT,
            rules JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
    """
    )

    # Policy Assignments
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS policy_assignments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_email VARCHAR(120),
            device_id VARCHAR(120),
            policy_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (policy_id) REFERENCES policies(id)
                ON DELETE CASCADE ON UPDATE CASCADE,
            INDEX idx_user_email (user_email),
            INDEX idx_device_id (device_id),
            INDEX idx_policy_id (policy_id)
        ) ENGINE=InnoDB
    """
    )

    # Events
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INT AUTO_INCREMENT PRIMARY KEY,
            device_id VARCHAR(120),
            user_email VARCHAR(120),
            event_type VARCHAR(120),
            target VARCHAR(255),
            snippet TEXT,
            detector_hits JSON,
            ai_label VARCHAR(64),
            ai_confidence DECIMAL(5,2),
            policy_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (policy_id) REFERENCES policies(id)
                ON DELETE SET NULL ON UPDATE CASCADE,
            INDEX idx_created_at (created_at),
            INDEX idx_device_id (device_id),
            INDEX idx_user_email (user_email),
            INDEX idx_event_type (event_type),
            INDEX idx_ai_label (ai_label),
            INDEX idx_device_created (device_id, created_at)
        ) ENGINE=InnoDB
    """
    )

    # Add indexes if they don't exist (for existing tables)
    try:
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at DESC)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_device_id ON events (device_id)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_device_created ON events (device_id, created_at DESC)"
        )
    except:
        pass  # Indexes might already exist

    con.commit()
    cur.close()
    con.close()


# ---------------- JWT HELPERS ----------------
def create_jwt(device_id: str):
    payload = {
        "device_id": device_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token


def decode_jwt(token: str):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def token_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401
        token = auth.split(" ", 1)[1].strip()
        decoded = decode_jwt(token)
        if not decoded:
            return jsonify({"error": "Unauthorized"}), 401
        return f(decoded, *args, **kwargs)

    return wrapper


# ---------------- AUTH ----------------


@app.route("/base")
def base_page():
    if "user_id" not in session:
        return redirect(url_for("login"))
    return render_template("base.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        con = get_db()
        cursor = con.cursor()
        cursor.execute(
            "SELECT id, password_hash FROM users WHERE email=%s", (username,)
        )
        user = cursor.fetchone()
        cursor.close()
        con.close()

        if user and check_password_hash(user["password_hash"], password):
            session["user_id"] = user["id"]
            session["username"] = username  # store username for navbar
            return redirect(url_for("base_page"))  # changed here
        else:
            return render_template("login.html", error="Invalid credentials")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ---------------- DASHBOARD + ROOT ----------------
@app.route("/")
def index():
    """Root: redirect based on login status"""
    if "user_id" not in session:
        return redirect(url_for("login"))
    return redirect(url_for("dashboard"))


@app.route("/dashboard")
def dashboard():
    if "user_id" not in session:
        return redirect(url_for("login"))

    # Get pagination parameters
    page = int(request.args.get("page", 1))
    per_page = 10
    offset = (page - 1) * per_page

    # Get filter parameters
    ai_filter = request.args.get("ai_filter", "").strip()
    device_filter = request.args.get("device_filter", "").strip()
    event_type_filter = request.args.get("event_type_filter", "").strip()
    user_filter = request.args.get("user_filter", "").strip()

    con = get_db()
    cur = con.cursor()

    try:
        # Build WHERE clause for filters
        where_conditions = []
        params = []

        if ai_filter:
            where_conditions.append("ai_label = %s")
            params.append(ai_filter)

        if device_filter:
            where_conditions.append("device_id LIKE %s")
            params.append(f"%{device_filter}%")

        if event_type_filter:
            where_conditions.append("event_type = %s")
            params.append(event_type_filter)

        if user_filter:
            where_conditions.append("user_email LIKE %s")
            params.append(f"%{user_filter}%")

        where_clause = ""
        if where_conditions:
            where_clause = "WHERE " + " AND ".join(where_conditions)

        # Get total count with filters
        count_query = f"SELECT COUNT(*) as total FROM events {where_clause}"
        cur.execute(count_query, params)
        total_events = cur.fetchone()["total"]
        total_pages = max(1, (total_events + per_page - 1) // per_page)

        # Fetch events with filters and pagination
        events_query = f"""
            SELECT id, device_id, user_email, event_type, target, snippet, 
                   ai_label, ai_confidence, policy_id, created_at
            FROM events 
            {where_clause}
            ORDER BY id DESC 
            LIMIT %s OFFSET %s
        """
        cur.execute(events_query, params + [per_page, offset])
        events = cur.fetchall()

        # Build chart data with filters
        chart_where_conditions = where_conditions + ["ai_label IS NOT NULL"]
        chart_where_clause = "WHERE " + " AND ".join(chart_where_conditions)

        chart_query = f"""
            SELECT ai_label, COUNT(*) as cnt 
            FROM events 
            {chart_where_clause}
            GROUP BY ai_label 
            ORDER BY cnt DESC 
            LIMIT 10
        """
        cur.execute(chart_query, params)
        stats = cur.fetchall()

        # Get unique values for filter dropdowns
        cur.execute(
            "SELECT DISTINCT ai_label FROM events WHERE ai_label IS NOT NULL ORDER BY ai_label"
        )
        ai_labels = [row["ai_label"] for row in cur.fetchall()]

        cur.execute("SELECT DISTINCT device_id FROM events ORDER BY device_id")
        devices = [row["device_id"] for row in cur.fetchall()]

        cur.execute("SELECT DISTINCT event_type FROM events ORDER BY event_type")
        event_types = [row["event_type"] for row in cur.fetchall()]

        # Prepare JSON strings for template
        chart_labels = json.dumps([s["ai_label"] for s in stats])
        chart_values = json.dumps([s["cnt"] for s in stats])

    except Exception as e:
        # Fallback for memory issues
        app.logger.error(f"Dashboard query error: {e}")
        events = []
        total_events = 0
        total_pages = 1
        chart_labels = json.dumps([])
        chart_values = json.dumps([])
        ai_labels = []
        devices = []
        event_types = []
        flash("Database query optimized. Showing limited results.", "warning")

    finally:
        cur.close()
        con.close()

    return render_template(
        "dashboard.html",
        events=events,
        chart_labels=chart_labels,
        chart_values=chart_values,
        current_page=page,
        total_pages=total_pages,
        has_prev=page > 1,
        has_next=page < total_pages,
        prev_page=page - 1 if page > 1 else None,
        next_page=page + 1 if page < total_pages else None,
        total_events=total_events,
        # Filter data
        ai_labels=ai_labels,
        devices=devices,
        event_types=event_types,
        # Current filter values
        current_ai_filter=ai_filter,
        current_device_filter=device_filter,
        current_event_type_filter=event_type_filter,
        current_user_filter=user_filter,
    )


# ---------------- ADMIN PAGES ----------------
@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


@app.route("/users")
def users_page():
    if "user_id" not in session:
        return redirect(url_for("login"))
    con = get_db()
    cur = con.cursor()
    cur.execute(
        """
        SELECT id, email, full_name, role,
               DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS last_login
        FROM users
        ORDER BY id DESC
        LIMIT 100
    """
    )
    users = cur.fetchall()
    cur.close()
    con.close()
    return render_template("users.html", users=users)


@app.route("/devices")
def devices_page():
    if "user_id" not in session:
        return redirect(url_for("login"))
    con = get_db()
    cur = con.cursor()
    cur.execute(
        """
        SELECT id, device_id, owner_email AS owner,
               registered_at AS last_seen,
               'active' AS status,
               device_id AS hostname,
               'Unknown OS' AS os
        FROM devices
        ORDER BY registered_at DESC
        LIMIT 100
    """
    )
    devices = cur.fetchall()
    cur.close()
    con.close()
    return render_template("devices.html", devices=devices)


@app.route("/policies")
def policies_page():
    if "user_id" not in session:
        return redirect(url_for("login"))
    con = get_db()
    cur = con.cursor()
    cur.execute(
        """
        SELECT id, name, description, rules, created_at 
        FROM policies 
        ORDER BY created_at DESC
        LIMIT 100
    """
    )
    policies = cur.fetchall()
    cur.close()
    con.close()
    return render_template("policies.html", policies=policies)


@app.route("/policies/new", methods=["GET", "POST"])
def new_policy():
    if "user_id" not in session:
        return redirect(url_for("login"))

    if request.method == "POST":
        name = request.form.get("name")
        description = request.form.get("description")
        rules = request.form.get("rules")  # Expected as JSON text

        con = get_db()
        cur = con.cursor()
        cur.execute(
            "INSERT INTO policies (name, description, rules) VALUES (%s, %s, %s)",
            (name, description, rules),
        )
        con.commit()
        cur.close()
        con.close()

        return redirect(url_for("policies_page"))

    return render_template("new_policy.html")


@app.route("/debug/assignments")
def debug_assignments():
    if "user_id" not in session:
        return redirect(url_for("login"))

    con = get_db()
    cur = con.cursor()

    try:
        # Check table structure
        cur.execute("DESCRIBE policy_assignments")
        columns = cur.fetchall()

        # Get sample data
        cur.execute("SELECT * FROM policy_assignments LIMIT 5")
        sample_data = cur.fetchall()

        result = {"columns": columns, "sample_data": sample_data}

        cur.close()
        con.close()

        return f"<pre>{json.dumps(result, indent=2, default=str)}</pre>"

    except Exception as e:
        return f"Error: {str(e)}"


# Fixed assignments_page function - using only existing columns
@app.route("/assignments")
def assignments_page():
    if "user_id" not in session:
        return redirect(url_for("login"))

    con = get_db()
    cur = con.cursor()

    try:
        # Debug: Check if table exists and has data
        cur.execute("SELECT COUNT(*) as count FROM policy_assignments")
        count_result = cur.fetchone()
        print(f"Total assignments in database: {count_result['count']}")  # Debug

        # Simple query first to test
        cur.execute(
            "SELECT * FROM policy_assignments ORDER BY created_at DESC LIMIT 100"
        )
        raw_data = cur.fetchall()
        print(f"Raw assignments data: {raw_data}")  # Debug

        # Enhanced query with proper joins
        cur.execute(
            """
            SELECT 
                pa.id,
                pa.policy_id,
                pa.user_email,
                pa.device_id,
                pa.created_at,
                COALESCE(p.name, 'Unknown Policy') AS policy_name
            FROM policy_assignments pa
            LEFT JOIN policies p ON pa.policy_id = p.id
            ORDER BY pa.created_at DESC
            LIMIT 100
        """
        )

        raw_assignments = cur.fetchall()
        print(f"Fetched {len(raw_assignments)} assignments")  # Debug

        # Process assignments for display
        assignments = []
        for assignment in raw_assignments:
            if assignment["user_email"]:
                entity = assignment["user_email"]
                scope = "User"
            elif assignment["device_id"]:
                entity = assignment["device_id"]
                scope = "Device"
            else:
                entity = "Unknown"
                scope = "Unknown"

            assignments.append(
                {
                    "id": assignment["id"],
                    "policy_name": assignment["policy_name"],
                    "entity": entity,
                    "scope": scope,
                    "status": "active",
                }
            )

        print(f"Processed assignments: {assignments}")  # Debug

    except Exception as e:
        print(f"Error in assignments_page: {e}")  # Debug
        assignments = []
        flash(f"Error loading assignments: {str(e)}", "error")

    finally:
        cur.close()
        con.close()

    return render_template("assignments.html", assignments=assignments)


@app.route("/debug/check_assignments")
def debug_check_assignments():
    if "user_id" not in session:
        return "Unauthorized"

    con = get_db()
    cur = con.cursor()

    try:
        # Check table structure
        cur.execute("DESCRIBE policy_assignments")
        structure = cur.fetchall()

        # Check data
        cur.execute("SELECT * FROM policy_assignments")
        data = cur.fetchall()

        # Check policies
        cur.execute("SELECT * FROM policies")
        policies = cur.fetchall()

        result = {
            "table_structure": structure,
            "assignments_data": data,
            "policies_data": policies,
        }

        return f"<pre>{json.dumps(result, indent=2, default=str)}</pre>"

    except Exception as e:
        return f"Error: {str(e)}"
    finally:
        cur.close()
        con.close()


@app.route("/assignments/delete/<int:assignment_id>", methods=["POST", "GET"])
def delete_assignment(assignment_id):
    if "user_id" not in session:
        return redirect(url_for("login"))
    con = get_db()
    cur = con.cursor()
    cur.execute("DELETE FROM policy_assignments WHERE id=%s", (assignment_id,))
    con.commit()
    cur.close()
    con.close()
    flash("Assignment deleted.", "success")
    return redirect(url_for("assignments_page"))


@app.route("/assignments/add", methods=["GET", "POST"])
def add_assignment():
    if "user_id" not in session:
        return redirect(url_for("login"))

    con = get_db()
    cur = con.cursor()
    cur.execute("SELECT id, name FROM policies")
    policies = cur.fetchall()

    if request.method == "POST":
        policy_id = request.form.get("policy_id")
        scope = request.form.get("scope")
        entity = request.form.get("entity")

        print(
            f"Creating assignment: policy_id={policy_id}, scope={scope}, entity={entity}"
        )  # Debug

        try:
            if scope == "User":
                cur.execute(
                    """
                    INSERT INTO policy_assignments (policy_id, user_email, device_id) 
                    VALUES (%s, %s, NULL)
                """,
                    (policy_id, entity),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO policy_assignments (policy_id, user_email, device_id) 
                    VALUES (%s, NULL, %s)
                """,
                    (policy_id, entity),
                )

            con.commit()
            print(
                f"Assignment created successfully. Affected rows: {cur.rowcount}"
            )  # Debug
            flash("Assignment created successfully!", "success")

        except Exception as e:
            print(f"Error creating assignment: {e}")  # Debug
            con.rollback()
            flash(f"Error creating assignment: {str(e)}", "error")

        finally:
            cur.close()
            con.close()

        return redirect(url_for("assignments_page"))

    cur.close()
    con.close()
    return render_template("add_assignment.html", policies=policies)


@app.route("/assignments/edit/<int:assignment_id>", methods=["GET", "POST"])
def edit_assignment(assignment_id):
    if "user_id" not in session:
        return redirect(url_for("login"))

    con = get_db()
    cur = con.cursor()

    cur.execute("SELECT id, name FROM policies")
    policies = cur.fetchall()

    cur.execute("SELECT * FROM policy_assignments WHERE id = %s", (assignment_id,))
    assignment = cur.fetchone()

    if request.method == "POST":
        policy_id = request.form.get("policy_id")
        scope = request.form.get("scope")
        entity = request.form.get("entity")

        if scope == "User":
            cur.execute(
                """
                UPDATE policy_assignments SET policy_id=%s, user_email=%s, device_id=NULL WHERE id=%s
            """,
                (policy_id, entity, assignment_id),
            )
        else:
            cur.execute(
                """
                UPDATE policy_assignments SET policy_id=%s, device_id=%s, user_email=NULL WHERE id=%s
            """,
                (policy_id, entity, assignment_id),
            )

        con.commit()
        cur.close()
        con.close()
        return redirect(url_for("assignments_page"))

    cur.close()
    con.close()
    return render_template(
        "edit_assignment.html", assignment=assignment, policies=policies
    )


@app.route("/events")
def events_page():
    if "user_id" not in session:
        return redirect(url_for("login"))

    # Get pagination parameters
    page = int(request.args.get("page", 1))
    per_page = 10
    offset = (page - 1) * per_page

    # Get filter parameters
    device_filter = request.args.get("device_filter", "").strip()
    event_type_filter = request.args.get("event_type_filter", "").strip()
    ai_label_filter = request.args.get("ai_label_filter", "").strip()
    user_filter = request.args.get("user_filter", "").strip()

    con = get_db()
    cur = con.cursor()

    try:
        # Build WHERE clause for filters
        where_conditions = []
        params = []

        if device_filter:
            where_conditions.append("device_id LIKE %s")
            params.append(f"%{device_filter}%")

        if event_type_filter:
            where_conditions.append("event_type = %s")
            params.append(event_type_filter)

        if ai_label_filter:
            where_conditions.append("ai_label = %s")
            params.append(ai_label_filter)

        if user_filter:
            where_conditions.append("user_email LIKE %s")
            params.append(f"%{user_filter}%")

        where_clause = ""
        if where_conditions:
            where_clause = "WHERE " + " AND ".join(where_conditions)

        # Get total count with filters
        count_query = f"SELECT COUNT(*) as total FROM events {where_clause}"
        cur.execute(count_query, params)
        total_events = cur.fetchone()["total"]
        total_pages = max(1, (total_events + per_page - 1) // per_page)

        # Fetch events with filters and pagination
        events_query = f"""
            SELECT id, created_at, device_id, user_email,
                   event_type, target, snippet, detector_hits,
                   ai_label, ai_confidence, policy_id
            FROM events
            {where_clause}
            ORDER BY id DESC
            LIMIT %s OFFSET %s
        """
        cur.execute(events_query, params + [per_page, offset])
        events = cur.fetchall()

        # Get unique values for filter dropdowns
        cur.execute(
            "SELECT DISTINCT device_id FROM events WHERE device_id IS NOT NULL ORDER BY device_id"
        )
        devices = [row["device_id"] for row in cur.fetchall()]

        cur.execute(
            "SELECT DISTINCT event_type FROM events WHERE event_type IS NOT NULL ORDER BY event_type"
        )
        event_types = [row["event_type"] for row in cur.fetchall()]

        cur.execute(
            "SELECT DISTINCT ai_label FROM events WHERE ai_label IS NOT NULL ORDER BY ai_label"
        )
        ai_labels = [row["ai_label"] for row in cur.fetchall()]

    except Exception as e:
        # Fallback for memory issues
        app.logger.error(f"Events query error: {e}")
        events = []
        total_events = 0
        total_pages = 1
        devices = []
        event_types = []
        ai_labels = []
        flash("Database query optimized. Showing limited results.", "warning")

    finally:
        cur.close()
        con.close()

    return render_template(
        "events.html",
        events=events,
        current_page=page,
        total_pages=total_pages,
        has_prev=page > 1,
        has_next=page < total_pages,
        prev_page=page - 1 if page > 1 else None,
        next_page=page + 1 if page < total_pages else None,
        total_events=total_events,
        # Filter data
        devices=devices,
        event_types=event_types,
        ai_labels=ai_labels,
        # Current filter values
        current_device_filter=device_filter,
        current_event_type_filter=event_type_filter,
        current_ai_label_filter=ai_label_filter,
        current_user_filter=user_filter,
    )


# ---------------- AGENT API ----------------
# Replace these routes in your app.py


@app.route("/api/token", methods=["POST"])
def api_token():
    data = request.get_json(silent=True) or {}
    device_id = data.get("device_id")
    if not device_id:
        return jsonify({"error": "device_id required"}), 400

    con = get_db()
    cur = con.cursor()

    try:
        # Register or update device without deleting events
        cur.execute("SELECT id FROM devices WHERE device_id=%s", (device_id,))
        exists = cur.fetchone()
        if not exists:
            cur.execute(
                "INSERT INTO devices (device_id, owner_email) VALUES (%s, %s)",
                (device_id, None),
            )
            con.commit()
        else:
            # Update registration time
            cur.execute(
                "UPDATE devices SET registered_at=NOW() WHERE device_id=%s",
                (device_id,),
            )
            con.commit()

        # Get existing files for this device to send back to agent
        cur.execute(
            """
            SELECT DISTINCT target 
            FROM events 
            WHERE device_id=%s AND event_type='file_scan'
            """,
            (device_id,),
        )
        existing_files = [row["target"] for row in cur.fetchall()]

    finally:
        cur.close()
        con.close()

    token = create_jwt(device_id)
    return jsonify(
        {
            "token": token,
            "existing_files": existing_files,
            "message": f"Device registered, found {len(existing_files)} existing files",
        }
    )


# New route to sync file states
@app.route("/api/sync_files", methods=["POST"])
@token_required
def api_sync_files(decoded):
    """Sync file states - remove deleted files, add new ones"""
    data = request.get_json(silent=True) or {}
    device_id = data.get("device_id")
    current_files = data.get("current_files", [])  # Files currently on the device

    if not device_id:
        return jsonify({"error": "device_id required"}), 400

    con = get_db()
    cur = con.cursor()

    try:
        # Get files currently in database for this device
        cur.execute(
            """
            SELECT DISTINCT target 
            FROM events 
            WHERE device_id=%s AND event_type='file_scan'
            """,
            (device_id,),
        )
        db_files = set(row["target"] for row in cur.fetchall())
        current_files_set = set(current_files)

        # Find files that were deleted (in DB but not on device)
        deleted_files = db_files - current_files_set

        # Find new files (on device but not in DB)
        new_files = current_files_set - db_files

        # Remove events for deleted files
        if deleted_files:
            placeholders = ",".join(["%s"] * len(deleted_files))
            cur.execute(
                f"""
                DELETE FROM events 
                WHERE device_id=%s AND event_type='file_scan' AND target IN ({placeholders})
                """,
                (device_id,) + tuple(deleted_files),
            )
            deleted_count = cur.rowcount
        else:
            deleted_count = 0

        con.commit()

    finally:
        cur.close()
        con.close()

    return jsonify(
        {
            "status": "ok",
            "deleted_files_count": deleted_count,
            "new_files_to_scan": list(new_files),
            "deleted_files": list(deleted_files),
        }
    )


# Updated events route (same as before but ensuring it works with incremental updates)
@app.route("/api/events", methods=["POST"])
@token_required
def api_events(decoded):
    data = request.get_json(silent=True) or {}
    device_id = data.get("device_id")

    con = get_db()
    cur = con.cursor()

    try:
        # Check if this exact event already exists (prevent duplicates)
        if data.get("event_type") == "file_scan":
            cur.execute(
                """
                SELECT id FROM events 
                WHERE device_id=%s AND event_type='file_scan' AND target=%s
                """,
                (device_id, data.get("target")),
            )
            existing = cur.fetchone()
            if existing:
                # Update existing record instead of creating duplicate
                cur.execute(
                    """
                    UPDATE events 
                    SET snippet=%s, detector_hits=%s, ai_label=%s, ai_confidence=%s, policy_id=%s
                    WHERE id=%s
                    """,
                    (
                        data.get("snippet"),
                        (
                            json.dumps(data.get("detector_hits"))
                            if data.get("detector_hits")
                            else None
                        ),
                        (data.get("ai_classification") or {}).get("label"),
                        (data.get("ai_classification") or {}).get("confidence"),
                        data.get("policy_id"),
                        existing["id"],
                    ),
                )
                con.commit()
                return jsonify({"status": "updated"})

        # Insert new event
        cur.execute(
            """
            INSERT INTO events (device_id, user_email, event_type, target, snippet,
                                detector_hits, ai_label, ai_confidence, policy_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
            (
                device_id,
                data.get("user_email"),
                data.get("event_type"),
                data.get("target"),
                data.get("snippet"),
                (
                    json.dumps(data.get("detector_hits"))
                    if data.get("detector_hits")
                    else None
                ),
                (data.get("ai_classification") or {}).get("label"),
                (data.get("ai_classification") or {}).get("confidence"),
                data.get("policy_id"),
            ),
        )
        con.commit()
    finally:
        cur.close()
        con.close()

    return jsonify({"status": "ok"})


@app.route("/api/report", methods=["POST"])
@token_required
def api_report(decoded):
    payload = request.get_json(silent=True) or {}
    events = payload.get("events")
    if not isinstance(events, list) or not events:
        return jsonify({"error": "Invalid payload"}), 400

    con = get_db()
    cur = con.cursor()

    try:
        # Process events with duplicate checking for file_scan events
        processed_count = 0
        updated_count = 0

        for ev in events:
            device_id = ev.get("device_id")
            event_type = ev.get("event_type")
            target = ev.get("target")

            # For file_scan events, check for duplicates
            if event_type == "file_scan" and target:
                cur.execute(
                    """
                    SELECT id FROM events 
                    WHERE device_id=%s AND event_type='file_scan' AND target=%s
                    """,
                    (device_id, target),
                )
                existing = cur.fetchone()

                if existing:
                    # Update existing record
                    cur.execute(
                        """
                        UPDATE events 
                        SET snippet=%s, detector_hits=%s, ai_label=%s, ai_confidence=%s, policy_id=%s
                        WHERE id=%s
                        """,
                        (
                            ev.get("snippet"),
                            (
                                json.dumps(ev.get("detector_hits"))
                                if ev.get("detector_hits")
                                else None
                            ),
                            (ev.get("ai_classification") or {}).get("label"),
                            (ev.get("ai_classification") or {}).get("confidence"),
                            ev.get("policy_id"),
                            existing["id"],
                        ),
                    )
                    updated_count += 1
                    continue

            # Insert new event
            cur.execute(
                """
                INSERT INTO events (device_id, user_email, event_type, target, snippet,
                                    detector_hits, ai_label, ai_confidence, policy_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
                (
                    device_id,
                    ev.get("user_email"),
                    event_type,
                    target,
                    ev.get("snippet"),
                    (
                        json.dumps(ev.get("detector_hits"))
                        if ev.get("detector_hits")
                        else None
                    ),
                    (ev.get("ai_classification") or {}).get("label"),
                    (ev.get("ai_classification") or {}).get("confidence"),
                    ev.get("policy_id"),
                ),
            )
            processed_count += 1

        con.commit()
    finally:
        cur.close()
        con.close()

    return jsonify(
        {
            "status": "ok",
            "new_events": processed_count,
            "updated_events": updated_count,
            "total_processed": len(events),
        }
    )


# ---------------- CLEANUP UTILITY ----------------
@app.route("/api/cleanup", methods=["POST"])
def cleanup_old_events():
    """Clean up old events to prevent database bloat"""
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    con = get_db()
    cur = con.cursor()

    # Keep only last 1000 events
    cur.execute(
        """
        DELETE FROM events 
        WHERE id NOT IN (
            SELECT id FROM (
                SELECT id FROM events 
                ORDER BY id DESC 
                LIMIT 1000
            ) as subquery
        )
    """
    )

    deleted_count = cur.rowcount
    con.commit()
    cur.close()
    con.close()

    return jsonify({"status": "ok", "deleted_count": deleted_count})


# ---------------- INIT ----------------
if __name__ == "__main__":
    init_db()
    try:
        con = get_db()
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) AS c FROM users")
        c = cur.fetchone()["c"]
        if c == 0:
            cur.execute(
                "INSERT INTO users (email, full_name, role, password_hash) VALUES (%s,%s,%s,%s)",
                (
                    "admin@example.com",
                    "Administrator",
                    "admin",
                    generate_password_hash("admin123"),
                ),
            )
            con.commit()
        cur.close()
        con.close()
    except Exception as e:
        app.logger.error(f"Admin seed error: {e}")

    app.run(host="0.0.0.0", port=8000, debug=True)
