import numpy as np
import matplotlib.pyplot as plt

# Intensité I (A) et tension U (V) mesurées aux bornes d'une résistance
rng = np.random.default_rng(7)
I = np.linspace(0.01, 0.10, 10)
U = 47 * I + rng.normal(0, 0.08, I.size)

# Droite des moindres carrés U = R I + U0
R, U0 = np.polyfit(I, U, 1)
print(f"R = {R:.1f} Ω, U0 = {U0:.3f} V")

plt.figure(figsize=(6, 3.4))
plt.errorbar(I * 1e3, U, yerr=0.1, fmt="o", capsize=3, label="mesures")
plt.plot(I * 1e3, R * I + U0, label=f"U = {R:.1f} I + {U0:.2f}")
plt.xlabel("I (mA)")
plt.ylabel("U (V)")
plt.grid(alpha=0.3)
plt.legend()
plt.tight_layout()
