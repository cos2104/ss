/**
 * 구급차가 지나갈 때 — 도플러 효과 이야기 (② 인터랙티브 스토리텔링형)
 * 비상교육 고등 역학과 에너지 III-03 (교과서 98~103쪽)
 *
 * 이야기 모드 — 구급차가 관찰자 앞을 지나가며 사이렌의 높낮이가 변한다.
 *              파면이 압축·확장되는 모습과 실제 소리(웹오디오)로 체험한다.
 * 실험 모드  — 탐구 101쪽: (가) 음원 이동 / (나) 관찰자 이동의 진동수 측정.
 * 스피드건  — 해 보기 102쪽: 반사파의 진동수 변화로 자동차 속력 알아맞히기.
 */
const DopplerScene = (() => {
  const B = () => BABYLON;

  const V_SOUND = 340;         // m/s
  const F0 = 800;              // 사이렌 진동수 (Hz)
  const ROAD_L = 90;           // 도로 길이 (m)
  const M = 0.42;              // 1 m = 0.42 unit
  const OBS_D = 8;             // 관찰자와 도로의 거리 (m)

  let scene, camera;
  let ambulance, observer, waveRings = [], roadG;
  let placed = {};
  let audioCtx = null, osc = null, gainNode = null;

  const state = {
    mode: 'story',       // 'story' | 'lab' | 'gun'
    vs: 20,              // 구급차 속력 (m/s)
    sound: false,        // 소리 켜기
    labWho: 'source',    // 'source' 음원 이동 | 'observer' 관찰자 이동
    labDir: 'closer',    // 'closer' | 'away'
    labV: 10,            // 실험 속력
    guess: 25,           // 스피드건: 추정 속력
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'ambT', label: '구급차 (음원)', icon: 'cart' },
    { id: 'obsT', label: '관찰자', icon: 'sensor' },
    { id: 'micT', label: '진동수 측정 앱', icon: 'ammeter' },
    { id: 'gunT', label: '스피드건', icon: 'stopwatch' },
  ];
  const slots = {
    ambT: { name: '도로 왼쪽 끝' },
    obsT: { name: '도로 앞 인도' },
    micT: { name: '관찰자 옆' },
    gunT: { name: '오른쪽 (스피드건)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 각도를 고려한 관측 진동수: f' = f₀·v/(v − vs·cosθ) */
  function observedF(srcX) {
    // 관찰자 (0, OBS_D), 음원 (srcX, 0), 음원 속도 +x
    const dx = 0 - srcX, dy = OBS_D;
    const dist = Math.hypot(dx, dy);
    const cos = dx / dist;                     // 시선 방향으로의 접근 성분
    return F0 * V_SOUND / (V_SOUND - state.vs * cos);
  }
  /** 실험 모드 진동수 (탐구 101쪽) */
  function labF() {
    const v = V_SOUND, u = state.labV;
    if (state.labWho === 'source') {
      return state.labDir === 'closer' ? F0 * v / (v - u) : F0 * v / (v + u);
    }
    return state.labDir === 'closer' ? F0 * (v + u) / v : F0 * (v - u) / v;
  }
  /** 스피드건: 반사파 진동수 (이중 도플러) f' = f₀(v+u)/(v−u) */
  const gunF = (u) => F0 * (V_SOUND + u) / (V_SOUND - u);

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#bcd8f0ff');

    camera = new (B().ArcRotateCamera)(
      'camDo', -Math.PI / 2, 0.72, 34, new (B().Vector3)(0, 0, 1), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 60;
    camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hd', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.5, 0.52, 0.55);
    const dir = new (B().DirectionalLight)('dd', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 22, -10);
    dir.intensity = 0.35;

    buildRoad();
    buildAmbulance();
    buildObserver();
    buildProps();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/doppler.jpg', { x: -16, y: 0, z: 11, ry: 0.35 });

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

  function buildRoad() {
    roadG = new (B().TransformNode)('doRoad', scene);
    const grass = B().MeshBuilder.CreateGround('doGrass', { width: ROAD_L * M + 8, height: 30 }, scene);
    grass.material = mat('doGrassMat', '#8fae83', '#b9ccb0', 64);
    grass.parent = roadG;
    const road = B().MeshBuilder.CreateGround('doRoadS', { width: ROAD_L * M, height: 4.6 }, scene);
    road.position.y = 0.01;
    road.material = mat('doRoadMat', '#5a626e', '#8a929e', 48);
    road.parent = roadG;
    // 중앙선
    for (let i = 0; i < 16; i++) {
      const dash = B().MeshBuilder.CreateGround('doDash' + i, { width: 1.2, height: 0.16 }, scene);
      dash.position.set(-ROAD_L * M / 2 + 1.5 + i * (ROAD_L * M / 16), 0.02, 0);
      dash.material = emat('doDashM' + i, '#f0e8c8');
      dash.parent = roadG;
    }
    // 인도
    const walk = B().MeshBuilder.CreateGround('doWalk', { width: ROAD_L * M, height: 2.4 }, scene);
    walk.position.set(0, 0.015, OBS_D * M);
    walk.material = mat('doWalkMat', '#c9c2a8', '#e6e0cc', 48);
    walk.parent = roadG;
  }

  function buildAmbulance() {
    ambulance = new (B().TransformNode)('doAmb', scene);
    const body = B().MeshBuilder.CreateBox('doAmbB', { width: 2.6, height: 1.2, depth: 1.3 }, scene);
    body.position.y = 0.85;
    body.material = mat('doAmbBM', '#f0f0f0', '#ffffff', 96);
    body.parent = ambulance;
    const stripe = B().MeshBuilder.CreateBox('doAmbS', { width: 2.62, height: 0.3, depth: 1.32 }, scene);
    stripe.position.y = 0.75;
    stripe.material = mat('doAmbSM', '#d0453a');
    stripe.parent = ambulance;
    const cab = B().MeshBuilder.CreateBox('doAmbC', { width: 0.9, height: 0.75, depth: 1.25 }, scene);
    cab.position.set(1.45, 0.65, 0);
    cab.material = mat('doAmbCM', '#e8e8e8', '#fff', 96);
    cab.parent = ambulance;
    // 앞유리·옆유리
    const glassM = mat('doAmbGM', '#8ab8d8', '#d8ecf8', 96);
    const wind = B().MeshBuilder.CreateBox('doAmbW', { width: 0.1, height: 0.4, depth: 1.1 }, scene);
    wind.position.set(1.92, 0.78, 0);
    wind.rotation.z = -0.18;
    wind.material = glassM;
    wind.parent = ambulance;
    [-0.66, 0.66].forEach((dz, i) => {
      const side = B().MeshBuilder.CreateBox('doAmbSW' + i, { width: 0.62, height: 0.34, depth: 0.06 }, scene);
      side.position.set(1.45, 0.8, dz);
      side.material = glassM;
      side.parent = ambulance;
    });
    // 적십자 마크 (양 옆면)
    [-0.68, 0.68].forEach((dz, i) => {
      const v = B().MeshBuilder.CreateBox('doAmbXv' + i, { width: 0.14, height: 0.5, depth: 0.05 }, scene);
      v.position.set(-0.35, 0.95, dz);
      v.material = emat('doAmbXM' + i, '#d0453a');
      v.parent = ambulance;
      const h2 = B().MeshBuilder.CreateBox('doAmbXh' + i, { width: 0.5, height: 0.14, depth: 0.05 }, scene);
      h2.position.set(-0.35, 0.95, dz);
      h2.material = emat('doAmbXM2' + i, '#d0453a');
      h2.parent = ambulance;
    });
    const light = B().MeshBuilder.CreateBox('doAmbL', { width: 0.5, height: 0.22, depth: 0.5 }, scene);
    light.position.y = 1.56;
    light.material = emat('doAmbLM', '#d0453a');
    ambulance._light = light;
    light.parent = ambulance;
    const wm = mat('doWheelM', '#20262f');
    [[-0.8, -0.62], [0.9, -0.62], [-0.8, 0.62], [0.9, 0.62]].forEach(([dx, dz], i) => {
      const w = B().MeshBuilder.CreateCylinder('doW' + i, { height: 0.14, diameter: 0.56 }, scene);
      w.rotation.x = Math.PI / 2;
      w.position.set(dx, 0.28, dz);
      w.material = wm; w.parent = ambulance;
    });
  }

  function buildObserver() {
    observer = new (B().TransformNode)('doObs', scene);
    const body = B().MeshBuilder.CreateCapsule('doObsB', { height: 1.3, radius: 0.28 }, scene);
    body.position.y = 1.0;
    body.material = mat('doObsBM', '#5a9df0', '#cfe4ff', 48);
    body.parent = observer;
    const head = B().MeshBuilder.CreateSphere('doObsH', { diameter: 0.46 }, scene);
    head.position.y = 1.9;
    head.material = mat('doObsHM', '#e8b48a');
    head.parent = observer;
    observer.position.set(0, 0, OBS_D * M);
  }

  const props = {};

  /** 준비 단계용 소품 — 진동수 측정 앱과 스피드건 */
  function buildProps() {
    const phone = (id, x, z, hex) => {
      const g = new (B().TransformNode)('doProp' + id, scene);
      const body = B().MeshBuilder.CreateBox('doPropB' + id, { width: 0.6, height: 1.1, depth: 0.12 }, scene);
      body.position.y = 0.55;
      body.rotation.x = -0.3;
      body.material = mat('doPropBM' + id, hex, '#8fa0b8', 96);
      body.parent = g;
      const scr = B().MeshBuilder.CreatePlane('doPropS' + id, { width: 0.5, height: 0.95 }, scene);
      scr.position.set(0, 0.57, -0.075);
      scr.rotation.x = -0.3;
      scr.material = emat('doPropSM' + id, '#173a2c');
      scr.parent = g;
      g.position.set(x, 0, z);
      g.setEnabled(false);
      return g;
    };
    props.micT = phone('Mic', 3.4, OBS_D * M, '#1c222b');
    // 스피드건 — 손잡이 달린 측정기
    const g = new (B().TransformNode)('doPropGun', scene);
    const head = B().MeshBuilder.CreateBox('doPropGH', { width: 0.9, height: 0.6, depth: 0.5 }, scene);
    head.position.y = 1.0;
    head.material = mat('doPropGHM', '#39424f', '#8e9bad', 64);
    head.parent = g;
    const grip = B().MeshBuilder.CreateBox('doPropGG', { width: 0.24, height: 0.7, depth: 0.3 }, scene);
    grip.position.set(0, 0.45, 0.05);
    grip.rotation.x = 0.25;
    grip.material = mat('doPropGGM', '#20262f');
    grip.parent = g;
    const lens = B().MeshBuilder.CreateCylinder('doPropGL', { height: 0.1, diameter: 0.4 }, scene);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 1.0, -0.3);
    lens.material = emat('doPropGLM', '#5ad0f0');
    lens.parent = g;
    g.position.set(12, 0, OBS_D * M - 1);
    g.setEnabled(false);
    props.gunT = g;
  }

  /* 파면 고리 */
  function spawnRing(x) {
    if (waveRings.length > 26) {
      const old = waveRings.shift();
      old.mesh.dispose();
    }
    const t = B().MeshBuilder.CreateTorus('doRing' + Math.random(), {
      diameter: 0.4, thickness: 0.07, tessellation: 48,
    }, scene);
    t.position.set(x * M, 0.35, 0);
    t.material = emat('doRingM' + Math.random(), '#f0a53c', 0.85);
    t.isPickable = false;
    waveRings.push({ mesh: t, x, r: 0.2, born: sim.t });
  }
  function clearRings() {
    waveRings.forEach((r) => r.mesh.dispose());
    waveRings = [];
  }

  /* ── 오디오 ─────────────────────────────────── */
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      osc = audioCtx.createOscillator();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      osc.type = 'triangle';
      osc.frequency.value = F0;
      osc.connect(gainNode); gainNode.connect(audioCtx.destination);
      osc.start();
    }
  }
  function setAudio(freq, on) {
    if (!audioCtx) return;
    gainNode.gain.setTargetAtTime(on ? 0.045 : 0, audioCtx.currentTime, 0.05);
    osc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.03);
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      ambT: { x: -ROAD_L * M / 2 + 3, z: 0, w: 4.4, h: 3.2, label: '구급차' },
      obsT: { x: 0, z: OBS_D * M, w: 3.4, h: 2.4, label: '관찰자' },
      micT: { x: 3.4, z: OBS_D * M, w: 3.2, h: 2.2, label: '측정 앱' },
      gunT: { x: 12, z: OBS_D * M - 1, w: 3.4, h: 2.4, label: '스피드건' },
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
    return (Math.abs(point.x - c.x) <= 5 && Math.abs(point.z - c.z) <= 3.4) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    sim = {
      t: 0,
      srcX: -ROAD_L / 2 + 4,     // 구급차 위치 (m)
      lastRing: 0,
      fHist: [],                 // 관측 진동수 기록
      // 스피드건
      carV: 22 + Math.round(Math.random() * 16),   // 숨겨진 자동차 속력
      revealed: false,
    };
    clearRings();
    setAudio(F0, false);
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();

    // 도로·잔디는 항상 보이는 기본 배경, 도구는 놓는 대로 하나씩
    roadG.setEnabled(true);
    ambulance.setEnabled(!!placed.ambT);
    observer.setEnabled(!!placed.obsT);
    if (props.micT) props.micT.setEnabled(!!placed.micT);
    if (props.gunT) props.gunT.setEnabled(!!placed.gunT);
    if (!all) {
      if (placed.ambT) ambulance.position.x = (-ROAD_L / 2 + 4) * M;
      return;
    }

    ambulance.position.x = sim.srcX * M;
    // 파면 반지름 갱신은 tick 에서
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;

    // 경광등 깜빡임
    if (ambulance._light) {
      ambulance._light.material.emissiveColor = (Math.floor(sim.t * 5) % 2)
        ? B().Color3.FromHexString('#d0453a') : B().Color3.FromHexString('#5a9df0');
    }

    if (!state.running) return false;
    sim.t += dt;

    if (state.mode === 'story') {
      sim.srcX += state.vs * dt;
      if (sim.srcX > ROAD_L / 2 - 3) {
        sim.srcX = ROAD_L / 2 - 3;
        state.running = false;
        setAudio(F0, false);
        const btn = document.querySelector('#runBtn');
        if (btn) { btn.textContent = '▶ 출발', btn.classList.remove('run'); }
      }
      // 파면 방출 (0.18초마다 — 실제 T 는 너무 짧아 연출 간격)
      if (sim.t - sim.lastRing > 0.18) {
        spawnRing(sim.srcX);
        sim.lastRing = sim.t;
      }
      // 파면 확장 (연출 속도: 실제 340 m/s 는 너무 빨라 22 m/s 로)
      const VIS_V = 22;
      waveRings.forEach((r) => {
        r.r += VIS_V * dt * M;
        r.mesh.scaling.setAll(r.r / 0.2);
        r.mesh.material.alpha = Math.max(0, 0.85 - r.r / 16);
      });
      const f = observedF(sim.srcX);
      sim.fHist.push({ x: sim.srcX, f });
      if (sim.fHist.length > 600) sim.fHist.shift();
      if (state.sound) { ensureAudio(); setAudio(f, true); }
      else setAudio(F0, false);
      layout();
      return true;
    }

    if (state.mode === 'lab') {
      // 수레가 관찰자 쪽/반대쪽으로 이동하는 연출
      const dir2 = state.labDir === 'closer' ? 1 : -1;
      sim.srcX += (state.labWho === 'source' ? dir2 * state.labV : 0) * dt;
      if (Math.abs(sim.srcX) > ROAD_L / 2 - 4) sim.srcX = -ROAD_L / 2 + 4;
      layout();
      return true;
    }

    // gun 모드: 자동차가 접근
    sim.srcX += sim.carV * dt;
    if (sim.srcX > ROAD_L / 2 - 3) sim.srcX = -ROAD_L / 2 + 4;
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
    camera.beta = 0.72;
    camera.radius = 34;
    camera.setTarget(new (B().Vector3)(0, 0, 1));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '구급차가 다가올 때와 멀어질 때 파면 간격과 소리의 높낮이가 어떻게 변하는지 보고 들어 보세요.';
  const prepGuide = '점선 자리에 구급차·관찰자·측정 앱·스피드건을 끌어다 놓아 이야기를 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'story', t: '🚑 구급차 이야기' },
      { v: 'lab', t: '탐구 (101쪽)' },
      { v: 'gun', t: '스피드건 (102쪽)' },
    ], state.mode, 1);

    if (state.mode === 'story') {
      return `
        ${modeBtns}
        ${LabUI.slider('vs', '구급차 속력<br><i>v</i><sub>S</sub>',
          { min: 10, max: 34, step: 1, value: state.vs, fmt: (v) => `${v} m/s` })}
        ${LabUI.opts('사이렌 소리', 'sound', [
          { v: 0, t: '끄기' }, { v: 1, t: '켜기 🔊' },
        ], state.sound ? 1 : 0, 1)}
        <div class="control">
          <div class="clabel">이야기</div>
          <button class="power" id="runBtn">▶ 출발</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    if (state.mode === 'lab') {
      return `
        ${modeBtns}
        ${LabUI.opts('누가 움직이나<br>(탐구 101쪽)', 'labWho', [
          { v: 'source', t: '(가) 음원 이동' }, { v: 'observer', t: '(나) 관찰자 이동' },
        ], state.labWho, 1)}
        ${LabUI.opts('방향', 'labDir', [
          { v: 'closer', t: '가까워질 때' }, { v: 'away', t: '멀어질 때' },
        ], state.labDir, 1)}
        ${LabUI.slider('labV', '속력', { min: 2, max: 20, step: 1, value: state.labV, fmt: (v) => `${v} m/s` })}
        <div class="control">
          <div class="clabel">실험</div>
          <button class="power" id="runBtn">▶ 측정</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.slider('guess', '추정 속력', { min: 15, max: 45, step: 0.5, value: state.guess, fmt: (v) => `${(+v).toFixed(1)} m/s` })}
      <div class="control">
        <div class="clabel">자동차</div>
        <button class="power" id="runBtn">▶ 접근 시작</button>
      </div>
      <div class="control">
        <div class="clabel">정답 확인</div>
        <button class="power" id="checkBtn">🎯 판정</button>
      </div>
      <div class="control">
        <div class="clabel">새 문제</div>
        <button class="power off" id="resetBtn">↻ 다른 차</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.mode === 'story') {
      LabUI.bindSlider(root, 'vs', state, 'vs', (v) => `${v} m/s`, () => { reset(); onChange(); });
      LabUI.bindOpts(root, 'sound', state, 'sound', () => {
        state.sound = !!state.sound;
        if (state.sound) ensureAudio();
        onChange();
      });
    } else if (state.mode === 'lab') {
      const after = () => { onChange(); };
      LabUI.bindOpts(root, 'labWho', state, 'labWho', after, String);
      LabUI.bindOpts(root, 'labDir', state, 'labDir', after, String);
      LabUI.bindSlider(root, 'labV', state, 'labV', (v) => `${v} m/s`, after);
    } else {
      LabUI.bindSlider(root, 'guess', state, 'guess', (v) => `${(+v).toFixed(1)} m/s`, onChange);
      root.querySelector('#checkBtn').addEventListener('click', () => {
        sim.revealed = true;
        onChange();
      });
    }

    const run = root.querySelector('#runBtn');
    const labels = { story: '▶ 출발', lab: '▶ 측정', gun: '▶ 접근 시작' };
    run.addEventListener('click', () => {
      if (state.mode === 'story' && sim.srcX >= ROAD_L / 2 - 3.5) reset();
      state.running = !state.running;
      if (!state.running) setAudio(F0, false);
      else if (state.mode === 'story' && state.sound) ensureAudio();
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
    if (state.mode === 'story') {
      const f = observedF(sim.srcX);
      const approaching = sim.srcX < 0;
      return `
        <div class="row"><span>사이렌 원래 진동수 <i>f</i>₀</span><b>${F0} Hz</b></div>
        <div class="row"><span>구급차 속력 <i>v</i><sub>S</sub></span><b>${state.vs} m/s</b></div>
        <div class="row"><span>구급차 위치</span><b>${sim.srcX.toFixed(0)} m
          (${approaching ? '다가오는 중' : '멀어지는 중'})</b></div>
        <div class="sec">관찰자가 듣는 소리</div>
        <div class="row"><span>진동수 <i>f</i>′</span><b class="big">${f.toFixed(1)} Hz</b></div>
        <div class="row"><span>바로 앞 최대/최소</span>
          <b>${(F0 * V_SOUND / (V_SOUND - state.vs)).toFixed(0)} /
             ${(F0 * V_SOUND / (V_SOUND + state.vs)).toFixed(0)} Hz</b></div>
        <div class="formula">${approaching
          ? '다가올 때 — 파면이 <b>압축</b>되어 파장이 짧아지고 <b>높은 소리</b>가 들립니다.'
          : '멀어질 때 — 파면이 <b>늘어나</b> 파장이 길어지고 <b>낮은 소리</b>가 들립니다.'}
          앞뒤 파면 간격을 비교해 보세요!</div>`;
    }
    if (state.mode === 'lab') {
      const f = labF();
      return `
        <div class="row"><span>구분</span>
          <b>${state.labWho === 'source' ? '(가) 음원이 이동' : '(나) 관찰자가 이동'} ·
             ${state.labDir === 'closer' ? '가까워질 때' : '멀어질 때'}</b></div>
        <div class="row"><span>발생 진동수</span><b>${F0} Hz</b></div>
        <div class="row"><span>이동 속력</span><b>${state.labV} m/s</b></div>
        <div class="sec">측정 결과</div>
        <div class="row"><span>측정 진동수</span><b class="big">${f.toFixed(1)} Hz</b></div>
        <div class="row"><span>차잇값</span><b>${(f - F0).toFixed(1)} Hz</b></div>
        <div class="formula">같은 10 m/s 라도 음원 이동(${(F0 * V_SOUND / (V_SOUND - 10)).toFixed(1)} Hz)과
          관찰자 이동(${(F0 * (V_SOUND + 10) / V_SOUND).toFixed(1)} Hz)의 값이 미묘하게 다릅니다 —
          <b>공기(매질)에 대한 운동</b>이 기준이기 때문입니다.</div>`;
    }
    const fRef = gunF(sim.carV);
    const fGuess = gunF(state.guess);
    const ok = Math.abs(state.guess - sim.carV) < 1;
    return `
      <div class="row"><span>스피드건 발사 진동수</span><b>${F0} Hz (초음파)</b></div>
      <div class="row"><span>측정된 반사파 진동수</span><b class="big">${fRef.toFixed(1)} Hz</b></div>
      <div class="sec">나의 추정</div>
      <div class="row"><span>추정 속력이면 반사파는</span><b>${fGuess.toFixed(1)} Hz</b></div>
      <div class="row"><span>판정</span>
        <b class="big">${sim.revealed
          ? (ok ? `🎯 정답! 실제 ${sim.carV} m/s` : `❌ 실제는 ${sim.carV} m/s`)
          : '슬라이더로 반사파 진동수를 맞춰 보세요'}</b></div>
      <div class="formula">반사파는 도플러 효과를 <b>두 번</b> 겪습니다:
        <i>f</i>′ = <i>f</i>₀(<i>v</i>+<i>u</i>)/(<i>v</i>−<i>u</i>).
        측정 진동수와 추정이 같아지는 속력이 자동차의 속력입니다.</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '관측 진동수의 변화';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 42, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;
    const FMIN = F0 * V_SOUND / (V_SOUND + 36) - 10;
    const FMAX = F0 * V_SOUND / (V_SOUND - 36) + 10;
    const xOf = (x) => padL + ((x + ROAD_L / 2) / ROAD_L) * gw;
    const yOf = (f) => padT + gh - ((f - FMIN) / (FMAX - FMIN)) * gh;

    // 기준선 f0
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(padL, yOf(F0)); ctx.lineTo(padL + gw, yOf(F0)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`f₀ = ${F0} Hz`, padL + 4, yOf(F0) - 2);

    if (state.mode === 'story') {
      // 이론 곡선
      ctx.strokeStyle = 'rgba(90,208,240,.4)'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const x = -ROAD_L / 2 + (i / 120) * ROAD_L;
        const y = yOf(observedF(x));
        if (i === 0) ctx.moveTo(xOf(x), y); else ctx.lineTo(xOf(x), y);
      }
      ctx.stroke();
      // 지나온 부분
      if (sim && sim.fHist.length > 1) {
        ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2.4;
        ctx.beginPath();
        sim.fHist.forEach((p, i) => {
          if (i === 0) ctx.moveTo(xOf(p.x), yOf(p.f)); else ctx.lineTo(xOf(p.x), yOf(p.f));
        });
        ctx.stroke();
      }
      // 관찰자 위치 표시
      ctx.strokeStyle = 'rgba(232,87,122,.6)';
      ctx.beginPath(); ctx.moveTo(xOf(0), padT); ctx.lineTo(xOf(0), padT + gh); ctx.stroke();
      ctx.fillStyle = '#e8577a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('관찰자 앞', xOf(0), padT + 2);
    } else if (state.mode === 'lab') {
      // 네 경우 막대
      const cases = [
        ['(가) 접근', F0 * V_SOUND / (V_SOUND - state.labV)],
        ['(가) 멀어짐', F0 * V_SOUND / (V_SOUND + state.labV)],
        ['(나) 접근', F0 * (V_SOUND + state.labV) / V_SOUND],
        ['(나) 멀어짐', F0 * (V_SOUND - state.labV) / V_SOUND],
      ];
      const bw = gw / 5;
      cases.forEach(([name, f], i) => {
        const x = padL + bw * (i + 0.5);
        const y = yOf(f);
        ctx.fillStyle = f > F0 ? '#e8577a' : '#5a9df0';
        ctx.fillRect(x, Math.min(y, yOf(F0)), bw * 0.6, Math.abs(y - yOf(F0)));
        ctx.fillStyle = '#9fb0c2';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(name, x + bw * 0.3, padT + gh + 4);
        ctx.fillStyle = '#e8ecf4'; ctx.textBaseline = 'bottom';
        ctx.fillText(f.toFixed(1), x + bw * 0.3, Math.min(y, yOf(F0)) - 2);
      });
    } else {
      // 스피드건: 측정선 vs 추정선
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(padL, yOf(gunF(sim.carV))); ctx.lineTo(padL + gw, yOf(gunF(sim.carV))); ctx.stroke();
      ctx.fillStyle = '#ffd84a'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('측정된 반사파', padL + 4, yOf(gunF(sim.carV)) - 2);
      ctx.strokeStyle = '#69d98c';
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(padL, yOf(gunF(state.guess))); ctx.lineTo(padL + gw, yOf(gunF(state.guess))); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#69d98c'; ctx.textBaseline = 'top';
      ctx.fillText('내 추정', padL + 4, yOf(gunF(state.guess)) + 2);
    }

    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
  }

  function graphFootHTML() {
    if (state.mode === 'story') {
      return '다가올 때 높고(일정), 지나치는 순간 <b>급격히 낮아지는</b> 이 곡선이 도플러 효과의 지문입니다';
    }
    if (state.mode === 'lab') {
      return '가까워지면 f₀ 보다 <b style="color:#e8577a">커지고</b>, 멀어지면 <b style="color:#5a9df0">작아집니다</b> — 탐구 101쪽 표';
    }
    return '노란 선(측정)과 초록 선(추정)이 겹치도록 속력을 조절한 뒤 «판정» 을 누르세요';
  }

  /* ══ 기록표 (탐구 101쪽 표) ══════════════════ */
  const recordColumns = [
    '구분', '조건', '측정값 (Hz)', '차잇값 (Hz)', '비고',
  ];

  function recordRow() {
    if (state.mode === 'story') {
      return [['이야기', `vS = ${state.vs} m/s`,
        `${(F0 * V_SOUND / (V_SOUND - state.vs)).toFixed(1)} → ${(F0 * V_SOUND / (V_SOUND + state.vs)).toFixed(1)}`,
        '—', '접근 최고 → 후퇴 최저']];
    }
    if (state.mode === 'lab') {
      const f = labF();
      return [[state.labWho === 'source' ? '(가) 음원 이동' : '(나) 관찰자 이동',
        `${state.labDir === 'closer' ? '가까워짐' : '멀어짐'} ${state.labV} m/s`,
        f.toFixed(1), (f - F0).toFixed(1), '']];
    }
    if (!sim.revealed) return null;
    const ok = Math.abs(state.guess - sim.carV) < 1;
    return [['스피드건', `추정 ${state.guess.toFixed(1)} m/s`,
      gunF(sim.carV).toFixed(1), (gunF(sim.carV) - F0).toFixed(1),
      ok ? `🎯 정답 (실제 ${sim.carV})` : `실제 ${sim.carV} m/s`]];
  }

  return {
    id: 'doppler',
    title: '구급차가 지나갈 때 — 도플러 효과 이야기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, observedF, labF, gunF,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
