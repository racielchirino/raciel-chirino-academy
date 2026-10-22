/* Raciel Chirino Academy — lógica de la app conectada a Supabase */
'use strict';
const ADMIN = 'racielchirino@gmail.com';
const CFG = window.RCA_CONFIG || {};
const CONFIGURED = /^https:\/\/.+\.supabase\.co/.test(CFG.url || '') && CFG.key && !/TU-/.test(CFG.key);
const sb = CONFIGURED && window.supabase ? window.supabase.createClient(CFG.url, CFG.key) : null;
const CACHE_KEY = 'rca_cache_v1';
const MAX_VIDEO_MB = 50; // límite por archivo del plan gratis de Supabase

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
// Colores de la franja: grupos para elegir rápido + selector libre
const LEGACY_BANDS = { rosa: '#E27BB5', coral: '#CF6658', naranja: '#DE8E3A', azul: '#2E3B5B', negro: '#141A26' };
const PALETTE = [
  ['Rosas', [['#F8BBD9','Rosa bebé'],['#F48FB1','Rosa chicle'],['#E27BB5','Rosa academia'],['#EC407A','Rosa intenso'],['#D81B60','Fucsia'],['#C2185B','Frambuesa'],['#AD1457','Magenta'],['#880E4F','Vino rosa']]],
  ['Rojos y corales', [['#FFAB91','Durazno'],['#FF8A65','Salmón'],['#E8604C','Coral vivo'],['#CF6658','Coral academia'],['#E53935','Rojo'],['#C62828','Rojo cereza'],['#B71C1C','Rojo profundo'],['#7F1D1D','Vino tinto']]],
  ['Naranjas y amarillos', [['#FFE082','Vainilla'],['#FFD54F','Mostaza suave'],['#F2A900','Mostaza'],['#FFB300','Ámbar'],['#FB8C00','Naranja'],['#DE8E3A','Naranja academia'],['#EF6C00','Mandarina'],['#BF5B04','Terracota']]],
  ['Verdes', [['#C5E1A5','Pistacho'],['#9CCC65','Lima'],['#66BB6A','Verde hoja'],['#2BB3A3','Turquesa'],['#26A69A','Verde agua'],['#2E7D32','Verde bosque'],['#4E6E58','Salvia oscura'],['#1B4332','Verde esmeralda']]],
  ['Azules', [['#B3E5FC','Celeste'],['#4FC3F7','Cielo'],['#29B6F6','Azul claro'],['#1E88E5','Azul'],['#1565C0','Azul rey'],['#3949AB','Índigo'],['#2E3B5B','Azul academia'],['#0D1B3E','Azul marino']]],
  ['Morados', [['#E1BEE7','Lavanda'],['#CE93D8','Lila'],['#BA68C8','Orquídea'],['#AB47BC','Violeta'],['#8E24AA','Morado'],['#6A1B9A','Uva'],['#4A148C','Berenjena'],['#2D0B4E','Morado noche']]],
  ['Neutros', [['#F3E5D8','Crema'],['#D7C4B2','Arena'],['#BCAAA4','Taupe'],['#A1887F','Café con leche'],['#795548','Café'],['#9E9E9E','Gris'],['#546E7A','Gris azulado'],['#141A26','Negro']]]
];
const ALL_COLORS = PALETTE.flatMap(([, cs]) => cs);
const bandColor = b => /^#[0-9a-f]{6}$/i.test(b || '') ? b : (LEGACY_BANDS[b] || LEGACY_BANDS.rosa);
const bandText = b => { const h = bandColor(b).slice(1); const [r, g, bl] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return (.2126 * r + .7152 * g + .0722 * bl) > .45 ? '#141A26' : '#FFFFFF'; };

/* ============ Estado ============ */
let S = { settings: { bank: '', whatsapp: '', email: '', banners: [] }, courses: [], enroll: [], reqs: [], done: {}, allReqs: [], user: null, offline: false, loaded: false };
try { const c = JSON.parse(localStorage.getItem(CACHE_KEY)); if (c && c.courses) S = { ...S, ...c, allReqs: [], loaded: true }; } catch (e) {}

const me = () => S.user && S.user.email;
const isAdmin = () => (me() || '').toLowerCase() === ADMIN;
const course = id => S.courses.find(c => c.id === id);
const hasAccess = cid => S.enroll.includes(cid) || isAdmin();
const lastReq = cid => [...S.reqs].reverse().find(r => r.course_id === cid);
const done = lid => !!S.done[lid];

async function loadAll() {
  if (!sb) return;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const u = session?.user;
    S.user = u ? { id: u.id, email: (u.email || '').toLowerCase(), name: u.user_metadata?.name || u.user_metadata?.full_name || (u.email || '').split('@')[0], avatar: u.user_metadata?.avatar_url || u.user_metadata?.picture || '' } : null;
    const [st, cs, ls] = await Promise.all([
      sb.from('settings').select('*').eq('id', 1).maybeSingle(),
      sb.from('courses').select('*').order('position').order('created_at'),
      sb.from('lessons').select('id,course_id,title,dur,position,created_at,has_video').order('position').order('created_at')
    ]);
    if (cs.error) throw cs.error;
    if (st.data) S.settings = st.data;
    S.courses = (cs.data || []).map(c => ({ ...c, lessons: (ls.data || []).filter(l => l.course_id === c.id) }));
    S.enroll = []; S.reqs = []; S.done = {}; S.allReqs = [];
    if (u) {
      const [en, rq, pr] = await Promise.all([
        sb.from('enrollments').select('course_id').eq('user_id', u.id),
        sb.from('requests').select('*').eq('user_id', u.id).order('created_at'),
        sb.from('progress').select('lesson_id').eq('user_id', u.id)
      ]);
      S.enroll = (en.data || []).map(x => x.course_id);
      S.reqs = rq.data || [];
      (pr.data || []).forEach(p => S.done[p.lesson_id] = true);
      if (isAdmin()) { const all = await sb.from('requests').select('*').order('created_at', { ascending: false }); S.allReqs = all.data || []; }
    }
    S.offline = false; S.loaded = true;
    try { const { allReqs, offline, ...keep } = S; localStorage.setItem(CACHE_KEY, JSON.stringify(keep)); } catch (e) {}
  } catch (e) {
    S.offline = true; S.loaded = true;
  }
}

