(() => {
  const root = document.documentElement;
  const FULL = root.classList.contains('motion');          // false when the OS asks for reduced motion
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const hero = document.querySelector('.hero');
  const header = document.querySelector('.top');

  /* ---------- split the hero phrase into letters for the intro ---------- */
  const word = document.querySelector('.word');
  const phrase = word.textContent;
  word.setAttribute('aria-label', phrase);
  word.innerHTML = [...phrase].map((ch, i) =>
    ch === ' ' ? '<span class="sp" aria-hidden="true">&nbsp;</span>'
               : `<span class="ch" style="--i:${i}" aria-hidden="true">${ch}</span>`).join('');

  /* ---------- drag-to-spin turntable ---------- */
  const FRAMES = 120;
  const START = 95;                       // best-looking turntable frame opens the page (face and hammer visible)
  const spin = document.getElementById('spin');
  const canvas = document.getElementById('spin-canvas');
  const ctx = canvas.getContext('2d');
  const imgs = new Array(FRAMES);
  let base = START, scrollRot = 0, current = -1, dragging = false, lastX = 0, loaded = 0;
  let autoplay = FULL, spinVisible = true;

  const src = i => `assets/spin/${String(i + 1).padStart(4, '0')}.webp`;
  const ok = img => img && img.complete && img.naturalWidth;

  function nearestLoaded(i) {
    for (let d = 0; d < FRAMES; d++) {
      const a = imgs[(i - d + FRAMES) % FRAMES], b = imgs[(i + d) % FRAMES];
      if (ok(a)) return a;
      if (ok(b)) return b;
    }
    return null;
  }
  function draw(i) {
    const img = nearestLoaded(i);
    if (!img) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  function render() {
    const p = (((base + scrollRot) % FRAMES) + FRAMES) % FRAMES;
    const i = Math.floor(p);
    if (i !== current) { current = i; draw(i); }
  }

  // the intro starts once the first frame and the font are ready (or after 1.4 s at most)
  let firstFrame;
  const firstFrameReady = new Promise(r => { firstFrame = r; });
  const order = [START];
  for (const step of [8, 4, 2, 1]) for (let i = 0; i < FRAMES; i += step) if (!order.includes(i)) order.push(i);
  order.forEach((i, k) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      loaded++;
      if (i === START) { spin.classList.add('ready'); current = -1; render(); firstFrame(); }
    };
    setTimeout(() => { img.src = src(i); }, k < 16 ? 0 : 18 * k);
    imgs[i] = img;
  });
  Promise.race([
    Promise.all([firstFrameReady, document.fonts ? document.fonts.ready : null]),
    new Promise(r => setTimeout(r, 1400))
  ]).then(() => requestAnimationFrame(() => root.classList.add('loaded')));

  spin.addEventListener('pointerdown', e => {
    dragging = true; autoplay = false; lastX = e.clientX;
    spin.classList.add('dragging'); spin.setPointerCapture(e.pointerId);
    cursor.classList.add('press');
  });
  spin.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    base -= dx / (spin.clientWidth / 90);
    render();
  });
  const endDrag = () => { dragging = false; spin.classList.remove('dragging'); cursor.classList.remove('press'); };
  spin.addEventListener('pointerup', endDrag);
  spin.addEventListener('pointercancel', endDrag);
  new IntersectionObserver(([en]) => { spinVisible = en.isIntersecting; }).observe(spin);

  /* ---------- custom cursor ("Drag", "Slide") ---------- */
  const cursor = document.getElementById('cursor');
  const cursorLabel = document.getElementById('cursor-label');
  let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
  if (finePointer) {
    root.classList.add('has-cursor');
    document.querySelectorAll('[data-cursor]').forEach(el => {
      el.addEventListener('pointerenter', () => { cursorLabel.textContent = el.dataset.cursor; cursor.classList.add('show'); });
      el.addEventListener('pointerleave', () => cursor.classList.remove('show'));
    });
  }
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });

  /* ---------- scroll reveals ---------- */
  const groups = [
    '.about > h2, .about > .sub', '.cols p', '.trio figure',
    '.feature-copy > *', '.feature-img',
    '.models button', '.car', '.car-foot > *',
    '.block > .center-h, .block > .sub', '.ba', '.prices article', '.block > .note',
    '.steps li', '.faq details', '.offer-box'
  ];
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target;
    el.classList.add('in');
    io.unobserve(el);
    // drop the reveal classes afterwards so hover transitions aren't delayed
    const d = parseFloat(el.style.getPropertyValue('--d')) || 0;
    setTimeout(() => { el.classList.remove('rv', 'in'); el.style.removeProperty('--d'); }, d + 1300);
  }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  groups.forEach(sel => document.querySelectorAll(sel).forEach((el, i) => {
    el.classList.add('rv');
    el.style.setProperty('--d', `${Math.min(i, 6) * 90}ms`);
    io.observe(el);
  }));

  /* ---------- floating offer: after the landing section, but not over prices or contact ---------- */
  const floatCta = document.getElementById('float-cta');
  const offerZones = new Set();
  const updateFloat = y => floatCta.classList.toggle('show', y > hero.offsetHeight * 0.85 && offerZones.size === 0);
  const zoneIo = new IntersectionObserver(entries => {
    entries.forEach(en => { en.isIntersecting ? offerZones.add(en.target) : offerZones.delete(en.target); });
    updateFloat(scrollY);
  }, { threshold: 0.15 });
  ['prices', 'contact'].forEach(id => zoneIo.observe(document.getElementById(id)));

  /* ---------- one loop for scroll, light and cursor ---------- */
  const featureImg = document.querySelector('.feature-img img');
  let lastY = -1, lightX = 50, lightY = 58, last = performance.now();

  function tick(t) {
    const dt = Math.min(t - last, 64); last = t;
    const y = scrollY;

    if (y !== lastY) {
      // header: solid after leaving the top, hides on scroll down, returns on scroll up
      header.classList.toggle('solid', y > 40);
      updateFloat(y);
      if (y > innerHeight * 0.7 && y > lastY + 3) header.classList.add('hide');
      else if (y < lastY - 3 || y < innerHeight * 0.7) header.classList.remove('hide');

      if (FULL) {
        const p = clamp(y / hero.offsetHeight, 0, 1);
        word.style.translate = `0 ${(-p * 160).toFixed(1)}px`;
        word.style.opacity = (1 - p * 1.4).toFixed(3);
        scrollRot = y / 7;                 // one full turn every ~840px of scroll
        render();

        const r = featureImg.getBoundingClientRect();
        if (r.top < innerHeight && r.bottom > 0) {
          const q = clamp((innerHeight - r.top) / (innerHeight + r.height * 0.5), 0, 1);
          featureImg.style.scale = (1.14 - 0.14 * q).toFixed(4);
        }
      }
      lastY = y;
    }

    if (FULL && autoplay && spinVisible && loaded > 16 && !dragging) { base += dt * 0.012; render(); }

    if (FULL && y < hero.offsetHeight) {
      // the studio light drifts a little toward the mouse
      const tx = 50 + (mx / innerWidth - 0.5) * 16, ty = 58 + (my / innerHeight - 0.5) * 10;
      lightX = lerp(lightX, tx, 0.06); lightY = lerp(lightY, ty, 0.06);
      hero.style.setProperty('--mx', lightX.toFixed(2) + '%');
      hero.style.setProperty('--my', lightY.toFixed(2) + '%');
    }

    if (finePointer) {
      cx = lerp(cx, mx, 0.22); cy = lerp(cy, my, 0.22);
      cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- collection: angles of the chosen model ---------- */
  const models = [
    { k: 'anuth', name: 'Anuth', by: 'Fed Tabula Games', alt: 'Anuth, a warrior with a crystal shield' },
    // add scale: 1.2 (for example) to any model to show it larger, grown from its base
    { k: 'dwarf', name: 'Dwarf Dragon Warrior', by: 'TheSurrealFactory', alt: 'a dwarf in spiked armour with a hammer and sword' },
    { k: 'guardian', name: 'Cursed Guardian', by: 'TheSurrealFactory', alt: 'a kneeling guardian holding a spear' },
    { k: 'mink', name: 'Mink', by: 'Ethan Savage', alt: 'a winged dragon-half character' },
    { k: 'barbarian', name: 'Sons of the Mountain', by: 'Fed Tabula Games', alt: 'a barbarian raising a war hammer' }
  ];
  const angles = ['000', '045', '090', '180', '270'];
  const cur = document.getElementById('cur-img');
  const prevImg = document.getElementById('prev-img');
  const nextImg = document.getElementById('next-img');
  const deg = document.getElementById('deg');
  const by = document.getElementById('by');
  const modelName = document.getElementById('model-name');
  const pagerBtns = document.querySelectorAll('#pager button');
  const modelBtns = document.querySelectorAll('#models button');
  const file = (m, a) => `assets/models/${models[m].k}/iso_${angles[a]}.webp`;
  let idx = 1, model = 0, busy = false, carVisible = false;

  const preloaded = new Set();
  function preload(m) {
    if (preloaded.has(m)) return;
    preloaded.add(m);
    angles.forEach((_, a) => { const i = new Image(); i.src = file(m, a); });
  }
  preload(0);
  // the rest load once the section gets close
  new IntersectionObserver(([en], obs) => {
    if (en.isIntersecting) { models.forEach((_, m) => preload(m)); obs.disconnect(); }
  }, { rootMargin: '600px 0px' }).observe(document.getElementById('angles'));

  function swap() {
    const n = angles.length, p = (idx - 1 + n) % n, q = (idx + 1) % n;
    cur.src = file(model, idx);
    cur.alt = `${models[model].name}: ${models[model].alt}, ${parseInt(angles[idx], 10)} degrees`;
    prevImg.src = file(model, p);
    nextImg.src = file(model, q);
    const s = String(models[model].scale || 1);
    [cur, prevImg, nextImg].forEach(im => { im.style.scale = s; });
    deg.textContent = `${angles[idx]}°`;
    modelName.textContent = models[model].name;
    by.textContent = `by ${models[model].by}`;
    pagerBtns.forEach((b, i) => { b.classList.toggle('on', i === idx); b.setAttribute('aria-selected', i === idx); });
    modelBtns.forEach((b, i) => { b.classList.toggle('on', i === model); b.setAttribute('aria-pressed', i === model); });
  }

  // animate the big mini out, apply the change, animate it back in
  function transition(apply, off, on, sides) {
    if (busy) return;
    if (!cur.animate) { apply(); swap(); return; }
    busy = true;
    setTimeout(() => { busy = false; }, 1000);   // never stay locked if an animation gets interrupted
    const out = cur.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: FULL ? off : 'none' }],
      { duration: FULL ? 220 : 160, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    sides.forEach(im => im.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: 420 }));
    out.onfinish = () => {
      apply(); swap();
      const inn = cur.animate([{ opacity: 0, transform: FULL ? on : 'none' }, { opacity: 1, transform: 'none' }],
        { duration: FULL ? 520 : 200, easing: 'cubic-bezier(.16,1,.3,1)' });
      out.cancel();
      inn.onfinish = () => { busy = false; };
    };
  }

  function show(n, dir) {
    const next = (n + angles.length) % angles.length;
    if (next === idx || busy) return;
    dir = dir || Math.sign(n - idx) || 1;
    transition(() => { idx = next; },
      `translateX(${-dir * 80}px) rotate(${-dir * 4}deg) scale(.95)`,
      `translateX(${dir * 80}px) rotate(${dir * 4}deg) scale(.95)`,
      [prevImg, nextImg]);
  }

  function pickModel(m) {
    if (m === model || busy) return;
    preload(m);
    // a different model rises into place; the angle stays the same so models are easy to compare
    transition(() => { model = m; }, 'translateY(-30px) scale(.94)', 'translateY(40px) scale(.94)', [prevImg, nextImg]);
  }

  document.getElementById('prev').addEventListener('click', () => show(idx - 1, -1));
  document.getElementById('next').addEventListener('click', () => show(idx + 1, 1));
  pagerBtns.forEach(b => b.addEventListener('click', () => show(+b.dataset.i)));
  modelBtns.forEach(b => b.addEventListener('click', () => pickModel(+b.dataset.m)));

  new IntersectionObserver(([en]) => { carVisible = en.isIntersecting; }, { threshold: 0.4 })
    .observe(document.getElementById('angles'));
  addEventListener('keydown', e => {
    if (!carVisible || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') show(idx - 1, -1);
    if (e.key === 'ArrowRight') show(idx + 1, 1);
  });

  // swipe on the big image
  const center = document.querySelector('.center');
  let sx = null;
  center.addEventListener('pointerdown', e => { sx = e.clientX; });
  center.addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 40) dx < 0 ? show(idx + 1, 1) : show(idx - 1, -1);
  });

  /* ---------- before / after ---------- */
  const ba = document.getElementById('ba');
  const range = document.getElementById('ba-range');
  let touched = false;
  const setBA = v => ba.style.setProperty('--pos', v + '%');
  range.addEventListener('input', () => { touched = true; setBA(range.value); });
  setBA(range.value);

  // first time it comes into view, the line moves a little to show it can be dragged
  if (FULL) {
    const hint = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      hint.disconnect();
      const keys = [50, 70, 32, 50], dur = 1800, t0 = performance.now() + 400;
      const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      (function step(t) {
        if (touched) return;
        const k = clamp((t - t0) / dur, 0, 1) * (keys.length - 1);
        const s = Math.min(Math.floor(k), keys.length - 2);
        const v = lerp(keys[s], keys[s + 1], ease(k - s));
        range.value = v; setBA(v);
        if (k < keys.length - 1) requestAnimationFrame(step);
      })(performance.now());
    }, { threshold: 0.6 });
    hint.observe(ba);
  }
})();
