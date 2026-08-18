/**
 * ② 분해해서 들여다보기 — 축전기의 구조 (교과서 83쪽)
 *
 * 분해 모드 — 원통형 축전기를 단계별로 분해한다.
 *   0 겉모습 → 1 겉면 벗기기(반투명) → 2 속 꺼내기 → 3 펼치기
 *   말린 금속판 2장 + 절연체 종이가 풀려 나와, 부피는 작아도 면적이 크다는 것을 확인.
 * 조립 모드 — 판 간격 d 와 면적 A 를 바꾸며 충전되는 전하의 양(상대값)을 관찰.
 *   라운드 1: 전하 2배  ·  라운드 2: 전하 4배  ·  라운드 3: 원통형으로 말아 부피 줄이기
 *   (교육과정 지침에 따라 '전기 용량'이라는 용어·수식은 쓰지 않는다)
 */
const StructScene = (() => {
  const B = () => BABYLON;

  let scene, camera;
  let peelG, casing, casingMat, rollG, rollMeshes = [], stripG, stripLbl, capLblTex;
  let buildG, bPlateA, bPlateB, bFaceA, bFaceB, bTexA, bTexB, bArrows = [], dielec, rolledCyl;
  let batG;              // 조립 모드의 전원 회로 (전지·집게·도선)
  // 전하 유입·유출 경로 (buildG 로컬): 전지 → 집게. 판까지의 마지막 구간은 스폰 시점에 붙인다
  const BW_A = [[-4.5, -0.95, -0.18], [-4.5, -0.3, -0.55], [-2.05, -0.3, -0.8]];   // + 쪽 (앞판)
  const BW_B = [[-4.5, -0.95, 0.18], [-4.5, -0.3, 0.55], [-2.05, -0.3, 0.8]];      // − 쪽 (뒷판)
  let placed = {};

  const state = {
    mode: 'peel',        // 'peel' | 'build'
    stage: 0,            // 분해 단계 0~4 (겉모습→벗기기→눕히기→펼치기→층 분리)
    prog: 0,             // 단계 애니메이션 진행률 (stage 값을 따라간다)
    gapMm: 4,            // 판 간격 (mm) 1~8
    areaCm2: 20,         // 판 면적 (cm²) 10~80
    rolled: false,       // 원통형으로 말기
    rollProg: 0,         // 말기 애니메이션 진행률 (rolled 를 따라간다)
    round: 1,            // 조립 라운드 1~3 (3 완료 시 4)
  };
  let lastQ = 100;       // 전하 유입 애니메이션용 직전 전하량
  let inflow = [];       // 날아 들어오는 전하 입자들

  const tools = [{ id: 'bench', label: '분해 작업대', icon: 'voltmeter' }];

  /** 충전되는 전하의 양 (기준 d=4mm·A=20cm² 를 100 으로 하는 상대값) */
  const chargeRel = () => Math.round((state.areaCm2 / 20) * (4 / state.gapMm) * 100);
  /** 부피 상대값 — 말면 1/8 로 준다 */
  const volumeRel = () => state.rolled ? 13 : 100;
  const ROUND_GOAL = [null, [190, 210], [380, 420], null];   // 라운드 1·2 목표 구간

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#cfe3d8ff');

    camera = new (B().ArcRotateCamera)(
      'camSt', -Math.PI / 2, 1.05, 12, new (B().Vector3)(0, 1.4, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 26;
    camera.upperBetaLimit = 1.45;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hst', new (B().Vector3)(-0.2, 1, -0.35), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = new (B().Color3)(0.45, 0.5, 0.48);
    const dir = new (B().DirectionalLight)('dst', new (B().Vector3)(-0.4, -1, 0.45), scene);
    dir.position = new (B().Vector3)(8, 14, -9);
    dir.intensity = 0.3;

    // 작업대 (항상 보이는 배경)
    const table = B().MeshBuilder.CreateBox('stTable', { width: 24, height: 0.6, depth: 14 }, scene);
    table.position.y = -0.5;
    table.material = mat('stTableM', '#9aa89f', '#c8d4cc', 96);
    const matPad = B().MeshBuilder.CreateBox('stPad', { width: 12, height: 0.16, depth: 8 }, scene);
    matPad.position.set(0, -0.1, 0);
    matPad.material = mat('stPadM', '#3e4a55', '#6a7a88', 48);

    buildPeel();
    buildBuild();

    // 클릭 분해 — 부품을 직접 눌러 다음 단계로
    scene.onPointerObservable.add((info) => {
      if (info.type !== B().PointerEventTypes.POINTERDOWN) return;
      if (info.pickInfo && info.pickInfo.hit) onPick(info.pickInfo.pickedMesh);
    });

    // 교과서 그림 — 시뮬레이션 쪽을 바라보도록 안쪽으로 기울인다
    LabUI.addPoster(scene, '../assets/thumbs/capx-roll.jpg',
      { x: -8.2, y: 0, z: 4.6, ry: -0.35, label: '교과서 83쪽 — 원통형 구조' });
    LabUI.addPoster(scene, '../assets/thumbs/capacitor.jpg',
      { x: 8.2, y: 0, z: 4.6, ry: 0.35, label: '교과서 82쪽 — 실험 사진' });

    resetTools();
    return scene;
  }

  function mat(name, hex, spec, power) {
    const m = new (B().StandardMaterial)(name, scene);
    m.diffuseColor = B().Color3.FromHexString(hex);
    // 이 장면에서 일부 메시의 확산 조명이 계산되지 않는 문제가 있어 emissive 를 함께 준다
    m.emissiveColor = B().Color3.FromHexString(hex).scale(0.28);
    m.specularColor = spec ? B().Color3.FromHexString(spec) : new (B().Color3)(0.05, 0.05, 0.05);
    if (power) m.specularPower = power;
    return m;
  }

  function label(name, text, w, h, px, color) {
    const p = B().MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    p.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const W = Math.round(w * 130), H = Math.round(h * 130);
    const t = new (B().DynamicTexture)(name + 'T', { width: W, height: H }, scene, true);
    const c = t.getContext();
    c.clearRect(0, 0, W, H);
    c.fillStyle = color || '#2c3a46';
    c.font = `bold ${px}px "Noto Sans KR", sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    text.split('\n').forEach((ln, i, arr) =>
      c.fillText(ln, W / 2, H / 2 + (i - (arr.length - 1) / 2) * (px + 6)));
    t.hasAlpha = true; t.update();
    const m = new (B().StandardMaterial)(name + 'M', scene);
    m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.backFaceCulling = false;
    p.material = m;
    p._tex = t;
    return p;
  }

  /* ── 분해 모드 ─────────────────────────────── */
  let shellG;
  const HOME_X = -1.5;           // 조립 상태의 축전기 위치
  const ROLL_R = 0.725;          // 롤 반지름
  const LIFT = 0.75;             // 다리 높이 — 캔이 다리 위에 서 있다

  function buildPeel() {
    peelG = new (B().TransformNode)('stPeel', scene);

    // 겉 껍질(캔) + 다리 — 하나의 그룹으로 묶어 옆으로 옮길 수 있게 한다
    shellG = new (B().TransformNode)('stShell', scene);
    shellG.parent = peelG;
    casing = B().MeshBuilder.CreateCylinder('stCase', { height: 2.6, diameter: 1.7 }, scene);
    casing.position.set(0, 1.3, 0);
    casingMat = new (B().StandardMaterial)('stCaseM', scene);
    const ct = new (B().DynamicTexture)('stCaseT', { width: 512, height: 256 }, scene, true);
    const cc = ct.getContext();
    cc.fillStyle = '#20315e'; cc.fillRect(0, 0, 512, 256);
    cc.fillStyle = '#e8ecf4';
    cc.font = 'bold 44px sans-serif'; cc.textAlign = 'center';
    cc.fillText('1000 μF', 256, 100);
    cc.fillText('16 V', 256, 152);
    cc.fillStyle = '#cfd8e8'; cc.fillRect(60, 0, 56, 256);   // 극성(−) 띠
    cc.fillStyle = '#20315e'; cc.font = 'bold 60px sans-serif';
    cc.fillText('−', 88, 148);
    ct.update();
    ct.uScale = -1;   // 원통 옆면에서 글씨가 거울처럼 뒤집혀 보이는 것을 교정
    casingMat.diffuseTexture = ct;
    // DynamicTexture 를 diffuse 로만 쓰면 첫 렌더에서 보이지 않는 경우가 있어 emissive 를 함께 준다
    casingMat.emissiveTexture = ct;
    casingMat.emissiveColor = new (B().Color3)(0.42, 0.42, 0.42);
    casingMat.specularColor = B().Color3.FromHexString('#8898ac');
    casingMat.specularPower = 96;
    casing.material = casingMat;
    casing.parent = shellG;
    // 다리(리드선) 2개 — 긴 다리는 바닥까지 닿고, 짧은 다리는 살짝 떠 있다
    [[0.3, LIFT], [-0.3, LIFT - 0.16]].forEach(([dx, h], i) => {
      const leg = B().MeshBuilder.CreateCylinder('stLeg' + i, { height: h, diameter: 0.07 }, scene);
      leg.position.set(dx, -h / 2 + 0.02, 0);
      leg.material = mat('stLegM' + i, '#8a93a6', '#dfe4ee', 96);
      leg.parent = shellG;
    });
    shellG.position.set(HOME_X, LIFT, 0);
    const shellLbl = label('stShellL', '겉 껍질 (금속 캔)', 2.4, 0.5, 28, '#5a4632');
    shellLbl.position.set(0, 3.1, 0);
    shellLbl.parent = shellG;
    shellLbl.setEnabled(false);
    shellG._lbl = shellLbl;

    // 속 롤 — 위·아랫면에만 나선 단면, 옆면은 민무늬 포일. 꺼내면서 눕혀서 축을 바닥과 나란히 한다
    rollG = new (B().TransformNode)('stRoll', scene);
    // 텍스처 좌반부 = 나선(뚜껑면), 우반부 = 민무늬(옆면) — faceUV 로 나눠 입힌다
    const rt = new (B().DynamicTexture)('stRollT', { width: 512, height: 256 }, scene, true);
    const rc = rt.getContext();
    rc.fillStyle = '#cfc4a8'; rc.fillRect(0, 0, 512, 256);
    rc.strokeStyle = '#8a93a6'; rc.lineWidth = 7;
    rc.beginPath();
    for (let a = 0; a < Math.PI * 10; a += 0.05) {
      const r = 8 + a * 3.6;
      const x = 128 + r * Math.cos(a), y = 128 + r * Math.sin(a);
      if (a === 0) rc.moveTo(x, y); else rc.lineTo(x, y);
    }
    rc.stroke();
    rt.update();
    const roll = B().MeshBuilder.CreateCylinder('stRollC', {
      height: 2.3, diameter: ROLL_R * 2,
      faceUV: [
        new (B().Vector4)(0, 0, 0.5, 1),      // 아랫면 — 나선
        new (B().Vector4)(0.55, 0, 1, 1),     // 옆면 — 민무늬
        new (B().Vector4)(0, 0, 0.5, 1),      // 윗면 — 나선
      ],
    }, scene);
    const rm = new (B().StandardMaterial)('stRollM', scene);
    rm.diffuseTexture = rt;
    rm.emissiveTexture = rt;
    rm.emissiveColor = new (B().Color3)(0.42, 0.42, 0.42);
    rm.specularColor = new (B().Color3)(0.1, 0.1, 0.1);
    roll.material = rm;
    roll.parent = rollG;
    rollG.position.set(HOME_X, 1.15 + LIFT, 0);
    rollMeshes = [roll];

    // 펼친 띠 — 롤을 눕힌 축(z 방향)과 나란한 폭으로, x 방향으로 풀려 나간다
    stripG = new (B().TransformNode)('stStrip', scene);
    const layers = [
      ['금속판 ②', '#b8c4d4', 0],
      ['절연체 종이', '#e6dcbf', 1],
      ['금속판 ①', '#b8c4d4', 2],
    ];
    stripG._strips = layers.map(([nm, hex, order], i) => {
      const s = B().MeshBuilder.CreateBox('stStrip' + i, { width: 1, height: 0.05, depth: 2.2 }, scene);
      const sm = new (B().StandardMaterial)('stStripM' + i, scene);
      sm.emissiveColor = B().Color3.FromHexString(hex);
      sm.disableLighting = true;
      s.material = sm;
      s.parent = stripG;
      s._order = order;
      const ll = label('stStripLayerL' + i, nm, 2.0, 0.42, 26, i === 1 ? '#8a6a20' : '#3c5568');
      ll.parent = stripG;
      ll.setEnabled(false);
      s._lbl = ll;
      return s;
    });
    const l1 = label('stStripL', '펼친 길이 ≈ 1.2 m — 부피는 작아도 면적은 크게!', 6.4, 0.55, 34, '#20642f');
    l1.position.set(4.0, 2.4, 0);
    l1.parent = stripG;
    stripLbl = l1;
    const l2 = label('stCaseL', '원통형 축전기 (지름 1.6 cm) — 클릭해서 분해해 보세요!', 5.6, 0.55, 30);
    l2.position.set(HOME_X, 3.6 + LIFT, 0);
    l2.parent = peelG;
    peelG._titleLbl = l2;
  }

  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  /** 분해 단계 애니메이션 — prog 가 stage 를 따라간다
      1 겉 껍질을 옆으로 → 2 롤을 꺼내어 눕히기 → 3 축과 나란히 펼치기 → 4 층 분리 */
  function layoutPeel() {
    const p = state.prog;
    const k1 = clamp01(p);            // 껍질 옆으로
    const k2 = clamp01(p - 1);        // 롤 꺼내 눕히기
    const un = clamp01(p - 2);        // 펼치기
    const sep = clamp01(p - 3);       // 층 분리

    // 1. 겉 껍질 — 롤을 관통하지 않도록 위로 들어 올렸다가 옆으로 옮겨 내려놓는다
    const rise = clamp01(k1 / 0.35);
    const move = clamp01((k1 - 0.35) / 0.4);
    const down = clamp01((k1 - 0.75) / 0.25);
    shellG.position.x = HOME_X - move * 2.9;
    shellG.position.y = LIFT + (rise - down) * 2.9;
    shellG.rotation.z = move * 0.06;
    shellG._lbl.setEnabled(k1 > 0.9);
    peelG._titleLbl.setEnabled(p < 0.15);

    // 2. 롤 — 꺼내어 눕힌다 (축이 z 방향, 바닥과 나란히)
    rollG.rotation.x = k2 * Math.PI / 2;
    const rollScale = 1 - un * 0.62;
    rollMeshes[0].scaling.x = rollMeshes[0].scaling.z = rollScale;
    const baseY = 1.15 + LIFT;
    const rollY = baseY + k2 * (ROLL_R * rollScale - baseY) + (k2 > 0 ? Math.sin(k2 * Math.PI) * 0.7 : 0);
    // 3. 펼치기 — 띠는 x 방향으로 자라고, 롤은 풀리며 오른쪽으로 굴러간다 (바닥판 안에서)
    const L = un * 5.4;
    const x0 = -0.9;                  // 띠 시작점
    rollG.position.x = HOME_X + k2 * ((x0 + L + ROLL_R * rollScale) - HOME_X);
    rollG.position.y = rollY;
    // 굴러가는 회전 — 원통 자신의 축 둘레로 돌아야 한다.
    // 부모의 rotation.y 는 월드 y 축(프로펠러)이 되므로, 눕히기(rotation.x)는 부모가,
    // 축 둘레 회전은 자식 메시의 로컬 y(원통 축)가 맡는다.
    rollG.rotation.y = 0;
    rollG.rotation.z = 0;
    rollMeshes[0].rotation.y = -un * Math.PI * 4;
    stripG.setEnabled(un > 0.02);
    stripG._strips.forEach((s) => {
      s.scaling.x = Math.max(0.05, L);
      s.position.x = x0 + L / 2;
      s.position.y = 0.1 + s._order * (0.055 + sep * 0.42);
      s._lbl.position.set(x0 + L + 1.15, 0.16 + s._order * (0.055 + sep * 0.42), 0);
      s._lbl.setEnabled(sep > 0.75);
    });
    stripLbl.setEnabled(un > 0.85 && sep < 0.3);
  }

  /** 화면 요소를 클릭해서 분해 단계를 진행한다 */
  function onPick(mesh) {
    if (state.mode !== 'peel' || !mesh) return;
    const n = mesh.name;
    const isPart = n.startsWith('stCase') || n.startsWith('stLeg') ||
      n.startsWith('stRollC') || n.startsWith('stStrip');
    if (!isPart) return;
    if (state.stage < 4) {
      state.stage += 1;
      syncStageButtons();
      Lab.refresh();
    }
  }

  /** 컨트롤의 다음 단계 버튼 표시를 현재 단계와 맞춘다 */
  const STAGE_NAMES = ['① 겉모습', '② 껍질 벗기기', '③ 꺼내어 눕히기', '④ 펼치기', '⑤ 층 분리'];
  function syncStageButtons() {
    const now = document.getElementById('stageNow');
    const btn = document.getElementById('stageNextBtn');
    if (now) now.textContent = `지금: ${STAGE_NAMES[state.stage]} (${state.stage + 1}/5)`;
    if (btn) btn.innerHTML = state.stage < 4
      ? `다음 단계: ${STAGE_NAMES[state.stage + 1]} ▶`
      : '분해 완료 — 처음부터 다시 ↺';
  }

  /* ── 조립 모드 ─────────────────────────────── */
  function buildBuild() {
    buildG = new (B().TransformNode)('stBuild', scene);
    const mk = (name) => {
      const p = B().MeshBuilder.CreateBox('stBP' + name, { width: 3.2, height: 3.2, depth: 0.08 }, scene);
      p.material = mat('stBPM' + name, '#aab6c8', '#e8f0fa', 96);
      p.parent = buildG;
      const face = B().MeshBuilder.CreatePlane('stBF' + name, { width: 3.0, height: 3.0 }, scene);
      if (name === 'B') face.rotation.y = Math.PI;
      const t = new (B().DynamicTexture)('stBT' + name, { width: 250, height: 250 }, scene, true);
      t.hasAlpha = true;
      const m = new (B().StandardMaterial)('stBFM' + name, scene);
      m.diffuseTexture = t; m.opacityTexture = t; m.emissiveTexture = t;
      m.emissiveColor = new (B().Color3)(1, 1, 1);
      m.backFaceCulling = false;
      face.material = m;
      face.parent = buildG;
      return [p, face, t];
    };
    [bPlateA, bFaceA, bTexA] = mk('A');
    [bPlateB, bFaceB, bTexB] = mk('B');
    // 절연체 시트
    dielec = B().MeshBuilder.CreateBox('stDie', { width: 3.1, height: 3.1, depth: 0.05 }, scene);
    const dm = mat('stDieM', '#e6dcbf');
    dm.alpha = 0.55;
    dielec.material = dm;
    dielec.parent = buildG;
    // 판 사이 전기장 전기력선 화살표 (축 + 화살촉, + 판 → − 판)
    for (let i = 0; i < 9; i++) {
      const g2 = new (B().TransformNode)('stBAr' + i, scene);
      const mkm = (nm) => {
        const m = new (B().StandardMaterial)(nm, scene);
        m.emissiveColor = B().Color3.FromHexString('#ffd84a');
        m.disableLighting = true; m.alpha = 0.9;
        return m;
      };
      const sm2 = mkm('stBArSM' + i), tm2 = mkm('stBArTM' + i);
      const shaft = B().MeshBuilder.CreateCylinder('stBArS' + i, { height: 0.66, diameter: 0.05 }, scene);
      shaft.position.y = -0.07;
      shaft.material = sm2;
      shaft.parent = g2;
      const tip = B().MeshBuilder.CreateCylinder('stBArT' + i,
        { height: 0.22, diameterTop: 0, diameterBottom: 0.16 }, scene);
      tip.position.y = 0.37;
      tip.material = tm2;
      tip.parent = g2;
      g2.rotation.x = Math.PI / 2;     // 로컬 +y → +z (앞판(+) → 뒷판(−))
      g2.parent = buildG;
      g2._mats = [sm2, tm2];
      bArrows.push(g2);
    }
    // 전원 회로 — 전하는 공기에서 오는 게 아니라 연결된 회로를 타고 드나든다
    batG = new (B().TransformNode)('stBat', scene);
    batG.parent = buildG;
    const bat = B().MeshBuilder.CreateBox('stBatBox', { width: 0.75, height: 0.95, depth: 0.6 }, scene);
    bat.position.set(-4.5, -1.5, 0);
    bat.material = mat('stBatBoxM', '#2a3542', '#8898ac', 96);
    bat.parent = batG;
    const bl = label('stBatL', '전원 (9 V)', 1.6, 0.4, 26, '#3c4756');
    bl.position.set(-4.5, -0.55, 0);
    bl.parent = batG;
    const sp2 = label('stBatP', '+', 0.3, 0.3, 30, '#ff8a7a');
    sp2.position.set(-4.68, -0.9, -0.2);
    sp2.parent = batG;
    const sn2 = label('stBatN', '−', 0.3, 0.3, 30, '#7ab0ff');
    sn2.position.set(-4.32, -0.9, 0.2);
    sn2.parent = batG;
    // 도선 + 판을 무는 집게 — 판의 크기·간격이 변해도 끝점이 판 가장자리를 따라간다
    const mkSegs = (nm, hex, count) => Array.from({ length: count }, (_, i) => {
      const w = B().MeshBuilder.CreateCylinder(nm + i, { height: 1, diameter: 0.06 }, scene);
      w.material = mat(nm + i + 'M', hex, '#f0a08a', 96);
      w.isPickable = false;
      w.parent = batG;
      return w;
    });
    batG._segsA = mkSegs('stBW_A', '#c0392b', BW_A.length - 1);
    batG._segsB = mkSegs('stBW_B', '#3c4756', BW_B.length - 1);
    [['A', '#c0392b'], ['B', '#3c4756']].forEach(([nm, hex]) => {
      const clamp = B().MeshBuilder.CreateCylinder('stClamp' + nm, { height: 0.34, diameter: 0.16 }, scene);
      clamp.rotation.x = Math.PI / 2;
      clamp.material = mat('stClampM' + nm, hex, '#f0c0a0', 96);
      clamp.parent = batG;
      batG['_clamp' + nm] = clamp;
    });
    updateWires();

    // 말린 결과 — 판이 있던 자리에서 자라나며 만들어진다
    rolledCyl = B().MeshBuilder.CreateCylinder('stRolled', { height: 2.4, diameter: 1.6 }, scene);
    rolledCyl.material = mat('stRolledM', '#20315e', '#8898ac', 96);
    rolledCyl.position.set(0, 0, 0);
    rolledCyl.parent = buildG;
    const rl = label('stRolledL', '돌돌 말면 부피 ↓ (전하량은 그대로!)', 4.2, 0.5, 30, '#20642f');
    rl.position.set(0, 2.4, 0);
    rl.parent = buildG;
    buildG._rolledLbl = rl;
    // 전하량 게이지 — 넓은 틀 안에 채워지는 막대 (최대 800 눈금)
    const gBase = B().MeshBuilder.CreateBox('stQBase', { width: 1.6, height: 0.12, depth: 1.0 }, scene);
    gBase.position.set(4.35, -1.85, 0);
    gBase.material = mat('stQBaseM', '#39424f', '#6a7a88', 48);
    gBase.parent = buildG;
    const gFrame = B().MeshBuilder.CreateBox('stQFrame', { width: 1.3, height: 2.3, depth: 0.7 }, scene);
    gFrame.position.set(4.35, -0.65, 0);
    const gfm = mat('stQFrameM', '#8a97a5', '#c8d4e0', 64);
    gfm.alpha = 0.18;
    gFrame.material = gfm;
    gFrame.isPickable = false;
    gFrame.parent = buildG;
    const gBar = B().MeshBuilder.CreateBox('stQBar', { width: 1.05, height: 1, depth: 0.5 }, scene);
    const gm = new (B().StandardMaterial)('stQBarM', scene);
    gm.emissiveColor = B().Color3.FromHexString('#f0a83a');
    gm.disableLighting = true;
    gBar.material = gm;
    gBar.parent = buildG;
    buildG._qBar = gBar;
    // 게이지 숫자 라벨
    const ql = B().MeshBuilder.CreatePlane('stQLbl', { width: 2.6, height: 0.6 }, scene);
    ql.billboardMode = B().Mesh.BILLBOARDMODE_Y;
    const qt = new (B().DynamicTexture)('stQLblT', { width: 340, height: 80 }, scene, true);
    qt.hasAlpha = true;
    const qm = new (B().StandardMaterial)('stQLblM', scene);
    qm.diffuseTexture = qt; qm.opacityTexture = qt; qm.emissiveTexture = qt;
    qm.emissiveColor = new (B().Color3)(1, 1, 1);
    qm.backFaceCulling = false;
    ql.material = qm;
    ql.isPickable = false;
    ql.parent = buildG;
    buildG._qLbl = ql;
    buildG._qLblTex = qt;
    buildG.position.set(-0.6, 1.9, 0.4);
  }

  /** 도선 원기둥 하나를 두 점 사이에 맞춘다 (단위 높이 1 → scaling.y = 길이) */
  function setSeg(w, pa, pb) {
    const a = new (B().Vector3)(...pa), b2 = new (B().Vector3)(...pb);
    const d2 = b2.subtract(a);
    const len = Math.max(0.001, d2.length());
    w.position = a.add(d2.scale(0.5));
    w.scaling.y = len;
    const up = new (B().Vector3)(0, 1, 0);
    const axis = d2.normalize();
    const rotAxis = B().Vector3.Cross(up, axis);
    const ang = Math.acos(Math.max(-1, Math.min(1, B().Vector3.Dot(up, axis))));
    w.rotationQuaternion = rotAxis.length() < 1e-5
      ? B().Quaternion.Identity()
      : B().Quaternion.RotationAxis(rotAxis.normalize(), ang);
  }

  /** BW_A/BW_B 경로대로 도선·집게 위치를 다시 맞춘다 (끝점은 layoutBuild 가 갱신) */
  function updateWires() {
    if (!batG || !batG._segsA) return;
    batG._segsA.forEach((w, i) => setSeg(w, BW_A[i], BW_A[i + 1]));
    batG._segsB.forEach((w, i) => setSeg(w, BW_B[i], BW_B[i + 1]));
    batG._clampA.position.set(...BW_A[BW_A.length - 1]);
    batG._clampB.position.set(...BW_B[BW_B.length - 1]);
  }

  function drawQLabel() {
    const t = buildG._qLblTex;
    const c = t.getContext();
    c.clearRect(0, 0, 340, 80);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#b05820';
    c.font = 'bold 40px "Noto Sans KR", sans-serif';
    c.fillText(`전하량 ${chargeRel()}`, 170, 28);
    c.fillStyle = '#59626e';
    c.font = 'bold 22px "Noto Sans KR", sans-serif';
    c.fillText('(기준 100)', 170, 62);
    t.update();
  }

  const WIDE = 1.55;   // 펼친 판의 가로:세로 비 — 정사각형이 아니라 옆으로 긴 띠 느낌

  function layoutBuild() {
    // 간격·판 두께를 줄여 말 때 원통이 판을 쓸고 지나가는 느낌을 던다
    const gapU = 0.2 + (state.gapMm / 8) * 1.05;
    const sizeU = 0.5 + Math.sqrt(state.areaCm2 / 80) * 0.75;
    const rp = state.rollProg;                 // 0 펼침 ↔ 1 말림 (분해의 역재생처럼)
    // 전하 기호 면은 판 바깥쪽에 — 안쪽이면 판에 가려 보이지 않는다
    bPlateA.position.z = -gapU / 2; bFaceA.position.z = -gapU / 2 - 0.055;
    bPlateB.position.z = gapU / 2;  bFaceB.position.z = gapU / 2 + 0.055;
    // 말기: 오른쪽 끝은 고정, 왼쪽부터 감겨 들어가며 판의 폭이 줄어든다
    const shrink = 1 - rp;
    const halfBase = 1.6 * sizeU * WIDE;       // 판 절반 폭 (월드)
    const shift = halfBase * rp;               // 오른쪽 가장자리 고정용 중심 이동
    [bPlateA, bFaceA, bPlateB, bFaceB].forEach((p) => {
      p.scaling.x = Math.max(0.02, sizeU * shrink * WIDE);
      p.scaling.y = sizeU;
      p.position.x = shift;
    });
    dielec.scaling.x = Math.max(0.02, sizeU * 0.97 * shrink * WIDE);
    dielec.scaling.y = sizeU * 0.97;
    // 유전체는 극판 사이를 꽉 채운다 (기본 두께 0.05 → 간격에 맞게 확대)
    dielec.scaling.z = Math.max(0.6, (gapU - 0.1) / 0.05);
    dielec.position.z = 0;
    dielec.position.x = shift;
    const flatOn = rp < 0.98;
    [bPlateA, bFaceA, bPlateB, bFaceB, dielec].forEach((p) => p.setEnabled(flatOn));
    // 말린 롤 — 감기는 왼쪽 끝에서 굴러가며 점점 굵어진다 (분해 펼치기의 역방향)
    const rollR = 0.12 + 0.68 * rp;
    const leftEdge = halfBase * (2 * rp - 1);
    rolledCyl.setEnabled(rp > 0.02);
    rolledCyl.scaling.set(rollR / 0.8, (3.2 * sizeU) / 2.4, rollR / 0.8);
    rolledCyl.position.set(leftEdge - rollR * 0.45, 0, 0);
    rolledCyl.rotation.y = -rp * 12;           // 자기 축 둘레로 감기는 회전
    buildG._rolledLbl.setEnabled(rp > 0.9);
    buildG._rolledLbl.position.set(rolledCyl.position.x, 2.4, 0);
    // 판 크기·간격이 변해도 전원 도선·집게가 판의 왼쪽 가장자리를 따라온다
    const edgeX = shift - halfBase * shrink;
    BW_A[BW_A.length - 1] = [edgeX - 0.1, -0.3, -gapU / 2];
    BW_B[BW_B.length - 1] = [edgeX - 0.1, -0.3, gapU / 2];
    updateWires();
    // 전기력선 화살표 — 간격이 좁을수록 굵고 진하게
    const pull = 4 / state.gapMm;
    bArrows.forEach((a, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      a.position.set(shift + (-1 + col) * sizeU * shrink * WIDE, (-1 + row) * sizeU, 0);
      a.scaling.set(0.6 + pull * 0.35, Math.max(0.4, (gapU - 0.1) / 0.95), 0.6 + pull * 0.35);
      a._mats.forEach((m2) => { m2.alpha = Math.min(1, 0.35 + pull * 0.3); });
      a.setEnabled(flatOn && rp < 0.5);
    });
    // 전하 기호 — 상대값에 비례 (최대 24개). 같은 부호 전하는 서로 밀어내므로
    // 판 전체에 고르게 퍼져 거리를 유지하고, 수가 변하면 전체가 재배치된다.
    const n = Math.max(2, Math.min(24, Math.round(chargeRel() / 400 * 24)));
    const draw = (tex, sign) => {
      const c = tex.getContext();
      c.clearRect(0, 0, 250, 250);
      c.font = 'bold 32px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = sign > 0 ? '#d0453a' : '#2f6ad0';
      // 서로 밀어내는 배치 — 판이 가로로 늘어난 만큼 가로를 넓게 잡아 계산한다
      LabUI.chargeLayout(Math.round(250 * WIDE), 250, n).forEach((p) => {
        c.save();
        c.translate(p.x / WIDE, p.y);
        c.scale(1 / WIDE, 1);
        c.fillText(sign > 0 ? '+' : '−', 0, 0);
        c.restore();
      });
      tex.update();
    };
    draw(bTexA, +1);
    draw(bTexB, -1);
    // 전하량 게이지 갱신 — 넓은 틀(최대 800) 안을 채운다
    const q = chargeRel();
    const h = Math.max(0.08, Math.min(1, q / 800) * 2.2);
    buildG._qBar.scaling.y = h;
    buildG._qBar.position.set(4.35, -1.79 + h / 2, 0);
    buildG._qBar.material.emissiveColor = B().Color3.FromHexString(
      state.round === 4 ? '#5af0a0' : q >= 380 ? '#f0d03a' : '#f0a83a');
    buildG._qLbl.position.set(4.35, 0.9, 0);
    drawQLabel();
    // 전원 회로는 말리는 동안 잠시 감춘다
    batG.setEnabled(flatOn && rp < 0.5);
    // 전하량이 늘면 회로 도선을 따라 판으로 들어오고, 줄면 도선을 따라 전원으로 되돌아간다
    const dq = q - lastQ;
    if (Math.abs(dq) > 5 && rp < 0.5) {
      const nIn = Math.min(8, Math.round(Math.abs(dq) / 25) + 2);
      for (let i = 0; i < nIn; i++) {
        const front = i % 2 === 0;             // 앞판(+, 빨강) / 뒷판(−, 파랑)
        const base = front ? BW_A : BW_B;
        const target = [
          shift + (Math.random() * 2 - 1) * sizeU * 1.1,
          (Math.random() * 2 - 1) * sizeU * 1.1,
          front ? -(gapU / 2 + 0.1) : (gapU / 2 + 0.1),
        ];
        const pts = dq > 0 ? [...base, target] : [target, ...[...base].reverse()];
        const s = B().MeshBuilder.CreateSphere('stInflow' + Math.random(), { diameter: 0.16 }, scene);
        const sm = new (B().StandardMaterial)('stInflowM' + Math.random(), scene);
        sm.emissiveColor = B().Color3.FromHexString(front ? '#d0453a' : '#2f6ad0');
        sm.disableLighting = true;
        s.material = sm;
        s.isPickable = false;
        s.parent = buildG;
        s.position.set(pts[0][0], pts[0][1], pts[0][2]);
        inflow.push({ m: s, pts, T: 0.85, t: 0.85 + i * 0.06 });
      }
    }
    lastQ = q;
    checkRound();
  }

  /** 3D 폴리라인 위의 u(0~1) 지점 */
  function polyPoint3(pts, u) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
      segs.push([i, L]); total += L;
    }
    let d = u * total;
    for (const [i, L] of segs) {
      if (d <= L) {
        const t = d / L;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
                pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
                pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t];
      }
      d -= L;
    }
    return pts[pts.length - 1];
  }

  /** 라운드 판정 — 목표를 이루면 다음 라운드로 */
  function checkRound() {
    const q = chargeRel();
    if (state.round === 1 && q >= ROUND_GOAL[1][0] && q <= ROUND_GOAL[1][1]) state.round = 2;
    else if (state.round === 2 && q >= ROUND_GOAL[2][0] && q <= ROUND_GOAL[2][1]) state.round = 3;
    else if (state.round === 3 && state.rolled && state.areaCm2 >= 80) state.round = 4;
  }

  /* ══ 도구 (noPrep — 배치 없음) ═══════════════ */
  function resetTools() {
    placed = {}; tools.forEach((t) => { placed[t.id] = true; });
    state.stage = 0; state.prog = 0;
    state.gapMm = 4; state.areaCm2 = 20; state.rolled = false; state.rollProg = 0; state.round = 1;
    lastQ = 100;
    inflow.forEach((p) => p.m.dispose());
    inflow = [];
    layout();
  }
  function placeTool(id) { placed[id] = true; }
  function allPlaced() { return true; }
  function dropAt() { return 'ok'; }
  function slotName() { return ''; }

  function layout() {
    const peel = state.mode === 'peel';
    peelG.setEnabled(peel);
    rollG.setEnabled(peel);
    stripG.setEnabled(peel);
    buildG.setEnabled(!peel);
    if (peel) layoutPeel();
    else layoutBuild();
  }

  function tick(dt) {
    // 분해 단계 애니메이션
    if (state.mode === 'peel') {
      if (Math.abs(state.prog - state.stage) > 0.002) {
        state.prog += Math.sign(state.stage - state.prog) * Math.min(1.6 * dt, Math.abs(state.stage - state.prog));
        layoutPeel();
        return true;
      }
      return false;
    }
    // 조립 모드 — 말기 전환과 전하 유입 애니메이션
    let dirty = false;
    const target = state.rolled ? 1 : 0;
    if (Math.abs(state.rollProg - target) > 0.002) {
      state.rollProg += Math.sign(target - state.rollProg) * Math.min(1.4 * dt, Math.abs(target - state.rollProg));
      layoutBuild();
      dirty = true;
    }
    if (inflow.length) {
      inflow = inflow.filter((p) => {
        p.t -= dt;
        if (p.t <= 0) { p.m.dispose(); return false; }
        const u = Math.max(0, Math.min(1, 1 - p.t / p.T));
        const [x, y, z] = polyPoint3(p.pts, u);
        p.m.position.set(x, y, z);
        return true;
      });
      dirty = true;
    }
    return dirty;
  }

  function update() { layout(); }

  /** 탐구 수행 단계 자동 진행 조건 (content.steps.struct 과 1:1) */
  function stepDone(i) {
    if (i === 0) return state.mode === 'build' || state.stage >= 1;
    if (i === 1) return state.mode === 'build' || state.stage >= 4;
    if (i === 2) return state.mode === 'build' && state.round >= 2;
    if (i === 3) return state.mode === 'build' && state.round >= 3;
    return false;
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2;
    camera.beta = state.mode === 'peel' ? 1.05 : 1.25;
    camera.radius = 12;
    camera.setTarget(new (B().Vector3)(0, 1.4, 0));
  }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '실물로는 위험해서 열어 볼 수 없는 축전기를 마음껏 분해해 보세요. 조립 모드에서는 판을 바꿔 목표 전하량을 만들어 봅니다.';
  const prepGuide = '';

  function controlsHTML() {
    const modeBtns = LabUI.opts('실험 모드', 'mode', [
      { v: 'peel', t: '분해 관찰 (83쪽)' }, { v: 'build', t: '나만의 축전기 조립' },
    ], state.mode, 1);

    if (state.mode === 'peel') {
      // 분해는 순서대로만 진행 — 버튼 하나(다음 단계)로 줄이고, 부품 클릭으로도 진행된다
      return `
        ${modeBtns}
        <div class="control">
          <div class="clabel">분해 단계<br>(부품 클릭도 OK)</div>
          <div class="cbody" style="display:flex;align-items:center;gap:8px">
            <span id="stageNow" style="font-size:12px;color:#62718a;font-weight:700"></span>
            <button class="opt on" id="stageNextBtn"></button>
          </div>
        </div>
        <div class="control">
          <div class="clabel">처음<br>상태로</div>
          <button class="power off" id="resetBtn">↻ 처음 상태로</button>
        </div>`;
    }
    return `
      ${modeBtns}
      ${LabUI.slider('gapCtl', '판 사이 간격 <i>d</i>',
        { min: 1, max: 8, step: 0.5, value: state.gapMm, fmt: (v) => `${(+v).toFixed(1)} mm` })}
      ${LabUI.slider('areaCtl', '판의 면적 <i>A</i>',
        { min: 10, max: 80, step: 5, value: state.areaCm2, fmt: (v) => `${v} cm²` })}
      ${LabUI.opts('원통형으로 말기', 'rolled', [
        { v: 0, t: '펼친 상태' }, { v: 1, t: '돌돌 말기' },
      ], state.rolled ? 1 : 0, 1)}
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 처음 상태로</button>
      </div>`;
  }

  function bindControls(root, onChange) {
    LabUI.bindOpts(root, 'mode', state, 'mode', () => {
      resetCamera();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      layout();
      onChange();
    }, String);

    if (state.mode === 'peel') {
      root.querySelector('#stageNextBtn').addEventListener('click', () => {
        state.stage = state.stage < 4 ? state.stage + 1 : 0;
        onChange();
        syncStageButtons();
      });
      syncStageButtons();
      root.querySelector('#resetBtn').addEventListener('click', () => {
        state.stage = 0;
        root.innerHTML = controlsHTML();
        bindControls(root, onChange);
        onChange();
      });
    } else {
      LabUI.bindSlider(root, 'gapCtl', state, 'gapMm', (v) => `${(+v).toFixed(1)} mm`,
        () => { layoutBuild(); onChange(); });
      LabUI.bindSlider(root, 'areaCtl', state, 'areaCm2', (v) => `${v} cm²`,
        () => { layoutBuild(); onChange(); });
      LabUI.bindOpts(root, 'rolled', state, 'rolled', () => { layoutBuild(); onChange(); },
        (v) => v === '1');
      root.querySelector('#resetBtn').addEventListener('click', () => {
        state.gapMm = 4; state.areaCm2 = 20; state.rolled = false; state.rollProg = 0; state.round = 1;
        lastQ = 100;
        root.innerHTML = controlsHTML();
        bindControls(root, onChange);
        layoutBuild();
        onChange();
      });
    }
  }

  /* ══ 측정값 ═════════════════════════════════ */
  const STAGE_TEXT = [
    '겉면의 표시를 읽어 보세요 — 1000 μF, 허용 전압 16 V, 그리고 − 극성 띠. 부품을 클릭하면 분해가 시작됩니다. 실물은 전해액 때문에 함부로 분해하면 위험합니다.',
    '겉 껍질(금속 캔)을 벗겨 옆에 두었습니다. 안에 무엇인가 돌돌 말려 있네요! 롤을 클릭해 꺼내 봅시다.',
    '롤을 꺼내어 눕혔습니다 — 원통의 축이 바닥과 나란해졌습니다. 이제 클릭해서 축과 나란한 폭으로 펼쳐 봅시다.',
    '롤이 굴러가며 띠가 풀렸습니다. 펼치니 1 m 가 넘습니다 — 부피는 작아도 면적은 크게! 한 번 더 클릭하면 층을 분리합니다.',
    '층을 분리했습니다 — 금속판 2장 사이에 절연체 종이가 끼워져 함께 말려 있었습니다. 이것이 원통형 축전기의 전부입니다!',
  ];

  function readoutHTML() {
    if (state.mode === 'peel') {
      return `
        <div class="row"><span>분해 단계</span><b class="big">${state.stage + 1} / 5</b></div>
        <div class="row"><span>원통 지름</span><b>1.6 cm</b></div>
        <div class="row"><span>펼친 길이</span><b>${state.stage >= 3 ? '약 1.2 m' : '?'}</b></div>
        <div class="formula">${STAGE_TEXT[state.stage]}</div>`;
    }
    const q = chargeRel();
    const goal = ROUND_GOAL[state.round];
    const roundMsg = state.round === 1
      ? '라운드 1 — 기준(100)의 <b>2배</b>(190~210)를 만들어 보세요. 간격이나 면적, 무엇을 바꾸면 될까요?'
      : state.round === 2
      ? '<b style="color:#2f9e6b">라운드 1 통과!</b> 라운드 2 — 이번엔 <b>4배</b>(380~420). 두 조건을 함께 조합해야 합니다.'
      : state.round === 3
      ? '<b style="color:#2f9e6b">라운드 2 통과!</b> 라운드 3 — 면적을 최대(80 cm²)로 하고 돌돌 말기로 부피를 줄여 보세요.'
      : '<b style="color:#2f9e6b">라운드 3 통과 — 수리 완료 배지 획득! 🏅</b> 실제 축전기가 바로 이 구조입니다: 넓은 판을 말아 작은 원통에 넣은 것.';
    return `
      <div class="row"><span>판 사이 간격 <i>d</i></span><b>${state.gapMm.toFixed(1)} mm</b></div>
      <div class="row"><span>판의 면적 <i>A</i></span><b>${state.areaCm2} cm²</b></div>
      <div class="row"><span>충전되는 전하의 양</span><b class="big">${q}</b></div>
      <div class="row"><span>(기준 100 대비 상대값)</span><b>${goal ? `목표 ${goal[0]}~${goal[1]}` : '—'}</b></div>
      <div class="row"><span>부피 (상대값)</span><b>${volumeRel()}</b></div>
      <div class="formula">${roundMsg}</div>`;
  }

  /* ══ 그래프 ═════════════════════════════════ */
  const graphTitle = '충전되는 전하의 양 — 간격·면적에 따라';

  function drawGraph(ctx, W2, H2) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W2, H2);
    const padL = 42, padR = 12, padT = 16, padB = 26;
    const gw = W2 - padL - padR, gh = H2 - padT - padB;
    // 전하량 ∝ 1/d 곡선 (현재 면적 기준) + 현재 점
    const QMAX = (state.areaCm2 / 20) * 4 * 100 * 1.1;
    const xOf = (d) => padL + ((d - 1) / 7) * gw;
    const yOf = (q) => padT + gh - Math.min(1, q / QMAX) * gh;
    ctx.strokeStyle = '#5ad0f0'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const d = 1 + (i / 100) * 7;
      const q = (state.areaCm2 / 20) * (4 / d) * 100;
      if (i === 0) ctx.moveTo(xOf(d), yOf(q)); else ctx.lineTo(xOf(d), yOf(q));
    }
    ctx.stroke();
    if (state.mode === 'build') {
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.arc(xOf(state.gapMm), yOf(chargeRel()), 5, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + gh); ctx.lineTo(padL + gw, padT + gh);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c2'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('판 사이 간격 d (mm)', W2 - 4, padT + gh + 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5ad0f0'; ctx.font = 'bold 10px sans-serif';
    ctx.fillText('간격이 좁을수록, 면적이 넓을수록 전하를 많이 모은다', padL + 6, padT + 2);
  }

  function graphFootHTML() {
    if (state.mode === 'peel') {
      return '실제 축전기는 넓은 금속판을 돌돌 말아 작은 원통에 넣은 것입니다 (83쪽 그림 Ⅱ-9)';
    }
    return `지금 전하량 ${chargeRel()} (기준 100) — 간격 절반 → 2배 · 면적 2배 → 2배`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = ['모드', '조건', '전하량 (상대값)', '비고'];

  function recordRow() {
    if (state.mode === 'peel') {
      return [['분해', `단계 ${state.stage + 1}/5`, '—',
        state.stage >= 3 ? '펼친 길이 1.2 m 확인' : STAGE_TEXT[state.stage].slice(0, 24)]];
    }
    return [['조립', `d=${state.gapMm.toFixed(1)}mm · A=${state.areaCm2}cm²${state.rolled ? ' · 말림' : ''}`,
      chargeRel(),
      state.round === 4 ? '라운드 완료 🏅' : `라운드 ${state.round} 진행 중`]];
  }

  return {
    id: 'struct',
    title: '② 분해해서 들여다보기 — 축전기의 구조',
    tabLabel: '② 축전기의 구조',
    noPrep: true,
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML, stepDone,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, chargeRel, volumeRel,
    get scene() { return scene; },
  };
})();
