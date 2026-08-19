/**
 * 전기장과 전위차
 * 비상교육 고등 물리학 II-1-01 (교과서 72~75쪽), 해 보기 72쪽 「전기력 관찰하기」
 *
 * 두 점전하를 놓고 전기력선과 전기장을 관찰한다.
 * 시험 전하를 옮기면 받는 힘과 그 지점의 전기장·전위를 바로 읽을 수 있다.
 */
const EFieldScene = (() => {
  const B = () => BABYLON;

  const K = 9e9;            // 쿨롱 상수
  const U = 4;              // 1 m = 4 unit (전하 사이 거리는 cm 단위로 다룬다)
  const PLANE_Y = 0.05;

  let scene, camera;
  let chargeA, chargeB, testCharge, fieldPlane, fieldTex;
  let forceLine = null;
  let placed = {};

  const state = {
    qA: 2,        // μC
    qB: -2,       // μC
    sep: 1.6,     // 두 전하 사이의 거리 (m)
    testX: 0,     // 시험 전하 위치 (m)
    testZ: 0.9,
    showLines: true,
  };

  const FIELD_N = 200;

  const tools = [
    { id: 'chargeA', label: '전하 A', icon: 'ball' },
    { id: 'chargeB', label: '전하 B', icon: 'ball' },
    { id: 'test', label: '시험 전하 · 검전기', icon: 'sensor' },
  ];

  const slots = {
    chargeA: { x: -0.8, name: '전하 A' },
    chargeB: { x: 0.8, name: '전하 B' },
    test: { x: 0, name: '시험 전하' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  function posA() { return { x: -state.sep / 2, z: 0 }; }
  function posB() { return { x: state.sep / 2, z: 0 }; }

  /** 한 점에서의 전기장 벡터 (N/C) */
  function fieldAt(x, z) {
    let ex = 0, ez = 0;
    [[posA(), state.qA], [posB(), state.qB]].forEach(([p, q]) => {
      const dx = x - p.x, dz = z - p.z;
      const r2 = dx * dx + dz * dz;
      if (r2 < 1e-6) return;
      const r = Math.sqrt(r2);
      const e = K * (q * 1e-6) / r2;      // μC → C
      ex += e * dx / r;
      ez += e * dz / r;
    });
    return { ex, ez, mag: Math.hypot(ex, ez) };
  }

  /** 한 점에서의 전위 (V) */
  function potentialAt(x, z) {
    let v = 0;
    [[posA(), state.qA], [posB(), state.qB]].forEach(([p, q]) => {
      const r = Math.hypot(x - p.x, z - p.z);
      if (r < 1e-3) return;
      v += K * (q * 1e-6) / r;
    });
    return v;
  }

  /** 시험 전하(+1 nC)가 받는 힘 */
  const Q_TEST = 1e-9;
  function forceOnTest() {
    const f = fieldAt(state.testX, state.testZ);
    return { fx: f.ex * Q_TEST, fz: f.ez * Q_TEST, mag: f.mag * Q_TEST, field: f };
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#101822ff');

    camera = new (B().ArcRotateCamera)(
      'camEf', -Math.PI / 2, 0.62, 17, new (B().Vector3)(0, 0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 34;
    camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hef', new (B().Vector3)(0, 1, -0.2), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new (B().Color3)(0.22, 0.25, 0.3);

    const glow = new (B().GlowLayer)('glowEf', scene);
    glow.intensity = 0.6;

    buildFieldPlane();
    chargeA = buildCharge('A');
    chargeB = buildCharge('B');
    buildTest();
    buildPlaceholders();

    glow.addExcludedMesh(fieldPlane);
    // 상시 바닥 — 도구를 놓기 전에도 기본 배경이 보인다
    const __base = B().MeshBuilder.CreateGround('efBase', { width: 26, height: 18 }, scene);
    __base.position.y = -0.5;
    const __bm = new (B().StandardMaterial)('efBaseM', scene);
    __bm.diffuseColor = B().Color3.FromHexString('#141a26');
    __bm.specularColor = new (B().Color3)(0.03, 0.03, 0.05);
    __base.material = __bm;

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/efield.jpg', { x: -9, y: 0, z: 6, ry: 0.3 });

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

  /** 전위를 색으로 칠한 바닥판 (등전위 무늬가 보인다) */
  function buildFieldPlane() {
    fieldPlane = B().MeshBuilder.CreateGround('efPlane', { width: 3.2 * U, height: 2.4 * U }, scene);
    fieldPlane.position.y = PLANE_Y;
    fieldTex = new (B().DynamicTexture)('efTex', { width: FIELD_N, height: FIELD_N }, scene, true);
    const m = new (B().StandardMaterial)('efPlaneMat', scene);
    m.diffuseTexture = fieldTex;
    m.emissiveTexture = fieldTex;
    m.emissiveColor = new (B().Color3)(0.75, 0.75, 0.75);
    m.specularColor = new (B().Color3)(0, 0, 0);
    fieldPlane.material = m;
  }

  function drawField() {
    const ctx = fieldTex.getContext();
    const img = ctx.createImageData(FIELD_N, FIELD_N);
    const W = 3.2, H = 2.4;

    for (let j = 0; j < FIELD_N; j++) {
      const z = (j / (FIELD_N - 1)) * H - H / 2;
      for (let i = 0; i < FIELD_N; i++) {
        const x = (i / (FIELD_N - 1)) * W - W / 2;
        const o = (j * FIELD_N + i) * 4;
        const v = potentialAt(x, z) / 1000;              // kV 단위로 압축
        const t = Math.max(-1, Math.min(1, v / 30));
        // 등전위선 : 전위가 일정한 간격으로 지날 때 밝게
        const band = Math.abs(((v / 4) % 1 + 1) % 1 - 0.5) < 0.055 ? 34 : 0;
        img.data[o]     = Math.round(26 + Math.max(0, t) * 190 + band);
        img.data[o + 1] = Math.round(30 + (1 - Math.abs(t)) * 36 + band);
        img.data[o + 2] = Math.round(38 + Math.max(0, -t) * 190 + band);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    fieldTex.update();
  }

  function buildCharge(name) {
    const g = new (B().TransformNode)('charge' + name, scene);
    const s = B().MeshBuilder.CreateSphere('chargeS' + name, { diameter: 1.3, segments: 20 }, scene);
    s.position.y = 0.7;
    const m = new (B().StandardMaterial)('chargeM' + name, scene);
    m.diffuseColor = B().Color3.FromHexString('#d0453a');
    m.emissiveColor = B().Color3.FromHexString('#5a1a12');
    m.specularColor = new (B().Color3)(1, 1, 1);
    m.specularPower = 96;
    s.material = m;
    s.parent = g;

    // + / − 표시
    const plane = B().MeshBuilder.CreatePlane('chargeL' + name, { width: 1.1, height: 1.1 }, scene);
    plane.position.set(0, 1.42, 0);
    plane.rotation.x = Math.PI / 2;
    const tex = new (B().DynamicTexture)('chargeT' + name, { width: 110, height: 110 }, scene, true);
    const pm = new (B().StandardMaterial)('chargeLM' + name, scene);
    pm.diffuseTexture = tex; pm.opacityTexture = tex;
    pm.emissiveColor = new (B().Color3)(1, 1, 1);
    pm.specularColor = new (B().Color3)(0, 0, 0);
    pm.backFaceCulling = false;
    plane.material = pm;
    plane.parent = g;

    g._sphere = s;
    g._tex = tex;
    return g;
  }

  function drawChargeLabel(g, q) {
    const ctx = g._tex.getContext();
    ctx.clearRect(0, 0, 110, 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 78px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(q >= 0 ? '+' : '−', 55, 58);
    g._tex.update();
  }

  function buildTest() {
    testCharge = new (B().TransformNode)('testCharge', scene);
    const s = B().MeshBuilder.CreateSphere('testS', { diameter: 0.62, segments: 16 }, scene);
    s.position.y = 0.55;
    const m = new (B().StandardMaterial)('testM', scene);
    m.diffuseColor = B().Color3.FromHexString('#ffe066');
    m.emissiveColor = B().Color3.FromHexString('#6b5400');
    m.specularColor = new (B().Color3)(1, 1, 1);
    s.material = m;
    s.parent = testCharge;
  }

  /** 전기력선과 시험 전하가 받는 힘 화살표 */
  function drawLines() {
    if (forceLine) { forceLine.dispose(); forceLine = null; }
    if (!placed.chargeA || !placed.chargeB) return;

    const V = (x, z, y) => new (B().Vector3)(x * U, y === undefined ? 0.35 : y, z * U);
    const lines = [];

    if (state.showLines) {
      // 각 전하에서 사방으로 전기력선을 따라간다
      [[posA(), state.qA], [posB(), state.qB]].forEach(([p, q]) => {
        if (q === 0) return;
        const n = 12;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          let x = p.x + Math.cos(ang) * 0.16;
          let z = p.z + Math.sin(ang) * 0.16;
          const pts = [V(x, z)];
          const dir = q > 0 ? 1 : -1;      // (+) 에서 나가고 (−) 로 들어온다
          for (let s = 0; s < 90; s++) {
            const f = fieldAt(x, z);
            if (f.mag < 1e-9) break;
            x += dir * (f.ex / f.mag) * 0.04;
            z += dir * (f.ez / f.mag) * 0.04;
            if (Math.abs(x) > 1.7 || Math.abs(z) > 1.25) { pts.push(V(x, z)); break; }
            // 반대 전하에 닿으면 멈춘다
            const near = [posA(), posB()].some((o) => Math.hypot(x - o.x, z - o.z) < 0.14);
            pts.push(V(x, z));
            if (near) break;
          }
          if (pts.length > 1) lines.push(pts);
        }
      });
    }

    // 시험 전하가 받는 힘 화살표
    if (placed.test) {
      const f = forceOnTest();
      if (f.mag > 0) {
        const scale = 0.55 / Math.max(1e-9, f.mag);
        const ex = state.testX + f.fx * scale;
        const ez = state.testZ + f.fz * scale;
        lines.push([V(state.testX, state.testZ, 0.62), V(ex, ez, 0.62)]);
      }
    }

    if (!lines.length) return;
    forceLine = B().MeshBuilder.CreateLineSystem('efLines', { lines }, scene);
    forceLine.color = B().Color3.FromHexString('#8fd8ff');
    forceLine.alpha = 0.72;
    forceLine.isPickable = false;
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    Object.entries(slots).forEach(([id, s]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: 2.6, height: 2.6 }, scene);
      p.position.set(s.x * U, PLANE_Y + 0.06, id === 'test' ? 0.9 * U : 0);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, 2.6, 2.6, s.name, { mirror: false, color: '#5aa9ff' });
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
    chargeA.setEnabled(!!placed.chargeA);
    chargeB.setEnabled(!!placed.chargeB);
    testCharge.setEnabled(!!placed.test);
    fieldPlane.setEnabled(!!placed.chargeA || !!placed.chargeB);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const s = slots[id];
    if (id === 'test') return Math.abs(point.z / U) > 0.35 ? 'ok' : 'wrong';
    return Math.abs(point.x / U - s.x) <= 0.9 ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;
    const a = posA(), b = posB();
    chargeA.position.set(a.x * U, 0, 0);
    chargeB.position.set(b.x * U, 0, 0);
    if (holders.chargeA) holders.chargeA.position.x = a.x * U;
    if (holders.chargeB) holders.chargeB.position.x = b.x * U;

    // 전하량에 따라 크기와 색
    const style = (g, q) => {
      const r = Math.min(1.6, 0.55 + Math.abs(q) * 0.18);
      g._sphere.scaling.setAll(r);
      g._sphere.material.diffuseColor =
        B().Color3.FromHexString(q >= 0 ? '#d0453a' : '#2f6ad0');
      g._sphere.material.emissiveColor =
        B().Color3.FromHexString(q >= 0 ? '#5a1a12' : '#122a5a');
      drawChargeLabel(g, q);
    };
    style(chargeA, state.qA);
    style(chargeB, state.qB);

    testCharge.position.set(state.testX * U, 0, state.testZ * U);

    drawField();
    drawLines();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = 0.62;
    camera.radius = 17;
    camera.setTarget(B().Vector3.Zero());
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '두 전하의 부호와 크기를 바꾸고 시험 전하를 옮기며 <b>받는 힘의 방향과 크기</b>를 관찰하세요.';
  const prepGuide = '점선으로 표시된 자리에 두 전하와 시험 전하를 끌어다 놓으세요.';

  function controlsHTML() {
    return `
      ${LabUI.slider('qA', '전하 A<br><i>q</i><sub>A</sub>',
        { min: -5, max: 5, step: 0.5, value: state.qA, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} μC` })}
      ${LabUI.slider('qB', '전하 B<br><i>q</i><sub>B</sub>',
        { min: -5, max: 5, step: 0.5, value: state.qB, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} μC` })}
      ${LabUI.slider('sep', '두 전하<br>사이 거리',
        { min: 0.6, max: 2.4, step: 0.1, value: state.sep, fmt: (v) => `${v.toFixed(1)} m` })}
      ${LabUI.slider('testX', '시험 전하<br>좌우 위치',
        { min: -1.5, max: 1.5, step: 0.05, value: state.testX, fmt: (v) => `${v.toFixed(2)} m` })}
      ${LabUI.slider('testZ', '시험 전하<br>앞뒤 위치',
        { min: -1.1, max: 1.1, step: 0.05, value: state.testZ, fmt: (v) => `${v.toFixed(2)} m` })}
      <div class="control">
        <div class="clabel">전기<br>력선</div>
        <div class="cbody"><div class="opt-grid one-row">
          <button class="opt${state.showLines ? ' on' : ''}" id="lineBtn">보기</button>
        </div></div>
      </div>`;
  }

  function bindControls(root, onChange) {
    const f1 = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} μC`;
    LabUI.bindSlider(root, 'qA', state, 'qA', f1, onChange);
    LabUI.bindSlider(root, 'qB', state, 'qB', f1, onChange);
    LabUI.bindSlider(root, 'sep', state, 'sep', (v) => `${v.toFixed(1)} m`, onChange);
    LabUI.bindSlider(root, 'testX', state, 'testX', (v) => `${v.toFixed(2)} m`, onChange);
    LabUI.bindSlider(root, 'testZ', state, 'testZ', (v) => `${v.toFixed(2)} m`, onChange);

    const btn = root.querySelector('#lineBtn');
    btn.addEventListener('click', () => {
      state.showLines = !state.showLines;
      btn.classList.toggle('on', state.showLines);
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const f = forceOnTest();
    const V = potentialAt(state.testX, state.testZ);
    const rA = Math.hypot(state.testX - posA().x, state.testZ);
    const rB = Math.hypot(state.testX - posB().x, state.testZ);
    const same = state.qA * state.qB > 0;

    // 두 전하 사이에 작용하는 힘 (쿨롱 법칙)
    const Fab = K * Math.abs(state.qA * state.qB) * 1e-12 / (state.sep * state.sep);

    return `
      <div class="row"><span>전하 A</span><b style="color:${state.qA >= 0 ? '#e0533f' : '#2f7fd6'}">
        ${state.qA > 0 ? '+' : ''}${state.qA.toFixed(1)} μC</b></div>
      <div class="row"><span>전하 B</span><b style="color:${state.qB >= 0 ? '#e0533f' : '#2f7fd6'}">
        ${state.qB > 0 ? '+' : ''}${state.qB.toFixed(1)} μC</b></div>
      <div class="row"><span>두 전하 사이</span>
        <span class="tag ${same ? 'con' : 'des'}">${same ? '밀어냄' : '끌어당김'}</span></div>
      <div class="row"><span>쿨롱 힘 <i>F</i></span><b>${Fab.toExponential(2)} N</b></div>

      <div class="sec">시험 전하 자리</div>
      <div class="row"><span>A 까지 거리</span><b>${rA.toFixed(2)} m</b></div>
      <div class="row"><span>B 까지 거리</span><b>${rB.toFixed(2)} m</b></div>
      <div class="row"><span>전기장 <i>E</i></span>
        <b class="big">${f.field.mag.toExponential(2)} N/C</b></div>
      <div class="row"><span>전위 <i>V</i></span><b>${(V / 1000).toFixed(2)} kV</b></div>
      <div class="row"><span>받는 힘 (+1 nC)</span><b>${f.mag.toExponential(2)} N</b></div>
      <div class="formula"><i>F</i> = <i>k</i><i>q</i><sub>1</sub><i>q</i><sub>2</sub>/<i>r</i><sup>2</sup>
        &nbsp;·&nbsp; <i>E</i> = <i>F</i>/<i>q</i> &nbsp;·&nbsp; <i>V</i> = <i>kq</i>/<i>r</i></div>`;
  }

  /* ══ 그래프 — 축을 따라가는 전위·전기장 ════ */
  const graphTitle = '중심선을 따라가는 전위와 전기장';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const padL = 34, padR = 12;
    const gw = W - padL - padR;
    const topH = Math.round(H * 0.5), botY = topH + 6, botH = H - botY - 18;
    const X_MAX = 1.7;
    const xOf = (x) => padL + ((x + X_MAX) / (2 * X_MAX)) * gw;

    // 위 — 전위 V(x)
    const zeroY = 8 + (topH - 16) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(padL + gw, zeroY); ctx.stroke();

    let vMax = 1;
    for (let px = 0; px <= gw; px++) {
      const x = (px / gw) * 2 * X_MAX - X_MAX;
      vMax = Math.max(vMax, Math.abs(potentialAt(x, 0.28) / 1000));
    }
    vMax = Math.min(vMax, 260);

    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let px = 0; px <= gw; px++) {
      const x = (px / gw) * 2 * X_MAX - X_MAX;
      const v = Math.max(-vMax, Math.min(vMax, potentialAt(x, 0.28) / 1000));
      const y = zeroY - (v / vMax) * ((topH - 16) / 2);
      px === 0 ? ctx.moveTo(padL + px, y) : ctx.lineTo(padL + px, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffd84a';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('전위 V (kV)', padL + 3, 3);

    // 아래 — 전기장 세기 |E|(x)
    let eMax = 1;
    for (let px = 0; px <= gw; px++) {
      const x = (px / gw) * 2 * X_MAX - X_MAX;
      eMax = Math.max(eMax, fieldAt(x, 0.28).mag);
    }
    ctx.strokeStyle = '#5ad0f0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let px = 0; px <= gw; px++) {
      const x = (px / gw) * 2 * X_MAX - X_MAX;
      const e = fieldAt(x, 0.28).mag;
      const y = botY + botH - (e / eMax) * botH;
      px === 0 ? ctx.moveTo(padL + px, y) : ctx.lineTo(padL + px, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#5ad0f0';
    ctx.fillText('전기장 세기 |E| (N/C)', padL + 3, botY + 1);

    // 전하 위치와 시험 전하 위치 표시
    [[posA().x, state.qA], [posB().x, state.qB]].forEach(([x, q]) => {
      ctx.strokeStyle = q >= 0 ? 'rgba(224,83,63,.6)' : 'rgba(47,127,214,.6)';
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(xOf(x), 6); ctx.lineTo(xOf(x), H - 16); ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.strokeStyle = '#4ad8a0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xOf(state.testX), 6); ctx.lineTo(xOf(state.testX), H - 16); ctx.stroke();

    ctx.fillStyle = '#9fb0c2';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let x = -1.5; x <= 1.51; x += 0.5) ctx.fillText(x.toFixed(1), xOf(x), H - 14);
  }

  function graphFootHTML() {
    const same = state.qA * state.qB > 0;
    return same
      ? `같은 부호끼리는 <b>밀어냅니다</b> · 두 전하 사이에 전기장이 0 이 되는 지점이 생깁니다`
      : `다른 부호끼리는 <b>끌어당깁니다</b> · 전기력선이 (+) 에서 나와 (−) 로 들어갑니다`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '<i>q</i><sub>A</sub> (μC)', '<i>q</i><sub>B</sub> (μC)', '거리 (m)',
    '시험 전하 위치', '<i>E</i> (N/C)', '<i>V</i> (kV)',
  ];

  function recordRow() {
    const f = forceOnTest();
    return [
      state.qA.toFixed(1), state.qB.toFixed(1), state.sep.toFixed(1),
      `(${state.testX.toFixed(2)}, ${state.testZ.toFixed(2)})`,
      f.field.mag.toExponential(2),
      (potentialAt(state.testX, state.testZ) / 1000).toFixed(2),
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 시험 전하 옮기기 · 1 같은 부호로 바꾸기 · 2 거리 2가지 기록
     3 전하량 2가지 기록 · 4 기록 4줄                                      */
  const mis = { moved: false, same: false, x0: null, z0: null };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);
  const uniq = (col) => new Set(recs().map((r) => String(r[col]))).size;

  function missionDone(i) {
    if (mis.x0 === null) { mis.x0 = state.testX; mis.z0 = state.testZ; }
    if (Math.abs(state.testX - mis.x0) > 0.05 || Math.abs(state.testZ - mis.z0) > 0.05) mis.moved = true;
    if (state.qA * state.qB > 0) mis.same = true;

    if (i === 0) return mis.moved;
    if (i === 1) return mis.same;
    if (i === 2) return uniq(2) >= 2;      // 두 전하 사이 거리
    if (i === 3) return uniq(0) >= 2;      // 전하 A 의 전하량
    if (i === 4) return recs().length >= 4;
    return false;
  }

  return {
    missionDone,
    id: 'efield',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '전기력과 전기장 관찰하기',
    guide, prepGuide, tools,
    create, update, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, fieldAt, potentialAt, forceOnTest,
    get scene() { return scene; },
  };
})();
