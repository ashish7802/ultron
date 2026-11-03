"""19. Verification Engine: result checks, assertions, evidence validation.

Security Boundary (restricted assertion evaluator)
    Assertions are caller-supplied expressions.  They are NEVER handed to
    ``eval``: even ``eval(expr, {"__builtins__": {}}, ctx)`` is an arbitrary
    code-execution hole, because ``().__class__.__mro__[-1].__subclasses__()``
    reaches the import machinery without ever naming a builtin.  Instead the
    expression is parsed with ``ast`` and evaluated node-by-node against a
    fixed whitelist (literals, context names, boolean/arithmetic/comparison
    operators, containers and a small set of pure builtins such as ``len``).
    Attribute access, subscripts, comprehensions, lambdas and dunder names are
    rejected, so a malicious assertion can only fail — never execute code.
"""
import ast
import asyncio
import operator
import time
import uuid
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

# Whitelisted pure functions for assertion expressions.  Nothing here touches
# the filesystem, network, processes or Python internals.
_ALLOWED_FUNCS = {
    "len": len, "str": str, "int": int, "float": float, "bool": bool,
    "min": min, "max": max, "sum": sum, "abs": abs, "round": round,
    "any": any, "all": all, "sorted": sorted,
}
_ALLOWED_BINOPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod,
}
_ALLOWED_UNARYOPS = {ast.Not: operator.not_, ast.USub: operator.neg, ast.UAdd: operator.pos}
_ALLOWED_CMPOPS = {
    ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt,
    ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge,
    ast.In: lambda a, b: a in b, ast.NotIn: lambda a, b: a not in b,
    ast.Is: operator.is_, ast.IsNot: operator.is_not,
}
# Caps that keep a malformed/deep expression from becoming a CPU/memory DoS.
_MAX_EXPR_LEN = 2000
_MAX_DEPTH = 40
_MAX_INT_MAGNITUDE = 10 ** 9


def _eval_ast(node, context, depth=0):
    """Evaluates one whitelisted AST node of an assertion expression.

    Args:
        node (ast.AST): Parsed expression node.
        context (dict): Names the expression may reference.
        depth (int): Current recursion depth (bounded by ``_MAX_DEPTH``).

    Returns:
        Any: The evaluated Python value.

    Raises:
        ValueError: For any node type or name outside the whitelist (the
            message is surfaced as the assertion's ``error`` field).
        NameError: When a name is not present in ``context``.
    """
    if depth > _MAX_DEPTH:
        raise ValueError("assertion expression is nested too deeply")
    if isinstance(node, ast.Expression):
        return _eval_ast(node.body, context, depth + 1)
    if isinstance(node, ast.Constant):
        value = node.value
        # Only inert JSON-like literals are allowed; complex/ellipsis/etc are
        # irrelevant here and widen the surface, so reject them.
        if not isinstance(value, (str, bytes, bool, int, float, type(None))):
            raise ValueError("unsupported constant type")
        if isinstance(value, int) and not isinstance(value, bool) and abs(value) > _MAX_INT_MAGNITUDE:
            raise ValueError("integer constant is too large")
        return value
    if isinstance(node, ast.Name):
        name = node.id
        if name.startswith("__"):
            raise ValueError("dunder names are not allowed")
        if name not in context:
            raise NameError(f"name {name!r} is not defined")
        return context[name]
    if isinstance(node, ast.BoolOp):
        is_and = isinstance(node.op, ast.And)
        result = None
        for value_node in node.values:
            result = _eval_ast(value_node, context, depth + 1)
            # Preserve Python's short-circuit/operand semantics.
            if is_and and not result:
                return result
            if not is_and and result:
                return result
        return result
    if isinstance(node, ast.UnaryOp):
        fn = _ALLOWED_UNARYOPS.get(type(node.op))
        if fn is None:
            raise ValueError("unsupported unary operator")
        return fn(_eval_ast(node.operand, context, depth + 1))
    if isinstance(node, ast.BinOp):
        fn = _ALLOWED_BINOPS.get(type(node.op))
        if fn is None:
            # Notably `**` (Pow) is excluded: it is a cheap CPU/memory DoS.
            raise ValueError("unsupported binary operator")
        return fn(_eval_ast(node.left, context, depth + 1),
                  _eval_ast(node.right, context, depth + 1))
    if isinstance(node, ast.Compare):
        left = _eval_ast(node.left, context, depth + 1)
        for op, comparator in zip(node.ops, node.comparators):
            fn = _ALLOWED_CMPOPS.get(type(op))
            if fn is None:
                raise ValueError("unsupported comparison operator")
            right = _eval_ast(comparator, context, depth + 1)
            if not fn(left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.IfExp):
        return (_eval_ast(node.body, context, depth + 1) if _eval_ast(node.test, context, depth + 1)
                else _eval_ast(node.orelse, context, depth + 1))
    if isinstance(node, ast.Tuple):
        return tuple(_eval_ast(elt, context, depth + 1) for elt in node.elts)
    if isinstance(node, ast.List):
        return [_eval_ast(elt, context, depth + 1) for elt in node.elts]
    if isinstance(node, ast.Set):
        return {_eval_ast(elt, context, depth + 1) for elt in node.elts}
    if isinstance(node, ast.Dict):
        return {
            _eval_ast(key, context, depth + 1): _eval_ast(value, context, depth + 1)
            for key, value in zip(node.keys, node.values)
        }
    if isinstance(node, ast.Call):
        # Only direct calls to the pure-function allowlist; no attribute calls
        # (`obj.method()`), no keywords, no *args.
        if not isinstance(node.func, ast.Name):
            raise ValueError("only allowlisted function calls are permitted")
        fn = _ALLOWED_FUNCS.get(node.func.id)
        if fn is None:
            raise ValueError(f"function {node.func.id!r} is not allowed")
        if node.keywords:
            raise ValueError("keyword arguments are not allowed")
        return fn(*[_eval_ast(arg, context, depth + 1) for arg in node.args])
    # Attribute access / subscripts / comprehensions / lambdas / walrus all land
    # here: they are deliberately unsupported.
    raise ValueError(f"unsupported expression element: {type(node).__name__}")


