/**
 * 행성 궤도 샌드박스 — 케플러 법칙과 뉴턴의 대포 (⑤ 샌드박스 + ④ 문제해결형)
 * 비상교육 고등 역학과 에너지 I-04·05 (교과서 26~35쪽)
 *
 * 케플러 모드 — 행성을 던져 타원 궤도를 만들고 세 법칙을 확인한다 (탐구 28쪽).
 * 대포 모드  — 뉴턴의 대포 (해 보기 30쪽): 발사 속력에 따라 추락·원 궤도·타원·탈출.
 */
const OrbitScene = (() => {
  const B = () => BABYLON;

  // 케플러 모드: 1 AU = 6 unit, GM(태양) = 4π² AU³/yr²
  const AU = 6;
  const GM_SUN = 4 * Math.PI * Math.PI;
  const YR_PER_S = 0.35;         // 시뮬레이션 1 초 = 0.35 년

  // 대포 모드: 행성 반지름 R 을 5 unit 으로 그린다. 실제 단위 km, km/s
  const GM_E = 398600;           // 지구 GM (km³/s²)
  const R_E = 6371;              // 지구 반지름 (km)
  const PLANETS = {
    earth:   { name: '지구',  mR: 1,      rR: 1,     atm: '질소·산소' },
    mercury: { name: '수성',  mR: 0.055,  rR: 0.383, atm: '(대기 없음)' },
    mars:    { name: '화성',  mR: 0.107,  rR: 0.532, atm: '이산화 탄소' },
    jupiter: { name: '목성',  mR: 317.8,  rR: 11.21, atm: '수소·헬륨' },
  };
  const SEC_PER_S = 900;         // 대포 모드: 1 초 = 900 실제 초

  let scene, camera;
  let sun, planet, cannonG, earthG, trail = [], sweepLines = [], placed = {};

  const state = {
    mode: 'kepler',    // 'kepler' | 'cannon'
    r0: 1.0,           // 케플러: 시작 거리 (AU)
    v0: 6.3,           // 케플러: 시작 속력 (AU/yr) — 원 궤도는 2π ≈ 6.28
    planet: 'earth',   // 대포: 행성
    vLaunch: 7.9,      // 대포: 발사 속력 (km/s)
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'sunT', label: '태양 모형', icon: 'ball' },
    { id: 'planetT', label: '행성', icon: 'ball' },
    { id: 'cannonT', label: '뉴턴의 대포', icon: 'tower' },
    { id: 'recT', label: '기록 장치', icon: 'sensor' },
  ];
  const slots = {
    sunT: { name: '가운데 (태양)' },
    planetT: { name: '오른쪽 궤도 위' },
    cannonT: { name: '행성 꼭대기 (산)' },
    recT: { name: '앞쪽 (기록 장치)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 케플러: 비스비바로 긴반지름 a = 1/(2/r − v²/GM) */
  function semiMajor(r, v) {
    const inv = 2 / r - (v * v) / GM_SUN;
    return inv > 1e-9 ? 1 / inv : Infinity;   // E ≥ 0 이면 탈출 궤도
  }
  const keplerT = (a) => Math.pow(a, 1.5);    // T² = a³ (년, AU)

  /** 대포: 행성별 GM·R */
  const pGM = () => GM_E * PLANETS[state.planet].mR;
  const pR = () => R_E * PLANETS[state.planet].rR;
  /** 원 궤도 속력 √(GM/r), 탈출 속도 √(2GM/R) */
  const vCirc = () => Math.sqrt(pGM() / (pR() + 300));
  const vEsc = () => Math.sqrt(2 * pGM() / (pR() + 300));

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#0a0e1aff');

    camera = new (B().ArcRotateCamera)(
      'camOr', -Math.PI / 2, 0.62, 34, new (B().Vector3)(0, 0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 80;
    camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('ho', new (B().Vector3)(0, 1, 0), scene);
    hemi.intensity = 0.55;
    hemi.groundColor = new (B().Color3)(0.2, 0.22, 0.3);

    buildStars();
    buildKepler();
    buildCannon();
    buildProps();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/orbit.jpg', { x: -15, y: 2, z: 10, ry: 0.4 });

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

  function buildStars() {
    // 별 배경 (점 몇 개)
    for (let i = 0; i < 90; i++) {
      const s = B().MeshBuilder.CreateSphere('star' + i, { diameter: 0.07 + Math.random() * 0.08 }, scene);
      const th = Math.random() * Math.PI * 2, r = 46 + Math.random() * 18;
      s.position.set(Math.cos(th) * r, (Math.random() - 0.5) * 34, Math.sin(th) * r);
      s.material = emat('starM' + i, '#cdd8ea', 0.8);
      s.isPickable = false;
    }
  }

  function buildKepler() {
    sun = B().MeshBuilder.CreateSphere('orSun', { diameter: 2.4 }, scene);
    sun.material = emat('orSunMat', '#ffca4a');
    const glow = new (B().GlowLayer)('orGlow', scene);
    glow.intensity = 0.7;

    planet = B().MeshBuilder.CreateSphere('orPlanet', { diameter: 0.7 }, scene);
    planet.material = mat('orPlanetMat', '#5a9df0', '#cfe4ff', 64);
  }

  function buildCannon() {
    earthG = new (B().TransformNode)('orEarth', scene);
    const e = B().MeshBuilder.CreateSphere('orEarthS', { diameter: 10 }, scene);
    e.material = mat('orEarthMat', '#3f7ec8', '#bcd8f0', 48);
    e.parent = earthG;
    // 대륙 느낌의 반점
    for (let i = 0; i < 8; i++) {
      const c = B().MeshBuilder.CreateSphere('orLand' + i, { diameter: 2.2 + Math.random() * 1.6 }, scene);
      const th = Math.random() * Math.PI * 2, ph = (Math.random() - 0.5) * Math.PI;
      c.position.set(Math.cos(th) * Math.cos(ph) * 4.6, Math.sin(ph) * 4.6, Math.sin(th) * Math.cos(ph) * 4.6);
      c.scaling.z = 0.25;
      c.lookAt(new (B().Vector3)(0, 0, 0));
      c.material = mat('orLandM' + i, '#6da35f');
      c.parent = earthG;
    }
    // 산 위의 대포 (북극 쪽)
    cannonG = new (B().TransformNode)('orCannon', scene);
    const mt = B().MeshBuilder.CreateCylinder('orMt', { height: 1.4, diameterTop: 0.3, diameterBottom: 1.6 }, scene);
    mt.position.y = 5.5;
    mt.material = mat('orMtMat', '#8a7a64');
    mt.parent = cannonG;
    const barrel2 = B().MeshBuilder.CreateCylinder('orBarrel', { height: 1.6, diameter: 0.4 }, scene);
    barrel2.rotation.z = Math.PI / 2;                 // 수평(접선) 방향
    barrel2.position.set(0.7, 6.3, 0);
    barrel2.material = mat('orBarrelMat', '#39424f', '#8e9bad', 64);
    barrel2.parent = cannonG;
    cannonG.parent = earthG;
  }

  const props = {};

  /** 준비 단계용 소품 — 미니 대포와 기록 장치 */
  function buildProps() {
    // 뉴턴의 대포 (산 + 포신)
    const gc = new (B().TransformNode)('orPropCannon', scene);
    const mt = B().MeshBuilder.CreateCylinder('orPropMt', { height: 1.1, diameterTop: 0.3, diameterBottom: 1.5 }, scene);
    mt.position.y = 0.55;
    mt.material = mat('orPropMtM', '#8a7a64');
    mt.parent = gc;
    const br = B().MeshBuilder.CreateCylinder('orPropBr', { height: 1.3, diameter: 0.34 }, scene);
    br.rotation.z = Math.PI / 2 - 0.4;
    br.position.set(0.55, 1.25, 0);
    br.material = mat('orPropBrM', '#39424f', '#8e9bad', 64);
    br.parent = gc;
    gc.position.set(-5, 0, 4.2);
    gc.setEnabled(false);
    props.cannonT = gc;
    // 기록 장치 (화면 달린 상자)
    const gr = new (B().TransformNode)('orPropRec', scene);
    const body = B().MeshBuilder.CreateBox('orPropRecB', { width: 1.2, height: 0.8, depth: 0.8 }, scene);
    body.position.y = 0.4;
    body.material = mat('orPropRecM', '#2b3441', '#7a8aa0', 64);
    body.parent = gr;
    const scr = B().MeshBuilder.CreatePlane('orPropRecS', { width: 1.0, height: 0.5 }, scene);
    scr.position.set(0, 0.5, -0.42);
    scr.rotation.x = -0.4;
    scr.material = emat('orPropRecSM', '#1f6a4a');
    scr.parent = gr;
    gr.position.set(6, 0, 5.4);
    gr.setEnabled(false);
    props.recT = gr;
  }

  function clearTrail() {
    trail.forEach((t) => t.dispose());
    sweepLines.forEach((l) => l.dispose());
    trail = []; sweepLines = [];
  }
  function addTrail(x, z, hex, d) {
    if (trail.length > 900) return;
    const s = B().MeshBuilder.CreateSphere('orTr' + trail.length, { diameter: d || 0.14 }, scene);
    s.position.set(x, 0, z);
    s.material = emat('orTrM' + trail.length, hex || '#ffd84a', 0.75);
    s.isPickable = false;
    trail.push(s);
  }
  /** 태양-행성 선분을 남겨 «휩쓴 면적» 을 보여 준다 (제2법칙) */
  function addSweep(x, z) {
    if (sweepLines.length > 160) return;
    const l = B().MeshBuilder.CreateLines('orSw' + sweepLines.length, {
      points: [new (B().Vector3)(0, 0, 0), new (B().Vector3)(x, 0, z)],
    }, scene);
    l.color = B().Color3.FromHexString('#69d98c');
    l.alpha = 0.4;
    l.isPickable = false;
    sweepLines.push(l);
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      sunT: { x: 0, z: 0, w: 4.4, h: 3.4, label: '태양 모형' },
      planetT: { x: AU, z: -3.6, w: 4.0, h: 2.8, label: '행성' },
      cannonT: { x: -5, z: 4.2, w: 4.6, h: 2.8, label: '뉴턴의 대포' },
      recT: { x: 6, z: 5.4, w: 4.0, h: 2.8, label: '기록 장치' },
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
    return (Math.abs(point.x - c.x) <= 4.4 && Math.abs(point.z - c.z) <= 3.4) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    if (state.mode === 'kepler') {
      sim = {
        // 시작: +x 방향 r0, 속도는 +z(접선) — 반시계
        x: state.r0, z: 0, vx: 0, vz: state.v0,
        t: 0, th0: 0, thPrev: 0, revs: 0, Tmeasured: null,
        rMin: state.r0, rMax: state.r0,
        dAmin: Infinity, dAmax: 0,
        escaped: false, sweepTimer: 0,
      };
    } else {
      const r = pR() + 300;   // 300 km 상공의 산
      sim = {
        x: 0, y: r, vx: state.vLaunch, vy: 0,   // km, km/s — 2차원 (x, y 평면)
        t: 0, crashed: false, escaped: false, orbits: 0, thPrev: Math.PI / 2,
        rMin: r, rMax: r,
      };
    }
    clearTrail();
    layout();
  }

  function layout() {
    if (!sim) return;
    const kep = state.mode === 'kepler';
    const all = allPlaced();

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다 (별 배경은 항상 보임)
    if (!all) {
      sun.setEnabled(!!placed.sunT);
      planet.setEnabled(!!placed.planetT);
      if (placed.planetT) {
        planet.scaling.setAll(1);
        planet.position.set(state.r0 * AU, 0, 0);
      }
      earthG.setEnabled(false);
      if (props.cannonT) props.cannonT.setEnabled(!!placed.cannonT);
      if (props.recT) props.recT.setEnabled(!!placed.recT);
      return;
    }
    if (props.cannonT) props.cannonT.setEnabled(false);
    if (props.recT) props.recT.setEnabled(false);

    sun.setEnabled(kep);
    planet.setEnabled(true);
    earthG.setEnabled(!kep);

    if (kep) {
      planet.position.set(sim.x * AU, 0, sim.z * AU);
      planet.scaling.setAll(1);
    } else {
      // km → unit: 행성 반지름 = 5 unit
      const K = 5 / pR();
      planet.position.set(sim.x * K, sim.y * K, 0);
      planet.scaling.setAll(0.5);
    }
  }

  function tick(dt) {
    if (!sim || !state.running) return false;

    if (state.mode === 'kepler') {
      if (sim.escaped) return false;
      // 벨로시티 베를레 (에너지 보존이 좋다), 8 서브스텝
      const h = (dt * YR_PER_S) / 8;
      for (let i = 0; i < 8; i++) {
        const r2 = sim.x * sim.x + sim.z * sim.z;
        const r = Math.sqrt(r2);
        const a = -GM_SUN / (r2 * r);
        const ax = a * sim.x, az = a * sim.z;
        sim.vx += ax * h / 2; sim.vz += az * h / 2;
        sim.x += sim.vx * h; sim.z += sim.vz * h;
        const r2b = sim.x * sim.x + sim.z * sim.z;
        const rb = Math.sqrt(r2b);
        const ab = -GM_SUN / (r2b * rb);
        sim.vx += ab * sim.x * h / 2;
        sim.vz += ab * sim.z * h / 2;
        sim.t += h;
      }
      const r = Math.hypot(sim.x, sim.z);
      const v = Math.hypot(sim.vx, sim.vz);
      sim.rMin = Math.min(sim.rMin, r);
      sim.rMax = Math.max(sim.rMax, r);
      // 면적 속도 dA/dt = |r × v| / 2 (제2법칙: 일정해야 한다)
      const dA = Math.abs(sim.x * sim.vz - sim.z * sim.vx) / 2;
      sim.dAmin = Math.min(sim.dAmin, dA);
      sim.dAmax = Math.max(sim.dAmax, dA);
      // 탈출 판정
      if (2 / r - v * v / GM_SUN < 1e-6 || r > 12) sim.escaped = true;
      // 한 바퀴(각도 2π 누적) 측정
      const th = Math.atan2(sim.z, sim.x);
      let dth = th - sim.thPrev;
      if (dth < -Math.PI) dth += 2 * Math.PI;
      if (dth > Math.PI) dth -= 2 * Math.PI;
      sim.revs += dth / (2 * Math.PI);
      sim.thPrev = th;
      if (sim.revs >= 1 && !sim.Tmeasured) sim.Tmeasured = sim.t;
      // 자취·휩쓴 선분
      addTrail(sim.x * AU, sim.z * AU, sim.escaped ? '#e8577a' : '#ffd84a');
      sim.sweepTimer += dt;
      if (sim.sweepTimer > 0.12) { addSweep(sim.x * AU, sim.z * AU); sim.sweepTimer = 0; }
      layout();
      return true;
    }

    // 대포 모드 (km, km/s)
    if (sim.crashed || sim.escaped) return false;
    const h2 = (dt * SEC_PER_S) / 8;
    for (let i = 0; i < 8; i++) {
      const r2 = sim.x * sim.x + sim.y * sim.y;
      const r = Math.sqrt(r2);
      const gm = pGM();
      const a = -gm / (r2 * r);
      sim.vx += a * sim.x * h2 / 2; sim.vy += a * sim.y * h2 / 2;
      sim.x += sim.vx * h2; sim.y += sim.vy * h2;
      const r2b = sim.x * sim.x + sim.y * sim.y;
      const rb = Math.sqrt(r2b);
      const ab = -gm / (r2b * rb);
      sim.vx += ab * sim.x * h2 / 2; sim.vy += ab * sim.y * h2 / 2;
      sim.t += h2;
      if (rb <= pR()) { sim.crashed = true; break; }
    }
    const r3 = Math.hypot(sim.x, sim.y);
    const v3 = Math.hypot(sim.vx, sim.vy);
    sim.rMin = Math.min(sim.rMin, r3);
    sim.rMax = Math.max(sim.rMax, r3);
    if (2 * pGM() / r3 <= v3 * v3 && r3 > pR() * 6) sim.escaped = true;
    const th2 = Math.atan2(sim.y, sim.x);
    let dth2 = th2 - sim.thPrev;
    if (dth2 < -Math.PI) dth2 += 2 * Math.PI;
    if (dth2 > Math.PI) dth2 -= 2 * Math.PI;
    sim.orbits += dth2 / (2 * Math.PI);
    sim.thPrev = th2;

    const K = 5 / pR();
    if (trail.length < 900) {
      const s = B().MeshBuilder.CreateSphere('orTr' + trail.length, { diameter: 0.12 }, scene);
      s.position.set(sim.x * K, sim.y * K, 0);
      s.material = emat('orTrM' + trail.length,
        sim.crashed ? '#e8577a' : sim.escaped ? '#b78af0' : '#ffd84a', 0.8);
      s.isPickable = false;
      trail.push(s);
    }
    if (sim.crashed || sim.escaped) {
      state.running = false;
      const btn = document.querySelector('#goBtn');
      if (btn) { btn.textContent = '▶ 실행'; btn.classList.remove('run'); }
    }
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
    camera.beta = state.mode === 'kepler' ? 0.62 : 1.35;
    camera.radius = 34;
    camera.setTarget(new (B().Vector3)(0, 0, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '행성을 던져 타원 궤도를 만들어 보세요. 태양에 가까울수록 빨라지고(제2법칙), 긴반지름이 클수록 주기가 길어집니다(제3법칙).';
  const prepGuide = '점선 자리에 태양·행성·뉴턴의 대포·기록 장치를 끌어다 놓아 우주 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'kepler', t: '케플러 궤도 (26쪽)' }, { v: 'cannon', t: '뉴턴의 대포 (30쪽)' },
    ], state.mode, 1);

    if (state.mode === 'kepler') {
      return `
        ${modeBtns}
        ${LabUI.slider('r0', '시작 거리<br><i>r</i><sub>0</sub>',
          { min: 0.5, max: 2.0, step: 0.1, value: state.r0, fmt: (v) => `${(+v).toFixed(1)} AU` })}
        ${LabUI.slider('v0', '시작 속력<br><i>v</i><sub>0</sub>',
          { min: 3, max: 8.8, step: 0.1, value: state.v0, fmt: (v) => `${(+v).toFixed(1)} AU/yr` })}
        <div class="control">
          <div class="clabel">실험</div>
          <button class="power" id="goBtn">▶ 던지기</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.opts('행성 (표 I-1)', 'planet', [
        { v: 'earth', t: '지구' }, { v: 'mercury', t: '수성' },
        { v: 'mars', t: '화성' }, { v: 'jupiter', t: '목성' },
      ], state.planet, 2)}
      ${LabUI.slider('vLaunch', '발사 속력<br><i>v</i>',
        { min: 2, max: 70, step: 0.1, value: state.vLaunch, fmt: (v) => `${(+v).toFixed(1)} km/s` })}
      <div class="control">
        <div class="clabel">발사</div>
        <button class="power" id="goBtn">▶ 실행</button>
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

    const after = () => { reset(); onChange(); };
    if (state.mode === 'kepler') {
      LabUI.bindSlider(root, 'r0', state, 'r0', (v) => `${(+v).toFixed(1)} AU`, after);
      LabUI.bindSlider(root, 'v0', state, 'v0', (v) => `${(+v).toFixed(1)} AU/yr`, after);
    } else {
      LabUI.bindOpts(root, 'planet', state, 'planet', after, String);
      LabUI.bindSlider(root, 'vLaunch', state, 'vLaunch', (v) => `${(+v).toFixed(1)} km/s`, after);
    }
    const go = root.querySelector('#goBtn');
    go.addEventListener('click', () => {
      if (state.mode === 'kepler' && sim.escaped) reset();
      if (state.mode === 'cannon' && (sim.crashed || sim.escaped)) reset();
      state.running = !state.running;
      go.textContent = state.running ? '진행 중' : (state.mode === 'kepler' ? '▶ 던지기' : '▶ 실행');
      go.classList.toggle('run', state.running);
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      go.textContent = state.mode === 'kepler' ? '▶ 던지기' : '▶ 실행';
      go.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'kepler') {
      const r = Math.hypot(sim.x, sim.z);
      const v = Math.hypot(sim.vx, sim.vz);
      const a = semiMajor(state.r0, state.v0);
      const escaped = a === Infinity || sim.escaped;
      const dA = Math.abs(sim.x * sim.vz - sim.z * sim.vx) / 2;
      return `
        <div class="row"><span>태양까지 거리 <i>r</i></span><b>${r.toFixed(3)} AU</b></div>
        <div class="row"><span>공전 속력 <i>v</i></span><b>${v.toFixed(2)} AU/yr</b></div>
        <div class="row"><span>경과 시간</span><b>${sim.t.toFixed(2)} 년</b></div>
        <div class="sec">케플러 법칙</div>
        <div class="row"><span>긴반지름 <i>a</i></span>
          <b>${escaped ? '— (탈출 궤도!)' : a.toFixed(3) + ' AU'}</b></div>
        <div class="row"><span>이론 주기 <i>T</i> = <i>a</i><sup>3/2</sup></span>
          <b>${escaped ? '—' : keplerT(a).toFixed(3) + ' 년'}</b></div>
        <div class="row"><span>측정 주기 (한 바퀴)</span>
          <b class="big">${sim.Tmeasured ? sim.Tmeasured.toFixed(3) + ' 년' : '공전 중…'}</b></div>
        <div class="row"><span>근일점 / 원일점</span>
          <b>${sim.rMin.toFixed(2)} / ${sim.rMax.toFixed(2)} AU</b></div>
        <div class="sec">제2법칙 — 면적 속도</div>
        <div class="row"><span>지금 d<i>A</i>/d<i>t</i></span><b>${dA.toFixed(3)} AU²/yr</b></div>
        <div class="row"><span>최소 ~ 최대</span>
          <b>${sim.dAmin === Infinity ? '—' : sim.dAmin.toFixed(3) + ' ~ ' + sim.dAmax.toFixed(3)}</b></div>
        <div class="formula">면적 속도가 <b>일정</b>하므로 근일점에서 빠르고 원일점에서 느립니다.
          ${escaped ? '<br><b style="color:#e8577a">v² ≥ 2GM/r — 태양 중력을 벗어났습니다!</b>' : ''}</div>`;
    }
    const p = PLANETS[state.planet];
    const r = Math.hypot(sim.x, sim.y);
    const v = Math.hypot(sim.vx, sim.vy);
    const alt = r - pR();
    const status = sim.crashed ? '💥 지면에 추락'
      : sim.escaped ? '🚀 중력 탈출!'
      : sim.orbits >= 1 ? '🛰 궤도를 돌고 있음 (' + Math.floor(sim.orbits) + '바퀴)'
      : state.running ? '비행 중' : '발사 대기';
    return `
      <div class="row"><span>행성</span><b>${p.name} (질량 ${p.mR}×지구)</b></div>
      <div class="row"><span>주요 대기</span><b>${p.atm}</b></div>
      <div class="row"><span>상태</span><b class="big">${status}</b></div>
      <div class="row"><span>고도</span><b>${alt.toFixed(0)} km</b></div>
      <div class="row"><span>속력</span><b>${v.toFixed(2)} km/s</b></div>
      <div class="sec">기준 속도 (300 km 상공)</div>
      <div class="row"><span>원 궤도 속력 √(<i>GM</i>/<i>r</i>)</span><b>${vCirc().toFixed(1)} km/s</b></div>
      <div class="row"><span>탈출 속도 √(2<i>GM</i>/<i>r</i>)</span><b>${vEsc().toFixed(1)} km/s</b></div>
      <div class="formula">발사 속력이 원 궤도 속력보다 작으면 추락, 탈출 속도보다 크면
        무한히 멀어집니다. 그 사이면 <b>타원 궤도</b>를 돕니다.
        탈출 속도는 <b>발사체의 질량과 무관</b>합니다.</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '케플러 제3법칙 — T² 과 a³';

  const recorded = [];   // 케플러 기록점 {a, T}

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);
    const padL = 40, padR = 12, padT = 16, padB = 26;
    const gw = W - padL - padR, gh = H - padT - padB;

    if (state.mode === 'kepler') {
      // T² – a³ 그래프: 직선이면 제3법칙
      const MAXA = 9;  // a³ 최대
      const xOf = (a3) => padL + (a3 / MAXA) * gw;
      const yOf = (t2) => padT + gh - (t2 / MAXA) * gh;
      ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath(); ctx.moveTo(padL, padT + (i / 5) * gh); ctx.lineTo(padL + gw, padT + (i / 5) * gh); ctx.stroke();
      }
      // 이론 직선 T² = a³
      ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(xOf(0), yOf(0)); ctx.lineTo(xOf(MAXA), yOf(MAXA)); ctx.stroke();
      // 기록점
      recorded.forEach((pt) => {
        ctx.fillStyle = '#ffd84a';
        ctx.beginPath(); ctx.arc(xOf(pt.a ** 3), yOf(pt.T ** 2), 4.4, 0, 7); ctx.fill();
      });
      // 현재 궤도 예측점
      const a = semiMajor(state.r0, state.v0);
      if (a !== Infinity && a ** 3 <= MAXA) {
        ctx.strokeStyle = '#69d98c'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(xOf(a ** 3), yOf(a ** 3), 6, 0, 7); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.32)';
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
      ctx.stroke();
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('a³ (AU³)', W - 4, padT + gh + 4);
      ctx.save();
      ctx.translate(10, padT + gh / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.fillText('T² (년²)', 0, 0);
      ctx.restore();
      ctx.fillStyle = '#5ad0f0'; ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('직선 = T² ∝ a³ (기울기 1)', padL + 6, padT + 2);
      return;
    }

    // 대포 모드: 속도 게이지와 문턱값
    const VMAX = Math.max(70, vEsc() * 1.15);
    const xOfV = (v) => padL + (v / VMAX) * gw;
    const bar = padT + gh * 0.45;
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(padL, bar - 14, gw, 28);
    // 구간 색: 추락 / 타원 궤도 / 탈출
    ctx.fillStyle = 'rgba(232,87,122,.35)';
    ctx.fillRect(padL, bar - 14, xOfV(vCirc()) - padL, 28);
    ctx.fillStyle = 'rgba(105,217,140,.35)';
    ctx.fillRect(xOfV(vCirc()), bar - 14, xOfV(vEsc()) - xOfV(vCirc()), 28);
    ctx.fillStyle = 'rgba(183,138,240,.35)';
    ctx.fillRect(xOfV(vEsc()), bar - 14, padL + gw - xOfV(vEsc()), 28);
    // 문턱선
    ctx.strokeStyle = '#69d98c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xOfV(vCirc()), bar - 24); ctx.lineTo(xOfV(vCirc()), bar + 24); ctx.stroke();
    ctx.strokeStyle = '#b78af0';
    ctx.beginPath(); ctx.moveTo(xOfV(vEsc()), bar - 24); ctx.lineTo(xOfV(vEsc()), bar + 24); ctx.stroke();
    // 현재 발사 속력
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath();
    ctx.moveTo(xOfV(state.vLaunch), bar - 20);
    ctx.lineTo(xOfV(state.vLaunch) - 6, bar - 32);
    ctx.lineTo(xOfV(state.vLaunch) + 6, bar - 32);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`원 궤도 ${vCirc().toFixed(1)}`, xOfV(vCirc()), bar + 28);
    ctx.fillText(`탈출 ${vEsc().toFixed(1)} km/s`, xOfV(vEsc()), bar + 42);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8577a'; ctx.fillText('추락', padL + 4, bar - 44);
    ctx.fillStyle = '#69d98c'; ctx.fillText('궤도', xOfV(vCirc()) + 4, bar - 44);
    ctx.fillStyle = '#b78af0'; ctx.fillText('탈출', xOfV(vEsc()) + 4, bar - 44);
  }

  function graphFootHTML() {
    if (state.mode === 'kepler') {
      return '조건을 바꿔 여러 궤도를 만들고 «기록» 하세요 — 점들이 모두 <b>기울기 1 직선</b> 위에 놓입니다 (T²=a³)';
    }
    const p = PLANETS[state.planet];
    return `${p.name}의 탈출 속도 <b>${vEsc().toFixed(1)} km/s</b> —
      탈출 속도가 작은 행성은 가벼운 기체가 달아나 대기 조성이 다릅니다 (표 I-1)`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '모드', '조건', '<i>a</i> (AU)', '<i>T</i> (년)', '<i>T</i>² ', '<i>a</i>³', 'T²/a³',
  ];

  function recordRow() {
    if (state.mode === 'kepler') {
      const a = semiMajor(state.r0, state.v0);
      if (a === Infinity) {
        return [['케플러', `r₀=${state.r0} AU, v₀=${state.v0}`, '∞', '탈출', '—', '—', '—']];
      }
      const T = sim.Tmeasured || keplerT(a);
      recorded.push({ a, T });
      return [['케플러', `r₀=${state.r0} AU, v₀=${state.v0}`,
        a.toFixed(3), T.toFixed(3), (T * T).toFixed(3), (a ** 3).toFixed(3),
        ((T * T) / (a ** 3)).toFixed(3)]];
    }
    const p = PLANETS[state.planet];
    const res = sim.crashed ? '추락' : sim.escaped ? '탈출' : sim.orbits >= 1 ? '궤도 진입' : '비행 중';
    return [['대포', `${p.name}, v=${state.vLaunch.toFixed(1)} km/s`,
      '—', '—', '—', '—', res]];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 타원 궤도 · 1 원 궤도 · 2 케플러 제3법칙 확인 · 3 대포 궤도 진입
     4 탈출 속도 넘기기                                                    */
  const mis = { ellipse: false, circle: false, orbitIn: false, escaped: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'kepler' && state.running) {
      const a = semiMajor(state.r0, state.v0);
      if (a !== Infinity) {
        if (Math.abs(state.v0 - 6.28) < 0.12) mis.circle = true;
        else mis.ellipse = true;
      }
    }
    if (state.mode === 'cannon' && sim) {
      if (sim.orbits >= 1) mis.orbitIn = true;
      if (sim.escaped) mis.escaped = true;
    }
    if (i === 0) return mis.ellipse;
    if (i === 1) return mis.circle;
    if (i === 2) {
      // T²/a³ 값이 서로 비슷한 기록이 2줄 이상
      const rs = recs().filter((r) => String(r[0]) === '케플러' && r[6] && r[6] !== '—');
      if (rs.length < 2) return false;
      const k = rs.map((r) => parseFloat(r[6]));
      return Math.max.apply(null, k) - Math.min.apply(null, k) < 0.25;
    }
    if (i === 3) return mis.orbitIn;
    if (i === 4) return mis.escaped;
    return false;
  }

  return {
    missionDone,
    id: 'orbit',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '행성 궤도 샌드박스 — 케플러 법칙과 뉴턴의 대포',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, semiMajor, keplerT, vCirc, vEsc, pGM, pR,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
