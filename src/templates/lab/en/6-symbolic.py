import sympy as sp

# Symbolic calculation: charging of a capacitor through a resistor
_t, _R, _C, _E = sp.symbols("t R C E", positive=True)
_u = sp.Function("u")
solution = sp.dsolve(sp.Eq(_R * _C * _u(_t).diff(_t) + _u(_t), _E), _u(_t), ics={_u(0): 0})
print(solution)
print("Time to reach 99 %:", sp.expand_log(sp.solve(sp.Eq(solution.rhs, sp.Rational(99, 100) * _E), _t)[0], force=True))
print("Integral:", sp.integrate(sp.exp(-_t**2), (_t, -sp.oo, sp.oo)))
