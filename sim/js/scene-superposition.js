/**
 * 탭 1 - 파동의 중첩과 간섭
 * 교과서 p.124 해보기(두 파동의 중첩 현상 관찰하기) / p.125 그림 III-1, III-2
 *
 * 서로 반대 방향으로 진행하는 두 파동이 만나 중첩되고(y = y1 + y2),
 * 지나간 뒤에는 원래 모양으로 되돌아가는 '파동의 독립성'을 보여 준다.
 *
 * 그림 III-2 처럼 파동 1 / 파동 2 / 합성파를 위아래로 나란히 두어
 * 합성파의 진폭을 바로 비교할 수 있게 배치한다.
 */
const SuperpositionScene = (() => {
  const B = () => BABYLON;

  const N = 240;
  const X_MIN = -12, X_MAX = 12;
  const SPEED = 4.2;        // unit / s
  const START_OFFSET = 9;   // 두 파동의 처음 위치
  const PULSE_W = 1.5;

  const Y_W1 = 3.4, Y_W2 = -3.4, Y_SUM = 0;   // 각 파동이 놓이는 높이

  let scene, camera;
  let ropeSum, ropeW1, ropeW2;
  let t = 0;
  let running = false;
  let params = { amp1: 1, amp2: 1, phase: 'same' };

  function create(engine, canvas) {
    scene = new (B().Scene)(engine);
    scene.clearColor = B().Color4.FromHexString('#0d1520ff');

    camera = new (B().ArcRotateCamera)(
      'cam2', -Math.PI / 2 - 0.05, 1.48, 16, new (B().Vector3)(-0.8, 0, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 13;
    camera.upperRadiusLimit = 44;
    camera.wheelDeltaPercentage = 0.02;

    const hemi = new (B().HemisphericLight)('hemi2', new (B().Vector3)(0.1, 1, -0.5), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new (B().Color3)(0.18, 0.22, 0.28);

    const glow = new (B().GlowLayer)('glow2', scene);
    glow.intensity = 0.45;

    ropeW1 = buildRope('ropeW1', Y_W1, '#ff5a5a', false);
    ropeW2 = buildRope('ropeW2', Y_W2, '#4fd08a', false);
    ropeSum = buildRope('ropeSum', Y_SUM, '#63b7ff', true);

    [[Y_W1, '파동 1', '#ff5a5a'],
     [Y_W2, '파동 2', '#4fd08a'],
     [Y_SUM, '합성파', '#63b7ff']].forEach(([y, text, hex], i) => {
      buildAxis(y, i);
      buildLabel(text, hex, y, i);
    });

    scene.onBeforeRenderObservable.add(() => {
      if (running) {
        t += engine.getDeltaTime() / 1000;
        if (SPEED * t > START_OFFSET + X_MAX) running = false;
      }
      redraw();
    });

    return scene;
  }

  /** 평형 위치(변위 = 0)를 나타내는 기준선 */
  function buildAxis(y, i) {
    const line = B().MeshBuilder.CreateBox('axis' + i, {
      width: X_MAX - X_MIN, height: 0.035, depth: 0.035,
    }, scene);
    line.position.set(0, y, 0);
    const m = new (B().StandardMaterial)('axisMat' + i, scene);
    m.diffuseColor = new (B().Color3)(0.32, 0.39, 0.48);
    m.emissiveColor = new (B().Color3)(0.16, 0.2, 0.26);
    line.material = m;
  }

  function buildLabel(text, hex, y, i) {
    const plane = B().MeshBuilder.CreatePlane('label' + i, { width: 3.4, height: 1.05 }, scene);
    plane.position.set(X_MIN - 2.4, y, 0);

    const tex = new (B().DynamicTexture)('labelTex' + i, { width: 340, height: 105 }, scene, true);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 340, 105);
    ctx.fillStyle = hex;
    ctx.font = 'bold 62px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 332, 56);
    tex.hasAlpha = true;
    tex.update();

    const m = new (B().StandardMaterial)('labelMat' + i, scene);
    m.diffuseTexture = tex;
    m.emissiveTexture = tex;
    m.opacityTexture = tex;
    m.emissiveColor = new (B().Color3)(1, 1, 1);
    m.specularColor = new (B().Color3)(0, 0, 0);
    m.backFaceCulling = false;
    plane.material = m;
  }

  function buildRope(name, baseY, hex, isMain) {
    const path = [];
    for (let i = 0; i < N; i++) {
      path.push(new (B().Vector3)(X_MIN + (X_MAX - X_MIN) * i / (N - 1), baseY, 0));
    }
    const tube = B().MeshBuilder.CreateTube(name, {
      path, radius: isMain ? 0.18 : 0.13, tessellation: 12, updatable: true,
    }, scene);

    const m = new (B().StandardMaterial)(name + 'Mat', scene);
    const c = B().Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(isMain ? 0.45 : 0.32);
    m.specularColor = new (B().Color3)(0.45, 0.45, 0.45);
    tube.material = m;

    tube._path = path;
    tube._baseY = baseY;
    return tube;
  }

  function pulse(x, center, amp) {
    const u = (x - center) / PULSE_W;
    return amp * Math.exp(-u * u);
  }

  function displacements(x) {
    const c1 = -START_OFFSET + SPEED * t;   // 오른쪽으로 진행
    const c2 = START_OFFSET - SPEED * t;    // 왼쪽으로 진행
    const sign = params.phase === 'same' ? 1 : -1;
    return [pulse(x, c1, params.amp1), pulse(x, c2, params.amp2 * sign)];
  }

  function redraw() {
    updateTube(ropeW1, (x) => displacements(x)[0]);
    updateTube(ropeW2, (x) => displacements(x)[1]);
    updateTube(ropeSum, (x) => { const [a, b] = displacements(x); return a + b; });
  }

  function updateTube(tube, fn) {
    const path = tube._path;
    for (let i = 0; i < N; i++) {
      const x = X_MIN + (X_MAX - X_MIN) * i / (N - 1);
      path[i].x = x;
      path[i].y = tube._baseY + fn(x);
      path[i].z = 0;
    }
    B().MeshBuilder.CreateTube(tube.name, { path, instance: tube }, scene);
  }

  /** 그래프 패널에 넘겨 줄 표본 */
  function sample(nPoints) {
    const out = [];
    for (let i = 0; i < nPoints; i++) {
      const x = X_MIN + (X_MAX - X_MIN) * i / (nPoints - 1);
      const [y1, y2] = displacements(x);
      out.push({ x, y1, y2, sum: y1 + y2 });
    }
    return out;
  }

  /** 현재 합성파의 최대 변위 */
  function peakDisplacement() {
    let max = 0;
    for (let i = 0; i < 400; i++) {
      const x = X_MIN + (X_MAX - X_MIN) * i / 399;
      const [y1, y2] = displacements(x);
      max = Math.max(max, Math.abs(y1 + y2));
    }
    return max;
  }

  function update(p) { params = p; }
  function start() { t = 0; running = true; }
  /** 특정 시점으로 이동 */
  function seek(v) { t = v; running = false; }
  /** 두 파동이 정확히 겹치는 시각 */
  function meetTime() { return START_OFFSET / SPEED; }
  function togglePause() { running = !running; return running; }
  function isRunning() { return running; }

  function resetCamera() {
    if (!camera) return;
    camera.alpha = -Math.PI / 2 - 0.05;
    camera.beta = 1.48;
    camera.radius = 16;
    camera.setTarget(new (B().Vector3)(-0.8, 0, 0));
  }

  return {
    create, update, start, seek, meetTime, togglePause, isRunning, resetCamera,
    sample, peakDisplacement,
    get scene() { return scene; },
    get time() { return t; },
  };
})();
