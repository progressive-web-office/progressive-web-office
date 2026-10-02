# Bode plot of a first-order low-pass filter, cut-off frequency fc
fc = 1e3
f = np.logspace(1, 5, 400)
H = 1 / (1 + 1j * f / fc)

fig, (gain, phase) = plt.subplots(2, 1, sharex=True, figsize=(6, 4.2))
gain.semilogx(f, 20 * np.log10(abs(H)))
gain.axhline(-3, color="gray", ls=":")
gain.axvline(fc, color="gray", ls=":")
gain.set_ylabel("G (dB)")
phase.semilogx(f, np.degrees(np.angle(H)))
phase.set_ylabel("φ (°)")
phase.set_xlabel("f (Hz)")
for ax in (gain, phase):
    ax.grid(which="both", alpha=0.3)
fig.tight_layout()
print(f"At fc: G = {20 * np.log10(abs(1 / (1 + 1j))):.2f} dB, φ = -45°")
