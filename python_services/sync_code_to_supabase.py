"""
Code Sync Script for Autonomous Self-Healing Pipeline Project.
Scans Python services, SQL migrations, and frontend services/components,
computes metadata and SHA256 checksums, and syncs them to the Supabase code_repository table.
"""

import os
import glob
import hashlib
import sys
from typing import Dict, Any, List

# Ensure utf-8 stdout encoding for Windows console compatibility
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Try importing Supabase client if configured
try:
    from supabase import create_client, Client
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("SUPABASE_ANON_KEY", ""))
    supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None
except Exception:
    supabase_client = None

try:
    from python_services import db
except ImportError:
    import db

def detect_language(ext: str) -> str:
    ext = ext.lower()
    if ext == ".py":
        return "python"
    elif ext == ".sql":
        return "sql"
    elif ext in [".ts", ".tsx"]:
        return "typescript"
    elif ext == ".json":
        return "json"
    elif ext == ".md":
        return "markdown"
    return "text"

def detect_category(file_path: str) -> str:
    path_norm = file_path.replace("\\", "/")
    if "python_services/" in path_norm:
        return "python_service"
    elif "supabase/migrations/" in path_norm:
        return "sql_migration"
    elif "src/" in path_norm:
        return "frontend_component"
    return "other"

def scan_codebase(root_dir: str) -> List[Dict[str, Any]]:
    patterns = [
        os.path.join(root_dir, "python_services", "*.py"),
        os.path.join(root_dir, "supabase", "migrations", "*.sql"),
        os.path.join(root_dir, "supabase", "*.sql"),
        os.path.join(root_dir, "src", "services", "*.ts"),
        os.path.join(root_dir, "src", "lib", "*.ts"),
        os.path.join(root_dir, "src", "components", "*.tsx"),
    ]
    
    files_found = []
    for pattern in patterns:
        for filepath in glob.glob(pattern):
            if os.path.isfile(filepath) and not filepath.endswith("__pycache__"):
                files_found.append(filepath)
                
    results = []
    for filepath in files_found:
        rel_path = os.path.relpath(filepath, root_dir).replace("\\", "/")
        ext = os.path.splitext(filepath)[1]
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            print(f"[Warning] Could not read {filepath}: {e}")
            continue

        checksum = hashlib.sha256(content.encode("utf-8")).hexdigest()
        category = detect_category(rel_path)
        lang = detect_language(ext)

        file_item = {
            "file_path": rel_path,
            "file_name": os.path.basename(rel_path),
            "file_category": category,
            "language": lang,
            "code_content": content,
            "checksum": checksum,
        }
        results.append(file_item)

    return results

def sync_code_to_supabase(root_dir: str = None) -> Dict[str, Any]:
    if root_dir is None:
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    code_items = scan_codebase(root_dir)
    synced_records = []
    supabase_synced_count = 0

    for item in code_items:
        # Sync in-memory / DB abstraction
        rec = db.upsert_code_file(item)
        synced_records.append(rec)

        # Sync to live Supabase Postgres if client configured
        if supabase_client:
            try:
                data = {
                    "file_path": item["file_path"],
                    "file_name": item["file_name"],
                    "file_category": item["file_category"],
                    "language": item["language"],
                    "code_content": item["code_content"],
                    "checksum": item["checksum"],
                    "is_active": True,
                    "updated_at": "now()"
                }
                supabase_client.table("code_repository").upsert(data, on_conflict="file_path").execute()
                supabase_synced_count += 1
            except Exception as e:
                print(f"[Warning] Live Supabase sync failed for {item['file_path']}: {e}")

    summary = {
        "status": "SUCCESS",
        "total_files_scanned": len(code_items),
        "local_db_synced": len(synced_records),
        "supabase_live_synced": supabase_synced_count,
        "files": [r["file_path"] for r in synced_records]
    }
    return summary

if __name__ == "__main__":
    print("[Sync] Running Code Sync to Supabase...")
    res = sync_code_to_supabase()
    print(f"[Sync] Code Sync Completed: {res['total_files_scanned']} files processed.")
    for f in res["files"]:
        print(f"  - {f}")
