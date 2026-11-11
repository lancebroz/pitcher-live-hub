// Imperative three.js scene for the Overview tab's release model. React owns the buttons and callout
// cards; this module owns the canvas, camera, figure and measurement lines.
import * as THREE from "three";
import { moundH, V } from "./releaseSolver.js";

const COL = { H: "#60a5fa", E: "#34d399", S: "#fbbf24", A: "#f472b6", G: "#7dd3fc" };
export const RELEASE_COLORS = COL;

export function createReleaseScene({ canvas, stage, svg, getCards, onViewChange }) {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var S = { meas: true, ghost: true }, hot = null, disposed = false, raf = 0;
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var scene = new THREE.Scene();
  scene.background = new THREE.Color("#0a0e17");
  scene.fog = new THREE.Fog("#0a0e17", 70, 240);
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
  scene.add(new THREE.HemisphereLight("#dfe9ff", "#3a2c20", 0.86));
  var key = new THREE.DirectionalLight("#fff4e0", 0.72); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  var sc = key.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 60; key.shadow.bias = -0.0006; key.shadow.radius = 3;
  scene.add(key); scene.add(key.target);
  var rim = new THREE.DirectionalLight("#9fc0ff", 0.35); rim.position.set(0, 6, -14); scene.add(rim);

  // Field: grass, regulation mound (18 ft dia, 10 in high, 1 in/ft front slope), rubber
(function () {
  var g = new THREE.Mesh(new THREE.CircleGeometry(260, 64), new THREE.MeshStandardMaterial({ color: "#142a1f", roughness: 1 }));
  g.rotation.x = -Math.PI / 2; g.position.y = -0.004; g.receiveShadow = true; scene.add(g);
  var NR = 44, NA = 96, pos = [], idx = [];
  for (var i = 0; i <= NR; i++) for (var j = 0; j <= NA; j++) {
    var r = 9 * i / NR, a = 2 * Math.PI * j / NA, x = r * Math.cos(a), z = 1.5 + r * Math.sin(a);
    pos.push(x, moundH(x, z), z);
  }
  for (i = 0; i < NR; i++) for (j = 0; j < NA; j++) { var p = i * (NA + 1) + j, q = p + NA + 1; idx.push(p, p + 1, q, p + 1, q + 1, q); }
  var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#8a6a4e", roughness: 1, side: THREE.DoubleSide }));
  m.receiveShadow = true; scene.add(m);
  var PZ = 60.5, white = new THREE.MeshStandardMaterial({ color: "#f1f5f9", roughness: .8 });
  var dirt = new THREE.Mesh(new THREE.CircleGeometry(13, 48), new THREE.MeshStandardMaterial({ color: "#8a6a4e", roughness: 1 }));
  dirt.rotation.x = -Math.PI / 2; dirt.position.set(0, .002, PZ - 17 / 24); dirt.receiveShadow = true; scene.add(dirt);
  // plate: 17 in wide, 8.5 in sides, point toward the backstop
  var hw = 8.5 / 12, sh = new THREE.Shape(); sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, hw); sh.lineTo(0, 2 * hw); sh.lineTo(-hw, hw); sh.closePath();
  var plate = new THREE.Mesh(new THREE.ShapeGeometry(sh), white); plate.rotation.x = Math.PI / 2; plate.position.set(0, .012, PZ - 17 / 12); plate.material.side = THREE.DoubleSide; scene.add(plate);
  // batter's boxes: 4 ft × 6 ft, 6 in off the plate, centred on the plate's middle
  function chalk(x0, x1, z0, z1) { var m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) || .17, .01, Math.abs(z1 - z0) || .17), white); m.position.set((x0 + x1) / 2, .01, (z0 + z1) / 2); scene.add(m); }
  var zc = PZ - 17 / 12 + hw;
  [-1, 1].forEach(function (sd) { var xi = sd * (hw + .5), xo = sd * (hw + 4.5); chalk(xi, xi, zc - 3, zc + 3); chalk(xo, xo, zc - 3, zc + 3); chalk(xi, xo, zc - 3, zc - 3); chalk(xi, xo, zc + 3, zc + 3); });
  var rub = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: "#f1f5f9", roughness: .7 }));
  rub.position.set(0, 10 / 12 + 0.02, -0.25); rub.receiveShadow = true; scene.add(rub);
})();


  var fig = new THREE.Group(), ghost = new THREE.Group(), ann = new THREE.Group(), dots = new THREE.Group();
  scene.add(fig); scene.add(ghost); scene.add(ann); scene.add(dots);
  var v3 = function (a) { return new THREE.Vector3(a[0], a[1], a[2]); };
