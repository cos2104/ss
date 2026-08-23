/**
 * 역학적 에너지 보존 관찰하기
 * 비상교육 고등 물리학 I-2-01 (교과서 42~47쪽), 그림 I-29 · 52쪽 진자의 에너지 전환
 *
 * 두 가지 모드가 있다.
 *   자유 낙하 — 사과가 떨어지며 Ep → Ek 로 바뀌는 동안 합이 일정하다
 *   진자      — 같은 사과를 실에 매달아 Ep ↔ Ek 가 반복 전환되는 것을 본다
 * 공기 저항을 켜면 역학적 에너지가 줄어드는 것까지 비교할 수 있게 했다.
 */
const EnergyScene = (() => {
  const B = () => BABYLON;

  const M = 1.6;            // 1 m = 1.6 scene unit
  const G = 9.8;
  const GROUND_Y = 0;

  let scene, camera, canvasEl;
  let apple, tree, tower, ruler, ghostMarks = [];
  let pendGroup, pendString, pendArm, pendPivot;
  let placed = {};

  const state = {
    mode: 'fall',   // fall(자유 낙하) | pend(진자)
    h0: 5.0,        // 처음 높이 (m)
    mass: 0.2,      // kg
    drag: false,    // 공기 저항
    running: false,
    pendL: 3.0,     // 진자 길이 (m)
    theta0: 60,     // 시작 각도 (°)
  };

  // 진행 상태
  let sim = null;           // 자유 낙하
  let pend = null;          // 진자 { th, om }
  let pendSide = 1;         // 진자를 어느 쪽으로 당겨 두었는지 (＋1 오른쪽 · －1 왼쪽)
  const DRAG_K = 0.14;      // 공기 저항 계수 (b/m, 1/s 단위로 단순화)
  const PEND_K = 0.22;      // 진자 감쇠 계수 (1/s)

  /** 진자 최저점의 지면 높이 — 봅이 흔들려도 바닥에 닿지 않게 */
  const PEND_CLEAR = 0.7;
  function pivotY() { return GROUND_Y + (state.pendL + PEND_CLEAR) * M; }

  const tools = [
    { id: 'tower', label: '낙하 장치 · 자', icon: 'tower' },
    { id: 'apple', label: '사과 (추)', icon: 'ball' },
    { id: 'timer', label: '속도 측정기', icon: 'stopwatch' },
  ];

  const slots = {
    tower: { x: 0, name: '낙하 장치' },
    apple: { x: 0, name: '사과' },
    timer: { x: 3.2, name: '속도 측정기' },
  };

  /* ══ 장면 ═══════════════════════════════════ */
  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    canvasEl = canvas;                 // 끌기가 끝나면 카메라를 다시 이 캔버스에 붙인다
    scene.clearColor = B().Color4.FromHexString('#bcdcf7ff');

    camera = new (B().ArcRotateCamera)(
      'camEn', -Math.PI / 2 + 0.24, 1.24, 17, new (B().Vector3)(0.5, 4.2, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 40;
    camera.upperBetaLimit = 1.52;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('he', new (B().Vector3)(-0.2, 1, -0.4), scene);
    hemi.intensity = 0.9;
    hemi.groundColor = new (B().Color3)(0.4, 0.46, 0.4);

    const dir = new (B().DirectionalLight)('de', new (B().Vector3)(-0.5, -1, 0.4), scene);
    dir.position = new (B().Vector3)(8, 18, -8);
    dir.intensity = 0.42;

    buildGround();
    buildTower();
    buildApple();
    buildPendulum();
    buildPlaceholders();
    buildSteppers();
    setupPointer();

    // 교과서 그림 액자 (배경 소품)
    LabUI.addPoster(scene, '../assets/thumbs/energy.jpg', { x: -8, y: 0, z: 8, ry: 0.35 });

    resetTools();
    return scene;
  }

  /** 진자 — 기둥에서 뻗은 팔에 실을 매달고 사과를 봅으로 쓴다 */
  function buildPendulum() {
    pendGroup = new (B().TransformNode)('pendGroup', scene);

    pendArm = B().MeshBuilder.CreateBox('pendArm', { width: 2.6, height: 0.24, depth: 0.24 }, scene);
    pendArm.material = mat('pendArmMat', '#8e9bad', '#dfe6ee', 64);
    pendArm.parent = pendGroup;

    pendPivot = B().MeshBuilder.CreateSphere('pendPivot', { diameter: 0.34, segments: 10 }, scene);
    pendPivot.material = mat('pendPivotMat', '#39424f');
    pendPivot.parent = pendGroup;

    pendString = B().MeshBuilder.CreateCylinder('pendString', { height: 1, diameter: 0.05 }, scene);
    const sm = new (B().StandardMaterial)('pendStringMat', scene);
    sm.diffuseColor = B().Color3.FromHexString('#2b323c');
    pendString.material = sm;
    pendString.parent = pendGroup;
  }

  function mat(name, hex, spec, power) {
    const m = new (B().StandardMaterial)(name, scene);
    m.diffuseColor = B().Color3.FromHexString(hex);
    m.specularColor = spec ? B().Color3.FromHexString(spec) : new (B().Color3)(0.05, 0.05, 0.05);
    if (power) m.specularPower = power;
    return m;
  }

  function buildGround() {
    const g = B().MeshBuilder.CreateGround('enGround', { width: 40, height: 24 }, scene);
    g.position.y = GROUND_Y;
    g.material = mat('enGroundMat', '#6f9457');

    // 지면 (기준면) 표시
    const line = B().MeshBuilder.CreateBox('baseLine', { width: 26, height: 0.06, depth: 0.12 }, scene);
    line.position.set(0, GROUND_Y + 0.04, 0);
    const lm = new (B().StandardMaterial)('baseLineMat', scene);
    lm.emissiveColor = B().Color3.FromHexString('#ffffff');
    lm.disableLighting = true;
    line.material = lm;
  }

  /** 낙하 장치(기둥)와 높이 눈금 */
  function buildTower() {
    tower = new (B().TransformNode)('towerGroup', scene);
    const pm = mat('towerMat', '#8e9bad', '#dfe6ee', 64);

    const post = B().MeshBuilder.CreateBox('towerPost', { width: 0.5, height: 11 * M, depth: 0.5 }, scene);
    post.position.set(-1.6, GROUND_Y + 5.5 * M, 0);
    post.material = pm;
    post.parent = tower;

    const base = B().MeshBuilder.CreateBox('towerBase', { width: 2.6, height: 0.35, depth: 2.2 }, scene);
    base.position.set(-1.6, GROUND_Y + 0.17, 0);
    base.material = mat('towerBaseMat', '#39424f');
    base.parent = tower;

    // 높이 눈금자
    ruler = B().MeshBuilder.CreatePlane('enRuler', { width: 1.5, height: 11 * M }, scene);
    ruler.position.set(-1.05, GROUND_Y + 5.5 * M, -0.28);
    ruler.rotation.y = Math.PI;
    const tex = new (B().DynamicTexture)('enRulerTex', { width: 150, height: 1100 }, scene, true);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 150, 1100);
    ctx.translate(150, 0); ctx.scale(-1, 1);   // 판을 돌려 붙이므로 미리 뒤집는다
    ctx.fillStyle = '#f4f1e4';
    ctx.fillRect(0, 0, 150, 1100);
    ctx.strokeStyle = '#3c4756'; ctx.lineWidth = 3;
    for (let m = 0; m <= 10; m++) {
      const y = 1100 - 50 - m * 100;
      const big = m % 5 === 0;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(big ? 52 : 32, y); ctx.stroke();
      if (m % 1 === 0) {
        ctx.fillStyle = '#2f3947';
        ctx.font = `bold ${big ? 40 : 30}px sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`${m}m`, 60, y);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tex.hasAlpha = true; tex.update();
    const rm = new (B().StandardMaterial)('enRulerMat', scene);
    rm.diffuseTexture = tex; rm.opacityTexture = tex;
    rm.emissiveColor = new (B().Color3)(0.85, 0.85, 0.85);
    rm.specularColor = new (B().Color3)(0, 0, 0);
    rm.backFaceCulling = false;
    ruler.material = rm;
    ruler.parent = tower;
  }

  function buildApple() {
    apple = new (B().TransformNode)('appleGroup', scene);
    const body = B().MeshBuilder.CreateSphere('appleBody', { diameter: 0.92, segments: 20 }, scene);
    body.material = mat('appleMat', '#d8402f', '#ffd9d2', 42);
    body.parent = apple;

    const stem = B().MeshBuilder.CreateCylinder('appleStem', { height: 0.34, diameter: 0.09 }, scene);
    stem.position.y = 0.55;
    stem.material = mat('appleStemMat', '#5a3a24');
    stem.parent = apple;

    const leaf = B().MeshBuilder.CreateDisc('appleLeaf', { radius: 0.22, tessellation: 12 }, scene);
    leaf.position.set(0.2, 0.62, 0);
    leaf.rotation.set(Math.PI / 2.4, 0, 0.5);
    leaf.material = mat('appleLeafMat', '#3f8a45');
    leaf.parent = apple;
  }

  /** 낙하 중 남기는 잔상 (교과서 그림 I-29 처럼 여러 위치의 사과) */
  function clearMarks() {
    ghostMarks.forEach((m) => m.dispose());
    ghostMarks = [];
  }

  function addMark(y, x = 0) {
    const s = B().MeshBuilder.CreateSphere('mark' + ghostMarks.length, { diameter: 0.8, segments: 10 }, scene);
    s.position.set(x, y, 0);
    const m = new (B().StandardMaterial)('markMat' + ghostMarks.length, scene);
    m.diffuseColor = B().Color3.FromHexString('#d8402f');
    m.alpha = 0.28;
    m.specularColor = new (B().Color3)(0, 0, 0);
    s.material = m;
    s.isPickable = false;
    ghostMarks.push(s);
  }

  /* ── 배치 자리 ──────────────────────────────── */
  const holders = {};
  function buildPlaceholders() {
    const spec = {
      tower: { x: -1.6, y: 5.5 * M, w: 3.2, h: 11 * M, label: '낙하 장치' },
      apple: { x: 0, y: state.h0 * M, w: 2.6, h: 2.6, label: '사과' },
      timer: { x: 3.6, y: 1.4, w: 3.0, h: 2.6, label: '속도 측정기' },
    };
    Object.entries(spec).forEach(([id, c]) => {
      const p = B().MeshBuilder.CreatePlane('ph_' + id, { width: c.w, height: c.h }, scene);
      p.position.set(c.x, GROUND_Y + c.y, 0.3);
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
  let timerPlaced = false;

  function resetTools() {
    placed = {};
    tools.forEach((t) => { placed[t.id] = false; });
    applyPlacement();
  }
  function placeTool(id) { placed[id] = true; applyPlacement(); }
  function allPlaced() { return tools.every((t) => placed[t.id]); }

  function applyPlacement() {
    tower.setEnabled(!!placed.tower);
    apple.setEnabled(!!placed.apple);
    timerPlaced = !!placed.timer;
    if (pendGroup) pendGroup.setEnabled(state.mode === 'pend' && !!placed.tower && !!placed.apple);
    Object.entries(holders).forEach(([id, h]) => h.setEnabled(!placed[id]));
    reset();
  }

  function dropAt(id, point) {
    const s = slots[id];
    // 세로로 긴 장치라 x 만 맞으면 인정한다
    return Math.abs(point.x - s.x) <= 2.4 ? 'ok' : 'wrong';
  }
  function slotName(id) { return slots[id].name; }

  /* ══ 화면에서 직접 조작 ═══════════════════════
     · 자유 낙하 — 사과를 위아래로 끌어 처음 높이를 정하고, 손을 놓으면 곧바로 떨어진다
     · 진자     — 사과(봅)나 실을 옆으로 끌어 시작 각도를 정하고, 놓으면 흔들리기 시작한다
     · 사과 옆 ＋ / － 로 질량을, 진자 모드에서는 매단 팔 오른쪽 ＋ / － 로 길이까지 바꾼다   */
  let stepMass = null, stepLen = null;
  let drag = null;              // { kind: 'fall' | 'pend', off }
  let onChangeCb = null;        // 조작하면 측정값·그래프를 다시 그리도록

  function buildSteppers() {
    stepMass = LabUI.makeStepper(scene, 'Mass');
    stepLen = LabUI.makeStepper(scene, 'Len');
  }

  /**
   * ＋ / － 단추 자리.
   * 사과 «바로 위»에 두면 높이가 클 때 화면 밖으로 밀려나므로 «옆»으로 비켜 둔다.
   *   자유 낙하 — 사과 오른쪽 (x 1.4 ~ 3.0). 사과(반지름 0.46)와도, 눈금자(x ≤ −0.3)와도 겹치지 않는다
   *   진자     — 매단 팔 오른쪽 위에 위아래로 나란히. 아래가 질량, 위가 진자 길이
   */
  function layoutSteppers() {
    if (!stepMass || !stepLen) return;
    const on = allPlaced();
    if (state.mode === 'pend') {
      stepMass.place(2.3, pivotY() + 1.0, -1.0, 0.8);
      stepLen.place(2.3, pivotY() + 2.4, -1.0, 0.8);   // 질량 단추와 1.4 만큼 떨어진다
    } else {
      stepMass.place(2.2, GROUND_Y + state.h0 * M + 0.46, -1.2, 0.8);
    }
    stepMass.setEnabled(on);
    stepLen.setEnabled(on && state.mode === 'pend');
  }

  /** 3D 에서 값을 바꾸면 아래 조작 막대의 표시도 함께 맞춘다 */
  function syncSlider(id, v, text) {
    const el = document.querySelector('#' + id);
    const out = document.querySelector('#' + id + 'Out');
    if (el) el.value = v;
    if (out) out.textContent = text;
  }

  function hint(text, ok) {
    if (typeof Lab !== 'undefined' && Lab.showHint) Lab.showHint(text, !!ok);
  }

  /** 아래 «실험» 단추의 글씨를 지금 상태에 맞춘다 */
  function setRunBtn(on) {
    const btn = document.querySelector('#runBtn');
    if (!btn) return;
    btn.textContent = on ? RUNNING_LABEL() : RUN_LABEL();
    btn.classList.toggle('run', on);
  }

  /** 셸의 refresh 가 update() 를 다시 부르므로 여기서 update() 를 또 부르지 않는다 */
  function refreshAll() {
    if (onChangeCb) onChangeCb();
    else update();
  }

  /** 화면의 한 점을 사과가 움직이는 평면(z = 0) 위의 세계 좌표로 바꾼다 */
  function pointerOnPlane() {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const plane = B().Plane.FromPositionAndNormal(
      new (B().Vector3)(0, 0, 0), new (B().Vector3)(0, 0, 1));
    const d = ray.intersectsPlane(plane);
    if (d === null) return null;
    return ray.origin.add(ray.direction.scale(d));
  }

  /** 사과의 질량을 0.1 kg 씩 바꾼다 (아래 슬라이더와 같은 범위) */
  function bumpMass(d) {
    const v = Math.max(0.1, Math.min(2.0, +(state.mass + d * 0.1).toFixed(1)));
    if (v === state.mass) return;
    state.mass = v;
    syncSlider('mass', v, `${v.toFixed(1)} kg`);
    reset();                       // 아래 슬라이더와 똑같이 처음 상태로 되돌린다
    setRunBtn(false);
    refreshAll();
    hint(`사과의 질량을 ${v.toFixed(1)} kg 으로 바꿨습니다 — 떨어지는 속력은 그대로일까요?`, true);
  }

  /** 진자의 길이를 0.5 m 씩 바꾼다 (아래 슬라이더와 같은 범위) */
  function bumpLen(d) {
    const v = Math.max(1.5, Math.min(5.0, +(state.pendL + d * 0.5).toFixed(1)));
    if (v === state.pendL) return;
    state.pendL = v;
    syncSlider('pendL', v, `${v.toFixed(1)} m`);
    reset();
    setRunBtn(false);
    refreshAll();
    hint(`진자의 길이를 ${v.toFixed(1)} m 로 바꿨습니다 — 주기가 달라집니다.`, true);
  }

  /** 떨어지던(또는 바닥에 닿은) 사과를 그 자리에서 잡아 다시 매단다 */
  function catchApple() {
    if (sim && (sim.landed || Math.abs(sim.y - state.h0) > 1e-9)) {
      const h = Math.max(1, Math.min(10, Math.round(sim.y * 2) / 2));
      state.h0 = h;
      syncSlider('h0', h, `${h.toFixed(1)} m`);
    }
    lastFrame = 'f' + state.h0;    // 손으로 잡은 시점이므로 카메라는 그대로 둔다
    sim = { t: 0, y: state.h0, v: 0, landed: false, lost: 0, peakV: 0 };
    clearMarks();
    layout();
  }

  const APPLE_RE = /^(appleBody|appleStem|appleLeaf|pendString)/;

  function setupPointer() {
    scene.onPointerObservable.add((pi) => {
      const T = B().PointerEventTypes;
      const mesh = pi.pickInfo && pi.pickInfo.pickedMesh;
      const nm = mesh ? mesh.name : '';

      if (pi.type === T.POINTERDOWN) {
        if (!allPlaced()) return;              // 배치가 끝나기 전에는 조작하지 않는다
        if (nm === 'btnAddMass') { bumpMass(+1); return; }
        if (nm === 'btnSubMass') { bumpMass(-1); return; }
        if (state.mode === 'pend' && nm === 'btnAddLen') { bumpLen(+1); return; }
        if (state.mode === 'pend' && nm === 'btnSubLen') { bumpLen(-1); return; }
        if (!APPLE_RE.test(nm)) return;

        const p0 = pointerOnPlane();
        if (p0 === null) return;
        state.running = false;
        setRunBtn(false);

        if (state.mode === 'pend') {
          if (!pend) return;
          pend.om = 0;                          // 흔들리던 사과를 손으로 붙잡는다
          clearMarks();
          drag = { kind: 'pend', off: Math.atan2(p0.x, pivotY() - p0.y) - pend.th };
          layoutPend();
        } else {
          catchApple();
          // 잡은 순간의 어긋남을 저장해 두어 «잡자마자 튀지» 않게 한다
          drag = { kind: 'fall', off: p0.y - apple.position.y };
        }
        camera.detachControl();
        refreshAll();

      } else if (pi.type === T.POINTERMOVE && drag) {
        const p = pointerOnPlane();
        if (p === null) return;

        if (drag.kind === 'fall') {
          let h = (p.y - drag.off - GROUND_Y - 0.46) / M;
          h = Math.max(1, Math.min(10, Math.round(h * 2) / 2));
          if (h === state.h0) return;
          state.h0 = h;
          lastFrame = 'f' + h;
          sim.y = h; sim.v = 0; sim.lost = 0; sim.peakV = 0; sim.landed = false;
          syncSlider('h0', h, `${h.toFixed(1)} m`);
        } else {
          // 매단 점에서 내려다본 각도 — 아래쪽 수직선이 0°
          const raw = Math.atan2(p.x, pivotY() - p.y) - drag.off;
          const side = raw < 0 ? -1 : 1;
          const deg = Math.max(10, Math.min(75,
            Math.round(Math.abs(raw) * 180 / Math.PI / 5) * 5));
          if (deg === state.theta0 && side === pendSide) return;
          state.theta0 = deg;
          pendSide = side;
          pend.th = side * deg * Math.PI / 180;
          pend.om = 0;
          syncSlider('theta0', deg, `${deg} °`);
        }
        refreshAll();

      } else if (pi.type === T.POINTERUP && drag) {
        const kind = drag.kind;
        drag = null;
        camera.attachControl(canvasEl, true);
        clearMarks();
        // 잡기만 하고 움직이지 않았어도 «지금 잡고 있는 각도»를 시작 각도로 삼는다
        if (kind === 'pend' && pend) {
          const deg = Math.max(10, Math.min(75,
            Math.round(Math.abs(pend.th) * 180 / Math.PI / 5) * 5));
          pendSide = pend.th < 0 ? -1 : 1;
          state.theta0 = deg;
          pend.th = pendSide * deg * Math.PI / 180;
          syncSlider('theta0', deg, `${deg} °`);
        }
        state.running = true;                   // 손을 놓으면 곧바로 시작한다
        setRunBtn(true);
        hint(kind === 'pend'
          ? `${state.theta0}° 에서 손을 놓았습니다 — 최고점의 위치 에너지가 최저점의 운동 에너지로 바뀝니다.`
          : `${state.h0.toFixed(1)} m 에서 손을 놓았습니다 — 떨어지는 동안 두 에너지의 합을 지켜보세요.`,
          true);
        refreshAll();
      }
    });
  }

  /* ══ 물리 ═══════════════════════════════════ */
  let lastFrame = null;      // 마지막으로 잡은 프레이밍 키

  /** 현재 높이 (m) — 진자는 최저점을 기준(0)으로 잡는다 */
  function curH() {
    if (state.mode === 'pend') return pend ? state.pendL * (1 - Math.cos(pend.th)) : 0;
    return sim ? sim.y : 0;
  }
  /** 현재 속력 (m/s) */
  function curV() {
    if (state.mode === 'pend') return pend ? Math.abs(state.pendL * pend.om) : 0;
    return sim ? Math.abs(sim.v) : 0;
  }
  /** 이번 실험의 최고 높이 (m) */
  function maxH() {
    if (state.mode === 'pend') return state.pendL * (1 - Math.cos(state.theta0 * Math.PI / 180));
    return state.h0;
  }
  /** 공기 저항으로 잃은 에너지 (J) */
  function lostE() {
    if (state.mode === 'pend') {
      const e = energies(curH(), curV());
      return Math.max(0, totalAtStart() - e.E);
    }
    return sim ? sim.lost : 0;
  }

  function reset() {
    state.running = false;
    sim = { t: 0, y: state.h0, v: 0, landed: false, lost: 0, peakV: 0 };
    pendSide = 1;
    pend = { th: state.theta0 * Math.PI / 180, om: 0 };
    clearMarks();

    // 모드·크기가 바뀌면 전체가 화면에 들어오도록 프레이밍만 다시 잡는다
    const key = state.mode === 'pend'
      ? `p${state.pendL}` : `f${state.h0}`;
    if (camera && lastFrame !== key) {
      lastFrame = key;
      if (state.mode === 'pend') {
        camera.setTarget(new (B().Vector3)(0, pivotY() * 0.55, 0));
        camera.radius = Math.max(12, state.pendL * M * 2.6);
      } else {
        camera.setTarget(new (B().Vector3)(0.5, GROUND_Y + state.h0 * M * 0.52, 0));
        camera.radius = Math.max(13, state.h0 * M * 1.55);
      }
    }
    if (pendGroup) pendGroup.setEnabled(state.mode === 'pend' && !!placed.tower && !!placed.apple);
    layout();
  }

  function layout() {
    if (state.mode === 'pend') { layoutPend(); return; }
    if (!sim) return;
    apple.position.set(0, GROUND_Y + sim.y * M + 0.46, 0);
    apple.rotation.z = 0;
    if (holders.apple) holders.apple.position.y = GROUND_Y + state.h0 * M;
    layoutSteppers();
  }

  /** 진자 배치 — 피벗·팔·실·봅(사과) */
  function layoutPend() {
    if (!pend || !pendGroup) return;
    const py = pivotY();
    const Ls = state.pendL * M;
    const sx = Math.sin(pend.th), cx = Math.cos(pend.th);

    pendArm.position.set(-0.8, py, 0);
    pendPivot.position.set(0, py, 0);

    pendString.scaling.y = Ls;
    pendString.rotation.z = pend.th;
    pendString.position.set(sx * Ls / 2, py - cx * Ls / 2, 0);

    // 사과가 봅. 실 끝에 매달린다
    apple.position.set(sx * Ls, py - cx * Ls, 0);
    apple.rotation.z = pend.th;
    if (holders.apple) holders.apple.position.y = py - Ls;
    layoutSteppers();
  }

  let markTimer = 0;

  /** 매 프레임 진행. 다시 그려야 하면 true */
  function tick(dt) {
    if (state.mode === 'pend') return tickPend(dt);
    if (!sim || !state.running || sim.landed) return false;

    // 공기 저항은 속력의 제곱에 비례하고 운동 방향과 반대로 작용한다
    const a = state.drag ? -G - DRAG_K * sim.v * Math.abs(sim.v) : -G;
    let step = dt;
    let vNew = sim.v + a * step;
    let yNew = sim.y + (sim.v + vNew) / 2 * step;

    // 지면을 지나쳐 버리면 딱 닿는 순간까지만 진행한다 (착지 속력이 정확해진다)
    if (yNew < 0 && yNew !== sim.y) {
      step *= sim.y / (sim.y - yNew);
      vNew = sim.v + a * step;
      yNew = 0;
    }

    // 공기 저항으로 잃은 에너지 (저항력 × 이동 거리)
    if (state.drag) {
      const fDrag = state.mass * DRAG_K * sim.v * sim.v;
      sim.lost += fDrag * Math.abs(yNew - sim.y);
    }

    sim.v = vNew;
    sim.y = yNew;
    sim.peakV = Math.max(sim.peakV, Math.abs(sim.v));

    // 잔상
    markTimer += dt;
    if (markTimer > 0.12 && ghostMarks.length < 40) {
      markTimer = 0;
      addMark(GROUND_Y + sim.y * M + 0.46);
    }

    if (sim.y <= 0) {
      sim.y = 0; sim.landed = true; state.running = false;
      const btn = document.querySelector('#runBtn');
      if (btn) { btn.textContent = '▶ 떨어뜨리기'; btn.classList.remove('run'); }
    }
    layout();
    return true;
  }

  /** 진자 진행 — 세미 임플리싯 오일러(에너지가 잘 보존된다) + 서브스텝 */
  function tickPend(dt) {
    if (!pend || !state.running) return false;
    const L = state.pendL;
    const k = state.drag ? PEND_K : 0;
    const step = Math.min(dt, 0.05);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const h = step / n;
      const a = -(G / L) * Math.sin(pend.th) - k * pend.om;
      pend.om += a * h;
      pend.th += pend.om * h;
    }

    // 잔상 — 그네가 지나간 자리
    markTimer += step;
    if (markTimer > 0.14 && ghostMarks.length < 40) {
      markTimer = 0;
      const py = pivotY(), Ls = L * M;
      addMark(py - Math.cos(pend.th) * Ls, Math.sin(pend.th) * Ls);
    }

    layoutPend();
    return true;
  }

  function update() {
    if (!sim) reset();
    else layout();
  }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 + 0.24;
    camera.beta = 1.24;
    lastFrame = null;          // 프레이밍을 처음부터 다시 잡게 한다
    reset();
  }

  /* ══ 에너지 ═════════════════════════════════ */
  function energies(y, v) {
    const Ep = state.mass * G * y;
    const Ek = 0.5 * state.mass * v * v;
    return { Ep, Ek, E: Ep + Ek };
  }

  function totalAtStart() { return state.mass * G * maxH(); }

  /* ══ 컨트롤 ═════════════════════════════════ */
  const guide = '화면 속 사과를 끌어 올렸다 손을 놓아 보세요. 위치 에너지와 운동 에너지가 서로 바뀌는 동안 둘의 합이 어떻게 되는지 관찰합니다. «진자» 모드에서는 사과를 옆으로 끌었다 놓으면 전환이 반복됩니다.';
  const prepGuide = '점선으로 표시된 자리에 낙하 장치·사과·속도 측정기를 끌어다 놓아 실험을 준비하세요.';

  const RUN_LABEL = () => state.mode === 'pend' ? '▶ 놓기' : '▶ 떨어뜨리기';
  const RUNNING_LABEL = () => state.mode === 'pend' ? '흔들리는 중' : '낙하 중';

  function controlsHTML() {
    const modeCtl = LabUI.opts('실험 모드', 'mode', [
      { v: 'fall', t: '자유 낙하' },
      { v: 'pend', t: '진자 (52쪽)' },
    ], state.mode, 1);

    const shared = `
      ${LabUI.slider('mass', '질량<br><i>m</i>',
        { min: 0.1, max: 2.0, step: 0.1, value: state.mass, fmt: (v) => `${v.toFixed(1)} kg` })}
      ${LabUI.opts('공기 저항', 'drag', [
        { v: 'off', t: '무시 (이상적)' },
        { v: 'on', t: '있음' },
      ], state.drag ? 'on' : 'off', 1)}
      <div class="control">
        <div class="clabel">실험</div>
        <button class="power${state.running ? ' run' : ''}" id="runBtn">${state.running ? RUNNING_LABEL() : RUN_LABEL()}</button>
      </div>
      <div class="control">
        <div class="clabel">처음<br>상태로</div>
        <button class="power off" id="resetBtn">↻ 되돌리기</button>
      </div>`;

    if (state.mode === 'pend') {
      return `
        ${modeCtl}
        ${LabUI.slider('pendL', '진자 길이<br><i>L</i>',
          { min: 1.5, max: 5.0, step: 0.5, value: state.pendL, fmt: (v) => `${v.toFixed(1)} m` })}
        ${LabUI.slider('theta0', '시작 각도<br><i>θ</i>₀',
          { min: 10, max: 75, step: 5, value: state.theta0, fmt: (v) => `${v} °` })}
        <div class="control">
          <div class="clabel">직접<br>조작</div>
          <div class="cbody"><p class="hands-on">
            사과(또는 실)를 <b>옆으로 끌어</b> 시작 각도를 정하고 <b>손을 놓으면</b> 곧바로 흔들립니다.
            매단 팔 오른쪽의 <b>＋ · －</b> 로 아래는 질량을, 위는 진자 길이를 바꿉니다.
          </p></div>
        </div>
        ${shared}`;
    }
    return `
      ${modeCtl}
      ${LabUI.slider('h0', '처음 높이<br><i>h</i>',
        { min: 1, max: 10, step: 0.5, value: state.h0, fmt: (v) => `${v.toFixed(1)} m` })}
      <div class="control">
        <div class="clabel">직접<br>조작</div>
        <div class="cbody"><p class="hands-on">
          사과를 <b>위아래로 끌어</b> 눈금자를 보며 처음 높이를 정하고,
          <b>손을 놓으면</b> 곧바로 떨어집니다. 사과 옆 <b>＋ · －</b> 로 질량을 바꿉니다.
        </p></div>
      </div>
      ${shared}`;
  }

  function bindControls(root, onChange) {
    onChangeCb = onChange;          // 3D 에서 조작해도 측정값이 갱신되도록
    const after = () => { reset(); onChange(); };

    // 모드 전환 — 컨트롤 자체가 달라지므로 다시 그려서 다시 묶는다
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      state.running = false;
      lastFrame = null;
      reset();
      root.innerHTML = controlsHTML();
      bindControls(root, onChange);
      onChange();
    }));

    if (state.mode === 'pend') {
      LabUI.bindSlider(root, 'pendL', state, 'pendL', (v) => `${v.toFixed(1)} m`, after);
      LabUI.bindSlider(root, 'theta0', state, 'theta0', (v) => `${v} °`, after);
    } else {
      LabUI.bindSlider(root, 'h0', state, 'h0', (v) => `${v.toFixed(1)} m`, after);
    }
    LabUI.bindSlider(root, 'mass', state, 'mass', (v) => `${v.toFixed(1)} kg`, after);

    root.querySelectorAll('[data-drag]').forEach((b) => b.addEventListener('click', () => {
      state.drag = b.dataset.drag === 'on';
      root.querySelectorAll('[data-drag]').forEach((o) => o.classList.toggle('on', o === b));
      after();
    }));

    const run = root.querySelector('#runBtn');
    run.addEventListener('click', () => {
      if (state.mode === 'fall' && sim && sim.landed) reset();
      state.running = !state.running;
      run.textContent = state.running ? RUNNING_LABEL() : RUN_LABEL();
      run.classList.toggle('run', state.running);
      onChange();
    });
    root.querySelector('#resetBtn').addEventListener('click', () => {
      reset();
      run.textContent = RUN_LABEL();
      run.classList.remove('run');
      onChange();
    });
  }

  /* ══ 측정값 ═════════════════════════════════ */
  function readoutHTML() {
    if (!sim) return '';
    const h = curH(), v = curV();
    const e = energies(h, v);
    const E0 = totalAtStart();
    const kept = E0 > 0 ? e.E / E0 * 100 : 100;
    const isPend = state.mode === 'pend';

    // 진자에서는 지금 어디쯤인지 태그로 알려 준다
    let posTag = '';
    if (isPend && pend) {
      const frac = maxH() > 0 ? h / maxH() : 0;
      posTag = frac > 0.85
        ? '<div class="row"><span>지금 위치</span><span class="tag con">최고점 — Ep 최대</span></div>'
        : frac < 0.1
          ? '<div class="row"><span>지금 위치</span><span class="tag des">최저점 — Ek 최대</span></div>'
          : '<div class="row"><span>지금 위치</span><span class="tag mid">전환 중</span></div>';
    }

    return `
      ${isPend ? `<div class="row"><span>진자 각도 <i>θ</i></span>
        <b>${(pend.th * 180 / Math.PI).toFixed(1)} °</b></div>` : ''}
      <div class="row"><span>현재 높이${isPend ? ' (최저점 기준)' : ''}</span><b>${h.toFixed(2)} m</b></div>
      <div class="row"><span>현재 속력</span>
        <b>${timerPlaced ? `${v.toFixed(2)} m/s` : '측정기 없음'}</b></div>
      ${posTag}
      <div class="sec">에너지</div>
      <div class="row"><span>위치 <i>E</i><sub>p</sub> = <i>mgh</i></span>
        <b style="color:#2f8fbf">${e.Ep.toFixed(2)} J</b></div>
      <div class="row"><span>운동 <i>E</i><sub>k</sub> = ½<i>mv</i><sup>2</sup></span>
        <b style="color:#d8802f">${e.Ek.toFixed(2)} J</b></div>
      <div class="row"><span>역학적 에너지</span><b class="big">${e.E.toFixed(2)} J</b></div>
      ${state.drag
        ? `<div class="row"><span>공기 저항 손실</span><b>${lostE().toFixed(2)} J</b></div>
           <div class="row"><span>보존 여부</span><span class="tag mid">줄어듦 (${kept.toFixed(0)}%)</span></div>`
        : `<div class="row"><span>보존 여부</span><span class="tag ok">일정하게 보존</span></div>`}
      <div class="formula"><i>E</i><sub>p</sub> + <i>E</i><sub>k</sub> = <i>mgh</i> + ½<i>mv</i><sup>2</sup> = 일정</div>
      ${isPend ? '<div class="formula" style="color:#62718a">그네처럼 두 에너지가 <b>반복해서 전환</b>됩니다.</div>' : ''}`;
  }

  /* ══ 그래프 (교과서 그림 I-29) ══════════════ */
  const graphTitle = '높이에 따른 에너지 (그림 I-29)';

  function drawGraph(ctx, W, H) {
    ctx.fillStyle = '#0f141b';
    ctx.fillRect(0, 0, W, H);
    if (!sim) return;

    const padL = 34, padR = 12, padT = 20, padB = 24;
    const gw = W - padL - padR, gh = H - padT - padB;
    const E0 = totalAtStart() || 1;
    const hMax = maxH() || 1;

    // 세로축 = 높이, 가로축 = 에너지 (교과서 그림과 같은 배치)
    const yOf = (h) => padT + gh - (h / hMax) * gh;
    const wOf = (E) => (E / E0) * gw;

    // 위치 에너지 : 높이에 비례하는 삼각형
    ctx.fillStyle = 'rgba(74,175,214,.55)';
    ctx.beginPath();
    ctx.moveTo(padL, yOf(0));
    ctx.lineTo(padL, yOf(hMax));
    ctx.lineTo(padL + wOf(E0), yOf(hMax));
    ctx.closePath();
    ctx.fill();

    // 운동 에너지 : 나머지 (공기 저항이 없으면 정확히 보충된다)
    ctx.fillStyle = 'rgba(230,150,60,.55)';
    ctx.beginPath();
    ctx.moveTo(padL, yOf(0));
    ctx.lineTo(padL + wOf(E0), yOf(0));
    ctx.lineTo(padL + wOf(E0), yOf(hMax));
    ctx.closePath();
    ctx.fill();

    // 전체 테두리 = 역학적 에너지 일정선
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(padL, padT, wOf(E0), gh);

    // 현재 위치의 가로선
    const cy = yOf(Math.max(0, Math.min(hMax, curH())));
    const e = energies(curH(), curV());
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(padL, cy); ctx.lineTo(padL + gw, cy); ctx.stroke();

    // 현재 Ep / Ek 막대
    ctx.fillStyle = '#4ab6e0';
    ctx.fillRect(padL, cy - 7, wOf(e.Ep), 6);
    ctx.fillStyle = '#f0a03c';
    ctx.fillRect(padL + wOf(e.Ep), cy - 7, wOf(e.Ek), 6);

    // 축 라벨
    ctx.fillStyle = '#9fb0c2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(`${hMax.toFixed(1)}m`, padL - 4, yOf(hMax));
    ctx.fillText('0', padL - 4, yOf(0));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('높이', 4, padT - 14);
    ctx.textAlign = 'right';
    ctx.fillText('에너지 →', W - 4, padT + gh + 6);

    // 범례
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#4ab6e0'; ctx.fillRect(padL + 4, padT + 4, 9, 9);
    ctx.fillStyle = '#cfe0f2'; ctx.fillText('위치 에너지', padL + 17, padT + 3);
    ctx.fillStyle = '#f0a03c'; ctx.fillRect(padL + 92, padT + 4, 9, 9);
    ctx.fillStyle = '#cfe0f2'; ctx.fillText('운동 에너지', padL + 105, padT + 3);
  }

  function graphFootHTML() {
    if (!sim) return '';
    const e = energies(curH(), curV());
    return `노란 선이 지금 사과의 높이 ·
      <b style="color:#2f8fbf">${e.Ep.toFixed(2)}</b> +
      <b style="color:#d8802f">${e.Ek.toFixed(2)}</b> =
      <b>${e.E.toFixed(2)} J</b>
      ${state.drag ? '(공기 저항으로 줄어드는 중)'
        : state.mode === 'pend' ? '— 노란 선이 오르내려도 합은 같습니다'
          : '— 어느 높이에서나 같습니다'}`;
  }

  /* ══ 기록표 ═════════════════════════════════ */
  const recordColumns = [
    '높이 <i>h</i> (m)', '속력 <i>v</i> (m/s)',
    '<i>E</i><sub>p</sub> (J)', '<i>E</i><sub>k</sub> (J)', '역학적 에너지 (J)',
  ];

  function recordRow() {
    if (!sim) return null;
    const e = energies(curH(), curV());
    return [
      curH().toFixed(2), curV().toFixed(2),
      e.Ep.toFixed(2), e.Ek.toFixed(2), e.E.toFixed(2),
    ];
  }


  /* ══ 탐구 미션 ═══════════════════════════════
     0 낙하 끝까지 · 1 총 에너지 일정 확인(기록 2줄) · 2 공기 저항 손실
     3 진자 모드 실행 · 4 높이 2배 비교                                    */
  const mis = { fell: false, pend: false, dragSeen: false, h0seen: {} };
  const recs = () => ((typeof Lab !== 'undefined' && Lab.getRecords) ? Lab.getRecords() : []);

  function missionDone(i) {
    if (state.mode === 'fall' && state.running && curH() <= 0.06) mis.fell = true;
    if (state.mode === 'pend' && state.running) mis.pend = true;
    if (state.drag && state.running) mis.dragSeen = true;
    if (state.running) mis.h0seen[state.mode === 'fall' ? state.h0.toFixed(1) : 'p' + state.theta0] = true;

    if (i === 0) return mis.fell;
    if (i === 1) {
      const rs = recs().filter((r) => r.length >= 5);
      if (rs.length < 2) return false;
      const E = rs.map((r) => parseFloat(r[4]));
      return Math.max.apply(null, E) - Math.min.apply(null, E) < 0.02;
    }
    if (i === 2) return mis.dragSeen;
    if (i === 3) return mis.pend;
    if (i === 4) return Object.keys(mis.h0seen).length >= 3;
    return false;
  }

  return {
    missionDone,
    id: 'energy',
    title: '역학적 에너지 보존 관찰하기',
    guide, prepGuide, tools,
    create, update, tick, resetCamera,
    placeTool, resetTools, allPlaced, dropAt, slotName,
    controlsHTML, bindControls, readoutHTML,
    graphTitle, drawGraph, graphFootHTML,
    recordColumns, recordRow,
    state, curH, curV, maxH, energies, totalAtStart,
    get pend() { return pend; },
    get scene() { return scene; },
  };
})();
