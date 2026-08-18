/**
 * ③ 네 대의 기기를 수리하라 — 생활 속 축전기 (교과서 84~85쪽 해 보기)
 *
 * 실제 기기의 내부 구조를 따른다:
 *   자동 심장 충격기 — 배터리 → 고전압 변환 회로 → 대용량 축전기(단자 2개) → 방전 스위치 → 패드 → 심장
 *     · 방전 시 전류가 패드→심장→패드로 흐르고 모형이 들썩이는 모션
 *   카메라 플래시 — AA 전지 → 승압 회로 → 축전기 → 트리거 회로 → 크세논 방전관(+반사판)
 *     · 셔터를 누르면 방전관이 터지는 섬광
 *   터치스크린 — 접촉 지점만 잠깐 전하가 빠져나갔다가 구동 회로가 다시 채운다 (리플 모션)
 *   습도 센서 — 공기 중 수증기와 흡습층의 수분이 평형을 이룬다 (같은 비율로 표시)
 *   분류 게임 — 실물 미니어처를 끌어서 두 선반에 옮긴다
 * (교육과정 지침에 따라 '전기 용량' 용어 대신 충전된 전하의 양으로 서술)
 */
const DeviceScene = (() => {
  const B = () => BABYLON;

  let scene, camera, canvasRef;
  let aedG, aedPads = [], aedHeart, aedDummyG, flashG, flashWin, flashTube, flashBurst;
  let touchG, touchScreen, touchTex, touchLayers = [], touchSparks = [];
  let humidG, humidMolsAir = [], humidMolsLayer = [], humidLayer;
  let sortG, sortItems = {}, sortCert, dragSort = null;
  let devDots = { aed: [], flash: [] };
  let placed = {};

  const GRID_W = 12, GRID_H = 7;      // 터치스크린 전하 격자
  const RESTORE_T = 1.4;              // 터치 후 전하가 다시 채워지는 시간 (s)

  const state = {
    mode: 'aed',         // 'aed' | 'flash' | 'touch' | 'humid' | 'sort'
    charging: false,
    gauge: 0,
    flashT: 0,
    shots: 0,
    tool: 'finger',      // 'finger' | 'eraser'
    touched: null,
    touchedT: 0,         // 감지 표시가 남아 있는 시간
    noSense: false,
    removed: {},         // {"c,r": 남은 복원 시간}
    ripples: [],         // [{x,y,t}] — 텍스처 픽셀 좌표
    dialed: '',          // 다이얼로 입력된 번호
    explode: false,      // 터치스크린 층 벌려 보기
    humid: 45,
    sorted: { aed: 0, flash: 0, touch: 0, humid: 0 },
    repaired: { aed: false, flash: false, touch: false, humid: false },
  };
  const ANSWER = { aed: 'cd', flash: 'cd', touch: 'qc', humid: 'qc' };
  const DEV_NAME = {
    aed: '자동 심장 충격기', flash: '카메라 플래시',
    touch: '터치스크린', humid: '습도 센서',
  };

  const tools = [{ id: 'bench', label: '기기 점검대', icon: 'voltmeter' }];

  const humidCharge = () => state.repaired.humid
    ? Math.round(60 + (state.humid - 20) / 70 * 80) : 40;
  const sortScore = () => Object.keys(ANSWER).filter((k) => state.sorted[k] === ANSWER[k]).length;

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    canvasRef = canvas;
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#e2d9c8ff');

    camera = new (B().ArcRotateCamera)(
      'camDv', -Math.PI / 2, 1.02, 12.5, new (B().Vector3)(0, 1.6, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 26;
    camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hdv', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.5, 0.48, 0.44);
    const dir = new (B().DirectionalLight)('ddv', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 14, -9);
    dir.intensity = 0.3;
    const glow = new (B().GlowLayer)('dvGlow', scene);
    glow.intensity = 0.5;

    const table = B().MeshBuilder.CreateBox('dvTable', { width: 24, height: 0.6, depth: 14 }, scene);
    table.position.y = -0.5;
    table.material = mat('dvTableM', '#a89a86', '#d4c8b4', 96);
    const padMesh = B().MeshBuilder.CreateBox('dvPad', { width: 12, height: 0.16, depth: 8 }, scene);
    padMesh.position.set(0, -0.1, 0);
    padMesh.material = mat('dvPadM', '#4a4038', '#7a6a58', 48);

    buildAED();
    buildFlash();
    buildTouch();
    buildHumid();
    buildSort();
    buildRepairs();
    bindPointer(canvas);

    // 교과서 그림 4장 — 기기별로 맞춰서, 시뮬레이션 쪽을 바라보도록 안쪽으로 기울인다
    LabUI.addPoster(scene, '../assets/thumbs/capx-aed.jpg',
      { x: -11, y: 0, z: 4.2, ry: -0.45, w: 3.2, h: 4.1, label: '교과서 84쪽 — AED' });
    LabUI.addPoster(scene, '../assets/thumbs/capx-table.jpg',
      { x: -6.4, y: 0, z: 5.4, ry: -0.28, w: 4.6, h: 2.75, label: '84쪽 — 플래시·습도 센서 원리' });
    LabUI.addPoster(scene, '../assets/thumbs/capx-layers.jpg',
      { x: 6.4, y: 0, z: 5.4, ry: 0.28, w: 4.0, h: 3.15, label: '85쪽 — 터치스크린 구조' });
    LabUI.addPoster(scene, '../assets/thumbs/capx-touch.jpg',
      { x: 11, y: 0, z: 4.2, ry: 0.45, w: 3.2, h: 4.05, label: '교과서 85쪽 — 터치' });

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
  function label(name, text, w, h, px, color) {
    const p = B().MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    p.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const W = Math.round(w * 120), H = Math.round(h * 120);
    const t = new (B().DynamicTexture)(name + 'T', { width: W, height: H }, scene, true);
    const c = t.getContext();
    c.clearRect(0, 0, W, H);
    c.fillStyle = color || '#2c3a46';
    c.font = `bold ${px}px "Noto Sans KR", sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    text.split('\n').forEach((ln, i, arr) =>
      c.fillText(ln, W / 2, H / 2 + (i - (arr.length - 1) / 2) * (px + 6)));
    t.hasAlpha = true; t.update();
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    p.material = m;
    p.isPickable = false;
    return p;
  }
  function sign(name, ch, hex, x, y, z, parent, size) {
    const p = B().MeshBuilder.CreatePlane(name, { width: size || 0.3, height: size || 0.3 }, scene);
    p.position.set(x, y, z);
    p.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const t = new (B().DynamicTexture)(name + 'T', { width: 96, height: 96 }, scene, true);
    const c = t.getContext();
    c.clearRect(0, 0, 96, 96);
    c.fillStyle = hex;
    c.font = 'bold 80px sans-serif';
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

  /** 3D 폴리라인 배선 */
  function wire3(pts, parent, name, hex, dia) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = new (B().Vector3)(...pts[i]), b = new (B().Vector3)(...pts[i + 1]);
      const d = b.subtract(a);
      const len = d.length();
      if (len < 1e-4) continue;
      const w = B().MeshBuilder.CreateCylinder(name + i, { height: len, diameter: dia || 0.06 }, scene);
      w.position = a.add(d.scale(0.5));
      const up = new (B().Vector3)(0, 1, 0);
      const axis = d.normalize();
      const rotAxis = B().Vector3.Cross(up, axis);
      const angle = Math.acos(Math.max(-1, Math.min(1, B().Vector3.Dot(up, axis))));
      w.rotationQuaternion = rotAxis.length() < 1e-5
        ? B().Quaternion.Identity()
        : B().Quaternion.RotationAxis(rotAxis.normalize(), angle);
      w.material = mat(name + i + 'M', hex || '#3c4756', '#8898ac', 64);
      w.isPickable = false;
      w.parent = parent;
    }
  }

  function path3Point(pts, u) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
      segs.push([i, L]); total += L;
    }
    let d = u * total;
    for (const [i, L] of segs) {
      if (d <= L) {
        const t = d / L;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
                pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
                pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t];
      }
      d -= L;
    }
    return pts[pts.length - 1];
  }

  function mkDots(key, n, parent) {
    for (let i = 0; i < n; i++) {
      const d = B().MeshBuilder.CreateSphere('dvDot_' + key + i, { diameter: 0.13 }, scene);
      d.material = emat('dvDotM_' + key + i, '#ffd84a');
      d.isPickable = false;
      d.parent = parent;
      devDots[key].push({ m: d, u: i / n });
    }
  }

  /** 내부 투시용 축전기 — 위쪽에 긴(+)·짧은(−) 단자 2개 */
  function bigCap(name, parent, x, y, z, s, capText) {
    const cap = B().MeshBuilder.CreateCylinder(name, { height: 1.2 * s, diameter: 0.8 * s }, scene);
    cap.position.set(x, y, z);
    cap.material = mat(name + 'M', '#20315e', '#8898ac', 96);
    cap.parent = parent;
    const band = B().MeshBuilder.CreateCylinder(name + 'B', { height: 0.3 * s, diameter: 0.82 * s }, scene);
    band.position.set(x, y + 0.3 * s, z);
    band.material = mat(name + 'BM', '#cfd8e8');
    band.parent = parent;
    const top = y + 0.6 * s;
    // 단자 2개 — 긴 쪽이 (+)
    const mkLead = (dx, h, nm) => {
      const l = B().MeshBuilder.CreateCylinder(name + nm, { height: h, diameter: 0.06 * s + 0.02 }, scene);
      l.position.set(x + dx, top + h / 2, z);
      l.material = mat(name + nm + 'M', '#8a93a6', '#dfe4ee', 96);
      l.parent = parent;
      return [x + dx, top + h, z];
    };
    const posP = mkLead(0.14 * s, 0.42, 'LP');   // 긴 다리 +
    const posN = mkLead(-0.14 * s, 0.26, 'LN');  // 짧은 다리 −
    sign(name + 'SP', '+', '#ff8a7a', posP[0] + 0.14, posP[1] + 0.16, z, parent, 0.22);
    sign(name + 'SN', '−', '#7ab0ff', posN[0] - 0.14, posN[1] + 0.16, z, parent, 0.22);
    const txt2 = capText || '축전기';
    const lines = txt2.split('\n').length;
    const lh = 0.36 * lines + 0.08;
    const l = label(name + 'L', txt2, 3.2, lh, 23, '#20315e');
    l.position.set(x, posP[1] + 0.35 + lh / 2, z);
    l.parent = parent;
    return { posP, posN };
  }

  function block(name, parent, x, y, z, w, h, d, hex, text, tcolor) {
    const b = B().MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z);
    b.material = mat(name + 'M', hex, '#cfe0d0', 48);
    b.parent = parent;
    if (text) {
      const lines = text.split('\n').length;
      const lh = 0.34 * lines + 0.08;
      const l = label(name + 'L', text, Math.max(2.2, w + 0.9), lh, 22, tcolor || '#2c5a34');
      l.position.set(x, y + h / 2 + lh / 2 + 0.12, z);
      l.parent = parent;
    }
    return b;
  }

  /* ── 자동 심장 충격기 ──
     배터리 → 변환 회로 → 축전기(+단자) … (−단자) → 배터리 로 닫힌 충전 회로,
     축전기(+) → 방전 스위치 → 패드 → 심장 → 패드 → 축전기(−) 로 닫힌 방전 회로 */
  let AED_CHG, AED_DIS;

  function buildAED() {
    aedG = new (B().TransformNode)('dvAed', scene);
    // 본체 — 실제 AED 처럼 주황 몸체 + 위 손잡이 + 전면 패널(화면·전원·충격 버튼)
    const body = B().MeshBuilder.CreateBox('aedBody', { width: 3.6, height: 2.9, depth: 1.5 }, scene);
    body.position.set(-1.9, 1.45, 0);
    const abm = mat('aedBodyM', '#e8901c', '#ffc890', 64);
    abm.alpha = 0.38;
    body.material = abm;
    body.parent = aedG;
    // 손잡이
    [[-2.7], [-1.1]].forEach(([x], i) => {
      const post = B().MeshBuilder.CreateBox('aedHandleP' + i, { width: 0.18, height: 0.5, depth: 0.3 }, scene);
      post.position.set(x, 3.05, 0);
      post.material = mat('aedHandlePM' + i, '#c87818', '#ffc890', 64);
      post.parent = aedG;
    });
    const bar = B().MeshBuilder.CreateBox('aedHandleB', { width: 1.9, height: 0.2, depth: 0.34 }, scene);
    bar.position.set(-1.9, 3.32, 0);
    bar.material = mat('aedHandleBM', '#c87818', '#ffc890', 64);
    bar.parent = aedG;
    // 전면 패널 — 심전도 화면 + 전원(초록)·충격(주황 ⚡) 버튼 + 스피커
    const scr = B().MeshBuilder.CreatePlane('aedScr', { width: 1.35, height: 0.85 }, scene);
    scr.position.set(-2.45, 2.25, -0.76);
    const st = new (B().DynamicTexture)('aedScrT', { width: 270, height: 170 }, scene, true);
    const sc2 = st.getContext();
    sc2.fillStyle = '#0c1a12'; sc2.fillRect(0, 0, 270, 170);
    sc2.strokeStyle = '#3af07a'; sc2.lineWidth = 4;
    sc2.beginPath();
    let px2 = 0;
    sc2.moveTo(0, 95);
    [[30, 95], [45, 95], [55, 40], [65, 140], [75, 95], [130, 95], [145, 95], [155, 40], [165, 140], [175, 95], [240, 95], [270, 95]]
      .forEach(([x, y]) => { sc2.lineTo(x, y); px2 = x; });
    sc2.stroke();
    st.update();
    const sm2 = new (B().StandardMaterial)('aedScrM', scene);
    sm2.diffuseTexture = st; sm2.emissiveTexture = st;
    sm2.emissiveColor = new (B().Color3)(1, 1, 1);
    sm2.backFaceCulling = false;
    scr.material = sm2;
    scr.parent = aedG;
    body.isPickable = false;
    // 전면 아래쪽 빈 공간에 큰 버튼 두 개 — 실제 AED 처럼
    // ⏻ 전원 버튼 (초록) — 켜면 충전이 시작된다
    const pwr = B().MeshBuilder.CreateCylinder('aedBtnPwr', { height: 0.12, diameter: 0.62 }, scene);
    pwr.rotation.x = Math.PI / 2;
    pwr.position.set(-2.7, 1.05, -0.78);
    pwr.material = emat('aedBtnPwrM', '#2f9e6b', 1);
    pwr.parent = aedG;
    sign('aedBtnPwrS', '⏻', '#0c3a24', -2.7, 1.05, -0.87, aedG, 0.34);
    const pwrL = label('aedBtnPwrL', '전원', 0.9, 0.34, 26, '#2f9e6b');
    pwrL.position.set(-2.7, 0.52, -0.85);
    pwrL.parent = aedG;
    // ⚡ 심장 충격 버튼 (주황) — 주위에 붉은 동심원 링
    const shock = B().MeshBuilder.CreateCylinder('aedBtnShock', { height: 0.12, diameter: 0.74 }, scene);
    shock.rotation.x = Math.PI / 2;
    shock.position.set(-1.25, 1.05, -0.78);
    shock.material = emat('aedBtnShockM', '#f08a20', 1);
    shock.parent = aedG;
    sign('aedBtnShockS', '⚡', '#7a3c00', -1.25, 1.05, -0.88, aedG, 0.42);
    [0.52, 0.66].forEach((rr, i) => {
      const ring = B().MeshBuilder.CreateTorus('aedShockRing' + i,
        { diameter: rr * 2, thickness: 0.035 }, scene);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(-1.25, 1.05, -0.77);
      ring.material = emat('aedShockRingM' + i, '#e0382a', 0.95 - i * 0.25);
      ring.isPickable = false;
      ring.parent = aedG;
    });
    const shockL = label('aedBtnShockL', '심장 충격', 1.4, 0.34, 26, '#e0382a');
    shockL.position.set(-1.25, 0.4, -0.85);
    shockL.parent = aedG;
    const btnHint = label('aedBtnHint', '⏻ 전원을 켜면 충전 시작 — 버튼을 직접 클릭!', 4.6, 0.4, 24, '#b05820');
    btnHint.position.set(-1.9, 0.05, -0.9);
    btnHint.parent = aedG;
    const tl = label('aedTitle', '자동 심장 충격기 (AED) — 내부가 보이는 훈련용 모형', 6.2, 0.5, 30);
    tl.position.set(-1.2, 4.2, 0);
    tl.parent = aedG;
    // ① 배터리
    block('aedBat', aedG, -3.0, 0.85, 0, 0.75, 0.85, 0.6, '#2a3542', '배터리 (전원)\n에너지의 공급원', '#3c4756');
    sign('aedBatP', '+', '#ff8a7a', -3.15, 1.42, 0.18, aedG, 0.22);
    sign('aedBatN', '−', '#7ab0ff', -2.85, 1.42, -0.18, aedG, 0.22);
    // ② 고전압 변환 회로
    block('aedConv', aedG, -1.9, 1.6, 0.1, 0.85, 0.4, 0.6, '#2c6a3c', '고전압 변환 회로\n낮은 전압을 수천 V 로 높인다');
    // ③ 대용량 축전기 (단자 2개)
    const leads = bigCap('aedCap', aedG, -0.85, 0.9, 0, 1.05, '대용량 축전기\n높인 전압으로 에너지를 모아 둔다');
    // ④ 방전 스위치 (제어)
    block('aedCtrl', aedG, -0.45, 2.55, -0.25, 0.6, 0.3, 0.45, '#6a4a2c', '방전 스위치\n⚡ 버튼을 누르면 닫힌다', '#6a4a2c');
    // 충전 폐회로: 배터리+ → 변환 회로 → 축전기(+) / 축전기(−) → 배터리−
    AED_CHG = [
      [-3.15, 1.3, 0.18], [-3.15, 1.6, 0.18], [-2.35, 1.6, 0.1],
      [-1.45, 1.6, 0.1], leads.posP,
      leads.posN, [-1.0, 2.15, -0.35], [-2.85, 2.15, -0.35], [-2.85, 1.3, -0.18],
    ];
    wire3(AED_CHG.slice(0, 5), aedG, 'aedWc', '#c0392b');
    wire3(AED_CHG.slice(5), aedG, 'aedWr', '#3c4756');
    // 인체 모형 (머리·몸통·팔·다리) + 심장 + 패드 — 들썩이는 모션을 위해 그룹으로
    aedDummyG = new (B().TransformNode)('aedDummyG', scene);
    aedDummyG.parent = aedG;
    const skin = () => mat('aedSkinM' + Math.random(), '#e8c8a0', '#f8e0c0', 48);
    const CX = 2.95, BZ = -0.3;           // 모형 중심 (머리 −z, 발 +z)
    // 몸통 (누운 캡슐) — 더 크게
    const torso = B().MeshBuilder.CreateCapsule('aedDummy', { radius: 0.78, height: 3.3, tessellation: 14 }, scene);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(CX, 0.6, BZ + 0.35);
    torso.material = skin();
    torso.parent = aedDummyG;
    // 목 + 머리 (몸통에 이어지게)
    const neck = B().MeshBuilder.CreateCylinder('aedNeck', { height: 0.6, diameter: 0.34 }, scene);
    neck.rotation.x = Math.PI / 2;
    neck.position.set(CX, 0.55, BZ - 1.5);
    neck.material = skin();
    neck.parent = aedDummyG;
    const head = B().MeshBuilder.CreateSphere('aedHead', { diameter: 0.95 }, scene);
    head.position.set(CX, 0.58, BZ - 2.1);
    head.material = skin();
    head.parent = aedDummyG;
    // 팔 2개 — 어깨에서 몸통에 붙어 자연스럽게
    [[-1, 0], [1, 1]].forEach(([sgn, i]) => {
      const arm = B().MeshBuilder.CreateCapsule('aedArm' + i, { radius: 0.19, height: 2.5, tessellation: 10 }, scene);
      arm.rotation.x = Math.PI / 2;
      arm.rotation.z = sgn * 0.09;       // 어깨에서 손끝으로 살짝 벌어지게
      arm.position.set(CX + sgn * 0.94, 0.42, BZ + 0.55);
      arm.material = skin();
      arm.parent = aedDummyG;
    });
    // 다리 2개 — 골반에서 이어지게
    [[-0.36, 0], [0.36, 1]].forEach(([dx, i]) => {
      const leg = B().MeshBuilder.CreateCapsule('aedLeg' + i, { radius: 0.23, height: 2.7, tessellation: 10 }, scene);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(CX + dx, 0.4, BZ + 3.1);
      leg.material = skin();
      leg.parent = aedDummyG;
    });
    // 심장 — 가슴 가운데에서 약간 왼쪽 (화면에서는 −x 쪽)
    aedHeart = B().MeshBuilder.CreateSphere('aedHeartM1', { diameter: 0.52 }, scene);
    aedHeart.scaling.set(1, 0.82, 0.9);
    aedHeart.position.set(CX - 0.16, 1.05, BZ - 0.55);
    aedHeart.material = emat('aedHeartMat', '#a03028', 1);
    aedHeart.parent = aedDummyG;
    const hl = label('aedHeartL', '심장', 0.9, 0.36, 26, '#a03028');
    hl.position.set(CX - 0.16, 2.0, BZ - 0.55);
    hl.parent = aedDummyG;
    const dl = label('aedDummyL', '훈련용 인체 모형', 2.4, 0.4, 26, '#6a5a44');
    dl.position.set(CX + 1.5, 2.5, BZ - 1.9);
    dl.parent = aedG;
    // 패드 2개 — 실제 부착 위치: ① 오른쪽 빗장뼈 아래(가슴 위)  ② 왼쪽 옆구리(겨드랑이 아래)
    const pad1 = B().MeshBuilder.CreateBox('aedPad0', { width: 0.7, height: 0.08, depth: 0.95 }, scene);
    pad1.position.set(CX + 0.5, 1.32, BZ - 0.78);   // 화면 기준 오른쪽(+x) · 가슴 위쪽
    pad1.rotation.z = -0.38;
    pad1.material = emat('aedPadM0', '#e8a040', 1);
    pad1.parent = aedDummyG;
    aedPads.push(pad1);
    const pad2 = B().MeshBuilder.CreateBox('aedPad1', { width: 0.7, height: 0.08, depth: 0.95 }, scene);
    pad2.position.set(CX - 0.92, 0.72, BZ + 0.75);  // 화면 기준 왼쪽(−x) · 옆구리 아래
    pad2.rotation.z = 1.12;
    pad2.material = emat('aedPadM1', '#e8a040', 1);
    pad2.parent = aedDummyG;
    aedPads.push(pad2);
    const padL = label('aedPadL', '패드 — 전류가 몸으로 드나드는 문', 4.0, 0.4, 24, '#8a5a10');
    padL.position.set(CX + 0.7, 2.15, BZ - 0.78);
    padL.parent = aedDummyG;
    // 방전 폐회로: 축전기(+) → 방전 스위치 → 패드1 → 심장 → 패드2 → 축전기(−)
    AED_DIS = [
      leads.posP, [-0.45, 2.55, -0.25],
      [0.9, 2.7, -0.9], [CX + 0.5, 1.9, BZ - 0.78], [CX + 0.5, 1.35, BZ - 0.78],
      [CX - 0.16, 1.08, BZ - 0.55],                               // 심장을 지나
      [CX - 0.92, 0.78, BZ + 0.75], [CX - 1.05, 1.9, BZ + 0.75], [1.2, 2.95, 0.5],
      [-0.6, 2.85, 0.15], leads.posN,
    ];
    wire3(AED_DIS.slice(1, 5), aedG, 'aedWd1', '#c0392b');
    wire3(AED_DIS.slice(6), aedG, 'aedWd2', '#3c4756');
    mkDots('aed', 7, aedG);
    // 설명 라벨이 서로 겹치지 않게 계단식으로 분산
    const lift = (nm, y) => { const m = scene.getMeshByName(nm); if (m) m.position.y = y; };
    lift('aedBatL', 1.85);
    lift('aedConvL', 2.42);
    lift('aedCapL', 3.15);
    lift('aedCtrlL', 3.75);
  }

  /* ── 카메라 플래시 ──
     AA 전지 → 승압 회로 → 축전기 → 트리거 회로 → 크세논 방전관(+반사판) */
  let FL_CHG, FL_DIS;

  function buildFlash() {
    flashG = new (B().TransformNode)('dvFlash', scene);
    flashG.scaling.set(1.32, 1.32, 1.32);       // 복잡해진 만큼 크게 보여 준다
    const body = B().MeshBuilder.CreateBox('flBody', { width: 3.6, height: 2.2, depth: 1.5 }, scene);
    body.position.set(0, 1.3, 0.3);
    const fbm = mat('flBodyM', '#2c3440', '#7a8aa0', 96);
    fbm.alpha = 0.26;                            // 내부가 보이되 윤곽도 남게
    body.material = fbm;
    body.parent = flashG;
    const grip = B().MeshBuilder.CreateBox('flGrip', { width: 0.9, height: 2.2, depth: 1.7 }, scene);
    grip.position.set(1.95, 1.3, 0.32);
    const gm = mat('flGripM', '#222a34', '#5a6a80', 64);
    gm.alpha = 0.4;
    grip.material = gm;
    grip.parent = flashG;
    const lens = B().MeshBuilder.CreateCylinder('flLens', { height: 0.7, diameter: 1.4 }, scene);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(-0.5, 1.05, -0.85);
    lens.material = mat('flLensM', '#101820', '#a0c0e0', 128);
    lens.parent = flashG;
    // ① AA 전지 2개 — 직렬로 맞붙여 놓는다 (한 전지의 + 가 다음 전지의 − 에 닿는다)
    [[-1.55, 0.52], [-1.55, -0.52]].forEach(([x, z0], i) => {
      const c = B().MeshBuilder.CreateCylinder('flCell' + i, { height: 1.0, diameter: 0.3 }, scene);
      c.rotation.x = Math.PI / 2;
      c.position.set(x, 0.72, z0);
      c.material = mat('flCellM' + i, '#d8b44a', '#ffe8a0', 96);
      c.parent = flashG;
      // 전지의 + 꼭지 (앞쪽 −z 방향)
      const cap0 = B().MeshBuilder.CreateCylinder('flCellP' + i, { height: 0.08, diameter: 0.14 }, scene);
      cap0.rotation.x = Math.PI / 2;
      cap0.position.set(x, 0.72, z0 - 0.54);
      cap0.material = mat('flCellPM' + i, '#c0b090', '#ffe8a0', 96);
      cap0.parent = flashG;
    });
    // 두 전지를 잇는 접속판 (뒤 전지의 + ↔ 앞 전지의 − 를 잇는다)
    const bridge = B().MeshBuilder.CreateCylinder('flCellBr', { height: 0.06, diameter: 0.3 }, scene);
    bridge.rotation.x = Math.PI / 2;
    bridge.position.set(-1.55, 0.72, 0.0);
    bridge.material = mat('flCellBrM', '#9aa7b8', '#e0e8f0', 96);
    bridge.parent = flashG;
    const bl = label('flBatL', '전지 (AA×2) — 에너지 공급', 3.0, 0.36, 22, '#3c4756');
    bl.position.set(-1.55, 1.55, 0.0);
    bl.parent = flashG;
    sign('flBatP', '+', '#ff8a7a', -1.55, 1.16, -1.12, flashG, 0.22);
    sign('flBatN', '−', '#7ab0ff', -1.55, 1.16, 1.08, flashG, 0.22);
    // ② 승압 회로
    block('flConv', flashG, -0.25, 0.68, 0.3, 0.7, 0.35, 0.55, '#2c6a3c', '승압 회로\n1.5 V 를 수백 V 로 높인다');
    // ③ 축전기 (단자 2개)
    const leads = bigCap('flCap', flashG, 0.78, 0.7, 0.5, 0.75, '축전기 — 에너지를 모아 둔다');
    // ④ 셔터 스위치 (예전 이름: 트리거 회로)
    block('flTrig', flashG, 0.15, 2.15, 0.05, 0.55, 0.28, 0.45, '#6a4a2c',
      '셔터 스위치\n셔터를 누르면 축전기를\n방전관에 연결한다', '#6a4a2c');
    // ⑤ 크세논 방전관 + 반사판
    const refl = B().MeshBuilder.CreateBox('flRefl', { width: 1.15, height: 0.6, depth: 0.1 }, scene);
    refl.position.set(1.0, 2.05, -0.62);
    refl.material = mat('flReflM', '#c8d4e0', '#ffffff', 128);
    refl.parent = flashG;
    flashTube = B().MeshBuilder.CreateCylinder('flTube', { height: 0.9, diameter: 0.14 }, scene);
    flashTube.rotation.z = Math.PI / 2;
    flashTube.position.set(1.0, 2.05, -0.72);
    flashTube.material = emat('flTubeM', '#5a6a78', 0.9);
    flashTube.parent = flashG;
    const tl2 = label('flTubeL', '크세논 방전관 + 반사판\n전류가 흐르는 순간 밝은 빛을 낸다', 4.2, 0.66, 22, '#3c5568');
    tl2.position.set(1.1, 2.95, -0.6);
    tl2.parent = flashG;
    flashWin = B().MeshBuilder.CreatePlane('flWin', { width: 1.2, height: 0.62 }, scene);
    flashWin.position.set(1.0, 2.05, -0.88);
    flashWin.material = emat('flWinM', '#8a97a5', 0.35);
    flashWin.parent = flashG;
    // 터지는 섬광 (방전 순간에만)
    flashBurst = B().MeshBuilder.CreateDisc('flBurst', { radius: 0.52 }, scene);
    flashBurst.position.set(1.0, 2.05, -0.95);
    flashBurst.material = emat('flBurstM', '#fffbe8', 0);
    flashBurst.parent = flashG;
    body.isPickable = false;
    grip.isPickable = false;
    const btn = B().MeshBuilder.CreateCylinder('flBtn', { height: 0.16, diameter: 0.4 }, scene);
    btn.position.set(1.95, 2.48, 0.6);
    btn.material = mat('flBtnM', '#c83a30', '#ff9a90', 96);
    btn.parent = flashG;
    const btnPwr = B().MeshBuilder.CreateCylinder('flBtnPwr', { height: 0.16, diameter: 0.34 }, scene);
    btnPwr.position.set(1.95, 2.48, 0.05);
    btnPwr.material = emat('flBtnPwrM', '#2f9e6b', 1);
    btnPwr.parent = flashG;
    const btnHint = label('flBtnHint', '초록=충전 · 빨강=셔터\n버튼을 직접 클릭!', 2.4, 0.62, 22, '#b05820');
    btnHint.position.set(2.15, 3.1, 0.35);
    btnHint.parent = flashG;
    // 충전 폐회로: 전지+ → (승압 회로 속을 지나) → 축전기(+) / (−) → 전지−
    FL_CHG = [
      [-1.55, 0.72, -1.08], [-1.42, 1.62, -0.6], [-0.85, 1.62, 0.3],
      [-0.68, 1.1, 0.3], [-0.68, 0.7, 0.3],
      [0.08, 0.7, 0.35],
      [0.5, 1.1, 0.45], leads.posP,
      leads.posN, [1.35, 1.41, 0.5], [1.35, 0.16, 0.35], [-1.55, 0.16, 1.04], [-1.55, 0.72, 1.03],
    ];
    wire3(FL_CHG.slice(0, 8), flashG, 'flWc', '#c0392b');
    wire3(FL_CHG.slice(8), flashG, 'flWr', '#3c4756');
    // 방전 폐회로: 축전기(+) → 셔터 스위치 → 방전관 왼쪽 / 오른쪽 → 축전기(−)
    FL_DIS = [
      leads.posP, [0.5, 2.15, 0.05], [0.15, 2.15, 0.05],
      [0.55, 2.05, -0.72],
      [1.45, 2.05, -0.72], [1.5, 1.4, 0.1], leads.posN,
    ];
    wire3(FL_DIS.slice(0, 4), flashG, 'flWd1', '#c0392b');
    wire3(FL_DIS.slice(4), flashG, 'flWd2', '#3c4756');
    mkDots('flash', 6, flashG);
    const tl3 = label('flTitle', '카메라 플래시 — 내부가 보이는 모형', 4.4, 0.5, 30);
    tl3.position.set(0.4, 4.1, 0.3);
    tl3.parent = flashG;
    // 설명 라벨 계단식 분산
    const lift = (nm, y) => { const m = scene.getMeshByName(nm); if (m) m.position.y = y; };
    lift('flBatL', 1.62);
    lift('flConvL', 1.35);
    lift('flCapL', 2.25);
    lift('flTrigL', 3.55);
    lift('flTubeL', 2.95);
    lift('flBtnHint', 3.05);
  }

  /* ── 터치스크린 ────────────────────────────── */
  function buildTouch() {
    touchG = new (B().TransformNode)('dvTouch', scene);
    // 층 5겹 — 교과서 그림과 같은 차례: 유리 · 투명 전극 · 유리 · 투명 전극 · 디스플레이
    const layers = [
      ['유리', '#bcd8e8', 0.5, -0.34, '#2f7fd6'],
      ['투명 전극', '#7fc8a8', 0.5, -0.24, '#1d8a5c'],
      ['유리', '#bcd8e8', 0.5, -0.14, '#2f7fd6'],
      ['투명 전극', '#7fc8a8', 0.5, -0.04, '#1d8a5c'],
      ['디스플레이 화면', '#39424f', 1, 0.08, '#8a97a5'],
    ];
    const EXPLODE_Z = [-2.0, -1.1, -0.2, 0.7, 1.6];
    touchLayers = layers.map(([nm, hex, alpha, z, edge], i) => {
      const l = B().MeshBuilder.CreateBox('tsL' + i, { width: 6.2, height: 3.6, depth: 0.05 }, scene);
      l.position.set(0, 2.2, z);
      const m = mat('tsLM' + i, hex, '#e8f4fa', 64);
      m.alpha = alpha;
      l.material = m;
      l.parent = touchG;
      // 층 테두리 — 어느 층인지 또렷하게
      l.enableEdgesRendering();
      l.edgesWidth = 3.5;
      const ec = B().Color3.FromHexString(edge);
      l.edgesColor = new (B().Color4)(ec.r, ec.g, ec.b, 0.95);
      const ll = label('tsLL' + i, nm, 2.0, 0.36, 24, '#3c5568');
      ll.position.set(3.9 + (i % 2) * 0.1, 3.9 - i * 0.5, z);
      ll.billboardMode = 0;
      ll.parent = touchG;
      return { mesh: l, lbl: ll, z0: z, zx: EXPLODE_Z[i] };
    });
    touchScreen = B().MeshBuilder.CreatePlane('tsScreen', { width: 6.0, height: 3.4 }, scene);
    touchScreen.position.set(0, 2.2, -0.40);
    touchTex = new (B().DynamicTexture)('tsTex', { width: 720, height: 408 }, scene, true);
    const m = new (B().StandardMaterial)('tsScreenM', scene);
    m.diffuseTexture = touchTex; m.emissiveTexture = touchTex;
    m.emissiveColor = new (B().Color3)(0.9, 0.9, 0.9);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    touchScreen.material = m;
    touchScreen.parent = touchG;
    block('tsPcb', touchG, 0, 0.22, 0.35, 3.2, 0.3, 0.9, '#2c6a3c', '');
    const pl = label('tsPcbL', '구동 회로 (컨트롤러) — 두 전극에 낮은 전압을 걸고, 빠져나간 전하를 다시 채운다', 8.4, 0.4, 26, '#2c5a34');
    pl.position.set(0, -0.25, 0.4);
    pl.parent = touchG;
    block('tsPwr', touchG, 2.1, 0.28, 0.35, 0.6, 0.35, 0.6, '#2a3542', '전원(저전압)', '#3c4756');
    wire3([[2.1, 0.45, 0.35], [1.6, 0.45, 0.35]], touchG, 'tsWp', '#3c4756');
    wire3([[-0.8, 0.37, 0.3], [-0.8, 0.6, -0.18], [-0.8, 2.2, -0.18]], touchG, 'tsW1', '#c0392b');
    wire3([[0.8, 0.37, 0.3], [0.8, 0.6, -0.10], [0.8, 2.2, -0.10]], touchG, 'tsW2', '#3c4756');
    const tl = label('tsTitle', '전기 용량식 터치스크린 (단면) — 번호판을 터치해 보세요!', 6.8, 0.5, 30);
    tl.position.set(0, 4.5, 0);
    tl.parent = touchG;
    drawTouchTex();
  }

  /** 다이얼(전화 번호판) 화면 — 터치하면 그 숫자가 인식되어 위 표시줄에 찍힌다.
      빠져나간 전하는 잠시 뒤 복원되고, 터치 지점에는 리플이 번진다. */
  const DIAL = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['*', '0', '#']];
  const DIAL_X = [220, 360, 500];
  const DIAL_Y = [125, 198, 271, 344];
  const DIAL_R = 31;

  function dialAt(px, py) {
    for (let r = 0; r < 4; r++) {
      for (let cix = 0; cix < 3; cix++) {
        if (Math.hypot(px - DIAL_X[cix], py - DIAL_Y[r]) < DIAL_R + 12) return DIAL[r][cix];
      }
    }
    return null;
  }

  function drawTouchTex() {
    const c = touchTex.getContext();
    c.fillStyle = '#10202e';
    c.fillRect(0, 0, 720, 408);
    const cw = 720 / GRID_W, ch = 408 / GRID_H;
    // 전하 격자 (배경, 화면 뒤에 깔린 전하들)
    for (let r = 0; r < GRID_H; r++) {
      for (let col = 0; col < GRID_W; col++) {
        const left = state.removed[col + ',' + r];
        const cx2 = col * cw + cw / 2, cy2 = r * ch + ch / 2;
        if (left > 0) {
          // 전하가 빠져나간 빈 자리 — 주황 점선 링으로 또렷하게
          const back = 1 - left / RESTORE_T;
          c.strokeStyle = `rgba(255,150,60,${0.9 - back * 0.6})`;
          c.lineWidth = 3;
          c.setLineDash([5, 4]);
          c.beginPath();
          c.arc(cx2, cy2, 15, 0, Math.PI * 2);
          c.stroke();
          c.setLineDash([]);
          if (back > 0.25) {
            c.globalAlpha = back * 0.5;
            c.fillStyle = '#4fa0e0';
            c.font = 'bold 22px sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText('−', cx2, cy2);
            c.globalAlpha = 1;
          }
          continue;
        }
        c.globalAlpha = 0.45;
        c.fillStyle = '#4fa0e0';
        c.font = 'bold 22px sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('−', cx2, cy2);
        c.globalAlpha = 1;
      }
    }
    // 상단 표시줄 — 인식된 번호가 찍힌다
    c.fillStyle = '#08141e';
    c.fillRect(120, 16, 480, 56);
    c.strokeStyle = '#2a4a62'; c.lineWidth = 2;
    c.strokeRect(120, 16, 480, 56);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (state.dialed) {
      c.fillStyle = '#e8f4ff';
      c.font = 'bold 38px "Noto Sans KR", sans-serif';
      c.fillText(state.dialed.split('').join(' '), 360, 46);
    } else {
      c.fillStyle = '#5a7a92';
      c.font = 'bold 24px "Noto Sans KR", sans-serif';
      c.fillText('번호판을 터치해 보세요', 360, 46);
    }
    // 다이얼 버튼
    for (let r = 0; r < 4; r++) {
      for (let cix = 0; cix < 3; cix++) {
        const x = DIAL_X[cix], y = DIAL_Y[r];
        const digit = DIAL[r][cix];
        const active = state.touched && state.touched[2] === digit && state.touchedT > 0.6;
        c.beginPath();
        c.arc(x, y, DIAL_R, 0, Math.PI * 2);
        c.fillStyle = active ? '#2f9e6b' : 'rgba(38,64,88,0.85)';
        c.fill();
        c.strokeStyle = active ? '#5af0a0' : '#3c6484';
        c.lineWidth = 2.5;
        c.stroke();
        c.fillStyle = '#e8f4ff';
        c.font = 'bold 30px "Noto Sans KR", sans-serif';
        c.fillText(digit, x, y + 1);
      }
    }
    // 터치 리플 (번지는 원)
    state.ripples.forEach((rp) => {
      const k = 1 - rp.t / 0.6;
      c.strokeStyle = `rgba(255,216,74,${(1 - k) * 0.9})`;
      c.lineWidth = 5 - k * 3;
      c.beginPath();
      c.arc(rp.x, rp.y, 12 + k * 80, 0, Math.PI * 2);
      c.stroke();
    });
    // 안내 문구
    c.textAlign = 'left'; c.textBaseline = 'bottom';
    if (state.touched && state.touchedT > 0) {
      c.fillStyle = '#ffd84a'; c.font = 'bold 19px "Noto Sans KR", sans-serif';
      c.fillText(`전하량 변화 감지 → ${state.touched[2] ? `${state.touched[2]} 입력!` : '위치 인식!'} (곧 다시 채워집니다)`, 12, 398);
    } else if (state.noSense) {
      c.fillStyle = '#f08a80'; c.font = 'bold 19px "Noto Sans KR", sans-serif';
      c.fillText('반응 없음 — 부도체는 전하를 데려가지 못해요', 12, 398);
    }
    touchTex.update();
  }

  /* ── 수리 의뢰(스토리) — 기기마다 고장 원인을 찾아 알맞은 부품으로 고쳐야 작동한다 ── */
  let repairBuilt = false;
  let dragRp = null;     // 수리 부품 끌기 상태
  const REPAIR = {
    aed: {
      title: '의뢰 ①  "심장 충격기가 충전되지 않아요"',
      prompt: '빈 자리에 알맞은 부품을 골라 끼우세요 (클릭)',
      parts: [['res', '저항'], ['coil', '코일'], ['cap', '축전기']],
      answer: 'cap',
      wrong: {
        res: '저항은 전류를 줄일 뿐, 에너지를 모아 두지 못해요.',
        coil: '코일은 전하를 저장하는 부품이 아니에요.',
      },
      ok: '대용량 축전기 장착, 수리 완료! 이제 ⏻ 전원을 켜 충전해 보세요.',
    },
    flash: {
      title: '의뢰 ②  "플래시 섬광이 터지지 않아요"',
      prompt: '알맞은 용량의 축전기를 골라 끼우세요 (클릭)',
      parts: [['c10', '10 μF'], ['c100', '100 μF'], ['c1200', '1200 μF']],
      answer: 'c1200',
      wrong: {
        c10: '용량이 너무 작아 섬광에 필요한 에너지를 모을 수 없어요.',
        c100: '아직 부족해요 — 짧은 순간에 큰 에너지를 내려면 더 큰 용량이 필요해요.',
      },
      ok: '대용량 축전기 장착, 수리 완료! 초록 버튼으로 충전해 보세요.',
    },
    humid: {
      title: '의뢰 ④  "습도가 항상 똑같이 나와요"',
      prompt: '두 전극 사이에 알맞은 감지층을 골라 끼우세요 (클릭)',
      parts: [['metal', '금속판'], ['glass', '유리판'], ['poly', '고분자 흡습층']],
      answer: 'poly',
      wrong: {
        metal: '금속판은 두 전극을 그대로 이어 버려요(단락) — 전하를 저장할 수 없어요.',
        glass: '유리는 수분을 머금지 못해 습도가 변해도 전하량이 변하지 않아요.',
      },
      ok: '흡습층 장착, 수리 완료! 습도 슬라이더를 움직여 보세요.',
    },
  };
  REPAIR.touch = {
    title: '의뢰 ③  "터치 패널이 통째로 분해되어 왔어요"',
    prompt: '앞(손가락 쪽)부터 교과서 차례대로 5겹을 조립하세요',
    parts: [['tglass', '유리'], ['telec', '투명 전극'], ['tdisp', '디스플레이']],
    order: ['tglass', 'telec', 'tglass', 'telec', 'tdisp'],
    stageHint: ['맨 앞(손가락이 닿는 쪽)은 긁힘을 막는 유리예요.',
                '유리 뒤에는 낮은 전압으로 전하를 퍼뜨릴 투명 전극이 와요.',
                '전극 뒤에 다시 유리가 들어가 두 전극을 떼어 놓아요.',
                '그 뒤에 두 번째 투명 전극이 와요.',
                '맨 뒤에는 그림을 보여 줄 디스플레이 화면이 와요.'],
    okStage: ['① 유리 장착! 다음 차례는?',
              '② 투명 전극 장착! 다음 차례는?',
              '③ 유리 장착! 다음 차례는?',
              '④ 투명 전극 장착! 마지막 부품은?',
              '⑤ 디스플레이 장착 — 조립 완료! 이제 번호판을 터치해 보세요.'],
  };
  const REPAIR_PREFIX = { aed: ['aedCap'], flash: ['flCap'], humid: ['hmLayer'] };

  /** 후보 부품 모형 — 저항 / 코일 / 축전기(용량별 크기) / 판(금속·유리·흡습층) */
  function mkPartMesh(kind, nm, parent) {
    const g = new (B().TransformNode)(nm, scene);
    g.parent = parent;
    const add = (m) => { m.parent = g; return m; };
    if (kind === 'res') {
      const b = add(B().MeshBuilder.CreateCylinder(nm + 'b', { height: 0.7, diameter: 0.24 }, scene));
      b.rotation.z = Math.PI / 2; b.position.y = 0.24;
      b.material = mat(nm + 'bM', '#d8b478', '#f0e0b0', 64);
      [-0.16, 0, 0.16].forEach((dx, i) => {
        const r = add(B().MeshBuilder.CreateCylinder(nm + 'r' + i, { height: 0.09, diameter: 0.27 }, scene));
        r.rotation.z = Math.PI / 2; r.position.set(dx, 0.24, 0);
        r.material = mat(nm + 'rM' + i, ['#8a4a2c', '#1a1a1a', '#c03a2c'][i]);
      });
    } else if (kind === 'coil') {
      for (let i = 0; i < 4; i++) {
        const t = add(B().MeshBuilder.CreateTorus(nm + 't' + i, { diameter: 0.42, thickness: 0.08 }, scene));
        t.position.y = 0.1 + i * 0.1;
        t.material = mat(nm + 'tM' + i, '#c07830', '#ffd8a0', 96);
      }
    } else if (kind === 'tglass' || kind === 'telec' || kind === 'tdisp') {
      const hex = kind === 'tglass' ? '#bcd8e8' : kind === 'telec' ? '#7fc8a8' : '#39424f';
      const b = add(B().MeshBuilder.CreateBox(nm + 'b', { width: 1.35, height: 0.85, depth: 0.07 }, scene));
      b.position.y = 0.46;
      const m2 = mat(nm + 'bM', hex);
      if (kind !== 'tdisp') m2.alpha = 0.6;
      b.material = m2;   // 한 번에 한 겹씩 끼우므로 부품도 «한 장»이다
    } else if (kind === 'metal' || kind === 'glass' || kind === 'poly') {
      const b = add(B().MeshBuilder.CreateBox(nm + 'b', { width: 0.55, height: 0.8, depth: 0.5 }, scene));
      b.position.y = 0.42;
      const m2 = mat(nm + 'bM', kind === 'metal' ? '#aab6c8' : kind === 'glass' ? '#bcd8e8' : '#7fc0d8');
      if (kind !== 'metal') m2.alpha = 0.6;
      b.material = m2;
    } else {   // 축전기 — c10 / c100 / c1200 / cap
      const sc = kind === 'c10' ? 0.5 : kind === 'c100' ? 0.72 : 1.0;
      const c = add(B().MeshBuilder.CreateCylinder(nm + 'c', { height: 0.8 * sc, diameter: 0.5 * sc }, scene));
      c.position.y = 0.4 * sc;
      c.material = mat(nm + 'cM', '#20315e', '#8898ac', 96);
      const band = add(B().MeshBuilder.CreateCylinder(nm + 'bd', { height: 0.18 * sc, diameter: 0.52 * sc }, scene));
      band.position.y = 0.62 * sc;
      band.material = mat(nm + 'bdM', '#cfd8e8');
    }
    return g;
  }

  /** 부품 선반 + 의뢰 카드 */
  function buildShelf(key, parent, x, y, z, scale) {
    const R = REPAIR[key];
    const g = new (B().TransformNode)('rpShelf_' + key, scene);
    g.parent = parent;
    g.position.set(x, y, z);
    if (scale && scale !== 1) g.scaling.set(scale, scale, scale);
    const tray = B().MeshBuilder.CreateBox('rpTray_' + key, { width: 3.5, height: 0.12, depth: 1.15 }, scene);
    tray.position.y = 0.06;
    tray.material = mat('rpTrayM_' + key, '#b89a6a', '#e0c898', 48);
    tray.isPickable = false;
    tray.parent = g;
    const card = label('rpCard_' + key, R.title + '\n' + R.prompt, 5.6, 0.86, 26, '#b03a28');
    card.position.set(0, 2.0, 0);
    card.parent = g;
    R.parts.forEach(([k, nm2], i) => {
      const pg = mkPartMesh(k, 'rp_' + key + '_' + k, g);
      pg.position.set(-1.15 + i * 1.15, 0.12, -0.1);
      pg.getChildMeshes().forEach((m) => { m.metadata = { rp: key, part: k }; });
      const pl = label('rpL_' + key + '_' + k, nm2, 1.3, 0.34, 22, '#3c4756');
      pl.position.set(-1.15 + i * 1.15, 1.25, -0.1);
      pl.parent = g;
    });
  }

  /** 수리 전(고장) ↔ 수리 후 표시 전환 */
  function setRepairVisual(key, on) {
    (REPAIR_PREFIX[key] || []).forEach((pre) => {
      scene.meshes.forEach((m) => { if (m.name.indexOf(pre) === 0) m.setEnabled(on); });
    });
    const shelf = scene.getTransformNodeByName('rpShelf_' + key);
    if (shelf) shelf.setEnabled(!on);
    const slot = scene.getMeshByName('rpSlot_' + key);
    if (slot) { slot.setEnabled(!on); if (slot._lbl) slot._lbl.setEnabled(!on); }
    if (key === 'humid' && humidG) layoutHumid();
  }

  /** 터치 패널 조립 진행 표시 — n 층까지 끼워졌다 (0=빈 틀, 3=완성) */
  function setTouchAsm(n) {
    state._touchAsm = n;
    if (!touchLayers.length) return;
    touchLayers.forEach((L, i) => {
      L.mesh.setEnabled(n >= i + 1);
      L.lbl.setEnabled(n >= i + 1);
    });
    // 번호판 화면은 5겹을 모두 끼운 뒤에만 나타난다
    if (touchScreen) touchScreen.setEnabled(n >= REPAIR.touch.order.length && !state.explode);
  }

  function handleRepair(md) {
    const key = md.rp;
    if (key === 'touch') {
      if (state.repaired.touch) return;
      const R = REPAIR.touch;
      const n = state._touchAsm || 0;
      if (md.part === R.order[n]) {
        setTouchAsm(n + 1);
        if (n + 1 >= R.order.length) {
          state.repaired.touch = true;
          const slot = scene.getMeshByName('rpSlot_touch');
          if (slot) { slot.setEnabled(false); if (slot._lbl) slot._lbl.setEnabled(false); }
          const shelf = scene.getTransformNodeByName('rpShelf_touch');
          if (shelf) shelf.setEnabled(false);
        }
        Lab.showHint(R.okStage[n], true);
        Lab.refresh();
      } else {
        Lab.showHint(R.stageHint[n]);
      }
      return;
    }
    const R = REPAIR[key];
    if (!R || state.repaired[key]) return;
    if (md.part === R.answer) {
      state.repaired[key] = true;
      setRepairVisual(key, true);
      Lab.showHint(R.ok, true);
      Lab.refresh();
    } else {
      Lab.showHint(R.wrong[md.part] || '그 부품으로는 고칠 수 없어요.');
    }
  }

  /** 수리 요소 일괄 생성 — 버튼 픽 프록시 · 부품 선반 · 끊어진 도선 */
  function buildRepairs() {
    // 얇은 3D 버튼은 옆·비스듬한 각도에서 클릭이 빗나가기 쉬우므로 투명 픽 프록시를 씌운다
    [['aedBtnPwr', 'aedBtnHitP'], ['aedBtnShock', 'aedBtnHitS'],
     ['flBtnPwr', 'flBtnHitP'], ['flBtn', 'flBtnHitS']].forEach(([src, nm]) => {
      const s0 = scene.getMeshByName(src);
      if (!s0) return;
      const h = B().MeshBuilder.CreateSphere(nm, { diameter: 0.62 }, scene);
      h.position.copyFrom(s0.position);
      h.material = emat(nm + 'M', '#ffffff', 0.02);
      h.parent = s0.parent;
    });
    // 부품 선반은 모두 기기 «앞»(카메라 쪽, −z)에 — 바로 보이고 끌기 쉽게
    buildShelf('aed', aedG, -0.6, 0, -3.1, 1);
    buildShelf('flash', flashG, 0, 0, -2.5, 0.85);
    buildShelf('humid', humidG, 0.3, 0, -3.1, 0.9);
    buildShelf('touch', touchG, 0, 0, -3.2, 0.95);
    // 빈 자리(주황 점선) 표시 — 여기로 부품을 끌어다 놓는다
    const slotGhost = (key, mesh2, txt, ly) => {
      const m0 = mat('rpSlotM_' + key, '#e0a23a');
      m0.alpha = 0.07;
      mesh2.material = m0;
      mesh2.isPickable = false;
      mesh2.enableEdgesRendering();
      mesh2.edgesWidth = 2.5;
      mesh2.edgesColor = new (B().Color4)(0.92, 0.63, 0.2, 0.5);
      const l0 = label('rpSlotL_' + key, txt, 3.4, 0.42, 24, '#b05820');
      l0.position.copyFrom(mesh2.position);
      l0.position.y = ly;
      l0.parent = mesh2.parent;
      mesh2._lbl = l0;
      return mesh2;
    };
    const sA = B().MeshBuilder.CreateCylinder('rpSlot_aed', { height: 1.35, diameter: 0.95 }, scene);
    sA.position.set(-0.85, 0.9, 0);
    sA.parent = aedG;
    slotGhost('aed', sA, '축전기 자리 — 끌어다 놓기', 1.95);
    const sF = B().MeshBuilder.CreateCylinder('rpSlot_flash', { height: 1.05, diameter: 0.72 }, scene);
    sF.position.set(0.78, 0.7, 0.5);
    sF.parent = flashG;
    slotGhost('flash', sF, '축전기 자리 — 끌어다 놓기', 1.45);
    const sH = B().MeshBuilder.CreateBox('rpSlot_humid', { width: 1.6, height: 2.1, depth: 1.7 }, scene);
    sH.position.set(0, 1.5, 0);
    sH.parent = humidG;
    slotGhost('humid', sH, '감지층 자리 — 끌어다 놓기', 3.0);
    // 손가락 / 지우개 — 터치한 자리에 잠깐 나타났다 사라진다
    const fg = new (B().TransformNode)('tsFinger', scene);
    fg.parent = touchG;
    const fTip = B().MeshBuilder.CreateSphere('tsFingerTip', { diameter: 0.42 }, scene);
    fTip.position.set(0, 0, -0.24);
    fTip.material = mat('tsFingerTipM', '#f0c8a8', '#fff0e0', 64);
    fTip.isPickable = false;
    fTip.parent = fg;
    const fBody = B().MeshBuilder.CreateCylinder('tsFingerBody', { height: 1.5, diameter: 0.38 }, scene);
    fBody.rotation.x = Math.PI / 2.6;
    fBody.position.set(0.12, 0.62, -0.78);
    fBody.material = mat('tsFingerBodyM', '#f0c8a8', '#fff0e0', 64);
    fBody.isPickable = false;
    fBody.parent = fg;
    fg.setEnabled(false);
    touchG._finger = fg;
    const eg = new (B().TransformNode)('tsEraser', scene);
    eg.parent = touchG;
    const eBox = B().MeshBuilder.CreateBox('tsEraserBox', { width: 0.75, height: 0.36, depth: 0.42 }, scene);
    eBox.position.set(0, 0, -0.32);
    eBox.material = mat('tsEraserBoxM', '#e8e0d0', '#fff8f0', 32);
    eBox.isPickable = false;
    eBox.parent = eg;
    const eBand = B().MeshBuilder.CreateBox('tsEraserBand', { width: 0.78, height: 0.14, depth: 0.44 }, scene);
    eBand.position.set(0, 0.12, -0.32);
    eBand.material = mat('tsEraserBandM', '#5a7fc0', '#c8d8f0', 32);
    eBand.isPickable = false;
    eBand.parent = eg;
    eg.setEnabled(false);
    touchG._eraser = eg;
    // 터치 — 조립 틀 (층·화면은 조립 순서대로 나타난다)
    const sT = B().MeshBuilder.CreateBox('rpSlot_touch', { width: 6.4, height: 3.8, depth: 0.7 }, scene);
    sT.position.set(0, 2.2, -0.12);
    sT.parent = touchG;
    slotGhost('touch', sT, '① 유리 → ② 투명 전극 → ③ 화면 순서로 조립!', 4.5);
    repairBuilt = true;
    ['aed', 'flash', 'humid'].forEach((k) => setRepairVisual(k, false));
    setTouchAsm(0);
  }

  /** 탐구 수행 단계 자동 진행 조건 (content.steps.devices 와 1:1) */
  function stepDone(i) {
    if (i === 0) return state.repaired.aed && !!state._usedAed;
    if (i === 1) return state.repaired.flash && !!state._usedFlash;
    if (i === 2) return state.repaired.touch && state.dialed.length > 0;
    if (i === 3) return state.repaired.humid && !!state._humidMoved;
    return false;
  }

  /* ── 포인터 — 기기 버튼 클릭 + 터치 체험 + 분류 게임 드래그 ── */
  function bindPointer(canvas) {
    scene.onPointerObservable.add((info) => {
      // 수리 부품 — 끌어서 기기의 빈 자리(주황 표시)에 놓는다. 제자리 클릭도 선택으로 인정
      if (info.type === B().PointerEventTypes.POINTERDOWN) {
        const pk0 = info.pickInfo;
        const md = pk0 && pk0.hit && pk0.pickedMesh && pk0.pickedMesh.metadata;
        if (md && md.rp) {
          const node = scene.getTransformNodeByName('rp_' + md.rp + '_' + md.part);
          if (!node) { handleRepair(md); return; }
          dragRp = { key: md.rp, part: md.part, node, home: node.position.clone(), moved: false };
          camera.detachControl(canvasRef);
          return;
        }
      }
      if (dragRp && info.type === B().PointerEventTypes.POINTERMOVE) {
        const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, B().Matrix.Identity(), camera);
        const plane = B().Plane.FromPositionAndNormal(B().Vector3.Zero(), new (B().Vector3)(0, 1, 0));
        const d = ray.intersectsPlane(plane);
        if (d !== null) {
          const p = ray.origin.add(ray.direction.scale(d));
          dragRp.node.setAbsolutePosition(new (B().Vector3)(p.x, 0.4, p.z));
          dragRp.moved = true;
        }
        return;
      }
      if (dragRp && info.type === B().PointerEventTypes.POINTERUP) {
        const dr = dragRp;
        dragRp = null;
        camera.attachControl(canvasRef, true);
        const slot = scene.getMeshByName('rpSlot_' + dr.key);
        let nearSlot = !dr.moved;
        if (dr.moved && slot) {
          const a = dr.node.getAbsolutePosition();
          const b2 = slot.getAbsolutePosition();
          nearSlot = Math.hypot(a.x - b2.x, a.z - b2.z) < 2.4;
        }
        dr.node.position.copyFrom(dr.home);
        if (nearSlot) handleRepair({ rp: dr.key, part: dr.part });
        else Lab.showHint('기기의 빈 자리(주황 표시)에 끌어다 놓아 보세요.');
        return;
      }
      // 기기의 3D 버튼을 직접 클릭 (전원=충전 · ⚡/셔터=방전)
      // 얇은 버튼 옆면에서도 클릭되도록 투명 픽 프록시(…Hit…)도 함께 받는다
      if ((state.mode === 'aed' || state.mode === 'flash') &&
          info.type === B().PointerEventTypes.POINTERDOWN) {
        const pk = info.pickInfo;
        const n = pk && pk.hit && pk.pickedMesh && pk.pickedMesh.name;
        const isPwr = n === 'aedBtnPwr' || n === 'flBtnPwr' || n === 'aedBtnHitP' || n === 'flBtnHitP';
        const isShot = n === 'aedBtnShock' || n === 'flBtn' || n === 'aedBtnHitS' || n === 'flBtnHitS';
        if ((isPwr || isShot) && !state.repaired[state.mode]) {
          Lab.showHint('아직 수리 전이에요 — 앞의 부품 선반에서 알맞은 부품을 골라 끼우세요.');
          return;
        }
        if (isPwr) {
          state.charging = true;
          Lab.refresh();
        } else if (isShot) {
          discharge();
          Lab.refresh();
        }
        return;
      }
      // 터치스크린 체험 — 다이얼 숫자 인식
      if (state.mode === 'touch' && info.type === B().PointerEventTypes.POINTERDOWN) {
        const pick = info.pickInfo;
        if (!pick || !pick.hit || pick.pickedMesh !== touchScreen) return;
        if (!state.repaired.touch) {
          Lab.showHint('아직 조립 전이에요 — 앞의 부품을 순서대로 끼워 패널을 완성하세요.');
          return;
        }
        const uv = pick.getTextureCoordinates();
        if (!uv) return;
        const px = uv.x * 720, py = (1 - uv.y) * 408;
        const col = Math.max(0, Math.min(GRID_W - 1, Math.floor(uv.x * GRID_W)));
        const r = Math.max(0, Math.min(GRID_H - 1, Math.floor((1 - uv.y) * GRID_H)));
        // 누른 자리에 손가락(또는 지우개)이 나타났다가 사라진다
        const tx = (uv.x - 0.5) * 6.0, ty = 2.2 + (uv.y - 0.5) * 3.4;
        const hand = state.tool === 'finger' ? touchG._finger : touchG._eraser;
        const other = state.tool === 'finger' ? touchG._eraser : touchG._finger;
        if (other) other.setEnabled(false);
        if (hand) {
          hand.position.set(tx, ty, -0.45);
          hand.setEnabled(true);
          state._handT = 0.9;
        }
        if (state.tool === 'finger') {
          state.removed[col + ',' + r] = RESTORE_T;
          const digit = dialAt(px, py);
          if (digit) state.dialed = (state.dialed + digit).slice(-8);
          state.touched = [col, r, digit];
          state.touchedT = 1.2;
          state.noSense = false;
          state.ripples.push({ x: px, y: py, t: 0.6 });
          // 전자가 화면에서 빠져나오는 방전 입자
          const wx = (uv.x - 0.5) * 6.0;
          const wy = 2.2 + (uv.y - 0.5) * 3.4;
          for (let k = 0; k < 4; k++) {
            const s = B().MeshBuilder.CreateSphere('tsSpark' + Math.random(), { diameter: 0.13 }, scene);
            const sm3 = emat('tsSparkM' + Math.random(), '#4fa0e0', 1);
            s.material = sm3;
            s.isPickable = false;
            s.parent = touchG;
            s.position.set(wx + (Math.random() - 0.5) * 0.2, wy + (Math.random() - 0.5) * 0.2, -0.45);
            touchSparks.push({ m: s, t: 0.55, vx: (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random() * 0.8 });
          }
        } else {
          state.touched = null;
          state.noSense = true;
        }
        drawTouchTex();
        Lab.refresh();
        return;
      }
      // 분류 게임 — 미니어처를 끌어서 선반에
      if (state.mode !== 'sort') return;
      if (info.type === B().PointerEventTypes.POINTERDOWN) {
        const pick = info.pickInfo;
        const key = pick && pick.hit && pick.pickedMesh && pick.pickedMesh.metadata
          && pick.pickedMesh.metadata.srtKey;
        if (!key) return;
        dragSort = key;
        camera.detachControl(canvasRef);
      } else if (info.type === B().PointerEventTypes.POINTERMOVE && dragSort) {
        const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, B().Matrix.Identity(), camera);
        const plane = B().Plane.FromPositionAndNormal(B().Vector3.Zero(), new (B().Vector3)(0, 1, 0));
        const d = ray.intersectsPlane(plane);
        if (d !== null) {
          const p = ray.origin.add(ray.direction.scale(d));
          sortItems[dragSort].position.set(p.x, 0.25, p.z);
        }
      } else if (info.type === B().PointerEventTypes.POINTERUP && dragSort) {
        const g = sortItems[dragSort];
        const x = g.position.x, z = g.position.z;
        state.sorted[dragSort] = (z < 0.8 && x < -1.0) ? 'cd' : (z < 0.8 && x > 1.0) ? 'qc' : 0;
        layoutSort();
        Lab.refresh();
        camera.attachControl(canvasRef, true);
        dragSort = null;
      }
    });
  }

  /* ── 습도 센서 — 공기 중 수증기와 흡습층 수분은 평형 (같은 비율로 표시) ── */
  function buildHumid() {
    humidG = new (B().TransformNode)('dvHumid', scene);
    block('hmPcb', humidG, 0.4, 0.3, 0, 5.2, 0.18, 2.6, '#2c6a3c', '');
    const pl = label('hmPcbL', '센서 기판 (PCB)', 2.2, 0.38, 24, '#2c5a34');
    pl.position.set(0.4, -0.2, 0.9);
    pl.parent = humidG;
    [[-0.9, 'hmP0'], [0.9, 'hmP1']].forEach(([x, nm]) => {
      const p = B().MeshBuilder.CreateBox(nm, { width: 0.16, height: 2.2, depth: 1.8 }, scene);
      p.position.set(x, 1.5, 0);
      p.material = mat(nm + 'M', '#aab6c8', '#e8f0fa', 96);
      p.parent = humidG;
    });
    humidLayer = B().MeshBuilder.CreateBox('hmLayer', { width: 1.6, height: 2.1, depth: 1.7 }, scene);
    humidLayer.position.set(0, 1.5, 0);
    const lm = mat('hmLayerM', '#7fc0d8');
    lm.alpha = 0.35;
    humidLayer.material = lm;
    humidLayer.parent = humidG;
    const ll = label('hmLayerL', '수분을 머금는 흡습층 — 공기 중 수증기와 평형을 이룬다', 6.2, 0.42, 26, '#20648a');
    ll.position.set(0, 3.1, 0);
    ll.parent = humidG;
    block('hmChip', humidG, 2.3, 0.55, 0.6, 0.8, 0.32, 0.7, '#1a222c', '측정 회로', '#3c4756');
    block('hmPwr', humidG, 2.3, 0.55, -0.6, 0.6, 0.32, 0.55, '#2a3542', '전원', '#3c4756');
    wire3([[-0.9, 0.45, 0.6], [-0.9, 0.4, 0.9], [2.3, 0.4, 0.9], [2.3, 0.55, 0.75]], humidG, 'hmW1', '#c0392b');
    wire3([[0.9, 0.45, 0.5], [2.0, 0.5, 0.6]], humidG, 'hmW2', '#3c4756');
    wire3([[2.7, 0.55, 0.6], [3.4, 0.9, 0.3], [3.6, 1.3, 0]], humidG, 'hmW3', '#3c4756');
    // 물 분자 — 극성 분자 모형: 산소(붉은 큰 구, δ−) + 수소(흰 작은 구 2개, δ+)
    // 공기 중에서는 방향이 제멋대로, 흡습층 안(전기장 속)에서는 정렬된다 — 유전 분극
    const oMat = emat('hmMolO', '#d04838', 0.95);
    const hMat = emat('hmMolH', '#f0f0f0', 0.95);
    const mkMol = (nm, aligned) => {
      const g = new (B().TransformNode)(nm, scene);
      const o = B().MeshBuilder.CreateSphere(nm + 'o', { diameter: 0.17 }, scene);
      o.position.set(-0.055, 0, 0);
      o.material = oMat;
      o.isPickable = false;
      o.parent = g;
      [[0.075, 0.065], [0.075, -0.065]].forEach(([dx, dy], k) => {
        const h = B().MeshBuilder.CreateSphere(nm + 'h' + k, { diameter: 0.095 }, scene);
        h.position.set(dx, dy, 0);
        h.material = hMat;
        h.isPickable = false;
        h.parent = g;
      });
      if (aligned) {
        // 전기장 방향으로 정렬: 산소(−)가 + 전극(왼쪽)을, 수소(+)가 − 전극(오른쪽)을 향한다
        g.rotation.set(0, 0, (Math.random() - 0.5) * 0.2);
      } else {
        g.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      }
      g.parent = humidG;
      return g;
    };
    for (let i = 0; i < 18; i++) {
      const g = mkMol('hmMolL' + i, true);
      g.position.set((Math.random() * 2 - 1) * 0.55, 0.6 + Math.random() * 1.9, (Math.random() * 2 - 1) * 0.65);
      humidMolsLayer.push(g);
    }
    for (let i = 0; i < 18; i++) {
      const g = mkMol('hmMolA' + i, false);
      const ang = Math.random() * Math.PI * 2;
      const rad = 1.6 + Math.random() * 2.2;
      g.position.set(Math.cos(ang) * rad, 0.7 + Math.random() * 3.0, Math.sin(ang) * rad * 0.6);
      humidMolsAir.push(g);
    }
    // 전극 안쪽 면의 충전 전하 — 물 분자(분극)가 늘수록 함께 늘어난다
    const mkFace = (nm, x, ry) => {
      const f = B().MeshBuilder.CreatePlane(nm, { width: 1.7, height: 2.1 }, scene);
      f.position.set(x, 1.5, 0);
      f.rotation.y = ry;
      const t = new (B().DynamicTexture)(nm + 'T', { width: 170, height: 210 }, scene, true);
      t.hasAlpha = true;
      const m = new (B().StandardMaterial)(nm + 'M', scene);
      m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.backFaceCulling = false;
      f.material = m;
      f.isPickable = false;
      f.parent = humidG;
      return t;
    };
    humidG._chgTexP = mkFace('hmChgP', -0.8, Math.PI / 2);   // 왼쪽 전극 안쪽 (+)
    humidG._chgTexN = mkFace('hmChgN', 0.8, -Math.PI / 2);   // 오른쪽 전극 안쪽 (−)
    const dl2 = label('hmPolarL',
      '물 분자는 극성 분자 — 붉은 쪽(산소)이 −, 흰 쪽(수소)이 +.\n전기장 속에서 정렬(유전 분극)되어 판의 전하를 붙잡아 준다',
      6.6, 0.72, 22, '#8a4a20');
    dl2.position.set(0, -0.75, 0);
    dl2.parent = humidG;
    const tl = label('hmTitle', '전기 용량식 습도 센서 (단면 모형)', 4.8, 0.5, 30);
    tl.position.set(0.4, 4.2, 0);
    tl.parent = humidG;
    const disp = B().MeshBuilder.CreatePlane('hmDisp', { width: 2.0, height: 0.9 }, scene);
    disp.position.set(3.9, 1.7, 0);
    const dt = new (B().DynamicTexture)('hmDispT', { width: 260, height: 120 }, scene, true);
    const dm = new (B().StandardMaterial)('hmDispM', scene);
    dm.diffuseTexture = dt; dm.emissiveTexture = dt;
    dm.emissiveColor = new (B().Color3)(1, 1, 1);
    dm.backFaceCulling = false;
    disp.material = dm;
    disp.parent = humidG;
    humidG._dispTex = dt;
  }

  function drawHumidDisp() {
    const t = humidG._dispTex;
    const c = t.getContext();
    c.fillStyle = '#101820'; c.fillRect(0, 0, 260, 120);
    c.fillStyle = '#5af0a0';
    c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${state.humid.toFixed(0)} %`, 130, 46);
    c.fillStyle = '#9fb0c2'; c.font = 'bold 20px "Noto Sans KR", sans-serif';
    c.fillText('표시 습도', 130, 92);
    t.update();
  }

  function layoutHumid() {
    const frac = (state.humid - 20) / 70;
    const n = 2 + Math.round(frac * 16);
    // 공기 중과 흡습층의 수증기·수분을 같은 비율로 — 평형
    const okH = state.repaired.humid;
    humidMolsLayer.forEach((m, i) => m.setEnabled(okH && i < n));
    humidMolsAir.forEach((m, i) => m.setEnabled(i < n));
    humidLayer.material.alpha = 0.2 + frac * 0.35;
    // 전극에 충전된 전하 — 분극된 물 분자가 늘수록 함께 늘어난다 (고른 분포)
    const nq = okH ? Math.round(humidCharge() / 140 * 12) : 0;
    const drawQ = (tex, sign) => {
      const c = tex.getContext();
      c.clearRect(0, 0, 170, 210);
      c.font = 'bold 30px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = sign > 0 ? '#d0453a' : '#2f6ad0';
      const cols = Math.max(1, Math.round(Math.sqrt(nq * 170 / 210)));
      const rows = Math.ceil(nq / cols);
      let i = 0;
      for (let r = 0; r < rows && i < nq; r++) {
        const inRow = Math.min(cols, nq - r * cols);
        for (let k = 0; k < inRow; k++, i++) {
          c.fillText(sign > 0 ? '+' : '−', 170 * (k + 1) / (inRow + 1), 210 * (r + 1) / (rows + 1));
        }
      }
      tex.update();
    };
    drawQ(humidG._chgTexP, +1);
    drawQ(humidG._chgTexN, -1);
    drawHumidDisp();
  }

  /* ── 분류 게임 — 실물 미니어처를 끌어서 옮긴다 ── */
  function buildSort() {
    sortG = new (B().TransformNode)('dvSort', scene);
    [[-3.2, '충전·방전 이용', '#b05820', '#c8a86a'], [3.2, '전하량 변화 이용', '#20648a', '#8ab4c8']]
      .forEach(([x, nm, col, hex], i) => {
        const sh = B().MeshBuilder.CreateBox('srtShelf' + i, { width: 4.6, height: 0.2, depth: 3.2 }, scene);
        sh.position.set(x, 0.6, 0.1);
        sh.material = mat('srtShelfM' + i, hex, '#f0e0c0', 48);
        sh.isPickable = false;
        sh.parent = sortG;
        // 이름표를 뒤판에 고정 (빌보드 아님 — 돌려 봐도 판에 붙어 있다)
        const board = B().MeshBuilder.CreateBox('srtBoard' + i, { width: 4.6, height: 1.2, depth: 0.16 }, scene);
        board.position.set(x, 1.3, 1.72);
        board.material = mat('srtBoardM' + i, hex, '#f0e0c0', 48);
        board.isPickable = false;
        board.parent = sortG;
        const face = B().MeshBuilder.CreatePlane('srtBoardL' + i, { width: 4.3, height: 1.0 }, scene);
        face.position.set(x, 1.3, 1.63);
        const t2 = new (B().DynamicTexture)('srtBoardLT' + i, { width: 560, height: 130 }, scene, true);
        const c2 = t2.getContext();
        c2.clearRect(0, 0, 560, 130);
        c2.fillStyle = '#ffffff';
        c2.font = 'bold 56px "Noto Sans KR", sans-serif';
        c2.textAlign = 'center'; c2.textBaseline = 'middle';
        c2.fillText(nm, 280, 68);
        t2.hasAlpha = true; t2.update();
        const m2 = new (B().StandardMaterial)('srtBoardLM' + i, scene);
        m2.diffuseTexture = t2; m2.opacityTexture = t2; m2.emissiveTexture = t2;
        m2.emissiveColor = new (B().Color3)(1, 1, 1);
        m2.backFaceCulling = false;
        face.material = m2;
        face.isPickable = false;
        face.parent = sortG;
      });

    /** 미니어처 부품 등록 도우미 — 끌 수 있도록 metadata 에 key 를 심는다 */
    const reg = (mesh, key, g) => {
      mesh.metadata = { srtKey: key };
      mesh.parent = g;
      return mesh;
    };
    const mkGroup = (key, x, txt) => {
      const g = new (B().TransformNode)('srt_' + key, scene);
      g.position.set(x, 0, -2.6);
      g._home = new (B().Vector3)(x, 0, -2.6);
      g.parent = sortG;
      const l = label('srtL_' + key, txt, 2.2, 0.5, 24);
      l.position.y = 1.7;
      l.parent = g;
      sortItems[key] = g;
      return g;
    };

    // AED 미니어처 — 실물처럼: 주황 몸체 + 손잡이 + 심전도 화면 + 전원·충격 버튼 + 패드
    {
      const g = mkGroup('aed', -4.4, '자동 심장 충격기');
      const b = B().MeshBuilder.CreateBox('srtM_aed_0', { width: 1.1, height: 0.95, depth: 0.7 }, scene);
      b.position.y = 0.55;
      b.material = mat('srtM_aed_0M', '#e8901c', '#ffc890', 64);
      reg(b, 'aed', g);
      const hb = B().MeshBuilder.CreateBox('srtM_aed_h', { width: 0.7, height: 0.1, depth: 0.18 }, scene);
      hb.position.set(0, 1.14, 0);
      hb.material = mat('srtM_aed_hM', '#c87818', '#ffc890', 64);
      reg(hb, 'aed', g);
      [[-0.28], [0.28]].forEach(([dx], i) => {
        const hp = B().MeshBuilder.CreateBox('srtM_aed_hp' + i, { width: 0.09, height: 0.16, depth: 0.14 }, scene);
        hp.position.set(dx, 1.04, 0);
        hp.material = mat('srtM_aed_hp' + i + 'M', '#c87818');
        reg(hp, 'aed', g);
      });
      const scr = B().MeshBuilder.CreatePlane('srtM_aed_1', { width: 0.52, height: 0.34 }, scene);
      scr.position.set(-0.2, 0.78, -0.36);
      scr.material = emat('srtM_aed_1M', '#0c1a12');
      reg(scr, 'aed', g);
      const pwr = B().MeshBuilder.CreateCylinder('srtM_aed_b1', { height: 0.05, diameter: 0.16 }, scene);
      pwr.rotation.x = Math.PI / 2;
      pwr.position.set(0.3, 0.82, -0.37);
      pwr.material = emat('srtM_aed_b1M', '#2f9e6b');
      reg(pwr, 'aed', g);
      const shock = B().MeshBuilder.CreateCylinder('srtM_aed_b2', { height: 0.05, diameter: 0.2 }, scene);
      shock.rotation.x = Math.PI / 2;
      shock.position.set(0.3, 0.55, -0.37);
      shock.material = emat('srtM_aed_b2M', '#f08a20');
      reg(shock, 'aed', g);
      [[-0.25], [0.25]].forEach(([dx], i) => {
        const p = B().MeshBuilder.CreateBox('srtM_aed_p' + i, { width: 0.3, height: 0.05, depth: 0.4 }, scene);
        p.position.set(dx, 0.13, 0.5);
        p.material = emat('srtM_aed_p' + i + 'M', '#e8a040');
        reg(p, 'aed', g);
      });
    }
    // 플래시 미니어처 — 몸체 + 렌즈 + 플래시 창
    {
      const g = mkGroup('flash', -1.5, '카메라 플래시');
      const b = B().MeshBuilder.CreateBox('srtM_flash_0', { width: 1.3, height: 0.8, depth: 0.6 }, scene);
      b.position.y = 0.5;
      b.material = mat('srtM_flash_0M', '#2c3440', '#7a8aa0', 96);
      reg(b, 'flash', g);
      const lens = B().MeshBuilder.CreateCylinder('srtM_flash_1', { height: 0.25, diameter: 0.55 }, scene);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(-0.15, 0.5, -0.42);
      lens.material = mat('srtM_flash_1M', '#101820', '#a0c0e0', 128);
      reg(lens, 'flash', g);
      const win = B().MeshBuilder.CreatePlane('srtM_flash_2', { width: 0.45, height: 0.24 }, scene);
      win.position.set(0.42, 0.85, -0.31);
      win.material = emat('srtM_flash_2M', '#e8ecf0');
      reg(win, 'flash', g);
    }
    // 터치스크린 미니어처 — 패널
    {
      const g = mkGroup('touch', 1.5, '터치스크린');
      const b = B().MeshBuilder.CreateBox('srtM_touch_0', { width: 1.3, height: 0.9, depth: 0.1 }, scene);
      b.position.y = 0.55;
      b.material = mat('srtM_touch_0M', '#3a6ea0', '#a0c8e8', 96);
      reg(b, 'touch', g);
      const scr = B().MeshBuilder.CreatePlane('srtM_touch_1', { width: 1.14, height: 0.74 }, scene);
      scr.position.set(0, 0.55, -0.06);
      scr.material = emat('srtM_touch_1M', '#10202e');
      reg(scr, 'touch', g);
    }
    // 습도 센서 미니어처 — 기판 + 전극 2 + 흡습층
    {
      const g = mkGroup('humid', 4.4, '습도 센서');
      const pcb = B().MeshBuilder.CreateBox('srtM_humid_0', { width: 1.2, height: 0.08, depth: 0.8 }, scene);
      pcb.position.y = 0.1;
      pcb.material = mat('srtM_humid_0M', '#2c6a3c', '#cfe0d0', 48);
      reg(pcb, 'humid', g);
      [[-0.3], [0.3]].forEach(([dx], i) => {
        const p = B().MeshBuilder.CreateBox('srtM_humid_p' + i, { width: 0.07, height: 0.7, depth: 0.55 }, scene);
        p.position.set(dx, 0.5, 0);
        p.material = mat('srtM_humid_p' + i + 'M', '#aab6c8', '#e8f0fa', 96);
        reg(p, 'humid', g);
      });
      const lay = B().MeshBuilder.CreateBox('srtM_humid_1', { width: 0.5, height: 0.65, depth: 0.5 }, scene);
      lay.position.y = 0.5;
      const lm2 = mat('srtM_humid_1M', '#7fc0d8');
      lm2.alpha = 0.5;
      lay.material = lm2;
      reg(lay, 'humid', g);
    }
    sortCert = label('srtCert', '🏅 4개 모두 정답 — 정식 엔지니어 인증서 획득!', 8.0, 0.7, 40, '#b05820');
    sortCert.position.set(0, 4.4, -1.2);
    sortCert.parent = sortG;
  }

  function layoutSort() {
    const slots2 = { cd: [], qc: [] };
    Object.entries(sortItems).forEach(([key, g]) => {
      const s = state.sorted[key];
      if (!s) { g.position.copyFrom(g._home); return; }
      const idx = slots2[s].length;
      slots2[s].push(key);
      g.position.set((s === 'cd' ? -3.2 : 3.2) + (idx - 0.5) * 1.9, 0.7, -0.2);
    });
    sortCert.setEnabled(sortScore() === 4);
  }

  /* ══ 도구 (noPrep) ═══════════════════════════ */
  function resetTools() {
    placed = {}; tools.forEach((t) => { placed[t.id] = true; });
    state.mode = 'aed';
    state.charging = false; state.gauge = 0; state.flashT = 0; state.shots = 0;
    state.tool = 'finger'; state.touched = null; state.touchedT = 0; state.noSense = false;
    state.removed = {}; state.ripples = []; state.dialed = ''; state.explode = false;
    touchSparks.forEach((p) => p.m.dispose());
    touchSparks = [];
    state._handT = 0;
    if (touchG && touchG._finger) { touchG._finger.setEnabled(false); touchG._eraser.setEnabled(false); }
    state.humid = 45;
    state.sorted = { aed: 0, flash: 0, touch: 0, humid: 0 };
    state.repaired = { aed: false, flash: false, touch: false, humid: false };
    state._usedAed = false; state._usedFlash = false; state._humidMoved = false;
    if (repairBuilt) {
      ['aed', 'flash', 'humid'].forEach((k) => setRepairVisual(k, false));
      setTouchAsm(0);
      const slotT = scene.getMeshByName('rpSlot_touch');
      if (slotT) { slotT.setEnabled(true); if (slotT._lbl) slotT._lbl.setEnabled(true); }
      const shelfT = scene.getTransformNodeByName('rpShelf_touch');
      if (shelfT) shelfT.setEnabled(true);
    }
    dragRp = null;
    dragSort = null;
    if (touchTex) drawTouchTex();
    layout();
  }
  function placeTool(id) { placed[id] = true; }
  function allPlaced() { return true; }
  function dropAt() { return 'ok'; }
  function slotName() { return ''; }

  /** 터치스크린 층 배치 — 벌려 보기 지원 */
  function layoutTouchLayers() {
    touchLayers.forEach((L2) => {
      const z = state.explode ? L2.zx : L2.z0;
      L2.mesh.position.z = z;
      L2.lbl.position.z = z;
    });
    // 조립이 끝난 뒤에만 화면을 보여 주고, 벌려 보기 중에는 층 구조에 집중
    const done = (state._touchAsm || 0) >= REPAIR.touch.order.length;
    touchScreen.setEnabled(done && !state.explode);
    touchScreen.position.z = state.explode ? touchLayers[4].zx - 0.06 : -0.40;
  }

  function layout() {
    aedG.setEnabled(state.mode === 'aed');
    flashG.setEnabled(state.mode === 'flash');
    touchG.setEnabled(state.mode === 'touch');
    humidG.setEnabled(state.mode === 'humid');
    sortG.setEnabled(state.mode === 'sort');
    if (state.mode === 'touch') layoutTouchLayers();
    if (state.mode === 'humid') layoutHumid();
    if (state.mode === 'sort') layoutSort();
  }

  function animDots(key, dt) {
    const path = state.charging ? (key === 'aed' ? AED_CHG : FL_CHG)
      : state.flashT > 0 ? (key === 'aed' ? AED_DIS : FL_DIS) : null;
    const speed = state.charging ? 0.22 : 1.6;
    devDots[key].forEach((d) => {
      if (!path) { d.m.setEnabled(false); return; }
      d.m.setEnabled(true);
      d.u = (d.u + speed * dt) % 1;
      const [x, y, z] = path3Point(path, d.u);
      d.m.position.set(x, y, z);
    });
  }

  function tick(dt) {
    let dirty = false;
    if (state._handT > 0) {
      state._handT = Math.max(0, state._handT - dt);
      if (state._handT === 0) {
        if (touchG._finger) touchG._finger.setEnabled(false);
        if (touchG._eraser) touchG._eraser.setEnabled(false);
      }
      dirty = true;
    }
    if ((state.mode === 'aed' || state.mode === 'flash') && state.charging && state.gauge < 100) {
      state.gauge = Math.min(100, state.gauge + dt * (state.mode === 'aed' ? 33 : 50));
      if (state.gauge >= 100) state.charging = false;
      dirty = true;
    }
    if (state.mode === 'aed' || state.mode === 'flash') {
      animDots(state.mode, dt);
      if (state.charging || state.flashT > 0) dirty = true;
    }
    if (state.flashT > 0) {
      state.flashT = Math.max(0, state.flashT - dt);
      const k = state.flashT / 0.5;
      if (state.mode === 'aed') {
        // 패드 발광 + 심장에 전기 충격 + 모형이 들썩이는 모션
        aedPads.forEach((p) => {
          p.material.emissiveColor = new (B().Color3)(0.24 + k * 0.76, 0.55 + k * 0.45, 0.31 + k * 0.4);
        });
        const beat = Math.sin(k * Math.PI);
        aedHeart.material.emissiveColor = new (B().Color3)(0.63 + beat * 0.37, 0.19 + beat * 0.5, 0.16 + beat * 0.3);
        aedHeart.scaling.set(1 + beat * 0.35, 0.82 + beat * 0.3, 0.9 + beat * 0.3);
        aedDummyG.position.y = beat * 0.16;
        if (state.flashT <= 0.01) {
          aedDummyG.position.y = 0;
          aedHeart.scaling.set(1, 0.82, 0.9);
          aedHeart.material.emissiveColor = B().Color3.FromHexString('#a03028');
        }
      } else if (state.mode === 'flash') {
        // 방전관이 터지는 섬광 — 창이 번쩍이고 빛 원반이 퍼져 나간다
        flashWin.material.alpha = 0.35 + k * 0.65;
        flashWin.material.emissiveColor = new (B().Color3)(0.54 + k * 0.46, 0.55 + k * 0.45, 0.58 + k * 0.42);
        flashTube.material.emissiveColor = new (B().Color3)(0.35 + k * 0.65, 0.4 + k * 0.6, 0.47 + k * 0.53);
        const spread = 1 - k;
        flashBurst.material.alpha = k * 0.7;
        flashBurst.scaling.set(1 + spread * 1.8, 1 + spread * 1.8, 1);
        if (state.flashT <= 0.01) flashBurst.material.alpha = 0;
      }
      dirty = true;
    }
    // 터치스크린 — 방전 입자 + 빠져나간 전하 복원 + 리플 진행 + 감지 표시 소멸
    if (state.mode === 'touch') {
      let changed = false;
      if (touchSparks.length) {
        touchSparks = touchSparks.filter((p) => {
          p.t -= dt;
          if (p.t <= 0) { p.m.dispose(); return false; }
          p.m.position.z -= 3.2 * dt;               // 화면 밖(손가락 쪽)으로
          p.m.position.x += p.vx * dt;
          p.m.position.y += p.vy * dt;
          p.m.material.alpha = Math.min(1, p.t / 0.3);
          return true;
        });
        dirty = true;
      }
      Object.keys(state.removed).forEach((kcell) => {
        state.removed[kcell] -= dt;
        if (state.removed[kcell] <= 0) delete state.removed[kcell];
        changed = true;
      });
      if (state.ripples.length) {
        state.ripples = state.ripples.filter((rp) => (rp.t -= dt) > 0);
        changed = true;
      }
      if (state.touchedT > 0) {
        state.touchedT -= dt;
        if (state.touchedT <= 0) { state.touched = null; changed = true; }
      }
      if (changed) { drawTouchTex(); dirty = true; }
    }
    return dirty;
  }

  function discharge() {
    if (state.gauge < 100) { Lab.showHint('먼저 충전 게이지를 100%까지 채우세요.'); return; }
    state.gauge = 0;
    state.flashT = 0.5;
    state.shots += 1;
    if (state.mode === 'aed') state._usedAed = true;
    if (state.mode === 'flash') state._usedFlash = true;
  }

  function update() { layout(); }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = 1.02;
    camera.radius = state.mode === 'touch' || state.mode === 'sort' ? 14 : 12.5;
    camera.setTarget(new (B().Vector3)(0, 1.6, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '수리 의뢰 4건! 기기마다 고장 원인을 찾아 알맞은 부품으로 고친 뒤 작동을 확인하세요 — 마지막에 두 원리로 분류하면 인증서!';
  const prepGuide = '';

  function controlsHTML() {
    const modeBtns = LabUI.opts('점검할 기기', 'mode', [
      { v: 'aed', t: '심장 충격기' }, { v: 'flash', t: '카메라 플래시' },
      { v: 'touch', t: '터치스크린' }, { v: 'humid', t: '습도 센서' },
      { v: 'sort', t: '원리 분류 게임' },
    ], state.mode, 1);

    if (state.mode === 'aed' || state.mode === 'flash') {
      // 조작은 화면 속 기기의 3D 버튼으로 — 하단에는 안내만 남긴다
      return `
        ${modeBtns}
        <div class="control">
          <div class="clabel">조작 방법</div>
          <div class="cbody" style="display:flex;align-items:center;font-size:12.5px;color:#41566f;line-height:1.5">
            ${state.mode === 'aed'
              ? '① 부품 선반에서 알맞은 부품을 골라 수리 → ② 기기의 <b>&nbsp;⏻ 전원&nbsp;</b>(충전)과 <b>&nbsp;⚡ 심장 충격&nbsp;</b>(방전) 버튼을 직접 클릭'
              : '① 알맞은 용량의 축전기로 교체 → ② 플래시의 <b>&nbsp;초록 버튼&nbsp;</b>(충전)과 <b>&nbsp;빨강 셔터&nbsp;</b>(방전)를 직접 클릭'}
          </div>
        </div>`;
    }
    if (state.mode === 'touch') {
      return `
        ${modeBtns}
        ${LabUI.opts('접촉 도구', 'tool', [
          { v: 'finger', t: '손가락 (전도성)' }, { v: 'eraser', t: '지우개 (부도체)' },
        ], state.tool, 1)}
        ${LabUI.opts('층 보기', 'explode', [
          { v: 0, t: '모아 보기' }, { v: 1, t: '층 벌려 보기' },
        ], state.explode ? 1 : 0, 1)}`;
    }
    if (state.mode === 'humid') {
      return `
        ${modeBtns}
        ${LabUI.slider('humidCtl', '공기 중 습도',
          { min: 20, max: 90, step: 1, value: state.humid, fmt: (v) => `${v} %` })}`;
    }
    return `
      ${modeBtns}
      <div class="control">
        <div class="clabel">분류<br>방법</div>
        <div class="cbody" style="font-size:.86em;line-height:1.5">기기 미니어처를 <b>끌어서</b> 알맞은 선반 위에 올려놓으세요.
        다시 끌어 내리면 분류가 취소됩니다.</div>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="sortResetBtn">↻ 분류 다시 하기</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    LabUI.bindOpts(root, 'mode', state, 'mode', () => {
      resetCamera();
      state.charging = false; state.gauge = 0; state.flashT = 0;
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      layout();
      onChange();
    }, String);

    if (state.mode === 'aed' || state.mode === 'flash') {
      // 충전·방전은 화면 속 3D 버튼(bindPointer)이 담당한다
    } else if (state.mode === 'touch') {
      LabUI.bindOpts(root, 'tool', state, 'tool', onChange, String);
      LabUI.bindOpts(root, 'explode', state, 'explode', () => { layoutTouchLayers(); onChange(); },
        (v) => v === '1');
    } else if (state.mode === 'humid') {
      LabUI.bindSlider(root, 'humidCtl', state, 'humid', (v) => `${v} %`, () => {
        if (state.repaired.humid) state._humidMoved = true;
        else Lab.showHint('감지층이 비어 있어 값이 변하지 않아요 — 부품 선반에서 알맞은 판을 끼우세요.');
        layoutHumid(); onChange();
      });
    } else {
      const rb = root.querySelector('#sortResetBtn');
      if (rb) rb.addEventListener('click', () => {
        state.sorted = { aed: 0, flash: 0, touch: 0, humid: 0 };
        layoutSort();
        onChange();
      });
    }
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (state.mode === 'aed' || state.mode === 'flash') {
      const nm = DEV_NAME[state.mode];
      const chain = state.mode === 'aed'
        ? '배터리 → 고전압 변환 회로 → 축전기 → 방전 스위치 → 패드 → 심장'
        : '전지(AA×2) → 승압 회로 → 축전기 → 트리거 회로 → 크세논 방전관';
      return `
        <div class="row"><span>기기</span><b class="big">${nm}</b></div>
        <div class="row"><span>충전 게이지</span><b class="big">${state.gauge.toFixed(0)} %</b></div>
        <div class="row"><span>사용(방전) 횟수</span><b>${state.shots} 회</b></div>
        <div class="sec">에너지 흐름</div>
        <div class="row" style="font-size:.85em"><span>${chain}</span></div>
        <div class="formula">${state.gauge >= 100
          ? '<b style="color:#2f9e6b">충전 완료!</b> 방전 버튼을 누르면 저장된 전기 에너지가 한 번에 방출됩니다.'
          : state.charging
          ? '전원의 전하가 변환 회로를 거쳐 축전기에 모이는 중… 노란 전류 점의 경로를 보세요. ' + (state.mode === 'aed'
            ? 'AED 는 많은 에너지를 짧은 시간에 내보내야 해서 충전 용량이 큰 축전기를 씁니다 (84쪽).'
            : '전지 전압을 승압 회로가 높여 축전기에 저장합니다.')
          : '충전 시작을 눌러 축전기에 전기 에너지를 모아 보세요. 이 기기는 <b>충전·방전</b>을 이용합니다.'}</div>`;
    }
    if (state.mode === 'touch') {
      return `
        <div class="row"><span>기기</span><b class="big">터치스크린</b></div>
        <div class="row"><span>접촉 도구</span><b>${state.tool === 'finger' ? '손가락 (전도성)' : '지우개 (부도체)'}</b></div>
        <div class="row"><span>입력된 번호</span><b class="big">${state.dialed || '—'}</b></div>
        <div class="row"><span>감지 위치</span><b>${state.touched
          ? `(${state.touched[0] + 1}, ${state.touched[1] + 1})` : state.noSense ? '반응 없음' : '—'}</b></div>
        <div class="row"><span>비어 있는 자리</span><b>${Object.keys(state.removed).length} 곳 (복원 중)</b></div>
        <div class="formula">${state.noSense
          ? '부도체는 전하를 데려가지 못해 전하량이 변하지 않습니다 — 센서가 아무것도 감지하지 못하는 까닭 (생활 속 탐구, 85쪽).'
          : state.touched
          ? '접촉한 그 지점만 전자가 빠져나가고, 구동 회로가 곧바로 다시 채웁니다 — 그래서 연속으로 터치를 감지할 수 있습니다 (85쪽).'
          : '아래 구동 회로가 두 전극에 낮은 전압을 걸어 전하를 퍼뜨려 둡니다. 화면을 눌러 보세요 — 누른 자리에 리플이 번집니다.'}</div>`;
    }
    if (state.mode === 'humid') {
      return `
        <div class="row"><span>기기</span><b class="big">습도 센서</b></div>
        <div class="row"><span>공기 중 습도</span><b>${state.humid.toFixed(0)} %</b></div>
        <div class="row"><span>충전된 전하량 (상대값)</span><b class="big">${humidCharge()}</b></div>
        <div class="row"><span>표시 습도</span><b>${state.humid.toFixed(0)} %</b></div>
        <div class="formula">원리 3단계 — ① 공기 중 수증기와 흡습층의 수분이 <b>평형</b>을 이룬다(습도↑ → 흡수↑).
          ② 물 분자는 <b>극성 분자</b>라 전기장 속에서 정렬(<b>유전 분극</b>, 앞 단원 Ⅱ-1-02)되어 판의
          전하를 끌어 붙잡아 준다. ③ 그래서 같은 전압에서 <b>충전되는 전하의 양이 늘고</b>, 측정 회로가
          이 변화를 습도로 환산해 표시한다 (84쪽). 습도를 바꿔 전극의 전하가 느는 것을 보세요.</div>`;
    }
    const score = sortScore();
    const wrong = Object.keys(ANSWER).filter((k) => state.sorted[k] && state.sorted[k] !== ANSWER[k]);
    return `
      <div class="row"><span>분류한 기기</span><b>${Object.values(state.sorted).filter(Boolean).length} / 4</b></div>
      <div class="row"><span>맞은 개수</span><b class="big">${score} / 4</b></div>
      <div class="formula">${score === 4
        ? '<b style="color:#2f9e6b">완벽합니다! 정식 엔지니어 인증서 획득 🏅</b> — 축전기는 ① 저장한 에너지를 한 번에 쓰거나(충전·방전) ② 전하량의 변화를 감지하는(센서) 두 방식으로 활용됩니다 (84쪽).'
        : wrong.length
        ? `<b style="color:#d0453a">${wrong.map((k) => DEV_NAME[k]).join(', ')}</b> 의 자리를 다시 생각해 보세요 — 그 기기를 점검할 때 게이지가 찼다가 한 번에 비워졌는지, 아니면 환경에 따라 변했는지 떠올려 보세요.`
        : '점검했던 기기 미니어처를 <b>끌어서</b> 알맞은 선반에 올려놓으세요. 4개 모두 맞히면 인증서!'}</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '기기 속 축전기의 상태';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 42, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();

    if (state.mode === 'aed' || state.mode === 'flash') {
      ctx.fillStyle = '#2a3542';
      ctx.fillRect(padL + 20, padT + 14, gw - 60, 34);
      ctx.fillStyle = state.gauge >= 100 ? '#5af0a0' : '#f0a83a';
      ctx.fillRect(padL + 20, padT + 14, (gw - 60) * state.gauge / 100, 34);
      ctx.fillStyle = '#e8ecf4'; ctx.font = 'bold 13px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`충전 게이지 ${state.gauge.toFixed(0)} %`, padL + 20, padT + 56);
      ctx.fillText(`원리: 전원 → ${state.mode === 'aed' ? '고전압 변환' : '승압'} 회로 → 축전기 → 한 번에 방전`, padL + 20, padT + 80);
      ctx.fillText(`(지금까지 ${state.shots}회 사용)`, padL + 20, padT + 104);
      if (state.flashT > 0) {
        ctx.fillStyle = '#fff8d0';
        ctx.font = 'bold 22px "Noto Sans KR", sans-serif';
        ctx.fillText(state.mode === 'aed' ? '⚡ 심장 충격!' : '⚡ 번쩍!', padL + gw - 150, padT + 20);
      }
      return;
    }
    if (state.mode === 'touch') {
      const n = Object.keys(state.removed).length;
      ctx.fillStyle = '#e8ecf4'; ctx.font = 'bold 13px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`지금 비어 있는 자리 ${n}곳 — 구동 회로가 다시 채우는 중`, padL + 16, padT + 10);
      ctx.fillText('원리: 접촉 순간의 전하량 변화 감지', padL + 16, padT + 34);
      const cw = (gw - 40) / GRID_W, ch = (gh - 70) / GRID_H;
      for (let r = 0; r < GRID_H; r++) {
        for (let col = 0; col < GRID_W; col++) {
          ctx.fillStyle = state.removed[col + ',' + r] > 0 ? '#ffd84a' : '#23405c';
          ctx.fillRect(padL + 20 + col * cw, padT + 62 + r * ch, cw - 2, ch - 2);
        }
      }
      return;
    }
    if (state.mode === 'humid') {
      const xOf = (h) => padL + ((h - 20) / 70) * gw;
      const yOf = (q) => padT + gh - ((q - 40) / 120) * gh;
      ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xOf(20), yOf(60)); ctx.lineTo(xOf(90), yOf(140));
      ctx.stroke();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.arc(xOf(state.humid), yOf(humidCharge()), 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('습도 (%)', W2 - 4, padT + gh + 4);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#5ad0f0'; ctx.font = 'bold 10px sans-serif';
      ctx.fillText('습도 ↑ → 충전되는 전하량 ↑ (상대값)', padL + 6, padT + 2);
      return;
    }
    const score = sortScore();
    ctx.fillStyle = '#e8ecf4'; ctx.font = 'bold 15px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`분류 결과 : ${score} / 4 정답`, padL + 16, padT + 10);
    ['aed', 'flash', 'touch', 'humid'].forEach((k, i) => {
      const s = state.sorted[k];
      ctx.fillStyle = !s ? '#9fb0c2' : s === ANSWER[k] ? '#5af0a0' : '#f08a80';
      ctx.fillText(`${DEV_NAME[k]} — ${!s ? '미분류' : s === 'cd' ? '충전·방전' : '전하량 변화'}${s ? (s === ANSWER[k] ? ' ✓' : ' ✗') : ''}`,
        padL + 16, padT + 40 + i * 26);
    });
  }

  function graphFootHTML() {
    if (state.mode === 'aed' || state.mode === 'flash') {
      return '충전·방전 이용 — 전원의 에너지를 축전기에 모아 두었다가 필요한 순간 한 번에 방출한다';
    }
    if (state.mode === 'humid') {
      return '수분 평형 → 극성 물 분자의 정렬(유전 분극) → 판의 전하 증가 → 습도 환산';
    }
    if (state.mode === 'touch') {
      return '전하량 변화 이용 — 환경의 변화가 충전되는 전하의 양을 바꾸고, 회로가 이를 신호로 바꾼다';
    }
    return '두 원리를 구분했다면 84쪽 해 보기 표를 완성할 수 있습니다';
  }

  /* ══ 기록표 (84쪽 해 보기) ═══════════════════ */
  const recordColumns = ['기기', '관찰한 것', '이용하는 원리', '비고'];

  function recordRow() {
    if (state.mode === 'aed' || state.mode === 'flash') {
      return [[DEV_NAME[state.mode], `게이지 ${state.gauge.toFixed(0)}% · ${state.shots}회 방전`,
        '충전·방전', state.mode === 'aed' ? '배터리→변환 회로→축전기→패드→심장' : '전지→승압 회로→축전기→방전관']];
    }
    if (state.mode === 'touch') {
      return [['터치스크린', state.touched ? `(${state.touched[0] + 1}, ${state.touched[1] + 1}) 감지 후 복원` : '접촉 전',
        '전하량 변화', '접촉 순간만 변하고 곧 복원됨']];
    }
    if (state.mode === 'humid') {
      return [['습도 센서', `습도 ${state.humid.toFixed(0)}% → 전하량 ${humidCharge()}`,
        '전하량 변화', '공기·흡습층 수분이 평형']];
    }
    return [['분류 게임', `${sortScore()} / 4 정답`, '—', sortScore() === 4 ? '인증서 획득 🏅' : '진행 중']];
  }

  return {
    id: 'devices',
    title: '③ 네 대의 기기를 수리하라 — 생활 속 축전기',
    tabLabel: '③ 생활 속 축전기',
    noPrep: true,
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML, stepDone,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, humidCharge, sortScore, ANSWER,
    redrawTouch: () => drawTouchTex(),
    get scene() { return scene; },
  };
})();