var UP = new THREE.Vector3(0, 1, 0);
function std(c, r) { return new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? .7 : r, metalness: .02 }); }
var gray = std("#c3ccd8"), dark = std("#3a4658"), glove = std("#4a3323", .8);
var MATS = {
  mannequin: { skin: gray, jersey: gray, pants: gray, cap: dark, shoe: dark, belt: gray, glove: glove },
  // Uniform is deliberately unbranded, and exposed skin stays a neutral clay tone rather than guessing at a real person's.
  uniform: { skin: std("#b3a79b", .75), jersey: std("#eceff3", .85), pants: std("#c9cfd8", .9), cap: std("#1b2536", .8), shoe: std("#161b24", .6), belt: std("#161b24", .6), glove: glove }
};
// Ghost: depth pre-pass + one translucent layer, so overlapping limbs don't stack into blotches.
var ghostDepth = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
var ghostColor = new THREE.MeshStandardMaterial({ color: COL.G, transparent: true, opacity: .4, depthWrite: false, roughness: 1 });
var GM = { skin: ghostColor, jersey: ghostColor, pants: ghostColor, cap: ghostColor, shoe: ghostColor, belt: ghostColor, glove: ghostColor };
var matBall = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .45, emissive: "#ffffff", emissiveIntensity: .25 });
function add(g, mesh) {
  if (mesh.material === ghostColor) {
    mesh.renderOrder = 3;
    var tw = new THREE.Mesh(mesh.geometry, ghostDepth); tw.renderOrder = 2;
    tw.matrixAutoUpdate = mesh.matrixAutoUpdate; tw.matrix.copy(mesh.matrix); tw.position.copy(mesh.position); tw.quaternion.copy(mesh.quaternion); tw.scale.copy(mesh.scale);
    g.add(tw);
  } else mesh.castShadow = true;
  g.add(mesh); return mesh;
}
function sphere(g, p, r, mat, sx, sy, sz) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat); m.position.copy(v3(p)); if (sx) m.scale.set(sx, sy, sz); return add(g, m); }
// Limb with a muscle profile: radii sampled along the bone, smoothed, lathed.
function limb(g, a, b, radii, mat) {
  var A = v3(a), d = new THREE.Vector3().subVectors(v3(b), A), len = d.length(), n = radii.length;
  var pts = new THREE.SplineCurve(radii.map(function (r, i) { return new THREE.Vector2(r, len * i / (n - 1)); })).getPoints(14);
  var m = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mat);
  m.position.copy(A); m.quaternion.setFromUnitVectors(UP, d.normalize()); add(g, m);
  sphere(g, a, radii[0], mat); sphere(g, b, radii[n - 1], mat);
}
function clear(g) { while (g.children.length) { var c = g.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.children) clear(c); } }
// Measurement lines are thin tubes (WebGL lines can't be thickened), grouped by stat so a hover can bolden them.
var tubes = {};
function tube(key, pts, color, op, dashed, who) {
  var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthTest: false });
  var grp = tubes[key + who] || (tubes[key + who] = []);
  for (var i = 0; i < pts.length - 1; i++) {
    if (dashed && i % 2) continue;
    var A = v3(pts[i]), d = new THREE.Vector3().subVectors(v3(pts[i + 1]), A), len = d.length(); if (len < 1e-5) continue;
    var m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 6, 1, true), mat);
    m.position.copy(A).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(UP, d.normalize()); m.renderOrder = who === "avg" ? 5 : 6;
    ann.add(m); grp.push(m);
  }
  grp.mat = grp.mat || []; grp.mat.push({ m: mat, op: op });
}
function dash(a, b, n) { var o = []; for (var i = 0; i <= n; i++) o.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, a[2] + (b[2] - a[2]) * i / n]); return o; }
var hot = null;
function styleTubes() {
  Object.keys(tubes).forEach(function (k) {
    var isAvg = /avg$/.test(k), key = k.replace(/(avg|me)$/, ""), on = hot === key, g = tubes[k];
    var r = on ? .034 : .011, vis = isAvg ? on : true, dim = hot && !on;
    g.forEach(function (m) { m.scale.set(r, 1, r); m.visible = vis && S.meas; });
    g.mat.forEach(function (o) { o.m.opacity = on ? 1 : dim ? o.op * .22 : o.op * .75; });
  });
}

  // Hand at release: palm facing the plate, index + middle fingers behind the ball, thumb off to the side,
