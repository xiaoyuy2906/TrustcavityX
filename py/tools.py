import numpy as np
import tidy3d as td
from tidy3d import web
from tidy3d.plugins.resonance import ResonanceFinder


def add(a: float, b: float) -> float:
    return a + b


def getFlexCredit():
    a = web.account()
    return {"left": a.credit, "expire": a.credit_expiration}


def getAllowance():
    a = web.account()
    return {
        "left": a.allowance_current_cycle_amount,
        "refresh": a.allowance_current_cycle_end_date,
    }


# --- 1D nanobeam unit cell: band edges at kx = pi/a. All lengths in um. ---


def unitCellSim(n, wavelength, a, w, h, shape, hole_x, hole_y):
    f_lo, f_hi = td.C_0 / (2 * n * a), td.C_0 / (2 * a)  # guided band edges at X: 1 < n_eff < n
    pulse = td.GaussianPulse.from_frequency_range(f_lo, f_hi)  # tidy3d fits the pulse to the range
    f0, fwidth = pulse.freq0, pulse.fwidth  # the names the dipoles and run_time below use
    tstart = pulse.end_time()  # tidy3d: time after which the source is off
    pad = 2 * n * a  # chosen margin: longest wavelength in the range as space to the PML

    if shape == "rect":
        hole = td.Box(size=(hole_x, hole_y, 2 * h))
    else:  # 'circle' or 'ellipse'; hole_x, hole_y are full widths
        t = np.linspace(0, 2 * np.pi, 1001)
        xy = np.array([hole_x / 2 * np.cos(t), hole_y / 2 * np.sin(t)]).T
        hole = td.PolySlab(vertices=xy, slab_bounds=(-h, h), axis=2)
    structures = [
        td.Structure(
            geometry=td.Box(size=(td.inf, w, h)), medium=td.Medium(permittivity=n**2)
        ),
        td.Structure(geometry=hole, medium=td.Medium(permittivity=1)),
    ]

    # Random dipoles and point monitors inside the beam, so every mode gets excited and seen
    rng = np.random.default_rng(12345)
    box = ([-a / 2, -w / 2, 0], [a / 2, w / 2, 0])
    sources = [
        td.PointDipole(
            center=tuple(p),
            polarization="Ey",
            source_time=td.GaussianPulse(freq0=f0, fwidth=fwidth, phase=ph),
        )
        for p, ph in zip(rng.uniform(*box, (5, 3)), rng.uniform(0, 2 * np.pi, 5))
    ]
    monitors = [
        td.FieldTimeMonitor(
            fields=["Ey"],
            center=tuple(p),
            size=(0, 0, 0),
            start=tstart,
            name=f"monitor-time-{i}",
        )
        for i, p in enumerate(rng.uniform(*box, (2, 3)))
    ]

    return td.Simulation(
        size=(a, w + 2 * pad, h + 2 * pad),
        grid_spec=td.GridSpec.auto(),
        structures=structures,
        sources=sources,
        monitors=monitors,
        run_time=800 / fwidth,
        attrs={'target': td.C_0 / wavelength, 'f_lo': f_lo, 'f_hi': f_hi},  # read back by getUnitCellResult
        shutoff=0,
        boundary_spec=td.BoundarySpec(
            x=td.Boundary.bloch(0.5), y=td.Boundary.pml(), z=td.Boundary.pml()
        ),
        normalize_index=None,
        symmetry=(0, 0, 1),  # TE-like modes only
    )


def estimateUnitCell(n, wavelength, a, w, h, shape, hole_x, hole_y):
    sim = unitCellSim(n, wavelength, a, w, h, shape, hole_x, hole_y)
    task_id = web.upload(sim, task_name="unitcell", folder_name="unitcell")
    return {"task_id": task_id, "max_cost": web.estimate_cost(task_id)}


def runTask(task_id):
    web.start(task_id)
    web.monitor(task_id)
    return {"status": web.get_info(task_id).status, "cost": web.real_cost(task_id)}


def getUnitCellResult(task_id):
    data = web.load(task_id, path=f"data/{task_id}.hdf5")
    f0, f_lo, f_hi = (data.simulation.attrs[k] for k in ('target', 'f_lo', 'f_hi'))
    res = ResonanceFinder(freq_window=(f_lo, f_hi)).run(signals=data.data)
    res = res.where(
        (abs(res.Q) > 100) & (res.amplitude > 0.001) & (res.error < 100), drop=True
    )
    pairs = sorted(zip(res.freq.values, res.Q.values))
    nm = lambda f: round(td.C_0 / f * 1e3, 2)
    out = {
        "target_nm": nm(f0),
        "resonances": [{"nm": nm(f), "Q": round(float(q))} for f, q in pairs],
    }
    if len(pairs) >= 2:  # TE0 = dielectric band edge, TE1 = air band edge
        te0, te1 = pairs[0][0], pairs[1][0]
        out.update(
            te0_nm=nm(te0),
            te1_nm=nm(te1),
            mirror_strength=float(min(te1 - f0, f0 - te0) / f0),
        )
    return out