/* ============ Utilidades ============ */
const sec = d => { const p = String(d || '').split(':').map(Number); if (p.some(isNaN)) return 0; return p.reduce((a, b) => a * 60 + b, 0); };
const mmss = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0'); };
const total = c => c.lessons.reduce((a, l) => a + sec(l.dur), 0);
const human = s => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h} h ${m} min` : `${m} min`; };
const pct = c => c.lessons.length ? Math.round(c.lessons.filter(l => done(l.id)).length / c.lessons.length * 100) : 0;
const fecha = t => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días,' : h < 19 ? 'Buenas tardes,' : 'Buenas noches,'; };
const mediaURL = p => !p ? '' : (p.startsWith('images/') || p.startsWith('http')) ? p : sb ? sb.storage.from('media').getPublicUrl(p).data.publicUrl : '';
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3000); }
function friendly(err) {
  const m = String(err?.message || err || '');
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Confirma tu correo: abre el enlace que te enviamos.';
  if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene cuenta. Entra con tu contraseña.';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/exceeded the maximum allowed size|Payload too large|413/i.test(m)) return `El archivo es muy pesado. El máximo es ${MAX_VIDEO_MB} MB; usa un enlace de YouTube o Vimeo.`;
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  return 'No se pudo completar: ' + m;
}
const ic = {
  lock: '<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  play: '<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  google: '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
  wa: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-1-1.1-1.3-1.7-.1-.2 0-.4.1-.5l.4-.5.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.6.6-.9 1.4-.9 2.2.1 1 .4 1.9 1 2.7 1.1 1.6 2.5 2.9 4.3 3.7.5.2.9.4 1.4.5.5.2 1 .2 1.5.1.6-.1 1.1-.5 1.5-1 .2-.4.2-.8.2-1.2l-.4-.2z"/></svg>',
  chev: '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
};
function coverEl(c, cls = '') {
  const u = mediaURL(c.cover_path);
  return `<div class="img ${cls}"><div class="ph" style="--b:${bandColor(c.band)}"><span class="k">${esc(c.kicker || c.title)}</span>${c.sub ? `<span class="s">${esc(c.sub)}</span>` : ''}</div>${u ? `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>`;
}
const busy = (btn, txt) => { if (!btn) return () => {}; const o = btn.innerHTML; btn.disabled = true; btn.textContent = txt; return () => { btn.disabled = false; btn.innerHTML = o; }; };

