/**
 * 지레가 평형을 이루는 조건 찾기
 * 비상교육 고등 물리학 I-1-01 (교과서 16~21쪽), 해 보기 18쪽
 *
 * 눈금 1~5 인 지레 막대 양쪽에 추를 걸어 w×a = F×b 를 확인한다.
 * 평형에서 벗어나면 막대가 실제로 기울어지므로 눈으로 바로 알 수 있다.
 */
const TorqueScene = (() => {
  const B = () => BABYLON;

  const NOTCH = 5;          // 한쪽 눈금 개수
  const NOTCH_U = 1.5;      // 눈금 한 칸의 길이 (unit)
  const BAR_Y = 6.0;        // 받침점 높이
  const W1 = 0.5;           // 추 한 개의 무게 (N 상당, 상댓값)

  let scene, camera;
  let stand, bar, barPivot;
  let leftStack = [], rightStack = [];
  let placed = {};

  const state = {
    posL: 2, nL: 3,     // 왼쪽 : 눈금 위치, 추 개수 (처음에는 기울어진 상태)
    posR: 3, nR: 1,     // 오른쪽
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 돌림힘 = 힘 × 받침점으로부터의 거리 */
  function torques() {
    const tL = state.nL * W1 * state.posL;
    const tR = state.nR * W1 * state.posR;
    return { tL, tR, diff: tR - tL, balanced: Math.abs(tR - tL) < 1e-6 };
  }

  /** 기울어진 각도 — 돌림힘이 «큰 쪽이 내려간다»
      (화면에서 +z 회전은 반시계 방향이므로, 오른쪽이 무거우면 −부호) */
  function tiltAngle() {
    const { diff } = torques();          // diff = τ오른쪽 − τ왼쪽
    const max = 0.34;
    return Math.max(-max, Math.min(max, -diff * 0.11));
  }

  const tools = [
    { id: 'stand', label: '스탠드', icon: 'tower' },
    { id: 'bar', label: '지레 막대', icon: 'rail' },
    { id: 'weights', label: '추', icon: 'weight' },
  ];

  const slots = {
    stand: { x: 0, y: 3, name: '스탠드' },
    bar: { x: 0, y: BAR_Y, name: '지레 막대' },
    weights: { x: 0, y: BAR_Y - 1.5, name: '추' },
  };

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c9dff2ff');

    camera = new (B().ArcRotateCamera)(
      'camTq', -Math.PI / 2 + 0.08, 1.26, 22, new (B().Vector3)(0, 4.4, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 11;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('ht', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.9;
    hemi.groundColor = new (B().Color3)(0.44, 0.47, 0.52);

    const dir = new (B().DirectionalLight)('dt', new (B().Vector3)(-0.4, -1, 0.42), scene);
    dir.position = new (B().Vector3)(8, 16, -9);
    dir.intensity = 0.4;

    buildTable();
    buildStand();
    buildBar();
    buildButtons();
    buildPlaceholders();
    setupPointer(canvas);

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/torque.jpg', { x: -10.5, y: -0.5, z: 3.5, ry: 0.42 });

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
    const t = B().MeshBuilder.CreateBox('tqTable', { width: 30, height: 0.5, depth: 14 }, scene);
    t.position.set(0, -0.26, 0);
    t.material = mat('tqTableMat', '#a9b1ba', '#d6dbe1', 90);
  }

  function buildStand() {
    stand = new (B().TransformNode)('standGroup', scene);
    const sm = mat('standMat', '#5b6675', '#c3cad3', 64);

    const base = B().MeshBuilder.CreateCylinder('standBase', { height: 0.5, diameter: 4.4 }, scene);
    base.position.set(0, 0.25, 0);
    base.material = mat('standBaseMat', '#2b323c');
    base.parent = stand;

    const post = B().MeshBuilder.CreateCylinder('standPost', { height: BAR_Y, diameter: 0.42 }, scene);
    post.position.set(0, BAR_Y / 2, 0);
    post.material = sm;
    post.parent = stand;

    // 받침점 (삼각형)
    const pivot = B().MeshBuilder.CreateCylinder('pivotCone',
      { height: 0.9, diameterTop: 0.1, diameterBottom: 1.2, tessellation: 3 }, scene);
    pivot.position.set(0, BAR_Y - 0.45, 0);
    pivot.material = mat('pivotMat', '#8e9bad', '#eef2f7', 64);
    pivot.parent = stand;
  }

  /** 지레 막대 + 눈금 */
  function buildBar() {
    barPivot = new (B().TransformNode)('barPivot', scene);
    barPivot.position.set(0, BAR_Y, 0);

    bar = new (B().TransformNode)('barGroup', scene);
    bar.parent = barPivot;

    const L = (NOTCH * 2 + 1) * NOTCH_U;
    const beam = B().MeshBuilder.CreateBox('beam', { width: L, height: 0.45, depth: 1.1 }, scene);
    beam.material = mat('beamMat', '#d8b47a', '#fff0d0', 40);
    beam.parent = bar;

    // 눈금 판 (양쪽 1~5)
    const plate = B().MeshBuilder.CreatePlane('barScale', { width: L, height: 0.9 }, scene);
    plate.position.set(0, 0.02, -0.56);
    plate.rotation.y = Math.PI;
    const tex = new (B().DynamicTexture)('barScaleTex', { width: 1100, height: 90 }, scene, true);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 1100, 90);
    ctx.translate(1100, 0); ctx.scale(-1, 1);
    ctx.fillStyle = '#e8d5ac';
    ctx.fillRect(0, 0, 1100, 90);
    const pxPer = 1100 / (NOTCH * 2 + 1);
    for (let i = -NOTCH; i <= NOTCH; i++) {
      const x = 550 + i * pxPer;
      ctx.fillStyle = i === 0 ? '#8a5a2b' : '#ffffff';
      ctx.beginPath(); ctx.arc(x, 45, 26, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, 45, 26, 0, 7); ctx.stroke();
      if (i !== 0) {
        ctx.fillStyle = '#5a3a18';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.abs(i)), x, 47);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tex.hasAlpha = true; tex.update();
    const pm = new (B().StandardMaterial)('barScaleMat', scene);
    pm.diffuseTexture = tex; pm.opacityTexture = tex;
    pm.emissiveColor = new (B().Color3)(0.55, 0.55, 0.55);
    pm.specularColor = new (B().Color3)(0, 0, 0);
    pm.backFaceCulling = false;
    plate.material = pm;
    plate.parent = bar;
  }

  /** 추 하나 */
  function makeWeight(idx, side) {
    const g = new (B().TransformNode)('weight' + side + idx, scene);
    const body = B().MeshBuilder.CreateCylinder('wBody' + side + idx,
      { height: 0.62, diameter: 0.95, tessellation: 20 }, scene);
    body.material = mat('wMat' + side + idx, '#8e97a4', '#e4e9ef', 64);
    body.parent = g;
    const ring = B().MeshBuilder.CreateTorus('wRing' + side + idx,
      { diameter: 0.42, thickness: 0.09, tessellation: 14 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.42;
    ring.material = mat('wRingMat' + side + idx, '#4a5462');
    ring.parent = g;
    g.parent = bar;
    return g;
  }

  /** 추 걸이 줄 */
  function makeString(side) {
    const s = B().MeshBuilder.CreateCylinder('str' + side, { height: 1, diameter: 0.06 }, scene);
    s.material = mat('strMat' + side, '#2b323c');
    s.parent = bar;
    return s;
  }

  let stringL, stringR;

  function rebuildWeights() {
    [...leftStack, ...rightStack].forEach((w) => w.dispose());
    leftStack = []; rightStack = [];
    if (stringL) { stringL.dispose(); stringL = null; }
    if (stringR) { stringR.dispose(); stringR = null; }
    if (!placed.weights || !placed.bar) return;

    const hang = (n, pos, side) => {
      const x = -pos * NOTCH_U * (side === 'L' ? 1 : -1);
      const str = makeString(side);
      const strLen = 0.9;
      str.scaling.y = strLen;
      str.position.set(x, -0.22 - strLen / 2, 0);
      const arr = [];
      for (let i = 0; i < n; i++) {
        const w = makeWeight(i, side);
        w.position.set(x, -0.22 - strLen - 0.31 - i * 0.66, 0);
        arr.push(w);
      }
      return { str, arr };
    };
    const l = hang(state.nL, state.posL, 'L');
    const r = hang(state.nR, state.posR, 'R');
    stringL = l.str; leftStack = l.arr;
    stringR = r.str; rightStack = r.arr;
  }

  /* ══ 3D 화면에서 직접 조작 ═══════════════════
     · 추 뭉치를 좌우로 끌면 가장 가까운 눈금으로 옮겨 걸린다
     · 걸이 옆 ＋ / － 를 누르면 추를 더 걸거나 덜어 낸다          */
  let btns = {};
  let drag = null;              // { side }
  let onChangeCb = null;        // 조작하면 측정값·그래프를 다시 그리도록

  function makeBtn(side, kind) {
    const name = 'btn' + kind + side;
    const pl = B().MeshBuilder.CreatePlane(name, { width: 0.9, height: 0.9 }, scene);
    const tex = new (B().DynamicTexture)(name + 'T', { width: 96, height: 96 }, scene, true);
    const c = tex.getContext();
    c.clearRect(0, 0, 96, 96);
    c.fillStyle = kind === 'Add' ? '#2f6ad0' : '#8e9bad';
    c.beginPath(); c.arc(48, 48, 42, 0, 7); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(28, 48); c.lineTo(68, 48); c.stroke();
    if (kind === 'Add') { c.beginPath(); c.moveTo(48, 28); c.lineTo(48, 68); c.stroke(); }
    tex.hasAlpha = true; tex.update();
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.diffuseTexture = tex; m.opacityTexture = tex; m.emissiveTexture = tex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    pl.material = m;
    pl.rotation.y = Math.PI;          // 카메라 쪽을 보게
    pl.parent = bar;
    return pl;
  }

  function buildButtons() {
    ['L', 'R'].forEach((side) => {
      btns[side] = { add: makeBtn(side, 'Add'), sub: makeBtn(side, 'Sub') };
    });
    layoutButtons();
  }

  function layoutButtons() {
    ['L', 'R'].forEach((side) => {
      if (!btns[side]) return;
      const pos = side === 'L' ? state.posL : state.posR;
      const x = -pos * NOTCH_U * (side === 'L' ? 1 : -1);
      btns[side].add.position.set(x + 0.85, -1.35, -0.6);
      btns[side].sub.position.set(x - 0.85, -1.35, -0.6);
      const on = !!placed.weights && !!placed.bar;
      btns[side].add.setEnabled(on);
      btns[side].sub.setEnabled(on);
    });
  }

  /** 이름에서 «어느 쪽 추인지» 알아낸다 */
  function sideOf(name) {
    const m = /^(?:wBody|wRing|str|btnAdd|btnSub)([LR])/.exec(name || '');
    return m ? m[1] : null;
  }

  function setCount(side, d) {
    const key = side === 'L' ? 'nL' : 'nR';
    const v = Math.max(1, Math.min(6, state[key] + d));
    if (v === state[key]) return;
    state[key] = v;
    update();
    layoutButtons();
    if (onChangeCb) onChangeCb();
  }

  function setPos(side, pos) {
    const key = side === 'L' ? 'posL' : 'posR';
    const v = Math.max(1, Math.min(NOTCH, pos));
    if (v === state[key]) return;
    state[key] = v;
    update();
    layoutButtons();
    if (onChangeCb) onChangeCb();
  }

  /** 마우스가 가리키는 지점을 지레 평면(z = 0) 위 x 좌표로 */
  function pointerX() {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(
      new (B().Vector3)(0, BAR_Y, 0), new (B().Vector3)(0, 0, 1));
    const d = ray.intersectsPlane(plane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d)).x;
  }

  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      if (pi.type === T.POINTERDOWN) {
        const pick = pi.pickInfo;
        if (!pick || !pick.hit || !pick.pickedMesh) return;
        const nm = pick.pickedMesh.name;
        const side = sideOf(nm);
        if (!side || !placed.weights) return;
        if (nm.indexOf('btnAdd') === 0) { setCount(side, +1); return; }
        if (nm.indexOf('btnSub') === 0) { setCount(side, -1); return; }
        drag = { side };
        camera.detachControl();
      } else if (pi.type === T.POINTERMOVE && drag) {
        const x = pointerX();
        if (x === null) return;
        const raw = Math.abs(x) / NOTCH_U;
        // 왼쪽 추는 왼쪽에만, 오른쪽 추는 오른쪽에만 걸 수 있다
        const sameSide = (drag.side === 'L' && x < 0) || (drag.side === 'R' && x > 0);
        if (!sameSide) return;
        setPos(drag.side, Math.round(raw));
      } else if (pi.type === T.POINTERUP && drag) {
        drag = null;
        camera.attachControl(canvas, true);
      }
    });
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      stand: { x: 0, y: 3.0, w: 3.0, h: 6.4, label: '스탠드' },
      bar: { x: 0, y: BAR_Y + 0.6, w: 17, h: 2.0, label: '지레 막대' },
      weights: { x: 0, y: BAR_Y - 2.4, w: 15, h: 3.0, label: '추' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreatePlane('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, c.y, 0.5);
      p.rotation.y = Math.PI;
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: true, color: '#2f6ad0' });
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
    stand.setEnabled(!!placed.stand);
    barPivot.setEnabled(!!placed.bar);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    update();
  }

  function dropAt(id, point) {
    const s = slots[id];
    return Math.abs(point.y - s.y) <= 3.2 ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 갱신 ═══════════════════════════════════ */
  let targetTilt = 0, curTilt = 0;

  function update() {
    if (!scene) return;
    rebuildWeights();
    layoutButtons();
    targetTilt = tiltAngle();
    return true;
  }

  /** 기울기를 부드럽게 따라가게 한다 */
  function tick(dt) {
    if (!barPivot) return false;
    const d = targetTilt - curTilt;
    if (Math.abs(d) < 0.0005) return false;
    curTilt += d * Math.min(1, dt * 7);
    barPivot.rotation.z = curTilt;
    return false;   // 측정값은 변하지 않으므로 다시 그릴 필요 없다
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.08;
    camera.beta = 1.26;
    camera.radius = 22;
    camera.setTarget(new (B().Vector3)(0, 4.4, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '양쪽의 눈금 위치와 추의 개수를 바꾸어 <b>지레가 수평이 되는 조건</b>을 찾아보세요.';
  const prepGuide = '점선으로 표시된 자리에 스탠드·지레 막대·추를 끌어다 놓아 실험을 준비하세요.';

  const notchOpts = [1, 2, 3, 4, 5].map((v) => ({ v, t: `눈금 ${v}` }));
  const countOpts = [1, 2, 3, 4, 5, 6].map((v) => ({ v, t: `${v} 개` }));

  function controlsHTML() {
    return `
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          <b>추 뭉치를 끌어</b> 옮기면 가까운 눈금에 걸리고,
          걸이 옆의 <b>＋ · －</b> 를 누르면 추를 더 걸거나 덜어 냅니다.
        </p></div>
      </div>
      <div class="control">
        <div class="clabel">평형<br>맞추기</div>
        <div class="cbody"><div class="opt-grid one-row">
          <button class="opt" id="balanceBtn">오른쪽 자동 조정</button>
        </div></div>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;          // 3D 에서 직접 조작해도 측정값이 갱신되도록

    // 스스로 찾아본 뒤 확인하는 용도
    root.querySelector('#balanceBtn').addEventListener('click', () => {
      const need = state.nL * state.posL;      // = nR × posR 이어야 한다
      let found = null;
      for (const pos of [1, 2, 3, 4, 5]) {
        if (need % pos === 0 && need / pos >= 1 && need / pos <= 6) {
          found = { pos, n: need / pos };
          break;
        }
      }
      if (!found) { Lab.showHint('이 조건으로는 오른쪽에 정수 개의 추로 평형을 만들 수 없습니다.'); return; }
      state.posR = found.pos; state.nR = found.n;
      root.querySelectorAll('[data-posr]').forEach((o) =>
        o.classList.toggle('on', +o.dataset.posr === found.pos));
      root.querySelectorAll('[data-nr]').forEach((o) =>
        o.classList.toggle('on', +o.dataset.nr === found.n));
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    const t = torques();
    return `
      <div class="sec" style="margin-top:0;padding-top:0;border:0">왼쪽</div>
      <div class="row"><span>추의 무게 <i>w</i></span><b>${(state.nL * W1).toFixed(1)} N</b></div>
      <div class="row"><span>거리 <i>a</i></span><b>눈금 ${state.posL}</b></div>
      <div class="row"><span>돌림힘 <i>w</i>×<i>a</i></span><b>${t.tL.toFixed(1)}</b></div>

      <div class="sec">오른쪽</div>
      <div class="row"><span>추의 무게 <i>F</i></span><b>${(state.nR * W1).toFixed(1)} N</b></div>
      <div class="row"><span>거리 <i>b</i></span><b>눈금 ${state.posR}</b></div>
      <div class="row"><span>돌림힘 <i>F</i>×<i>b</i></span><b>${t.tR.toFixed(1)}</b></div>

      <div class="sec">판정</div>
      <div class="row"><span>상태</span>
        <span class="tag ${t.balanced ? 'ok' : 'mid'}">${
          t.balanced ? '수평 (평형)' : (t.diff > 0 ? '오른쪽으로 기움' : '왼쪽으로 기움')}</span></div>
      <div class="row"><span>돌림힘 차</span><b class="big">${t.diff.toFixed(1)}</b></div>
      <div class="formula"><i>w</i> × <i>a</i> = <i>F</i> × <i>b</i></div>`;
  }

  /* ══ 그래프 — 돌림힘 저울 ═══════════════════ */
  const graphTitle = '양쪽 돌림힘 비교';

  function drawGraph(ctx, W, H) {
    const t = torques();
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);

    const maxT = Math.max(6, t.tL, t.tR) * 1.2;
    const baseY = H - 34, topY = 30;
    const h = baseY - topY;
    const colW = 78;
    const lx = W / 2 - colW - 26, rx = W / 2 + 26;

    const bar = (x, val, color, label, detail) => {
      const bh = (val / maxT) * h;
      ctx.fillStyle = color;
      ctx.fillRect(x, baseY - bh, colW, Math.max(1, bh));
      ctx.fillStyle = '#e8eef6';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(val.toFixed(1), x + colW / 2, baseY - bh - 4);
      ctx.fillStyle = '#cfe0f2';
      ctx.font = 'bold 11px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + colW / 2, baseY + 4);
      ctx.fillStyle = '#9fb0c2';
      ctx.font = '10px sans-serif';
      ctx.fillText(detail, x + colW / 2, baseY + 18);
    };

    bar(lx, t.tL, '#4a8fe0', '왼쪽 w×a', `${(state.nL * W1).toFixed(1)}N × ${state.posL}`);
    bar(rx, t.tR, '#e8577a', '오른쪽 F×b', `${(state.nR * W1).toFixed(1)}N × ${state.posR}`);

    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(W, baseY); ctx.stroke();

    // 평형이면 두 막대를 잇는 선을 초록으로
    ctx.strokeStyle = t.balanced ? '#4ad8a0' : 'rgba(255,255,255,.22)';
    ctx.setLineDash(t.balanced ? [] : [4, 4]);
    ctx.lineWidth = t.balanced ? 2 : 1;
    const yL = baseY - (t.tL / maxT) * h, yR = baseY - (t.tR / maxT) * h;
    ctx.beginPath(); ctx.moveTo(lx, yL); ctx.lineTo(rx + colW, yR); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = t.balanced ? '#4ad8a0' : '#8e9bad';
    ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(t.balanced ? '두 돌림힘이 같습니다 — 평형!' : '돌림힘이 다르면 기울어집니다', W / 2, 8);
  }

  function graphFootHTML() {
    const t = torques();
    return t.balanced
      ? `<b style="color:#2f9e6b">${(state.nL * W1).toFixed(1)} × ${state.posL}
         = ${(state.nR * W1).toFixed(1)} × ${state.posR}</b> — 받침점에서 <b>멀수록</b> 작은 힘으로 됩니다`
      : `${(state.nL * W1).toFixed(1)} × ${state.posL} =
         ${t.tL.toFixed(1)} &nbsp;≠&nbsp; ${(state.nR * W1).toFixed(1)} × ${state.posR} = ${t.tR.toFixed(1)}`;
  }

  /* ══ 기록표 (교과서 18쪽 표) ════════════════ */
  const recordColumns = [
    '지레의 왼쪽', '지레의 오른쪽', '<i>w</i>×<i>a</i>', '<i>F</i>×<i>b</i>', '평형 여부',
  ];

  function recordRow() {
    const t = torques();
    return [
      `눈금 ${state.posL} − 추 ${state.nL} 개`,
      `눈금 ${state.posR} − 추 ${state.nR} 개`,
      t.tL.toFixed(1), t.tR.toFixed(1),
      t.balanced ? '평형 ○' : '기울어짐 ✕',
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 평형 만들기 · 1 개수를 다르게 하고 평형 · 2 평형 조합 2가지 기록
     3 «거리 2배 → 추 절반» 관계 확인 · 4 평형과 기울어짐을 모두 기록      */
  const mis = { balSeen: 0 };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);
  const balRows = () => recs().filter((r) => String(r[4]).indexOf('평형') === 0);

  function missionDone(i) {
    const t = torques();
    if (i === 0) return t.balanced;
    if (i === 1) return t.balanced && state.nL !== state.nR;
    if (i === 2) {
      const keys = new Set(balRows().map((r) => r[0] + '|' + r[1]));
      return keys.size >= 2;
    }
    if (i === 3) {
      // 한쪽 거리가 2배면 추는 절반 — 어느 쪽이든 성립하면 인정
      const a = state.posR === 2 * state.posL && state.nL === 2 * state.nR;
      const b = state.posL === 2 * state.posR && state.nR === 2 * state.nL;
      return t.balanced && (a || b);
    }
    if (i === 4) {
      const rs = recs();
      return rs.some((r) => String(r[4]).indexOf('평형') === 0)
          && rs.some((r) => String(r[4]).indexOf('기울') === 0);
    }
    return false;
  }

  return {
    missionDone,
    id: 'torque',
    title: '지레가 평형을 이루는 조건 찾기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, torques,
    get scene() { return scene; },
  };
})();
