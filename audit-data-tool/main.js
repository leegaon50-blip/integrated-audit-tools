const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// python/ 폴더는 asar 밖(app.asar.unpacked)에 압축 해제되므로,
// 패키징된 빌드에서는 그쪽 실제 경로를, 개발 모드에서는 __dirname을 사용한다.
// (asar 아카이브 내부 경로는 외부 프로세스인 python.exe가 읽을 수 없음)
function getPythonScriptPath(scriptName) {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'python')
    : path.join(__dirname, 'python');
  return path.join(base, scriptName);
}

// 한글 Windows의 콘솔 코드페이지(CP949 등)가 아닌 UTF-8로 파이썬 stdout/stderr을
// 강제한다. 스크립트 쪽 reconfigure(encoding='utf-8')와 이중 안전장치.
const PYTHON_ENV = { ...process.env, PYTHONIOENCODING: 'utf-8' };

function spawnPython(args) {
  const python = spawn('python', args, { env: PYTHON_ENV });
  python.stdout.setEncoding('utf8');
  python.stderr.setEncoding('utf8');
  return python;
}

// 파일 헤더(1행 열 이름) 추출 — Python --headers 모드 호출, JSON 배열 반환
ipcMain.handle('get-file-headers', (_event, filePath) => {
  return new Promise((resolve, reject) => {
    const scriptPath = getPythonScriptPath('clean_vendors.py');
    const python = spawnPython([scriptPath, filePath, '--headers']);

    let output = '';
    python.stdout.on('data', (data) => { output += data; });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`헤더 추출 실패 (코드 ${code})`));
        return;
      }
      try {
        resolve(JSON.parse(output.trim()));
      } catch {
        reject(new Error('헤더 JSON 파싱 실패'));
      }
    });

    python.on('error', (err) => reject(err));
  });
});

// Python 스크립트 실행 — mapping JSON을 세 번째 인수로 전달
ipcMain.handle('run-python-script', (event, { scriptName, filePath, mapping }) => {
  return new Promise((resolve, reject) => {
    const scriptPath = getPythonScriptPath(scriptName);
    const args = [scriptPath, filePath];
    if (mapping) args.push(JSON.stringify(mapping));
    const python = spawnPython(args);

    python.stdout.on('data', (data) => {
      event.sender.send('python-output', data);
    });

    python.stderr.on('data', (data) => {
      event.sender.send('python-output', `[STDERR] ${data}`);
    });

    python.on('close', (code) => {
      event.sender.send('python-done', { code });
      if (code === 0) resolve({ code });
      else reject(new Error(`Python 스크립트가 코드 ${code}으로 종료되었습니다.`));
    });

    python.on('error', (err) => {
      event.sender.send('python-output', `[ERROR] ${err.message}\n'python' 명령을 찾을 수 없습니다. PATH를 확인하세요.`);
      event.sender.send('python-done', { code: -1 });
      reject(err);
    });
  });
});
