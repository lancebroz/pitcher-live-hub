// Release-pose solver for the Overview tab's 3D release model.
// ─── Release-pose solver ────────────────────────────────────────────────
// World frame (feet): X = Statcast x (catcher's view, + = 1B side), Y = up
// (0 = plate level), Z = distance in front of the rubber toward the plate.
// Measured inputs pin the ball; height + arm angle pin the shoulder; the rest
// of the body is solved to the most typical release posture that fits.
function moundH(x, z) {
  var r = Math.hypot(x, z - 1.5);
  if (r >= 9) return 0;
  var edge = r <= 2.5 ? 1 : 0.5 * (1 + Math.cos(Math.PI * (r - 2.5) / 6.5));
  var slope = z <= 0.5 ? 10 / 12 : Math.max(0, 10 / 12 - (z - 0.5) / 12);
  return Math.min(slope, (10 / 12) * edge);
}
var V = {
  add: function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
  sub: function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
  mul: function (a, k) { return [a[0] * k, a[1] * k, a[2] * k]; },
  dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
  cross: function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
  len: function (a) { return Math.hypot(a[0], a[1], a[2]); },
  norm: function (a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
};
// Two-bone IK: returns the middle joint. Target is pulled in if out of reach.
function ik2(root, target, l1, l2, pole) {
  var d = V.sub(target, root), dist = V.len(d), maxd = (l1 + l2) * 0.999;
  var end = target;
  if (dist > maxd) { end = V.add(root, V.mul(V.norm(d), maxd)); dist = maxd; }
  var dir = V.norm(V.sub(end, root));
  var a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  var h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  var p = V.sub(pole, V.mul(dir, V.dot(pole, dir)));
  p = V.len(p) < 1e-6 ? [0, 0, 1] : V.norm(p);
  return { mid: V.add(V.add(root, V.mul(dir, a)), V.mul(p, h)), end: end };
}
function solvePose(inp) {
  var H = inp.heightIn / 12, D = Math.PI / 180;
  var s = inp.hand === "L" ? 1 : -1;               // throwing-side sign on X
  var th = inp.armAngle * D;
  var seg = {
    upper: 0.186 * H, fore: 0.146 * H, hand: 0.075 * H, shHalf: 0.115 * H, trunk: 0.29 * H,
    hipHalf: 0.052 * H, thigh: 0.245 * H, shank: 0.246 * H, ankle: 0.039 * H, foot: 0.152 * H,
    neck: 0.045 * H, headR: 0.062 * H
  };
  var B = [inp.relX, inp.relZ, inp.ext];
  // Arm length from height (elbow ~25° short of straight at release).
  var lower = seg.fore + seg.hand, elbowInt = 155 * D;
  var L = Math.sqrt(seg.upper * seg.upper + lower * lower - 2 * seg.upper * lower * Math.cos(elbowInt));
  // Frontal (catcher's-view) shoulder→ball length: measured by Savant when available, else typical.
  var F_TYP = 0.37, measured = inp.front != null;
  var front = measured ? inp.front : L * Math.sqrt(1 - F_TYP * F_TYP);
  // Depth (the missing y): how far the shoulder trails the ball toward the rubber. A full arm of length L
  // whose front-view projection is `front` must reach forward by sqrt(L² − front²). Arm length is itself an
  // estimate, so shrink halfway to the league-typical forward lean and keep it in a plausible band.
  var fRaw = Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(1, front / L), 2)));
  var f = Math.max(0.2, Math.min(0.6, measured ? 0.5 * fRaw + 0.5 * F_TYP : F_TYP));
  var depth = f * L;
  var S = [B[0] - s * front * Math.cos(th), B[1] - front * Math.sin(th), B[2] - depth];   // throwing shoulder
  var reach = Math.hypot(front, depth), armScale = Math.max(1, reach / ((seg.upper + lower) * 0.985));
  var upperA = seg.upper * armScale, lowerA = lower * armScale;
  var stride = Math.max(0.70 * H, Math.min(0.95 * H, inp.ext - 0.20 * H));
  var legLen = seg.thigh + seg.shank;
  var tau0 = Math.max(-35, Math.min(40, 0.75 * inp.armAngle - 6)), rho = 18 * D;
  function build(phiDeg, tauDeg) {
    var tau = tauDeg * D, phi = phiDeg * D;
    // Shoulder line tilts with the slot; throwing side rotated through toward the plate.
    var u = V.norm([s * Math.cos(tau) * Math.cos(rho), Math.sin(tau), Math.sin(rho) * Math.cos(tau)]);
    var N = V.sub(S, V.mul(u, seg.shHalf)), G = V.sub(N, V.mul(u, seg.shHalf));
    var t0 = [0, Math.cos(phi), Math.sin(phi)];
    var t = V.norm(V.sub(t0, V.mul(u, V.dot(t0, u))));
    var P = V.sub(N, V.mul(t, seg.trunk));
    var pt = 0.4 * tau, v = V.norm([s * Math.cos(pt), Math.sin(pt), 0.06]);
    var hipT = V.add(P, V.mul(v, seg.hipHalf)), hipL = V.sub(P, V.mul(v, seg.hipHalf));
    var ax = hipL[0] - s * 0.02 * H;
    var ankL = [ax, moundH(ax, stride) + seg.ankle, stride];
    var d = V.len(V.sub(ankL, hipL)), dd = Math.min(d, legLen * 0.999);
    var kf = 180 - Math.acos(Math.max(-1, Math.min(1, (seg.thigh * seg.thigh + seg.shank * seg.shank - dd * dd) / (2 * seg.thigh * seg.shank)))) / D;
    return { phi: phiDeg, tau: tauDeg, u: u, N: N, G: G, t: t, P: P, hipT: hipT, hipL: hipL, ankL: ankL, d: d, kf: kf };
  }
  // Posture solve: trunk flexion, shoulder tilt and lead-knee flexion share whatever the measurements demand,
  // each pulled toward its typical value at release. With Savant's body-centre x, the pelvis is pinned laterally.
  var best = null, tLo = inp.comX != null ? -35 : tau0, tHi = inp.comX != null ? 45 : tau0;
  for (var tauD = tLo; tauD <= tHi; tauD += 1) for (var phi = 10; phi <= 65; phi += 1) {
    var b = build(phi, tauD), over = Math.max(0, b.d - legLen * 0.995);
    b.err = Math.pow((phi - 36) / 9, 2) + Math.pow((b.kf - 40) / 14, 2) + over * 200 + Math.pow((tauD - tau0) / 12, 2)
      + (inp.comX != null ? Math.pow((b.P[0] - inp.comX) / 0.35, 2) : 0);
    if (!best || b.err < best.err) best = b;
  }
  var t = best.t, P = best.P, u = best.u, N = best.N, G = best.G;
  var n = V.cross(u, t); if (n[2] < 0) n = V.mul(n, -1); n = V.norm(n); // chest normal (faces plate)
  var kL = ik2(best.hipL, best.ankL, seg.thigh, seg.shank, [-s * 0.15, 0.1, 1]);
  var toeL = V.add(best.ankL, [-s * 0.03 * H, -seg.ankle * 0.55, seg.foot * 0.72]);
  var heelL = V.add(best.ankL, [0, -seg.ankle * 0.55, -seg.foot * 0.25]);
  // Trail leg: toe dragging off the rubber
  var tz = P[2] - 0.31 * H, tx = best.hipT[0] + s * 0.07 * H;
  var ankT = [tx, moundH(tx, tz) + 0.11 * H, tz];
  var kT = ik2(best.hipT, ankT, seg.thigh, seg.shank, [-s * 0.2, -1, 0.45]);
  ankT = kT.end; ankT[1] = Math.max(ankT[1], moundH(ankT[0], ankT[2]) + 0.05 * H);
  var kneeT = kT.mid; kneeT[1] = Math.max(kneeT[1], moundH(kneeT[0], kneeT[2]) + 0.045 * H);
  var toeT = [ankT[0] + s * 0.01 * H, moundH(ankT[0], ankT[2] + 0.07 * H) + 0.012 * H, ankT[2] + 0.07 * H];
  var eT = ik2(S, B, upperA, lowerA, [0, -0.45, -1]);
  var wrist = V.add(eT.mid, V.mul(V.norm(V.sub(B, eT.mid)), seg.fore * armScale));
  var gloveTarget = V.add(V.add(G, V.mul(t, -0.17 * H)), V.add(V.mul(n, 0.11 * H), V.mul(u, 0.03 * H)));
  var eG = ik2(G, gloveTarget, seg.upper, seg.fore, V.add(V.add(V.mul(t, -0.8), V.mul(u, -0.7)), V.mul(n, -0.25)));
  var hd = V.norm(V.add(V.mul(t, 0.55), [0, 0.45, 0.05]));
  var head = V.add(N, V.mul(hd, seg.neck + seg.headR));
  return {
    seg: seg, H: H, s: s, ball: B, shoulderT: S, shoulderG: G, neck: N, pelvis: P, head: head, headDir: hd,
    hipT: best.hipT, hipL: best.hipL, kneeL: kL.mid, ankleL: kL.end, toeL: toeL, heelL: heelL,
    kneeT: kneeT, ankleT: ankT, toeT: toeT, elbowT: eT.mid, wrist: wrist,
    elbowG: eG.mid, glove: eG.end, u: u, t: t, n: n, stride: stride, depth: depth, front: front, shoulderMeasured: measured,
    diag: { trunkFlex: best.phi, shoulderTilt: best.tau, leadKneeFlex: best.kf, armLen: L, shoulderHt: S[1], pelvisX: P[0] }
  };
}
export { solvePose, moundH, V };
