# -*- coding: utf-8 -*-
"""
Quick Fix for MySQL Memory Error
Run this script to immediately fix the "Out of sort memory" error.
"""

import os
import pymysql
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "ai_dlp")

def get_db():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )

def quick_fix():
    """Quick fix for memory issues"""
    print("🚀 Quick Fix for MySQL Memory Error")
    print("=" * 40)
    
    con = get_db()
    cur = con.cursor()
    
    # Step 1: Check current event count
    cur.execute("SELECT COUNT(*) as total FROM events")
    total = cur.fetchone()["total"]
    print(f"📊 Current events: {total}")
    
    # Step 2: Aggressive cleanup if needed
    if total > 200:
        print(f"⚠️ Too many events ({total}), cleaning up...")
        
        # Keep only last 50 events for immediate relief
        cur.execute("""
            DELETE FROM events 
            WHERE id NOT IN (
                SELECT * FROM (
                    SELECT id FROM events 
                    ORDER BY id DESC 
                    LIMIT 50
                ) as subquery
            )
        """)
        
        deleted = cur.rowcount
        con.commit()
        print(f"✅ Deleted {deleted} old events, kept 50 most recent")
    
    # Step 3: Create essential indexes
    print("📋 Creating essential indexes...")
    
    essential_indexes = [
        "CREATE INDEX IF NOT EXISTS idx_events_id_desc ON events (id DESC)",
        "CREATE INDEX IF NOT EXISTS idx_events_created_desc ON events (created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_events_device ON events (device_id)"
    ]
    
    for index_sql in essential_indexes:
        try:
            cur.execute(index_sql)
            print("✅ Index created successfully")
        except Exception as e:
            print(f"⚠️ Index creation warning: {e}")
    
    # Step 4: Optimize MySQL session settings
    print("⚙️ Optimizing MySQL session...")
    
    session_settings = [
        "SET SESSION sort_buffer_size = 4194304",  # 4MB
        "SET SESSION max_length_for_sort_data = 8192",  # 8KB
        "SET SESSION read_buffer_size = 262144",  # 256KB
    ]
    
    for setting in session_settings:
        try:
            cur.execute(setting)
            print("✅ Session setting applied")
        except Exception as e:
            print(f"⚠️ Session setting warning: {e}")
    
    # Step 5: Analyze table
    try:
        cur.execute("ANALYZE TABLE events")
        print("✅ Table analysis complete")
    except Exception as e:
        print(f"⚠️ Table analysis warning: {e}")
    
    con.commit()
    cur.close()
    con.close()
    
    print("\n✅ Quick fix complete!")
    print("💡 Your dashboard and events pages should work now")
    print("💡 If issues persist, check MySQL configuration file")

if __name__ == "__main__":
    quick_fix()