/**
 * 특수 상대성 이론 — 빛 시계로 보는 시간 팽창
 * 비상교육 고등 물리학 III-2-03 (교과서 160~165쪽), 그림 III-41
 *
 * 기차 안의 빛 시계를 두 관찰자가 본다.
 *   S′ (기차에 탄 사람) — 빛이 수직으로 왕복, 이동 거리 2L′  → 고유 시간
 *   S  (정지한 사람)    — 빛이 비스듬히 진행, 이동 거리 2L   → 더 긴 시간
 * 빛의 속력이 둘에게 똑같이 c 이므로 «시간» 이 달라질 수밖에 없다.
 */
const RelativityScene = (() => {
  const B = () => BABYLON;

  const C_SCENE = 9.0;        // 화면에서의 빛의 속력 (unit/s)
  const CLOCK_H = 4.0;        // 빛 시계의 높이 L₀ (unit) — 운동 방향과 수직이라 수축하지 않는다
  const TRAIN_L0 = 9.0;       // 기차의 고유 길이 (unit)
  const GROUND_Y = 0;
  const RAIL_SPAN = 30;

  let scene, camera;
  let train, ground, clockLo, clockHi, photon, trailSys = null;
  let observerS, observerSp, markers = [];
  let placed = {};
  let onChangeCb = null;      // 3D 에서 조작해도 측정값이 갱신되도록
  let canvasEl = null;        // create(engine, canvas) 의 canvas

  const state = {
    beta: 0.35,       // v / c (처음에는 중간 속력)
    view: 'S',        // S : 정지한 관찰자 / Sp : 기차에 탄 관찰자
    running: true,
  };

  // 진행 상태
  let tProper = 0;     // 기차 시계(고유 시간)
  let tGround = 0;     // 정지 관찰자의 시계
  let trainX = -10;
  let photonUp = true;
  let photonY = 0;
  const trail = [];
  const TRAIL_N = 90;

  const tools = [
    { id: 'rail', label: '선로 · 눈금자', icon: 'rail' },
    { id: 'train', label: '기차 (빛 시계)', icon: 'cart' },
    { id: 'observer', label: '관찰자 S · S′', icon: 'sensor' },
  ];

  const slots = { rail: { name: '선로' }, train: { name: '기차' }, observer: { name: '관찰자' } };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 로런츠 인자 γ = 1/√(1 − β²) */
  function gamma() {
    return 1 / Math.sqrt(Math.max(1e-9, 1 - state.beta * state.beta));
  }
  /** 고유 시간 한 주기 : 빛이 왕복하는 시간 2L₀/c */
  function properPeriod() { return 2 * CLOCK_H / C_SCENE; }
  /** 정지 관찰자가 재는 한 주기 */
  function groundPeriod() { return gamma() * properPeriod(); }
  /** 기차의 겉보기 길이 (길이 수축) */
  function contractedLength() { return TRAIN_L0 / gamma(); }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#0e1420ff');
    canvasEl = canvas;          // 끌기가 끝나면 여기에 카메라를 다시 붙인다

    camera = new (B().ArcRotateCamera)(
      'camRel', -Math.PI / 2, 1.32, 26, new (B().Vector3)(0, 3.0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 13;
    camera.upperRadiusLimit = 46;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hrel', new (B().Vector3)(0, 1, -0.4), scene);
    hemi.intensity = 0.78;
    hemi.groundColor = new (B().Color3)(0.2, 0.24, 0.3);

    const glow = new (B().GlowLayer)('glowRel', scene);
    glow.intensity = 0.95;

    buildGround();
    buildTrain();
    buildObservers();
    buildPlaceholders();
    buildStepper();
    buildBetaTag();
    setupPointer();

    // 상시 바닥 — 도구를 놓기 전에도 기본 배경이 보인다
    const __base = B().MeshBuilder.CreateGround('rlBase', { width: 44, height: 18 }, scene);
    __base.position.y = -0.5;
    const __bm = new (B().StandardMaterial)('rlBaseM', scene);
    __bm.diffuseColor = B().Color3.FromHexString('#161c28');
    __bm.specularColor = new (B().Color3)(0.03, 0.03, 0.05);
    __base.material = __bm;

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/relativity.jpg', { x: -13, y: 0, z: 6.5, ry: 0.3 });

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

  /** 선로와 거리 눈금 */
  function buildGround() {
    ground = new (B().TransformNode)('relGround', scene);

    const rail = B().MeshBuilder.CreateBox('relRail',
      { width: RAIL_SPAN, height: 0.4, depth: 3.0 }, scene);
    rail.position.set(0, GROUND_Y - 0.2, 0);
    rail.material = mat('relRailMat', '#2b3441', '#4c5766', 64);
    rail.parent = ground;

    // 1 단위마다 눈금 기둥 — 길이 수축이 보이는 기준
    for (let i = -12; i <= 12; i += 2) {
      const m2 = B().MeshBuilder.CreateBox('relMark' + i, { width: 0.16, height: 0.9, depth: 0.16 }, scene);
      m2.position.set(i, GROUND_Y + 0.45, -1.8);
      const mm = new (B().StandardMaterial)('relMarkM' + i, scene);
      mm.emissiveColor = B().Color3.FromHexString(i === 0 ? '#ffd84a' : '#5b6675');
      mm.disableLighting = true;
      m2.material = mm;
      m2.parent = ground;
      m2._x0 = i;
      markers.push(m2);
    }
  }

  /** 기차 + 빛 시계 */
  function buildTrain() {
    train = new (B().TransformNode)('relTrain', scene);

    const body = B().MeshBuilder.CreateBox('relBody',
      { width: TRAIN_L0, height: CLOCK_H + 1.6, depth: 2.6 }, scene);
    body.position.y = GROUND_Y + (CLOCK_H + 1.6) / 2 + 0.2;
    const bm = new (B().StandardMaterial)('relBodyMat', scene);
    bm.diffuseColor = B().Color3.FromHexString('#3d5f8a');
    bm.specularColor = B().Color3.FromHexString('#c8dcf0');
    bm.specularPower = 64;
    bm.alpha = 0.28;
    bm.backFaceCulling = false;
    body.material = bm;
    body.parent = train;
    train._body = body;

    // 창문
    for (let i = -1; i <= 1; i++) {
      const w = B().MeshBuilder.CreatePlane('relWin' + i, { width: 1.8, height: 1.4 }, scene);
      w.position.set(i * 3.0, GROUND_Y + CLOCK_H * 0.75, -1.32);
      w.rotation.y = Math.PI;
      const wm = new (B().StandardMaterial)('relWinM' + i, scene);
      wm.emissiveColor = B().Color3.FromHexString('#8fb8e0');
      wm.disableLighting = true;
      wm.alpha = 0.22;
      w.material = wm;
      w.parent = train;
    }

    // 빛 시계 — 아래·위 거울
    const mkMirror = (name, y) => {
      const m2 = B().MeshBuilder.CreateBox(name, { width: 2.0, height: 0.22, depth: 1.6 }, scene);
      m2.position.set(0, y, 0);
      const mm = new (B().StandardMaterial)(name + 'M', scene);
      mm.diffuseColor = B().Color3.FromHexString('#c3cad3');
      mm.emissiveColor = B().Color3.FromHexString('#3a4450');
      mm.specularColor = B().Color3.FromHexString('#ffffff');
      mm.specularPower = 128;
      m2.material = mm;
      m2.parent = train;
      return m2;
    };
    clockLo = mkMirror('relMirrorLo', GROUND_Y + 0.9);
    clockHi = mkMirror('relMirrorHi', GROUND_Y + 0.9 + CLOCK_H);

    // 거울을 잇는 기둥
    [-0.85, 0.85].forEach((dz, i) => {
      const post = B().MeshBuilder.CreateBox('relPost' + i, { width: 0.1, height: CLOCK_H, depth: 0.1 }, scene);
      post.position.set(0, GROUND_Y + 0.9 + CLOCK_H / 2, dz);
      const pm = new (B().StandardMaterial)('relPostM' + i, scene);
      pm.diffuseColor = B().Color3.FromHexString('#5b6675');
      post.material = pm;
      post.parent = train;
    });

    // 빛(광자)
    photon = B().MeshBuilder.CreateSphere('relPhoton', { diameter: 0.6, segments: 12 }, scene);
    const pm2 = new (B().StandardMaterial)('relPhotonMat', scene);
    pm2.emissiveColor = B().Color3.FromHexString('#ffe066');
    pm2.disableLighting = true;
    photon.material = pm2;
    photon.isPickable = false;
  }

  /** 두 관찰자 */
  function makeObserver(name, hex, x) {
    const g = new (B().TransformNode)(name, scene);
    const body = B().MeshBuilder.CreateCylinder(name + 'B',
      { height: 1.6, diameterTop: 0.5, diameterBottom: 0.8 }, scene);
    body.position.set(x, GROUND_Y + 0.8, 2.4);
    body.material = mat(name + 'BM', hex, '#ffffff', 48);
    body.parent = g;

    const head = B().MeshBuilder.CreateSphere(name + 'H', { diameter: 0.7 }, scene);
    head.position.set(x, GROUND_Y + 1.95, 2.4);
    head.material = mat(name + 'HM', '#e8c9a8');
    head.parent = g;

    const lab = B().MeshBuilder.CreatePlane(name + 'L', { width: 1.4, height: 0.9 }, scene);
    lab.position.set(x, GROUND_Y + 2.75, 2.4);
    lab.rotation.y = Math.PI;
    const tex = new (B().DynamicTexture)(name + 'T', { width: 140, height: 90 }, scene, true);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 140, 90);
    ctx.translate(140, 0); ctx.scale(-1, 1);
    ctx.fillStyle = hex;
    ctx.font = 'bold 58px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name === 'obsS' ? 'S' : 'S′', 70, 48);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tex.hasAlpha = true; tex.update();
    const lm = new (B().StandardMaterial)(name + 'LM', scene);
    lm.diffuseTexture = tex; lm.opacityTexture = tex;
    lm.emissiveColor = new (B().Color3)(1, 1, 1);
    lm.specularColor = new (B().Color3)(0, 0, 0);
    lm.backFaceCulling = false;
    lab.material = lm;
    lab.parent = g;
    return g;
  }

  function buildObservers() {
    observerS = makeObserver('obsS', '#5ad0f0', -11);      // 지면에 서 있다
    observerSp = makeObserver('obsSp', '#ffd84a', 0);      // 기차 안 (기차와 함께 움직인다)
    observerSp.getChildMeshes().forEach((m2) => { m2.position.z = -0.2; });
  }

  /** 빛이 지나간 자취 — S 에서는 지그재그, S′ 에서는 수직선 */
  function drawTrail() {
    if (trailSys) { trailSys.dispose(); trailSys = null; }
    if (trail.length < 2) return;
    trailSys = B().MeshBuilder.CreateLineSystem('relTrail', { lines: [trail.map((p) => p.clone())] }, scene);
    trailSys.color = B().Color3.FromHexString('#ffb03a');
    trailSys.alpha = 0.75;
    trailSys.isPickable = false;
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      rail: { x: 0, y: 0.4, w: RAIL_SPAN * 0.8, h: 1.6, label: '선로' },
      train: { x: 0, y: 3.4, w: TRAIN_L0 + 1, h: CLOCK_H + 2, label: '기차' },
      observer: { x: -11, y: 1.6, w: 3.0, h: 3.4, label: '관찰자' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreatePlane('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, c.y, 1.4);
      p.rotation.y = Math.PI;
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: true, color: '#5aa9ff' });
      const m2 = new (B().StandardMaterial)('phM_' + id, scene);
      m2.diffuseTexture = tex; m2.opacityTexture = tex;
      m2.emissiveColor = new (B().Color3)(1, 1, 1);
      m2.specularColor = new (B().Color3)(0, 0, 0);
      m2.backFaceCulling = false;
      p.material = m2;
      holders[id] = p;
    });
  }

  /* ══ 도구 배치 ═══════════════════════════════ */
  function resetTools() {
    // 기차를 끄는 도중에 실험을 바꾸면 카메라가 떨어진 채로 남는다 — 여기서 되돌린다
    if (dragTrain && camera && canvasEl) camera.attachControl(canvasEl, true);
    dragTrain = null;
    placed = {};
    tools.forEach((t) => { placed[t.id] = false; });
    resetRun();
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    ground.setEnabled(!!placed.rail);
    train.setEnabled(!!placed.train);
    photon.setEnabled(!!placed.train);
    observerS.setEnabled(!!placed.observer);
    observerSp.setEnabled(!!placed.observer && !!placed.train);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    if (id === 'rail') return Math.abs(point.y) <= 2.2 ? 'ok' : 'wrong';
    if (id === 'train') return point.y > 1.4 ? 'ok' : 'wrong';
    return Math.abs(point.x + 11) <= 5 ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function resetRun() {
    tProper = 0; tGround = 0;
    trainX = -10; photonY = 0; photonUp = true;
    trail.length = 0;
    groundShift = 0;
  }

  function tick(dt) {
    if (!state.running || !placed.train) return false;
    const step = Math.min(dt, 0.05);
    const g = gamma();
    const inTrainView = state.view === 'Sp';

    // 정지 관찰자의 시계는 항상 실제 시간으로 흐른다
    tGround += step;
    // 기차 시계는 γ 배 느리게 간다
    tProper += step / g;

    // 빛의 세로 속력 — S 에서는 c/γ (가로 성분 v 를 빼앗기므로)
    const vy = inTrainView ? C_SCENE : C_SCENE / g;
    photonY += (photonUp ? 1 : -1) * vy * step;
    if (photonY >= CLOCK_H) { photonY = CLOCK_H; photonUp = false; }
    if (photonY <= 0) { photonY = 0; photonUp = true; }

    // 기차의 위치
    if (!inTrainView) {
      trainX += state.beta * C_SCENE * step;
      if (trainX > 13) { trainX = -13; trail.length = 0; }
    } else {
      // 기차에 탄 사람이 보면 기차는 멈춰 있고 «땅» 이 뒤로 흐른다
      trainX = 0;
      groundShift -= state.beta * C_SCENE * step;
      if (groundShift < -4) groundShift += 4;
    }

    layout();

    // 자취
    trail.push(new (B().Vector3)(
      (inTrainView ? 0 : trainX), GROUND_Y + 0.9 + photonY, 0));
    if (trail.length > TRAIL_N) trail.shift();
    drawTrail();

    return true;
  }

  let groundShift = 0;

  function layout() {
    const inTrainView = state.view === 'Sp';
    train.position.x = trainX;

    // 길이 수축 — 정지 관찰자가 보면 기차가 짧아진다
    train._body.scaling.x = inTrainView ? 1 : 1 / gamma();

    photon.position.set(trainX, GROUND_Y + 0.9 + photonY, 0);

    // 기차에 탄 관찰자는 기차와 함께 움직인다
    observerSp.position.x = trainX + 3.2;

    // S′ 시점에서는 땅이 뒤로 흐르고, 땅의 눈금이 수축해 보인다
    // (흐르는 양 groundShift 는 tick 에서 실제 경과 시간으로 진행한다)
    if (inTrainView) {
      markers.forEach((m2) => {
        m2.position.x = m2._x0 / gamma() + groundShift;
      });
      observerS.position.x = groundShift;
      ground.position.x = 0;
    } else {
      markers.forEach((m2) => { m2.position.x = m2._x0; });
      observerS.position.x = 0;
      ground.position.x = 0;
    }

    layoutStepper();
  }

  function update() {
    if (!scene) return;
    layout();
    drawTrail();
  }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     · 기차를 오른쪽으로 밀면 빨라지고, 왼쪽으로 끌면 느려진다
     · 사람(S · S′)을 누르면 그 사람이 보는 장면으로 바뀐다
     · 빛 시계의 거울을 누르면 시계가 섰다가 다시 간다
     · 기차 위 ＋ / － 로 속력을 잘게 맞춘다                          */
  const BETA_MAX = 0.995;     // 하단 슬라이더와 같은 최댓값
  const DRAG_K = 0.07;        // 1 unit 끌 때 바뀌는 v/c
  const BETA_STEP = 0.025;    // ＋ / － 한 번에 바뀌는 v/c

  let stepBeta = null;
  let dragTrain = null;       // { x0, z0, beta0 } — 누른 순간의 값
  let betaTag = null, betaTex = null, betaShown = '';
  const TAG_W = 320, TAG_H = 80;

  function buildStepper() { stepBeta = LabUI.makeStepper(scene, 'Beta'); }

  /** ＋/－ 단추 위 이름표 — 무엇을 조절하는 단추인지 알려 준다 */
  function buildBetaTag() {
    betaTag = B().MeshBuilder.CreatePlane('relBetaTag', { width: 3.2, height: 0.8 }, scene);
    betaTex = new (B().DynamicTexture)('relBetaTagT', { width: TAG_W, height: TAG_H }, scene, true);
    betaTex.hasAlpha = true;
    const m = new (B().StandardMaterial)('relBetaTagM', scene);
    m.diffuseTexture = betaTex;
    m.opacityTexture = betaTex;
    // 글씨 색을 그림에서 그대로 가져온다 — 이것이 없으면 판 전체가 흰색으로 뭉개진다
    m.emissiveTexture = betaTex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    betaTag.material = m;
    betaTag.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    betaTag.isPickable = false;
    // 글로우 레이어에서 빼 준다 — 이름표가 하얗게 번지지 않게 (makeStepper 와 같은 방식)
    (scene.effectLayers || []).forEach((L) => { if (L.addExcludedMesh) L.addExcludedMesh(betaTag); });
    drawBetaTag();
  }

  function drawBetaTag() {
    if (!betaTex) return;
    const txt = `기차의 속력  ${state.beta.toFixed(3)} c`;
    if (txt === betaShown) return;      // 값이 그대로면 다시 그리지 않는다
    betaShown = txt;
    const c = betaTex.getContext();
    c.clearRect(0, 0, TAG_W, TAG_H);
    c.fillStyle = 'rgba(14,20,32,.72)';
    c.fillRect(0, 8, TAG_W, TAG_H - 16);
    c.fillStyle = '#ffd84a';
    let px = 34;
    c.font = `bold ${px}px "Noto Sans KR", sans-serif`;
    while (px > 14 && c.measureText(txt).width > TAG_W - 24) {
      px -= 2;
      c.font = `bold ${px}px "Noto Sans KR", sans-serif`;
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(txt, TAG_W / 2, TAG_H / 2);
    betaTex.update();
  }

  /** 기차 지붕(y ≈ 5.8)보다 위, 눈금 기둥보다 앞쪽에 띄워 부품과 겹치지 않게 한다 */
  function layoutStepper() {
    if (!stepBeta) return;
    const on = allPlaced();
    stepBeta.place(0, GROUND_Y + 7.4, -2.4, 1.1);
    stepBeta.setEnabled(on);
    if (betaTag) {
      betaTag.position.set(0, GROUND_Y + 8.3, -2.4);
      betaTag.setEnabled(on);
      drawBetaTag();          // 하단 슬라이더로 바꿔도 이름표가 따라온다
    }
  }

  /** 3D 조작 뒤 화면과 측정값을 새로 고친다 (셸의 refresh 가 update 를 다시 부른다) */
  function notify() {
    if (onChangeCb) onChangeCb();
    else update();
  }

  /** 3D 에서 바꾼 값을 아래쪽 조작 막대에도 그대로 비춘다 */
  function syncPanel() {
    const el = document.querySelector('#beta');
    const out = document.querySelector('#betaOut');
    if (el) el.value = state.beta;
    if (out) out.textContent = `${state.beta.toFixed(3)} c`;
    const mark = (key, val) => {
      document.querySelectorAll('[data-' + key + ']').forEach((b) => {
        b.classList.toggle('on', b.getAttribute('data-' + key) === String(val));
      });
    };
    mark('view', state.view);
    mark('preset', state.beta);
  }

  /** 값의 범위는 슬라이더와 똑같이 지킨다 */
  function setBeta(v) {
    const b = +Math.max(0, Math.min(BETA_MAX, v)).toFixed(3);
    if (b === state.beta) return;
    state.beta = b;
    trail.length = 0;         // 속력이 바뀌면 자취를 새로 그린다
    drawBetaTag();
    syncPanel();
    notify();
  }

  function setView(v) {
    if (state.view === v) return;
    state.view = v;
    trail.length = 0;
    resetRun();
    syncPanel();
    notify();
  }

  /** 빛 시계를 세우거나 다시 켠다 — 하단 단추와 같은 모습이 되도록 맞춘다 */
  function toggleRun() {
    state.running = !state.running;
    const btn = document.querySelector('#runBtn');
    if (btn) {
      btn.textContent = state.running ? '작동 중' : '▶ 시작';
      btn.classList.toggle('run', state.running);
      btn.classList.toggle('off', !state.running);
    }
    notify();
  }

  /** 이름이 맞는 메시만 골라 집는다 — 반투명한 기차 몸체에 가려지지 않게 한다 */
  function pickBy(re) {
    const p = scene.pick(scene.pointerX, scene.pointerY,
      (m) => m.isEnabled() && m.isVisible && m.isPickable && re.test(m.name));
    return (p && p.hit) ? p : null;
  }

  /** 화면 위 한 점을 «잡은 지점의 z» 를 지나는 세로 평면에서 세계 좌표 x 로 바꾼다 */
  function pointerX(atZ) {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(
      new (B().Vector3)(0, 0, atZ), new (B().Vector3)(0, 0, 1));
    const d = ray.intersectsPlane(plane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d)).x;
  }

  function setupPointer() {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;

      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced()) return;

        // ＋ / － — 속력을 잘게 맞춘다
        const btn = pickBy(/^btn(Add|Sub)Beta$/);
        if (btn) {
          setBeta(state.beta + (btn.pickedMesh.name === 'btnAddBeta' ? BETA_STEP : -BETA_STEP));
          return;
        }

        // 사람을 누르면 그 사람이 보는 장면으로 바뀐다
        const obs = pickBy(/^obsSp?[BHL]$/);
        if (obs) { setView(/^obsSp/.test(obs.pickedMesh.name) ? 'Sp' : 'S'); return; }

        // 빛 시계(거울·기둥)를 누르면 시계가 섰다가 다시 간다
        if (pickBy(/^(relMirror(Lo|Hi)|relPost\d)$/)) { toggleRun(); return; }

        // 기차를 잡는다 — 미는 쪽으로 빨라진다
        const car = pickBy(/^(relBody|relWin)/);
        if (car) {
          const z0 = car.pickedPoint.z;
          const x = pointerX(z0);
          if (x === null) return;
          dragTrain = { x0: x, z0, beta0: state.beta };
          camera.detachControl();
        }
      } else if (pi.type === T.POINTERMOVE && dragTrain) {
        const x = pointerX(dragTrain.z0);
        if (x === null) return;
        // 누른 순간의 어긋남을 빼 주어 «잡자마자 튀지» 않게 한다
        setBeta(dragTrain.beta0 + (x - dragTrain.x0) * DRAG_K);
      } else if (pi.type === T.POINTERUP && dragTrain) {
        dragTrain = null;
        camera.attachControl(canvasEl, true);
      }
    });
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = 1.32;
    camera.radius = 26;
    camera.setTarget(new (B().Vector3)(0, 3.0, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '기차의 속력을 올리며 두 관찰자의 시계를 비교하세요. 시점을 바꾸면 <b>빛이 지나간 자취</b>가 달라집니다.';
  const prepGuide = '점선으로 표시된 자리에 선로·기차·관찰자를 끌어다 놓으세요.';

  function controlsHTML() {
    return `
      ${LabUI.slider('beta', '기차의 속력<br><i>v</i>/<i>c</i>',
        { min: 0, max: 0.995, step: 0.001, value: state.beta, fmt: (v) => `${v.toFixed(3)} c` })}
      ${LabUI.opts('누구의<br>시점?', 'view', [
        { v: 'S', t: 'S — 정지한 사람' },
        { v: 'Sp', t: 'S′ — 기차에 탄 사람' },
      ], state.view, 2)}
      ${LabUI.opts('빠른<br>설정', 'preset', [
        { v: 0.1, t: '0.1c 일상' }, { v: 0.6, t: '0.6c (γ=1.25)' },
        { v: 0.866, t: '0.866c (γ=2)' }, { v: 0.99, t: '0.99c (γ=7)' },
      ], state.beta, 2)}
      <div class="control">
        <div class="clabel">빛 시계</div>
        <button class="power${state.running ? ' run' : ' off'}" id="runBtn">${state.running ? '작동 중' : '▶ 시작'}</button>
      </div>
      <div class="control">
        <div class="clabel">시계<br>맞추기</div>
        <button class="power off" id="resetBtn">↻ 0 으로</button>
      </div>
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          <b>기차를 오른쪽으로 밀면</b> 빨라지고 <b>왼쪽으로 끌면</b> 느려집니다.
          기차 위 <b>＋ · －</b> 로 속력을 잘게 맞춥니다.
          <b>사람(S · S′)을 누르면</b> 그 사람이 보는 장면으로 바뀌고,
          <b>빛 시계의 거울을 누르면</b> 시계가 섰다가 다시 갑니다.
        </p></div>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록
    const setB = LabUI.bindSlider(root, 'beta', state, 'beta', (v) => `${v.toFixed(3)} c`, () => {
      trail.length = 0; onChange();
    });
    LabUI.bindOpts(root, 'view', state, 'view', () => {
      trail.length = 0; resetRun(); onChange();
    }, String);
    root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      setB(b.dataset.preset);
      root.querySelectorAll('[data-preset]').forEach((o) => o.classList.toggle('on', o === b));
    }));

    const run = root.querySelector('#runBtn');
    run.addEventListener('click', () => {
      state.running = !state.running;
      run.textContent = state.running ? '작동 중' : '▶ 시작';
      run.classList.toggle('run', state.running);
      run.classList.toggle('off', !state.running);
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => { resetRun(); onChange(); });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const g = gamma();
    const v = state.beta * 3e8;
    const inTrain = state.view === 'Sp';

    return `
      <div class="row"><span>기차의 속력</span><b>${state.beta.toFixed(3)} <i>c</i></b></div>
      <div class="row"><span></span><b style="font-size:12px">${(v / 1000).toExponential(2)} km/s</b></div>
      <div class="row"><span>로런츠 인자 <i>γ</i></span><b class="big">${g.toFixed(3)}</b></div>
      <div class="row"><span>보고 있는 시점</span>
        <span class="tag ${inTrain ? 'con' : 'des'}">${inTrain ? 'S′ 기차 안' : 'S 지면'}</span></div>

      <div class="sec">빛 시계 한 번 왕복</div>
      <div class="row"><span>빛의 이동 거리 (S′)</span><b>2<i>L</i>′ = ${(2 * CLOCK_H).toFixed(1)}</b></div>
      <div class="row"><span>빛의 이동 거리 (S)</span><b>2<i>L</i> = ${(2 * CLOCK_H * g).toFixed(1)}</b></div>
      <div class="row"><span>고유 시간 Δ<i>t</i><sub>고유</sub></span>
        <b style="color:#d8a02f">${properPeriod().toFixed(3)} s</b></div>
      <div class="row"><span>정지 관찰자 Δ<i>t</i></span>
        <b style="color:#2f8fbf">${groundPeriod().toFixed(3)} s</b></div>

      <div class="sec">지금까지 흐른 시간</div>
      <div class="row"><span>기차 안 시계 (S′)</span>
        <b style="color:#d8a02f">${tProper.toFixed(2)} s</b></div>
      <div class="row"><span>지면 시계 (S)</span>
        <b style="color:#2f8fbf">${tGround.toFixed(2)} s</b></div>
      <div class="row"><span>차이</span><b>${(tGround - tProper).toFixed(2)} s 늦음</b></div>

      <div class="sec">길이 수축</div>
      <div class="row"><span>기차의 고유 길이</span><b>${TRAIN_L0.toFixed(1)}</b></div>
      <div class="row"><span>S 가 재는 길이</span>
        <b>${contractedLength().toFixed(2)} (${(100 / g).toFixed(0)} %)</b></div>
      <div class="formula">Δ<i>t</i> = <i>γ</i> Δ<i>t</i><sub>고유</sub> &nbsp;·&nbsp;
        <i>L</i> = <i>L</i><sub>0</sub> / <i>γ</i></div>
      <div class="formula"><i>γ</i> = 1 / √(1 − <i>v</i><sup>2</sup>/<i>c</i><sup>2</sup>)</div>`;
  }

  /* ══ 그래프 — γ 곡선 ════════════════════════ */
  const graphTitle = '속력에 따른 시간 팽창과 길이 수축';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const padL = 34, padR = 12, padT = 16, padB = 26;
    const gw = W - padL - padR, gh = H - padT - padB;
    const G_MAX = 6;
    const xOf = (b) => padL + b * gw;
    const yOf = (g) => padT + gh - Math.min(1, (g - 1) / (G_MAX - 1)) * gh;

    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 1;
    for (let b = 0.2; b <= 1; b += 0.2) {
      ctx.beginPath(); ctx.moveTo(xOf(b), padT); ctx.lineTo(xOf(b), padT + gh); ctx.stroke();
    }
    for (let g = 2; g <= G_MAX; g++) {
      ctx.beginPath(); ctx.moveTo(padL, yOf(g)); ctx.lineTo(padL + gw, yOf(g)); ctx.stroke();
    }

    // γ 곡선 (시간 팽창)
    ctx.strokeStyle = '#5ad0f0';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let px = 0; px <= gw; px++) {
      const b = (px / gw) * 0.995;
      const g = 1 / Math.sqrt(1 - b * b);
      if (g > G_MAX) break;
      const y = yOf(g);
      px === 0 ? ctx.moveTo(padL + px, y) : ctx.lineTo(padL + px, y);
    }
    ctx.stroke();

    // 1/γ 곡선 (길이 수축) — 0~1 범위라 오른쪽에 따로 축을 둔다
    const yInv = (inv) => padT + gh - inv * gh;
    ctx.strokeStyle = '#f0834a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let px = 0; px <= gw; px++) {
      const b = (px / gw) * 0.995;
      const y = yInv(Math.sqrt(1 - b * b));
      px === 0 ? ctx.moveTo(padL + px, y) : ctx.lineTo(padL + px, y);
    }
    ctx.stroke();

    // 현재 지점
    const g = gamma();
    ctx.fillStyle = '#4ad8a0';
    if (g <= G_MAX) {
      ctx.beginPath(); ctx.arc(xOf(state.beta), yOf(g), 4.5, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(74,216,160,.5)';
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(xOf(state.beta), padT); ctx.lineTo(xOf(state.beta), padT + gh); ctx.stroke();
    ctx.setLineDash([]);

    // γ = 1 기준선
    ctx.strokeStyle = 'rgba(255,255,255,.24)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yOf(1)); ctx.lineTo(padL + gw, yOf(1)); ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();

    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#9fb0c2';
    for (let b = 0; b <= 1; b += 0.2) ctx.fillText(b.toFixed(1), xOf(b), padT + gh + 4);

    // 왼쪽 축 : γ (파랑)
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5ad0f0';
    for (let g2 = 1; g2 <= G_MAX; g2 += 1) ctx.fillText(String(g2), padL - 3, yOf(g2));

    // 오른쪽 축 : 1/γ (주황) — 범위가 0~1 이라 축을 따로 둔다
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f0834a';
    [0, 0.5, 1].forEach((v) => ctx.fillText(v.toFixed(1), padL + gw + 3, yInv(v)));

    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#9fb0c2';
    ctx.fillText('v / c', W - 4, padT + gh + 4);

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#5ad0f0';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('γ — 시간 팽창 (왼쪽)', padL + 4, padT + 2);
    ctx.fillStyle = '#f0834a';
    ctx.fillText('1/γ — 길이 수축 (오른쪽)', padL + 118, padT + 2);
  }

  function graphFootHTML() {
    const g = gamma();
    if (state.beta < 0.02) return `<i>v</i> = 0 이면 <i>γ</i> = 1 — 두 시계가 <b>똑같이</b> 갑니다`;
    if (state.beta < 0.15) return `일상 속력에서는 <i>γ</i> ≈ ${g.toFixed(4)} 로
      <b>차이를 느낄 수 없습니다</b> — 그래서 뉴턴 역학으로 충분합니다`;
    return `<i>γ</i> = <b>${g.toFixed(2)}</b> — 기차 시계가 지면 시계보다
      <b>${g.toFixed(2)} 배 느리게</b> 가고, 기차 길이는 <b>${(100 / g).toFixed(0)} %</b> 로 줄어 보입니다`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '<i>v</i>/<i>c</i>', '<i>γ</i>', '빛의 거리 2<i>L</i>',
    'Δ<i>t</i><sub>고유</sub> (s)', 'Δ<i>t</i> (s)', '기차 길이 (%)',
  ];

  function recordRow() {
    const g = gamma();
    return [
      state.beta.toFixed(3), g.toFixed(3), (2 * CLOCK_H * g).toFixed(1),
      properPeriod().toFixed(3), groundPeriod().toFixed(3), (100 / g).toFixed(1),
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 광속의 60 % 이상 · 1 두 관찰자 시점 모두 보기 · 2 γ ≥ 2
     3 γ ≈ 1 인 저속 확인 · 4 기록 4줄                                     */
  const mis = { views: {}, fast: false, slow: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    mis.views[state.view] = true;
    if (gamma() >= 2) mis.fast = true;
    if (state.beta <= 0.2) mis.slow = true;
    if (i === 0) return state.beta >= 0.6;
    if (i === 1) return Object.keys(mis.views).length >= 2;
    if (i === 2) return mis.fast;
    if (i === 3) return mis.slow;
    if (i === 4) return recs().length >= 4;
    return false;
  }

  return {
    missionDone,
    id: 'relativity',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '빛 시계로 보는 시간 팽창',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, gamma, properPeriod, groundPeriod, contractedLength,
    get times() { return { tProper, tGround }; },
    get scene() { return scene; },
  };
})();
