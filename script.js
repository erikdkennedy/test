(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ───────── Headline options ───────── */
  const HEADLINES = [
    'Less spying. More <em>guiding</em>.',
    'Screen time, summarized. Not <em>surveilled</em>.',
    'Know how they’re doing online, without reading <em>every&nbsp;word</em>.',
    'A gentle guide for their first years <em>online</em>.',
    'Raise them <em>for</em> the internet, not just away from it.',
  ];

  // Longer lines get a smaller cap so every option sits in ~3–4 lines.
  function sizeFor(html) {
    const len = html.replace(/<[^>]+>|&nbsp;/g, ' ').length;
    if (len <= 30) return 'clamp(60px, 8.4vw, 152px)';
    if (len <= 46) return 'clamp(54px, 7vw, 128px)';
    return 'clamp(48px, 6vw, 110px)';
  }

  const h1 = $('#headline');
  const segH = $('#twHeadline');
  function setHeadline(i) {
    h1.innerHTML = HEADLINES[i];
    h1.style.setProperty('--h1', sizeFor(HEADLINES[i]));
    h1.style.maxWidth = HEADLINES[i].replace(/<[^>]+>|&nbsp;/g, ' ').length > 46 ? '17ch' : '13ch';
    segH.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-checked', String(i === j)));
    store.set('kite-headline', i);
  }
  HEADLINES.forEach((html, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'radio';
    b.textContent = i + 1;
    b.title = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
    b.addEventListener('click', () => setHeadline(i));
    segH.appendChild(b);
  });
  setHeadline(Math.min(+store.get('kite-headline') || 0, HEADLINES.length - 1));

  /* ───────── Body font options ───────── */
  // Both families are loaded as full builds; Google's versions drop ss/cv features.
  const FONTS = [
    { name: 'Inter, softened', note: 'cv11 single-storey a · cv05 tailed l · ss03 round quotes',
      family: '"InterVariable", system-ui, sans-serif', features: '"cv05", "cv11", "ss03"' },
    { name: 'Inter, compact', note: 'cv11 a · cv12 compact f · cv13 compact t · ss01 open digits',
      family: '"InterVariable", system-ui, sans-serif', features: '"cv11", "cv12", "cv13", "ss01", "ss03"' },
    { name: 'Geist, friendly', note: 'ss02 alt a · ss03 alt l · ss08 rounded dots',
      family: '"Geist Full", system-ui, sans-serif', features: '"ss02", "ss03", "ss08"' },
    { name: 'Inter, default', note: 'For comparison — no alternates',
      family: '"InterVariable", system-ui, sans-serif', features: 'normal' },
  ];
  const listF = $('#twFont');
  function setFont(i) {
    const f = FONTS[i];
    document.documentElement.style.setProperty('--sans', f.family);
    document.documentElement.style.setProperty('--sans-features', f.features);
    listF.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-checked', String(i === j)));
    store.set('kite-font', i);
  }
  FONTS.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'radio';
    b.innerHTML = `<span class="tw-name" style="font-family:${f.family.replace(/"/g, "'")};font-feature-settings:${f.features.replace(/"/g, "'")}">${f.name}</span><small>${f.note}</small>`;
    b.addEventListener('click', () => setFont(i));
    listF.appendChild(b);
  });
  setFont(Math.min(+store.get('kite-font') || 0, FONTS.length - 1));

  const tweaks = $('#tweaks');
  const toggle = $('#tweaksToggle');
  function setOpen(open) {
    tweaks.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    store.set('kite-tweaks-open', open ? '1' : '0');
  }
  toggle.addEventListener('click', () => setOpen(tweaks.dataset.open !== 'true'));
  setOpen(store.get('kite-tweaks-open') === '1');

  /* ───────── The "spy" log ───────── */
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const events = [
    ['youtube.com/watch?v=', true, 'm'], ['Messages  →  “Ana”', false, ''], ['Search  “how to draw hands”', false, ''],
    ['roblox.com/games/', true, 'm'], ['tiktok.com/@', true, 's'], ['Messages  ←  “Theo”', false, ''],
    ['Minecraft  session', false, 'm'], ['khanacademy.org/math/', true, 'm'], ['Safari  google.com/search?q=', true, ''],
    ['Snapchat  opened', false, 's'], ['Photos  screenshot saved', false, ''], ['Discord  #general', false, 'm'],
  ];
  const rnd = (n) => Math.floor(Math.random() * n);
  const id = () => Math.random().toString(36).slice(2, 9);
  const pad = (n) => String(n).padStart(2, '0');
  let rows = '';
  for (let i = 0; i < 70; i++) {
    const [label, withId, dur] = events[rnd(events.length)];
    const t = `${days[Math.floor(i / 10) % 7]} ${pad(7 + rnd(16))}:${pad(rnd(60))}:${pad(rnd(60))}`;
    const d = dur === 'm' ? `${1 + rnd(40)}m ${pad(rnd(60))}s` : dur === 's' ? `${5 + rnd(55)}s` : '';
    rows += `<div><span class="t">${t}</span><span>${label}${withId ? id() : ''}</span><span class="d">${d}</span></div>`;
  }
  $('#log').innerHTML = rows + rows; // doubled for a seamless loop

  /* ───────── Age dial ───────── */
  const STAGES = [
    { max: 9,  name: 'Training wheels',   text: 'You approve new apps and set gentle limits. A short note each evening, so nothing piles up.' },
    { max: 11, name: 'First steps',       text: 'Weekly summaries instead of daily. Kite suggests limits, and you two agree on them together.' },
    { max: 13, name: 'Building judgment', text: 'Your kid sees the exact same summary you do. No secrets in either direction.' },
    { max: 15, name: 'Mostly theirs',     text: 'Kite only speaks up about patterns worth a chat, like late nights or a sudden change.' },
    { max: 17, name: 'Ready for launch',  text: 'A monthly check-in, then Kite hands them the keys, along with a look back at how far they’ve come.' },
  ];
  const range = $('#ageRange');
  const ticks = [...document.querySelectorAll('.dial-ticks span')];
  function setAge() {
    const age = +range.value;
    const stage = STAGES.find((s) => age <= s.max);
    $('#ageNum').textContent = age;
    $('#stageName').textContent = stage.name;
    $('#stageText').textContent = stage.text;
    const theirs = 12 + ((age - 8) / 9) * 80; // 12% at 8 → 92% at 17
    $('#balYou').style.flexBasis = `${100 - theirs}%`;
    $('#balThem').style.flexBasis = `${theirs}%`;
    range.style.setProperty('--p', `${((age - 8) / 9) * 100}%`);
    ticks.forEach((t) => t.classList.toggle('on', +t.textContent === age));
  }
  range.addEventListener('input', setAge);
  setAge();

  /* ───────── Waitlist (static for now) ───────── */
  const form = $('#signup');
  const msg = $('#signupMsg');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.textContent = 'That email doesn’t look quite right. Mind checking it?';
      msg.classList.add('is-error');
      return;
    }
    // TODO: send to the real list provider.
    form.classList.add('is-done');
    msg.classList.remove('is-error');
    msg.classList.add('is-done');
    msg.textContent = 'You’re on the list. We’ll be in touch.';
  });

  /* ───────── Reveal on scroll ───────── */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  /* ───────── Subtle parallax ───────── */
  if (reduceMotion) return;
  const layers = [...document.querySelectorAll('[data-speed]')];
  let ticking = false;
  function update() {
    const vh = innerHeight;
    for (const el of layers) {
      const r = (el.parentElement || el).getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const offset = (r.top + r.height / 2 - vh / 2) * -parseFloat(el.dataset.speed);
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    }
    ticking = false;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();
})();
