/**
 * 상자 속 구슬 — 엔트로피 샌드박스 (⑤ 샌드박스형)
 * 비상교육 고등 역학과 에너지 II-05 (교과서 72~75쪽)
 *
 * 구슬 모드 — 해 보기 73쪽: 한쪽 상자에 넣은 구슬 20개를 흔들면 골고루 퍼진다.
 *            상태 수 W = C(N, n) 가 최대인 쪽으로 — 엔트로피 증가.
 * 열 모드   — 74쪽: 고온 → 저온으로만 열이 흐르고 ΔS = Q(1/T_L − 1/T_H) > 0.
 */
const EntropyScene = (() => {
  const B = () => BABYLON;

  const N_MARBLE = 20;
  const HOP_RATE = 0.55;       // 흔들 때 구슬이 초당 문을 지날 확률
  const BOX_W = 4.2, BOX_H = 3.0, BOX_D = 4.2, GAP = 1.1;
  const BLK_W = 2.4;           // 금속 블록의 폭 — 중심 사이가 이 값이면 맞닿는다
  const BLK_APART = 2.9;       // 처음에는 떨어뜨려 둔다 (손으로 끌어다 붙인다)

  let scene, camera, canvasRef = null;
  let boxG, marbles = [], blockA, blockB, blockTexA, blockTexB, heatArrow;
  let placed = {};

  /* 화면에서 직접 조작할 때 쓰는 값 */
  let blkAx = -BLK_APART, blkBx = BLK_APART;   // 두 금속 블록의 중심 x
  let shakeOff = 0;                            // 손으로 잡아 옮긴 상자의 좌우 어긋남
  let grab = null;                             // 상자를 잡은 상태
  let blkDrag = null;                          // 블록을 끄는 상태
  let stepH = null, stepL = null;              // 3D 화면의 ＋ / － 단추
  let onChangeCb = null;

  const state = {
    mode: 'marbles',    // 'marbles' | 'heat'
    running: false,
  };

  let sim = null;

  const tools = [
    { id: 'boxT', label: '상자 2개', icon: 'bench' },
    { id: 'marbleT', label: '구슬 20개', icon: 'ball' },
    { id: 'blockT', label: '금속 블록 2개', icon: 'weight' },
    { id: 'thermoT', label: '온도계', icon: 'sensor' },
  ];
  const slots = {
    boxT: { name: '가운데 (상자)' },
    marbleT: { name: '왼쪽 상자 안' },
    blockT: { name: '오른쪽 (금속 블록)' },
    thermoT: { name: '앞쪽 (온도계)' },
  };

  /* ══ 통계 ═══════════════════════════════════ */
  /** 이항 계수 C(n, k) */
  function comb(n, k) {
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return Math.round(r);
  }
  const lnW = (nA) => Math.log(comb(N_MARBLE, nA));

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    canvasRef = canvas;
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#c9dff2ff');

    camera = new (B().ArcRotateCamera)(
      'camEn', -Math.PI / 2 + 0.25, 1.05, 18, new (B().Vector3)(0, 1.4, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.5;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('he', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.45, 0.48, 0.52);
    const dir = new (B().DirectionalLight)('de', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 16, -9);
    dir.intensity = 0.35;

    const table = B().MeshBuilder.CreateBox('enTable', { width: 26, height: 0.6, depth: 14 }, scene);
    table.position.y = -0.32;
    table.material = mat('enTableMat', '#9aa3ad', '#c6ccd3', 96);

    buildBoxes();
    buildMarbles();
    buildHeat();
    buildProps();
    buildPlaceholders();
    buildSteppers();
    setupPointer(canvas);

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/entropy.jpg', { x: -8, y: 0, z: 5.5, ry: 0.3 });

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

  function buildBoxes() {
    boxG = new (B().TransformNode)('enBoxes', scene);
    const wallM = new (B().StandardMaterial)('enWallMat', scene);
    wallM.diffuseColor = B().Color3.FromHexString('#d8c9a8');
    wallM.alpha = 0.4;
    // 두 상자: A (x<0), B (x>0), 가운데 벽에 틈
    const T = 0.12, W2 = BOX_W, D = BOX_D;
    // 바닥
    const fl = B().MeshBuilder.CreateBox('enFloor', { width: W2 * 2 + T * 3, height: T, depth: D }, scene);
    fl.position.set(0, T / 2, 0);
    fl.material = mat('enFloorMat', '#b8a988', '#e0d4b8', 48);
    fl.parent = boxG;
    // 바깥 벽 — 손으로 상자를 잡을 수 있도록 벽도 집힌다
    [[-W2 - T / 2, T, BOX_H, D], [W2 + T / 2, T, BOX_H, D]].forEach((c, i) => {
      const b = B().MeshBuilder.CreateBox('enSideW' + i, { width: c[1], height: c[2], depth: c[3] }, scene);
      b.position.set(c[0], BOX_H / 2, 0);
      b.material = wallM; b.parent = boxG;
    });
    [[0, -D / 2 - T / 2], [0, D / 2 + T / 2]].forEach((c, i) => {
      const b = B().MeshBuilder.CreateBox('enFrontW' + i, { width: W2 * 2 + T * 3, height: BOX_H, depth: T }, scene);
      b.position.set(c[0], BOX_H / 2, c[1]);
      b.material = wallM; b.parent = boxG;
    });
    // 가운데 벽 (아래에 틈)
    const mid = B().MeshBuilder.CreateBox('enMidW', { width: T, height: BOX_H - GAP, depth: D }, scene);
    mid.position.set(0, GAP + (BOX_H - GAP) / 2, 0);
    mid.material = wallM; mid.parent = boxG;
    // 라벨
    const lbl = (x, txt) => {
      const p = B().MeshBuilder.CreatePlane('enLbl' + txt, { width: 1.2, height: 1.2 }, scene);
      p.position.set(x, BOX_H + 0.8, 0);
      p.billboardMode = B().Mesh.BILLBOARDMODE_Y;
      const t = new (B().DynamicTexture)('enLblT' + txt, { width: 128, height: 128 }, scene, true);
      const c = t.getContext();
      c.clearRect(0, 0, 128, 128);
      c.fillStyle = '#2f6ad0';
      c.font = 'bold 96px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(txt, 64, 70);
      t.hasAlpha = true; t.update();
      const m = new (B().StandardMaterial)('enLblM' + txt, scene);
      m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.backFaceCulling = false;
      p.material = m;
      p.parent = boxG;
    };
    lbl(-W2 / 2 - 0.5, 'A');
    lbl(W2 / 2 + 0.5, 'B');
  }

  function buildMarbles() {
    for (let i = 0; i < N_MARBLE; i++) {
      const s = B().MeshBuilder.CreateSphere('enM' + i, { diameter: 0.5 }, scene);
      s.material = mat('enMM' + i, i % 2 ? '#d0453a' : '#f0a53c', '#ffe0c0', 64);
      s.isPickable = false;
      marbles.push({
        m: s, side: 'A',
        // 상자 안 배회 목표점
        tx: 0, tz: 0, x: 0, z: 0, y: 0.4,
        vx: 0, vz: 0,
        hopT: 0,        // 문 통과 연출 진행도
      });
    }
  }

  function texBlock(x, hex) {
    const g = new (B().TransformNode)('enBlk' + hex, scene);
    const b = B().MeshBuilder.CreateBox('enBlkB' + hex, { width: 2.4, height: 1.8, depth: 2.0 }, scene);
    b.position.y = 0.9;
    b.material = mat('enBlkM' + hex, hex, '#ffffff', 64);
    b.parent = g;
    const p = B().MeshBuilder.CreatePlane('enBlkL' + hex, { width: 2.2, height: 1.0 }, scene);
    p.position.set(0, 2.4, 0);
    p.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const t = new (B().DynamicTexture)('enBlkT' + hex, { width: 256, height: 116 }, scene, true);
    const m = new (B().StandardMaterial)('enBlkLM' + hex, scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    p.material = m;
    p.parent = g;
    g.position.x = x;
    return [g, t, b];
  }

  function buildHeat() {
    // 전도가 일어나려면 두 블록이 맞닿아야 한다 (블록 폭 2.4 → 중심 사이 2.4)
    // 처음에는 떨어뜨려 두고, 학생이 화면에서 끌어다 맞댄다
    const [ga, ta, ba] = texBlock(blkAx, '#e8577a');
    const [gb, tb, bb] = texBlock(blkBx, '#5a9df0');
    blockA = ga; blockB = gb;
    blockTexA = ta; blockTexB = tb;
    blockA._body = ba; blockB._body = bb;
    // 열 흐름 화살표는 접촉면 위쪽에서 A → B 방향을 가리킨다
    heatArrow = B().MeshBuilder.CreateCylinder('enHArr',
      { height: 1.4, diameterTop: 0, diameterBottom: 0.45 }, scene);
    heatArrow.rotation.z = -Math.PI / 2;
    heatArrow.position.set(0.15, 2.35, 0);
    heatArrow.material = emat('enHArrM', '#ff8a3c');
    // 화살표가 온도 딱지 앞을 가리므로 집히지 않게 — 블록을 끄는 손을 막지 않는다
    heatArrow.isPickable = false;
  }

  const props = {};

  /** 준비 단계용 소품 — 온도계 */
  function buildProps() {
    const g = new (B().TransformNode)('enPropTh', scene);
    const stem = B().MeshBuilder.CreateCylinder('enPropThS', { height: 1.6, diameter: 0.12 }, scene);
    stem.position.y = 0.95;
    stem.rotation.z = 0.35;
    const sm = new (B().StandardMaterial)('enPropThSM', scene);
    sm.diffuseColor = B().Color3.FromHexString('#e8ecf2');
    sm.alpha = 0.9;
    stem.material = sm;
    stem.parent = g;
    const bulb = B().MeshBuilder.CreateSphere('enPropThB', { diameter: 0.28 }, scene);
    bulb.position.set(0.28, 0.2, 0);
    bulb.material = emat('enPropThBM', '#d0453a');
    bulb.parent = g;
    const line = B().MeshBuilder.CreateCylinder('enPropThL', { height: 1.1, diameter: 0.05 }, scene);
    line.position.y = 0.78;
    line.rotation.z = 0.35;
    line.position.x = 0.06;
    line.material = emat('enPropThLM', '#d0453a');
    line.parent = g;
    g.position.set(4.2, 0, -3.8);
    g.setEnabled(false);
    props.thermoT = g;
  }

  function drawBlockLabel(tex, T, name) {
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 256, 116);
    ctx.fillStyle = 'rgba(246,242,230,.95)';
    ctx.beginPath(); ctx.roundRect(0, 0, 256, 116, 16); ctx.fill();
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(name, 128, 8);
    ctx.fillStyle = '#d0453a';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(T.toFixed(1) + ' K', 128, 48);
    tex.update();
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      boxT: { x: 0, z: 0, w: 9.4, h: 5.2, label: '상자 2개' },
      marbleT: { x: -2.2, z: -3.8, w: 3.2, h: 2.2, label: '구슬 20개' },
      blockT: { x: 6.4, z: 0, w: 3.4, h: 2.6, label: '금속 블록' },
      thermoT: { x: 4.2, z: -3.8, w: 3.0, h: 2.2, label: '온도계' },
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
    return (Math.abs(point.x - c.x) <= 5.4 && Math.abs(point.z - c.z) <= 3.4) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    sim = {
      t: 0,
      // 구슬: 모두 A 에서 출발 (해 보기 73쪽 과정 2)
      history: [{ t: 0, nA: N_MARBLE }],
      shake: 0,
      // 열: 고온 360 K, 저온 280 K
      TH: 360, TL: 280, dS: 0, sHist: [{ t: 0, TH: 360, TL: 280, dS: 0 }],
    };
    marbles.forEach((mb, i) => {
      mb.side = 'A';
      mb.x = -BOX_W / 2 - 0.6 + (Math.random() - 0.5) * 2.4;
      mb.x = -BOX_W / 2 + (Math.random() - 0.5) * (BOX_W - 0.8);
      mb.x -= 0; // A 상자 중심 근처
      mb.x = -BOX_W / 2 + (Math.random() - 0.5) * (BOX_W - 0.9);
      mb.z = (Math.random() - 0.5) * (BOX_D - 0.9);
      mb.tx = mb.x; mb.tz = mb.z;
    });
    // 화면에서 직접 조작하던 것도 처음 상태로 — 블록은 다시 떨어뜨려 둔다
    // (잡고 있던 것을 놓아 주는 것이므로 잠가 두었던 카메라도 함께 되돌린다)
    if ((grab || blkDrag) && camera && canvasRef) camera.attachControl(canvasRef, true);
    blkAx = -BLK_APART; blkBx = BLK_APART;
    shakeOff = 0; grab = null; blkDrag = null;
    layout();
  }

  const nA = () => marbles.filter((m) => m.side === 'A').length;

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const mar = state.mode === 'marbles';

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다 (실험대는 항상 보임)
    if (!all) {
      boxG.setEnabled(!!placed.boxT);
      boxG.position.x = 0;
      marbles.forEach((mb) => {
        mb.m.setEnabled(!!placed.marbleT);
        mb.m.position.set(mb.x, mb.y, mb.z);
      });
      blockA.setEnabled(!!placed.blockT);
      blockB.setEnabled(!!placed.blockT);
      blockA.position.x = blkAx; blockB.position.x = blkBx;
      if (placed.blockT) {
        drawBlockLabel(blockTexA, 360, '블록 A (고온)');
        drawBlockLabel(blockTexB, 280, '블록 B (저온)');
      }
      heatArrow.setEnabled(false);
      if (props.thermoT) props.thermoT.setEnabled(!!placed.thermoT);
      layoutSteppers();
      return;
    }
    if (props.thermoT) props.thermoT.setEnabled(!mar);

    boxG.setEnabled(mar);
    marbles.forEach((mb) => mb.m.setEnabled(mar));
    blockA.setEnabled(!mar);
    blockB.setEnabled(!mar);
    heatArrow.setEnabled(!mar && contact() && sim.TH - sim.TL > 1);

    if (mar) {
      // 손으로 잡아 흔든 만큼 상자와 구슬이 함께 움직인다
      // (단추로 흔드는 동안에는 저절로 좌우로 흔들린다)
      const off = grab ? shakeOff : (state.running ? Math.sin(sim.t * 13) * 0.16 : 0);
      boxG.position.x = off;
      marbles.forEach((mb) => {
        mb.m.position.set(mb.x + off, mb.y, mb.z);
      });
    } else {
      blockA.position.x = blkAx;
      blockB.position.x = blkBx;
      heatArrow.position.x = (blkAx + blkBx) / 2 + 0.15;
      drawBlockLabel(blockTexA, sim.TH, '블록 A (고온)');
      drawBlockLabel(blockTexB, sim.TL, '블록 B (저온)');
      // 온도에 따라 색이 변한다
      const kA = Math.min(1, Math.max(0, (sim.TH - 280) / 80));
      const kB = Math.min(1, Math.max(0, (sim.TL - 280) / 80));
      blockA._body.material.diffuseColor = new (B().Color3)(0.45 + kA * 0.45, 0.36, 0.42);
      blockB._body.material.diffuseColor = new (B().Color3)(0.35 + kB * 0.5, 0.42, 0.75 - kB * 0.3);
    }
    layoutSteppers();
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;

    if (state.mode === 'marbles') {
      // 배회 (흔드는 동안 더 빠르게)
      const speed = state.running ? 3.2 : 0.5;
      marbles.forEach((mb) => {
        // 목표점 갱신
        if (Math.random() < dt * 1.5) {
          const cx = mb.side === 'A' ? -BOX_W / 2 : BOX_W / 2;
          mb.tx = cx + (Math.random() - 0.5) * (BOX_W - 0.9);
          mb.tz = (Math.random() - 0.5) * (BOX_D - 0.9);
        }
        mb.x += (mb.tx - mb.x) * Math.min(1, dt * speed);
        mb.z += (mb.tz - mb.z) * Math.min(1, dt * speed);
        mb.y = 0.4 + (state.running ? Math.abs(Math.sin(sim.t * 9 + mb.tx * 3)) * 0.35 : 0);
        // 흔드는 동안 확률적으로 문을 통과
        if (state.running && Math.random() < HOP_RATE * dt) {
          mb.side = mb.side === 'A' ? 'B' : 'A';
          const cx = mb.side === 'A' ? -BOX_W / 2 : BOX_W / 2;
          mb.tx = cx + (Math.random() - 0.5) * (BOX_W - 0.9);
        }
      });
      if (state.running) {
        sim.t += dt;
        if (sim.history.length === 0 || sim.t - sim.history[sim.history.length - 1].t > 0.25) {
          sim.history.push({ t: sim.t, nA: nA() });
          if (sim.history.length > 240) sim.history.shift();
        }
      }
      layout();
      return true;
    }

    // 열 모드: Q̇ ∝ (TH−TL), 열용량 같다고 가정
    if (!state.running) return false;
    // 떨어져 있으면 열이 흐르지 않는다 (손으로 떼어 놓으면 멈춘다)
    if (!contact()) { state.running = false; syncRunBtn(); layout(); return true; }
    const kCond = 0.10;                  // 전도 계수 (연출)
    const C = 50;                        // 각 블록 열용량 (J/K)
    const Qdot = kCond * (sim.TH - sim.TL) * C;
    const dQ = Qdot * dt;
    if (sim.TH - sim.TL > 0.05) {
      sim.dS += dQ * (1 / sim.TL - 1 / sim.TH);
      sim.TH -= dQ / C;
      sim.TL += dQ / C;
    }
    sim.t += dt;
    if (sim.sHist.length === 0 || sim.t - sim.sHist[sim.sHist.length - 1].t > 0.2) {
      sim.sHist.push({ t: sim.t, TH: sim.TH, TL: sim.TL, dS: sim.dS });
      if (sim.sHist.length > 300) sim.sHist.shift();
    }
    layout();
    return true;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.25;
    camera.beta = 1.05;
    camera.radius = 18;
    camera.setTarget(new (B().Vector3)(state.mode === 'marbles' ? 0 : 0, 1.4, 0));
  }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     구슬 모드 — 상자를 «톡 누르면» 흔들기가 시작·정지되고,
                «잡고 좌우로 흔들면» 흔드는 동안에만 구슬이 섞인다.
     열 모드   — 금속 블록을 «끌어다 맞대면» 열이 흐르고 «떼어 놓으면» 멈춘다.
                떨어져 있을 때는 블록 위 ＋ / － 로 처음 온도를 맞춘다.        */

  /** 두 블록이 맞닿았는가 */
  function contact() { return blkBx - blkAx <= BLK_W + 0.06; }

  function buildSteppers() {
    stepH = LabUI.makeStepper(scene, 'TH');
    stepL = LabUI.makeStepper(scene, 'TL');
  }

  /** ＋ / － 단추는 블록 바로 위에 띄우고, 떨어져 있을 때만 쓴다 */
  function layoutSteppers() {
    if (!stepH) return;
    const on = allPlaced() && state.mode === 'heat' && !contact();
    stepH.place(blkAx, 3.6, 0, 0.75);
    stepL.place(blkBx, 3.6, 0, 0.75);
    stepH.setEnabled(on);
    stepL.setEnabled(on);
  }

  /** 하단의 실행 단추 글씨를 지금 상태에 맞춘다 */
  function runLabel() { return state.mode === 'marbles' ? '▶ 흔들기' : '▶ 블록 접촉'; }
  function syncRunBtn() {
    const b = document.querySelector('#runBtn');
    if (!b) return;
    b.textContent = state.running
      ? (state.mode === 'marbles' ? '흔드는 중…' : '열 이동 중…') : runLabel();
    b.classList.toggle('run', state.running);
  }

  /** 화면의 한 점을 «카메라를 마주 보는 세로 평면» 위의 세계 좌표로 바꾼다 */
  function pointerOn(y) {
    const org = new (B().Vector3)(0, y, 0);
    const nx = camera.position.x - org.x, nz = camera.position.z - org.z;
    const len = Math.hypot(nx, nz);
    if (len < 1e-4) return null;
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(org, new (B().Vector3)(nx / len, 0, nz / len));
    const d = ray.intersectsPlane(plane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d));
  }

  /** 블록의 처음 온도를 10 K 씩 올리고 내린다 (맞대기 전에만)
   *  한계에 걸리면 그대로 둔다 — 누른 것과 «반대쪽»으로 튀지 않게 (열이 얼마쯤
   *  흐른 뒤 떼어 놓으면 두 온도의 차가 20 K 보다 작을 수 있다) */
  function bumpT(which, d) {
    if (!sim || contact()) return;
    const now = which === 'H' ? sim.TH : sim.TL;
    const v = which === 'H'
      ? Math.min(380, Math.max(sim.TL + 20, sim.TH + d * 10))
      : Math.max(260, Math.min(sim.TH - 20, sim.TL + d * 10));
    if (d > 0 ? v <= now : v >= now) return;      // 한계 — 아무 일도 하지 않는다
    if (which === 'H') sim.TH = v; else sim.TL = v;
    // 아직 흐르기 전이면 출발점을 고쳐 잡고, 이미 흘렀으면 그 자리에서 이어 그린다
    const last = { t: sim.t, TH: sim.TH, TL: sim.TL, dS: sim.dS };
    if (sim.t === 0) sim.sHist = [last];
    else sim.sHist.push(last);
    layout();
    if (onChangeCb) onChangeCb();
  }

  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const pm = (pi.pickInfo && pi.pickInfo.pickedMesh) || null;
      const nm = pm ? pm.name : '';

      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced() || !sim) return;
        if (nm === 'btnAddTH') { bumpT('H', +1); return; }
        if (nm === 'btnSubTH') { bumpT('H', -1); return; }
        if (nm === 'btnAddTL') { bumpT('L', +1); return; }
        if (nm === 'btnSubTL') { bumpT('L', -1); return; }

        if (state.mode === 'marbles') {
          // 상자를 잡는다 (바닥·벽 어디든)
          if (!pm || pm.parent !== boxG) return;
          const p = pointerOn(BOX_H / 2);
          if (!p) return;
          grab = { x0: p.x, last: p.x, path: 0, moved: false, was: state.running };
          shakeOff = 0;
          camera.detachControl();
          return;
        }
        // 열 모드 — 블록을 집는다 (몸통이든 온도 딱지든)
        let which = null;
        if (pm && (pm === blockA._body || pm.parent === blockA)) which = 'A';
        else if (pm && (pm === blockB._body || pm.parent === blockB)) which = 'B';
        if (!which) return;
        const p = pointerOn(0.9);
        if (!p) return;
        blkDrag = { which, x0: p.x, base: which === 'A' ? blkAx : blkBx };
        camera.detachControl();
        return;
      }

      if (pi.type === T.POINTERMOVE) {
        if (grab) {
          const p = pointerOn(BOX_H / 2);
          if (!p) return;
          shakeOff = Math.max(-1.1, Math.min(1.1, p.x - grab.x0));
          grab.path += Math.abs(p.x - grab.last);
          grab.last = p.x;
          // 좌우로 충분히 흔들면 그때부터 구슬이 섞인다
          if (!grab.moved && grab.path > 0.5) {
            grab.moved = true;
            state.running = true;
            syncRunBtn();
          }
          layout();
          if (onChangeCb) onChangeCb();
          return;
        }
        if (blkDrag) {
          const p = pointerOn(0.9);
          if (!p) return;
          const was = contact();
          // 상대 블록을 뚫고 지나가지는 못한다 (맞닿는 데까지만)
          const nx2 = blkDrag.base + (p.x - blkDrag.x0);
          if (blkDrag.which === 'A') blkAx = Math.max(-4.6, Math.min(blkBx - BLK_W, nx2));
          else blkBx = Math.min(4.6, Math.max(blkAx + BLK_W, nx2));
          const now = contact();
          if (now !== was) {          // 맞대면 열이 흐르고, 떼면 멈춘다
            state.running = now;
            syncRunBtn();
          }
          layout();
          if (onChangeCb) onChangeCb();
        }
        return;
      }

      if (pi.type === T.POINTERUP) endDrag(canvas);
    });
    // 화면 밖에서 손을 떼도 잡은 것이 풀리도록
    const release = () => { if (grab || blkDrag) endDrag(canvas); };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }

  /** 잡았던 것을 놓는다 */
  function endDrag(canvas) {
    if (grab) {
      // 거의 움직이지 않았으면 «톡 누른 것» — 흔들기를 켜고 끈다
      state.running = grab.moved ? grab.was : !grab.was;
      grab = null;
      shakeOff = 0;
    } else if (blkDrag) {
      // 맞닿았으면 딱 붙여 준다
      if (contact()) {
        if (blkDrag.which === 'A') blkAx = blkBx - BLK_W;
        else blkBx = blkAx + BLK_W;
      }
      blkDrag = null;
    } else {
      return;
    }
    camera.attachControl(canvas, true);
    syncRunBtn();
    layout();
    if (onChangeCb) onChangeCb();
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '상자를 흔들면 구슬이 양쪽으로 골고루 퍼집니다. 화면에서 상자를 잡고 직접 흔들어도 됩니다. 다시 한쪽으로 모이는 일은 일어날까요? 상태 수 W 를 지켜보세요.';
  const prepGuide = '점선 자리에 상자·구슬·금속 블록·온도계를 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'marbles', t: '상자 속 구슬 (73쪽)' }, { v: 'heat', t: '열의 이동 (74쪽)' },
    ], state.mode, 1);
    if (state.mode === 'marbles') {
      return `
        ${modeBtns}
        <div class="control">
          <div class="clabel">상자<br>흔들기</div>
          <button class="power" id="runBtn">▶ 흔들기</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>
        <div class="control">
          <div class="clabel">직접<br>조작</div>
          <div class="cbody"><p class="hands-on">화면의 <b>상자를 톡 누르면</b> 흔들기가 시작·정지되고,
            <b>상자를 잡고 좌우로 흔들면</b> 흔드는 동안에만 구슬이 섞인다.</p></div>
        </div>`;
    }
    return `
      ${modeBtns}
      <div class="control">
        <div class="clabel">접촉</div>
        <button class="power" id="runBtn">▶ 블록 접촉</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">화면의 <b>금속 블록을 끌어다 맞대면</b> 열이 흐르고
          <b>떼어 놓으면</b> 멈춘다. 떨어져 있는 동안에는 블록 위 <b>＋ －</b> 로 처음 온도를 10 K 씩 맞춘다.</p></div>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));
    const run = root.querySelector('#runBtn');
    const label = runLabel();
    run.addEventListener('click', () => {
      state.running = !state.running;
      // 단추로 열 이동을 시작하면 블록도 저절로 맞닿는다
      if (state.running && state.mode === 'heat' && !contact()) {
        const c = (blkAx + blkBx) / 2;
        blkAx = c - BLK_W / 2; blkBx = c + BLK_W / 2;
        layout();
      }
      run.textContent = state.running ? (state.mode === 'marbles' ? '흔드는 중…' : '열 이동 중…') : label;
      run.classList.toggle('run', state.running);
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      run.textContent = label;
      run.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'marbles') {
      const a = nA(), b = N_MARBLE - a;
      const W = comb(N_MARBLE, a);
      const Wmax = comb(N_MARBLE, N_MARBLE / 2);
      const pAll = Math.pow(2, -N_MARBLE);
      return `
        <div class="row"><span>A 상자의 구슬</span><b class="big">${a}개</b></div>
        <div class="row"><span>B 상자의 구슬</span><b class="big">${b}개</b></div>
        <div class="sec">상태 수 (볼츠만)</div>
        <div class="row"><span>지금 배열의 상태 수 <i>W</i> = C(20, ${a})</span>
          <b>${W.toLocaleString()}</b></div>
        <div class="row"><span>가장 많은 상태 수 (10:10)</span>
          <b>${Wmax.toLocaleString()}</b></div>
        <div class="row"><span>엔트로피 <i>S</i>/<i>k</i> = ln <i>W</i></span>
          <b>${lnW(a).toFixed(2)}</b></div>
        <div class="row"><span>전체 상태 수 2²⁰</span><b>${Math.pow(2, 20).toLocaleString()}</b></div>
        <div class="row"><span>모두 A 로 돌아갈 확률</span>
          <b>${(pAll * 100).toExponential(2)} %</b></div>
        <div class="formula">계는 <b>상태 수가 큰 배열</b>(반반)로 변해 갑니다.
          20개가 저절로 한쪽에 모이는 일은 확률이 100만분의 1도 안 되어 사실상 일어나지 않습니다
          — 이것이 <b>비가역</b>의 정체입니다.</div>`;
    }
    return `
      <div class="row"><span>블록 A (고온)</span><b class="big">${sim.TH.toFixed(1)} K</b></div>
      <div class="row"><span>블록 B (저온)</span><b class="big">${sim.TL.toFixed(1)} K</b></div>
      <div class="row"><span>열의 방향</span>
        <b>${!contact() ? '떨어져 있어 열이 흐르지 않음'
      : (sim.TH - sim.TL > 1 ? 'A → B (고온 → 저온)' : '열평형 도달!')}</b></div>
      <div class="sec">엔트로피</div>
      <div class="row"><span>누적 Δ<i>S</i> = ΣQ(1/T<sub>L</sub> − 1/T<sub>H</sub>)</span>
        <b class="big">+${sim.dS.toFixed(3)} J/K</b></div>
      <div class="formula">고온이 잃는 엔트로피 Q/T<sub>H</sub> 보다 저온이 얻는 Q/T<sub>L</sub> 이
        항상 크므로 합은 언제나 <b>증가</b>합니다. 저온에서 고온으로 저절로 흐르는 일은 없습니다
        — 열역학 제2법칙.</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '골고루 퍼져 가는 구슬';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 40, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;

    if (state.mode === 'marbles') {
      const TW = Math.max(10, sim ? sim.t : 10);
      const xOf = (t) => padL + (t / TW) * gw;
      const yOf = (n) => padT + gh - (n / N_MARBLE) * gh;
      // 절반 기준선
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(padL, yOf(10)); ctx.lineTo(padL + gw, yOf(10)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('반반 (상태 수 최대)', padL + 4, yOf(10) - 2);
      if (sim && sim.history.length > 1) {
        ctx.strokeStyle = '#f0a53c'; ctx.lineWidth = 2;
        ctx.beginPath();
        sim.history.forEach((p, i) => {
          if (i === 0) ctx.moveTo(xOf(p.t), yOf(p.nA)); else ctx.lineTo(xOf(p.t), yOf(p.nA));
        });
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
      ctx.stroke();
      ctx.fillStyle = '#9fb0c2';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('시간 →', W2 - 4, padT + gh + 4);
      ctx.save();
      ctx.translate(10, padT + gh / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.fillText('A 상자의 구슬 수', 0, 0);
      ctx.restore();
      return;
    }

    // 열 모드: TH·TL 수렴 + ΔS 증가
    const TW = Math.max(10, sim ? sim.t : 10);
    const xOf = (t) => padL + (t / TW) * gw;
    const yOfT = (T) => padT + gh - ((T - 260) / 120) * gh;
    const yOfS = (s) => padT + gh - (s / 3.5) * gh;
    if (sim && sim.sHist.length > 1) {
      const line = (f, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath();
        sim.sHist.forEach((p, i) => {
          const y = f(p);
          if (i === 0) ctx.moveTo(xOf(p.t), y); else ctx.lineTo(xOf(p.t), y);
        });
        ctx.stroke();
      };
      line((p) => yOfT(p.TH), '#e8577a');
      line((p) => yOfT(p.TL), '#5a9df0');
      line((p) => yOfS(p.dS), '#69d98c');
    }
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#e8577a'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('T_H', padL + 6, padT + 2);
    ctx.fillStyle = '#5a9df0'; ctx.fillText('T_L', padL + 36, padT + 2);
    ctx.fillStyle = '#69d98c'; ctx.fillText('ΔS (항상 증가)', padL + 66, padT + 2);
  }

  function graphFootHTML() {
    if (state.mode === 'marbles') {
      return 'A 의 구슬 수가 <b>10 근처</b>로 가서 요동합니다 — 20 으로 되돌아가는 일은 관찰되지 않습니다';
    }
    // 두 블록의 열용량이 같으므로 열평형 온도는 «두 온도의 한가운데» — 흐르는 동안 변하지 않는다
    // (＋ / － 로 처음 온도를 바꾸면 320 K 가 아닐 수 있다)
    const Teq = sim ? (sim.TH + sim.TL) / 2 : 320;
    return `두 온도는 <b>열평형</b>(${Teq.toFixed(0)} K)으로 수렴하고 엔트로피는 <b>단조 증가</b>합니다`;
  }

  /* ══ 기록표 (해 보기 73쪽) ═══════════════════ */
  const recordColumns = [
    '실험', '시간 (s)', '조건 / A:B', '상태 수 <i>W</i>', 'ln <i>W</i> 또는 Δ<i>S</i>',
  ];

  function recordRow() {
    if (state.mode === 'marbles') {
      const a = nA();
      return [['구슬', sim.t.toFixed(1), `${a} : ${N_MARBLE - a}`,
        comb(N_MARBLE, a).toLocaleString(), lnW(a).toFixed(2)]];
    }
    return [['열 이동', sim.t.toFixed(1),
      `${sim.TH.toFixed(1)} K / ${sim.TL.toFixed(1)} K`, '—', '+' + sim.dS.toFixed(3) + ' J/K']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 구슬 섞기 실행 · 1 거의 반반이 되는 것 확인 · 2 경우의 수가 큰 상태
     3 열 이동 모드 · 4 기록 3줄                                           */
  const mis = { ran: false, half: false, heat: false, maxW: 0 };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'marbles' && state.running) {
      mis.ran = true;
      const a = nA();
      if (Math.abs(a - N_MARBLE / 2) <= N_MARBLE * 0.15) mis.half = true;
      mis.maxW = Math.max(mis.maxW, lnW(a));
    }
    if (state.mode === 'heat' && state.running) mis.heat = true;

    if (i === 0) return mis.ran;
    if (i === 1) return mis.half;
    if (i === 2) return mis.maxW >= lnW(Math.round(N_MARBLE / 2)) - 0.4;
    if (i === 3) return mis.heat;
    if (i === 4) return recs().length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'entropy',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '상자 속 구슬 — 엔트로피 샌드박스',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, comb, nA,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
