/**
 * 지능형 과학실 ON «학습 흐름» — 사이드바 통합판
 *
 * 흐름(학습목표·진단·탐구·확인·정리·창의·보고서)을 별도 메뉴 바 없이
 * 우측 사이드바에 녹여 넣는다.
 *   · 학습목표/사전학습/도움말/안전 — 기존 버튼 그대로
 *   · 진단하기 / 창의적으로 생각하기 / 보고서 다운로드 — 버튼 추가
 *   · 퀴즈 버튼 → «확인하기» (기존 5문항 + 오답 시 실험 이동 + 서술형 1문항)
 *   · 정리하기 — 핵심정리 패널 아래에 «나의 탐구 현황»으로 덧붙임
 *   · 탐구하기 소주제 이동 — 상단 실험 탭이 담당
 */
const LabFlow = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const state = {
    diag: { pick: [null, null, null], ok: [false, false, false], retry: [false, false, false] },
    quiz: { pick: [null, null, null, null, null], essay: '' },
    creative: '',
    t0: Date.now(),
  };

  /* ── 진단하기 3문항 (선행 개념) ─────────────────────── */
  const DIAG = [
    { q: '전류가 흐를 때, 도선 속에서 실제로 이동하는 것은 무엇일까요?',
      c: ['도선을 이루는 금속 원자 전체', '전하를 띤 알갱이(전자)', '도선을 감싼 플라스틱 껍질'], a: 1,
      scene: 'wire', cap: '도선 속에서 전하를 띤 알갱이가 줄지어 이동합니다.' },
    { q: '같은 종류의 전하 사이에는 어떤 힘이 작용할까요?',
      c: ['서로 끌어당긴다', '서로 밀어낸다', '아무 힘도 작용하지 않는다'], a: 1,
      scene: 'force', cap: '같은 종류의 전하는 서로 밀어냅니다(척력).' },
    { q: '발광 다이오드(LED)의 특징으로 알맞은 것은?',
      c: ['어느 방향으로 연결해도 똑같이 켜진다', '한쪽 방향으로 연결해야 전류가 흐른다', '전류가 없어도 스스로 빛난다'], a: 1,
      scene: 'led', cap: 'LED는 긴 다리가 + 쪽일 때만 전류가 흘러 빛납니다.' },
  ];

  /** 오답일 때 먼저 보여 주는 개념 장면 (정답은 알려 주지 않는다) */
  function conceptSVG(kind) {
    if (kind === 'wire') {
      return `<svg viewBox="0 0 460 110" style="width:100%;background:#f6f9fd;border:1px solid #dde5f0;border-radius:9px">
        <rect x="20" y="40" width="420" height="30" rx="6" fill="#dbe6f3" stroke="#b9cde6"/>
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${50 + i * 60}" cy="55" r="8" fill="#2f6fd6">
          <animate attributeName="cx" values="${50 + i * 60};${110 + i * 60}" dur="1.1s" repeatCount="indefinite"/></circle>
          <text x="${50 + i * 60}" y="59" font-size="11" fill="#fff" text-anchor="middle" font-weight="700">−
          <animate attributeName="x" values="${50 + i * 60};${110 + i * 60}" dur="1.1s" repeatCount="indefinite"/></text>`).join('')}
        <text x="230" y="95" font-size="12" fill="#41566f" text-anchor="middle">전하를 띤 알갱이가 도선을 따라 이동합니다</text></svg>`;
    }
    if (kind === 'force') {
      return `<svg viewBox="0 0 460 110" style="width:100%;background:#f6f9fd;border:1px solid #dde5f0;border-radius:9px">
        <defs><marker id="fwAr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#d8434e"/></marker></defs>
        <circle cx="170" cy="52" r="20" fill="#d8434e"/><text x="170" y="59" font-size="20" fill="#fff" text-anchor="middle" font-weight="700">+</text>
        <circle cx="290" cy="52" r="20" fill="#d8434e"/><text x="290" y="59" font-size="20" fill="#fff" text-anchor="middle" font-weight="700">+</text>
        <line x1="150" y1="52" x2="90" y2="52" stroke="#d8434e" stroke-width="3" marker-end="url(#fwAr)"/>
        <line x1="310" y1="52" x2="370" y2="52" stroke="#d8434e" stroke-width="3" marker-end="url(#fwAr)"/>
        <text x="230" y="95" font-size="12" fill="#41566f" text-anchor="middle">같은 종류의 전하는 서로 밀어냅니다</text></svg>`;
    }
    /* LED — 닫힌 회로 두 개를 나란히: 왼쪽은 정방향(전류가 흘러 켜짐),
       오른쪽은 LED만 반대로 끼운 같은 회로(전류가 흐르지 않아 꺼짐).
       도선은 전지 사이만 빼고 끊김 없이 이어지고, LED 기호 양끝에
       «+ 긴 다리 / − 짧은 다리»를 표기한다. */
    const loop = (x0, fwd) => {
      const wire = `stroke="#8899ad" stroke-width="4" fill="none" stroke-linecap="round"`;
      // 위 변은 한 번에 그려 끊김이 없게 하고, LED 기호는 그 위에 겹쳐 그린다
      const cur = `M${x0 + 92},105 H${x0 + 22} V30 H${x0 + 198} V105 H${x0 + 128}`; // + 극에서 나와 − 극으로
      const c = fwd ? '#d8434e' : '#9aa7b8';
      // 정방향: 긴 다리(+, 삼각형 쪽)가 왼쪽(전지 + 방향) / 역방향: 긴 다리가 오른쪽
      const tri = fwd
        ? `<polygon points="${x0 + 86},18 ${x0 + 86},42 ${x0 + 110},30" fill="${c}"/>
           <line x1="${x0 + 112}" y1="16" x2="${x0 + 112}" y2="44" stroke="${c}" stroke-width="4.5"/>`
        : `<polygon points="${x0 + 134},18 ${x0 + 134},42 ${x0 + 110},30" fill="${c}"/>
           <line x1="${x0 + 108}" y1="16" x2="${x0 + 108}" y2="44" stroke="${c}" stroke-width="4.5"/>`;
      const legL = fwd ? ['+ 긴 다리', '#d8434e'] : ['− 짧은 다리', '#2f6fd6'];
      const legR = fwd ? ['− 짧은 다리', '#2f6fd6'] : ['+ 긴 다리', '#d8434e'];
      return `
        <path d="${cur}" ${wire}/>
        <line x1="${x0 + 98}" y1="86" x2="${x0 + 98}" y2="124" stroke="#41566f" stroke-width="3"/>
        <line x1="${x0 + 116}" y1="96" x2="${x0 + 116}" y2="114" stroke="#41566f" stroke-width="7"/>
        <text x="${x0 + 88}" y="134" font-size="13" fill="#d8434e" text-anchor="end" font-weight="800">+</text>
        <text x="${x0 + 128}" y="134" font-size="13" fill="#2f6fd6" font-weight="800">−</text>
        ${fwd ? `<circle cx="${x0 + 99}" cy="30" r="22" fill="#f5a623" opacity=".25">
             <animate attributeName="r" values="18;25;18" dur="1.4s" repeatCount="indefinite"/></circle>` : ''}
        ${tri}
        <text x="${x0 + 82}" y="12" font-size="10.5" fill="${legL[1]}" text-anchor="end" font-weight="800">${legL[0]}</text>
        <text x="${x0 + 138}" y="12" font-size="10.5" fill="${legR[1]}" font-weight="800">${legR[0]}</text>
        ${fwd ? [0, 1, 2, 3].map((i) => `<circle r="4.5" fill="#2f6fd6">
             <animateMotion dur="2.6s" begin="${-i * 0.65}s" repeatCount="indefinite" path="${cur}"/></circle>`).join('') : ''}`;
    };
    return `<svg viewBox="0 0 460 164" style="width:100%;background:#f6f9fd;border:1px solid #dde5f0;border-radius:9px">
      ${loop(5, true)}${loop(235, false)}
      <text x="115" y="156" font-size="12" fill="#2e9e5b" text-anchor="middle" font-weight="700">전류가 흐른다 → 켜짐</text>
      <text x="345" y="156" font-size="12" fill="#8a97a8" text-anchor="middle" font-weight="700">전류가 흐르지 않는다 → 꺼짐</text></svg>`;
  }

  /* ── 확인하기 — 기존 퀴즈 5문항 + 문항별 이동 안내·교과서 그림 ── */
  const CHECK_META = [
    { exp: 'circuit', img: 'capx-circuit', fb: '① 충전과 방전 화면에서 스위치를 A(충전)로 두고, 전하가 어디에 멈추어 쌓이는지 다시 관찰해 보세요.' },
    { exp: 'circuit', img: 'capx-led', fb: '① 충전과 방전 화면에서 방전을 슬로 모션으로 다시 보세요. 판에 있던 전하가 어디로 갔나요?' },
    { exp: 'struct', img: 'capx-roll', fb: '② 축전기의 구조 조립 미션에서 게이지가 2배가 되었을 때 무엇을 바꾸었는지 떠올려 보세요.' },
    { exp: 'devices', img: 'capx-table', fb: '③ 생활 속 축전기의 원리 분류 게임에서 네 기기를 두 선반에 다시 나눠 보세요.' },
    { exp: 'devices', img: 'capx-touch', fb: '③ 터치스크린 점검에서 손가락과 지우개로 화면을 눌러 보고 무엇이 다른지 확인해 보세요.' },
  ];
  let CHECK = [];   // init에서 LabContent.quiz + CHECK_META 로 구성

  /** 내장 교과서 그림 (thumbs-data) → figure. 없으면 빈 문자열 */
  function thumb(key, cap) {
    const src = (typeof window !== 'undefined' && window.THUMB_DATA) ? window.THUMB_DATA[key] : null;
    return src ? `<figure class="fx-fig"><img src="${src}" alt="${cap}"><figcaption>${cap}</figcaption></figure>` : '';
  }
  const figs = (inner) => (inner ? `<div class="fx-figs">${inner}</div>` : '');

  /** 진행바 한 줄 */
  function bar(label, val, max, extra = '') {
    const pct = Math.max(0, Math.min(100, Math.round((val / max) * 100)));
    return `<div class="wl"><span class="wl-t">${label}</span>
      <div class="wl-bar"><i style="width:${pct}%"></i></div>
      <span class="wl-v">${val} / ${max}${extra}</span></div>`;
  }

  const ESSAY_KEYS = [
    ['접촉 지점', /접촉|닿|누른|그 자리|그 지점|위치/],
    ['전하 변화', /전하|전자/],
    ['센서 감지', /감지|알아|인식|신호|찾/],
  ];

  const diagDone = () => state.diag.pick.every((p, i) => p !== null && (state.diag.ok[i] || state.diag.retry[i]));
  const checkDone = () => state.quiz.pick.every((p) => p !== null);
  const quizScore = () => CHECK.filter((q, i) => state.quiz.pick[i] === q.answer).length;

  function switchExp(exp) {
    const b = $(`.top-tabs button[data-exp="${exp}"]`);
    if (b) b.click();
  }

  /* ── 모달 (공용 학습 패널 modal 재사용) ─────────────── */
  function openView(id) {
    const body = $('#panelBody');
    if (id === 'diag') { body.innerHTML = renderDiag(); bindDiag(); }
    else if (id === 'check') { body.innerHTML = renderCheck(); bindCheck(); }
    else if (id === 'creative') { body.innerHTML = renderCreative(); bindCreative(); }
    $('#panelModal').classList.remove('hidden');
  }
  function closeView() { $('#panelModal').classList.add('hidden'); paintBadges(); }

  /* ── 진단하기 ──────────────────────────────────────── */
  function renderDiag() {
    const d = state.diag;
    const idx = d.pick.findIndex((v, i) => !(v !== null && (d.ok[i] || d.retry[i])));
    const cur = idx === -1 ? 3 : idx;

    let block;
    if (cur === 3) {
      const nOk = d.ok.filter(Boolean).length;
      block = `<div class="quiz-result o">
          진단을 마쳤습니다 — 맞힌 문항 <b>${nOk} / 3</b>.<br>
          ${nOk === 3 ? '선행 개념이 잘 잡혀 있어요. 바로 작업대로 가 봅시다.'
                      : '헷갈린 개념은 ① 충전과 방전 실험에서 직접 확인할 수 있습니다.'}
        </div>
        <div class="quiz-actions">
          <button class="primary" id="fdStart">탐구 시작하기 →</button>
          <button id="fdRetryAll">진단 다시 하기</button>
        </div>`;
    } else {
      const Q = DIAG[cur];
      const picked = d.pick[cur];
      const showScene = picked !== null && !d.ok[cur] && !d.retry[cur];
      block = `
        <p class="src">진단 ${cur + 1} / 3 · ${['전하 개념', '전기력', '다이오드'][cur]}</p>
        <h3 style="margin-top:6px">${Q.q}</h3>
        <div id="fdOpts">${Q.c.map((c, j) =>
          `<button class="quiz-opt ${picked === j ? (d.ok[cur] ? 'right' : 'wrong') : ''}" data-fd="${j}"
             ${picked !== null && (d.ok[cur] || d.retry[cur]) ? 'disabled' : ''}>${j + 1}. ${c}</button>`).join('')}</div>
        ${showScene ? `<div class="quiz-result x">정답을 바로 알려 주지 않을게요. 아래 장면을 먼저 보고
            <b>한 번 더</b> 골라 보세요.<span id="fdCd" style="font-weight:800"></span></div>${conceptSVG(Q.scene)}` : ''}
        ${d.ok[cur] ? `<div class="quiz-result o">맞았어요! ${Q.cap}</div>
          <div class="quiz-actions"><button class="primary" id="fdNext">다음 문항 →</button></div>` : ''}
        ${d.retry[cur] && !d.ok[cur] ? `<div class="quiz-result x">${Q.cap}<br>① 충전과 방전 실험에서 이 부분을 다시 확인해 봅시다.</div>
          <div class="quiz-actions"><button class="primary" id="fdNext">다음 문항 →</button></div>` : ''}`;
    }
    return `<h2>진단하기</h2>
      <p class="src">본 학습 전, 알고 있는 것을 확인합니다 — 틀려도 괜찮아요.</p>${block}`;
  }
  function bindDiag() {
    const d = state.diag;
    const idx = d.pick.findIndex((v, i) => !(v !== null && (d.ok[i] || d.retry[i])));
    const cur = idx === -1 ? 3 : idx;
    const st = $('#fdStart');
    if (st) st.onclick = () => { closeView(); switchExp('circuit'); };
    const ra = $('#fdRetryAll');
    if (ra) ra.onclick = () => {
      state.diag = { pick: [null, null, null], ok: [false, false, false], retry: [false, false, false] };
      openView('diag');
    };
    const nx = $('#fdNext');
    if (nx) nx.onclick = () => openView('diag');
    $$('#fdOpts [data-fd]').forEach((el) => {
      el.onclick = () => {
        const j = +el.dataset.fd, Q = DIAG[cur];
        if (d.pick[cur] !== null) {           // 재도전
          d.retry[cur] = true;
          d.ok[cur] = (j === Q.a);
          d.pick[cur] = j;
          openView('diag');
          return;
        }
        d.pick[cur] = j;
        d.ok[cur] = (j === Q.a);
        if (d.ok[cur]) d.retry[cur] = true;
        openView('diag');
        if (!d.ok[cur]) {                     // 오답 — 장면을 5초 본 뒤 재선택
          $$('#fdOpts [data-fd]').forEach((b) => b.setAttribute('disabled', ''));
          let s = 5;
          const cd = $('#fdCd');
          if (cd) cd.textContent = ' (5초 뒤 다시 선택할 수 있어요)';
          const t = setInterval(() => {
            s -= 1;
            const cd2 = $('#fdCd');
            if (cd2) cd2.textContent = s > 0 ? ` (${s}초 뒤 다시 선택할 수 있어요)` : '';
            if (s <= 0) {
              clearInterval(t);
              $$('#fdOpts [data-fd]').forEach((b) => b.removeAttribute('disabled'));
            }
          }, 1000);
        }
      };
    });
  }

  /* ── 확인하기 (선택형 5 + 서술형 1) ─────────────────── */
  function renderCheck() {
    const q = state.quiz;
    return `<h2>확인하기</h2>
      <p class="src">형성평가 — 선택형 5문항 + 서술형 1문항. 오답이어도 정답을 바로 알려 주지 않습니다.</p>
      ${CHECK.map((Q, i) => `
        <h3>${i + 1}. ${Q.q}</h3>
        <div>${Q.opts.map((c, j) =>
          `<button class="quiz-opt ${q.pick[i] === j ? (j === Q.answer ? 'right' : 'wrong') : ''}"
             data-fq="${i}" data-fj="${j}">${j + 1}. ${c}</button>`).join('')}</div>
        ${q.pick[i] !== null && q.pick[i] !== Q.answer ? `<div class="quiz-result x">${Q.fb}
            ${figs(thumb(Q.img, '교과서 그림 다시 보기'))}
            <div class="quiz-actions" style="margin-top:8px">
              <button data-fgo="${Q.exp}">그 실험 화면으로 가기 →</button></div></div>` : ''}
        ${q.pick[i] === Q.answer ? `<div class="quiz-result o">맞았어요. ${Q.why}</div>` : ''}`).join('')}
      <h3>6. 전기 용량식 터치스크린이 손가락이 닿은 위치를 알아내는 과정을 ‘전하’라는 낱말을 사용하여 서술하시오.</h3>
      <textarea id="fqEssay" style="width:100%;min-height:90px;border:1px solid var(--line);border-radius:9px;
        padding:10px 12px;font-size:14px;font-family:inherit;resize:vertical"
        placeholder="예: 손가락이 화면에 닿으면 그 지점의 전하가 손가락 쪽으로 빠져나가 전하량이 줄어들고, 센서가 전하량이 변한 자리를 찾아 위치를 알아낸다.">${esc(q.essay)}</textarea>
      <p id="fqEssayFb" style="font-size:13px;margin-top:6px;color:#62718a"></p>
      <div class="quiz-result ${quizScore() === CHECK.length ? 'o' : 'x'}" style="margin-top:10px">
        선택형 점수 <b>${quizScore()} / ${CHECK.length}</b> · 서술형은 점수화하지 않고 핵심어만 확인합니다.</div>`;
  }
  function bindCheck() {
    $$('#panelBody [data-fq]').forEach((el) => {
      el.onclick = () => {
        state.quiz.pick[+el.dataset.fq] = +el.dataset.fj;
        openView('check');
      };
    });
    $$('#panelBody [data-fgo]').forEach((el) => {
      el.onclick = () => { closeView(); switchExp(el.dataset.fgo); };
    });
    const ta = $('#fqEssay');
    const fb = $('#fqEssayFb');
    const renderFb = () => {
      const hits = ESSAY_KEYS.map((k) => k[1].test(state.quiz.essay));
      fb.innerHTML = state.quiz.essay.length < 8 ? '' :
        '핵심어 확인 — ' + ESSAY_KEYS.map((k, i) =>
          `<b style="color:${hits[i] ? '#2f9e6b' : '#9aa7b8'}">${hits[i] ? '✓' : '○'} ${k[0]}</b>`).join(' · ') +
        (hits.every(Boolean) ? '<br>세 가지가 모두 들어 있어요. 잘 서술했습니다.'
          : '<br>빠진 것이 있다면 ③ 생활 속 축전기의 터치스크린 점검 장면을 다시 보고 덧붙여 볼까요? (통과/미통과를 표시하지 않습니다)');
    };
    if (ta) {
      ta.oninput = () => { state.quiz.essay = ta.value; renderFb(); };
      renderFb();
    }
  }

  /* ── 나의 탐구 현황(진행바) — 핵심정리 패널 아래에 덧붙임 ── */
  function wrapExtraHTML() {
    const sortOk = (typeof DeviceScene !== 'undefined') ? DeviceScene.sortScore() : 0;
    const round = (typeof StructScene !== 'undefined') ? StructScene.state.round : 1;
    const stage = (typeof StructScene !== 'undefined') ? StructScene.state.stage : 0;
    const dAns = state.diag.pick.filter((p) => p !== null).length;
    const qAns = state.quiz.pick.filter((p) => p !== null).length;
    return `<h3>교과서 그림 다시 보기</h3>
      ${figs(thumb('capx-roll', '원통형 축전기의 구조 (83쪽)') + thumb('capx-table', '생활 속 축전기 기기 (84쪽)'))}
      <h3>나의 탐구 현황</h3>
      ${bar('진단하기', dAns, 3, diagDone() ? ` · 정답 ${state.diag.ok.filter(Boolean).length}` : '')}
      ${bar('② 분해 관찰', stage + 1, 5, ' 단계')}
      ${bar('② 조립 라운드', Math.min(round - 1, 3), 3, round === 4 ? ' 🏅' : '')}
      ${bar('③ 원리 분류', sortOk, 4, sortOk === 4 ? ' 🏅' : '')}
      ${bar('확인하기', qAns, CHECK.length, checkDone() ? ` · 정답 ${quizScore()}` : '')}
      <p style="margin-top:10px">아직 못 해 본 활동이 있다면 위쪽 실험 탭(①·②·③)으로 돌아가 이어서 해 보세요.
      마치면 <b>창의적으로 생각하기</b>와 <b>보고서 다운로드</b>로 정리합니다.</p>`;
  }

  /* ── 창의적으로 생각하기 ───────────────────────────── */
  function renderCreative() {
    return `<h2>창의적으로 생각하기</h2>
      <p class="src">교과서 85쪽 창의 융합 활동 연계</p>
      <h3>알루미늄 포일과 종이만으로 나만의 축전기를 만든다면 어떻게 만들까요?<br>
          더 많은 전하를 저장하려면 무엇을 바꾸면 좋을까요?</h3>
      <textarea id="fcText" style="width:100%;min-height:130px;border:1px solid var(--line);border-radius:9px;
        padding:10px 12px;font-size:14px;font-family:inherit;resize:vertical"
        placeholder="예: 알루미늄 포일 두 장 사이에 얇은 종이 한 장을 끼우고 돌돌 말아서 만든다. 종이를 더 얇게 하면 간격이 좁아지고, 포일을 더 길게 하면 면적이 넓어져 더 많은 전하를 저장할 수 있다.">${esc(state.creative)}</textarea>
      <p style="font-size:13px;color:#62718a;margin-top:6px">쓴 내용은 «보고서 다운로드»에 함께 담깁니다.</p>`;
  }
  function bindCreative() {
    const ta = $('#fcText');
    if (ta) ta.oninput = () => { state.creative = ta.value; };
  }

  /* ── 보고서 양식 다운로드 ──────────────────────────── */
  function downloadReport() {
    const C = (typeof CircuitScene !== 'undefined') ? CircuitScene : null;
    const S = (typeof StructScene !== 'undefined') ? StructScene : null;
    const D = (typeof DeviceScene !== 'undefined') ? DeviceScene : null;
    const mins = Math.max(1, Math.round((Date.now() - state.t0) / 60000));
    const row = (a, b) => `<tr><th>${a}</th><td>${esc(String(b ?? '')) || '—'}</td></tr>`;
    const DEV_NAME = { aed: '자동 심장 충격기', flash: '카메라 플래시', touch: '터치스크린', humid: '습도 센서' };
    const shelfName = { cd: '충전·방전 이용', qc: '전하량 변화 이용', 0: '미분류' };

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>축전기의 원리와 활용 — 활동 보고서</title><style>
body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#12233d;line-height:1.7}
h1{font-size:22px;border-bottom:3px solid #1a4fa0;padding-bottom:10px}
h2{font-size:17px;margin-top:28px;color:#1a4fa0;border-left:5px solid #1a4fa0;padding-left:9px}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:14px}
th,td{border:1px solid #c8d4e2;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#eef4fb;width:200px;color:#1a4fa0}
.meta{font-size:13px;color:#5a6c82}
</style></head><body>
<h1>축전기의 원리와 활용 — 활동 보고서</h1>
<p class="meta">축전기 서비스 센터 · 지능형 과학실 ON · 작성일 ${new Date().toLocaleDateString('ko-KR')}<br>
학교 __________ 학년 ____ 반 ____ 이름 __________</p>
<table>${row('총 학습 시간', '약 ' + mins + '분')}</table>

<h2>진단하기 (선행 개념)</h2>
<table>${DIAG.map((Q, i) => row('진단 ' + (i + 1) + ' · ' + ['전하 개념', '전기력', '다이오드'][i],
      state.diag.pick[i] === null ? '미응답' : (state.diag.ok[i] ? '정답' : '오답 → 장면 확인 후 재도전'))).join('')}</table>

<h2>탐구하기 ① 충전과 방전 — 회로 관찰</h2>
<table>
${row('마지막 실험 조건', C ? `전압 ${C.state.volt}V · 용량 ${C.state.cap}μF · τ=RC=${C.tauChg().toFixed(1)}s` : '—')}
${row('판의 전하 기호', C ? C.chargeCount() + '개 (Q=CV에 비례)' : '—')}
${row('스위치 · LED', C ? `${{ chg: 'A 충전', open: '열림', dis: 'B 방전' }[C.state.sw]} · LED ${C.state.ledDir > 0 ? '정방향' : '거꾸로'}` : '—')}
</table>

<h2>탐구하기 ② 축전기의 구조 — 분해 · 조립</h2>
<table>
${row('분해 단계', S ? (S.state.stage + 1) + ' / 5' : '—')}
${row('조립 조건', S ? `간격 ${S.state.gapMm.toFixed(1)}mm · 면적 ${S.state.areaCm2}cm² · ${S.state.rolled ? '원통형으로 말기' : '평행판'}` : '—')}
${row('충전되는 전하량(상대값)', S ? S.chargeRel() + ' (기준 100)' : '—')}
${row('라운드 진행', S ? (S.state.round === 4 ? '3라운드 모두 통과 🏅' : '라운드 ' + S.state.round + ' 진행 중') : '—')}
</table>

<h2>탐구하기 ③ 생활 속 축전기 — 기기 점검 · 분류</h2>
<table>
${row('충전·방전 기기 사용', D ? D.state.shots + '회 방전' : '—')}
${row('터치스크린 입력', D ? (D.state.dialed || '입력 전') : '—')}
${row('습도 센서', D ? `습도 ${D.state.humid.toFixed(0)}% → 전하량 ${D.humidCharge()}(상대값)` : '—')}
</table>
<table><tr><th>기기</th><th>내가 놓은 선반</th><th>정오</th></tr>
${D ? ['aed', 'flash', 'touch', 'humid'].map((k) => {
      const p = D.state.sorted[k];
      return `<tr><td>${DEV_NAME[k]}</td><td>${shelfName[p] || '미분류'}</td>
        <td>${p ? (p === D.ANSWER[k] ? '○' : '✕') : '—'}</td></tr>`;
    }).join('') : ''}</table>
${D && D.sortScore() === 4 ? '<p><b>정식 엔지니어 인증서 획득 🏅</b></p>' : ''}

<h2>확인하기 (형성평가)</h2>
<table>${CHECK.map((Q, i) => row('문항 ' + (i + 1),
      state.quiz.pick[i] === null ? '미응답' : (state.quiz.pick[i] === Q.answer ? '정답' : '오답 → 실험 재확인 필요'))).join('')}
${row('서술형 (터치스크린 위치 감지)', state.quiz.essay)}</table>

<h2>창의적으로 생각하기</h2>
<table>${row('나만의 축전기 설계', state.creative)}</table>
</body></html>`;

    const blob = new Blob(['﻿' + html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `축전기_활동보고서_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof Lab !== 'undefined') Lab.showHint('활동 보고서를 내려받았습니다 — 인쇄에서 PDF로 저장할 수 있어요.', true);
  }

  /* ── 사이드바 구성 ─────────────────────────────────── */
  const ICONS = {
    diag: `<svg viewBox="0 0 24 24" fill="none" stroke="#8a97a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="4" width="14" height="17" rx="2"/>
      <path d="M9 4h6v3H9z" fill="#8a97a8" stroke="none"/>
      <path d="M8.5 14l2.5 2.5 4.5-5.5"/></svg>`,
    creative: `<svg viewBox="0 0 24 24" fill="none" stroke="#8a97a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3a6 6 0 0 0-3.4 10.9c.7.5 1.1 1.3 1.1 2.1h4.6c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/>
      <path d="M10 19h4M10.8 21.5h2.4"/></svg>`,
    report: `<svg viewBox="0 0 24 24" fill="none" stroke="#8a97a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>
      <path d="M12 10v6M9.5 13.5L12 16l2.5-2.5"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="#8a97a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9"/></svg>`,
  };

  function sbButton(id, label) {
    const b = document.createElement('button');
    b.className = 'sb-flow';
    b.dataset.flow = id;
    b.title = label;
    b.innerHTML = `${ICONS[id]}<span class="sb-label">${label}</span><span class="sb-done hidden">✓</span>`;
    return b;
  }

  function paintBadges() {
    const set = (id, done) => {
      const b = $(`.sidebar [data-flow="${id}"] .sb-done`);
      if (b) b.classList.toggle('hidden', !done);
    };
    set('diag', diagDone());
    set('check', checkDone());
    set('creative', state.creative.trim().length >= 10);
  }

  function injectSidebar() {
    const sb = $('.sidebar');
    if (!sb) return;

    // ① 진단하기 — 사전학습 뒤
    const bDiag = sbButton('diag', '진단하기');
    bDiag.addEventListener('click', () => openView('diag'));
    sb.querySelector('[data-panel="pre"]').after(bDiag);

    // ② 퀴즈 버튼 → 확인하기: 아이콘·라벨 교체 + 셸이 퀴즈를 그린 직후 내용을 통합판으로 교체
    const bQuiz = sb.querySelector('[data-panel="quiz"]');
    bQuiz.classList.add('sb-flow');
    bQuiz.dataset.flow = 'check';
    bQuiz.title = '확인하기';
    bQuiz.innerHTML = `${ICONS.check}<span class="sb-label">확인하기</span><span class="sb-done hidden">✓</span>`;
    bQuiz.addEventListener('click', () => openView('check'));   // 셸 리스너 뒤에 실행 → 덮어쓴다

    // ③ 창의 · 보고서 — 확인하기 뒤
    const bCre = sbButton('creative', '창의');
    bCre.addEventListener('click', () => openView('creative'));
    bQuiz.after(bCre);
    const bRep = sbButton('report', '보고서');
    bRep.addEventListener('click', downloadReport);
    bCre.after(bRep);

    // ④ 핵심정리 — 셸이 content.summary 를 그린 뒤 그림·진행바를 덧붙인다
    sb.querySelector('[data-panel="summary"]').addEventListener('click', () => {
      const body = $('#panelBody');
      if (body) body.insertAdjacentHTML('beforeend', wrapExtraHTML());
    });

    // ⑤ 사전학습 — 글 아래에 교과서 그림을 덧붙여 이해를 돕는다
    sb.querySelector('[data-panel="pre"]').addEventListener('click', () => {
      const body = $('#panelBody');
      if (body) body.insertAdjacentHTML('beforeend',
        `<h3>교과서 그림 미리 보기</h3>
         ${figs(thumb('capx-circuit', '축전기 충전 회로 — 해 보기 (82쪽)')
              + thumb('capx-led', 'LED 로 방전 확인 — 해 보기 (82쪽)'))}`);
    });

    $('#panelClose').addEventListener('click', paintBadges);
  }

  /* ── 초기화 ────────────────────────────────────────── */
  function init() {
    if (!$('.sidebar') || typeof LabContent === 'undefined') return;
    CHECK = LabContent.quiz.map((q, i) => ({ ...q, ...CHECK_META[i] }));
    injectSidebar();
    paintBadges();
  }

  return { init, openView, state, downloadReport };
})();

LabFlow.init();
