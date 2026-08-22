/**
 * 일차원 충돌 상황에서 운동량 보존 확인하기
 * 비상교육 고등 물리학 I-1-03 (교과서 30~34쪽), 핵심 탐구 33쪽
 *
 * 레일 위 역학 수레 A·B 를 충돌시켜 충돌 전후의 운동량 합을 비교한다.
 * 충돌 유형(탄성 / 비탄성 / 완전비탄성)을 바꿔도 운동량은 늘 보존되지만
 * 운동 에너지는 완전탄성일 때만 보존된다는 점이 드러나게 했다.
 */
const CollisionScene = (() => {
  const B = () => BABYLON;

  const M = 8;              // 1 m = 8 scene unit
  const RAIL_L = 3.0;       // 레일 길이 (m)
  const X0 = -RAIL_L / 2;   // 레일 왼쪽 끝 (m)
  const X1 = RAIL_L / 2;
  const TABLE_Y = 0;
  const CART_H = 0.55;

  let scene, camera;
  let cartA, cartB, rail, sensorL, sensorR;
  let trailA, trailB;
  let placed = {};

  const state = {
    mA: 0.5,        // kg
    mB: 0.5,
    vA: 1.2,        // m/s (오른쪽이 +)
    type: 'inelastic',  // elastic | inelastic | perfect
    running: false,
  };

  /** 충돌 후 속도. 반발계수 e 로 세 가지 경우를 한 식으로 다룬다. */
  const E_OF = { elastic: 1, inelastic: 0.5, perfect: 0 };

  // 충돌 순간의 기록 (readout·그래프·기록표가 함께 쓴다)
  let sim = null;

  const tools = [
    { id: 'rail', label: '레일 (실험대)', icon: 'rail' },
    { id: 'carts', label: '역학 수레 2개', icon: 'cart' },
    { id: 'sensors', label: '운동 센서 2개', icon: 'sensor' },
  ];

  const slots = {
    rail: { x: 0, r: 1.8, name: '레일' },
    carts: { x: 0, r: 1.4, name: '역학 수레' },
    sensors: { x: 0, r: 1.9, name: '운동 센서' },
  };

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c3ddf2ff');

    camera = new (B().ArcRotateCamera)(
      'camCol', -Math.PI / 2 + 0.30, 1.02, 21, new (B().Vector3)(0, 1.0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 48;
    camera.upperBetaLimit = 1.48;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hc', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.88;
    hemi.groundColor = new (B().Color3)(0.42, 0.46, 0.52);

    const dir = new (B().DirectionalLight)('dc', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 16, -10);
    dir.intensity = 0.4;

    buildTable();
    buildRail();
    cartA = buildCart('A', '#e8577a');
    cartB = buildCart('B', '#4a8fe0');
    buildSensors();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/collision.jpg', { x: -12, y: 0, z: 5, ry: 0.3 });

    buildSteppers();
    setupPointer(canvas);
    resetTools();
    return scene;
  }

  function mat(name, hex, spec, power) {
    const m = new (B().StandardMaterial)(name, scene);
    m.diffuseColor = B().Color3.FromHexString(hex);
    m.specularColor = spec ? B().Color3.FromHexString(spec) : new (B().Color3)(0.06, 0.06, 0.06);
    if (power) m.specularPower = power;
    return m;
  }

  function buildTable() {
    const t = B().MeshBuilder.CreateBox('cTable', { width: 34, height: 0.6, depth: 13 }, scene);
    t.position.set(0, TABLE_Y - 0.32, 0);
    t.material = mat('cTableMat', '#9aa3ad', '#c6ccd3', 96);
  }

  function buildRail() {
    rail = new (B().TransformNode)('railGroup', scene);
    const rm = mat('railMat', '#2f3742', '#7c8794', 72);

    const bar = B().MeshBuilder.CreateBox('rail', { width: RAIL_L * M, height: 0.22, depth: 1.5 }, scene);
    bar.position.set(0, TABLE_Y + 0.11, 0);
    bar.material = rm;
    bar.parent = rail;

    // 레일 위 홈 (수레가 굴러가는 자리)
    const groove = B().MeshBuilder.CreateBox('groove', { width: RAIL_L * M, height: 0.05, depth: 0.5 }, scene);
    groove.position.set(0, TABLE_Y + 0.24, 0);
    groove.material = mat('grooveMat', '#171c24');
    groove.parent = rail;

    // 거리 눈금
    const ruler = B().MeshBuilder.CreateGround('cRuler', { width: RAIL_L * M, height: 0.72 }, scene);
    ruler.position.set(0, TABLE_Y + 0.02, 1.35);
    const tex = new (B().DynamicTexture)('cRulerTex', { width: 1400, height: 84 }, scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = '#f2efe2';
    ctx.fillRect(0, 0, 1400, 84);
    ctx.strokeStyle = '#3c4756'; ctx.fillStyle = '#3c4756'; ctx.lineWidth = 2;
    const N = Math.round(RAIL_L * 10);
    for (let i = 0; i <= N; i++) {
      const x = 8 + (i / N) * 1384;
      ctx.beginPath(); ctx.moveTo(x, 84); ctx.lineTo(x, i % 5 === 0 ? 42 : 62); ctx.stroke();
    }
    ctx.font = 'bold 26px sans-serif';
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    for (let i = 0; i <= N; i += 5) {
      ctx.fillText((X0 + i / 10).toFixed(1), 8 + (i / N) * 1384, 6);
    }
    tex.update();
    const rmat = new (B().StandardMaterial)('cRulerMat', scene);
    rmat.diffuseTexture = tex;
    rmat.specularColor = new (B().Color3)(0, 0, 0);
    ruler.material = rmat;
    ruler.parent = rail;
  }

  function buildCart(name, hex) {
    const g = new (B().TransformNode)('cart' + name, scene);

    const body = B().MeshBuilder.CreateBox('cartBody' + name,
      { width: 1.6, height: CART_H * M * 0.5, depth: 1.15 }, scene);
    body.position.y = TABLE_Y + 0.22 + CART_H * M * 0.25;
    body.material = mat('cartMat' + name, hex, '#ffffff', 48);
    body.parent = g;

    // 이름표
    const label = B().MeshBuilder.CreatePlane('cartLabel' + name, { width: 1.0, height: 1.0 }, scene);
    label.position.set(0, body.position.y + 0.05, -0.59);
    label.rotation.y = Math.PI;
    const tex = new (B().DynamicTexture)('cartLabTex' + name, { width: 128, height: 128 }, scene, true);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 128, 128);
    // 판을 180° 돌려 붙이므로 글자를 미리 좌우로 뒤집어 둔다
    ctx.translate(128, 0); ctx.scale(-1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, 64, 68);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tex.hasAlpha = true; tex.update();
    const lm = new (B().StandardMaterial)('cartLabMat' + name, scene);
    lm.diffuseTexture = tex; lm.opacityTexture = tex;
    lm.emissiveColor = new (B().Color3)(1, 1, 1);
    lm.specularColor = new (B().Color3)(0, 0, 0);
    lm.backFaceCulling = false;
    label.material = lm;
    label.parent = g;

    // 바퀴
    const wm = mat('wheelMat' + name, '#20262f');
    [[-0.55, -0.5], [0.55, -0.5], [-0.55, 0.5], [0.55, 0.5]].forEach(([dx, dz], i) => {
      const w = B().MeshBuilder.CreateCylinder('w' + name + i, { height: 0.14, diameter: 0.44 }, scene);
      w.rotation.x = Math.PI / 2;
      w.position.set(dx, TABLE_Y + 0.44, dz);
      w.material = wm;
      w.parent = g;
    });

    // 범퍼 (충돌면)
    const bm = mat('bumperMat' + name, '#e8e2d0');
    [-1, 1].forEach((s, i) => {
      const b = B().MeshBuilder.CreateBox('bump' + name + i, { width: 0.14, height: 0.5, depth: 0.9 }, scene);
      b.position.set(s * 0.87, body.position.y, 0);
      b.material = bm;
      b.parent = g;
    });

    g._body = body;
    return g;
  }

  function buildSensors() {
    const make = (name, x) => {
      const g = new (B().TransformNode)(name, scene);
      const post = B().MeshBuilder.CreateBox(name + 'P', { width: 0.9, height: 2.0, depth: 0.9 }, scene);
      post.position.set(x * M, TABLE_Y + 1.0, 0);
      post.material = mat(name + 'PM', '#e4eaf2', '#ffffff', 64);
      post.parent = g;

      const eye = B().MeshBuilder.CreateCylinder(name + 'E', { height: 0.16, diameter: 0.5 }, scene);
      eye.rotation.z = Math.PI / 2;
      eye.position.set(x * M - Math.sign(x) * 0.5, TABLE_Y + 1.3, 0);
      eye.material = mat(name + 'EM', '#2f6ad0');
      eye.parent = g;

      const base = B().MeshBuilder.CreateBox(name + 'B', { width: 1.3, height: 0.2, depth: 1.3 }, scene);
      base.position.set(x * M, TABLE_Y + 0.1, 0);
      base.material = mat(name + 'BM', '#39424f');
      base.parent = g;
      return g;
    };
    sensorL = make('sensL', X0 - 0.12);
    sensorR = make('sensR', X1 + 0.12);
  }

  /** 수레가 지나온 자취 (속도가 일정한지 눈으로 보이게) */
  function buildTrail(name, hex) {
    const t = B().MeshBuilder.CreateBox(name, { width: 1, height: 0.04, depth: 0.16 }, scene);
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.emissiveColor = B().Color3.FromHexString(hex);
    m.disableLighting = true;
    m.alpha = 0.75;
    t.material = m;
    t.isPickable = false;
    return t;
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      rail: { z: 0, w: RAIL_L * M, h: 2.0 },
      carts: { z: 0, w: 6, h: 1.8 },
      sensors: { z: 0, w: RAIL_L * M + 3, h: 2.6 },
    };
    Object.entries(slots).forEach(([id, s]) => {
      const c = spec[id];
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(s.x * M, TABLE_Y + 0.04 + (id === 'carts' ? 0.02 : 0), c.z);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, s.name + ' 자리', { mirror: false, color: '#2f6ad0' });
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
    rail.setEnabled(!!placed.rail);
    cartA.setEnabled(!!placed.carts);
    cartB.setEnabled(!!placed.carts);
    sensorL.setEnabled(!!placed.sensors);
    sensorR.setEnabled(!!placed.sensors);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    reset();
  }

  function dropAt(id, point) {
    const s = slots[id];
    // 레일 위(z 근처)에 놓았는지 본다
    return (Math.abs(point.x / M - s.x) <= s.r && Math.abs(point.z) <= 2.6) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 물리 ═══════════════════════════════════ */
  /** 충돌 후 두 속도. 운동량 보존 + 반발계수 정의로 푼다. */
  function afterCollision(mA, mB, vA, vB, e) {
    const p = mA * vA + mB * vB;
    const tot = mA + mB;
    return {
      vA2: (p - mB * e * (vA - vB)) / tot,
      vB2: (p + mA * e * (vA - vB)) / tot,
    };
  }

  function reset() {
    state.running = false;
    const e = E_OF[state.type];
    const vB = 0;                       // B 는 처음에 정지 (교과서 조건)
    const after = afterCollision(state.mA, state.mB, state.vA, vB, e);

    sim = {
      t: 0,
      xA: X0 + 0.35, xB: 0,             // B 는 실험대 가운데
      vA: state.vA, vB,
      collided: false,
      before: { vA: state.vA, vB },
      after,
      stuck: state.type === 'perfect',
    };
    layout();
  }

  const halfCart = 0.115;   // 수레 절반 길이 (m, 범퍼 포함)

  function layout() {
    if (!sim) return;
    cartA.position.x = sim.xA * M;
    cartB.position.x = sim.xB * M;
    layoutSteppers();
    if (trailA) { trailA.dispose(); trailA = null; }
    if (trailB) { trailB.dispose(); trailB = null; }
  }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     · 수레 A 를 왼쪽으로 «뒤로 끌었다 놓으면» 그만큼 빠르게 출발한다
     · 수레 위 ＋ / － 로 각 수레의 질량을 바꾼다                     */
  let stepA = null, stepB = null;
  let pull = null;                 // { x0 }
  let onChangeCb = null;

  function buildSteppers() {
    stepA = LabUI.makeStepper(scene, 'MA');
    stepB = LabUI.makeStepper(scene, 'MB');
  }

  function layoutSteppers() {
    if (!stepA || !sim) return;
    const on = allPlaced();
    stepA.place(sim.xA * M, TABLE_Y + 3.5, -1.0, 0.9);
    stepB.place(sim.xB * M, TABLE_Y + 3.5, -1.0, 0.9);
    stepA.setEnabled(on); stepB.setEnabled(on);
  }

  function bumpMass(which, d) {
    const key = which === 'A' ? 'mA' : 'mB';
    state[key] = Math.max(0.2, Math.min(1.5, +(state[key] + d * 0.1).toFixed(1)));
    reset();
    layoutSteppers();
    if (onChangeCb) onChangeCb();
  }

  function pointerXm() {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(
      new (B().Vector3)(0, TABLE_Y + CART_H, 0), new (B().Vector3)(0, 1, 0));
    const d = ray.intersectsPlane(plane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d)).x / M;
  }

  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const nm = pi.pickInfo && pi.pickInfo.pickedMesh ? pi.pickInfo.pickedMesh.name : '';
      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced()) return;
        if (nm === 'btnAddMA') { bumpMass('A', +1); return; }
        if (nm === 'btnSubMA') { bumpMass('A', -1); return; }
        if (nm === 'btnAddMB') { bumpMass('B', +1); return; }
        if (nm === 'btnSubMB') { bumpMass('B', -1); return; }
        if (/A$|A\d$/.test(nm) && /^(cartBody|bump|w)/.test(nm) && !state.running) {
          const x = pointerXm();
          if (x === null) return;
          pull = { x0: x };
          camera.detachControl();
        }
      } else if (pi.type === T.POINTERMOVE && pull) {
        const x = pointerXm();
        if (x === null) return;
        // 왼쪽으로 끈 거리만큼 «세게» 출발한다 (고무줄을 당기듯)
        const back = Math.max(0, pull.x0 - x);
        state.vA = Math.max(0.4, Math.min(2.5, +(0.4 + back * 2.2).toFixed(1)));
        if (sim) { sim.xA = (X0 + 0.35) - Math.min(0.55, back); layout(); layoutSteppers(); }
        if (onChangeCb) onChangeCb();
      } else if (pi.type === T.POINTERUP && pull) {
        pull = null;
        camera.attachControl(canvas, true);
        reset();
        state.running = true;                 // 놓으면 바로 출발
        const btn = document.querySelector('#runBtn');
        if (btn) { btn.textContent = '진행중'; btn.classList.add('run'); }
        if (onChangeCb) onChangeCb();
      }
    });
  }

  /** 매 프레임 진행. 화면을 다시 그려야 하면 true */
  function tick(dt) {
    if (!sim || !state.running) return false;

    sim.t += dt;
    sim.xA += sim.vA * dt;
    sim.xB += sim.vB * dt;

    // 충돌 판정
    if (!sim.collided && sim.xA + halfCart >= sim.xB - halfCart) {
      sim.collided = true;
      // 겹친 만큼 되돌려 접촉 순간으로 맞춘다
      const over = (sim.xA + halfCart) - (sim.xB - halfCart);
      sim.xA -= over / 2; sim.xB += over / 2;
      sim.vA = sim.after.vA2;
      sim.vB = sim.after.vB2;
    }

    // 레일 끝에서 멈춘다
    const lo = X0 + halfCart, hi = X1 - halfCart;
    if (sim.xA <= lo) { sim.xA = lo; sim.vA = 0; }
    if (sim.xB >= hi) { sim.xB = hi; sim.vB = 0; }
    if (sim.xB <= lo) { sim.xB = lo; sim.vB = 0; }
    if (sim.xA >= hi) { sim.xA = hi; sim.vA = 0; }

    // 완전비탄성이면 붙어서 함께 간다
    if (sim.collided && sim.stuck) sim.xA = sim.xB - halfCart * 2;

    if (sim.vA === 0 && sim.vB === 0) state.running = false;

    cartA.position.x = sim.xA * M;
    cartB.position.x = sim.xB * M;
    return true;
  }

  function update() {
    if (!sim) reset();
    else { cartA.position.x = sim.xA * M; cartB.position.x = sim.xB * M; }
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.30;
    camera.beta = 1.02;
    camera.radius = 21;
    camera.setTarget(new (B().Vector3)(0, 1.0, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = 'A 의 질량·속도와 B 의 질량을 정하고 «출발» 을 눌러 충돌시켜 보세요. 충돌 전후의 운동량 합을 비교합니다.';
  const prepGuide = '점선으로 표시된 자리에 레일·수레·운동 센서를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    return `
      ${LabUI.slider('mA', 'A 의 질량<br><i>m</i><sub>A</sub>',
        { min: 0.2, max: 1.5, step: 0.1, value: state.mA, fmt: (v) => `${v.toFixed(1)} kg` })}
      ${LabUI.slider('mB', 'B 의 질량<br><i>m</i><sub>B</sub>',
        { min: 0.2, max: 1.5, step: 0.1, value: state.mB, fmt: (v) => `${v.toFixed(1)} kg` })}
      ${LabUI.slider('vA', 'A 의 처음<br>속도 <i>v</i><sub>A</sub>',
        { min: 0.4, max: 2.5, step: 0.1, value: state.vA, fmt: (v) => `${v.toFixed(1)} m/s` })}
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          수레 <b>A 를 왼쪽으로 끌었다 놓으면</b> 그만큼 빠르게 출발합니다.
          수레 위 <b>＋ · －</b> 로 질량을 바꿉니다.
        </p></div>
      </div>
      ${LabUI.opts('충돌의<br>종류', 'type', [
        { v: 'elastic', t: '탄성 (튕김)' },
        { v: 'inelastic', t: '비탄성' },
        { v: 'perfect', t: '완전비탄성 (붙음)' },
      ], state.type, 2)}
      <div class="control">
        <div class="clabel">실험</div>
        <button class="power${state.running ? ' run' : ''}" id="runBtn">${state.running ? '진행중' : '▶ 출발'}</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 되돌리기</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록
    const after = () => { reset(); onChange(); };
    LabUI.bindSlider(root, 'mA', state, 'mA', (v) => `${v.toFixed(1)} kg`, after);
    LabUI.bindSlider(root, 'mB', state, 'mB', (v) => `${v.toFixed(1)} kg`, after);
    LabUI.bindSlider(root, 'vA', state, 'vA', (v) => `${v.toFixed(1)} m/s`, after);
    LabUI.bindOpts(root, 'type', state, 'type', after, String);

    const run = root.querySelector('#runBtn');
    run.addEventListener('click', () => {
      if (sim && sim.collided) reset();     // 이미 끝났으면 다시 출발
      state.running = !state.running;
      run.textContent = state.running ? '진행중' : '▶ 출발';
      run.classList.toggle('run', state.running);
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      run.textContent = '▶ 출발';
      run.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function momenta() {
    const b = sim.before, a = sim.after;
    return {
      pA1: state.mA * b.vA, pB1: state.mB * b.vB,
      pA2: state.mA * a.vA2, pB2: state.mB * a.vB2,
      kA1: 0.5 * state.mA * b.vA ** 2, kB1: 0.5 * state.mB * b.vB ** 2,
      kA2: 0.5 * state.mA * a.vA2 ** 2, kB2: 0.5 * state.mB * a.vB2 ** 2,
    };
  }

  function readoutHTML() {
    if (!sim) return '';
    const m = momenta();
    const p1 = m.pA1 + m.pB1, p2 = m.pA2 + m.pB2;
    const k1 = m.kA1 + m.kB1, k2 = m.kA2 + m.kB2;
    const done = sim.collided;

    return `
      <div class="sec" style="margin-top:0;padding-top:0;border:0">충돌 전</div>
      <div class="row"><span>A 의 속도 <i>v</i><sub>A</sub></span><b>${sim.before.vA.toFixed(2)} m/s</b></div>
      <div class="row"><span>B 의 속도 <i>v</i><sub>B</sub></span><b>${sim.before.vB.toFixed(2)} m/s</b></div>
      <div class="row"><span>운동량의 합</span><b>${p1.toFixed(3)} kg·m/s</b></div>

      <div class="sec">충돌 후 ${done ? '' : '(예상)'}</div>
      <div class="row"><span>A 의 속도 <i>v</i><sub>A</sub>′</span><b>${sim.after.vA2.toFixed(2)} m/s</b></div>
      <div class="row"><span>B 의 속도 <i>v</i><sub>B</sub>′</span><b>${sim.after.vB2.toFixed(2)} m/s</b></div>
      <div class="row"><span>운동량의 합</span><b>${p2.toFixed(3)} kg·m/s</b></div>

      <div class="sec">비교</div>
      <div class="row"><span>운동량</span><span class="tag ok">보존됨</span></div>
      <div class="row"><span>운동 에너지</span>
        <b>${k1.toFixed(3)} → ${k2.toFixed(3)} J</b></div>
      <div class="row"><span>에너지 손실</span>
        <b class="big">${Math.max(0, (1 - k2 / k1) * 100).toFixed(0)} %</b></div>
      <div class="formula"><i>m</i><sub>A</sub><i>v</i><sub>A</sub> + <i>m</i><sub>B</sub><i>v</i><sub>B</sub>
        = <i>m</i><sub>A</sub><i>v</i><sub>A</sub>′ + <i>m</i><sub>B</sub><i>v</i><sub>B</sub>′</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '충돌 전후의 운동량과 운동 에너지';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);
    if (!sim) return;
    const m = momenta();

    const pad = 26, gap = 18;
    const colW = (W - pad * 2 - gap) / 2;
    const baseY = H - 30;
    const topY = 26;
    // 탄성 충돌에서 A 가 뒤로 튕기면 |pA′|+|pB′| 가 충돌 전보다 커질 수 있다
    const sumAbs = (...vs) => vs.reduce((s, v) => s + Math.abs(v), 0);
    const maxP = Math.max(0.001, sumAbs(m.pA1, m.pB1), sumAbs(m.pA2, m.pB2)) * 1.15;
    const maxK = Math.max(0.001, m.kA1 + m.kB1) * 1.25;

    // 운동량은 음수가 될 수 있으므로 기준선을 가운데에 두고 위(＋)·아래(−)로 나눠 쌓는다
    const pBase = topY + (baseY - topY) * 0.5;
    const pSpan = (baseY - topY) * 0.5 - 4;

    const wHalf = colW / 2 - 4;
    const stack = (x, w, label, parts, max, base, span) => {
      let accP = 0, accN = 0;
      parts.forEach((p) => {
        const ph = (Math.abs(p.v) / max) * span;
        ctx.fillStyle = p.c;
        if (p.v >= 0) {
          ctx.fillRect(x, base - accP - ph, w, Math.max(1, ph));
          accP += ph;
        } else {
          ctx.fillRect(x, base + accN, w, Math.max(1, ph));
          accN += ph;
        }
      });
      const total = parts.reduce((s, p) => s + p.v, 0);
      ctx.fillStyle = '#e8eef6';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(total.toFixed(2), x + w / 2, baseY + 3);
      ctx.fillStyle = '#9fb0c2';
      ctx.font = '10px sans-serif';
      ctx.fillText(label, x + w / 2, baseY + 15);
    };

    const A = '#e8577a', Bc = '#4a8fe0';
    stack(pad, wHalf, '전', [{ v: m.pA1, c: A }, { v: m.pB1, c: Bc }], maxP, pBase, pSpan);
    stack(pad + wHalf + 8, wHalf, '후', [{ v: m.pA2, c: A }, { v: m.pB2, c: Bc }], maxP, pBase, pSpan);
    stack(pad + colW + gap, wHalf, '전', [{ v: m.kA1, c: A }, { v: m.kB1, c: Bc }], maxK, baseY, baseY - topY);
    stack(pad + colW + gap + wHalf + 8, wHalf, '후', [{ v: m.kA2, c: A }, { v: m.kB2, c: Bc }], maxK, baseY, baseY - topY);

    // 운동량 0 기준선 (왼쪽 두 막대에만)
    ctx.strokeStyle = 'rgba(255,255,255,.34)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad - 5, pBase); ctx.lineTo(pad + colW + 5, pBase); ctx.stroke();
    ctx.fillStyle = '#8e9bad';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('0', pad + colW + 8, pBase);

    // 아래 기준선
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(W, baseY); ctx.stroke();

    // 제목과 범례
    ctx.fillStyle = '#cfe0f2';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('운동량 (kg·m/s)', pad + colW / 2, 5);
    ctx.fillText('운동 에너지 (J)', pad + colW + gap + colW / 2, 5);

    ctx.textAlign = 'left';
    ctx.fillStyle = A; ctx.fillRect(W - 66, 7, 9, 9);
    ctx.fillText('A', W - 53, 6);
    ctx.fillStyle = Bc; ctx.fillRect(W - 34, 7, 9, 9);
    ctx.fillText('B', W - 21, 6);
  }

  function graphFootHTML() {
    if (!sim) return '';
    const m = momenta();
    const k1 = m.kA1 + m.kB1, k2 = m.kA2 + m.kB2;
    const kept = (k2 / k1 * 100).toFixed(0);
    return `운동량은 충돌 종류와 상관없이 <b>항상 보존</b> ·
            운동 에너지는 <b>${kept} %</b> 만 남음
            ${state.type === 'elastic' ? '(탄성 충돌이라 모두 보존)' : ''}`;
  }

  /* ══ 기록표 (교과서 33쪽 표) ═════════════════ */
  const recordColumns = [
    'A의 질량 <i>m</i><sub>A</sub>', 'B의 질량 <i>m</i><sub>B</sub>',
    '충돌 전 <i>v</i><sub>A</sub>', '충돌 후 <i>v</i><sub>A</sub>′', '충돌 후 <i>v</i><sub>B</sub>′',
    '충돌 전 운동량의 합', '충돌 후 운동량의 합',
  ];

  function recordRow() {
    if (!sim) return null;
    const m = momenta();
    return [
      state.mA.toFixed(1), state.mB.toFixed(1),
      sim.before.vA.toFixed(2), sim.after.vA2.toFixed(2), sim.after.vB2.toFixed(2),
      (m.pA1 + m.pB1).toFixed(3), (m.pA2 + m.pB2).toFixed(3),
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 충돌 실행 · 1 운동량 보존 기록 · 2 탄성 충돌 · 3 완전 비탄성(한 덩어리)
     4 질량이 다른 조건으로 기록 3줄                                       */
  const mis = { ran: false, types: {}, massDiff: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.running) {
      mis.ran = true;
      mis.types[state.type] = true;
      if (Math.abs(state.mA - state.mB) > 1e-6) mis.massDiff = true;
    }
    if (i === 0) return mis.ran;
    if (i === 1) {
      return recs().some((r) => r.length >= 7
        && Math.abs(parseFloat(r[5]) - parseFloat(r[6])) < 0.005);
    }
    if (i === 2) return !!mis.types.elastic;
    if (i === 3) return !!mis.types.perfect;
    if (i === 4) {
      return mis.massDiff && recs().filter((r) => Math.abs(parseFloat(r[0]) - parseFloat(r[1])) > 1e-6).length >= 1
        && recs().length >= 3;
    }
    return false;
  }

  return {
    missionDone,
    id: 'collision',
    title: '일차원 충돌 상황에서 운동량 보존 확인하기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state,
    get scene() { return scene; },
  };
})();
