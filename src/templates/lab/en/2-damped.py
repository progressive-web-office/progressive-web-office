# Free response of a damped oscillator for several damping ratios
t = np.linspace(0, 10, 1000)
plt.figure(figsize=(6, 3.4))
for zeta in (0.05, 0.2, 0.5):
    wd = 2 * np.pi * np.sqrt(1 - zeta**2)
    _x = np.exp(-zeta * 2 * np.pi * t) * np.cos(wd * t)
    plt.plot(t, _x, label=f"ζ = {zeta}")
plt.plot(t, np.exp(-0.05 * 2 * np.pi * t), "k--", lw=0.8, label="envelope")
plt.xlabel("t (s)")
plt.ylabel("x / x₀")
plt.grid(alpha=0.3)
plt.legend()
plt.tight_layout()
