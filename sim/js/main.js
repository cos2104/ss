/**
 * 빛의 중첩과 간섭 — 화면 제어
 * 메뉴 → 준비물 배치 → 실험 진행의 흐름과 학습 패널을 담당한다.
 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const canvas = $('#renderCanvas');
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

  const EXPS = {
    sound: SoundScene,
    double: DoubleSlitScene,
    single: SingleSlitScene,
  };
  Object.values(EXPS).forEach((e) => e.create(engine, canvas));

  let current = null;     // 현재 실험 모듈
  let phase = 'prep';     // 'prep' | 'run'
  let stepIdx = 0;

  /* ══ 탐구 수행 단계 (교과서 순서) ════════════ */
  const STEPS = {
    sound: [
      '스피커의 전원을 켭니다.',
      '소음측정기를 좌우로 옮겨 소리가 <b>가장 큰 곳</b>(보강)을 찾아 «기록»합니다.',
      '«다음 상쇄 지점»으로 소리가 <b>가장 작은 곳</b>을 찾아 기록합니다.',
      '보강 지점 사이의 간격을 재고 파장 <i>λ</i>과 비교합니다.',
      '진동수·스피커 간격을 바꾸어 간격 변화를 확인합니다.',
    ],
    double: [
      '스크린까지의 거리를 교과서 조건인 <b>1 m</b>로 맞춥니다.',
      '초록색(532 nm) 레이저로 무늬 간격 Δ<i>x</i>를 재고 «기록»합니다.',
      '슬릿 간격 <i>d</i>를 0.2 → 0.4 mm로 바꾸어 기록합니다.',
      '빨간색(650 nm) 레이저로 과정 2~3을 반복합니다.',
      'Δ<i>x</i>가 <i>λ</i>에 비례하고 <i>d</i>에 반비례하는지 정리합니다.',
    ],
    single: [
      '슬릿의 폭을 가장 넓게 두고 스크린의 무늬를 관찰합니다.',
      '폭을 점점 좁히며 <b>중앙 밝은 무늬</b>가 넓어지는 것을 확인합니다.',
      '파장을 바꾸어 같은 관찰을 반복합니다.',
      '이중 슬릿의 무늬와 어떤 점이 다른지 비교합니다.',
    ],
  };

  function renderSteps() {
    const panel = $('#stepsPanel');
    if (!panel) return;
    const steps = current && STEPS[current.id];
    if (!steps || phase !== 'run') { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    stepIdx = Math.max(0, Math.min(stepIdx, steps.length - 1));
    $('#stepNo').textContent = `${stepIdx + 1} / ${steps.length}`;
    $('#stepPrev').disabled = stepIdx === 0;
    $('#stepNext').textContent = stepIdx === steps.length - 1 ? '완료 ✓' : '다음 ▶';
    $('#stepsBody').innerHTML = steps.map((s, i) => `
      <div class="step${i === stepIdx ? ' cur' : ''}${i < stepIdx ? ' done' : ''}">
        <span class="no">${i < stepIdx ? '✓' : i + 1}</span><div>${s}</div>
      </div>`).join('');
  }

  /* ══ 화면 전환 ═══════════════════════════════ */
  function showMenu() {
    $('#menuScreen').classList.remove('hidden');
    $('#labScreen').classList.add('hidden');
    current = null;
  }

  function openExperiment(id) {
    current = EXPS[id];
    $('#menuScreen').classList.add('hidden');
    $('#labScreen').classList.remove('hidden');
    $('#expTitle').textContent = current.title;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.exp === id));
    $('#graphTitle').textContent = current.graphTitle;

    current.resetTools();
    current.resetCamera();
    stepIdx = 0;
    setPhase('prep');
    engine.resize();
  }

  function setPhase(p) {
    phase = p;
    const prep = p === 'prep';
    $('#toolTray').classList.toggle('hidden', !prep);
    $('#controlSet').classList.toggle('hidden', prep);
    $('#guide').innerHTML = prep ? current.prepGuide : current.guide;
    if (prep) buildTray(); else buildControls();
    renderSteps();
    refresh();
  }

  /* ══ 준비물 트레이 ═══════════════════════════ */
  function buildTray() {
    const host = $('#trayItems');
    host.innerHTML = current.tools.map((t) => `
      <button class="tray-item" data-tool="${t.id}">
        ${Lab.Icons[t.icon]}
        <span>${t.label}</span>
      </button>`).join('');
    $$('.tray-item', host).forEach((el) => el.addEventListener('pointerdown', startDrag));
  }

  function markPlaced(id) {
    const el = $(`.tray-item[data-tool="${id}"]`);
    if (el) el.classList.add('placed');
    if (current.allPlaced()) setTimeout(() => setPhase('run'), 420);
  }

  $('#trayAuto').addEventListener('click', () => {
    current.tools.forEach((t) => { current.placeTool(t.id); markPlaced(t.id); });
    refresh();
  });

  /* ══ 끌어다 놓기 ═════════════════════════════ */
  const ghost = $('#dragGhost');
  const hint = $('#dropHint');
  let dragging = null;
  let hintTimer = null;

  function showHint(text, ok) {
    clearTimeout(hintTimer);
    hint.textContent = text;
    hint.classList.toggle('ok', !!ok);
    hint.classList.remove('hidden');
    hintTimer = setTimeout(() => hint.classList.add('hidden'), 1800);
  }

  function startDrag(e) {
    if (phase !== 'prep') return;
    const el = e.currentTarget;
    const id = el.dataset.tool;
    const tool = current.tools.find((t) => t.id === id);
    dragging = { id, el };

    ghost.innerHTML = Lab.Icons[tool.icon];
    ghost.classList.remove('hidden');
    moveGhost(e);
    // 포인터 캡처가 안 되는 환경에서도 끌기 자체는 동작해야 한다
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    el.addEventListener('pointermove', moveGhost);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }

  function moveGhost(e) {
    const r = $('#stage').getBoundingClientRect();
    ghost.style.left = `${e.clientX - r.left}px`;
    ghost.style.top = `${e.clientY - r.top}px`;
  }

  function endDrag(e) {
    const el = e.currentTarget;
    el.removeEventListener('pointermove', moveGhost);
    el.removeEventListener('pointerup', endDrag);
    el.removeEventListener('pointercancel', endDrag);
    ghost.classList.add('hidden');
    if (!dragging) return;

    const { id } = dragging;
    dragging = null;

    const r = canvas.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    if (cx < 0 || cy < 0 || cx > r.width || cy > r.height) return;

    const point = pickPoint(cx, cy);
    if (!point) { showHint('실험대 위에 놓아 주세요.'); return; }

    if (current.dropAt(id, point) === 'ok') {
      current.placeTool(id);
      markPlaced(id);
      showHint(`${current.slotName(id)} 배치 완료!`, true);
      refresh();
    } else {
      showHint(`${current.slotName(id)} 자리(점선)에 놓아 주세요.`);
    }
  }

  /** 화면 좌표 → 3D 좌표. 아무것도 안 맞으면 수평면과의 교점을 쓴다. */
  function pickPoint(cx, cy) {
    const scene = current.scene;
    const pick = scene.pick(cx, cy, (m) => m.isPickable !== false && m.isEnabled());
    if (pick && pick.hit && pick.pickedPoint) return pick.pickedPoint;

    const ray = scene.createPickingRay(cx, cy, BABYLON.Matrix.Identity(), scene.activeCamera);
    const plane = BABYLON.Plane.FromPositionAndNormal(
      BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, 1, 0));
    const d = ray.intersectsPlane(plane);
    return d === null ? null : ray.origin.add(ray.direction.scale(d));
  }

  /* ══ 실험 컨트롤 ═════════════════════════════ */
  function buildControls() {
    const host = $('#controlSet');
    host.innerHTML = current.controlsHTML();
    current.bindControls(host, refresh);
  }

  /* ══ 갱신 ════════════════════════════════════ */
  const gctx = $('#graphCanvas').getContext('2d');
  const GW = $('#graphCanvas').width, GH = $('#graphCanvas').height;

  function refresh() {
    if (!current) return;
    current.update();
    $('#readout').innerHTML = current.readoutHTML();
    current.drawGraph(gctx, GW, GH);
    $('#graphFoot').innerHTML = current.graphFootHTML();
  }

  /* ══ 탭 · 사이드바 ═══════════════════════════ */
  $$('.menu-card').forEach((c) => c.addEventListener('click', () => openExperiment(c.dataset.exp)));
  $$('.tab').forEach((t) => t.addEventListener('click', () => openExperiment(t.dataset.exp)));

  $('#tabsToggle').addEventListener('click', () => {
    $('#labScreen').classList.toggle('tabs-closed');
    setTimeout(() => engine.resize(), 280);
  });

  $('#graphToggle').addEventListener('click', () => {
    const p = $('#graphPanel');
    p.classList.toggle('collapsed');
    $('#graphToggle').textContent = p.classList.contains('collapsed') ? '＋' : '－';
  });

  // 탐구 수행 단계 이동
  $('#stepPrev').addEventListener('click', () => { stepIdx -= 1; renderSteps(); });
  $('#stepNext').addEventListener('click', () => {
    const steps = current && STEPS[current.id];
    if (steps && stepIdx < steps.length - 1) stepIdx += 1;
    renderSteps();
  });
  $('#stepToggle').addEventListener('click', () => {
    const p = $('#stepsPanel');
    p.classList.toggle('collapsed');
    $('#stepToggle').textContent = p.classList.contains('collapsed') ? '＋' : '－';
  });

  $$('.sidebar button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.action === 'menu') return showMenu();
    if (b.dataset.action === 'restart') {
      current.resetTools();
      current.resetCamera();
      stepIdx = 0;
      return setPhase('prep');
    }
    openPanel(b.dataset.panel);
  }));

  /* ══ 학습 패널 ═══════════════════════════════ */
  function openPanel(kind) {
    const body = $('#panelBody');
    if (kind === 'quiz') renderQuiz(body);
    else if (kind === 'help') body.innerHTML = Lab.help[current.id];
    else body.innerHTML = Lab[kind === 'goal' ? 'goal' : kind === 'pre' ? 'pre'
      : kind === 'safety' ? 'safety' : 'summary'];
    $('#panelModal').classList.remove('hidden');
  }

  $('#panelClose').addEventListener('click', () => $('#panelModal').classList.add('hidden'));
  $('#panelModal').addEventListener('click', (e) => {
    if (e.target.id === 'panelModal') $('#panelModal').classList.add('hidden');
  });

  /* ── 퀴즈 ────────────────────────────────── */
  let qIdx = 0, qSel = -1, qChecked = false;

  function renderQuiz(body) {
    const q = Lab.quiz[qIdx];
    body.innerHTML = `
      <h2>퀴즈</h2>
      <p class="src">${qIdx + 1} / ${Lab.quiz.length} 문항</p>
      <h3>${q.q}</h3>
      <div id="quizOpts">
        ${q.opts.map((o, i) => `<button class="quiz-opt" data-i="${i}">${i + 1}. ${o}</button>`).join('')}
      </div>
      <div id="quizResult"></div>
      <div class="quiz-actions">
        <button class="primary" id="quizCheck">정답 확인</button>
        <button id="quizNext">다음 문제</button>
        <button id="quizReset">처음부터</button>
      </div>`;

    $$('#quizOpts .quiz-opt', body).forEach((b) => b.addEventListener('click', () => {
      if (qChecked) return;
      qSel = +b.dataset.i;
      $$('#quizOpts .quiz-opt', body).forEach((o) => o.classList.toggle('sel', o === b));
    }));

    $('#quizCheck', body).addEventListener('click', () => {
      if (qSel < 0) { $('#quizResult', body).innerHTML =
        `<div class="quiz-result x">먼저 답을 하나 고르세요.</div>`; return; }
      qChecked = true;
      const ok = qSel === q.answer;
      $$('#quizOpts .quiz-opt', body).forEach((o, i) => {
        o.classList.remove('sel');
        if (i === q.answer) o.classList.add('right');
        else if (i === qSel) o.classList.add('wrong');
      });
      $('#quizResult', body).innerHTML = `
        <div class="quiz-result ${ok ? 'o' : 'x'}">
          <b>${ok ? '축하합니다. 정답입니다!' : '아쉽지만 틀렸습니다.'}</b><br>
          정답 : ${q.answer + 1}. ${q.opts[q.answer]}<br>
          <b>해설</b> — ${q.why}
        </div>`;
    });

    $('#quizNext', body).addEventListener('click', () => {
      qIdx = (qIdx + 1) % Lab.quiz.length;
      qSel = -1; qChecked = false;
      renderQuiz(body);
    });
    $('#quizReset', body).addEventListener('click', () => {
      qIdx = 0; qSel = -1; qChecked = false;
      renderQuiz(body);
    });
  }

  /* ══ 렌더 루프 ═══════════════════════════════ */
  engine.runRenderLoop(() => { if (current) current.scene.render(); });
  window.addEventListener('resize', () => engine.resize());
  new ResizeObserver(() => engine.resize()).observe($('#stage'));

  showMenu();
})();
