/**
 * 반도체를 모형으로 나타내기
 * 비상교육 고등 물리학 III-2-02 (교과서 154~159쪽), 해 보기 156쪽
 *
 * 교과서의 «원형 자석 모형» 을 그대로 옮겼다.
 * 원자가 전자가 4 개인 규소로 결정을 만들고, 일부를 3 개(붕소)나 5 개(인)로
 * 바꾸면 짝을 못 이룬 전자(n형)나 비어 있는 자리(p형)가 생긴다.
 */
const SemiScene = (() => {
  const B = () => BABYLON;

  const NX = 4, NZ = 4;         // 결정 격자 크기
  const PITCH = 2.6;            // 원자 사이 간격
  const ATOM_Y = 1.0;

  let scene, camera;
  let lattice, atoms = [], bonds = [], carriers = [];
  let placed = {};
  let onChangeCb = null;        // 3D 에서 조작해도 측정값이 갱신되도록
  let panelRoot = null;         // 아래쪽 조작 막대 — 3D 조작에 맞춰 눈금을 맞춘다

  const state = {
    doping: 'pure',     // pure | n | p
    temp: 300,          // K
    dopeCount: 2,       // 바꿔 넣은 원자 개수
    field: false,       // 전압을 걸었는가
  };

  // 물질별 띠 간격 (eV)
  const GAPS = { conductor: 0, semi: 1.12, insulator: 5.5 };

  const DOPANTS = {
    pure: { name: '순수 반도체 (진성)', atom: 'Si', valence: 4, color: '#8e9bad',
      carrier: '전자–양공 쌍', tag: 'mid' },
    n: { name: 'n형 반도체', atom: '인 (P)', valence: 5, color: '#4ad8a0',
      carrier: '남는 전자', tag: 'ok' },
    p: { name: 'p형 반도체', atom: '붕소 (B)', valence: 3, color: '#e8a14a',
      carrier: '양공 (빈자리)', tag: 'con' },
  };

  // 불순물을 꽂아 둔 격자 자리 — 학생이 화면에서 직접 고르면 이 목록이 바뀐다.
  // 아래쪽 «바꿔 넣은 원자 수» 버튼을 쓰면 기본 순서대로 다시 배치한다.
  const ORDER = [5, 10, 6, 9, 1, 14];
  let sites = ORDER.slice(0, state.dopeCount);

  const tools = [
    { id: 'board', label: '자석 붙는 칠판', icon: 'screenBoard' },
    { id: 'si', label: '규소 원자 모형 (4)', icon: 'ball' },
    { id: 'dopant', label: '붕소·인 모형 (3·5)', icon: 'weight' },
  ];

  const slots = { board: { name: '칠판' }, si: { name: '규소 원자' }, dopant: { name: '불순물 원자' } };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 열에너지로 전도띠에 올라간 전자의 상대적인 수 (볼츠만 인자) */
  function thermalCarriers() {
    const kT = 8.617e-5 * state.temp;      // eV
    return Math.exp(-GAPS.semi / (2 * kT));
  }

  /** 도핑으로 생긴 운반자 수 (상댓값) */
  function dopedCarriers() {
    if (state.doping === 'pure') return 0;
    return state.dopeCount * 0.25;
  }

  /** 전기 전도도 (상댓값) */
  function conductivity() {
    return thermalCarriers() * 1e6 + dopedCarriers() * 100;
  }

  /** 값이 아주 작아도 «0» 으로 보이지 않게 적는다 */
  function fmtSigma(v) {
    if (v >= 10) return v.toFixed(0);
    if (v >= 0.1) return v.toFixed(2);
    return v.toExponential(1);
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#182230ff');

    // 칠판 양옆의 «원자 상자·온도계·전압 스위치» 까지 한눈에 들어오도록 조금 물러선다
    camera = new (B().ArcRotateCamera)(
      'camSm', -Math.PI / 2, 0.72, 22, new (B().Vector3)(0, 1.0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 9;
    camera.upperRadiusLimit = 34;
    camera.upperBetaLimit = 1.46;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hsm', new (B().Vector3)(0, 1, -0.3), scene);
    hemi.intensity = 0.86;
    hemi.groundColor = new (B().Color3)(0.24, 0.28, 0.34);

    const glow = new (B().GlowLayer)('glowSm', scene);
    glow.intensity = 0.6;

    buildBoard();
    buildLattice();
    buildCarriers();
    buildPlaceholders();
    buildTray();
    buildThermo();
    buildSwitch();
    setupPointer(canvas);

    // 상시 바닥 — 도구를 놓기 전에도 기본 배경이 보인다
    const __base = B().MeshBuilder.CreateGround('scBase', { width: 26, height: 18 }, scene);
    __base.position.y = -0.7;
    const __bm = new (B().StandardMaterial)('scBaseM', scene);
    __bm.diffuseColor = B().Color3.FromHexString('#141a24');
    __bm.specularColor = new (B().Color3)(0.03, 0.03, 0.05);
    __base.material = __bm;

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/semiconductor.jpg', { x: -8, y: 0, z: 6, ry: 0.3 });

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

  /** 자석이 붙는 칠판 */
  function buildBoard() {
    const b = B().MeshBuilder.CreateGround('smBoard',
      { width: (NX + 1) * PITCH, height: (NZ + 1) * PITCH }, scene);
    b.position.y = 0;
    b.material = mat('smBoardMat', '#2b3a34', '#4a5a52', 48);
    b._isBoard = true;
    boardMesh = b;
  }
  let boardMesh;

  /** 규소 결정 격자 */
  function buildLattice() {
    lattice = new (B().TransformNode)('smLattice', scene);

    for (let i = 0; i < NX; i++) {
      for (let k = 0; k < NZ; k++) {
        const g = new (B().TransformNode)(`atom${i}_${k}`, scene);
        const core = B().MeshBuilder.CreateSphere(`core${i}_${k}`, { diameter: 1.5, segments: 16 }, scene);
        core.material = mat(`coreM${i}_${k}`, '#8e9bad', '#e4eaf2', 64);
        core.parent = g;

        // 원자 이름표
        const lab = B().MeshBuilder.CreatePlane(`lab${i}_${k}`, { width: 1.1, height: 1.1 }, scene);
        lab.position.y = 0.78;
        lab.rotation.x = Math.PI / 2;
        const tex = new (B().DynamicTexture)(`labT${i}_${k}`, { width: 96, height: 96 }, scene, true);
        const lm = new (B().StandardMaterial)(`labM${i}_${k}`, scene);
        lm.diffuseTexture = tex; lm.opacityTexture = tex;
        lm.emissiveColor = new (B().Color3)(1, 1, 1);
        lm.specularColor = new (B().Color3)(0, 0, 0);
        lm.backFaceCulling = false;
        lab.material = lm;
        lab.parent = g;

        // 원자가 전자 (최대 5 개, 원자 둘레에 배치)
        const els = [];
        for (let e = 0; e < 5; e++) {
          const s = B().MeshBuilder.CreateSphere(`ve${i}_${k}_${e}`, { diameter: 0.42, segments: 8 }, scene);
          const a = (e / 4) * Math.PI * 2;
          s.position.set(Math.cos(a) * 1.05, 0.1, Math.sin(a) * 1.05);
          const em = new (B().StandardMaterial)(`veM${i}_${k}_${e}`, scene);
          em.emissiveColor = B().Color3.FromHexString('#5ad0f0');
          em.disableLighting = true;
          s.material = em;
          s.parent = g;
          els.push(s);
        }

        g.position.set(
          (i - (NX - 1) / 2) * PITCH,
          ATOM_Y,
          (k - (NZ - 1) / 2) * PITCH,
        );
        g._core = core;
        g._tex = tex;
        g._els = els;
        g._i = i; g._k = k;
        g.parent = lattice;
        // 화면에서 원자를 집을 수 있도록 부품마다 «몇 번 자리» 인지 붙여 둔다
        const idx = atoms.length;
        g._idx = idx;
        core._atomIdx = idx;
        lab._atomIdx = idx;
        els.forEach((s) => { s._atomIdx = idx; });
        atoms.push(g);
      }
    }

    // 공유 결합 선
    const lines = [];
    atoms.forEach((a) => {
      atoms.forEach((b2) => {
        if (b2._i === a._i + 1 && b2._k === a._k) lines.push([a.position.clone(), b2.position.clone()]);
        if (b2._k === a._k + 1 && b2._i === a._i) lines.push([a.position.clone(), b2.position.clone()]);
      });
    });
    const bondSys = B().MeshBuilder.CreateLineSystem('smBonds', { lines }, scene);
    bondSys.color = B().Color3.FromHexString('#5ad0f0');
    bondSys.alpha = 0.4;
    bondSys.isPickable = false;
    bondSys.parent = lattice;
    bonds.push(bondSys);
  }

  function drawAtomLabel(g, text, color) {
    const ctx = g._tex.getContext();
    ctx.clearRect(0, 0, 96, 96);
    ctx.fillStyle = color;
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 48, 50);
    g._tex.update();
  }

  /** 자유 전자와 양공 */
  function buildCarriers() {
    for (let i = 0; i < 10; i++) {
      const c = B().MeshBuilder.CreateSphere('carrier' + i, { diameter: 0.52, segments: 10 }, scene);
      const cm = new (B().StandardMaterial)('carrierM' + i, scene);
      cm.emissiveColor = B().Color3.FromHexString('#5ad0f0');
      cm.disableLighting = true;
      c.material = cm;
      c.isPickable = false;
      c._mat = cm;
      c._x = (Math.random() - 0.5) * NX * PITCH;
      c._z = (Math.random() - 0.5) * NZ * PITCH;
      c._vx = (Math.random() - 0.5) * 2;
      c._vz = (Math.random() - 0.5) * 2;
      carriers.push(c);
    }
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      board: { w: (NX + 1) * PITCH, h: (NZ + 1) * PITCH, y: 0.06, label: '칠판' },
      si: { w: NX * PITCH, h: NZ * PITCH, y: 0.1, label: '규소 원자' },
      dopant: { w: NX * PITCH * 0.6, h: NZ * PITCH * 0.4, y: 0.14, label: '불순물 원자' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(0, c.y, 0);
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

  /* ══ 화면에서 직접 조작 ═══════════════════════
     · 왼쪽 «원자 상자» 의 인(P)·붕소(B) 모형을 집어 격자의 규소 자리에 끌어다 붙인다
     · 꽂아 둔 불순물 원자를 다시 집어 격자 밖으로 끌어내면 규소로 돌아간다
     · 오른쪽 온도계 손잡이를 위아래로 끌거나 ＋/－ 단추로 온도를 바꾼다
     · 앞쪽 전압 스위치를 눌러 전압을 걸고 끊는다                              */
  const TRAY_X = -8.2, TRAY_Z = -1.6;              // 원자 상자 자리
  const TH_X = 8.2, TH_Z = -0.6;                   // 온도계 자리
  const TH_Y0 = 0.55, TH_Y1 = 3.05;                // 손잡이가 오르내리는 높이
  const SW_X = 0, SW_Z = -7.4;                     // 전압 스위치 자리

  let trayN, trayP, thermoFill, thermoKnob, switchKnob;
  let tempTag, switchTag;
  let ghost, ghostTag, dropRing;
  let stepT = null;
  let hold = null;      // 지금 손에 든 모형 원자 { type, from, moved, px, py, target }
  let grab = null;      // 온도계 손잡이를 잡고 있는가

  /** 화면을 향해 서는 이름표 판 */
  function makeTag(name, w, h) {
    const TW = Math.round(w * 110), THh = Math.round(h * 110);
    const p = B().MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    const tex = new (B().DynamicTexture)(name + 'T', { width: TW, height: THh }, scene, true);
    tex.hasAlpha = true;
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.diffuseTexture = tex; m.opacityTexture = tex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    p.material = m;
    p.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    p.isPickable = false;
    p._tex = tex; p._tw = TW; p._th = THh;
    return p;
  }

  function drawTag(p, text, color, bg) {
    const c = p._tex.getContext();
    c.clearRect(0, 0, p._tw, p._th);
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, p._tw, p._th); }
    c.fillStyle = color || '#e8eef6';
    c.font = `bold ${Math.round(p._th * 0.5)}px "Noto Sans KR", sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, p._tw / 2, p._th / 2 + 1);
    p._tex.update();
  }

  /** 모형 원자 하나 — 상자에 든 것과 손에 든 것에 함께 쓴다 */
  function makeModelAtom(name, hex) {
    const s = B().MeshBuilder.CreateSphere(name, { diameter: 1.3, segments: 14 }, scene);
    s.material = mat(name + 'M', hex, '#e4eaf2', 64);
    return s;
  }

  /** 왼쪽 «원자 상자» — 인(P) 과 붕소(B) 모형이 담겨 있다 */
  function buildTray() {
    const base = B().MeshBuilder.CreateBox('smTrayBase',
      { width: 2.6, height: 0.24, depth: 4.2 }, scene);
    base.position.set(TRAY_X, 0.12, TRAY_Z);
    base.material = mat('smTrayBaseM', '#37445a', '#68789a', 32);
    base.isPickable = false;

    trayN = makeModelAtom('smTrayN', DOPANTS.n.color);
    trayN.position.set(TRAY_X, 0.9, TRAY_Z - 1.3);
    trayP = makeModelAtom('smTrayP', DOPANTS.p.color);
    trayP.position.set(TRAY_X, 0.9, TRAY_Z + 1.3);

    const tagN = makeTag('smTrayNTag', 2.4, 0.5);
    tagN.position.set(TRAY_X, 1.85, TRAY_Z - 1.3);
    drawTag(tagN, '인 P · 전자 5', DOPANTS.n.color);
    const tagP = makeTag('smTrayPTag', 2.4, 0.5);
    tagP.position.set(TRAY_X, 1.85, TRAY_Z + 1.3);
    drawTag(tagP, '붕소 B · 전자 3', DOPANTS.p.color);
    const tagT = makeTag('smTrayTag', 2.8, 0.52);
    tagT.position.set(TRAY_X, 2.75, TRAY_Z);
    drawTag(tagT, '원자 상자 — 끌어다 붙이기', '#cfe0f2');

    // 손에 든 모형 원자와, 붙일 자리를 알려 주는 고리
    ghost = makeModelAtom('smHeldAtom', DOPANTS.n.color);
    ghost.isPickable = false;
    ghost.setEnabled(false);
    ghostTag = makeTag('smHeldTag', 1.4, 0.46);
    ghostTag.position.set(0, 1.0, 0);
    ghostTag.parent = ghost;

    dropRing = B().MeshBuilder.CreateTorus('smDropRing',
      { diameter: 2.0, thickness: 0.11, tessellation: 28 }, scene);
    const rm = new (B().StandardMaterial)('smDropRingM', scene);
    rm.emissiveColor = B().Color3.FromHexString('#ffd84a');
    rm.disableLighting = true;
    dropRing.material = rm;
    dropRing.isPickable = false;
    dropRing.setEnabled(false);
  }

  /** 오른쪽 온도계 — 손잡이를 위아래로 끌어 온도를 정한다 */
  function buildThermo() {
    const tube = B().MeshBuilder.CreateCylinder('smThermoTube',
      { diameter: 0.6, height: 2.9, tessellation: 20 }, scene);
    tube.position.set(TH_X, 1.85, TH_Z);
    const tm = mat('smThermoTubeM', '#c8d4e4', '#ffffff', 96);
    tm.alpha = 0.45;
    tube.material = tm;

    const bulb = B().MeshBuilder.CreateSphere('smThermoBulb', { diameter: 0.9, segments: 14 }, scene);
    bulb.position.set(TH_X, 0.4, TH_Z);
    const bm = new (B().StandardMaterial)('smThermoBulbM', scene);
    bm.emissiveColor = B().Color3.FromHexString('#e0503a');
    bm.disableLighting = true;
    bulb.material = bm;
    bulb.isPickable = false;

    thermoFill = B().MeshBuilder.CreateCylinder('smThermoFill',
      { diameter: 0.34, height: 1, tessellation: 16 }, scene);
    const fm = new (B().StandardMaterial)('smThermoFillM', scene);
    fm.emissiveColor = B().Color3.FromHexString('#e0503a');
    fm.disableLighting = true;
    thermoFill.material = fm;
    thermoFill.isPickable = false;

    thermoKnob = B().MeshBuilder.CreateBox('smTempKnob',
      { width: 1.15, height: 0.28, depth: 0.8 }, scene);
    thermoKnob.material = mat('smTempKnobM', '#e8a14a', '#ffd8a0', 64);

    tempTag = makeTag('smTempTag', 2.4, 0.55);
    tempTag.position.set(TH_X, 3.75, TH_Z);

    stepT = LabUI.makeStepper(scene, 'Temp');
  }

  /** 앞쪽 전압 스위치 */
  function buildSwitch() {
    const base = B().MeshBuilder.CreateBox('smSwitchBase',
      { width: 2.2, height: 0.36, depth: 1.3 }, scene);
    base.position.set(SW_X, 0.18, SW_Z);
    base.material = mat('smSwitchBaseM', '#37445a', '#68789a', 32);

    switchKnob = B().MeshBuilder.CreateBox('smSwitchKnob',
      { width: 0.8, height: 0.62, depth: 0.8 }, scene);
    switchKnob.position.set(SW_X, 0.6, SW_Z);
    switchKnob.material = mat('smSwitchKnobM', '#b8c4d4', '#ffffff', 64);

    switchTag = makeTag('smSwitchTag', 2.6, 0.55);
    switchTag.position.set(SW_X, 1.5, SW_Z);
  }

  /* ── 불순물 자리 다루기 ────────────────────── */
  /** 지금 실제로 꽂혀 있는 자리 (순수 상태면 하나도 없다) */
  function activeSites() { return state.doping === 'pure' ? [] : sites; }

  function insertDopant(idx, type) {
    if (state.doping === 'pure') sites = [];      // 순수 상태에서 처음 꽂으면 자리를 새로 잡는다
    if (sites.indexOf(idx) >= 0 || sites.length >= 6) return false;
    sites.push(idx);
    // 한 결정에는 한 종류만 넣는다 — 다른 원자를 꽂으면 이미 꽂힌 것도 그 종류가 된다
    state.doping = type;
    state.dopeCount = sites.length;
    return true;
  }

  function pullDopant(idx) {
    const i = sites.indexOf(idx);
    if (i < 0) return;
    sites.splice(i, 1);
    if (sites.length === 0) state.doping = 'pure';
    else state.dopeCount = sites.length;
  }

  /** 아직 비어 있는 기본 자리 하나 */
  function nextFreeSite() {
    const on = activeSites();
    for (let i = 0; i < ORDER.length; i++) if (on.indexOf(ORDER[i]) < 0) return ORDER[i];
    return null;
  }

  /** 화면의 한 점을 높이 y 인 수평면 위의 세계 좌표로 바꾼다 */
  function pointerOnPlane(y) {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(
      new (B().Vector3)(0, y, 0), new (B().Vector3)(0, 1, 0));
    const d = ray.intersectsPlane(plane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d));
  }

  /** 그 점에 가장 가까운 «빈» 규소 자리 */
  function nearSite(pt) {
    const i = Math.round(pt.x / PITCH + (NX - 1) / 2);
    const k = Math.round(pt.z / PITCH + (NZ - 1) / 2);
    if (i < 0 || i >= NX || k < 0 || k >= NZ) return null;
    const idx = i * NZ + k;
    const p = atoms[idx].position;
    if (Math.abs(pt.x - p.x) > PITCH * 0.62 || Math.abs(pt.z - p.z) > PITCH * 0.62) return null;
    if (activeSites().indexOf(idx) >= 0) return null;
    return idx;
  }

  /* ── 집기 · 끌기 · 놓기 ────────────────────── */
  function startHold(type, from, at) {
    hold = { type, from, moved: false, px: scene.pointerX, py: scene.pointerY, target: null };
    const d = DOPANTS[type];
    ghost.material.diffuseColor = B().Color3.FromHexString(d.color);
    drawTag(ghostTag, type === 'n' ? '인 P' : '붕소 B', d.color);
    ghost.position.copyFrom(at);
    ghost.position.y = ATOM_Y + 1.0;
    ghost.setEnabled(true);
  }

  function moveHold() {
    const pt = pointerOnPlane(ATOM_Y);
    if (!pt) return;
    if (Math.abs(scene.pointerX - hold.px) > 5 || Math.abs(scene.pointerY - hold.py) > 5) {
      hold.moved = true;
    }
    ghost.position.set(pt.x, ATOM_Y + 1.0, pt.z);
    const idx = nearSite(pt);
    hold.target = idx;
    if (idx === null) {
      dropRing.setEnabled(false);
    } else {
      dropRing.setEnabled(true);
      dropRing.position.set(atoms[idx].position.x, ATOM_Y - 0.55, atoms[idx].position.z);
    }
  }

  function dropHold(canvas) {
    if (hold.target !== null && hold.target !== undefined) {
      insertDopant(hold.target, hold.type);
    } else if (!hold.moved && hold.from === null) {
      // 상자의 원자를 «톡» 누르기만 하면 가운데 빈자리에 들어간다
      const free = nextFreeSite();
      if (free !== null) insertDopant(free, hold.type);
    }
    // 자리를 못 찾으면 상자로 돌아간 것으로 본다 (꽂혀 있던 것은 이미 빠져 있다)
    hold = null;
    ghost.setEnabled(false);
    dropRing.setEnabled(false);
    camera.attachControl(canvas, true);
    update();
    syncPanel();
    if (onChangeCb) onChangeCb();
  }

  /* ── 온도 · 전압 ───────────────────────────── */
  function setTemp(v) {
    const t = Math.max(100, Math.min(800, Math.round(v / 10) * 10));
    if (t === state.temp) return;
    state.temp = t;
    update();
    syncPanel();
    if (onChangeCb) onChangeCb();
  }

  function bumpTemp(d) { setTemp(state.temp + d * 50); }

  function dragTemp() {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(
      new (B().Vector3)(TH_X, 0, TH_Z), new (B().Vector3)(0, 0, 1));
    const d = ray.intersectsPlane(plane);
    if (d === null) return;
    const pt = ray.origin.add(ray.direction.scale(d));
    const f = Math.max(0, Math.min(1, (pt.y - TH_Y0) / (TH_Y1 - TH_Y0)));
    setTemp(100 + f * 700);
  }

  function toggleField() {
    state.field = !state.field;
    update();
    syncPanel();
    if (onChangeCb) onChangeCb();
  }

  /* ── 포인터 ───────────────────────────────── */
  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const mesh = pi.pickInfo && pi.pickInfo.pickedMesh;
      const nm = mesh ? mesh.name : '';

      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced()) return;

        if (nm === 'btnAddTemp') { bumpTemp(+1); return; }
        if (nm === 'btnSubTemp') { bumpTemp(-1); return; }
        if (nm === 'smSwitchBase' || nm === 'smSwitchKnob') { toggleField(); return; }

        if (nm === 'smTempKnob' || nm === 'smThermoTube') {
          grab = true;
          camera.detachControl();
          return;
        }

        // 상자에서 모형 원자를 집는다
        if (nm === 'smTrayN' || nm === 'smTrayP') {
          startHold(nm === 'smTrayN' ? 'n' : 'p', null, mesh.position);
          camera.detachControl();
          return;
        }

        // 격자에 꽂아 둔 불순물 원자를 뽑아 든다
        const idx = mesh ? mesh._atomIdx : undefined;
        if (idx !== undefined && activeSites().indexOf(idx) >= 0) {
          const type = state.doping;
          const at = atoms[idx].position.clone();
          pullDopant(idx);
          startHold(type, idx, at);
          camera.detachControl();
          update();
          syncPanel();
          if (onChangeCb) onChangeCb();
        }
      } else if (pi.type === T.POINTERMOVE) {
        if (grab) dragTemp();
        else if (hold) moveHold();
      } else if (pi.type === T.POINTERUP) {
        if (grab) { grab = null; camera.attachControl(canvas, true); }
        if (hold) dropHold(canvas);
      }
    });
  }

  /** 3D 에서 조작한 결과를 아래쪽 조작 막대에도 그대로 비춘다 */
  function syncPanel() {
    if (!panelRoot) return;
    panelRoot.querySelectorAll('[data-doping]').forEach((b) => {
      b.classList.toggle('on', b.getAttribute('data-doping') === state.doping);
    });
    panelRoot.querySelectorAll('[data-dopecount]').forEach((b) => {
      b.classList.toggle('on', +b.getAttribute('data-dopecount') === state.dopeCount);
    });
    const sl = panelRoot.querySelector('#temp');
    if (sl) sl.value = state.temp;
    const out = panelRoot.querySelector('#tempOut');
    if (out) out.textContent = `${state.temp} K`;
    const f = panelRoot.querySelector('#fieldBtn');
    if (f) {
      f.textContent = state.field ? 'ON' : 'OFF';
      f.classList.toggle('off', !state.field);
    }
  }

  /** 직접 조작 부품의 자리와 겉모습을 갱신한다 */
  function layoutHands() {
    if (!thermoKnob) return;
    const on = allPlaced();

    const f = (state.temp - 100) / 700;
    const h = 0.15 + f * 2.75;
    thermoFill.scaling.y = h;
    thermoFill.position.set(TH_X, 0.4 + h / 2, TH_Z);
    thermoKnob.position.set(TH_X, TH_Y0 + f * (TH_Y1 - TH_Y0), TH_Z);
    drawTag(tempTag, `${state.temp} K`, '#ffd0a0');

    stepT.place(TH_X, 4.45, TH_Z, 0.8);
    stepT.setEnabled(on);

    switchKnob.rotation.x = state.field ? -0.55 : 0.55;
    switchKnob.material.diffuseColor = B().Color3.FromHexString(state.field ? '#4ad8a0' : '#b8c4d4');
    drawTag(switchTag, state.field ? '전압 ON' : '전압 OFF',
      state.field ? '#4ad8a0' : '#8e9bad');

    // 결정을 놓기 전에는 상자와 조절기를 쓸 수 없다
    trayN.setEnabled(on);
    trayP.setEnabled(on);
    if (!on) { dropRing.setEnabled(false); ghost.setEnabled(false); }
  }

  /* ══ 도구 배치 ═══════════════════════════════ */
  function resetTools() {
    placed = {};
    tools.forEach((t) => { placed[t.id] = false; });
    sites = ORDER.slice(0, state.dopeCount);
    hold = null; grab = null;
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    boardMesh.setEnabled(!!placed.board);
    lattice.setEnabled(!!placed.si);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const halfX = (NX + 1) * PITCH / 2, halfZ = (NZ + 1) * PITCH / 2;
    return (Math.abs(point.x) <= halfX && Math.abs(point.z) <= halfZ) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  /** 어느 자리를 불순물로 바꿀지 — 학생이 고른 자리, 없으면 가운데 쪽부터 고른다 */
  function dopedIndices() {
    if (state.doping === 'pure' || !placed.dopant) return [];
    // 아래쪽 «바꿔 넣은 원자 수» 를 건드리면 기본 순서대로 다시 배치한다
    if (sites.length !== state.dopeCount) sites = ORDER.slice(0, state.dopeCount);
    return sites;
  }

  function update() {
    if (!scene) return;
    const d = DOPANTS[state.doping];
    const doped = dopedIndices();

    atoms.forEach((g, idx) => {
      const isDoped = doped.includes(idx);
      const valence = isDoped ? d.valence : 4;
      const label = isDoped ? d.atom.replace(/\s*\(.*\)/, '') : 'Si';
      const color = isDoped ? d.color : '#8e9bad';

      g._core.material.diffuseColor = B().Color3.FromHexString(color);
      drawAtomLabel(g, label === '인' ? 'P' : label === '붕소' ? 'B' : 'Si',
        isDoped ? '#0f141b' : '#ffffff');

      // 원자가 전자 개수만큼만 보인다
      g._els.forEach((s, e) => {
        s.setEnabled(e < valence);
        // 5 번째 전자(남는 전자)는 초록으로, 부족한 자리는 표시하지 않는다
        s.material.emissiveColor = (isDoped && state.doping === 'n' && e === 4)
          ? B().Color3.FromHexString('#4ad8a0')
          : B().Color3.FromHexString('#5ad0f0');
      });
    });

    // 자유 운반자 개수
    const n = placed.si
      ? Math.min(carriers.length,
        Math.round(thermalCarriers() * 4e5 + dopedCarriers() * 6))
      : 0;
    carriers.forEach((c, i) => {
      c.setEnabled(i < n);
      // n형은 전자(파랑), p형은 양공(주황)
      c._mat.emissiveColor = B().Color3.FromHexString(
        state.doping === 'p' ? '#e8a14a' : '#5ad0f0');
    });

    layoutHands();
  }

  /** 자유 운반자가 떠다니는 애니메이션 */
  function tick(dt) {
    const halfX = NX * PITCH / 2, halfZ = NZ * PITCH / 2;
    // 전압을 걸면 한 방향으로 흐른다
    const drift = state.field ? (state.doping === 'p' ? -3.2 : 3.2) : 0;
    carriers.forEach((c) => {
      if (!c.isEnabled()) return;
      c._x += (c._vx + drift) * dt;
      c._z += c._vz * dt;
      if (c._x > halfX) c._x = -halfX;
      if (c._x < -halfX) c._x = halfX;
      if (Math.abs(c._z) > halfZ) c._vz *= -1;
      c.position.set(c._x, ATOM_Y + 1.4, c._z);
    });
    return false;
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = 0.72;
    camera.radius = 22;
    camera.setTarget(new (B().Vector3)(0, 1.0, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '왼쪽 <b>원자 상자</b>의 인(P)·붕소(B) 모형을 끌어다 규소 자리에 붙여 보세요. 짝을 못 이룬 전자와 빈자리가 어떤 역할을 할까요?';
  const prepGuide = '점선으로 표시된 자리에 칠판·규소 원자·불순물 원자를 끌어다 놓으세요.';

  function controlsHTML() {
    return `
      ${LabUI.opts('반도체의<br>종류', 'doping', [
        { v: 'pure', t: '순수 (Si 4개)' },
        { v: 'n', t: 'n형 (인 5개)' },
        { v: 'p', t: 'p형 (붕소 3개)' },
      ], state.doping, 2)}
      ${LabUI.opts('바꿔 넣은<br>원자 수', 'dopecount', [
        { v: 1, t: '1 개' }, { v: 2, t: '2 개' }, { v: 3, t: '3 개' },
        { v: 4, t: '4 개' }, { v: 5, t: '5 개' }, { v: 6, t: '6 개' },
      ], state.dopeCount, 2)}
      ${LabUI.slider('temp', '온도<br><i>T</i>',
        { min: 100, max: 800, step: 10, value: state.temp, fmt: (v) => `${v} K` })}
      <div class="control">
        <div class="clabel">전압<br>걸기</div>
        <button class="power${state.field ? '' : ' off'}" id="fieldBtn">${state.field ? 'ON' : 'OFF'}</button>
      </div>
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          왼쪽 <b>원자 상자</b>의 인(P)·붕소(B) 모형을 집어 규소 자리에 <b>끌어다 붙입니다</b>
          (톡 누르면 가운데 빈자리로 들어갑니다). 꽂아 둔 원자를 다시 집어 격자 밖으로 끌어내면
          규소로 돌아갑니다. 오른쪽 <b>온도계 손잡이</b>를 위아래로 끌거나 <b>＋/－</b>로 온도를,
          앞쪽 <b>스위치</b>를 눌러 전압을 바꿉니다.
        </p></div>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록
    panelRoot = root;
    LabUI.bindOpts(root, 'doping', state, 'doping', onChange, String);
    LabUI.bindOpts(root, 'dopecount', state, 'dopeCount', onChange);
    LabUI.bindSlider(root, 'temp', state, 'temp', (v) => `${v} K`, onChange);

    const f = root.querySelector('#fieldBtn');
    f.addEventListener('click', () => {
      state.field = !state.field;
      f.textContent = state.field ? 'ON' : 'OFF';
      f.classList.toggle('off', !state.field);
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const d = DOPANTS[state.doping];
    const kT = 8.617e-5 * state.temp;
    const sigma = conductivity();

    return `
      <div class="row"><span>반도체</span><span class="tag ${d.tag}">${d.name}</span></div>
      <div class="row"><span>바탕 원자</span><b>규소 Si (원자가 4)</b></div>
      ${state.doping !== 'pure' ? `
        <div class="row"><span>넣은 원자</span><b>${d.atom} (원자가 ${d.valence})</b></div>
        <div class="row"><span>바꾼 개수</span><b>${state.dopeCount} 개</b></div>` : ''}

      <div class="sec">에너지띠</div>
      <div class="row"><span>띠 간격 <i>E</i><sub>g</sub></span><b>${GAPS.semi} eV</b></div>
      <div class="row"><span>열에너지 <i>kT</i></span><b>${(kT * 1000).toFixed(1)} meV</b></div>
      <div class="row"><span>온도</span><b>${state.temp} K</b></div>

      <div class="sec">전하 운반자</div>
      <div class="row"><span>주된 운반자</span><b>${d.carrier}</b></div>
      <div class="row"><span>운반자 종류</span>
        <b style="color:${state.doping === 'p' ? '#d8802f' : '#2f8fbf'}">${
          state.doping === 'p' ? '양공 (+)' : '전자 (−)'}</b></div>
      <div class="row"><span>상대 전도도</span><b class="big">${fmtSigma(sigma)}</b></div>
      <div class="row"><span>도핑으로 늘어난 배</span>
        <b>${state.doping === 'pure' ? '—'
          : `약 ${(sigma / Math.max(1e-12, thermalCarriers() * 1e6)).toExponential(0)} 배`}</b></div>
      <div class="formula">순수 반도체는 온도가 오르면 전도도가 <b>커집니다</b>
        (금속과 반대)</div>
      <div class="formula" style="color:#62718a">${
        state.doping === 'n' ? '5 번째 전자는 결합에 쓰이지 못하고 <b>자유롭게 돌아다닙니다.</b>'
        : state.doping === 'p' ? '전자가 하나 모자라 <b>빈자리(양공)</b> 가 생기고, 옆 전자가 채우며 이동합니다.'
        : '열에너지로 결합이 끊길 때만 <b>전자–양공 쌍</b> 이 생깁니다.'}</div>`;
  }

  /* ══ 그래프 — 에너지띠 구조 ═════════════════ */
  const graphTitle = '에너지띠 구조 비교';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const items = [
      { key: 'conductor', name: '도체', gap: 0, note: '띠가 겹침' },
      { key: 'semi', name: '반도체', gap: GAPS.semi, note: `${GAPS.semi} eV` },
      { key: 'insulator', name: '절연체', gap: GAPS.insulator, note: `${GAPS.insulator} eV` },
    ];

    const padT = 26, padB = 30;
    const gh = H - padT - padB;
    const colW = (W - 40) / 3;
    const maxGap = 6;

    items.forEach((it, i) => {
      const x = 20 + i * colW + 12;
      const w = colW - 24;
      const highlight = it.key === 'semi';

      // 원자가 띠 (아래) — 전자로 꽉 차 있다
      const gapPx = (it.gap / maxGap) * gh * 0.6;
      const bandH = (gh - gapPx) / 2;
      const valTop = padT + gh - bandH;

      ctx.globalAlpha = highlight ? 1 : 0.5;
      ctx.fillStyle = '#2f6ad0';
      ctx.fillRect(x, valTop, w, bandH);
      ctx.fillStyle = '#8fb0e0';
      ctx.font = 'bold 10px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (bandH > 16) ctx.fillText('원자가 띠', x + w / 2, valTop + bandH / 2);

      // 전도띠 (위) — 비어 있다
      ctx.fillStyle = '#5b6675';
      ctx.fillRect(x, padT, w, bandH);
      ctx.fillStyle = '#cfd8e4';
      if (bandH > 16) ctx.fillText('전도띠', x + w / 2, padT + bandH / 2);

      // 띠 간격
      if (gapPx > 2) {
        ctx.strokeStyle = highlight ? '#ffd84a' : '#5b667588';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x + w / 2, padT + bandH); ctx.lineTo(x + w / 2, valTop);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = highlight ? '#ffd84a' : '#8e9bad';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(it.note, x + w / 2, padT + bandH + gapPx / 2);
      } else {
        ctx.fillStyle = '#4ad8a0';
        ctx.font = 'bold 9px "Noto Sans KR", sans-serif';
        ctx.fillText(it.note, x + w / 2, padT + bandH + 4);
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = highlight ? '#ffd84a' : '#9fb0c2';
      ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(it.name, x + w / 2, padT + gh + 6);
    });

    // 반도체 칸에 도핑 준위와 올라간 전자를 표시
    const x = 20 + colW + 12, w = colW - 24;
    const gapPx = (GAPS.semi / maxGap) * gh * 0.6;
    const bandH = (gh - gapPx) / 2;
    const condBot = padT + bandH, valTop = padT + gh - bandH;

    // 준위 선은 칸의 왼쪽 절반에만 긋고 이름표를 그 끝에 붙여
    // 가운데의 띠 간격 숫자(1.12 eV)와 겹치지 않게 한다
    if (state.doping === 'n') {
      const y = condBot + gapPx * 0.2;
      ctx.strokeStyle = '#4ad8a0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + w * 0.42, y); ctx.stroke();
      ctx.fillStyle = '#4ad8a0';
      ctx.font = 'bold 9px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('주개 준위', x + 6, y - 3);
    } else if (state.doping === 'p') {
      const y = valTop - gapPx * 0.2;
      ctx.strokeStyle = '#e8a14a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + w * 0.42, y); ctx.stroke();
      ctx.fillStyle = '#e8a14a';
      ctx.font = 'bold 9px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('받개 준위', x + 6, y + 3);
    }

    // 온도가 높으면 전도띠에 전자가 보인다
    const nUp = Math.min(6, Math.round(thermalCarriers() * 3e5));
    ctx.fillStyle = '#5ad0f0';
    for (let i = 0; i < nUp; i++) {
      ctx.beginPath();
      ctx.arc(x + 14 + (i * (w - 28)) / 5, condBot - 7, 2.8, 0, 7);
      ctx.fill();
    }

    ctx.fillStyle = '#cfe0f2';
    ctx.font = 'bold 11px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('띠 간격이 좁을수록 전자가 전도띠로 잘 올라간다', W / 2, 5);
  }

  function graphFootHTML() {
    const d = DOPANTS[state.doping];
    return state.doping === 'pure'
      ? `순수 반도체는 <b>온도가 오를수록</b> 전자가 전도띠로 올라가 전도도가 커집니다`
      : state.doping === 'n'
        ? `인의 5 번째 전자가 <b>전도띠 바로 아래(주개 준위)</b> 에 놓여 쉽게 자유 전자가 됩니다`
        : `붕소는 전자가 하나 부족해 <b>원자가 띠 바로 위(받개 준위)</b> 에 양공을 만듭니다`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '종류', '넣은 원자', '원자가 전자', '주된 운반자', '온도 (K)', '상대 전도도',
  ];

  function recordRow() {
    const d = DOPANTS[state.doping];
    return [
      d.name,
      state.doping === 'pure' ? '없음' : `${d.atom} × ${state.dopeCount}`,
      state.doping === 'pure' ? '4' : String(d.valence),
      d.carrier, String(state.temp), fmtSigma(conductivity()),
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 순수 반도체 관찰 · 1 n형 도핑 · 2 p형 도핑 · 3 온도 올려 전도도 비교
     4 세 가지 모두 기록                                                   */
  const mis = { seen: {}, hiT: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    mis.seen[state.doping] = true;
    if (state.temp >= 400) mis.hiT = true;
    if (i === 0) return state.doping === 'pure' && state.field;
    if (i === 1) return !!mis.seen.n;
    if (i === 2) return !!mis.seen.p;
    if (i === 3) return mis.hiT;
    if (i === 4) return new Set(recs().map((r) => String(r[0]))).size >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'semiconductor',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '반도체를 모형으로 나타내기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, conductivity, thermalCarriers,
    get scene() { return scene; },
  };
})();
