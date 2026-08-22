/**
 * 원운동과 구심력 (③ 체험·조작 게임형)
 * 비상교육 고등 역학과 에너지 I-03 (교과서 22~25쪽)
 *
 * 게임 모드 — 해머던지기: 줄을 놓으면 공은 «접선 방향»으로 날아간다 (23쪽).
 *            과녁을 향해 정확한 순간에 놓아 보자.
 * 실험 모드 — 해 보기 24쪽: 쇠고리 수(구심력)를 바꿔 가며 주기를 재어
 *            구심력이 주기의 제곱에 반비례함을 확인한다.
 */
const CircularScene = (() => {
  const B = () => BABYLON;

  const M = 1.6;                 // 1 m = 1.6 unit
  // 게임 모드
  const R_GAME = 2.0;            // 회전 반지름 (m)
  const H_REL = 1.8;             // 놓는 높이 (m)
  const TARGET = { x: 7, z: 0 }; // 과녁 위치 (m, +x 방향)
  // 실험 모드 (해 보기 24쪽)
  const R_LAB = 0.8;             // 회전 반지름 (m)
  const M_STOP = 0.05;           // 고무마개 질량 (kg)
  const W_RING = 0.49;           // 쇠고리 1개의 무게 (N) = 50 g
  const G = 9.8;

  let scene, camera;
  let pole, ballG, stringG, trail = [], tangentArrow, targetMat, landMark;
  let tube, stopper, labString, rings = [], handLbl;
  let placed = {};
  const props = {};

  /** 작은 측정 기기 소품 (초시계·앱 등) */
  function deviceProp(id, x, z, hex, text) {
    const g = new (B().TransformNode)('prop_' + id, scene);
    const body = B().MeshBuilder.CreateBox('propB_' + id, { width: 1.1, height: 0.65, depth: 0.75 }, scene);
    body.position.y = 0.33;
    body.material = mat('propBM_' + id, hex, '#aab6c8', 64);
    body.parent = g;
    const face = B().MeshBuilder.CreatePlane('propF_' + id, { width: 0.9, height: 0.4 }, scene);
    face.position.set(0, 0.42, -0.39);
    face.rotation.x = -0.5;
    const t = new (B().DynamicTexture)('propT_' + id, { width: 180, height: 80 }, scene, true);
    const c = t.getContext();
    c.fillStyle = '#101820'; c.fillRect(0, 0, 180, 80);
    c.fillStyle = '#7ae0a0'; c.font = 'bold 34px monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text || '', 90, 42);
    t.update();
    const m = new (B().StandardMaterial)('propFM_' + id, scene);
    m.diffuseTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    face.material = m;
    face.parent = g;
    g.position.set(x, 0, z);
    g.setEnabled(false);
    return g;
  }

  const state = {
    mode: 'game',      // 'game' | 'lab'
    vGame: 10,         // 게임: 회전 속력 (m/s)
    rings: 2,          // 실험: 쇠고리 수 (구심력 = N × 0.49 N)
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'pole', label: '회전대 · 관', icon: 'tower' },
    { id: 'ballT', label: '고무마개(공)', icon: 'ball' },
    { id: 'ringsT', label: '쇠고리', icon: 'weight' },
    { id: 'watch', label: '초시계', icon: 'stopwatch' },
  ];
  const slots = {
    pole: { name: '가운데 (회전대)' },
    ballT: { name: '줄 끝 (공)' },
    ringsT: { name: '관 아래 (쇠고리)' },
    watch: { name: '앞쪽 (초시계)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 게임: 각속도 ω = v/r */
  const omega = () => state.vGame / R_GAME;
  /** 놓은 뒤 수평 도달 거리 = v × √(2h/g) */
  const flyRange = () => state.vGame * Math.sqrt(2 * H_REL / G);
  /** 실험: F = mrω² → T = 2π√(mr/F) */
  const labF = () => state.rings * W_RING;
  const labT = () => 2 * Math.PI * Math.sqrt(M_STOP * R_LAB / labF());

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#bcd8f0ff');

    camera = new (B().ArcRotateCamera)(
      'camCi', -Math.PI / 2 - 0.5, 0.98, 26, new (B().Vector3)(3, 1.5, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 46;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hc', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.5, 0.52, 0.55);
    const dir = new (B().DirectionalLight)('dc', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 20, -10);
    dir.intensity = 0.35;

    buildGround();
    buildGame();
    buildLab();
    props.watch = deviceProp('watch', 3.2, -4.6, '#39424f', '00:00.0');
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/circular.jpg', { x: -10, y: 0, z: 8, ry: 0.3 });

    buildStepper();
    setupPointer();
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

  function buildGround() {
    const g = B().MeshBuilder.CreateGround('ciGround', { width: 34, height: 26 }, scene);
    g.material = mat('ciGroundMat', '#8fae83', '#b9ccb0', 64);

    // 던지기 원 (해머던지기 서클)
    const circle = B().MeshBuilder.CreateDisc('ciCircle', { radius: R_GAME * M + 0.6, tessellation: 48 }, scene);
    circle.rotation.x = Math.PI / 2;
    circle.position.y = 0.01;
    circle.material = mat('ciCircleMat', '#c9c2a8', '#e6e0cc', 48);

    // 과녁 (동심원 매트)
    targetMat = new (B().TransformNode)('ciTarget', scene);
    [['#e8577a', 1.0], ['#f6f2e6', 2.0], ['#5a9df0', 3.0]].reverse().forEach(([hex, r], i) => {
      const d = B().MeshBuilder.CreateDisc('ciTg' + i, { radius: r * M / 2, tessellation: 48 }, scene);
      d.rotation.x = Math.PI / 2;
      d.position.y = 0.02 + i * 0.004;
      d.material = emat('ciTgM' + i, hex);
      d.material.alpha = 0.85;
      d.parent = targetMat;
    });
    targetMat.position.set(TARGET.x * M, 0, TARGET.z * M);
  }

  /** 게임 모드 — 해머(공 + 줄) */
  function buildGame() {
    pole = new (B().TransformNode)('ciPole', scene);
    const post = B().MeshBuilder.CreateCylinder('ciPost', { height: H_REL * M, diameter: 0.24 }, scene);
    post.position.y = H_REL * M / 2;
    post.material = mat('ciPostMat', '#39424f', '#8e9bad', 64);
    post.parent = pole;

    ballG = B().MeshBuilder.CreateSphere('ciBall', { diameter: 0.6 }, scene);
    ballG.material = mat('ciBallMat', '#d0453a', '#ffd0c8', 64);
    ballG.parent = null;

    stringG = B().MeshBuilder.CreateCylinder('ciStr', { height: 1, diameter: 0.05 }, scene);
    stringG.material = mat('ciStrMat', '#2b323c');

    // 접선 방향 표시 화살표 (속도의 방향)
    tangentArrow = B().MeshBuilder.CreateCylinder('ciTan',
      { height: 2.6, diameterTop: 0, diameterBottom: 0.22 }, scene);
    tangentArrow.material = emat('ciTanMat', '#ffd84a');

    landMark = B().MeshBuilder.CreateDisc('ciLand', { radius: 0.35, tessellation: 32 }, scene);
    landMark.rotation.x = Math.PI / 2;
    landMark.position.y = 0.03;
    landMark.material = emat('ciLandMat', '#ff8a3c');
    landMark.setEnabled(false);
  }

  /** 실험 모드 — 고무마개 · 플라스틱 관 · 쇠고리 (해 보기 24쪽) */
  function buildLab() {
    tube = new (B().TransformNode)('ciTube', scene);
    const t = B().MeshBuilder.CreateCylinder('ciTubeC', { height: 1.6, diameter: 0.16 }, scene);
    t.position.y = 1.7;
    t.material = mat('ciTubeMat', '#d8d2c0', '#fff', 64);
    t.parent = tube;
    // 손 (관을 잡는)
    const hand = B().MeshBuilder.CreateSphere('ciHand', { diameter: 0.42 }, scene);
    hand.position.y = 1.35;
    hand.material = mat('ciHandMat', '#e8b48a');
    hand.parent = tube;

    stopper = B().MeshBuilder.CreateCylinder('ciStop', { height: 0.28, diameterTop: 0.18, diameterBottom: 0.32 }, scene);
    stopper.material = mat('ciStopMat', '#b8654a', '#e8c0a8', 48);

    labString = B().MeshBuilder.CreateCylinder('ciLStr', { height: 1, diameter: 0.035 }, scene);
    labString.material = mat('ciLStrMat', '#2b323c');

    // 관을 통과해 내려온 줄 — 쇠고리는 이 줄 끝에 매달린다
    const hang = B().MeshBuilder.CreateCylinder('ciHang', { height: 0.95, diameter: 0.035 }, scene);
    hang.position.set(0, 0.85, 0);
    hang.material = mat('ciHangM', '#2b323c');
    hang.parent = tube;
    for (let i = 0; i < 8; i++) {
      const r = B().MeshBuilder.CreateTorus('ciRing' + i, { diameter: 0.34, thickness: 0.07 }, scene);
      r.material = mat('ciRingM' + i, '#7a8494', '#cfd6df', 96);
      r.parent = tube;
      rings.push(r);
    }
    tube.position.set(0, 0, 0);
  }

  function clearTrail() {
    trail.forEach((t) => t.dispose());
    trail = [];
  }
  function addTrail(x, y, z, hex) {
    const s = B().MeshBuilder.CreateSphere('ciTr' + trail.length, { diameter: 0.16 }, scene);
    s.position.set(x, y, z);
    s.material = emat('ciTrM' + trail.length, hex || '#ffd84a', 0.6);
    s.isPickable = false;
    trail.push(s);
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      pole: { x: 0, z: 0, w: 3.2, h: 3.2, label: '회전대 · 관' },
      ballT: { x: R_GAME * M, z: -2.6, w: 3.0, h: 2.4, label: '고무마개(공)' },
      ringsT: { x: -2.8, z: 2.2, w: 3.0, h: 2.4, label: '쇠고리' },
      watch: { x: 3.2, z: -4.6, w: 3.0, h: 2.4, label: '초시계' },
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
    const all = allPlaced();
    Object.entries(holders).forEach(([id, h]) => {
      if (id !== '_spec') h.setEnabled(!placed[id]);
    });
    reset();
  }

  function dropAt(id, point) {
    const c = holders._spec[id];
    return (Math.abs(point.x - c.x) <= 4 && Math.abs(point.z - c.z) <= 3.4) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    if (state.mode === 'game') {
      sim = {
        phase: 'ready',   // ready → spin → fly → land
        th: Math.PI,      // 현재 각 (반시계)
        pos: null, vel: null,
        result: null, dist: null,
        t: 0,
      };
    } else {
      sim = {
        phase: 'ready',
        th: 0, t: 0,
        revs: 0, measured: null,  // 10 회전 시간 측정
        measuring: false, mStart: 0,
      };
    }
    clearTrail();
    if (landMark) landMark.setEnabled(false);
    layout();
  }

  function layout() {
    if (!sim) return;
    const game = state.mode === 'game';
    const all = allPlaced();

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다 (배경 과녁·서클은 항상 보임)
    if (!all) {
      targetMat.setEnabled(true);
      pole.setEnabled(!!placed.pole);
      tube.setEnabled(!!placed.pole);
      rings.forEach((r, i) => {
        r.setEnabled(!!placed.ringsT && i < state.rings);
        r.rotation.x = Math.PI / 2;
        r.position.set(0, 0.95 - i * 0.09, 0);
      });
      ballG.setEnabled(!!placed.ballT);
      if (placed.ballT) ballG.position.set(R_GAME * M, H_REL * M, 0);
      stopper.setEnabled(false);
      stringG.setEnabled(false);
      tangentArrow.setEnabled(false);
      labString.setEnabled(false);
      if (props.watch) props.watch.setEnabled(!!placed.watch);
      return;
    }
    if (props.watch) props.watch.setEnabled(true);

    // 모드에 맞는 기구만 보이기
    pole.setEnabled(game);
    ballG.setEnabled(game && sim.phase !== 'land');
    stringG.setEnabled(game && (sim.phase === 'ready' || sim.phase === 'spin'));
    tangentArrow.setEnabled(game && sim.phase === 'spin');
    targetMat.setEnabled(game);
    tube.setEnabled(!game);
    stopper.setEnabled(!game);
    labString.setEnabled(!game);

    if (game) {
      if (sim.phase === 'ready' || sim.phase === 'spin') {
        const x = Math.cos(sim.th) * R_GAME * M, z = Math.sin(sim.th) * R_GAME * M;
        ballG.position.set(x, H_REL * M, z);
        // 줄: 기둥 꼭대기 → 공
        const top = new (B().Vector3)(0, H_REL * M, 0);
        const bp = ballG.position;
        const mid = top.add(bp).scale(0.5);
        const len = B().Vector3.Distance(top, bp);
        stringG.scaling.y = len;
        stringG.position.copyFrom(mid);
        const d = bp.subtract(top).normalize();
        stringG.rotation.z = -Math.atan2(d.x, d.y) * 0 || 0;
        // 수평 줄 → 회전으로 정렬
        stringG.rotation.set(0, 0, 0);
        stringG.rotation.z = Math.PI / 2;
        stringG.rotation.y = -sim.th;
        // 접선 화살표: 반시계 방향 접선 (−sinθ, cosθ)
        const tx = -Math.sin(sim.th), tz = Math.cos(sim.th);
        tangentArrow.position.set(x + tx * 1.5, H_REL * M, z + tz * 1.5);
        tangentArrow.rotation.set(0, 0, 0);
        // 원기둥의 +y 를 접선 방향으로: y축 회전 + x축 눕히기
        tangentArrow.rotation.x = Math.PI / 2;
        tangentArrow.rotation.y = Math.atan2(tx, tz);
      } else if (sim.phase === 'fly') {
        ballG.position.set(sim.pos.x * M, sim.pos.y * M, sim.pos.z * M);
      }
    } else {
      // 실험 모드: 관 위 0.9 m 반지름 원 위의 고무마개
      const y = 2.5;
      const x = Math.cos(sim.th) * R_LAB * M, z = Math.sin(sim.th) * R_LAB * M;
      stopper.position.set(x, y, z);
      stopper.rotation.set(0, -sim.th, 0);
      // 줄: 관 꼭대기 → 고무마개
      labString.scaling.y = R_LAB * M;
      labString.position.set(x / 2, y, z / 2);
      labString.rotation.set(0, 0, 0);
      labString.rotation.z = Math.PI / 2;
      labString.rotation.y = -sim.th;
      // 쇠고리: 관 아래 매달림 (개수 = state.rings)
      rings.forEach((r, i) => {
        r.setEnabled(i < state.rings);
        r.rotation.x = Math.PI / 2;
        r.position.set(0, 0.95 - i * 0.09, 0);
      });
      layoutStepper();
    }
  }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     매달린 쇠고리 옆 ＋ / － 로 구심력을 바꾼다.                  */
  let stepR = null;
  let onChangeCb = null;

  function buildStepper() { stepR = LabUI.makeStepper(scene, 'Ring'); }

  function layoutStepper() {
    if (!stepR) return;
    const on = state.mode === 'lab' && allPlaced();
    stepR.place(0, 0.55, 0, 0.95);
    stepR.setEnabled(on);
  }

  function bumpRings(d) {
    state.rings = Math.max(1, Math.min(6, state.rings + d));
    reset();
    layoutStepper();
    if (onChangeCb) onChangeCb();
  }

  function setupPointer() {
    scene.onPointerObservable.add((pi) => {
      if (pi.type !== B().PointerEventTypes.POINTERDOWN) return;
      const m = pi.pickInfo && pi.pickInfo.pickedMesh;
      if (!m || state.mode !== 'lab' || !allPlaced()) return;
      if (m.name === 'btnAddRing') bumpRings(+1);
      else if (m.name === 'btnSubRing') bumpRings(-1);
    });
  }

  function tick(dt) {
    if (!sim) return false;
    const game = state.mode === 'game';

    if (game) {
      if (sim.phase === 'spin') {
        sim.th += omega() * dt;
        sim.t += dt;
        if (Math.floor(sim.t * 8) % 2 === 0 && trail.length < 400) {
          const x = Math.cos(sim.th) * R_GAME * M, z = Math.sin(sim.th) * R_GAME * M;
          addTrail(x, H_REL * M, z, '#f0a53c');
        }
        layout();
        return true;
      }
      if (sim.phase === 'fly') {
        // 놓은 뒤: 수평 등속 + 연직 자유 낙하 (포물선)
        const h = dt;
        sim.vel.y -= G * h;
        sim.pos.x += sim.vel.x * h;
        sim.pos.y += sim.vel.y * h;
        sim.pos.z += sim.vel.z * h;
        if (trail.length < 500) addTrail(sim.pos.x * M, sim.pos.y * M, sim.pos.z * M, '#ffd84a');
        if (sim.pos.y <= 0) {
          sim.pos.y = 0;
          sim.phase = 'land';
          const dx = sim.pos.x - TARGET.x, dz = sim.pos.z - TARGET.z;
          sim.dist = Math.sqrt(dx * dx + dz * dz);
          sim.result = sim.dist < 0.6 ? '🎯 명중!' : sim.dist < 1.6 ? '👍 근접!' : '❌ 빗나감';
          landMark.position.set(sim.pos.x * M, 0.03, sim.pos.z * M);
          landMark.setEnabled(true);
          state.running = false;
          const btn = document.querySelector('#throwBtn');
          if (btn) { btn.textContent = '▶ 회전 시작'; btn.classList.remove('run'); }
        }
        layout();
        return true;
      }
      return false;
    }

    // 실험 모드: 일정 주기로 회전
    if (state.running) {
      const w = 2 * Math.PI / labT();
      sim.th += w * dt;
      sim.t += dt;
      if (sim.measuring) {
        // 10 회전 측정
        if (sim.th - sim.mStart >= 20 * Math.PI) {
          sim.measuring = false;
          // 정확히 10 회전에 걸린 시간 = 10 T (표시는 측정처럼)
          sim.measured = 10 * labT() / 10;
          sim.revs = 10;
        }
      }
      layout();
      return true;
    }
    return false;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 - 0.5;
    camera.beta = 0.98;
    camera.radius = 26;
    camera.setTarget(new (B().Vector3)(3, 1.5, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '공은 줄을 놓는 순간 <b>접선 방향</b>(노란 화살표)으로 날아갑니다. 화살표가 과녁을 가리키는 순간 «놓기!» 를 누르세요.';
  const prepGuide = '점선 자리에 회전대·고무마개·쇠고리·초시계를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'game', t: '🎯 해머던지기' }, { v: 'lab', t: '구심력·주기 (24쪽)' },
    ], state.mode, 1);

    if (state.mode === 'game') {
      return `
        ${modeBtns}
        ${LabUI.slider('vGame', '회전 속력<br><i>v</i>',
          { min: 6, max: 14, step: 0.5, value: state.vGame, fmt: (v) => `${(+v).toFixed(1)} m/s` })}
        <div class="control">
          <div class="clabel">던지기</div>
          <button class="power" id="throwBtn">▶ 회전 시작</button>
        </div>
        <div class="control">
          <div class="clabel">놓기</div>
          <button class="power" id="releaseBtn" style="background:#d0453a">✋ 놓기!</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.opts('쇠고리 수<br>(구심력)', 'rings', [
        { v: 1, t: '1개' }, { v: 2, t: '2개' }, { v: 4, t: '4개' }, { v: 8, t: '8개' },
      ], state.rings, 2)}
      <div class="control">
        <div class="clabel">회전</div>
        <button class="power" id="spinBtn">▶ 돌리기</button>
      </div>
      <div class="control">
        <div class="clabel">주기 측정</div>
        <button class="power" id="measureBtn">⏱ 10회전 재기</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.mode === 'game') {
      LabUI.bindSlider(root, 'vGame', state, 'vGame', (v) => `${(+v).toFixed(1)} m/s`, () => {
        if (sim.phase === 'fly' || sim.phase === 'land') reset();
        onChange();
      });
      const throwBtn = root.querySelector('#throwBtn');
      throwBtn.addEventListener('click', () => {
        if (sim.phase !== 'ready' && sim.phase !== 'spin') reset();
        if (sim.phase === 'ready') {
          sim.phase = 'spin';
          state.running = true;
          throwBtn.textContent = '회전 중…';
          throwBtn.classList.add('run');
        }
        onChange();
      });
      root.querySelector('#releaseBtn').addEventListener('click', () => {
        if (sim.phase !== 'spin') return;
        // 놓는 순간: 위치 = 원 위, 속도 = 접선 방향 (수평)
        const x = Math.cos(sim.th) * R_GAME, z = Math.sin(sim.th) * R_GAME;
        const tx = -Math.sin(sim.th), tz = Math.cos(sim.th);
        sim.pos = { x, y: H_REL, z };
        sim.vel = { x: tx * state.vGame, y: 0, z: tz * state.vGame };
        sim.relTh = sim.th;
        sim.phase = 'fly';
        onChange();
      });
      root.querySelector('#resetBtn').addEventListener('click', () => {
        reset();
        const t = root.querySelector('#throwBtn');
        t.textContent = '▶ 회전 시작'; t.classList.remove('run');
        onChange();
      });
      return;
    }

    LabUI.bindOpts(root, 'rings', state, 'rings', () => {
      sim.measured = null;
      onChange();
    });
    const spin = root.querySelector('#spinBtn');
    spin.addEventListener('click', () => {
      state.running = !state.running;
      spin.textContent = state.running ? '회전 중' : '▶ 돌리기';
      spin.classList.toggle('run', state.running);
      onChange();
    });
    root.querySelector('#measureBtn').addEventListener('click', () => {
      if (!state.running) return;
      sim.measuring = true;
      sim.mStart = sim.th;
      sim.measured = null;
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      spin.textContent = '▶ 돌리기'; spin.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'game') {
      const w = omega();
      const T = 2 * Math.PI / w;
      const F = 7.26 * state.vGame * state.vGame / R_GAME; // 해머 7.26 kg
      const rows = `
        <div class="row"><span>회전 속력 <i>v</i></span><b>${state.vGame.toFixed(1)} m/s</b></div>
        <div class="row"><span>반지름 <i>r</i></span><b>${R_GAME.toFixed(1)} m</b></div>
        <div class="row"><span>각속도 <i>ω</i> = <i>v</i>/<i>r</i></span><b>${w.toFixed(2)} rad/s</b></div>
        <div class="row"><span>주기 <i>T</i> = 2π/<i>ω</i></span><b>${T.toFixed(2)} s</b></div>
        <div class="row"><span>구심 가속도 <i>v</i>²/<i>r</i></span><b>${(state.vGame ** 2 / R_GAME).toFixed(1)} m/s²</b></div>
        <div class="row"><span>구심력 (해머 7.26 kg)</span><b>${F.toFixed(0)} N</b></div>
        <div class="row"><span>예상 비행 거리</span><b>${flyRange().toFixed(2)} m</b></div>`;
      const res = sim.phase === 'land'
        ? `<div class="sec">결과</div>
           <div class="row"><span>판정</span><b class="big">${sim.result}</b></div>
           <div class="row"><span>과녁까지 오차</span><b>${sim.dist.toFixed(2)} m</b></div>
           <div class="formula">${sim.dist < 0.6
             ? '접선 방향이 과녁을 향하는 순간에 정확히 놓았습니다!'
             : '공은 놓는 순간의 <b>접선 방향</b>으로 날아갑니다. 노란 화살표가 과녁을 가리킬 때 놓으세요. 속력이 부족하면 거리도 모자랍니다.'}</div>`
        : `<div class="formula">과녁 중심은 회전 중심에서 <b>${TARGET.x} m</b>. 필요한 비행 거리는
           약 √(7²−r²) ≈ 6.7 m → 속력 <b>약 11 m/s</b> 가 알맞습니다.</div>`;
      return rows + res;
    }
    const T = labT();
    return `
      <div class="row"><span>쇠고리 수</span><b>${state.rings}개</b></div>
      <div class="row"><span>구심력 <i>F</i> (쇠고리 무게)</span><b>${labF().toFixed(2)} N</b></div>
      <div class="row"><span>고무마개 질량</span><b>${(M_STOP * 1000).toFixed(0)} g</b></div>
      <div class="row"><span>반지름 <i>r</i></span><b>${R_LAB.toFixed(1)} m</b></div>
      <div class="sec">측정</div>
      <div class="row"><span>주기 <i>T</i> (이론)</span><b>${T.toFixed(3)} s</b></div>
      <div class="row"><span>10회전 측정 결과</span>
        <b class="big">${sim.measured ? sim.measured.toFixed(3) + ' s' : sim.measuring ? '측정 중…' : '—'}</b></div>
      <div class="row"><span>1/<i>T</i>²</span><b>${(1 / (T * T)).toFixed(3)} s⁻²</b></div>
      <div class="formula"><i>F</i> = <i>mrω</i>² = 4π²<i>mr</i>/<i>T</i>² →
        구심력이 클수록 주기는 짧아지고, <b><i>F</i> ∝ 1/<i>T</i>²</b> 입니다.</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '구심력과 주기의 관계';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    if (state.mode === 'game') {
      // 위에서 본 모습: 원 궤도 · 접선 · 과녁
      const cx = W * 0.30, cy = H * 0.52, S = 9;
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R_GAME * S, 0, 7); ctx.stroke();
      // 과녁
      const tx2 = cx + TARGET.x * S, ty2 = cy - TARGET.z * S;
      ['#5a9df0', '#f6f2e6', '#e8577a'].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(tx2, ty2, (1.5 - i * 0.5) * S, 0, 7); ctx.fill();
      });
      if (sim && (sim.phase === 'spin' || sim.phase === 'fly' || sim.phase === 'land')) {
        const th = sim.relTh != null ? sim.relTh : sim.th;
        const bx2 = cx + Math.cos(th) * R_GAME * S;
        const by2 = cy + Math.sin(th) * R_GAME * S * -1;
        // 접선
        const dx = -Math.sin(th), dz = Math.cos(th);
        ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2;
        ctx.setLineDash(sim.relTh != null ? [] : [6, 5]);
        ctx.beginPath();
        ctx.moveTo(bx2, by2);
        ctx.lineTo(bx2 + dx * 90, by2 - dz * 90);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#d0453a';
        ctx.beginPath(); ctx.arc(bx2, by2, 5, 0, 7); ctx.fill();
        if (sim.phase === 'land' && sim.pos) {
          ctx.fillStyle = '#ff8a3c';
          ctx.beginPath();
          ctx.arc(cx + sim.pos.x * S, cy - sim.pos.z * S, 5, 0, 7);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('위에서 본 모습 — 속도는 항상 접선 방향', 8, 6);
      return;
    }

    // 실험 모드: 1/T² – 쇠고리 수 그래프 (해 보기 24쪽)
    const padL = 40, padR = 12, padT = 16, padB = 26;
    const gw = W - padL - padR, gh = H - padT - padB;
    const NMAX = 8, YMAX = 8 * W_RING * 4 * Math.PI * Math.PI * 0 + 2.6; // 1/T² 최대 ≈ 2.48
    const xOf = (n) => padL + (n / NMAX) * gw;
    const yOf = (v) => padT + gh - (v / YMAX) * gh;

    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1;
    for (let n = 1; n <= NMAX; n++) {
      ctx.beginPath(); ctx.moveTo(xOf(n), padT); ctx.lineTo(xOf(n), padT + gh); ctx.stroke();
    }

    // 이론 직선: 1/T² = F/(4π²mr) = N·W_RING/(4π²·m·r)
    const k = W_RING / (4 * Math.PI * Math.PI * M_STOP * R_LAB);
    ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(0));
    ctx.lineTo(xOf(NMAX), yOf(k * NMAX));
    ctx.stroke();

    // 현재 조건 점
    [1, 2, 4, 8].forEach((n) => {
      const T = 2 * Math.PI * Math.sqrt(M_STOP * R_LAB / (n * W_RING));
      ctx.fillStyle = n === state.rings ? '#ffd84a' : 'rgba(255,216,74,.35)';
      ctx.beginPath(); ctx.arc(xOf(n), yOf(1 / (T * T)), n === state.rings ? 5 : 3.4, 0, 7); ctx.fill();
    });

    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let n = 0; n <= NMAX; n += 2) ctx.fillText(String(n), xOf(n), padT + gh + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('쇠고리 수 (구심력)', W - 4, padT + gh + 12);
    ctx.save();
    ctx.translate(10, padT + gh / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('1/T² (s⁻²)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#5ad0f0'; ctx.font = 'bold 10px sans-serif';
    ctx.fillText('직선 = F ∝ 1/T²', padL + 6, padT + 2);
  }

  function graphFootHTML() {
    if (state.mode === 'game') {
      return '공을 놓는 순간의 <b style="color:#ffd84a">접선</b>이 곧 공이 날아가는 방향입니다 · 반지름 방향이 아닙니다!';
    }
    return `쇠고리 수(구심력)와 <b>1/T²</b> 이 정비례 — 반지름이 일정할 때
      구심력은 <b>주기의 제곱에 반비례</b>합니다 (해 보기 24쪽)`;
  }

  /* ══ 기록표 (해 보기 24쪽 표) ════════════════ */
  const recordColumns = [
    '모드', '조건', '주기 <i>T</i> (s)', '<i>T</i>² (s²)', '1/<i>T</i>² (s⁻²)', '결과',
  ];

  function recordRow() {
    if (state.mode === 'game') {
      if (!sim || sim.phase !== 'land') return null;
      return [['게임', `v = ${state.vGame.toFixed(1)} m/s`,
        (2 * Math.PI / omega()).toFixed(2), '—', '—',
        `${sim.result} (오차 ${sim.dist.toFixed(2)} m)`]];
    }
    const T = labT();
    return [['실험', `쇠고리 ${state.rings}개 (F = ${labF().toFixed(2)} N)`,
      T.toFixed(3), (T * T).toFixed(3), (1 / (T * T)).toFixed(3),
      sim.measured ? `10회전 = ${(sim.measured * 10).toFixed(2)} s` : '—']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 게임 던지기 · 1 게임 성공 · 2 실험 모드 측정 · 3 구심력 2가지 비교
     4 기록 4줄                                                            */
  const mis = { threw: false, win: false, rings: {}, measured: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'game' && sim && sim.phase === 'land') {
      mis.threw = true;
      if (sim.dist !== undefined && sim.dist < 1.5) mis.win = true;
    }
    if (state.mode === 'lab' && sim && sim.measured) {
      mis.measured = true;
      mis.rings[state.rings] = true;
    }
    if (i === 0) return mis.threw;
    if (i === 1) return mis.win;
    if (i === 2) return mis.measured;
    if (i === 3) return Object.keys(mis.rings).length >= 2;
    if (i === 4) return recs().length >= 4;
    return false;
  }

  return {
    missionDone,
    id: 'circular',
    title: '원운동과 구심력 — 해머던지기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, omega, flyRange, labF, labT,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
