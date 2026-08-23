/**
 * 안내 캐릭터 「디로」 말풍선 — 스토리보드 ⓕ 영역 구현
 *
 * 기획서 Ⅳ장 4항 : "ⓕ 디로 말풍선 — 하단 중앙, on/off 토글 제공"
 * 기획서 Ⅸ장 2항 : "자막 상시 제공 및 디로 말풍선 on/off"
 * 기획서 Ⅳ장 1항 : "각 단계 진입 시 의뢰 내용을 안내하고, 회로 연결 오류·극성 실수·
 *                   분류 오답 시 정답을 알려 주는 대신 관찰해야 할 부분을 되짚어 준다."
 *
 * · 대사는 스토리보드 「⑥ 내레이션·자막 대본 일람」과 화면 설계 ⓔ·💬 줄을 그대로 옮겼다.
 *   각 대사에 음성 ID를 달아 두었으므로, 성우 녹음본이 나오면
 *     LabTutor.onSpeak = (vid, text) => new Audio('audio/' + vid + '.mp3').play();
 *   한 줄로 음성을 붙일 수 있다. 녹음 전까지는 자막만 나온다(자막 상시 제공).
 * · 캐릭터 그림은 자리 지킴이다. 플랫폼 공통 디로 그림을 받으면
 *     LabTutor.setAvatar('../assets/diro.png')
 *   한 줄로 교체된다.
 */
