/**
 * 도체 공과 물줄기 — 정전기 유도 체험 (③ 체험·조작형)
 * 비상교육 고등 전자기와 양자 I-02 (교과서 16~19쪽)
 *
 * 도체 공 모드 — 해 보기 16쪽: ①대전 빨대 접근 ②A·B 접촉 ③접근 상태에서 분리
 *              ④두 빨대로 확인 — 정전기 유도로 두 공을 반대로 대전시킨다.
 * 물줄기 모드 — 17쪽 생활 속 탐구: 대전체를 가까이 하면 물줄기가 휜다 (유전 분극).
 *              (+)든 (−)든 항상 끌려오는 것이 분극의 증거!
 */
const ElectrostaticScene = (() => {
  const B = () => BABYLON;

  let scene, camera;
  let ballA, ballB, strawL, strawR, texA, texB, standG;
  let waterG, balloon, drops = [], faucet;
  let placed = {};

  const state = {
    mode: 'balls',       // 'balls' | 'water'
    step: 1,             // 도체 공 실험 단계 (1~4)
    strawQ: 1.0,         // 빨대 대전량 (연출 배율)
    balloonSign: -1,     // 풍선 전하 부호
    balloonDist: 1.2,    // 풍선-물줄기 거리 (연출 단위)
    running: true,
  };

  let sim = null;

  const tools = [
    { id: 'ballT', label: '도체 공 A · B', icon: 'ball' },
    { id: 'strawT', label: '빨대 · 면', icon: 'wire' },
    { id: 'standT', label: '스탠드 · 실', icon: 'tower' },
    { id: 'faucetT', label: '수도꼭지 · 풍선', icon: 'sensor' },
  ];
  const slots = {
    ballT: { name: '스탠드 아래' },
    strawT: { name: '앞쪽 (빨대)' },
    standT: { name: '가운데 (스탠드)' },
    faucetT: { name: '오른쪽 (수도)' },
  };

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c9dff2ff');

    camera = new (B().ArcRotateCamera)(
      'camEs', -Math.PI / 2, 1.25, 14, new (B().Vector3)(0, 2.6, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 32;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hes', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.45, 0.48, 0.52);
    const dir = new (B().DirectionalLight)('des', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 16, -9);
    dir.intensity = 0.35;

    const table = B().MeshBuilder.CreateBox('esTable', { width: 24, height: 0.6, depth: 12 }, scene);
    table.position.y = -0.32;
    table.material = mat('esTableMat', '#9aa3ad', '#c6ccd3', 96);

    buildBalls();
    buildWater();
    buildPlaceholders();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/electrostatic.jpg', { x: -8, y: 0, z: 5, ry: 0.3 });

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

  /** 전하 무늬가 그려진 공 (DynamicTexture) */
  function chargedBall(name) {
    const s = B().MeshBuilder.CreateSphere(name, { diameter: 1.0 }, scene);
    const t = new (B().DynamicTexture)(name + 'Tex', { width: 256, height: 128 }, scene, true);
    const m = new (B().StandardMaterial)(name + 'Mat', scene);
    m.diffuseTexture = t;
    m.specularColor = B().Color3.FromHexString('#cfd6df');
    m.specularPower = 64;
    s.material = m;
    return [s, t];
  }

  /** 공 표면에 전하 분포를 그린다. mode: 'neutral' | 'induced'(왼쪽 −) | 'plus' | 'minus' */
  function drawCharges(tex, mode, flip) {
    const ctx = tex.getContext();
    ctx.fillStyle = '#c8ccd2';
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const plus = (x, y) => { ctx.fillStyle = '#d0453a'; ctx.fillText('+', x, y); };
    const minus = (x, y) => { ctx.fillStyle = '#2f6ad0'; ctx.fillText('−', x, y); };
    // 텍스처 U: 0~256 이 경도. 왼쪽 반구 ≈ 64 부근, 오른쪽 반구 ≈ 192 부근
    const L = flip ? 192 : 64, R = flip ? 64 : 192;
    if (mode === 'neutral') {
      [40, 100, 160, 220].forEach((x, i) => {
        plus(x, 40 + (i % 2) * 40); minus(x, 80 - (i % 2) * 40);
      });
    } else if (mode === 'induced') {
      [30, 55, 80].forEach((x, i) => minus(L - 30 + i * 22 - 22, 44 + i * 20));
      minus(L, 30); minus(L - 18, 64); minus(L + 14, 90);
      plus(R, 30); plus(R - 16, 64); plus(R + 16, 92);
    } else if (mode === 'minus') {
      [40, 90, 140, 190, 230].forEach((x, i) => minus(x, 36 + (i % 3) * 28));
    } else {
      [40, 90, 140, 190, 230].forEach((x, i) => plus(x, 36 + (i % 3) * 28));
    }
    tex.update();
  }

  function buildBalls() {
    standG = new (B().TransformNode)('esStand', scene);
    const bar = B().MeshBuilder.CreateCylinder('esBar', { height: 6.4, diameter: 0.14 }, scene);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 5.2, 0);
    bar.material = mat('esBarM', '#39424f');
    bar.parent = standG;
    standG._frame = [bar];
    [-3.1, 3.1].forEach((x, i) => {
      const p = B().MeshBuilder.CreateCylinder('esPole' + i, { height: 5.2, diameter: 0.16 }, scene);
      p.position.set(x, 2.6, 0);
      p.material = mat('esPoleM' + i, '#39424f', '#8e9bad', 64);
      p.parent = standG;
      standG._frame.push(p);
    });

    const [a, ta] = chargedBall('esBallA');
    const [b2, tb] = chargedBall('esBallB');
    ballA = a; texA = ta; ballB = b2; texB = tb;
    ballA.parent = standG; ballB.parent = standG;
    // 실
    ['esStrA', 'esStrB'].forEach((n, i) => {
      const str = B().MeshBuilder.CreateCylinder(n, { height: 2.4, diameter: 0.03 }, scene);
      str.material = mat(n + 'M', '#2b323c');
      str.parent = standG;
      standG['_str' + i] = str;
    });

    // 대전된 빨대 (왼쪽/오른쪽)
    const mkStraw = (n) => {
      const g = new (B().TransformNode)(n, scene);
      const body = B().MeshBuilder.CreateCylinder(n + 'C', { height: 2.6, diameter: 0.22 }, scene);
      body.rotation.z = Math.PI / 2 + 0.5;
      body.material = mat(n + 'M', '#f0a53c', '#ffe0b0', 48);
      body.parent = g;
      // − 기호 라벨
      const lbl = B().MeshBuilder.CreatePlane(n + 'L', { width: 1.6, height: 0.6 }, scene);
      lbl.position.set(0, 0.55, -0.15);
      lbl.billboardMode = B().Mesh.BILLBOARDMODE_ALL;
      const t = new (B().DynamicTexture)(n + 'LT', { width: 256, height: 96 }, scene, true);
      const c = t.getContext();
      c.clearRect(0, 0, 256, 96);
      c.fillStyle = '#2f6ad0';
      c.font = 'bold 56px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('− − −', 128, 48);
      t.hasAlpha = true; t.update();
      const m = new (B().StandardMaterial)(n + 'LM', scene);
      m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.backFaceCulling = false;
      lbl.material = m;
      lbl.parent = g;
      return g;
    };
    strawL = mkStraw('esStrawL');
    strawR = mkStraw('esStrawR');
  }

  function buildWater() {
    waterG = new (B().TransformNode)('esWater', scene);
    // 수도꼭지
    faucet = new (B().TransformNode)('esFaucet', scene);
    const pipe = B().MeshBuilder.CreateCylinder('esPipe', { height: 2.4, diameter: 0.3 }, scene);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0.9, 5.6, 0);
    pipe.material = mat('esPipeM', '#7a8494', '#cfd6df', 96);
    pipe.parent = faucet;
    const spout = B().MeshBuilder.CreateCylinder('esSpout', { height: 0.8, diameter: 0.26 }, scene);
    spout.position.set(0, 5.3, 0);
    spout.material = mat('esSpoutM', '#7a8494', '#cfd6df', 96);
    spout.parent = faucet;
    faucet.parent = waterG;
    // 개수대
    const sink = B().MeshBuilder.CreateBox('esSink', { width: 4.2, height: 0.5, depth: 2.6 }, scene);
    sink.position.set(0, 0.25, 0);
    sink.material = mat('esSinkM', '#d8dde8', '#ffffff', 96);
    sink.parent = waterG;

    // 풍선
    balloon = new (B().TransformNode)('esBalloon', scene);
    const bal = B().MeshBuilder.CreateSphere('esBalS', { diameterX: 1.4, diameterY: 1.7, diameterZ: 1.4 }, scene);
    bal.material = mat('esBalM', '#d0453a', '#ffd0c8', 48);
    bal.parent = balloon;
    const lbl = B().MeshBuilder.CreatePlane('esBalL', { width: 1.3, height: 0.55 }, scene);
    lbl.position.set(0, 0, -0.9);
    lbl.billboardMode = B().Mesh.BILLBOARDMODE_ALL;
    const t = new (B().DynamicTexture)('esBalLT', { width: 256, height: 96 }, scene, true);
    balloon._lblTex = t;
    const m = new (B().StandardMaterial)('esBalLM', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    lbl.material = m;
    lbl.parent = balloon;
    balloon.parent = waterG;

    // 물방울
    for (let i = 0; i < 46; i++) {
      const d = B().MeshBuilder.CreateSphere('esDrop' + i, { diameter: 0.17 }, scene);
      d.material = emat('esDropM' + i, '#5aa8f0', 0.85);
      d.isPickable = false;
      d.parent = waterG;
      drops.push({ m: d, t: Math.random() * 2 });
    }
  }

  function drawBalloonLabel() {
    const t = balloon._lblTex;
    const c = t.getContext();
    c.clearRect(0, 0, 256, 96);
    c.fillStyle = state.balloonSign < 0 ? '#2f6ad0' : '#d0453a';
    c.font = 'bold 52px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(state.balloonSign < 0 ? '− − −' : '+ + +', 128, 48);
    t.hasAlpha = true; t.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      standT: { x: 0, z: 0, w: 5.2, h: 2.6, label: '스탠드 · 실' },
      ballT: { x: 0, z: -3.2, w: 3.4, h: 2.2, label: '도체 공' },
      strawT: { x: -4.2, z: -2.6, w: 3.2, h: 2.2, label: '빨대 · 면' },
      faucetT: { x: 4.4, z: -2.6, w: 3.4, h: 2.2, label: '수도 · 풍선' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 420, height: 120 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 420, 120);
      ctx.strokeStyle = '#2f6ad0'; ctx.lineWidth = 5;
      ctx.setLineDash([15, 11]);
      ctx.strokeRect(7, 7, 406, 106);
      ctx.setLineDash([]);
      ctx.fillStyle = '#2f6ad0';
      ctx.font = 'bold 38px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 210, 64);
      tex.hasAlpha = true; tex.update();
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

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    sim = { t: 0 };
    state.step = 1;
    layout();
  }

  /** 단계별 배치와 전하 분포 (해 보기 16쪽 ①~④) */
  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const balls = state.mode === 'balls';

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다 (실험대는 항상 보임)
    if (!all) {
      standG.setEnabled(true);
      (standG._frame || []).forEach((n) => n.setEnabled(!!placed.standT));
      standG._str0.setEnabled(!!placed.standT && !!placed.ballT);
      standG._str1.setEnabled(!!placed.standT && !!placed.ballT);
      ballA.setEnabled(!!placed.ballT);
      ballB.setEnabled(!!placed.ballT);
      if (placed.ballT) {
        drawCharges(texA, 'neutral');
        drawCharges(texB, 'neutral');
        if (placed.standT) {
          // 실에 매달린 상태
          const barY = 5.2, len = 2.4;
          standG._str0.rotation.set(0, 0, 0);
          standG._str0.position.set(-0.5, barY - len / 2, 0);
          ballA.position.set(-0.5, barY - len - 0.5, 0);
          standG._str1.rotation.set(0, 0, 0);
          standG._str1.position.set(0.55, barY - len / 2, 0);
          ballB.position.set(0.55, barY - len - 0.5, 0);
        } else {
          // 스탠드가 없으면 실험대 위 제자리에
          ballA.position.set(-0.5, 0.5, -3.2);
          ballB.position.set(0.55, 0.5, -3.2);
        }
      }
      strawL.setEnabled(!!placed.strawT);
      if (placed.strawT) strawL.position.set(-4.2, 0.6, -2.6);
      strawR.setEnabled(false);
      waterG.setEnabled(true);
      faucet.setEnabled(!!placed.faucetT);
      balloon.setEnabled(false);
      drops.forEach((dp) => dp.m.setEnabled(false));
      const sink = scene.getMeshByName('esSink');
      if (sink) sink.setEnabled(!!placed.faucetT);
      return;
    }
    (standG._frame || []).forEach((n) => n.setEnabled(true));
    ballA.setEnabled(true); ballB.setEnabled(true);
    faucet.setEnabled(true);
    balloon.setEnabled(true);
    drops.forEach((dp) => dp.m.setEnabled(true));
    const sinkM = scene.getMeshByName('esSink');
    if (sinkM) sinkM.setEnabled(true);

    standG.setEnabled(balls);
    strawL.setEnabled(balls && (state.step === 1 || state.step === 3 || state.step === 4));
    strawR.setEnabled(balls && state.step === 4);
    waterG.setEnabled(!balls);

    if (balls) {
      const q = state.strawQ;
      const barY = 5.2;
      const strLen = 2.4;
      const hang = (str, ball, x0, tilt) => {
        str.rotation.set(0, 0, tilt);
        str.position.set(x0 + Math.sin(tilt) * strLen / 2, barY - Math.cos(tilt) * strLen / 2, 0);
        ball.position.set(x0 + Math.sin(tilt) * strLen, barY - Math.cos(tilt) * strLen - 0.5, 0);
      };
      if (state.step === 1) {
        // 빨대가 왼쪽에서 접근 → A 유도, 끌려감 (왼쪽으로 기움)
        ballB.setEnabled(false);
        standG._str1.setEnabled(false);
        ballA.setEnabled(true); standG._str0.setEnabled(true);
        hang(standG._str0, ballA, 0, -0.30 * q);
        strawL.position.set(-2.2, 2.2, 0);
        drawCharges(texA, 'induced', true);    // 빨대(−) 쪽에 + 가 유도되도록
      } else if (state.step === 2) {
        // 빨대 치우고 A·B 접촉 — 둘 다 중성
        ballA.setEnabled(true); ballB.setEnabled(true);
        standG._str0.setEnabled(true); standG._str1.setEnabled(true);
        hang(standG._str0, ballA, -0.5, 0);
        hang(standG._str1, ballB, 0.55, 0);
        drawCharges(texA, 'neutral');
        drawCharges(texB, 'neutral');
      } else if (state.step === 3) {
        // 빨대 접근 상태에서 A·B 분리 — A 는 +, B 는 −
        ballA.setEnabled(true); ballB.setEnabled(true);
        standG._str0.setEnabled(true); standG._str1.setEnabled(true);
        hang(standG._str0, ballA, -0.7, -0.22 * q);
        hang(standG._str1, ballB, 1.3, 0.0);
        strawL.position.set(-2.6, 2.2, 0);
        drawCharges(texA, 'plus');
        drawCharges(texB, 'minus');
      } else {
        // 두 빨대(−)로 확인: A(+) 는 끌려오고 B(−) 는 밀려난다!
        ballA.setEnabled(true); ballB.setEnabled(true);
        standG._str0.setEnabled(true); standG._str1.setEnabled(true);
        hang(standG._str0, ballA, -1.3, -0.30 * q);   // − 빨대 쪽으로 끌림
        hang(standG._str1, ballB, 1.3, -0.30 * q);    // − 빨대에서 밀림 (빨대가 오른쪽에)
        strawL.position.set(-3.3, 2.2, 0);
        strawR.position.set(3.3, 2.2, 0);
        // B 는 오른쪽 빨대에서 밀려 왼쪽으로 기움 → tilt −. A 는 왼쪽 빨대로 끌려 왼쪽 기움 → 같은 방향이지만 의미 다름
        drawCharges(texA, 'plus');
        drawCharges(texB, 'minus');
      }
    } else {
      drawBalloonLabel();
      balloon.position.set(-state.balloonDist - 0.8, 3.0, 0);
    }
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;
    sim.t += dt;
    if (state.mode === 'water') {
      // 물방울 낙하 + 풍선 쪽으로 휘기 (부호와 무관하게 끌림 = 분극)
      drops.forEach((dp) => {
        dp.t += dt;
        if (dp.t > 2.0) dp.t -= 2.0;
        const y = 5.0 - 4.6 * (dp.t / 2.0);
        // 아래로 갈수록 누적된 휨 — 거리 제곱에 반비례 (부호와 무관하게 풍선 쪽으로)
        const frac = Math.max(0, (5.0 - y) / 4.6);
        const bendX = -(2.2 / Math.max(0.9, state.balloonDist * state.balloonDist)) * frac * frac;
        dp.m.position.set(bendX, y, 0);
      });
      return false;
    }
    return false;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = 1.25;
    camera.radius = 14;
    camera.setTarget(new (B().Vector3)(0, 2.6, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '단계를 진행하며 도체 공의 전하 분포가 어떻게 변하는지 관찰하세요. 마지막 단계에서 A 와 B 가 반대로 대전된 것이 드러납니다.';
  const prepGuide = '점선 자리에 스탠드·도체 공·빨대·수도(풍선)를 끌어다 놓아 실험을 준비하세요.';

  const STEP_NAMES = {
    1: '① 대전된 빨대를 A 에 접근',
    2: '② 빨대 치우고 A·B 접촉',
    3: '③ 빨대 접근 상태에서 A·B 분리',
    4: '④ 두 빨대로 A·B 확인',
  };

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'balls', t: '도체 공 (16쪽)' }, { v: 'water', t: '물줄기 휘기 (17쪽)' },
    ], state.mode, 1);

    if (state.mode === 'balls') {
      return `
        ${modeBtns}
        ${LabUI.opts('실험 단계', 'step', [
          { v: 1, t: '① 접근' }, { v: 2, t: '② 접촉' },
          { v: 3, t: '③ 분리' }, { v: 4, t: '④ 확인' },
        ], state.step, 2)}
        ${LabUI.slider('strawQ', '빨대의 대전량',
          { min: 0.3, max: 1.5, step: 0.1, value: state.strawQ, fmt: (v) => `×${(+v).toFixed(1)}` })}
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.opts('풍선의 전하', 'balloonSign', [
        { v: -1, t: '(−) 로 대전' }, { v: 1, t: '(+) 로 대전' },
      ], state.balloonSign, 1)}
      ${LabUI.slider('balloonDist', '풍선까지 거리',
        { min: 0.7, max: 2.6, step: 0.1, value: state.balloonDist, fmt: (v) => `${(+v).toFixed(1)}` })}
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.mode === 'balls') {
      LabUI.bindOpts(root, 'step', state, 'step', () => { layout(); onChange(); });
      LabUI.bindSlider(root, 'strawQ', state, 'strawQ', (v) => `×${(+v).toFixed(1)}`, () => { layout(); onChange(); });
    } else {
      LabUI.bindOpts(root, 'balloonSign', state, 'balloonSign', () => { layout(); onChange(); });
      LabUI.bindSlider(root, 'balloonDist', state, 'balloonDist', (v) => `${(+v).toFixed(1)}`, () => { layout(); onChange(); });
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
    if (state.mode === 'balls') {
      const desc = {
        1: '빨대(−)를 가까이 하면 A 의 <b>가까운 쪽에 (+), 먼 쪽에 (−)</b> 가 유도되어 서로 끌어당깁니다. 전하의 총량은 그대로 — 이동만 했습니다.',
        2: '빨대를 치우면 전하가 다시 고르게 퍼져 <b>중성</b>이 됩니다. A 와 B 를 접촉시키면 한 덩어리 도체가 됩니다.',
        3: '빨대(−)를 가까이 한 채 분리하면 — 빨대 쪽 A 에는 <b>(+)</b>, 먼 쪽 B 에는 <b>(−)</b> 가 남습니다. 마찰 없이 반대 부호로 대전!',
        4: '두 빨대(−)를 가까이 하면 — A(+) 는 <b>끌려오고</b>, B(−) 는 <b>밀려납니다</b>. ③에서 반대로 대전되었다는 증거입니다.',
      };
      return `
        <div class="row"><span>단계</span><b>${STEP_NAMES[state.step]}</b></div>
        <div class="row"><span>공 A 의 전하</span>
          <b>${state.step === 1 ? '유도 (한쪽 + / 반대쪽 −)' : state.step === 2 ? '중성' : '(+) 대전'}</b></div>
        <div class="row"><span>공 B 의 전하</span>
          <b>${state.step === 1 ? '—' : state.step === 2 ? '중성' : '(−) 대전'}</b></div>
        <div class="formula">${desc[state.step]}</div>`;
    }
    return `
      <div class="row"><span>풍선의 전하</span><b>${state.balloonSign < 0 ? '(−)' : '(+)'} 대전</b></div>
      <div class="row"><span>풍선까지 거리</span><b>${state.balloonDist.toFixed(1)}</b></div>
      <div class="row"><span>물줄기</span><b class="big">풍선 쪽으로 휘어짐!</b></div>
      <div class="formula">물 분자는 극성이 있어 풍선의 전기장에 의해 <b>분극</b>됩니다.
        가까운 쪽에 반대 전하가 유도되어 <b>(+)든 (−)든 항상 끌려옵니다</b>.
        풍선의 부호를 바꿔도 물줄기가 같은 쪽으로 휘는 것을 확인하세요 —
        이것이 유전 분극의 증거입니다 (17쪽 생활 속 탐구).</div>`;
  }

  /* ══ 그래프 — 전하 분포 개념도 ═══════════════ */
  const graphTitle = '전하 분포 개념도';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    const ball = (x, y, r, label) => {
      ctx.strokeStyle = '#9fb0c2'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
      ctx.fillStyle = '#9fb0c2';
      ctx.fillText(label, x, y - r - 10);
    };
    const sign = (x, y, s) => {
      ctx.fillStyle = s > 0 ? '#e8577a' : '#5a9df0';
      ctx.fillText(s > 0 ? '+' : '−', x, y);
    };
    const cy = H2 / 2 + 6;

    if (state.mode === 'balls') {
      if (state.step === 1) {
        ctx.fillStyle = '#f0a53c'; ctx.fillText('빨대 (−)', 60, cy);
        ball(160, cy, 34, 'A (유도)');
        sign(138, cy - 12, 1); sign(136, cy + 12, 1);
        sign(184, cy - 12, -1); sign(186, cy + 12, -1);
      } else if (state.step === 2) {
        ball(140, cy, 34, 'A (중성)');
        ball(210, cy, 34, 'B (중성)');
        sign(132, cy - 10, 1); sign(148, cy + 10, -1);
        sign(202, cy - 10, -1); sign(218, cy + 10, 1);
      } else {
        ctx.fillStyle = '#f0a53c'; ctx.fillText(state.step === 4 ? '빨대(−)' : '빨대 (−)', 46, cy);
        ball(140, cy, 34, 'A (+)');
        [-12, 0, 12].forEach((d) => sign(140 + d, cy + (d === 0 ? -12 : 8), 1));
        ball(250, cy, 34, 'B (−)');
        [-12, 0, 12].forEach((d) => sign(250 + d, cy + (d === 0 ? -12 : 8), -1));
        if (state.step === 4) {
          ctx.fillStyle = '#f0a53c'; ctx.fillText('빨대(−)', W2 - 46, cy);
          ctx.fillStyle = '#69d98c';
          ctx.fillText('← 끌림', 95, cy + 46);
          ctx.fillText('← 밀림', 300, cy + 46);
        }
      }
      return;
    }

    // 물줄기: 극성 분자 그림
    ctx.fillStyle = '#9fb0c2';
    ctx.fillText('물 분자의 분극', W2 / 2, 18);
    ctx.fillStyle = state.balloonSign < 0 ? '#5a9df0' : '#e8577a';
    ctx.fillText(state.balloonSign < 0 ? '풍선 (−)' : '풍선 (+)', 50, cy);
    for (let i = 0; i < 3; i++) {
      const x = 130 + i * 70;
      ctx.strokeStyle = '#9fb0c2';
      ctx.beginPath(); ctx.arc(x, cy, 22, 0, 7); ctx.stroke();
      // 가까운 쪽에 반대 부호
      sign(x - 12, cy, -state.balloonSign);
      sign(x + 12, cy, state.balloonSign);
    }
    ctx.fillStyle = '#69d98c';
    ctx.fillText('← 알짜힘은 언제나 풍선 쪽', W2 / 2 + 40, cy + 44);
  }

  function graphFootHTML() {
    if (state.mode === 'balls') {
      return '전하는 새로 생기지 않습니다 — <b>이동하거나 치우칠 뿐</b> 총량은 보존됩니다';
    }
    return '가까운 쪽 반대 전하가 받는 인력이 먼 쪽 척력보다 커서 <b>항상 인력</b>이 남습니다';
  }

  /* ══ 기록표 (해 보기 16쪽) ═══════════════════ */
  const recordColumns = [
    '실험', '단계 / 조건', '관찰 결과', '해석',
  ];

  function recordRow() {
    if (state.mode === 'balls') {
      const obs = {
        1: ['A 가 빨대 쪽으로 끌려감', '정전기 유도 (가까운 쪽 반대 전하)'],
        2: ['움직임 없음', '중성 상태로 복귀, 접촉으로 한 도체가 됨'],
        3: ['분리 후에도 대전 유지', 'A(+), B(−) 로 반대 대전'],
        4: ['A 는 끌리고 B 는 밀림', 'A(+)·B(−) 확인 — 유도로 대전 성공'],
      }[state.step];
      return [['도체 공', STEP_NAMES[state.step], obs[0], obs[1]]];
    }
    return [['물줄기', `풍선 ${state.balloonSign < 0 ? '(−)' : '(+)'} · 거리 ${state.balloonDist.toFixed(1)}`,
      '물줄기가 풍선 쪽으로 휨', '유전 분극 — 부호와 무관하게 인력']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0~2 도체 공 유도 단계 진행 · 3 물줄기 휘게 하기 · 4 풍선 부호 바꿔도 같음  */
  const mis = { step: 0, water: false, signs: {} };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'balls') mis.step = Math.max(mis.step, state.step);
    if (state.mode === 'water') {
      mis.water = true;
      if (state.balloonDist < 2.0) mis.signs[state.balloonSign] = true;
    }
    if (i === 0) return mis.step >= 2;
    if (i === 1) return mis.step >= 3;
    if (i === 2) return mis.step >= 4;
    if (i === 3) return mis.water;
    if (i === 4) return Object.keys(mis.signs).length >= 2;
    return false;
  }

  return {
    missionDone,
    id: 'electrostatic',
    title: '도체 공과 물줄기 — 정전기 유도 체험',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
