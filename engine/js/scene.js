/**
 * 열기관과 열효율
 * 비상교육 고등 물리학 I-2-03 (교과서 52~57쪽)
 *
 * 고열원에서 Q1 을 받아 일 W 를 하고 저열원으로 Q2 를 버리는 열기관.
 * 효율을 올리려 해도 카르노 한계를 넘을 수 없고, 100 % 는 불가능하다는 것
 * (영구 기관의 불가능함)을 직접 확인할 수 있게 했다.
 */
const EngineScene = (() => {
  const B = () => BABYLON;

  let scene, camera;
  let hotBlock, coldBlock, cylinder, piston, wheel, flowGroup;
  let hotTex, coldTex;
  let placed = {};

  const state = {
    T1: 600,        // 고열원 온도 (K)
    T2: 300,        // 저열원 온도 (K)
    Q1: 1000,       // 공급 열량 (J)
    quality: 0.6,   // 실제 기관의 완성도 (카르노 대비)
    running: false,
  };

  let phase = 0;    // 피스톤 왕복
  let cycles = 0;

  const tools = [
    { id: 'hot', label: '고열원 (보일러)', icon: 'weight' },
    { id: 'engine', label: '열기관 (실린더)', icon: 'cart' },
    { id: 'cold', label: '저열원 (냉각기)', icon: 'screenBoard' },
  ];

  const slots = {
    hot: { x: -8, name: '고열원' },
    engine: { x: 0, name: '열기관' },
    cold: { x: 8, name: '저열원' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 카르노 효율 — 이 온도 사이에서 가능한 최대 효율 */
  function carnot() { return 1 - state.T2 / state.T1; }
  /** 실제 효율 */
  function efficiency() { return carnot() * state.quality; }

  function energies() {
    const e = efficiency();
    const W = state.Q1 * e;
    return { e, W, Q2: state.Q1 - W };
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#1a2230ff');

    camera = new (B().ArcRotateCamera)(
      'camEng', -Math.PI / 2 + 0.05, 1.16, 26, new (B().Vector3)(0, 2.0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 13;
    camera.upperRadiusLimit = 46;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('heg', new (B().Vector3)(-0.1, 1, -0.35), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new (B().Color3)(0.24, 0.27, 0.33);

    const dir = new (B().DirectionalLight)('deg', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 16, -9);
    dir.intensity = 0.4;

    const glow = new (B().GlowLayer)('glowEg', scene);
    glow.intensity = 0.55;

    buildBase();
    buildReservoirs();
    buildEngine();
    buildPlaceholders();

    glow.addExcludedMesh(scene.getMeshByName('hotFace'));
    glow.addExcludedMesh(scene.getMeshByName('coldFace'));

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/engine.jpg', { x: -8, y: 0, z: 5.5, ry: 0.3 });

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

  function buildBase() {
    const t = B().MeshBuilder.CreateBox('egBase', { width: 30, height: 0.5, depth: 12 }, scene);
    t.position.set(0, -0.26, 0);
    t.material = mat('egBaseMat', '#2b3441', '#4c5766', 72);
  }

  /** 열원 하나 (온도를 숫자로 보여 준다) */
  function reservoir(name, x, hex, label) {
    const g = new (B().TransformNode)(name, scene);
    const box = B().MeshBuilder.CreateBox(name + 'B', { width: 4.4, height: 5.4, depth: 3.4 }, scene);
    box.position.set(x, 2.7, 0);
    box.material = mat(name + 'BM', hex, '#ffffff', 48);
    box.parent = g;

    const face = B().MeshBuilder.CreatePlane(name + 'Face', { width: 3.6, height: 2.4 }, scene);
    face.position.set(x, 3.4, -1.72);
    face.rotation.y = Math.PI;
    const tex = new (B().DynamicTexture)(name + 'Tex', { width: 240, height: 160 }, scene, true);
    const fm = new (B().StandardMaterial)(name + 'FM', scene);
    fm.diffuseTexture = tex; fm.emissiveTexture = tex; fm.opacityTexture = tex;
    fm.emissiveColor = new (B().Color3)(0.95, 0.95, 0.95);
    fm.specularColor = new (B().Color3)(0, 0, 0);
    fm.backFaceCulling = false;
    face.material = fm;
    face.parent = g;
    g._tex = tex;
    g._label = label;
    return g;
  }

  function buildReservoirs() {
    hotBlock = reservoir('hot', -8, '#c23a2a', '고열원');
    coldBlock = reservoir('cold', 8, '#2f6ad0', '저열원');
    hotTex = hotBlock._tex; coldTex = coldBlock._tex;
  }

  function drawReservoir(g, T, Q, qLabel, color) {
    const ctx = g._tex.getContext();
    ctx.clearRect(0, 0, 240, 160);
    ctx.translate(240, 0); ctx.scale(-1, 1);
    ctx.fillStyle = '#12181f';
    ctx.fillRect(0, 0, 240, 160);
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 232, 152);

    ctx.fillStyle = color;
    ctx.font = 'bold 24px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(g._label, 120, 14);

    ctx.fillStyle = '#e8eef6';
    ctx.font = 'bold 40px "Menlo", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${T} K`, 120, 72);

    ctx.fillStyle = '#9fb0c2';
    ctx.font = 'bold 20px sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${qLabel} = ${Q.toFixed(0)} J`, 120, 146);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    g._tex.update();
  }

  /** 열기관 — 실린더·피스톤·플라이휠 */
  function buildEngine() {
    cylinder = new (B().TransformNode)('engineGroup', scene);

    const body = B().MeshBuilder.CreateCylinder('cylBody',
      { height: 4.6, diameter: 3.0, tessellation: 28 }, scene);
    body.position.set(0, 2.6, 0);
    const cm = new (B().StandardMaterial)('cylMat', scene);
    cm.diffuseColor = B().Color3.FromHexString('#8e9bad');
    cm.specularColor = B().Color3.FromHexString('#ffffff');
    cm.specularPower = 64;
    cm.alpha = 0.42;
    cm.backFaceCulling = false;
    body.material = cm;
    body.parent = cylinder;

    piston = B().MeshBuilder.CreateCylinder('piston',
      { height: 0.7, diameter: 2.75, tessellation: 28 }, scene);
    piston.material = mat('pistonMat', '#4a5462', '#dfe6ee', 64);
    piston.parent = cylinder;

    const rod = B().MeshBuilder.CreateCylinder('rod', { height: 3.0, diameter: 0.36 }, scene);
    rod.material = mat('rodMat', '#c3cad3', '#ffffff', 96);
    rod.parent = cylinder;
    cylinder._rod = rod;

    // 플라이휠 (일을 받아 돌아간다)
    wheel = B().MeshBuilder.CreateTorus('flywheel',
      { diameter: 3.4, thickness: 0.5, tessellation: 28 }, scene);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, 8.4, 0);
    wheel.material = mat('wheelMat', '#4ad8a0', '#d8fff0', 64);
    wheel.parent = cylinder;

    for (let i = 0; i < 4; i++) {
      const spoke = B().MeshBuilder.CreateBox('spoke' + i, { width: 3.2, height: 0.16, depth: 0.16 }, scene);
      spoke.rotation.z = (i * Math.PI) / 4;
      spoke.position.set(0, 8.4, 0);
      spoke.material = mat('spokeMat' + i, '#39424f');
      spoke.parent = cylinder;
      if (!cylinder._spokes) cylinder._spokes = [];
      cylinder._spokes.push(spoke);
    }
  }

  /** 열의 흐름을 보여 주는 화살표 */
  let flowLines = null;
  function drawFlow() {
    if (flowLines) { flowLines.dispose(); flowLines = null; }
    if (!placed.hot || !placed.engine || !placed.cold) return;
    const V = (x, y) => new (B().Vector3)(x, y, 0);
    flowLines = B().MeshBuilder.CreateLineSystem('flow', {
      lines: [
        [V(-5.6, 3.2), V(-1.6, 3.2)],       // Q1 : 고열원 → 기관
        [V(1.6, 3.2), V(5.6, 3.2)],         // Q2 : 기관 → 저열원
      ],
    }, scene);
    flowLines.color = B().Color3.FromHexString('#ffb03a');
    flowLines.isPickable = false;
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    Object.entries(slots).forEach(([id, s]) => {
      const p = B().MeshBuilder.CreatePlane('ph_' + id, { width: 5.0, height: 6.0 }, scene);
      p.position.set(s.x, 3.0, 0.6);
      p.rotation.y = Math.PI;
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 200, height: 240 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 200, 240);
      ctx.translate(200, 0); ctx.scale(-1, 1);
      ctx.strokeStyle = '#5aa9ff'; ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(7, 7, 186, 226);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8fd0ff';
      ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.name, 100, 120);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    state.running = false; cycles = 0; phase = 0;
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    hotBlock.setEnabled(!!placed.hot);
    coldBlock.setEnabled(!!placed.cold);
    cylinder.setEnabled(!!placed.engine);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    return Math.abs(point.x - slots[id].x) <= 4.0 ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;
    const en = energies();

    if (placed.hot) drawReservoir(hotBlock, state.T1, state.Q1, 'Q₁', '#ff7a5a');
    if (placed.cold) drawReservoir(coldBlock, state.T2, en.Q2, 'Q₂', '#6aa8ff');

    // 열원 색을 온도에 맞춘다
    if (placed.hot) {
      const h = Math.min(1, (state.T1 - 350) / 550);
      hotBlock.getChildMeshes()[0].material.diffuseColor =
        new (B().Color3)(0.55 + h * 0.4, 0.18 + h * 0.22, 0.14);
    }
    if (placed.cold) {
      const c = Math.min(1, (state.T2 - 250) / 250);
      coldBlock.getChildMeshes()[0].material.diffuseColor =
        new (B().Color3)(0.12 + c * 0.25, 0.34 + c * 0.2, 0.72);
    }

    // 플라이휠 색 — 효율이 높을수록 밝게
    if (wheel) {
      const g = 0.25 + en.e * 1.4;
      wheel.material.emissiveColor = new (B().Color3)(0, Math.min(0.8, g) * 0.6, Math.min(0.8, g) * 0.4);
    }
    drawFlow();
    layoutPiston();
  }

  function layoutPiston() {
    const stroke = Math.sin(phase) * 1.4;
    piston.position.y = 2.0 + stroke;
    cylinder._rod.position.y = 5.4 + stroke;
    if (cylinder._spokes) cylinder._spokes.forEach((s, i) => { s.rotation.z = phase + (i * Math.PI) / 4; });
  }

  function tick(dt) {
    if (!state.running) return false;
    // 효율이 높을수록 빠르게 돈다
    phase += dt * (1.6 + efficiency() * 6);
    if (phase > Math.PI * 2) { phase -= Math.PI * 2; cycles += 1; }
    layoutPiston();
    return true;
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.05;
    camera.beta = 1.16;
    camera.radius = 26;
    camera.setTarget(new (B().Vector3)(0, 2.0, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '두 열원의 온도와 공급 열량을 바꾸며 <b>열효율</b>이 어떻게 달라지는지 보세요. 100 % 가 될 수 있을까요?';
  const prepGuide = '점선으로 표시된 자리에 고열원·열기관·저열원을 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    return `
      ${LabUI.slider('T1', '고열원<br>온도 <i>T</i>₁',
        { min: 350, max: 900, step: 10, value: state.T1, fmt: (v) => `${v} K` })}
      ${LabUI.slider('T2', '저열원<br>온도 <i>T</i>₂',
        { min: 250, max: 500, step: 10, value: state.T2, fmt: (v) => `${v} K` })}
      ${LabUI.slider('Q1', '공급 열량<br><i>Q</i>₁',
        { min: 200, max: 2000, step: 50, value: state.Q1, fmt: (v) => `${v} J` })}
      ${LabUI.slider('quality', '기관의<br>완성도',
        { min: 0.2, max: 1.0, step: 0.05, value: state.quality, fmt: (v) => `${(v * 100).toFixed(0)} %` })}
      <div class="control">
        <div class="clabel">기관<br>가동</div>
        <button class="power${state.running ? ' run' : ' off'}" id="runBtn">${state.running ? '가동 중' : '▶ 가동'}</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    const clampT = () => {
      // 저열원이 고열원보다 뜨거울 수는 없다
      if (state.T2 >= state.T1) {
        state.T2 = state.T1 - 10;
        const el = root.querySelector('#T2');
        el.value = state.T2;
        root.querySelector('#T2Out').textContent = `${state.T2} K`;
      }
    };
    LabUI.bindSlider(root, 'T1', state, 'T1', (v) => `${v} K`, () => { clampT(); onChange(); });
    LabUI.bindSlider(root, 'T2', state, 'T2', (v) => `${v} K`, () => { clampT(); onChange(); });
    LabUI.bindSlider(root, 'Q1', state, 'Q1', (v) => `${v} J`, onChange);
    LabUI.bindSlider(root, 'quality', state, 'quality', (v) => `${(v * 100).toFixed(0)} %`, onChange);

    const run = root.querySelector('#runBtn');
    run.addEventListener('click', () => {
      state.running = !state.running;
      run.textContent = state.running ? '가동 중' : '▶ 가동';
      run.classList.toggle('run', state.running);
      run.classList.toggle('off', !state.running);
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const en = energies();
    const cMax = carnot();
    return `
      <div class="row"><span>고열원 <i>T</i>₁</span><b>${state.T1} K</b></div>
      <div class="row"><span>저열원 <i>T</i>₂</span><b>${state.T2} K</b></div>

      <div class="sec">한 순환에서</div>
      <div class="row"><span>흡수한 열 <i>Q</i>₁</span><b style="color:#e8663f">${state.Q1} J</b></div>
      <div class="row"><span>한 일 <i>W</i></span><b style="color:#4ad8a0">${en.W.toFixed(0)} J</b></div>
      <div class="row"><span>버린 열 <i>Q</i>₂</span><b style="color:#5ad0f0">${en.Q2.toFixed(0)} J</b></div>

      <div class="sec">효율</div>
      <div class="row"><span>실제 열효율 <i>e</i></span>
        <b class="big">${(en.e * 100).toFixed(1)} %</b></div>
      <div class="row"><span>카르노 한계</span><b>${(cMax * 100).toFixed(1)} %</b></div>
      <div class="row"><span>100 % 가능?</span><span class="tag mid">불가능</span></div>
      <div class="formula"><i>e</i> = <i>W</i>/<i>Q</i>₁ = 1 − <i>Q</i>₂/<i>Q</i>₁</div>
      <div class="formula">카르노 <i>e</i><sub>max</sub> = 1 − <i>T</i>₂/<i>T</i>₁</div>
      <div class="formula" style="color:#62718a">순환 횟수 ${cycles} 회</div>`;
  }

  /* ══ 그래프 — 에너지 흐름도 ═════════════════ */
  const graphTitle = '열기관의 에너지 흐름';

  function drawGraph(ctx, W, H) {
    const en = energies();
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const topY = 34, botY = H - 46;
    const barH = botY - topY;
    const x0 = 34, bw = 46;

    // 왼쪽 : 흡수한 열 Q1 (전체)
    ctx.fillStyle = '#e8663f';
    ctx.fillRect(x0, topY, bw, barH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${state.Q1}`, x0 + bw / 2, topY + barH / 2);

    // 오른쪽 : W 와 Q2 로 나뉜다
    const x1 = W - 34 - bw;
    const wH = barH * en.e;
    ctx.fillStyle = '#4ad8a0';
    ctx.fillRect(x1, topY, bw, wH);
    ctx.fillStyle = '#5ad0f0';
    ctx.fillRect(x1, topY + wH, bw, barH - wH);

    ctx.fillStyle = '#0f141b';
    if (wH > 15) ctx.fillText(`${en.W.toFixed(0)}`, x1 + bw / 2, topY + wH / 2);
    if (barH - wH > 15) ctx.fillText(`${en.Q2.toFixed(0)}`, x1 + bw / 2, topY + wH + (barH - wH) / 2);

    // 흐름 표시
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0 + bw, topY + 6); ctx.lineTo(x1, topY + 6);
    ctx.moveTo(x0 + bw, botY - 6); ctx.lineTo(x1, botY - 6);
    ctx.stroke();

    // 라벨
    ctx.fillStyle = '#cfe0f2';
    ctx.font = 'bold 11px "Noto Sans KR", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('흡수 Q₁', x0 + bw / 2, topY - 6);
    ctx.fillText('사용처', x1 + bw / 2, topY - 6);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#e8663f'; ctx.fillText(`${state.T1} K`, x0 + bw / 2, botY + 6);
    ctx.fillStyle = '#5ad0f0'; ctx.fillText(`${state.T2} K`, x1 + bw / 2, botY + 6);

    // 가운데 범례
    const cx = W / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#4ad8a0';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`일 W = ${en.W.toFixed(0)} J`, cx, topY + barH * 0.32);
    ctx.fillStyle = '#5ad0f0';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`버리는 열 Q₂ = ${en.Q2.toFixed(0)} J`, cx, topY + barH * 0.58);
    ctx.fillStyle = '#ffd84a';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`효율 ${(en.e * 100).toFixed(1)} %`, cx, topY + barH * 0.84);
  }

  function graphFootHTML() {
    const en = energies();
    const c = carnot();
    return `카르노 한계 <b>${(c * 100).toFixed(1)} %</b> 를 넘을 수 없습니다 ·
      <i>T</i>₂ 를 0 K 로 만들 수 없으므로 <b>효율 100 % 인 열기관(영구 기관)은 불가능</b>합니다`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '<i>T</i>₁ (K)', '<i>T</i>₂ (K)', '<i>Q</i>₁ (J)', '<i>W</i> (J)', '<i>Q</i>₂ (J)',
    '효율 (%)', '카르노 한계 (%)',
  ];

  function recordRow() {
    const en = energies();
    return [
      String(state.T1), String(state.T2), String(state.Q1),
      en.W.toFixed(0), en.Q2.toFixed(0),
      (en.e * 100).toFixed(1), (carnot() * 100).toFixed(1),
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 기관 작동 · 1 효율 40% 이상 · 2 고열원 온도 2가지 기록
     3 저열원 온도 2가지 기록 · 4 기록 4줄                                 */
  const mis = { ran: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);
  const uniq = (col) => new Set(recs().map((r) => String(r[col]))).size;

  function missionDone(i) {
    if (state.running) mis.ran = true;
    if (i === 0) return mis.ran;
    if (i === 1) return energies().e >= 0.4;
    if (i === 2) return uniq(0) >= 2;
    if (i === 3) return uniq(1) >= 2;
    if (i === 4) return recs().length >= 4;
    return false;
  }

  return {
    missionDone,
    id: 'engine',
    title: '열기관과 열효율',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, carnot, efficiency, energies,
    get scene() { return scene; },
  };
})();
