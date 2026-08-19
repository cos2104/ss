/**
 * 축전기의 충전과 방전 — 실제 회로 (비상교육 고등 물리학 II-1-03, 82쪽 해 보기)
 *
 * 회로 모드 — 전지·칼날 스위치·저항·축전기·LED 를 실제 도선으로 연결한 회로.
 *   스위치 A: 전지가 저항을 거쳐 축전기를 충전 (V = V₀(1−e^(−t/RC)))
 *   스위치 열림: 전하가 보존되어 전압 유지
 *   스위치 B: 축전기가 LED 를 통해 방전 (V = V₀e^(−t/R'C)) — LED 가 켜진다!
 *   LED 를 거꾸로 끼우면 방전되지 않는다 (다이오드의 극성).
 * 내부 모드 — 평행판의 넓이 A 와 간격 d 를 바꿔 C = ε₀A/d 를 확인.
 */
const CapacitorScene = (() => {
  const B = () => BABYLON;

  const R_CHG = 2200;            // 충전 저항 (Ω)
  const R_DIS = 3000;            // 방전 경로 저항 (저항 + LED, Ω)
  const EPS0 = 8.854e-12;        // 진공 유전율 (F/m)
  const WY = 0.32;               // 도선 높이

  let scene, camera;
  let batteryG, switchG, lever, capG, plateTexA, plateTexB, ledG, ledDome, ledLbl;
  let resistorG, wiresG, fieldArrows = [], dots = [];
  let insideG, inPlateA, inPlateB, inArrows = [], inChargeTexA, inChargeTexB;
  let placed = {};

  const state = {
    mode: 'circuit',     // 'circuit' | 'inside'
    volt: 3.0,           // 전지 전압 (V)
    cap: 1000,           // 축전기 용량 (μF)
    sw: 'open',          // 'chg' | 'open' | 'dis'
    ledDir: 1,           // 1 정방향, -1 역방향
    areaCm2: 100,        // 내부 모드: 판 넓이 (cm²)
    gapMm: 4,            // 내부 모드: 판 간격 (mm)
    running: true,
  };

  let sim = null;

  const tools = [
    { id: 'battT', label: '전지 홀더 (AA×2)', icon: 'battery' },
    { id: 'swT', label: '칼날 스위치', icon: 'switchSw' },
    { id: 'capT', label: '축전기', icon: 'voltmeter' },
    { id: 'ledT', label: 'LED', icon: 'led' },
  ];
  const slots = {
    battT: { name: '왼쪽 (전지)' },
    swT: { name: '위 가운데 (스위치)' },
    capT: { name: '가운데 (축전기)' },
    ledT: { name: '오른쪽 (LED)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  const tauChg = () => R_CHG * state.cap * 1e-6;           // s
  const tauDis = () => R_DIS * state.cap * 1e-6;
  /** 내부 모드: C = ε₀A/d */
  const insideC = () => EPS0 * (state.areaCm2 * 1e-4) / (state.gapMm * 1e-3);   // F
  const insideQ = () => insideC() * state.volt;
  const insideU = () => 0.5 * insideC() * state.volt * state.volt;

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c9dff2ff');

    camera = new (B().ArcRotateCamera)(
      'camCp', -Math.PI / 2, 0.72, 13.5, new (B().Vector3)(0, 0.6, 0.4), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 30;
    camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hcp', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.45, 0.48, 0.52);
    const dir = new (B().DirectionalLight)('dcp', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 14, -9);
    dir.intensity = 0.32;
    const glow = new (B().GlowLayer)('cpGlow', scene);
    glow.intensity = 0.55;

    // 실험대 + 회로판 (항상 보이는 배경)
    const table = B().MeshBuilder.CreateBox('cpTable', { width: 24, height: 0.6, depth: 14 }, scene);
    table.position.y = -0.5;
    table.material = mat('cpTableMat', '#9aa3ad', '#c6ccd3', 96);
    const board = B().MeshBuilder.CreateBox('cpBoard', { width: 11.5, height: 0.24, depth: 8.4 }, scene);
    board.position.set(0, -0.08, 0.4);
    board.material = mat('cpBoardMat', '#c8a86a', '#e8d0a0', 48);

    buildBattery();
    buildSwitch();
    buildCapacitor();
    buildLED();
    buildResistor();
    buildWires();
    buildInside();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/capacitor.jpg', { x: -8, y: 0, z: 5, ry: 0.3 });

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

  /** 전지 홀더 — AA 2개, +/− 단자 표시. 세로 방향(왼쪽 기둥) */
  function buildBattery() {
    batteryG = new (B().TransformNode)('cpBatt', scene);
    const holder = B().MeshBuilder.CreateBox('cpBattH', { width: 1.5, height: 0.5, depth: 2.6 }, scene);
    holder.position.set(-3.5, 0.28, 1.2);
    holder.material = mat('cpBattHM', '#20262f', '#5a6a80', 64);
    holder.parent = batteryG;
    [0.35, -0.35].forEach((dx, i) => {
      const cell = B().MeshBuilder.CreateCylinder('cpCell' + i, { height: 2.2, diameter: 0.52 }, scene);
      cell.rotation.x = Math.PI / 2;
      cell.position.set(-3.5 + dx, 0.62, 1.2);
      cell.material = mat('cpCellM' + i, '#d8b44a', '#ffe8a0', 96);
      cell.parent = batteryG;
      const cap2 = B().MeshBuilder.CreateCylinder('cpCellC' + i, { height: 0.14, diameter: 0.2 }, scene);
      cap2.rotation.x = Math.PI / 2;
      cap2.position.set(-3.5 + dx, 0.62, 1.2 + (i === 0 ? 1.17 : -1.17));
      cap2.material = mat('cpCellCM' + i, '#8a93a6', '#dfe4ee', 96);
      cap2.parent = batteryG;
    });
    // +/− 라벨
    const lbl = B().MeshBuilder.CreatePlane('cpBattL', { width: 1.7, height: 0.5 }, scene);
    lbl.position.set(-3.5, 1.3, 1.2);
    lbl.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const t = new (B().DynamicTexture)('cpBattLT', { width: 256, height: 76 }, scene, true);
    const c = t.getContext();
    c.clearRect(0, 0, 256, 76);
    c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#d0453a'; c.fillText('+', 218, 40);
    c.fillStyle = '#2f6ad0'; c.fillText('−', 38, 40);
    c.fillStyle = '#3c4756'; c.font = 'bold 30px sans-serif';
    c.fillText('3 V', 128, 40);
    t.hasAlpha = true; t.update();
    const m = new (B().StandardMaterial)('cpBattLM', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    lbl.material = m;
    lbl.parent = batteryG;
    batteryG._lblTex = t;
  }

  /** 칼날 스위치 — 공통 단자에서 A(충전)/B(방전) 접점으로 젖히는 레버 */
  function buildSwitch() {
    switchG = new (B().TransformNode)('cpSw', scene);
    const base = B().MeshBuilder.CreateBox('cpSwB', { width: 2.6, height: 0.18, depth: 1.5 }, scene);
    base.position.set(0, 0.13, 3.1);
    base.material = mat('cpSwBM', '#e8e2d0', '#fff', 48);
    base.parent = switchG;
    // 접점 기둥: 공통(가운데 앞) · A(왼쪽 뒤) · B(오른쪽 뒤)
    const post = (x, z, hex, name) => {
      const p = B().MeshBuilder.CreateCylinder('cpSwP' + name, { height: 0.42, diameter: 0.22 }, scene);
      p.position.set(x, 0.42, z);
      p.material = mat('cpSwPM' + name, hex, '#ffe8a0', 96);
      p.parent = switchG;
      return p;
    };
    post(0, 2.6, '#b8862e', 'C');
    post(-0.85, 3.5, '#b8862e', 'A');
    post(0.85, 3.5, '#b8862e', 'B');
    // 라벨 A(충전) / B(방전)
    const lbl = B().MeshBuilder.CreatePlane('cpSwL', { width: 2.6, height: 0.5 }, scene);
    lbl.position.set(0, 0.95, 3.8);
    const t = new (B().DynamicTexture)('cpSwLT', { width: 360, height: 70 }, scene, true);
    const c = t.getContext();
    c.clearRect(0, 0, 360, 70);
    c.font = 'bold 32px "Noto Sans KR", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#d0453a'; c.fillText('A 충전', 70, 36);
    c.fillStyle = '#2f9e6b'; c.fillText('B 방전', 290, 36);
    t.hasAlpha = true; t.update();
    const m = new (B().StandardMaterial)('cpSwLM', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    lbl.material = m;
    lbl.parent = switchG;
    // 레버 (칼날) — 공통 단자에서 회전
    lever = B().MeshBuilder.CreateBox('cpSwLever', { width: 0.16, height: 0.1, depth: 1.15 }, scene);
    lever.setPivotPoint(new (B().Vector3)(0, 0, -0.55));
    lever.position.set(0, 0.6, 3.18);
    lever.material = mat('cpSwLM2', '#39424f', '#9fb0c2', 96);
    lever.parent = switchG;
    const knob = B().MeshBuilder.CreateSphere('cpSwKnob', { diameter: 0.24 }, scene);
    knob.position.set(0, 0.12, 0.55);
    knob.material = mat('cpSwKM', '#20262f');
    knob.parent = lever;
  }

  /** 축전기 — 두 판이 보이는 평행판형. 가운데 세로 가지에 위치 */
  function buildCapacitor() {
    capG = new (B().TransformNode)('cpCap', scene);
    const mk = (z, name) => {
      const p = B().MeshBuilder.CreateBox('cpPlate' + name, { width: 1.7, height: 1.5, depth: 0.08 }, scene);
      p.position.set(0, 0.95, z);
      p.material = mat('cpPlateM' + name, '#aab6c8', '#e8f0fa', 96);
      p.parent = capG;
      // 안쪽 면의 전하 표시
      const face = B().MeshBuilder.CreatePlane('cpPlateF' + name, { width: 1.6, height: 1.4 }, scene);
      face.position.set(0, 0.95, z + (name === 'A' ? 0.05 : -0.05));
      if (name === 'B') face.rotation.y = Math.PI;
      const t = new (B().DynamicTexture)('cpPlateT' + name, { width: 220, height: 190 }, scene, true);
      const m = new (B().StandardMaterial)('cpPlateFM' + name, scene);
      m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.backFaceCulling = false;
      face.material = m;
      face.parent = capG;
      return t;
    };
    plateTexA = mk(-0.25, 'A');   // 위쪽(스위치 쪽) 판
    plateTexB = mk(-0.85, 'B');   // 아래쪽(전지 − 쪽) 판
    // 판 사이 전기장 화살표
    for (let i = 0; i < 3; i++) {
      const a = B().MeshBuilder.CreateCylinder('cpFld' + i,
        { height: 0.4, diameterTop: 0, diameterBottom: 0.12 }, scene);
      a.rotation.x = Math.PI;             // −z 방향(A판 → B판)
      a.position.set(-0.5 + i * 0.5, 0.95, -0.55);
      a.rotation.x = -Math.PI / 2;
      a.material = emat('cpFldM' + i, '#ffd84a', 0.9);
      a.parent = capG;
      fieldArrows.push(a);
    }
    // 용량 라벨
    const lbl = B().MeshBuilder.CreatePlane('cpCapL', { width: 1.9, height: 0.45 }, scene);
    lbl.position.set(0, 2.0, -0.55);
    lbl.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const t = new (B().DynamicTexture)('cpCapLT', { width: 300, height: 64 }, scene, true);
    capG._lblTex = t;
    const m = new (B().StandardMaterial)('cpCapLM', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    lbl.material = m;
    lbl.parent = capG;
  }

  function drawCapLabel() {
    const t = capG._lblTex;
    const c = t.getContext();
    c.clearRect(0, 0, 300, 64);
    c.fillStyle = '#3c4756';
    c.font = 'bold 36px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`C = ${state.cap} μF`, 150, 34);
    t.update();
  }

  /** 판 위 전하 기호 — 개수가 Q 에 비례 */
  function drawPlateCharges() {
    const V = sim ? sim.V : 0;
    const frac = Math.min(1, V / 4.5);
    const n = Math.round(frac * 12);
    const draw = (tex, sign) => {
      const c = tex.getContext();
      c.clearRect(0, 0, 220, 190);
      c.font = 'bold 34px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = sign > 0 ? '#d0453a' : '#2f6ad0';
      for (let i = 0; i < n; i++) {
        const col = i % 4, row = Math.floor(i / 4);
        c.fillText(sign > 0 ? '+' : '−', 35 + col * 50, 35 + row * 55);
      }
      tex.update();
    };
    draw(plateTexA, +1);
    draw(plateTexB, -1);
    fieldArrows.forEach((a) => { a.material.alpha = 0.15 + frac * 0.85; a.setEnabled(frac > 0.03); });
  }

  /** LED — 돔 + 다리 2개, 극성. 오른쪽 세로 가지 */
  function buildLED() {
    ledG = new (B().TransformNode)('cpLed', scene);
    ledDome = B().MeshBuilder.CreateSphere('cpLedD', {
      diameter: 0.62, slice: 0.5,
    }, scene);
    ledDome.position.set(3.5, 1.15, 0.2);
    const dm = new (B().StandardMaterial)('cpLedDM', scene);
    dm.diffuseColor = B().Color3.FromHexString('#b83a30');
    dm.alpha = 0.85;
    ledDome.material = dm;
    ledDome.parent = ledG;
    const body = B().MeshBuilder.CreateCylinder('cpLedB', { height: 0.34, diameter: 0.62 }, scene);
    body.position.set(3.5, 0.98, 0.2);
    const bm = new (B().StandardMaterial)('cpLedBM', scene);
    bm.diffuseColor = B().Color3.FromHexString('#b83a30');
    bm.alpha = 0.85;
    body.material = bm;
    body.parent = ledG;
    ledG._domeMat = dm; ledG._bodyMat = bm;
    // 다리 2개 — 긴 쪽이 (+) 애노드
    [[0.14, 0.8, 'A'], [-0.14, 0.62, 'K']].forEach(([dz, h, n2]) => {
      const leg = B().MeshBuilder.CreateCylinder('cpLedLeg' + n2, { height: h, diameter: 0.05 }, scene);
      leg.position.set(3.5, 0.81 - h / 2 + 0.0, 0.2 + dz);
      leg.material = mat('cpLedLegM' + n2, '#8a93a6', '#dfe4ee', 96);
      leg.parent = ledG;
    });
    // 극성 라벨 (방향에 따라 갱신)
    ledLbl = B().MeshBuilder.CreatePlane('cpLedL', { width: 1.7, height: 0.45 }, scene);
    ledLbl.position.set(3.5, 1.75, 0.2);
    ledLbl.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const t = new (B().DynamicTexture)('cpLedLT', { width: 280, height: 64 }, scene, true);
    ledG._lblTex = t;
    const m = new (B().StandardMaterial)('cpLedLM', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    ledLbl.material = m;
    ledLbl.parent = ledG;
  }

  function drawLedLabel() {
    const t = ledG._lblTex;
    const c = t.getContext();
    c.clearRect(0, 0, 280, 64);
    c.font = 'bold 30px "Noto Sans KR", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#3c4756';
    c.fillText(state.ledDir > 0 ? 'LED (정방향)' : 'LED (거꾸로!)', 140, 32);
    t.update();
  }

  /** LED 점등 — 방전 전류에 비례해 밝아진다 */
  function setLedGlow(I) {
    const k = Math.min(1, Math.abs(I) / 1.2);
    if (k > 0.02) {
      ledG._domeMat.emissiveColor = new (B().Color3)(1.0 * k, 0.25 * k, 0.18 * k);
      ledG._bodyMat.emissiveColor = new (B().Color3)(0.8 * k, 0.2 * k, 0.14 * k);
    } else {
      ledG._domeMat.emissiveColor = new (B().Color3)(0, 0, 0);
      ledG._bodyMat.emissiveColor = new (B().Color3)(0, 0, 0);
    }
  }

  /** 색띠 저항 — 세로 가지 위쪽 */
  function buildResistor() {
    resistorG = new (B().TransformNode)('cpRes', scene);
    const body = B().MeshBuilder.CreateCylinder('cpResB', { height: 1.0, diameter: 0.34 }, scene);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, WY, 1.45);
    body.material = mat('cpResBM', '#d8c9a0', '#f0e8d0', 48);
    body.parent = resistorG;
    // 색띠: 빨강-빨강-빨강 (2.2 kΩ)
    ['#d0453a', '#d0453a', '#d0453a', '#c8a020'].forEach((hex, i) => {
      const band = B().MeshBuilder.CreateTorus('cpResBand' + i, { diameter: 0.36, thickness: 0.05 }, scene);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, WY, 1.75 - i * 0.2);
      band.material = mat('cpResBandM' + i, hex);
      band.parent = resistorG;
    });
    const lbl = B().MeshBuilder.CreatePlane('cpResL', { width: 1.6, height: 0.4 }, scene);
    lbl.position.set(-1.15, 0.75, 1.45);
    lbl.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const t = new (B().DynamicTexture)('cpResLT', { width: 240, height: 56 }, scene, true);
    const c = t.getContext();
    c.clearRect(0, 0, 240, 56);
    c.fillStyle = '#3c4756';
    c.font = 'bold 30px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('R = 2.2 kΩ', 120, 30);
    t.hasAlpha = true; t.update();
    const m = new (B().StandardMaterial)('cpResLM', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    lbl.material = m;
    lbl.parent = resistorG;
  }

  /* ── 도선 — 부품을 실제로 잇는다. 배치가 끝나면 «회로 완성» ── */
  // 충전 루프: 전지+ → A극 → 공통 → 저항 → 축전기 A판 → B판 → 전지−
  const PATH_CHG = [
    [-3.5, 2.35], [-3.5, 3.5], [-0.85, 3.5],           // 전지+ → A 접점
    [0, 2.6],                                           // 레버 → 공통
    [0, 1.95], [0, -0.25],                              // 저항 거쳐 A판
    [0, -0.85],                                         // (판 사이는 점프하지 않음 — 전하만 쌓임)
    [0, -2.4], [-3.5, -2.4], [-3.5, 0.05],              // B판 → 전지−
  ];
  // 방전 루프: 축전기 A판 → 저항 → 공통 → B극 → LED → 아래 레일 → B판
  const PATH_DIS = [
    [0, -0.25], [0, 1.95],
    [0, 2.6], [0.85, 3.5],                              // 공통 → B 접점
    [3.5, 3.5], [3.5, 1.45],                            // LED 위
    [3.5, -0.4], [3.5, -2.4], [0, -2.4], [0, -0.85],    // LED 아래 → B판
  ];

  function seg(a, b, parent, name) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const w = B().MeshBuilder.CreateCylinder(name, { height: len, diameter: 0.09 }, scene);
    w.position.set((a[0] + b[0]) / 2, WY, (a[1] + b[1]) / 2);
    w.rotation.x = Math.PI / 2;
    w.rotation.y = Math.atan2(dx, dz);
    w.material = mat(name + 'M', '#c0392b', '#f0a08a', 96);
    w.parent = parent;
    return w;
  }

  function buildWires() {
    wiresG = new (B().TransformNode)('cpWires', scene);
    const runs = (path, tag) => {
      for (let i = 0; i < path.length - 1; i++) {
        // 판 사이 구간(축전기 내부)은 도선을 두지 않는다
        if (tag === 'c' && i === 5) continue;
        seg(path[i], path[i + 1], wiresG, 'cpW' + tag + i);
      }
    };
    runs(PATH_CHG, 'c');
    runs(PATH_DIS, 'd');
    // 전류 표시 점
    for (let i = 0; i < 7; i++) {
      const d = B().MeshBuilder.CreateSphere('cpDot' + i, { diameter: 0.16 }, scene);
      d.material = emat('cpDotM' + i, '#ffd84a');
      d.isPickable = false;
      d.parent = wiresG;
      dots.push({ m: d, u: i / 7 });
    }
  }

  /** 경로를 따라 u(0~1) 위치의 좌표 */
  function pathPoint(path, u, skipGap) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      if (skipGap && i === 5) continue;
      const L = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      segs.push([i, L]); total += L;
    }
    let d = u * total;
    for (const [i, L] of segs) {
      if (d <= L) {
        const t = d / L;
        return [path[i][0] + (path[i + 1][0] - path[i][0]) * t,
                path[i][1] + (path[i + 1][1] - path[i][1]) * t];
      }
      d -= L;
    }
    return path[path.length - 1];
  }

  /* ── 내부 모드 — 큰 평행판 (C = ε₀A/d) ── */
  function buildInside() {
    insideG = new (B().TransformNode)('cpInside', scene);
    const mk = (name) => {
      const p = B().MeshBuilder.CreateBox('cpInP' + name, { width: 3.2, height: 3.2, depth: 0.14 }, scene);
      p.material = mat('cpInPM' + name, '#aab6c8', '#e8f0fa', 96);
      p.parent = insideG;
      const face = B().MeshBuilder.CreatePlane('cpInF' + name, { width: 3.0, height: 3.0 }, scene);
      if (name === 'B') face.rotation.y = Math.PI;
      const t = new (B().DynamicTexture)('cpInT' + name, { width: 250, height: 250 }, scene, true);
      const m = new (B().StandardMaterial)('cpInFM' + name, scene);
      m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.backFaceCulling = false;
      face.material = m;
      face.parent = insideG;
      return [p, face, t];
    };
    [inPlateA, insideG._faceA, inChargeTexA] = mk('A');
    [inPlateB, insideG._faceB, inChargeTexB] = mk('B');
    for (let i = 0; i < 9; i++) {
      const a = B().MeshBuilder.CreateCylinder('cpInAr' + i,
        { height: 0.5, diameterTop: 0, diameterBottom: 0.14 }, scene);
      a.rotation.x = -Math.PI / 2;
      a.material = emat('cpInArM' + i, '#ffd84a', 0.9);
      a.parent = insideG;
      inArrows.push(a);
    }
    insideG.position.set(0, 1.9, 0.6);
  }

  function layoutInside() {
    const gapU = 0.35 + (state.gapMm / 10) * 1.6;             // 표시 간격
    const sizeU = 0.6 + Math.sqrt(state.areaCm2 / 200) * 0.7; // 표시 크기 배율
    inPlateA.position.z = -gapU / 2; insideG._faceA.position.z = -gapU / 2 + 0.08;
    inPlateB.position.z = gapU / 2;  insideG._faceB.position.z = gapU / 2 - 0.08;
    [inPlateA, insideG._faceA, inPlateB, insideG._faceB].forEach((p) => {
      p.scaling.x = sizeU; p.scaling.y = sizeU;
    });
    const frac = Math.min(1, insideC() / 4.5e-10);
    inArrows.forEach((a, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      a.position.set((-1 + col) * sizeU, (-1 + row) * sizeU, 0);
      a.scaling.y = gapU / 0.5 * 0.7;
      a.setEnabled(true);
    });
    // 전하 기호: Q = CV 에 비례
    const n = Math.max(1, Math.round(frac * 16));
    const draw = (tex, sign) => {
      const c = tex.getContext();
      c.clearRect(0, 0, 250, 250);
      c.font = 'bold 36px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = sign > 0 ? '#d0453a' : '#2f6ad0';
      for (let i = 0; i < n; i++) {
        const col = i % 4, row = Math.floor(i / 4);
        c.fillText(sign > 0 ? '+' : '−', 40 + col * 56, 40 + row * 56);
      }
      tex.update();
    };
    draw(inChargeTexA, +1);
    draw(inChargeTexB, -1);
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      battT: { x: -3.5, z: 1.2, w: 2.6, h: 3.4, label: '전지 홀더' },
      swT: { x: 0, z: 3.1, w: 3.2, h: 2.0, label: '칼날 스위치' },
      capT: { x: 0, z: -0.55, w: 2.6, h: 2.2, label: '축전기' },
      ledT: { x: 3.5, z: 0.2, w: 2.2, h: 2.2, label: 'LED' },
    };
    Object.entries(spec).forEach(([id, c2]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c2.w, height: c2.h }, scene);
      p.position.set(c2.x, 0.06, c2.z);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c2.w, c2.h, c2.label, { mirror: false, color: '#2f6ad0' });
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
    return (Math.abs(point.x - c.x) <= 2.6 && Math.abs(point.z - c.z) <= 2.4) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    sim = { t: 0, V: 0, I: 0, hist: [{ t: 0, V: 0, I: 0 }], phaseT: 0 };
    state.sw = 'open';
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const circ = state.mode === 'circuit';

    // 부품은 놓는 대로 하나씩, 도선·저항·전류점은 회로가 완성되면 나타난다
    batteryG.setEnabled(circ && !!placed.battT);
    switchG.setEnabled(circ && !!placed.swT);
    capG.setEnabled(circ && !!placed.capT);
    ledG.setEnabled(circ && !!placed.ledT);
    resistorG.setEnabled(circ && all);
    wiresG.setEnabled(circ && all);
    insideG.setEnabled(!circ);
    if (!circ) { layoutInside(); return; }
    if (!all) return;

    // 레버 위치: A(충전, 왼쪽) / 열림 / B(방전, 오른쪽)
    lever.rotation.y = state.sw === 'chg' ? -0.72 : state.sw === 'dis' ? 0.72 : 0;
    lever.rotation.x = state.sw === 'open' ? -0.55 : 0;
    drawPlateCharges();
    drawCapLabel();
    drawLedLabel();
  }

  function tick(dt) {
    if (!sim || !allPlaced() || state.mode !== 'circuit') return false;

    // RC 회로 적분
    let dVdt = 0;
    if (state.sw === 'chg') dVdt = (state.volt - sim.V) / tauChg();
    else if (state.sw === 'dis' && state.ledDir > 0 && sim.V > 0.02) dVdt = -sim.V / tauDis();
    sim.V = Math.max(0, Math.min(state.volt + 0.001, sim.V + dVdt * dt));
    sim.I = (state.cap * 1e-6) * Math.abs(dVdt) * 1000;   // mA
    sim.t += dt;
    if (sim.t - sim.hist[sim.hist.length - 1].t > 0.08) {
      sim.hist.push({ t: sim.t, V: sim.V, I: sim.I, sw: state.sw });
      if (sim.hist.length > 500) sim.hist.shift();
    }

    // 전류 점 애니메이션 — 흐르는 경로 위에서만, 속도 ∝ I
    const speed = Math.min(0.45, sim.I / 3.5);
    const active = state.sw === 'chg' ? PATH_CHG
      : (state.sw === 'dis' && state.ledDir > 0) ? PATH_DIS : null;
    dots.forEach((d) => {
      if (!active || speed < 0.004) { d.m.setEnabled(false); return; }
      d.m.setEnabled(true);
      d.u = (d.u + speed * dt) % 1;
      const [x, z] = pathPoint(active, d.u, active === PATH_CHG);
      d.m.position.set(x, WY + 0.02, z);
    });

    setLedGlow(state.sw === 'dis' && state.ledDir > 0 ? sim.I : 0);
    drawPlateCharges();
    return true;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = state.mode === 'circuit' ? 0.72 : 1.25;
    camera.radius = 13.5;
    camera.setTarget(new (B().Vector3)(0, state.mode === 'circuit' ? 0.6 : 1.9, 0.4));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '스위치를 A(충전)로 젖혔다가 B(방전)로 — 축전기에 모인 전하가 LED 를 켭니다. LED 를 거꾸로 끼우면 어떻게 될까요?';
  const prepGuide = '점선 자리에 전지·스위치·축전기·LED 를 끌어다 놓으세요. 모두 놓으면 도선이 연결되어 회로가 완성됩니다.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'circuit', t: '충전·방전 회로 (82쪽)' }, { v: 'inside', t: '축전기 내부 — C=ε₀A/d' },
    ], state.mode, 1);

    if (state.mode === 'circuit') {
      return `
        ${modeBtns}
        ${LabUI.opts('전지 전압', 'volt', [
          { v: 1.5, t: '1.5 V' }, { v: 3.0, t: '3.0 V' }, { v: 4.5, t: '4.5 V' },
        ], state.volt, 1)}
        ${LabUI.opts('축전기 용량', 'cap', [
          { v: 470, t: '470 μF' }, { v: 1000, t: '1000 μF' }, { v: 2200, t: '2200 μF' },
        ], state.cap, 1)}
        ${LabUI.opts('칼날 스위치', 'sw', [
          { v: 'chg', t: 'A — 충전' }, { v: 'open', t: '열림' }, { v: 'dis', t: 'B — 방전' },
        ], state.sw, 1)}
        ${LabUI.opts('LED 방향', 'ledDir', [
          { v: 1, t: '정방향' }, { v: -1, t: '거꾸로 끼움' },
        ], state.ledDir, 1)}
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.slider('areaCtl', '판의 넓이 <i>A</i>',
        { min: 50, max: 200, step: 10, value: state.areaCm2, fmt: (v) => `${v} cm²` })}
      ${LabUI.slider('gapCtl', '판 간격 <i>d</i>',
        { min: 2, max: 10, step: 0.5, value: state.gapMm, fmt: (v) => `${(+v).toFixed(1)} mm` })}
      ${LabUI.opts('걸어 준 전압', 'volt', [
        { v: 1.5, t: '1.5 V' }, { v: 3.0, t: '3.0 V' }, { v: 4.5, t: '4.5 V' },
      ], state.volt, 1)}
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    LabUI.bindOpts(root, 'mode', state, 'mode', () => {
      resetCamera();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      layout();
      onChange();
    }, String);

    if (state.mode === 'circuit') {
      LabUI.bindOpts(root, 'volt', state, 'volt', () => { drawPlateCharges(); onChange(); });
      LabUI.bindOpts(root, 'cap', state, 'cap', () => { drawCapLabel(); onChange(); });
      LabUI.bindOpts(root, 'sw', state, 'sw', () => { layout(); onChange(); }, String);
      LabUI.bindOpts(root, 'ledDir', state, 'ledDir', () => { layout(); onChange(); });
      root.querySelector('#resetBtn').addEventListener('click', () => {
        reset();
        root.innerHTML = controlsHTML();
        bindControls(root, onChange);
        onChange();
      });
    } else {
      LabUI.bindSlider(root, 'areaCtl', state, 'areaCm2', (v) => `${v} cm²`, () => { layoutInside(); onChange(); });
      LabUI.bindSlider(root, 'gapCtl', state, 'gapMm', (v) => `${(+v).toFixed(1)} mm`, () => { layoutInside(); onChange(); });
      LabUI.bindOpts(root, 'volt', state, 'volt', () => { layoutInside(); onChange(); });
      root.querySelector('#resetBtn').addEventListener('click', () => {
        state.areaCm2 = 100; state.gapMm = 4;
        root.innerHTML = controlsHTML();
        bindControls(root, onChange);
        layoutInside();
        onChange();
      });
    }
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'circuit') {
      const swName = { chg: 'A — 충전 중', open: '열림 (전하 보존)', dis: 'B — 방전' }[state.sw];
      const blocked = state.sw === 'dis' && state.ledDir < 0;
      return `
        <div class="row"><span>스위치</span><b class="big">${swName}</b></div>
        <div class="row"><span>축전기 전압 <i>V<sub>C</sub></i></span>
          <b class="big">${sim.V.toFixed(2)} V</b></div>
        <div class="row"><span>전류 <i>I</i></span><b>${sim.I.toFixed(2)} mA</b></div>
        <div class="row"><span>저장 전하 <i>Q</i> = <i>CV</i></span>
          <b>${(state.cap * sim.V / 1000).toFixed(2)} mC</b></div>
        <div class="row"><span>저장 에너지 ½<i>CV</i>²</span>
          <b>${(0.5 * state.cap * 1e-6 * sim.V * sim.V * 1000).toFixed(2)} mJ</b></div>
        <div class="sec">시간 상수</div>
        <div class="row"><span>충전 τ = <i>RC</i></span><b>${tauChg().toFixed(2)} s</b></div>
        <div class="row"><span>방전 τ′ (저항+LED)</span><b>${tauDis().toFixed(2)} s</b></div>
        <div class="formula">${blocked
          ? '<b style="color:#d0453a">LED 가 거꾸로!</b> 다이오드는 한쪽 방향으로만 전류를 흘리므로 방전되지 않고 전압이 유지됩니다. LED 방향을 되돌려 보세요.'
          : state.sw === 'chg'
          ? 'τ 초에 최종 전압의 <b>63.2 %</b> 까지 충전됩니다. 판에 쌓이는 전하 기호와 노란 전류 점을 보세요.'
          : state.sw === 'open'
          ? '회로가 끊겨도 전하는 판에 <b>그대로 남습니다</b> — 축전기가 전기 에너지를 저장한다는 증거입니다.'
          : '축전기에 저장된 에너지가 LED 를 켭니다 — 전지를 뗐는데도 불이 들어오는 까닭입니다 (82쪽).'}</div>`;
    }
    const C = insideC();
    return `
      <div class="row"><span>판의 넓이 <i>A</i></span><b>${state.areaCm2} cm²</b></div>
      <div class="row"><span>판 간격 <i>d</i></span><b>${state.gapMm.toFixed(1)} mm</b></div>
      <div class="row"><span>전압 <i>V</i></span><b>${state.volt.toFixed(1)} V</b></div>
      <div class="sec">C = ε₀A/d</div>
      <div class="row"><span>전기 용량 <i>C</i></span>
        <b class="big">${(C * 1e12).toFixed(1)} pF</b></div>
      <div class="row"><span>저장 전하 <i>Q</i> = <i>CV</i></span>
        <b>${(insideQ() * 1e12).toFixed(1)} pC</b></div>
      <div class="row"><span>전기장 <i>E</i> = <i>V</i>/<i>d</i></span>
        <b>${(state.volt / (state.gapMm * 1e-3)).toFixed(0)} V/m</b></div>
      <div class="row"><span>저장 에너지 ½<i>CV</i>²</span>
        <b>${(insideU() * 1e12).toFixed(1)} pJ</b></div>
      <div class="formula">판을 <b>넓히면 C 증가</b>(전하를 놓을 자리가 많아짐),
        간격을 <b>좁히면 C 증가</b>(양쪽 전하가 서로 끌어 더 많이 쌓임).
        실제 축전기는 이 판을 돌돌 말아 작은 원통에 넣은 것입니다.</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '축전기 전압과 전류의 시간 변화';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 40, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;

    if (state.mode === 'inside') {
      // C–d 곡선 (반비례) + 현재 점
      const xOf = (d) => padL + ((d - 2) / 8) * gw;
      const CofD = (d) => EPS0 * (state.areaCm2 * 1e-4) / (d * 1e-3) * 1e12;
      const CMAX = CofD(2) * 1.1;
      const yOf = (c) => padT + gh - (c / CMAX) * gh;
      ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const d = 2 + (i / 100) * 8;
        const y = yOf(CofD(d));
        if (i === 0) ctx.moveTo(xOf(d), y); else ctx.lineTo(xOf(d), y);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.arc(xOf(state.gapMm), yOf(insideC() * 1e12), 5, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
      ctx.stroke();
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('판 간격 d (mm)', W2 - 4, padT + gh + 4);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#5ad0f0'; ctx.font = 'bold 10px sans-serif';
      ctx.fillText('C ∝ 1/d — 간격을 좁힐수록 용량이 커진다', padL + 6, padT + 2);
      return;
    }

    const TW = Math.max(8, sim ? sim.t : 8);
    const xOf = (t) => padL + (t / TW) * gw;
    const yOfV = (v) => padT + gh - (v / 5) * gh;
    // 63.2 % 기준선
    ctx.strokeStyle = 'rgba(255,216,74,.35)';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, yOfV(state.volt * 0.632)); ctx.lineTo(padL + gw, yOfV(state.volt * 0.632));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,216,74,.8)'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`63.2 % (τ = ${tauChg().toFixed(1)} s)`, padL + 4, yOfV(state.volt * 0.632) - 2);

    if (sim && sim.hist.length > 1) {
      ctx.strokeStyle = '#69d98c'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      sim.hist.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(p.t), yOfV(p.V)); else ctx.lineTo(xOf(p.t), yOfV(p.V));
      });
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,157,240,.8)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      sim.hist.forEach((p, i) => {
        const y = padT + gh - Math.min(1, p.I / 2.5) * gh;
        if (i === 0) ctx.moveTo(xOf(p.t), y); else ctx.lineTo(xOf(p.t), y);
      });
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [1.5, 3.0, 4.5].forEach((v) => ctx.fillText(v.toFixed(1), padL - 4, yOfV(v)));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#69d98c'; ctx.fillText('V_C (V)', padL + 6, padT + 2);
    ctx.fillStyle = 'rgba(90,157,240,.9)'; ctx.fillText('I (mA)', padL + 60, padT + 2);
  }

  function graphFootHTML() {
    if (state.mode === 'inside') {
      return `지금 C = ${(insideC() * 1e12).toFixed(1)} pF · 넓이를 2배로 하면 C 도 2배,
        간격을 2배로 하면 C 는 절반`;
    }
    return '충전 곡선은 처음에 가파르고 점점 완만해집니다 — 전류가 <b>V 차이에 비례</b>하기 때문입니다';
  }

  /* ══ 기록표 (82쪽 해 보기) ═══════════════════ */
  const recordColumns = [
    '시간 (s)', '스위치', '<i>V<sub>C</sub></i> (V)', '<i>I</i> (mA)', '비고',
  ];

  function recordRow() {
    if (state.mode !== 'circuit') {
      return [['—', '내부 모드', `A=${state.areaCm2}cm², d=${state.gapMm}mm`,
        `C=${(insideC() * 1e12).toFixed(1)} pF`, `Q=${(insideQ() * 1e12).toFixed(1)} pC`]];
    }
    const note = state.sw === 'dis' && state.ledDir < 0 ? 'LED 역방향 — 방전 안 됨'
      : state.sw === 'dis' ? 'LED 점등' : state.sw === 'open' ? '전압 유지' : '';
    return [[sim.t.toFixed(1), { chg: 'A 충전', open: '열림', dis: 'B 방전' }[state.sw],
      sim.V.toFixed(2), sim.I.toFixed(2), note]];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 충전 · 1 열림에서 전하 보존 · 2 방전으로 LED 켜기
     3 LED 를 거꾸로 끼우면 방전되지 않음 · 4 내부 모드에서 간격·면적 바꾸기 */
  const mis = { charged: false, held: false, lit: false, blocked: false, inside: {} };

  function missionDone(i) {
    if (state.mode === 'circuit') {
      if (state.sw === 'chg' && sim.V > state.volt * 0.6) mis.charged = true;
      if (state.sw === 'open' && sim.V > 0.5) mis.held = true;
      if (state.sw === 'dis' && state.ledDir > 0 && sim.I > 0.05) mis.lit = true;
      if (state.sw === 'dis' && state.ledDir < 0 && sim.V > 0.5) mis.blocked = true;
    } else {
      mis.inside[state.areaCm2 + '/' + state.gapMm] = true;
    }
    if (i === 0) return mis.charged;
    if (i === 1) return mis.held;
    if (i === 2) return mis.lit;
    if (i === 3) return mis.blocked;
    if (i === 4) return Object.keys(mis.inside).length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'capacitor',
    title: '축전기의 충전과 방전 — 실제 회로',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, tauChg, tauDis, insideC, insideQ, insideU,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