def _safe_eval(expr, context):
    """Evaluates an assertion expression inside the restricted sandbox.

    Args:
        expr (str): Python-like comparison/boolean expression.
        context (dict): Values the expression may reference by name.

    Returns:
        Any: The evaluated result.

    Raises:
        ValueError: If the expression is malformed, too long/deep, or uses a
            construct outside the whitelist.
        NameError: If a referenced name is missing from ``context``.
    """
    if not isinstance(expr, str):
        raise ValueError("assertion expression must be a string")
    if len(expr) > _MAX_EXPR_LEN:
        raise ValueError("assertion expression is too long")
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as e:
        raise ValueError(f"invalid assertion expression: {e.msg}")
    return _eval_ast(tree, context)


class VerificationEngine(BaseEngine):
    name = "verification"
    layer = "quality"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._lock = asyncio.Lock()

    async def start(self):
        await super().start()
        self.bus.subscribe("verification.*", self._on)

    async def _on(self, ev):
        pass

    def check_assertions(self, assertions):
        """Checks caller-supplied assertions inside the restricted evaluator.

        Args:
            assertions: List of ``{"expr": str, "context": dict}`` objects.

        Returns:
            list: One ``{"expr", "passed", "error"}`` dict per assertion; an
            unsupported or malformed expression is reported as a failed check
            instead of raising.
        """
        results = []
        # Assertions arrive from the UI; accept only a list of dicts.  Iterating
        # a bare string/dict produced AttributeError on `.get` and crashed the
        # engine instead of reporting per-assertion failures.
        if not isinstance(assertions, (list, tuple)):
            assertions = [] if assertions is None else [assertions]
        for a in assertions:
            if not isinstance(a, dict):
                results.append({"expr": str(a), "passed": False, "error": "assertion must be an object"})
                continue
            # assertion: {"expr": python expr string, "context": dict}
            context = a.get("context")
            if not isinstance(context, dict):
                context = {}
            try:
                # SECURITY: never use eval() here; see the module docstring.
                ok = bool(_safe_eval(a.get("expr", "False"), context))
            except Exception as e:
                ok = False
                err = str(e)
            else:
                err = None
            results.append({"expr": a.get("expr"), "passed": ok, "error": err})
        return results

    def verify_result(self, result, expected=None, evidence=None):
        checks = []
        # presence
        checks.append({"name": "result_present", "passed": result is not None})
        if expected is not None:
            checks.append({"name": "matches_expected", "passed": result == expected})
        if evidence:
            # Boolean check only: `len(evidence)` raised TypeError when the UI
            # sent a non-sized truthy value (e.g. a number).
            checks.append({"name": "evidence_present", "passed": True})
        passed = all(c["passed"] for c in checks)
        return {"passed": passed, "checks": checks}

    def consistency_check(self, values):
        # all values equal?
        if not isinstance(values, (list, tuple, set)):
            values = [] if values is None else [values]
        if not values:
            return {"consistent": True, "unique": 0}
        uniq = set(str(v) for v in values)
        return {"consistent": len(uniq) == 1, "unique": len(uniq), "count": len(values)}

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "verify"}
        action = payload.get("action", "verify")
        if action == "assertions":
            res = self.check_assertions(payload.get("assertions", []))
            passed = all(r["passed"] for r in res)
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "pass" if passed else "fail",
                    "results": res, "passed": passed}
        if action == "verify_result":
            r = self.verify_result(payload.get("result"), payload.get("expected"), payload.get("evidence"))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "pass" if r["passed"] else "fail", **r}
        if action == "consistency":
            r = self.consistency_check(payload.get("values", []))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "pass" if r["consistent"] else "fail", **r}
        # default: verify payload result
        r = self.verify_result(payload.get("result"), payload.get("expected"), payload.get("evidence"))
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "pass" if r["passed"] else "fail", **r}

    async def get_state(self):
        return {"name": self.name}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
