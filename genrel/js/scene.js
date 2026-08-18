/**
 * 등가 원리 승강기 — 시공간 여행 (① 시공간 초월형)
 * 비상교육 고등 역학과 에너지 I-06 (교과서 36~39쪽)
 *
 * 승강기 모드 — 해 보기 36쪽: 승강기의 가속도에 따라 체중계 눈금이 달라진다.
 *              자유 낙하 = 우주 무중력, 우주에서 g 가속 = 지표면 정지 (등가 원리).
 * 빛 모드    — 그림 I-30: 가속하는 우주선과 중력이 있는 곳에서 빛은 똑같이 휜다.
 * 시계 모드  — 39쪽: 중력 시간 지연과 GPS 보정.
 */
const GenrelScene = (() => {
  const B = () => BABYLON;

  const G = 9.8;
  const MASS = 60;          // 탑승자 질량 (kg)
  const SHAFT_H = 9;        // 승강기 통로 높이 (m)
  const M = 1.2;

  // 승강기 시나리오 (해 보기 36쪽 표)
  const SCENARIOS = {
    rest:      { name: '지표면에 정지', a: 0, grav: true, move: false },
    upAcc:     { name: '올라가기 시작 (a=+2)', a: 2, grav: true, move: true },
    upConst:   { name: '등속으로 올라감', a: 0, grav: true, move: true, v0: 2 },
    upDec:     { name: '멈추기 직전 (a=−2)', a: -2, grav: true, move: true, v0: 3 },
    freefall:  { name: '줄이 끊어져 자유 낙하!', a: -G, grav: true, move: true },
    spaceRest: { name: '우주 공간에 정지', a: 0, grav: false, move: false },
    spaceAcc:  { name: '우주에서 g 로 가속', a: G, grav: false, move: true },
  };

  let scene, camera;
  let shaft, elevator, person, scaleBox, scaleTex, faceTex, thoughtTex;
  let rocket, photon, photonTrailPts = [], photonTrail;
  let clockG, clockTexA, clockTexB, bhMesh;
  let placed = {};

  const state = {
    mode: 'elevator',      // 'elevator' | 'light' | 'clock'
    scenario: 'rest',
    lightCase: 'accel',    // 'rest' | 'accel' | 'gravity'
    gFactor: 3,            // 시계 모드: 중력 배율 (연출용 과장)
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'elevT', label: '승강기', icon: 'bench' },
    { id: 'scaleT', label: '체중계', icon: 'weight' },
    { id: 'phoneT', label: '가속도 측정 앱', icon: 'sensor' },
    { id: 'clockT', label: '정밀 시계 2개', icon: 'stopwatch' },
  ];
  const slots = {
    elevT: { name: '통로 안 (승강기)' },
    scaleT: { name: '승강기 바닥' },
    phoneT: { name: '승강기 안' },
    clockT: { name: '오른쪽 (시계)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 체중계 눈금(N): 지상에서는 N = m(g+a), 무중력에서는 N = m·a */
  function scaleN() {
    const sc = SCENARIOS[state.scenario];
    return Math.max(0, sc.grav ? MASS * (G + sc.a) : MASS * sc.a);
  }
  const scaleKg = () => scaleN() / G;

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#1a2233ff');

    camera = new (B().ArcRotateCamera)(
      'camGr', -Math.PI / 2, 1.35, 22, new (B().Vector3)(0, 5, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 50;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hg', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.4, 0.42, 0.5);
    const dir = new (B().DirectionalLight)('dg', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 20, -10);
    dir.intensity = 0.35;

    buildElevator();
    buildLight();
    buildClocks();
    buildProps();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/genrel.jpg', { x: -8, y: 0, z: 6.5, ry: 0.3 });

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
  function texPlane(name, w, h, tw, th) {
    const p = B().MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    const t = new (B().DynamicTexture)(name + 'Tex', { width: tw, height: th }, scene, true);
    const m = new (B().StandardMaterial)(name + 'Mat', scene);
    m.diffuseTexture = t; m.emissiveTexture = t; m.opacityTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    p.material = m;
    return [p, t];
  }

  function buildElevator() {
    shaft = new (B().TransformNode)('grShaft', scene);
    // 통로 (뒤 벽 + 레일)
    const wall = B().MeshBuilder.CreateBox('grWall', { width: 5.4, height: SHAFT_H * M + 2, depth: 0.3 }, scene);
    wall.position.set(0, (SHAFT_H * M) / 2, 2.4);
    wall.material = mat('grWallMat', '#3a4356', '#5a6a86', 48);
    wall.parent = shaft;
    [-2.1, 2.1].forEach((x, i) => {
      const r = B().MeshBuilder.CreateBox('grRail' + i, { width: 0.16, height: SHAFT_H * M + 2, depth: 0.16 }, scene);
      r.position.set(x, (SHAFT_H * M) / 2, 2.1);
      r.material = mat('grRailM' + i, '#232b3a');
      r.parent = shaft;
    });
    // 바닥은 항상 보이는 기본 배경
    const ground = B().MeshBuilder.CreateGround('grGround', { width: 26, height: 16 }, scene);
    ground.material = mat('grGroundMat', '#4a5468');

    elevator = new (B().TransformNode)('grElev', scene);
    // 승강기: 바닥 + 뒤벽 + 옆벽 (앞이 열려 있어 안이 보인다)
    const floor = B().MeshBuilder.CreateBox('grFloor', { width: 3.6, height: 0.24, depth: 3.2 }, scene);
    floor.position.y = 0.12;
    floor.material = mat('grFloorMat', '#8a93a6', '#c6ccd8', 64);
    floor.parent = elevator;
    const back = B().MeshBuilder.CreateBox('grBack', { width: 3.6, height: 3.4, depth: 0.14 }, scene);
    back.position.set(0, 1.8, 1.55);
    back.material = mat('grBackMat', '#aab3c4', '#dfe4ee', 64);
    back.parent = elevator;
    [-1.76, 1.76].forEach((x, i) => {
      const s = B().MeshBuilder.CreateBox('grSide' + i, { width: 0.14, height: 3.4, depth: 3.2 }, scene);
      s.position.set(x, 1.8, 0);
      s.material = mat('grSideM' + i, '#9aa3b6', '#ccd2e0', 64);
      s.parent = elevator;
    });
    const top = B().MeshBuilder.CreateBox('grTop', { width: 3.6, height: 0.16, depth: 3.2 }, scene);
    top.position.y = 3.55;
    top.material = mat('grTopMat', '#8a93a6');
    top.parent = elevator;
    // 케이블
    const cable = B().MeshBuilder.CreateCylinder('grCable', { height: 8, diameter: 0.1 }, scene);
    cable.position.y = 7.6;
    cable.material = mat('grCableMat', '#232b3a');
    cable.parent = elevator;
    elevator._cable = cable;

    // 체중계
    scaleBox = B().MeshBuilder.CreateBox('grScale', { width: 1.3, height: 0.22, depth: 1.0 }, scene);
    scaleBox.position.set(0, 0.35, -0.2);
    scaleBox.material = mat('grScaleMat', '#d8dde8', '#ffffff', 96);
    scaleBox.parent = elevator;
    const [sp, st] = texPlane('grScaleDisp', 1.15, 0.5, 300, 130);
    sp.position.set(0, 0.62, -0.75);
    sp.rotation.x = -0.5;
    sp.parent = elevator;
    scaleTex = st;

    // 사람 (캡슐 + 머리)
    person = new (B().TransformNode)('grPerson', scene);
    const body = B().MeshBuilder.CreateCapsule('grBody', { height: 1.5, radius: 0.34 }, scene);
    body.position.y = 1.25;
    body.material = mat('grBodyMat', '#5a9df0', '#cfe4ff', 48);
    body.parent = person;
    const head = B().MeshBuilder.CreateSphere('grHead', { diameter: 0.52 }, scene);
    head.position.y = 2.3;
    head.material = mat('grHeadMat', '#e8b48a');
    head.parent = person;
    person.position.set(0, 0.46, -0.2);
    person.parent = elevator;

    // 말풍선
    const [tp, tt] = texPlane('grThought', 3.4, 1.15, 460, 156);
    tp.position.set(0, 4.35, -1.2);
    tp.parent = elevator;
    thoughtTex = tt;
  }

  /** 빛 모드 — 우주선 안의 빛 (그림 I-30) */
  function buildLight() {
    rocket = new (B().TransformNode)('grRocket', scene);
    const hull = B().MeshBuilder.CreateBox('grHull', { width: 7.5, height: 4.2, depth: 0.25 }, scene);
    hull.position.set(0, 2.1, 1.6);
    hull.material = mat('grHullMat', '#3a4356', '#6a7a96', 48);
    hull.parent = rocket;
    const frame = B().MeshBuilder.CreateBox('grFr1', { width: 7.9, height: 0.2, depth: 1.8 }, scene);
    frame.position.y = 0.05;
    frame.material = mat('grFrM', '#8a93a6', '#c6ccd8', 64);
    frame.parent = rocket;
    const frameT = frame.clone('grFr2'); frameT.position.y = 4.2; frameT.parent = rocket;
    // 광원 (왼쪽 벽)
    const src = B().MeshBuilder.CreateCylinder('grSrc', { height: 0.5, diameter: 0.4 }, scene);
    src.rotation.z = Math.PI / 2;
    src.position.set(-3.6, 2.6, 0.6);
    src.material = emat('grSrcMat', '#ffd84a');
    src.parent = rocket;
    // 로켓 엔진 불꽃
    const flame = B().MeshBuilder.CreateCylinder('grFlame', { height: 1.1, diameterTop: 1.6, diameterBottom: 0.3 }, scene);
    flame.position.y = -0.75;
    flame.material = emat('grFlameMat', '#ff8a3c', 0.85);
    flame.parent = rocket;
    rocket._flame = flame;

    photon = B().MeshBuilder.CreateSphere('grPhoton', { diameter: 0.3 }, scene);
    photon.material = emat('grPhotonMat', '#ffd84a');
  }

  const props = {};

  /** 준비 단계용 소품 — 가속도 앱 스마트폰과 정밀 시계 */
  function buildProps() {
    const mk = (id, x, z, hex) => {
      const g = new (B().TransformNode)('grProp' + id, scene);
      const body = B().MeshBuilder.CreateBox('grPropB' + id, { width: 0.7, height: 1.2, depth: 0.14 }, scene);
      body.position.y = 0.6;
      body.rotation.x = -0.35;
      body.material = mat('grPropBM' + id, hex, '#8fa0b8', 96);
      body.parent = g;
      const scr = B().MeshBuilder.CreatePlane('grPropS' + id, { width: 0.58, height: 1.0 }, scene);
      scr.position.set(0, 0.62, -0.085);
      scr.rotation.x = -0.35;
      scr.material = emat('grPropSM' + id, '#1a3a2a');
      scr.parent = g;
      g.position.set(x, 0, z);
      g.setEnabled(false);
      return g;
    };
    props.phoneT = mk('P', -4.6, -2.6, '#1c222b');
    props.clockT = mk('C', 4.8, -2.6, '#3a2c22');
  }

  /** 시계 모드 — 중력 시간 지연 */
  function buildClocks() {
    clockG = new (B().TransformNode)('grClocks', scene);
    bhMesh = B().MeshBuilder.CreateSphere('grBH', { diameter: 3.2 }, scene);
    bhMesh.position.set(0, 1.6, 0);
    bhMesh.material = mat('grBHMat', '#20242e', '#5a6a86', 128);
    bhMesh.parent = clockG;
    // 강착 원반 느낌의 고리
    const ring = B().MeshBuilder.CreateTorus('grBHRing', { diameter: 4.6, thickness: 0.16 }, scene);
    ring.position.set(0, 1.6, 0);
    ring.rotation.x = 0.5;
    ring.material = emat('grBHRingMat', '#f0a53c', 0.9);
    ring.parent = clockG;

    const mk = (x) => {
      const [p, t] = texPlane('grClock' + x, 2.6, 2.6, 300, 300);
      p.position.set(x, 3.4, 0);
      p.parent = clockG;
      return t;
    };
    clockTexA = mk(-4.2);   // 천체 표면 (중력 큼)
    clockTexB = mk(4.6);    // 먼 우주 (중력 작음)
  }

  function drawClock(tex, t, label, hex) {
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 300, 300);
    ctx.fillStyle = '#f6f2e6';
    ctx.beginPath(); ctx.arc(150, 140, 108, 0, 7); ctx.fill();
    ctx.strokeStyle = hex; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(150 + Math.cos(a) * 92, 140 + Math.sin(a) * 92);
      ctx.lineTo(150 + Math.cos(a) * 102, 140 + Math.sin(a) * 102);
      ctx.stroke();
    }
    // 초침 (12시간이 아니라 60초에 한 바퀴 — 연출)
    const a = -Math.PI / 2 + (t / 60) * Math.PI * 2;
    ctx.strokeStyle = '#d0453a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(150, 140);
    ctx.lineTo(150 + Math.cos(a) * 84, 140 + Math.sin(a) * 84); ctx.stroke();
    ctx.fillStyle = '#e8ecf4';
    ctx.font = 'bold 30px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(label, 150, 258);
    ctx.fillStyle = hex;
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(t.toFixed(1) + ' s', 150, 108);
    tex.update();
  }

  function drawScale() {
    const ctx = scaleTex.getContext();
    ctx.clearRect(0, 0, 300, 130);
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, 300, 130);
    ctx.fillStyle = '#69d98c';
    ctx.font = 'bold 56px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(scaleKg().toFixed(1), 150, 46);
    ctx.fillStyle = '#9fb0c2';
    ctx.font = 'bold 24px "Noto Sans KR", sans-serif';
    ctx.fillText('kg중', 150, 100);
    scaleTex.update();
  }

  function drawThought() {
    const sc = SCENARIOS[state.scenario];
    const ctx = thoughtTex.getContext();
    ctx.clearRect(0, 0, 460, 156);
    ctx.fillStyle = 'rgba(246,242,230,.95)';
    ctx.beginPath();
    ctx.roundRect(6, 6, 448, 110, 24);
    ctx.fill();
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 30px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const msg = state.scenario === 'freefall' ? '어? 몸이 떠오르는데… 우주인가?'
      : state.scenario === 'spaceAcc' ? '바닥이 눌리네… 지구인가?'
      : state.scenario === 'spaceRest' ? '둥실둥실~ 무중력!'
      : sc.a > 0 ? '몸이 무거워졌어!'
      : sc.a < 0 ? '몸이 가벼워졌어!' : '평소 몸무게야.';
    ctx.fillText(msg, 230, 60);
    thoughtTex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      elevT: { x: 0, z: 0, w: 4.4, h: 3.8, label: '승강기' },
      scaleT: { x: 0, z: -4.2, w: 3.2, h: 2.4, label: '체중계' },
      phoneT: { x: -4.6, z: -2.6, w: 3.6, h: 2.4, label: '가속도 앱' },
      clockT: { x: 4.8, z: -2.6, w: 3.6, h: 2.4, label: '정밀 시계' },
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
    return (Math.abs(point.x - c.x) <= 4 && Math.abs(point.z - c.z) <= 3.2) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    sim = {
      // 승강기
      y: 0, v: SCENARIOS[state.scenario].v0 || 0, t: 0, done: false,
      history: [],           // {t, N}
      // 빛
      px: -3.6, py: 2.6, rocketV: 0, rocketY: 0, lightTrail: [],
      // 시계
      tA: 0, tB: 0,
    };
    if (photonTrail) { photonTrail.dispose(); photonTrail = null; }
    photonTrailPts = [];
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const el = state.mode === 'elevator';
    const li = state.mode === 'light';
    const cl = state.mode === 'clock';

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다 (바닥은 항상 보임)
    if (!all) {
      shaft.setEnabled(!!placed.elevT);
      elevator.setEnabled(!!placed.elevT);
      if (placed.elevT) elevator.position.y = 0;
      scaleBox.setEnabled(!!placed.scaleT);
      rocket.setEnabled(false);
      photon.setEnabled(false);
      clockG.setEnabled(false);
      if (props.phoneT) props.phoneT.setEnabled(!!placed.phoneT);
      if (props.clockT) props.clockT.setEnabled(!!placed.clockT);
      return;
    }
    scaleBox.setEnabled(true);
    if (props.phoneT) props.phoneT.setEnabled(el);
    if (props.clockT) props.clockT.setEnabled(false);

    shaft.setEnabled(el);
    elevator.setEnabled(el);
    rocket.setEnabled(li);
    photon.setEnabled(li);
    clockG.setEnabled(cl);

    if (el) {
      elevator.position.y = sim.y * M;
      const sc = SCENARIOS[state.scenario];
      elevator._cable.setEnabled(state.scenario !== 'freefall' && sc.grav);
      // 자유 낙하·무중력이면 사람이 살짝 떠오른다
      const float = (state.scenario === 'freefall' || state.scenario === 'spaceRest') ? 0.3 : 0;
      person.position.y = 0.46 + float;
      drawScale();
      drawThought();
    } else if (li) {
      photon.position.set(sim.px, sim.py - sim.rocketY, 0.6);
      rocket._flame.setEnabled(state.lightCase === 'accel');
      // 자취 (우주선 기준 좌표)
      if (photonTrailPts.length > 1) {
        if (photonTrail) photonTrail.dispose();
        photonTrail = B().MeshBuilder.CreateLines('grPTrail', {
          points: photonTrailPts.map((p) => new (B().Vector3)(p.x, p.y, 0.6)),
        }, scene);
        photonTrail.color = B().Color3.FromHexString('#ffd84a');
      }
    } else if (cl) {
      drawClock(clockTexA, sim.tA, '천체 표면 (중력 큼)', '#e8577a');
      drawClock(clockTexB, sim.tB, '먼 우주 (중력 작음)', '#5a9df0');
    }
  }

  function tick(dt) {
    if (!sim || !state.running) return false;

    if (state.mode === 'elevator') {
      if (sim.done) return false;
      const sc = SCENARIOS[state.scenario];
      // 지표면 정지·우주 정지는 움직이지 않는다
      const aMove = sc.move ? sc.a : 0;
      // 우주 가속은 위로 계속, 통로 밖으로 나가지 않게 화면상 y 는 제자리
      if (state.scenario === 'spaceAcc' || state.scenario === 'spaceRest') {
        sim.t += dt;
      } else {
        sim.v += (state.scenario === 'freefall' ? -G : aMove) * dt * (state.scenario === 'upDec' ? 1 : 1);
        if (state.scenario === 'upDec' && sim.v <= 0) { sim.v = 0; sim.done = true; }
        sim.y += sim.v * dt;
        sim.t += dt;
        if (sim.y >= SHAFT_H) { sim.y = SHAFT_H; sim.done = true; }
        if (sim.y <= 0 && sim.v < 0) { sim.y = 0; sim.v = 0; sim.done = true; }
      }
      sim.history.push({ t: sim.t, N: scaleN() });
      if (sim.history.length > 400) sim.history.shift();
      if (sim.done) {
        state.running = false;
        const btn = document.querySelector('#runBtn');
        if (btn) { btn.textContent = '▶ 출발'; btn.classList.remove('run'); }
      }
      layout();
      return true;
    }

    if (state.mode === 'light') {
      // 광자: 관성계에서 수평 등속. 우주선이 가속(또는 중력)이면
      // 우주선 기준 좌표에서 아래로 휘어 보인다.
      const C_VIS = 3.2;         // 연출용 빛 속도 (unit/s)
      const A_VIS = 2.8;         // 연출용 가속도
      sim.px += C_VIS * dt;
      if (state.lightCase !== 'rest') {
        sim.rocketY += 0.5 * A_VIS * ((sim.t + dt) ** 2 - sim.t ** 2); // 우주선이 올라간 거리
      }
      sim.t += dt;
      const relY = sim.py - sim.rocketY;
      photonTrailPts.push({ x: sim.px, y: relY });
      if (sim.px > 3.8) {
        // 반대쪽 벽 도달 → 새 광자
        sim.px = -3.6; sim.rocketY = 0; sim.t = 0;
        photonTrailPts = [];
      }
      layout();
      return true;
    }

    // 시계 모드: 중력이 큰 곳의 시계가 느리게 간다 (연출 배율)
    const slow = 1 / (1 + state.gFactor * 0.25);
    sim.tA += dt * slow;
    sim.tB += dt;
    layout();
    return true;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = 1.35;
    camera.radius = 22;
    camera.setTarget(new (B().Vector3)(0, state.mode === 'elevator' ? 5 : 2.5, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '승강기의 운동 상태를 바꿔 가며 체중계 눈금을 관찰하세요. 자유 낙하와 우주 무중력을 구별할 수 있을까요?';
  const prepGuide = '점선 자리에 승강기·체중계·가속도 앱·정밀 시계를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'elevator', t: '🛗 승강기 (36쪽)' },
      { v: 'light', t: '💡 빛의 휘어짐 (38쪽)' },
      { v: 'clock', t: '⏱ 시간 지연 (39쪽)' },
    ], state.mode, 1);

    if (state.mode === 'elevator') {
      return `
        ${modeBtns}
        ${LabUI.opts('승강기 상태', 'scenario', [
          { v: 'rest', t: '지표면 정지' },
          { v: 'upAcc', t: '출발 (가속 ↑)' },
          { v: 'upConst', t: '등속 ↑' },
          { v: 'upDec', t: '정지 직전 (감속)' },
          { v: 'freefall', t: '자유 낙하 !' },
          { v: 'spaceRest', t: '우주 정지' },
          { v: 'spaceAcc', t: '우주 g 가속' },
        ], state.scenario, 2)}
        <div class="control">
          <div class="clabel">실험</div>
          <button class="power" id="runBtn">▶ 출발</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    if (state.mode === 'light') {
      return `
        ${modeBtns}
        ${LabUI.opts('우주선 상태<br>(그림 I-30)', 'lightCase', [
          { v: 'rest', t: '(가) 정지' },
          { v: 'accel', t: '(나) 가속' },
          { v: 'gravity', t: '(다) 중력 속 정지' },
        ], state.lightCase, 1)}
        <div class="control">
          <div class="clabel">빛 쏘기</div>
          <button class="power" id="runBtn">▶ 발사</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.slider('gFactor', '천체의 중력<br>(연출 배율)',
        { min: 0, max: 10, step: 1, value: state.gFactor, fmt: (v) => `×${v}` })}
      <div class="control">
        <div class="clabel">시계</div>
        <button class="power" id="runBtn">▶ 시작</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      reset();
      resetCamera();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.mode === 'elevator') {
      LabUI.bindOpts(root, 'scenario', state, 'scenario', () => { reset(); onChange(); }, String);
    } else if (state.mode === 'light') {
      LabUI.bindOpts(root, 'lightCase', state, 'lightCase', () => { reset(); onChange(); }, String);
    } else {
      LabUI.bindSlider(root, 'gFactor', state, 'gFactor', (v) => `×${v}`, () => { reset(); onChange(); });
    }

    const run = root.querySelector('#runBtn');
    const labels = { elevator: '▶ 출발', light: '▶ 발사', clock: '▶ 시작' };
    run.addEventListener('click', () => {
      if (state.mode === 'elevator' && sim.done) reset();
      state.running = !state.running;
      run.textContent = state.running ? '진행 중' : labels[state.mode];
      run.classList.toggle('run', state.running);
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      run.textContent = labels[state.mode];
      run.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'elevator') {
      const sc = SCENARIOS[state.scenario];
      const N = scaleN();
      const pair = state.scenario === 'freefall' ? '≡ 우주 무중력과 구별 불가!'
        : state.scenario === 'spaceAcc' ? '≡ 지표면 정지와 구별 불가!'
        : state.scenario === 'spaceRest' ? '≡ 자유 낙하와 구별 불가!'
        : state.scenario === 'rest' ? '≡ 우주에서 g 가속과 구별 불가!' : '';
      return `
        <div class="row"><span>상태</span><b>${sc.name}</b></div>
        <div class="row"><span>가속도 <i>a</i></span><b>${sc.a.toFixed(1)} m/s²</b></div>
        <div class="row"><span>중력</span><b>${sc.grav ? '있음 (지구)' : '없음 (우주)'}</b></div>
        <div class="sec">측정</div>
        <div class="row"><span>체중계 눈금</span>
          <b class="big">${scaleKg().toFixed(1)} kg중 (${N.toFixed(0)} N)</b></div>
        <div class="row"><span>실제 질량</span><b>${MASS} kg (불변!)</b></div>
        <div class="row"><span>관성력 <i>ma</i></span>
          <b>${sc.move ? (MASS * Math.abs(sc.a)).toFixed(0) + ' N (' + (sc.a > 0 ? '아래' : sc.a < 0 ? '위' : '—') + ' 방향)' : '0 N'}</b></div>
        ${pair ? `<div class="formula"><b style="color:#69d98c">등가 원리:</b> ${pair}<br>
          승강기 안에서 밖을 볼 수 없다면 두 상황을 구별할 방법이 없습니다.</div>` : ''}
        <div class="formula">체중계 눈금 <i>N</i> = <i>m</i>(<i>g</i>+<i>a</i>) —
          가속도 방향과 반대로 관성력이 작용합니다.</div>`;
    }
    if (state.mode === 'light') {
      const c = state.lightCase;
      return `
        <div class="row"><span>우주선</span>
          <b>${c === 'rest' ? '(가) 우주에 정지' : c === 'accel' ? '(나) 위로 가속' : '(다) 행성 중력 속 정지'}</b></div>
        <div class="row"><span>빛의 경로</span>
          <b class="big">${c === 'rest' ? '곧게 직진' : '아래로 휘어짐!'}</b></div>
        <div class="formula">${c === 'rest'
          ? '정지(관성계)한 우주선에서 빛은 직진합니다.'
          : c === 'accel'
          ? '빛이 가로지르는 동안 우주선이 위로 가속하므로, 안에서 보면 빛이 아래로 휘어 보입니다.'
          : '등가 원리에 따라 가속과 중력은 구별할 수 없으므로, <b>중력이 있는 곳에서도 빛은 똑같이 휩니다</b>. 빛은 질량이 없으므로 뉴턴 중력으로는 설명할 수 없고, 질량이 시공간을 휘게 하여 빛이 휜 시공간을 따라간다고 아인슈타인은 설명했습니다.'}</div>`;
    }
    const ratio = 1 / (1 + state.gFactor * 0.25);
    return `
      <div class="row"><span>천체 표면 시계</span><b>${sim.tA.toFixed(1)} s</b></div>
      <div class="row"><span>먼 우주 시계</span><b>${sim.tB.toFixed(1)} s</b></div>
      <div class="row"><span>시계 빠르기 비</span><b class="big">${ratio.toFixed(2)} : 1</b></div>
      <div class="sec">실제 GPS 위성 (하루 기준)</div>
      <div class="row"><span>특수 상대론 (빠른 속도)</span><b>−7 μs 느려짐</b></div>
      <div class="row"><span>일반 상대론 (약한 중력)</span><b>+45 μs 빨라짐</b></div>
      <div class="row"><span>합계</span><b class="big">+38 μs/일 보정 필요</b></div>
      <div class="formula">보정하지 않으면 위치 오차가 하루 약 <b>10 km</b> 씩 쌓입니다.
        내비게이션이 정확한 것은 상대성 이론 덕분입니다. (39쪽 해 보기)</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '체중계 눈금의 변화';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);
    const padL = 40, padR = 12, padT = 16, padB = 24;
    const gw = W - padL - padR, gh = H - padT - padB;

    if (state.mode === 'elevator') {
      const NMAX = MASS * (G + 10);
      const TW = 5;
      const xOf = (t) => padL + (Math.min(t, TW) / TW) * gw;
      const yOf = (n) => padT + gh - (n / NMAX) * gh;
      // 평상시 몸무게 기준선
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(padL, yOf(MASS * G)); ctx.lineTo(padL + gw, yOf(MASS * G)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`평소 ${MASS} kg중`, padL + 4, yOf(MASS * G) - 2);
      if (sim && sim.history.length > 1) {
        ctx.strokeStyle = '#69d98c'; ctx.lineWidth = 2;
        ctx.beginPath();
        sim.history.forEach((p, i) => {
          if (i === 0) ctx.moveTo(xOf(p.t), yOf(p.N)); else ctx.lineTo(xOf(p.t), yOf(p.N));
        });
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
      ctx.stroke();
      ctx.fillStyle = '#9fb0c2';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('시간 →', W - 4, padT + gh + 4);
      ctx.save();
      ctx.translate(10, padT + gh / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.fillText('눈금 (N)', 0, 0);
      ctx.restore();
      return;
    }

    if (state.mode === 'light') {
      // 우주선 기준 빛 경로: (나)와 (다)가 같은 곡선임을 겹쳐 보여 준다
      const xOf = (x) => padL + ((x + 3.6) / 7.4) * gw;
      const yOf = (y) => padT + gh - ((y + 1.4) / 4.4) * gh;
      const A_VIS = 2.8, C_VIS = 3.2;
      const path = (color, dash) => {
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.setLineDash(dash || []);
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const x = -3.6 + (i / 40) * 7.4;
          const t = (x + 3.6) / C_VIS;
          const y = 2.6 - 0.5 * A_VIS * t * t;
          if (i === 0) ctx.moveTo(xOf(x), yOf(y)); else ctx.lineTo(xOf(x), yOf(y));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      // 직선 (가)
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(xOf(-3.6), yOf(2.6)); ctx.lineTo(xOf(3.8), yOf(2.6)); ctx.stroke();
      path('#ff8a3c');            // (나) 가속
      path('#b78af0', [7, 5]);    // (다) 중력 — 같은 곡선!
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('회색 (가) 정지 — 직선', padL + 4, padT + 2);
      ctx.fillStyle = '#ff8a3c'; ctx.fillText('(나) 가속', padL + 4, padT + 14);
      ctx.fillStyle = '#b78af0'; ctx.fillText('(다) 중력 — 완전히 겹칩니다 (등가 원리)', padL + 60, padT + 14);
      return;
    }

    // 시계 모드: 누적 시간차
    const xOf = (d) => padL + (d / 10) * gw;
    const yOf = (us) => padT + gh - (us / 400) * gh;
    ctx.strokeStyle = '#69d98c'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(0));
    ctx.lineTo(xOf(10), yOf(380));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let d = 0; d <= 10; d += 2) ctx.fillText(String(d), xOf(d), padT + gh + 4);
    ctx.textAlign = 'right'; ctx.fillText('경과 일수', W - 4, padT + gh + 12);
    ctx.save();
    ctx.translate(10, padT + gh / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillText('GPS 시간차 (μs)', 0, 0);
    ctx.restore();
    ctx.fillStyle = '#69d98c'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('+38 μs/일 — 보정하지 않으면 오차 누적', padL + 6, padT + 2);
  }

  function graphFootHTML() {
    if (state.mode === 'elevator') {
      return '가속(출발)하면 눈금이 커지고, 감속(정지 직전)하면 작아지고, 자유 낙하면 <b>0</b> 이 됩니다 (해 보기 36쪽)';
    }
    if (state.mode === 'light') {
      return '가속하는 우주선과 중력 속의 빛 경로가 <b>완전히 같습니다</b> — 등가 원리 (그림 I-30)';
    }
    return '중력이 큰 곳(위성보다 지표면)의 시계가 느리게 갑니다 — GPS 는 매일 +38 μs 를 보정합니다';
  }

  /* ══ 기록표 (해 보기 36쪽 표) ════════════════ */
  const recordColumns = [
    '승강기 상태', '가속도 (m/s²)', '체중계 눈금 (kg중)', '눈금 (N)', '비고',
  ];

  function recordRow() {
    if (state.mode !== 'elevator') return null;
    const sc = SCENARIOS[state.scenario];
    const note = state.scenario === 'freefall' ? '무중력과 동일'
      : state.scenario === 'spaceAcc' ? '지표면 정지와 동일'
      : sc.a > 0 ? '무거워짐' : sc.a < 0 ? '가벼워짐' : '평소와 같음';
    return [[sc.name, sc.a.toFixed(1), scaleKg().toFixed(1), scaleN().toFixed(0), note]];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 자유 낙하(무중력) · 1 가속하는 우주선 = 지표면 · 2 빛의 휘어짐 비교
     3 중력과 시간 · 4 기록 3줄                                            */
  const mis = { sc: {}, light: {}, clock: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'elevator') mis.sc[state.scenario] = true;
    if (state.mode === 'light') mis.light[state.lightCase] = true;
    if (state.mode === 'clock') mis.clock = true;

    if (i === 0) return !!mis.sc.freefall;
    if (i === 1) return !!mis.sc.spaceAcc;
    if (i === 2) return Object.keys(mis.light).length >= 2;
    if (i === 3) return mis.clock;
    if (i === 4) return recs().length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'genrel',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '등가 원리 승강기 — 시공간 여행',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, scaleN, scaleKg, SCENARIOS,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