// ring + pinky curled. The ball itself stays exactly on the measured release point.
function buildHand(g, P, mat) {
  var H = P.H, W = P.wrist, B = P.ball, rb = 0.121, rf = .0052 * H;
  var d = V.norm(V.sub(B, W)), pn = V.norm(V.sub([0, 0, 1], V.mul(d, d[2])));      // palm normal → plate
  var th = V.mul(V.cross(d, pn), -P.s);                                           // thumb side
  var at = function (o, a, b, c) { return V.add(o, V.add(V.mul(d, a), V.add(V.mul(th, b), V.mul(pn, c)))); };
  var palm = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat); palm.matrixAutoUpdate = false;
  palm.matrix.makeBasis(v3(V.mul(d, .03 * H)), v3(V.mul(th, .027 * H)), v3(V.mul(pn, .0115 * H))).setPosition(v3(at(W, .026 * H, 0, -.003 * H))); add(g, palm);
  var onBall = function (a, b, c) { return V.add(B, V.mul(V.norm(V.add(V.mul(d, a), V.add(V.mul(th, b), V.mul(pn, c)))), rb + rf * .9)); };
  [1, -1].forEach(function (sd) {           // index (thumb side) and middle
    var K = at(W, .047 * H, sd * .0085 * H + .004 * H, -.005 * H), M = onBall(-.45, sd * .2 + .05, -1), T = onBall(.74, sd * .24 + .04, -.66);
    limb(g, K, M, [rf * 1.12, rf * 1.02], mat); limb(g, M, T, [rf * 1.02, rf * .9], mat);
  });
  // thumb: folded across the palm to sit underneath the ball, opposite the two fingers
  var tk = at(W, .02 * H, .021 * H, .004 * H), tm = at(W, .04 * H, .017 * H, .017 * H), tt = onBall(-.8, .12, .58);
  limb(g, tk, tm, [rf * 1.3, rf * 1.15], mat); limb(g, tm, tt, [rf * 1.15, rf], mat);
  // ring: bent against the side of the ball; pinky: curled into the palm, off the ball
  var rk = at(W, .046 * H, -.013 * H, -.004 * H), rm = onBall(-.35, -.88, -.3), rt = onBall(-.6, -.62, .5);
  limb(g, rk, rm, [rf * 1.05, rf * .98], mat); limb(g, rm, rt, [rf * .98, rf * .88], mat);
  var pk = at(W, .042 * H, -.025 * H, -.003 * H), pm = at(pk, .015 * H, -.001 * H, .012 * H), pt = at(pm, -.009 * H, .005 * H, .013 * H);
  limb(g, pk, pm, [rf, rf * .92], mat); limb(g, pm, pt, [rf * .92, rf * .82], mat);
}
function buildFigure(g, P, M) {
  clear(g);
  var H = P.H, k = function (arr) { return arr.map(function (x) { return x * H; }); };
  // legs (pants), shoes
  limb(g, P.hipL, P.kneeL, k([.050, .056, .052, .043, .036]), M.pants); limb(g, P.kneeL, P.ankleL, k([.035, .041, .036, .027, .022]), M.pants);
  limb(g, P.hipT, P.kneeT, k([.050, .056, .052, .043, .036]), M.pants); limb(g, P.kneeT, P.ankleT, k([.035, .041, .036, .027, .022]), M.pants);
  limb(g, P.heelL, P.toeL, k([.022, .025, .023, .018]), M.shoe); limb(g, P.ankleT, P.toeT, k([.022, .024, .021, .017]), M.shoe);
  limb(g, P.hipL, P.hipT, k([.056, .056]), M.pants);
  // torso: waist → chest → shoulders, flattened front-to-back
  var top = V.add(P.neck, V.mul(P.t, .005 * H)), up = V.sub(top, P.pelvis);
  function torsoPiece(prof, mat, grow) {
    var pts = new THREE.SplineCurve(prof.map(function (q) { return new THREE.Vector2(q[0] * (grow || 1), q[1]); })).getPoints(22);
    var m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat); m.matrixAutoUpdate = false;
    m.matrix.makeBasis(v3(V.mul(P.u, .128 * H)), v3(up), v3(V.mul(P.n, .07 * H))).setPosition(v3(P.pelvis)); add(g, m);
  }
  torsoPiece([[.80, 0], [.76, .22], [.80, .45], [.93, .68], [1, .86], [.9, .97], [.55, 1.03]], M.jersey);
  if (M.belt !== M.jersey) torsoPiece([[.80, .0], [.79, .035], [.78, .07]], M.belt, 1.03);
  limb(g, P.shoulderG, P.shoulderT, k([.041, .041]), M.jersey);
  // arms: sleeves to the elbow, bare forearms
  limb(g, P.shoulderT, P.elbowT, k([.034, .035, .030, .026]), M.jersey); limb(g, P.elbowT, P.wrist, k([.025, .028, .022, .017]), M.skin);
  buildHand(g, P, M.skin);
  limb(g, P.shoulderG, P.elbowG, k([.034, .035, .030, .026]), M.jersey); limb(g, P.elbowG, P.glove, k([.025, .028, .022, .018]), M.skin);
  sphere(g, V.add(P.glove, V.mul(P.n, .02 * H)), .04 * H, M.glove, 1, 1.18, .7);
  // neck, head, cap
  limb(g, P.neck, V.add(P.neck, V.mul(P.headDir, P.seg.neck)), k([.03, .026]), M.skin);
  var hy = v3(P.headDir), hz = new THREE.Vector3(0, 0, 1); hz.addScaledVector(hy, -hz.dot(hy)).normalize();
  var hx = new THREE.Vector3().crossVectors(hy, hz), R = P.seg.headR, base = new THREE.Matrix4().makeBasis(hx, hy, hz).setPosition(v3(P.head));
  function headPart(geo, mat, sx, sy, sz, py, pz) {
    var m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false;
    m.matrix.copy(base).multiply(new THREE.Matrix4().makeTranslation(0, py || 0, pz || 0)).multiply(new THREE.Matrix4().makeScale(sx, sy, sz)); add(g, m);
  }
  headPart(new THREE.SphereGeometry(R, 24, 18), M.skin, .88, 1.1, .98);
  headPart(new THREE.SphereGeometry(R * 1.03, 24, 12, 0, Math.PI * 2, 0, Math.PI * .5), M.cap, .93, 1.06, 1.03, R * .14);
  headPart(new THREE.CylinderGeometry(R * .78, R * .78, R * .06, 24), M.cap, 1, 1, .95, R * .17, R * .95);
}