const bstyle = c => `--b:${bandColor(c.band)};--bt:${bandText(c.band)}`;
const abbr = c => { const w = String(c.kicker || c.title || '?').trim().replace(/^(conviértete en|aprende|curso de)\s+/i, ''); return (w[0] || '?').toUpperCase() + (w[1] || '').toLowerCase(); };
const icoEl = c => `<span class="ico" aria-hidden="true">${esc(abbr(c))}</span>`;
const minLabel = d => { const s = sec(d); if (!s) return d || ''; const m = Math.max(1, Math.round(s / 60)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} minutos`; };
const leftLabel = c => { const s = c.lessons.filter(l => !done(l.id)).reduce((a, l) => a + sec(l.dur), 0); return s ? `${human(s)} restantes` : 'Completado'; };
const avEl = (cls = 'av') => `<span class="${cls}">${S.user?.avatar ? `<img src="${esc(S.user.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}${esc(((S.user?.name || 'R').trim()[0] || 'R').toUpperCase())}</span>`;
const myCard = c => { const p = pct(c); const next = c.lessons.find(l => !done(l.id)) || c.lessons[0];
  return `<a class="my" style="${bstyle(c)}" href="${next ? `#/lesson/${c.id}/${next.id}` : `#/course/${c.id}`}">${icoEl(c)}
    <div class="t"><b>${esc(c.title)}</b><div class="slider" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div>
    <small>${leftLabel(c)} • ${c.lessons.length} lecciones</small></div></a>`; };

const waLink = () => {
  let n = String(S.settings.whatsapp || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('0')) n = '58' + n.slice(1);           // 0414... → 58414...
  else if (n.length === 10 && n.startsWith('4')) n = '58' + n; // 414... → 58414...
  return `https://wa.me/${n}?text=${encodeURIComponent('Hola Raciel, vengo de la academia y tengo una pregunta.')}`;
};

/* ============ Vistas: alumno ============ */
function vSetup() {
  return `<section class="hello"><p>Falta un paso</p><h1>Conecta la base de datos</h1></section>
    <p class="note plain">Abre el archivo <b>config.js</b> y escribe la dirección del proyecto y la clave pública de Supabase (Project Settings → API).</p>`;
}
function vHome() {
  const list = S.courses.filter(c => c.active);
  const going = S.courses.filter(c => S.enroll.includes(c.id));
  const banners = (S.settings.banners || []).map(mediaURL).filter(Boolean);
  const slides = banners.length ? banners.map(u => `<div class="slide"><img src="${esc(u)}" alt=""></div>`).join('')
    : `<div class="slide"><div class="slide-default"><span class="big">RACIEL CHIRINO</span><span class="rule">escuela de</span><span class="sub">Contenido</span></div></div>`;
  return `
    <section class="homehead">${me() ? `<a href="#/profile">${avEl()}</a>` : `<span class="av"><img src="icons/icon-192.png" alt=""></span>`}
      <div class="t"><p>${greet().replace(',', '')},</p><h1>${esc(S.user?.name || 'Bienvenida a la academia')}</h1></div>
      ${waLink() ? `<a class="roundbtn" href="${waLink()}" target="_blank" rel="noopener" aria-label="Escríbeme por WhatsApp">${ic.wa}</a>` : ''}
    </section>
    ${S.offline ? '<p class="note warn">Sin conexión. Estás viendo la última información guardada.</p>' : ''}
    <section class="carousel">
      <div class="slides" id="slides">${slides}</div>
      ${banners.length > 1 ? `<div class="dots" id="dots">${banners.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    </section>
    ${going.length ? `<section class="sec">
      <div class="sec-head"><h2>Mis cursos</h2><a href="#/mine">Ver todos</a></div>
      <div class="mylist">${going.slice(0, 2).map(myCard).join('')}</div>
    </section>` : ''}
    <section class="sec">
      <div class="sec-head"><h2>Todos los cursos</h2></div>
      ${list.length ? `<div class="grid">${list.map(c => `
        <a class="tile" style="${bstyle(c)}" href="#/course/${c.id}">${statusChip(c)}${icoEl(c)}
          <div class="b"><h3>${esc(c.title)}</h3>
            <div class="meta"><span>${c.lessons.length} lecciones</span><span class="price">$${esc(c.price)}</span></div></div>
        </a>`).join('')}</div>` : `<p class="note plain">${S.loaded ? 'Pronto habrá cursos disponibles.' : 'Cargando cursos…'}</p>`}
    </section>`;
}
function statusChip(c) {
  if (S.enroll.includes(c.id)) return '<span class="chip ok">Tienes acceso</span>';
  const r = lastReq(c.id);
  if (r && r.status === 'pendiente') return '<span class="chip warn">Pago en revisión</span>';
  return '';
}
function lessonRows(c, currentId) {
  const acc = hasAccess(c.id);
  return `<ol class="lessons">${c.lessons.map((l, i) => {
    const d = done(l.id);
    const tile = !acc ? ic.lock : d ? ic.check : `<span class="pc">${ic.play}</span>`;
    const inner = `<span class="n">${tile}</span><span class="t">${esc(l.title)}<span>${i + 1}. ${esc(minLabel(l.dur) || 'Próximamente')}</span></span>`;
    return `<li>${acc ? `<a class="lesson${d ? ' done' : ''}${l.id === currentId ? ' current' : ''}" style="${bstyle(c)}" href="#/lesson/${c.id}/${l.id}">${inner}</a>` : `<div class="lesson locked">${inner}</div>`}</li>`;
  }).join('')}</ol>`;
}
function vCourse(id) {
  const c = course(id);
  if (!c) return `<p class="note plain">${S.loaded ? 'Este curso no está disponible.' : 'Cargando…'}</p>`;
  const acc = hasAccess(id), r = lastReq(id);
  const next = c.lessons.find(l => !done(l.id)) || c.lessons[0];
  let cta = '', note = '';
  if (acc) cta = next ? `<a class="btn primary" href="#/lesson/${c.id}/${next.id}">${c.lessons.some(l => done(l.id)) ? `Continuar · ${pct(c)}%` : 'Empezar el curso'}</a>` : '';
  else if (r && r.status === 'pendiente') note = `<p class="note warn"><b>Recibimos tu comprobante.</b> Raciel lo está revisando y activará tu curso en cuanto confirme el pago.</p>`;
  else {
    if (r && r.status === 'rechazado') note = `<p class="note bad">Tu último comprobante no se pudo confirmar. Revisa los datos del pago y envíalo de nuevo.</p>`;
    cta = `<button class="btn primary" data-act="buy" data-id="${c.id}">Inscribirme por $${esc(c.price)}</button>`;
  }
  const cover = mediaURL(c.cover_path);
  return `<section class="chero" style="${bstyle(c)}">
      <div class="head">${icoEl(c)}<div style="min-width:0"><h1>${esc(c.title)}</h1><p class="by">por Raciel Chirino</p></div></div>
      <div class="meta"><span>${esc(c.level)}</span><span>${ic.play} ${human(total(c))}</span><span>${c.lessons.length} lecciones</span>${acc ? '' : `<span>$${esc(c.price)}</span>`}</div>
    </section>
    ${note}
    <section class="about">
      <h2>Sobre este curso</h2>
      <p class="clamp" id="aboutTxt">${esc(c.tagline || 'Pronto agregaremos la descripción de este curso.')}</p>
      <button class="more" data-act="more" aria-label="Ver más" aria-expanded="false"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
      ${cover ? `<div class="img coverimg"><img src="${esc(cover)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></div>` : ''}
    </section>
    <section class="sec"><div class="sec-head"><h2>Contenido</h2></div>${lessonRows(c)}</section>
    ${cta ? `<div class="cta"><div class="wrap">${cta}</div></div>` : ''}`;
}
function vLesson(cid, lid) {
  const c = course(cid);
  if (!c) return `<p class="note plain">Cargando…</p>`;
  if (!hasAccess(cid)) { setTimeout(() => go('course/' + cid)); return ''; }
  const i = c.lessons.findIndex(l => l.id === lid), l = c.lessons[i];
  if (!l) return `<p class="note plain">Lección no encontrada.</p>`;
  const nx = c.lessons[i + 1], d = done(l.id), p = pct(c);
  return `<div class="player" id="player" data-c="${c.id}" data-lid="${l.id}"><div class="empty">Cargando video…</div></div>
    <div class="detail-head"><p class="meta">Lección ${i + 1} de ${c.lessons.length} · ${esc(l.dur || '')}</p><h1>${esc(l.title)}</h1></div>
    <div class="row">
      <button class="btn ${d ? '' : 'dark'}" data-act="markDone" data-l="${l.id}">${d ? ic.check + ' Vista' : 'Marcar como vista'}</button>
      ${nx ? `<a class="btn primary" href="#/lesson/${c.id}/${nx.id}">Siguiente lección</a>` : ''}
    </div>
    <div class="sec" style="gap:8px"><div class="row" style="justify-content:space-between"><b style="font-weight:500">Tu avance</b><span class="muted small">${p}%</span></div><div class="progress"><span style="width:${p}%"></span></div></div>
    <section class="sec"><div class="sec-head"><h2>Lecciones</h2></div>${lessonRows(c, l.id)}</section>`;
}
function vMine() {
  if (!me()) return `<section class="hello"><h1>Mis Cursos</h1></section><p class="note plain">Entra a tu cuenta en <a href="#/profile" style="color:var(--coral);font-weight:500">Perfil</a> para ver tus cursos.</p>`;
  const mine = S.courses.filter(c => S.enroll.includes(c.id));
  const pend = S.reqs.filter(r => r.status === 'pendiente');
  return `<section class="hello"><h1>Mis Cursos</h1></section>
    ${pend.map(r => `<p class="note warn">Pago en revisión: <b>${esc(course(r.course_id)?.title || '')}</b></p>`).join('')}
    ${mine.length ? `<div class="mylist">${mine.map(myCard).join('')}</div>`
      : `<p class="note plain">Aún no tienes cursos activos. <a href="#/home" style="color:var(--coral);font-weight:500">Explora el catálogo</a>.</p>`}`;
}
let installEvt = null, authMode = 'in';
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function vProfile() {
  const st = S.settings;
  const install = standalone ? '' : `<div class="panel"><b style="font-weight:500">Instala la app</b>
    ${installEvt ? `<p class="muted small">Agrégala a tu pantalla de inicio y ábrela como cualquier app.</p><button class="btn primary" data-act="install">Instalar</button>`
      : isIOS ? `<p class="muted small">En iPhone: toca Compartir en Safari y luego <b>Agregar a pantalla de inicio</b>.</p>`
      : `<p class="muted small">En Android: abre el menú de Chrome (⋮) y toca <b>Instalar app</b>.</p>`}</div>`;
  const auth = `<div class="panel" style="align-items:stretch;text-align:center">
      <b style="font-weight:500;font-size:1.15rem">Entra a la academia</b>
      <p class="muted small">Usa tu cuenta de Google. Si es tu primera vez, se crea tu cuenta automáticamente.</p>
      <div id="gsi" class="gsi"><span class="btn block gbtn" aria-disabled="true" style="opacity:.6;cursor:wait">${ic.google}Cargando Google…</span></div>
      <p class="small muted">Al continuar aceptas las <a href="terminos.html" style="color:var(--coral)">Condiciones del Servicio</a> y la <a href="privacidad.html" style="color:var(--coral)">Política de Privacidad</a>.</p>
    </div>`;
  return `<section class="hello"><h1>Perfil</h1></section>
    ${me() ? `<div class="row" style="gap:16px">${avEl('avatar')}<div style="min-width:0"><h2 style="font-size:1.25rem">${esc(S.user.name)}</h2><p class="muted" style="overflow-wrap:anywhere">${esc(S.user.email)}</p></div></div>` : auth}
    ${install}
    ${waLink() ? `<a class="btn block wa" href="${waLink()}" target="_blank" rel="noopener">${ic.wa}Escríbeme por WhatsApp</a>`
      : isAdmin() ? '<p class="note plain small">Agrega tu número de WhatsApp en Panel de administradora → Ajustes para mostrar el botón de contacto.</p>' : ''}
    <div class="menu">
      ${me() ? `<a href="#/mine">Mis Cursos${ic.chev}</a>` : ''}
      ${isAdmin() ? `<a href="#/admin">Panel de administradora${ic.chev}</a>` : ''}
      <a href="privacidad.html">Política de Privacidad${ic.chev}</a>
      <a href="terminos.html">Condiciones del Servicio${ic.chev}</a>
      ${me() ? `<button data-act="logout" style="color:var(--bad)">Cerrar sesión</button>` : ''}
    </div>`;
}

/* ============ Vistas: administradora ============ */
let adminTab = 'req';
const vNoAdmin = () => `<p class="note plain" style="margin-top:16px">Esta sección es solo para la administradora. Entra en Perfil con la cuenta de Raciel.</p>`;
function vAdmin() {
  const pend = S.allReqs.filter(r => r.status === 'pendiente').length;
  let body;
  if (adminTab === 'req') {
    const reqs = [...S.allReqs].sort((a, b) => (a.status === 'pendiente' ? 0 : 1) - (b.status === 'pendiente' ? 0 : 1));
    body = reqs.length ? reqs.map(r => `
      <div class="req">
        <button class="thumb" data-act="viewCap" data-path="${esc(r.capture_path)}" aria-label="Ver comprobante"><img data-cap="${esc(r.capture_path)}" alt=""></button>
        <div class="info">
          <span class="chip ${r.status === 'pendiente' ? 'warn' : r.status === 'aprobado' ? 'ok' : 'bad'}">${r.status === 'pendiente' ? 'Por revisar' : r.status === 'aprobado' ? 'Aprobado' : 'Rechazado'}</span>
          <b>${esc(r.name)}</b><span>${esc(r.email)}</span>
          <span>${esc(course(r.course_id)?.title || 'Curso eliminado')} · $${esc(r.amount)} · ${fecha(r.created_at)}</span>
          ${r.ref ? `<span>Referencia: ${esc(r.ref)}</span>` : ''}
          ${r.status === 'pendiente' ? `<div class="row" style="margin-top:4px"><button class="btn sm primary" data-act="approve" data-id="${r.id}">${ic.check} Activar curso</button><button class="btn sm danger" data-act="reject" data-id="${r.id}">Rechazar</button></div>` : ''}
        </div>
      </div>`).join('') : '<p class="note plain">Aquí aparecerán los comprobantes que envíen tus alumnos. Revisa el capture, confirma el pago en tu banco y toca Activar curso.</p>';
  } else if (adminTab === 'courses') {
    body = `${S.courses.map(c => `
      <div class="crow">${coverEl(c)}
        <div class="t"><b>${esc(c.title)}</b><span>${c.lessons.length} lecciones · $${esc(c.price)} · ${c.lessons.filter(l => l.has_video).length} videos</span></div>
        <div class="acts"><label class="switch"><input type="checkbox" data-toggle="${c.id}" ${c.active ? 'checked' : ''} aria-label="Curso visible: ${esc(c.title)}"><span></span></label>
        <a class="btn sm" href="#/edit/${c.id}">Editar</a></div>
      </div>`).join('')}
      <button class="btn dark" data-act="newCourse">Nuevo curso</button>
      <p class="small muted">El interruptor muestra u oculta el curso en el catálogo. Quien ya pagó conserva su acceso.</p>`;
  } else {
    const st = S.settings;
    body = `<div class="panel"><b style="font-weight:500">Banners de inicio</b><p class="small muted">Las imágenes que se deslizan arriba en Explorar. Tamaño ideal 1600 × 900 (horizontal).</p>
        ${(st.banners || []).length ? `<div class="bangrid">${st.banners.map((b, i) => `<div class="it"><img src="${esc(mediaURL(b))}" alt=""><button data-act="delBanner" data-i="${i}" aria-label="Quitar banner">${ic.x}</button></div>`).join('')}</div>` : '<p class="note plain">Sin banners. Se muestra el diseño de la academia.</p>'}
        <label class="btn" for="banIn">Agregar banner</label><input class="sr" type="file" id="banIn" accept="image/*"></div>
      <form class="panel" id="setForm">
        <label class="f">Datos para pagar<small>Lo que ve el alumno al inscribirse: banco, Pago Móvil, Zelle, titular.</small><textarea class="in" id="sBank">${esc(st.bank)}</textarea></label>
        <div class="grid2">
          <label class="f">WhatsApp<input class="in" id="sWa" value="${esc(st.whatsapp)}" placeholder="+58 414 000 0000"></label>
          <label class="f">Correo de la academia<input class="in" id="sEmail" type="email" value="${esc(st.email)}"></label>
        </div>
        <button class="btn primary">Guardar ajustes</button></form>`;
  }
  return `<section class="hello"><p>Administradora</p><h1>Hola, Raciel</h1></section>
    <div class="seg" role="tablist">
      <button class="${adminTab === 'req' ? 'on' : ''}" data-act="tab" data-t="req">Pagos${pend ? `<span class="badge">${pend}</span>` : ''}</button>
      <button class="${adminTab === 'courses' ? 'on' : ''}" data-act="tab" data-t="courses">Cursos</button>
      <button class="${adminTab === 'set' ? 'on' : ''}" data-act="tab" data-t="set">Ajustes</button>
    </div>
    <div class="courses" style="gap:14px">${body}</div>`;
}
function vEdit(id) {
  const c = course(id);
  if (!c) return `<p class="note plain">Curso no encontrado.</p>`;
  return `
    <div class="panel"><b style="font-weight:500">Portada</b>
      <div class="coveredit">${coverEl(c)}</div>
      <p class="small muted">Sube la imagen del curso tal como la diseñaste. Tamaño ideal 1600 × 900 (horizontal).</p>
      <div class="row"><label class="btn" for="covIn">${c.cover_path ? 'Cambiar portada' : 'Subir portada'}</label><input class="sr" type="file" id="covIn" accept="image/*" data-id="${c.id}">
      ${c.cover_path ? `<button class="btn danger" data-act="delCover" data-id="${c.id}">Quitar</button>` : ''}</div>
    </div>
    <form class="panel" id="courseForm" data-id="${c.id}">
      <label class="f">Nombre del curso<input class="in" id="cTitle" value="${esc(c.title)}" required></label>
      <label class="f">Descripción<textarea class="in" id="cTag" style="min-height:100px">${esc(c.tagline)}</textarea></label>
      <div class="grid2">
        <label class="f">Precio (USD)<input class="in" id="cPrice" type="number" min="0" step="1" value="${esc(c.price)}" required></label>
        <label class="f">Nivel<select class="in" id="cLevel">${['Principiante', 'Intermedio', 'Avanzado'].map(v => `<option ${v === c.level ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <div class="grid2">
        <label class="f">Texto grande de la portada provisional<input class="in" id="cKick" value="${esc(c.kicker || '')}" maxlength="18"></label>
        <label class="f">Texto pequeño<input class="in" id="cSub" value="${esc(c.sub || '')}" maxlength="24"></label>
      </div>
      <div class="f" style="display:flex;flex-direction:column;gap:8px;font-size:.9rem;font-weight:500">Color de la franja
        <div class="bandpreview" id="bandPrev" style="--b:${bandColor(c.band)};color:${bandText(c.band)}"><b>${esc(c.title)}</b><div class="pr"><div class="bar"><span style="width:40%"></span></div>40%</div></div>
        ${PALETTE.map(([g, cs]) => `<div class="swgroup"><span class="swlabel">${g}</span><div class="swatches">${cs.map(([hex, n]) => `<label title="${n}"><input type="radio" name="band" value="${hex}" ${bandColor(c.band).toUpperCase() === hex ? 'checked' : ''} aria-label="${n}"><i style="background:${hex}"></i></label>`).join('')}</div></div>`).join('')}
        <div class="swgroup"><span class="swlabel">Otro color</span>
          <label class="custom"><input type="radio" name="band" value="custom" id="bandCustomRadio" ${ALL_COLORS.some(([h]) => h === bandColor(c.band).toUpperCase()) ? '' : 'checked'}><input type="color" id="bandCustom" value="${bandColor(c.band)}" aria-label="Elegir cualquier color"><span>Elegir cualquier color</span></label></div></div>
      <button class="btn primary">Guardar curso</button>
    </form>
    <section class="sec"><div class="sec-head"><h2>Lecciones</h2></div>
    ${c.lessons.length ? `<div>${c.lessons.map((l, i) => `<div class="elesson">
      <span class="muted">${i + 1}</span>
      <span class="t"><b>${esc(l.title)}</b><span>${esc(l.dur || '--:--')} · ${l.has_video ? 'Con video' : 'Falta el video'}</span></span>
      <span class="row" style="gap:6px">
        <button class="btn sm" data-act="setLink" data-c="${c.id}" data-l="${l.id}">${l.has_video ? 'Cambiar video' : 'Poner video'}</button>
        <button class="btn sm" data-act="moveL" data-c="${c.id}" data-l="${l.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
        <button class="btn sm danger" data-act="delL" data-c="${c.id}" data-l="${l.id}">Quitar</button>
      </span></div>`).join('')}</div>` : '<p class="note plain">Este curso aún no tiene lecciones.</p>'}</section>
    <form class="panel" id="lessonForm" data-id="${c.id}">
      <b style="font-weight:500">Agregar lección</b>
      <label class="f">Título<input class="in" id="lTitle" required></label>
      <label class="f">Enlace del video<small>Pega el enlace de Bunny Stream, Cloudflare Stream, YouTube (oculto) o Vimeo. Se reproduce dentro de la app y solo lo ven quienes tienen el curso.</small><input class="in" id="lUrl" type="url" placeholder="https://"></label>
      <label class="f">o sube un video corto<small>Solo para clips de hasta ${MAX_VIDEO_MB} MB. Las clases completas (.MOV de varios GB) van por enlace.</small><input class="in" id="lFile" type="file" accept="video/*"></label>
      <label class="f">Duración<small>Se calcula sola si subes el video.</small><input class="in" id="lDur" placeholder="08:30" pattern="\\d{1,2}:\\d{2}(:\\d{2})?"></label>
      <button class="btn dark" id="lBtn">Agregar lección</button>
    </form>
    <button class="btn danger" data-act="delCourse" data-id="${c.id}">Eliminar curso</button>`;
}

/* ============ Hojas ============ */
let capFile = null;
function openSheet(html) { $('#sheetIn').innerHTML = html; $('#sheet').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; $('#sheetIn').innerHTML = ''; capFile = null; }
const sheetHead = t => `<div class="sheet-head"><h2>${t}</h2><button class="iconbtn" style="margin:0" data-act="close" aria-label="Cerrar">${ic.x}</button></div>`;
function buySheet(c) {
  if (!me()) { go('profile'); return toast('Entra con Google para inscribirte'); }
  openSheet(`${sheetHead('Inscripción')}
    <div class="row" style="justify-content:space-between"><b style="font-weight:500">${esc(c.title)}</b><b style="font-size:1.2rem">$${esc(c.price)}</b></div>
    <form id="payForm" class="courses" style="gap:16px" data-id="${c.id}">
      <div class="bcv" id="bcvBox" data-price="${esc(c.price)}">
        <div class="bcv-top"><img src="images/bcv.png" alt="" width="34" height="34"><span>Tasa Banco Central de Venezuela</span></div>
        <div class="bcv-rate"><span class="usd">$1</span><span class="eq">=</span><b id="bcvRate">Buscando la tasa…</b></div>
        <div class="bcv-total" id="bcvTotal" hidden></div>
        <small id="bcvDate"></small>
      </div>
      <div class="courses" style="gap:8px"><b style="font-weight:500">1. Paga $${esc(c.price)} a estos datos</b>
        <pre class="bank" id="bankTxt">${esc(S.settings.bank)}</pre>
        <button type="button" class="btn sm" data-act="copyBank" style="align-self:flex-start">Copiar datos</button></div>
      <div class="courses" style="gap:8px"><b style="font-weight:500">2. Sube el capture del pago</b>
        <label class="drop" for="capIn" id="capDrop"><span>Toca para elegir la imagen</span><span class="small">JPG o PNG</span></label>
        <input class="sr" type="file" id="capIn" accept="image/*"></div>
      <label class="f">Número de referencia <small>Opcional</small><input class="in" id="pRef" inputmode="numeric"></label>
      <button class="btn primary" id="paySend">Enviar comprobante</button>
    </form>`);
  loadTasa();
}
const fmtBs = n => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function loadTasa() {
  const box = $('#bcvBox'); if (!box) return;
  const price = Number(box.dataset.price) || 0;
  try {
    const r = await fetch('/api/tasa', { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok || !(d.usd > 0)) throw new Error(d.error || 'sin tasa');
    if (!document.body.contains(box)) return;
    $('#bcvRate').textContent = `Bs. ${fmtBs(d.usd)}`;
    const dia = new Date((d.vigente || d.fecha) + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#bcvDate').textContent = `Esta tasa vale por hoy, ${dia}, hasta las 11:59 p. m.`;
    clearTimeout(window._tasaT);
    if (d.vence) { const ms = new Date(d.vence).getTime() - Date.now() + 2000; if (ms > 0 && ms < 864e5) window._tasaT = setTimeout(loadTasa, ms); }
    const t = $('#bcvTotal'); t.hidden = false;
    t.innerHTML = `<span>Si pagas en bolívares, tu curso te sale en</span><b>Bs. ${fmtBs(price * d.usd)}</b>`;
  } catch (e) {
    if (!document.body.contains(box)) return;
    $('#bcvRate').textContent = 'Uy, no cargó';
    $('#bcvDate').innerHTML = 'No pudimos traer la tasa ahorita. Puedes verla en <a href="https://www.bcv.org.ve/" target="_blank" rel="noopener">bcv.org.ve</a> o escribirle a Raciel.';
  }
}
function newPassSheet() {
  openSheet(`${sheetHead('Nueva contraseña')}<form id="newPassForm" class="courses" style="gap:14px">
    <label class="f">Escribe tu nueva contraseña<input class="in" id="npPass" type="password" minlength="6" required autocomplete="new-password"></label>
    <button class="btn primary">Guardar contraseña</button></form>`);
}
async function shrink(file, max = 1600) {
  try {
    const img = await createImageBitmap(file); const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise(r => cv.toBlob(b => r(b || file), 'image/jpeg', .88));
  } catch (e) { return file; }
}
async function uploadMedia(file, prefix) {
  const blob = await shrink(file, 1800);
  const path = `${prefix}/${newId()}.jpg`;
  const { error } = await sb.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return path;
}
const isStoragePath = p => p && !p.startsWith('images/') && !p.startsWith('http');

/* ============ Render ============ */
let lastRoute = '';
function go(r) { location.hash = '/' + r; }
function render() {
  const route = location.hash.replace(/^#\/?/, '') || 'home';
  const [v, a, b] = route.split('/');
  let html, title = '';
  if (!sb) html = vSetup();
  else if (v === 'course') { html = vCourse(a); title = 'Curso'; }
  else if (v === 'lesson') { html = vLesson(a, b); title = course(a)?.title || ''; }
  else if (v === 'mine') html = vMine();
  else if (v === 'profile') html = vProfile();
  else if (v === 'admin') { html = isAdmin() ? vAdmin() : vNoAdmin(); title = 'Administradora'; }
  else if (v === 'edit') { html = isAdmin() ? vEdit(a) : vNoAdmin(); title = 'Editar curso'; }
  else html = vHome();
  $('#view').innerHTML = html;
  const tab = { course: 'home', lesson: 'mine', admin: 'profile', edit: 'profile' }[v] || v || 'home';
  document.querySelectorAll('.tabs a').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  document.body.classList.toggle('has-cta', !!$('#view .cta'));
  $('#top').hidden = ['home', 'mine', 'profile', ''].includes(v); $('#topTitle').textContent = title;
  if (route !== lastRoute) { scrollTo(0, 0); lastRoute = route; }
  after();
}
const embed = url => {
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1&playsinline=1`;
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/);
  if (m) return `https://player.vimeo.com/video/${m[1]}${m[2] ? '?h=' + m[2] : ''}`;
  m = url.match(/(?:iframe|player)\.mediadelivery\.net\/(?:play|embed)\/(\d+)\/([\w-]+)/);
  if (m) return `https://iframe.mediadelivery.net/embed/${m[1]}/${m[2]}?autoplay=false&preload=true&responsive=true`;
  m = url.match(/(customer-[\w]+\.cloudflarestream\.com|iframe\.videodelivery\.net|watch\.cloudflarestream\.com)\/([a-f0-9]{32})/);
  if (m) return m[1].startsWith('customer-') ? `https://${m[1]}/${m[2]}/iframe` : `https://iframe.videodelivery.net/${m[2]}`;
  return null;
};
/* Botón oficial de Google: Google muestra racielchirinoacademy.com en vez de la dirección de Supabase */
let gsiLoading = null;
const loadGsi = () => gsiLoading || (gsiLoading = new Promise((res, rej) => {
  if (window.google?.accounts?.id) return res();
  const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
  sc.onload = res; sc.onerror = () => { gsiLoading = null; rej(); }; document.head.appendChild(sc);
}));
async function sha256hex(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function mountGoogle() {
  const box = $('#gsi');
  if (!box || !CFG.googleClientId || !crypto.subtle) return;
  try {
    await loadGsi();
    if (!document.body.contains(box)) return;
    const nonce = newId() + newId();
    google.accounts.id.initialize({
      client_id: CFG.googleClientId, nonce: await sha256hex(nonce), ux_mode: 'popup', use_fedcm_for_prompt: true, context: 'signin', itp_support: true,
      callback: async resp => {
        try {
          const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: resp.credential, nonce });
          if (error) throw error;
        } catch (err) { toast(friendly(err)); }
      }
    });
    box.innerHTML = '';
    google.accounts.id.renderButton(box, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', locale: 'es', width: Math.min(400, Math.max(240, box.clientWidth || 320)) });
  } catch (e) {
    if (document.body.contains(box)) box.innerHTML = `<button class="btn block gbtn" data-act="gsiRetry">${ic.google}No cargó Google · Reintentar</button>`;
  }
}

async function after() {
  mountGoogle();
  const sl = $('#slides'), dots = $('#dots');
  clearInterval(window._auto);
  if (sl && dots) {
    sl.addEventListener('scroll', () => { const i = Math.round(sl.scrollLeft / sl.clientWidth); dots.querySelectorAll('i').forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true });
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) window._auto = setInterval(() => {
      if (!document.body.contains(sl)) return clearInterval(window._auto);
      const n = sl.children.length, i = Math.round(sl.scrollLeft / sl.clientWidth);
      sl.scrollTo({ left: ((i + 1) % n) * sl.clientWidth, behavior: 'smooth' });
    }, 5000);
  }
  for (const im of document.querySelectorAll('img[data-cap]')) {
    if (!im.dataset.cap) { im.remove(); continue; }
    const { data } = await sb.storage.from('captures').createSignedUrl(im.dataset.cap, 3600);
    if (data?.signedUrl) im.src = data.signedUrl; else im.remove();
  }
  const p = $('#player');
  if (p) {
    const c = course(p.dataset.c), l = c?.lessons.find(x => x.id === p.dataset.lid);
    if (!l) return;
    const { data: vd, error: ve } = await sb.rpc('lesson_video', { lid: l.id });
    const v = (vd && vd[0]) || {};
    if (ve) { p.innerHTML = '<div class="empty">No se pudo cargar el video. Revisa tu conexión.</div>'; return; }
    if (v.video_path) {
      const { data, error } = await sb.storage.from('videos').createSignedUrl(v.video_path, 4 * 3600);
      p.innerHTML = data?.signedUrl ? `<video controls playsinline preload="metadata" src="${esc(data.signedUrl)}" controlslist="nodownload"></video>`
        : `<div class="empty">${error ? 'No se pudo cargar el video. Revisa tu conexión.' : 'Video no disponible.'}</div>`;
    } else if (v.video_url) {
      const e = embed(v.video_url);
      if (e) p.innerHTML = `<iframe src="${esc(e)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen title="${esc(l.title)}"></iframe>`;
      else if (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(v.video_url)) p.innerHTML = `<video controls playsinline preload="metadata" src="${esc(v.video_url)}"></video>`;
      else p.innerHTML = `<div class="empty">Este video se abre en otra pestaña.<a href="${esc(v.video_url)}" target="_blank" rel="noopener">Ver la lección</a></div>`;
    } else p.innerHTML = `<div class="empty">El video de esta lección todavía no se ha subido.</div>`;
    const vid = p.querySelector('video');
    if (vid) vid.addEventListener('ended', () => { if (!done(l.id)) toggleDone(l.id, true); });
  }
}
async function refresh() { await loadAll(); render(); }
async function toggleDone(lid, quiet) {
  if (!me()) return;
  const was = done(lid);
  if (was && !quiet) { delete S.done[lid]; render(); await sb.from('progress').delete().eq('user_id', S.user.id).eq('lesson_id', lid); }
  else if (!was) { S.done[lid] = true; render(); await sb.from('progress').insert({ lesson_id: lid }); if (quiet) toast('Lección completada'); }
}

/* ============ Eventos ============ */
let armed = null;
document.addEventListener('click', async e => {
  if (e.target.id === 'sheet') return closeSheet();
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act;
  try {
    if (a === 'buy') buySheet(course(t.dataset.id));
    else if (a === 'close') closeSheet();
    else if (a === 'gsiRetry') { gsiLoading = null; render(); }
    else if (a === 'more') { const p = $('#aboutTxt'); const open = p.classList.toggle('clamp') === false; t.classList.toggle('open', open); t.setAttribute('aria-expanded', open); }
    else if (a === 'authMode') { authMode = t.dataset.m; render(); }
    else if (a === 'copyBank') {
      try { await navigator.clipboard.writeText(S.settings.bank); toast('Datos copiados'); }
      catch (err) { const r = document.createRange(); r.selectNodeContents($('#bankTxt')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Datos seleccionados, cópialos'); }
    }
    else if (a === 'markDone') toggleDone(t.dataset.l);
    else if (a === 'logout') { await sb.auth.signOut(); toast('Sesión cerrada'); go('home'); }
    else if (a === 'install' && installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); }
    else if (a === 'tab') { adminTab = t.dataset.t; render(); }
    else if (a === 'approve' || a === 'reject') {
      const r = S.allReqs.find(x => x.id === t.dataset.id); if (!r) return;
      const done_ = busy(t, a === 'approve' ? 'Activando…' : 'Rechazando…');
      if (a === 'approve') { const { error } = await sb.from('enrollments').upsert({ user_id: r.user_id, course_id: r.course_id }); if (error) { done_(); throw error; } }
      const { error } = await sb.from('requests').update({ status: a === 'approve' ? 'aprobado' : 'rechazado' }).eq('id', r.id);
      if (error) { done_(); throw error; }
      await refresh(); toast(a === 'approve' ? `Curso activado para ${r.name}` : 'Comprobante rechazado');
    }
    else if (a === 'viewCap') {
      const { data } = await sb.storage.from('captures').createSignedUrl(t.dataset.path, 3600);
      openSheet(`${sheetHead('Comprobante')}${data?.signedUrl ? `<img src="${esc(data.signedUrl)}" alt="Capture del pago" style="border-radius:14px;width:100%">` : '<p class="note plain">No hay imagen guardada.</p>'}`);
    }
    else if (a === 'newCourse') {
      const id = 'curso-' + newId().slice(0, 8);
      const { error } = await sb.from('courses').insert({ id, title: 'Curso nuevo', kicker: 'Nuevo', sub: 'curso', band: 'rosa', price: 20, active: false, position: S.courses.length + 1 });
      if (error) throw error;
      await loadAll(); go('edit/' + id);
    }
    else if (a === 'delCover') {
      const c = course(t.dataset.id); const old = c.cover_path;
      const { error } = await sb.from('courses').update({ cover_path: null }).eq('id', c.id); if (error) throw error;
      if (isStoragePath(old)) sb.storage.from('media').remove([old]);
      await refresh(); toast('Portada quitada');
    }
    else if (a === 'delBanner') {
      const list = [...(S.settings.banners || [])]; const [old] = list.splice(+t.dataset.i, 1);
      const { error } = await sb.from('settings').update({ banners: list }).eq('id', 1); if (error) throw error;
      if (isStoragePath(old)) sb.storage.from('media').remove([old]);
      await refresh(); toast('Banner quitado');
    }
    else if (a === 'delCourse' || a === 'delL') {
      const key = a + (t.dataset.id || t.dataset.l);
      if (armed !== key) { armed = key; t.classList.add('armed'); t.textContent = 'Toca otra vez para confirmar'; setTimeout(() => { if (armed === key) { armed = null; render(); } }, 3000); return; }
      armed = null;
      if (a === 'delCourse') {
        const c = course(t.dataset.id);
        const vids = (await Promise.all(c.lessons.map(l => sb.rpc('lesson_video', { lid: l.id })))).map(x => x.data?.[0]?.video_path).filter(Boolean);
        const { error } = await sb.from('courses').delete().eq('id', c.id); if (error) throw error;
        if (vids.length) sb.storage.from('videos').remove(vids);
        if (isStoragePath(c.cover_path)) sb.storage.from('media').remove([c.cover_path]);
        await loadAll(); toast('Curso eliminado'); go('admin');
      } else {
        const l = course(t.dataset.c).lessons.find(x => x.id === t.dataset.l);
        const { data: vd } = await sb.rpc('lesson_video', { lid: l.id });
        const { error } = await sb.from('lessons').delete().eq('id', l.id); if (error) throw error;
        if (vd?.[0]?.video_path) sb.storage.from('videos').remove([vd[0].video_path]);
        await refresh(); toast('Lección quitada');
      }
    }
    else if (a === 'setLink') {
      const l = course(t.dataset.c).lessons.find(x => x.id === t.dataset.l);
      const { data: vd } = await sb.rpc('lesson_video', { lid: l.id });
      openSheet(`${sheetHead('Video de la lección')}<p class="muted">${esc(l.title)}</p>
        <form id="linkForm" class="courses" style="gap:14px" data-l="${l.id}">
          <label class="f">Enlace del video<small>Bunny Stream, Cloudflare Stream, YouTube (oculto) o Vimeo.</small><input class="in" id="lkUrl" type="url" required value="${esc(vd?.[0]?.video_url || '')}" placeholder="https://"></label>
          <label class="f">Duración<input class="in" id="lkDur" value="${esc(l.dur || '')}" placeholder="25:40" pattern="\\d{1,2}:\\d{2}(:\\d{2})?"></label>
          <button class="btn primary">Guardar video</button></form>`);
    }
    else if (a === 'moveL') {
      const c = course(t.dataset.c), i = c.lessons.findIndex(l => l.id === t.dataset.l);
      if (i <= 0) return;
      const list = [...c.lessons]; [list[i - 1], list[i]] = [list[i], list[i - 1]];
      await Promise.all(list.map((l, j) => sb.from('lessons').update({ position: j + 1 }).eq('id', l.id)));
      await refresh();
    }
  } catch (err) { toast(friendly(err)); }
});
document.addEventListener('input', e => {
  if (e.target.id !== 'bandCustom') return;
  $('#bandCustomRadio').checked = true;
  const pv = $('#bandPrev'); if (pv) { pv.style.setProperty('--b', e.target.value); pv.style.color = bandText(e.target.value); }
});
document.addEventListener('change', async e => {
  const el = e.target;
  try {
    if (el.name === 'band' || el.id === 'bandCustom') {
    if (el.id === 'bandCustom') $('#bandCustomRadio').checked = true;
    const v = $('[name=band]:checked')?.value; const hex = v === 'custom' ? $('#bandCustom').value : v;
    const pv = $('#bandPrev'); if (pv && hex) { pv.style.setProperty('--b', hex); pv.style.color = bandText(hex); }
    return;
  }
  if (el.dataset.toggle) {
      const c = course(el.dataset.toggle);
      const { error } = await sb.from('courses').update({ active: el.checked }).eq('id', c.id); if (error) throw error;
      await refresh(); toast(el.checked ? 'Curso visible en el catálogo' : 'Curso oculto');
    }
    if (el.id === 'capIn' && el.files[0]) {
      capFile = el.files[0];
      $('#capDrop').innerHTML = `<img src="${URL.createObjectURL(capFile)}" alt="Vista previa del capture"><span class="small">Toca para cambiarla</span>`;
    }
    if (el.id === 'covIn' && el.files[0]) {
      toast('Subiendo portada…');
      const c = course(el.dataset.id); const old = c.cover_path;
      const path = await uploadMedia(el.files[0], 'covers');
      const { error } = await sb.from('courses').update({ cover_path: path }).eq('id', c.id); if (error) throw error;
      if (isStoragePath(old)) sb.storage.from('media').remove([old]);
      await refresh(); toast('Portada actualizada');
    }
    if (el.id === 'banIn' && el.files[0]) {
      toast('Subiendo banner…');
      const path = await uploadMedia(el.files[0], 'banners');
      const { error } = await sb.from('settings').update({ banners: [...(S.settings.banners || []), path] }).eq('id', 1); if (error) throw error;
      await refresh(); toast('Banner agregado');
    }
    if (el.id === 'lFile' && el.files[0]) {
      const f = el.files[0];
      if (f.size > MAX_VIDEO_MB * 1024 * 1024) toast(`Este video pesa ${Math.round(f.size / 1048576)} MB. El máximo es ${MAX_VIDEO_MB} MB; mejor usa un enlace.`);
      const v = document.createElement('video'); v.preload = 'metadata';
      v.onloadedmetadata = () => { if (isFinite(v.duration)) $('#lDur').value = mmss(v.duration); URL.revokeObjectURL(v.src); };
      v.src = URL.createObjectURL(f);
      if (!$('#lTitle').value) $('#lTitle').value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    }
  } catch (err) { toast(friendly(err)); }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button:not([type=button])');
  let restore = () => {};
  try {
    if (f.id === 'authForm') {
      const email = $('#aEmail').value.trim().toLowerCase(), password = $('#aPass').value;
      if (authMode === 'up') {
        restore = busy(btn, 'Creando cuenta…');
        const name = $('#aName').value.trim();
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        restore();
        if (!data.session) openSheet(`${sheetHead('Revisa tu correo')}<p>Te enviamos un enlace a <b>${esc(email)}</b>. Ábrelo para confirmar tu cuenta y luego entra con tu contraseña.</p><p class="small muted">Si no lo ves, revisa la carpeta de spam.</p><button class="btn primary" data-act="close">Entendido</button>`);
        authMode = 'in';
      } else {
        restore = busy(btn, 'Entrando…');
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    }
    else if (f.id === 'forgotForm') {
      restore = busy(btn, 'Enviando…');
      const { error } = await sb.auth.resetPasswordForEmail($('#fEmail').value.trim(), { redirectTo: location.origin + location.pathname });
      if (error) throw error;
      restore(); authMode = 'in'; render(); toast('Te enviamos el enlace. Revisa tu correo.');
    }
    else if (f.id === 'newPassForm') {
      restore = busy(btn, 'Guardando…');
      const { error } = await sb.auth.updateUser({ password: $('#npPass').value }); if (error) throw error;
      closeSheet(); toast('Contraseña actualizada');
    }
    else if (f.id === 'payForm') {
      if (!capFile) return toast('Sube el capture del pago');
      restore = busy(btn, 'Enviando…');
      const c = course(f.dataset.id); const rid = newId();
      const path = `${S.user.id}/${rid}.jpg`;
      const up = await sb.storage.from('captures').upload(path, await shrink(capFile, 1400), { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const { error } = await sb.from('requests').insert({ id: rid, email: S.user.email, name: S.user.name, course_id: c.id, amount: c.price, ref: $('#pRef').value.trim() || null, capture_path: path });
      if (error) throw error;
      closeSheet(); await refresh(); toast('Comprobante enviado');
    }
    else if (f.id === 'setForm') {
      restore = busy(btn, 'Guardando…');
      const { error } = await sb.from('settings').update({ bank: $('#sBank').value, whatsapp: $('#sWa').value.trim(), email: $('#sEmail').value.trim() }).eq('id', 1);
      if (error) throw error;
      await refresh(); toast('Ajustes guardados');
    }
    else if (f.id === 'courseForm') {
      restore = busy(btn, 'Guardando…');
      const { error } = await sb.from('courses').update({ title: $('#cTitle').value.trim(), tagline: $('#cTag').value.trim(), price: +$('#cPrice').value || 0, level: $('#cLevel').value,
        kicker: $('#cKick').value.trim(), sub: $('#cSub').value.trim(), band: (v => v === 'custom' ? $('#bandCustom').value.toUpperCase() : v)(f.querySelector('[name=band]:checked')?.value || '#E27BB5') }).eq('id', f.dataset.id);
      if (error) throw error;
      await refresh(); toast('Curso guardado');
    }
    else if (f.id === 'linkForm') {
      restore = busy(btn, 'Guardando…');
      const { error } = await sb.from('lessons').update({ video_url: $('#lkUrl').value.trim(), video_path: null, dur: $('#lkDur').value.trim() }).eq('id', f.dataset.l);
      if (error) throw error;
      closeSheet(); await refresh(); toast('Video guardado');
    }
    else if (f.id === 'lessonForm') {
      const c = course(f.dataset.id); const file = $('#lFile').files[0]; const url = $('#lUrl').value.trim();
      if (file && file.size > MAX_VIDEO_MB * 1024 * 1024) return toast(`El video pesa más de ${MAX_VIDEO_MB} MB. Súbelo a YouTube (oculto) o Vimeo y pega el enlace.`);
      const lid = newId(); const row = { id: lid, course_id: c.id, title: $('#lTitle').value.trim(), dur: $('#lDur').value.trim(), position: c.lessons.length + 1 };
      if (file) {
        restore = busy(btn, 'Subiendo video… no cierres la app');
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
        const path = `${c.id}/${lid}.${ext}`;
        const { error } = await sb.storage.from('videos').upload(path, file, { contentType: file.type || 'video/mp4' });
        if (error) throw error;
        row.video_path = path;
      } else if (url) row.video_url = url;
      restore = busy(btn, 'Guardando…');
      const { error } = await sb.from('lessons').insert(row); if (error) throw error;
      await refresh(); toast('Lección agregada');
    }
  } catch (err) { restore(); toast(friendly(err)); }
});
$('#back').addEventListener('click', () => history.length > 1 ? history.back() : go('home'));
addEventListener('hashchange', render);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (location.hash.includes('profile')) render(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
addEventListener('online', refresh);
/* ===== Siempre la versión más nueva ===== */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
let checkingVersion = false;
async function checkVersion() {
  if (checkingVersion || !navigator.onLine || !window.APP_VERSION) return;
  checkingVersion = true;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const { v } = await r.json();
    if (v && v !== window.APP_VERSION) {
      const key = 'rca_reload_' + v;
      let tried = false; try { tried = sessionStorage.getItem(key); sessionStorage.setItem(key, '1'); } catch (e) {}
      if (!tried) { location.reload(); return; }
    }
  } catch (e) {}
  checkingVersion = false;
}
addEventListener('hashchange', checkVersion);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
checkVersion();

render();
if (sb) {
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') { go('profile'); setTimeout(newPassSheet, 300); }
    if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) setTimeout(async () => { await refresh(); if (event === 'SIGNED_IN' && location.hash.includes('profile')) toast('Hola, ' + (S.user?.name || '').split(' ')[0]); }, 0);
  });
  refresh();
}
