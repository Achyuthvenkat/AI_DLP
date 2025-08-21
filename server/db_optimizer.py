# -*- coding: utf-8 -*-
"""
Database Optimizer Script for DLP System
This script helps optimize the database and fix memory issues.
"""

import os
import pymysql
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database configuration
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

def optimize_mysql_settings():
    """Set MySQL variables to handle large datasets better"""
    con = get_db()
    cur = con.cursor()
    
    print("🔧 Optimizing MySQL settings...")
    
    # Increase sort buffer size
    try:
        cur.execute("SET SESSION sort_buffer_size = 2097152")  # 2MB
        cur.execute("SET SESSION max_length_for_sort_data = 4096")  # 4KB
        cur.execute("SET SESSION read_buffer_size = 131072")  # 128KB
        print("✅ MySQL session variables optimized")
    except Exception as e:
        print(f"⚠️ Warning: Could not set session variables: {e}")
    
    # Check current settings
    cur.execute("SHOW VARIABLES LIKE 'sort_buffer_size'")
    result = cur.fetchone()
    print(f"📊 Current sort_buffer_size: {result['Value']} bytes")
    
    cur.close()
    con.close()

def add_missing_indexes():
    """Add missing database indexes for better performance"""
    con = get_db()
    cur = con.cursor()
    
    print("📋 Adding missing database indexes...")
    
    indexes = [
        ("idx_events_created_desc", "events", "created_at DESC"),
        ("idx_events_device_id", "events", "device_id"),
        ("idx_events_ai_label", "events", "ai_label"),
        ("idx_events_event_type", "events", "event_type"),
        ("idx_events_device_created", "events", "device_id, created_at DESC"),
        ("idx_devices_device_id", "devices", "device_id"),
        ("idx_assignments_policy", "policy_assignments", "policy_id"),
    ]
    
    for index_name, table, columns in indexes:
        try:
            # Check if index exists
            cur.execute(f"SHOW INDEX FROM {table} WHERE Key_name = %s", (index_name,))
            if not cur.fetchone():
                cur.execute(f"CREATE INDEX {index_name} ON {table} ({columns})")
                print(f"✅ Created index: {index_name}")
            else:
                print(f"ℹ️ Index already exists: {index_name}")
        except Exception as e:
            print(f"⚠️ Could not create index {index_name}: {e}")
    
    con.commit()
    cur.close()
    con.close()

def clean_old_data():
    """Remove old events to reduce database size"""
    con = get_db()
    cur = con.cursor()
    
    print("🧹 Cleaning old data...")
    
    # Get current event count
    cur.execute("SELECT COUNT(*) as total FROM events")
    total_events = cur.fetchone()["total"]
    print(f"📊 Current total events: {total_events}")
    
    if total_events > 1000:
        # Keep only the most recent 1000 events
        cur.execute("""
            DELETE FROM events 
            WHERE id NOT IN (
                SELECT * FROM (
                    SELECT id FROM events 
                    ORDER BY id DESC 
                    LIMIT 1000
                ) as subquery
            )
        """)
        
        deleted_count = cur.rowcount
        con.commit()
        print(f"✅ Deleted {deleted_count} old events, kept most recent 1000")
    else:
        print("ℹ️ Event count is manageable, no cleanup needed")
    
    cur.close()
    con.close()

def analyze_tables():
    """Analyze tables for better query optimization"""
    con = get_db()
    cur = con.cursor()
    
    print("📈 Analyzing tables...")
    
    tables = ["events", "devices", "users", "policies", "policy_assignments"]
    
    for table in tables:
        try:
            cur.execute(f"ANALYZE TABLE {table}")
            result = cur.fetchone()
            print(f"✅ Analyzed table: {table}")
        except Exception as e:
            print(f"⚠️ Could not analyze {table}: {e}")
    
    cur.close()
    con.close()

