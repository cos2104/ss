/**
 * 포물선 운동 분석하기 — 스트로보 촬영 (⑥ 데이터 기반 실험형)
 * 비상교육 고등 역학과 에너지 I-02 (교과서 18~21쪽)
 *
 * 해 보기 18쪽 — 일정한 시간 간격의 공 위치에 수평·연직 선을 그어 분해하기
 * 탐구 20쪽 — 0.1 초 간격으로 x, y, vx, vy 를 기록해 역학적 에너지 보존 확인
 */
const ProjectileScene = (() => {
  const B = () => BABYLON;

  const M = 0.75;            // 1 m = 0.75 unit
  const FIELD = 44;          // 수평 범위 (m)
  const H_MAX = 22;          // 연직 범위 (m)
  const STROBE_DT = 0.1;     // 교과서 표와 같은 0.1 초 간격

  let scene, camera;
  let launcher, barrel, ball, board, boardTex, camGear;
  let ghosts = [], arrows = [];
  let placed = {};

  const state = {
    v0: 14,        // 처음 속력 (m/s)
    angle: 45,     // 발사각 (°)
    mass: 0.5,     // kg
    g: 9.8,        // 지구 9.8 / 달 1.6 / 계산용 10
    showArrow: true,
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'launcher', label: '발사대', icon: 'tower' },
    { id: 'ball', label: '공', icon: 'ball' },
    { id: 'board', label: '모눈종이 판', icon: 'screenBoard' },
    { id: 'camGear', label: '스마트 기기', icon: 'sensor' },
  ];

  const slots = {
    launcher: { x: 0, name: '발사대 (왼쪽 끝)' },
    ball: { x: 0, name: '발사대 위' },
    board: { x: FIELD / 2, name: '모눈종이 판 (뒤쪽)' },
    camGear: { x: 12, name: '삼각대 (앞쪽)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  const rad = () => state.angle * Math.PI / 180;
  const v0x = () => state.v0 * Math.cos(rad());
  const v0y = () => state.v0 * Math.sin(rad());
  /** 최고점 높이 H = v0²sin²θ / 2g */
  const peakH = () => v0y() * v0y() / (2 * state.g);
  /** 수평 도달 거리 R = v0²sin2θ / g */
  const rangeR = () => state.v0 * state.v0 * Math.sin(2 * rad()) / state.g;
  /** 체공 시간 = 2 v0y / g */
  const flightT = () => 2 * v0y() / state.g;

  function at(t) {
    // 등속(수평) + 등가속도(연직) — 닫힌 식으로 정확하게
    return {
      x: v0x() * t,
      y: v0y() * t - 0.5 * state.g * t * t,
      vx: v0x(),
      vy: v0y() - state.g * t,
    };
  }
  function energies(p) {
    const Ek = 0.5 * state.mass * (p.vx * p.vx + p.vy * p.vy);
    const Ep = state.mass * state.g * Math.max(0, p.y);
    return { Ek, Ep, E: Ek + Ep };
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#bcd8f0ff');

    camera = new (B().ArcRotateCamera)(
      'camPj', -Math.PI / 2 + 0.12, 1.18, 34,
      new (B().Vector3)(FIELD / 2 * M - 3, 6 * M, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 60;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hp', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.5, 0.52, 0.55);
    const dir = new (B().DirectionalLight)('dp', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(10, 26, -12);
    dir.intensity = 0.35;

    buildGround();
    buildBoard();
    buildLauncher();
    buildBall();
    buildCamGear();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/projectile.jpg', { x: -7.5, y: 0, z: 7.5, ry: 0.35 });

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

  function buildGround() {
    const g = B().MeshBuilder.CreateGround('pjGround', { width: (FIELD + 14) * M, height: 22 }, scene);
    g.position.set(FIELD / 2 * M - 3, 0, 0);
    g.material = mat('pjGroundMat', '#8fae83', '#b9ccb0', 64);

    // 지면 거리 눈금 (5 m 마다)
    const strip = B().MeshBuilder.CreateGround('pjStrip', { width: FIELD * M, height: 1.4 }, scene);
    strip.position.set(FIELD / 2 * M, 0.01, -2.2);
    const tex = new (B().DynamicTexture)('pjStripTex', { width: 1760, height: 56 }, scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = '#e8e4d2'; ctx.fillRect(0, 0, 1760, 56);
    ctx.strokeStyle = '#40506a'; ctx.lineWidth = 2;
    ctx.fillStyle = '#40506a';
    ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let m2 = 0; m2 <= FIELD; m2++) {
      const x = (m2 / FIELD) * 1760;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, m2 % 5 === 0 ? 26 : 12); ctx.stroke();
      if (m2 % 5 === 0 && m2 < FIELD) ctx.fillText(`${m2} m`, x + 2, 28);
    }
    tex.update();
    const sm = new (B().StandardMaterial)('pjStripMat', scene);
    sm.diffuseTexture = tex; sm.specularColor = new (B().Color3)(0, 0, 0);
    strip.material = sm;
  }

  /** 모눈종이 판 — 뒤쪽 수직 벽. 스트로보마다 수평·연직 투영 눈금을 남긴다 */
  function buildBoard() {
    board = B().MeshBuilder.CreatePlane('pjBoard', { width: FIELD * M, height: H_MAX * M }, scene);
    board.position.set(FIELD / 2 * M, H_MAX / 2 * M, 3.2);
    boardTex = new (B().DynamicTexture)('pjBoardTex', { width: 1760, height: 880 }, scene, false);
    const bm = new (B().StandardMaterial)('pjBoardMat', scene);
    bm.diffuseTexture = boardTex;
    bm.emissiveColor = new (B().Color3)(0.35, 0.35, 0.35);
    bm.specularColor = new (B().Color3)(0, 0, 0);
    bm.backFaceCulling = false;
    board.material = bm;
    drawBoard();
  }

  const bx = (xm) => (xm / FIELD) * 1760;
  const by = (ym) => 880 - (ym / H_MAX) * 880;

  function drawBoard() {
    const ctx = boardTex.getContext();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#f7f4e8';
    ctx.fillRect(0, 0, 1760, 880);
    // 1 m 모눈
    for (let xm = 0; xm <= FIELD; xm++) {
      ctx.strokeStyle = xm % 5 === 0 ? 'rgba(64,86,120,.4)' : 'rgba(64,86,120,.14)';
      ctx.lineWidth = xm % 5 === 0 ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(bx(xm), 0); ctx.lineTo(bx(xm), 880); ctx.stroke();
    }
    for (let ym = 0; ym <= H_MAX; ym++) {
      ctx.strokeStyle = ym % 5 === 0 ? 'rgba(64,86,120,.4)' : 'rgba(64,86,120,.14)';
      ctx.lineWidth = ym % 5 === 0 ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(0, by(ym)); ctx.lineTo(1760, by(ym)); ctx.stroke();
    }
    ctx.fillStyle = '#40506a';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    for (let ym = 5; ym <= H_MAX; ym += 5) ctx.fillText(`${ym} m`, 6, by(ym) - 3);

    if (sim) {
      // 이론 곡선 (옅게)
      ctx.strokeStyle = 'rgba(47,106,208,.35)'; ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      const T = flightT();
      for (let i = 0; i <= 60; i++) {
        const p = at((i / 60) * T);
        if (i === 0) ctx.moveTo(bx(p.x), by(p.y)); else ctx.lineTo(bx(p.x), by(p.y));
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 스트로보 표본 + 수평·연직 투영 (해 보기 18쪽: 각 위치에서 선을 그어 분해)
      sim.samples.forEach((s, i) => {
        ctx.strokeStyle = 'rgba(232,87,122,.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(bx(s.x), by(s.y)); ctx.lineTo(bx(s.x), 880); ctx.stroke();   // 연직선 → 바닥
        ctx.beginPath(); ctx.moveTo(bx(s.x), by(s.y)); ctx.lineTo(0, by(s.y)); ctx.stroke();     // 수평선 → 왼쪽
        // 바닥 투영(수평 위치): 간격이 일정 = 등속
        ctx.fillStyle = '#2f6ad0';
        ctx.beginPath(); ctx.arc(bx(s.x), 868, 8, 0, 7); ctx.fill();
        // 왼쪽 투영(연직 위치): 간격이 변함 = 등가속도
        ctx.fillStyle = '#e8577a';
        ctx.beginPath(); ctx.arc(12, by(s.y), 8, 0, 7); ctx.fill();
        // 공 위치
        ctx.fillStyle = '#f0a53c';
        ctx.beginPath(); ctx.arc(bx(s.x), by(s.y), 9, 0, 7); ctx.fill();
        ctx.strokeStyle = '#7a4a12'; ctx.lineWidth = 2; ctx.stroke();
        if (i % 2 === 0) {
          ctx.fillStyle = '#5a3a24';
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${s.t.toFixed(1)}s`, bx(s.x), by(s.y) - 12);
        }
      });
    }
    boardTex.update();
  }

  function buildLauncher() {
    // 박격포형 발사대 — 총구 끝이 공의 출발점(원점)과 일치한다
    launcher = new (B().TransformNode)('pjLauncher', scene);
    const base = B().MeshBuilder.CreateBox('pjLBase', { width: 1.5, height: 0.3, depth: 1.5 }, scene);
    base.position.set(-0.55, 0.15, 0);
    base.material = mat('pjLBaseMat', '#39424f', '#8e9bad', 64);
    base.parent = launcher;
    const hinge = B().MeshBuilder.CreateCylinder('pjLHinge', { height: 1.6, diameter: 0.26 }, scene);
    hinge.rotation.x = Math.PI / 2;
    hinge.position.set(-0.5, 0.3, 0);
    hinge.material = mat('pjLHingeMat', '#20262f');
    hinge.parent = launcher;

    barrel = B().MeshBuilder.CreateCylinder('pjBarrel', { height: 1.0, diameter: 0.58 }, scene);
    barrel.material = mat('pjBarrelMat', '#d0453a', '#ffd0c8', 48);
    barrel.parent = launcher;
    launcher.position.set(0, 0, 0);
  }

  function buildBall() {
    ball = B().MeshBuilder.CreateSphere('pjBall', { diameter: 0.8 }, scene);
    ball.material = mat('pjBallMat', '#f0a53c', '#ffe2b0', 64);
  }

  function buildCamGear() {
    camGear = new (B().TransformNode)('pjCam', scene);
    const legMat = mat('pjLegMat', '#2b323c');
    for (let i = 0; i < 3; i++) {
      const leg = B().MeshBuilder.CreateCylinder('pjLeg' + i, { height: 2.0, diameter: 0.09 }, scene);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.45, 1.0, Math.sin(a) * 0.45);
      leg.rotation.z = Math.cos(a) * 0.24;
      leg.rotation.x = -Math.sin(a) * 0.24;
      leg.material = legMat; leg.parent = camGear;
    }
    const phone = B().MeshBuilder.CreateBox('pjPhone', { width: 0.9, height: 1.5, depth: 0.1 }, scene);
    phone.position.y = 2.6;
    phone.material = mat('pjPhoneMat', '#1c222b', '#5b6a80', 96);
    phone.parent = camGear;
    const lbl = B().MeshBuilder.CreatePlane('pjRec', { width: 0.86, height: 0.4 }, scene);
    lbl.position.set(0, 2.95, -0.06);
    lbl.rotation.y = Math.PI;
    const t = new (B().DynamicTexture)('pjRecTex', { width: 128, height: 60 }, scene, true);
    const c = t.getContext();
    c.translate(128, 0); c.scale(-1, 1);
    c.fillStyle = '#101418'; c.fillRect(0, 0, 128, 60);
    c.fillStyle = '#e8577a'; c.beginPath(); c.arc(22, 30, 10, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 26px sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('REC', 42, 32);
    t.update();
    const m = new (B().StandardMaterial)('pjRecMat', scene);
    m.diffuseTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    lbl.material = m; lbl.parent = camGear;
    camGear.position.set(12 * M, 0, -5.5);
  }

  /* ── 스트로보 잔상 + 속도 화살표 ─────────────── */
  function clearGhosts() {
    ghosts.forEach((g) => g.dispose());
    arrows.forEach((a) => a.dispose());
    ghosts = []; arrows = [];
  }

  function addGhost(p) {
    const s = B().MeshBuilder.CreateSphere('pjGh' + ghosts.length, { diameter: 0.55 }, scene);
    s.position.set(p.x * M, p.y * M, 0);
    const m = new (B().StandardMaterial)('pjGhM' + ghosts.length, scene);
    m.emissiveColor = B().Color3.FromHexString('#f0a53c');
    m.disableLighting = true; m.alpha = 0.55;
    s.material = m; s.isPickable = false;
    ghosts.push(s);

    if (state.showArrow) {
      // vx (파랑, 수평) / vy (빨강, 연직) — 길이는 속도에 비례 (0.12 unit per m/s)
      const K = 0.12;
      const mk = (len, hex) => {
        const a = B().MeshBuilder.CreateCylinder('pjAr' + arrows.length,
          { height: Math.abs(len), diameterTop: 0.0, diameterBottom: 0.14 }, scene);
        const mm = new (B().StandardMaterial)('pjArM' + arrows.length, scene);
        mm.emissiveColor = B().Color3.FromHexString(hex);
        mm.disableLighting = true;
        a.material = mm; a.isPickable = false;
        arrows.push(a);
        return a;
      };
      const ax = mk(p.vx * K, '#2f6ad0');
      ax.rotation.z = -Math.PI / 2;   // +x 방향
      ax.position.set(p.x * M + p.vx * K / 2, p.y * M, 0);
      const ay = mk(p.vy * K, '#e8577a');
      if (p.vy >= 0) { ay.position.set(p.x * M, p.y * M + p.vy * K / 2, 0); }
      else { ay.rotation.z = Math.PI; ay.position.set(p.x * M, p.y * M + p.vy * K / 2, 0); }
    }
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      launcher: { x: 0, z: 0, w: 4, h: 3.4, label: '발사대' },
      ball: { x: 0, z: -3.4, w: 3, h: 2.4, label: '공' },
      board: { x: FIELD / 2 * M, z: 3.2, w: 12, h: 2.6, label: '모눈종이 판' },
      camGear: { x: 12 * M, z: -5.5, w: 4.4, h: 3.0, label: '스마트 기기' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 420, height: 120 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 420, 120);
      ctx.strokeStyle = '#2f6ad0'; ctx.lineWidth = 5;
      ctx.setLineDash([15, 11]);
      ctx.strokeRect(7, 7, 406, 106);
      ctx.setLineDash([]);
      ctx.fillStyle = '#2f6ad0';
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
    launcher.setEnabled(!!placed.launcher);
    ball.setEnabled(!!placed.ball);
    board.setEnabled(!!placed.board);
    camGear.setEnabled(!!placed.camGear);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    reset();
  }

  function dropAt(id, point) {
    const c = { launcher: [0, 0], ball: [0, -3.4], board: [FIELD / 2 * M, 3.2], camGear: [12 * M, -5.5] }[id];
    return (Math.abs(point.x - c[0]) <= 7 && Math.abs(point.z - c[1]) <= 4) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    sim = { t: 0, samples: [], nextSample: 0, done: false };
    clearGhosts();
    layout();
    drawBoard();
  }

  function layout() {
    if (!sim) return;
    const p = at(sim.t);
    ball.position.set(p.x * M, Math.max(0, p.y) * M + 0.4, 0);
    // 발사대 포신은 발사각을 따라가고, 총구 끝이 공의 출발점(0, 0.4)과 일치한다
    // 포신 중심 = 총구 − (길이/2)·(cosθ, sinθ). 아래쪽 끝은 받침대 속에 숨는다.
    barrel.rotation.z = -(Math.PI / 2 - rad());
    barrel.position.set(-Math.cos(rad()) * 0.5, 0.4 - Math.sin(rad()) * 0.5, 0);
  }

  function tick(dt) {
    if (!sim || !state.running || sim.done) return false;

    sim.t += dt;
    const T = flightT();

    // 0.1 초마다 표본 (닫힌 식이라 정확한 시각에 찍힌다)
    while (sim.nextSample <= Math.min(sim.t, T)) {
      const tS = sim.nextSample;
      const p = at(tS);
      const e = energies(p);
      sim.samples.push({ t: +tS.toFixed(1), x: p.x, y: Math.max(0, p.y), vx: p.vx, vy: p.vy, ...e });
      addGhost(p);
      sim.nextSample += STROBE_DT;
    }

    if (sim.t >= T) {
      sim.t = T;
      sim.done = true;
      state.running = false;
      const btn = document.querySelector('#runBtn');
      if (btn) { btn.textContent = '▶ 발사'; btn.classList.remove('run'); }
      drawBoard();
    }
    layout();
    return true;
  }

  function update() {
    if (!sim) reset();
    else { layout(); drawBoard(); }
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.12;
    camera.beta = 1.18;
    camera.radius = 34;
    camera.setTarget(new (B().Vector3)(FIELD / 2 * M - 3, 6 * M, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '속력과 각도를 바꿔 발사해 보세요. 스트로보 잔상의 <b>수평 간격은 일정</b>하고(등속), <b>연직 간격은 변하는</b>(등가속도) 것을 모눈종이에서 확인하세요.';
  const prepGuide = '점선 자리에 발사대·공·모눈종이 판·스마트 기기를 끌어다 놓아 촬영 준비를 하세요.';

  function controlsHTML() {
    return `
      ${LabUI.slider('v0', '처음 속력<br><i>v</i><sub>0</sub>',
        { min: 6, max: 20, step: 0.5, value: state.v0, fmt: (v) => `${(+v).toFixed(1)} m/s` })}
      ${LabUI.slider('angle', '발사각<br><i>θ</i>',
        { min: 15, max: 75, step: 5, value: state.angle, fmt: (v) => `${v}°` })}
      ${LabUI.opts('질량 <i>m</i>', 'mass', [
        { v: 0.2, t: '0.2 kg' }, { v: 0.5, t: '0.5 kg' }, { v: 1.0, t: '1.0 kg' },
      ], state.mass, 1)}
      ${LabUI.opts('중력 가속도<br><i>g</i>', 'g', [
        { v: 9.8, t: '지구 9.8' }, { v: 10, t: '계산용 10' }, { v: 1.6, t: '달 1.6' },
      ], state.g, 1)}
      ${LabUI.opts('속도 화살표', 'showArrow', [
        { v: 1, t: '표시' }, { v: 0, t: '숨김' },
      ], state.showArrow ? 1 : 0, 1)}
      <div class="control">
        <div class="clabel">실험</div>
        <button class="power" id="runBtn">▶ 발사</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    const after = () => { reset(); onChange(); };
    LabUI.bindSlider(root, 'v0', state, 'v0', (v) => `${(+v).toFixed(1)} m/s`, after);
    LabUI.bindSlider(root, 'angle', state, 'angle', (v) => `${v}°`, after);
    LabUI.bindOpts(root, 'mass', state, 'mass', after);
    LabUI.bindOpts(root, 'g', state, 'g', after);
    LabUI.bindOpts(root, 'showArrow', state, 'showArrow', () => {
      state.showArrow = !!state.showArrow;
      after();
    });

    const run = root.querySelector('#runBtn');
    run.addEventListener('click', () => {
      if (sim && sim.done) reset();
      state.running = !state.running;
      run.textContent = state.running ? '비행 중' : '▶ 발사';
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
    const p = at(sim.t);
    const e = energies(p);
    const stage = !state.running && sim.t === 0 ? '발사 전'
      : sim.done ? '착지'
      : p.vy > 0.3 ? '올라가는 중 (vy 감소)'
      : p.vy < -0.3 ? '내려오는 중 (vy 증가)' : '최고점 부근 (vy ≈ 0)';
    return `
      <div class="row"><span>상태</span><b>${stage}</b></div>
      <div class="row"><span>시간 <i>t</i></span><b>${sim.t.toFixed(2)} s</b></div>
      <div class="row"><span>수평 위치 <i>x</i></span><b>${p.x.toFixed(2)} m</b></div>
      <div class="row"><span>연직 위치 <i>y</i></span><b>${Math.max(0, p.y).toFixed(2)} m</b></div>
      <div class="row"><span>수평 속도 <i>v<sub>x</sub></i></span>
        <b style="color:#5a9df0">${p.vx.toFixed(2)} m/s (일정)</b></div>
      <div class="row"><span>연직 속도 <i>v<sub>y</sub></i></span>
        <b style="color:#e8577a">${p.vy.toFixed(2)} m/s</b></div>

      <div class="sec">에너지</div>
      <div class="row"><span>운동 에너지 <i>E<sub>k</sub></i></span><b>${e.Ek.toFixed(2)} J</b></div>
      <div class="row"><span>위치 에너지 <i>E<sub>p</sub></i></span><b>${e.Ep.toFixed(2)} J</b></div>
      <div class="row"><span>역학적 에너지 <i>E</i></span>
        <b class="big">${e.E.toFixed(2)} J</b></div>

      <div class="sec">이론값</div>
      <div class="row"><span>최고점 높이 <i>H</i></span><b>${peakH().toFixed(2)} m</b></div>
      <div class="row"><span>수평 도달 거리 <i>R</i></span><b>${rangeR().toFixed(2)} m</b></div>
      <div class="row"><span>체공 시간</span><b>${flightT().toFixed(2)} s</b></div>
      <div class="formula"><i>v<sub>x</sub></i> = <i>v</i><sub>0</sub>cos<i>θ</i> ·
        <i>v<sub>y</sub></i> = <i>v</i><sub>0</sub>sin<i>θ</i> − <i>gt</i> ·
        <i>R</i> = <i>v</i><sub>0</sub><sup>2</sup>sin2<i>θ</i>/<i>g</i></div>`;
  }

  /* ══ 그래프 — 에너지-시간 (교과서 20~21쪽) ═══ */
  const graphTitle = '시간에 따른 에너지 (탐구 20쪽)';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const padL = 36, padR = 10, padT = 14, padB = 24;
    const gw = W - padL - padR, gh = H - padT - padB;
    const T = flightT();
    const E0 = 0.5 * state.mass * state.v0 * state.v0;
    const EMAX = E0 * 1.15;
    const xOf = (t) => padL + (t / T) * gw;
    const yOf = (e) => padT + gh - (e / EMAX) * gh;

    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(padL, padT + (i / 5) * gh); ctx.lineTo(padL + gw, padT + (i / 5) * gh); ctx.stroke();
    }

    // 이론 곡선
    const draw = (f, color, w2) => {
      ctx.strokeStyle = color; ctx.lineWidth = w2 || 2;
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const t = (i / 80) * T;
        const e = energies(at(t));
        const v = f(e);
        if (i === 0) ctx.moveTo(xOf(t), yOf(v)); else ctx.lineTo(xOf(t), yOf(v));
      }
      ctx.stroke();
    };
    draw((e) => e.Ek, '#ffd84a');
    draw((e) => e.Ep, '#5a9df0');
    draw((e) => e.E, '#69d98c', 2.5);

    // 측정 표본
    if (sim) {
      sim.samples.forEach((s) => {
        ctx.fillStyle = '#ffd84a';
        ctx.beginPath(); ctx.arc(xOf(s.t), yOf(s.Ek), 2.6, 0, 7); ctx.fill();
        ctx.fillStyle = '#5a9df0';
        ctx.beginPath(); ctx.arc(xOf(s.t), yOf(s.Ep), 2.6, 0, 7); ctx.fill();
        ctx.fillStyle = '#69d98c';
        ctx.beginPath(); ctx.arc(xOf(s.t), yOf(s.E), 2.6, 0, 7); ctx.fill();
      });
      // 현재 시각
      if (sim.t > 0 && sim.t < T) {
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xOf(sim.t), padT); ctx.lineTo(xOf(sim.t), padT + gh); ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(E0.toFixed(0) + ' J', padL - 4, yOf(E0));
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('시간 →', W - 4, padT + gh + 4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#ffd84a'; ctx.fillText('운동 Ek', padL + 5, padT + 3);
    ctx.fillStyle = '#5a9df0'; ctx.fillText('위치 Ep', padL + 60, padT + 3);
    ctx.fillStyle = '#69d98c'; ctx.fillText('역학적 E (일정)', padL + 115, padT + 3);
  }

  function graphFootHTML() {
    const E0 = 0.5 * state.mass * state.v0 * state.v0;
    return `올라갈 때 <b style="color:#ffd84a">Ek</b>가 줄어든 만큼
      <b style="color:#5a9df0">Ep</b>가 늘어나 합
      <b style="color:#69d98c">E = ½mv₀² = ${E0.toFixed(1)} J</b> 는 항상 일정합니다`;
  }

  /* ══ 기록표 (교과서 20쪽 표 그대로) ══════════ */
  const recordColumns = [
    '시간 (s)', '<i>x</i> (m)', '<i>y</i> (m)',
    '<i>v<sub>x</sub></i> (m/s)', '<i>v<sub>y</sub></i> (m/s)',
    '<i>E<sub>k</sub></i> (J)', '<i>E<sub>p</sub></i> (J)', '<i>E</i> (J)',
  ];

  function recordRow() {
    if (!sim || !sim.samples.length) return null;
    // 표가 너무 길어지지 않게 최대 8줄 (앞부분은 0.1 초 그대로, 길면 골라서)
    const S = sim.samples;
    const step = Math.max(1, Math.ceil(S.length / 8));
    const rows = [];
    for (let i = 0; i < S.length; i += step) {
      const s = S[i];
      rows.push([
        s.t.toFixed(1), s.x.toFixed(2), s.y.toFixed(2),
        s.vx.toFixed(2), s.vy.toFixed(2),
        s.Ek.toFixed(2), s.Ep.toFixed(2), s.E.toFixed(2),
      ]);
    }
    return rows;
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 발사 · 1 45°가 가장 멀리 · 2 여각(30°·60°) 같은 거리 · 3 달 중력 비교
     4 기록 남기기                                                          */
  const mis = { fired: false, range: {}, moon: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (sim && sim.samples && sim.samples.length > 4) {
      mis.fired = true;
      const R = sim.samples[sim.samples.length - 1].x;
      if (state.g > 5) mis.range[state.angle] = Math.max(mis.range[state.angle] || 0, R);
      else mis.moon = true;
    }
    if (i === 0) return mis.fired;
    if (i === 1) {
      // 45° 가 다른 각보다 멀리 날아간 것을 직접 확인
      const keys = Object.keys(mis.range).map(Number);
      if (!mis.range[45] || keys.length < 3) return false;
      return keys.every((a) => a === 45 || mis.range[a] <= mis.range[45] + 0.01);
    }
    if (i === 2) {
      const a = mis.range[30], b = mis.range[60];
      return !!(a && b) && Math.abs(a - b) < 0.3;
    }
    if (i === 3) return mis.moon;
    if (i === 4) return recs().length >= 5;
    return false;
  }

  return {
    missionDone,
    id: 'projectile',
    title: '포물선 운동 분석 — 스트로보 촬영',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, at, energies, peakH, rangeR, flightT,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
