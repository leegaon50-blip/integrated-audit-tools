# 감사 데이터 정제 툴 (audit-data-tool)

인터넷이 없는 오프라인 환경에서 회계 감사용 분개장 데이터를 정제하기 위한 Electron 기반 데스크톱 앱.

- 버전: v2.0.0
- 실행 파일명(빌드 시): 감사데이터정제툴
- appId: `com.audit.data-tool`

## 주요 기능

**분개장 맞춤형 열 매핑 및 정제** (현재 유일한 탭)

1. 엑셀(.xlsx/.xls) 또는 CSV 파일을 드래그 앤 드롭 또는 클릭으로 업로드
2. 업로드한 파일의 1행(헤더)을 읽어 열 이름 칩을 자동 생성
3. 사용자가 칩을 아래 5개 매핑 박스로 드래그하여 열 매핑을 지정
   - **계정명** (최대 2개 — 예: 차변 계정명 + 대변 계정명을 하나의 계정명 열로 통합)
   - **차변금액** (1개)
   - **대변금액** (1개)
   - **적요** (1개)
   - **거래처코드** (1개)
4. "정제 시작" 클릭 시 Python 스크립트가 실행되어:
   - 계정명 2개 매핑 시 첫 번째 값이 있으면 채택, 없으면 두 번째 값으로 대체(계정명 통합)
   - 매핑된 열을 표준 컬럼명(`계정명, 차변, 대변, 적요, 거래처코드`)으로 재배치
   - **원본 대비 행 수가 보존되는지 검증** (불일치 시 치명적 오류로 중단 — 데이터 누락/중복 방지)
   - 결과를 바탕화면에 `가공완료_맞춤형_분개장.xlsx` 로 저장
5. 실행 로그 패널에서 처리 과정(원본 행 수, 계정명 채택 통계, 저장 경로 등)을 실시간 확인

## 아키텍처

```
main.js          Electron 메인 프로세스. IPC 핸들러 2개:
                    - get-file-headers : Python --headers 모드 호출, 헤더 배열(JSON) 반환
                    - run-python-script: Python 정제 스크립트 실행, stdout/stderr를 실시간 스트리밍
preload.js        contextBridge로 window.electronAPI 노출 (contextIsolation 적용, nodeIntegration 없음)
renderer/
  index.html      UI 마크업 (탭 네비 + 드롭존 + 칩 풀 + 매핑 박스 + 실행 로그)
  renderer.js     드래그앤드롭, 칩 생성, 매핑 상태 관리, IPC 호출
  styles.css      스타일
python/
  clean_vendors.py  실제 정제 로직 (pandas, openpyxl 필요)
                    모드 1: --headers 플래그 → 헤더만 추출해 JSON 반환
                    모드 2: 매핑 JSON 인수 → 정제 실행 후 xlsx 저장
```

### IPC 채널
- `get-file-headers` (invoke) — 파일 경로 → 헤더 배열
- `run-python-script` (invoke) — `{ scriptName, filePath, mapping }` → 실행
- `python-output` (on) — 실행 중 로그 스트리밍
- `python-done` (on) — 종료 코드 전달

## 실행 / 빌드

```
npm start          # 개발 실행 (electron . 1회 실행, 변경 감지 없음)
npm run dev        # 개발 실행 + 자동 재시작 (nodemon, 권장)
npm run build      # electron-builder로 dist/ 에 NSIS .exe 생성
```

Python 3 + `pandas`, `openpyxl` 패키지가 로컬에 설치되어 있어야 하며, `python` 명령이 PATH에 있어야 함(`main.js`에서 `spawn('python', ...)` 로 호출).

### 개발 워크플로우 (Watch / 자동 재시작)

`npm start`(`electron .`)는 asar 없이 소스를 직접 실행하는 개발 모드이므로, 패키징(`npm run build`) 없이도 대부분의 수정을 바로 테스트할 수 있다. `npm run build` + `dist/` 설치본 실행은 **asar 언패킹 경로처럼 패키징 자체를 검증할 때만** 필요하다.

