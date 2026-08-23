/**
 * 용수철 실험실 — 단진동과 종파·횡파 (③ 체험·조작형)
 * 비상교육 고등 역학과 에너지 III-01·02 (교과서 88~97쪽)
 *
 * 진자 모드 — 해 보기 88쪽: 당긴 거리를 바꿔도 주기가 그대로! T = 2π√(m/k)
 * 파동 모드 — 탐구 94쪽: 용수철을 좌우(횡파)/앞뒤(종파)로 흔들고
 *            진동수에 따른 파장·속력을 잰다 (v = fλ 일정)
 */
const SpringWaveScene = (() => {
  const B = () => BABYLON;

  const WAVE_V = 2.4;            // 파동 모드: 매질의 파동 속력 (m/s)
  const N_BEAD = 64;             // 용수철 고리 수
  const WAVE_L = 8.0;            // 용수철 길이 (m)
  const WM = 2.2;                // 파동 모드 축척
  const WAVE_A = 0.55;           // 파동 모드에서 고리가 흔들려 보이는 폭 (보이기용)

  let scene, camera;
  let standG, springMesh, bob, shadowBoard, shadowTex;
  let waveG, beads = [], ribbon, ruler2, waveHandle;
  let placed = {};

  const state = {
    mode: 'shm',        // 'shm' | 'wave'
    amp: 0.10,          // 진자: 당긴 거리 (m)
    mass: 0.2,          // 진자: 추 질량 (kg)
    k: 20,              // 진자: 용수철 상수 (N/m)
    waveKind: 'trans',  // 파동: 'trans' 횡파 | 'long' 종파
    freq: 1,            // 파동: 흔드는 진동수 (Hz)
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'standT', label: '스탠드 · 용수철', icon: 'tower' },
    { id: 'bobT', label: '추', icon: 'weight' },
    { id: 'rulerT', label: '자 · 모눈종이', icon: 'ruler' },
    { id: 'watchT', label: '초시계 · 메트로놈', icon: 'stopwatch' },
  ];
  const slots = {
    standT: { name: '왼쪽 (스탠드)' },
    bobT: { name: '용수철 끝' },
    rulerT: { name: '뒤쪽 (모눈종이)' },
    watchT: { name: '앞쪽 (초시계)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  const omega = () => Math.sqrt(state.k / state.mass);
  const periodT = () => 2 * Math.PI / omega();
  const lambda = () => WAVE_V / state.freq;

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c9dff2ff');

    camera = new (B().ArcRotateCamera)(
      'camSw', -Math.PI / 2 + 0.15, 1.15, 17, new (B().Vector3)(0, 2.6, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hs', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.45, 0.48, 0.52);
    const dir = new (B().DirectionalLight)('ds', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 16, -9);
    dir.intensity = 0.35;

    const table = B().MeshBuilder.CreateBox('swTable', { width: 26, height: 0.6, depth: 14 }, scene);
    table.position.y = -0.32;
    table.material = mat('swTableMat', '#9aa3ad', '#c6ccd3', 96);

    buildSHM();
    buildWave();
    buildProps();
    buildPlaceholders();
    buildSteppers();
    setupPointer(canvas);

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/springwave.jpg', { x: -8, y: 0, z: 5, ry: 0.3 });

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

  /** 진자 모드 — 스탠드에 매달린 용수철 + 추 */
  function buildSHM() {
    standG = new (B().TransformNode)('swStand', scene);
    const pole = B().MeshBuilder.CreateCylinder('swPole', { height: 6.4, diameter: 0.18 }, scene);
    pole.position.set(-2.2, 3.2, 0);
    pole.material = mat('swPoleMat', '#39424f', '#8e9bad', 64);
    pole.parent = standG;
    const arm = B().MeshBuilder.CreateCylinder('swArm', { height: 2.4, diameter: 0.14 }, scene);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-1.0, 6.2, 0);
    arm.material = mat('swArmMat', '#39424f');
    arm.parent = standG;
    const foot = B().MeshBuilder.CreateBox('swFoot', { width: 2.2, height: 0.2, depth: 1.6 }, scene);
    foot.position.set(-2.2, 0.1, 0);
    foot.material = mat('swFootMat', '#2b323c');
    foot.parent = standG;

    // 용수철 (가는 원기둥을 코일처럼 — scaling 으로 늘였다 줄임)
    springMesh = B().MeshBuilder.CreateCylinder('swSpring', { height: 1, diameter: 0.5, tessellation: 12 }, scene);
    const sm = new (B().StandardMaterial)('swSpringMat', scene);
    sm.diffuseColor = B().Color3.FromHexString('#7a8494');
    sm.wireframe = true;
    springMesh.material = sm;
    springMesh.parent = standG;

    bob = B().MeshBuilder.CreateCylinder('swBob', { height: 0.7, diameter: 0.8 }, scene);
    bob.material = mat('swBobMat', '#d0453a', '#ffd0c8', 48);

    // 뒤쪽 모눈종이 — 시간에 따른 위치 자취 (그림 III-3 그림자 실험)
    shadowBoard = B().MeshBuilder.CreatePlane('swBoard', { width: 7.6, height: 5.2 }, scene);
    shadowBoard.position.set(1.8, 3.4, 1.6);
    shadowTex = new (B().DynamicTexture)('swBoardTex', { width: 760, height: 520 }, scene, false);
    const bm = new (B().StandardMaterial)('swBoardMat', scene);
    bm.diffuseTexture = shadowTex;
    bm.emissiveColor = new (B().Color3)(0.35, 0.35, 0.35);
    bm.specularColor = new (B().Color3)(0, 0, 0);
    bm.backFaceCulling = false;
    shadowBoard.material = bm;
  }

  /** 파동 모드 — 바닥의 긴 용수철 (구슬 사슬) */
  function buildWave() {
    waveG = new (B().TransformNode)('swWave', scene);
    for (let i = 0; i < N_BEAD; i++) {
      const s = B().MeshBuilder.CreateSphere('swBd' + i, { diameter: 0.26 }, scene);
      s.material = i === 10 ? mat('swBdR', '#d0453a', '#ffd0c8', 48)
        : mat('swBdM' + i, '#7a8494', '#cfd6df', 96);
      s.parent = waveG;
      beads.push(s);
    }
    ribbon = beads[10];   // 빨간 리본 (매질의 한 점)

    // 왼쪽 끝 손잡이 — 학생이 손으로 잡고 흔드는 곳 (끝 고리를 따라 움직인다)
    // 높이 0.5 — 끝 고리가 가장 아래로 내려왔을 때도 실험대(윗면 y≈0)를 뚫지 않는다
    waveHandle = B().MeshBuilder.CreateCylinder('swHandle', { height: 0.5, diameter: 0.3 }, scene);
    waveHandle.material = mat('swHandleM', '#b5793a', '#ffddb0', 48);
    waveHandle.parent = waveG;

    // 파장 재는 자
    ruler2 = B().MeshBuilder.CreateGround('swRuler', { width: WAVE_L * WM, height: 0.7 }, scene);
    ruler2.position.set(0, 0.01, 1.6);
    const tex = new (B().DynamicTexture)('swRulerTex', { width: 1600, height: 70 }, scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = '#f2efe2'; ctx.fillRect(0, 0, 1600, 70);
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 2;
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let m2 = 0; m2 <= WAVE_L * 2; m2++) {
      const x = (m2 / (WAVE_L * 2)) * 1600;
      ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x, m2 % 2 === 0 ? 26 : 46); ctx.stroke();
      if (m2 % 2 === 0) ctx.fillText(`${m2 / 2}`, x + 2, 4);
    }
    tex.update();
    const rm = new (B().StandardMaterial)('swRulerMat', scene);
    rm.diffuseTexture = tex; rm.specularColor = new (B().Color3)(0, 0, 0);
    ruler2.material = rm;
    ruler2.parent = waveG;
    waveG.position.y = 0.5;
  }

  const props = {};

  /** 준비 단계용 소품 — 초시계·메트로놈 */
  function buildProps() {
    const g = new (B().TransformNode)('swPropW', scene);
    const body = B().MeshBuilder.CreateCylinder('swPropWB', { height: 0.3, diameter: 1.0 }, scene);
    body.position.y = 0.15;
    body.material = mat('swPropWBM', '#39424f', '#aab6c8', 96);
    body.parent = g;
    const face = B().MeshBuilder.CreateCylinder('swPropWF', { height: 0.04, diameter: 0.86 }, scene);
    face.position.y = 0.32;
    face.material = emat('swPropWFM', '#e8ecf2');
    face.parent = g;
    const btn = B().MeshBuilder.CreateCylinder('swPropWBt', { height: 0.18, diameter: 0.16 }, scene);
    btn.position.set(0, 0.36, 0.42);
    btn.rotation.x = 0.6;
    btn.material = mat('swPropWBtM', '#d0453a');
    btn.parent = g;
    g.position.set(3.4, 0, -3.2);
    g.setEnabled(false);
    props.watchT = g;
  }

  function drawShadow() {
    const ctx = shadowTex.getContext();
    ctx.fillStyle = '#f7f4e8';
    ctx.fillRect(0, 0, 760, 520);
    // 모눈
    ctx.strokeStyle = 'rgba(64,86,120,.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 760; x += 38) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 520); ctx.stroke(); }
    for (let y = 0; y <= 520; y += 37) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(760, y); ctx.stroke(); }
    // 평형선
    ctx.strokeStyle = 'rgba(64,86,120,.5)';
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(0, 260); ctx.lineTo(760, 260); ctx.stroke();
    ctx.setLineDash([]);
    if (sim && sim.trace.length > 1) {
      // x = Asin(ωt) 자취 — 오른쪽이 최근
      ctx.strokeStyle = '#2f6ad0'; ctx.lineWidth = 3;
      ctx.beginPath();
      const n = sim.trace.length;
      sim.trace.forEach((p, i) => {
        const px = 760 - (n - 1 - i) * 2.2;
        const py = 260 - p * 1000;   // 1 m → 1000 px? A=0.2 → 200px
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    ctx.fillStyle = '#40506a';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('시간에 따른 변위 x = A sin ωt (그림 III-4)', 12, 8);
    shadowTex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      standT: { x: -2.2, z: 0, w: 3.2, h: 2.6, label: '스탠드 · 용수철' },
      bobT: { x: 0.6, z: -2.8, w: 2.6, h: 2.2, label: '추' },
      rulerT: { x: 3.4, z: 1.6, w: 4.2, h: 2.2, label: '자 · 모눈종이' },
      watchT: { x: 3.4, z: -3.2, w: 3.2, h: 2.2, label: '초시계' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: false, color: '#2f6ad0' });
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
      t: 0,
      trace: [],           // 진자: 변위 기록
      measured: null,      // 10회 왕복 시간
      waveT: 0,            // 파동: 흔든 시간 (파면 진행)
    };
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const shm = state.mode === 'shm';

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다 (실험대는 항상 보임)
    if (!all) {
      standG.setEnabled(!!placed.standT);
      bob.setEnabled(!!placed.bobT);
      if (placed.bobT) {
        // 스탠드가 있으면 용수철 끝에, 없으면 실험대 위 제자리에
        if (placed.standT) bob.position.set(0.6, 2.9, 0);
        else bob.position.set(0.6, 0.36, -2.8);
      }
      shadowBoard.setEnabled(!!placed.rulerT);
      waveG.setEnabled(false);
      if (props.watchT) props.watchT.setEnabled(!!placed.watchT);
      layoutSteppers();
      return;
    }
    bob.setEnabled(shm);
    shadowBoard.setEnabled(shm);
    if (props.watchT) props.watchT.setEnabled(true);

    standG.setEnabled(shm);
    waveG.setEnabled(!shm);

    if (shm) {
      // 변위 x (아래 +): 시작은 A 만큼 당긴 상태
      const x = state.running ? state.amp * Math.sin(omega() * sim.t + Math.PI / 2) : state.amp;
      const eqLen = 2.2 + state.mass * 9.8 / state.k;   // 평형에서 용수철 길이 (m→unit 그대로)
      const len = eqLen + x * 4;                        // 변위를 4배로 보이게
      const topY = TOP_Y;
      springMesh.scaling.y = len;
      springMesh.position.set(0.6, topY - len / 2, 0);
      bob.position.set(0.6, topY - len - 0.35, 0);
      drawShadow();
    } else {
      // 용수철 파동: 왼손이 x=0 에서 흔든다. 파면은 v·t 까지 진행
      const front = WAVE_V * sim.waveT;
      const A = WAVE_A;
      for (let i = 0; i < N_BEAD; i++) {
        const xm = (i / (N_BEAD - 1)) * WAVE_L;         // 매질상 위치 (m)
        const base = (xm - WAVE_L / 2) * WM;
        let dy = 0, dx = 0;
        if (state.running && xm <= front) {
          const phase = 2 * Math.PI * state.freq * (sim.waveT - xm / WAVE_V);
          const s = A * Math.sin(phase);
          if (state.waveKind === 'trans') dy = s;       // 좌우(화면 z→가로) 대신 위아래로 보여 준다
          else dx = s * 0.5;                            // 앞뒤 (진행 방향)
        }
        beads[i].position.set(base + dx * WM * 0.4, 0.3 + (state.waveKind === 'trans' ? dy : 0), 0);
        // 종파는 조밀·성김이 보이도록 크기 변화 없음 (위치만)
      }
      // 손잡이를 잡고 끄는 동안 — 끝쪽 고리들이 손을 따라오게 한다 (멀어질수록 조금만)
      if (handOff && !state.running) {
        for (let i = 0; i < HAND_N; i++) {
          const w = 1 - i / HAND_N;
          beads[i].position.x += handOff.x * w;
          beads[i].position.y += handOff.y * w;
        }
      }
      if (waveHandle) {
        waveHandle.position.copyFrom(beads[0].position);
        waveHandle.position.x -= 0.32;      // 끝 고리 바깥쪽에 붙는다
      }
    }
    layoutSteppers();
  }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     · 진자 — 추(또는 용수철)를 «아래로 끌었다 놓으면» 당긴 만큼이 진폭이 되고 곧바로 진동한다
     · 진자 — 추 아래 ＋ / － 로 추 질량을, 용수철 위 ＋ / － 로 용수철 상수를 바꾼다
     · 파동 — 왼쪽 손잡이 고리를 «위아래»로 끌면 횡파, «용수철 방향»으로 끌면 종파가 되고
              손을 놓으면 그 방향으로 계속 흔들어 파동을 보낸다
     · 파동 — 손잡이 위 ＋ / － 로 메트로놈 진동수를 바꾼다                              */
  const TOP_Y = 6.2;                       // 스탠드 팔 — 용수철을 매단 높이
  const MASS_STEPS = [0.1, 0.2, 0.4];      // 아래 조작 막대의 선택지와 같은 값
  const K_STEPS = [10, 20, 40];
  const FREQ_STEPS = [1, 2, 3];
  const HAND_N = 10;                       // 손을 따라오는 고리 수 (빨간 리본 앞까지)

  let stepMass = null, stepK = null, stepFreq = null;
  let pullBob = null;      // 추를 당기는 중 { y0, amp0 }
  let shake = null;        // 손잡이를 흔드는 중 { x0, y0 }
  let handOff = null;      // 손잡이가 제자리에서 벗어난 양 (보이기용)
  let ctrlRoot = null;
  let onChangeCb = null;

  function buildSteppers() {
    stepMass = LabUI.makeStepper(scene, 'Mass');
    stepK = LabUI.makeStepper(scene, 'K');
    stepFreq = LabUI.makeStepper(scene, 'Freq');
  }

  /** 단추 자리 — 부품과 겹치지 않게 띄워 둔다 (layout() 에서 매번 부른다) */
  function layoutSteppers() {
    if (!stepMass) return;
    const on = allPlaced();
    const shm = state.mode === 'shm';
    // 스탠드 기둥(x ≈ -1.1)을 비껴가도록 오른쪽으로 치우쳐 놓는다
    stepMass.place(1.5, 1.35, -1.4, 1.15);              // 추 아래
    stepK.place(1.5, TOP_Y + 1.0, -1.0, 1.15);          // 용수철 위
    stepFreq.place(-WAVE_L / 2 * WM + 1.2, 2.5, -0.6, 1.0);   // 손잡이 위
    stepMass.setEnabled(on && shm);
    stepK.setEnabled(on && shm);
    stepFreq.setEnabled(on && !shm);
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /** 선택지 목록을 한 칸 옮긴다 (범위는 아래 조작 막대와 똑같이 유지) */
  function bumpList(list, key, d) {
    const i = list.indexOf(state[key]);
    const j = clamp((i < 0 ? 0 : i) + d, 0, list.length - 1);
    if (list[j] === state[key]) return;
    state[key] = list[j];
    reset();
    syncRunBtn();
    syncControls();
    if (onChangeCb) onChangeCb();
  }

  /** 화면 위 한 점을 z = 0 인 세로면 위의 세계 좌표로 바꾼다 */
  function pointerOnFace() {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(
      new (B().Vector3)(0, 0, 0), new (B().Vector3)(0, 0, 1));
    const d = ray.intersectsPlane(plane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d));
  }

  /** 3D 에서 조작해도 아래 조작 막대의 표시가 따라오게 한다 */
  function syncRunBtn() {
    const b = (ctrlRoot || document).querySelector('#runBtn');
    if (!b) return;
    b.textContent = state.running ? '진동 중' : (state.mode === 'shm' ? '▶ 놓기' : '▶ 흔들기');
    b.classList.toggle('run', state.running);
  }
  function syncControls() {
    const r = ctrlRoot || document;
    const sl = r.querySelector('#amp');
    if (sl) {
      sl.value = state.amp;
      const out = r.querySelector('#ampOut');
      if (out) out.textContent = `${(state.amp * 100).toFixed(0)} cm`;
    }
    const mark = (key, val) => r.querySelectorAll(`[data-${key}]`).forEach(
      (b) => b.classList.toggle('on', b.getAttribute('data-' + key) === String(val)));
    mark('mass', state.mass);
    mark('k', state.k);
    mark('waveKind', state.waveKind);
    mark('freq', state.freq);
  }

  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const nm = pi.pickInfo && pi.pickInfo.pickedMesh ? pi.pickInfo.pickedMesh.name : '';

      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced()) return;              // 도구를 다 놓은 뒤에야 만질 수 있다
        if (state.mode === 'shm') {
          if (nm === 'btnAddMass') { bumpList(MASS_STEPS, 'mass', +1); return; }
          if (nm === 'btnSubMass') { bumpList(MASS_STEPS, 'mass', -1); return; }
          if (nm === 'btnAddK') { bumpList(K_STEPS, 'k', +1); return; }
          if (nm === 'btnSubK') { bumpList(K_STEPS, 'k', -1); return; }
          if (nm !== 'swBob' && nm !== 'swSpring') return;
          const p = pointerOnFace();
          if (!p) return;
          reset();                             // 당기는 동안은 멈춰 둔다
          pullBob = { y0: p.y, amp0: state.amp };
          camera.detachControl();
          syncRunBtn();
          return;
        }
        if (nm === 'btnAddFreq') { bumpList(FREQ_STEPS, 'freq', +1); return; }
        if (nm === 'btnSubFreq') { bumpList(FREQ_STEPS, 'freq', -1); return; }
        const bd = /^swBd(\d+)$/.exec(nm);     // 손잡이 또는 왼쪽 끝 고리
        if (nm !== 'swHandle' && (!bd || +bd[1] > 3)) return;
        const p = pointerOnFace();
        if (!p) return;
        reset();
        shake = { x0: p.x, y0: p.y };
        handOff = { x: 0, y: 0 };
        camera.detachControl();
        syncRunBtn();
        layout();
        return;
      }

      if (pi.type === T.POINTERMOVE && pullBob) {
        const p = pointerOnFace();
        if (p === null) return;
        // 아래로 끈 만큼 당긴 거리가 커진다.
        // 화면에서는 4 cm ~ 20 cm 가 좁은 폭에 몰려 있으므로, 손을 천천히 따라오게 해
        // 조금만 움직여도 값이 확 바뀌지 않게 한다 (10 으로 나눈다).
        const raw = pullBob.amp0 + (pullBob.y0 - p.y) / 10;
        state.amp = +clamp(Math.round(raw / 0.02) * 0.02, 0.04, 0.2).toFixed(2);
        layout();
        syncControls();
        if (onChangeCb) onChangeCb();
        return;
      }

      if (pi.type === T.POINTERMOVE && shake) {
        const p = pointerOnFace();
        if (p === null) return;
        const dx = p.x - shake.x0, dy = p.y - shake.y0;
        // 많이 끈 쪽이 흔드는 방향 — 위아래면 횡파, 용수철 방향이면 종파
        state.waveKind = Math.abs(dy) >= Math.abs(dx) ? 'trans' : 'long';
        // 끄는 폭은 «파동이 실제로 흔들릴 폭(WAVE_A)» 까지만 — 그래야 미리 보이는 모양이
        // 놓은 뒤의 파동과 같고, 손잡이·끝 고리가 실험대 아래로 파고들지 않는다
        handOff = state.waveKind === 'trans'
          ? { x: 0, y: clamp(dy, -WAVE_A, WAVE_A) }
          : { x: clamp(dx, -WAVE_A, WAVE_A), y: 0 };
        layout();
        syncControls();
        if (onChangeCb) onChangeCb();
        return;
      }

      if (pi.type === T.POINTERUP && (pullBob || shake)) {
        pullBob = null; shake = null; handOff = null;
        camera.attachControl(canvas, true);
        reset();
        state.running = true;                  // 손을 놓으면 곧바로 진동·파동이 시작된다
        layout();
        syncRunBtn();
        syncControls();
        if (onChangeCb) onChangeCb();
      }
    });
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;
    if (!state.running) return false;

    sim.t += dt;
    if (state.mode === 'shm') {
      const x = state.amp * Math.sin(omega() * sim.t + Math.PI / 2);
      sim.trace.push(x);
      if (sim.trace.length > 340) sim.trace.shift();
      // 10회 왕복 시간 = 10 T (자동 «측정»)
      if (!sim.measured && sim.t >= 10 * periodT()) sim.measured = sim.t;
      layout();
      return true;
    }
    sim.waveT += dt;
    layout();
    return true;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.15;
    camera.beta = state.mode === 'shm' ? 1.15 : 1.05;
    camera.radius = state.mode === 'shm' ? 17 : 22;
    camera.setTarget(new (B().Vector3)(0, state.mode === 'shm' ? 2.6 : 0.6, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '당긴 거리를 바꿔도 주기가 똑같은 것을 확인하세요! 주기를 바꾸려면 질량이나 용수철 상수를 바꿔야 합니다.';
  const prepGuide = '점선 자리에 스탠드·추·모눈종이·초시계를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'shm', t: '용수철 진자 (88쪽)' }, { v: 'wave', t: '탄성파 (94쪽)' },
    ], state.mode, 1);

    if (state.mode === 'shm') {
      return `
        ${modeBtns}
        <div class="control">
          <div class="clabel">직접<br>조작</div>
          <div class="cbody"><p class="hands-on">
            <b>추를 아래로 끌었다 놓으면</b> 당긴 만큼이 진폭이 되고 곧바로 진동합니다.
            추 아래 <b>＋ · －</b> 로 추 질량을, 용수철 위 <b>＋ · －</b> 로 용수철 상수를 바꿉니다.
          </p></div>
        </div>
        ${LabUI.slider('amp', '당긴 거리<br>(진폭)',
          { min: 0.04, max: 0.2, step: 0.02, value: state.amp, fmt: (v) => `${(v * 100).toFixed(0)} cm` })}
        ${LabUI.opts('추 질량 <i>m</i>', 'mass', [
          { v: 0.1, t: '100 g' }, { v: 0.2, t: '200 g' }, { v: 0.4, t: '400 g' },
        ], state.mass, 1)}
        ${LabUI.opts('용수철 상수 <i>k</i>', 'k', [
          { v: 10, t: '10 N/m' }, { v: 20, t: '20 N/m' }, { v: 40, t: '40 N/m' },
        ], state.k, 1)}
        <div class="control">
          <div class="clabel">진동</div>
          <button class="power" id="runBtn">▶ 놓기</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          왼쪽 <b>손잡이를 끌었다 놓습니다</b> — 화면에서 <b>위아래</b>로 끌면 <b>횡파</b>
          (실제 실험대에서 «좌우»로 흔드는 것), <b>용수철이 뻗은 방향</b>으로 끌면 <b>종파</b>
          («앞뒤»로 흔드는 것)가 됩니다.
          손잡이 위 <b>＋ · －</b> 로 메트로놈 진동수를 바꿉니다.
        </p></div>
      </div>
      ${LabUI.opts('흔드는 방향', 'waveKind', [
        { v: 'trans', t: '좌우 — 횡파' }, { v: 'long', t: '앞뒤 — 종파' },
      ], state.waveKind, 1)}
      ${LabUI.opts('진동수 <i>f</i><br>(메트로놈)', 'freq', [
        { v: 1, t: '1 Hz' }, { v: 2, t: '2 Hz' }, { v: 3, t: '3 Hz' },
      ], state.freq, 1)}
      <div class="control">
        <div class="clabel">흔들기</div>
        <button class="power" id="runBtn">▶ 흔들기</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록
    ctrlRoot = root;
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      reset();
      resetCamera();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    const after = () => { reset(); onChange(); };
    if (state.mode === 'shm') {
      LabUI.bindSlider(root, 'amp', state, 'amp', (v) => `${(v * 100).toFixed(0)} cm`, after);
      LabUI.bindOpts(root, 'mass', state, 'mass', after);
      LabUI.bindOpts(root, 'k', state, 'k', after);
    } else {
      LabUI.bindOpts(root, 'waveKind', state, 'waveKind', after, String);
      LabUI.bindOpts(root, 'freq', state, 'freq', after);
    }
    const run = root.querySelector('#runBtn');
    const label = state.mode === 'shm' ? '▶ 놓기' : '▶ 흔들기';
    run.addEventListener('click', () => {
      state.running = !state.running;
      run.textContent = state.running ? '진동 중' : label;
      run.classList.toggle('run', state.running);
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      run.textContent = label;
      run.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'shm') {
      const T = periodT();
      const x = state.running ? state.amp * Math.sin(omega() * sim.t + Math.PI / 2) : state.amp;
      const a = -(omega() ** 2) * x;
      return `
        <div class="row"><span>당긴 거리 (진폭 <i>A</i>)</span><b>${(state.amp * 100).toFixed(0)} cm</b></div>
        <div class="row"><span>추 질량 / 용수철 상수</span>
          <b>${(state.mass * 1000).toFixed(0)} g / ${state.k} N/m</b></div>
        <div class="sec">지금 상태</div>
        <div class="row"><span>변위 <i>x</i></span><b>${(x * 100).toFixed(1)} cm</b></div>
        <div class="row"><span>가속도 <i>a</i> = −ω²<i>x</i></span>
          <b>${a.toFixed(2)} m/s² ${Math.abs(x) > 0.005 ? (a * x < 0 ? '(변위 반대!)' : '') : ''}</b></div>
        <div class="sec">주기</div>
        <div class="row"><span>이론 <i>T</i> = 2π√(<i>m</i>/<i>k</i>)</span><b>${T.toFixed(3)} s</b></div>
        <div class="row"><span>10회 왕복 측정</span>
          <b class="big">${sim.measured ? sim.measured.toFixed(2) + ' s → T = ' + (sim.measured / 10).toFixed(3) + ' s'
            : state.running ? '측정 중… (' + sim.t.toFixed(1) + ' s)' : '—'}</b></div>
        <div class="formula">진폭을 바꿔도 주기는 <b>변하지 않습니다</b>.
          복원력 F = −kx 가 변위에 비례하기 때문입니다.</div>`;
    }
    const lam = lambda();
    return `
      <div class="row"><span>파동 종류</span>
        <b>${state.waveKind === 'trans' ? '횡파 (진행 ⊥ 진동)' : '종파 (진행 ∥ 진동)'}</b></div>
      <div class="row"><span>흔드는 진동수 <i>f</i></span><b>${state.freq} Hz</b></div>
      <div class="sec">측정</div>
      <div class="row"><span>파장 <i>λ</i> (자로 잰 값)</span><b class="big">${lam.toFixed(2)} m</b></div>
      <div class="row"><span>속력 <i>v</i> = <i>fλ</i></span><b class="big">${(state.freq * lam).toFixed(2)} m/s</b></div>
      <div class="formula">진동수를 2배, 3배로 바꿔 보세요 — 파장은 ½, ⅓ 로 줄지만
        속력 <i>v</i> = <i>fλ</i> 는 <b>${WAVE_V.toFixed(1)} m/s 로 일정</b>합니다.
        속력은 흔드는 방법이 아니라 <b>매질</b>이 결정합니다.
        빨간 고리(리본)는 제자리에서 진동만 합니다 — 매질은 이동하지 않습니다!</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '단진동 그래프';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 40, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;

    if (state.mode === 'shm') {
      // x = Asin(ωt+π/2) 이론 곡선 + 진폭 절반 비교 곡선 (주기 동일!)
      const T = periodT();
      const TW = 3 * T;
      const xOf = (t) => padL + (t / TW) * gw;
      const yOf = (x) => padT + gh / 2 - (x / 0.22) * (gh / 2);
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.beginPath(); ctx.moveTo(padL, yOf(0)); ctx.lineTo(padL + gw, yOf(0)); ctx.stroke();
      const curve = (A, color, w3) => {
        ctx.strokeStyle = color; ctx.lineWidth = w3 || 2;
        ctx.beginPath();
        for (let i = 0; i <= 140; i++) {
          const t = (i / 140) * TW;
          const y = yOf(A * Math.sin(omega() * t + Math.PI / 2));
          if (i === 0) ctx.moveTo(xOf(t), y); else ctx.lineTo(xOf(t), y);
        }
        ctx.stroke();
      };
      curve(state.amp, '#5ad0f0', 2.4);
      curve(state.amp / 2, 'rgba(255,216,74,.55)', 1.6);
      // 현재 시각 점
      if (state.running) {
        const tNow = sim.t % TW;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(xOf(tNow), yOf(state.amp * Math.sin(omega() * sim.t + Math.PI / 2)), 4, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#5ad0f0'; ctx.fillText(`진폭 ${(state.amp * 100).toFixed(0)} cm`, padL + 6, padT + 2);
      ctx.fillStyle = 'rgba(255,216,74,.8)';
      ctx.fillText(`진폭 ${(state.amp * 50).toFixed(0)} cm — 주기는 같다!`, padL + 90, padT + 2);
      ctx.fillStyle = '#9fb0c2';
      ctx.textAlign = 'right';
      ctx.fillText(`T = ${T.toFixed(2)} s`, W2 - 8, padT + 2);
      return;
    }

    // 파동 모드: 위치에 따른 파형 스냅숏 + 파장 표시 (그림 III-7)
    const lam = lambda();
    const xOf = (m2) => padL + (m2 / WAVE_L) * gw;
    const yOf = (y) => padT + gh / 2 - y * (gh / 2.6);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.beginPath(); ctx.moveTo(padL, yOf(0)); ctx.lineTo(padL + gw, yOf(0)); ctx.stroke();
    const front = state.running ? WAVE_V * sim.waveT : 0;
    ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const xm = (i / 200) * WAVE_L;
      let y = 0;
      if (state.running && xm <= front) {
        y = Math.sin(2 * Math.PI * state.freq * (sim.waveT - xm / WAVE_V));
      }
      if (i === 0) ctx.moveTo(xOf(xm), yOf(y)); else ctx.lineTo(xOf(xm), yOf(y));
    }
    ctx.stroke();
    // 파장 브래킷
    if (front > lam * 1.5) {
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.6;
      const y0 = padT + 12;
      ctx.beginPath();
      ctx.moveTo(xOf(0.0), y0); ctx.lineTo(xOf(lam), y0);
      ctx.stroke();
      ctx.fillStyle = '#ffd84a'; ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`λ = ${lam.toFixed(2)} m`, xOf(lam / 2), y0 + 3);
    }
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('위치 (m) — 어느 순간의 파형', W2 - 4, padT + gh + 4);
  }

  function graphFootHTML() {
    if (state.mode === 'shm') {
      return `노랑(진폭 절반)과 파랑의 <b>주기가 같습니다</b> — 단진동의 주기는 진폭과 무관 ·
        T = 2π√(m/k) = ${periodT().toFixed(2)} s`;
    }
    return `v = fλ = ${state.freq} × ${lambda().toFixed(2)} = <b>${WAVE_V.toFixed(1)} m/s</b> —
      진동수를 바꿔도 속력은 그대로 (탐구 94쪽 표)`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '실험', '조건', '측정 1', '측정 2', '결과',
  ];

  function recordRow() {
    if (state.mode === 'shm') {
      const T = periodT();
      return [['진자', `A=${(state.amp * 100).toFixed(0)} cm, m=${(state.mass * 1000).toFixed(0)} g, k=${state.k}`,
        `10회 = ${(10 * T).toFixed(2)} s`, `T = ${T.toFixed(3)} s`,
        `이론 2π√(m/k) = ${T.toFixed(3)} s`]];
    }
    const lam = lambda();
    return [[state.waveKind === 'trans' ? '횡파' : '종파', `f = ${state.freq} Hz`,
      `λ = ${lam.toFixed(2)} m`, `v = fλ = ${(state.freq * lam).toFixed(2)} m/s`,
      '속력 일정!']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 단진동 실행 · 1 질량·용수철 상수 바꿔 주기 비교 · 2 횡파 · 3 종파
     4 진동수를 바꿔 파장 비교                                              */
  const mis = { shm: false, params: {}, trans: false, longw: false, freqs: {} };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'shm' && state.running) {
      mis.shm = true;
      mis.params[state.mass + '/' + state.k] = true;
    }
    if (state.mode === 'wave' && state.running) {
      if (state.waveKind === 'trans') mis.trans = true;
      else mis.longw = true;
      mis.freqs[state.freq] = true;
    }
    if (i === 0) return mis.shm;
    if (i === 1) return Object.keys(mis.params).length >= 2;
    if (i === 2) return mis.trans;
    if (i === 3) return mis.longw;
    if (i === 4) return Object.keys(mis.freqs).length >= 2;
    return false;
  }

  return {
    missionDone,
    id: 'springwave',
    title: '용수철 실험실 — 단진동과 종파 · 횡파',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, omega, periodT, lambda,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
