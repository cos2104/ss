/**
 * 기체 실험실 — 센서로 재는 P·V·T (⑥ 데이터 기반 실험형)
 * 비상교육 고등 역학과 에너지 II-02·03 (교과서 58~67쪽)
 *
 * 탐구 60쪽 — 센서를 이용하여 기체의 압력, 부피, 온도 관계 분석하기
 *   탐구1 부피–압력(보일) · 탐구2 부피–온도(샤를) · 탐구3 압력–온도(게이뤼삭)
 * 66쪽 — 등적·등압·등온·단열 과정의 Q = ΔU + W
 */
const GasScene = (() => {
  const B = () => BABYLON;

  const N_MOL = 0.2;             // 기체량 (mol)
  const R = 8.314;               // J/mol·K
  const GAMMA = 5 / 3;           // 단원자 이상 기체
  // kPa·L = J 이므로 P[kPa]·V[L] = nRT 가 그대로 성립한다
  const NP = 36;                 // 보이는 분자 수

  // 실린더 표현: 단면 3×3 unit, V(2~10 L) → 높이 2~10 × 0.55 unit
  const CYL_W = 3.0, H_PER_L = 0.55;

  let scene, camera;
  let cylG, piston, pistonRod, pistonGrip, parts = [], gaugeTex, thermoTex, heaterG;
  let placed = {};

  const state = {
    process: 'isothermal',   // isothermal | isobaric | isochoric | adiabatic
    V: 5, T: 300,            // 현재 상태 (P 는 계산)
    running: true,
  };

  // 과정 시작점 (Q·W·ΔU 는 여기서부터 계산)
  let anchor = { V: 5, T: 300 };
  let path = [];               // P-V 경로 {P, V, proc}
  let sim = null;

  const P = () => N_MOL * R * state.T / state.V;   // kPa
  const U = () => 1.5 * N_MOL * R * state.T;       // J

  const tools = [
    { id: 'cylT', label: '실린더 · 피스톤', icon: 'bench' },
    { id: 'pSensT', label: '압력 센서', icon: 'ammeter' },
    { id: 'tSensT', label: '온도 센서', icon: 'sensor' },
    { id: 'heatT', label: '가열 장치', icon: 'bulb' },
  ];
  const slots = {
    cylT: { name: '가운데 (실린더)' },
    pSensT: { name: '실린더 왼쪽' },
    tSensT: { name: '실린더 오른쪽' },
    heatT: { name: '실린더 아래' },
  };

  /* ══ 과정별 열·일 계산 ═══════════════════════ */
  /** anchor → 현재 상태의 W(기체가 한 일), ΔU, Q */
  function processQW() {
    const T1 = anchor.T, V1 = anchor.V, T2 = state.T, V2 = state.V;
    const dU = 1.5 * N_MOL * R * (T2 - T1);
    let W = 0;
    switch (state.process) {
      case 'isothermal': W = N_MOL * R * T1 * Math.log(V2 / V1); break;
      case 'isobaric': W = (N_MOL * R * T1 / V1) * (V2 - V1); break;
      case 'isochoric': W = 0; break;
      case 'adiabatic': W = -dU; break;
    }
    const Q = state.process === 'adiabatic' ? 0 : dU + W;
    return { Q, W, dU };
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c9dff2ff');

    camera = new (B().ArcRotateCamera)(
      'camGa', -Math.PI / 2 + 0.3, 1.15, 18, new (B().Vector3)(0, 3.2, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hga', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.45, 0.48, 0.52);
    const dir = new (B().DirectionalLight)('dga', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 16, -9);
    dir.intensity = 0.35;

    const table = B().MeshBuilder.CreateBox('gaTable', { width: 26, height: 0.6, depth: 14 }, scene);
    table.position.y = -0.32;
    table.material = mat('gaTableMat', '#9aa3ad', '#c6ccd3', 96);

    buildCylinder();
    buildSensors();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/gas.jpg', { x: -11.5, y: 0, z: 5.5 });

    buildStepper();
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
  function emat(name, hex, alpha) {
    const m = new (B().StandardMaterial)(name, scene);
    m.emissiveColor = B().Color3.FromHexString(hex);
    m.disableLighting = true;
    if (alpha != null) m.alpha = alpha;
    return m;
  }

  function buildCylinder() {
    cylG = new (B().TransformNode)('gaCyl', scene);

    // 투명한 실린더 벽 (사각 기둥으로 표현)
    const wallM = new (B().StandardMaterial)('gaWallMat', scene);
    wallM.diffuseColor = B().Color3.FromHexString('#bcd8f0');
    wallM.alpha = 0.24;
    wallM.specularColor = B().Color3.FromHexString('#ffffff');
    const walls = [
      [0, 3.1, CYL_W / 2 + 0.06, CYL_W + 0.3, 6.4, 0.12],
      [0, 3.1, -CYL_W / 2 - 0.06, CYL_W + 0.3, 6.4, 0.12],
      [CYL_W / 2 + 0.06, 3.1, 0, 0.12, 6.4, CYL_W],
      [-CYL_W / 2 - 0.06, 3.1, 0, 0.12, 6.4, CYL_W],
    ];
    walls.forEach((w, i) => {
      const b = B().MeshBuilder.CreateBox('gaWall' + i, { width: w[3], height: w[4], depth: w[5] }, scene);
      b.position.set(w[0], w[1], w[2]);
      b.material = wallM;
      b.parent = cylG;
      b.isPickable = false;
    });
    const base = B().MeshBuilder.CreateBox('gaBase', { width: CYL_W + 0.5, height: 0.24, depth: CYL_W + 0.5 }, scene);
    base.position.y = -0.12;
    base.material = mat('gaBaseMat', '#39424f', '#8e9bad', 64);
    base.parent = cylG;

    piston = B().MeshBuilder.CreateBox('gaPiston', { width: CYL_W - 0.06, height: 0.34, depth: CYL_W - 0.06 }, scene);
    piston.material = mat('gaPistonMat', '#d0453a', '#ffd0c8', 48);
    piston.parent = cylG;
    pistonRod = B().MeshBuilder.CreateCylinder('gaRod', { height: 2.4, diameter: 0.22 }, scene);
    pistonRod.material = mat('gaRodMat', '#7a8494', '#cfd6df', 96);
    pistonRod.parent = cylG;
    // 피스톤 손잡이 — 주사기 피스톤처럼 «손으로 잡고 끄는» 자리를 알려 준다
    pistonGrip = B().MeshBuilder.CreateBox('gaGrip', { width: 1.5, height: 0.26, depth: 0.44 }, scene);
    pistonGrip.material = mat('gaGripMat', '#e0912c', '#ffdca8', 48);
    pistonGrip.parent = cylG;

    // 기체 분자
    for (let i = 0; i < NP; i++) {
      const s = B().MeshBuilder.CreateSphere('gaP' + i, { diameter: 0.22 }, scene);
      s.material = emat('gaPM' + i, i % 3 ? '#5a9df0' : '#8ab8f0');
      s.isPickable = false;
      s.parent = cylG;
      const th = Math.random() * Math.PI * 2;
      parts.push({
        m: s,
        x: (Math.random() - 0.5) * (CYL_W - 0.4),
        y: 0.2 + Math.random() * 2.4,
        z: (Math.random() - 0.5) * (CYL_W - 0.4),
        vx: Math.cos(th), vy: (Math.random() - 0.5) * 1.4, vz: Math.sin(th),
      });
    }

    // 가열 장치 — 버너 몸체 위에 화염. 실린더 바로 아래에 놓인다.
    heaterG = new (B().TransformNode)('gaHeater', scene);
    const burner = B().MeshBuilder.CreateBox('gaBurner', { width: 2.9, height: 0.3, depth: 1.4 }, scene);
    burner.position.set(0, -0.62, 0);
    burner.material = mat('gaBurnerMat', '#20262f', '#5a6a80', 64);
    burner.parent = heaterG;
    for (let i = 0; i < 5; i++) {
      const f = B().MeshBuilder.CreateCylinder('gaFl' + i,
        { height: 0.5, diameterTop: 0.06, diameterBottom: 0.24 }, scene);
      f.position.set((i - 2) * 0.5, -0.28, 0);
      f.material = emat('gaFlM' + i, '#ff8a3c', 0.9);
      f.parent = heaterG;
      heaterG['_fl' + i] = f;
    }
    heaterG.parent = cylG;
    // 실린더 전체를 버너 높이만큼 띄운다
    cylG.position.y = 0.8;
  }

  function texPlane(name, w, h, tw, th) {
    const p = B().MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    const t = new (B().DynamicTexture)(name + 'Tex', { width: tw, height: th }, scene, true);
    const m = new (B().StandardMaterial)(name + 'Mat', scene);
    m.diffuseTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    p.material = m;
    return [p, t];
  }

  let pGauge, tGauge;
  function buildSensors() {
    const [pg, pt] = texPlane('gaPGauge', 2.6, 1.7, 300, 200);
    pg.position.set(-3.6, 3.4, 0);
    pg.rotation.y = -0.35;
    pGauge = pg; gaugeTex = pt;
    const [tg, tt] = texPlane('gaTGauge', 2.6, 1.7, 300, 200);
    tg.position.set(3.6, 3.4, 0);
    tg.rotation.y = 0.35;
    tGauge = tg; thermoTex = tt;
  }

  function drawGauges() {
    // 압력계
    let ctx = gaugeTex.getContext();
    ctx.clearRect(0, 0, 300, 200);
    ctx.fillStyle = '#f6f2e6';
    ctx.beginPath(); ctx.roundRect(0, 0, 300, 200, 18); ctx.fill();
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 28px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('압력 센서', 150, 12);
    ctx.fillStyle = '#d0453a';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText(P().toFixed(1), 150, 66);
    ctx.fillStyle = '#62718a';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('kPa', 150, 138);
    gaugeTex.update();
    // 온도계
    ctx = thermoTex.getContext();
    ctx.clearRect(0, 0, 300, 200);
    ctx.fillStyle = '#f6f2e6';
    ctx.beginPath(); ctx.roundRect(0, 0, 300, 200, 18); ctx.fill();
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 28px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('온도 센서', 150, 12);
    ctx.fillStyle = '#f0762e';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText(state.T.toFixed(0), 150, 66);
    ctx.fillStyle = '#62718a';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('K', 150, 138);
    thermoTex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      cylT: { x: 0, z: 0, w: 4.4, h: 4.2, label: '실린더 · 피스톤' },
      pSensT: { x: -3.6, z: -2.6, w: 3.2, h: 2.4, label: '압력 센서' },
      tSensT: { x: 3.6, z: -2.6, w: 3.2, h: 2.4, label: '온도 센서' },
      heatT: { x: 0, z: -4.6, w: 3.2, h: 2.2, label: '가열 장치' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: false, color: '#2f6ad0' });
      const m = new (B().StandardMaterial)('phM_' + id, scene);
      m.diffuseTexture = tex; m.opacityTexture = tex;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.specularColor = new (B().Color3)(0, 0, 0);
      m.backFaceCulling = false;
      p.material = m;
      holders[id] = p;
    });
    holders._spec = spec;
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
    Object.entries(holders).forEach(([id, h]) => {
      if (id !== '_spec') h.setEnabled(!placed[id]);
    });
    reset();
  }
  function dropAt(id, point) {
    const c = holders._spec[id];
    return (Math.abs(point.x - c.x) <= 3.6 && Math.abs(point.z - c.z) <= 3.0) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     실제 실험에서 손으로 하는 동작을 그대로 옮긴다.
       · 등온 · 단열 — 주사기를 밀고 당기듯 «피스톤 손잡이를 위아래로 끈다»
       · 등압 · 등적 — 가열기 옆 «＋ / －» 를 눌러 불꽃을 세게·약하게 한다
     값의 범위와 계산은 하단 슬라이더와 똑같이 유지한다.               */
  let stepT = null;              // 가열기 ＋ / － 단추
  let dragPiston = null;         // { dy } 잡은 지점과 피스톤 높이의 차
  let onChangeCb = null;         // 3D 에서 조작해도 측정값이 갱신되도록

  /** 부피를 손으로 바꿀 수 있는 과정인가 (하단 V 슬라이더가 뜨는 과정과 같다) */
  const canDragPiston = () => state.process === 'isothermal' || state.process === 'adiabatic';
  /** 가열기로 온도를 바꿀 수 있는 과정인가 (단열은 Q = 0 이므로 가열하지 않는다) */
  const canHeat = () => state.process === 'isobaric' || state.process === 'isochoric';

  function buildStepper() {
    stepT = LabUI.makeStepper(scene, 'Temp', { addColor: '#e0632c' });
  }

  /** 단추 자리 — 버너 앞쪽에 두어 실린더·센서와 겹치지 않게 한다 */
  function layoutSteppers() {
    if (!stepT) return;
    stepT.place(0, 0.95, -2.4, 0.85);
    stepT.setEnabled(allPlaced() && canHeat());
  }

  /** 3D 에서 바꾼 값을 미세 조정용 슬라이더에도 되비친다 */
  function syncSliders() {
    const set = (id, v, txt) => {
      const el = document.querySelector('#' + id);
      const out = document.querySelector('#' + id + 'Out');
      if (el) el.value = v;
      if (out) out.textContent = txt;
    };
    set('vCtl', state.V.toFixed(1), `${state.V.toFixed(1)} L`);
    set('tCtl', Math.round(state.T), `${Math.round(state.T)} K`);
  }

  /** 직접 조작 뒤 — 경로에 점을 찍고 화면과 측정값을 갱신한다 */
  function afterHandsOn() {
    path.push({ P: P(), V: state.V, proc: state.process });
    if (path.length > 300) path.shift();
    layout();
    syncSliders();
    if (onChangeCb) onChangeCb();
  }

  /** 가열기 ＋ / － — 슬라이더와 같은 200~600 K 안에서 10 K 씩 바꾼다 */
  function bumpT(d) {
    if (!allPlaced() || !canHeat()) return;
    const t = Math.max(200, Math.min(600, Math.round((state.T + d * 10) / 5) * 5));
    if (t === state.T) return;
    state.T = t;
    if (state.process === 'isobaric') {
      // V/T = 일정 — 슬라이더와 똑같은 계산
      state.V = anchor.V * state.T / anchor.T;
      state.V = Math.min(11, Math.max(1.5, state.V));
    }
    afterHandsOn();
  }

  /** 화면 위 한 점을 실린더 축을 지나는 «세로 평면» 위의 높이로 바꾼다 */
  function pointerY() {
    const fwd = camera.getForwardRay().direction;
    const n = new (B().Vector3)(fwd.x, 0, fwd.z);
    if (n.length() < 0.15) return null;      // 거의 바로 위에서 내려다보는 각도면 잡지 않는다
    n.normalize();
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(new (B().Vector3)(0, cylG.position.y, 0), n);
    const d = ray.intersectsPlane(plane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d)).y;
  }

  /** 피스톤 윗면의 현재 높이 (세계 좌표) */
  const pistonWorldY = () => cylG.position.y + state.V * H_PER_L + 0.17;

  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const nm = pi.pickInfo && pi.pickInfo.pickedMesh ? pi.pickInfo.pickedMesh.name : '';
      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced()) return;                    // 배치가 끝나기 전에는 조작하지 않는다
        if (nm === 'btnAddTemp') { bumpT(+1); return; }
        if (nm === 'btnSubTemp') { bumpT(-1); return; }
        if (/^(gaPiston|gaRod|gaGrip)/.test(nm) && canDragPiston()) {
          const y = pointerY();
          if (y === null) return;
          dragPiston = { dy: pistonWorldY() - y };
          camera.detachControl();
        }
      } else if (pi.type === T.POINTERMOVE && dragPiston) {
        const y = pointerY();
        if (y === null) return;
        const h = (y + dragPiston.dy) - cylG.position.y - 0.17;
        const v = Math.max(2, Math.min(10, +(h / H_PER_L).toFixed(1)));
        if (v === state.V) return;
        state.V = v;
        if (state.process === 'adiabatic') {
          // TV^(γ−1) = 일정 — 슬라이더와 똑같은 계산
          state.T = anchor.T * Math.pow(anchor.V / state.V, GAMMA - 1);
        }
        afterHandsOn();
      } else if (pi.type === T.POINTERUP && dragPiston) {
        dragPiston = null;
        camera.attachControl(canvas, true);
      }
    });
  }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.V = 5; state.T = 300;
    anchor = { V: 5, T: 300 };
    path = [{ P: P(), V: state.V, proc: state.process }];
    sim = { t: 0 };
    layout();
  }

  /** 과정을 바꾸면 현재 상태가 새 출발점이 된다 */
  function rebase() {
    anchor = { V: state.V, T: state.T };
    path.push({ P: P(), V: state.V, proc: state.process });
  }

  /** 피스톤·손잡이 자리 — 부피가 높이를 정한다 */
  function placePiston(h) {
    piston.position.y = h + 0.17;
    pistonRod.position.y = h + 1.5;
    pistonGrip.position.y = h + 2.82;
    // 끌 수 있는 과정에서는 손잡이가 주황빛, 잠긴 과정에서는 회색으로 보인다
    pistonGrip.material.diffuseColor =
      B().Color3.FromHexString(canDragPiston() ? '#e0912c' : '#7a8494');
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    layoutSteppers();

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다 (실험대는 항상 보임)
    if (!all) {
      cylG.setEnabled(!!placed.cylT);
      pGauge.setEnabled(!!placed.pSensT);
      tGauge.setEnabled(!!placed.tSensT);
      if (heaterG) heaterG.setEnabled(!!placed.heatT && !!placed.cylT);
      if (placed.cylT) {
        placePiston(state.V * H_PER_L);
        drawGauges();
      }
      return;
    }
    cylG.setEnabled(true);
    pGauge.setEnabled(true);
    tGauge.setEnabled(true);

    placePiston(state.V * H_PER_L);
    // 버너 몸체는 항상, 화염은 가열(고온) 중에만
    heaterG.setEnabled(true);
    for (let i = 0; i < 5; i++) {
      if (heaterG['_fl' + i]) heaterG['_fl' + i].setEnabled(state.T > 380);
    }
    drawGauges();
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;
    // 분자 운동: 속력 ∝ √T, 피스톤 높이 아래에서 벽 반사
    const h = state.V * H_PER_L;
    const sp = 1.6 * Math.sqrt(state.T / 300);
    const HW = CYL_W / 2 - 0.2;
    parts.forEach((p) => {
      p.x += p.vx * sp * dt; p.y += p.vy * sp * dt * 1.4; p.z += p.vz * sp * dt;
      if (p.x > HW) { p.x = HW; p.vx = -Math.abs(p.vx); }
      if (p.x < -HW) { p.x = -HW; p.vx = Math.abs(p.vx); }
      if (p.z > HW) { p.z = HW; p.vz = -Math.abs(p.vz); }
      if (p.z < -HW) { p.z = -HW; p.vz = Math.abs(p.vz); }
      if (p.y > h - 0.15) { p.y = h - 0.15; p.vy = -Math.abs(p.vy); }
      if (p.y < 0.15) { p.y = 0.15; p.vy = Math.abs(p.vy); }
      p.m.position.set(p.x, p.y, p.z);
      // 온도에 따라 분자 색 (차가움 파랑 → 뜨거움 주황)
      const k = Math.min(1, Math.max(0, (state.T - 200) / 400));
      p.m.material.emissiveColor = new (B().Color3)(0.35 + k * 0.6, 0.55 - k * 0.15, 0.95 - k * 0.7);
    });
    sim.t += dt;
    return false;   // 측정값은 슬라이더 변경 때 갱신
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.3;
    camera.beta = 1.15;
    camera.radius = 18;
    camera.setTarget(new (B().Vector3)(0, 3.2, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '과정을 고른 뒤 <b>피스톤 손잡이를 끌거나</b> 가열기의 <b>＋ · －</b> 를 눌러 보세요. 압력·온도 센서가 실시간으로 반응하고, P–V 그래프에 경로가 그려집니다.';
  const prepGuide = '점선 자리에 실린더·압력 센서·온도 센서·가열 장치를 끌어다 놓아 실험을 준비하세요.';

  const PROC_NAMES = {
    isothermal: '등온 (보일 법칙)', isobaric: '등압 (샤를 법칙)',
    isochoric: '등적 (게이뤼삭)', adiabatic: '단열',
  };

  function controlsHTML() {
    const procBtns = LabUI.opts('열역학 과정<br>(66쪽)', 'process', [
      { v: 'isothermal', t: '등온 (탐구1)' }, { v: 'isobaric', t: '등압 (탐구2)' },
      { v: 'isochoric', t: '등적 (탐구3)' }, { v: 'adiabatic', t: '단열' },
    ], state.process, 2);

    const vSlider = LabUI.slider('vCtl', '부피 <i>V</i>',
      { min: 2, max: 10, step: 0.1, value: state.V, fmt: (v) => `${(+v).toFixed(1)} L` });
    const tSlider = LabUI.slider('tCtl', '온도 <i>T</i>',
      { min: 200, max: 600, step: 5, value: state.T, fmt: (v) => `${v} K` });

    const useV = state.process === 'isothermal' || state.process === 'adiabatic';
    // 과정마다 «손으로 하는 동작» 이 다르다
    const handsOn = useV
      ? `<b>피스톤 손잡이를 잡고 위아래로 끌어</b> 부피를 바꿉니다 —
         주사기를 밀고 당기듯 해 보세요.
         ${state.process === 'adiabatic' ? '단열이라 가열기는 쓰지 않습니다 (<i>Q</i> = 0).' : ''}`
      : (state.process === 'isochoric'
        ? `피스톤이 <b>고정</b>되어 있어 끌리지 않습니다.
           가열기의 <b>＋ · －</b> 를 눌러 온도만 바꿔 보세요.`
        : `가열기의 <b>＋ · －</b> 를 누르면 기체가 데워지고
           <b>피스톤이 저절로 올라갑니다</b>.`);

    return `
      ${procBtns}
      ${useV ? vSlider : tSlider}
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">${handsOn}</p></div>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록

    LabUI.bindOpts(root, 'process', state, 'process', () => {
      rebase();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      layout();                 // 과정이 바뀌면 손잡이·＋/－ 도 함께 바뀐다
      onChange();
    }, String);

    const vEl = root.querySelector('#vCtl');
    if (vEl) {
      LabUI.bindSlider(root, 'vCtl', state, 'V', (v) => `${(+v).toFixed(1)} L`, () => {
        if (state.process === 'adiabatic') {
          // TV^(γ−1) = 일정
          state.T = anchor.T * Math.pow(anchor.V / state.V, GAMMA - 1);
        }
        path.push({ P: P(), V: state.V, proc: state.process });
        if (path.length > 300) path.shift();
        layout();
        onChange();
      });
    }
    const tEl = root.querySelector('#tCtl');
    if (tEl) {
      LabUI.bindSlider(root, 'tCtl', state, 'T', (v) => `${v} K`, () => {
        if (state.process === 'isobaric') {
          // V/T = 일정
          state.V = anchor.V * state.T / anchor.T;
          state.V = Math.min(11, Math.max(1.5, state.V));
        }
        path.push({ P: P(), V: state.V, proc: state.process });
        if (path.length > 300) path.shift();
        layout();
        onChange();
      });
    }
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    const { Q, W, dU } = processQW();
    const sgn = (x) => (x > 0.05 ? '+' : '') + x.toFixed(1);
    const explain = {
      isothermal: 'ΔU = 0 → 흡수한 열이 전부 일이 됩니다 (Q = W)',
      isobaric: 'Q = ΔU + PΔV — 열이 내부 에너지와 일로 나뉩니다',
      isochoric: 'W = 0 → 흡수한 열이 전부 내부 에너지가 됩니다 (Q = ΔU)',
      adiabatic: 'Q = 0 → 팽창하면 온도가 내려가고, 압축하면 올라갑니다 (W = −ΔU)',
    };
    return `
      <div class="row"><span>과정</span><b>${PROC_NAMES[state.process]}</b></div>
      <div class="row"><span>압력 <i>P</i></span><b class="big">${P().toFixed(1)} kPa</b></div>
      <div class="row"><span>부피 <i>V</i></span><b>${state.V.toFixed(1)} L</b></div>
      <div class="row"><span>온도 <i>T</i></span><b>${state.T.toFixed(0)} K</b></div>
      <div class="row"><span><i>PV</i>/<i>T</i> = <i>nR</i></span>
        <b>${(P() * state.V / state.T).toFixed(3)} J/K (일정!)</b></div>
      <div class="row"><span>내부 에너지 <i>U</i> = 3/2 <i>nRT</i></span><b>${U().toFixed(0)} J</b></div>
      <div class="sec">이번 과정의 열역학 제1법칙</div>
      <div class="row"><span>흡수한 열 <i>Q</i></span><b>${sgn(Q)} J</b></div>
      <div class="row"><span>내부 에너지 변화 Δ<i>U</i></span><b>${sgn(dU)} J</b></div>
      <div class="row"><span>기체가 한 일 <i>W</i></span><b>${sgn(W)} J</b></div>
      <div class="row"><span><i>Q</i> = Δ<i>U</i> + <i>W</i></span>
        <b>${sgn(dU + W)} J ✓</b></div>
      <div class="formula">${explain[state.process]}</div>`;
  }

  /* ══ 그래프 — P-V 도표 ══════════════════════ */
  const graphTitle = 'P–V 그래프 (그림 II-13)';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 40, padR = 10, padT = 14, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;
    const VMAX = 11, PMAX = 500;
    const xOf = (v) => padL + (v / VMAX) * gw;
    const yOf = (p) => padT + gh - (Math.min(p, PMAX) / PMAX) * gh;

    // 등온선 (T = 200~600)
    [200, 300, 400, 500, 600].forEach((T) => {
      ctx.strokeStyle = 'rgba(255,255,255,.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 50; i++) {
        const v = 1.5 + (i / 50) * (VMAX - 1.5);
        const p = N_MOL * R * T / v;
        if (i === 0) ctx.moveTo(xOf(v), yOf(p)); else ctx.lineTo(xOf(v), yOf(p));
      }
      ctx.stroke();
    });

    // 경로
    const cols = { isothermal: '#5ad0f0', isobaric: '#69d98c', isochoric: '#ffd84a', adiabatic: '#e8577a' };
    for (let i = 1; i < path.length; i++) {
      ctx.strokeStyle = cols[path[i].proc] || '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xOf(path[i - 1].V), yOf(path[i - 1].P));
      ctx.lineTo(xOf(path[i].V), yOf(path[i].P));
      ctx.stroke();
    }
    // 현재 점
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(xOf(state.V), yOf(P()), 4.5, 0, 7); ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let v = 2; v <= 10; v += 2) ctx.fillText(String(v), xOf(v), padT + gh + 4);
    ctx.textAlign = 'right';
    ctx.fillText('V (L)', W2 - 4, padT + gh + 12);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let p = 100; p <= PMAX; p += 100) ctx.fillText(String(p), padL - 4, yOf(p));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = cols.isothermal; ctx.fillText('등온', padL + 6, padT + 2);
    ctx.fillStyle = cols.isobaric; ctx.fillText('등압', padL + 38, padT + 2);
    ctx.fillStyle = cols.isochoric; ctx.fillText('등적', padL + 70, padT + 2);
    ctx.fillStyle = cols.adiabatic; ctx.fillText('단열', padL + 102, padT + 2);
  }

  function graphFootHTML() {
    return '그래프 <b>아래 넓이가 기체가 한 일</b>입니다 · 옅은 곡선은 등온선 — 단열선은 등온선보다 가파릅니다';
  }

  /* ══ 기록표 (탐구 60쪽) ═════════════════════ */
  const recordColumns = [
    '과정', '<i>P</i> (kPa)', '<i>V</i> (L)', '<i>T</i> (K)',
    '<i>Q</i> (J)', 'Δ<i>U</i> (J)', '<i>W</i> (J)',
  ];

  function recordRow() {
    const { Q, W, dU } = processQW();
    return [[PROC_NAMES[state.process], P().toFixed(1), state.V.toFixed(1), state.T.toFixed(0),
      Q.toFixed(1), dU.toFixed(1), W.toFixed(1)]];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0~2 네 과정 살펴보기 · 3 단열 과정에서 Q = 0 확인 · 4 기록 4줄        */
  const mis = { proc: {}, base: {} };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    // 그 과정에서 «부피나 온도를 실제로 바꿔 본» 경우에만 관찰한 것으로 본다
    const b = mis.base[state.process];
    if (!b) mis.base[state.process] = { V: state.V, T: state.T };
    else if (Math.abs(state.V - b.V) > 0.4 || Math.abs(state.T - b.T) > 8) mis.proc[state.process] = true;
    if (i === 0) return !!mis.proc.isothermal;
    if (i === 1) return !!mis.proc.isobaric;
    if (i === 2) return !!mis.proc.isochoric;
    if (i === 3) return !!mis.proc.adiabatic;
    if (i === 4) return new Set(recs().map((r) => String(r[0]))).size >= 3 && recs().length >= 4;
    return false;
  }

  return {
    missionDone,
    id: 'gas',
    title: '기체 실험실 — 센서로 재는 P · V · T',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, P, U, processQW,
    get anchor() { return anchor; },
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
