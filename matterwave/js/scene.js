/**
 * 전자를 한 개씩 — 이중 슬릿 모의실험 (⑥ 데이터 기반 실험형)
 * 비상교육 고등 전자기와 양자 III-01 (교과서 92~97쪽)
 *
 * 탐구 93쪽 — 전자를 하나씩 쏘아 점이 쌓이면 간섭무늬가 나타난다.
 *            관측 장치를 켜면 무늬가 사라지고 두 줄이 된다 (94쪽 자료실).
 * 확률 해석 — 파동 함수 |Ψ|² 이 전자를 발견할 확률 (95쪽, 그림 III-3·4).
 */
const MatterwaveScene = (() => {
  const B = () => BABYLON;

  const L_DIST = 10;          // 슬릿-스크린 거리 (표시 단위)
  const SCREEN_H = 8;         // 스크린 높이
  const NBIN = 80;            // 히스토그램 칸

  let scene, camera;
  let gun, slitPlate, screenP, screenTex, detector;
  let placed = {};

  const state = {
    lambda: 1.0,        // 드브로이 파장 (연출 단위) — 가속 전압으로 조절
    dSlit: 3.0,         // 슬릿 간격 (연출 단위)
    rate: 40,           // 초당 발사 수
    observe: 0,         // 관측 장치 (0/1)
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'gunT', label: '전자총', icon: 'tower' },
    { id: 'slitT', label: '이중 슬릿', icon: 'screenBoard' },
    { id: 'scrT', label: '형광 스크린', icon: 'screenBoard' },
    { id: 'obsT', label: '관측 장치', icon: 'sensor' },
  ];
  const slots = {
    gunT: { name: '왼쪽 (전자총)' },
    slitT: { name: '가운데 (슬릿)' },
    scrT: { name: '오른쪽 (스크린)' },
    obsT: { name: '슬릿 옆 (관측 장치)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 스크린 위 y 에서 전자를 발견할 확률 (미규격화) */
  function prob(y) {
    const a = state.dSlit / 4;                 // 슬릿 폭 (간격의 1/4 로 고정)
    if (state.observe) {
      // 관측하면 파동성이 사라져 슬릿 2개의 입자 분포 (두 줄)
      const s = 0.55;
      const g = (c) => Math.exp(-((y - c) ** 2) / (2 * s * s));
      return g(state.dSlit / 2) + g(-state.dSlit / 2);
    }
    const bd = Math.PI * state.dSlit * y / (state.lambda * L_DIST);
    const ba = Math.PI * a * y / (state.lambda * L_DIST);
    const sinc = ba === 0 ? 1 : Math.sin(ba) / ba;
    return Math.cos(bd) ** 2 * sinc * sinc;
  }
  /** 무늬 간격 Δy = λL/d */
  const fringe = () => state.lambda * L_DIST / state.dSlit;

  /** 확률 분포에서 표본 추출 (기각법) */
  function sampleY() {
    for (let i = 0; i < 60; i++) {
      const y = (Math.random() - 0.5) * SCREEN_H;
      if (Math.random() < prob(y)) return y;
    }
    return (Math.random() - 0.5) * SCREEN_H;
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#141a28ff');

    camera = new (B().ArcRotateCamera)(
      'camMw', -Math.PI / 2 + 0.5, 1.25, 20, new (B().Vector3)(1, 3, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 44;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hmw', new (B().Vector3)(0, 1, 0), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new (B().Color3)(0.3, 0.32, 0.4);
    const glow = new (B().GlowLayer)('mwGlow', scene);
    glow.intensity = 0.5;

    const table = B().MeshBuilder.CreateBox('mwTable', { width: 24, height: 0.5, depth: 12 }, scene);
    table.position.y = -0.26;
    table.material = mat('mwTableMat', '#242c3c');

    buildGun();
    buildSlit();
    buildScreen();
    buildDetector();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/matterwave.jpg', { x: -8, y: 0, z: 5.5, ry: 0.3 });

    resetTools();
    return scene;
  }

  function mat(name, hex, spec, power) {
    const m = new (B().StandardMaterial)(name, scene);
    m.diffuseColor = B().Color3.FromHexString(hex);
    m.specularColor = spec ? B().Color3.FromHexString(spec) : new (B().Color3)(0.05, 0.05, 0.05);
    if (power) m.specularPower = power;
    return m;
  }
  function emat(name, hex, alpha) {
    const m = new (B().StandardMaterial)(name, scene);
    m.emissiveColor = B().Color3.FromHexString(hex);
    m.disableLighting = true;
    if (alpha != null) m.alpha = alpha;
    return m;
  }

  function buildGun() {
    gun = new (B().TransformNode)('mwGun', scene);
    const body = B().MeshBuilder.CreateCylinder('mwGunB', { height: 2.4, diameter: 1.4 }, scene);
    body.rotation.z = Math.PI / 2;
    body.position.set(-7, 3, 0);
    body.material = mat('mwGunBM', '#39424f', '#8e9bad', 64);
    body.parent = gun;
    const nose = B().MeshBuilder.CreateCylinder('mwGunN', { height: 0.9, diameterTop: 0.4, diameterBottom: 1.0 }, scene);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(-5.6, 3, 0);
    nose.material = mat('mwGunNM', '#5b6675');
    nose.parent = gun;
  }

  function buildSlit() {
    slitPlate = new (B().TransformNode)('mwSlit', scene);
    const mkPart = (y, h) => {
      const b = B().MeshBuilder.CreateBox('mwSlitP' + y, { width: 0.2, height: h, depth: 3.4 }, scene);
      b.position.set(-2, y, 0);
      b.material = mat('mwSlitPM' + y, '#7a8494', '#cfd6df', 96);
      b.parent = slitPlate;
      return b;
    };
    slitPlate._top = mkPart(5.4, 3.2);
    slitPlate._mid = mkPart(3, 1.0);
    slitPlate._bot = mkPart(0.6, 3.2);
  }

  function layoutSlit() {
    // 슬릿 간격 d 에 맞춰 가운데 막대 높이 조절 (중심 y=3)
    const d = state.dSlit * 0.5;      // 표시 축척 0.5
    slitPlate._mid.scaling.y = Math.max(0.2, (d - 0.5) / 1.0);
    const half = SCREEN_H * 0.5 * 0.62;
    slitPlate._top.position.y = 3 + d / 2 + 0.25 + 1.6;
    slitPlate._top.scaling.y = 1;
    slitPlate._bot.position.y = 3 - d / 2 - 0.25 - 1.6;
  }

  function buildScreen() {
    screenP = B().MeshBuilder.CreatePlane('mwScreen', { width: 1.2, height: SCREEN_H * 0.62 }, scene);
    screenP.position.set(3.2, 3, 0);
    screenP.rotation.y = -Math.PI / 2;
    screenP.scaling.x = 4;
    screenTex = new (B().DynamicTexture)('mwScreenTex', { width: 340, height: 620 }, scene, false);
    const m = new (B().StandardMaterial)('mwScreenM', scene);
    m.diffuseTexture = screenTex;
    m.emissiveTexture = screenTex;
    m.emissiveColor = new (B().Color3)(0.9, 0.9, 0.9);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    screenP.material = m;
    clearScreen();
  }

  function clearScreen() {
    const ctx = screenTex.getContext();
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, 340, 620);
    screenTex.update();
  }

  function dotOnScreen(y) {
    const ctx = screenTex.getContext();
    const py = 310 - (y / (SCREEN_H / 2)) * 300;
    const px = 20 + Math.random() * 300;
    ctx.fillStyle = 'rgba(122,224,160,.95)';
    ctx.beginPath(); ctx.arc(px, py, 2.1, 0, 7); ctx.fill();
    screenTex.update();
  }

  function buildDetector() {
    detector = new (B().TransformNode)('mwDet', scene);
    const cam2 = B().MeshBuilder.CreateBox('mwDetB', { width: 0.8, height: 0.8, depth: 0.8 }, scene);
    cam2.position.set(-2, 6.4, 1.4);
    cam2.material = mat('mwDetBM', '#d0453a', '#ffd0c8', 48);
    cam2.parent = detector;
    const lens = B().MeshBuilder.CreateCylinder('mwDetL', { height: 0.5, diameter: 0.5 }, scene);
    lens.rotation.x = 0.9;
    lens.position.set(-2, 5.9, 1.0);
    lens.material = mat('mwDetLM', '#20262f');
    lens.parent = detector;
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      gunT: { x: -7, z: 0, w: 4, h: 3, label: '전자총' },
      slitT: { x: -2, z: 0, w: 3, h: 3.4, label: '이중 슬릿' },
      scrT: { x: 3.2, z: 0, w: 3, h: 3.4, label: '형광 스크린' },
      obsT: { x: -2, z: 4, w: 3.4, h: 2.6, label: '관측 장치' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 420, height: 120 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 420, 120);
      ctx.strokeStyle = '#5a9df0'; ctx.lineWidth = 5;
      ctx.setLineDash([15, 11]);
      ctx.strokeRect(7, 7, 406, 106);
      ctx.setLineDash([]);
      ctx.fillStyle = '#5a9df0';
      ctx.font = 'bold 38px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 210, 64);
      tex.hasAlpha = true; tex.update();
      const m = new (B().StandardMaterial)('phM_' + id, scene);
      m.diffuseTexture = tex; m.opacityTexture = tex;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.specularColor = new (B().Color3)(0, 0, 0);
      m.backFaceCulling = false;
      p.material = m;
      holders[id] = p;
    });
    holders._spec = spec;
  }

  /* ══ 도구 배치 ═══════════════════════════════ */
  function resetTools() {
    placed = {};
    tools.forEach((t) => { placed[t.id] = false; });
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }
  function applyPlacement() {
    Object.entries(holders).forEach(([id, h]) => {
      if (id !== '_spec') h.setEnabled(!placed[id]);
    });
    reset();
  }
  function dropAt(id, point) {
    const c = holders._spec[id];
    return (Math.abs(point.x - c.x) <= 3.4 && Math.abs(point.z - c.z) <= 3.0) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    sim = {
      count: 0,
      bins: new Array(NBIN).fill(0),
      acc: 0,
    };
    clearScreen();
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    // 놓은 도구부터 하나씩 나타난다
    gun.setEnabled(!!placed.gunT);
    slitPlate.setEnabled(!!placed.slitT);
    screenP.setEnabled(!!placed.scrT);
    detector.setEnabled(!!placed.obsT && (all ? !!state.observe : true));
    if (placed.slitT) layoutSlit();
  }

  function tick(dt) {
    if (!sim || !allPlaced() || !state.running) return false;
    sim.acc += state.rate * dt;
    let fired = 0;
    while (sim.acc >= 1 && fired < 200) {
      sim.acc -= 1;
      const y = sampleY();
      dotOnScreen(y);
      const bin = Math.floor(((y + SCREEN_H / 2) / SCREEN_H) * NBIN);
      if (bin >= 0 && bin < NBIN) sim.bins[bin] += 1;
      sim.count += 1;
      fired += 1;
    }
    return fired > 0;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.5;
    camera.beta = 1.25;
    camera.radius = 20;
    camera.setTarget(new (B().Vector3)(1, 3, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '전자를 한 개씩 쏘아도 점이 쌓이면 간섭무늬가 나타납니다. 관측 장치를 켜면 어떻게 될까요?';
  const prepGuide = '점선 자리에 전자총·이중 슬릿·스크린·관측 장치를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    return `
      ${LabUI.slider('lambda', '드브로이 파장<br><i>λ</i> = <i>h</i>/<i>mv</i>',
        { min: 0.5, max: 2.0, step: 0.1, value: state.lambda, fmt: (v) => `${(+v).toFixed(1)}` })}
      ${LabUI.slider('dSlit', '슬릿 간격 <i>d</i>',
        { min: 1.5, max: 5, step: 0.5, value: state.dSlit, fmt: (v) => `${(+v).toFixed(1)}` })}
      ${LabUI.opts('발사 빠르기', 'rate', [
        { v: 6, t: '한 개씩 천천히' }, { v: 40, t: '보통' }, { v: 240, t: '빠르게' },
      ], state.rate, 1)}
      ${LabUI.opts('관측 장치<br>(어느 슬릿?)', 'observe', [
        { v: 0, t: '끄기' }, { v: 1, t: '켜기 📷' },
      ], state.observe, 1)}
      <div class="control">
        <div class="clabel">전자 쏘기</div>
        <button class="power" id="runBtn">▶ 발사</button>
      </div>
      <div class="control">
        <div class="clabel">스크린<br>지우기</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    const after = () => { reset(); onChange(); };
    LabUI.bindSlider(root, 'lambda', state, 'lambda', (v) => `${(+v).toFixed(1)}`, after);
    LabUI.bindSlider(root, 'dSlit', state, 'dSlit', (v) => `${(+v).toFixed(1)}`, after);
    LabUI.bindOpts(root, 'rate', state, 'rate', onChange);
    LabUI.bindOpts(root, 'observe', state, 'observe', () => { reset(); onChange(); });
    const run = root.querySelector('#runBtn');
    run.addEventListener('click', () => {
      state.running = !state.running;
      run.textContent = state.running ? '발사 중…' : '▶ 발사';
      run.classList.toggle('run', state.running);
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      run.textContent = '▶ 발사';
      run.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    return `
      <div class="row"><span>쏜 전자 수</span><b class="big">${sim.count.toLocaleString()}개</b></div>
      <div class="row"><span>드브로이 파장 λ</span><b>${state.lambda.toFixed(1)} (h/mv)</b></div>
      <div class="row"><span>슬릿 간격 d</span><b>${state.dSlit.toFixed(1)}</b></div>
      <div class="row"><span>무늬 간격 Δy = λL/d</span><b>${fringe().toFixed(2)}</b></div>
      <div class="row"><span>관측 장치</span>
        <b class="big">${state.observe ? '📷 켜짐 — 무늬 소멸!' : '꺼짐 — 간섭무늬'}</b></div>
      <div class="formula">${state.observe
        ? '어느 슬릿을 지났는지 <b>측정하는 순간</b> 파동성이 사라지고 입자처럼 두 줄만 남습니다. 측정이 상태를 바꾸는 양자 역학의 기묘함입니다 (94쪽 자료실).'
        : '전자 <b>한 개</b>는 확률 파동으로 <b>두 슬릿을 동시에</b> 지나며 스스로 간섭하고, 스크린에는 입자처럼 한 점으로 찍힙니다. 점이 쌓이면 |Ψ|² 을 따라 간섭무늬가 드러납니다 (95쪽).'}</div>
      <div class="sec">참고 — 물질파 파장 (92쪽 그림 III-1)</div>
      <div class="row"><span>전자 (9×10⁻³¹ kg)</span><b>4.3×10⁻¹² m — 관찰 가능</b></div>
      <div class="row"><span>야구공 (0.15 kg)</span><b>1.1×10⁻³⁴ m — 관찰 불가</b></div>`;
  }

  /* ══ 그래프 — 도달 분포 히스토그램 ═══════════ */
  const graphTitle = '전자를 발견할 확률 |Ψ|² 과 실제 분포';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 36, padR = 10, padT = 14, padB = 22;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;
    const xOf = (y) => padL + ((y + SCREEN_H / 2) / SCREEN_H) * gw;

    // 이론 확률 곡선
    let pmax = 0;
    for (let i = 0; i <= 200; i++) {
      pmax = Math.max(pmax, prob(-SCREEN_H / 2 + (i / 200) * SCREEN_H));
    }
    ctx.strokeStyle = 'rgba(90,208,240,.75)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const y = -SCREEN_H / 2 + (i / 200) * SCREEN_H;
      const py = padT + gh - (prob(y) / pmax) * gh * 0.94;
      if (i === 0) ctx.moveTo(xOf(y), py); else ctx.lineTo(xOf(y), py);
    }
    ctx.stroke();

    // 실제 히스토그램
    if (sim && sim.count > 0) {
      const bmax = Math.max(1, ...sim.bins);
      ctx.fillStyle = 'rgba(122,224,160,.55)';
      const bw = gw / NBIN;
      sim.bins.forEach((n, i) => {
        const h = (n / bmax) * gh * 0.94;
        ctx.fillRect(padL + i * bw, padT + gh - h, bw - 0.5, h);
      });
    }

    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#5ad0f0'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('|Ψ|² (이론)', padL + 6, padT + 2);
    ctx.fillStyle = '#7ae0a0';
    ctx.fillText(`실제 도달 분포 (${sim ? sim.count : 0}개)`, padL + 78, padT + 2);
  }

  function graphFootHTML() {
    return state.observe
      ? '관측하면 봉우리가 <b>두 개</b>뿐 — 슬릿 모양 그대로, 입자의 분포입니다'
      : `점이 쌓일수록 히스토그램이 <b>|Ψ|² 곡선</b>에 다가갑니다 — 보강 간섭 위치의 간격 Δy = λL/d = ${fringe().toFixed(2)}`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '전자 수', 'λ', 'd', '관측 장치', '스크린의 무늬',
  ];

  function recordRow() {
    return [[sim.count.toLocaleString(), state.lambda.toFixed(1), state.dSlit.toFixed(1),
      state.observe ? '켜짐' : '꺼짐',
      state.observe ? '두 줄 (입자성)' : sim.count < 100 ? '무작위 점 (아직)' : '간섭무늬 (파동성)']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 전자 100개 · 1 간섭무늬 (1000개) · 2 관측 장치 켜기 · 3 파장 바꿔 간격 비교
     4 기록 3줄                                                            */
  const mis = { max: 0, observed: false, lams: {} };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (sim) mis.max = Math.max(mis.max, sim.count || 0);
    if (state.observe && sim && sim.count > 50) mis.observed = true;
    if (!state.observe && sim && sim.count > 300) mis.lams[state.lambda.toFixed(1)] = true;

    if (i === 0) return mis.max >= 100;
    if (i === 1) return !state.observe && mis.max >= 1000;
    if (i === 2) return mis.observed;
    if (i === 3) return Object.keys(mis.lams).length >= 2;
    if (i === 4) return recs().length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'matterwave',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '전자를 한 개씩 — 이중 슬릿 모의실험',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, prob, fringe, sampleY,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
