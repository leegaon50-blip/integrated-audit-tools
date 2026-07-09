'use strict';

// ── 매핑 상태 ──
// 각 박스가 담고 있는 열 이름 배열. account만 max=2, 나머지 max=1.
const boxState = {
  account:     [],
  debit:       [],
  credit:      [],
  description: [],
  vendor:      [],
};

const BOX_MAX = { account: 2, debit: 1, credit: 1, description: 1, vendor: 1 };

// 현재 드래그 중인 열 이름 (dragover에서 getData 불가 문제 우회)
let draggingCol = null;
let selectedFilePath = null;
let allHeaders = [];

// ── DOM References ──
const dropzone        = document.getElementById('dropzone');
const fileInput       = document.getElementById('file-input');
const fileInfo        = document.getElementById('file-info');
const fileNameEl      = document.getElementById('file-name');
const clearFileBtn    = document.getElementById('clear-file');
const chipPoolSection = document.getElementById('chip-pool-section');
const chipPool        = document.getElementById('chip-pool');
const mappingSection  = document.getElementById('mapping-section');
const btnRun          = document.getElementById('btn-run');
const btnResetMapping = document.getElementById('btn-reset-mapping');
const logBox          = document.getElementById('log-box');
const logOutput       = document.getElementById('log-output');
const btnClearLog     = document.getElementById('btn-clear-log');

// ── 탭 네비게이션 ──
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── 파일 업로드 드롭존 ──
dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  // 파일 드래그일 때만 강조 (칩 드래그와 구분)
  if (Array.from(e.dataTransfer.types).includes('Files')) {
    dropzone.classList.add('drag-over');
  }
});

dropzone.addEventListener('dragleave', (e) => {
  if (!dropzone.contains(e.relatedTarget)) {
    dropzone.classList.remove('drag-over');
  }
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  if (!Array.from(e.dataTransfer.types).includes('Files')) return;

  const file = e.dataTransfer.files[0];
  if (!file) return;

  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
    appendLog(`[오류] 지원하지 않는 파일 형식: ${ext}\n허용 형식: .xlsx · .xls · .csv`);
    showLog();
    return;
  }

  handleFileSelect(file.path, file.name);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFileSelect(file.path, file.name);
});

clearFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetAll();
});

// ── 파일 선택 처리: 헤더 파싱 → 칩 렌더링 ──
async function handleFileSelect(filePath, name) {
  selectedFilePath = filePath;
  fileNameEl.textContent = name;
  fileInfo.classList.remove('hidden');
  dropzone.classList.add('compact');

  resetMappingState();
  chipPool.innerHTML = '<span class="chip-loading">열 이름을 읽는 중...</span>';
  chipPoolSection.classList.remove('hidden');
  mappingSection.classList.add('hidden');
  btnResetMapping.classList.add('hidden');

  try {
    const headers = await window.electronAPI.getFileHeaders(filePath);
    if (!Array.isArray(headers) || headers.length === 0) {
      throw new Error('열 이름을 가져올 수 없습니다. 파일 형식을 확인하세요.');
    }
    allHeaders = headers;
    renderChipPool(headers);
    mappingSection.classList.remove('hidden');
    btnResetMapping.classList.remove('hidden');
  } catch (err) {
    chipPool.innerHTML = `<span class="chip-error">[오류] ${err.message}</span>`;
    appendLog(`[오류] 헤더 읽기 실패: ${err.message}`);
    showLog();
  }
}

// ── 칩 풀 렌더링 ──
function renderChipPool(headers) {
  chipPool.innerHTML = '';
  headers.forEach((col) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.draggable = true;
    chip.dataset.col = col;
    chip.textContent = col;

    chip.addEventListener('dragstart', (e) => {
      if (chip.classList.contains('used')) {
        e.preventDefault();
        return;
      }
      draggingCol = col;
      e.dataTransfer.setData('text/plain', col);
      e.dataTransfer.effectAllowed = 'move';
      chip.classList.add('dragging');
    });

    chip.addEventListener('dragend', () => {
      draggingCol = null;
      chip.classList.remove('dragging');
    });

    chipPool.appendChild(chip);
  });
}

// pool 칩의 used 상태 토글
function markPoolChip(col, used) {
  const chip = chipPool.querySelector(`.chip[data-col="${CSS.escape(col)}"]`);
  if (!chip) return;
  chip.classList.toggle('used', used);
  chip.draggable = !used;
}

