"""
분개장 맞춤형 열 매핑 및 정제 엔진

모드 1 — 헤더 추출:
  python clean_vendors.py <파일경로> --headers
  → 1행 열 이름 목록을 JSON 배열로 stdout 출력

모드 2 — 정제 실행:
  python clean_vendors.py <파일경로> <매핑JSON>
  매핑JSON 구조:
    {
      "account":     ["열이름A", "열이름B"],  # 1~2개
      "debit":       "열이름",
      "credit":      "열이름",
      "description": "열이름",
      "vendor":      "열이름"
    }
  → 바탕화면에 '가공완료_맞춤형_분개장.xlsx' 저장

필요 패키지: pip install pandas openpyxl
"""

import sys
import os
import json
import pandas as pd

# Windows 콘솔 기본 코드페이지(CP949 등)로 stdout/stderr가 인코딩되면
# Electron 쪽에서 UTF-8로 디코딩할 때 한글이 깨진다. 명시적으로 UTF-8 고정.
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

OUTPUT_COLS = ['계정명', '차변', '대변', '적요', '거래처코드']
OUTPUT_FILE = '가공완료_맞춤형_분개장.xlsx'


# ── 공통 유틸 ──

def read_file(file_path, ext):
    if ext == '.csv':
        try:
            return pd.read_csv(file_path, encoding='utf-8-sig')
        except UnicodeDecodeError:
            return pd.read_csv(file_path, encoding='cp949')
    return pd.read_excel(file_path)


def get_desktop():
    try:
        import ctypes, ctypes.wintypes
        buf = ctypes.create_unicode_buffer(ctypes.wintypes.MAX_PATH)
        ctypes.windll.shell32.SHGetFolderPathW(0, 0, 0, 0, buf)
        path = buf.value
        if os.path.isdir(path):
            return path
    except Exception:
        pass
    return os.path.expanduser('~')


# ── 모드 1: 헤더 추출 ──

def get_headers(file_path):
    try:
        _, ext = os.path.splitext(file_path)
        ext = ext.lower()
        if ext == '.csv':
            try:
                df = pd.read_csv(file_path, nrows=0, encoding='utf-8-sig')
            except UnicodeDecodeError:
                df = pd.read_csv(file_path, nrows=0, encoding='cp949')
        else:
            df = pd.read_excel(file_path, nrows=0)
        print(json.dumps(list(df.columns), ensure_ascii=False), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False), flush=True)
        sys.exit(1)


# ── 모드 2: 정제 실행 ──

def main(file_path, mapping):
    # 1. 파일 존재 확인
    if not os.path.exists(file_path):
        print(f"[오류] 파일을 찾을 수 없습니다: {file_path}", flush=True)
        sys.exit(1)

    _, ext = os.path.splitext(file_path)
    ext = ext.lower()
    if ext not in ('.xlsx', '.xls', '.csv'):
        print(f"[오류] 지원하지 않는 파일 형식: {ext}", flush=True)
        sys.exit(1)

    # 2. 파일 읽기
    print(f"파일 읽는 중: {os.path.basename(file_path)}", flush=True)
    try:
        df = read_file(file_path, ext)
    except Exception as e:
        print(f"[오류] 파일 읽기 실패: {e}", flush=True)
        sys.exit(1)

    original_count = len(df)
    print(f"원본 행 수: {original_count:,}행", flush=True)

    # 3. 매핑 유효성 검사
    account_cols = mapping.get('account', [])
    debit_col    = mapping.get('debit')
    credit_col   = mapping.get('credit')
    desc_col     = mapping.get('description')
    vendor_col   = mapping.get('vendor')

    required_cols = account_cols + [debit_col, credit_col, desc_col, vendor_col]
    missing = [c for c in required_cols if c and c not in df.columns]
    if missing:
        print(f"[오류] 파일에 없는 열: {missing}", flush=True)
        print(f"현재 열 목록: {list(df.columns)}", flush=True)
        sys.exit(1)

    # 4. 계정명 열 통합 (행 변형 없음)
    print(f"\n계정명 통합 중 (매핑: {account_cols})...", flush=True)
    if len(account_cols) == 2:
        col_a = df[account_cols[0]].fillna('').astype(str).str.strip()
        col_b = df[account_cols[1]].fillna('').astype(str).str.strip()
        df['계정명'] = col_a.where(col_a != '', col_b)

        used_a = int((col_a != '').sum())
        used_b = int(((col_a == '') & (col_b != '')).sum())
        blank  = int(((col_a == '') & (col_b == '')).sum())
        print(f"  '{account_cols[0]}' 채택: {used_a:,}행", flush=True)
        print(f"  '{account_cols[1]}' 채택: {used_b:,}행", flush=True)
        if blank:
            print(f"  양쪽 공란: {blank:,}행 (빈 값 유지)", flush=True)
    else:
        df['계정명'] = df[account_cols[0]].fillna('').astype(str).str.strip()
        print(f"  '{account_cols[0]}' 단독 사용", flush=True)

    # 5. 열 이름 표준 컬럼명으로 매핑
    df['차변'] = df[debit_col]
    df['대변'] = df[credit_col]
    df['적요'] = df[desc_col]
    df['거래처코드'] = df[vendor_col]

    # 6. 열 순서 재배치
    df_out = df[OUTPUT_COLS].copy()

    # 7. 행 수 보존 검증
    if len(df_out) != original_count:
        print(f"[치명적 오류] 행 수 불일치! 원본={original_count}, 결과={len(df_out)}", flush=True)
        sys.exit(1)
    print(f"\n행 수 보존 검증 통과: {len(df_out):,}행 (원본과 동일)", flush=True)

    # 8. 바탕화면에 저장
    out_path = os.path.join(get_desktop(), OUTPUT_FILE)
    try:
        df_out.to_excel(out_path, index=False)
    except Exception as e:
        print(f"[오류] 파일 저장 실패: {e}", flush=True)
        sys.exit(1)

    print(f"저장 완료 → {out_path}", flush=True)
    print(f"출력 열 순서: {OUTPUT_COLS}", flush=True)


# ── 진입점 ──

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("[오류] 파일 경로 인수가 없습니다.", flush=True)
        sys.exit(1)

    file_path = sys.argv[1]

    if '--headers' in sys.argv:
        get_headers(file_path)
    elif len(sys.argv) >= 3:
        try:
            mapping = json.loads(sys.argv[2])
        except json.JSONDecodeError as e:
            print(f"[오류] 매핑 JSON 파싱 실패: {e}", flush=True)
            sys.exit(1)
        main(file_path, mapping)
    else:
        print("[오류] 매핑 정보 또는 --headers 플래그가 필요합니다.", flush=True)
        sys.exit(1)
