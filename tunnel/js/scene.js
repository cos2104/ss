/**
 * 벽을 통과하는 전자 — 터널 효과 (① 시공간 초월형)
 * 비상교육 고등 전자기와 양자 III-03 (교과서 102~105쪽)
 *
 * 파동 모드 — 해 보기 103쪽: 파동 묶음이 퍼텐셜 장벽을 만나 일부는 반사,
 *            일부는 확률적으로 통과한다. 높이·두께·에너지를 바꿔 본다.
 * STM 모드 — 그림 III-14: 탐침-시료 틈이 장벽. 터널링 전류로 원자를 '본다'.
 */
const TunnelScene = (() => {
  const B = () => BABYLON;

  let scene, camera;
  let boardPlane, boardTex, stmG, tip, atoms2 = [], currentTex;
  let placed = {};

  const state = {
    mode: 'packet',      // 'packet' | 'stm'
    E: 5,                // 전자 에너지 (eV, 연출)
    V0: 10,              // 장벽 높이
    w: 0.8,              // 장벽 두께 (nm)
    gap: 0.7,            // STM: 탐침-시료 거리 (nm)
    tipX: 0,             // STM: 탐침 위치
    running: false,
  };

  let sim = null;

  /* ══ 3D 화면에서 직접 조작 — 모듈 변수 ══════════
     · 판 위 장벽의 «옆면»을 좌우로 끌면 두께 w, «윗면»을 위아래로 끌면 높이 V₀
     · 노란 «에너지 선»을 위아래로 끌면 전자 에너지 E
     · 전자 발생기를 누르면 파동을 쏘고, 옆 이름표를 누르면 전자를 1개 쏜다
     · STM 에서는 탐침을 잡아 좌우로 옮기고 위아래로 틈을 조절한다          */
  let canvasEl = null;        // create() 가 받은 canvas — 끌기 중 카메라를 떼었다 붙인다
  let onChangeCb = null;      // 3D 로 값을 바꿔도 측정값·그래프가 갱신되도록
  let glowL = null;           // 글로우 레이어 (이름표 글씨가 하얗게 번지지 않게 제외)
  let drag = null;            // { what, dx, dy, … }
  let stepGap = null;         // STM 틈 ＋ · －
  let runTag = null, shotTag = null, gapTag = null;

  const tools = [
    { id: 'srcT', label: '전자 발생기', icon: 'tower' },
    { id: 'barrierT', label: '퍼텐셜 장벽', icon: 'screenBoard' },
    { id: 'detT', label: '검출기 2개', icon: 'sensor' },
    { id: 'stmT', label: 'STM 탐침', icon: 'wire' },
  ];
  const slots = {
    srcT: { name: '왼쪽 (발생기)' },
    barrierT: { name: '가운데 (장벽)' },
    detT: { name: '양쪽 (검출기)' },
    stmT: { name: '오른쪽 (탐침)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 직사각형 장벽의 정확한 투과 확률 (m=1, ħ=1 단위) */
  function transT(E, V0, w) {
    E = E || state.E; V0 = V0 || state.V0; w = w || state.w;
    if (Math.abs(E - V0) < 1e-6) E = V0 - 1e-6;
    if (E < V0) {
      const k = Math.sqrt(2 * (V0 - E));
      const s = Math.sinh(k * w);
      return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E)));
    }
    const k2 = Math.sqrt(2 * (E - V0));
    const s = Math.sin(k2 * w);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
  }
  /** STM 전류 (상대값): I ∝ e^(−2κd), κ=√(2Φ), Φ=4 eV 일함수 가정 */
  const stmI = (d) => 100 * Math.exp(-2 * Math.sqrt(8) * (d - 0.4));
  /** 시료 표면 원자 높이 (nm): 원자 3개의 봉우리 */
  function surfaceH(x) {
    let h = 0;
    [-2.4, 0, 2.4].forEach((c) => { h = Math.max(h, 0.18 * Math.exp(-((x - c) ** 2) / 0.5)); });
    return h;
  }

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    canvasEl = canvas;          // 끌기 중 카메라를 떼었다 붙일 때 쓴다
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#141a28ff');

    camera = new (B().ArcRotateCamera)(
      'camTu', -Math.PI / 2, 1.3, 17, new (B().Vector3)(0, 3, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('htu', new (B().Vector3)(0, 1, 0), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new (B().Color3)(0.3, 0.32, 0.4);
    const glow = new (B().GlowLayer)('tuGlow', scene);
    glow.intensity = 0.5;
    glowL = glow;

    // 실험대 — 항상 보이는 기본 배경
    const bench = B().MeshBuilder.CreateBox('tuBench', { width: 22, height: 0.5, depth: 12 }, scene);
    bench.position.y = -0.26;
    bench.material = mat('tuBenchMat', '#242c3c', '#3a4a60', 48);

    buildBoard();
    buildSTM();
    buildProps();
    buildHands();
    buildPlaceholders();
    setupPointer();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/tunnel.jpg', { x: -12, y: 0, z: -3 });

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

  /* ── 판(화면)의 크기·자리와 그림 눈금 ───────────
     그리기와 «직접 조작»이 같은 환산식을 써야 손잡이를 정확히 집을 수 있다.  */
  const BW = 12, BHT = 7, BCY = 3.4, BCZ = 0.5;             // 판의 가로·세로·중심 높이·깊이
  const PX0 = 60, PX1 = 1140, YMID = 420, EH = 260;         // 그림 안 눈금 (px)
  const bxOf = (u) => PX0 + ((u + 6) / 12) * (PX1 - PX0);   // 위치(nm) → 가로 px
  const buOf = (px) => ((px - PX0) / (PX1 - PX0)) * 12 - 6; // 가로 px → 위치(nm)
  const byOf = (v) => YMID - (v / 14) * EH;                 // 에너지 → 세로 px
  const bvOf = (py) => ((YMID - py) / EH) * 14;             // 세로 px → 에너지
  const barH = () => (state.V0 / 14) * EH;                  // 장벽의 그림 높이 (px)
  const HKX = 30, HKY = 92;                                 // 옆면 손잡이의 어긋난 자리

  function buildBoard() {
    boardPlane = B().MeshBuilder.CreatePlane('tuBoard', { width: BW, height: BHT }, scene);
    boardPlane.position.set(0, BCY, BCZ);
    boardTex = new (B().DynamicTexture)('tuBoardTex', { width: 1200, height: 700 }, scene, true);
    const m = new (B().StandardMaterial)('tuBoardM', scene);
    m.diffuseTexture = boardTex;
    m.emissiveTexture = boardTex;
    m.emissiveColor = new (B().Color3)(0.85, 0.85, 0.85);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    boardPlane.material = m;
  }

  /** 파동 묶음 화면 그리기 (103쪽 그림 재현) */
  function drawPacket() {
    const ctx = boardTex.getContext();
    ctx.fillStyle = '#1c2436';
    ctx.fillRect(0, 0, 1200, 700);
    const X0 = PX0, X1 = PX1, H = 200;
    const xOf = bxOf;                                     // u: -6~6 (nm 연출)

    // 에너지 축 (장벽)
    const bx0 = xOf(-state.w / 2), bx1 = xOf(state.w / 2);
    const bh = barH();
    ctx.fillStyle = 'rgba(122,132,148,.55)';
    ctx.fillRect(bx0, YMID - bh, bx1 - bx0, bh + 180);
    ctx.strokeStyle = '#9fb0c2'; ctx.lineWidth = 2;
    ctx.strokeRect(bx0, YMID - bh, bx1 - bx0, bh + 180);
    // 전자 에너지 선
    const ey = byOf(state.E);
    ctx.strokeStyle = '#ffd84a';
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(X0, ey); ctx.lineTo(X1, ey); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd84a';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`전자 에너지 E = ${state.E.toFixed(1)}`, X0 + 6, ey - 6);
    ctx.fillStyle = '#9fb0c2';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    // 이름표는 «윗면 손잡이» 위로 띄워 겹치지 않게 한다
    ctx.fillText(`장벽 V₀ = ${state.V0.toFixed(1)} · 두께 ${state.w.toFixed(1)} nm`, (bx0 + bx1) / 2, YMID - bh - 34);

    // 파동 묶음 |Ψ|²
    const T = transT();
    const pos = sim.px;                     // 묶음 중심
    const packet = (c, amp, karr) => {
      ctx.strokeStyle = karr || '#7ae0a0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const u = -6 + (i / 240) * 12;
        const g = amp * Math.exp(-((u - c) ** 2) / 0.9);
        // 장벽 안에서는 지수적으로 감쇠하는 모양
        let damp = 1;
        if (u > -state.w / 2 && u < state.w / 2) {
          damp = Math.exp(-2.2 * (u + state.w / 2));
        }
        const y = YMID + 150 - g * damp * H;
        if (i === 0) ctx.moveTo(xOf(u), y); else ctx.lineTo(xOf(u), y);
      }
      ctx.stroke();
    };
    if (sim.phase === 'in') {
      packet(pos, 1);
    } else {
      packet(sim.rx, 1 - T, '#f0a53c');   // 반사 (주황)
      packet(sim.tx, T * 3 < 1 ? Math.max(0.08, T * 3) : 1, '#7ae0a0'); // 통과 (초록, 최소 표시)
    }
    ctx.fillStyle = '#7ae0a0';
    ctx.font = 'bold 24px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('|Ψ|² — 전자를 발견할 확률', X0, 24);
    if (sim.phase !== 'in') {
      ctx.fillStyle = '#f0a53c';
      ctx.textAlign = 'left';
      ctx.fillText(`반사 ${(100 * (1 - T)).toFixed(1)} %`, X0 + 10, YMID + 165);
      ctx.fillStyle = '#7ae0a0';
      ctx.textAlign = 'right';
      ctx.fillText(`통과 ${(100 * T).toFixed(2)} %`, X1 - 10, YMID + 165);
    }
    drawHandles(ctx, bx0, bx1, bh, ey);
    boardTex.update();
  }

  /** 손으로 끌 수 있는 «손잡이» — 장벽 옆면·윗면과 에너지 선 (그림 맨 위에 얹는다) */
  function drawHandles(ctx, bx0, bx1, bh, ey) {
    const knob = (x, y, hex, ink, sym) => {
      ctx.fillStyle = hex;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(28,36,54,.75)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sym, x, y + 1);
    };
    knob(bx0 - HKX, YMID + HKY, '#cfd8e4', '#1c2436', '↔');   // 왼쪽 옆면 — 두께
    knob(bx1 + HKX, YMID + HKY, '#cfd8e4', '#1c2436', '↔');   // 오른쪽 옆면 — 두께
    knob((bx0 + bx1) / 2, YMID - bh, '#cfd8e4', '#1c2436', '↕'); // 윗면 — 높이
    knob(PX1 - 70, ey, '#ffd84a', '#3a2c00', '↕');            // 에너지 선 — E

    ctx.fillStyle = '#8e9bad';
    ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('동그란 손잡이를 끌어 두께 · 높이 · 에너지를 바꿔 보세요', PX1, 26);
  }

  function buildSTM() {
    stmG = new (B().TransformNode)('tuSTM', scene);
    // 시료 표면 (원자 3개)
    const base = B().MeshBuilder.CreateBox('tuBase', { width: 10, height: 0.8, depth: 3 }, scene);
    base.position.y = 0.4;
    base.material = mat('tuBaseM', '#39424f', '#6a7a96', 64);
    base.parent = stmG;
    [-2.4, 0, 2.4].forEach((x, i) => {
      const a = B().MeshBuilder.CreateSphere('tuAtom' + i, { diameter: 1.5 }, scene);
      a.position.set(x, 1.1, 0);
      a.material = mat('tuAtomM' + i, '#5a9df0', '#cfe4ff', 48);
      a.parent = stmG;
      atoms2.push(a);
    });
    // 탐침
    tip = B().MeshBuilder.CreateCylinder('tuTip', { height: 2.2, diameterTop: 1.2, diameterBottom: 0.06 }, scene);
    tip.material = mat('tuTipM', '#d8b44a', '#ffe8a0', 96);
    tip.parent = stmG;
    // 전류계 — 탐침이 오른쪽 끝(x = 4.5, 위쪽 지름 1.2)까지 가도 뚫고 지나가지 않도록
    //          x = 7.0 (계기판 왼쪽 모서리 5.5) 에 두어 0.4 만큼 띄운다
    const p = B().MeshBuilder.CreatePlane('tuAmm', { width: 3, height: 2 }, scene);
    p.position.set(7.0, 4.6, 0);
    currentTex = new (B().DynamicTexture)('tuAmmTex', { width: 300, height: 200 }, scene, true);
    const m = new (B().StandardMaterial)('tuAmmM', scene);
    m.diffuseTexture = currentTex; m.emissiveTexture = currentTex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    p.material = m;
    p.parent = stmG;
    // 글로우 레이어가 계기판을 하얗게 태워 눈금이 안 보이던 것을 막는다
    if (glowL && glowL.addExcludedMesh) glowL.addExcludedMesh(p);
  }

  const props = {};

  /** 준비 단계용 소품 — 전자 발생기와 검출기 */
  function buildProps() {
    const gs = new (B().TransformNode)('tuPropSrc', scene);
    const body = B().MeshBuilder.CreateCylinder('tuPropSB', { height: 1.6, diameter: 0.9 }, scene);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.6;
    body.material = mat('tuPropSBM', '#39424f', '#8e9bad', 64);
    body.parent = gs;
    const nose = B().MeshBuilder.CreateCylinder('tuPropSN', { height: 0.5, diameterTop: 0.25, diameterBottom: 0.7 }, scene);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.95, 0.6, 0);
    nose.material = emat('tuPropSNM', '#7ae0a0');
    nose.parent = gs;
    gs.position.set(-6, 0, 0);
    gs.setEnabled(false);
    props.srcT = gs;

    const gd = new (B().TransformNode)('tuPropDet', scene);
    const dbody = B().MeshBuilder.CreateBox('tuPropDB', { width: 0.9, height: 1.3, depth: 0.9 }, scene);
    dbody.position.y = 0.65;
    dbody.material = mat('tuPropDBM', '#2b3441', '#7a8aa0', 64);
    dbody.parent = gd;
    const win = B().MeshBuilder.CreatePlane('tuPropDW', { width: 0.6, height: 0.8 }, scene);
    win.position.set(-0.46, 0.7, 0);
    win.rotation.y = Math.PI / 2;
    win.material = emat('tuPropDWM', '#173a2c');
    win.parent = gd;
    gd.position.set(6, 0, 0);
    gd.setEnabled(false);
    props.detT = gd;
  }

  function drawCurrent() {
    const d = state.gap - surfaceH(state.tipX);
    const I = stmI(d);
    const ctx = currentTex.getContext();
    ctx.clearRect(0, 0, 300, 200);
    ctx.fillStyle = '#f6f2e6';
    ctx.beginPath(); ctx.roundRect(0, 0, 300, 200, 16); ctx.fill();
    ctx.fillStyle = '#3c4756';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('터널링 전류', 150, 10);
    ctx.fillStyle = '#d0453a';
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText(I.toFixed(1), 150, 58);
    ctx.fillStyle = '#62718a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('nA (상대값)', 150, 124);
    currentTex.update();
  }

  /* ══ 3D 화면에서 직접 조작 ═══════════════════ */

  /** 글씨를 새길 수 있는 얇은 판 (단추·이름표) */
  function makePlate(name, w, h) {
    const W = Math.round(w * 110), H = Math.round(h * 110);
    const pl = B().MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    const tex = new (B().DynamicTexture)(name + 'T', { width: W, height: H }, scene, true);
    tex.hasAlpha = true;
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.diffuseTexture = tex; m.opacityTexture = tex; m.emissiveTexture = tex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    pl.material = m;
    pl._tex = tex; pl._w = W; pl._h = H;
    if (glowL && glowL.addExcludedMesh) glowL.addExcludedMesh(pl);   // 글씨가 하얗게 번지지 않게
    return pl;
  }

  /** 판에 글씨를 다시 새긴다 — 내용이 그대로면 다시 그리지 않는다 */
  function paintPlate(pl, text, on, hex) {
    if (!pl || !pl._tex) return;
    const key = `${text}|${on ? 1 : 0}|${hex || ''}`;
    if (pl._last === key) return;
    pl._last = key;
    const W = pl._w, H = pl._h;
    const ctx = pl._tex.getContext();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = on ? (hex || '#2f6ad0') : '#2a3242';
    ctx.fillRect(2, 2, W - 4, H - 4);
    ctx.strokeStyle = on ? '#ffffff' : '#7a8aa0';
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, W - 10, H - 10);
    let fs = Math.round(H * 0.44);
    const font = (s) => `bold ${s}px "Noto Sans KR", sans-serif`;
    ctx.font = font(fs);
    while (fs > 11 && ctx.measureText(text).width > W - 26) { fs -= 2; ctx.font = font(fs); }
    ctx.fillStyle = on ? '#ffffff' : '#c8d4e4';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2);
    pl._tex.update();
  }

  /** 3D 단추·이름표와 STM 틈 ＋ · － 를 만든다 */
  function buildHands() {
    runTag = makePlate('tuRunTag', 3.4, 0.78);       // 실험대 앞 — 파동 발사 · 표면 스캔
    shotTag = makePlate('tuShotTag', 3.6, 0.78);     // 실험대 앞 — 전자 1개 쏘기
    gapTag = makePlate('tuGapTag', 2.6, 0.78);       // 실험대 앞 — 지금의 틈
    stepGap = LabUI.makeStepper(scene, 'Gap', { addColor: '#2f8f5a' });
    runTag.setEnabled(false);
    shotTag.setEnabled(false);
    gapTag.setEnabled(false);
    stepGap.setEnabled(false);
  }

  /** 단추·이름표의 자리와 표시를 다시 잡는다 (layout 에서 매번 부른다) */
  function layoutHands() {
    const on = allPlaced();
    const pk = state.mode === 'packet';

    // ── 실험대 «앞쪽 모서리»의 단추들 — 판(화면)을 가리지 않는 자리에 둔다
    if (runTag) {
      runTag.position.set(-5.6, 0.95, -4.4);
      runTag.setEnabled(on);
      paintPlate(runTag,
        state.running ? '■ 멈춤' : (pk ? '▶ 파동 발사' : '▶ 표면 스캔'),
        true, state.running ? '#c0553f' : '#2f8f5a');
    }
    if (shotTag) {
      shotTag.position.set(-1.9, 0.95, -4.4);
      shotTag.setEnabled(on && pk);
      paintPlate(shotTag, `전자 1개 쏘기 · ${sim ? sim.shots : 0}회`, true, '#b8791c');
    }

    // ── STM 모드: 같은 줄에 틈 ＋ · － 와 지금의 틈
    //    (탐침 옆에 두면 탐침이 오른쪽으로 갈 때 전류계와 겹치므로 앞줄에 고정한다)
    if (stepGap) {
      stepGap.place(0.4, 0.95, -4.4, 2.0);
      stepGap.setEnabled(on && !pk);
    }
    if (gapTag) {
      gapTag.position.set(0.4, 0.95, -4.4);
      gapTag.setEnabled(on && !pk);
      paintPlate(gapTag, `틈 ${state.gap.toFixed(2)} nm`, true, '#2f6ad0');
    }
  }

  /** 최소·최대 안에서 한 눈금 단위로 맞춘다 (슬라이더와 똑같은 범위) */
  function snap(v, lo, hi, st) {
    const q = Math.round(Math.max(lo, Math.min(hi, v)) / st) * st;
    return Math.round(Math.max(lo, Math.min(hi, q)) * 1000) / 1000;
  }

  /** 3D 조작 뒤 — 껍데기가 update() 까지 불러 준다 */
  function applyChange() {
    if (onChangeCb) onChangeCb();
    else update();
    syncPanel();
  }

  /** 아래 조작 막대를 3D 에서 바꾼 값에 맞춘다 */
  function syncPanel() {
    const put = (id, v, txt) => {
      const el = document.querySelector('#' + id);
      const out = document.querySelector('#' + id + 'Out');
      if (el) el.value = v;
      if (out) out.textContent = txt;
    };
    if (state.mode === 'packet') {
      put('eCtl', state.E, state.E.toFixed(1));
      put('vCtl', state.V0, state.V0.toFixed(1));
      put('wCtl', state.w, `${state.w.toFixed(1)} nm`);
    } else {
      put('gapCtl', state.gap, `${state.gap.toFixed(2)} nm`);
      put('tipCtl', state.tipX, state.tipX.toFixed(1));
    }
    syncRunBtn();
  }

  /** 실행 단추의 글씨를 지금 상태에 맞춘다 */
  function syncRunBtn() {
    const btn = document.querySelector('#runBtn');
    if (!btn) return;
    btn.textContent = state.running
      ? '진행 중…'
      : (state.mode === 'packet' ? '▶ 파동 발사' : '▶ 표면 스캔');
    btn.classList.toggle('run', state.running);
  }

  /** 파동을 쏘거나 멈춘다 — 전자 발생기를 누르는 것과 같다 */
  function fireWave() {
    if (sim && sim.phase !== 'in') reset();
    state.running = !state.running;
    applyChange();
  }

  /** 모드에 맞게 «시작 · 멈춤» — 파동 발사 또는 STM 표면 스캔 */
  function toggleRun() {
    if (state.mode === 'packet') { fireWave(); return; }
    state.running = !state.running;
    applyChange();
  }

  /** 전자를 딱 1개 쏜다 — 확률 T 로 통과한다 */
  function shotOne() {
    if (!sim) return;
    sim.shots += 1;
    if (Math.random() < transT()) sim.passed += 1;
    applyChange();
  }

  /** 장벽 두께·높이·전자 에너지를 3D 에서 바꾼다 (범위는 슬라이더와 똑같이) */
  function setParam(key, v) {
    const lim = { E: [1, 14, 0.5], V0: [2, 14, 0.5], w: [0.2, 2.0, 0.1] }[key];
    if (!lim) return;
    const nv = snap(v, lim[0], lim[1], lim[2]);
    if (nv === state[key]) return;
    state[key] = nv;
    reset();                 // 조건이 바뀌면 슬라이더와 똑같이 처음부터 다시
    applyChange();
  }

  /** STM 틈을 0.05 nm 씩 — 지수적 민감함을 손끝으로 느껴 본다 */
  function bumpGap(d) {
    const v = snap(state.gap + d * 0.05, 0.45, 1.2, 0.05);
    if (v === state.gap) return;
    state.gap = v;
    applyChange();
  }

  /** 손끝이 가리키는 세계 좌표 (주어진 평면 위) */
  function planePoint(origin, normal) {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(origin, normal);
    const d = ray.intersectsPlane(plane);
    if (d === null || d < 0) return null;
    return ray.origin.add(ray.direction.scale(d));
  }

  /** 손끝이 가리키는 «판 위의 자리»를 그림 픽셀로 */
  function boardPx() {
    const pt = planePoint(new (B().Vector3)(0, BCY, BCZ), new (B().Vector3)(0, 0, 1));
    if (!pt) return null;
    return {
      px: ((pt.x + BW / 2) / BW) * 1200,
      py: ((BCY + BHT / 2 - pt.y) / BHT) * 700,
    };
  }

  /** 판 위에서 무엇을 집었는가 — 'w' | 'V0' | 'E' | null */
  function boardGrab(p) {
    const bx0 = bxOf(-state.w / 2), bx1 = bxOf(state.w / 2);
    const bh = barH();
    const ey = byOf(state.E);
    const near = (x, y, r) => (p.px - x) ** 2 + (p.py - y) ** 2 <= r * r;
    // 동그란 손잡이를 먼저 본다
    if (near(PX1 - 70, ey, 44)) return 'E';
    if (near((bx0 + bx1) / 2, YMID - bh, 44)) return 'V0';
    if (near(bx0 - HKX, YMID + HKY, 44) || near(bx1 + HKX, YMID + HKY, 44)) return 'w';
    // 손잡이를 살짝 벗어나도 «선·모서리» 자체를 집을 수 있게
    if (Math.abs(p.py - ey) <= 20 && (p.px < bx0 - 46 || p.px > bx1 + 46)) return 'E';
    if (p.py > YMID - bh - 20 && p.py < YMID + 180
        && (Math.abs(p.px - bx0) <= 24 || Math.abs(p.px - bx1) <= 24)) return 'w';
    if (Math.abs(p.py - (YMID - bh)) <= 22 && p.px > bx0 - 24 && p.px < bx1 + 24) return 'V0';
    return null;
  }

  /** 판 위에서 끄는 중 — 누른 순간의 어긋남을 빼 값이 튀지 않게 한다 */
  function moveBoardDrag(p) {
    if (drag.what === 'E') { setParam('E', bvOf(p.py + drag.dy)); return; }
    if (drag.what === 'V0') { setParam('V0', bvOf(p.py + drag.dy)); return; }
    // 두께 — 장벽은 가운데 대칭이므로 «집은 옆면»까지의 거리를 2배 한다
    setParam('w', Math.abs(buOf(p.px + drag.dx)) * 2);
  }

  /** 탐침을 끄는 중 — 좌우는 위치, 위아래는 틈 */
  function moveTipDrag() {
    const pt = planePoint(new (B().Vector3)(0, 0, 0), new (B().Vector3)(0, 0, 1));
    if (!pt) return;
    const nx = snap(drag.tipX0 + (pt.x - drag.x0), -4.5, 4.5, 0.1);
    const ng = snap(drag.gap0 + (pt.y - drag.y0) / 3.2, 0.45, 1.2, 0.05);
    if (nx === state.tipX && ng === state.gap) return;
    state.tipX = nx;
    state.gap = ng;
    applyChange();
  }

  /**
   * 잡고 있던 것을 놓아 준다.
   * «실험 다시하기» 처럼 끌던 도중에 끼어드는 길이 있고 화면 밖에서 손을 뗄 수도 있으므로,
   * 손을 뗀 것으로 치고 카메라 조작을 «반드시» 되돌려 놓는다 (잠긴 채 남으면 화면이 안 돌아간다).
   */
  function endDrag() {
    if (!drag) return;
    drag = null;
    if (camera && canvasEl) camera.attachControl(canvasEl, true);
  }

  function setupPointer() {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const m = pi.pickInfo && pi.pickInfo.pickedMesh;
      const nm = m ? m.name : '';

      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced() || !sim) return;

        // 실험대 앞 단추 — 파동 발사 · 표면 스캔 (두 모드 모두)
        if (nm === 'tuRunTag') { toggleRun(); return; }

        if (state.mode === 'packet') {
          // 전자 발생기를 눌러도 파동을 쏜다
          if (nm === 'tuPropSB' || nm === 'tuPropSN') { fireWave(); return; }
          if (nm === 'tuShotTag') { shotOne(); return; }
          if (nm !== 'tuBoard') return;
          const p = boardPx();
          if (!p) return;
          const what = boardGrab(p);
          if (!what) return;
          const bx0 = bxOf(-state.w / 2), bx1 = bxOf(state.w / 2);
          drag = { what, dx: 0, dy: 0 };
          if (what === 'w') drag.dx = (p.px < (bx0 + bx1) / 2 ? bx0 : bx1) - p.px;
          else if (what === 'V0') drag.dy = (YMID - barH()) - p.py;
          else drag.dy = byOf(state.E) - p.py;
          camera.detachControl();
          return;
        }

        // STM — 틈 ＋ · － 와 탐침 끌기
        if (nm === 'btnAddGap') { bumpGap(+1); return; }
        if (nm === 'btnSubGap') { bumpGap(-1); return; }
        if (nm === 'tuTip' || nm === 'tuGapTag') {
          const pt = planePoint(new (B().Vector3)(0, 0, 0), new (B().Vector3)(0, 0, 1));
          if (!pt) return;
          drag = { what: 'tip', x0: pt.x, y0: pt.y, tipX0: state.tipX, gap0: state.gap };
          if (state.running) { state.running = false; syncRunBtn(); }   // 손으로 잡으면 자동 스캔은 멈춘다
          camera.detachControl();
        }
        return;
      }

      if (pi.type === T.POINTERMOVE && drag) {
        if (drag.what === 'tip') { moveTipDrag(); return; }
        const p = boardPx();
        if (p) moveBoardDrag(p);
        return;
      }

      if (pi.type === T.POINTERUP) endDrag();
    });

    // 화면 밖(설명 칸·사이드바)에서 손을 떼도 «잡은 상태»가 남지 않도록 한 번 더 챙긴다
    const doc = canvasEl && canvasEl.ownerDocument;
    if (doc) {
      doc.addEventListener('pointerup', endDrag);
      doc.addEventListener('pointercancel', endDrag);
    }
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      srcT: { x: -6, z: 0, w: 3.4, h: 2.8, label: '전자 발생기' },
      barrierT: { x: 0, z: 0, w: 3.4, h: 3.0, label: '퍼텐셜 장벽' },
      detT: { x: 6, z: 0, w: 3.4, h: 2.8, label: '검출기' },
      stmT: { x: 0, z: 4.4, w: 3.6, h: 2.6, label: 'STM 탐침' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreateGround('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, 0.05, c.z);
      const tex = LabUI.slotTexture(scene, 'phT_' + id, c.w, c.h, c.label, { mirror: false, color: '#5a9df0' });
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
    endDrag();          // 끌던 도중 «실험 다시하기» 를 눌러도 카메라가 잠긴 채 남지 않게
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
    state.running = false;
    sim = {
      px: -4.2, rx: -0.8, tx: 0.8, phase: 'in', t: 0,
      shots: 0, passed: 0,
      scan: [],           // STM 스캔 기록 {x, I}
    };
    layout();
    syncRunBtn();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const pk = state.mode === 'packet';

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다
    if (!all) {
      boardPlane.setEnabled(!!placed.barrierT);
      if (placed.barrierT) drawPacket();
      stmG.setEnabled(!!placed.stmT);
      if (placed.stmT) {
        tip.position.set(state.tipX, 1.15 + state.gap * 3.2 + 1.1, 0);
        drawCurrent();
      }
      if (props.srcT) props.srcT.setEnabled(!!placed.srcT);
      if (props.detT) props.detT.setEnabled(!!placed.detT);
      layoutHands();
      return;
    }
    if (props.srcT) props.srcT.setEnabled(pk);
    if (props.detT) props.detT.setEnabled(pk);

    boardPlane.setEnabled(pk);
    stmG.setEnabled(!pk);

    if (pk) {
      drawPacket();
    } else {
      const h = surfaceH(state.tipX);
      tip.position.set(state.tipX, 1.15 + h * 6 + state.gap * 3.2 + 1.1, 0);
      drawCurrent();
    }
    layoutHands();
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;

    if (state.mode === 'packet') {
      if (!state.running) return false;
      sim.t += dt;
      if (sim.phase === 'in') {
        sim.px += 2.4 * dt;
        if (sim.px >= -state.w / 2 - 0.7) {
          sim.phase = 'split';
          sim.rx = sim.px;
          sim.tx = state.w / 2 + 0.7;
        }
      } else {
        sim.rx -= 2.4 * dt;
        sim.tx += 2.4 * dt;
        if (sim.rx < -6.5) {
          state.running = false;
          syncRunBtn();
          layoutHands();
        }
      }
      drawPacket();
      return true;
    }

    // STM 자동 스캔
    if (state.running) {
      state.tipX += 1.6 * dt;
      if (state.tipX > 4.5) state.tipX = -4.5;
      const d = state.gap - surfaceH(state.tipX);
      sim.scan.push({ x: state.tipX, I: stmI(d) });
      if (sim.scan.length > 400) sim.scan.shift();
      layout();
      return true;
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
    camera.beta = 1.3;
    camera.radius = 17;
    camera.setTarget(new (B().Vector3)(0, 3, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '고전 물리에서는 E < V₀ 면 절대 통과할 수 없습니다. 하지만 전자의 파동 함수는 장벽 너머에서도 0이 아닙니다!';
  const prepGuide = '점선 자리에 전자 발생기·퍼텐셜 장벽·검출기·STM 탐침을 끌어다 놓아 실험을 준비하세요.';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'packet', t: '파동 묶음 (103쪽)' }, { v: 'stm', t: 'STM — 원자 보기 (105쪽)' },
    ], state.mode, 1);

    if (state.mode === 'packet') {
      return `
        ${modeBtns}
        <div class="control">
          <div class="clabel">직접<br>조작</div>
          <div class="cbody"><p class="hands-on">
            화면 속 <b>장벽의 옆면을 좌우로 끌면 두께</b>가, <b>윗면을 위아래로 끌면 높이</b>가 바뀝니다.
            노란 <b>에너지 선을 위아래로 끌어</b> <i>E</i> 를 정하고,
            <b>전자 발생기를 누르면</b> 파동을 쏩니다.
          </p></div>
        </div>
        ${LabUI.slider('eCtl', '전자 에너지 <i>E</i>',
          { min: 1, max: 14, step: 0.5, value: state.E, fmt: (v) => `${(+v).toFixed(1)}` })}
        ${LabUI.slider('vCtl', '장벽 높이 <i>V</i>₀',
          { min: 2, max: 14, step: 0.5, value: state.V0, fmt: (v) => `${(+v).toFixed(1)}` })}
        ${LabUI.slider('wCtl', '장벽 두께 <i>w</i>',
          { min: 0.2, max: 2.0, step: 0.1, value: state.w, fmt: (v) => `${(+v).toFixed(1)} nm` })}
        <div class="control">
          <div class="clabel">파동</div>
          <button class="power" id="runBtn">▶ 파동 발사</button>
        </div>
        <div class="control">
          <div class="clabel">전자 1개<br>운명은?</div>
          <button class="power" id="shotBtn">🎲 발사</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          <b>탐침을 잡고 좌우로 끌면</b> 탐침 위치가, <b>위아래로 끌면 틈</b>이 바뀝니다.
          실험대 앞의 <b>＋ · －</b> 로 틈을 0.05 nm 씩 맞춰 전류가 얼마나 뛰는지 보세요.
        </p></div>
      </div>
      ${LabUI.slider('gapCtl', '탐침-시료 거리',
        { min: 0.45, max: 1.2, step: 0.05, value: state.gap, fmt: (v) => `${(+v).toFixed(2)} nm` })}
      ${LabUI.slider('tipCtl', '탐침 위치',
        { min: -4.5, max: 4.5, step: 0.1, value: state.tipX, fmt: (v) => `${(+v).toFixed(1)}` })}
      <div class="control">
        <div class="clabel">자동 스캔</div>
        <button class="power" id="runBtn">▶ 표면 스캔</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;          // 3D 에서 직접 조작해도 측정값이 갱신되도록

    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      endDrag();                    // 끌던 손잡이가 바뀐 모드로 넘어가지 않게
      state.mode = b.getAttribute('data-mode');
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.mode === 'packet') {
      const after = () => { reset(); onChange(); };
      LabUI.bindSlider(root, 'eCtl', state, 'E', (v) => `${(+v).toFixed(1)}`, after);
      LabUI.bindSlider(root, 'vCtl', state, 'V0', (v) => `${(+v).toFixed(1)}`, after);
      LabUI.bindSlider(root, 'wCtl', state, 'w', (v) => `${(+v).toFixed(1)} nm`, after);
      root.querySelector('#shotBtn').addEventListener('click', shotOne);
    } else {
      LabUI.bindSlider(root, 'gapCtl', state, 'gap', (v) => `${(+v).toFixed(2)} nm`, () => { layout(); onChange(); });
      LabUI.bindSlider(root, 'tipCtl', state, 'tipX', (v) => `${(+v).toFixed(1)}`, () => { layout(); onChange(); });
    }
    root.querySelector('#runBtn').addEventListener('click', toggleRun);
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      applyChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.mode === 'packet') {
      const T = transT();
      const cls = state.E < state.V0;
      return `
        <div class="row"><span>전자 에너지 / 장벽</span><b>E = ${state.E.toFixed(1)} / V₀ = ${state.V0.toFixed(1)}</b></div>
        <div class="row"><span>고전 물리의 예측</span>
          <b>${cls ? '100 % 반사 (통과 불가!)' : '통과'}</b></div>
        <div class="row"><span>양자 역학의 투과 확률 <i>T</i></span>
          <b class="big">${(T * 100).toFixed(3)} %</b></div>
        <div class="sec">전자 1개씩 발사한 통계</div>
        <div class="row"><span>발사 / 통과</span>
          <b class="big">${sim.shots}개 / ${sim.passed}개
            ${sim.shots ? '(' + (100 * sim.passed / sim.shots).toFixed(1) + ' %)' : ''}</b></div>
        <div class="formula">${cls
          ? '장벽 안에서 파동 함수는 지수적으로 줄지만 <b>0이 되지는 않아</b> 반대편에 얇게 새어 나갑니다. 두께를 절반으로 줄이면 투과율이 크게 뜁니다 — 반도체 미세 공정에서 누설 전류가 생기는 까닭입니다 (103쪽).'
          : 'E > V₀ 여도 양자 역학에서는 일부가 <b>반사</b>됩니다 — 이것도 고전과 다른 점!'}</div>`;
    }
    const d = state.gap - surfaceH(state.tipX);
    return `
      <div class="row"><span>탐침 위치</span><b>${state.tipX.toFixed(1)}</b></div>
      <div class="row"><span>표면(원자) 높이</span><b>${(surfaceH(state.tipX) * 1000).toFixed(0)} pm</b></div>
      <div class="row"><span>실제 틈 (장벽 두께)</span><b>${d.toFixed(3)} nm</b></div>
      <div class="row"><span>터널링 전류</span><b class="big">${stmI(d).toFixed(1)} nA</b></div>
      <div class="formula">틈이 <b>0.1 nm 만 줄어도 전류가 몇 배</b>로 뛰는 지수적 민감함 덕분에
        원자 하나하나의 요철을 '볼' 수 있습니다. 탐침으로 원자를 끌고 다니며 만든
        영화 '소년과 원자'도 이 원리입니다 (105쪽).</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '투과 확률과 장벽';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 42, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;

    if (state.mode === 'packet') {
      // T vs 두께 (로그 느낌으로 선형 표시)
      const xOf = (w) => padL + ((w - 0.2) / 1.8) * gw;
      const yOf = (T) => padT + gh - T * gh;
      ctx.strokeStyle = '#7ae0a0'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const w = 0.2 + (i / 120) * 1.8;
        const y = yOf(transT(state.E, state.V0, w));
        if (i === 0) ctx.moveTo(xOf(w), y); else ctx.lineTo(xOf(w), y);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.arc(xOf(state.w), yOf(transT()), 5, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
      ctx.stroke();
      ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('장벽 두께 w (nm)', W2 - 4, padT + gh + 4);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7ae0a0'; ctx.font = 'bold 10px sans-serif';
      ctx.fillText('투과 확률 T — 두께에 지수적으로 민감', padL + 6, padT + 2);
      return;
    }

    // STM: 스캔 전류 프로필 (원자가 보인다!)
    const xOf = (x) => padL + ((x + 4.5) / 9) * gw;
    let iMax = 1;
    (sim ? sim.scan : []).forEach((p) => { iMax = Math.max(iMax, p.I); });
    const yOf = (I) => padT + gh - (I / iMax) * gh * 0.92;
    if (sim && sim.scan.length > 1) {
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2;
      ctx.beginPath();
      const sorted = [...sim.scan].sort((a, b) => a.x - b.x);
      sorted.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(p.x), yOf(p.I)); else ctx.lineTo(xOf(p.x), yOf(p.I));
      });
      ctx.stroke();
    }
    // 원자 위치 표시
    [-2.4, 0, 2.4].forEach((x) => {
      ctx.strokeStyle = 'rgba(90,157,240,.4)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(xOf(x), padT); ctx.lineTo(xOf(x), padT + gh); ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('전류 프로필 — 봉우리 = 원자!', padL + 6, padT + 2);
  }

  function graphFootHTML() {
    if (state.mode === 'packet') {
      return `두께 ${state.w.toFixed(1)} nm 에서 T = ${(transT() * 100).toFixed(3)} % ·
        두께가 얇을수록, 장벽이 낮을수록 잘 통과합니다 (103쪽)`;
    }
    return '전류 봉우리 세 개가 파란 점선(실제 원자 위치)과 일치 — 원자를 전류로 본 것입니다';
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '실험', '조건', '투과 확률 T', '통계 / 전류', '비고',
  ];

  function recordRow() {
    if (state.mode === 'packet') {
      const T = transT();
      return [['파동 묶음', `E=${state.E.toFixed(1)}, V₀=${state.V0.toFixed(1)}, w=${state.w.toFixed(1)}`,
        (T * 100).toFixed(3) + ' %',
        sim.shots ? `${sim.passed}/${sim.shots} 통과` : '—',
        state.E < state.V0 ? '고전: 통과 불가' : 'E > V₀']];
    }
    const d = state.gap - surfaceH(state.tipX);
    return [['STM', `틈 ${d.toFixed(2)} nm`, '—', stmI(d).toFixed(1) + ' nA',
      '지수적 민감도']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 E < V₀ 에서 통과 확인 · 1 장벽을 얇게 해 확률 높이기 · 2 두껍게 해 급감 확인
     3 STM 모드 · 4 기록 3줄                                               */
  const mis = { passed: false, thin: false, thick: false, stm: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'packet') {
      if (state.E < state.V0 && sim && sim.passed > 0) mis.passed = true;
      if (state.E < state.V0 && transT() > 0.2) mis.thin = true;
      if (state.E < state.V0 && transT() < 0.005) mis.thick = true;
    }
    if (state.mode === 'stm') mis.stm = true;

    if (i === 0) return mis.passed;
    if (i === 1) return mis.thin;
    if (i === 2) return mis.thick;
    if (i === 3) return mis.stm;
    if (i === 4) return recs().length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'tunnel',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '벽을 통과하는 전자 — 터널 효과',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, transT, stmI, surfaceH,
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
