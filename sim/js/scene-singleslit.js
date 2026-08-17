/**
 * 실험 3 — 단일 슬릿 실험 관찰하기 (회절)
 * 교과서 127쪽 그림 III-3 의 「단일 슬릿」 부분을 따로 떼어 관찰한다.
 *   레이저 → 단일 슬릿 → 스크린
 * 어두운 무늬 조건 a sinθ = mλ, 중앙 밝은 무늬의 폭 w = 2λL/a
 */
const SingleSlitScene = (() => {
  const B = () => BABYLON;

  const M_TO_UNIT = 5;
  const X_LASER = -9.5;
  const X_SLIT = -4.0;
  const TABLE_TOP = -1.1;
  const BEAM_Y = 0.4;

  const HALF_SPAN = 40;   // 회절 무늬는 넓게 퍼지므로 ±40 mm
  const SCREEN_W = 6.0;
  const SCREEN_H = 3.0;
  const TEX_W = 1400, TEX_H = 460, BAND_H = 330;

  let scene, camera;
  let screen, screenStand, screenTex, rulerMesh, rulerTex;
  let beamCore, beamFan, beamMat, edgeRays, laserGroup, slitGroup, slitHole;
  let lastDist = null;
  let placed = {};

  const state = {
    lambda: 532, slitWidth: 0.10, screenDist: 1.0, power: true,
  };

  const tools = [
    { id: 'laser', label: '레이저 광원', icon: 'laser' },
    { id: 'slit', label: '단일 슬릿', icon: 'slit1' },
    { id: 'screen', label: '스크린 · 줄자', icon: 'screen' },
  ];

  const slots = {
    laser: { x: X_LASER, r: 3.2, name: '레이저' },
    slit: { x: X_SLIT, r: 2.0, name: '단일 슬릿' },
    screen: { x: null, r: 3.2, name: '스크린' },
  };

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#0d1520ff');

    camera = new (B().ArcRotateCamera)(
      'camSingle', -Math.PI / 2 - 0.62, 1.05, 13, new (B().Vector3)(-3.2, 0.25, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 34;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hg', new (B().Vector3)(0.2, 1, -0.3), scene);
    hemi.intensity = 0.72;
    hemi.groundColor = new (B().Color3)(0.16, 0.2, 0.26);

    const dir = new (B().DirectionalLight)('dg', new (B().Vector3)(-0.4, -1, 0.55), scene);
    dir.position = new (B().Vector3)(6, 12, -8);
    dir.intensity = 0.5;

    const glow = new (B().GlowLayer)('glowS', scene);
    glow.intensity = 0.55;

    buildTable();
    buildLaser();
    buildSlit();
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
    const top = B().MeshBuilder.CreateBox('gTable', { width: 36, height: 0.5, depth: 10.5 }, scene);
    top.position.set(-1, -1.35, 0);
    const m = new (B().StandardMaterial)('gTableMat', scene);
    m.diffuseColor = B().Color3.FromHexString('#1d242e');
    m.specularColor = B().Color3.FromHexString('#2d3846');
    m.specularPower = 64;
    top.material = m;
  }

  function buildLaser() {
    laserGroup = new (B().TransformNode)('gLaserGroup', scene);
    const bm = new (B().StandardMaterial)('gLaserMat', scene);
    bm.diffuseColor = B().Color3.FromHexString('#1b1f26');
    bm.specularColor = B().Color3.FromHexString('#6e7887');
    bm.specularPower = 64;

    const body = B().MeshBuilder.CreateBox('gLaserBody', { width: 2.4, height: 1.1, depth: 1.5 }, scene);
    body.position.set(X_LASER - 0.7, BEAM_Y, 0);
    body.material = bm; body.parent = laserGroup;

    const standH = (BEAM_Y - 0.55) - TABLE_TOP;
    const stand = B().MeshBuilder.CreateBox('gLaserStand', { width: 1.4, height: standH, depth: 1.1 }, scene);
    stand.position.set(X_LASER - 0.7, TABLE_TOP + standH / 2, 0);
    stand.material = bm; stand.parent = laserGroup;

    const nose = B().MeshBuilder.CreateCylinder('gLaserNose', { height: 0.8, diameter: 0.42 }, scene);
    nose.rotation.z = Math.PI / 2;
    nose.position.set(X_LASER + 0.9, BEAM_Y, 0);
    const nm = new (B().StandardMaterial)('gNoseMat', scene);
    nm.diffuseColor = B().Color3.FromHexString('#3a4450');
    nose.material = nm; nose.parent = laserGroup;
  }

  function buildSlit() {
    slitGroup = new (B().TransformNode)('gSlitGroup', scene);
    const m = new (B().StandardMaterial)('gSlitMat', scene);
    m.diffuseColor = B().Color3.FromHexString('#11151b');
    m.specularColor = B().Color3.FromHexString('#39424f');

    const plateH = (BEAM_Y - TABLE_TOP) * 2;
    const plate = B().MeshBuilder.CreateBox('gSlit', { width: 0.16, height: plateH, depth: 4.6 }, scene);
    plate.position.set(X_SLIT, BEAM_Y, 0);
    plate.material = m; plate.parent = slitGroup;

    slitHole = B().MeshBuilder.CreateBox('gSlitHole', { width: 0.22, height: 0.9, depth: 1 }, scene);
    slitHole.position.set(X_SLIT, BEAM_Y, 0);
    const hm = new (B().StandardMaterial)('gSlitHoleMat', scene);
    hm.emissiveColor = new (B().Color3)(1, 1, 1);
    hm.disableLighting = true;
    slitHole.material = hm;
    slitHole.parent = slitGroup;
  }

  function buildBeams() {
    beamMat = new (B().StandardMaterial)('gBeamMat', scene);
    beamMat.diffuseColor = new (B().Color3)(0, 0, 0);
    beamMat.specularColor = new (B().Color3)(0, 0, 0);
    beamMat.disableLighting = true;
    beamMat.alpha = 0.3;
    beamMat.backFaceCulling = false;

    beamCore = B().MeshBuilder.CreateCylinder('gBeamCore', { height: 1, diameter: 0.2 }, scene);
    beamCore.rotation.z = Math.PI / 2;
    beamCore.material = beamMat;
    beamCore.scaling.y = X_SLIT - (X_LASER + 1.3);
    beamCore.position.set((X_LASER + 1.3 + X_SLIT) / 2, BEAM_Y, 0);

    // 슬릿을 지나 퍼지는 회절광
    beamFan = B().MeshBuilder.CreateCylinder('gFan', {
      height: 1, diameterTop: 1, diameterBottom: 0.05, tessellation: 48,
    }, scene);
    beamFan.rotation.z = -Math.PI / 2;
    beamFan.material = beamMat;
  }

  /** 중앙 밝은 무늬의 가장자리(첫 번째 어두운 무늬)로 향하는 경계선 */
  function buildEdgeRays(xScreen, col) {
    if (edgeRays) { edgeRays.dispose(); edgeRays = null; }
    if (!lit() || !placed.screen) return;

    const lines = [];
    const start = new (B().Vector3)(X_SLIT, BEAM_Y, 0);
    for (let m = 1; m <= 3; m++) {
      const yMm = Physics.darkFringePosition(m, state.lambda, state.slitWidth, state.screenDist);
      if (Math.abs(yMm) > HALF_SPAN) break;
      const z = (yMm / HALF_SPAN) * (SCREEN_W / 2);
      lines.push([start, new (B().Vector3)(xScreen, BEAM_Y, z)]);
      lines.push([start, new (B().Vector3)(xScreen, BEAM_Y, -z)]);
    }
    lines.push([start, new (B().Vector3)(xScreen, BEAM_Y, 0)]);
    if (!lines.length) return;

    edgeRays = B().MeshBuilder.CreateLineSystem('gEdges', { lines }, scene);
    edgeRays.color = col;
    edgeRays.alpha = 0.85;
    edgeRays.isPickable = false;
  }

  function buildScreen() {
    screen = B().MeshBuilder.CreatePlane('gScreen', { width: SCREEN_W, height: SCREEN_H }, scene);
    screen.rotation.y = Math.PI / 2;
    screen.position.set(X_SLIT + M_TO_UNIT, BEAM_Y, 0);

    screenTex = new (B().DynamicTexture)('gScreenTex', { width: TEX_W, height: TEX_H }, scene, false);
    const m = new (B().StandardMaterial)('gScreenMat', scene);
    m.diffuseTexture = screenTex;
    m.emissiveTexture = screenTex;
    m.emissiveColor = new (B().Color3)(0.8, 0.8, 0.8);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    screen.material = m;

    screenStand = B().MeshBuilder.CreateBox('gScreenStand', { width: 1.1, height: 0.22, depth: 2.8 }, scene);
    screenStand.position.set(X_SLIT + M_TO_UNIT, TABLE_TOP + 0.11, 0);
    const sm = new (B().StandardMaterial)('gStandMat', scene);
    sm.diffuseColor = B().Color3.FromHexString('#141922');
    screenStand.material = sm;
  }

  function buildRuler() {
    rulerMesh = B().MeshBuilder.CreateGround('gRuler', { width: 1, height: 0.9 }, scene);
    rulerMesh.position.set(0, TABLE_TOP + 0.02, 3.2);
    rulerTex = new (B().DynamicTexture)('gRulerTex', { width: 1024, height: 96 }, scene, false);
    const m = new (B().StandardMaterial)('gRulerMat', scene);
    m.diffuseTexture = rulerTex;
    m.specularColor = new (B().Color3)(0, 0, 0);
    rulerMesh.material = m;
  }

  function drawRuler(L) {
    const ctx = rulerTex.getContext();
    ctx.fillStyle = '#e9eef5';
    ctx.fillRect(0, 0, 1024, 96);
    ctx.strokeStyle = '#3c4756'; ctx.fillStyle = '#3c4756'; ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * 1004 + 10;
      ctx.beginPath(); ctx.moveTo(x, 96); ctx.lineTo(x, i % 5 === 0 ? 46 : 68); ctx.stroke();
    }
    ctx.font = 'bold 30px sans-serif'; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText('0', 12, 8);
    ctx.textAlign = 'center'; ctx.fillText((L / 2).toFixed(2) + ' m', 512, 8);
    ctx.textAlign = 'right'; ctx.fillText(L.toFixed(2) + ' m', 1012, 8);
    rulerTex.update();
  }

  /* ── 회절 무늬 ──────────────────────────────── */
  function drawPattern() {
    const ctx = screenTex.getContext();
    const rgb = Physics.wavelengthToRGB(state.lambda);
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    if (!lit()) {
      ctx.fillStyle = '#ded9cc';
      ctx.fillRect(0, 0, TEX_W, BAND_H);
    } else {
      const SS = 4;
      const row = ctx.createImageData(TEX_W, 1);
      for (let px = 0; px < TEX_W; px++) {
        let acc = 0;
        for (let s = 0; s < SS; s++) {
          const t = (px + (s + 0.5) / SS) / TEX_W;
          const y = (t * 2 - 1) * HALF_SPAN;
          acc += Physics.diffractionIntensity(y, state.lambda, state.slitWidth, state.screenDist);
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
    ctx.strokeStyle = '#2f3947'; ctx.lineWidth = 2;
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
      const p = B().MeshBuilder.CreatePlane('gph_' + id, { width: 2.6, height: 2.0 }, scene);
      p.rotation.y = Math.PI / 2;
      p.position.set(slots[id].x ?? 1, BEAM_Y, 0);
      const tex = new (B().DynamicTexture)('gphT_' + id, { width: 256, height: 200 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 256, 200);
      ctx.strokeStyle = '#5aa9ff'; ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(8, 8, 240, 184);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8fd0ff';
      ctx.font = 'bold 30px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(slots[id].name, 128, 110);
      tex.hasAlpha = true; tex.update();
      const m = new (B().StandardMaterial)('gphM_' + id, scene);
      m.diffuseTexture = tex; m.opacityTexture = tex;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.specularColor = new (B().Color3)(0, 0, 0);
      m.backFaceCulling = false;
      p.material = m;
      holders[id] = p;
    });
  }

  /* ══ 도구 배치 ═══════════════════════════════ */
  function lit() { return state.power && placed.laser && placed.slit; }

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
    slitGroup.setEnabled(!!placed.slit);
    screen.setEnabled(!!placed.screen);
    screenStand.setEnabled(!!placed.screen);
    rulerMesh.setEnabled(!!placed.screen);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const x = id === 'screen' ? X_SLIT + state.screenDist * M_TO_UNIT : slots[id].x;
    return Math.abs(point.x - x) <= slots[id].r ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;
    const rgb = Physics.wavelengthToRGB(state.lambda);
    const col = new (B().Color3)(rgb.r, rgb.g, rgb.b);

    beamMat.emissiveColor = col;
    beamCore.setEnabled(state.power && placed.laser && placed.slit);
    slitHole.material.emissiveColor = lit() ? col : new (B().Color3)(0.04, 0.04, 0.04);

    // 슬릿 폭이 좁을수록 구멍을 좁게 그린다 (실제 크기는 보이지 않으므로 과장)
    slitHole.scaling.z = 0.12 + state.slitWidth * 2.2;

    const xScreen = X_SLIT + state.screenDist * M_TO_UNIT;
    screen.position.x = xScreen;
    screenStand.position.x = xScreen;
    if (holders.screen) holders.screen.position.x = xScreen;

    // 회절광이 퍼지는 정도를 중앙 밝은 무늬의 폭에 맞춘다
    const wMm = Physics.centralMaxWidth(state.lambda, state.slitWidth, state.screenDist);
    const spread = Math.min(SCREEN_W * 0.98, (wMm / (HALF_SPAN * 2)) * SCREEN_W);
    // 위아래로는 얇고 좌우로만 퍼지는 부채꼴이 되도록 두께를 눌러 준다
    beamFan.setEnabled(lit() && placed.screen);
    beamFan.scaling.set(0.34, xScreen - X_SLIT, Math.max(0.4, spread));
    beamFan.position.set((X_SLIT + xScreen) / 2, BEAM_Y, 0);

    buildEdgeRays(xScreen, col);

    rulerMesh.scaling.x = xScreen - X_SLIT;
    rulerMesh.position.x = (X_SLIT + xScreen) / 2;
    drawRuler(state.screenDist);

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
  const guide = '슬릿의 폭(<i>a</i>)을 좁혀 가며 빛이 얼마나 넓게 퍼지는지 관찰해 보세요.';
  const prepGuide = '점선으로 표시된 자리에 실험도구를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    return `
    <div class="control">
      <div class="clabel">레이저의<br>파장 <i>λ</i></div>
      <div class="cbody">
        <div class="slider-row">
          <input type="range" id="sLam" min="400" max="700" step="1" value="${state.lambda}">
          <output id="sLamOut">${state.lambda} nm</output>
        </div>
        <div class="opt-grid one-row" style="margin-top:6px">
          <button class="opt" data-slam="650">빨강 650</button>
          <button class="opt" data-slam="532">초록 532</button>
          <button class="opt" data-slam="450">파랑 450</button>
        </div>
      </div>
    </div>
    <div class="control">
      <div class="clabel">슬릿의<br>폭 <i>a</i></div>
      <div class="cbody">
        <div class="slider-row">
          <input type="range" id="sWid" min="0.02" max="0.30" step="0.01" value="${state.slitWidth}">
          <output id="sWidOut">${state.slitWidth.toFixed(2)} mm</output>
        </div>
        <div class="opt-grid one-row" style="margin-top:6px">
          <button class="opt" data-swid="0.05">0.05 mm</button>
          <button class="opt" data-swid="0.10">0.10 mm</button>
          <button class="opt" data-swid="0.20">0.20 mm</button>
        </div>
      </div>
    </div>
    <div class="control">
      <div class="clabel">스크린까지의<br>거리 <i>L</i></div>
      <div class="cbody">
        <div class="slider-row">
          <input type="range" id="sDist" min="0.5" max="2.0" step="0.05" value="${state.screenDist}">
          <output id="sDistOut">${state.screenDist.toFixed(2)} m</output>
        </div>
        <div class="opt-grid one-row" style="margin-top:6px">
          <button class="opt" data-sdist="1.0">교과서 조건 1 m</button>
        </div>
      </div>
    </div>
    <div class="control">
      <div class="clabel">레이저<br>전원</div>
      <button class="power${state.power ? '' : ' off'}" id="sPower">${state.power ? 'ON' : 'OFF'}</button>
    </div>`;
  }

  function bindControls(root, onChange) {
    const pairs = [
      ['#sLam', '#sLamOut', 'lambda', (v) => `${v} nm`, 'slam'],
      ['#sWid', '#sWidOut', 'slitWidth', (v) => `${v.toFixed(2)} mm`, 'swid'],
      ['#sDist', '#sDistOut', 'screenDist', (v) => `${v.toFixed(2)} m`, 'sdist'],
    ];
    pairs.forEach(([s, o, key, fmt, dataKey]) => {
      const el = root.querySelector(s), out = root.querySelector(o);
      const apply = () => {
        state[key] = parseFloat(el.value);
        out.textContent = fmt(state[key]);
        onChange();
      };
      el.addEventListener('input', apply);
      root.querySelectorAll(`[data-${dataKey}]`).forEach((b) => b.addEventListener('click', () => {
        el.value = b.dataset[dataKey];
        apply();
      }));
    });

    const pb = root.querySelector('#sPower');
    pb.addEventListener('click', () => {
      state.power = !state.power;
      pb.textContent = state.power ? 'ON' : 'OFF';
      pb.classList.toggle('off', !state.power);
      onChange();
    });
  }

  /* ══ 측정값 · 그래프 ════════════════════════ */
  function readoutHTML() {
    const w = Physics.centralMaxWidth(state.lambda, state.slitWidth, state.screenDist);
    const y1 = Physics.darkFringePosition(1, state.lambda, state.slitWidth, state.screenDist);
    return `
      <div class="row"><span>파장 <i>λ</i></span><b>${state.lambda} nm</b></div>
      <div class="row"><span>슬릿 폭 <i>a</i></span><b>${state.slitWidth.toFixed(2)} mm</b></div>
      <div class="row"><span>스크린 거리 <i>L</i></span><b>${state.screenDist.toFixed(2)} m</b></div>
      <div class="row"><span>첫 어두운 무늬</span><b>±${y1.toFixed(1)} mm</b></div>
      <div class="row"><span>중앙 무늬의 폭</span><b class="big">${w.toFixed(1)} mm</b></div>
      <div class="formula"><i>w</i> = 2<i>λL</i> / <i>a</i> &nbsp;→&nbsp; <i>a</i>가 좁을수록 넓게 퍼진다</div>`;
  }

  const graphTitle = '스크린에서의 빛의 세기 (회절)';

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

    ctx.beginPath();
    ctx.moveTo(0, top + h);
    for (let px = 0; px <= W; px++) {
      const y = ((px / W) * 2 - 1) * HALF_SPAN;
      const I = Physics.diffractionIntensity(y, state.lambda, state.slitWidth, state.screenDist);
      ctx.lineTo(px, top + h - I * h);
    }
    ctx.lineTo(W, top + h);
    ctx.closePath();
    ctx.fillStyle = Physics.rgbToCss(rgb, 0.45);
    ctx.fill();
    ctx.strokeStyle = Physics.rgbToCss(rgb);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 첫 번째 어두운 무늬 위치 표시
    const y1 = Physics.darkFringePosition(1, state.lambda, state.slitWidth, state.screenDist);
    if (y1 < HALF_SPAN) {
      ctx.strokeStyle = 'rgba(255,216,74,.8)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.4;
      [y1, -y1].forEach((y) => {
        const px = ((y + HALF_SPAN) / (HALF_SPAN * 2)) * W;
        ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + h); ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    ctx.fillStyle = '#9fb0c2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let mm = -HALF_SPAN; mm <= HALF_SPAN; mm += 20) {
      ctx.fillText(String(mm), ((mm + HALF_SPAN) / (HALF_SPAN * 2)) * W, top + h + 5);
    }
    ctx.textAlign = 'right';
    ctx.fillText('(mm)', W - 4, top + h + 5);
  }

  function graphFootHTML() {
    const w = Physics.centralMaxWidth(state.lambda, state.slitWidth, state.screenDist);
    return `중앙 밝은 무늬의 폭 <b><i>w</i> = ${w.toFixed(1)} mm</b> · 노란 점선은 첫 번째 어두운 무늬`;
  }

  return {
    id: 'single',
    title: '단일 슬릿 실험 관찰하기',
    guide, prepGuide, tools, state,
    create, update, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    get scene() { return scene; },
  };
})();