// ── 매핑 박스 초기화 (DOM 준비 후 한 번 실행) ──
function initMappingBoxes() {
  document.querySelectorAll('.map-box').forEach((box) => {
    const key = box.dataset.key;
    const max = BOX_MAX[key];

    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (
        draggingCol &&
        boxState[key].length < max &&
        !boxState[key].includes(draggingCol)
      ) {
        box.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
      } else {
        box.classList.remove('drag-over');
        e.dataTransfer.dropEffect = 'none';
      }
    });

    box.addEventListener('dragleave', (e) => {
      if (!box.contains(e.relatedTarget)) {
        box.classList.remove('drag-over');
      }
    });

    box.addEventListener('drop', (e) => {
      e.preventDefault();
      box.classList.remove('drag-over');

      const col = e.dataTransfer.getData('text/plain');
      if (!col) return;
      if (boxState[key].length >= max) return;
      if (boxState[key].includes(col)) return;

      boxState[key].push(col);
      markPoolChip(col, true);
      renderBoxSlots(key, box);
      checkMappingComplete();
    });
  });
}

// 박스 내부 슬롯 칩 렌더링
function renderBoxSlots(key, boxEl) {
  const slotsEl = boxEl.querySelector('.box-slots');
  const placeholder = boxEl.querySelector('.box-placeholder');
  slotsEl.innerHTML = '';

  boxState[key].forEach((col) => {
    const slot = document.createElement('div');
    slot.className = 'slot-chip';

    const label = document.createElement('span');
    label.textContent = col;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'chip-remove';
    removeBtn.title = '제거';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      boxState[key] = boxState[key].filter((c) => c !== col);
      markPoolChip(col, false);
      renderBoxSlots(key, boxEl);
      checkMappingComplete();
    });

    slot.appendChild(label);
    slot.appendChild(removeBtn);
    slotsEl.appendChild(slot);
  });

  // 슬롯이 채워지면 placeholder 숨김
  if (placeholder) {
    placeholder.style.display = boxState[key].length > 0 ? 'none' : '';
  }
}

// 모든 박스가 최소 1개 매핑되었는지 확인 → 버튼 활성화
function checkMappingComplete() {
  const complete =
    boxState.account.length >= 1 &&
    boxState.debit.length === 1 &&
    boxState.credit.length === 1 &&
    boxState.description.length === 1 &&
    boxState.vendor.length === 1;
  btnRun.disabled = !complete;
}

// ── 매핑 초기화 (파일 유지, 칩만 리셋) ──
function resetMappingState() {
  Object.keys(boxState).forEach((k) => { boxState[k] = []; });
  document.querySelectorAll('.map-box').forEach((box) => {
    const slotsEl = box.querySelector('.box-slots');
    if (slotsEl) slotsEl.innerHTML = '';
    const placeholder = box.querySelector('.box-placeholder');
    if (placeholder) placeholder.style.display = '';
    box.classList.remove('drag-over');
  });
  btnRun.disabled = true;
}

// 파일 포함 전체 리셋
function resetAll() {
  selectedFilePath = null;
  allHeaders = [];
  fileInput.value = '';
  fileInfo.classList.add('hidden');
  dropzone.classList.remove('compact');
  chipPoolSection.classList.add('hidden');
  mappingSection.classList.add('hidden');
  btnResetMapping.classList.add('hidden');
  resetMappingState();
}

btnResetMapping.addEventListener('click', () => {
  resetMappingState();
  if (allHeaders.length > 0) renderChipPool(allHeaders);
});

// ── 로그 헬퍼 ──
function appendLog(text) {
  logOutput.textContent += text;
  logOutput.scrollTop = logOutput.scrollHeight;
}

function showLog() {
  logBox.classList.remove('hidden');
}

btnClearLog.addEventListener('click', () => {
  logOutput.textContent = '';
  logBox.classList.add('hidden');
});

// ── [정제 시작] ──
btnRun.addEventListener('click', async () => {
  if (!selectedFilePath) return;

  const mapping = {
    account:     [...boxState.account],
    debit:       boxState.debit[0],
    credit:      boxState.credit[0],
    description: boxState.description[0],
    vendor:      boxState.vendor[0],
  };

  window.electronAPI.removeAllListeners('python-output');
  window.electronAPI.removeAllListeners('python-done');

  logOutput.textContent = '';
  showLog();
  appendLog(`처리 시작: ${selectedFilePath}\n${'─'.repeat(60)}\n`);
  appendLog(`매핑 정보: ${JSON.stringify(mapping, null, 2)}\n${'─'.repeat(60)}\n`);

  btnRun.disabled = true;
  btnRun.textContent = '처리 중...';
  btnRun.classList.add('running');

  window.electronAPI.onPythonOutput((data) => appendLog(data));

  window.electronAPI.onPythonDone(({ code }) => {
    appendLog(`\n${'─'.repeat(60)}\n`);
    appendLog(code === 0
      ? '✓ 정제가 완료되었습니다.\n'
      : `✗ 오류로 종료되었습니다. (코드: ${code})\n`
    );
    btnRun.textContent = '정제 시작';
    btnRun.classList.remove('running');
    checkMappingComplete();
  });

  try {
    await window.electronAPI.runPythonScript('clean_vendors.py', selectedFilePath, mapping);
  } catch {
    // 오류는 python-output / python-done 이벤트로 처리됨
  }
});

// ── 초기화 ──
initMappingBoxes();
