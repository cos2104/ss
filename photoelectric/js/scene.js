/**
 * 광전 효과와 빛의 입자성
 * 비상교육 고등 물리학 III-1-03 (교과서 136~141쪽)
 *
 * 금속판에 빛을 비추어 광전자가 튀어나오는지 관찰한다.
 * 「아무리 세게 비춰도 문턱 진동수보다 낮으면 전자가 나오지 않는다」는
 * 파동설로 설명할 수 없는 사실이 핵심이다.
 */
const PhotoScene = (() => {
  const B = () => BABYLON;

  const H = 6.626e-34;      // 플랑크 상수
  const E_CHARGE = 1.602e-19;
  const C = 3e8;

  let scene, camera;
  let lamp, plate, beam, beamMat, meterG, meterTex;
  let electrons = [];
  let placed = {};

  const state = {
    metal: 'cesium',
    lambda: 400,     // 빛의 파장 (nm)
    intensity: 0.6,  // 빛의 세기 (0~1)
    on: true,
  };

  // 금속별 일함수 (eV)
  const METALS = {
    cesium: { name: '세슘 (Cs)', W: 2.14, color: '#d8c88a' },
    sodium: { name: '나트륨 (Na)', W: 2.28, color: '#e0d0b0' },
    zinc: { name: '아연 (Zn)', W: 4.30, color: '#b8c0c8' },
    copper: { name: '구리 (Cu)', W: 4.70, color: '#c8834a' },
  };

  const tools = [
    { id: 'lamp', label: '단색광 광원', icon: 'led' },
    { id: 'plate', label: '금속판 (광전관)', icon: 'screenBoard' },
    { id: 'meter', label: '전류계', icon: 'ammeter' },
  ];

  const slots = {
    lamp: { x: -7, name: '광원' },
    plate: { x: 1.5, name: '금속판' },
    meter: { x: 8, name: '전류계' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 빛의 광자 1개가 갖는 에너지 (eV) */
  function photonEnergy() {
    return (H * C / (state.lambda * 1e-9)) / E_CHARGE;
  }
  function workFunction() { return METALS[state.metal].W; }
  /** 문턱 진동수에 해당하는 한계 파장 (nm) */
  function thresholdLambda() {
    return (H * C / (workFunction() * E_CHARGE)) * 1e9;
  }
  function emits() { return photonEnergy() > workFunction(); }
  /** 광전자의 최대 운동 에너지 (eV) — 아인슈타인 광전 방정식 */
  function maxKE() { return Math.max(0, photonEnergy() - workFunction()); }
  /** 광전류 — 방출되는 경우에만 빛의 세기에 비례 */
  function photoCurrent() {
    if (!state.on || !emits()) return 0;
    return state.intensity * 12;      // μA
  }
  /** 정지 전압 */
  function stoppingVoltage() { return maxKE(); }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#0f151fff');

    camera = new (B().ArcRotateCamera)(
      'camPh', -Math.PI / 2 - 0.28, 1.12, 22, new (B().Vector3)(0.5, 1.8, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 11;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.48;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hph', new (B().Vector3)(0.1, 1, -0.3), scene);
    hemi.intensity = 0.72;
    hemi.groundColor = new (B().Color3)(0.2, 0.23, 0.29);

    const glow = new (B().GlowLayer)('glowPh', scene);
    glow.intensity = 0.7;

    buildTable();
    buildLamp();
    buildPlate();
    buildBeam();
    buildMeter();
    buildElectrons();
    buildPlaceholders();

    glow.addExcludedMesh(scene.getMeshByName('phMeterFace'));
    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/photoelectric.jpg', { x: -8, y: 0, z: 5, ry: 0.3 });

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
    const t = B().MeshBuilder.CreateBox('phTable', { width: 28, height: 0.5, depth: 12 }, scene);
    t.position.set(0, -0.26, 0);
    t.material = mat('phTableMat', '#242c38', '#454f5e', 72);
  }

  function buildLamp() {
    lamp = new (B().TransformNode)('phLamp', scene);
    const body = B().MeshBuilder.CreateBox('phLampBody', { width: 2.6, height: 2.0, depth: 2.0 }, scene);
    body.position.set(-7.6, 2.4, 0);
    body.material = mat('phLampBodyMat', '#39424f', '#8e9bad', 64);
    body.parent = lamp;

    const nose = B().MeshBuilder.CreateCylinder('phLampNose',
      { height: 0.7, diameter: 1.1, tessellation: 20 }, scene);
    nose.rotation.z = Math.PI / 2;
    nose.position.set(-6.1, 2.4, 0);
    const nm = new (B().StandardMaterial)('phLampNoseMat', scene);
    nm.emissiveColor = B().Color3.FromHexString('#ffffff');
    nm.disableLighting = true;
    nose.material = nm;
    nose.parent = lamp;
    lamp._nose = nm;

    const stand = B().MeshBuilder.CreateBox('phLampStand', { width: 1.6, height: 1.4, depth: 1.4 }, scene);
    stand.position.set(-7.6, 0.7, 0);
    stand.material = mat('phLampStandMat', '#2b323c');
    stand.parent = lamp;
  }

  /** 금속판 (광전관 안) */
  function buildPlate() {
    plate = new (B().TransformNode)('phPlate', scene);

    // 진공관
    const tube = B().MeshBuilder.CreateCylinder('phTube',
      { height: 4.4, diameter: 4.0, tessellation: 28 }, scene);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(1.5, 2.4, 0);
    const tm = new (B().StandardMaterial)('phTubeMat', scene);
    tm.diffuseColor = B().Color3.FromHexString('#cfe0f2');
    tm.specularColor = B().Color3.FromHexString('#ffffff');
    tm.specularPower = 96;
    tm.alpha = 0.16;
    tm.backFaceCulling = false;
    tube.material = tm;
    tube.parent = plate;

    // 금속판 (음극)
    const cath = B().MeshBuilder.CreateBox('phCathode', { width: 0.28, height: 3.0, depth: 2.6 }, scene);
    cath.position.set(0.1, 2.4, 0);
    cath.material = mat('phCathodeMat', '#d8c88a', '#ffffff', 64);
    cath.parent = plate;
    plate._cath = cath;

    // 수집판 (양극)
    const anode = B().MeshBuilder.CreateBox('phAnode', { width: 0.22, height: 2.4, depth: 2.0 }, scene);
    anode.position.set(3.0, 2.4, 0);
    anode.material = mat('phAnodeMat', '#8e9bad', '#ffffff', 64);
    anode.parent = plate;
  }

  function buildBeam() {
    beamMat = new (B().StandardMaterial)('phBeamMat', scene);
    beamMat.emissiveColor = new (B().Color3)(0.6, 0.6, 1);
    beamMat.diffuseColor = new (B().Color3)(0, 0, 0);
    beamMat.specularColor = new (B().Color3)(0, 0, 0);
    beamMat.disableLighting = true;
    beamMat.alpha = 0.3;
    beamMat.backFaceCulling = false;

    beam = B().MeshBuilder.CreateCylinder('phBeam',
      { height: 5.8, diameter: 0.9, tessellation: 20 }, scene);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(-2.9, 2.4, 0);
    beam.material = beamMat;
  }

  /** 튀어나오는 광전자 */
  function buildElectrons() {
    for (let i = 0; i < 14; i++) {
      const e = B().MeshBuilder.CreateSphere('phE' + i, { diameter: 0.3, segments: 8 }, scene);
      const em = new (B().StandardMaterial)('phEM' + i, scene);
      em.emissiveColor = B().Color3.FromHexString('#5ad0f0');
      em.disableLighting = true;
      e.material = em;
      e.isPickable = false;
      e._t = i / 14;
      e._z = (Math.random() - 0.5) * 1.8;
      e._y = (Math.random() - 0.5) * 2.2;
      electrons.push(e);
    }
  }

  function buildMeter() {
    meterG = new (B().TransformNode)('phMeter', scene);
    // 광전관의 두 전극 → 전류계를 잇는 도선 (실제 회로처럼)
    const wireM = new (B().StandardMaterial)('phWireM', scene);
    wireM.diffuseColor = B().Color3.FromHexString('#c0392b');
    wireM.specularColor = B().Color3.FromHexString('#f0a08a');
    wireM.specularPower = 96;
    const mkWire = (x1, y1, x2, y2, n) => {
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const w = B().MeshBuilder.CreateCylinder('phWire' + n, { height: len, diameter: 0.08 }, scene);
      w.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
      w.rotation.z = -Math.atan2(dx, dy);
      w.material = wireM;
      w.parent = meterG;
      return w;
    };
    // 양극(3.0, 2.4) → 아래 → 전류계 / 음극(0.1, 2.4) → 아래 레일 → 전류계
    mkWire(3.0, 2.4, 3.0, 0.15, 'A1');
    mkWire(3.0, 0.15, 7.6, 0.15, 'A2');
    mkWire(7.6, 0.15, 7.6, 1.1, 'A3');
    mkWire(0.1, 2.4, 0.1, 0.05, 'K1');
    mkWire(0.1, 0.05, 8.4, 0.05, 'K2');
    mkWire(8.4, 0.05, 8.4, 1.1, 'K3');
    const body = B().MeshBuilder.CreateBox('phMeterBody', { width: 4.4, height: 3.0, depth: 1.8 }, scene);
    body.position.set(8, 1.5, 0);
    body.material = mat('phMeterBodyMat', '#e6ebf2', '#ffffff', 70);
    body.parent = meterG;

    const face = B().MeshBuilder.CreatePlane('phMeterFace', { width: 3.8, height: 2.4 }, scene);
    face.position.set(8, 1.6, -0.92);
    face.rotation.y = Math.PI;
    meterTex = new (B().DynamicTexture)('phMeterTex', { width: 300, height: 190 }, scene, true);
    const fm = new (B().StandardMaterial)('phMeterFM', scene);
    fm.diffuseTexture = meterTex; fm.emissiveTexture = meterTex; fm.opacityTexture = meterTex;
    fm.emissiveColor = new (B().Color3)(0.95, 0.95, 0.95);
    fm.specularColor = new (B().Color3)(0, 0, 0);
    fm.backFaceCulling = false;
    face.material = fm;
    face.parent = meterG;
  }

  function drawMeter() {
    const I = photoCurrent();
    const ctx = meterTex.getContext();
    ctx.clearRect(0, 0, 300, 190);
    ctx.translate(300, 0); ctx.scale(-1, 1);
    ctx.fillStyle = '#12181f';
    ctx.fillRect(0, 0, 300, 190);
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 292, 182);

    ctx.fillStyle = '#9fb0c2';
    ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('광전류', 150, 14);

    ctx.fillStyle = I > 0.01 ? '#5ef0a0' : '#5b6675';
    ctx.font = 'bold 50px "Menlo", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(I.toFixed(1), 130, 84);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('μA', 232, 88);

    ctx.fillStyle = emits() ? '#5ef0a0' : '#e8663f';
    ctx.font = 'bold 19px "Noto Sans KR", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(emits() ? '광전자 방출!' : '방출 안 됨', 150, 176);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    meterTex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      lamp: { x: -7.4, y: 2.0, w: 3.6, h: 4.2 },
      plate: { x: 1.5, y: 2.4, w: 5.0, h: 4.6 },
      meter: { x: 8, y: 1.6, w: 4.8, h: 3.4 },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreatePlane('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, c.y, 0.9);
      p.rotation.y = Math.PI;
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 200, height: 200 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 200, 200);
      ctx.translate(200, 0); ctx.scale(-1, 1);
      ctx.strokeStyle = '#5aa9ff'; ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(7, 7, 186, 186);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8fd0ff';
      ctx.font = 'bold 24px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(slots[id].name, 100, 100);
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
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    lamp.setEnabled(!!placed.lamp);
    plate.setEnabled(!!placed.plate);
    meterG.setEnabled(!!placed.meter);
    beam.setEnabled(!!placed.lamp && !!placed.plate);
    update();
  }

  function dropAt(id, point) {
    return Math.abs(point.x - slots[id].x) <= 3.4 ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  function update() {
    if (!scene) return;
    const m = METALS[state.metal];
    plate._cath.material.diffuseColor = B().Color3.FromHexString(m.color);

    // 빛의 색 (파장에 따라)
    const rgb = wavelengthRGB(state.lambda);
    beamMat.emissiveColor = new (B().Color3)(rgb.r, rgb.g, rgb.b);
    beamMat.alpha = state.on ? 0.16 + state.intensity * 0.3 : 0;
    lamp._nose.emissiveColor = state.on
      ? new (B().Color3)(rgb.r, rgb.g, rgb.b)
      : new (B().Color3)(0.1, 0.1, 0.1);
    beam.setEnabled(state.on && placed.lamp && placed.plate);

    // 광전자 개수 — 빛의 세기에 비례
    const n = emits() && state.on ? Math.round(state.intensity * electrons.length) : 0;
    electrons.forEach((e, i) => e.setEnabled(placed.plate && i < n));

    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    if (placed.meter) drawMeter();
  }

  /** 파장 → 색 */
  function wavelengthRGB(nm) {
    let r = 0, g = 0, b = 0;
    if (nm < 380) { r = 0.55; g = 0.3; b = 1; }            // 자외선은 보랏빛으로 표현
    else if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else { r = 1; }
    return { r: Math.max(0, r), g: Math.max(0, g), b: Math.max(0, b) };
  }

  /** 광전자가 날아가는 애니메이션 */
  function tick(dt) {
    if (!emits() || !state.on || !placed.plate) return false;
    // 운동 에너지가 클수록 빠르게 날아간다
    const speed = 0.35 + Math.min(2.2, maxKE()) * 0.5;
    electrons.forEach((e) => {
      if (!e.isEnabled()) return;
      e._t += dt * speed;
      if (e._t > 1) { e._t -= 1; e._z = (Math.random() - 0.5) * 1.8; e._y = (Math.random() - 0.5) * 2.2; }
      e.position.set(0.3 + e._t * 2.6, 2.4 + e._y * (1 - e._t * 0.6), e._z * (1 - e._t * 0.5));
    });
    return false;
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 - 0.28;
    camera.beta = 1.12;
    camera.radius = 22;
    camera.setTarget(new (B().Vector3)(0.5, 1.8, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '빛의 <b>파장</b>과 <b>세기</b>를 따로 바꿔 보세요. 세게 비추기만 하면 전자가 나올까요?';
  const prepGuide = '점선으로 표시된 자리에 광원·금속판·전류계를 끌어다 놓으세요.';

  function controlsHTML() {
    return `
      ${LabUI.opts('금속의<br>종류', 'metal', [
        { v: 'cesium', t: '세슘 2.14 eV' },
        { v: 'sodium', t: '나트륨 2.28 eV' },
        { v: 'zinc', t: '아연 4.30 eV' },
        { v: 'copper', t: '구리 4.70 eV' },
      ], state.metal, 2)}
      ${LabUI.slider('lambda', '빛의<br>파장 <i>λ</i>',
        { min: 200, max: 700, step: 5, value: state.lambda, fmt: (v) => `${v} nm` })}
      ${LabUI.slider('intensity', '빛의<br>세기',
        { min: 0.1, max: 1.0, step: 0.05, value: state.intensity, fmt: (v) => `${(v * 100).toFixed(0)} %` })}
      <div class="control">
        <div class="clabel">광원</div>
        <button class="power${state.on ? '' : ' off'}" id="onBtn">${state.on ? 'ON' : 'OFF'}</button>
      </div>
      <div class="control">
        <div class="clabel">한계<br>파장</div>
        <div class="cbody"><div class="opt-grid one-row">
          <button class="opt" id="thBtn">한계 파장으로</button>
        </div></div>
      </div>`;
  }

  function bindControls(root, onChange) {
    LabUI.bindOpts(root, 'metal', state, 'metal', onChange, String);
    const setL = LabUI.bindSlider(root, 'lambda', state, 'lambda', (v) => `${v} nm`, onChange);
    LabUI.bindSlider(root, 'intensity', state, 'intensity', (v) => `${(v * 100).toFixed(0)} %`, onChange);

    const on = root.querySelector('#onBtn');
    on.addEventListener('click', () => {
      state.on = !state.on;
      on.textContent = state.on ? 'ON' : 'OFF';
      on.classList.toggle('off', !state.on);
      onChange();
    });
    root.querySelector('#thBtn').addEventListener('click', () => {
      setL(Math.round(thresholdLambda() / 5) * 5);
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const m = METALS[state.metal];
    const E = photonEnergy();
    const th = thresholdLambda();
    const f = C / (state.lambda * 1e-9);

    return `
      <div class="row"><span>금속</span><b>${m.name}</b></div>
      <div class="row"><span>일함수 <i>W</i></span><b>${m.W.toFixed(2)} eV</b></div>
      <div class="row"><span>한계 파장</span><b>${th.toFixed(0)} nm</b></div>

      <div class="sec">비추는 빛</div>
      <div class="row"><span>파장 <i>λ</i></span><b>${state.lambda} nm
        ${state.lambda < 380 ? '(자외선)' : ''}</b></div>
      <div class="row"><span>진동수 <i>f</i></span><b>${(f / 1e14).toFixed(2)} ×10<sup>14</sup> Hz</b></div>
      <div class="row"><span>광자 에너지 <i>hf</i></span><b class="big">${E.toFixed(2)} eV</b></div>
      <div class="row"><span>빛의 세기</span><b>${(state.intensity * 100).toFixed(0)} %</b></div>

      <div class="sec">결과</div>
      <div class="row"><span>광전자 방출</span>
        <span class="tag ${emits() && state.on ? 'ok' : 'mid'}">${
          !state.on ? '광원 꺼짐' : emits() ? '방출됨' : '방출 안 됨'}</span></div>
      <div class="row"><span>최대 운동 에너지</span><b>${maxKE().toFixed(2)} eV</b></div>
      <div class="row"><span>정지 전압</span><b>${stoppingVoltage().toFixed(2)} V</b></div>
      <div class="row"><span>광전류</span><b>${photoCurrent().toFixed(1)} μA</b></div>
      <div class="formula"><i>E</i><sub>k(max)</sub> = <i>hf</i> − <i>W</i></div>
      <div class="formula" style="color:#62718a">${emits()
        ? '광자 에너지가 일함수보다 커서 전자가 튀어나옵니다.'
        : '<b>아무리 세게 비춰도</b> 광자 하나의 에너지가 부족하면 전자는 나오지 않습니다.'}</div>`;
  }

  /* ══ 그래프 — 진동수 vs 최대 운동 에너지 ════ */
  const graphTitle = '빛의 진동수와 광전자의 최대 운동 에너지';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const padL = 38, padR = 12, padT = 16, padB = 26;
    const gw = W - padL - padR, gh = H - padT - padB;
    const F_MAX = 16;       // ×10^14 Hz
    const K_MAX = 4;        // eV
    const xOf = (f) => padL + (f / F_MAX) * gw;
    const yOf = (k) => padT + gh - (k / K_MAX) * gh;

    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 1;
    for (let f = 4; f <= F_MAX; f += 4) {
      ctx.beginPath(); ctx.moveTo(xOf(f), padT); ctx.lineTo(xOf(f), padT + gh); ctx.stroke();
    }
    for (let k = 1; k <= K_MAX; k++) {
      ctx.beginPath(); ctx.moveTo(padL, yOf(k)); ctx.lineTo(padL + gw, yOf(k)); ctx.stroke();
    }

    // 각 금속의 직선 — 기울기가 모두 같다(플랑크 상수!)
    const colors = { cesium: '#ffd84a', sodium: '#f0834a', zinc: '#5ad0f0', copper: '#e8663f' };
    Object.entries(METALS).forEach(([key, m]) => {
      const f0 = m.W * E_CHARGE / H / 1e14;    // 문턱 진동수
      ctx.strokeStyle = colors[key];
      ctx.lineWidth = key === state.metal ? 2.4 : 1;
      ctx.globalAlpha = key === state.metal ? 1 : 0.4;
      ctx.beginPath();
      ctx.moveTo(xOf(f0), yOf(0));
      const fEnd = f0 + K_MAX * E_CHARGE / H / 1e14;
      ctx.lineTo(xOf(Math.min(F_MAX, fEnd)), yOf(Math.min(K_MAX, (Math.min(F_MAX, fEnd) - f0) * 1e14 * H / E_CHARGE)));
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // 현재 지점
    const fNow = C / (state.lambda * 1e-9) / 1e14;
    if (fNow <= F_MAX) {
      ctx.fillStyle = emits() ? '#4ad8a0' : '#8e9bad';
      ctx.beginPath(); ctx.arc(xOf(fNow), yOf(Math.min(K_MAX, maxKE())), 4.5, 0, 7); ctx.fill();
      // 문턱 아래면 x 축에 표시
      if (!emits()) {
        ctx.strokeStyle = '#e8663f';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(xOf(fNow), padT); ctx.lineTo(xOf(fNow), padT + gh); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();

    ctx.fillStyle = '#9fb0c2';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let f = 0; f <= F_MAX; f += 4) ctx.fillText(String(f), xOf(f), padT + gh + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let k = 1; k <= K_MAX; k++) ctx.fillText(String(k), padL - 3, yOf(k));
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('진동수 (×10¹⁴ Hz)', W - 4, padT + gh + 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cfe0f2';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('최대 운동 에너지 (eV)', padL + 4, padT + 2);
  }

  function graphFootHTML() {
    return `모든 금속의 직선 <b>기울기가 같습니다</b> — 그 기울기가 <b>플랑크 상수 <i>h</i></b> 입니다 ·
      <i>x</i> 절편이 각 금속의 <b>문턱 진동수</b>`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '금속', '일함수 (eV)', '파장 (nm)', '광자 에너지 (eV)',
    '세기 (%)', '방출 여부', '최대 <i>E</i><sub>k</sub> (eV)', '광전류 (μA)',
  ];

  function recordRow() {
    const m = METALS[state.metal];
    return [
      m.name, m.W.toFixed(2), String(state.lambda), photonEnergy().toFixed(2),
      (state.intensity * 100).toFixed(0),
      state.on ? (emits() ? '방출 ○' : '방출 ✕') : '광원 꺼짐',
      maxKE().toFixed(2), photoCurrent().toFixed(1),
    ];
  }

  return {
    id: 'photoelectric',
    title: '광전 효과 — 빛의 입자성 확인하기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, photonEnergy, workFunction, thresholdLambda, emits, maxKE, photoCurrent,
    get scene() { return scene; },
  };
})();
