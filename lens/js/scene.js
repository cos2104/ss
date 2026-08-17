/**
 * 볼록 렌즈에 의한 실상을 관찰하여 상의 위치와 초점 거리 찾기
 * 비상교육 고등 물리학 III-1-02 (교과서 130~135쪽), 핵심 탐구 131쪽
 *
 * 광학대 위에 LED등 · 렌즈 · 스크린을 놓고, 스크린을 끌어 상이 가장 선명해지는
 * 자리를 직접 찾는 것이 핵심 활동이다 (교과서의 a → b 측정).
 * 오목 렌즈로 바꾸면 실상이 생기지 않는 것도 확인할 수 있다.
 */
const LensScene = (() => {
  const B = () => BABYLON;

  const U = 0.14;           // 1 cm = 0.14 scene unit
  const BENCH_L = 130;      // 광학대 길이 (cm) — 교과서 표의 a = 60 cm 까지 들어가도록
  const X_LENS = 0;         // 렌즈는 원점에 고정
  const BENCH_Y = 0;
  const AXIS_Y = 2.6;       // 광축 높이
  const TIP_K = 0.235;      // 물체 화살표 끝의 높이 = objH × TIP_K (scene unit)

  let scene, camera;
  let bench, led, lens, screen, screenTex, marks;
  let rays = null, imageArrow = null, objArrow = null;
  let placed = {};

  const state = {
    type: 'convex',    // convex | concave
    f: 15,             // 초점 거리 (cm)
    a: 40,             // 물체(LED) ~ 렌즈 거리 (cm)
    b: 24,             // 렌즈 ~ 스크린 거리 (cm)  ← 사용자가 맞춰야 하는 값
    objH: 6,           // 물체 크기 (cm)
    showRays: true,
  };

  const tools = [
    { id: 'bench', label: '광학대 · 자', icon: 'bench' },
    { id: 'led', label: 'LED등', icon: 'led' },
    { id: 'lens', label: '볼록 렌즈', icon: 'lensConvex' },
    { id: 'screen', label: '스크린', icon: 'screenBoard' },
  ];

  const slots = {
    bench: { x: 0, r: 60, name: '광학대' },
    led: { x: -40, r: 22, name: 'LED등' },
    lens: { x: 0, r: 14, name: '렌즈' },
    screen: { x: 24, r: 30, name: '스크린' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /**
   * 렌즈 공식 1/a + 1/b = 1/f
   * @returns {{bIdeal:number, m:number, real:boolean, infinite:boolean}}
   *   bIdeal 이 (+) 면 렌즈 뒤쪽에 실상, (−) 면 물체 쪽에 허상
   */
  function image() {
    const f = state.type === 'convex' ? state.f : -state.f;
    const a = state.a;
    const denom = a - f;
    if (state.type === 'convex' && Math.abs(denom) < 0.4) {
      return { bIdeal: Infinity, m: Infinity, real: false, infinite: true };
    }
    const bIdeal = (f * a) / denom;
    return { bIdeal, m: -bIdeal / a, real: bIdeal > 0, infinite: false };
  }

  /** 스크린이 상 위치에서 얼마나 벗어났는지 → 선명도 0~1 */
  function sharpness() {
    const { bIdeal, real, infinite } = image();
    if (infinite || !real) return 0;
    const err = Math.abs(state.b - bIdeal);
    return Math.max(0, 1 - err / 5);     // 5 cm 벗어나면 완전히 흐려진다
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#141a24ff');

    camera = new (B().ArcRotateCamera)(
      'camLens', -Math.PI / 2 - 0.42, 1.16, 23, new (B().Vector3)(0, 2.4, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 9;
    camera.upperRadiusLimit = 42;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hl', new (B().Vector3)(0.1, 1, -0.35), scene);
    hemi.intensity = 0.72;
    hemi.groundColor = new (B().Color3)(0.2, 0.23, 0.28);

    const dir = new (B().DirectionalLight)('dl', new (B().Vector3)(-0.4, -1, 0.5), scene);
    dir.position = new (B().Vector3)(6, 14, -8);
    dir.intensity = 0.42;

    const glow = new (B().GlowLayer)('glowL', scene);
    glow.intensity = 0.6;

    buildBench();
    buildLed();
    buildLens();
    buildScreen();
    buildFocusMarks();
    buildPlaceholders();

    glow.addExcludedMesh(screen);
    // 상시 바닥 — 도구를 놓기 전에도 기본 배경이 보인다
    const __base = B().MeshBuilder.CreateGround('leBase', { width: 28, height: 12 }, scene);
    __base.position.y = -0.5;
    const __bm = new (B().StandardMaterial)('leBaseM', scene);
    __bm.diffuseColor = B().Color3.FromHexString('#1c2230');
    __bm.specularColor = new (B().Color3)(0.03, 0.03, 0.05);
    __base.material = __bm;

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/lens.jpg', { x: -9, y: 0, z: 4.5, ry: 0.3 });

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

  /** 광학대 (자가 새겨진 레일) */
  function buildBench() {
    bench = new (B().TransformNode)('benchGroup', scene);

    const bar = B().MeshBuilder.CreateBox('bench', { width: BENCH_L * U, height: 0.5, depth: 2.0 }, scene);
    bar.position.set(0, BENCH_Y + 0.25, 0);
    bar.material = mat('benchMat', '#4a5462', '#98a4b4', 64);
    bar.parent = bench;

    const ruler = B().MeshBuilder.CreateGround('lensRuler', { width: BENCH_L * U, height: 1.0 }, scene);
    ruler.position.set(0, BENCH_Y + 0.51, 0.5);
    const tex = new (B().DynamicTexture)('lensRulerTex', { width: 1650, height: 90 }, scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = '#e9eef5';
    ctx.fillRect(0, 0, 1650, 90);
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 2;
    for (let cm = 0; cm <= BENCH_L; cm++) {
      const x = 10 + (cm / BENCH_L) * 1630;
      const big = cm % 10 === 0, mid = cm % 5 === 0;
      ctx.beginPath(); ctx.moveTo(x, 90); ctx.lineTo(x, big ? 44 : mid ? 62 : 74); ctx.stroke();
    }
    ctx.fillStyle = '#2f3947';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let cm = 0; cm <= BENCH_L; cm += 10) {
      ctx.fillText(String(cm - BENCH_L / 2), 10 + (cm / BENCH_L) * 1630, 6);
    }
    tex.update();
    const rm = new (B().StandardMaterial)('lensRulerMat', scene);
    rm.diffuseTexture = tex;
    rm.specularColor = new (B().Color3)(0, 0, 0);
    ruler.material = rm;
    ruler.parent = bench;
  }

  function mount(name, x, parentNode) {
    const g = new (B().TransformNode)(name, scene);
    const post = B().MeshBuilder.CreateBox(name + 'P', { width: 0.34, height: AXIS_Y - 0.5, depth: 0.34 }, scene);
    post.position.set(0, BENCH_Y + 0.5 + (AXIS_Y - 0.5) / 2, 0);
    post.material = mat(name + 'PM', '#8e9bad', '#dfe6ee', 64);
    post.parent = g;
    const base = B().MeshBuilder.CreateBox(name + 'B', { width: 1.1, height: 0.28, depth: 1.6 }, scene);
    base.position.set(0, BENCH_Y + 0.64, 0);
    base.material = mat(name + 'BM', '#2b323c');
    base.parent = g;
    g.position.x = x * U;
    if (parentNode) g.parent = parentNode;
    return g;
  }

  /** LED등 — 화살표 모양 물체 (상의 방향을 알 수 있도록) */
  function buildLed() {
    led = mount('ledMount', -state.a);

    const box = B().MeshBuilder.CreateBox('ledBox', { width: 1.1, height: 1.3, depth: 1.3 }, scene);
    box.position.set(0, AXIS_Y, 0);
    box.material = mat('ledBoxMat', '#39424f');
    box.parent = led;

    // 물체 화살표 (위쪽을 향함)
    objArrow = new (B().TransformNode)('objArrow', scene);
    const shaft = B().MeshBuilder.CreateCylinder('objShaft', { height: 1, diameter: 0.2 }, scene);
    shaft.position.y = 0.5;
    const am = new (B().StandardMaterial)('objArrowMat', scene);
    am.emissiveColor = B().Color3.FromHexString('#ffd84a');
    am.disableLighting = true;
    shaft.material = am;
    shaft.parent = objArrow;

    const head = B().MeshBuilder.CreateCylinder('objHead',
      { height: 0.42, diameterTop: 0, diameterBottom: 0.46 }, scene);
    head.position.y = 1.2;
    head.material = am;
    head.parent = objArrow;

    objArrow.position.set(0, AXIS_Y, 0);
    objArrow.parent = led;
  }

  function buildLens() {
    lens = mount('lensMount', X_LENS);

    // 어두운 배경에서도 유리로 보이도록 살짝 스스로 빛나게 한다
    const glass = new (B().StandardMaterial)('lensGlass', scene);
    glass.diffuseColor = B().Color3.FromHexString('#9fd6ee');
    glass.emissiveColor = B().Color3.FromHexString('#2b5a72');
    glass.specularColor = B().Color3.FromHexString('#ffffff');
    glass.specularPower = 96;
    glass.alpha = 0.5;
    glass.backFaceCulling = false;

    // 볼록 : 구를 눌러 만든 렌즈 / 오목 : 가운데가 얇은 형태
    const body = B().MeshBuilder.CreateSphere('lensBody', { diameter: 3.4, segments: 26 }, scene);
    body.position.set(0, AXIS_Y, 0);
    body.material = glass;
    body.parent = lens;

    const ring = B().MeshBuilder.CreateTorus('lensRing', { diameter: 3.5, thickness: 0.22, tessellation: 32 }, scene);
    ring.rotation.z = Math.PI / 2;
    ring.position.set(0, AXIS_Y, 0);
    ring.material = mat('lensRingMat', '#7c8794', '#dfe6ee', 64);
    ring.parent = lens;

    lens._body = body;
  }

  function buildScreen() {
    const g = mount('screenMount', state.b);
    screen = B().MeshBuilder.CreatePlane('lensScreen', { width: 5.0, height: 4.2 }, scene);
    screen.rotation.y = Math.PI / 2;
    screen.position.set(0, AXIS_Y + 0.3, 0);
    screenTex = new (B().DynamicTexture)('lensScreenTex', { width: 320, height: 270 }, scene, false);
    const m = new (B().StandardMaterial)('lensScreenMat', scene);
    m.diffuseTexture = screenTex;
    m.emissiveTexture = screenTex;
    m.emissiveColor = new (B().Color3)(0.85, 0.85, 0.85);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    screen.material = m;
    screen.parent = g;
    screen._mount = g;
  }

  /** 초점 위치 표시 (양쪽 F) */
  function buildFocusMarks() {
    marks = [];
    [-1, 1].forEach((s, i) => {
      const m = B().MeshBuilder.CreateSphere('fMark' + i, { diameter: 0.34 }, scene);
      const mm = new (B().StandardMaterial)('fMarkMat' + i, scene);
      mm.emissiveColor = B().Color3.FromHexString('#ffe066');
      mm.disableLighting = true;
      m.material = mm;
      m.isPickable = false;
      m._side = s;
      marks.push(m);
    });
  }

  /** 스크린에 맺힌 상 — 선명도에 따라 흐려진다 */
  function drawScreen() {
    const ctx = screenTex.getContext();
    ctx.fillStyle = '#f4f2ea';
    ctx.fillRect(0, 0, 320, 270);

    // 스크린 눈금
    ctx.strokeStyle = '#c9c6ba';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const x = (i / 8) * 320;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 270); ctx.stroke();
    }
    for (let i = 1; i < 7; i++) {
      const y = (i / 7) * 270;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(320, y); ctx.stroke();
    }

    const s = sharpness();
    const info = image();
    if (!placed.led || !placed.lens || !info.real || info.infinite) {
      screenTex.update();
      return;
    }

    // 스크린 실제 크기 : 세로 4.2 unit = 30 cm = 270 px → 1 cm = 9 px
    const PX_PER_CM = 270 / (4.2 / U);
    // 광축의 스크린 위 위치 : 스크린 중심이 광축보다 0.3 unit 위에 있다
    const CY = 135 + (0.3 / 4.2) * 270;

    const hImg = Math.abs(info.m) * state.objH;      // 상의 크기 (cm) = |m| × 물체 크기
    const hPx = hImg * PX_PER_CM;
    const err = Math.abs(state.b - info.bIdeal);      // 초점에서 벗어난 거리 (cm)
    const blur = Math.min(34, err * 3.0);

    ctx.save();
    ctx.translate(160, CY);
    if (info.m < 0) ctx.scale(1, -1);                 // 도립상은 아래로
    if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
    ctx.globalAlpha = 0.22 + 0.78 * s;
    ctx.fillStyle = '#e8b400';
    // 화살표 — 광축(0)에서 위로 hPx 만큼. 캔버스는 위가 −y
    const headH = hPx * 0.3;
    const w = Math.max(3, hPx * 0.1);
    ctx.fillRect(-w / 2, -(hPx - headH), w, hPx - headH);
    ctx.beginPath();
    ctx.moveTo(0, -hPx);
    ctx.lineTo(-w * 2.2, -(hPx - headH));
    ctx.lineTo(w * 2.2, -(hPx - headH));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    screenTex.update();
  }

  /** 교과서 그림처럼 세 광선을 그린다 */
  function drawRays() {
    if (rays) { rays.dispose(); rays = null; }
    if (imageArrow) { imageArrow.dispose(); imageArrow = null; }
    if (!state.showRays || !placed.led || !placed.lens) return;

    const info = image();
    const f = state.type === 'convex' ? state.f : -state.f;
    const tipY = AXIS_Y + state.objH * TIP_K;         // 물체 화살표 끝 높이 (scene)
    const objX = -state.a * U;
    const lensY = tipY;

    const V = (x, y) => new (B().Vector3)(x, y, 0);
    const lines = [];

    // 광축
    lines.push([V(-BENCH_L / 2 * U, AXIS_Y), V(BENCH_L / 2 * U, AXIS_Y)]);
    // ① 광축에 나란히 온 빛 → 렌즈에서 꺾여 초점으로
    lines.push([V(objX, tipY), V(0, lensY)]);
    // ② 렌즈 중심을 지나는 빛 (그대로 직진)
    lines.push([V(objX, tipY), V(BENCH_L / 2 * U, AXIS_Y - (tipY - AXIS_Y) * (BENCH_L / 2 / state.a))]);

    if (!info.infinite) {
      const imgX = info.bIdeal * U;
      const imgTipY = AXIS_Y + (tipY - AXIS_Y) * info.m;
      if (info.real) {
        // 실상 : 굴절 후 실제로 모인다. 상을 지나 같은 기울기로 계속 나아간다
        lines.push([V(0, lensY), V(imgX, imgTipY)]);
        const endX = BENCH_L / 2 * U;
        const slope = (imgTipY - lensY) / imgX;       // 굴절광의 기울기
        lines.push([V(imgX, imgTipY), V(endX, imgTipY + slope * (endX - imgX))]);
      } else {
        // 허상 : 나가는 빛의 연장선이 물체 쪽에서 만난다
        const dir = new (B().Vector3)(1, (lensY - imgTipY) / (0 - imgX), 0).normalize();
        lines.push([V(0, lensY), V(BENCH_L / 2 * U, lensY + dir.y / dir.x * (BENCH_L / 2 * U))]);
        lines.push([V(imgX, imgTipY), V(0, lensY)]);
      }
      // 상 화살표
      imageArrow = B().MeshBuilder.CreateLineSystem('imgArrow', {
        lines: [[V(imgX, AXIS_Y), V(imgX, imgTipY)]],
      }, scene);
      imageArrow.color = B().Color3.FromHexString(info.real ? '#4ad8a0' : '#e88a4a');
      imageArrow.isPickable = false;
    }

    rays = B().MeshBuilder.CreateLineSystem('lensRays', { lines }, scene);
    rays.color = B().Color3.FromHexString('#ffb03a');
    rays.alpha = 0.85;
    rays.isPickable = false;
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      bench: { x: 0, y: 0.3, w: BENCH_L * U, h: 1.6, label: '광학대' },
      led: { x: -40, y: AXIS_Y, w: 3.0, h: 3.0, label: 'LED등' },
      lens: { x: 0, y: AXIS_Y, w: 3.0, h: 3.4, label: '렌즈' },
      screen: { x: 24, y: AXIS_Y, w: 4.2, h: 3.6, label: '스크린' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreatePlane('ph_' + id, { width: c.w, height: c.h }, scene);
      p.rotation.y = Math.PI / 2;
      p.position.set(c.x * U, c.y, 0);
      if (id === 'bench') { p.rotation.set(Math.PI / 2, 0, 0); p.position.y = 0.06; }
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 256, height: 200 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 256, 200);
      ctx.strokeStyle = '#5aa9ff'; ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(8, 8, 240, 184);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8fd0ff';
      ctx.font = 'bold 30px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 128, 100);
      tex.hasAlpha = true; tex.update();
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
    bench.setEnabled(!!placed.bench);
    led.setEnabled(!!placed.led);
    lens.setEnabled(!!placed.lens);
    screen._mount.setEnabled(!!placed.screen);
    marks.forEach((m) => m.setEnabled(!!placed.lens && state.showRays));
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const s = slots[id];
    return Math.abs(point.x / U - s.x) <= s.r ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;

    led.position.x = -state.a * U;
    screen._mount.position.x = state.b * U;
    if (holders.led) holders.led.position.x = -state.a * U;
    if (holders.screen) holders.screen.position.x = state.b * U;

    // 물체 크기
    const sc = state.objH / 6;
    objArrow.scaling.set(1, sc, 1);

    // 렌즈 모양 : 볼록은 가운데가 두껍고, 오목은 얇다
    const thick = state.type === 'convex' ? Math.max(0.16, 8 / state.f) : 0.1;
    lens._body.scaling.set(thick / 1.7, 1, 1);
    lens._body.material.diffuseColor =
      B().Color3.FromHexString(state.type === 'convex' ? '#bfe4f5' : '#c9d8e8');

    // 초점 표시
    marks.forEach((m) => {
      m.position.set(m._side * state.f * U, AXIS_Y, 0);
      m.setEnabled(!!placed.lens && state.showRays);
    });

    drawRays();
    drawScreen();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 - 0.42;
    camera.beta = 1.16;
    camera.radius = 23;
    camera.setTarget(new (B().Vector3)(0, 2.4, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '스크린을 움직여 상이 <b>가장 선명해지는 자리</b>를 찾고, 그때의 거리 <i>b</i> 를 기록해 보세요.';
  const prepGuide = '점선으로 표시된 자리에 광학대·LED등·렌즈·스크린을 순서대로 끌어다 놓으세요.';

  function controlsHTML() {
    return `
      ${LabUI.opts('렌즈 종류', 'type', [
        { v: 'convex', t: '볼록 렌즈' },
        { v: 'concave', t: '오목 렌즈' },
      ], state.type, 1)}
      ${LabUI.slider('f', '초점 거리<br><i>f</i>',
        { min: 8, max: 30, step: 0.5, value: state.f, fmt: (v) => `${v.toFixed(1)} cm` })}
      ${LabUI.slider('a', '물체 위치<br><i>a</i>',
        { min: 10, max: 60, step: 1, value: state.a, fmt: (v) => `${v} cm` })}
      ${LabUI.slider('b', '스크린 위치<br><i>b</i>',
        { min: 5, max: 60, step: 0.5, value: state.b, fmt: (v) => `${v.toFixed(1)} cm` })}
      ${LabUI.slider('objH', '물체 크기',
        { min: 2, max: 10, step: 0.5, value: state.objH, fmt: (v) => `${v.toFixed(1)} cm` })}
      <div class="control">
        <div class="clabel">광선</div>
        <div class="cbody"><div class="opt-grid one-row">
          <button class="opt${state.showRays ? ' on' : ''}" id="rayBtn">광선 보기</button>
          <button class="opt" id="focusBtn">자동 초점</button>
        </div></div>
      </div>`;
  }

  function bindControls(root, onChange) {
    LabUI.bindOpts(root, 'type', state, 'type', onChange, String);
    LabUI.bindSlider(root, 'f', state, 'f', (v) => `${v.toFixed(1)} cm`, onChange);
    LabUI.bindSlider(root, 'a', state, 'a', (v) => `${v} cm`, onChange);
    const setB = LabUI.bindSlider(root, 'b', state, 'b', (v) => `${v.toFixed(1)} cm`, onChange);
    LabUI.bindSlider(root, 'objH', state, 'objH', (v) => `${v.toFixed(1)} cm`, onChange);

    const ray = root.querySelector('#rayBtn');
    ray.addEventListener('click', () => {
      state.showRays = !state.showRays;
      ray.classList.toggle('on', state.showRays);
      onChange();
    });

    // 스스로 맞춰 본 뒤 정답을 확인하는 용도
    root.querySelector('#focusBtn').addEventListener('click', () => {
      const info = image();
      if (!info.real || info.infinite) {
        Lab.showHint('실상이 생기지 않아 스크린에 맺을 수 없습니다.');
        return;
      }
      if (info.bIdeal > 60) {
        Lab.showHint('상이 60 cm 밖에 맺힙니다. 물체를 렌즈에서 더 멀리 놓아 보세요.');
        return;
      }
      setB(Math.round(Math.min(60, Math.max(5, info.bIdeal)) * 2) / 2);
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const info = image();
    const s = sharpness();
    const f = state.type === 'convex' ? state.f : -state.f;

    let status, tag;
    if (info.infinite) { status = '상이 생기지 않음 (물체가 초점에 있음)'; tag = 'mid'; }
    else if (!info.real) { status = '허상 — 스크린에 맺히지 않음'; tag = 'des'; }
    else if (s > 0.9) { status = '실상 — 선명함!'; tag = 'ok'; }
    else { status = '실상 — 초점이 맞지 않음'; tag = 'mid'; }

    return `
      <div class="row"><span>렌즈</span>
        <b>${state.type === 'convex' ? '볼록' : '오목'} (<i>f</i> = ${f.toFixed(1)} cm)</b></div>
      <div class="row"><span>물체 거리 <i>a</i></span><b>${state.a} cm</b></div>
      <div class="row"><span>스크린 거리 <i>b</i></span><b>${state.b.toFixed(1)} cm</b></div>

      <div class="sec">상</div>
      <div class="row"><span>상태</span><span class="tag ${tag}">${info.real ? '실상' : '허상'}</span></div>
      ${info.infinite ? '' : `
      <div class="row"><span>상의 위치</span>
        <b class="big">${info.real ? info.bIdeal.toFixed(1) : `${Math.abs(info.bIdeal).toFixed(1)} (앞쪽)`} cm</b></div>
      <div class="row"><span>배율 <i>m</i></span><b>${Math.abs(info.m).toFixed(2)} 배</b></div>
      <div class="row"><span>상의 방향</span><b>${info.m < 0 ? '거꾸로 (도립)' : '바로 (정립)'}</b></div>
      <div class="row"><span>상의 크기</span>
        <b>${(Math.abs(info.m) * state.objH).toFixed(1)} cm</b></div>`}
      <div class="row"><span>선명도</span><b>${(s * 100).toFixed(0)} %</b></div>
      <div class="formula">1/<i>a</i> + 1/<i>b</i> = 1/<i>f</i> &nbsp;·&nbsp;
        <i>m</i> = −<i>b</i>/<i>a</i></div>
      <div class="formula" style="color:#62718a">${status}</div>`;
  }

  /* ══ 그래프 — a 에 따른 b 곡선 ══════════════ */
  const graphTitle = '물체 위치 a 에 따른 상의 위치 b';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const padL = 34, padR = 12, padT = 14, padB = 24;
    const gw = W - padL - padR, gh = H - padT - padB;
    const A_MAX = 60, B_MAX = 60;
    const xOf = (a) => padL + (a / A_MAX) * gw;
    const yOf = (b) => padT + gh - (b / B_MAX) * gh;

    // 격자
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 1;
    for (let a = 10; a <= A_MAX; a += 10) {
      ctx.beginPath(); ctx.moveTo(xOf(a), padT); ctx.lineTo(xOf(a), padT + gh); ctx.stroke();
    }
    for (let b = 10; b <= B_MAX; b += 10) {
      ctx.beginPath(); ctx.moveTo(padL, yOf(b)); ctx.lineTo(padL + gw, yOf(b)); ctx.stroke();
    }

    const f = state.type === 'convex' ? state.f : -state.f;

    // b(a) 곡선
    ctx.strokeStyle = '#5ad0f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let a = 1; a <= A_MAX; a += 0.5) {
      const b = (f * a) / (a - f);
      if (!isFinite(b) || b < 0 || b > B_MAX) { started = false; continue; }
      const x = xOf(a), y = yOf(b);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 초점 거리 표시선 (a = f 에서 상이 무한대)
    if (state.type === 'convex') {
      ctx.strokeStyle = 'rgba(255,216,74,.55)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(xOf(state.f), padT); ctx.lineTo(xOf(state.f), padT + gh); ctx.stroke();
      // b = 2f 에서 a = 2f (같은 크기의 상)
      ctx.beginPath(); ctx.moveTo(xOf(2 * state.f), padT); ctx.lineTo(xOf(2 * state.f), padT + gh); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd84a';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('a=f', xOf(state.f), padT + 1);
      ctx.fillText('a=2f', xOf(2 * state.f), padT + 1);
    }

    // 현재 지점
    const info = image();
    if (info.real && !info.infinite && info.bIdeal <= B_MAX) {
      ctx.fillStyle = '#5ad0f0';
      ctx.beginPath(); ctx.arc(xOf(state.a), yOf(info.bIdeal), 4, 0, 7); ctx.fill();
    }
    // 사용자가 놓은 스크린 위치
    ctx.fillStyle = sharpness() > 0.9 ? '#4ad8a0' : '#e8663f';
    ctx.beginPath(); ctx.arc(xOf(state.a), yOf(state.b), 4.5, 0, 7); ctx.fill();

    // 축
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let a = 0; a <= A_MAX; a += 20) ctx.fillText(String(a), xOf(a), padT + gh + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let b = 20; b <= B_MAX; b += 20) ctx.fillText(String(b), padL - 4, yOf(b));
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('a (cm)', W - 4, padT + gh + 4);
  }

  function graphFootHTML() {
    const info = image();
    if (info.infinite) return '물체가 초점에 있어 굴절광이 나란히 나가 상이 생기지 않습니다.';
    if (!info.real) return `허상이라 스크린에 맺히지 않습니다 ·
      배율 <b>${Math.abs(info.m).toFixed(2)}배</b> 정립 허상 (돋보기로 보는 상)`;
    const s = sharpness();
    return s > 0.9
      ? `<b style="color:#2f9e6b">초점이 맞았습니다!</b> <i>b</i> = ${info.bIdeal.toFixed(1)} cm`
      : `상은 <b>${info.bIdeal.toFixed(1)} cm</b> 에 맺힙니다 · 스크린을
         ${state.b < info.bIdeal ? '뒤로' : '앞으로'} 옮겨 보세요`;
  }

  /* ══ 기록표 (교과서 131쪽 표) ═══════════════ */
  const recordColumns = [
    '렌즈', '초점 거리 <i>f</i> (cm)', '물체 위치 <i>a</i> (cm)',
    '상의 위치 <i>b</i> (cm)', '배율', '상의 종류',
  ];

  function recordRow() {
    const info = image();
    if (info.infinite) return null;
    return [
      state.type === 'convex' ? '볼록' : '오목',
      state.f.toFixed(1), String(state.a),
      info.real ? info.bIdeal.toFixed(1) : `−${Math.abs(info.bIdeal).toFixed(1)}`,
      Math.abs(info.m).toFixed(2),
      `${info.real ? '실상' : '허상'} · ${info.m < 0 ? '도립' : '정립'}`,
    ];
  }

  return {
    id: 'lens',
    title: '볼록 렌즈에 의한 실상 관찰하기',
    guide, prepGuide, tools,
    create, update, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, image, sharpness,
    get scene() { return scene; },
  };
})();
