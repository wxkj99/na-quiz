# QUALIFY EXAM FOR APPLIED MATHEMATICS (Autumn 2024)

---

### (1) (20 points)
The \(n\)-th Chebyshev polynomial is defined by: \(T_n(x) = \cos(n \cdot \arccos(x))\).

(i) Prove that \(T_n(x)\) is a polynomial of degree \(n\).
(ii) For any \(x\) with \(0 < x < 1\), show that \(T_n(2x - 1) = T_{2n}(\sqrt{x})\).
(iii) Prove that the system of Chebyshev polynomials \(\{T_k : 0 \leq k < n\}\) is orthogonal with respect to the discrete inner product \((u, v) = \sum_{k=1}^n u(x_k)v(x_k)\), where \(\{x_k\}\) are the Chebyshev points \(x_k = \cos(\frac{2k-1}{2n}\pi)\).

---

### (2) (15 points)
Let \(A\) be a symmetric positive definite matrix. Assume that the conjugate gradient method is applied to solve \(Ax = b\), where \(x^*\) is the exact solution.

(i) Prove the following error estimate:
\[ \|x_k - x^*\|_A \leq 2 \left( \frac{\sqrt{\kappa_2(A)} - 1}{\sqrt{\kappa_2(A)} + 1} \right)^k \|x_0 - x^*\|_A, \]
where \(\kappa_2(A) = \frac{\lambda_{\max}(A)}{\lambda_{\min}(A)}\). (State any theorem from approximation theory clearly).
(ii) Describe one Krylov subspace method for non-Hermitian matrices (\(A \neq A^*\)).

---

### (3) (15 points)
Consider Kepler’s equation \(f(x) = x - \epsilon \sin x - \eta, (0 < |\epsilon| < 1), \eta \in \mathbb{R}\).

(i) Show that for each \(\epsilon, \eta\), there is exactly one real root \(\alpha = \alpha(\epsilon, \eta)\). Furthermore, \(\eta - |\epsilon| \leq \alpha \leq \eta + |\epsilon|\).
(ii) Writing the equation in fixed point form \(x = \phi(x), \phi(x) = \epsilon \sin x + \eta\), show that the fixed point iteration \(x_{n+1} = \phi(x_n)\) converges for arbitrary starting value \(x_0\).
(iii) Let \(m\) be an integer such that \(m\pi < \eta < (m+1)\pi\). Show that Newton’s method with starting value \(x_0 = (m+1)\pi\) if \((-1)^m\epsilon > 0\), and \(m\pi\) otherwise, is guaranteed to converge monotonically to \(\alpha\).

---

### (4) (15 points)
For the system \(u_t = v_x, v_t = u_x\), analyze the truncation error and stability of the scheme:
\[ \frac{1}{\tau} \left( u_j^{n+1} - \frac{1}{2}(u_{j+1}^n + u_{j-1}^n) \right) = \frac{1}{2h}(v_{j+1}^n - v_{j-1}^n), \]
\[ \frac{1}{\tau} \left( v_j^{n+1} - \frac{1}{2}(v_{j+1}^n + v_{j-1}^n) \right) = \frac{1}{2h}(u_{j+1}^n - u_{j-1}^n). \]

---

### (5) (15 points)
Write and prove the maximum principle of the centered finite difference scheme for discretizing:
\[ u_{xx} + u_{yy} + d(x, y)u_x + e(x, y)u_y + f(x, y)u = 0, \quad f < 0, \]
under some suitable assumptions.

---

**Remark: Choose either (6) or (7).**

### (6) (20 points)
Consider the BVP for \(y(x)\) on \([0, 1]\) as \(0 < \epsilon \ll 1\):
\[ \epsilon y'' + \epsilon(1 + x)^2 y' - y = x - 1, \quad y(0) = \alpha, y(1) = -1. \]
(i) Suppose \(\alpha = 1\). Construct a composite expansion and sketch the solution.
(ii) Construct a composite expansion for \(\alpha = 0\).
(iii) What is the accuracy of your solution in \(\epsilon\)? Formally explain.

---

### (7) (20 points)
Let \(f : \mathbb{R}^n \to \mathbb{R}\) be convex and \(\partial f(x)\) be the subgradient set.

(i) If \(x \in \text{int dom } f\), prove that \(\partial f(x)\) is nonempty and bounded.
(ii) Assume \(f = \|x\|_1\), write down the \(\partial f(x)\).
(iii) Given \(y \in \mathbb{R}^n\) and \(\lambda > 0\), calculate the closed form solution of:
\[ \min_x \frac{1}{2}\|x - y\|_2^2 + \lambda\|x\|_1. \]
