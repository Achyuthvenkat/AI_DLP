from werkzeug.security import generate_password_hash
import pymysql

DB_HOST = "localhost"
DB_PORT = 3306
DB_USER = "root"
DB_PASS = "suman@2025!123"
DB_NAME = "ai_dlp"

con = pymysql.connect(
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASS,
    database=DB_NAME,
    cursorclass=pymysql.cursors.DictCursor
)
cur = con.cursor()

# Delete broken admin
cur.execute("DELETE FROM users WHERE email=%s", ("admin@example.com",))

# Insert fixed admin
cur.execute("""
INSERT INTO users (email, full_name, role, password_hash)
VALUES (%s,%s,%s,%s)
""", (
    "admin@example.com",
    "Admin User",
    "admin",
    generate_password_hash("admin123")
))

con.commit()
con.close()
print("? Admin user reset to admin@example.com / admin123")
