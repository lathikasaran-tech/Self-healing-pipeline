"""
GitHub Uploader Script for Self-Healing Pipeline Project.
Pushes project files directly to GitHub using GitHub REST API.
"""

import os
import sys
import json
import base64
import urllib.request
import urllib.error

REPO_OWNER = "lathikasaran-tech"
REPO_NAME = "Self-healing-pipeline"
BRANCH = "main"

IGNORE_DIRS = {"node_modules", ".tools", "dist", "build", ".git", ".idea", ".vscode", "__pycache__"}
IGNORE_FILES = {".env", ".env.local", "Thumbs.db", ".DS_Store"}

def get_all_project_files(base_dir: str):
    file_paths = []
    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for f in files:
            if f in IGNORE_FILES or f.endswith(".tsbuildinfo"):
                continue
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, base_dir).replace("\\", "/")
            file_paths.append((full_path, rel_path))
    return file_paths

def check_token_and_repo(token: str):
    # Check user
    user_url = "https://api.github.com/user"
    req = urllib.request.Request(user_url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json"
    })
    try:
        with urllib.request.urlopen(req) as resp:
            scopes = resp.headers.get("X-OAuth-Scopes", "")
            user_data = json.loads(resp.read().decode("utf-8"))
            print(f"Authenticated as: {user_data.get('login')} (Token Scopes: '{scopes}')")
            if not scopes or "repo" not in scopes:
                print("⚠️ [WARNING] Token is missing 'repo' scope! Pushing files will fail with 404.")
                print("👉 Please create a token with 'repo' scope at: https://github.com/settings/tokens/new")
    except Exception as e:
        print(f"[ERROR] Failed to authenticate token: {e}")

    # Check if repo exists, create if missing
    repo_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}"
    r_req = urllib.request.Request(repo_url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json"
    })
    try:
        with urllib.request.urlopen(r_req) as resp:
            print(f"Target repository https://github.com/{REPO_OWNER}/{REPO_NAME} exists.")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"Repository {REPO_OWNER}/{REPO_NAME} not found. Attempting auto-creation...")
            create_url = "https://api.github.com/user/repos"
            payload = json.dumps({"name": REPO_NAME, "description": "Self-Healing Data Pipeline Agent System", "auto_init": True}).encode("utf-8")
            c_req = urllib.request.Request(create_url, data=payload, method="POST", headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json"
            })
            try:
                with urllib.request.urlopen(c_req) as c_resp:
                    print(f"Successfully created repository: https://github.com/{REPO_OWNER}/{REPO_NAME}")
            except Exception as create_err:
                print(f"[ERROR] Auto-creation failed: {create_err}")

def upload_file_to_github(token: str, full_path: str, rel_path: str):
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/{rel_path}"

    with open(full_path, "rb") as f:
        content_bytes = f.read()

    base64_content = base64.b64encode(content_bytes).decode("utf-8")

    sha = None
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json"
    })
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            sha = data.get("sha")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            print(f"  [WARN] Checking SHA for {rel_path} returned {e.code}")

    payload = {
        "message": f"Upload project file: {rel_path}",
        "content": base64_content,
        "branch": BRANCH
    }
    if sha:
        payload["sha"] = sha

    req_data = json.dumps(payload).encode("utf-8")
    put_req = urllib.request.Request(url, data=req_data, method="PUT", headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
    })

    try:
        with urllib.request.urlopen(put_req) as resp:
            print(f"  [SUCCESS] Uploaded {rel_path}")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"  [ERROR] Failed to upload {rel_path}: HTTP {e.code} - {err_msg}")

def main():
    token = os.environ.get("GITHUB_TOKEN") or (sys.argv[1] if len(sys.argv) > 1 else None)
    if not token:
        print("Usage: py scripts/push_to_github.py <YOUR_GITHUB_PERSONAL_ACCESS_TOKEN>")
        sys.exit(1)

    project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    check_token_and_repo(token)

    files = get_all_project_files(project_dir)
    print(f"\nUploading {len(files)} files to https://github.com/{REPO_OWNER}/{REPO_NAME}...\n")

    success_count = 0
    for full_path, rel_path in files:
        try:
            upload_file_to_github(token, full_path, rel_path)
            success_count += 1
        except Exception as err:
            print(f"  [ERROR] Exception uploading {rel_path}: {err}")

    print(f"\nFinished uploading! ({success_count}/{len(files)} files uploaded)")

if __name__ == "__main__":
    main()
