# Réponse libre d'un oscillateur amorti pour plusieurs facteurs d'amortissement
t = np.linspace(0, 10, 1000)
plt.figure(figsize=(6, 3.4))
for zeta in (0.05, 0.2, 0.5):
    wd = 2 * np.pi * np.sqrt(1 - zeta**2)
    x = np.exp(-zeta * 2 * np.pi * t) * np.cos(wd * t)
    plt.plot(t, x, label=f"ζ = {zeta}")
plt.plot(t, np.exp(-0.05 * 2 * np.pi * t), "k--", lw=0.8, label="enveloppe")
plt.xlabel("t (s)")
plt.ylabel("x / x₀")
plt.grid(alpha=0.3)
plt.legend()
plt.tight_layout()
