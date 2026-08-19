/**
 * 하전 입자 놀이터 — 로런츠 힘 샌드박스 (⑤ 샌드박스형)
 * 비상교육 고등 전자기와 양자 I-04 (교과서 24~27쪽)
 *
 * 크룩스관 모드 — 해 보기 24쪽: 말굽자석의 방향에 따라 음극선이 휘는 방향 관찰.
 * 원운동 모드  — F = qvB 가 구심력: r = mv/qB, T = 2πm/qB (속력과 무관!).
 *               발사각을 비스듬히 하면 나선 운동 (밴앨런대, 27쪽).
 * 사이클로트론 — 그림 I-18: 반 바퀴마다 가속되어 반지름이 커지는 나선 궤적.
 */
const LorentzScene = (() => {
  const B = () => BABYLON;

  const SC = 1.0;              // 화면 축척

  let scene, camera;
  let fieldG, fieldMarks = [], particle, trail = [], crookesG, beamPts = [], beamMesh, magnet;
  let deesG;
  let placed = {};

  const state = {
    mode: 'circle',      // 'crookes' | 'circle' | 'cyclo'
    q: 1,                // 전하 (+1 / −1)
    m: 1,                // 질량 (1 / 2)
    v0: 3,               // 발사 속력
    Bf: 1.0,             // 자기장 세기
    pitch: 90,           // 발사각 (자기장과 이루는 각. 90° = 원운동)
    magnetDir: 'up',     // crookes: 'none' | 'up' | 'down' | 'along'
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'coilT', label: '자기장 코일', icon: 'coil' },
    { id: 'gunT', label: '입자 발사기', icon: 'tower' },
    { id: 'crtT', label: '음극선관', icon: 'lensConvex' },
    { id: 'magT', label: '말굽자석', icon: 'magnet' },
  ];
  const slots = {
    coilT: { name: '가운데 (자기장 영역)' },
    gunT: { name: '왼쪽 (발사기)' },
    crtT: { name: '앞쪽 (음극선관)' },
    magT: { name: '음극선관 옆' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  const radius = () => state.m * state.v0 * Math.sin(state.pitch * Math.PI / 180) / (Math.abs(state.q) * state.Bf);
  const period = () => 2 * Math.PI * state.m / (Math.abs(state.q) * state.Bf);

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#141a28ff');

    camera = new (B().ArcRotateCamera)(
      'camLo', -Math.PI / 2, 0.62, 26, new (B().Vector3)(0, 0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 60;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hlo', new (B().Vector3)(0, 1, 0), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new (B().Color3)(0.3, 0.32, 0.4);

    buildField();
    buildParticle();
    buildCrookes();
    buildDees();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/lorentz.jpg', { x: -10, y: 0, z: 9, ry: 0.35 });

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

  /** 자기장 영역 — 종이면(수평면)에 수직으로 나오는 B: ⊙ 기호를 격자로 */
  function buildField() {
    fieldG = new (B().TransformNode)('loField', scene);
    const plane = B().MeshBuilder.CreateGround('loPlane', { width: 22, height: 22 }, scene);
    plane.position.y = -0.3;
    const pm = new (B().StandardMaterial)('loPlaneM', scene);
    pm.diffuseColor = B().Color3.FromHexString('#1c2436');
    pm.specularColor = new (B().Color3)(0, 0, 0);
    plane.material = pm;
    // 바닥판은 항상 보이는 기본 배경 (fieldG 와 분리)

    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const dot = B().MeshBuilder.CreateTorus('loDot' + i + '_' + j,
          { diameter: 0.5, thickness: 0.05, tessellation: 24 }, scene);
        dot.position.set(i * 2.4, -0.25, j * 2.4);
        dot.material = emat('loDotM' + i + '_' + j, '#3f5a8a', 0.9);
        dot.isPickable = false;
        dot.parent = fieldG;
        const c = B().MeshBuilder.CreateSphere('loDotC' + i + '_' + j, { diameter: 0.1 }, scene);
        c.position.copyFrom(dot.position);
        c.material = emat('loDotCM' + i + '_' + j, '#3f5a8a');
        c.isPickable = false;
        c.parent = fieldG;
        fieldMarks.push(dot);
      }
    }
  }

  function buildParticle() {
    particle = B().MeshBuilder.CreateSphere('loP', { diameter: 0.55 }, scene);
    particle.material = emat('loPM', '#e8577a');
    const glow = new (B().GlowLayer)('loGlow', scene);
    glow.intensity = 0.6;
  }

  /** 크룩스관 (해 보기 24쪽) */
  function buildCrookes() {
    crookesG = new (B().TransformNode)('loCrookes', scene);
    const tube = B().MeshBuilder.CreateCylinder('loTube', { height: 12, diameter: 3.4 }, scene);
    tube.rotation.z = Math.PI / 2;
    const tm = new (B().StandardMaterial)('loTubeM', scene);
    tm.diffuseColor = B().Color3.FromHexString('#bcd8f0');
    tm.alpha = 0.15;
    tm.specularColor = B().Color3.FromHexString('#ffffff');
    tube.material = tm;
    tube.parent = crookesG;
    // 전극
    const cath = B().MeshBuilder.CreateCylinder('loCath', { height: 0.4, diameter: 2.2 }, scene);
    cath.rotation.z = Math.PI / 2;
    cath.position.x = -5.6;
    cath.material = mat('loCathM', '#39424f', '#8e9bad', 64);
    cath.parent = crookesG;
    // 말굽자석 (위 N / 아래 S 를 색으로)
    magnet = new (B().TransformNode)('loMag', scene);
    const nPole = B().MeshBuilder.CreateBox('loMagN', { width: 2.4, height: 0.7, depth: 1.4 }, scene);
    nPole.position.y = 2.3;
    nPole.material = mat('loMagNM', '#d0453a', '#ffd0c8', 48);
    nPole.parent = magnet;
    const sPole = B().MeshBuilder.CreateBox('loMagS', { width: 2.4, height: 0.7, depth: 1.4 }, scene);
    sPole.position.y = -2.3;
    sPole.material = mat('loMagSM', '#2f6ad0', '#c0d8ff', 48);
    sPole.parent = magnet;
    const yoke = B().MeshBuilder.CreateBox('loMagY', { width: 0.7, height: 5.3, depth: 1.4 }, scene);
    yoke.position.set(1.55, 0, 0);
    yoke.material = mat('loMagYM', '#5b6675');
    yoke.parent = magnet;
    magnet.position.set(1.5, 0, 0);
    magnet.parent = crookesG;
    crookesG.position.set(0, 1.8, 0);
  }

  /** 사이클로트론 D 전극 */
  function buildDees() {
    deesG = new (B().TransformNode)('loDees', scene);
    [-1, 1].forEach((s, i) => {
      const d = B().MeshBuilder.CreateCylinder('loDee' + i, {
        height: 0.5, diameter: 15, arc: 0.5,
      }, scene);
      d.rotation.y = s > 0 ? 0 : Math.PI;
      d.position.set(s * 0.5, -0.05, 0);
      const dm = new (B().StandardMaterial)('loDeeM' + i, scene);
      dm.diffuseColor = B().Color3.FromHexString('#39424f');
      dm.alpha = 0.5;
      d.material = dm;
      d.isPickable = false;
      d.parent = deesG;
    });
  }

  function clearTrail() {
    trail.forEach((t) => t.dispose());
    trail = [];
    if (beamMesh) { beamMesh.dispose(); beamMesh = null; }
    beamPts = [];
  }
  function addTrail(x, y, z, hex) {
    if (trail.length > 700) return;
    const s = B().MeshBuilder.CreateSphere('loTr' + trail.length, { diameter: 0.16 }, scene);
    s.position.set(x, y, z);
    s.material = emat('loTrM' + trail.length, hex || '#ffd84a', 0.8);
    s.isPickable = false;
    trail.push(s);
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      coilT: { x: 0, z: 0, w: 6, h: 4, label: '자기장 코일' },
      gunT: { x: -7, z: -3, w: 4, h: 3, label: '입자 발사기' },
      crtT: { x: 0, z: 6.4, w: 6, h: 3, label: '음극선관' },
      magT: { x: 7, z: 6.4, w: 4, h: 3, label: '말굽자석' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: false, color: '#5a9df0' });
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
    return (Math.abs(point.x - c.x) <= 4.6 && Math.abs(point.z - c.z) <= 3.4) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    const pr = state.pitch * Math.PI / 180;
    sim = {
      t: 0,
      // 원운동/나선: 위치와 속도 (x, z 평면이 종이면, y 가 B 방향)
      // 원의 중심이 원점에 오도록: r_vec = v/ω 방향 (부호 포함)
      x: radius() * Math.sign(state.q), y: 0, z: 0,
      vx: 0, vy: state.v0 * Math.cos(pr), vz: state.v0 * Math.sin(pr),
      revs: 0, Tm: null, thPrev: null,
      // 사이클로트론
      cv: 0.8, gapCount: 0,
      done: false,
    };
    if (state.mode === 'cyclo') {
      sim.x = 0.0; sim.z = 0; sim.vx = 0; sim.vz = sim.cv; sim.vy = 0;
    }
    clearTrail();
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const cr = state.mode === 'crookes';

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다
    if (!all) {
      fieldG.setEnabled(!!placed.coilT);
      particle.setEnabled(!!placed.gunT);
      if (placed.gunT) particle.position.set(-7, 0.4, -3);
      crookesG.setEnabled(!!placed.crtT);
      magnet.setEnabled(!!placed.crtT && !!placed.magT);
      deesG.setEnabled(false);
      return;
    }

    fieldG.setEnabled(!cr);
    particle.setEnabled(true);
    crookesG.setEnabled(cr);
    deesG.setEnabled(state.mode === 'cyclo');

    if (cr) {
      magnet.setEnabled(state.magnetDir !== 'none');
      magnet.rotation.z = 0;
      magnet.rotation.x = state.magnetDir === 'along' ? Math.PI / 2 : 0;
      // N 위 (기본) / N 아래 (뒤집기)
      magnet.rotation.y = 0;
      if (state.magnetDir === 'down') magnet.rotation.z = Math.PI;
      particle.position.set(-6 + (sim.t * 6) % 12, 1.8 + sim.beamY || 1.8, 0);
    } else {
      particle.position.set(sim.x * SC, sim.y * SC, sim.z * SC);
    }
  }

  function tick(dt) {
    if (!sim || !allPlaced() || !state.running) return false;
    sim.t += dt;

    if (state.mode === 'crookes') {
      // 음극선: 왼쪽에서 오른쪽으로. 자석 구간(x -1~4)에서 힘을 받는다
      if (sim.bx == null) { sim.bx = -5.6; sim.by = 0; sim.bvy = 0; }
      const speed = 7;
      sim.bx += speed * dt;
      // 자기장: N위→아래로 B (지면상 -y)… 전자 흐름은 +x, 전류는 −x.
      // 힘 방향은 방향 규칙으로: N위 = 위로 휨, N아래 = 아래로 휨 (연출된 결과)
      if (sim.bx > -1 && sim.bx < 4 && (state.magnetDir === 'up' || state.magnetDir === 'down')) {
        const a = state.magnetDir === 'up' ? 6 : -6;
        sim.bvy += a * dt;
      }
      sim.by += sim.bvy * dt;
      beamPts.push(new (B().Vector3)(sim.bx, 1.8 + sim.by * 0.35, 0));
      if (beamMesh) beamMesh.dispose();
      if (beamPts.length > 1) {
        beamMesh = B().MeshBuilder.CreateLines('loBeam', { points: beamPts }, scene);
        beamMesh.color = B().Color3.FromHexString('#7ae0a0');
      }
      particle.position.set(sim.bx, 1.8 + sim.by * 0.35, 0);
      if (sim.bx > 5.8) {
        // 새 전자
        sim.bx = -5.6; sim.by = 0; sim.bvy = 0;
        beamPts = [];
      }
      return true;
    }

    if (state.mode === 'circle') {
      // 정확한 회전: ω = qB/m (부호 포함), 속도 벡터를 회전시킨다
      const w = state.q * state.Bf / state.m;
      const th = w * dt;
      const c = Math.cos(th), s = Math.sin(th);
      const vx = sim.vx * c - sim.vz * s;
      const vz = sim.vx * s + sim.vz * c;
      sim.vx = vx; sim.vz = vz;
      sim.x += sim.vx * dt; sim.z += sim.vz * dt;
      sim.y += sim.vy * dt;                       // 나선의 축 방향 (B 와 나란한 성분)
      if (sim.y > 9) sim.y = -0;                  // 너무 올라가면 리셋
      // 주기 측정: 각도 누적
      const ang = Math.atan2(sim.z, sim.x);
      if (sim.thPrev != null) {
        let dth = ang - sim.thPrev;
        if (dth > Math.PI) dth -= 2 * Math.PI;
        if (dth < -Math.PI) dth += 2 * Math.PI;
        sim.revs += Math.abs(dth) / (2 * Math.PI);
        if (sim.revs >= 1 && !sim.Tm) sim.Tm = sim.t;
      }
      sim.thPrev = ang;
      if (Math.floor(sim.t * 30) % 2 === 0) {
        addTrail(sim.x, sim.y, sim.z, state.q > 0 ? '#ffd84a' : '#7ae0a0');
      }
      layout();
      return true;
    }

    // 사이클로트론: 갭(x≈0 지날 때)마다 속력 증가
    const w2 = state.q * state.Bf / state.m;
    const th2 = w2 * dt;
    const c2 = Math.cos(th2), s2 = Math.sin(th2);
    const px = sim.x;
    const vx2 = sim.vx * c2 - sim.vz * s2;
    const vz2 = sim.vx * s2 + sim.vz * c2;
    sim.vx = vx2; sim.vz = vz2;
    sim.x += sim.vx * dt; sim.z += sim.vz * dt;
    // 갭 통과 (x 부호 바뀜) → 가속
    if (px * sim.x < 0) {
      const sp = Math.hypot(sim.vx, sim.vz) + 0.55;
      const n = Math.hypot(sim.vx, sim.vz);
      sim.vx *= sp / n; sim.vz *= sp / n;
      sim.gapCount += 1;
    }
    if (Math.hypot(sim.x, sim.z) > 8) {
      sim.done = true;
      state.running = false;
      const btn = document.querySelector('#runBtn');
      if (btn) { btn.textContent = '▶ 발사'; btn.classList.remove('run'); }
    }
    if (Math.floor(sim.t * 30) % 2 === 0) addTrail(sim.x, 0, sim.z, '#ffd84a');
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
    camera.beta = state.mode === 'crookes' ? 1.35 : 0.62;
    camera.radius = 26;
    camera.setTarget(new (B().Vector3)(0, state.mode === 'crookes' ? 1.8 : 0, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '속력을 2배로 해 보세요 — 반지름은 2배가 되지만 한 바퀴 도는 시간(주기)은 변하지 않습니다!';
  const prepGuide = '점선 자리에 자기장 코일·입자 발사기·음극선관·말굽자석을 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'crookes', t: '음극선관 (24쪽)' },
      { v: 'circle', t: '원운동 · 나선' },
      { v: 'cyclo', t: '사이클로트론 (26쪽)' },
    ], state.mode, 1);

    if (state.mode === 'crookes') {
      return `
        ${modeBtns}
        ${LabUI.opts('말굽자석', 'magnetDir', [
          { v: 'none', t: '자석 없음' }, { v: 'up', t: 'N극이 위' },
          { v: 'down', t: 'N극이 아래' }, { v: 'along', t: 'B ∥ 속도' },
        ], state.magnetDir, 2)}
        <div class="control">
          <div class="clabel">음극선</div>
          <button class="power" id="runBtn">▶ 켜기</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    if (state.mode === 'circle') {
      return `
        ${modeBtns}
        ${LabUI.opts('전하 <i>q</i>', 'q', [
          { v: 1, t: '+1' }, { v: -1, t: '−1' },
        ], state.q, 1)}
        ${LabUI.opts('질량 <i>m</i>', 'm', [
          { v: 1, t: '1' }, { v: 2, t: '2' },
        ], state.m, 1)}
        ${LabUI.slider('v0', '속력 <i>v</i>',
          { min: 1, max: 6, step: 0.5, value: state.v0, fmt: (v) => `${(+v).toFixed(1)}` })}
        ${LabUI.slider('Bf', '자기장 <i>B</i>',
          { min: 0.5, max: 2, step: 0.1, value: state.Bf, fmt: (v) => `${(+v).toFixed(1)}` })}
        ${LabUI.slider('pitch', '발사각<br>(B 와의 각)',
          { min: 30, max: 90, step: 5, value: state.pitch, fmt: (v) => `${v}°` })}
        <div class="control">
          <div class="clabel">발사</div>
          <button class="power" id="runBtn">▶ 발사</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.slider('Bf', '자기장 <i>B</i>',
        { min: 0.5, max: 2, step: 0.1, value: state.Bf, fmt: (v) => `${(+v).toFixed(1)}` })}
      <div class="control">
        <div class="clabel">발사</div>
        <button class="power" id="runBtn">▶ 발사</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.getAttribute('data-mode');
      reset();
      resetCamera();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    const after = () => { reset(); onChange(); };
    if (state.mode === 'crookes') {
      LabUI.bindOpts(root, 'magnetDir', state, 'magnetDir', () => { layout(); onChange(); }, String);
    } else if (state.mode === 'circle') {
      LabUI.bindOpts(root, 'q', state, 'q', after);
      LabUI.bindOpts(root, 'm', state, 'm', after);
      LabUI.bindSlider(root, 'v0', state, 'v0', (v) => `${(+v).toFixed(1)}`, after);
      LabUI.bindSlider(root, 'Bf', state, 'Bf', (v) => `${(+v).toFixed(1)}`, after);
      LabUI.bindSlider(root, 'pitch', state, 'pitch', (v) => `${v}°`, after);
    } else {
      LabUI.bindSlider(root, 'Bf', state, 'Bf', (v) => `${(+v).toFixed(1)}`, after);
    }
    const run = root.querySelector('#runBtn');
    const labels = { crookes: '▶ 켜기', circle: '▶ 발사', cyclo: '▶ 발사' };
    run.addEventListener('click', () => {
      if (state.mode !== 'crookes' && sim.done) reset();
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
    if (state.mode === 'crookes') {
      const desc = {
        none: '자기장이 없으면 음극선(전자 흐름)은 직진합니다.',
        up: '전자가 자기장 속을 지나며 로런츠 힘을 받아 <b>위로</b> 휩니다.',
        down: '자석을 뒤집으면 자기장 방향이 반대가 되어 <b>아래로</b> 휩니다.',
        along: '자기장이 속도와 <b>나란</b>하면 로런츠 힘이 0 — 직진합니다!',
      };
      return `
        <div class="row"><span>말굽자석</span><b>${{
          none: '없음', up: 'N극이 위', down: 'N극이 아래', along: 'B ∥ v',
        }[state.magnetDir]}</b></div>
        <div class="row"><span>음극선의 경로</span>
          <b class="big">${state.magnetDir === 'up' ? '위로 휨' : state.magnetDir === 'down' ? '아래로 휨' : '직진'}</b></div>
        <div class="formula">${desc[state.magnetDir]}<br>
          로런츠 힘의 조건: <b>①전하가 있고 ②움직이며 ③자기장과 나란하지 않을 것</b>.</div>`;
    }
    if (state.mode === 'circle') {
      const r = radius();
      const T = period();
      const helix = state.pitch < 88;
      return `
        <div class="row"><span>전하 / 질량</span><b>q = ${state.q > 0 ? '+' : ''}${state.q}, m = ${state.m}</b></div>
        <div class="row"><span>속력 <i>v</i> / 자기장 <i>B</i></span><b>${state.v0.toFixed(1)} / ${state.Bf.toFixed(1)}</b></div>
        <div class="row"><span>발사각</span><b>${state.pitch}° ${helix ? '(나선!)' : '(원운동)'}</b></div>
        <div class="sec">이론값</div>
        <div class="row"><span>반지름 <i>r</i> = <i>mv</i>⊥/<i>qB</i></span><b class="big">${r.toFixed(2)}</b></div>
        <div class="row"><span>주기 <i>T</i> = 2π<i>m</i>/<i>qB</i></span><b class="big">${T.toFixed(2)} s</b></div>
        <div class="row"><span>주기 측정 (한 바퀴)</span>
          <b>${sim.Tm ? sim.Tm.toFixed(2) + ' s' : state.running ? '측정 중…' : '—'}</b></div>
        <div class="formula"><b>주기는 속력과 무관!</b> v 를 2배로 하면 r 만 2배가 되고 T 는 그대로입니다
          (확인 06). ${helix ? 'B 와 나란한 속도 성분은 힘을 받지 않아 <b>나선 운동</b>이 됩니다 — 밴앨런대의 전하가 이렇게 움직입니다 (27쪽).' : ''}</div>`;
    }
    const sp = Math.hypot(sim.vx, sim.vz);
    return `
      <div class="row"><span>갭 통과 횟수</span><b>${sim.gapCount}회</b></div>
      <div class="row"><span>현재 속력</span><b class="big">${sp.toFixed(2)}</b></div>
      <div class="row"><span>현재 반지름 <i>r</i> = <i>mv</i>/<i>qB</i></span>
        <b>${(state.m * sp / (Math.abs(state.q) * state.Bf)).toFixed(2)}</b></div>
      <div class="row"><span>회전 주기 <i>T</i> = 2π<i>m</i>/<i>qB</i></span>
        <b>${period().toFixed(2)} s (일정!)</b></div>
      <div class="formula">두 D 전극 사이를 지날 때마다 교류 전압으로 가속 —
        속력이 커질수록 반지름이 커져 <b>나선</b>을 그리며 밖으로 나갑니다.
        주기가 속력과 무관하므로 <b>일정한 진동수의 교류</b>로 계속 가속할 수 있습니다.
        ${sim.done ? '<br><b style="color:#ffd84a">🚀 입자가 최고 속력으로 방출되었습니다!</b>' : ''}</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '반지름과 주기';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 42, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;

    if (state.mode === 'crookes') {
      // 오른손 규칙 그림
      ctx.fillStyle = '#9fb0c2'; ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const cx = W2 / 2, cy = H2 / 2;
      ctx.fillText('오른손 규칙 (양전하 기준)', cx, padT + 4);
      ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - 70, cy + 20); ctx.lineTo(cx + 40, cy + 20); ctx.stroke();
      ctx.fillStyle = '#5ad0f0'; ctx.fillText('속도 v →', cx - 16, cy + 36);
      ctx.strokeStyle = '#69d98c';
      ctx.beginPath(); ctx.moveTo(cx - 20, cy + 20); ctx.lineTo(cx - 20, cy - 34); ctx.stroke();
      ctx.fillStyle = '#69d98c'; ctx.fillText('힘 F ↑', cx - 52, cy - 24);
      ctx.fillStyle = '#e8577a';
      ctx.fillText('자기장 B — 화면 안쪽 ×', cx, cy + 62);
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.fillText('전자(−)는 반대 방향으로 힘을 받습니다', cx, cy + 80);
      return;
    }

    // r–v 그래프 (직선) + T–v (수평선): 주기 불변의 시각화
    const VMAX = 6.2;
    const xOf = (v) => padL + (v / VMAX) * gw;
    const yOfR = (r) => padT + gh - (r / 13) * gh;
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOfR(0));
    ctx.lineTo(xOf(VMAX), yOfR(state.m * VMAX / (Math.abs(state.q) * state.Bf)));
    ctx.stroke();
    // 주기 수평선 (T 축은 오른쪽 개념으로 같은 캔버스에)
    const T = period();
    const yT = padT + gh - (T / 16) * gh;
    ctx.strokeStyle = '#69d98c';
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(padL, yT); ctx.lineTo(padL + gw, yT); ctx.stroke();
    ctx.setLineDash([]);
    // 현재 점
    const vNow = state.mode === 'cyclo' && sim ? Math.hypot(sim.vx, sim.vz) : state.v0;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(xOf(Math.min(vNow, VMAX)), yOfR(state.m * Math.min(vNow, VMAX) / (Math.abs(state.q) * state.Bf)), 4.5, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#ffd84a'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('r = mv/qB (v 에 비례)', padL + 6, padT + 2);
    ctx.fillStyle = '#69d98c';
    ctx.fillText('T = 2πm/qB (v 와 무관)', padL + 6, padT + 14);
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('속력 v →', W2 - 4, padT + gh + 4);
  }

  function graphFootHTML() {
    if (state.mode === 'crookes') {
      return '엄지 = (+)전하의 속도, 네 손가락 = 자기장, 손바닥 = 힘 — <b>전자는 반대</b>';
    }
    return '노란 직선(r ∝ v)과 초록 수평선(T 일정) — 사이클로트론이 일정한 진동수로 작동하는 까닭';
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '실험', '조건', '<i>r</i>', '<i>T</i> (s)', '관찰',
  ];

  function recordRow() {
    if (state.mode === 'crookes') {
      return [['음극선관', { none: '자석 없음', up: 'N 위', down: 'N 아래', along: 'B∥v' }[state.magnetDir],
        '—', '—', state.magnetDir === 'up' ? '위로 휨' : state.magnetDir === 'down' ? '아래로 휨' : '직진']];
    }
    if (state.mode === 'circle') {
      return [['원운동', `q=${state.q}, m=${state.m}, v=${state.v0}, B=${state.Bf}`,
        radius().toFixed(2), period().toFixed(2),
        state.pitch < 88 ? '나선 운동' : (state.q > 0 ? '반시계' : '시계') + ' 원운동']];
    }
    const sp = Math.hypot(sim.vx, sim.vz);
    return [['사이클로트론', `B=${state.Bf}, 갭 ${sim.gapCount}회`,
      (state.m * sp / (Math.abs(state.q) * state.Bf)).toFixed(2), period().toFixed(2),
      `속력 ${sp.toFixed(2)} 로 가속됨`]];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 음극선 휘게 하기 · 1 자기장 나란할 때 직진 · 2 원운동 반지름 바꾸기
     3 나선 운동 · 4 사이클로트론 가속                                      */
  const mis = { bend: {}, along: false, radii: {}, helix: false, cyclo: 0 };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'crookes') {
      if (state.magnetDir === 'up' || state.magnetDir === 'down') mis.bend[state.magnetDir] = true;
      if (state.magnetDir === 'along') mis.along = true;
    }
    if (state.mode === 'circle' && state.running) {
      if (state.pitch >= 88) mis.radii[radius().toFixed(2)] = true;
      else mis.helix = true;
    }
    if (state.mode === 'cyclo' && sim) mis.cyclo = Math.max(mis.cyclo, sim.gapCount || 0);

    if (i === 0) return Object.keys(mis.bend).length >= 1;
    if (i === 1) return mis.along;
    if (i === 2) return Object.keys(mis.radii).length >= 2;
    if (i === 3) return mis.helix;
    if (i === 4) return mis.cyclo >= 4;
    return false;
  }

  return {
    missionDone,
    id: 'lorentz',
    title: '하전 입자 놀이터 — 로런츠 힘 샌드박스',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, radius, period,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
