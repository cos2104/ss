/**
 * 교과서 시뮬레이션 공용 셸
 *
 * 준비물 배치 → 실험 진행의 흐름, 사이드바 학습 패널, 퀴즈, 측정값·그래프·기록표를
 * 모든 시뮬레이션이 같은 방식으로 쓰도록 묶어 둔 것.
 *
 * 사용법
 *   Lab.boot({ unit, title, experiments: [expModule, ...], content });
 *
 * 실험 모듈이 갖춰야 할 것
 *   id, title, guide, prepGuide, tools[]
 *   create(engine, canvas) → scene,  update(),  resetCamera()
 *   placeTool(id), resetTools(), allPlaced(), dropAt(id, point), slotName(id)
 *   controlsHTML(), bindControls(root, onChange), readoutHTML()
 *   graphTitle, drawGraph(ctx, W, H), graphFootHTML()
 * 선택
 *   tick(dt)          매 프레임 호출. true 를 돌려주면 측정값·그래프를 다시 그린다
 *   recordColumns[]   기록표 머리글. 있으면 기록표 패널이 나타난다
 *   recordRow()       현재 상태를 표 한 줄로 (배열). null 이면 기록하지 않는다
 *   onEnterRun()      준비 단계를 마치고 실험 단계로 들어갈 때
 */