// Average comparison: just shoulder → arm → ball, so the focus pitcher's release stays readable.
function buildGhostArm(g, P) {
  clear(g);
  var H = P.H, k = function (arr) { return arr.map(function (x) { return x * H; }); };
  var up = V.sub(V.add(P.neck, V.mul(P.t, .005 * H)), P.pelvis);
  var pts = new THREE.SplineCurve([[.80, 0], [.76, .22], [.80, .45], [.93, .68], [1, .86], [.9, .97], [.55, 1.03]].map(function (q) { return new THREE.Vector2(q[0], q[1]); })).getPoints(22);
  var m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), ghostColor); m.matrixAutoUpdate = false;
  m.matrix.makeBasis(v3(V.mul(P.u, .128 * H)), v3(up), v3(V.mul(P.n, .07 * H))).setPosition(v3(P.pelvis)); add(g, m);
  limb(g, P.shoulderG, P.shoulderT, k([.041, .041]), ghostColor);
  limb(g, P.shoulderT, P.elbowT, k([.034, .035, .030, .026]), ghostColor); limb(g, P.elbowT, P.wrist, k([.025, .028, .022, .017]), ghostColor);
  buildHand(g, P, ghostColor);
}

  var anchors = {};
function measure(P, who, colors) {
  var B = P.ball, S = P.shoulderT, s = P.s, z, c = colors;
  // release height: ball straight down to plate level
  tube("H", [B, [B[0], 0, B[2]]], c.H, .95, false, who); tube("H", [[B[0] - .25, 0, B[2]], [B[0] + .25, 0, B[2]]], c.H, .95, false, who);
  // extension: rubber front out to under the ball
  var ex = []; for (z = 0; z <= B[2] + 1e-6; z += B[2] / 24) ex.push([B[0], moundH(B[0], z) + .03, z]);
  tube("E", ex, c.E, .95, false, who);
  tube("E", dash([s * 1, moundH(s, 0) + .03, 0], [B[0] + s * .3, moundH(B[0], 0) + .03, 0], 13), c.E, .7, true, who);
  for (var k = 1; k <= Math.floor(B[2]); k++) tube("E", [[B[0] - .12, moundH(B[0], k) + .03, k], [B[0] + .12, moundH(B[0], k) + .03, k]], c.E, .8, false, who);
  // release side: centerline across to the ball at ball height
  tube("S", [[0, B[1], B[2]], B], c.S, .95, false, who);
  tube("S", dash([0, moundH(0, B[2]) + .02, B[2]], [0, B[1] + .35, B[2]], 21), c.S, .6, true, who);
  // arm angle: shoulder→ball vs horizontal, in the front-view plane (how Savant defines it)
  var Lf = P.front, R = Math.min(1.25, Lf * .55), th = Math.atan2(B[1] - S[1], Math.abs(B[0] - S[0]));
  tube("A", dash(S, [S[0] + s * (Lf + .5), S[1], S[2]], 15), c.A, .8, true, who);
  tube("A", [S, B], c.A, .95, false, who);
  var arc = []; for (var i = 0; i <= 24; i++) { var a = th * i / 24; arc.push([S[0] + s * R * Math.cos(a), S[1] + R * Math.sin(a), S[2]]); }
  tube("A", arc, c.A, .95, false, who);
  if (who === "me") anchors = { A: v3(arc[12]), H: v3([B[0], B[1] * .45, B[2]]), S: v3([B[0] * .5, B[1], B[2]]), E: v3([B[0], moundH(B[0], B[2] * .5) + .03, B[2] * .5]) };
}

  function buildAnnotations(P, pc, A) {
    clear(ann); clear(dots); tubes = {};
    var B = P.ball, z;
    sphere(dots, B, 0.121, matBall).castShadow = false;
    var halo = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), new THREE.MeshBasicMaterial({ color: pc, transparent: true, opacity: .32, depthWrite: false })); halo.position.copy(v3(B)); halo.renderOrder = 4; dots.add(halo);
    var cl = []; for (z = 0; z <= 59; z += .5) cl.push([0, moundH(0, z) + .02, z]);
    tube("_c", cl, "#94a3b8", .5, true, "me");
    if (S.ghost && A) {
      var gb = new THREE.Mesh(new THREE.SphereGeometry(0.121, 18, 12), new THREE.MeshBasicMaterial({ color: COL.G, transparent: true, opacity: .95, depthTest: false })); gb.position.copy(v3(A.ball)); gb.renderOrder = 7; dots.add(gb);
      tube("_d", dash(A.ball, B, 9), "#e2e8f0", .9, true, "me");
    }
    measure(P, "me", COL);
    if (A) measure(A, "avg", { H: COL.G, E: COL.G, S: COL.G, A: COL.G });
    styleTubes();
  }

  // ─── camera rig: orbit about the body, drift toward the ball as you zoom in ───
  var cam = { az: 0, el: .2, r: 19, taz: 0, tel: .2, tr: 19 }, pose = null, pivot = new THREE.Vector3(), curPivot = new THREE.Vector3(), curView = "quarter", sized = false, placedPivot = false;
  function viewAngles(name) {
    var s = pose ? pose.s : -1;
    // the panel can have no size while the page boots — never let that become an infinite camera distance
    var sw = stage.clientWidth, shh = stage.clientHeight, f = sw > 0 && shh > 0 ? Math.max(1, Math.min(3, 1.42 / (sw / shh))) : 1.2;
    return { quarter: [s * .68, .17, 19 * f], catcher: [0, .07, 19 * f], open: [s * Math.PI / 2, .07, 19 * f], behind: [Math.PI - s * .22, .16, 24 * f], top: [0, 1.5, 22 * f] }[name];
  }
  function setView(name, snap) {
    curView = name; var a = viewAngles(name); cam.taz = a[0]; cam.tel = a[1]; cam.tr = a[2];
    while (cam.taz - cam.az > Math.PI) cam.az += 2 * Math.PI; while (cam.taz - cam.az < -Math.PI) cam.az -= 2 * Math.PI;
    if (snap || reduce) { cam.az = cam.taz; cam.el = cam.tel; cam.r = cam.tr; }
    if (onViewChange) onViewChange(name);
  }
  function freeView() { if (curView !== null) { curView = null; if (onViewChange) onViewChange(null); } }
  function bodyPivot() { return new THREE.Vector3(pose.ball[0] * .42, pose.H * .47, pose.ball[2] * .55); }
  function frame() {
    if (disposed) return;
    var k = reduce ? 1 : .16;
    if (!isFinite(cam.r) || !isFinite(cam.tr)) { cam.r = cam.tr = 24; }
    cam.az += (cam.taz - cam.az) * k; cam.el += (cam.tel - cam.el) * k; cam.r += (cam.tr - cam.r) * k;
    if (pose) {
      var z = Math.max(0, Math.min(1, (16 - cam.r) / 10)); z = z * z * (3 - 2 * z);
      pivot.copy(bodyPivot()).lerp(v3(pose.ball), z);
    }
    curPivot.lerp(pivot, reduce ? 1 : .2);
    var ce = Math.cos(cam.el);
    camera.position.set(curPivot.x + cam.r * Math.sin(cam.az) * ce, curPivot.y + cam.r * Math.sin(cam.el), curPivot.z + cam.r * Math.cos(cam.az) * ce);
    camera.lookAt(curPivot);
    key.position.set(curPivot.x + 7, 16, curPivot.z + 9); key.target.position.copy(curPivot);
    renderer.render(scene, camera);
    layoutCallouts();
    raf = requestAnimationFrame(frame);
  }
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = 30; camera.updateProjectionMatrix();
    // re-frame for the new shape unless the viewer has taken over the camera
    if (curView && pose) setView(curView, !sized); sized = true;
  }
  var ro = new ResizeObserver(resize); ro.observe(stage); resize();

  // Callouts sit in the left/right gutters, away from the figure, each tied to its measurement by a leader line.
  var cpos = {}, side = {};
  function layoutCallouts() {
    var w = stage.clientWidth, h = stage.clientHeight, keys = ["A", "H", "S", "E"], cards = getCards();
    if (!S.meas || !pose || !anchors.A || keys.some(function (k) { return !cards[k]; })) { svg.innerHTML = ""; return; }
    var pr = {}; keys.forEach(function (k) { var p = anchors[k].clone().project(camera); pr[k] = { x: (p.x * .5 + .5) * w, y: (-p.y * .5 + .5) * h }; });
    var sorted = keys.slice().sort(function (a, b) { return pr[a].x - pr[b].x; });
    var want = {}; sorted.forEach(function (k, i) { want[k] = i < 2 ? "L" : "R"; });
    var L = keys.filter(function (k) { return side[k] === "L"; }), Rr = keys.filter(function (k) { return side[k] === "R"; });
    var ok = L.length === 2 && Rr.length === 2 && Math.max(pr[L[0]].x, pr[L[1]].x) < Math.min(pr[Rr[0]].x, pr[Rr[1]].x) + 45;
    if (!ok) side = want;
    var path = "";
    ["L", "R"].forEach(function (sd) {
      var ks = keys.filter(function (k) { return side[k] === sd; }).sort(function (a, b) { return pr[a].y - pr[b].y; });
      var y = 46;
      ks.forEach(function (k, i) {
        var el = cards[k], bw = el.offsetWidth, bh = el.offsetHeight, rest = 0, c = cpos[k] || (cpos[k] = {});
        for (var j = i + 1; j < ks.length; j++) rest += cards[ks[j]].offsetHeight + 8;
        var ty = Math.max(y, Math.min(h - 44 - bh - rest, pr[k].y - bh / 2)), tx = sd === "L" ? 8 : w - 8 - bw;
        y = ty + bh + 8;
        if (c.x == null || reduce) { c.x = tx; c.y = ty; } else { c.x += (tx - c.x) * .25; c.y += (ty - c.y) * .25; }
        el.style.transform = "translate(" + c.x.toFixed(1) + "px," + c.y.toFixed(1) + "px)";
        var ex = sd === "L" ? c.x + bw : c.x, ey = c.y + bh / 2, kx = ex + (sd === "L" ? 10 : -10), hotk = hot === k;
        path += '<path d="M' + ex.toFixed(1) + " " + ey.toFixed(1) + " L" + kx.toFixed(1) + " " + ey.toFixed(1) + " L" + pr[k].x.toFixed(1) + " " + pr[k].y.toFixed(1) + '" fill="none" stroke="' + COL[k] + '" stroke-width="' + (hotk ? 2.2 : 1.1) + '" opacity="' + (hot && !hotk ? .25 : hotk ? 1 : .7) + '"/>';
      });
    });
    svg.innerHTML = path;
  }

  // pointer: drag = orbit, pinch/wheel = zoom
  var ptrs = {}, pinch0 = 0;
  function down(e) {
    if (e.target.closest("button")) return;
    ptrs[e.pointerId] = [e.clientX, e.clientY]; try { stage.setPointerCapture(e.pointerId); } catch (err) {} stage.classList.add("drag");
    var ids = Object.keys(ptrs); if (ids.length === 2) pinch0 = Math.hypot(ptrs[ids[0]][0] - ptrs[ids[1]][0], ptrs[ids[0]][1] - ptrs[ids[1]][1]);
  }
  function move(e) {
    var p = ptrs[e.pointerId]; if (!p) return;
    var ids = Object.keys(ptrs);
    if (ids.length === 1) { cam.taz -= (e.clientX - p[0]) * .0075; cam.tel = Math.max(.02, Math.min(1.5, cam.tel + (e.clientY - p[1]) * .005)); cam.az = cam.taz; cam.el = cam.tel; freeView(); }
    ptrs[e.pointerId] = [e.clientX, e.clientY];
    if (ids.length === 2) { var d = Math.hypot(ptrs[ids[0]][0] - ptrs[ids[1]][0], ptrs[ids[0]][1] - ptrs[ids[1]][1]); if (pinch0) zoomBy(pinch0 / d); pinch0 = d; }
  }
  function up(e) { delete ptrs[e.pointerId]; pinch0 = 0; if (!Object.keys(ptrs).length) stage.classList.remove("drag"); }
  function zoomBy(f) { freeView(); cam.tr = Math.max(3.2, Math.min(150, cam.tr * f)); }
  function wheel(e) { e.preventDefault(); zoomBy(Math.exp(e.deltaY * .0012)); }
  function dbl(e) { if (!e.target.closest("button")) setView("quarter"); }
  stage.addEventListener("pointerdown", down); stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", wheel, { passive: false }); stage.addEventListener("dblclick", dbl);

  raf = requestAnimationFrame(frame);
  return {
    // pose / avg come from solvePose; resetView re-frames (used when the pitcher changes)
    setData: function (d) {
      S.meas = d.showLines; S.ghost = d.showAvg; pose = d.pose;
      buildFigure(fig, d.pose, MATS.uniform);
      if (S.ghost && d.avg) buildGhostArm(ghost, d.avg); else clear(ghost);
      buildAnnotations(d.pose, d.pitchColor || "#dc2626", d.avg);
      if (d.resetView || !placedPivot) { setView("quarter", true); curPivot.copy(bodyPivot()); placedPivot = true; }
    },
    setView: setView, zoomBy: zoomBy,
    setHot: function (k) { hot = k; styleTubes(); },
    setBg: function (hex) { scene.background.set(hex); scene.fog.color.set(hex); },
    dispose: function () {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect();
      stage.removeEventListener("pointerdown", down); stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up); stage.removeEventListener("pointercancel", up);
      stage.removeEventListener("wheel", wheel); stage.removeEventListener("dblclick", dbl);
      [fig, ghost, ann, dots].forEach(clear); renderer.dispose();
    }
  };
}
