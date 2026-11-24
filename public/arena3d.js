// Fundo 3D da entrada (aprovado 24/11): quadra em perspectiva, holofotes, poeira e uma jogada
// em loop de 8 s (corta-luz, passe para a ala, arremesso; o aro acende verde). Three.js vem de
// public/vendor/three (r181, licença MIT). Só roda com WebGL e sem "reduzir movimento"; pausa fora
// da tela e com a aba escondida. No celular: sem bloom e com menos partículas.
export async function montaArena(box) {
  if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const teste = document.createElement('canvas');
  if (!(teste.getContext('webgl2') || teste.getContext('webgl'))) return null;
  const THREE = await import('./vendor/three/three.module.min.js');
  const leve = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  let EffectComposer, RenderPass, UnrealBloomPass;
  if (!leve) {
    try {
      ({ EffectComposer } = await import('./vendor/three/postprocessing/EffectComposer.js'));
      ({ RenderPass } = await import('./vendor/three/postprocessing/RenderPass.js'));
      ({ UnrealBloomPass } = await import('./vendor/three/postprocessing/UnrealBloomPass.js'));
    } catch { EffectComposer = null; }
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'arena3d'; canvas.setAttribute('aria-hidden', 'true');
  box.appendChild(canvas);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#050605';
  const BG = new THREE.Color(bg);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 10, 24);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !leve, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(leve ? 1.25 : 1.75, devicePixelRatio || 1));
  renderer.setClearColor(BG, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // piso + linhas (94 x 50 pés → 1880 x 1000 px)
  const cv = document.createElement('canvas'); cv.width = 1880; cv.height = 1000;
  const g = cv.getContext('2d'), S = 20;
  g.fillStyle = '#111312'; g.fillRect(0, 0, 1880, 1000);
  for (let i = 0; i < 80; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.22)'; g.fillRect(0, i * 12.5, 1880, 1);
    const off = (i * 37 % 11) / 11 * 360;
    for (let x = off; x < 1880; x += 360) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, i * 12.5, 1.5, 12.5); }
  }
  g.fillStyle = '#0D2A1B'; g.fillRect(0, 17 * S, 19 * S, 16 * S); g.fillRect(75 * S, 17 * S, 19 * S, 16 * S);
  g.strokeStyle = '#6B7A72'; g.lineWidth = 6; g.lineCap = 'round';
  g.strokeRect(3, 3, 1874, 994);
  g.beginPath(); g.moveTo(940, 0); g.lineTo(940, 1000); g.stroke();
  g.beginPath(); g.arc(940, 500, 120, 0, Math.PI * 2); g.stroke();
  for (const lado of [0, 1]) {
    g.save(); if (lado) { g.translate(1880, 0); g.scale(-1, 1); }
    g.beginPath(); g.moveTo(0, 17 * S); g.lineTo(19 * S, 17 * S); g.lineTo(19 * S, 33 * S); g.lineTo(0, 33 * S); g.stroke();
    g.beginPath(); g.arc(19 * S, 25 * S, 6 * S, 0, Math.PI * 2); g.stroke();
    const ang = Math.atan2(22, 8.95);
    g.beginPath(); g.moveTo(0, 3 * S); g.lineTo(14.2 * S, 3 * S);
    g.arc(5.25 * S, 25 * S, 23.75 * S, -ang, ang); g.lineTo(0, 47 * S); g.stroke();
    g.beginPath(); g.arc(5.25 * S, 25 * S, 4 * S, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.restore();
  }
  g.fillStyle = 'rgba(47,208,127,0.16)'; g.font = '800 150px Manrope, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BH', 940, 505);
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = leve ? 2 : 8; tex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x060706, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.002; scene.add(apron);

  // cestas
  const GOLD = 0xE8B64C, GREEN = 0x2FD07F;
  function cesta(lado) {
    const grp = new THREE.Group();
    const escuro = new THREE.MeshStandardMaterial({ color: 0x2E3531, roughness: 0.5 });
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1), escuro); poste.position.set(lado * 5.0, 0.55, 0); grp.add(poste);
    const braco = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.035), escuro); braco.position.set(lado * 4.7, 1.08, 0); grp.add(braco);
    const tabela = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.6), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.1 }));
    tabela.position.set(lado * 4.3, 1.08, 0); grp.add(tabela);
    const borda = new THREE.LineSegments(new THREE.EdgesGeometry(tabela.geometry), new THREE.LineBasicMaterial({ color: 0xC5CCC7, transparent: true, opacity: 0.7 }));
    borda.position.copy(tabela.position); grp.add(borda);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 8, 32), new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 0.8 }));
    aro.rotation.x = Math.PI / 2; aro.position.set(lado * 4.2, 0.95, 0); grp.add(aro);
    scene.add(grp); return aro;
  }
  cesta(-1); const aroD = cesta(1);

  // luzes e feixes (gradiente: forte perto do refletor, some no chão)
  const grad = (stops, h) => { const c = document.createElement('canvas'); c.width = 4; c.height = h; const x = c.getContext('2d'); const l = x.createLinearGradient(0, 0, 0, h); stops.forEach(([o, s]) => l.addColorStop(o, s)); x.fillStyle = l; x.fillRect(0, 0, 4, h); return new THREE.CanvasTexture(c); };
  const fade = grad([[0, '#000'], [.15, '#555'], [1, '#000']], 128), fadeUp = grad([[0, '#000'], [1, '#888']], 64);
  scene.add(new THREE.AmbientLight(0xC5CCC7, 0.35));
  const spots = [];
  for (const [x, z, c, I] of [[-2.6, -1.0, 0xffffff, 45], [2.6, 1.0, 0xe9fff3, 45], [0.5, 0, GREEN, 30]]) {
    const s = new THREE.SpotLight(c, I, 16, 0.4, 0.7, 1.4);
    s.position.set(x, 6.5, z); s.target.position.set(x, 0, z); scene.add(s, s.target);
    const geo = new THREE.ConeGeometry(2.6, 6.5, 40, 1, true); geo.translate(0, -3.25, 0);
    const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, alphaMap: fade, transparent: true, opacity: c === GREEN ? 0.26 : 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    cone.position.copy(s.position); scene.add(cone); spots.push({ s, cone, x, z });
  }

  // poeira (posição calculada pelo tempo, sem acumular estado)
  const N = leve ? 120 : 260, seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { seed[i * 4] = (Math.random() - .5) * 11; seed[i * 4 + 1] = Math.random() * 4.5; seed[i * 4 + 2] = (Math.random() - .5) * 6; seed[i * 4 + 3] = 0.08 + Math.random() * 0.12; }
  const dustG = new THREE.BufferGeometry(); dustG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  scene.add(new THREE.Points(dustG, new THREE.PointsMaterial({ color: 0xC5CCC7, size: 0.016, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })));

  // jogada (posições em px de uma quadra 940 x 500)
  const X = px => px / 100 - 4.7, Z = py => py / 100 - 2.5;
  const ATQ = [[[1.6, 560, 250], [2.0, 560, 250], [3.2, 660, 240], [4.4, 760, 200], [6.6, 740, 210]],
    [[1.6, 760, 110], [2.0, 760, 110], [4.4, 690, 70], [6.6, 690, 70]],
    [[1.6, 700, 420], [2.0, 700, 420], [4.4, 790, 440], [6.6, 790, 440]],
    [[1.6, 610, 80], [2.0, 610, 80], [4.4, 640, 62], [6.6, 640, 62]],
    [[1.6, 820, 300], [2.0, 820, 300], [2.8, 672, 268], [3.2, 672, 268], [4.4, 830, 282], [6.6, 850, 282]]];
  const DEF = [[[1.6, 600, 250], [2.0, 600, 250], [3.2, 694, 246], [4.4, 790, 214], [6.6, 790, 214]],
    [[1.6, 795, 112], [2.0, 795, 112], [4.4, 760, 96], [5.0, 725, 88], [6.6, 725, 88]],
    [[1.6, 760, 400], [2.0, 760, 400], [4.4, 805, 408], [6.6, 805, 408]],
    [[1.6, 665, 108], [2.0, 665, 108], [4.4, 690, 96], [6.6, 690, 96]],
    [[1.6, 850, 288], [2.0, 850, 288], [2.8, 700, 282], [3.4, 700, 282], [4.4, 845, 272], [6.6, 845, 272]]];
  const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const at = (tr, t) => {
    if (t <= tr[0][0]) return [tr[0][1], tr[0][2]];
    for (let i = 0; i < tr.length - 1; i++) { const [t0, x0, y0] = tr[i], [t1, x1, y1] = tr[i + 1]; if (t <= t1) { const u = ease((t - t0) / (t1 - t0)); return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]; } }
    const l = tr[tr.length - 1]; return [l[1], l[2]];
  };
  function jogador(cor, xis) {
    const grp = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: cor, transparent: true });
    let marca;
    if (xis) { marca = new THREE.Group(); for (const r of [Math.PI / 4, -Math.PI / 4]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.015, 0.05), mat); b.rotation.y = r; marca.add(b); } }
    else { marca = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 40), mat); marca.rotation.x = Math.PI / 2; }
    marca.position.y = 0.02; grp.add(marca);
    const fmat = new THREE.MeshBasicMaterial({ color: cor, alphaMap: fadeUp, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const feixe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 24, 1, true), fmat); feixe.position.y = 0.35; grp.add(feixe);
    scene.add(grp); return { grp, mats: [mat, fmat] };
  }
  const atq = ATQ.map(() => jogador(GREEN, false)), def = DEF.map(() => jogador(GOLD, true));
  const bola = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 14), new THREE.MeshStandardMaterial({ color: 0xF6D48A, emissive: 0xE8B64C, emissiveIntensity: 0.9, roughness: 0.4 }));
  scene.add(bola);
  const trilhaBola = [[2.0, 575, 262], [3.2, 675, 252], [4.4, 772, 208], [4.8, 690, 70], [5.0, 690, 70]];
  const A0 = new THREE.Vector3(X(690), 1.0, Z(70)), A1 = aroD.position.clone(), arco = [];
  for (let i = 0; i <= 40; i++) { const u = i / 40; arco.push(new THREE.Vector3(A0.x + (A1.x - A0.x) * u, A0.y + (A1.y - A0.y) * u + 1.1 * Math.sin(Math.PI * u), A0.z + (A1.z - A0.z) * u)); }
  const arcoG = new THREE.BufferGeometry().setFromPoints(arco);
  const rastro = new THREE.Line(arcoG, new THREE.LineBasicMaterial({ color: 0xF6D48A, transparent: true, opacity: 0.9 })); scene.add(rastro);
  const passe = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(772), 0.6, Z(208)), new THREE.Vector3(X(690), 0.6, Z(70))]), new THREE.LineBasicMaterial({ color: 0x5BE09B, transparent: true, opacity: 0.9 }));
  scene.add(passe);
  const pulso = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 48), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  pulso.rotation.x = -Math.PI / 2; pulso.position.set(A1.x, A1.y, 0); scene.add(pulso);

  let composer = null, bloom = null;
  if (EffectComposer) { composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.65, 0.55, 0.6); composer.addPass(bloom); }

  function medir() {
    const w = Math.max(1, box.clientWidth), h = Math.max(1, box.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 1 ? 52 : 36; camera.updateProjectionMatrix();
    if (composer) { composer.setSize(w, h); bloom.resolution.set(w, h); }
  }
  const ro = new ResizeObserver(medir); ro.observe(box); medir();

  const DOWN = new THREE.Vector3(0, -1, 0), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), alvo = new THREE.Vector3();
  let visivel = true, raf = 0, t0 = performance.now(), pausadoEm = 0;
  function quadro(agora) {
    raf = 0;
    const T = (agora - t0) / 1000, t = T % 8;
    const a = 0.35 + Math.sin(T * 0.12) * 0.4, retrato = camera.aspect < 1;
    camera.position.set(Math.sin(a) * (retrato ? 9.6 : 8.6) - 1.0, (retrato ? 4.2 : 3.3) + Math.sin(T * 0.21) * 0.35, Math.cos(a) * (retrato ? 9.6 : 8.6));
    camera.lookAt(retrato ? 2.2 : 1.6, 0.3, 0);
    spots.forEach((sp, i) => {
      const sx = sp.x + Math.sin(T * 0.5 + i * 2) * 1.5, sz = sp.z + Math.cos(T * 0.37 + i) * 0.9;
      sp.s.target.position.set(sx, 0, sz);
      sp.cone.quaternion.setFromUnitVectors(DOWN, alvo.set(sx, 0, sz).sub(sp.s.position).normalize());
    });
    const dp = dustG.attributes.position;
    for (let i = 0; i < N; i++) dp.setXYZ(i, seed[i * 4] + Math.sin(T * 0.3 + i) * 0.1, (seed[i * 4 + 1] + T * seed[i * 4 + 3]) % 4.5, seed[i * 4 + 2]);
    dp.needsUpdate = true;
    const vis = clamp((t - 1.6) / 0.5, 0, 1) * clamp((7.6 - t) / 0.7, 0, 1);
    [[atq, ATQ], [def, DEF]].forEach(([arr, tr]) => arr.forEach((pl, i) => { const [px, py] = at(tr[i], t); pl.grp.position.set(X(px), 0, Z(py)); pl.mats[0].opacity = vis; pl.mats[1].opacity = 0.5 * vis; }));
    if (t < 5.0) { const [bx, by] = at(trilhaBola, t), drib = t < 4.4 ? Math.abs(Math.sin(t * 9)) * 0.3 : 0.25; bola.position.set(X(bx), 0.08 + drib + (t >= 4.4 ? 0.4 : 0), Z(by)); }
    else bola.position.copy(arco[Math.round(clamp((t - 5.0) / 0.7, 0, 1) * 40)]);
    bola.visible = t > 2.0 && t < 5.75;
    passe.material.opacity = t > 4.4 && t < 6.2 ? 0.9 * clamp((6.2 - t) / 0.6, 0, 1) : 0;
    arcoG.setDrawRange(0, t < 5.0 ? 0 : Math.round(clamp((t - 5.0) / 0.7, 0, 1) * 41));
    rastro.material.opacity = t < 6.6 ? 0.9 : Math.max(0, 0.9 - (t - 6.6));
    const k = clamp((t - 5.7) / 1.0, 0, 1), acerto = t > 5.7 && t < 6.7;
    pulso.scale.setScalar(0.4 + k * 4); pulso.material.opacity = t > 5.7 ? 1 - k : 0;
    aroD.material.emissive.set(acerto ? GREEN : GOLD); aroD.material.emissiveIntensity = 0.8 + (acerto ? (1 - k) * 5 : 0);
    composer ? composer.render() : renderer.render(scene, camera);
    if (visivel && !document.hidden) raf = requestAnimationFrame(quadro);
  }
  const tocar = () => { if (!raf && visivel && !document.hidden) { if (pausadoEm) { t0 += performance.now() - pausadoEm; pausadoEm = 0; } raf = requestAnimationFrame(quadro); } };
  const parar = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; pausadoEm = performance.now(); } };
  const io = new IntersectionObserver(es => { visivel = es[0].isIntersecting; visivel ? tocar() : parar(); });
  io.observe(box);
  const vis = () => document.hidden ? parar() : tocar();
  document.addEventListener('visibilitychange', vis);
  box.classList.add('on');
  tocar();
  return { parar: () => { parar(); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', vis); renderer.dispose(); canvas.remove(); } };
}