const LabTutor = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const KEY = 'capservice.tutor.on';

  /* ── 대사집 — 음성 ID : 대사 전문 ───────────────────────
     스토리보드 16쪽 대본 일람 + 화면 설계 5~14쪽 💬 디로 줄            */
  const SCRIPT = {
    /* 도입 · 정리 — 모달 화면이라 무대로 돌아온 순간에 말한다 */
    '말풍선-S-1': '축전기 서비스 센터에 온 것을 환영해요. 여러분이 오늘의 견습 엔지니어!',
    '인트로01': '축전기 서비스 센터에 네 건의 수리 의뢰가 접수되었습니다. 모든 고장의 열쇠는 축전기에 있어요.',
    '인트로02': '먼저 여러분이 무엇을 알고 있는지 확인해 볼까요?',
    '말풍선-S-8·S-9': '오늘 배운 것을 확인해 봅시다. 틀려도 다시 볼 수 있어요!',
    '정리01': '틀린 문제는 실험 화면으로 돌아가 다시 확인할 수 있어요.',
    '정리02': '수고했어요! 보고서를 내려받아 오늘의 수리 일지를 완성하세요.',

    /* 1차시 — 회로 */
    '말풍선-S-2': '점선 자리에 부품을 끌어다 놓으세요. 모두 놓으면 도선이 이어져요!',
    '회로01': '전원 장치, 스위치, 축전기, LED. 네 부품을 자리에 놓아 회로를 만들어 봅시다.',
    '회로02': '모든 부품이 연결되었어요. 이제 실험을 시작할 수 있습니다!',
    '말풍선-S-3': '화면의 칼날 스위치를 충전 쪽으로 클릭! 전원의 전하가 어디로 가는지 잘 보세요.',
    '회로03': '전원을 떼고도 불이 켜질까요? 방전 쪽으로 젖혀 봅시다.',
    '회로04': 'LED를 거꾸로 끼우면 어떻게 될까요? 다리 길이를 잘 보세요.',
    '오개념01': '전하가 판 위에 그대로 머물러 있죠? 전하는 판 사이를 건너갈 수 있을까요?',
    '팝업01': 'LED는 긴 다리가 + 쪽이에요. 방향을 확인해 볼까요?',
    '말풍선-S-5p': '이 축전기는 16 V까지만 견딜 수 있어요. 겉면 표시를 확인해 볼까요?',
    /* 예비 — 허용 전압을 넘기는 조건은 프로토타입에 없다(전원 최대 9 V < 허용 16 V) */
    '팝업02': '축전기에 표시된 전압보다 낮은 전원을 써야 해요.',

    /* 2차시 — 구조 */
    '말풍선-S-4': '실물은 위험해서 못 열어요. 여기서는 마음껏 분해해 보세요!',
    '분해01': '겉면의 표시부터 읽어 볼까요? 허용 전압과 극성 띠가 보여요.',
    '분해02': '롤 끝을 잡고 천천히 당겨 보세요. 얼마나 긴 판이 말려 있었을까요?',
    '말풍선-S-5': '판을 가깝게 하면 마주 보는 전하들이 더 세게 붙잡아 줘요!',
    '조립01': '면적이 넓으면 같은 판의 전하들이 서로 덜 밀어내요. 이것도 전하를 모으는 비결!',
    '조립02': '이렇게 넓은 판을 어떻게 작은 부품에 넣을까요? 돌돌 말면 됩니다!',

    /* 3차시 — 기기 */
    '말풍선-S-6': '심장 충격기가 충전되지 않는대요. 빠진 부품부터 찾아 끼워 볼까요?',
    '기기01': '심장 충격기에는 충전되는 전하의 양이 큰 축전기가 들어 있어요. 게이지를 채워 봅시다.',
    '기기02': '플래시가 한순간에 밝게 터지는 것도 축전기 덕분이에요.',
    '말풍선-S-7': '패널이 통째로 분해되어 왔어요. 손가락이 닿는 쪽부터 차례대로 끼워 볼까요?',
    '기기03a': '손가락이 닿는 순간, 그 자리의 전하가 어디로 가는지 보세요!',
    '기기03': '지우개로는 왜 안 될까요? 전기가 통하는 물체만 전하를 데려갈 수 있어요.',
    '기기04': '습도 센서는 충전과 방전을 반복하지 않아요. 무엇이 변하는지 게이지를 지켜보세요.',
    '말풍선-S-7g': '네 기기를 두 선반에 정리해 볼까요? 헷갈리면 다시 점검!',
    '분류01': '그 기기를 점검할 때 게이지가 어떻게 움직였는지 떠올려 보세요.',
    '분류02': '완벽해요! 이제 어엿한 정식 엔지니어입니다.',
  };

  /* ── 캐릭터 그림 (플랫폼 디로 그림이 오면 setAvatar 로 교체) ── */
  const AVATAR = [
    '<svg viewBox="0 0 88 88" aria-hidden="true">',
    '<defs><linearGradient id="dgBody" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#63b0f5"/><stop offset="1" stop-color="#2f6fd6"/>',
    '</linearGradient></defs>',
    '<path d="M44 17V8" stroke="#2f6fd6" stroke-width="3.4" stroke-linecap="round"/>',
    '<circle cx="44" cy="6.5" r="4.6" fill="#ffc93c"/>',
    '<circle cx="44" cy="49" r="31" fill="url(#dgBody)"/>',
    '<ellipse cx="44" cy="46" rx="23" ry="20" fill="#f2f8ff"/>',
    '<circle cx="35.5" cy="43" r="3.7" fill="#22344e"/><circle cx="52.5" cy="43" r="3.7" fill="#22344e"/>',
    '<circle cx="36.8" cy="41.7" r="1.3" fill="#fff"/><circle cx="53.8" cy="41.7" r="1.3" fill="#fff"/>',
    '<circle cx="28.5" cy="50" r="3.2" fill="#ffb0b6" opacity=".8"/>',
    '<circle cx="59.5" cy="50" r="3.2" fill="#ffb0b6" opacity=".8"/>',
    '<path d="M37.5 52.5q6.5 5.5 13 0" stroke="#22344e" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    '<circle cx="44" cy="72" r="8.5" fill="#1d5bb5"/>',
    '<path d="M46.6 66.6l-5.4 6.6h3.2l-1.4 5 5.4-6.6h-3.2z" fill="#ffc93c"/>',
    '</svg>',
  ].join('');

  const CSS = [
    '.tutor {',
    '  position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%);',
    '  z-index: 12; display: flex; align-items: flex-end; gap: 9px;',
    '  width: min(470px, calc(100% - 824px)); min-width: 320px;',
    '  pointer-events: none;',
    '}',
    '.tutor.off, .tutor.veil { display: none; }',
    '.tutor-av {',
    '  flex: none; width: 60px; height: 60px;',
    '  filter: drop-shadow(0 4px 9px #0000002e);',
    '  animation: dgBob 3.4s ease-in-out infinite;',
    '}',
    '.tutor-av svg, .tutor-av img { width: 100%; height: 100%; display: block; }',
    '@keyframes dgBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }',
    '.tutor.talk .tutor-av { animation: dgTalk .5s ease-out 2; }',
    '@keyframes dgTalk { 0%,100% { transform: translateY(0) scale(1); } 40% { transform: translateY(-6px) scale(1.06); } }',
    '.tutor-bub {',
    '  position: relative; flex: 1 1 auto; min-width: 0;',
    '  background: rgba(255,255,255,.96);',
    '  backdrop-filter: blur(12px) saturate(1.25);',
    '  -webkit-backdrop-filter: blur(12px) saturate(1.25);',
    '  border: 1px solid #c9dcf3; border-radius: 14px;',
    '  box-shadow: 0 8px 22px #0f244a26;',
    '  padding: 9px 30px 10px 13px;',
    '  pointer-events: auto;',
    '}',
    '.tutor-bub::before {',
    '  content: ""; position: absolute; left: -8px; bottom: 15px;',
    '  width: 14px; height: 14px; background: #fff;',
    '  border-left: 1px solid #c9dcf3; border-bottom: 1px solid #c9dcf3;',
    '  transform: rotate(45deg); border-radius: 0 0 0 4px;',
    '}',
    '.tutor-name {',
    '  display: block; font-size: 11px; font-weight: 800; color: #2f6fd6;',
    '  letter-spacing: .4px; margin-bottom: 1px;',
    '}',
    '.tutor-txt {',
    '  margin: 0; font-size: 13.5px; line-height: 1.55; color: #22344e;',
    '  word-break: keep-all;',
    '}',
    '.tutor-x {',
    '  position: absolute; top: 5px; right: 5px;',
    '  width: 21px; height: 21px; line-height: 19px; padding: 0;',
    '  border: 1px solid #dde5f0; border-radius: 50%;',
    '  background: #fff; color: #8a97a8; font-size: 13px; cursor: pointer;',
    '}',
    '.tutor-x:hover { background: #f0f5fb; color: #41566f; }',
    /* 좁은 화면 — 좌우 아래 구석 패널 위로 올려 놓고, 패널을 펼치면 자리를 비켜 준다 */
    '@media (max-width: 1180px) {',
    '  .tutor { bottom: 66px; width: min(470px, calc(100% - 40px)); min-width: 0; }',
    '  .record-panel:not(.collapsed):not(.hidden) ~ .tutor,',
    '  .steps-panel:not(.collapsed):not(.hidden) ~ .tutor,',
    '  .graph-panel:not(.collapsed):not(.hidden) ~ .tutor,',
    '  .readout:not(.collapsed) ~ .tutor { display: none; }',
    '}',
    '@media (max-width: 820px) {',
    '  .tutor {',
    '    left: 8px; right: 8px; bottom: 56px; transform: none;',
    '    width: auto; min-width: 0; gap: 6px;',
    '  }',
    '  .tutor-av { width: 42px; height: 42px; }',
    '  .tutor-bub { padding: 7px 26px 8px 10px; border-radius: 12px; }',
    '  .tutor-name { font-size: 10px; }',
    '  .tutor-txt { font-size: 12px; line-height: 1.5; max-height: 20vh; overflow: auto; }',
    '}',
  ].join('\n');

  const ICON = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="#8a97a8" stroke-width="1.8"',
    ' stroke-linecap="round" stroke-linejoin="round">',
    '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/></svg>',
  ].join('');

  let el = null, txt = null, on = true;
  let base = null;      // 화면별 상시 대사 — 이벤트 대사가 끝나면 이 문장으로 돌아온다
  let hideT = 0;        // 이벤트 대사가 머무는 남은 시간(초)
  const said = {};      // 한 번만 말할 대사 표시
  const prev = {};      // 상승 에지 감지용 이전 값

  const TICK = 0.18;    // 감지 주기(초)

  /* ── 화면 만들기 ─────────────────────────────────────── */
  function build() {
    const stage = $('#stage');
    if (!stage) return false;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    el = document.createElement('div');
    el.className = 'tutor';
    el.id = 'tutor';
    el.innerHTML = '<div class="tutor-av">' + AVATAR + '</div>'
      + '<div class="tutor-bub">'
      + '<b class="tutor-name">디로</b>'
      + '<p class="tutor-txt" id="tutorTxt"></p>'
      + '<button class="tutor-x" id="tutorX" title="디로 말풍선 끄기" aria-label="디로 말풍선 끄기">×</button>'
      + '</div>';
    stage.appendChild(el);          // 무대의 «마지막» 자식 — 패널 겹침 규칙(~)에 쓰인다
    txt = $('#tutorTxt');
    $('#tutorX').addEventListener('click', () => setOn(false));
    return true;
  }

  /* ── 사이드바 on/off 버튼 ────────────────────────────── */
  function injectButton() {
    const sb = $('.sidebar');
    if (!sb) return;
    const b = document.createElement('button');
    b.className = 'sb-flow';
    b.dataset.flow = 'tutor';
    b.title = '디로 말풍선 켜기/끄기';
    b.innerHTML = ICON + '<span class="sb-label">디로</span><span class="sb-done hidden">✓</span>';
    b.addEventListener('click', () => setOn(!on));
    const after = sb.querySelector('[data-flow="report"]') || sb.querySelector('[data-panel="summary"]');
    if (after) after.after(b);
    else sb.appendChild(b);
  }

  function paint() {
    const badge = $('.sidebar [data-flow="tutor"] .sb-done');
    if (badge) badge.classList.toggle('hidden', !on);
    if (el) el.classList.toggle('off', !on);
  }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* 저장 실패해도 동작에는 지장 없음 */ }
    paint();
    if (on && base) show(base);
  }

  /* ── 말하기 ──────────────────────────────────────────── */
  function show(id) {
    if (!txt || !SCRIPT[id]) return;
    txt.textContent = SCRIPT[id];
    el.dataset.vid = id;                 // 성우 음원 파일명과 맞추는 자리
    el.classList.remove('talk');
    void el.offsetWidth;                 // 애니메이션 다시 시작
    el.classList.add('talk');
    if (LabTutor && LabTutor.onSpeak) LabTutor.onSpeak(id, SCRIPT[id]);
  }

  /** 화면별 상시 대사 — 이벤트 대사가 끝나면 이 문장으로 돌아온다 */
  function setBase(id) {
    if (!SCRIPT[id] || base === id) return;
    base = id;
    if (hideT <= 0) show(id);
  }

  /** 이벤트 대사 — 잠시 보여 준 뒤 상시 대사로 돌아간다 */
  function say(id) {
    if (!SCRIPT[id]) return;
    show(id);
    hideT = Math.max(4.2, 1.4 + SCRIPT[id].length * 0.12);   // 글 길이에 맞춰 머무는 시간
  }

  function sayOnce(id) {
    if (said[id]) return;
    said[id] = 1;
    say(id);
  }

  /* ── 발화 시점 감지 ──────────────────────────────────── */
  function subMode(cur, id) {
    if (id === 'struct' || id === 'devices') return (cur.state && cur.state.mode) || '';
    return '';
  }

  function onScreen(id, phase, cur) {
    /* 세 차시를 모두 둘러보면 확인하기로 이끈다 */
    prev.seen = (prev.seen || '') + (prev.seen && prev.seen.indexOf(id) >= 0 ? '' : id);
    if (prev.seen.length >= 'circuitstructdevices'.length) sayOnce('말풍선-S-8·S-9');

    if (id === 'circuit') {
      if (phase === 'run') setBase('말풍선-S-3');
      else { setBase('말풍선-S-2'); sayOnce('회로01'); }
      return;
    }
    if (id === 'struct') {
      if (cur.state.mode === 'build') setBase('말풍선-S-5');
      else { setBase('말풍선-S-4'); sayOnce('분해01'); }
      return;
    }
    if (id === 'devices') {
      const m = cur.state.mode;
      if (m === 'aed') { setBase('말풍선-S-6'); sayOnce('기기01'); }
      else if (m === 'flash') { setBase('말풍선-S-6'); sayOnce('기기02'); }
      else if (m === 'touch') setBase('말풍선-S-7');
      else if (m === 'humid') { setBase('기기04'); sayOnce('기기04'); }
      else if (m === 'sort') setBase('말풍선-S-7g');
    }
  }

  function pumpCircuit(cur) {
    const s = cur.state, sim = cur.sim;
    if (!sim) return;
    /* 회로 완성 */
    if (cur.allPlaced() && !prev.done) { prev.done = 1; say('회로02'); }
    if (!cur.allPlaced()) prev.done = 0;
    /* 충전 완료 → 방전으로 안내 */
    if (sim._didChg && !prev.chg) { prev.chg = 1; say('회로03'); }
    if (!sim._didChg) prev.chg = 0;
    /* 방전 완료 → 극성 실험으로 안내 */
    if (sim._didDis && !prev.dis) { prev.dis = 1; say('회로04'); }
    if (!sim._didDis) prev.dis = 0;
    /* 전원 전압을 손수 가장 높은 값으로 올렸을 때 — 겉면의 허용 전압을 읽게 한다 */
    if (prev.volt == null) prev.volt = s.volt;
    if (s.volt !== prev.volt) {
      prev.volt = s.volt;
      if (s.volt >= 9) sayOnce('말풍선-S-5p');
    }
    /* LED를 거꾸로 끼운 채 방전 시도 */
    const blocked = s.sw === 'dis' && s.ledDir < 0;
    if (blocked && !prev.blk) { prev.blk = 1; say('팝업01'); }
    if (!blocked) prev.blk = 0;
    /* 오개념 되짚기 — 충전을 끝낸 채 잠시 머무르면 (기획서 Ⅵ-3 R1) */
    if (s.sw === 'chg' && sim.V >= s.volt * 0.99) {
      prev.hold = (prev.hold || 0) + TICK;
      if (prev.hold > 6) sayOnce('오개념01');
    } else prev.hold = 0;
  }

  function pumpStruct(cur) {
    const s = cur.state;
    if (s.mode === 'peel') {
      if (s.stage !== prev.stage) {
        prev.stage = s.stage;
        if (s.stage === 2) sayOnce('분해02');      // ③ 꺼내어 눕히기 후
      }
    } else {
      if (prev.area == null) prev.area = s.areaCm2;
      if (s.areaCm2 !== prev.area) { prev.area = s.areaCm2; sayOnce('조립01'); }
      if (s.round >= 3) sayOnce('조립02');
    }
  }

  function pumpDevices(cur) {
    const s = cur.state;
    if (s.mode === 'touch' && s.repaired && s.repaired.touch) {
      const h = s._handT || 0;
      if (h > (prev.hand || 0) + 0.15) {           // 누른 순간 0.9로 튀어 오른다
        if (s.tool === 'eraser') sayOnce('기기03');
        else sayOnce('기기03a');
      }
      prev.hand = h;
    }
    if (s.mode === 'sort') {
      const wrong = Object.keys(cur.ANSWER)
        .filter((k) => s.sorted[k] && s.sorted[k] !== cur.ANSWER[k]).length;
      if (wrong && !prev.wrong) { prev.wrong = 1; say('분류01'); }
      if (!wrong) prev.wrong = 0;
      if (cur.sortScore() === 4) sayOnce('분류02');
    }
  }

  function pump() {
    if (!el) return;
    /* 학습 패널(모달)이 열려 있으면 무대가 가려지므로 잠시 감춘다 */
    const modal = $('#panelModal');
    el.classList.toggle('veil', !!(modal && !modal.classList.contains('hidden')));

    const cur = (typeof Lab !== 'undefined') && Lab.current;
    if (!cur) return;
    const id = cur.id, phase = Lab.phase;
    const key = id + '|' + phase + '|' + subMode(cur, id);
    if (key !== prev.key) { prev.key = key; onScreen(id, phase, cur); }

    if (id === 'circuit') pumpCircuit(cur);
    else if (id === 'struct') pumpStruct(cur);
    else if (id === 'devices') pumpDevices(cur);

    if (hideT > 0) {
      hideT -= TICK;
      if (hideT <= 0 && base) show(base);
    }
  }

  /* ── 실험 다시하기 : 씬이 처음으로 돌아가므로 대사도 되돌린다 ── */
  function bindReset() {
    const r = $('.sidebar [data-action="restart"]');
    if (!r) return;
    r.addEventListener('click', () => {
      Object.keys(said).forEach((k) => { if (k.indexOf('인트로') !== 0) delete said[k]; });
      Object.keys(prev).forEach((k) => delete prev[k]);
      hideT = 0;
      base = null;
    });
  }

  /* ── 정리 단계 대사 — 모달을 닫고 무대로 돌아오는 순간에 말한다 ── */
  function bindFlow() {
    const close = $('#panelClose');
    if (close) {
      close.addEventListener('click', () => {
        if (typeof LabFlow === 'undefined' || typeof LabContent === 'undefined') return;
        const wrong = LabFlow.state.quiz.pick
          .some((p, i) => p !== null && LabContent.quiz[i] && LabContent.quiz[i].a !== p);
        if (wrong) say('정리01');
      });
    }
    const rep = $('.sidebar [data-flow="report"]');
    if (rep) rep.addEventListener('click', () => say('정리02'));
  }

  function setAvatar(url) {
    const av = $('.tutor-av');
    if (av) av.innerHTML = '<img src="' + url + '" alt="디로">';
  }

  /* ── 시작 ────────────────────────────────────────────── */
  function init() {
    if (!build()) return;
    try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { on = true; }
    injectButton();
    paint();
    bindReset();
    bindFlow();
    /* 도입 — 환영 → 의뢰 접수 → 진단하기 안내 순으로 이어 말한다 */
    sayOnce('말풍선-S-1');
    setTimeout(() => sayOnce('인트로01'), 5200);
    setTimeout(() => {
      const d = (typeof LabFlow !== 'undefined') && LabFlow.state.diag.pick;
      const idle = Lab.phase === 'prep' && Lab.current && Lab.current.id === 'circuit';
      // 아직 진단하기 전이고, 실험을 시작하지도 않았을 때만 — 탐구 중에는 끼어들지 않는다
      if (idle && (!d || d.every((p) => p === null))) sayOnce('인트로02');
    }, 13000);
    setInterval(pump, TICK * 1000);
  }

  return { init, say, sayOnce, setOn, setAvatar, script: SCRIPT, onSpeak: null };
})();

LabTutor.init();
