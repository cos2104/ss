/**
 * ① 전하 창고를 채워라 — 충전과 방전 (교과서 82쪽 해 보기)
 *
 * 전지(3/6/9V)·칼날 스위치·축전기·LED 를 실제 도선으로 연결한 회로.
 *   부품은 트레이 아이콘을 «클릭»하면 3D 부품이 제자리로 내려오고,
 *   끌면 실제 3D 부품이 커서를 따라온다 (아이콘 유령 없음).
 *   스위치 접점 사이 도선은 끊겨 있고, 레버(칼날)가 닿아야 회로가 이어진다.
 *   LED 는 +/− 구멍이 있는 소켓에 꽂는다. 거꾸로 끼우면 LED 가 실제로 돌아간다.
 *   축전기 용량(470/1000/2200μF)을 바꾸면 판 크기·간격·유전체가 함께 변한다.
 *   판 사이 전기장 화살표는 충전되었을 때에만 나타난다.
 */
const CircuitScene = (() => {
  const B = () => BABYLON;

  const R_CHG = 2200;            // 충전 저항 (Ω)
  const R_DIS = 3000;            // 방전 경로 저항 (저항 + LED, Ω)
  const VMAX = 9;
  const WY = 0.32;               // 도선 높이
  const CAPZ = -0.55;            // 축전기 중심 z

  let scene, camera;
  let batteryG, switchG, lever, capG, plateA, plateB, faceA, faceB, dielec;
  let plateTexA, plateTexB, capLblTex, ledG, ledUnit, ledLblTex, longTag;
  let resistorG, wiresG, wireSegs = [], fieldArrows = [], dots = [];
  let placed = {};
  let anims = [];                // 부품 등장 애니메이션 목록

  const state = {
    volt: 9.0,           // 전지 전압 (V)
    cap: 1000,           // 용량 (μF)
    sw: 'open',          // 'chg' | 'open' | 'dis'
    ledDir: 1,           // 1 정방향, -1 거꾸로
    slow: 1,             // 1 보통, 0.25 슬로 모션
  };

  let sim = null;

  const tools = [
    { id: 'battT', label: '전지 홀더 (9V)', icon: 'battery' },
    { id: 'swT', label: '칼날 스위치', icon: 'switchSw' },
    { id: 'capT', label: '축전기', icon: 'voltmeter' },
    { id: 'ledT', label: 'LED + 소켓', icon: 'led' },
  ];
  const slots = {
    battT: { name: '왼쪽 (전지)', x: -3.5, z: 1.2 },
    swT: { name: '위 가운데 (스위치)', x: 0, z: 3.1 },
    capT: { name: '가운데 (축전기)', x: 0, z: CAPZ },
    ledT: { name: '오른쪽 (LED)', x: 3.5, z: 0.2 },
  };

  /** 용량별 형태 — 판 크기·간격·유전체 (용량 ∝ 면적/간격) */
  const CAP_GEOM = {
    470: { s: 0.82, gap: 0.95, die: '#dfe6ee', dieA: 0.25, name: '공기' },
    1000: { s: 1.0, gap: 0.6, die: '#e6dcbf', dieA: 0.8, name: '종이' },
    2200: { s: 1.18, gap: 0.4, die: '#9fc4e0', dieA: 0.85, name: '세라믹' },
  };

  const capF = () => state.cap * 1e-6;
  const tauChg = () => R_CHG * capF();
  const tauDis = () => R_DIS * capF();
  /** 판에 그리는 전하 개수 — Q = CV 에 비례 (2200μF·9V 에서 24개)
      같은 전압이라도 용량이 크면 더 많은 전하가 충전된다 */
  const chargeCount = () =>
    Math.round(Math.min(1, (sim ? sim.V : 0) / VMAX) * 24 * (state.cap / 2200));

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c9dff2ff');

    camera = new (B().ArcRotateCamera)(
      'camCk', -Math.PI / 2, 0.72, 13.5, new (B().Vector3)(0, 0.6, 0.4), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 30;
    camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hck', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.45, 0.48, 0.52);
    const dir = new (B().DirectionalLight)('dck', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 14, -9);
    dir.intensity = 0.32;
    const glow = new (B().GlowLayer)('ckGlow', scene);
    glow.intensity = 0.55;

    // 서비스 센터 작업대 (항상 보이는 배경)
    const table = B().MeshBuilder.CreateBox('ckTable', { width: 24, height: 0.6, depth: 14 }, scene);
    table.position.y = -0.5;
    table.material = mat('ckTableMat', '#9aa3ad', '#c6ccd3', 96);
    const board = B().MeshBuilder.CreateBox('ckBoard', { width: 11.5, height: 0.24, depth: 8.4 }, scene);
    board.position.set(0, -0.08, 0.4);
    board.material = mat('ckBoardMat', '#c8a86a', '#e8d0a0', 48);

    buildBattery();
    buildSwitch();
    buildCapacitor();
    buildLED();
    buildResistor();
    buildWires();
    buildPlaceholders();

    // 교과서 그림 — 시뮬레이션 쪽을 바라보도록 안쪽으로 기울인다
    LabUI.addPoster(scene, '../assets/thumbs/capx-circuit.jpg',
      { x: -8, y: 0, z: 5, ry: -0.35, label: '교과서 82쪽 — 실험 회로' });
    LabUI.addPoster(scene, '../assets/thumbs/capx-led.jpg',
      { x: 8, y: 0, z: 5, ry: 0.35, label: '교과서 82쪽 — LED 연결' });

    // 부품 등장(낙하) 애니메이션 — 준비 단계에도 동작하도록 렌더 옵저버로 처리
    scene.onBeforeRenderObservable.add(() => {
      if (!anims.length) return;
      const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05);
      anims = anims.filter((a) => {
        a.g.position.y = Math.max(0, a.g.position.y - 9 * dt);
        return a.g.position.y > 0.001;
      });
    });

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
  /** 한 글자 극성 기호 — 각 단자 «바로 위»에 붙어 있어 돌려 봐도 헷갈리지 않는다 */
  function signLabel(name, ch, hex, x, y, z, size, parent) {
    const p = B().MeshBuilder.CreatePlane(name, { width: size, height: size }, scene);
    p.position.set(x, y, z);
    p.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const t = new (B().DynamicTexture)(name + 'T', { width: 96, height: 96 }, scene, true);
    const c = t.getContext();
    c.clearRect(0, 0, 96, 96);
    c.fillStyle = hex;
    c.font = 'bold 78px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(ch, 48, 52);
    t.hasAlpha = true; t.update();
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    p.material = m;
    p.isPickable = false;
    if (parent) p.parent = parent;
    return p;
  }

  /** 전지 홀더 — 9V 각전지. +/− 는 단자 위에 하나씩 고정 */
  function buildBattery() {
    batteryG = new (B().TransformNode)('ckBatt', scene);
    const holder = B().MeshBuilder.CreateBox('ckBattH', { width: 1.5, height: 0.5, depth: 2.6 }, scene);
    holder.position.set(-3.5, 0.28, 1.2);
    holder.material = mat('ckBattHM', '#20262f', '#5a6a80', 64);
    holder.parent = batteryG;
    const cell = B().MeshBuilder.CreateBox('ckCell', { width: 0.95, height: 1.05, depth: 1.6 }, scene);
    cell.position.set(-3.5, 1.0, 1.2);
    cell.material = mat('ckCellM', '#2a3542', '#8898ac', 96);
    cell.parent = batteryG;
    [[0.28, '#d0453a'], [-0.28, '#8a93a6']].forEach(([dz, hex], i) => {
      const t2 = B().MeshBuilder.CreateCylinder('ckCellT' + i, { height: 0.16, diameter: 0.24 }, scene);
      t2.position.set(-3.5, 1.6, 1.2 + dz);
      t2.material = mat('ckCellTM' + i, hex, '#ffe8a0', 96);
      t2.parent = batteryG;
    });
    // 단자별 극성 기호 (각 단자 바로 위)
    signLabel('ckBattP', '+', '#d0453a', -3.5, 1.98, 1.48, 0.4, batteryG);
    signLabel('ckBattN', '−', '#2f6ad0', -3.5, 1.98, 0.92, 0.4, batteryG);
    // 전압 라벨 (숫자뿐이라 어느 방향에서 봐도 안전)
    const lbl = B().MeshBuilder.CreatePlane('ckBattL', { width: 1.1, height: 0.42 }, scene);
    lbl.position.set(-3.5, 2.45, 1.2);
    lbl.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const t = new (B().DynamicTexture)('ckBattLT', { width: 180, height: 68 }, scene, true);
    t.hasAlpha = true;
    const m = new (B().StandardMaterial)('ckBattLM', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    lbl.material = m;
    lbl.isPickable = false;
    lbl.parent = batteryG;
    batteryG._lblTex = t;
    drawBattLabel();
  }

  function drawBattLabel() {
    const t = batteryG._lblTex;
    const c = t.getContext();
    c.clearRect(0, 0, 180, 68);
    c.fillStyle = '#3c4756'; c.font = 'bold 44px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${state.volt.toFixed(0)} V`, 90, 36);
    t.update();
  }

  /** 칼날 스위치 — 접점 사이 도선은 끊겨 있고 레버가 회로를 잇는다 */
  function buildSwitch() {
    switchG = new (B().TransformNode)('ckSw', scene);
    const base = B().MeshBuilder.CreateBox('ckSwB', { width: 2.6, height: 0.18, depth: 1.5 }, scene);
    base.position.set(0, 0.13, 3.1);
    base.material = mat('ckSwBM', '#e8e2d0', '#fff', 48);
    base.parent = switchG;
    const post = (x, z, name) => {
      const p = B().MeshBuilder.CreateCylinder('ckSwP' + name, { height: 0.42, diameter: 0.22 }, scene);
      p.position.set(x, 0.42, z);
      p.material = mat('ckSwPM' + name, '#b8862e', '#ffe8a0', 96);
      p.parent = switchG;
    };
    post(0, 2.6, 'C'); post(-0.85, 3.5, 'A'); post(0.85, 3.5, 'B');
    const lbl = B().MeshBuilder.CreatePlane('ckSwL', { width: 2.6, height: 0.5 }, scene);
    lbl.position.set(0, 0.95, 3.8);
    const t = new (B().DynamicTexture)('ckSwLT', { width: 360, height: 70 }, scene, true);
    const c = t.getContext();
    c.clearRect(0, 0, 360, 70);
    c.font = 'bold 32px "Noto Sans KR", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#d0453a'; c.fillText('A 충전', 70, 36);
    c.fillStyle = '#2f9e6b'; c.fillText('B 방전', 290, 36);
    t.hasAlpha = true; t.update();
    const m = new (B().StandardMaterial)('ckSwLM', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    lbl.material = m;
    lbl.parent = switchG;
    lever = B().MeshBuilder.CreateBox('ckSwLever', { width: 0.16, height: 0.1, depth: 1.15 }, scene);
    lever.setPivotPoint(new (B().Vector3)(0, 0, -0.55));
    lever.position.set(0, 0.6, 3.18);
    lever.material = mat('ckSwLM2', '#39424f', '#9fb0c2', 96);
    lever.parent = switchG;
    const knob = B().MeshBuilder.CreateSphere('ckSwKnob', { diameter: 0.24 }, scene);
    knob.position.set(0, 0.12, 0.55);
    knob.material = mat('ckSwKM', '#20262f');
    knob.parent = lever;
  }

  /** 축전기 — 용량에 따라 판 크기·간격·유전체가 변한다 */
  function buildCapacitor() {
    capG = new (B().TransformNode)('ckCap', scene);
    const mk = (name) => {
      const p = B().MeshBuilder.CreateBox('ckPlate' + name, { width: 1.7, height: 1.5, depth: 0.08 }, scene);
      p.material = mat('ckPlateM' + name, '#aab6c8', '#e8f0fa', 96);
      p.parent = capG;
      const face = B().MeshBuilder.CreatePlane('ckPlateF' + name, { width: 1.6, height: 1.4 }, scene);
      if (name === 'B') face.rotation.y = Math.PI;
      const t = new (B().DynamicTexture)('ckPlateT' + name, { width: 220, height: 190 }, scene, true);
      t.hasAlpha = true;
      const m = new (B().StandardMaterial)('ckPlateFM' + name, scene);
      m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.backFaceCulling = false;
      face.material = m;
      face.parent = capG;
      return [p, face, t];
    };
    [plateA, faceA, plateTexA] = mk('A');   // 스위치 쪽 판 (+)
    [plateB, faceB, plateTexB] = mk('B');   // 전지 − 쪽 판
    // 유전체 (용량에 따라 색·두께 변경)
    dielec = B().MeshBuilder.CreateBox('ckDielec', { width: 1.6, height: 1.4, depth: 1 }, scene);
    dielec.material = mat('ckDielecM', '#e6dcbf');
    dielec.parent = capG;
    // 판 사이 전기장 «전기력선» 화살표 (축 + 화살촉, + 판 → − 판) — 충전 시에만 나타난다
    for (let i = 0; i < 3; i++) {
      const g2 = new (B().TransformNode)('ckFld' + i, scene);
      const shaft = B().MeshBuilder.CreateCylinder('ckFldS' + i, { height: 0.7, diameter: 0.045 }, scene);
      shaft.position.y = -0.06;
      const sm2 = emat('ckFldSM' + i, '#ffd84a', 0.9);
      shaft.material = sm2;
      shaft.parent = g2;
      const tip = B().MeshBuilder.CreateCylinder('ckFldT' + i,
        { height: 0.2, diameterTop: 0, diameterBottom: 0.15 }, scene);
      tip.position.y = 0.39;
      const tm2 = emat('ckFldTM' + i, '#ffd84a', 0.9);
      tip.material = tm2;
      tip.parent = g2;
      g2.rotation.x = -Math.PI / 2;      // 로컬 +y → −z (A(+)판 → B(−)판)
      g2.parent = capG;
      g2._mats = [sm2, tm2];
      fieldArrows.push(g2);
    }
    // 판별 극성 기호 (각 판 위에 하나씩 고정)
    capG._signP = signLabel('ckCapP', '+', '#d0453a', -1.1, 2.0, 0, 0.38, capG);
    capG._signN = signLabel('ckCapN', '−', '#2f6ad0', -1.1, 2.0, 0, 0.38, capG);
    // 용량·유전체 라벨
    const lbl = B().MeshBuilder.CreatePlane('ckCapL', { width: 2.6, height: 0.45 }, scene);
    lbl.position.set(0, 2.35, CAPZ);
    lbl.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    capLblTex = new (B().DynamicTexture)('ckCapLT', { width: 400, height: 64 }, scene, true);
    capLblTex.hasAlpha = true;
    const m = new (B().StandardMaterial)('ckCapLM', scene);
    m.diffuseTexture = capLblTex; m.opacityTexture = capLblTex; m.emissiveTexture = capLblTex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    lbl.material = m;
    lbl.isPickable = false;
    lbl.parent = capG;
    layoutCap();
  }

  /** 용량에 맞춰 축전기 형태 갱신 */
  function layoutCap() {
    const g = CAP_GEOM[state.cap];
    const zA = CAPZ + g.gap / 2, zB = CAPZ - g.gap / 2;
    plateA.position.set(0, 0.95, zA);
    plateB.position.set(0, 0.95, zB);
    faceA.position.set(0, 0.95, zA + 0.05);
    faceB.position.set(0, 0.95, zB - 0.05);
    [plateA, plateB, faceA, faceB].forEach((p) => { p.scaling.x = g.s; p.scaling.y = g.s; });
    dielec.position.set(0, 0.95, CAPZ);
    dielec.scaling.set(g.s * 0.97, g.s * 0.97, Math.max(0.06, g.gap - 0.14));
    dielec.material.diffuseColor = B().Color3.FromHexString(g.die);
    dielec.material.alpha = g.dieA;
    fieldArrows.forEach((a, i) => {
      a.position.set((-0.5 + i * 0.5) * g.s, 0.95, CAPZ);
      a.scaling.y = Math.max(0.45, (g.gap - 0.12) / 0.95);
    });
    capG._signP.position.set(-0.95 * g.s - 0.25, 1.95, zA);
    capG._signN.position.set(-0.95 * g.s - 0.25, 1.95, zB);
    drawCapLabel();
    updateCapWires();
  }

  function drawCapLabel() {
    const g = CAP_GEOM[state.cap];
    const c = capLblTex.getContext();
    c.clearRect(0, 0, 400, 64);
    c.fillStyle = '#3c4756';
    c.font = 'bold 32px "Noto Sans KR", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${state.cap} μF · 유전체: ${g.name}`, 200, 34);
    capLblTex.update();
  }

  /** 같은 부호 전하는 서로 밀어내므로 판 «전체에 고르게» 퍼져 거리를 유지한다.
      전하가 늘면 전체가 재배치되며 간격이 좁아진다. */
  function drawChargesEven(c, W2, H2, n, sign) {
    if (n <= 0) return;
    const cols = Math.max(1, Math.round(Math.sqrt(n * W2 / H2)));
    const rows = Math.ceil(n / cols);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = sign > 0 ? '#d0453a' : '#2f6ad0';
    let i = 0;
    for (let r = 0; r < rows && i < n; r++) {
      const inRow = Math.min(cols, n - r * cols);
      for (let k = 0; k < inRow; k++, i++) {
        const x = W2 * (k + 1) / (inRow + 1);
        const y = H2 * (r + 1) / (rows + 1);
        c.fillText(sign > 0 ? '+' : '−', x, y);
      }
    }
  }

  /** 판 위 전하 기호 — 개수가 Q = CV 에 비례 */
  function drawPlateCharges() {
    const n = chargeCount();
    const draw = (tex, sign) => {
      const c = tex.getContext();
      c.clearRect(0, 0, 220, 190);
      c.font = 'bold 26px sans-serif';
      drawChargesEven(c, 220, 190, n, sign);
      tex.update();
    };
    draw(plateTexA, +1);
    draw(plateTexB, -1);
    // 전기장 화살표 — 충분히 충전되었을 때에만 (진하기 ∝ 충전 정도)
    const frac = sim ? Math.min(1, sim.V / VMAX) : 0;
    fieldArrows.forEach((a) => {
      a.setEnabled(frac > 0.12);
      a._mats.forEach((m2) => { m2.alpha = 0.25 + frac * 0.75; });
    });
  }

  /** LED + 소켓 — 소켓 구멍에 +/− 표시, 거꾸로 끼우면 LED 가 실제로 돌아간다 */
  function buildLED() {
    ledG = new (B().TransformNode)('ckLed', scene);
    // 소켓: 구멍 2개 + 윗면에 +/− 인쇄 (고정)
    const sock = B().MeshBuilder.CreateBox('ckLedSock', { width: 1.0, height: 0.16, depth: 0.9 }, scene);
    sock.position.set(3.5, 0.08, 0.2);
    sock.material = mat('ckLedSockM', '#2c3440', '#7a8aa0', 64);
    sock.parent = ledG;
    const top = B().MeshBuilder.CreatePlane('ckLedSockT', { width: 1.0, height: 0.9 }, scene);
    top.rotation.x = Math.PI / 2;
    top.position.set(3.5, 0.165, 0.2);
    const tt = new (B().DynamicTexture)('ckLedSockTT', { width: 200, height: 180 }, scene, true);
    const tc = tt.getContext();
    tc.clearRect(0, 0, 200, 180);
    tc.font = 'bold 56px sans-serif'; tc.textAlign = 'center'; tc.textBaseline = 'middle';
    tc.fillStyle = '#ff8a7a'; tc.fillText('+', 100, 38);   // z+ 구멍 (앞)
    tc.fillStyle = '#7ab0ff'; tc.fillText('−', 100, 142);  // z− 구멍 (뒤)
    tt.hasAlpha = true; tt.update();
    const tm = new (B().StandardMaterial)('ckLedSockTM', scene);
    tm.diffuseTexture = tt; tm.opacityTexture = tt; tm.emissiveTexture = tt;
    tm.emissiveColor = new (B().Color3)(1, 1, 1);
    tm.backFaceCulling = false;
    top.material = tm;
    top.parent = ledG;
    [0.14, -0.14].forEach((dz, i) => {
      const hole = B().MeshBuilder.CreateCylinder('ckLedHole' + i, { height: 0.05, diameter: 0.1 }, scene);
      hole.position.set(3.5, 0.165, 0.2 + dz * 1.6);
      hole.material = mat('ckLedHoleM' + i, '#101820');
      hole.parent = ledG;
    });

    // LED 본체 (회전 단위) — 로컬 좌표, 긴 다리(+)가 로컬 +z
    ledUnit = new (B().TransformNode)('ckLedUnit', scene);
    ledUnit.parent = ledG;
    ledUnit.position.set(3.5, 0, 0.2);
    const dome = B().MeshBuilder.CreateSphere('ckLedD', { diameter: 0.62, slice: 0.5 }, scene);
    dome.position.set(0, 1.15, 0);
    const dm = new (B().StandardMaterial)('ckLedDM', scene);
    dm.diffuseColor = B().Color3.FromHexString('#b83a30');
    dm.alpha = 0.85;
    dome.material = dm;
    dome.parent = ledUnit;
    const body = B().MeshBuilder.CreateCylinder('ckLedB', { height: 0.34, diameter: 0.62 }, scene);
    body.position.set(0, 0.98, 0);
    const bm = new (B().StandardMaterial)('ckLedBM', scene);
    bm.diffuseColor = B().Color3.FromHexString('#b83a30');
    bm.alpha = 0.85;
    body.material = bm;
    body.parent = ledUnit;
    ledG._domeMat = dm; ledG._bodyMat = bm;
    // 다리 — 긴 쪽(로컬 +z)이 애노드(+)
    [[0.224, 0.66, 'A'], [-0.224, 0.5, 'K']].forEach(([dz, h, n2]) => {
      const leg = B().MeshBuilder.CreateCylinder('ckLedLeg' + n2, { height: h, diameter: 0.05 }, scene);
      leg.position.set(0, 0.81 - h / 2 + 0.06, dz);
      leg.material = mat('ckLedLegM' + n2, '#8a93a6', '#dfe4ee', 96);
      leg.parent = ledUnit;
    });
    // «긴 다리 +» 꼬리표 — 빌보드는 부모 회전을 무시하므로 ledG 에 두고 위치를 직접 추적한다
    longTag = B().MeshBuilder.CreatePlane('ckLedTag', { width: 0.95, height: 0.3 }, scene);
    longTag.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const gt = new (B().DynamicTexture)('ckLedTagT', { width: 190, height: 60 }, scene, true);
    const gc = gt.getContext();
    gc.clearRect(0, 0, 190, 60);
    gc.fillStyle = '#d0453a';
    gc.font = 'bold 30px "Noto Sans KR", sans-serif';
    gc.textAlign = 'center'; gc.textBaseline = 'middle';
    gc.fillText('긴 다리 +', 95, 32);
    gt.hasAlpha = true; gt.update();
    const gm = new (B().StandardMaterial)('ckLedTagM', scene);
    gm.diffuseTexture = gt; gm.opacityTexture = gt; gm.emissiveTexture = gt;
    gm.emissiveColor = new (B().Color3)(1, 1, 1);
    gm.backFaceCulling = false;
    longTag.material = gm;
    longTag.isPickable = false;
    longTag.parent = ledG;
    updateLedTag();
    // 방향 안내 라벨
    const lbl = B().MeshBuilder.CreatePlane('ckLedL', { width: 1.7, height: 0.45 }, scene);
    lbl.position.set(3.5, 1.95, 0.2);
    lbl.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    ledLblTex = new (B().DynamicTexture)('ckLedLT', { width: 280, height: 64 }, scene, true);
    ledLblTex.hasAlpha = true;
    const m = new (B().StandardMaterial)('ckLedLM', scene);
    m.diffuseTexture = ledLblTex; m.opacityTexture = ledLblTex; m.emissiveTexture = ledLblTex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    lbl.material = m;
    lbl.isPickable = false;
    lbl.parent = ledG;
    layoutLed();
  }

  /** «긴 다리 +» 꼬리표를 긴 다리(로컬 +z)의 현재 월드 위치로 */
  function updateLedTag() {
    if (!longTag || !ledUnit) return;
    const ry = ledUnit.rotation.y;
    longTag.position.set(
      3.5 + Math.sin(ry) * 0.5,
      0.66 + ledUnit.position.y,
      0.2 + Math.cos(ry) * 0.5
    );
  }

  /** LED 방향 라벨 — 몸통 회전은 tick 의 «뺐다 끼우는» 애니메이션이 맡는다 */
  function layoutLed() {
    const c = ledLblTex.getContext();
    c.clearRect(0, 0, 280, 64);
    c.font = 'bold 30px "Noto Sans KR", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = state.ledDir > 0 ? '#3c4756' : '#d0453a';
    c.fillText(state.ledDir > 0 ? 'LED (정방향)' : 'LED (거꾸로!)', 140, 32);
    ledLblTex.update();
  }

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

  /** 색띠 저항 (2.2 kΩ) — LED 과전류 방지 */
  function buildResistor() {
    resistorG = new (B().TransformNode)('ckRes', scene);
    const body = B().MeshBuilder.CreateCylinder('ckResB', { height: 1.0, diameter: 0.34 }, scene);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, WY, 1.45);
    body.material = mat('ckResBM', '#d8c9a0', '#f0e8d0', 48);
    body.parent = resistorG;
    ['#d0453a', '#d0453a', '#d0453a', '#c8a020'].forEach((hex, i) => {
      const band = B().MeshBuilder.CreateTorus('ckResBand' + i, { diameter: 0.36, thickness: 0.05 }, scene);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, WY, 1.75 - i * 0.2);
      band.material = mat('ckResBandM' + i, hex);
      band.parent = resistorG;
    });
    const lbl = B().MeshBuilder.CreatePlane('ckResL', { width: 1.6, height: 0.4 }, scene);
    lbl.position.set(-1.15, 0.75, 1.45);
    lbl.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const t = new (B().DynamicTexture)('ckResLT', { width: 240, height: 56 }, scene, true);
    const c = t.getContext();
    c.clearRect(0, 0, 240, 56);
    c.fillStyle = '#3c4756';
    c.font = 'bold 30px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('R = 2.2 kΩ', 120, 30);
    t.hasAlpha = true; t.update();
    const m = new (B().StandardMaterial)('ckResLM', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    lbl.material = m;
    lbl.parent = resistorG;
  }

  /* ── 도선 ──
     스위치의 «접점 사이»(A↔공통, 공통↔B)는 레버가 잇는 구간이므로 도선을 두지 않는다. */
  const PATH_CHG = [
    [-3.5, 2.35], [-3.5, 3.5], [-0.85, 3.5],
    [0, 2.6],
    [0, 1.95], [0, -0.25],
    [0, -0.85],
    [0, -2.4], [-3.5, -2.4], [-3.5, 0.05],
  ];
  const PATH_DIS = [
    [0, -0.25], [0, 1.95],
    [0, 2.6], [0.85, 3.5],
    [3.5, 3.5], [3.5, 0.424],    // ↓ 소켓 + 구멍까지
    [3.5, -0.024],               // 소켓 − 구멍부터
    [3.5, -2.4], [0, -2.4], [0, -0.85],
  ];
  const SKIP_CHG = [2, 5];       // 2: A접점→공통(레버 자리), 5: 판 사이
  const SKIP_DIS = [2, 5];       // 2: 공통→B접점(레버 자리), 5: LED 내부(소켓 구멍 사이)

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
    wiresG = new (B().TransformNode)('ckWires', scene);
    const runs = (path, skips, tag) => {
      for (let i = 0; i < path.length - 1; i++) {
        if (skips.includes(i)) continue;
        wireSegs.push({ tag, i, mesh: seg(path[i], path[i + 1], wiresG, 'ckW' + tag + i) });
      }
    };
    runs(PATH_CHG, SKIP_CHG, 'c');
    runs(PATH_DIS, SKIP_DIS, 'd');
    for (let i = 0; i < 7; i++) {
      const d = B().MeshBuilder.CreateSphere('ckDot' + i, { diameter: 0.16 }, scene);
      d.material = emat('ckDotM' + i, '#ffd84a');
      d.isPickable = false;
      d.parent = wiresG;
      dots.push({ m: d, u: i / 7 });
    }
  }

  /** 판 간격이 바뀌면 판에 붙는 도선 끝점도 함께 이동 */
  function updateCapWires() {
    const g = CAP_GEOM[state.cap];
    PATH_CHG[5] = [0, CAPZ + g.gap / 2];
    PATH_CHG[6] = [0, CAPZ - g.gap / 2];
    PATH_DIS[0] = [0, CAPZ + g.gap / 2];
    PATH_DIS[9] = [0, CAPZ - g.gap / 2];
    if (!wireSegs.length) return;
    const fix = (tag, i) => {
      const path = tag === 'c' ? PATH_CHG : PATH_DIS;
      const s = wireSegs.find((w) => w.tag === tag && w.i === i);
      if (!s) return;
      const a = path[i], b = path[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      s.mesh.scaling.y = len / (s.mesh._len0 || (s.mesh._len0 = len));
      s.mesh.position.set((a[0] + b[0]) / 2, WY, (a[1] + b[1]) / 2);
    };
    fix('c', 4); fix('c', 6);
    fix('d', 0); fix('d', 8);
  }

  function pathPoint(path, u, skips) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      if (skips && skips.includes(i) && i === 5) continue;   // 판 사이만 건너뛴다 (레버 구간은 레버 위로 지나감)
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

  /* ── 배치 자리 ── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      battT: { x: -3.5, z: 1.2, w: 2.6, h: 3.4, label: '전지 홀더' },
      swT: { x: 0, z: 3.1, w: 3.2, h: 2.0, label: '칼날 스위치' },
      capT: { x: 0, z: CAPZ, w: 2.6, h: 2.2, label: '축전기' },
      ledT: { x: 3.5, z: 0.2, w: 2.2, h: 2.2, label: 'LED' },
    };
    Object.entries(spec).forEach(([id, c2]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c2.w, height: c2.h }, scene);
      p.position.set(c2.x, 0.06, c2.z);
      // 텍스처 비율을 자리(가로×세로)와 똑같이 — 글씨·점선이 늘어나지 않는다
      const TW2 = Math.round(c2.w * 150), TH2 = Math.round(c2.h * 150);
      const tex = new (B().DynamicTexture)('phT_' + id, { width: TW2, height: TH2 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, TW2, TH2);
      ctx.strokeStyle = '#2f6ad0'; ctx.lineWidth = 5;
      ctx.setLineDash([15, 11]);
      ctx.strokeRect(7, 7, TW2 - 14, TH2 - 14);
      ctx.setLineDash([]);
      ctx.fillStyle = '#2f6ad0';
      ctx.font = 'bold 44px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c2.label, TW2 / 2, TH2 / 2);
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

  const groupOf = () => ({ battT: batteryG, swT: switchG, capT: capG, ledT: ledG });

  /* ══ 도구 배치 ═══════════════════════════════ */
  function resetTools() {
    placed = {};
    anims = [];
    tools.forEach((t) => { placed[t.id] = false; });
    Object.values(groupOf()).forEach((g) => g.position.set(0, 0, 0));
    applyPlacement();
  }

  function placeTool(id) {
    const g = groupOf()[id];
    if (!placed[id] && g) {
      // 클릭 배치 — 부품이 위에서 제자리로 내려온다
      g.position.set(0, 2.2, 0);
      anims.push({ g });
    }
    placed[id] = true;
    applyPlacement();
  }

  /** 끌기 미리보기 — 실제 3D 부품이 커서를 따라온다 */
  function dragPreview(id, point) {
    const g = groupOf()[id];
    if (!g) return;
    if (point) {
      g.setEnabled(true);
      g.position.set(point.x - slots[id].x, 0.12, point.z - slots[id].z);
    } else {
      g.position.set(0, 0, 0);
      if (!placed[id]) g.setEnabled(false);
    }
  }

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
    sim = { t: 0, V: 0, I: 0, hist: [{ t: 0, V: 0, I: 0 }] };
    state.sw = 'open';
    if (ledUnit) {
      ledUnit.rotation.y = state.ledDir > 0 ? 0 : Math.PI;
      ledUnit.position.y = 0;
      updateLedTag();
    }
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    batteryG.setEnabled(!!placed.battT);
    switchG.setEnabled(!!placed.swT);
    capG.setEnabled(!!placed.capT);
    ledG.setEnabled(!!placed.ledT);
    resistorG.setEnabled(all);
    wiresG.setEnabled(all);
    if (!all) return;
    lever.rotation.y = state.sw === 'chg' ? -0.72 : state.sw === 'dis' ? 0.72 : 0;
    lever.rotation.x = state.sw === 'open' ? -0.55 : 0;
    layoutCap();
    drawPlateCharges();
    drawBattLabel();
    layoutLed();
  }

  function tick(dt0) {
    if (!sim || !allPlaced()) return false;
    const dt = dt0 * state.slow;   // 슬로 모션

    let dVdt = 0;
    if (state.sw === 'chg') dVdt = (state.volt - sim.V) / tauChg();
    else if (state.sw === 'dis' && state.ledDir > 0 && sim.V > 0.02) dVdt = -sim.V / tauDis();
    sim.V = Math.max(0, Math.min(state.volt + 0.001, sim.V + dVdt * dt));
    sim.I = capF() * Math.abs(dVdt) * 1000;   // mA
    sim.t += dt;
    if (sim.t - sim.hist[sim.hist.length - 1].t > 0.08) {
      sim.hist.push({ t: sim.t, V: sim.V, I: sim.I, sw: state.sw });
      if (sim.hist.length > 500) sim.hist.shift();
    }

    const speed = Math.min(0.45, sim.I / 3.5) * state.slow;
    const active = state.sw === 'chg' ? PATH_CHG
      : (state.sw === 'dis' && state.ledDir > 0) ? PATH_DIS : null;
    dots.forEach((d) => {
      if (!active || speed < 0.002) { d.m.setEnabled(false); return; }
      d.m.setEnabled(true);
      d.u = (d.u + speed * dt0) % 1;
      const [x, z] = pathPoint(active, d.u, active === PATH_CHG ? SKIP_CHG : null);
      d.m.position.set(x, WY + 0.02, z);
    });

    // LED 방향을 바꾸면 «뽑았다가 돌려서 다시 끼우는» 애니메이션
    const ledTarget = state.ledDir > 0 ? 0 : Math.PI;
    const diff = ledTarget - ledUnit.rotation.y;
    if (Math.abs(diff) > 0.01) {
      ledUnit.rotation.y += Math.sign(diff) * Math.min(3.2 * dt0, Math.abs(diff));
      ledUnit.position.y = Math.sin(Math.min(Math.abs(ledTarget - ledUnit.rotation.y), Math.PI)) * 1.1;
      updateLedTag();
    } else if (ledUnit.position.y !== 0) {
      ledUnit.position.y = 0;
      updateLedTag();
    }

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
    camera.beta = 0.72;
    camera.radius = 13.5;
    camera.setTarget(new (B().Vector3)(0, 0.6, 0.4));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '스위치를 A(충전)로 — 전하가 판에 쌓입니다. 열림에서 전하가 보존되는지 보고, B(방전)로 LED 를 켜 보세요. 거꾸로 끼우면?';
  const prepGuide = '도구 아이콘을 «클릭»하면 부품이 제자리로 들어갑니다. 끌어서 점선 자리에 놓아도 됩니다.';

  function controlsHTML() {
    return `
      ${LabUI.opts('전지 전압', 'volt', [
        { v: 3, t: '3 V' }, { v: 6, t: '6 V' }, { v: 9, t: '9 V' },
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
      ${LabUI.opts('재생 속도', 'slow', [
        { v: 1, t: '보통' }, { v: 0.25, t: '슬로 모션 ×¼' },
      ], state.slow, 1)}
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    LabUI.bindOpts(root, 'volt', state, 'volt', () => { drawBattLabel(); drawPlateCharges(); onChange(); });
    LabUI.bindOpts(root, 'cap', state, 'cap', () => { layoutCap(); onChange(); });
    LabUI.bindOpts(root, 'sw', state, 'sw', () => { layout(); onChange(); }, String);
    LabUI.bindOpts(root, 'ledDir', state, 'ledDir', () => { layoutLed(); onChange(); });
    LabUI.bindOpts(root, 'slow', state, 'slow', onChange);
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    const swName = { chg: 'A — 충전 중', open: '열림 (전하 보존)', dis: 'B — 방전' }[state.sw];
    const blocked = state.sw === 'dis' && state.ledDir < 0;
    const pct = Math.min(100, sim.V / state.volt * 100);
    return `
      <div class="row"><span>스위치</span><b class="big">${swName}</b></div>
      <div class="row"><span>충전 게이지</span><b class="big">${pct.toFixed(0)} %</b></div>
      <div class="row"><span>판의 전하 기호</span><b>${chargeCount()} 개</b></div>
      <div class="row"><span>축전기 전압 <i>V<sub>C</sub></i></span><b>${sim.V.toFixed(2)} V</b></div>
      <div class="row"><span>저장 전하 <i>Q</i> = <i>CV</i></span><b>${(capF() * sim.V * 1000).toFixed(2)} mC</b></div>
      <div class="row"><span>전류 <i>I</i></span><b>${sim.I.toFixed(2)} mA</b></div>
      <div class="row"><span>시간 상수 τ = <i>RC</i></span><b>${tauChg().toFixed(2)} s</b></div>
      <div class="formula">${blocked
        ? '<b style="color:#d0453a">LED 가 거꾸로!</b> LED(다이오드)는 한쪽 방향으로만 전류를 흘리므로 방전되지 않고 전하가 그대로 유지됩니다. 소켓의 +/− 표시와 긴 다리를 확인하세요.'
        : state.sw === 'chg'
        ? '전지의 전하가 도선을 따라 이동해 두 판에 +/− 로 쌓입니다. 판 사이에는 <b>전기장</b>이 만들어집니다 (노란 화살표).'
        : state.sw === 'open'
        ? '회로가 끊겨도 전하는 판에 <b>그대로 남습니다</b> — 축전기가 전기 에너지를 저장한다는 증거입니다.'
        : '전지를 거치지 않는데도 LED 가 켜집니다 — 축전기에 저장된 전하가 이동하며 에너지를 공급하기 때문입니다 (82쪽). «슬로 모션» 으로 과정을 늘려 보세요.'}</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '축전기 전압과 전류의 시간 변화';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 40, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;
    const TW = Math.max(8, sim ? sim.t : 8);
    const xOf = (t) => padL + (t / TW) * gw;
    const yOfV = (v) => padT + gh - (v / 10) * gh;

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
        const y = padT + gh - Math.min(1, p.I / 5) * gh;
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
    [3, 6, 9].forEach((v) => ctx.fillText(v.toFixed(0), padL - 4, yOfV(v)));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#69d98c'; ctx.fillText('V_C (V)', padL + 6, padT + 2);
    ctx.fillStyle = 'rgba(90,157,240,.9)'; ctx.fillText('I (mA)', padL + 60, padT + 2);
  }

  function graphFootHTML() {
    return `용량 ${state.cap} μF — 용량이 클수록 같은 전압에서 전하가 더 많이 쌓이고(Q=CV), 충전도 더 오래 걸립니다(τ=RC)`;
  }

  /* ══ 기록표 (82쪽 해 보기) ═══════════════════ */
  const recordColumns = [
    '시간 (s)', '전압 (V)', '용량 (μF)', '스위치', '전하 기호 (개)', '비고',
  ];

  function recordRow() {
    const note = state.sw === 'dis' && state.ledDir < 0 ? 'LED 거꾸로 — 방전 안 됨'
      : state.sw === 'dis' ? 'LED 점등' : state.sw === 'open' ? '전하 보존' : '';
    return [[sim.t.toFixed(1), state.volt.toFixed(0), state.cap,
      { chg: 'A 충전', open: '열림', dis: 'B 방전' }[state.sw],
      chargeCount(), note]];
  }

  return {
    id: 'circuit',
    title: '① 전하 창고를 채워라 — 충전과 방전',
    tabLabel: '① 충전과 방전',
    guide, prepGuide, tools,
    clickPlace: true,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName, dragPreview,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, tauChg, tauDis, chargeCount,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
