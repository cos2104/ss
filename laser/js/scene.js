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

  const state = {
    scene: 'process',     // 'process' | 'inversion' | 'cavity'
    pump: 30,             // 에너지 공급 (%)
    metastable: 1,        // 준안정 상태 있음(1)/없음(0)
    running: false,
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

    // 광학 실험대 — 항상 보이는 기본 배경
    const bench = B().MeshBuilder.CreateBox('laBench', { width: 22, height: 0.5, depth: 12 }, scene);
    bench.position.y = -0.26;
    bench.material = mat('laBenchMat', '#242c3c', '#3a4a60', 48);

    buildBoard();
    buildAtoms();
    buildCavity();
    buildProps();
    buildPlaceholders();

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
    const title = !p ? '버튼을 눌러 세 가지 상호작용을 일으켜 보세요 (그림 II-27)'
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
    const dial = B().MeshBuilder.CreateCylinder('laPropPD', { height: 0.1, diameter: 0.4 }, scene);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0.35, 0.62, -0.52);
    dial.material = mat('laPropPDM', '#c8d4e4', '#ffffff', 96);
    dial.parent = gp;
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
      const tex = new (B().DynamicTexture)('phT_' + id, { width: 420, height: 120 }, scene, true);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, 420, 120);
      ctx.strokeStyle = '#5a9df0'; ctx.lineWidth = 5;
      ctx.setLineDash([15, 11]);
      ctx.strokeRect(7, 7, 406, 106);
      ctx.setLineDash([]);
      ctx.fillStyle = '#5a9df0';
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
    return (Math.abs(point.x - c.x) <= 4.2 && Math.abs(point.z - c.z) <= 3.2) ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 진행 ═══════════════════════════════════ */
  function reset() {
    state.running = false;
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
        beamG.setEnabled(sim.emitted > 2 && inverted());
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
          // 거울 반사
          if (p.x <= -5.9) { p.x = -5.9; p.dir = 1; }
          if (p.x >= 5.9) {
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
    root.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => {
      state.scene = b.getAttribute('data-scene');
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.scene === 'process') {
      const trigger = (type, needUp) => {
        if (sim.anim) return;
        if (needUp !== undefined && sim.elecUp !== needUp) {
          // 조건이 안 맞으면 안내만
          sim.msg = needUp ? '전자가 바닥에 있어요 — 먼저 «빛 쏘기»로 올려 주세요.'
            : '전자가 이미 들떠 있어요 — 방출부터 시켜 주세요.';
          onChange();
          return;
        }
        sim.msg = null;
        sim.anim = { type, t: 0 };
        onChange();
      };
      root.querySelector('#absorbBtn').addEventListener('click', () => trigger('absorb', false));
      root.querySelector('#spontBtn').addEventListener('click', () => trigger('spont', true));
      root.querySelector('#stimBtn').addEventListener('click', () => trigger('stim', true));
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
    return `
      <div class="row"><span>펌핑</span><b>${state.pump} % ${inverted() ? '(반전 달성)' : '(반전 안 됨)'}</b></div>
      <div class="row"><span>공진기 안의 정렬된 광자</span><b class="big">${n}개</b></div>
      <div class="row"><span>방출된 레이저 광자</span><b class="big">${sim.emitted}개</b></div>
      <div class="formula">${inverted()
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
    return [['3막', `펌핑 ${state.pump}%`,
      `공진기 광자 ${photons.filter((p) => !p.stray).length} · 방출 ${sim.emitted}`,
      inverted() ? '레이저 발진!' : '흡수 우세']];
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
