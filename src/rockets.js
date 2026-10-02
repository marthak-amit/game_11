// Procedural rocket ships (no assets). Nose points to -Z, local +Y is "up" (toward the tunnel centre).
import * as THREE from 'three';

const P = (color, extra = {}) => new THREE.MeshPhongMaterial({ color, shininess: 70, transparent: true, ...extra });

// A cylinder/cone along the ship axis. tip=true -> pointed toward -Z.
const axial = (geo) => geo.rotateX(-Math.PI / 2);

function finGeo(w, l) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(w, l * 0.55); s.lineTo(w, l); s.lineTo(0, l * 0.9); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
  g.translate(0, 0, -0.025);
  return g.rotateX(Math.PI / 2); // shape-y -> ship Z (backwards), thickness -> tangent
}

export function buildRocket(skin) {
  const group = new THREE.Group(), mats = [], flames = [];
  const mat = (c, x) => { const m = P(c, x); mats.push(m); return m; };
  const add = (geo, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };

  const flame = (x, y, z, r, len, color, core) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    for (const [rr, ll, c, op] of [[r, len, color, 0.8], [r * 0.5, len * 0.6, core, 0.95]]) {
      const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
      m.userData.base = op; mats.push(m);
      g.add(new THREE.Mesh(new THREE.ConeGeometry(rr, ll, 14, 1, true).translate(0, ll / 2, 0).rotateX(Math.PI / 2), m));
    }
    group.add(g); flames.push(g);
  };

  // One classic rocket at offset (ox, oy)
  const rocket = ({ ox = 0, oy = 0, len = 1.3, r = 0.3, noseLen = 0.8, body, nose, fin, ring, win = 0x3aa0ff, finN = 3, finW = 0.34, finL = 0.7, flameC = 0xff7a18, flameCore = 0xfff2a0, portholes = true }) => {
    const bm = mat(body), nm = mat(nose), fm = mat(fin);
    add(axial(new THREE.CylinderGeometry(r, r * 1.05, len, 24)), bm, ox, oy, 0);
    add(axial(new THREE.ConeGeometry(r, noseLen, 24)), nm, ox, oy, -(len / 2 + noseLen / 2));
    if (ring) add(axial(new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.1, 24)), mat(ring), ox, oy, -len * 0.5 + 0.02);
    add(axial(new THREE.CylinderGeometry(r * 0.62, r * 0.8, 0.22, 16)), mat(0x24262e), ox, oy, len / 2 + 0.1);
    const angles = finN === 4 ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : [0, Math.PI, -Math.PI / 2];
    for (const a of angles.slice(0, finN)) {
      const holder = new THREE.Group(); holder.position.set(ox, oy, 0); holder.rotation.z = a; group.add(holder);
      const f = new THREE.Mesh(finGeo(finW, finL), fm); f.position.set(r * 0.9, 0, len / 2 - finL * 0.95); holder.add(f);
    }
    if (portholes) {
      add(new THREE.SphereGeometry(r * 0.46, 16, 12).scale(1, 0.55, 1), mat(win, { emissive: win, emissiveIntensity: 0.55 }), ox, oy + r * 0.92, -len * 0.18);
      add(new THREE.TorusGeometry(r * 0.5, r * 0.1, 8, 20).rotateX(Math.PI / 2), mat(0x9aa3b2), ox, oy + r * 0.9, -len * 0.18);
    }
    flame(ox, oy, len / 2 + 0.2, r * 0.75, 1.5, flameC, flameCore);
  };

  switch (skin.id) {
    case 'comet': { // space-shuttle stack (orange tank, orbiter, twin boosters)
      add(axial(new THREE.CylinderGeometry(0.24, 0.24, 1.9, 20)), mat(0xc2622b), 0, 0.28, 0);
      add(axial(new THREE.ConeGeometry(0.24, 0.7, 20)), mat(0xc2622b), 0, 0.28, -1.3);
      const orb = add(axial(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 18)), mat(0xf4f6fa), 0, -0.14, 0.15);
      add(axial(new THREE.ConeGeometry(0.2, 0.5, 18)), mat(0x20232b), 0, -0.14, -0.75);
      const wing = new THREE.Shape(); wing.moveTo(0, 0); wing.lineTo(0.75, 0.55); wing.lineTo(0.75, 0.7); wing.lineTo(0, 0.7); wing.closePath();
      for (const sx of [1, -1]) { const w = add(new THREE.ExtrudeGeometry(wing, { depth: 0.04, bevelEnabled: false }).rotateX(Math.PI / 2), mat(0xf4f6fa), sx * 0.12, -0.2, 0.05); if (sx < 0) w.scale.x = -1; }
      add(new THREE.BoxGeometry(0.04, 0.4, 0.3), mat(0xf4f6fa), 0, 0.1, 0.65);
      for (const sx of [1, -1]) {
        add(axial(new THREE.CylinderGeometry(0.1, 0.1, 1.55, 14)), mat(0xffffff), sx * 0.46, 0.05, 0.1);
        add(axial(new THREE.ConeGeometry(0.1, 0.4, 14)), mat(0xe8eaf0), sx * 0.46, 0.05, -0.88);
        add(axial(new THREE.CylinderGeometry(0.06, 0.09, 0.2, 10)), mat(0x24262e), sx * 0.46, 0.05, 0.98);
        flame(sx * 0.46, 0.05, 1.05, 0.1, 1.5, 0xff8a1f, 0xfff2a0);
      }
      flame(0, -0.14, 0.82, 0.17, 1.3, 0x7fd0ff, 0xffffff);
      break;
    }
    case 'ember': rocket({ len: 1.0, r: 0.42, noseLen: 0.8, body: 0xff6a1a, nose: 0x2a2d38, fin: 0xffcf3a, ring: 0xffcf3a, win: 0xffe28a, finN: 4, finW: 0.4, finL: 0.7, flameC: 0xff3a10 }); break;
    case 'viper': rocket({ len: 1.7, r: 0.17, noseLen: 1.1, body: 0x14181f, nose: 0x39ff7a, fin: 0x39ff7a, ring: 0x39ff7a, win: 0x39ff7a, finN: 3, finW: 0.38, finL: 0.8, flameC: 0x39ff7a, flameCore: 0xeaffef }); break;
    case 'nova': // twin rockets
      rocket({ ox: -0.34, len: 1.2, r: 0.2, noseLen: 0.7, body: 0xe9dcff, nose: 0x9b5cff, fin: 0x9b5cff, ring: 0x9b5cff, win: 0xc9a8ff, finN: 3, finW: 0.26, finL: 0.55, flameC: 0xb06bff, flameCore: 0xffffff });
      rocket({ ox: 0.34, len: 1.2, r: 0.2, noseLen: 0.7, body: 0xe9dcff, nose: 0x9b5cff, fin: 0x9b5cff, ring: 0x9b5cff, win: 0xc9a8ff, finN: 3, finW: 0.26, finL: 0.55, flameC: 0xb06bff, flameCore: 0xffffff });
      break;
    case 'aurum': rocket({ len: 1.5, r: 0.3, noseLen: 0.95, body: 0xfff4c2, nose: 0xe8b923, fin: 0xe8b923, ring: 0xe8b923, win: 0x36e6ff, finN: 4, finW: 0.4, finL: 0.8, flameC: 0xffd23a, flameCore: 0xffffff }); break;
    default: rocket({ body: 0xf2f4f8, nose: 0xe23c2b, fin: 0xe23c2b, ring: 0xe23c2b }); // classic cartoon rocket
  }
  return { group, mats, flames };
}
