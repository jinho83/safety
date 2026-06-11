import os
import sys
import time
import subprocess

WATCH_DIR = r"공종"
DB_PIPELINE = "db_pipeline.py"
EXPORT_JSON = "export_json.py"

def get_pdf_files(directory):
    pdf_files = {}
    if not os.path.exists(directory):
        return pdf_files
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.lower().endswith(".pdf"):
                full_path = os.path.join(root, file)
                try:
                    pdf_files[full_path] = os.path.getmtime(full_path)
                except OSError:
                    pass
    return pdf_files

def run_pipeline():
    print("\n[Watcher] 파일 변경이 감지되었습니다. 파이프라인 가동 중...")
    try:
        # 1. Run db_pipeline.py to update SQLite
        print("[Watcher] 1/2. db_pipeline.py 실행 중...")
        subprocess.run([sys.executable, DB_PIPELINE], check=True)
        
        # 2. Run export_json.py to rebuild data.json
        print("[Watcher] 2/2. export_json.py 실행 중...")
        subprocess.run([sys.executable, EXPORT_JSON], check=True)
        
        print("[Watcher] 성공: 데이터베이스 및 data.json이 성공적으로 업데이트되었습니다!\n")
    except subprocess.CalledProcessError as e:
        print(f"[Watcher] 에러 발생: {e}\n")

def main():
    print("==================================================")
    print("  협력사 자가진단 PDF 폴더 감시 프로그램 가동 시작")
    print(f"  감시 대상 폴더: {os.path.abspath(WATCH_DIR)}")
    print("  새로운 PDF가 추가되거나 변경되면 대시보드 데이터를 자동 빌드합니다.")
    print("==================================================")
    
    last_state = get_pdf_files(WATCH_DIR)
    print(f"현재 감지된 PDF 파일 개수: {len(last_state)}개")
    print("대기 중... (종료하려면 Ctrl+C)")
    
    try:
        while True:
            time.sleep(2)
            current_state = get_pdf_files(WATCH_DIR)
            
            # Compare states
            has_changes = False
            
            # Check for additions or modifications
            for path, mtime in current_state.items():
                if path not in last_state:
                    print(f"\n[Watcher] 신규 파일 발견: {os.path.basename(path)}")
                    has_changes = True
                elif mtime > last_state[path]:
                    print(f"\n[Watcher] 파일 수정 발견: {os.path.basename(path)}")
                    has_changes = True
            
            # Check for deletions
            for path in last_state:
                if path not in current_state:
                    print(f"\n[Watcher] 파일 삭제 발견: {os.path.basename(path)}")
                    has_changes = True
                    
            if has_changes:
                run_pipeline()
                last_state = current_state
    except KeyboardInterrupt:
        print("\n폴더 감시를 종료합니다.")

if __name__ == "__main__":
    main()
