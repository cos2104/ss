/**
 * 전자기 유도 — 흔들면 불이 켜지는 손전등 관찰하기
 * 비상교육 고등 물리학 II-2-03 (교과서 104~109쪽), 해보기 104쪽
 *
 * 자석을 코일에 넣고 뺄 때 자기 선속이 변해 유도 전류가 흐른다.
 * 자석을 직접 끌어 움직이거나 «자동 흔들기» 로 손전등처럼 왕복시킬 수 있다.
 * 렌츠 법칙에 따라 전류의 방향이 뒤집히는 것을 검류계 바늘로 보여 준다.
 */
const InductionScene = (() => {
  const B = () => BABYLON;

  const U = 1.0;            // 1 cm = 1 unit
  const COIL_X = 0;         // 코일 중심
  const COIL_HALF = 3.0;    // 코일 반 길이 (cm)
  const TABLE_Y = 0;
  const AXIS_Y = 3.2;

  let scene, camera;
  let coil, magnet, meter, meterTex, bulb, bulbMat, rail;
  let coilTurnMeshes = [];
  let placed = {};

  const state = {
    turns: 200,        // 코일 감은 수
    strength: 1.0,     // 자석 세기 (상댓값)
    speed: 6.0,        // 자동 흔들기 속력 (cm/s)
    x: -9,             // 자석 위치 (cm, 코일 중심 기준)
    auto: false,       // 자동 흔들기
    dir: 1,            // 자동일 때 진행 방향
  };

  // 최근 기전력 기록 (그래프용)
  const trace = [];
  const TRACE_N = 260;
  let emf = 0, flux = 0, lastFlux = null, peakEmf = 0;

  const tools = [
    { id: 'coil', label: '코일 (솔레노이드)', icon: 'coil' },
    { id: 'magnet', label: '막대자석', icon: 'magnet' },
    { id: 'meter', label: '검류계 · 전구', icon: 'galvano' },
  ];

  const slots = {
    coil: { x: 0, r: 5, name: '코일' },
    magnet: { x: -9, r: 8, name: '자석' },
    meter: { x: 9, r: 9, name: '검류계' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /**
   * 코일을 지나는 자기 선속. 막대자석을 쌍극자로 보고
   * 코일 중심에서의 축상 자기장을 단순한 종 모양으로 근사한다.
   *   Φ(x) ≈ N · B0 / (1 + (x/w)²)^1.5
   */
  const W = 2.6;            // 자기장이 퍼진 폭 (cm)

  function fluxAt(x) {
    const r = x / W;
    return state.turns * state.strength * 1.0 / Math.pow(1 + r * r, 1.5);
  }

  /** 패러데이 법칙 : ε = −N dΦ/dt (여기서는 Φ 에 N 을 이미 곱해 두었다) */
  function emfFor(x, v) {
    const h = 0.01;
    const dPhidx = (fluxAt(x + h) - fluxAt(x - h)) / (2 * h);
    return -dPhidx * v * 0.02;      // 화면에 보기 좋은 크기로 맞춘 계수
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#151d28ff');

    camera = new (B().ArcRotateCamera)(
      'camInd', -Math.PI / 2 - 0.32, 1.14, 26, new (B().Vector3)(0, 3.0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 48;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hi', new (B().Vector3)(0.1, 1, -0.35), scene);
    hemi.intensity = 0.78;
    hemi.groundColor = new (B().Color3)(0.2, 0.24, 0.3);

    const dir = new (B().DirectionalLight)('di', new (B().Vector3)(-0.4, -1, 0.5), scene);
    dir.position = new (B().Vector3)(8, 16, -10);
    dir.intensity = 0.42;

    const glow = new (B().GlowLayer)('glowI', scene);
    glow.intensity = 0.8;

    buildTable();
    buildRail();
    buildCoil();
    buildMagnet();
    buildMeter();
    buildPlaceholders();

    // 검류계 눈금은 읽어야 하는 값이므로 번짐 없이 또렷하게 유지한다
    glow.addExcludedMesh(scene.getMeshByName('meterFace'));
    glow.addExcludedMesh(scene.getMeshByName('meterBody'));

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/induction.jpg', { x: -13, y: 0, z: 5.5, ry: 0.45 });

    setupPointer(canvas);
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

  function buildTable() {
    const t = B().MeshBuilder.CreateBox('inTable', { width: 34, height: 0.5, depth: 14 }, scene);
    t.position.set(0, TABLE_Y - 0.26, 0);
    t.material = mat('inTableMat', '#2a323d', '#4c5766', 72);
  }

  /** 자석이 지나가는 안내 레일 + 위치 눈금 */
  function buildRail() {
    rail = new (B().TransformNode)('inRail', scene);
    const bar = B().MeshBuilder.CreateBox('inRailBar', { width: 26, height: 0.22, depth: 1.1 }, scene);
    bar.position.set(0, AXIS_Y - 1.15, 0);
    bar.material = mat('inRailMat', '#4a5462', '#98a4b4', 64);
    bar.parent = rail;

    const ruler = B().MeshBuilder.CreateGround('inRuler', { width: 26, height: 0.9 }, scene);
    ruler.position.set(0, TABLE_Y + 0.02, 3.0);
    const tex = new (B().DynamicTexture)('inRulerTex', { width: 1300, height: 80 }, scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = '#e9eef5';
    ctx.fillRect(0, 0, 1300, 80);
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 2;
    for (let cm = -13; cm <= 13; cm++) {
      const x = 650 + cm * 50;
      ctx.beginPath(); ctx.moveTo(x, 80); ctx.lineTo(x, cm % 5 === 0 ? 36 : 58); ctx.stroke();
    }
    ctx.fillStyle = '#2f3947';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let cm = -10; cm <= 10; cm += 5) ctx.fillText(`${cm}`, 650 + cm * 50, 4);
    tex.update();
    const rm = new (B().StandardMaterial)('inRulerMat', scene);
    rm.diffuseTexture = tex;
    rm.specularColor = new (B().Color3)(0, 0, 0);
    ruler.material = rm;
    ruler.parent = rail;
  }

  /** 코일 — 감은 수에 따라 실제로 고리 개수가 달라진다 */
  function buildCoil() {
    coil = new (B().TransformNode)('coilGroup', scene);

    const tube = B().MeshBuilder.CreateCylinder('coilTube',
      { height: COIL_HALF * 2, diameter: 2.5, tessellation: 24 }, scene);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(COIL_X, AXIS_Y, 0);
    const tm = new (B().StandardMaterial)('coilTubeMat', scene);
    tm.diffuseColor = B().Color3.FromHexString('#d8e2ee');
    tm.alpha = 0.28;
    tm.specularColor = new (B().Color3)(0.4, 0.4, 0.4);
    tube.material = tm;
    tube.parent = coil;

    // 지지대
    [-1, 1].forEach((s, i) => {
      const post = B().MeshBuilder.CreateBox('coilPost' + i, { width: 0.4, height: AXIS_Y - 0.2, depth: 1.6 }, scene);
      post.position.set(COIL_X + s * (COIL_HALF - 0.2), TABLE_Y + (AXIS_Y - 0.2) / 2, 0);
      post.material = mat('coilPostMat' + i, '#4a5462');
      post.parent = coil;
    });

    rebuildTurns();
  }

  function rebuildTurns() {
    coilTurnMeshes.forEach((m) => m.dispose());
    coilTurnMeshes = [];
    const n = Math.round(6 + state.turns / 40);      // 보기 좋은 개수로 환산
    const cm = new (B().StandardMaterial)('coilWireMat', scene);
    cm.diffuseColor = B().Color3.FromHexString('#c07a2e');
    cm.specularColor = B().Color3.FromHexString('#ffd9a0');
    cm.specularPower = 48;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = COIL_X - COIL_HALF + 0.35 + t * (COIL_HALF * 2 - 0.7);
      const ring = B().MeshBuilder.CreateTorus('coilTurn' + i,
        { diameter: 2.9, thickness: 0.24, tessellation: 20 }, scene);
      ring.rotation.z = Math.PI / 2;
      ring.position.set(x, AXIS_Y, 0);
      ring.material = cm;
      ring.parent = coil;
      coilTurnMeshes.push(ring);
    }
  }

  /** 막대자석 — N 극(빨강) / S 극(파랑) */
  function buildMagnet() {
    magnet = new (B().TransformNode)('magnetGroup', scene);
    const L = 3.4;

    const nPole = B().MeshBuilder.CreateBox('magN', { width: L / 2, height: 1.1, depth: 1.1 }, scene);
    nPole.position.set(L / 4, 0, 0);
    nPole.material = mat('magNMat', '#d0453a', '#ffc9c2', 48);
    nPole.parent = magnet;

    const sPole = B().MeshBuilder.CreateBox('magS', { width: L / 2, height: 1.1, depth: 1.1 }, scene);
    sPole.position.set(-L / 4, 0, 0);
    sPole.material = mat('magSMat', '#2f6ad0', '#c2d6ff', 48);
    sPole.parent = magnet;

    // 극 표시
    const label = (text, x, hex) => {
      const p = B().MeshBuilder.CreatePlane('magLab' + text, { width: 0.9, height: 0.9 }, scene);
      p.position.set(x, 0, -0.58);
      p.rotation.y = Math.PI;
      const tex = new (B().DynamicTexture)('magLabT' + text, { width: 96, height: 96 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 96, 96);
      ctx.translate(96, 0); ctx.scale(-1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 70px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 48, 52);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      tex.hasAlpha = true; tex.update();
      const m = new (B().StandardMaterial)('magLabM' + text, scene);
      m.diffuseTexture = tex; m.opacityTexture = tex;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.specularColor = new (B().Color3)(0, 0, 0);
      m.backFaceCulling = false;
      p.material = m;
      p.parent = magnet;
    };
    label('S', -L / 4, '#2f6ad0');
    label('N', L / 4, '#d0453a');

    // 손잡이 (끌 수 있는 곳임을 알린다)
    const grip = B().MeshBuilder.CreateBox('magGrip', { width: 0.5, height: 1.5, depth: 0.5 }, scene);
    grip.position.set(0, 1.2, 0);
    grip.material = mat('magGripMat', '#8e9bad');
    grip.parent = magnet;

    magnet.position.set(state.x, AXIS_Y, 0);
  }

  /** 검류계 + 전구 */
  function buildMeter() {
    meter = new (B().TransformNode)('meterGroup', scene);
    // 코일 양 끝 → 검류계를 잇는 도선 (회로가 실제로 연결되어 보이도록)
    const wireM = new (B().StandardMaterial)('inWireM', scene);
    wireM.diffuseColor = B().Color3.FromHexString('#c0392b');
    wireM.specularColor = B().Color3.FromHexString('#f0a08a');
    wireM.specularPower = 96;
    const mkWire = (x1, y1, z1, x2, y2, z2, n) => {
      const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const w = B().MeshBuilder.CreateCylinder('inWire' + n, { height: len, diameter: 0.09 }, scene);
      w.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      // 원기둥 +y 를 방향 벡터로 회전
      const axis = new (B().Vector3)(dx / len, dy / len, dz / len);
      const up = new (B().Vector3)(0, 1, 0);
      const dot = B().Vector3.Dot(up, axis);
      if (Math.abs(dot) < 0.999) {
        const cr = B().Vector3.Cross(up, axis);
        w.rotationQuaternion = B().Quaternion.RotationAxis(cr.normalize(), Math.acos(dot));
      }
      w.material = wireM;
      w.parent = meter;
      return w;
    };
    const px = COIL_X + COIL_HALF - 0.2;       // 코일 오른쪽 지지대
    // 지지대 아래 → 실험대 위를 지나 검류계 몸체로 (앞뒤 두 가닥)
    mkWire(px, TABLE_Y + 0.12, 0.35, 9.5, TABLE_Y + 0.12, 0.85, 'A1');
    mkWire(9.5, TABLE_Y + 0.12, 0.85, 9.5, TABLE_Y + 1.1, 0.85, 'A2');
    mkWire(px, TABLE_Y + 0.12, -0.35, 9.5, TABLE_Y + 0.12, -0.85, 'B1');
    mkWire(9.5, TABLE_Y + 0.12, -0.85, 9.5, TABLE_Y + 1.1, -0.85, 'B2');

    const body = B().MeshBuilder.CreateBox('meterBody', { width: 5.0, height: 3.4, depth: 2.4 }, scene);
    body.position.set(9.5, TABLE_Y + 1.7, 0);
    body.material = mat('meterBodyMat', '#e4eaf2', '#ffffff', 70);
    body.parent = meter;

    const face = B().MeshBuilder.CreatePlane('meterFace', { width: 4.2, height: 2.6 }, scene);
    face.position.set(9.5, TABLE_Y + 1.8, -1.22);
    face.rotation.y = Math.PI;
    meterTex = new (B().DynamicTexture)('meterTex', { width: 336, height: 208 }, scene, true);
    const fm = new (B().StandardMaterial)('meterFaceMat', scene);
    fm.diffuseTexture = meterTex;
    fm.emissiveTexture = meterTex;
    fm.emissiveColor = new (B().Color3)(0.85, 0.85, 0.85);
    fm.specularColor = new (B().Color3)(0, 0, 0);
    fm.backFaceCulling = false;
    face.material = fm;
    face.parent = meter;

    // 전구 (자가발전 손전등)
    bulb = B().MeshBuilder.CreateSphere('bulb', { diameter: 1.7, segments: 16 }, scene);
    bulb.position.set(9.5, TABLE_Y + 4.4, 0);
    bulbMat = new (B().StandardMaterial)('bulbMat', scene);
    bulbMat.diffuseColor = B().Color3.FromHexString('#4a5462');
    bulbMat.emissiveColor = new (B().Color3)(0, 0, 0);
    bulbMat.specularColor = new (B().Color3)(1, 1, 1);
    bulbMat.specularPower = 128;
    bulb.material = bulbMat;
    bulb.parent = meter;

    const socket = B().MeshBuilder.CreateCylinder('bulbSocket', { height: 0.8, diameter: 1.0 }, scene);
    socket.position.set(9.5, TABLE_Y + 3.5, 0);
    socket.material = mat('bulbSocketMat', '#8e9bad');
    socket.parent = meter;
  }

  /** 검류계 눈금과 바늘 */
  function drawMeter() {
    const ctx = meterTex.getContext();
    ctx.clearRect(0, 0, 336, 208);
    ctx.translate(336, 0); ctx.scale(-1, 1);

    ctx.fillStyle = '#f4f6f9';
    ctx.fillRect(0, 0, 336, 208);

    const cx = 168, cy = 170, R = 118;
    // 눈금
    ctx.strokeStyle = '#4a5462';
    ctx.lineWidth = 2;
    for (let i = -5; i <= 5; i++) {
      const ang = Math.PI + (i / 5) * (Math.PI * 0.42) + Math.PI / 2 - Math.PI / 2;
      const a = -Math.PI / 2 + (i / 5) * (Math.PI * 0.44);
      const x1 = cx + Math.sin(a) * R, y1 = cy - Math.cos(a) * R;
      const x2 = cx + Math.sin(a) * (R - (i % 5 === 0 ? 20 : 12));
      const y2 = cy - Math.cos(a) * (R - (i % 5 === 0 ? 20 : 12));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.fillStyle = '#5b6675';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('−', cx - 96, cy - 62);
    ctx.fillText('0', cx, cy - R + 34);
    ctx.fillText('+', cx + 96, cy - 62);

    // 바늘
    const norm = Math.max(-1, Math.min(1, emf / 3.2));
    const a = norm * (Math.PI * 0.44);
    ctx.strokeStyle = '#d0453a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(a) * (R - 26), cy - Math.cos(a) * (R - 26));
    ctx.stroke();
    ctx.fillStyle = '#2b323c';
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 7); ctx.fill();

    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 22px "Noto Sans KR", sans-serif';
    ctx.fillText('검류계', cx, 30);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    meterTex.update();
  }

  /* ══ 자석을 직접 끌기 ════════════════════════
     자석을 손으로 잡아 코일 속으로 넣었다 뺐다 할 수 있다.
     끄는 «빠르기» 가 그대로 유도 기전력에 반영된다.               */
  let dragMag = false;
  let onChangeCb = null;

  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      if (pi.type === T.POINTERDOWN) {
        const m = pi.pickInfo && pi.pickInfo.pickedMesh;
        if (!m || !/^(magN|magS|magGrip)/.test(m.name) || !placed.magnet) return;
        dragMag = true;
        state.auto = false;
        camera.detachControl();
      } else if (pi.type === T.POINTERMOVE && dragMag) {
        const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
        const plane = B().Plane.FromPositionAndNormal(
          new (B().Vector3)(0, AXIS_Y, 0), new (B().Vector3)(0, 0, 1));
        const d = ray.intersectsPlane(plane);
        if (d === null) return;
        const x = ray.origin.add(ray.direction.scale(d)).x;
        state.x = Math.max(-X_LIMIT, Math.min(X_LIMIT, x));
        if (onChangeCb) onChangeCb();
      } else if (pi.type === T.POINTERUP && dragMag) {
        dragMag = false;
        camera.attachControl(canvas, true);
      }
    });
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      coil: { x: 0, y: AXIS_Y, w: 7.5, h: 4.0, label: '코일' },
      magnet: { x: -9, y: AXIS_Y, w: 5.0, h: 3.4, label: '자석' },
      meter: { x: 9.5, y: AXIS_Y - 0.3, w: 6.0, h: 5.4, label: '검류계 · 전구' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreatePlane('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, c.y, 0.4);
      p.rotation.y = Math.PI;
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: true, color: '#5aa9ff' });
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
    state.auto = false;
    state.x = -9;
    trace.length = 0;
    emf = 0; lastFlux = null; peakEmf = 0;
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    coil.setEnabled(!!placed.coil);
    magnet.setEnabled(!!placed.magnet);
    meter.setEnabled(!!placed.meter);
    rail.setEnabled(!!placed.coil);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const s = slots[id];
    return Math.abs(point.x - s.x) <= s.r ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  const X_LIMIT = 10;

  function tick(dt) {
    if (!placed.magnet || !placed.coil) return false;

    let v = 0;
    if (state.auto) {
      v = state.speed * state.dir;
      state.x += v * dt;
      if (state.x > X_LIMIT) { state.x = X_LIMIT; state.dir = -1; }
      if (state.x < -X_LIMIT) { state.x = -X_LIMIT; state.dir = 1; }
    }

    // 자석이 멈춰 있으면 자기 선속이 변하지 않아 유도 전류도 0 이다
    flux = fluxAt(state.x);
    emf = state.auto ? emfFor(state.x, v) : 0;
    peakEmf = Math.max(peakEmf, Math.abs(emf));

    trace.push(emf);
    if (trace.length > TRACE_N) trace.shift();

    layout();
    return true;
  }

  /** 자석을 손으로 끌었을 때 (드래그 대신 슬라이더로 옮길 때도 여기로) */
  function moveTo(x, dt) {
    const prev = state.x;
    state.x = Math.max(-X_LIMIT, Math.min(X_LIMIT, x));
    const v = dt > 0 ? (state.x - prev) / dt : 0;
    flux = fluxAt(state.x);
    emf = emfFor(state.x, v);
    peakEmf = Math.max(peakEmf, Math.abs(emf));
    trace.push(emf);
    if (trace.length > TRACE_N) trace.shift();
    layout();
  }

  function layout() {
    magnet.position.x = state.x;
    if (holders.magnet) holders.magnet.position.x = state.x;

    // 전구 밝기
    const bright = Math.min(1, Math.abs(emf) / 2.6);
    bulbMat.emissiveColor = new (B().Color3)(bright, bright * 0.86, bright * 0.45);

    // 코일에 유도 전류가 흐르면 살짝 빛나게
    const glowC = Math.min(0.5, Math.abs(emf) / 6);
    coilTurnMeshes.forEach((m) => {
      m.material.emissiveColor = new (B().Color3)(glowC, glowC * 0.55, 0);
    });

    if (placed.meter) drawMeter();
  }

  function update() {
    if (!scene) return;
    rebuildTurns();
    flux = fluxAt(state.x);
    layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 - 0.32;
    camera.beta = 1.14;
    camera.radius = 26;
    camera.setTarget(new (B().Vector3)(0, 3.0, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '자석을 코일 쪽으로 «움직일 때만» 전류가 흐릅니다. 자동 흔들기를 켜고 감은 수·세기·속력을 바꿔 보세요.';
  const prepGuide = '점선으로 표시된 자리에 코일·자석·검류계를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    return `
      ${LabUI.slider('turns', '코일<br>감은 수 <i>N</i>',
        { min: 40, max: 400, step: 20, value: state.turns, fmt: (v) => `${v} 회` })}
      ${LabUI.slider('strength', '자석의<br>세기',
        { min: 0.3, max: 2.0, step: 0.1, value: state.strength, fmt: (v) => `${v.toFixed(1)} 배` })}
      ${LabUI.slider('speed', '흔드는<br>속력 <i>v</i>',
        { min: 2, max: 18, step: 0.5, value: state.speed, fmt: (v) => `${v.toFixed(1)} cm/s` })}
      ${LabUI.slider('x', '자석 위치',
        { min: -10, max: 10, step: 0.2, value: state.x, fmt: (v) => `${v.toFixed(1)} cm` })}
      <div class="control">
        <div class="clabel">자동<br>흔들기</div>
        <button class="power${state.auto ? ' run' : ' off'}" id="autoBtn">${state.auto ? '흔드는 중' : '▶ 시작'}</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;   // 3D 에서 끌어도 측정값이 갱신되도록
    LabUI.bindSlider(root, 'turns', state, 'turns', (v) => `${v} 회`, onChange);
    LabUI.bindSlider(root, 'strength', state, 'strength', (v) => `${v.toFixed(1)} 배`, onChange);
    LabUI.bindSlider(root, 'speed', state, 'speed', (v) => `${v.toFixed(1)} cm/s`, onChange);

    // 위치 슬라이더는 손으로 자석을 옮기는 것과 같다 — 움직인 만큼 전류가 생긴다
    const xEl = root.querySelector('#x');
    const xOut = root.querySelector('#xOut');
    let lastT = performance.now();
    xEl.addEventListener('input', () => {
      const now = performance.now();
      const dt = Math.max(0.016, (now - lastT) / 1000);
      lastT = now;
      state.auto = false;
      const btn = root.querySelector('#autoBtn');
      btn.textContent = '▶ 시작'; btn.classList.remove('run'); btn.classList.add('off');
      moveTo(parseFloat(xEl.value), dt);
      xOut.textContent = `${state.x.toFixed(1)} cm`;
      onChange();
    });

    const auto = root.querySelector('#autoBtn');
    auto.addEventListener('click', () => {
      state.auto = !state.auto;
      auto.textContent = state.auto ? '흔드는 중' : '▶ 시작';
      auto.classList.toggle('run', state.auto);
      auto.classList.toggle('off', !state.auto);
      if (!state.auto) { emf = 0; layout(); }
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const inside = Math.abs(state.x) < COIL_HALF;
    const moving = state.auto;
    const approaching = moving && (state.dir > 0 ? state.x < 0 : state.x > 0);

    let dirTxt, tag;
    if (!moving || Math.abs(emf) < 0.02) { dirTxt = '전류 없음'; tag = 'mid'; }
    else if (emf > 0) { dirTxt = '시계 방향'; tag = 'con'; }
    else { dirTxt = '반시계 방향'; tag = 'des'; }

    return `
      <div class="row"><span>코일 감은 수 <i>N</i></span><b>${state.turns} 회</b></div>
      <div class="row"><span>자석 위치</span>
        <b>${state.x.toFixed(1)} cm ${inside ? '(코일 안)' : ''}</b></div>
      <div class="sec">유도 전류</div>
      <div class="row"><span>자기 선속 <i>Φ</i></span><b>${flux.toFixed(1)}</b></div>
      <div class="row"><span>유도 기전력 <i>ε</i></span>
        <b class="big">${emf.toFixed(2)} V</b></div>
      <div class="row"><span>전류의 방향</span><span class="tag ${tag}">${dirTxt}</span></div>
      <div class="row"><span>지금까지 최대</span><b>${peakEmf.toFixed(2)} V</b></div>
      <div class="formula">${moving
        ? (approaching ? '자석이 <b>다가오는 중</b> — 코일은 밀어내려 한다'
                       : '자석이 <b>멀어지는 중</b> — 코일은 붙잡으려 한다')
        : '자석이 <b>멈춰 있어</b> 자기 선속이 변하지 않으므로 전류가 흐르지 않습니다'}</div>
      <div class="formula"><i>ε</i> = −<i>N</i> ΔΦ/Δ<i>t</i> (패러데이 법칙)</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '자기 선속과 유도 기전력';

  function drawGraph(ctx, W2, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H);

    const topH = Math.round(H * 0.44);
    const botY = topH + 8;
    const botH = H - botY - 18;

    /* 위 — 자석 위치에 따른 자기 선속 Φ(x) */
    const padL = 30, padR = 10;
    const gw = W2 - padL - padR;
    const xOf = (x) => padL + ((x + 12) / 24) * gw;
    const maxPhi = state.turns * state.strength * 1.05;

    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, topH - 4); ctx.lineTo(padL + gw, topH - 4); ctx.stroke();

    // 코일이 있는 구간 표시
    ctx.fillStyle = 'rgba(192,122,46,.20)';
    ctx.fillRect(xOf(-COIL_HALF), 14, xOf(COIL_HALF) - xOf(-COIL_HALF), topH - 18);

    ctx.strokeStyle = '#5ad0f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= gw; px++) {
      const x = (px / gw) * 24 - 12;
      const y = topH - 4 - (fluxAt(x) / maxPhi) * (topH - 20);
      px === 0 ? ctx.moveTo(padL + px, y) : ctx.lineTo(padL + px, y);
    }
    ctx.stroke();

    // 현재 자석 위치
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xOf(state.x), 12); ctx.lineTo(xOf(state.x), topH - 4);
    ctx.stroke();

    ctx.fillStyle = '#5ad0f0';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('자기 선속 Φ (코일 안에서 최대)', padL + 3, 3);

    /* 아래 — 시간에 따른 유도 기전력 */
    const zeroY = botY + botH / 2;
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(padL + gw, zeroY); ctx.stroke();

    const maxE = Math.max(0.6, peakEmf) * 1.15;
    ctx.strokeStyle = '#f0834a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    trace.forEach((v, i) => {
      const x = padL + (i / (TRACE_N - 1)) * gw;
      const y = zeroY - (v / maxE) * (botH / 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#f0834a';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('유도 기전력 ε (시간)', padL + 3, botY + 1);
    ctx.fillStyle = '#9fb0c2';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('+', padL - 3, zeroY - botH / 3);
    ctx.fillText('0', padL - 3, zeroY);
    ctx.fillText('−', padL - 3, zeroY + botH / 3);
  }

  function graphFootHTML() {
    return `코일 안에서 <i>Φ</i> 가 가장 크지만, 전류는 <b>Φ 가 가장 빠르게 변하는</b>
      코일 입구·출구에서 최대가 됩니다 · 들어갈 때와 나올 때 방향이 <b>반대</b>`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '감은 수 <i>N</i>', '자석 세기', '속력 <i>v</i> (cm/s)', '최대 기전력 (V)',
  ];

  function recordRow() {
    if (peakEmf < 0.01) return null;
    return [
      String(state.turns), `${state.strength.toFixed(1)} 배`,
      state.speed.toFixed(1), peakEmf.toFixed(2),
    ];
  }

  /** 조건을 바꾸면 최댓값을 새로 잰다 */
  function onEnterRun() { peakEmf = 0; }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 자석을 움직여 유도 전류 · 1 멈추면 0 · 2 감은 수 2배 기록
     3 빠르기 2가지 기록 · 4 기록 4줄                                      */
  const mis = { moved: false, stopZero: false, lastX: null, still: 0 };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);
  const uniq = (col) => new Set(recs().map((r) => String(r[col]))).size;

  function missionDone(i) {
    if (peakEmf > 0.05) mis.moved = true;
    // 자석이 멈춘 채 유도 기전력이 0 → «변화가 있어야 전류가 흐른다»
    if (mis.lastX !== null && Math.abs(state.x - mis.lastX) < 0.02 && !state.auto) {
      mis.still += 1;
      if (mis.moved && mis.still >= 3 && Math.abs(emf) < 0.02) mis.stopZero = true;
    } else {
      mis.still = 0;
    }
    mis.lastX = state.x;

    if (i === 0) return mis.moved;
    if (i === 1) return mis.stopZero;
    if (i === 2) {
      const rs = recs();
      for (let a = 0; a < rs.length; a++) {
        for (let b = 0; b < rs.length; b++) {
          if (a !== b && Math.abs(parseFloat(rs[b][0]) - 2 * parseFloat(rs[a][0])) < 1) return true;
        }
      }
      return false;
    }
    if (i === 3) return uniq(2) >= 2;
    if (i === 4) return recs().length >= 4;
    return false;
  }

  return {
    missionDone,
    id: 'induction',
    title: '전자기 유도 — 흔들면 불이 켜지는 손전등',
    guide, prepGuide, tools,
    create, update, tick, resetCamera, onEnterRun,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state,
    get emf() { return emf; },
    get flux() { return flux; },
    get peakEmf() { return peakEmf; },
    resetPeak() { peakEmf = 0; },
    get scene() { return scene; },
  };
})();