- `npm run dev` 실행 시 `nodemon.json` 설정에 따라 `main.js`, `preload.js`, `renderer/**`(`.js/.html/.css`)를 감시하다가 변경되면 nodemon이 실행 중인 Electron 프로세스를 종료하고 `electron .`을 재실행한다.
- `python/**`는 nodemon 감시 대상에서 **의도적으로 제외**했다. Python은 매번 "정제 시작"/파일 업로드 시 `spawn('python', <파일경로>, ...)`으로 디스크의 최신 파일을 새로 실행하므로, `clean_vendors.py`를 수정한 뒤 Electron을 재시작할 필요 없이 앱에서 다시 실행 버튼만 누르면 바로 반영된다.
- main.js/preload.js/renderer 변경은 앱 창이 자동으로 닫혔다 다시 뜨는 방식으로 반영된다(핫 리로드가 아닌 프로세스 재시작 방식 — Electron 특성상 가장 안정적).

### 트러블슈팅: `npm start`/`npm run dev` 실행 시 electron 바이너리 오류

`node_modules/electron/dist/`에 `electron.exe`가 없거나(`locales`만 존재) `Electron failed to install correctly` 에러가 나면, `npm install` 시 electron의 postinstall 다운로드가 실패한 것이다. 아래로 복구:

```
node node_modules/electron/install.js
```

그래도 `dist/`가 비어 있으면(대용량 zip 압축 해제 중 중단되는 경우) 아래처럼 캐시된 zip을 PowerShell로 직접 해제한다(`path.txt`는 BOM 없이 저장해야 함 — `Set-Content -Encoding utf8`은 BOM을 넣어 `spawn ... ENOENT` 오류를 유발하므로 피할 것):

```powershell
Expand-Archive -Path "$env:LOCALAPPDATA\electron\Cache\<hash>\electron-vX.X.X-win32-x64.zip" -DestinationPath "node_modules\electron\dist" -Force
[System.IO.File]::WriteAllText("node_modules\electron\path.txt", "electron.exe")
```

### asar 패키징 주의사항

`python/**`는 `asarUnpack` 설정으로 `app.asar` 밖(`resources/app.asar.unpacked/python/`)에 압축 해제된다. asar 아카이브 내부 경로는 Electron/Node 외의 외부 프로세스(`python.exe`)가 직접 읽을 수 없기 때문에, `main.js`의 `getPythonScriptPath()`가 `app.isPackaged` 여부에 따라 개발 모드에서는 `__dirname/python`을, 패키징된 빌드에서는 `process.resourcesPath/app.asar.unpacked/python`을 가리키도록 분기한다. 새 Python 스크립트를 추가해도 이 헬퍼를 통해 경로를 구하면 별도 처리가 필요 없다.

### 한글 인코딩(stdout/stderr) 주의사항

한글 Windows의 콘솔 기본 코드페이지(CP949)로 Python이 stdout/stderr를 인코딩하면, Node.js에서 UTF-8로 디코딩할 때 한글이 깨진다(예: 열 이름 칩이 `䝂`, `뽵` 등으로 표시됨). 이를 막기 위해 이중으로 UTF-8을 강제한다:

- `python/clean_vendors.py` 최상단에서 `sys.stdout.reconfigure(encoding='utf-8')` / `sys.stderr.reconfigure(encoding='utf-8')` 호출
- `main.js`의 `spawnPython()` 헬퍼가 `PYTHONIOENCODING=utf-8` 환경변수를 주입하고, `stdout`/`stderr`에 `setEncoding('utf8')`을 설정

새 Python 스크립트를 추가할 때도 파일 상단에 위 `reconfigure` 두 줄을 반드시 포함할 것.

## 확장 포인트

- **새 정제 탭 추가:** `renderer/index.html`의 `.tab-nav`에 버튼 추가 + 대응하는 `<section id="tab-...">` 패널 작성, `renderer.js`에 로직 추가
- **새 Python 스크립트 추가:** `python/` 폴더에 스크립트 배치 후 렌더러에서 `runPythonScript(scriptName, ...)` 호출 시 파일명 지정
- **출력 컬럼 변경:** `clean_vendors.py`의 `OUTPUT_COLS` 상수 수정

## 알려진 제약

- 아이콘 미포함 시 빌드는 기본 Electron 아이콘 사용 (`assets/icon.ico` 부재)
- CSV는 UTF-8-SIG 우선 시도 후 실패 시 CP949(한글 Windows 기본 인코딩)로 재시도