def show_database_stats():
    """Show current database statistics"""
    con = get_db()
    cur = con.cursor()
    
    print("\n📊 Database Statistics:")
    print("=" * 40)
    
    # Table sizes
    cur.execute("""
        SELECT table_name, 
               ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb,
               table_rows
        FROM information_schema.tables 
        WHERE table_schema = %s
        ORDER BY (data_length + index_length) DESC
    """, (DB_NAME,))
    
    tables = cur.fetchall()
    for table in tables:
        print(f"📋 {table['table_name']}: {table['size_mb']} MB, {table['table_rows']} rows")
    
    # Index information
    print("\n🔍 Index Information:")
    cur.execute("""
        SELECT table_name, index_name, column_name
        FROM information_schema.statistics 
        WHERE table_schema = %s 
        ORDER BY table_name, index_name
    """, (DB_NAME,))
    
    indexes = cur.fetchall()
    current_table = None
    for idx in indexes:
        if idx['table_name'] != current_table:
            print(f"\n📋 {idx['table_name']}:")
            current_table = idx['table_name']
        print(f"  - {idx['index_name']}: {idx['column_name']}")
    
    cur.close()
    con.close()

def fix_mysql_config_suggestions():
    """Show MySQL configuration suggestions"""
    print("\n⚙️ MySQL Configuration Suggestions:")
    print("=" * 50)
    print("Add these lines to your MySQL configuration file (my.cnf or my.ini):")
    print()
    print("[mysqld]")
    print("# Increase sort buffer for large datasets")
    print("sort_buffer_size = 4M")
    print("read_buffer_size = 1M")
    print("max_length_for_sort_data = 8192")
    print()
    print("# Increase memory limits")
    print("tmp_table_size = 64M")
    print("max_heap_table_size = 64M")
    print()
    print("# InnoDB optimizations")
    print("innodb_buffer_pool_size = 256M")
    print("innodb_sort_buffer_size = 4M")
    print()
    print("After making changes, restart MySQL service:")
    print("- Windows: services.msc -> MySQL -> Restart")
    print("- Linux: sudo systemctl restart mysql")

def emergency_cleanup():
    """Emergency cleanup for severely impacted databases"""
    con = get_db()
    cur = con.cursor()
    
    print("🚨 Emergency Database Cleanup...")
    
    # Get current count
    cur.execute("SELECT COUNT(*) as total FROM events")
    total = cur.fetchone()["total"]
    
    if total > 500:
        print(f"⚠️ Found {total} events, performing aggressive cleanup...")
        
        # Keep only last 100 events
        cur.execute("""
            DELETE FROM events 
            WHERE id NOT IN (
                SELECT * FROM (
                    SELECT id FROM events 
                    ORDER BY id DESC 
                    LIMIT 100
                ) as subquery
            )
        """)
        
        deleted = cur.rowcount
        con.commit()
        print(f"✅ Emergency cleanup complete: deleted {deleted} events, kept 100")
    else:
        print(f"ℹ️ Only {total} events found, no emergency cleanup needed")
    
    cur.close()
    con.close()

def main():
    """Main optimization routine"""
    print("🚀 DLP Database Optimizer")
    print("=" * 30)
    
    try:
        # Step 1: Show current stats
        show_database_stats()
        
        # Step 2: Optimize MySQL settings
        optimize_mysql_settings()
        
        # Step 3: Add missing indexes
        add_missing_indexes()
        
        # Step 4: Clean old data
        clean_old_data()
        
        # Step 5: Analyze tables
        analyze_tables()
        
        # Step 6: Show configuration suggestions
        fix_mysql_config_suggestions()
        
        print("\n✅ Database optimization complete!")
        print("💡 If you still see memory errors, run: python db_optimizer.py emergency")
        
    except Exception as e:
        print(f"❌ Error during optimization: {e}")
        print("💡 Try running: python db_optimizer.py emergency")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "emergency":
            print("🚨 Running emergency cleanup...")
            emergency_cleanup()
            add_missing_indexes()
            optimize_mysql_settings()
            
        elif command == "stats":
            show_database_stats()
            
        elif command == "clean":
            clean_old_data()
            
        elif command == "indexes":
            add_missing_indexes()
            
        elif command == "config":
            fix_mysql_config_suggestions()
            
        else:
            print("❌ Unknown command")
            print("Available commands: emergency, stats, clean, indexes, config")
    else:
        main()