/**
 * 편광판 돌리기 — 말뤼스 법칙과 디스플레이 (③ 체험·조작형)
 * 비상교육 고등 전자기와 양자 II-03 (교과서 66~71쪽)
 *
 * 편광판 2개 모드 — 해 보기 66쪽: 편광판을 겹쳐 돌리면 밝기가 cos² 으로 변한다.
 * 디스플레이 모드 — 탐구 68쪽: 조도 센서로 LCD(선형)·OLED(원형)·자연광·물 반사광의
 *                편광 상태를 20° 간격으로 측정한다.
 */
const PolarizationScene = (() => {
  const B = () => BABYLON;

  let scene, camera;
  let lightBox, polA, polB, screenP, screenMat, axisTexA, axisTexB;
  let monitorG, monitorTex, filterDisc, filterTex, luxTex, luxPlane;
  let placed = {};

  const state = {
    mode: 'two',        // 'two' | 'display'
    thA: 0,             // 편광판 A 각도 (°)
    thB: 0,             // 편광판 B 각도
    source: 'lcd',      // 'lcd' | 'oled' | 'natural' | 'water'
    thF: 0,             // 필터 각도
    running: true,
  };

  let sim = null;

  const tools = [
    { id: 'lampT', label: '광원 (전구)', icon: 'bulb' },
    { id: 'polT', label: '편광판 2개', icon: 'lensConvex' },
    { id: 'dispT', label: '디스플레이', icon: 'screenBoard' },
    { id: 'luxT', label: '조도 센서 (앱)', icon: 'sensor' },
  ];
  const slots = {
    lampT: { name: '왼쪽 (광원)' },
    polT: { name: '가운데 (편광판)' },
    dispT: { name: '오른쪽 (디스플레이)' },
    luxT: { name: '앞쪽 (조도 센서)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  const rad = (d) => d * Math.PI / 180;
  /** 편광판 2개: 자연광 100 → A 뒤 50 → B 뒤 50cos²(Δθ) */
  function twoI() {
    const I1 = 50;
    const I2 = I1 * Math.cos(rad(state.thB - state.thA)) ** 2;
    return { I1, I2 };
  }
  /** 디스플레이 + 필터: 광원별 조도(%) (탐구 68쪽) */
  function dispI() {
    const th = rad(state.thF);
    switch (state.source) {
      case 'lcd': return 100 * Math.cos(th) ** 2;                 // 선형(0°) 편광
      case 'water': return 100 * Math.cos(th - Math.PI / 2) ** 2; // 수평(90°) 편광된 반사광
      case 'oled': return 50;                                     // 원형 편광 — 각도 무관
      default: return 50;                                         // 자연광
    }
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#1a2233ff');

    camera = new (B().ArcRotateCamera)(
      'camPo', -Math.PI / 2 + 0.4, 1.25, 15, new (B().Vector3)(0, 2.4, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 34;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hpo', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new (B().Color3)(0.35, 0.38, 0.45);

    const table = B().MeshBuilder.CreateBox('poTable', { width: 22, height: 0.5, depth: 10 }, scene);
    table.position.y = -0.26;
    table.material = mat('poTableMat', '#3a4356', '#5a6a86', 64);

    buildTwo();
    buildDisplay();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/polarization.jpg', { x: -8, y: 0, z: 4.5, ry: 0.3 });

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

  /** 축이 그려진 편광판 원판 */
  function polDisc(name) {
    const d = B().MeshBuilder.CreateDisc(name, { radius: 1.5, tessellation: 48 }, scene);
    d.rotation.y = Math.PI / 2;   // 빛(x축)에 수직
    const t = new (B().DynamicTexture)(name + 'Tex', { width: 256, height: 256 }, scene, true);
    const m = new (B().StandardMaterial)(name + 'Mat', scene);
    m.diffuseTexture = t;
    m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(0.6, 0.6, 0.6);
    m.opacityTexture = t;
    m.backFaceCulling = false;
    d.material = m;
    return [d, t];
  }

  function drawPolTex(tex, deg, tint) {
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = tint || 'rgba(140,160,190,.75)';
    ctx.beginPath(); ctx.arc(128, 128, 124, 0, 7); ctx.fill();
    // 편광축 줄무늬
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(-rad(deg));
    ctx.strokeStyle = 'rgba(30,40,60,.85)';
    ctx.lineWidth = 4;
    for (let y = -110; y <= 110; y += 18) {
      const half = Math.sqrt(Math.max(0, 124 * 124 - y * y));
      ctx.beginPath(); ctx.moveTo(-half, y); ctx.lineTo(half, y); ctx.stroke();
    }
    // 축 화살표
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-116, 0); ctx.lineTo(116, 0); ctx.stroke();
    ctx.restore();
    tex.update();
  }

  function buildTwo() {
    lightBox = new (B().TransformNode)('poLamp', scene);
    const bulb = B().MeshBuilder.CreateSphere('poBulb', { diameter: 1.1 }, scene);
    bulb.position.set(-6, 2.4, 0);
    bulb.material = emat('poBulbM', '#fff2c0');
    bulb.parent = lightBox;
    const base = B().MeshBuilder.CreateCylinder('poBulbBase', { height: 1.6, diameter: 0.5 }, scene);
    base.position.set(-6, 1.2, 0);
    base.material = mat('poBulbBaseM', '#39424f');
    base.parent = lightBox;

    const [pa, ta] = polDisc('poPolA');
    pa.position.set(-2.2, 2.4, 0);
    polA = pa; axisTexA = ta;
    const [pb, tb] = polDisc('poPolB');
    pb.position.set(1.4, 2.4, 0);
    polB = pb; axisTexB = tb;

    screenP = B().MeshBuilder.CreatePlane('poScreen', { width: 3.4, height: 3.4 }, scene);
    screenP.position.set(5.4, 2.4, 0);
    screenP.rotation.y = -Math.PI / 2;
    screenMat = emat('poScreenM', '#ffffff');
    screenP.material = screenMat;
  }

  function buildDisplay() {
    monitorG = new (B().TransformNode)('poMon', scene);
    const frame = B().MeshBuilder.CreateBox('poMonF', { width: 5.6, height: 3.6, depth: 0.25 }, scene);
    frame.position.set(-2.4, 2.6, 0);
    frame.rotation.y = Math.PI / 2;
    frame.material = mat('poMonFM', '#20262f');
    frame.parent = monitorG;
    const panel = B().MeshBuilder.CreatePlane('poMonP', { width: 5.1, height: 3.1 }, scene);
    panel.position.set(-2.26, 2.6, 0);
    panel.rotation.y = -Math.PI / 2;
    monitorTex = emat('poMonPM', '#8ac0f0');
    panel.material = monitorTex;
    panel.parent = monitorG;

    const [f, ft] = polDisc('poFilter');
    f.position.set(1.0, 2.6, 0);
    filterDisc = f; filterTex = ft;
    filterDisc.parent = monitorG;

    // 조도계 (개별 배치가 보이도록 모니터 그룹과 분리)
    const p = B().MeshBuilder.CreatePlane('poLux', { width: 2.6, height: 1.8 }, scene);
    luxPlane = p;
    p.position.set(4.6, 2.6, 0);
    p.rotation.y = -Math.PI / 2;
    luxTex = new (B().DynamicTexture)('poLuxTex', { width: 300, height: 210 }, scene, true);
    const m = new (B().StandardMaterial)('poLuxM', scene);
    m.diffuseTexture = luxTex; m.emissiveTexture = luxTex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    p.material = m;
  }

  function drawLux() {
    const I = dispI();
    const ctx = luxTex.getContext();
    ctx.clearRect(0, 0, 300, 210);
    ctx.fillStyle = '#f6f2e6';
    ctx.beginPath(); ctx.roundRect(0, 0, 300, 210, 16); ctx.fill();
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('조도 측정 앱', 150, 10);
    ctx.fillStyle = '#d0453a';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(I.toFixed(0), 150, 62);
    ctx.fillStyle = '#62718a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('lx (상대값)', 150, 130);
    ctx.fillStyle = '#e8e4d2';
    ctx.fillRect(30, 168, 240, 22);
    ctx.fillStyle = '#f0a53c';
    ctx.fillRect(30, 168, 240 * I / 100, 22);
    luxTex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      lampT: { x: -6, z: 0, w: 3.2, h: 2.6, label: '광원' },
      polT: { x: -0.4, z: 0, w: 4.6, h: 2.8, label: '편광판 2개' },
      dispT: { x: 4.4, z: 2.4, w: 3.6, h: 2.6, label: '디스플레이' },
      luxT: { x: 4.6, z: -2.6, w: 3.2, h: 2.4, label: '조도 센서' },
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
    return (Math.abs(point.x - c.x) <= 3.6 && Math.abs(point.z - c.z) <= 3.0) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    sim = { t: 0 };
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const two = state.mode === 'two';

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다 (실험대는 항상 보임)
    if (!all) {
      lightBox.setEnabled(!!placed.lampT);
      screenP.setEnabled(!!placed.lampT);
      polA.setEnabled(!!placed.polT);
      polB.setEnabled(!!placed.polT);
      if (placed.polT) {
        drawPolTex(axisTexA, state.thA);
        drawPolTex(axisTexB, state.thB);
      }
      monitorG.setEnabled(!!placed.dispT);
      if (luxPlane) luxPlane.setEnabled(!!placed.luxT);
      if (placed.luxT) drawLux();
      return;
    }

    lightBox.setEnabled(two);
    polA.setEnabled(two);
    polB.setEnabled(two);
    screenP.setEnabled(two);
    monitorG.setEnabled(!two);
    if (luxPlane) luxPlane.setEnabled(!two);

    if (two) {
      drawPolTex(axisTexA, state.thA);
      drawPolTex(axisTexB, state.thB);
      const { I2 } = twoI();
      const k = I2 / 100;
      screenMat.emissiveColor = new (B().Color3)(0.12 + k * 0.88, 0.12 + k * 0.85, 0.1 + k * 0.7);
    } else {
      drawPolTex(filterTex, state.thF, 'rgba(120,140,175,.7)');
      const I = dispI();
      const k = I / 100;
      // 필터 뒤에서 본 화면 밝기를 필터 원판 밝기로 표현
      filterDisc.material.emissiveColor = new (B().Color3)(0.3 + k * 0.7, 0.3 + k * 0.7, 0.35 + k * 0.65);
      const srcHex = { lcd: '#8ac0f0', oled: '#a0e8b8', natural: '#fff2c0', water: '#9ad4f0' }[state.source];
      monitorTex.emissiveColor = B().Color3.FromHexString(srcHex);
      drawLux();
    }
  }

  function tick() { return false; }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.4;
    camera.beta = 1.25;
    camera.radius = 15;
    camera.setTarget(new (B().Vector3)(0, 2.4, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '편광판 B 를 돌려 보세요. 두 축이 나란하면 밝고, 수직(90°)이면 빛이 완전히 차단됩니다.';
  const prepGuide = '점선 자리에 광원·편광판·디스플레이·조도 센서를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'two', t: '편광판 2개 (66쪽)' }, { v: 'display', t: '디스플레이 조도 (68쪽)' },
    ], state.mode, 1);

    if (state.mode === 'two') {
      return `
        ${modeBtns}
        ${LabUI.slider('thA', '편광판 A 각도',
          { min: 0, max: 180, step: 5, value: state.thA, fmt: (v) => `${v}°` })}
        ${LabUI.slider('thB', '편광판 B 각도',
          { min: 0, max: 180, step: 5, value: state.thB, fmt: (v) => `${v}°` })}
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.opts('광원', 'source', [
        { v: 'lcd', t: 'LCD (선형)' }, { v: 'oled', t: 'OLED (원형)' },
        { v: 'natural', t: '백열등 (자연광)' }, { v: 'water', t: '물 반사광' },
      ], state.source, 2)}
      ${LabUI.slider('thF', '편광 필름 각도',
        { min: 0, max: 180, step: 20, value: state.thF, fmt: (v) => `${v}°` })}
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.getAttribute('data-mode');
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.mode === 'two') {
      LabUI.bindSlider(root, 'thA', state, 'thA', (v) => `${v}°`, () => { layout(); onChange(); });
      LabUI.bindSlider(root, 'thB', state, 'thB', (v) => `${v}°`, () => { layout(); onChange(); });
    } else {
      LabUI.bindOpts(root, 'source', state, 'source', () => { layout(); onChange(); }, String);
      LabUI.bindSlider(root, 'thF', state, 'thF', (v) => `${v}°`, () => { layout(); onChange(); });
    }
    root.querySelector('#resetBtn').addEventListener('click', () => {
      state.thA = 0; state.thB = 0; state.thF = 0;
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'two') {
      const { I1, I2 } = twoI();
      const d = Math.abs(state.thB - state.thA) % 180;
      return `
        <div class="row"><span>자연광 세기</span><b>100 %</b></div>
        <div class="row"><span>편광판 A 통과 후</span><b>${I1.toFixed(0)} % (절반)</b></div>
        <div class="row"><span>두 축 사이 각 Δθ</span><b>${d}°</b></div>
        <div class="row"><span>편광판 B 통과 후</span>
          <b class="big">${I2.toFixed(1)} %</b></div>
        <div class="formula"><i>I</i> = <i>I</i>₁cos²Δθ (말뤼스 법칙) —
          Δθ = 0° 면 그대로, <b>90° 면 완전 차단</b>됩니다.
          자연광은 모든 방향으로 진동하므로 첫 편광판에서 평균 절반만 통과합니다.</div>`;
    }
    const I = dispI();
    const desc = {
      lcd: 'LCD 는 내부에 <b>선형 편광판</b>이 있어 필름을 돌리면 cos² 으로 밝기가 변합니다.',
      oled: 'OLED 는 <b>원형 편광판</b>을 써서 필름을 돌려도 밝기가 일정합니다 (69쪽 자료실).',
      natural: '자연광은 모든 방향으로 진동 — 어느 각도든 절반이 통과합니다.',
      water: '물 표면 반사광은 <b>수평으로 편광</b> — 편광 선글라스(축 수직)가 눈부심을 막는 원리입니다 (67쪽).',
    };
    return `
      <div class="row"><span>광원</span><b>${{ lcd: 'LCD', oled: 'OLED', natural: '백열등', water: '물 반사광' }[state.source]}</b></div>
      <div class="row"><span>필름 각도</span><b>${state.thF}°</b></div>
      <div class="row"><span>조도 (상대값)</span><b class="big">${I.toFixed(0)} lx</b></div>
      <div class="formula">${desc[state.source]}<br>
        20° 간격으로 돌리며 «기록» 해 교과서 표를 채우세요.</div>`;
  }

  /* ══ 그래프 — 각도-조도 곡선 ═════════════════ */
  const graphTitle = '각도에 따른 밝기 (말뤼스 법칙)';
  const recorded = [];

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 40, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;
    const xOf = (deg) => padL + (deg / 180) * gw;
    const yOf = (I) => padT + gh - (I / 100) * gh;

    // 이론 곡선
    const curve = (f, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const deg = (i / 120) * 180;
        const y = yOf(f(deg));
        if (i === 0) ctx.moveTo(xOf(deg), y); else ctx.lineTo(xOf(deg), y);
      }
      ctx.stroke();
    };
    if (state.mode === 'two') {
      curve((deg) => 50 * Math.cos(rad(deg - state.thA)) ** 2, '#5ad0f0');
      // 현재 점
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      ctx.arc(xOf(state.thB), yOf(twoI().I2), 5, 0, 7);
      ctx.fill();
    } else {
      const fns = {
        lcd: (d) => 100 * Math.cos(rad(d)) ** 2,
        water: (d) => 100 * Math.cos(rad(d - 90)) ** 2,
        oled: () => 50,
        natural: () => 50,
      };
      curve(fns[state.source], '#5ad0f0');
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      ctx.arc(xOf(state.thF), yOf(dispI()), 5, 0, 7);
      ctx.fill();
    }
    // 기록점
    ctx.fillStyle = '#69d98c';
    recorded.forEach((p) => {
      if (p.mode !== state.mode) return;
      ctx.beginPath(); ctx.arc(xOf(p.deg), yOf(p.I), 3.4, 0, 7); ctx.fill();
    });

    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let d = 0; d <= 180; d += 45) ctx.fillText(`${d}°`, xOf(d), padT + gh + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [0, 50, 100].forEach((I) => ctx.fillText(String(I), padL - 4, yOf(I)));
  }

  function graphFootHTML() {
    if (state.mode === 'two') {
      return 'cos² 곡선 — 0°·180° 에서 최대, <b>90° 에서 0</b> · 편광판 A 를 돌리면 곡선 전체가 이동합니다';
    }
    return state.source === 'oled' || state.source === 'natural'
      ? '수평선 — 각도를 돌려도 조도가 변하지 않습니다 (편광되어 있지 않거나 원형 편광)'
      : 'cos² 곡선 — 선형 편광의 증거입니다';
  }

  /* ══ 기록표 (탐구 68쪽 표) ═══════════════════ */
  const recordColumns = [
    '실험', '광원 / 조건', '각도', '조도 (%)', '판정',
  ];

  function recordRow() {
    if (state.mode === 'two') {
      const { I2 } = twoI();
      recorded.push({ mode: 'two', deg: state.thB, I: I2 });
      return [['편광판 2개', `A=${state.thA}°`, `B=${state.thB}°`, I2.toFixed(1),
        Math.abs((state.thB - state.thA) % 180 - 90) < 3 ? '완전 차단!' : '']];
    }
    const I = dispI();
    recorded.push({ mode: 'display', deg: state.thF, I });
    return [['디스플레이', { lcd: 'LCD', oled: 'OLED', natural: '백열등', water: '물 반사광' }[state.source],
      `${state.thF}°`, I.toFixed(1),
      state.source === 'lcd' || state.source === 'water' ? '선형 편광' : '변화 없음']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 편광판 각도 바꾸기 · 1 완전 차단(90°) · 2 말뤼스 법칙 기록
     3 LCD 확인 · 4 OLED·백열등과 비교                                     */
  const mis = { turned: false, blocked: false, src: {}, th0: null };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'two') {
      if (mis.th0 === null) mis.th0 = state.thB;
      else if (Math.abs(state.thB - mis.th0) > 5) mis.turned = true;
      const d = Math.abs(((state.thB - state.thA) % 180 + 180) % 180 - 90);
      if (d < 3) mis.blocked = true;
    } else {
      mis.src[state.source] = true;
    }
    if (i === 0) return mis.turned;
    if (i === 1) return mis.blocked;
    if (i === 2) return recs().filter((r) => String(r[0]) === '편광판 2개').length >= 3;
    if (i === 3) return !!mis.src.lcd;
    if (i === 4) return Object.keys(mis.src).length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'polarization',
    title: '편광판 돌리기 — 말뤼스 법칙과 디스플레이',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, twoI, dispI,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
