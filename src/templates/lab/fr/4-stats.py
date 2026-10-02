# 200 mesures de g au pendule : moyenne, dispersion et histogramme
g = rng.normal(9.81, 0.05, 200)
mean, s = g.mean(), g.std(ddof=1)
u = s / np.sqrt(g.size)
print(f"g = {mean:.3f} ± {u:.3f} m/s² (s = {s:.3f})")

_x = np.linspace(9.6, 10.0, 200)
plt.figure(figsize=(6, 3.4))
plt.hist(g, bins=20, density=True, alpha=0.6, edgecolor="white")
plt.plot(_x, np.exp(-((_x - mean) ** 2) / (2 * s**2)) / (s * np.sqrt(2 * np.pi)))
plt.axvline(mean, color="k", lw=1)
plt.xlabel("g (m/s²)")
plt.ylabel("densité")
plt.tight_layout()