const Lab = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let engine, canvas, cfg;
  let current = null;
  let phase = 'prep';
  let gctx, GW, GH;
  let records = [];
  let missionOK = {};        // 실험별 탐구 미션 달성 여부 (탭을 옮겨도 남는다)
  let stepIdx = 0;
  let stepHold = false;      // [이전]으로 되돌아가 보는 동안에는 자동 진행을 멈춘다
  let stepPollT = 0;

  /* ══ 화면 뼈대 ═══════════════════════════════ */
  function markup(c) {
    const tabs = c.experiments.length > 1
      ? `<div class="top-tabs">${c.experiments.map((e) =>
          `<button data-exp="${e.id}">${e.tabLabel || e.title}</button>`).join('')}</div>`
      : '';
    return `
    <section class="lab-screen">
      <header class="topbar">
        <a class="top-home" href="../index.html">← 목록</a>
        <span class="top-unit">${c.unit}</span>
        <span class="top-title" id="expTitle"></span>
        ${tabs}
      </header>

      <main class="stage" id="stage">
        <canvas id="renderCanvas"></canvas>
        <aside class="readout" id="readout">
          <div class="readout-head">
            <span>측정값</span>
            <button class="mini-toggle" id="readoutToggle">－</button>
          </div>
          <div class="readout-body" id="readoutBody"></div>
        </aside>

        <section class="graph-panel" id="graphPanel">
          <div class="graph-head">
            <span id="graphTitle">그래프</span>
            <button class="mini-toggle" id="graphToggle">－</button>
          </div>
          <canvas id="graphCanvas" width="420" height="210"></canvas>
          <div class="graph-foot" id="graphFoot"></div>
        </section>

        <section class="record-panel hidden" id="recordPanel">
          <div class="record-head">
            <span>실험 결과 기록</span>
            <span class="btns">
              <button class="primary" id="recAdd">기록</button>
              <button id="recClear">비우기</button>
              <button id="recToggle">－</button>
            </span>
          </div>
          <div class="record-body" id="recordBody"></div>
        </section>

        <section class="steps-panel hidden" id="stepsPanel">
          <div class="steps-head">
            <span id="stepsTitle">탐구 수행</span>
            <span class="btns">
              <span id="stepNo">1 / 1</span>
              <button id="stepPrev">이전</button>
              <button id="stepNext" class="primary">다음 ▶</button>
              <button id="stepToggle">－</button>
            </span>
          </div>
          <div class="steps-body" id="stepsBody"></div>
        </section>

        <div class="drag-ghost hidden" id="dragGhost"></div>
        <div class="drop-hint hidden" id="dropHint"></div>
      </main>

      <aside class="sidebar">
        <button data-panel="help"><img src="../common/icons/edu_icon_1.png" alt="도움말"></button>
        <button data-panel="goal"><img src="../common/icons/edu_icon_2.png" alt="학습목표"></button>
        <button data-panel="pre"><img src="../common/icons/edu_icon_3.png" alt="사전학습"></button>
        <button data-panel="safety"><img src="../common/icons/edu_icon_4.png" alt="실험실 안전"></button>
        <button data-panel="summary"><img src="../common/icons/edu_icon_5.png" alt="핵심정리"></button>
        <button data-panel="quiz"><img src="../common/icons/edu_icon_6.png" alt="퀴즈"></button>
        <button data-action="restart"><img src="../common/icons/edu_icon_7.png" alt="실험 다시하기"></button>
        <button data-action="home"><img src="../common/icons/edu_icon_8.png" alt="실험 목록"></button>
      </aside>

      <footer class="controls">
        <p class="guide" id="guide"></p>
        <div class="tool-tray hidden" id="toolTray">
          <div class="tray-label">실<br>험<br>도<br>구</div>
          <div class="tray-items" id="trayItems"></div>
          <button class="tray-auto" id="trayAuto">자동 배치</button>
        </div>
        <div class="control-set hidden" id="controlSet"></div>
      </footer>
    </section>

    <div class="modal hidden" id="panelModal">
      <div class="modal-box">
        <button class="modal-close" id="panelClose">✕</button>
        <div id="panelBody"></div>
      </div>
    </div>`;
  }

  /* ══ 시작 ════════════════════════════════════ */
  function boot(config) {
    cfg = config;
    document.body.innerHTML = markup(cfg);
    document.title = `${cfg.title} | 물리학`;

    canvas = $('#renderCanvas');
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    cfg.experiments.forEach((e) => e.create(engine, canvas));

    gctx = $('#graphCanvas').getContext('2d');
    GW = $('#graphCanvas').width;
    GH = $('#graphCanvas').height;

    bindShell();
    // 좁은 화면에서는 무대를 가리지 않게 부가 패널을 접힌 상태로 시작
    if (matchMedia('(max-width: 820px)').matches) {
      [['graphPanel', 'graphToggle'], ['recordPanel', 'recToggle'],
       ['stepsPanel', 'stepToggle'], ['readout', 'readoutToggle']]
        .forEach(([p, t]) => { $('#' + p).classList.add('collapsed'); $('#' + t).textContent = '＋'; });
    }
    openExperiment(cfg.experiments[0].id);

    engine.runRenderLoop(() => {
      if (!current) return;
      if (phase === 'run' && current.tick) {
        const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
        if (current.tick(dt)) refreshLive();
      }
      // 탐구 미션 자동 판정 · 단계 자동 진행 (0.5초 간격 확인)
      if (phase === 'run') {
        stepPollT += engine.getDeltaTime();
        if (stepPollT > 500) {
          stepPollT = 0;
          pollMissions();
        }
      }
      current.scene.render();
    });
    window.addEventListener('resize', () => engine.resize());
    new ResizeObserver(() => engine.resize()).observe($('#stage'));
    engine.resize();
  }

  /* ══ 실험 전환 ═══════════════════════════════ */
  function openExperiment(id) {
    current = cfg.experiments.find((e) => e.id === id);
    $('#expTitle').textContent = current.title;
    $('#graphTitle').textContent = current.graphTitle;
    $$('.top-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.exp === id));

    records = [];
    renderRecords();
    $('#recordPanel').classList.toggle('hidden', !current.recordColumns);
    stepIdx = 0;
    stepHold = false;

    current.resetTools();
    current.resetCamera();
    // 관찰·컴퓨터 모의실험형은 준비물 배치 없이 곧바로 실험을 시작한다
    if (current.noPrep) {
      current.tools.forEach((t) => current.placeTool(t.id));
      setPhase('run');
    } else {
      setPhase(current.tools.length ? 'prep' : 'run');
    }
    engine.resize();
  }

  /* ══ 탐구 미션 ═══════════════════════════════
     content.steps[expId] 의 항목은 글자열이거나 { t, goal } 이다.
     실험 모듈이 missionDone(i) 를 두면 «달성»을 스스로 판정하고,
     stepDone(i) 만 있으면 예전처럼 다음 단계로 넘어가기만 한다.      */
  function expSteps(exp) {
    const e = exp || current;
    const raw = (cfg.content.steps && e && cfg.content.steps[e.id]) || null;
    if (!raw) return null;
    return raw.map((s) => (typeof s === 'string' ? { t: s, goal: '' } : s));
  }

  /** 이 실험이 «미션형»인가 (모듈이 판정 함수를 가졌는가) */
  const isMission = (e) => !!(e || current) && typeof (e || current).missionDone === 'function';

  function okList(exp) {
    const e = exp || current;
    if (!e) return [];
    const n = (expSteps(e) || []).length;
    if (!missionOK[e.id] || missionOK[e.id].length !== n) missionOK[e.id] = new Array(n).fill(false);
    return missionOK[e.id];
  }

  /** 매 0.5초 — 아직 못 이룬 미션을 다시 확인한다 (한 번 달성하면 유지) */
  function pollMissions() {
    const steps = expSteps();
    if (!steps) return;
    if (isMission()) {
      const ok = okList();
      let changed = false, justDone = -1;
      for (let i = 0; i < steps.length; i++) {
        if (ok[i]) continue;
        let r = false;
        try { r = !!current.missionDone(i); } catch (_) { r = false; }
        if (r) { ok[i] = true; changed = true; justDone = i; }
      }
      if (changed) {
        const done = ok.filter(Boolean).length;
        if (!stepHold) {
          const nx = ok.findIndex((v) => !v);
          stepIdx = nx < 0 ? steps.length - 1 : nx;
        }
        renderSteps();
        showHint(done === steps.length
          ? `탐구 미션을 모두 달성했습니다! (${done}/${steps.length}) 🏅`
          : `미션 ${justDone + 1} 달성! (${done}/${steps.length})`, true);
      }
      return;
    }
    if (current.stepDone && !stepHold && stepIdx < steps.length - 1 && current.stepDone(stepIdx)) {
      stepIdx += 1;
      renderSteps();
    }
  }

  function renderSteps() {
    const panel = $('#stepsPanel');
    const steps = current && expSteps();
    if (!steps || phase !== 'run') {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    stepIdx = Math.max(0, Math.min(stepIdx, steps.length - 1));

    const mission = isMission();
    const ok = mission ? okList() : [];
    if (mission) {
      const done = ok.filter(Boolean).length;
      $('#stepsTitle').textContent = '탐구 미션';
      $('#stepNo').innerHTML = `<b class="mn-cnt${done === steps.length ? ' all' : ''}">${done} / ${steps.length}</b> 달성`;
    } else {
      $('#stepsTitle').textContent = '탐구 수행';
      $('#stepNo').textContent = `${stepIdx + 1} / ${steps.length}`;
    }
    $('#stepsBody').innerHTML = steps.map((s, i) => {
      const isOK = mission ? ok[i] : i < stepIdx;
      const isCur = i === stepIdx && !isOK;
      return `
      <div class="step${isCur ? ' cur' : ''}${isOK ? ' done' : ''}">
        <span class="no">${isOK ? '✓' : i + 1}</span>
        <div>${s.t}${s.goal ? `<span class="mn-goal">목표 · ${s.goal}</span>` : ''}</div>
      </div>`;
    }).join('');
    $('#stepPrev').disabled = stepIdx === 0;
    $('#stepNext').textContent = stepIdx === steps.length - 1 ? '완료 ✓' : '다음 ▶';
    // 현재 단계가 보이도록 스크롤
    const cur = $('#stepsBody .step.cur');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function setPhase(p) {
    phase = p;
    const prep = p === 'prep';
    $('#toolTray').classList.toggle('hidden', !prep);
    $('#controlSet').classList.toggle('hidden', prep);
    $('#guide').innerHTML = prep ? current.prepGuide : current.guide;
    if (prep) buildTray();
    else {
      buildControls();
      if (current.onEnterRun) current.onEnterRun();
    }
    renderSteps();
    refresh();
  }

  /* ══ 준비물 트레이 ═══════════════════════════ */
  function buildTray() {
    const host = $('#trayItems');
    host.innerHTML = current.tools.map((t) => `
      <button class="tray-item" data-tool="${t.id}">
        ${LabIcons[t.icon] || ''}
        <span>${t.label}</span>
      </button>`).join('');
    $$('.tray-item', host).forEach((el) => el.addEventListener('pointerdown', startDrag));
  }

  function markPlaced(id) {
    const el = $(`.tray-item[data-tool="${id}"]`);
    if (el) el.classList.add('placed');
    if (current.allPlaced()) setTimeout(() => setPhase('run'), 420);
  }

  /* ══ 끌어다 놓기 ═════════════════════════════ */
  let dragging = null, hintTimer = null, dragStart = null, dragMoved = false;

  function showHint(text, ok) {
    const hint = $('#dropHint');
    clearTimeout(hintTimer);
    hint.textContent = text;
    hint.classList.toggle('ok', !!ok);
    hint.classList.remove('hidden');
    hintTimer = setTimeout(() => hint.classList.add('hidden'), 1800);
  }

  function startDrag(e) {
    if (phase !== 'prep') return;
    const el = e.currentTarget;
    const tool = current.tools.find((t) => t.id === el.dataset.tool);
    dragging = el.dataset.tool;
    dragStart = { x: e.clientX, y: e.clientY };
    dragMoved = false;

    // 씬이 3D 미리보기를 지원하면 아이콘 유령 대신 실제 부품이 따라온다
    if (!current.dragPreview) {
      const ghost = $('#dragGhost');
      ghost.innerHTML = LabIcons[tool.icon] || '';
      ghost.classList.remove('hidden');
      moveGhost(e);
    }
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* 캡처 실패해도 끌기는 된다 */ }
    el.addEventListener('pointermove', moveGhost);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }

  function moveGhost(e) {
    if (dragStart && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 8) {
      dragMoved = true;
    }
    if (current && current.dragPreview && dragging) {
      const r = canvas.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const inside = cx >= 0 && cy >= 0 && cx <= r.width && cy <= r.height;
      current.dragPreview(dragging, inside ? pickPoint(cx, cy, true) : null);
      return;
    }
    const r = $('#stage').getBoundingClientRect();
    const g = $('#dragGhost');
    g.style.left = `${e.clientX - r.left}px`;
    g.style.top = `${e.clientY - r.top}px`;
  }

  function endDrag(e) {
    const el = e.currentTarget;
    el.removeEventListener('pointermove', moveGhost);
    el.removeEventListener('pointerup', endDrag);
    el.removeEventListener('pointercancel', endDrag);
    $('#dragGhost').classList.add('hidden');
    if (!dragging) return;

    const id = dragging;
    dragging = null;
    if (current.dragPreview) current.dragPreview(id, null);

    // 거의 움직이지 않았으면 클릭 — 부품이 제자리로 들어간다
    if (!dragMoved && current.clickPlace) {
      current.placeTool(id);
      markPlaced(id);
      showHint(`${current.slotName(id)} 배치 완료!`, true);
      refresh();
      return;
    }

    const r = canvas.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    if (cx < 0 || cy < 0 || cx > r.width || cy > r.height) return;

    const point = pickPoint(cx, cy, !!current.dragPreview);
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
  function pickPoint(cx, cy, planeOnly) {
    const scene = current.scene;
    // 3D 부품 미리보기(dragPreview) 중에는 커서를 따라오는 부품 자신이나 높이가 다른
    // 바닥들이 픽되어 좌표가 튀므로, 항상 y=0 평면과의 교점만 쓴다.
    if (!planeOnly) {
      const pick = scene.pick(cx, cy, (m) => m.isPickable !== false && m.isEnabled());
      if (pick && pick.hit && pick.pickedPoint) return pick.pickedPoint;
    }
    const ray = scene.createPickingRay(cx, cy, BABYLON.Matrix.Identity(), scene.activeCamera);
    const plane = BABYLON.Plane.FromPositionAndNormal(
      BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, 1, 0));
    const d = ray.intersectsPlane(plane);
    return d === null ? null : ray.origin.add(ray.direction.scale(d));
  }

  /* ══ 컨트롤 · 갱신 ═══════════════════════════ */
  function buildControls() {
    const host = $('#controlSet');
    host.innerHTML = current.controlsHTML();
    current.bindControls(host, refresh);
  }

  /** 컨트롤을 건드렸을 때 — 장면까지 다시 계산 */
  function refresh() {
    if (!current) return;
    current.update();
    refreshLive();
  }

  /** 애니메이션 중 — 표시만 다시 그린다 */
  function refreshLive() {
    $('#readoutBody').innerHTML = current.readoutHTML();
    current.drawGraph(gctx, GW, GH);
    $('#graphFoot').innerHTML = current.graphFootHTML();
  }

  /* ══ 기록표 ══════════════════════════════════ */
  function renderRecords() {
    const body = $('#recordBody');
    if (!current || !current.recordColumns) return;
    if (!records.length) {
      body.innerHTML = `<div class="empty">조건을 바꿔 가며 [기록]을 눌러 결과를 모아 보세요.</div>`;
      return;
    }
    body.innerHTML = `<table>
      <thead><tr><th>#</th>${current.recordColumns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${records.map((r, i) =>
        `<tr><td>${i + 1}</td>${r.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
    body.scrollTop = body.scrollHeight;
  }

  function addRecord() {
    if (!current.recordRow) return;
    const row = current.recordRow();
    if (!row) { showHint('아직 기록할 결과가 없습니다.'); return; }
    // 여러 줄을 한 번에 남길 수도 있다 (교과서 표처럼 A·B·전체를 함께)
    if (Array.isArray(row[0])) records.push(...row);
    else records.push(row);
    renderRecords();
  }

  /* ══ 학습 패널 · 퀴즈 ════════════════════════ */
  function openPanel(kind) {
    const body = $('#panelBody');
    if (kind === 'quiz') renderQuiz(body);
    else if (kind === 'help') body.innerHTML = cfg.content.help[current.id] || cfg.content.help;
    else body.innerHTML = cfg.content[kind] || '<p>준비 중입니다.</p>';
    $('#panelModal').classList.remove('hidden');
  }

  let qIdx = 0, qSel = -1, qChecked = false;

  function renderQuiz(body) {
    const list = cfg.content.quiz;
    const q = list[qIdx];
    body.innerHTML = `
      <h2>퀴즈</h2>
      <p class="src">${qIdx + 1} / ${list.length} 문항</p>
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
      if (qSel < 0) {
        $('#quizResult', body).innerHTML = `<div class="quiz-result x">먼저 답을 하나 고르세요.</div>`;
        return;
      }
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
      qIdx = (qIdx + 1) % list.length; qSel = -1; qChecked = false; renderQuiz(body);
    });
    $('#quizReset', body).addEventListener('click', () => {
      qIdx = 0; qSel = -1; qChecked = false; renderQuiz(body);
    });
  }

  /* ══ 셸 이벤트 ═══════════════════════════════ */
  function bindShell() {
    $$('.top-tabs button').forEach((b) =>
      b.addEventListener('click', () => openExperiment(b.dataset.exp)));

    $('#trayAuto').addEventListener('click', () => {
      current.tools.forEach((t) => { current.placeTool(t.id); markPlaced(t.id); });
      refresh();
    });

    // 무대 위 패널 접기 — 좁은 화면에서는 하나를 펼치면 나머지를 접는다
    const PANEL_TOGGLES = [
      ['readout', 'readoutToggle'], ['graphPanel', 'graphToggle'],
      ['recordPanel', 'recToggle'], ['stepsPanel', 'stepToggle'],
    ];
    const setCollapsed = (p, t, on) => {
      $('#' + p).classList.toggle('collapsed', on);
      $('#' + t).textContent = on ? '＋' : '－';
    };
    PANEL_TOGGLES.forEach(([p, t]) => $('#' + t).addEventListener('click', () => {
      const willOpen = $('#' + p).classList.contains('collapsed');
      if (willOpen && matchMedia('(max-width: 820px)').matches) {
        PANEL_TOGGLES.forEach(([p2, t2]) => { if (p2 !== p) setCollapsed(p2, t2, true); });
      }
      setCollapsed(p, t, !willOpen);
    }));
    $('#recAdd').addEventListener('click', addRecord);
    $('#recClear').addEventListener('click', () => { records = []; renderRecords(); });

    // 탐구 수행 단계 이동 — [이전]으로 돌아가면 자동 진행을 잠시 멈추고,
    // [다음]으로 앞으로 나가면 자동 진행을 다시 켠다
    $('#stepPrev').addEventListener('click', () => { stepIdx -= 1; stepHold = true; renderSteps(); });
    $('#stepNext').addEventListener('click', () => {
      const steps = expSteps();
      stepHold = false;
      if (steps && stepIdx < steps.length - 1) { stepIdx += 1; renderSteps(); }
      else {
        showHint('탐구 수행을 모두 마쳤습니다. 기록표를 정리해 보세요!', true);
        stepIdx = (steps || []).length - 1;
        renderSteps();
      }
    });
    $$('.sidebar button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.action === 'home') { location.href = '../index.html'; return; }
      if (b.dataset.action === 'restart') {
        current.resetTools();
        current.resetCamera();
        records = []; renderRecords();
        missionOK[current.id] = null;
        stepIdx = 0;
        stepHold = false;
        setPhase(current.tools.length ? 'prep' : 'run');
        return;
      }
      openPanel(b.dataset.panel);
    }));

    $('#panelClose').addEventListener('click', () => $('#panelModal').classList.add('hidden'));
    $('#panelModal').addEventListener('click', (e) => {
      if (e.target.id === 'panelModal') $('#panelModal').classList.add('hidden');
    });
  }

  /** 보고서·탐구 현황용 — 실험별 미션 달성 내역 */
  function missionReport() {
    return cfg.experiments.map((e) => {
      const steps = expSteps(e) || [];
      const ok = okList(e);
      return {
        id: e.id, title: e.title, mission: isMission(e),
        list: steps.map((s, i) => ({ t: s.t, goal: s.goal || '', ok: !!ok[i] })),
        done: ok.filter(Boolean).length, total: steps.length,
      };
    });
  }

  function switchExp(id) {
    const b = $(`.top-tabs button[data-exp="${id}"]`);
    if (b) { b.click(); return true; }
    return false;
  }

  return {
    boot, refresh, addRecord, showHint, missionReport, switchExp,
    getRecords: () => records.slice(),
    getColumns: () => (current && current.recordColumns) || [],
    get current() { return current; },
    get config() { return cfg; },
    get phase() { return phase; },
  };
})();


/* ══ 컨트롤 마크업 도우미 ═══════════════════════ */
const LabUI = {
  /** 슬라이더 한 줄 */
  slider(id, label, { min, max, step, value, fmt }) {
    return `
    <div class="control">
      <div class="clabel">${label}</div>
      <div class="cbody"><div class="slider-row">
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
        <output id="${id}Out">${fmt(value)}</output>
      </div></div>
    </div>`;
  },

  /** 버튼 묶음 */
  opts(label, dataKey, list, cur, rows = 2) {
    return `
    <div class="control">
      <div class="clabel">${label}</div>
      <div class="cbody"><div class="opt-grid${rows === 1 ? ' one-row' : ''}">
        ${list.map((o) =>
          `<button class="opt${o.v === cur ? ' on' : ''}" data-${dataKey}="${o.v}">${o.t}</button>`).join('')}
      </div></div>
    </div>`;
  },

  /**
   * 배치 자리 표시(점선 사각형 + 이름) 텍스처.
   * 판의 가로·세로 비율에 맞춰 텍스처 크기를 정하므로 점선과 글씨가 늘어나지 않고,
   * 글자는 자리 크기와 상관없이 «같은 실제 크기»로 보인다.
   *   w, h  : 판의 크기 (월드 단위)
   *   opt.mirror : 판을 180° 돌려 쓰는 장면이면 true
   */
  slotTexture(scene, name, w, h, label, opt = {}) {
    const PPU = 32;                                   // 월드 1 단위당 픽셀
    const TW = Math.max(96, Math.min(1024, Math.round(Math.abs(w) * PPU)));
    const TH = Math.max(64, Math.min(1024, Math.round(Math.abs(h) * PPU)));
    const tex = new BABYLON.DynamicTexture(name, { width: TW, height: TH }, scene, true);
    const c = tex.getContext();
    c.clearRect(0, 0, TW, TH);
    if (opt.mirror) { c.translate(TW, 0); c.scale(-1, 1); }
    const color = opt.color || '#2f6ad0';
    const lw = Math.max(3, Math.round(Math.min(TW, TH) * 0.05));
    c.strokeStyle = color;
    c.lineWidth = lw;
    c.setLineDash([lw * 3, lw * 2.2]);
    c.strokeRect(lw, lw, TW - lw * 2, TH - lw * 2);
    c.setLineDash([]);
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let px = Math.round(PPU * 0.95);                  // 어느 자리에서나 같은 실제 크기
    px = Math.min(px, Math.round(TH * 0.5));
    c.font = `bold ${px}px "Noto Sans KR", sans-serif`;
    while (px > 9 && c.measureText(label).width > TW - lw * 6) {
      px -= 2;
      c.font = `bold ${px}px "Noto Sans KR", sans-serif`;
    }
    c.fillText(label, TW / 2, TH / 2);
    c.setTransform(1, 0, 0, 1, 0, 0);
    tex.hasAlpha = true;
    tex.update();
    return tex;
  },

  /**
   * 3D 화면에 띄우는 «＋ / －» 단추 한 쌍.
   * 하단 조작 막대 대신 «화면에서 직접» 값을 바꾸게 할 때 쓴다.
   *   const st = LabUI.makeStepper(scene, 'Mass');
   *   st.add / st.sub 의 이름은 'btnAddMass' / 'btnSubMass'
   *   st.place(x, y, z, gap) 으로 자리를 잡고, st.setEnabled(bool)
   */
  makeStepper(scene, key, opt = {}) {
    const size = opt.size || 0.85;
    const mk = (kind) => {
      const name = 'btn' + kind + key;
      const pl = BABYLON.MeshBuilder.CreatePlane(name, { width: size, height: size }, scene);
      const tex = new BABYLON.DynamicTexture(name + 'T', { width: 96, height: 96 }, scene, true);
      const c = tex.getContext();
      c.clearRect(0, 0, 96, 96);
      c.fillStyle = kind === 'Add' ? (opt.addColor || '#2f6ad0') : '#8e9bad';
      c.beginPath(); c.arc(48, 48, 42, 0, 7); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 9; c.lineCap = 'round';
      c.beginPath(); c.moveTo(28, 48); c.lineTo(68, 48); c.stroke();
      if (kind === 'Add') { c.beginPath(); c.moveTo(48, 28); c.lineTo(48, 68); c.stroke(); }
      tex.hasAlpha = true; tex.update();
      const m = new BABYLON.StandardMaterial(name + 'M', scene);
      m.diffuseTexture = tex; m.opacityTexture = tex; m.emissiveTexture = tex;
      m.emissiveColor = new BABYLON.Color3(1, 1, 1);
      m.specularColor = new BABYLON.Color3(0, 0, 0);
      m.backFaceCulling = false;
      pl.material = m;
      pl.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
      // 글로우 레이어가 있는 장면에서 단추가 하얗게 번지지 않도록 제외한다.
      // (레이어가 나중에 만들어지는 장면도 있어 첫 프레임에서 한 번 더 확인한다)
      const exclude = () => (scene.effectLayers || []).forEach((L) => {
        if (L.addExcludedMesh) L.addExcludedMesh(pl);
      });
      exclude();
      const once = () => { exclude(); scene.onBeforeRenderObservable.removeCallback(once); };
      scene.onBeforeRenderObservable.add(once);
      return pl;
    };
    const add = mk('Add'), sub = mk('Sub');
    return {
      add, sub,
      place(x, y, z, gap) {
        const g = gap || 0.75;
        add.position.set(x + g, y, z || 0);
        sub.position.set(x - g, y, z || 0);
      },
      setEnabled(v) { add.setEnabled(!!v); sub.setEnabled(!!v); },
      setParent(pnt) { add.parent = pnt; sub.parent = pnt; },
    };
  },

  /** 교과서 그림 액자 — 장면 배경에 해당 단원의 교과서 이미지를 세워 둔다 */
  addPoster(scene, url, opt = {}) {
    const W = opt.w || 4.2, H = opt.h || 2.9;
    const g = new BABYLON.TransformNode('posterG', scene);
    // 액자 틀
    const frame = BABYLON.MeshBuilder.CreateBox('posterFrame',
      { width: W + 0.24, height: H + 0.24, depth: 0.12 }, scene);
    frame.position.set(0, H / 2 + 0.6, 0.07);
    const fm = new BABYLON.StandardMaterial('posterFrameM', scene);
    fm.diffuseColor = BABYLON.Color3.FromHexString('#5a4632');
    fm.specularColor = BABYLON.Color3.FromHexString('#8a7050');
    fm.specularPower = 64;
    frame.material = fm;
    frame.parent = g;
    // 그림 — 내장 데이터가 있으면 우선 사용 (file:// 로 열어도 사진이 보인다)
    const p = BABYLON.MeshBuilder.CreatePlane('posterImg', { width: W, height: H }, scene);
    p.position.set(0, H / 2 + 0.6, 0);
    const m = new BABYLON.StandardMaterial('posterImgM', scene);
    const key = (url.split('/').pop() || '').replace(/\.(jpg|png)$/, '');
    const src = (window.THUMB_DATA && window.THUMB_DATA[key]) || url;
    m.diffuseTexture = new BABYLON.Texture(src, scene);
    m.emissiveColor = new BABYLON.Color3(0.72, 0.72, 0.72);
    m.emissiveTexture = m.diffuseTexture;
    m.specularColor = new BABYLON.Color3(0, 0, 0);
    m.backFaceCulling = false;
    p.material = m;
    p.parent = g;
    // 명패 — 라벨 길이에 맞춰 폭과 글자 크기를 자동 조절 (긴 라벨이 잘리지 않게)
    const labelText = opt.label || '교과서 그림';
    const tagW = Math.min(W + 0.24, Math.max(1.8, labelText.length * 0.17 + 0.7));
    const tag = BABYLON.MeshBuilder.CreatePlane('posterTag', { width: tagW, height: 0.42 }, scene);
    tag.position.set(0, 0.28, 0);
    const TXW = Math.round(tagW * 167);
    const tex = new BABYLON.DynamicTexture('posterTagTex', { width: TXW, height: 70 }, scene, true);
    const c = tex.getContext();
    c.fillStyle = '#f6f2e6'; c.fillRect(0, 0, TXW, 70);
    c.fillStyle = '#5a4632';
    let px = 34;
    c.font = `bold ${px}px "Noto Sans KR", sans-serif`;
    while (px > 16 && c.measureText(labelText).width > TXW - 24) {
      px -= 2;
      c.font = `bold ${px}px "Noto Sans KR", sans-serif`;
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(labelText, TXW / 2, 38);
    tex.update();
    const tm = new BABYLON.StandardMaterial('posterTagM', scene);
    tm.diffuseTexture = tex; tm.emissiveTexture = tex;
    tm.emissiveColor = new BABYLON.Color3(1, 1, 1);
    tm.specularColor = new BABYLON.Color3(0, 0, 0);
    tag.material = tm;
    tag.parent = g;
    g.position.set(opt.x || 0, opt.y || 0, opt.z || 6);
    // opt.ry 는 예전 장면들이 쓰던 값 — 첫 프레임에서 카메라를 향해 다시 맞춘다

    /* 액자가 공중에 뜨거나 허공에 놓이지 않도록, 첫 프레임에서
       바로 아래에 있는 «평평한 면»(실험대·바닥) 위에 내려놓는다.
       아래에 아무것도 없으면 가장 넓은 평평한 면 안쪽으로 끌어당긴 뒤 내려놓는다. */
    if (opt.drop !== false) {
      const surfaces = () => scene.meshes.filter((m) => {
        if (!m.isEnabled() || !m.isVisible || m.name.indexOf('poster') === 0) return false;
        const bb = m.getBoundingInfo().boundingBox;
        const w = bb.maximumWorld.x - bb.minimumWorld.x;
        const d = bb.maximumWorld.z - bb.minimumWorld.z;
        const h = bb.maximumWorld.y - bb.minimumWorld.y;
        return w > 6 && d > 4 && h < Math.min(w, d) * 0.5;      // 넓고 납작한 것 = 바닥·실험대
      });
      const topAt = (x, z, list) => {
        let top = null;
        list.forEach((m) => {
          const bb = m.getBoundingInfo().boundingBox;
          const mn = bb.minimumWorld, mx = bb.maximumWorld;
          if (x < mn.x - 0.2 || x > mx.x + 0.2 || z < mn.z - 0.2 || z > mx.z + 0.2) return;
          if (mx.y > g.position.y + 2.5) return;                 // 액자보다 훨씬 위는 무시
          if (top === null || mx.y > top) top = mx.y;
        });
        return top;
      };
      const face = () => {
        // 액자 앞면의 법선은 (0,0,−1) — 카메라 쪽을 향하도록 y 회전을 맞춘다.
        // (예전에는 장면마다 ry 를 손으로 넣어 대부분 바깥쪽을 보고 있었다)
        const cam = scene.activeCamera;
        if (!cam) return;
        const cp = cam.position;
        const dx = cp.x - g.position.x, dz = cp.z - g.position.z;
        if (Math.hypot(dx, dz) < 1e-3) return;
        g.rotation.y = Math.atan2(-dx, -dz) + (opt.turn || 0);
      };
      const place = () => {
        face();
        const list = surfaces();
        if (!list.length) return;
        let top = topAt(g.position.x, g.position.z, list);
        if (top === null) {
          // 바로 아래에 아무것도 없으면 «가장 넓은 면과 같은 높이»에만 맞춘다.
          // (자리를 옮기면 기구를 가릴 수 있으므로 x·z 는 건드리지 않는다)
          let bestTop = null, bestA = 0;
          list.forEach((m) => {
            const bb = m.getBoundingInfo().boundingBox;
            const a = (bb.maximumWorld.x - bb.minimumWorld.x) * (bb.maximumWorld.z - bb.minimumWorld.z);
            if (a > bestA) { bestA = a; bestTop = bb.maximumWorld.y; }
          });
          top = bestTop;
          if (top === null) return;
        }
        g.position.y = top - 0.05;
      };
      const once = () => { place(); scene.onBeforeRenderObservable.removeCallback(once); };
      scene.onBeforeRenderObservable.add(once);
    }
    g.getChildMeshes().forEach((mm) => {
      mm.isPickable = false;
      // 글로우 레이어가 있는 씬에서 액자가 번쩍이지 않도록 제외
      (scene.effectLayers || []).forEach((L) => {
        if (L.addExcludedMesh) L.addExcludedMesh(mm);
      });
    });
    return g;
  },

  /** 슬라이더를 상태에 묶는다 */
  bindSlider(root, id, state, key, fmt, onChange) {
    const el = root.querySelector('#' + id);
    const out = root.querySelector('#' + id + 'Out');
    el.addEventListener('input', () => {
      state[key] = parseFloat(el.value);
      out.textContent = fmt(state[key]);
      onChange();
    });
    return (v) => {
      state[key] = parseFloat(v);
      el.value = v;
      out.textContent = fmt(state[key]);
      onChange();
    };
  },

  /** 버튼 묶음을 상태에 묶는다 */
  /**
   * 판 위 전하 배치 — 같은 부호끼리 «서로 밀어내고» 판의 테두리도 밀어낸다.
   * 가운데부터 채우되 힘이 균형을 이룰 때까지 이완시켜, 뭉치지도 테두리에
   * 몰리지도 않는 자연스러운 분포를 만든다. (개수마다 한 번만 계산해 캐시)
   */
  chargeLayout(W, H, n, margin) {
    LabUI._chgCache = LabUI._chgCache || {};
    const key = `${n}@${W}x${H}`;
    if (LabUI._chgCache[key]) return LabUI._chgCache[key];
    const M = margin || Math.min(W, H) * 0.13;
    const x0 = M, x1 = W - M, y0 = M, y1 = H - M;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const pts = [];
    const GA = Math.PI * (3 - Math.sqrt(5));       // 황금각 — 가운데부터 고르게 퍼진 씨앗
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : Math.sqrt((i + 0.5) / n);
      const a = i * GA;
      pts.push({ x: cx + Math.cos(a) * t * (x1 - x0) / 2 * 0.92,
                 y: cy + Math.sin(a) * t * (y1 - y0) / 2 * 0.92 });
    }
    const area = (x1 - x0) * (y1 - y0);
    const sp = Math.sqrt(area / Math.max(1, n));    // 이웃 사이 목표 간격
    const K = sp * sp * 0.9;                        // 전하 사이 척력 세기
    const KW = K * 0.45;                            // 테두리가 밀어내는 힘 (전하보다 약하게)
    const step = 0.34;
    for (let it = 0; it < 160; it++) {
      for (let i = 0; i < n; i++) {
        let fx = 0, fy = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d2 = Math.max(sp * sp * 0.04, dx * dx + dy * dy);
          // 쿨롱 척력 — 크기 K/d² 를 «단위 방향»에 곱한다 (d³ 으로 나누는 까닭)
          const f = K / (d2 * Math.sqrt(d2));
          fx += dx * f; fy += dy * f;
        }
        const lim = sp * 0.35;
        fx += KW / Math.pow(Math.max(lim, pts[i].x - x0), 2);
        fx -= KW / Math.pow(Math.max(lim, x1 - pts[i].x), 2);
        fy += KW / Math.pow(Math.max(lim, pts[i].y - y0), 2);
        fy -= KW / Math.pow(Math.max(lim, y1 - pts[i].y), 2);
        pts[i].x = Math.min(x1, Math.max(x0, pts[i].x + fx * step));
        pts[i].y = Math.min(y1, Math.max(y0, pts[i].y + fy * step));
      }
    }
    LabUI._chgCache[key] = pts;
    return pts;
  },

  bindOpts(root, dataKey, state, key, onChange, cast = parseFloat) {
    const sel = `[data-${dataKey}]`;
    root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => {
      // dataset 은 camelCase 키를 소문자 속성으로 바꾸므로 getAttribute 로 읽는다
      state[key] = cast(b.getAttribute('data-' + dataKey));
      root.querySelectorAll(sel).forEach((o) => o.classList.toggle('on', o === b));
      onChange();
    }));
  },
};
