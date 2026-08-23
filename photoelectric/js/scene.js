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
  let stepLam = null, lampSwitch = null, swTex = null, lamTag = null, metalTag = null;

  const state = {
    metal: 'cesium',
    lambda: 400,     // 빛의 파장 (nm)
    intensity: 0.6,  // 빛의 세기 (0~1)
    on: false,       // 처음에는 광원이 꺼져 있다
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
    buildHandsOn();

    glow.addExcludedMesh(scene.getMeshByName('phMeterFace'));
    glow.addExcludedMesh(lamTag.plane);
    glow.addExcludedMesh(metalTag.plane);
    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/photoelectric.jpg', { x: -13.5, y: 0, z: 4.5 });

    setupPointer(canvas);
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
    tube.isPickable = false;          // 유리관 너머의 «금속판»을 바로 누를 수 있도록

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
    beam.isPickable = false;          // 빛줄기가 광원·금속판을 가리지 않도록
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

    // 광원이 꺼져 있으면 «방출» 표시를 하지 않는다 (오개념 방지)
    const lit = state.on && emits();
    ctx.fillStyle = !state.on ? '#8e9bad' : (lit ? '#5ef0a0' : '#e8663f');
    ctx.font = 'bold 19px "Noto Sans KR", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(!state.on ? '광원 꺼짐' : (lit ? '광전자 방출!' : '방출 안 됨'), 150, 176);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    meterTex.update();
  }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     · 광원의 «전원 단추»를 눌러 빛을 켜고 끈다
     · 광원을 앞뒤로 끌면 금속판까지의 거리가 달라져 빛의 세기가 바뀐다
     · 광원 위 ＋ / － 로 단색광의 파장을 바꾼다
     · 금속판을 누르면 다른 금속으로 갈아 끼운다                      */
  const NOSE = -5.75;                 // 광원 렌즈 앞 끝 (기본 자리)
  const DX_MIN = -2.6, DX_MAX = 2.4;  // 광원을 앞뒤로 옮길 수 있는 범위
  const LAM_STEP = 20;                // ＋ / － 한 번에 바꾸는 파장 (nm)
  const METAL_ORDER = ['cesium', 'sodium', 'zinc', 'copper'];

  let lampDrag = null;                // { px0, dx0 }
  let tap = null;                     // { name, x, y } — 끌지 않고 «눌렀을 때»만 반응한다
  let onChangeCb = null;
  const shown = { lam: '', metal: '', on: null };   // 이름표는 값이 바뀔 때만 다시 그린다

  /** 빛의 세기 → 광원의 앞뒤 위치 (가까울수록 세다) */
  function lampDx() {
    const t = Math.min(1, Math.max(0, (state.intensity - 0.1) / 0.9));
    return DX_MIN + t * (DX_MAX - DX_MIN);
  }
  /** 광원의 앞뒤 위치 → 빛의 세기 (슬라이더와 같은 0.1~1.0, 0.05 단위) */
  function intensityFromDx(dx) {
    const d = Math.min(DX_MAX, Math.max(DX_MIN, dx));
    const t = (d - DX_MIN) / (DX_MAX - DX_MIN);
    const v = Math.round((0.1 + t * 0.9) / 0.05) * 0.05;
    return +Math.min(1, Math.max(0.1, v)).toFixed(2);
  }

  /** 부품 옆에 세워 두는 작은 이름표 — 지금 값을 3D 화면에서 바로 읽는다 */
  function makeTag(name, w, h) {
    const p = B().MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    p.rotation.y = Math.PI;           // 전류계 눈금판과 같은 방식 (글씨는 뒤집어 그린다)
    p.isPickable = false;
    const tex = new (B().DynamicTexture)(name + 'T', { width: 384, height: 96 }, scene, true);
    tex.hasAlpha = true;
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.diffuseTexture = tex; m.emissiveTexture = tex; m.opacityTexture = tex;
    m.emissiveColor = new (B().Color3)(0.95, 0.95, 0.95);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    p.material = m;
    return { plane: p, tex };
  }

  function drawTag(tag, main, hint) {
    const c = tag.tex.getContext();
    c.clearRect(0, 0, 384, 96);
    c.translate(384, 0); c.scale(-1, 1);      // 뒤집어 세웠으므로 글씨도 뒤집어 그린다
    c.fillStyle = 'rgba(16,22,30,.84)';
    c.fillRect(2, 2, 380, 92);
    c.strokeStyle = '#3c4756'; c.lineWidth = 3;
    c.strokeRect(2, 2, 380, 92);
    c.textAlign = 'center';
    c.fillStyle = '#e6ebf2';
    c.font = 'bold 34px "Noto Sans KR", sans-serif';
    c.textBaseline = 'middle';
    c.fillText(main, 192, 34);
    c.fillStyle = '#7f8fa3';
    c.font = '21px "Noto Sans KR", sans-serif';
    c.fillText(hint, 192, 72);
    c.setTransform(1, 0, 0, 1, 0, 0);
    tag.tex.update();
  }

  /** 광원 앞면의 전원 단추 */
  function buildSwitch() {
    const sw = B().MeshBuilder.CreatePlane('phLampSwitch', { width: 0.66, height: 0.66 }, scene);
    sw.position.set(-7.0, 1.85, -1.03);
    swTex = new (B().DynamicTexture)('phSwTex', { width: 96, height: 96 }, scene, true);
    swTex.hasAlpha = true;
    const m = new (B().StandardMaterial)('phSwMat', scene);
    m.diffuseTexture = swTex; m.emissiveTexture = swTex; m.opacityTexture = swTex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    sw.material = m;
    sw.parent = lamp;                 // 광원을 옮기면 단추도 따라간다
    lampSwitch = sw;
  }

  function drawSwitch() {
    const c = swTex.getContext();
    c.clearRect(0, 0, 96, 96);
    c.fillStyle = state.on ? '#2ecc71' : '#4a5460';
    c.beginPath(); c.arc(48, 48, 40, 0, 7); c.fill();
    c.strokeStyle = state.on ? '#0f3b22' : '#242b34'; c.lineWidth = 5;
    c.beginPath(); c.arc(48, 48, 40, 0, 7); c.stroke();
    // 전원 기호 — 위가 트인 원과 세로줄 (좌우 대칭이라 뒤집혀도 같다)
    c.strokeStyle = '#ffffff'; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.arc(48, 53, 20, -Math.PI / 2 + 0.62, Math.PI * 1.5 - 0.62); c.stroke();
    c.beginPath(); c.moveTo(48, 27); c.lineTo(48, 51); c.stroke();
    swTex.update();
  }

  function buildHandsOn() {
    shown.lam = ''; shown.metal = ''; shown.on = null;
    stepLam = LabUI.makeStepper(scene, 'Lam');
    buildSwitch();
    lamTag = makeTag('phLamTag', 2.9, 0.72);
    metalTag = makeTag('phMetalTag', 3.4, 0.85);
  }

  /** 직접 조작하는 부품들의 자리·표시를 매번 다시 맞춘다 */
  function layoutHandsOn() {
    if (!stepLam) return;
    const on = allPlaced();
    const dx = lampDx();
    const lx = -7.6 + dx;

    stepLam.place(lx, 4.7, -1.1, 0.9);
    stepLam.setEnabled(on);
    lampSwitch.setEnabled(on);        // 배치가 끝나야 전원 단추가 나타난다
    lamTag.plane.position.set(lx, 5.6, -1.1);
    lamTag.plane.setEnabled(on);
    metalTag.plane.position.set(1.5, 5.2, -1.1);
    metalTag.plane.setEnabled(on);

    const lam = `λ ${state.lambda} nm`;
    if (lam !== shown.lam) { shown.lam = lam; drawTag(lamTag, lam, '＋ － 로 파장을 바꾼다'); }
    if (state.metal !== shown.metal) {
      shown.metal = state.metal;
      const m = METALS[state.metal];
      drawTag(metalTag, `${m.name} · W ${m.W.toFixed(2)} eV`, '금속판을 누르면 바뀐다');
    }
    if (state.on !== shown.on) { shown.on = state.on; drawSwitch(); }
  }

  /* ── 3D 조작 ────────────────────────────────── */
  function afterHandsOn() {
    update();
    syncPanel();
    if (onChangeCb) onChangeCb();
  }

  function togglePower() {
    state.on = !state.on;
    afterHandsOn();
  }

  function bumpLambda(d) {
    const v = Math.max(200, Math.min(700, state.lambda + d * LAM_STEP));
    if (v === state.lambda) return;
    state.lambda = v;
    afterHandsOn();
  }

  /** 금속판을 눌러 다음 금속으로 갈아 끼운다 */
  function nextMetal() {
    const i = METAL_ORDER.indexOf(state.metal);
    state.metal = METAL_ORDER[(i + 1) % METAL_ORDER.length];
    afterHandsOn();
  }

  /** 화면의 한 점 → 장치가 놓인 세로 평면 위의 x 좌표 */
  function pointerX() {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(
      new (B().Vector3)(0, 2.4, 0), new (B().Vector3)(0, 0, 1));
    const d = ray.intersectsPlane(plane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d)).x;
  }

  /** 하단 조작 막대의 값도 3D 조작에 맞춰 따라오게 한다 */
  function syncPanel() {
    const q = (s) => document.querySelector(s);
    const la = q('#lambda'), lo = q('#lambdaOut');
    if (la) la.value = state.lambda;
    if (lo) lo.textContent = `${state.lambda} nm`;
    const it = q('#intensity'), io = q('#intensityOut');
    if (it) it.value = state.intensity;
    if (io) io.textContent = `${(state.intensity * 100).toFixed(0)} %`;
    const btn = q('#onBtn');
    if (btn) {
      btn.textContent = state.on ? 'ON' : 'OFF';
      btn.classList.toggle('off', !state.on);
    }
    document.querySelectorAll('[data-metal]').forEach((b) =>
      b.classList.toggle('on', b.getAttribute('data-metal') === state.metal));
  }

  const TAPPABLE = ['btnAddLam', 'btnSubLam', 'phLampSwitch', 'phCathode'];

  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const nm = pi.pickInfo && pi.pickInfo.pickedMesh ? pi.pickInfo.pickedMesh.name : '';

      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced()) return;                 // 배치가 끝나기 전에는 조작하지 않는다
        if (TAPPABLE.indexOf(nm) >= 0) {
          const ev = pi.event || {};
          tap = { name: nm, x: ev.clientX || 0, y: ev.clientY || 0 };
          return;
        }
        if (/^phLamp(Body|Nose|Stand)$/.test(nm)) {
          const px = pointerX();
          if (px === null) return;
          lampDrag = { px0: px, dx0: lampDx() };
          camera.detachControl();
        }
      } else if (pi.type === T.POINTERMOVE && lampDrag) {
        const px = pointerX();
        if (px === null) return;
        const v = intensityFromDx(lampDrag.dx0 + (px - lampDrag.px0));
        if (v !== state.intensity) {
          state.intensity = v;
          update();
          syncPanel();
          if (onChangeCb) onChangeCb();
        }
      } else if (pi.type === T.POINTERUP) {
        if (lampDrag) {
          lampDrag = null;
          camera.attachControl(canvas, true);
        }
        if (tap) {
          // 시점을 돌리려고 끈 것과 구분한다 — 거의 움직이지 않았을 때만 «누름»
          const ev = pi.event || {};
          const moved = Math.hypot((ev.clientX || 0) - tap.x, (ev.clientY || 0) - tap.y);
          const hit = tap.name;
          tap = null;
          if (moved < 8) {                        // 손가락으로 눌러도 흔들림을 견딘다
            if (hit === 'btnAddLam') bumpLambda(+1);
            else if (hit === 'btnSubLam') bumpLambda(-1);
            else if (hit === 'phLampSwitch') togglePower();
            else if (hit === 'phCathode') nextMetal();
          }
        }
      }
    });
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
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, slots[id].name, { mirror: true, color: '#5aa9ff' });
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

    // 빛의 세기 = 광원이 금속판에 얼마나 가까이 있는가 (끌어서 옮긴 만큼 자리를 잡는다)
    const dx = lampDx();
    lamp.position.x = dx;
    const nose = NOSE + dx;
    beam.scaling.y = -nose / 5.8;        // 렌즈 앞 끝에서 금속판(x = 0)까지
    beam.position.x = nose / 2;

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
    layoutHandsOn();
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
  const guide = '광원의 <b>전원 단추</b>를 눌러 켠 뒤, 광원을 <b>앞뒤로 끌어</b> 세기를, '
    + '광원 위 <b>＋ · －</b> 로 파장을 바꿔 보세요. 세게 비추기만 하면 전자가 나올까요?';
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
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          광원 앞의 <b>전원 단추</b>를 눌러 빛을 켜고, 광원을 <b>앞뒤로 끌어</b> 세기를 바꿉니다.
          광원 위 <b>＋ · －</b> 로 파장을, <b>금속판을 누르면</b> 금속이 바뀝니다.
        </p></div>
      </div>
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
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록
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


  /* ══ 탐구 미션 ═══════════════════════════════
     0 전자 방출 성공 · 1 문턱 진동수 확인 · 2 세기를 바꿔도 최대 KE 그대로
     3 금속 2가지 비교 기록 · 4 기록 4줄                                   */
  const mis = { emitted: false, blocked: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.on && emits()) mis.emitted = true;
    if (state.on && !emits()) mis.blocked = true;

    if (i === 0) return mis.emitted;
    if (i === 1) return mis.emitted && mis.blocked;
    if (i === 2) {
      // 같은 금속·같은 파장인데 세기만 다른 두 기록 → 최대 운동 에너지가 같다
      const rs = recs().filter((r) => r.length >= 8);
      for (let a = 0; a < rs.length; a++) {
        for (let b = 0; b < rs.length; b++) {
          if (a === b) continue;
          if (rs[a][0] === rs[b][0] && rs[a][2] === rs[b][2] && rs[a][4] !== rs[b][4]) return true;
        }
      }
      return false;
    }
    if (i === 3) return new Set(recs().map((r) => String(r[0]))).size >= 2;
    if (i === 4) return recs().length >= 4;
    return false;
  }

  return {
    missionDone,
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
