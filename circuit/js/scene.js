/**
 * 저항의 직렬연결과 병렬연결에서 전류와 전압 측정하여 비교하기
 * 비상교육 고등 물리학 II-1-02 (교과서 76~81쪽), 핵심 탐구 77쪽
 *
 * 회로는 3D 로 보여 주기보다 회로도가 훨씬 읽기 쉬우므로,
 * 3D 장면에는 실험대 위 실물(전지·저항·계기)을 놓고,
 * 그래프 자리에는 실제 회로도를 그려 전류의 갈래와 전압 분배가 보이게 했다.
 */
const CircuitScene = (() => {
  const B = () => BABYLON;

  const TABLE_Y = 0;

  let scene, camera;
  let battery, resA, resB, ammeter, voltmeter, wires, switchG;
  let placed = {};

  const state = {
    emf: 6,          // 전지 전압 (V)
    rA: 10,          // 저항 A (Ω)
    rB: 20,          // 저항 B (Ω)
    mode: 'series',  // series | parallel
    closed: false,   // 스위치
  };

  const tools = [
    { id: 'battery', label: '전지', icon: 'battery' },
    { id: 'resistors', label: '저항 2개', icon: 'resistor' },
    { id: 'meters', label: '전류계 · 전압계', icon: 'ammeter' },
    { id: 'wires', label: '전선 · 스위치', icon: 'wire' },
  ];

  const slots = {
    battery: { x: 0, z: 3.6, r: 3.4, name: '전지' },
    resistors: { x: 0, z: -2.6, r: 5.2, name: '저항' },
    meters: { x: -6.5, z: 0.4, r: 4.2, name: '계기' },
    wires: { x: 0, z: 0, r: 9.5, name: '전선' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 회로 계산. 전지 내부 저항은 무시한다(교과서 수준). */
  function solve() {
    const { emf, rA, rB, mode } = state;
    if (!state.closed) {
      return { Rt: mode === 'series' ? rA + rB : (rA * rB) / (rA + rB),
        It: 0, iA: 0, iB: 0, vA: 0, vB: 0, pA: 0, pB: 0, pt: 0 };
    }
    if (mode === 'series') {
      const Rt = rA + rB;
      const It = emf / Rt;
      return {
        Rt, It, iA: It, iB: It,
        vA: It * rA, vB: It * rB,
        pA: It * It * rA, pB: It * It * rB, pt: emf * It,
      };
    }
    const Rt = (rA * rB) / (rA + rB);
    const iA = emf / rA, iB = emf / rB;
    return {
      Rt, It: iA + iB, iA, iB,
      vA: emf, vB: emf,
      pA: emf * iA, pB: emf * iB, pt: emf * (iA + iB),
    };
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c9dff2ff');

    camera = new (B().ArcRotateCamera)(
      'camCir', -Math.PI / 2 + 0.12, 0.72, 22, new (B().Vector3)(0, 0.6, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 11;
    camera.upperRadiusLimit = 42;
    camera.upperBetaLimit = 1.42;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hci', new (B().Vector3)(-0.2, 1, -0.3), scene);
    hemi.intensity = 0.9;
    hemi.groundColor = new (B().Color3)(0.45, 0.48, 0.53);

    const dir = new (B().DirectionalLight)('dci', new (B().Vector3)(-0.4, -1, 0.4), scene);
    dir.position = new (B().Vector3)(8, 16, -8);
    dir.intensity = 0.38;

    buildTable();
    buildBattery();
    resA = buildResistor('A', -3.4, '#e8a14a');
    resB = buildResistor('B', 3.4, '#e8a14a');
    buildMeters();
    buildWires();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/circuit.jpg', { x: -8, y: 0, z: 5, ry: 0.3 });

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
    const t = B().MeshBuilder.CreateBox('ciTable', { width: 30, height: 0.5, depth: 20 }, scene);
    t.position.set(0, TABLE_Y - 0.26, 0);
    t.material = mat('ciTableMat', '#b9c1ca', '#e2e7ec', 90);
  }

  function buildBattery() {
    battery = new (B().TransformNode)('batteryGroup', scene);
    const holder = B().MeshBuilder.CreateBox('batHolder', { width: 5.4, height: 0.45, depth: 2.2 }, scene);
    holder.position.set(0, TABLE_Y + 0.22, 3.6);
    holder.material = mat('batHolderMat', '#4a5462');
    holder.parent = battery;

    [-1.2, 1.2].forEach((dx, i) => {
      const cell = B().MeshBuilder.CreateCylinder('cell' + i, { height: 2.2, diameter: 1.0 }, scene);
      cell.rotation.z = Math.PI / 2;
      cell.position.set(dx, TABLE_Y + 0.72, 3.6);
      cell.material = mat('cellMat' + i, '#d8c070', '#fff4c8', 64);
      cell.parent = battery;

      const cap = B().MeshBuilder.CreateCylinder('cap' + i, { height: 0.2, diameter: 0.55 }, scene);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(dx + 1.2, TABLE_Y + 0.72, 3.6);
      cap.material = mat('capMat' + i, '#9aa4b0');
      cap.parent = battery;
    });
  }

  function buildResistor(name, x, hex) {
    const g = new (B().TransformNode)('res' + name, scene);
    const base = B().MeshBuilder.CreateBox('resBase' + name, { width: 4.2, height: 0.7, depth: 2.6 }, scene);
    base.position.set(x, TABLE_Y + 0.35, -2.6);
    base.material = mat('resBaseMat' + name, hex, '#fff0d0', 40);
    base.parent = g;

    // 저항 이름표
    const label = B().MeshBuilder.CreatePlane('resLab' + name, { width: 2.2, height: 1.1 }, scene);
    label.position.set(x, TABLE_Y + 0.71, -2.6);
    label.rotation.x = Math.PI / 2;
    const tex = new (B().DynamicTexture)('resLabTex' + name, { width: 220, height: 110 }, scene, true);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 220, 110);
    ctx.fillStyle = '#3a2a12';
    ctx.font = 'bold 62px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, 110, 60);
    tex.hasAlpha = true; tex.update();
    const lm = new (B().StandardMaterial)('resLabMat' + name, scene);
    lm.diffuseTexture = tex; lm.opacityTexture = tex;
    lm.emissiveColor = new (B().Color3)(0.9, 0.9, 0.9);
    lm.specularColor = new (B().Color3)(0, 0, 0);
    lm.backFaceCulling = false;
    label.material = lm;
    label.parent = g;

    // 단자
    const tm = mat('termMat' + name, '#20262f');
    [-1.7, 1.7].forEach((dx, i) => {
      const t = B().MeshBuilder.CreateCylinder('term' + name + i, { height: 0.5, diameter: 0.45 }, scene);
      t.position.set(x + dx, TABLE_Y + 0.9, -2.6);
      t.material = tm;
      t.parent = g;
    });

    g._base = base;
    return g;
  }

  /** 계기 하나. 화면에 숫자를 실시간으로 찍는다. */
  function buildMeter(name, x, z, kind) {
    const g = new (B().TransformNode)(name, scene);
    const body = B().MeshBuilder.CreateBox(name + 'B', { width: 3.6, height: 1.4, depth: 3.0 }, scene);
    body.position.set(x, TABLE_Y + 0.7, z);
    body.material = mat(name + 'BM', '#e6ebf2', '#ffffff', 70);
    body.parent = g;

    const screen = B().MeshBuilder.CreatePlane(name + 'S', { width: 2.7, height: 1.5 }, scene);
    screen.position.set(x, TABLE_Y + 1.41, z - 0.2);
    screen.rotation.x = Math.PI / 2;
    const tex = new (B().DynamicTexture)(name + 'T', { width: 270, height: 150 }, scene, true);
    const sm = new (B().StandardMaterial)(name + 'SM', scene);
    sm.diffuseTexture = tex;
    sm.emissiveTexture = tex;
    sm.emissiveColor = new (B().Color3)(0.7, 0.7, 0.7);
    sm.specularColor = new (B().Color3)(0, 0, 0);
    sm.backFaceCulling = false;
    screen.material = sm;
    screen.parent = g;

    g._tex = tex;
    g._kind = kind;
    return g;
  }

  function buildMeters() {
    ammeter = buildMeter('ammeter', -6.6, 0.6, 'A');
    voltmeter = buildMeter('voltmeter', 6.6, 0.6, 'V');
  }

  function drawMeter(g, value, unit, label) {
    const ctx = g._tex.getContext();
    ctx.fillStyle = '#1a2029';
    ctx.fillRect(0, 0, 270, 150);
    ctx.fillStyle = '#2b3440';
    ctx.fillRect(10, 10, 250, 84);
    ctx.fillStyle = '#5ef0a0';
    ctx.font = 'bold 56px "Menlo", monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(value, 214, 54);
    ctx.fillStyle = '#9fb0c2';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(unit, 254, 58);
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px "Noto Sans KR", sans-serif';
    ctx.fillStyle = '#cfe0f2';
    ctx.fillText(label, 135, 122);
    g._tex.update();
  }

  /** 전선. 연결 방식이 바뀌면 다시 그린다. */
  function buildWires() {
    wires = new (B().TransformNode)('wireGroup', scene);
    switchG = new (B().TransformNode)('switchGroup', scene);

    const base = B().MeshBuilder.CreateBox('swBase', { width: 2.2, height: 0.4, depth: 1.4 }, scene);
    base.position.set(0, TABLE_Y + 0.2, 6.4);
    base.material = mat('swBaseMat', '#c8d2de');
    base.parent = switchG;

    const lever = B().MeshBuilder.CreateBox('swLever', { width: 1.8, height: 0.16, depth: 0.3 }, scene);
    lever.position.set(0, TABLE_Y + 0.5, 6.4);
    lever.material = mat('swLeverMat', '#d0453a');
    lever.parent = switchG;
    switchG._lever = lever;
  }

  /** 실물 배선을 굵은 선으로 잇는다 */
  let wireLines = null;
  function drawWires() {
    if (wireLines) { wireLines.dispose(); wireLines = null; }
    if (!placed.wires) return;

    const y = TABLE_Y + 0.9;
    const V = (x, z) => new (B().Vector3)(x, y, z);
    const lines = [];

    if (state.mode === 'series') {
      // 전지 → 전류계 → A → B → 전지 (한 줄)
      lines.push([V(-2.6, 3.6), V(-8.4, 3.6), V(-8.4, 0.6), V(-6.6, 0.6)]);
      lines.push([V(-6.6, 0.6), V(-6.6, -2.6), V(-5.1, -2.6)]);
      lines.push([V(-1.7, -2.6), V(1.7, -2.6)]);
      lines.push([V(5.1, -2.6), V(8.4, -2.6), V(8.4, 3.6), V(2.6, 3.6)]);
      // 전압계는 A 에 병렬로
      lines.push([V(-5.1, -2.6), V(-5.1, -5.0), V(6.6, -5.0), V(6.6, 0.6)]);
      lines.push([V(-1.7, -2.6), V(-1.7, -4.2), V(5.4, -4.2), V(5.4, 0.6), V(6.6, 0.6)]);
    } else {
      // 전지 → 전류계 → 두 갈래(A, B) → 전지
      lines.push([V(-2.6, 3.6), V(-8.4, 3.6), V(-8.4, 0.6), V(-6.6, 0.6)]);
      lines.push([V(-6.6, 0.6), V(-6.6, -2.6), V(-5.1, -2.6)]);
      lines.push([V(-6.6, -2.6), V(-6.6, -6.2), V(1.7, -6.2), V(1.7, -2.6)]);
      lines.push([V(-1.7, -2.6), V(-1.7, -7.4), V(8.4, -7.4), V(8.4, 3.6), V(2.6, 3.6)]);
      lines.push([V(5.1, -2.6), V(8.4, -2.6)]);
      // 전압계는 두 저항에 함께 병렬
      lines.push([V(-5.1, -2.6), V(-5.1, -5.0), V(6.6, -5.0), V(6.6, 0.6)]);
      lines.push([V(-1.7, -2.6), V(-1.7, -4.2), V(5.4, -4.2), V(5.4, 0.6), V(6.6, 0.6)]);
    }

    wireLines = B().MeshBuilder.CreateLineSystem('wires', { lines }, scene);
    wireLines.color = B().Color3.FromHexString(state.closed ? '#d0453a' : '#7c8794');
    wireLines.isPickable = false;
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      battery: { x: 0, z: 3.6, w: 6.0, h: 2.8, label: '전지' },
      resistors: { x: 0, z: -2.6, w: 11.0, h: 3.2, label: '저항 A · B' },
      meters: { x: 0, z: 0.6, w: 17.5, h: 3.6, label: '전류계 · 전압계' },
      wires: { x: 0, z: -5.6, w: 19, h: 4.0, label: '전선 · 스위치' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, TABLE_Y + 0.05, c.z);
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 512, height: 128 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 512, 128);
      ctx.strokeStyle = '#2f6ad0'; ctx.lineWidth = 6;
      ctx.setLineDash([18, 12]);
      ctx.strokeRect(8, 8, 496, 112);
      ctx.setLineDash([]);
      ctx.fillStyle = '#2f6ad0';
      ctx.font = 'bold 44px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 256, 68);
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
    state.closed = false;
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    battery.setEnabled(!!placed.battery);
    resA.setEnabled(!!placed.resistors);
    resB.setEnabled(!!placed.resistors);
    ammeter.setEnabled(!!placed.meters);
    voltmeter.setEnabled(!!placed.meters);
    switchG.setEnabled(!!placed.wires);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const s = slots[id];
    return (Math.abs(point.x - s.x) <= s.r + 3 && Math.abs(point.z - s.z) <= 3.2) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;
    const r = solve();

    // 저항값에 따라 색을 조금 달리해 크기 차이를 보이게 한다
    if (resA._base) resA._base.scaling.x = 0.7 + state.rA / 60;
    if (resB._base) resB._base.scaling.x = 0.7 + state.rB / 60;

    if (placed.meters) {
      drawMeter(ammeter, r.It.toFixed(2), 'A', '전체 전류');
      drawMeter(voltmeter, (state.mode === 'series' ? r.vA : r.vA).toFixed(2), 'V',
        state.mode === 'series' ? '저항 A 전압' : '두 저항 전압');
    }

    if (switchG._lever) {
      switchG._lever.rotation.z = state.closed ? 0 : -0.55;
      switchG._lever.material.diffuseColor =
        B().Color3.FromHexString(state.closed ? '#2f9e6b' : '#d0453a');
    }

    drawWires();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.12;
    camera.beta = 0.72;
    camera.radius = 22;
    camera.setTarget(new (B().Vector3)(0, 0.6, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '스위치를 닫고 연결 방법을 바꿔 가며, 각 저항과 회로 전체에 흐르는 전류와 전압이 어떻게 달라지는지 비교해 보세요.';
  const prepGuide = '점선으로 표시된 자리에 전지·저항·계기·전선을 끌어다 놓아 회로를 준비하세요.';

  function controlsHTML() {
    return `
      ${LabUI.opts('연결 방법', 'mode', [
        { v: 'series', t: '직렬연결' },
        { v: 'parallel', t: '병렬연결' },
      ], state.mode, 1)}
      ${LabUI.slider('emf', '전지 전압<br><i>V</i>',
        { min: 1.5, max: 12, step: 0.5, value: state.emf, fmt: (v) => `${v.toFixed(1)} V` })}
      ${LabUI.slider('rA', '저항 A<br><i>R</i><sub>A</sub>',
        { min: 5, max: 50, step: 1, value: state.rA, fmt: (v) => `${v} Ω` })}
      ${LabUI.slider('rB', '저항 B<br><i>R</i><sub>B</sub>',
        { min: 5, max: 50, step: 1, value: state.rB, fmt: (v) => `${v} Ω` })}
      <div class="control">
        <div class="clabel">스위치</div>
        <button class="power${state.closed ? ' run' : ' off'}" id="swBtn">${state.closed ? '닫힘' : '열림'}</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    LabUI.bindOpts(root, 'mode', state, 'mode', onChange, String);
    LabUI.bindSlider(root, 'emf', state, 'emf', (v) => `${v.toFixed(1)} V`, onChange);
    LabUI.bindSlider(root, 'rA', state, 'rA', (v) => `${v} Ω`, onChange);
    LabUI.bindSlider(root, 'rB', state, 'rB', (v) => `${v} Ω`, onChange);

    const sw = root.querySelector('#swBtn');
    sw.addEventListener('click', () => {
      state.closed = !state.closed;
      sw.textContent = state.closed ? '닫힘' : '열림';
      sw.classList.toggle('run', state.closed);
      sw.classList.toggle('off', !state.closed);
      onChange();
    });
  }

  /* ══ 측정값 (교과서 77쪽 표) ════════════════ */
  function readoutHTML() {
    const r = solve();
    const ser = state.mode === 'series';
    return `
      <div class="row"><span>연결 방법</span>
        <span class="tag ${ser ? 'con' : 'des'}">${ser ? '직렬연결' : '병렬연결'}</span></div>
      <div class="row"><span>합성 저항 <i>R</i></span><b>${r.Rt.toFixed(2)} Ω</b></div>

      <div class="sec">저항 A (${state.rA} Ω)</div>
      <div class="row"><span>전류 <i>I</i><sub>A</sub></span><b>${r.iA.toFixed(3)} A</b></div>
      <div class="row"><span>전압 <i>V</i><sub>A</sub></span><b>${r.vA.toFixed(2)} V</b></div>

      <div class="sec">저항 B (${state.rB} Ω)</div>
      <div class="row"><span>전류 <i>I</i><sub>B</sub></span><b>${r.iB.toFixed(3)} A</b></div>
      <div class="row"><span>전압 <i>V</i><sub>B</sub></span><b>${r.vB.toFixed(2)} V</b></div>

      <div class="sec">회로 전체</div>
      <div class="row"><span>전류 <i>I</i></span><b class="big">${r.It.toFixed(3)} A</b></div>
      <div class="row"><span>전압 <i>V</i></span><b>${state.closed ? state.emf.toFixed(2) : '0.00'} V</b></div>
      <div class="row"><span>소비 전력 <i>P</i></span><b>${r.pt.toFixed(2)} W</b></div>
      <div class="formula">${ser
        ? '직렬 : 전류가 같고 전압이 나뉜다 · <i>R</i> = <i>R</i><sub>A</sub> + <i>R</i><sub>B</sub>'
        : '병렬 : 전압이 같고 전류가 나뉜다 · 1/<i>R</i> = 1/<i>R</i><sub>A</sub> + 1/<i>R</i><sub>B</sub>'}</div>`;
  }

  /* ══ 회로도 ═════════════════════════════════ */
  const graphTitle = '회로도와 전류의 흐름';

  function drawGraph(ctx, W, H) {
    const r = solve();
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const on = state.closed;
    const wire = on ? '#e8663f' : '#5b6675';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = wire;
    ctx.lineCap = 'round';

    const L = 40, R = W - 40, T = 42, Bm = H - 34;

    /** 저항 기호 (지그재그 상자) */
    const resistor = (x, y, w, h, label, hot) => {
      ctx.fillStyle = hot ? '#3a2a18' : '#20262f';
      ctx.fillRect(x, y - h / 2, w, h);
      ctx.strokeStyle = '#e8a14a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y - h / 2, w, h);
      ctx.fillStyle = '#f0c98a';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y);
      ctx.strokeStyle = wire;
      ctx.lineWidth = 2.4;
    };

    const path = (pts) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    };

    // 전지 기호
    const battY = Bm;
    const bx = (L + R) / 2;
    ctx.strokeStyle = wire;
    path([[L, battY], [bx - 12, battY]]);
    path([[bx + 12, battY], [R, battY]]);
    ctx.strokeStyle = '#cfe0f2'; ctx.lineWidth = 3;
    path([[bx - 8, battY - 11], [bx - 8, battY + 11]]);
    ctx.lineWidth = 2;
    path([[bx + 4, battY - 6], [bx + 4, battY + 6]]);
    ctx.fillStyle = '#9fb0c2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`${state.emf.toFixed(1)} V`, bx, battY + 12);
    ctx.strokeStyle = wire; ctx.lineWidth = 2.4;

    if (state.mode === 'series') {
      // 한 줄에 A, B 를 차례로
      path([[L, battY], [L, T], [L + 40, T]]);
      resistor(L + 40, T, 74, 22, `A ${state.rA}Ω`, on);
      path([[L + 114, T], [R - 114, T]]);
      resistor(R - 114, T, 74, 22, `B ${state.rB}Ω`, on);
      path([[R - 40, T], [R, T], [R, battY]]);

      ctx.fillStyle = on ? '#ffd84a' : '#6b7686';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`I = ${r.It.toFixed(3)} A (어디서나 같음)`, W / 2, T - 14);
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#9fb0c2';
      ctx.fillText(`${r.vA.toFixed(2)} V`, L + 77, T + 15);
      ctx.fillText(`${r.vB.toFixed(2)} V`, R - 77, T + 15);
    } else {
      // 두 갈래
      const midY = (T + Bm) / 2 - 12;
      path([[L, battY], [L, T]]);
      path([[R, battY], [R, T]]);
      // 위 갈래 (A)
      path([[L, T], [L + 60, T]]);
      resistor(L + 60, T, 78, 22, `A ${state.rA}Ω`, on);
      path([[L + 138, T], [R, T]]);
      // 아래 갈래 (B)
      path([[L, midY], [L + 60, midY]]);
      resistor(L + 60, midY, 78, 22, `B ${state.rB}Ω`, on);
      path([[L + 138, midY], [R, midY]]);

      ctx.fillStyle = on ? '#ffd84a' : '#6b7686';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`I(A) = ${r.iA.toFixed(3)} A`, L + 62, T - 14);
      ctx.fillText(`I(B) = ${r.iB.toFixed(3)} A`, L + 62, midY - 14);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#9fb0c2';
      ctx.fillText(`두 저항 모두 ${r.vA.toFixed(2)} V`, W / 2, Bm - 26);
    }

    // 스위치
    ctx.strokeStyle = wire;
    ctx.lineWidth = 2.4;
    const sx = L + 26;
    ctx.beginPath();
    ctx.moveTo(sx, battY);
    ctx.lineTo(sx + 18, on ? battY : battY - 12);
    ctx.stroke();
    ctx.fillStyle = wire;
    ctx.beginPath(); ctx.arc(sx, battY, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 18, battY, 3, 0, 7); ctx.fill();

    if (!on) {
      ctx.fillStyle = '#8e9bad';
      ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('스위치를 닫으면 전류가 흐릅니다', W / 2, (T + Bm) / 2 + 22);
    }
  }

  function graphFootHTML() {
    const r = solve();
    return state.mode === 'series'
      ? `직렬 : <i>R</i> = ${state.rA} + ${state.rB} = <b>${r.Rt.toFixed(0)} Ω</b> ·
         전압이 저항에 비례해 나뉩니다`
      : `병렬 : <i>R</i> = <b>${r.Rt.toFixed(2)} Ω</b> (가장 작은 저항보다 작음) ·
         전류가 저항에 반비례해 나뉩니다`;
  }

  /* ══ 기록표 (교과서 77쪽 표) ════════════════ */
  const recordColumns = [
    '연결', '구분', '전류 (A)', '전압 (V)', '소비 전력 (W)',
  ];

  /** 교과서 표처럼 «저항 A · 저항 B · 회로 전체» 세 줄을 한 번에 남긴다 */
  function recordRow() {
    if (!state.closed) return null;
    const r = solve();
    const label = state.mode === 'series' ? '직렬' : '병렬';
    return [
      [label, `저항 A (${state.rA} Ω)`, r.iA.toFixed(3), r.vA.toFixed(2), r.pA.toFixed(2)],
      [label, `저항 B (${state.rB} Ω)`, r.iB.toFixed(3), r.vB.toFixed(2), r.pB.toFixed(2)],
      [label, `회로 전체 (${r.Rt.toFixed(1)} Ω)`, r.It.toFixed(3), state.emf.toFixed(2), r.pt.toFixed(2)],
    ];
  }

  return {
    id: 'circuit',
    title: '저항의 직렬연결과 병렬연결 비교하기',
    guide, prepGuide, tools,
    create, update, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, solve,
    get scene() { return scene; },
  };
})();
