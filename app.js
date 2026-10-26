// Piscinas Andalusí: scroll suave (Lenis + GSAP), portada que se recoge, tagline palabra a palabra,
// secciones fijas guiadas por el scroll, obra 3D, galería horizontal, menú en isla, visor y formulario por WhatsApp.
// Cada bloque va en safe(): si uno falla, el resto sigue funcionando y el contenido nunca queda oculto.
(() => {
  const safe = (fn, nombre) => { try { fn(); } catch (e) { console.warn(`[andalusi] ${nombre}`, e); } };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const raiz = document.documentElement;
  raiz.classList.add('js');
  // Red de seguridad: pase lo que pase, a los 6 s todo lo que entra con animación se muestra
  setTimeout(() => document.querySelectorAll('.revela:not(.visible)').forEach((e) => e.classList.add('visible')), 6000);

  const hayGSAP = !!(window.gsap && window.ScrollTrigger);
  const escritorio = () => matchMedia('(min-width: 960px)').matches;

  // Scroll suave: Lenis sincronizado con el reloj de GSAP. Sin Lenis, scroll nativo.
  let lenis = null;
  const alScroll = [];
  const cadaScroll = (fn) => alScroll.push(fn);
  const lanzarScroll = () => alScroll.forEach((fn) => safe(fn, 'scroll'));
  safe(() => {
    if (hayGSAP) gsap.registerPlugin(ScrollTrigger);
    if (window.Lenis) {
      lenis = window.lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
      lenis.on('scroll', lanzarScroll);
      if (hayGSAP) {
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((t) => lenis.raf(t * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      }
    } else {
      addEventListener('scroll', lanzarScroll, { passive: true });
    }
    addEventListener('resize', lanzarScroll);
  }, 'scroll suave');

  // Telón de agua: sin scroll mientras se vacía y, al acabar, se retira del documento
  safe(() => {
    const telon = document.getElementById('telon');
    if (!telon) return;
    if (lenis) lenis.stop();
    const quitar = () => { if (lenis) lenis.start(); telon.remove(); };
    setTimeout(() => { if (lenis) lenis.start(); }, 1500);
    setTimeout(quitar, 2500);
  }, 'telón');

  const irA = (destino, opciones = {}) => {
    if (lenis) lenis.scrollTo(destino, { duration: 1.4, ...opciones });
    else if (typeof destino === 'number') scrollTo({ top: destino, behavior: 'smooth' });
    else destino.scrollIntoView({ behavior: 'smooth' });
  };
  const arribaDe = (el) => el.getBoundingClientRect().top + scrollY;

  // Menú en isla: la hamburguesa se convierte en X y los enlaces suben escalonados
  const isla = document.getElementById('isla');
  const menu = document.getElementById('menu');
  const botonMenu = document.getElementById('abrir-menu');
  function ponerMenu(abierto) {
    if (document.body.classList.contains('menu-abierto') === abierto) return;
    document.body.classList.toggle('menu-abierto', abierto);
    menu.setAttribute('aria-hidden', !abierto);
    botonMenu.setAttribute('aria-expanded', abierto);
    botonMenu.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
    if (lenis) abierto ? lenis.stop() : lenis.start();
    else document.body.style.overflow = abierto ? 'hidden' : '';
  }
  safe(() => {
    botonMenu.addEventListener('click', () => ponerMenu(!document.body.classList.contains('menu-abierto')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ponerMenu(false); });
    document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
      const destino = a.getAttribute('href').length > 1 && document.querySelector(a.getAttribute('href'));
      if (!destino) return;
      e.preventDefault();
      ponerMenu(false);
      irA(destino);
      history.replaceState(null, '', a.getAttribute('href'));
    }));
  }, 'menú');

  // La isla marca la sección en la que estás
  safe(() => {
    const enlaces = [...document.querySelectorAll('.isla__enlaces a')];
    const secciones = enlaces.map((a) => document.querySelector(a.getAttribute('href')));
    cadaScroll(() => {
      isla.classList.toggle('is-solida', scrollY > 40);
      const linea = innerHeight * .4;
      let actual = -1;
      secciones.forEach((s, i) => { const r = s.getBoundingClientRect(); if (r.top <= linea && r.bottom > linea) actual = i; });
      enlaces.forEach((a, i) => a.classList.toggle('actual', i === actual));
    });
  }, 'isla');

  // Portada: la foto a pantalla completa se recoge en una tarjeta mientras el texto se va
  safe(() => {
    const hero = document.querySelector('.hero');
    cadaScroll(() => {
      const recorrido = hero.offsetHeight - innerHeight;
      const p = recorrido > 0 ? clamp(scrollY / recorrido) : 0;
      hero.style.setProperty('--p', p.toFixed(4));
      document.body.classList.toggle('en-portada', p < 1);
    });
  }, 'portada');

  // Cinta de servicios: bucle infinito; el scroll la acelera y al subir cambia de sentido
  safe(() => {
    const cinta = document.getElementById('cinta');
    const pista = cinta.querySelector('.cinta__pista');
    const grupo = pista.querySelector('.cinta__grupo');
    const rellenar = () => {
      while (pista.children.length > 1) pista.lastChild.remove();
      const copias = Math.ceil(cinta.offsetWidth / grupo.offsetWidth) + 1;
      for (let i = 0; i < copias; i++) {
        const c = grupo.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        pista.appendChild(c);
      }
    };
    rellenar();
    if (document.fonts) document.fonts.ready.then(rellenar);
    addEventListener('resize', rellenar);
    let x = 0, sentido = 1, empuje = 0, ultimoY = scrollY, ultimoT = performance.now(), visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(cinta);
    const mover = (t) => {
      requestAnimationFrame(mover);
      const dt = Math.min(.05, (t - ultimoT) / 1000);
      ultimoT = t;
      const dy = scrollY - ultimoY;
      ultimoY = scrollY;
      if (dy) sentido = dy > 0 ? 1 : -1;
      empuje += (Math.min(40, Math.abs(dy)) * 28 - empuje) * .08;
      if (!visible) return;
      x -= sentido * (60 + empuje) * dt;
      const ancho = grupo.offsetWidth;
      if (ancho) x = ((x % ancho) - ancho) % ancho;
      pista.style.transform = `translate3d(${x}px,0,0)`;
    };
    requestAnimationFrame(mover);
  }, 'cinta');

  // Tagline: cada palabra se enciende al cruzar la línea de lectura
  safe(() => {
    const lema = document.getElementById('lema');
    [...lema.childNodes].forEach((n) => {
      if (n.nodeType !== 3) return;
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach((trozo) => {
        if (!trozo) return;
        if (/^\s+$/.test(trozo)) { frag.appendChild(document.createTextNode(trozo)); return; }
        const s = document.createElement('span');
        s.className = 'palabra';
        s.textContent = trozo;
        frag.appendChild(s);
      });
      n.replaceWith(frag);
    });
    const palabras = [...lema.querySelectorAll('.palabra')];
    cadaScroll(() => {
      const r = lema.getBoundingClientRect();
      const p = clamp((innerHeight * .82 - r.top) / (r.height + innerHeight * .35));
      const encendidas = Math.round(p * palabras.length);
      palabras.forEach((w, i) => w.classList.toggle('encendida', i < encendidas));
    });
  }, 'tagline');

  // Entradas con peso y desenfoque, escalonadas entre hermanos
  safe(() => {
    document.querySelectorAll('.cab:not(.hero *)').forEach((c) => c.classList.add('revela'));
    const piezas = [...document.querySelectorAll('.revela')];
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('visible');
        io.unobserve(e.target);
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -8% 0px' });
    piezas.forEach((p) => {
      const hermanos = [...p.parentElement.children].filter((h) => h.classList.contains('revela'));
      p.style.transitionDelay = (hermanos.indexOf(p) % 4) * 90 + 'ms';
      io.observe(p);
    });
  }, 'entradas');

  // Qué construimos: en escritorio la sección queda fija y el scroll va eligiendo
  safe(() => {
    const seccion = document.getElementById('construimos');
    const botones = [...seccion.querySelectorAll('.construimos__lista button')];
    const fotos = [...seccion.querySelectorAll('.construimos__marco img')];
    const pie = document.getElementById('construimos-txt');
    let elegido = 0;
    const elegir = (i) => {
      if (i === elegido) return;
      elegido = i;
      botones.forEach((b, j) => b.setAttribute('aria-selected', j === i));
      fotos.forEach((f, j) => f.classList.toggle('activa', j === i));
      pie.textContent = botones[i].dataset.txt;
    };
    const fijo = () => escritorio() && seccion.offsetHeight > innerHeight * 1.5;
    botones.forEach((b, i) => {
      b.addEventListener('click', () => {
        if (fijo()) irA(arribaDe(seccion) + (seccion.offsetHeight - innerHeight) * (i + .5) / botones.length, { duration: 1.2 });
        else elegir(i);
      });
      b.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover)').matches && !fijo()) elegir(i); });
    });
    cadaScroll(() => {
      if (!fijo()) return;
      const r = seccion.getBoundingClientRect();
      const p = clamp(-r.top / (seccion.offsetHeight - innerHeight));
      elegir(Math.min(botones.length - 1, Math.floor(p * botones.length)));
    });
  }, 'qué construimos');

  // Obra 3D: se descarga al acercarse; el scroll decide el paso y la cámara se detiene a mitad de cada uno
  safe(() => {
    const pista = document.getElementById('obra-pista');
    const pasos = [...document.querySelectorAll('#obra-lista li')].map((li) => ({
      foto: li.dataset.foto, titulo: li.querySelector('h3').textContent, desc: li.querySelector('p').textContent,
    }));
    const panel = document.querySelector('.obra__panel');
    const num = document.getElementById('obra-num');
    const titulo = document.getElementById('obra-titulo');
    const desc = document.getElementById('obra-desc');
    const foto = document.getElementById('obra-foto');
    const aviso = document.getElementById('obra-aviso');
    const barra = document.getElementById('obra-barra');
    pasos.forEach((p, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<button type="button"></button>';
      const b = li.querySelector('button');
      b.textContent = p.titulo;
      b.setAttribute('aria-label', `Paso ${i + 1}: ${p.titulo}`);
      b.addEventListener('click', () => irA(arribaDe(pista) + (pista.offsetHeight - innerHeight) * (i + .5) / 9, { duration: 1.8 }));
      barra.appendChild(li);
    });

    let obra = null, pasoMostrado = -1;
    function mostrarPaso(i) {
      if (i === pasoMostrado) return;
      pasoMostrado = i;
      const p = pasos[i];
      num.textContent = String(i + 1).padStart(2, '0');
      titulo.textContent = p.titulo;
      desc.textContent = p.desc;
      foto.src = `assets/proceso/${p.foto}.webp`;
      foto.alt = `Foto real de obra: ${p.titulo.toLowerCase()}`;
      panel.classList.remove('cambia');
      void panel.offsetWidth;
      panel.classList.add('cambia');
      [...barra.children].forEach((li, j) => { li.classList.toggle('actual', j === i); li.classList.toggle('hecho', j < i); });
    }

    const hayWebGL = (() => {
      try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; }
    })();
    const cargarScript = (src) => new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = mal;
      document.head.appendChild(s);
    });
    if (!hayWebGL) return;
    raiz.classList.add('con3d');
    mostrarPaso(0);
    const vigia = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      vigia.disconnect();
      pasos.forEach((p) => { new Image().src = `assets/proceso/${p.foto}.webp`; });
      cargarScript('assets/lib/three.min.js?v=20261026d')
        .then(() => cargarScript('assets/lib/RoomEnvironment.js?v=20261026d'))
        .then(() => cargarScript('obra3d.js?v=20261026d'))
        .then(() => {
          obra = window.Obra3D.iniciar(document.getElementById('obra-lienzo'));
          if (!obra) throw new Error('sin WebGL');
          new IntersectionObserver(([v]) => obra.activar(v.isIntersecting), { rootMargin: '200px 0px' }).observe(pista);
          lanzarScroll();
        })
        .catch(() => raiz.classList.remove('con3d'));
    }, { rootMargin: '150% 0px' });
    vigia.observe(pista);

    // Pausa a mitad de paso: el avance es lento cuando el texto está en su punto y rápido entre pasos
    const PAUSA = .42;
    const conPausa = (p) => {
      const n = Math.floor(p), f = p - n;
      return n + f + PAUSA * Math.sin(2 * Math.PI * f) / (2 * Math.PI);
    };
    cadaScroll(() => {
      const r = pista.getBoundingClientRect();
      const p = clamp(-r.top / (pista.offsetHeight - innerHeight)) * 9;
      if (obra) obra.pintar(conPausa(p));
      mostrarPaso(Math.min(8, Math.floor(p)));
      aviso.classList.toggle('oculto', p > .15);
      document.body.classList.toggle('en-obra', r.top <= 0 && r.bottom >= innerHeight);
    });
  }, 'obra 3D');

  // Garantías: las cifras crecen con el scroll y cuentan al aparecer
  safe(() => {
    const cifras = [...document.querySelectorAll('#garantias b[data-fin]')];
    if (hayGSAP) {
      gsap.fromTo(cifras, { scale: .6, yPercent: 20 }, {
        scale: 1, yPercent: 0, ease: 'none',
        scrollTrigger: { trigger: '#garantias', start: 'top bottom', end: 'center 60%', scrub: true },
      });
    }
    const contar = (b) => {
      const fin = +b.dataset.fin, t0 = performance.now();
      const paso = (t) => {
        const k = clamp((t - t0) / 1400);
        b.textContent = Math.round(fin * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    };
    const io = new IntersectionObserver((entradas) => entradas.forEach((e) => {
      if (!e.isIntersecting) return;
      contar(e.target);
      io.unobserve(e.target);
    }), { threshold: 0.05 });
    cifras.forEach((b) => io.observe(b));
  }, 'garantías');

  // Parallax suave en las fotos de proyectos
  safe(() => {
    if (!hayGSAP) return;
    document.querySelectorAll('.proyecto img').forEach((img) => {
      gsap.fromTo(img, { yPercent: -6, scale: 1.12 }, {
        yPercent: 6, scale: 1.12, ease: 'none',
        scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  }, 'parallax');

  // Antes / después: la sección queda fija y el scroll abre la cortina; arrastrar sigue funcionando
  safe(() => {
    const seccion = document.getElementById('antes');
    const comparador = document.getElementById('comparador');
    const rango = comparador.querySelector('input');
    let manual = false;
    const poner = (v) => { comparador.style.setProperty('--pos', v + '%'); rango.value = v; };
    rango.addEventListener('input', () => { manual = true; poner(+rango.value); });
    cadaScroll(() => {
      const r = seccion.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) { manual = false; return; }
      if (manual || seccion.offsetHeight <= innerHeight * 1.2) return;
      const p = clamp(-r.top / (seccion.offsetHeight - innerHeight));
      poner(Math.round(94 - p * 88));
    });
  }, 'antes y después');

  // Trabajos: el scroll vertical desplaza la galería en horizontal
  safe(() => {
    const seccion = document.getElementById('trabajos');
    const pista = document.getElementById('trabajos-pista');
    let distancia = 0;
    const medir = () => {
      distancia = Math.max(0, pista.scrollWidth - innerWidth);
      seccion.style.height = `${distancia + innerHeight}px`;
    };
    medir();
    addEventListener('resize', medir);
    addEventListener('load', medir);
    cadaScroll(() => {
      const r = seccion.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, seccion.offsetHeight - innerHeight));
      pista.style.transform = `translate3d(${-p * distancia}px,0,0)`;
    });
  }, 'trabajos');

  // Inclinación 3D al pasar el ratón
  safe(() => {
    if (!matchMedia('(hover: hover)').matches) return;
    document.querySelectorAll('.proyecto, .construimos__marco').forEach((el) => {
      el.classList.add('inclina');
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        el.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }, 'inclinación');

  // Visor de fotos
  safe(() => {
    const visor = document.getElementById('visor');
    const img = visor.querySelector('img');
    document.querySelectorAll('.foto').forEach((b) => b.addEventListener('click', () => {
      img.src = b.dataset.src;
      img.alt = b.querySelector('img').alt;
      visor.showModal();
    }));
    visor.addEventListener('click', () => visor.close());
  }, 'visor');

  // Formulario: valida el nombre y abre WhatsApp con el mensaje montado
  safe(() => {
    const form = document.getElementById('form-presupuesto');
    const error = document.getElementById('error-nombre');
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const d = new FormData(form);
      const val = (k) => (d.get(k) || '').trim();
      const campo = form.elements.nombre;
      const falta = !val('nombre');
      campo.classList.toggle('is-error', falta);
      campo.setAttribute('aria-invalid', falta);
      error.hidden = !falta;
      if (falta) { campo.focus(); return; }
      let texto = `Hola, soy ${val('nombre')}. Quería pedir presupuesto para ${d.get('tipo')}`;
      if (val('pueblo')) texto += ` en ${val('pueblo')}`;
      texto += '.';
      if (val('medida')) texto += `\nMedida aproximada: ${val('medida')}.`;
      if (val('mensaje')) texto += `\n${val('mensaje')}`;
      window.open('https://wa.me/34658752078?text=' + encodeURIComponent(texto), '_blank', 'noopener');
    });
  }, 'formulario');

  lanzarScroll();
})();
