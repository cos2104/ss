/**
 * 빛을 기르는 공장 — 레이저 이야기 (② 인터랙티브 스토리텔링형)
 * 비상교육 고등 전자기와 양자 II-05 (교과서 76~79쪽)
 *
 * 장면 1 — 그림 II-27: 유도 흡수 · 자발 방출 · 유도 방출을 한 원자에서 체험.
 * 장면 2 — 그림 II-28: 에너지를 퍼 올려 밀도 반전 만들기 (준안정 상태의 역할).
 * 장면 3 — 그림 II-29: 두 거울 사이에서 유도 방출 연쇄로 빛이 증폭·발진.
 */
const LaserScene = (() => {
  const B = () => BABYLON;

  const N_ATOM = 24;

  let scene, camera;
  let boardTex, boardPlane, atomG, atoms = [], photons = [], cavityG, mirrorL, mirrorR, beamG;
  let placed = {};

  /* ── 화면에서 직접 만지는 것들 ─────────────────── */
  let canvasRef = null, glowL = null;
  let onChangeCb = null;
  let drag = null;                       // 지금 손에 잡고 있는 것
  let pumpKnob = null, pumpGauge = null, pumpLamp = null;
  let stepPump = null, pumpTag = null, powerTag = null;
  let metaTag = null, mirTagL = null, mirTagR = null;
  let photonBall = null, photonTag = null, waitBtn = null;

  const KNOB_MAX = 2.2;                  // 펌핑 손잡이가 돌아가는 한쪽 각 (rad)
  const PH_HOME = { x: -4.0, y: 1.25, z: 0.45 };   // 빛 알갱이가 놓여 있는 자리

  const state = {
    scene: 'process',     // 'process' | 'inversion' | 'cavity'
    pump: 30,             // 에너지 공급 (%)
    metastable: 1,        // 준안정 상태 있음(1)/없음(0)
    running: false,
    mirL: 1,              // 왼쪽 거울 — 정렬(1) / 젖힘(0)
    mirR: 1,              // 오른쪽 부분 반사 거울 — 정렬(1) / 젖힘(0)
  };

  let sim = null;

  const tools = [
    { id: 'mediumT', label: '레이저 매질', icon: 'lensConvex' },
    { id: 'pumpT', label: '에너지 공급원', icon: 'battery' },
    { id: 'mirrorT', label: '거울 2개', icon: 'screenBoard' },
    { id: 'detT', label: '광 검출기', icon: 'sensor' },
  ];
  const slots = {
    mediumT: { name: '가운데 (매질)' },
    pumpT: { name: '아래 (에너지 공급원)' },
    mirrorT: { name: '양쪽 끝 (거울)' },
    detT: { name: '오른쪽 (검출기)' },
  };

  /* ══ 물리 ═══════════════════════════════════ */
  /** 들뜬 원자 비율: 준안정 상태가 없으면 아무리 퍼 올려도 50% 를 넘지 못한다 */
  function excitedFrac() {
    const p = state.pump / 100;
    return state.metastable ? p * 0.92 : Math.min(0.5, p * 0.5 + p * p * 0.0);
  }
  const inverted = () => excitedFrac() > 0.5;

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    canvasRef = canvas;
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#141a28ff');

    camera = new (B().ArcRotateCamera)(
      'camLa', -Math.PI / 2, 1.3, 17, new (B().Vector3)(0, 2.6, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hla', new (B().Vector3)(0, 1, 0), scene);
    hemi.intensity = 0.75;
    hemi.groundColor = new (B().Color3)(0.3, 0.32, 0.4);
    const glow = new (B().GlowLayer)('laGlow', scene);
    glow.intensity = 0.65;
    glowL = glow;

    // 광학 실험대 — 항상 보이는 기본 배경
    const bench = B().MeshBuilder.CreateBox('laBench', { width: 22, height: 0.5, depth: 12 }, scene);
    bench.position.y = -0.26;
    bench.material = mat('laBenchMat', '#242c3c', '#3a4a60', 48);

    buildBoard();
    buildAtoms();
    buildCavity();
    buildProps();
    buildPlaceholders();
    buildHands();
    setupPointer(canvas);

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/laser.jpg', { x: -8.5, y: 0, z: 5.5, ry: 0.3 });

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

  /** 에너지 준위 판 — 장면 1 의 무대 */
  function buildBoard() {
    boardPlane = B().MeshBuilder.CreatePlane('laBoard', { width: 10, height: 6 }, scene);
    boardPlane.position.set(0, 3.1, 1.2);
    boardTex = new (B().DynamicTexture)('laBoardTex', { width: 1000, height: 600 }, scene, true);
    const m = new (B().StandardMaterial)('laBoardM', scene);
    m.diffuseTexture = boardTex;
    m.emissiveTexture = boardTex;
    m.emissiveColor = new (B().Color3)(0.85, 0.85, 0.85);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    boardPlane.material = m;
  }

  /** 장면 1 그리기: 두 준위 + 전자 + 광자 애니메이션 */
  function drawProcess() {
    const ctx = boardTex.getContext();
    ctx.fillStyle = '#1c2436';
    ctx.fillRect(0, 0, 1000, 600);
    // 준위
    ctx.strokeStyle = '#9fb0c2'; ctx.lineWidth = 5;
    [[160, '들뜬상태 E₂'], [460, '바닥상태 E₁']].forEach(([y, name]) => {
      ctx.beginPath(); ctx.moveTo(240, y); ctx.lineTo(760, y); ctx.stroke();
      ctx.fillStyle = '#9fb0c2';
      ctx.font = 'bold 30px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(name, 775, y);
    });
    const p = sim.anim;   // {type, t}
    // 전자 위치
    let ey = 460;
    if (p && p.type === 'absorb') ey = 460 - Math.min(1, p.t * 2) * 300;
    if (p && (p.type === 'spont' || p.type === 'stim')) ey = 160 + Math.min(1, p.t * 2) * 300;
    if (!p && sim.elecUp) ey = 160;
    ctx.fillStyle = '#5ad0f0';
    ctx.beginPath(); ctx.arc(500, ey, 22, 0, 7); ctx.fill();
    ctx.fillStyle = '#0f141b';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('e⁻', 500, ey);
    // 빛 알갱이를 끌고 오면 «여기에 놓아요» 표시가 켜진다
    if (drag && drag.what === 'photon') {
      ctx.strokeStyle = drag.over ? '#ffd84a' : 'rgba(159,176,194,.6)';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(500, ey, 54, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }
    // 광자 (물결 화살표를 원으로 단순화)
    const drawPhoton = (x, y, hex) => {
      ctx.strokeStyle = hex; ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const px = x - 90 + i * 4.5;
        const py = y + Math.sin(i * 0.9) * 12;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 92, y); ctx.lineTo(x + 74, y - 12); ctx.moveTo(x + 92, y); ctx.lineTo(x + 74, y + 12);
      ctx.stroke();
    };
    if (p) {
      const prog = Math.min(1, p.t * 1.6);
      if (p.type === 'absorb' && prog < 0.7) drawPhoton(60 + prog * 380, 310, '#ffd84a');
      if (p.type === 'spont' && prog > 0.3) drawPhoton(430 + prog * 380, 240 + prog * 160, '#f0a53c');
      if (p.type === 'stim') {
        if (prog < 0.65) drawPhoton(40 + prog * 420, 310, '#ffd84a');
        if (prog > 0.55) {
          drawPhoton(520 + (prog - 0.55) * 700, 296, '#ffd84a');
          drawPhoton(520 + (prog - 0.55) * 700, 336, '#ffd84a');
        }
      }
    }
    // 제목
    ctx.fillStyle = '#e8ecf4';
    ctx.font = 'bold 34px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const title = !p ? '빛 알갱이를 끌어다 전자 위에 놓아 보세요 (그림 II-27)'
      : p.type === 'absorb' ? '유도 흡수 — 빛을 삼키고 전자가 올라간다'
      : p.type === 'spont' ? '자발 방출 — 전자가 스스로 내려오며 아무 방향으로 빛을 낸다'
      : '유도 방출 — 지나가는 빛이 방아쇠! 방향·위상이 같은 빛이 2배로';
    ctx.fillText(title, 500, 20);
    boardTex.update();
  }

  /** 장면 2·3 — 원자들 */
  function buildAtoms() {
    atomG = new (B().TransformNode)('laAtoms', scene);
    for (let i = 0; i < N_ATOM; i++) {
      const a = B().MeshBuilder.CreateSphere('laAtom' + i, { diameter: 0.6 }, scene);
      const col = i % 8, row = Math.floor(i / 8);
      a.position.set(-3.5 + col * 1.0, 1.9 + row * 1.0, 0);
      a.material = emat('laAtomM' + i, '#3f5a8a');
      a.parent = atomG;
      atoms.push(a);
    }
  }

  function buildCavity() {
    cavityG = new (B().TransformNode)('laCav', scene);
    mirrorL = B().MeshBuilder.CreateBox('laMirL', { width: 0.25, height: 3.4, depth: 2.2 }, scene);
    mirrorL.position.set(-6, 2.9, 0);
    mirrorL.material = mat('laMirLM', '#c8d4e4', '#ffffff', 128);
    mirrorL.parent = cavityG;
    mirrorR = B().MeshBuilder.CreateBox('laMirR', { width: 0.25, height: 3.4, depth: 2.2 }, scene);
    mirrorR.position.set(6, 2.9, 0);
    const rm = mat('laMirRM', '#c8d4e4', '#ffffff', 128);
    rm.alpha = 0.55;   // 부분 반사 거울
    mirrorR.material = rm;
    mirrorR.parent = cavityG;
    // 방출 빔
    beamG = B().MeshBuilder.CreateCylinder('laBeam', { height: 5, diameter: 0.3 }, scene);
    beamG.rotation.z = Math.PI / 2;
    beamG.position.set(9, 2.9, 0);
    beamG.material = emat('laBeamM', '#ff5a5a', 0.85);
    beamG.parent = cavityG;
  }

  const props = {};

  /** 준비 단계용 소품 — 에너지 공급원과 광 검출기 */
  function buildProps() {
    // 에너지 공급원 (전원 장치)
    const gp = new (B().TransformNode)('laPropPump', scene);
    const body = B().MeshBuilder.CreateBox('laPropPB', { width: 1.6, height: 1.0, depth: 1.0 }, scene);
    body.position.y = 0.5;
    body.material = mat('laPropPBM', '#39424f', '#7a8aa0', 64);
    body.parent = gp;
    const lamp = B().MeshBuilder.CreateSphere('laPropPL', { diameter: 0.22 }, scene);
    lamp.position.set(-0.45, 1.08, 0);
    lamp.material = emat('laPropPLM', '#ffd84a');
    lamp.parent = gp;
    pumpLamp = lamp;
    // 펌핑 손잡이 — 손으로 잡고 돌려 에너지 공급을 조절하는 다이얼
    pumpKnob = new (B().TransformNode)('laPumpKnobG', scene);
    pumpKnob.position.set(0.42, 0.5, -0.56);
    const dial = B().MeshBuilder.CreateCylinder('laPumpDial', { height: 0.14, diameter: 0.66 }, scene);
    dial.rotation.x = Math.PI / 2;
    dial.material = mat('laPumpDialM', '#c8d4e4', '#ffffff', 96);
    dial.parent = pumpKnob;
    const mark = B().MeshBuilder.CreateBox('laPumpMark', { width: 0.09, height: 0.26, depth: 0.2 }, scene);
    mark.position.set(0, 0.17, -0.04);
    mark.material = emat('laPumpMarkM', '#ff5a5a');
    mark.parent = pumpKnob;
    pumpKnob.parent = gp;
    // 공급량 막대 — 손잡이를 돌린 만큼 노랗게 찬다
    pumpGauge = B().MeshBuilder.CreateBox('laPumpGauge', { width: 1.4, height: 0.16, depth: 0.08 }, scene);
    pumpGauge.position.set(-0.7, 0.9, -0.55);
    pumpGauge.material = emat('laPumpGaugeM', '#ffd84a');
    pumpGauge.parent = gp;
    gp.position.set(0, 0, -3.8);
    gp.setEnabled(false);
    props.pumpT = gp;
    // 광 검출기
    const gd = new (B().TransformNode)('laPropDet', scene);
    const dbody = B().MeshBuilder.CreateBox('laPropDB', { width: 0.9, height: 0.9, depth: 0.9 }, scene);
    dbody.position.y = 0.45;
    dbody.material = mat('laPropDBM', '#2b3441', '#7a8aa0', 64);
    dbody.parent = gd;
    const eye = B().MeshBuilder.CreateCylinder('laPropDE', { height: 0.12, diameter: 0.5 }, scene);
    eye.rotation.z = Math.PI / 2;
    eye.position.set(-0.5, 0.45, 0);
    eye.material = emat('laPropDEM', '#5ad0f0');
    eye.parent = gd;
    gd.position.set(6.4, 0, -3.4);
    gd.setEnabled(false);
    props.detT = gd;
  }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     · 전원 장치의 «펌핑 손잡이»를 돌려 에너지 공급을 조절한다
     · 원자를 눌러 준안정 상태를 켜고 끈다
     · 공진기 거울을 눌러 정렬하거나 옆으로 젖힌다
     · 1막에서는 «빛 알갱이»를 끌어다 원자에 놓는다                       */

  /** 글씨를 그려 넣은 판 — 이름표 겸 3D 단추로 쓴다 */
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
    pl._tex = tex;
    pl._w = W; pl._h = H;
    if (glowL && glowL.addExcludedMesh) glowL.addExcludedMesh(pl);   // 글씨가 하얗게 번지지 않게
    return pl;
  }

  /** 판에 글씨를 다시 그린다 — 내용이 그대로면 다시 그리지 않는다 */
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

  /** 손으로 만지는 부품들을 만든다 (자리는 layoutHands 에서 잡는다) */
  function buildHands() {
    stepPump = LabUI.makeStepper(scene, 'Pump');
    pumpTag = makePlate('laPumpTag', 2.3, 0.62);
    powerTag = makePlate('laPowerTag', 2.6, 0.72);
    metaTag = makePlate('laMetaTag', 5.6, 0.9);
    mirTagL = makePlate('laMirTagL', 2.6, 0.68);
    mirTagR = makePlate('laMirTagR', 2.6, 0.68);
    photonTag = makePlate('laPhotonTag', 2.9, 0.62);
    waitBtn = makePlate('laWaitBtn', 3.4, 0.78);

    // 빛 알갱이 — 원자로 끌어다 놓으면 흡수 또는 유도 방출이 일어난다
    photonBall = B().MeshBuilder.CreateSphere('laPhotonBall', { diameter: 0.56 }, scene);
    photonBall.position.set(PH_HOME.x, PH_HOME.y, PH_HOME.z);
    photonBall.material = emat('laPhotonBallM', '#ffd84a');
  }

  /** 단추·이름표의 자리와 표시를 다시 잡는다 (layout 에서 매번 부른다) */
  function layoutHands() {
    const on = allPlaced();
    const sc = state.scene;
    const pumpOn = on && sc !== 'process';

    // 펌핑 ＋ · － 는 전원 장치 왼쪽에 띄워 상자·이름표와 겹치지 않게 한다
    if (stepPump) { stepPump.place(-2.6, 0.78, -3.8, 0.8); stepPump.setEnabled(pumpOn); }
    if (pumpTag) {
      pumpTag.position.set(-2.6, 1.52, -3.8);
      pumpTag.setEnabled(pumpOn);
      paintPlate(pumpTag, `펌핑 ${state.pump} %`, true, '#b8791c');
    }
    if (pumpKnob) pumpKnob.rotation.z = (0.5 - state.pump / 100) * 2 * KNOB_MAX;
    if (pumpGauge) {
      const p = Math.max(0.002, state.pump / 100);
      pumpGauge.scaling.x = p;
      pumpGauge.position.set(-0.7 + 0.7 * p, 0.9, -0.55);
    }
    if (pumpLamp) {
      const lit = sc === 'cavity' ? !!state.running : state.pump > 0;
      if (pumpLamp._lit !== lit) {
        pumpLamp._lit = lit;
        pumpLamp.material.emissiveColor = B().Color3.FromHexString(lit ? '#ffd84a' : '#4a4326');
      }
    }
    if (powerTag) {
      powerTag.position.set(2.5, 0.9, -3.8);
      powerTag.setEnabled(on && sc === 'cavity');
      paintPlate(powerTag, state.running ? '가동 중 — 누르면 정지' : '전원 — 누르면 가동',
        state.running, '#c0392b');
    }
    if (metaTag) {
      metaTag.position.set(0, 5.25, 0);
      metaTag.setEnabled(on && sc === 'inversion');
      paintPlate(metaTag, state.metastable
        ? '준안정 상태 있음 — 원자를 누르면 보통 원자로'
        : '보통 원자 — 원자를 누르면 준안정 상태로', !!state.metastable, '#2f6ad0');
    }
    const cav = on && sc === 'cavity';
    if (mirTagL) {
      mirTagL.position.set(-6, 0.78, -1.3);
      mirTagL.setEnabled(cav);
      paintPlate(mirTagL, state.mirL ? '왼쪽 거울 · 정렬' : '왼쪽 거울 · 젖힘', !!state.mirL, '#2f8f6a');
    }
    if (mirTagR) {
      mirTagR.position.set(6, 0.78, -1.3);
      mirTagR.setEnabled(cav);
      paintPlate(mirTagR, state.mirR ? '오른쪽 거울 · 정렬' : '오른쪽 거울 · 젖힘', !!state.mirR, '#2f8f6a');
    }
    if (mirrorL) mirrorL.rotation.y = state.mirL ? 0 : 0.62;
    if (mirrorR) mirrorR.rotation.y = state.mirR ? 0 : -0.62;

    const proc = on && sc === 'process';
    if (photonBall) {
      photonBall.setEnabled(proc);
      // 손을 놓으면 빛 알갱이는 제자리로 돌아온다
      if (!drag || drag.what !== 'photon') photonBall.position.set(PH_HOME.x, PH_HOME.y, PH_HOME.z);
    }
    if (photonTag) {
      photonTag.position.set(PH_HOME.x, PH_HOME.y - 0.7, PH_HOME.z);
      photonTag.setEnabled(proc);
      paintPlate(photonTag, '빛 알갱이 — 끌어다 놓기', true, '#b8791c');
    }
    if (waitBtn) {
      waitBtn.position.set(3.5, 0.66, PH_HOME.z);
      waitBtn.setEnabled(proc);
      paintPlate(waitBtn, '기다리기 — 자발 방출', !!(sim && sim.elecUp), '#6a4fd0');
    }
  }

  /** 3D 에서 값을 바꾼 뒤 — 측정값·그래프와 아래 조작 막대를 함께 맞춘다 */
  function applyChange() {
    if (onChangeCb) onChangeCb();   // 껍데기가 update() 까지 불러 준다
    else update();
    syncPanel();
  }

  /** 아래 조작 막대를 3D 에서 바꾼 값에 맞춘다 */
  function syncPanel() {
    const el = document.querySelector('#pump');
    const out = document.querySelector('#pumpOut');
    if (el) el.value = state.pump;
    if (out) out.textContent = `${state.pump} %`;
    document.querySelectorAll('[data-metastable]').forEach((b) => {
      b.classList.toggle('on', +b.getAttribute('data-metastable') === state.metastable);
    });
    const run = document.querySelector('#runBtn');
    if (run) {
      run.textContent = state.running ? '가동 중…' : '▶ 가동';
      run.classList.toggle('run', state.running);
    }
  }

  /** 펌핑을 5 % 씩 바꾼다 (아래 슬라이더와 같은 범위) */
  function bumpPump(d) {
    const v = Math.max(0, Math.min(100, state.pump + d * 5));
    if (v === state.pump) return;
    state.pump = v;
    applyChange();
  }

  /** 세 가지 상호작용을 일으킨다 — 아래 단추와 3D 조작이 함께 쓴다 */
  function fire(type) {
    if (state.scene !== 'process' || !sim || sim.anim) return;
    const needUp = type !== 'absorb';
    if (sim.elecUp !== needUp) {
      sim.msg = needUp ? '전자가 바닥에 있어요 — 먼저 «빛 쏘기»로 올려 주세요.'
        : '전자가 이미 들떠 있어요 — 방출부터 시켜 주세요.';
      applyChange();
      return;
    }
    sim.msg = null;
    sim.anim = { type, t: 0 };
    if (type === 'stim') mis.proc = true;      // «유도 방출 관찰» 미션 달성
    applyChange();
  }

  /** 화면 위 한 점을 주어진 평면 위의 세계 좌표로 바꾼다 */
  function planePoint(origin, normal) {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(origin, normal);
    const d = ray.intersectsPlane(plane);
    if (d === null || d < 0) return null;
    return ray.origin.add(ray.direction.scale(d));
  }

  /** 펌핑 손잡이 한가운데를 기준으로 손끝이 가리키는 각 */
  function knobAngle() {
    if (!pumpKnob) return null;
    pumpKnob.computeWorldMatrix(true);
    const c = pumpKnob.getAbsolutePosition();
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    if (Math.abs(ray.direction.z) < 0.25) return null;    // 옆에서 보면 각을 잴 수 없다
    const d = ray.intersectsPlane(B().Plane.FromPositionAndNormal(c, new (B().Vector3)(0, 0, 1)));
    if (d === null || d < 0) return null;
    const pt = ray.origin.add(ray.direction.scale(d));
    return Math.atan2(pt.y - c.y, pt.x - c.x);
  }

  /** 판 위에 그려진 전자의 높이 (세계 좌표) */
  function elecY() { return (sim && sim.elecUp) ? 4.5 : 1.5; }

  /** 빛 알갱이가 원자(전자) 위에 놓였는가 */
  function onAtomSpot() {
    if (!photonBall) return false;
    return Math.abs(photonBall.position.x) < 1.7
      && Math.abs(photonBall.position.y - elecY()) < 1.3;
  }

  function setupPointer(canvas) {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const mesh = pi.pickInfo && pi.pickInfo.pickedMesh;
      const nm = mesh ? mesh.name : '';
      const sc = state.scene;

      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced() || !sim) return;
        // ── 펌핑 ＋ · －
        if (nm === 'btnAddPump') { bumpPump(+1); return; }
        if (nm === 'btnSubPump') { bumpPump(-1); return; }
        // ── 펌핑 손잡이 돌리기
        if (nm === 'laPumpDial' || nm === 'laPumpMark' || nm === 'laPumpGauge') {
          drag = { what: 'knob', a0: knobAngle(), raw: state.pump, y0: scene.pointerY };
          camera.detachControl();
          return;
        }
        // ── 전원 장치를 눌러 가동·정지
        if (sc === 'cavity' && (nm === 'laPowerTag' || nm === 'laPropPB' || nm === 'laPropPL')) {
          state.running = !state.running;
          applyChange();
          return;
        }
        // ── 원자를 눌러 준안정 상태 켜고 끄기
        if (sc === 'inversion' && (nm.indexOf('laAtom') === 0 || nm === 'laMetaTag')) {
          state.metastable = state.metastable ? 0 : 1;
          applyChange();
          return;
        }
        // ── 공진기 거울 세우기 · 젖히기
        if (sc === 'cavity') {
          if (nm === 'laMirL' || nm === 'laMirTagL') { state.mirL = state.mirL ? 0 : 1; applyChange(); return; }
          if (nm === 'laMirR' || nm === 'laMirTagR') { state.mirR = state.mirR ? 0 : 1; applyChange(); return; }
        }
        // ── 1막: 기다리기 · 빛 알갱이 집어 들기
        if (sc === 'process') {
          if (nm === 'laWaitBtn') { fire('spont'); return; }
          // 앞선 장면이 아직 흐르는 동안에는 집어 들지 않는다
          // (그 사이에 놓으면 fire 가 아무 일도 못 해 알갱이가 판 위에 남는다)
          if (sim.anim) return;
          if (nm === 'laPhotonBall' || nm === 'laPhotonTag') {
            const pt = planePoint(new (B().Vector3)(0, 0, PH_HOME.z), new (B().Vector3)(0, 0, 1));
            drag = {
              what: 'photon', over: false,
              dx: pt ? photonBall.position.x - pt.x : 0,   // 잡은 순간의 어긋남
              dy: pt ? photonBall.position.y - pt.y : 0,
            };
            camera.detachControl();
          }
        }
        return;
      }

      if (pi.type === T.POINTERMOVE && drag) {
        if (drag.what === 'knob') {
          const a = knobAngle();
          let raw = drag.raw;
          if (a === null) {
            raw += (drag.y0 - scene.pointerY) * 0.4;      // 옆에서 볼 때는 위아래로 민다
          } else {
            if (drag.a0 !== null && drag.a0 !== undefined) {
              let d = a - drag.a0;
              if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
              raw -= (d / (2 * KNOB_MAX)) * 100;
            }
            drag.a0 = a;
          }
          drag.y0 = scene.pointerY;
          drag.raw = Math.max(0, Math.min(100, raw));
          const v = Math.round(drag.raw / 5) * 5;
          if (v !== state.pump) { state.pump = v; applyChange(); }
        } else if (drag.what === 'photon') {
          const pt = planePoint(new (B().Vector3)(0, 0, PH_HOME.z), new (B().Vector3)(0, 0, 1));
          if (!pt) return;
          photonBall.position.x = Math.max(-4.8, Math.min(4.8, pt.x + drag.dx));
          photonBall.position.y = Math.max(0.6, Math.min(5.6, pt.y + drag.dy));
          const over = onAtomSpot();
          if (over !== drag.over) { drag.over = over; drawProcess(); }
        }
        return;
      }

      if (pi.type === T.POINTERUP && drag) {
        const what = drag.what;
        const hit = what === 'photon' && onAtomSpot();
        drag = null;
        camera.attachControl(canvas, true);
        if (what === 'photon') {
          // 바닥상태 전자에 놓으면 흡수, 들뜬 전자에 놓으면 유도 방출.
          // 어느 쪽이든 한 번만 다시 그린다 (fire 안에서 applyChange 를 부른다)
          if (hit && sim && !sim.anim) fire(sim.elecUp ? 'stim' : 'absorb');
          else applyChange();          // 빗나갔거나 일으키지 못하면 알갱이를 제자리로
        }
      }
    });
  }

  function spawnPhoton(x, y, dir, stray) {
    if (photons.length > 70) return;
    const p = B().MeshBuilder.CreateSphere('laPh' + Math.random(), { diameter: 0.22 }, scene);
    p.position.set(x, y, 0);
    p.material = emat('laPhM' + Math.random(), stray ? '#f0a53c' : '#ff5a5a');
    photons.push({ m: p, x, y, dir, stray, vy: stray ? (Math.random() - 0.5) * 2.5 : 0 });
  }
  function clearPhotons() {
    photons.forEach((p) => p.m.dispose());
    photons = [];
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      mediumT: { x: 0, z: 0, w: 5.4, h: 3.0, label: '레이저 매질' },
      pumpT: { x: 0, z: -3.8, w: 4.2, h: 2.4, label: '에너지 공급원' },
      mirrorT: { x: -6, z: 0, w: 3.2, h: 3.0, label: '거울 2개' },
      detT: { x: 6.4, z: -3.4, w: 3.2, h: 2.4, label: '광 검출기' },
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
    return (Math.abs(point.x - c.x) <= 4.2 && Math.abs(point.z - c.z) <= 3.2) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
    state.mirL = 1; state.mirR = 1;
    // 끌던 도중에 «처음 상태로» 를 눌러도 카메라 조작이 잠긴 채 남지 않게 한다
    if (drag && camera && canvasRef) camera.attachControl(canvasRef, true);
    drag = null;
    sim = {
      t: 0, anim: null, elecUp: false,
      emitted: 0, history: [],
    };
    clearPhotons();
    layout();
  }

  function layout() {
    if (!sim) return;
    const all = allPlaced();
    const sc = state.scene;
    layoutHands();

    // 준비 단계 — 놓은 도구부터 하나씩 나타난다
    if (!all) {
      boardPlane.setEnabled(false);
      atomG.setEnabled(!!placed.mediumT);
      if (placed.mediumT) {
        atoms.forEach((a) => a.material.emissiveColor = B().Color3.FromHexString('#3f5a8a'));
      }
      cavityG.setEnabled(!!placed.mirrorT);
      if (placed.mirrorT) beamG.setEnabled(false);
      if (props.pumpT) props.pumpT.setEnabled(!!placed.pumpT);
      if (props.detT) props.detT.setEnabled(!!placed.detT);
      return;
    }
    if (props.pumpT) props.pumpT.setEnabled(sc !== 'process');
    if (props.detT) props.detT.setEnabled(sc === 'cavity');

    boardPlane.setEnabled(sc === 'process');
    atomG.setEnabled(sc === 'inversion' || sc === 'cavity');
    cavityG.setEnabled(sc === 'cavity');

    if (sc === 'process') {
      drawProcess();
    } else {
      // 원자 색: 들뜬 비율에 맞춰
      const f = excitedFrac();
      atoms.forEach((a, i) => {
        const excited = (i / N_ATOM) < f;
        a.material.emissiveColor = B().Color3.FromHexString(excited ? '#e8577a' : '#3f5a8a');
      });
      if (sc === 'cavity') {
        // 거울이 젖혀져 있으면 빛이 왕복하지 못해 빔이 나오지 않는다
        beamG.setEnabled(sim.emitted > 2 && inverted() && !!state.mirL && !!state.mirR);
        beamG.scaling.x = Math.min(2.4, 0.4 + sim.emitted / 30);
      }
    }
  }

  function tick(dt) {
    if (!sim || !allPlaced()) return false;
    sim.t += dt;

    if (state.scene === 'process') {
      if (sim.anim) {
        sim.anim.t += dt;
        drawProcess();
        if (sim.anim.t > 1.1) {
          sim.elecUp = sim.anim.type === 'absorb';
          sim.anim = null;
          drawProcess();
        }
        return true;
      }
      return false;
    }

    if (state.scene === 'cavity' && state.running) {
      // 자발 방출 씨앗: 이따금 아무 방향으로
      if (Math.random() < dt * (2 + state.pump / 25) && excitedFrac() > 0.1) {
        const st = Math.random() > 0.25;    // 대부분은 어긋난 방향 (사라짐)
        spawnPhoton((Math.random() - 0.5) * 7, 1.6 + Math.random() * 2.6, Math.random() > 0.5 ? 1 : -1, st);
      }
      // 광자 이동
      const speed = 9;
      for (let i = photons.length - 1; i >= 0; i--) {
        const p = photons[i];
        p.x += p.dir * speed * dt;
        p.y += (p.vy || 0) * dt;
        p.m.position.set(p.x, p.y, 0);
        if (p.stray && (p.y < 0.9 || p.y > 5 || p.x < -7 || p.x > 7)) {
          p.m.dispose(); photons.splice(i, 1);
          continue;
        }
        if (!p.stray) {
          // 매질 통과 중 유도 방출 (밀도 반전일 때만 증폭)
          if (Math.abs(p.x) < 4 && inverted() && Math.random() < dt * 1.8 && photons.length < 66) {
            spawnPhoton(p.x - p.dir * 0.35, p.y, p.dir, false);
          }
          // 거울 반사 — 젖혀 놓은 거울에 닿은 빛은 옆으로 새어 나가 사라진다
          if (p.x <= -5.9) {
            if (!state.mirL) { p.m.dispose(); photons.splice(i, 1); continue; }
            p.x = -5.9; p.dir = 1;
          }
          if (p.x >= 5.9) {
            if (!state.mirR) { p.m.dispose(); photons.splice(i, 1); continue; }
            // 부분 반사 거울: 20% 는 방출
            if (Math.random() < 0.2) {
              sim.emitted += 1;
              p.m.dispose(); photons.splice(i, 1);
              continue;
            }
            p.x = 5.9; p.dir = -1;
          }
        }
      }
      // 반전이 없으면 흡수로 광자가 서서히 사라진다
      if (!inverted() && photons.length && Math.random() < dt * 3) {
        const p = photons.pop();
        p.m.dispose();
      }
      sim.history.push({ t: sim.t, n: photons.filter((p) => !p.stray).length, e: sim.emitted });
      if (sim.history.length > 300) sim.history.shift();
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
    camera.setTarget(new (B().Vector3)(0, 2.6, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '유도 방출에서 나온 두 빛은 방향과 위상이 완전히 같습니다 — 이것이 레이저 빛이 특별한 까닭입니다.';
  const prepGuide = '점선 자리에 매질·에너지 공급원·거울·검출기를 끌어다 놓아 레이저 공장을 지으세요.';

  function controlsHTML() {
    const sceneBtns = LabUI.opts('실험 모드', 'scene', [
      { v: 'process', t: '1막 — 빛과 원자 (77쪽)' },
      { v: 'inversion', t: '2막 — 밀도 반전' },
      { v: 'cavity', t: '3막 — 발진!' },
    ], state.scene, 1);

    if (state.scene === 'process') {
      return `
        ${sceneBtns}
        <div class="control">
          <div class="clabel">직접<br>조작</div>
          <div class="cbody"><p class="hands-on">
            판 왼쪽의 <b>빛 알갱이를 끌어다 전자 위에 놓습니다</b> —
            바닥상태면 <b>흡수</b>, 들뜬상태면 <b>유도 방출</b>이 일어납니다.
            <b>«기다리기»</b> 판을 누르면 시간이 흘러 자발 방출을 볼 수 있습니다.
          </p></div>
        </div>
        <div class="control">
          <div class="clabel">유도 흡수</div>
          <button class="power" id="absorbBtn">📥 빛 쏘기</button>
        </div>
        <div class="control">
          <div class="clabel">자발 방출</div>
          <button class="power" id="spontBtn">💫 기다리기</button>
        </div>
        <div class="control">
          <div class="clabel">유도 방출</div>
          <button class="power" id="stimBtn">📤 빛으로 노크</button>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    if (state.scene === 'inversion') {
      return `
        ${sceneBtns}
        <div class="control">
          <div class="clabel">직접<br>조작</div>
          <div class="cbody"><p class="hands-on">
            전원 장치의 <b>손잡이를 잡고 돌리면</b> 에너지 공급이 오르내리고,
            옆의 <b>＋ · －</b> 로 5 %씩 맞춥니다.
            <b>원자를 누르면</b> 준안정 상태가 있는 매질과 보통 원자가 바뀝니다.
          </p></div>
        </div>
        ${LabUI.slider('pump', '에너지 공급<br>(펌핑)',
          { min: 0, max: 100, step: 5, value: state.pump, fmt: (v) => `${v} %` })}
        ${LabUI.opts('준안정 상태', 'metastable', [
          { v: 1, t: '있음 (레이저 매질)' }, { v: 0, t: '없음 (보통 원자)' },
        ], state.metastable, 1)}
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${sceneBtns}
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          <b>손잡이를 돌려</b> 펌핑을 올리고 <b>전원 장치를 눌러</b> 가동합니다.
          <b>거울을 누르면</b> 옆으로 젖혀져 빛이 새어 나갑니다 —
          공진기가 왜 필요한지 확인해 보세요.
        </p></div>
      </div>
      ${LabUI.slider('pump', '에너지 공급<br>(펌핑)',
        { min: 0, max: 100, step: 5, value: state.pump, fmt: (v) => `${v} %` })}
      <div class="control">
        <div class="clabel">발진</div>
        <button class="power" id="runBtn">▶ 가동</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;      // 3D 에서 조작해도 측정값이 갱신되도록
    root.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => {
      state.scene = b.getAttribute('data-scene');
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.scene === 'process') {
      // 3D 의 «빛 알갱이 끌기»와 같은 길로 흐르게 한다
      root.querySelector('#absorbBtn').addEventListener('click', () => fire('absorb'));
      root.querySelector('#spontBtn').addEventListener('click', () => fire('spont'));
      root.querySelector('#stimBtn').addEventListener('click', () => fire('stim'));
    } else if (state.scene === 'inversion') {
      LabUI.bindSlider(root, 'pump', state, 'pump', (v) => `${v} %`, () => { layout(); onChange(); });
      LabUI.bindOpts(root, 'metastable', state, 'metastable', () => { layout(); onChange(); });
    } else {
      LabUI.bindSlider(root, 'pump', state, 'pump', (v) => `${v} %`, () => { layout(); onChange(); });
      const run = root.querySelector('#runBtn');
      run.addEventListener('click', () => {
        state.running = !state.running;
        run.textContent = state.running ? '가동 중…' : '▶ 가동';
        run.classList.toggle('run', state.running);
        onChange();
      });
    }
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    if (state.scene === 'process') {
      return `
        <div class="row"><span>전자의 상태</span>
          <b class="big">${sim.elecUp ? '들뜬상태 (E₂)' : '바닥상태 (E₁)'}</b></div>
        ${sim.msg ? `<div class="formula" style="color:#f0a53c">${sim.msg}</div>` : ''}
        <div class="sec">세 가지 상호작용 (그림 II-27)</div>
        <div class="row"><span>유도 흡수</span><b>빛 흡수 → 전자 ↑</b></div>
        <div class="row"><span>자발 방출</span><b>전자 ↓ + 아무 방향 빛</b></div>
        <div class="row"><span>유도 방출</span><b>빛 1개 → <span style="color:#ff8a8a">같은 빛 2개!</span></b></div>
        <div class="formula">유도 방출로 나온 빛은 들어온 빛과 <b>방향·위상이 완전히 같아</b>
          중첩되어 증폭됩니다. LASER = 유도 방출에 의한 빛의 증폭.</div>`;
    }
    if (state.scene === 'inversion') {
      const f = excitedFrac();
      const nUp = Math.round(f * N_ATOM);
      return `
        <div class="row"><span>에너지 공급 (펌핑)</span><b>${state.pump} %</b></div>
        <div class="row"><span>준안정 상태</span><b>${state.metastable ? '있음' : '없음'}</b></div>
        <div class="sec">원자 ${N_ATOM}개의 분포</div>
        <div class="row"><span>들뜬 원자 (빨강)</span><b class="big">${nUp}개 (${(f * 100).toFixed(0)} %)</b></div>
        <div class="row"><span>바닥 원자 (파랑)</span><b>${N_ATOM - nUp}개</b></div>
        <div class="row"><span>밀도 반전</span>
          <b class="big">${f > 0.5 ? '✅ 달성!' : '❌ 아직 (50% 이하)'}</b></div>
        <div class="formula">${state.metastable
          ? '준안정 상태는 전자가 <b>오래 머물 수 있어</b> 들뜬 원자를 쌓을 수 있습니다. 펌핑을 올려 절반을 넘겨 보세요.'
          : '보통 원자는 들뜨자마자(10⁻⁸ 초) 떨어져 버려 <b>아무리 퍼 올려도 절반을 넘지 못합니다</b>. 준안정 상태가 꼭 필요한 까닭입니다.'}</div>`;
    }
    const n = photons.filter((p) => !p.stray).length;
    const off = !state.mirL || !state.mirR;
    return `
      <div class="row"><span>펌핑</span><b>${state.pump} % ${inverted() ? '(반전 달성)' : '(반전 안 됨)'}</b></div>
      <div class="row"><span>공진기 거울</span>
        <b>${off ? '젖혀짐 — 빛이 새어 나감' : '양쪽 정렬됨'}</b></div>
      <div class="row"><span>공진기 안의 정렬된 광자</span><b class="big">${n}개</b></div>
      <div class="row"><span>방출된 레이저 광자</span><b class="big">${sim.emitted}개</b></div>
      <div class="formula">${off
        ? '거울이 젖혀져 있으면 빛이 <b>왕복하지 못하고</b> 옆으로 빠져나가 증폭도 발진도 일어나지 않습니다. 거울을 다시 눌러 세워 보세요 — 공진기가 필요한 까닭입니다.'
        : inverted()
        ? '거울 사이를 왕복하며 <b>유도 방출 연쇄</b>로 광자가 불어납니다. 거울에 수직인 빛만 살아남아 <b>지향성</b>이 생기고, 모두 같은 전이에서 나와 <b>단색성</b>을 갖습니다. 오른쪽 부분 반사 거울로 일부가 새어 나오는 것이 레이저 빔입니다.'
        : '밀도 반전이 없으면 빛이 증폭되기보다 <b>흡수</b>되어 사라집니다. 펌핑을 60% 이상으로 올려 보세요.'}</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '광자 수의 변화';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 40, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;

    if (state.scene === 'process') {
      ctx.fillStyle = '#9fb0c2'; ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('유도 방출: 빛 1개가 들어가 2개가 되어 나옵니다', W2 / 2, H2 / 2 - 20);
      ctx.fillText('1 → 2 → 4 → 8 → … 기하급수적 증폭!', W2 / 2, H2 / 2 + 8);
      return;
    }
    if (state.scene === 'inversion') {
      // 막대: 들뜬 vs 바닥
      const f = excitedFrac();
      const bars = [['들뜬상태', f, '#e8577a'], ['바닥상태', 1 - f, '#5a9df0']];
      bars.forEach(([name, v, hex], i) => {
        const x = padL + gw * (0.18 + i * 0.42);
        const h = v * gh * 0.85;
        ctx.fillStyle = hex;
        ctx.fillRect(x, padT + gh - h, gw * 0.22, h);
        ctx.fillStyle = '#9fb0c2'; ctx.font = '11px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(`${name} ${(v * 100).toFixed(0)}%`, x + gw * 0.11, padT + gh + 5);
      });
      // 50% 선
      ctx.strokeStyle = 'rgba(255,216,74,.6)';
      ctx.setLineDash([6, 5]);
      const y50 = padT + gh - 0.5 * gh * 0.85;
      ctx.beginPath(); ctx.moveTo(padL, y50); ctx.lineTo(padL + gw, y50); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd84a'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('밀도 반전 문턱 (50%)', padL + 4, y50 - 2);
      return;
    }
    // cavity: 광자 수 시간 그래프
    if (sim && sim.history.length > 1) {
      const T0 = sim.history[0].t, T1 = sim.history[sim.history.length - 1].t;
      const NMAX = 70;
      const xOf = (t) => padL + ((t - T0) / Math.max(1, T1 - T0)) * gw;
      const yOf = (n) => padT + gh - (n / NMAX) * gh;
      ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2;
      ctx.beginPath();
      sim.history.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(p.t), yOf(p.n)); else ctx.lineTo(xOf(p.t), yOf(p.n));
      });
      ctx.stroke();
      ctx.strokeStyle = '#69d98c';
      ctx.beginPath();
      sim.history.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(p.t), yOf(Math.min(NMAX, p.e))); else ctx.lineTo(xOf(p.t), yOf(Math.min(NMAX, p.e)));
      });
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#ff5a5a'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('공진기 안 광자', padL + 6, padT + 2);
    ctx.fillStyle = '#69d98c';
    ctx.fillText('방출 누적', padL + 92, padT + 2);
  }

  function graphFootHTML() {
    if (state.scene === 'process') return '자발 방출은 방향이 제멋대로 — <b>유도 방출만</b> 결이 맞는 빛을 만듭니다';
    if (state.scene === 'inversion') return '준안정 상태가 없으면 빨간 막대가 <b>50% 문턱을 넘지 못합니다</b>';
    return '반전 상태에서 광자 수가 <b>기하급수적으로</b> 불어나 정상 발진에 이릅니다';
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '장면', '조건', '결과', '해석',
  ];

  function recordRow() {
    if (state.scene === 'process') {
      return [['1막', sim.elecUp ? '전자 들뜬상태' : '전자 바닥상태',
        '유도 방출 시 광자 1 → 2', '방향·위상이 같아 증폭됨']];
    }
    if (state.scene === 'inversion') {
      const f = excitedFrac();
      return [['2막', `펌핑 ${state.pump}%, 준안정 ${state.metastable ? '있음' : '없음'}`,
        `들뜬 원자 ${(f * 100).toFixed(0)}%`, f > 0.5 ? '밀도 반전 달성' : '반전 실패']];
    }
    const off = !state.mirL || !state.mirR;
    return [['3막', `펌핑 ${state.pump}%, 거울 ${off ? '젖힘' : '정렬'}`,
      `공진기 광자 ${photons.filter((p) => !p.stray).length} · 방출 ${sim.emitted}`,
      off ? '공진기 없음 — 발진 실패' : inverted() ? '레이저 발진!' : '흡수 우세']];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 유도 방출 관찰 · 1 밀도 반전 달성 · 2 준안정 상태 없이 실패 확인
     3 공진기에서 발진 · 4 기록 3줄                                        */
  const mis = { proc: false, inv: false, noMeta: false, lase: false };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.scene === 'process' && state.running) mis.proc = true;
    if (state.scene === 'inversion') {
      if (excitedFrac() > 0.5) mis.inv = true;
      if (!state.metastable && state.pump >= 60 && excitedFrac() <= 0.5) mis.noMeta = true;
    }
    if (state.scene === 'cavity' && inverted()) mis.lase = true;

    if (i === 0) return mis.proc;
    if (i === 1) return mis.inv;
    if (i === 2) return mis.noMeta;
    if (i === 3) return mis.lase;
    if (i === 4) return recs().length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'laser',
    noPrep: true,   // 모의실험형 — 배치 없이 바로 시작
    title: '빛을 기르는 공장 — 레이저 이야기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, excitedFrac, inverted,
    get photons() { return photons; },
    get sim() { return sim; },
    get scene() { return scene; },
  };
})();
