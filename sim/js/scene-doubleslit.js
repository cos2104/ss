/**
 * 실험 2 — 이중 슬릿에 의한 빛의 간섭 관찰하기
 * 교과서 126쪽 핵심 탐구 / 127쪽 그림 III-3·III-4·III-5
 *   레이저 → 단일 슬릿 → 이중 슬릿 → 스크린
 *
 * 장면 좌표: +x 가 빛의 진행 방향, 무늬는 z 방향으로 퍼진다. 1 m = 5 unit
 */
const DoubleSlitScene = (() => {
  const B = () => BABYLON;

  const M_TO_UNIT = 5;
  const X_LASER = -10;
  const X_SLIT1 = -5.2;
  const X_SLIT2 = -3.0;
  const TABLE_TOP = -1.1;
  const BEAM_Y = 0.4;

  const HALF_SPAN = 30;   // 스크린에 표시할 범위 : 중심에서 ±30 mm
  const SCREEN_W = 5.4;
  const SCREEN_H = 2.9;
  const TEX_W = 1400, TEX_H = 460, BAND_H = 330;

  let scene, camera;
  let screen, screenStand, screenTex, rulerMesh, rulerTex;
  let beamCore, beamFan1, beamMat, rays, laserGroup;
  let lastDist = null;
  let placed = {};

  const slitPlates = {};

  const state = {
    lambda: 650, slitGap: 0.20, screenDist: 1.0, slitWidth: 0.06,
    envelope: true, power: true,
  };

  const tools = [
    { id: 'laser', label: '레이저 광원', icon: 'laser' },
    { id: 'slit1', label: '단일 슬릿', icon: 'slit1' },
    { id: 'slit2', label: '이중 슬릿', icon: 'slit2' },
    { id: 'screen', label: '스크린 · 줄자', icon: 'screen' },
  ];

  const slots = {
    laser: { x: X_LASER, r: 3.2, name: '레이저' },
    slit1: { x: X_SLIT1, r: 1.6, name: '단일 슬릿' },
    slit2: { x: X_SLIT2, r: 1.6, name: '이중 슬릿' },
    screen: { x: null, r: 3.2, name: '스크린' },   // x 는 스크린 거리에 따라 달라진다
  };

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#0d1520ff');

    camera = new (B().ArcRotateCamera)(
      'camDouble', -Math.PI / 2 - 0.62, 1.05, 13, new (B().Vector3)(-3.5, 0.25, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 34;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hd', new (B().Vector3)(0.2, 1, -0.3), scene);
    hemi.intensity = 0.72;
    hemi.groundColor = new (B().Color3)(0.16, 0.2, 0.26);

    const dir = new (B().DirectionalLight)('dd', new (B().Vector3)(-0.4, -1, 0.55), scene);
    dir.position = new (B().Vector3)(6, 12, -8);
    dir.intensity = 0.5;

    const glow = new (B().GlowLayer)('glowD', scene);
    glow.intensity = 0.55;

    buildTable();
    buildLaser();
    buildSlitPlate('slit1', X_SLIT1, 1);
    buildSlitPlate('slit2', X_SLIT2, 2);
    buildBeams();
    buildScreen();
    buildRuler();
    buildPlaceholders();

    glow.addExcludedMesh(rulerMesh);
    glow.addExcludedMesh(screen);

    resetTools();
    return scene;
  }

  function buildTable() {
    const top = B().MeshBuilder.CreateBox('dTable', { width: 36, height: 0.5, depth: 9.5 }, scene);
    top.position.set(-1, -1.35, 0);
    const m = new (B().StandardMaterial)('dTableMat', scene);
    m.diffuseColor = B().Color3.FromHexString('#1d242e');
    m.specularColor = B().Color3.FromHexString('#2d3846');
    m.specularPower = 64;
    top.material = m;
  }

  function buildLaser() {
    laserGroup = new (B().TransformNode)('laserGroup', scene);
    const bm = new (B().StandardMaterial)('laserMat', scene);
    bm.diffuseColor = B().Color3.FromHexString('#1b1f26');
    bm.specularColor = B().Color3.FromHexString('#6e7887');
    bm.specularPower = 64;

    const body = B().MeshBuilder.CreateBox('laserBody', { width: 2.4, height: 1.1, depth: 1.5 }, scene);
    body.position.set(X_LASER - 0.7, BEAM_Y, 0);
    body.material = bm;
    body.parent = laserGroup;

    const standH = (BEAM_Y - 0.55) - TABLE_TOP;
    const stand = B().MeshBuilder.CreateBox('laserStand', { width: 1.4, height: standH, depth: 1.1 }, scene);
    stand.position.set(X_LASER - 0.7, TABLE_TOP + standH / 2, 0);
    stand.material = bm;
    stand.parent = laserGroup;

    const nose = B().MeshBuilder.CreateCylinder('laserNose', { height: 0.8, diameter: 0.42 }, scene);
    nose.rotation.z = Math.PI / 2;
    nose.position.set(X_LASER + 0.9, BEAM_Y, 0);
    const nm = new (B().StandardMaterial)('noseMat', scene);
    nm.diffuseColor = B().Color3.FromHexString('#3a4450');
    nose.material = nm;
    nose.parent = laserGroup;
  }

  function buildSlitPlate(name, x, slitCount) {
    const group = new (B().TransformNode)(name + 'Group', scene);
    const m = new (B().StandardMaterial)(name + 'Mat', scene);
    m.diffuseColor = B().Color3.FromHexString('#11151b');
    m.specularColor = B().Color3.FromHexString('#39424f');

    const plateH = (BEAM_Y - TABLE_TOP) * 2;
    const plate = B().MeshBuilder.CreateBox(name, { width: 0.16, height: plateH, depth: 4.2 }, scene);
    plate.position.set(x, BEAM_Y, 0);
    plate.material = m;
    plate.parent = group;

    // 실제 슬릿 폭(0.1 mm 이하)은 눈에 보이지 않으므로 과장해서 표현한다
    const holes = [];
    for (let i = 0; i < slitCount; i++) {
      const h = B().MeshBuilder.CreateBox(name + 'Hole' + i, { width: 0.22, height: 0.9, depth: 0.1 }, scene);
      h.position.set(x, BEAM_Y, 0);
      const hm = new (B().StandardMaterial)(name + 'HoleMat' + i, scene);
      hm.emissiveColor = new (B().Color3)(1, 1, 1);
      hm.disableLighting = true;
      h.material = hm;
      h.parent = group;
      holes.push(h);
    }
    slitPlates[name] = { group, holes };
  }

  function buildBeams() {
    beamMat = new (B().StandardMaterial)('beamMat', scene);
    beamMat.emissiveColor = new (B().Color3)(1, 0.1, 0.1);
    beamMat.diffuseColor = new (B().Color3)(0, 0, 0);
    beamMat.specularColor = new (B().Color3)(0, 0, 0);
    beamMat.disableLighting = true;
    beamMat.alpha = 0.32;
    beamMat.backFaceCulling = false;

    beamCore = B().MeshBuilder.CreateCylinder('beamCore', { height: 1, diameter: 0.16 }, scene);
    beamCore.rotation.z = Math.PI / 2;
    beamCore.material = beamMat;
    beamCore.scaling.y = X_SLIT1 - (X_LASER + 1.3);
    beamCore.position.set((X_LASER + 1.3 + X_SLIT1) / 2, BEAM_Y, 0);

    beamFan1 = B().MeshBuilder.CreateCylinder('fan1', {
      height: 1, diameterTop: 1, diameterBottom: 0.06, tessellation: 44,
    }, scene);
    beamFan1.rotation.z = -Math.PI / 2;
    beamFan1.material = beamMat;
    beamFan1.scaling.set(0.45, X_SLIT2 - X_SLIT1, 1.7);
    beamFan1.position.set((X_SLIT1 + X_SLIT2) / 2, BEAM_Y, 0);
  }

  /**
   * 두 슬릿에서 나와 밝은 무늬로 모이는 광선.
   * 교과서 그림 III-4처럼 두 경로가 한 점에서 만나 보강 간섭하는 모습을 보여 준다.
   */
  function buildRays(xScreen, col) {
    if (rays) { rays.dispose(); rays = null; }
    if (!state.power || !placed.slit2 || !placed.screen) return;

    const dx = Physics.fringeSpacing(state.lambda, state.screenDist, state.slitGap);
    const visualGap = 0.3 + state.slitGap * 1.2;
    const maxM = Math.min(6, Math.floor(HALF_SPAN / dx));

    const lines = [];
    for (let m = -maxM; m <= maxM; m++) {
      const z = (m * dx / HALF_SPAN) * (SCREEN_W / 2);
      const target = new (B().Vector3)(xScreen, BEAM_Y, z);
      lines.push([new (B().Vector3)(X_SLIT2, BEAM_Y, -visualGap), target]);
      lines.push([new (B().Vector3)(X_SLIT2, BEAM_Y, visualGap), target]);
    }
    rays = B().MeshBuilder.CreateLineSystem('rays', { lines }, scene);
    rays.color = col;
    rays.alpha = 0.8;
    rays.isPickable = false;
  }

  function buildScreen() {
    screen = B().MeshBuilder.CreatePlane('screen', { width: SCREEN_W, height: SCREEN_H }, scene);
    screen.rotation.y = Math.PI / 2;
    screen.position.set(X_SLIT2 + M_TO_UNIT, BEAM_Y, 0);

    screenTex = new (B().DynamicTexture)('screenTex', { width: TEX_W, height: TEX_H }, scene, false);
    const m = new (B().StandardMaterial)('screenMat', scene);
    m.diffuseTexture = screenTex;
    m.emissiveTexture = screenTex;
    m.emissiveColor = new (B().Color3)(0.8, 0.8, 0.8);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    screen.material = m;

    screenStand = B().MeshBuilder.CreateBox('screenStand', { width: 1.1, height: 0.22, depth: 2.6 }, scene);
    screenStand.position.set(X_SLIT2 + M_TO_UNIT, TABLE_TOP + 0.11, 0);
    const sm = new (B().StandardMaterial)('standMat', scene);
    sm.diffuseColor = B().Color3.FromHexString('#141922');
    screenStand.material = sm;
  }

  function buildRuler() {
    rulerMesh = B().MeshBuilder.CreateGround('dRuler', { width: 1, height: 0.9 }, scene);
    rulerMesh.position.set(0, TABLE_TOP + 0.02, 2.9);
    rulerTex = new (B().DynamicTexture)('dRulerTex', { width: 1024, height: 96 }, scene, false);
    const m = new (B().StandardMaterial)('dRulerMat', scene);
    m.diffuseTexture = rulerTex;
    m.specularColor = new (B().Color3)(0, 0, 0);
    rulerMesh.material = m;
  }

  function drawRuler(L) {
    const ctx = rulerTex.getContext();
    ctx.fillStyle = '#e9eef5';
    ctx.fillRect(0, 0, 1024, 96);
    ctx.strokeStyle = '#3c4756';
    ctx.fillStyle = '#3c4756';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * 1004 + 10;
      ctx.beginPath(); ctx.moveTo(x, 96); ctx.lineTo(x, i % 5 === 0 ? 46 : 68); ctx.stroke();
    }
    ctx.font = 'bold 30px sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText('0', 12, 8);
    ctx.textAlign = 'center'; ctx.fillText((L / 2).toFixed(2) + ' m', 512, 8);
    ctx.textAlign = 'right'; ctx.fillText(L.toFixed(2) + ' m', 1012, 8);
    rulerTex.update();
  }

  /* ── 간섭무늬 ───────────────────────────────── */
  function drawPattern() {
    const ctx = screenTex.getContext();
    const rgb = Physics.wavelengthToRGB(state.lambda);
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    const lit = state.power && placed.laser && placed.slit1 && placed.slit2;
    if (!lit) {
      ctx.fillStyle = '#ded9cc';
      ctx.fillRect(0, 0, TEX_W, BAND_H);
    } else {
      const aMm = state.envelope ? state.slitWidth : 0;
      const SS = 4;
      const row = ctx.createImageData(TEX_W, 1);
      for (let px = 0; px < TEX_W; px++) {
        let acc = 0;
        for (let s = 0; s < SS; s++) {
          const t = (px + (s + 0.5) / SS) / TEX_W;
          const y = (t * 2 - 1) * HALF_SPAN;
          acc += Physics.intensity(y, state.lambda, state.slitGap, state.screenDist, aMm);
        }
        const I = acc / SS, o = px * 4;
        row.data[o]     = Math.round(Math.min(1, rgb.r * I) * 255);
        row.data[o + 1] = Math.round(Math.min(1, rgb.g * I) * 255);
        row.data[o + 2] = Math.round(Math.min(1, rgb.b * I) * 255);
        row.data[o + 3] = 255;
      }
      ctx.putImageData(row, 0, 0);
      ctx.drawImage(ctx.canvas, 0, 0, TEX_W, 1, 0, 0, TEX_W, BAND_H);
    }
    drawScale(ctx);
    screenTex.update();
  }

  function drawScale(ctx) {
    ctx.fillStyle = '#f2f5f8';
    ctx.fillRect(0, BAND_H, TEX_W, TEX_H - BAND_H);
    ctx.strokeStyle = '#2f3947';
    ctx.lineWidth = 2;
    const pxPerMm = TEX_W / (HALF_SPAN * 2);
    for (let mm = -HALF_SPAN; mm <= HALF_SPAN; mm++) {
      const x = (mm + HALF_SPAN) * pxPerMm;
      ctx.beginPath(); ctx.moveTo(x, BAND_H);
      ctx.lineTo(x, BAND_H + (mm % 10 === 0 ? 40 : mm % 5 === 0 ? 26 : 15));
      ctx.stroke();
    }
    ctx.fillStyle = '#2f3947';
    ctx.font = 'bold 30px sans-serif';
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    for (let mm = -HALF_SPAN + 10; mm <= HALF_SPAN - 10; mm += 10) {
      ctx.fillText(String(mm), (mm + HALF_SPAN) * pxPerMm, BAND_H + 48);
    }
    ctx.textAlign = 'right';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('(mm)', TEX_W - 10, BAND_H + 48);
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    Object.keys(slots).forEach((id) => {
      const p = B().MeshBuilder.CreatePlane('dph_' + id, { width: 2.6, height: 2.0 }, scene);
      p.rotation.y = Math.PI / 2;
      p.position.set(slots[id].x ?? 2, BEAM_Y, 0);
      const tex = new (B().DynamicTexture)('dphT_' + id, { width: 256, height: 200 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 256, 200);
      ctx.strokeStyle = '#5aa9ff';
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(8, 8, 240, 184);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8fd0ff';
      ctx.font = 'bold 30px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(slots[id].name, 128, 110);
      tex.hasAlpha = true;
      tex.update();
      const m = new (B().StandardMaterial)('dphM_' + id, scene);
      m.diffuseTexture = tex;
      m.opacityTexture = tex;
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
    lastDist = null;
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    laserGroup.setEnabled(!!placed.laser);
    slitPlates.slit1.group.setEnabled(!!placed.slit1);
    slitPlates.slit2.group.setEnabled(!!placed.slit2);
    screen.setEnabled(!!placed.screen);
    screenStand.setEnabled(!!placed.screen);
    rulerMesh.setEnabled(!!placed.screen);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const x = id === 'screen' ? X_SLIT2 + state.screenDist * M_TO_UNIT : slots[id].x;
    return Math.abs(point.x - x) <= slots[id].r ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;
    const rgb = Physics.wavelengthToRGB(state.lambda);
    const col = new (B().Color3)(rgb.r, rgb.g, rgb.b);
    const lit = state.power && placed.laser;

    beamMat.emissiveColor = col;
    beamCore.setEnabled(lit && placed.slit1);
    beamFan1.setEnabled(lit && placed.slit1 && placed.slit2);

    ['slit1', 'slit2'].forEach((n) => {
      slitPlates[n].holes.forEach((h) => {
        h.material.emissiveColor = lit ? col : new (B().Color3)(0.04, 0.04, 0.04);
      });
    });

    const visualGap = 0.3 + state.slitGap * 1.2;
    slitPlates.slit2.holes[0].position.z = -visualGap;
    slitPlates.slit2.holes[1].position.z = visualGap;

    const xScreen = X_SLIT2 + state.screenDist * M_TO_UNIT;
    screen.position.x = xScreen;
    screenStand.position.x = xScreen;
    if (holders.screen) holders.screen.position.x = xScreen;

    buildRays(xScreen, col);

    rulerMesh.scaling.x = xScreen - X_SLIT2;
    rulerMesh.position.x = (X_SLIT2 + xScreen) / 2;
    drawRuler(state.screenDist);

    // 스크린 거리가 바뀌면 장치 전체가 화면에 들어오도록 프레이밍만 다시 잡는다
    if (lastDist !== state.screenDist) {
      lastDist = state.screenDist;
      camera.setTarget(new (B().Vector3)((X_LASER + xScreen) / 2 + 0.5, 0.25, 0));
      camera.radius = (xScreen - X_LASER) * 0.85 + 2.5;
    }
    drawPattern();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 - 0.62;
    camera.beta = 1.05;
    lastDist = null;
    update();
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '레이저의 파장과 슬릿 사이의 간격(<i>d</i>), 스크린까지의 거리(<i>L</i>)를 조절하여 간섭무늬가 어떻게 변하는지 관찰해 보세요.';
  const prepGuide = '점선으로 표시된 자리에 실험도구를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    return `
    <div class="control">
      <div class="clabel">레이저의<br>파장 <i>λ</i></div>
      <div class="cbody">
        <div class="slider-row">
          <input type="range" id="lamSlider" min="400" max="700" step="1" value="${state.lambda}">
          <output id="lamOut">${state.lambda} nm</output>
        </div>
        <div class="opt-grid one-row" style="margin-top:6px">
          <button class="opt" data-lam="650">빨강 650</button>
          <button class="opt" data-lam="532">초록 532</button>
          <button class="opt" data-lam="450">파랑 450</button>
        </div>
      </div>
    </div>
    <div class="control">
      <div class="clabel">슬릿 사이의<br>간격 <i>d</i></div>
      <div class="cbody">
        <div class="slider-row">
          <input type="range" id="gapSlider" min="0.10" max="0.60" step="0.01" value="${state.slitGap}">
          <output id="gapOut">${state.slitGap.toFixed(2)} mm</output>
        </div>
        <div class="opt-grid one-row" style="margin-top:6px">
          <button class="opt" data-gap="0.2">0.2 mm</button>
          <button class="opt" data-gap="0.4">0.4 mm</button>
        </div>
      </div>
    </div>
    <div class="control">
      <div class="clabel">스크린까지의<br>거리 <i>L</i></div>
      <div class="cbody">
        <div class="slider-row">
          <input type="range" id="distSlider" min="0.5" max="2.0" step="0.05" value="${state.screenDist}">
          <output id="distOut">${state.screenDist.toFixed(2)} m</output>
        </div>
        <div class="opt-grid one-row" style="margin-top:6px">
          <button class="opt" data-dist="1.0">교과서 조건 1 m</button>
        </div>
      </div>
    </div>
    <div class="control">
      <div class="clabel">슬릿의<br>폭 <i>a</i></div>
      <div class="cbody">
        <div class="slider-row">
          <input type="range" id="wSlider" min="0.02" max="0.12" step="0.01" value="${state.slitWidth}">
          <output id="wOut">${state.slitWidth.toFixed(2)} mm</output>
        </div>
        <div class="opt-grid one-row" style="margin-top:6px">
          <button class="opt${state.envelope ? ' on' : ''}" id="envBtn">회절 효과 반영</button>
        </div>
      </div>
    </div>
    <div class="control">
      <div class="clabel">레이저<br>전원</div>
      <button class="power${state.power ? '' : ' off'}" id="powerBtn">${state.power ? 'ON' : 'OFF'}</button>
    </div>`;
  }

  /** 슬릿 폭이 간격의 절반을 넘으면 두 슬릿이 겹치므로 상한을 건다 */
  function clampWidth(root) {
    const el = root.querySelector('#wSlider');
    const max = Math.max(0.02, Math.floor(state.slitGap * 50) / 100);
    el.max = max.toFixed(2);
    if (state.slitWidth > max) {
      state.slitWidth = max;
      el.value = max;
      root.querySelector('#wOut').textContent = `${max.toFixed(2)} mm`;
    }
  }

  function bindControls(root, onChange) {
    const pairs = [
      ['#lamSlider', '#lamOut', 'lambda', (v) => `${v} nm`],
      ['#gapSlider', '#gapOut', 'slitGap', (v) => `${v.toFixed(2)} mm`],
      ['#distSlider', '#distOut', 'screenDist', (v) => `${v.toFixed(2)} m`],
      ['#wSlider', '#wOut', 'slitWidth', (v) => `${v.toFixed(2)} mm`],
    ];
    pairs.forEach(([s, o, key, fmt]) => {
      const el = root.querySelector(s), out = root.querySelector(o);
      el.addEventListener('input', () => {
        state[key] = parseFloat(el.value);
        out.textContent = fmt(state[key]);
        clampWidth(root);
        onChange();
      });
    });

    const jump = (sel, key, fmt) => (v) => {
      state[key] = parseFloat(v);
      root.querySelector(sel).value = v;
      root.querySelector(sel.replace('Slider', 'Out')).textContent = fmt(state[key]);
      clampWidth(root);
      onChange();
    };
    const setLam = jump('#lamSlider', 'lambda', (v) => `${v} nm`);
    const setGap = jump('#gapSlider', 'slitGap', (v) => `${v.toFixed(2)} mm`);
    const setDist = jump('#distSlider', 'screenDist', (v) => `${v.toFixed(2)} m`);
    root.querySelectorAll('[data-lam]').forEach((b) => b.addEventListener('click', () => setLam(b.dataset.lam)));
    root.querySelectorAll('[data-gap]').forEach((b) => b.addEventListener('click', () => setGap(b.dataset.gap)));
    root.querySelectorAll('[data-dist]').forEach((b) => b.addEventListener('click', () => setDist(b.dataset.dist)));

    const env = root.querySelector('#envBtn');
    env.addEventListener('click', () => {
      state.envelope = !state.envelope;
      env.classList.toggle('on', state.envelope);
      env.textContent = state.envelope ? '회절 효과 반영' : '회절 효과 끔';
      root.querySelector('#wSlider').disabled = !state.envelope;
      onChange();
    });

    const pb = root.querySelector('#powerBtn');
    pb.addEventListener('click', () => {
      state.power = !state.power;
      pb.textContent = state.power ? 'ON' : 'OFF';
      pb.classList.toggle('off', !state.power);
      onChange();
    });

    clampWidth(root);
  }

  /* ══ 측정값 · 그래프 ════════════════════════ */
  function readoutHTML() {
    const dx = Physics.fringeSpacing(state.lambda, state.screenDist, state.slitGap);
    const visible = Math.floor(HALF_SPAN / dx) * 2 + 1;
    return `
      <div class="row"><span>파장 <i>λ</i></span><b>${state.lambda} nm</b></div>
      <div class="row"><span>슬릿 간격 <i>d</i></span><b>${state.slitGap.toFixed(2)} mm</b></div>
      <div class="row"><span>스크린 거리 <i>L</i></span><b>${state.screenDist.toFixed(2)} m</b></div>
      <div class="row"><span>무늬 간격 <i>Δx</i></span><b class="big">${dx.toFixed(2)} mm</b></div>
      <div class="row"><span>보이는 밝은 무늬</span><b>약 ${visible}개</b></div>
      <div class="formula">Δ<i>x</i> = <i>λL</i> / <i>d</i> &nbsp;→&nbsp; <i>λ</i>에 비례, <i>d</i>에 반비례</div>`;
  }

  const graphTitle = '스크린에서의 빛의 세기';

  function drawGraph(ctx, W, H) {
    const rgb = Physics.wavelengthToRGB(state.lambda);
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);
    const top = 8, padB = 20, h = H - padB - top;

    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    for (let mm = -HALF_SPAN; mm <= HALF_SPAN; mm += 10) {
      const x = ((mm + HALF_SPAN) / (HALF_SPAN * 2)) * W;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + h); ctx.stroke();
    }

    const aMm = state.envelope ? state.slitWidth : 0;
    ctx.beginPath();
    ctx.moveTo(0, top + h);
    for (let px = 0; px <= W; px++) {
      const y = ((px / W) * 2 - 1) * HALF_SPAN;
      const I = Physics.intensity(y, state.lambda, state.slitGap, state.screenDist, aMm);
      ctx.lineTo(px, top + h - I * h);
    }
    ctx.lineTo(W, top + h);
    ctx.closePath();
    ctx.fillStyle = Physics.rgbToCss(rgb, 0.45);
    ctx.fill();
    ctx.strokeStyle = Physics.rgbToCss(rgb);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (state.envelope) {
      ctx.beginPath();
      for (let px = 0; px <= W; px++) {
        const y = ((px / W) * 2 - 1) * HALF_SPAN;
        const env = Physics.diffractionIntensity(y, state.lambda, state.slitWidth, state.screenDist);
        const py = top + h - env * h;
        px === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = '#9fb0c2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let mm = -HALF_SPAN; mm <= HALF_SPAN; mm += 10) {
      ctx.fillText(String(mm), ((mm + HALF_SPAN) / (HALF_SPAN * 2)) * W, top + h + 5);
    }
    ctx.textAlign = 'right';
    ctx.fillText('(mm)', W - 4, top + h + 5);
  }

  function graphFootHTML() {
    const dx = Physics.fringeSpacing(state.lambda, state.screenDist, state.slitGap);
    return `밝은 무늬 사이의 간격 <b>Δ<i>x</i> = ${dx.toFixed(2)} mm</b>` +
      (state.envelope ? ' · 점선은 단일 슬릿에 의한 회절 포락선' : '');
  }

  return {
    id: 'double',
    title: '이중 슬릿 실험 관찰하기',
    guide, prepGuide, tools, state,
    create, update, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    get scene() { return scene; },
  };
})();
