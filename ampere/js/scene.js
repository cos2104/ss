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
    on: true,
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
    buildCompasses();

    glow.addExcludedMesh(fieldPlane);
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
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 256, height: 256 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 256, 256);
      ctx.strokeStyle = '#5aa9ff'; ctx.lineWidth = 6;
      ctx.setLineDash([16, 12]);
      ctx.strokeRect(8, 8, 240, 240);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8fd0ff';
      ctx.font = 'bold 28px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 128, 128);
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

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '전류의 방향과 세기를 바꾸며 나침반 바늘이 어떻게 도는지, 도선에서 멀어지면 어떻게 되는지 관찰하세요.';
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

  return {
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
