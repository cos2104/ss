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
  let stepIdx = 0;

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
            <span>탐구 수행 <small>(교과서 순서)</small></span>
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

  /* ══ 탐구 수행 단계 안내 ═════════════════════ */
  function expSteps() {
    return (cfg.content.steps && cfg.content.steps[current.id]) || null;
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
    $('#stepNo').textContent = `${stepIdx + 1} / ${steps.length}`;
    $('#stepPrev').disabled = stepIdx === 0;
    $('#stepNext').textContent = stepIdx === steps.length - 1 ? '완료 ✓' : '다음 ▶';
    $('#stepsBody').innerHTML = steps.map((s, i) => `
      <div class="step${i === stepIdx ? ' cur' : ''}${i < stepIdx ? ' done' : ''}">
        <span class="no">${i < stepIdx ? '✓' : i + 1}</span><div>${s}</div>
      </div>`).join('');
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
      current.dragPreview(dragging, inside ? pickPoint(cx, cy) : null);
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

    // 거의 움직이지 않았으면 «클릭» — 부품이 제자리로 들어간다
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
      body.innerHTML = `<div class="empty">조건을 바꿔 가며 «기록» 을 눌러 결과를 모아 보세요.</div>`;
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

    // 탐구 수행 단계 이동
    $('#stepPrev').addEventListener('click', () => { stepIdx -= 1; renderSteps(); });
    $('#stepNext').addEventListener('click', () => {
      const steps = expSteps();
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
        stepIdx = 0;
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

  return { boot, refresh, addRecord, showHint, get phase() { return phase; } };
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
    if (opt.ry) g.rotation.y = opt.ry;
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
