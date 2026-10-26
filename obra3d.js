// La obra en 3D: una piscina que se construye por pasos según se hace scroll.
// Three.js r128 (global THREE). Expone window.Obra3D.iniciar(canvas) → { pintar(pasoDecimal), activar(bool) } o null sin WebGL.
(() => {
  const L = 8, W = 4, D = 1.5;          // vaso interior: largo, ancho, profundidad (m)
  const MURO = 0.25, LOSA = 0.25;        // grosor del gunitado
  const DT = D + LOSA;                   // profundidad total de excavación
  const HX = L / 2 + MURO, HZ = W / 2 + MURO;
  const CORONA = 0.4, VUELO = 0.04, PLAYA = 1.6;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const suave = (t) => t * t * (3 - 2 * t);
  const salida = (t) => 1 - Math.pow(1 - t, 3);

  function soportaWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  // Textura de baldosa de barro (terracota) dibujada en canvas
  function texturaBarro() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#d9c7ae';
    g.fillRect(0, 0, 512, 512);
    const n = 4, t = 512 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = Math.random() * 22 - 11;
      g.fillStyle = `rgb(${196 + v},${118 + v * .7},${78 + v * .5})`;
      g.fillRect(i * t + 4, j * t + 4, t - 8, t - 8);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(90,40,20,${Math.random() * .08})`;
        g.beginPath();
        g.arc(i * t + Math.random() * t, j * t + Math.random() * t, Math.random() * 10, 0, 7);
        g.fill();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // Gresite: teselas de 2,5 cm en azules mezclados con junta blanca (512 px = 40 cm)
  function texturaGresite() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#e6eef0';
    g.fillRect(0, 0, 512, 512);
    const n = 16, t = 512 / n;
    const azules = [[38, 150, 196], [52, 170, 210], [28, 128, 180], [70, 186, 216], [44, 160, 190], [96, 196, 222]];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const [r, gg, b] = azules[Math.floor(Math.random() * azules.length)];
      const v = Math.random() * 16 - 8;
      g.fillStyle = `rgb(${r + v},${gg + v},${b + v})`;
      g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.fillRect(i * t + 3, j * t + 3, t - 10, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function fondoCielo() {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#7fc3df');
    gr.addColorStop(.6, '#cfe7ef');
    gr.addColorStop(1, '#f3eee6');
    g.fillStyle = gr;
    g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // Plano con UV en metros (para que las texturas repitan a escala real)
  function plano(w, h, metrosPorRepeticion) {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / metrosPorRepeticion, uv.getY(i) * h / metrosPorRepeticion);
    return geo;
  }
  function caja(w, h, d, m) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (m) {
      // Ajusta las UV de cada cara a su tamaño real
      const uv = geo.attributes.uv, nor = geo.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
        const [a, b] = nx > .5 ? [d, h] : ny > .5 ? [w, d] : [w, h];
        uv.setXY(i, uv.getX(i) * a / m, uv.getY(i) * b / m);
      }
    }
    return geo;
  }
  function marcoConHueco(ox, oz, ix, iz, m) {
    const s = new THREE.Shape();
    s.moveTo(-ox, -oz); s.lineTo(ox, -oz); s.lineTo(ox, oz); s.lineTo(-ox, oz); s.lineTo(-ox, -oz);
    const h = new THREE.Path();
    h.moveTo(-ix, -iz); h.lineTo(-ix, iz); h.lineTo(ix, iz); h.lineTo(ix, -iz); h.lineTo(-ix, -iz);
    s.holes.push(h);
    const geo = new THREE.ShapeGeometry(s);
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / m, uv.getY(i) / m);
    return geo;
  }

  function iniciar(canvas) {
    if (!window.THREE || !soportaWebGL()) return null;

    const movil = Math.min(innerWidth, innerHeight) < 700;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, movil ? 1.5 : 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;

    const escena = new THREE.Scene();
    escena.background = fondoCielo();
    escena.fog = new THREE.Fog(0xe9eee9, 34, 70);
    const pm = new THREE.PMREMGenerator(renderer);
    const entorno = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;

    const camara = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

    // Luz de mediodía sevillano
    const sol = new THREE.DirectionalLight(0xfff0d8, 1.9);
    sol.position.set(9, 16, 7);
    sol.castShadow = true;
    sol.shadow.mapSize.set(movil ? 1024 : 2048, movil ? 1024 : 2048);
    Object.assign(sol.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
    sol.shadow.bias = -0.0005;
    sol.shadow.normalBias = 0.02;
    escena.add(sol);
    escena.add(new THREE.HemisphereLight(0xdff2ff, 0x5a4a30, 0.35));

    // Texturas
    const carga = new THREE.TextureLoader();
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const tex = (nombre, color) => {
      const t = carga.load(`assets/tex/${nombre}.webp`, () => pedirPintado());
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      if (color) t.encoding = THREE.sRGBEncoding;
      return t;
    };
    const mat = {
      cesped: new THREE.MeshStandardMaterial({ map: tex('grass_ground_diff', 1), normalMap: tex('grass_ground_nor_gl'), roughness: 1, color: 0x7f9a55 }),
      tierra: new THREE.MeshStandardMaterial({ map: tex('coast_sand_01_diff', 1), normalMap: tex('coast_sand_01_nor_gl'), roughness: 1, color: 0xb98a5e, side: THREE.DoubleSide }),
      hormigon: new THREE.MeshStandardMaterial({ map: tex('brushed_concrete_diff', 1), normalMap: tex('brushed_concrete_nor_gl'), roughness: .95, color: 0xc9c6c0 }),
      gresite: new THREE.MeshStandardMaterial({ map: texturaGresite(), roughness: .2, metalness: 0 }),
      cal: new THREE.MeshStandardMaterial({ map: tex('white_stucco_diff', 1), normalMap: tex('white_stucco_nor_gl'), roughness: .9, color: 0xfbf8f2 }),
      piedra: new THREE.MeshStandardMaterial({ map: tex('white_stucco_diff', 1), roughness: .75, color: 0xeadfc8 }),
      barro: new THREE.MeshStandardMaterial({ map: texturaBarro(), roughness: .85, transparent: true, opacity: 0 }),
      tejaCap: new THREE.MeshStandardMaterial({ color: 0xb4623a, roughness: .8 }),
      ferralla: new THREE.LineBasicMaterial({ color: 0x9a4f28 }),
      cuerda: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      estaca: new THREE.MeshStandardMaterial({ color: 0xc89b62, roughness: .9 }),
      pvc: new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: .4 }),
      equipo: new THREE.MeshStandardMaterial({ color: 0x8e9599, roughness: .6 }),
      tapa: new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: .5 }),
      foco: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9feaff, emissiveIntensity: 0 }),
      oscuro: new THREE.MeshStandardMaterial({ color: 0x1d2a30, roughness: .6 }),
      hoja: new THREE.MeshStandardMaterial({ color: 0x2a5224, roughness: .9 }),
      ciprés: new THREE.MeshStandardMaterial({ color: 0x223d20, roughness: .95 }),
      tronco: new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: .9 }),
      naranja: new THREE.MeshStandardMaterial({ color: 0xf08a1c, roughness: .6 }),
      tumbona: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .5 }),
    };
    // Solo lo que brilla (agua, gresite, piedra, PVC) refleja el entorno
    [mat.gresite, mat.piedra, mat.pvc, mat.tumbona, mat.foco].forEach((m) => { m.envMap = entorno; m.envMapIntensity = .5; });
    const recorteHormigon = new THREE.Plane(new THREE.Vector3(0, -1, 0), -DT);
    const recorteGresite = new THREE.Plane(new THREE.Vector3(0, -1, 0), -D - .02);
    mat.hormigon.clippingPlanes = [recorteHormigon];
    mat.gresite.clippingPlanes = [recorteGresite];

    const sombra = (m, recibe = true, proyecta = true) => { m.receiveShadow = recibe; m.castShadow = proyecta; return m; };
    const añadir = (m, padre = escena) => { padre.add(m); return m; };

    // Terreno con el hueco de la excavación
    añadir(sombra(new THREE.Mesh(marcoConHueco(40, 40, HX, HZ, 3), mat.cesped), true, false));
    const tapa = añadir(sombra(new THREE.Mesh(plano(HX * 2, HZ * 2, 3), mat.cesped), true, false));
    tapa.rotation.x = -Math.PI / 2;
    tapa.position.y = .002;

    // Excavación: paredes y fondo de tierra
    const hoyo = new THREE.Group();
    añadir(hoyo);
    const paredesTierra = [
      [HX * 2, 0, -HZ, 0], [HX * 2, 0, HZ, Math.PI], [HZ * 2, -HX, 0, Math.PI / 2], [HZ * 2, HX, 0, -Math.PI / 2],
    ].map(([largo, x, z, giro]) => {
      const g = plano(largo, 1, 2);
      g.translate(0, -.5, 0);
      const m = añadir(sombra(new THREE.Mesh(g, mat.tierra), true, false), hoyo);
      m.position.set(x, 0, z);
      m.rotation.y = giro;
      return m;
    });
    const fondoTierra = añadir(sombra(new THREE.Mesh(plano(HX * 2, HZ * 2, 2), mat.tierra), true, false), hoyo);
    fondoTierra.rotation.x = -Math.PI / 2;
    const monton = añadir(sombra(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.tierra)));
    monton.position.set(-L / 2 - 3.2, 0, HZ + 3.2);

    // Replanteo: estacas y cuerdas
    const replanteo = new THREE.Group();
    añadir(replanteo);
    const esquinas = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(a * (HX + .35), 0, b * (HZ + .35)));
    const estacas = esquinas.map((p) => {
      const g = new THREE.BoxGeometry(.07, .7, .07);
      g.translate(0, .35, 0);
      const m = añadir(sombra(new THREE.Mesh(g, mat.estaca)), replanteo);
      m.position.copy(p);
      return m;
    });
    const cuerdas = esquinas.map((p, i) => {
      const q = esquinas[(i + 1) % 4];
      const largo = p.distanceTo(q);
      const g = new THREE.BoxGeometry(1, .015, .015);
      g.translate(.5, 0, 0);
      const m = añadir(new THREE.Mesh(g, mat.cuerda), replanteo);
      m.position.set(p.x, .5, p.z);
      m.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
      m.userData.largo = largo;
      return m;
    });
    const tiza = esquinas.map((p, i) => {
      const q = esquinas[(i + 1) % 4];
      const g = new THREE.PlaneGeometry(1, .06);
      g.translate(.5, 0, 0);
      g.rotateX(-Math.PI / 2);
      const m = añadir(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85 })), replanteo);
      m.position.set(p.x, .006, p.z);
      m.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
      m.userData.largo = p.distanceTo(q);
      return m;
    });

    // Ferralla: malla de acero dentro del futuro muro
    const puntos = [];
    const paso = .3, ym = -D - LOSA / 2, zm = W / 2 + MURO / 2, xm = L / 2 + MURO / 2;
    for (let x = -xm; x <= xm + .01; x += paso) puntos.push(x, ym, -zm, x, ym, zm);
    for (let z = -zm; z <= zm + .01; z += paso) puntos.push(-xm, ym, z, xm, ym, z);
    for (let y = ym; y <= -.05; y += paso) {
      puntos.push(-xm, y, -zm, xm, y, -zm, -xm, y, zm, xm, y, zm, -xm, y, -zm, -xm, y, zm, xm, y, -zm, xm, y, zm);
    }
    for (let x = -xm; x <= xm + .01; x += paso) puntos.push(x, ym, -zm, x, -.05, -zm, x, ym, zm, x, -.05, zm);
    for (let z = -zm; z <= zm + .01; z += paso) puntos.push(-xm, ym, z, -xm, -.05, z, xm, ym, z, xm, -.05, z);
    const geoFerralla = new THREE.BufferGeometry();
    geoFerralla.setAttribute('position', new THREE.Float32BufferAttribute(puntos, 3));
    const ferralla = añadir(new THREE.LineSegments(geoFerralla, mat.ferralla));
    const totalFerralla = puntos.length / 3;

    // Vaso de hormigón proyectado (aparece de abajo arriba con un plano de corte)
    const vaso = new THREE.Group();
    añadir(vaso);
    [
      [L + MURO * 2, DT, MURO, 0, -DT / 2, -(W / 2 + MURO / 2)],
      [L + MURO * 2, DT, MURO, 0, -DT / 2, W / 2 + MURO / 2],
      [MURO, DT, W, -(L / 2 + MURO / 2), -DT / 2, 0],
      [MURO, DT, W, L / 2 + MURO / 2, -DT / 2, 0],
      [L, LOSA, W, 0, -D - LOSA / 2, 0],
    ].forEach(([w, h, d, x, y, z]) => {
      const m = añadir(sombra(new THREE.Mesh(caja(w, h, d, 1.5), mat.hormigon)), vaso);
      m.position.set(x, y, z);
    });

    // Escalera de obra en un extremo
    const escalones = [];
    const escalonesGresite = [];
    for (let k = 1; k <= 4; k++) {
      const alto = k * .3, fondo = (5 - k) * .42;
      const g = caja(fondo, alto, W, 1.5);
      g.translate(0, alto / 2, 0);
      const m = añadir(sombra(new THREE.Mesh(g, mat.hormigon.clone())), vaso);
      m.material.clippingPlanes = [];
      m.position.set(-L / 2 + fondo / 2, -D, 0);
      escalones.push(m);
      const gg = caja(fondo + .004, alto + .004, W - .004, .5);
      gg.translate(0, alto / 2, 0);
      const t = añadir(sombra(new THREE.Mesh(gg, mat.gresite)), vaso);
      t.position.copy(m.position);
      escalonesGresite.push(t);
    }

    // Gresite: interior del vaso
    const gresite = new THREE.Group();
    añadir(gresite);
    [
      [L, D, 0, -D / 2, -W / 2 + .004, 0, 0],
      [L, D, 0, -D / 2, W / 2 - .004, Math.PI, 0],
      [W, D, -L / 2 + .004, -D / 2, 0, Math.PI / 2, 0],
      [W, D, L / 2 - .004, -D / 2, 0, -Math.PI / 2, 0],
      [L, W, 0, -D + .004, 0, 0, -Math.PI / 2],
    ].forEach(([w, h, x, y, z, ry, rx]) => {
      const m = añadir(sombra(new THREE.Mesh(plano(w, h, .5), mat.gresite), true, false), gresite);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0, 'YXZ');
    });

    // Coronación: piezas de piedra alrededor del borde
    const piezas = [];
    const ponerPieza = (largo, ancho, x, z, giro) => {
      const m = añadir(sombra(new THREE.Mesh(caja(largo - .012, .06, ancho, .8), mat.piedra)));
      m.position.set(x, .03, z);
      m.rotation.y = giro;
      m.userData.y = .03;
      piezas.push(m);
    };
    const ancho = CORONA + VUELO;
    const largoLargo = L + CORONA * 2, nL = Math.round(largoLargo / .6);
    for (let i = 0; i < nL; i++) ponerPieza(largoLargo / nL, ancho, -largoLargo / 2 + (i + .5) * largoLargo / nL, -(W / 2 - VUELO + ancho / 2), 0);
    const largoCorto = W - VUELO * 2, nC = Math.round(largoCorto / .6);
    for (let i = 0; i < nC; i++) ponerPieza(largoCorto / nC, ancho, L / 2 - VUELO + ancho / 2, -largoCorto / 2 + (i + .5) * largoCorto / nC, Math.PI / 2);
    for (let i = nL - 1; i >= 0; i--) ponerPieza(largoLargo / nL, ancho, -largoLargo / 2 + (i + .5) * largoLargo / nL, W / 2 - VUELO + ancho / 2, 0);
    for (let i = nC - 1; i >= 0; i--) ponerPieza(largoCorto / nC, ancho, -(L / 2 - VUELO + ancho / 2), -largoCorto / 2 + (i + .5) * largoCorto / nC, Math.PI / 2);

    // Playa de barro alrededor
    const ox = L / 2 + CORONA, oz = W / 2 + CORONA;
    const playa = añadir(sombra(new THREE.Mesh(marcoConHueco(ox + PLAYA, oz + PLAYA, ox, oz, 1.6), mat.barro), true, false));
    playa.position.y = .008;

    // Depuración: caseta con tapa verde, tuberías, skimmers y focos
    const depuracion = new THREE.Group();
    añadir(depuracion);
    const caseta = añadir(sombra(new THREE.Mesh(new THREE.BoxGeometry(1.1, .55, .75), mat.equipo)), depuracion);
    caseta.position.set(L / 2 + CORONA + PLAYA + 1.2, .275, W / 2 - .3);
    const tapaVerde = añadir(sombra(new THREE.Mesh(new THREE.BoxGeometry(1.14, .05, .78), mat.tapa)), depuracion);
    tapaVerde.geometry.translate(0, 0, .39);
    tapaVerde.position.set(caseta.position.x, .56, caseta.position.z - .39);
    tapaVerde.rotation.x = -1.0;
    const filtro = añadir(new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .45, 20), new THREE.MeshStandardMaterial({ color: 0x2bb7c9, roughness: .4 })), depuracion);
    filtro.position.set(caseta.position.x - .2, .5, caseta.position.z);
    const tubos = [-.15, .15].map((dz, i) => {
      const camino = new THREE.CatmullRomCurve3([
        new THREE.Vector3(L / 2 - .5, .07, -W / 2 + .6 + i * .3),
        new THREE.Vector3(L / 2 + CORONA + .4, .07, -W / 2 + .6 + i * .3),
        new THREE.Vector3(L / 2 + CORONA + PLAYA + .2, .07, W / 2 - .3 + dz - .8),
        new THREE.Vector3(caseta.position.x - .55, .12, caseta.position.z + dz),
      ]);
      const g = new THREE.TubeGeometry(camino, 80, .055, 10, false);
      const m = añadir(sombra(new THREE.Mesh(g, mat.pvc)), depuracion);
      m.userData.total = g.index.count;
      return m;
    });
    [-2.2, 1.8].forEach((x) => {
      const s = añadir(new THREE.Mesh(new THREE.BoxGeometry(.32, .14, .02), mat.oscuro), depuracion);
      s.position.set(x, -.18, -W / 2 + .01);
    });
    const focos = [-2, 2].map((x) => {
      const f = añadir(new THREE.Mesh(new THREE.CircleGeometry(.12, 24), mat.foco), depuracion);
      f.position.set(x, -.75, W / 2 - .008);
      f.rotation.y = Math.PI;
      const luz = añadir(new THREE.PointLight(0x9feaff, 0, 5, 2), depuracion);
      luz.position.set(x, -.8, W / 2 - .4);
      return luz;
    });

    // Agua
    const texAgua = carga.load('assets/lib/waternormals.webp', () => pedirPintado());
    texAgua.wrapS = texAgua.wrapT = THREE.RepeatWrapping;
    texAgua.repeat.set(2, 1);
    const agua = añadir(new THREE.Mesh(new THREE.PlaneGeometry(L - .01, W - .01), new THREE.MeshStandardMaterial({
      color: 0x0b93b3, transparent: true, opacity: .58, roughness: .12, metalness: 0,
      normalMap: texAgua, normalScale: new THREE.Vector2(.5, .5), depthWrite: false,
    })));
    agua.rotation.x = -Math.PI / 2;
    agua.renderOrder = 2;

    // Tumbonas al final
    const tumbonas = [1.2, 3.4].map((x) => {
      const g = new THREE.Group();
      const base = añadir(sombra(new THREE.Mesh(new THREE.BoxGeometry(1.6, .12, .62), mat.tumbona)), g);
      base.position.y = .3;
      const respaldo = añadir(sombra(new THREE.Mesh(new THREE.BoxGeometry(.6, .1, .62), mat.tumbona)), g);
      respaldo.position.set(-.85, .5, 0);
      respaldo.rotation.z = .6;
      [[-.65, -.25], [-.65, .25], [.65, -.25], [.65, .25]].forEach(([a, b]) => {
        const p = añadir(new THREE.Mesh(new THREE.BoxGeometry(.05, .3, .05), mat.oscuro), g);
        p.position.set(a, .15, b);
      });
      g.position.set(x, 0, oz + .85);
      return añadir(g);
    });

    // Patio andaluz: tapias encaladas, naranjos y cipreses
    const tapia = (largo, x, z, giro) => {
      const m = añadir(sombra(new THREE.Mesh(caja(largo, 2.4, .3, 2), mat.cal)));
      m.position.set(x, 1.2, z);
      m.rotation.y = giro;
      const c = añadir(sombra(new THREE.Mesh(new THREE.BoxGeometry(largo, .08, .42), mat.tejaCap)));
      c.position.set(x, 2.44, z);
      c.rotation.y = giro;
    };
    tapia(34, 0, -oz - PLAYA - 3.6, 0);
    tapia(18, -ox - PLAYA - 5.5, -oz - PLAYA - 3.6 + 9, Math.PI / 2);
    const naranjo = (x, z, s = 1) => {
      const g = new THREE.Group();
      const t = añadir(sombra(new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 1.4, 8), mat.tronco)), g);
      t.position.y = .7;
      const copa = añadir(sombra(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat.hoja)), g);
      copa.position.y = 1.9;
      copa.scale.set(1, .85, 1);
      for (let i = 0; i < 14; i++) {
        const n = añadir(new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), mat.naranja), g);
        const a = Math.random() * Math.PI * 2, b = Math.random() * 1.2 - .3;
        n.position.set(Math.cos(a) * .95 * Math.cos(b), 1.9 + Math.sin(b) * .8, Math.sin(a) * .95 * Math.cos(b));
      }
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      return añadir(g);
    };
    naranjo(-5, -oz - PLAYA - 2.4, 1.05);
    naranjo(0.5, -oz - PLAYA - 2.4, .95);
    naranjo(6, -oz - PLAYA - 2.4, 1.1);
    naranjo(-ox - PLAYA - 4.2, 3, 1);
    const cipres = (x, z, alto) => {
      const m = añadir(sombra(new THREE.Mesh(new THREE.ConeGeometry(.55, alto, 10), mat.ciprés)));
      m.position.set(x, alto / 2, z);
    };
    cipres(11, -oz - PLAYA - 2.8, 5.5);
    cipres(12.4, -oz - PLAYA - 2.8, 4.6);
    cipres(-ox - PLAYA - 4.6, -2.5, 5);

    // Recorrido de la cámara: un punto por paso (posición y punto de mira)
    const rutaCam = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1, 17, 11), new THREE.Vector3(10, 9.5, 11), new THREE.Vector3(8, 6, 8),
      new THREE.Vector3(-6.5, 5.5, 8.5), new THREE.Vector3(-1.5, 3.4, 5.6), new THREE.Vector3(8.5, 4.6, 7),
      new THREE.Vector3(4, 6.5, 6.5), new THREE.Vector3(11, 5, 6), new THREE.Vector3(-8, 4.4, 8.5), new THREE.Vector3(-6.5, 3.4, 7),
    ]);
    const rutaMira = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -.6, 0), new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, -1, 0), new THREE.Vector3(-3.2, -1, 0), new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -1, 0), new THREE.Vector3(3.5, -.4, 1), new THREE.Vector3(-.8, -.4, 0), new THREE.Vector3(-1.4, -.3, 0),
    ]);
    const mira = new THREE.Vector3();

    let pasoActual = 0, activo = false, reloj = 0, pendiente = true, ultimo = performance.now();
    function pedirPintado() { pendiente = true; }

    function aplicar(p) {
      const t = (i, dur = .85) => clamp((p - i) / dur);

      // 1 · Replanteo
      const r = t(0);
      estacas.forEach((e, i) => { e.scale.y = Math.max(.001, salida(clamp(r * 3 - i * .4))); });
      cuerdas.forEach((c, i) => { c.scale.x = Math.max(.001, c.userData.largo * suave(clamp(r * 2.2 - .6 - i * .25))); });
      tiza.forEach((c, i) => { c.scale.x = Math.max(.001, c.userData.largo * suave(clamp(r * 2.2 - .6 - i * .25))); });
      replanteo.visible = p < 2.2;

      // 2 · Excavación
      const e = suave(t(1));
      tapa.visible = e < .01;
      paredesTierra.forEach((m) => { m.scale.y = Math.max(.001, DT * e); });
      fondoTierra.position.y = -DT * e - .001;
      hoyo.visible = e > .005;
      monton.scale.set(1.6 * e + .001, 1.1 * e + .001, 1.3 * e + .001);

      // 3 · Ferralla
      const a = t(2);
      ferralla.visible = a > 0;
      geoFerralla.setDrawRange(0, Math.floor(totalFerralla * a / 2) * 2);

      // 4 · Hormigón proyectado
      recorteHormigon.constant = -DT + (DT + .01) * suave(t(3));
      vaso.visible = p > 3;

      // 5 · Escalera
      const s = t(4);
      escalones.forEach((m, i) => { m.scale.y = Math.max(.001, salida(clamp(s * 2 - i * .3))); });

      // 6 · Coronación
      const co = t(5);
      const n = piezas.length, tramo = 8;
      piezas.forEach((m, j) => {
        const pj = clamp(co * (n + tramo) / tramo - j / tramo);
        m.visible = pj > 0;
        m.position.y = m.userData.y + (1 - salida(pj)) * 1.4;
      });
      mat.barro.opacity = clamp(co * 1.6 - .5);
      mat.barro.transparent = mat.barro.opacity < 1;
      playa.visible = mat.barro.opacity > 0;

      // 7 · Gresite
      const g = suave(t(6));
      recorteGresite.constant = -D - .02 + (D + .04) * g;
      gresite.visible = g > 0;
      escalonesGresite.forEach((m, i) => { m.visible = g > 0; m.scale.y = escalones[i].scale.y; });

      // 8 · Depuración
      const d = t(7);
      depuracion.visible = d > 0;
      tubos.forEach((m) => m.geometry.setDrawRange(0, Math.floor(m.userData.total * clamp(d * 1.5) / 3) * 3));
      caseta.scale.setScalar(Math.max(.001, salida(clamp(d * 2.5))));
      tapaVerde.visible = filtro.visible = d > .3;
      const brillo = clamp(d * 2 - 1);
      mat.foco.emissiveIntensity = brillo * 2.5;
      focos.forEach((f) => { f.intensity = brillo * 1.6; });

      // 9 · Agua
      const w = suave(t(8, .7));
      agua.visible = w > 0;
      agua.position.y = -D + .03 + (D - .17) * w;
      agua.material.opacity = .3 + .5 * w;
      tumbonas.forEach((m, i) => { const k = salida(clamp((p - 8.45 - i * .15) * 2.2)); m.visible = k > 0; m.scale.setScalar(Math.max(.001, k)); });

      // Cámara
      const u = clamp(p / 9);
      camara.position.copy(rutaCam.getPointAt(u));
      mira.copy(rutaMira.getPointAt(u));
      camara.lookAt(mira);
    }

    function ajustar() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camara.aspect = w / h;
      camara.fov = w / h < .8 ? 58 : w / h < 1.2 ? 48 : 40;
      camara.updateProjectionMatrix();
      pendiente = true;
    }
    new ResizeObserver(ajustar).observe(canvas);
    ajustar();

    function bucle(ahora) {
      requestAnimationFrame(bucle);
      const dt = Math.min(.05, (ahora - ultimo) / 1000);
      ultimo = ahora;
      if (!activo) return;
      // El agua se mueve siempre que se ve; el resto solo cuando cambia el scroll
      if (agua.visible) {
        reloj += dt;
        texAgua.offset.set(reloj * .03, reloj * .018);
        pendiente = true;
      }
      if (!pendiente) return;
      pendiente = false;
      aplicar(pasoActual);
      renderer.render(escena, camara);
    }
    requestAnimationFrame(bucle);

    return {
      pintar(p) { if (p !== pasoActual) { pasoActual = p; pendiente = true; } },
      activar(v) { activo = v; pendiente = true; },
    };
  }

  window.Obra3D = { iniciar };
})();
