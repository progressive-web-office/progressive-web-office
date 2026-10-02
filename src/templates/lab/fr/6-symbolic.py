import sympy as sp

# Calcul formel : charge d’un condensateur à travers une résistance
t, R, C, E = sp.symbols("t R C E", positive=True)
u = sp.Function("u")
solution = sp.dsolve(sp.Eq(R * C * u(t).diff(t) + u(t), E), u(t), ics={u(0): 0})
print(solution)
print("Durée pour atteindre 99 % :", sp.expand_log(sp.solve(sp.Eq(solution.rhs, sp.Rational(99, 100) * E), t)[0], force=True))
print("Intégrale :", sp.integrate(sp.exp(-t**2), (t, -sp.oo, sp.oo)))
