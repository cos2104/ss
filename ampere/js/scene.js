/**
 * 직선 전류에 의한 자기장 관찰하기
 * 비상교육 고등 물리학 II-2-02 (교과서 98~103쪽), 해 보기 98쪽
 *
 * 도선 주위에 나침반을 놓고 전류를 흘려 자기장의 방향과 세기를 관찰한다.
 * 전류의 방향·세기와 도선까지의 거리를 바꾸면 나침반 바늘이 실제로 돌아간다.
 */
const AmpereScene = (() => {
  const B = () => BABYLON;

  const MU0_2PI = 2e-7;     // μ0 / 2π
  const U = 8;              // 1 m = 8 unit (실제로는 cm 단위로 다룬다)
  const WIRE_Y = 1.6;

  let scene, camera;
  let wire, compasses = [], fieldPlane, fieldTex, ringGroup = null;
  let placed = {};

  const state = {
    current: 5,        // A
    dir: 1,            // +1 : 화면 오른쪽(+x), −1 : 왼쪽
    on: false,       // 처음에는 스위치가 열려 있다 (나침반은 북쪽)
    showRings: true,
  };

  const FIELD_N = 190;
  const SPAN = 0.6;         // 표시 영역 반폭 (m)

  const tools = [
    { id: 'wire', label: '도선 · 전원 장치', icon: 'wire' },
    { id: 'compass', label: '나침반', icon: 'galvano' },
    { id: 'board', label: '자기장 관찰 장치', icon: 'screenBoard' },
  ];

  const slots = {
    wire: { name: '도선' },
    compass: { name: '나침반' },
    board: { name: '관찰 장치' },
  };

  // 나침반을 놓는 자리 (도선에서의 거리, m)
  const COMPASS_POS = [
    { x: -0.34, z: 0 }, { x: 0.34, z: 0 },
    { x: 0, z: -0.22 }, { x: 0, z: 0.22 },
    { x: -0.2, z: -0.2 }, { x: 0.2, z: 0.2 },
  ];

  /* ══ 물리 ═══════════════════════════════════ */
  /** 직선 전류에서 거리 r 만큼 떨어진 곳의 자기장 세기 B = μ0 I / (2πr) */
  function fieldAt(r) {
    if (!state.on || r < 1e-4) return 0;
    return MU0_2PI * state.current / r;
  }

  /**
   * 도선이 z 축(앞뒤) 방향으로 놓여 있고 전류가 +z 로 흐를 때,
   * 오른손 법칙에 따라 자기장은 도선을 감아 도는 방향이 된다.
   * 위에서 볼 때 (x, z) 지점에서의 자기장 방향 (x, z 성분).
   */
  function fieldVec(x, z) {
    const r = Math.hypot(x, z);
    if (r < 1e-4) return { bx: 0, bz: 0, mag: 0 };
    const mag = fieldAt(r);
    // 전류가 +z 로 흐르면 B 는 (−z, +x) 방향으로 회전 (오른손 법칙)
    const s = state.dir;
    return { bx: mag * (-z / r) * s, bz: mag * (x / r) * s, mag };
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#141c26ff');

    camera = new (B().ArcRotateCamera)(
      'camAm', -Math.PI / 2, 0.58, 15, new (B().Vector3)(0, 0.6, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 32;
    camera.upperBetaLimit = 1.44;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('ham', new (B().Vector3)(0, 1, -0.25), scene);
    hemi.intensity = 0.88;
    hemi.groundColor = new (B().Color3)(0.24, 0.27, 0.33);

    const glow = new (B().GlowLayer)('glowAm', scene);
    glow.intensity = 0.55;

    buildBoard();
    buildWire();
    buildSupply();
    buildCompasses();
    buildStepper();
    setupPointer(canvas);

    glow.addExcludedMesh(fieldPlane);
    glow.addExcludedMesh(meterPlane);
    buildPlaceholders();
    // 상시 바닥 — 도구를 놓기 전에도 기본 배경이 보인다
    const __base = B().MeshBuilder.CreateGround('amBase', { width: 24, height: 16 }, scene);
    __base.position.y = -0.45;
    const __bm = new (B().StandardMaterial)('amBaseM', scene);
    __bm.diffuseColor = B().Color3.FromHexString('#1c2436');
    __bm.specularColor = new (B().Color3)(0.03, 0.03, 0.05);
    __base.material = __bm;

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/ampere.jpg', { x: -8, y: 0, z: 6, ry: 0.3 });

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

  /** 자기장 세기를 색으로 칠한 관찰판 */
  function buildBoard() {
    fieldPlane = B().MeshBuilder.CreateGround('amBoard',
      { width: SPAN * 2 * U, height: SPAN * 2 * U }, scene);
    fieldPlane.position.y = 0.05;
    fieldTex = new (B().DynamicTexture)('amTex', { width: FIELD_N, height: FIELD_N }, scene, true);
    const m = new (B().StandardMaterial)('amBoardMat', scene);
    m.diffuseTexture = fieldTex;
    m.emissiveTexture = fieldTex;
    m.emissiveColor = new (B().Color3)(0.8, 0.8, 0.8);
    m.specularColor = new (B().Color3)(0, 0, 0);
    fieldPlane.material = m;
  }

  function drawBoard() {
    const ctx = fieldTex.getContext();
    const img = ctx.createImageData(FIELD_N, FIELD_N);
    const maxB = Math.max(1e-9, fieldAt(0.06));

    for (let j = 0; j < FIELD_N; j++) {
      const z = (j / (FIELD_N - 1)) * 2 * SPAN - SPAN;
      for (let i = 0; i < FIELD_N; i++) {
        const x = (i / (FIELD_N - 1)) * 2 * SPAN - SPAN;
        const o = (j * FIELD_N + i) * 4;
        const r = Math.max(0.02, Math.hypot(x, z));
        const t = Math.min(1, fieldAt(r) / maxB);
        img.data[o]     = Math.round(22 + t * 150);
        img.data[o + 1] = Math.round(28 + t * 96);
        img.data[o + 2] = Math.round(38 + t * 20);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    fieldTex.update();
  }

  /** 도선 — 앞뒤(z) 방향으로 세로로 지난다 */
  function buildWire() {
    wire = new (B().TransformNode)('amWire', scene);
    const w = B().MeshBuilder.CreateCylinder('amWireBar',
      { height: SPAN * 2.4 * U, diameter: 0.34, tessellation: 16 }, scene);
    w.rotation.x = Math.PI / 2;
    w.position.set(0, WIRE_Y, 0);
    const wm = new (B().StandardMaterial)('amWireMat', scene);
    wm.diffuseColor = B().Color3.FromHexString('#c0742e');
    wm.emissiveColor = B().Color3.FromHexString('#3a2208');
    wm.specularColor = B().Color3.FromHexString('#ffd9a0');
    wm.specularPower = 64;
    w.material = wm;
    w.parent = wire;
    wire._bar = w;

    // 지지대
    [-1, 1].forEach((s, i) => {
      const post = B().MeshBuilder.CreateBox('amPost' + i, { width: 0.4, height: WIRE_Y, depth: 0.4 }, scene);
      post.position.set(0, WIRE_Y / 2, s * SPAN * 1.05 * U);
      post.material = mat('amPostMat' + i, '#4a5462');
      post.parent = wire;
    });
  }

  /**
   * 전원 장치 — 실험대 왼쪽 앞에 놓인다.
   * 스위치 손잡이, 전류를 나타내는 계기판, 도선의 두 지지대로 이어지는
   * 집게 전선 두 가닥이 달려 있어 실제 회로처럼 한 바퀴 돈다.
   */
  const SUP = { x: -7.0, z: -2.4 };
  let supply, swPivot, swLever, meterPlane, meterTex;
  let leadA, leadB, leadHotMat, leadColdMat;
  const curArrows = [];

  function buildSupply() {
    supply = new (B().TransformNode)('amSupplyG', scene);
    supply.parent = wire;                       // 도선을 놓아야 함께 나타난다
    supply.position.set(SUP.x, 0, SUP.z);

    const body = B().MeshBuilder.CreateBox('amSupply',
      { width: 3.0, height: 1.6, depth: 1.9 }, scene);
    body.position.set(0, 0.8, 0);
    body.material = mat('amSupplyMat', '#39434f', '#93a4ba', 48);
    body.parent = supply;

    // 계기판 — 지금 흐르는 전류를 숫자로 보여 준다
    meterPlane = B().MeshBuilder.CreatePlane('amMeter', { width: 2.1, height: 0.88 }, scene);
    meterPlane.position.set(0, 0.92, -0.98);
    meterTex = new (B().DynamicTexture)('amMeterT', { width: 256, height: 108 }, scene, true);
    const mm = new (B().StandardMaterial)('amMeterM', scene);
    mm.diffuseTexture = meterTex;
    mm.emissiveTexture = meterTex;
    mm.emissiveColor = new (B().Color3)(1, 1, 1);
    mm.specularColor = new (B().Color3)(0, 0, 0);
    mm.backFaceCulling = false;
    meterPlane.material = mm;
    meterPlane.parent = supply;

    // 스위치 — 받침 위의 손잡이를 내리면 회로가 닫힌다
    const swBase = B().MeshBuilder.CreateBox('amSwBase',
      { width: 1.7, height: 0.16, depth: 0.66 }, scene);
    swBase.position.set(0.6, 1.68, 0.5);
    swBase.material = mat('amSwBaseMat', '#1b222c');
    swBase.parent = supply;
    [-0.7, 0.7].forEach((d, i) => {
      const stud = B().MeshBuilder.CreateCylinder('amSwStud' + i,
        { height: 0.2, diameter: 0.3, tessellation: 12 }, scene);
      stud.position.set(0.6 + d, 1.84, 0.5);
      stud.material = mat('amSwStudMat' + i, '#d8b46a', '#fff0c0', 64);
      stud.parent = supply;
    });

    swPivot = new (B().TransformNode)('amSwPivot', scene);
    swPivot.position.set(-0.1, 1.9, 0.5);
    swPivot.parent = supply;
    swLever = B().MeshBuilder.CreateBox('amSwLever',
      { width: 1.4, height: 0.14, depth: 0.26 }, scene);
    swLever.position.set(0.7, 0, 0);
    swLever.material = mat('amSwLeverMat', '#c9a24a', '#fff3c8', 64);
    swLever.parent = swPivot;
    const knob = B().MeshBuilder.CreateSphere('amSwKnob', { diameter: 0.42, segments: 10 }, scene);
    knob.position.set(1.44, 0.04, 0);
    knob.material = mat('amSwKnobMat', '#b8352c', '#ffb0a4', 48);
    knob.parent = swPivot;

    // 집게 전선 — (＋) 쪽이 빨간색이 된다
    leadHotMat = mat('amLeadHot', '#c8392f', '#ff9a90', 32);
    leadColdMat = mat('amLeadCold', '#232a34', '#7c8698', 32);
    const V = (x, y, z) => new (B().Vector3)(x, y, z);
    [-0.85, 0.85].forEach((d, i) => {
      const t = B().MeshBuilder.CreateCylinder('amTerm' + (i ? 'B' : 'A'),
        { height: 0.4, diameter: 0.3, tessellation: 12 }, scene);
      t.position.set(d, 1.78, -0.55);
      t.material = mat('amTermMat' + i, '#d8b46a', '#fff0c0', 64);
      t.parent = supply;
    });
    // 앞쪽 지지대로 가는 짧은 전선
    leadA = B().MeshBuilder.CreateTube('amLeadA', {
      path: [V(-0.85, 1.96, -0.55), V(-0.85, 1.1, -3.2), V(5.2, 0.8, -3.2), V(7.0, 1.55, -2.64)],
      radius: 0.085, tessellation: 8, cap: B().Mesh.CAP_ALL,
    }, scene);
    leadA.parent = supply;
    // 뒤쪽 지지대로 가는 전선 — 관찰판을 피해 바깥으로 돌아간다
    leadB = B().MeshBuilder.CreateTube('amLeadB', {
      path: [V(0.85, 1.96, -0.55), V(0.85, 1.1, -3.9), V(13.0, 0.7, -3.9),
        V(13.0, 0.7, 7.44), V(7.0, 1.55, 7.44)],
      radius: 0.085, tessellation: 8, cap: B().Mesh.CAP_ALL,
    }, scene);
    leadB.parent = supply;

    // 전류의 방향을 나타내는 화살표 — 도선 위에서 흐르는 쪽을 가리킨다
    [-3.2, 0, 3.2].forEach((z, i) => {
      const a = B().MeshBuilder.CreateCylinder('amCurArrow' + i,
        { height: 0.8, diameterTop: 0, diameterBottom: 0.52, tessellation: 12 }, scene);
      a.position.set(0, WIRE_Y, z);
      const am = new (B().StandardMaterial)('amCurArrowM' + i, scene);
      am.diffuseColor = B().Color3.FromHexString('#ffd24a');
      am.emissiveColor = B().Color3.FromHexString('#7a5200');
      am.specularColor = new (B().Color3)(0, 0, 0);
      a.material = am;
      a.parent = wire;
      curArrows.push(a);
    });
  }

  /** 계기판 글씨 — 전류의 세기와 방향을 적는다 */
  function drawMeter() {
    if (!meterTex) return;
    const W = 256, H = 108;
    const c = meterTex.getContext();
    c.fillStyle = '#0d1219';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#2c3a4c'; c.lineWidth = 4;
    c.strokeRect(2, 2, W - 4, H - 4);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = state.on ? '#ffb03a' : '#4a5766';
    c.font = 'bold 42px "Noto Sans KR", sans-serif';
    c.fillText(`${state.on ? state.current.toFixed(1) : '0.0'} A`, W / 2, 40);
    c.fillStyle = state.on ? '#4ad8a0' : '#7b8899';
    c.font = 'bold 21px "Noto Sans KR", sans-serif';
    c.fillText(state.on ? (state.dir > 0 ? 'ON · 앞 → 뒤' : 'ON · 뒤 → 앞') : 'OFF', W / 2, 84);
    meterTex.update();
  }

  /** 나침반 하나 */
  function buildCompass(idx, p) {
    const g = new (B().TransformNode)('cmp' + idx, scene);

    const base = B().MeshBuilder.CreateCylinder('cmpBase' + idx,
      { height: 0.22, diameter: 1.5, tessellation: 24 }, scene);
    base.material = mat('cmpBaseMat' + idx, '#e6ebf2', '#ffffff', 64);
    base.parent = g;

    // 바늘 — N 극(빨강) / S 극(흰색)
    const needle = new (B().TransformNode)('cmpNeedle' + idx, scene);
    const nMat = new (B().StandardMaterial)('cmpNMat' + idx, scene);
    nMat.emissiveColor = B().Color3.FromHexString('#d0453a');
    nMat.disableLighting = true;
    const sMat = new (B().StandardMaterial)('cmpSMat' + idx, scene);
    sMat.emissiveColor = B().Color3.FromHexString('#e8eef6');
    sMat.disableLighting = true;

    const nTip = B().MeshBuilder.CreateCylinder('cmpNTip' + idx,
      { height: 0.6, diameterTop: 0, diameterBottom: 0.22, tessellation: 8 }, scene);
    nTip.rotation.z = -Math.PI / 2;
    nTip.position.set(0.3, 0.16, 0);
    nTip.material = nMat;
    nTip.parent = needle;

    const sTip = B().MeshBuilder.CreateCylinder('cmpSTip' + idx,
      { height: 0.6, diameterTop: 0, diameterBottom: 0.22, tessellation: 8 }, scene);
    sTip.rotation.z = Math.PI / 2;
    sTip.position.set(-0.3, 0.16, 0);
    sTip.material = sMat;
    sTip.parent = needle;

    needle.parent = g;
    g._needle = needle;
    g._pos = p;
    g.position.set(p.x * U, 0.12, p.z * U);
    return g;
  }

  function buildCompasses() {
    COMPASS_POS.forEach((p, i) => compasses.push(buildCompass(i, p)));
  }

  /** 자기력선(동심원) */
  function drawRings() {
    if (ringGroup) { ringGroup.dispose(); ringGroup = null; }
    if (!state.showRings || !state.on || !placed.wire) return;

    const lines = [];
    [0.12, 0.2, 0.3, 0.42, 0.55].forEach((r) => {
      const pts = [];
      const n = 46;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(new (B().Vector3)(Math.cos(a) * r * U, 0.4, Math.sin(a) * r * U));
      }
      lines.push(pts);
    });
    ringGroup = B().MeshBuilder.CreateLineSystem('amRings', { lines }, scene);
    ringGroup.color = B().Color3.FromHexString('#8fd8ff');
    ringGroup.alpha = 0.55;
    ringGroup.isPickable = false;
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      board: { x: 0, z: 0, w: SPAN * 2 * U, h: SPAN * 2 * U, label: '관찰 장치' },
      wire: { x: 0, z: 0, w: 1.6, h: SPAN * 2.2 * U, label: '도선' },
      compass: { x: 0, z: 0, w: SPAN * 1.5 * U, h: SPAN * 1.5 * U, label: '나침반' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.06 + (id === 'wire' ? 0.02 : id === 'compass' ? 0.04 : 0), c.z);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: false, color: '#5aa9ff' });
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
    fieldPlane.setEnabled(!!placed.board);
    wire.setEnabled(!!placed.wire);
    // 나침반은 관찰판 없이도 자기 자리에 보인다
    compasses.forEach((c) => c.setEnabled(!!placed.compass));
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const r = Math.hypot(point.x, point.z) / U;
    if (id === 'wire') return Math.abs(point.x / U) <= 0.16 ? 'ok' : 'wrong';
    return r <= SPAN * 1.05 ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;

    // 도선 색 — 전류가 흐르면 달아오른다
    const hot = state.on ? Math.min(0.7, state.current / 12) : 0;
    wire._bar.material.emissiveColor = new (B().Color3)(0.14 + hot, 0.09 + hot * 0.5, 0.03);

    // 스위치 손잡이 — 내려 붙이면 «닫힘(ON)», 들어 올리면 «열림(OFF)»
    if (swPivot) swPivot.rotation.z = state.on ? 0 : 0.6;
    if (swLever) swLever.material.emissiveColor = state.on
      ? B().Color3.FromHexString('#4a3200') : new (B().Color3)(0, 0, 0);

    // 집게 전선 — 전류가 들어가는 (＋) 쪽이 빨간색이 된다
    if (leadA && leadB) {
      leadA.material = state.dir > 0 ? leadHotMat : leadColdMat;
      leadB.material = state.dir > 0 ? leadColdMat : leadHotMat;
    }

    // 전류 방향 화살표 — 전류가 흐를 때만 보이고 방향을 따라 돈다
    curArrows.forEach((a) => {
      a.setEnabled(state.on);
      a.rotation.x = state.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    });

    // 3D 의 ＋ / － 단추 자리 — 전원 장치 위에 띄운다
    if (stepI) {
      // 전원 장치 «위쪽 빈 곳»에 띄운다 (칼날 스위치·계기판을 가리지 않게)
      stepI.place(SUP.x + 1.2, 5.2, SUP.z - 0.6, 0.95);
      stepI.setEnabled(allPlaced());
    }
    drawMeter();

    // 나침반 바늘 방향 — 바늘 N 극이 그 지점의 자기장 방향(도선을 감는 동심원의 접선)을 향한다.
    // Babylon 에서 yaw α 일 때 로컬 +x 축은 (cosα, −sinα) 를 향하므로 α = atan2(−bz, bx).
    compasses.forEach((g) => {
      const p = g._pos;
      const f = fieldVec(p.x, p.z);
      // 자기장이 약하면 지구 자기장(+z 쪽 = 북쪽)이 이긴다
      const earth = 2e-5;
      const bx = f.bx, bz = f.bz + earth;
      g._needle.rotation.y = Math.atan2(-bz, bx);
    });

    drawBoard();
    drawRings();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = 0.58;
    camera.radius = 15;
    camera.setTarget(new (B().Vector3)(0, 0.6, 0));
  }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     · 전원 장치의 «스위치 손잡이»를 누르면 전류가 켜지고 꺼진다
     · 전원 장치 위의 «＋ / －» 로 전류의 세기를 바꾼다
     · «집게 전선»(또는 도선 위의 화살표)을 누르면 전선을 바꿔 끼운 것처럼
       전류의 방향이 뒤집힌다
     · «나침반»을 끌어 도선에서 멀거나 가깝게 옮긴다                     */
  let stepI = null;
  let drag = null;                  // 끌고 있는 나침반
  let onChangeCb = null;

  function buildStepper() { stepI = LabUI.makeStepper(scene, 'Cur'); }

  /** 3D 에서 바꾼 값을 아래쪽 조작 막대에도 그대로 비춘다 */
  function syncPanel() {
    const sl = document.querySelector('#current');
    if (sl) sl.value = state.current;
    const out = document.querySelector('#currentOut');
    if (out) out.textContent = `${state.current.toFixed(1)} A`;
    const on = document.querySelector('#onBtn');
    if (on) {
      on.textContent = state.on ? 'ON' : 'OFF';
      on.classList.toggle('off', !state.on);
    }
    document.querySelectorAll('[data-dir]').forEach((b) => {
      b.classList.toggle('on', parseFloat(b.getAttribute('data-dir')) === state.dir);
    });
  }

  function hint(text, ok) {
    if (typeof Lab !== 'undefined' && Lab.showHint) Lab.showHint(text, ok);
  }

  /**
   * 조작한 뒤 — 장면과 아래쪽 막대·측정값을 함께 갱신한다.
   * onChangeCb(= Lab.refresh) 가 이미 update() 를 부르므로 여기서 또 부르지 않는다.
   * (관찰판 190×190 을 두 번 그리면 느린 기기에서 끌기가 무거워진다)
   */
  function after() {
    syncPanel();
    if (onChangeCb) onChangeCb();
    else update();                              // 아직 컨트롤을 묶기 전이면 직접
  }

  function toggleSwitch() {
    state.on = !state.on;
    after();
    hint(state.on ? '스위치를 닫았습니다 — 전류가 흐릅니다'
      : '스위치를 열었습니다 — 나침반이 다시 북쪽을 가리킵니다', state.on);
  }

  function reverseDir() {
    state.dir = -state.dir;
    after();
    hint(state.dir > 0 ? '전류가 앞 → 뒤로 흐릅니다' : '전류가 뒤 → 앞으로 흐릅니다', true);
  }

  /** 전류의 세기 — 아래쪽 슬라이더와 같은 범위(0.5 ~ 12 A, 0.5 A 눈금) */
  function bumpCurrent(d) {
    state.current = Math.max(0.5, Math.min(12, +(state.current + d * 0.5).toFixed(1)));
    after();
  }

  /** 이름으로 어느 나침반을 집었는지 찾는다 */
  function compassOf(name) {
    const m = /^cmp(?:Base|NTip|STip)(\d+)$/.exec(name || '');
    return m ? compasses[+m[1]] : null;
  }

  /** 화면 위의 한 점을 나침반이 놓인 높이의 평면 위 좌표로 바꾼다 */
  function pointerOnBoard() {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(
      new (B().Vector3)(0, 0.12, 0), new (B().Vector3)(0, 1, 0));
    const d = ray.intersectsPlane(plane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d));
  }

  /**
   * 나침반을 옮긴다 (단위 m).
   * g._pos 는 COMPASS_POS 의 원소를 그대로 가리키므로, 옮기면 그래프의
   * «나침반이 놓인 거리» 표시도 함께 따라온다.
   */
  function moveCompass(g, x, z) {
    const LIM = SPAN * 0.95;                    // 관찰판을 벗어나지 않는다
    let nx = Math.max(-LIM, Math.min(LIM, x));
    let nz = Math.max(-LIM, Math.min(LIM, z));
    const r = Math.hypot(nx, nz);
    const MIN = 0.05;                           // 도선 바로 밑에는 놓을 수 없다
    if (r < MIN) {
      if (r < 1e-6) { nx = MIN; nz = 0; }
      else { nx = nx / r * MIN; nz = nz / r * MIN; }
    }
    nx = +nx.toFixed(4);
    nz = +nz.toFixed(4);
    if (nx === g._pos.x && nz === g._pos.z) return;   // 제자리면 다시 그리지 않는다
    g._pos.x = nx;
    g._pos.z = nz;
    g.position.set(nx * U, 0.12, nz * U);
    if (onChangeCb) onChangeCb();               // Lab.refresh → update() 한 번만
    else update();
  }

  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const picked = pi.pickInfo && pi.pickInfo.pickedMesh;
      const nm = picked ? picked.name : '';

      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced()) return;               // 배치가 끝나야 조작할 수 있다
        if (nm === 'btnAddCur') { bumpCurrent(+1); return; }
        if (nm === 'btnSubCur') { bumpCurrent(-1); return; }
        if (/^amSw/.test(nm)) { toggleSwitch(); return; }
        if (/^(amLead|amTerm|amCurArrow)/.test(nm)) { reverseDir(); return; }
        const g = compassOf(nm);
        if (g) {
          drag = g;
          camera.detachControl();
        }
      } else if (pi.type === T.POINTERMOVE && drag) {
        const p = pointerOnBoard();
        if (!p) return;
        moveCompass(drag, p.x / U, p.z / U);
      } else if (pi.type === T.POINTERUP && drag) {
        const r = Math.hypot(drag._pos.x, drag._pos.z);
        drag = null;
        camera.attachControl(canvas, true);
        hint(`도선에서 ${(r * 100).toFixed(1)} cm 떨어진 곳입니다`, true);
      }
    });
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '전원 장치의 스위치를 눌러 전류를 흘리고, 전류의 방향과 세기를 바꾸며 나침반 바늘이 어떻게 도는지 관찰하세요. 나침반을 끌어 옮기면 거리에 따른 변화도 볼 수 있습니다.';
  const prepGuide = '점선으로 표시된 자리에 관찰 장치·도선·나침반을 끌어다 놓으세요.';

  function controlsHTML() {
    return `
      ${LabUI.slider('current', '전류의<br>세기 <i>I</i>',
        { min: 0.5, max: 12, step: 0.5, value: state.current, fmt: (v) => `${v.toFixed(1)} A` })}
      ${LabUI.opts('전류의<br>방향', 'dir', [
        { v: 1, t: '앞 → 뒤' },
        { v: -1, t: '뒤 → 앞' },
      ], state.dir, 1)}
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          전원 장치의 <b>스위치 손잡이를 눌러</b> 전류를 켜고 끕니다.
          위쪽 <b>＋ · －</b> 로 전류의 세기를, <b>집게 전선이나 화살표를 눌러</b>
          전류의 방향을 바꿉니다. <b>나침반은 끌어서</b> 옮길 수 있습니다.
        </p></div>
      </div>
      <div class="control">
        <div class="clabel">전원</div>
        <button class="power${state.on ? '' : ' off'}" id="onBtn">${state.on ? 'ON' : 'OFF'}</button>
      </div>
      <div class="control">
        <div class="clabel">자기<br>력선</div>
        <div class="cbody"><div class="opt-grid one-row">
          <button class="opt${state.showRings ? ' on' : ''}" id="ringBtn">동심원 보기</button>
        </div></div>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록
    LabUI.bindSlider(root, 'current', state, 'current', (v) => `${v.toFixed(1)} A`, onChange);
    LabUI.bindOpts(root, 'dir', state, 'dir', onChange);

    const on = root.querySelector('#onBtn');
    on.addEventListener('click', () => {
      state.on = !state.on;
      on.textContent = state.on ? 'ON' : 'OFF';
      on.classList.toggle('off', !state.on);
      onChange();
    });
    const ring = root.querySelector('#ringBtn');
    ring.addEventListener('click', () => {
      state.showRings = !state.showRings;
      ring.classList.toggle('on', state.showRings);
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const rs = [0.05, 0.10, 0.20];
    const rows = rs.map((r) =>
      `<div class="row"><span>${(r * 100).toFixed(0)} cm 에서</span>
        <b>${(fieldAt(r) * 1e6).toFixed(2)} μT</b></div>`).join('');

    return `
      <div class="row"><span>전류 <i>I</i></span>
        <b>${state.on ? `${state.current.toFixed(1)} A` : '0 A (꺼짐)'}</b></div>
      <div class="row"><span>전류의 방향</span><b>${state.dir > 0 ? '앞 → 뒤' : '뒤 → 앞'}</b></div>
      <div class="row"><span>자기장의 방향</span>
        <b>${state.dir > 0 ? '시계 방향' : '반시계 방향'}</b></div>

      <div class="sec">도선에서 떨어진 거리별 자기장</div>
      ${rows}
      <div class="row"><span>지구 자기장</span><b>약 50 μT</b></div>
      <div class="formula"><i>B</i> = <i>μ</i><sub>0</sub><i>I</i> / (2π<i>r</i>)
        &nbsp;→&nbsp; <i>I</i> 에 비례, <i>r</i> 에 반비례</div>
      <div class="formula" style="color:#62718a">
        오른손 엄지를 전류 방향으로 하면 나머지 네 손가락이 자기장 방향입니다.</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '도선에서의 거리에 따른 자기장';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const padL = 44, padR = 12, padT = 16, padB = 24;
    const gw = W - padL - padR, gh = H - padT - padB;
    const R_MAX = 0.5;
    const bMax = Math.max(1e-9, MU0_2PI * 12 / 0.03);
    const xOf = (r) => padL + (r / R_MAX) * gw;
    const yOf = (b) => padT + gh - Math.min(1, b / bMax) * gh;

    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 1;
    for (let r = 0.1; r <= R_MAX; r += 0.1) {
      ctx.beginPath(); ctx.moveTo(xOf(r), padT); ctx.lineTo(xOf(r), padT + gh); ctx.stroke();
    }

    // 여러 전류 세기의 비교선
    [2, 5, 10].forEach((I) => {
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let px = 0; px <= gw; px++) {
        const r = Math.max(0.03, (px / gw) * R_MAX);
        const y = yOf(MU0_2PI * I / r);
        px === 0 ? ctx.moveTo(padL + px, y) : ctx.lineTo(padL + px, y);
      }
      ctx.stroke();
    });

    // 현재 전류
    ctx.strokeStyle = '#ffb03a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let px = 0; px <= gw; px++) {
      const r = Math.max(0.03, (px / gw) * R_MAX);
      const y = yOf(fieldAt(r));
      px === 0 ? ctx.moveTo(padL + px, y) : ctx.lineTo(padL + px, y);
    }
    ctx.stroke();

    // 나침반이 놓인 거리
    ctx.fillStyle = '#4ad8a0';
    [...new Set(COMPASS_POS.map((p) => +Math.hypot(p.x, p.z).toFixed(3)))].forEach((r) => {
      if (r > R_MAX) return;
      ctx.beginPath(); ctx.arc(xOf(r), yOf(fieldAt(r)), 3.4, 0, 7); ctx.fill();
    });

    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();

    ctx.fillStyle = '#9fb0c2';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let r = 0; r <= R_MAX; r += 0.1) ctx.fillText(`${(r * 100).toFixed(0)}`, xOf(r), padT + gh + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('거리 (cm)', W - 4, padT + gh + 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffb03a';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('자기장 B (μT)', padL + 4, padT + 2);
  }

  function graphFootHTML() {
    return `<i>B</i> ∝ <i>I</i>/<i>r</i> — 전류가 2배면 자기장도 2배,
      거리가 2배면 자기장은 <b>절반</b>이 됩니다 (거리의 <b>제곱</b>이 아닙니다)`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '전류 <i>I</i> (A)', '방향', '5 cm (μT)', '10 cm (μT)', '20 cm (μT)', '바늘의 방향',
  ];

  function recordRow() {
    return [
      state.on ? state.current.toFixed(1) : '0',
      state.dir > 0 ? '앞→뒤' : '뒤→앞',
      (fieldAt(0.05) * 1e6).toFixed(2),
      (fieldAt(0.10) * 1e6).toFixed(2),
      (fieldAt(0.20) * 1e6).toFixed(2),
      !state.on ? '북쪽 (지구 자기장)' : state.dir > 0 ? '시계 방향' : '반시계 방향',
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 전류를 흘려 나침반 돌리기 · 1 방향 반대로 · 2 전류 2배 기록
     3 거리에 따른 세기 기록 · 4 전류를 끄고 북쪽 확인                     */
  const mis = { on: false, dirs: {}, offAfterOn: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.on && state.current > 0) { mis.on = true; mis.dirs[state.dir] = true; }
    else if (mis.on) mis.offAfterOn = true;

    if (i === 0) return mis.on;
    if (i === 1) return Object.keys(mis.dirs).length >= 2;
    if (i === 2) {
      const rs = recs().filter((r) => parseFloat(r[0]) > 0);
      for (let a = 0; a < rs.length; a++) {
        for (let b = 0; b < rs.length; b++) {
          if (a !== b && Math.abs(parseFloat(rs[b][0]) - 2 * parseFloat(rs[a][0])) < 0.06) return true;
        }
      }
      return false;
    }
    if (i === 3) return recs().length >= 2;
    if (i === 4) return mis.offAfterOn;
    return false;
  }

  return {
    missionDone,
    id: 'ampere',
    title: '직선 전류에 의한 자기장 관찰하기',
    guide, prepGuide, tools,
    create, update, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, fieldAt, fieldVec,
    get scene() { return scene; },
  };
})();
