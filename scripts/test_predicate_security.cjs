/**
 * @file scripts/test_predicate_security.cjs
 * @description Comprehensive automated security and safety battery for the restricted predicate evaluator.
 */

const { defaultTaskVerificationEngine } = require('../lib/orchestration/taskVerificationEngine.ts');
const assert = require('assert');

console.log('Testing pure AST/Regex safe restricted predicate evaluator...');

const makeTask = (expr) => ({
  id: 'test_task',
  title: 'Predicate test',
  status: 'READY',
  acceptanceCriteria: [{ id: 'c1', description: 'test', evaluator: 'CUSTOM_PREDICATE', expectedValue: expr }],
  deliverables: []
});

// 1. Safe simple comparison (passed)
const r1 = defaultTaskVerificationEngine.verifyTask(makeTask('output.count > 5'), { count: 10 });
assert.strictEqual(r1.isVerified, true, 'output.count > 5 should pass for 10');

// 2. Safe simple comparison (failed)
const r2 = defaultTaskVerificationEngine.verifyTask(makeTask('output.count > 5'), { count: 3 });
assert.strictEqual(r2.isVerified, false, 'output.count > 5 should fail for 3');

// 3. Safe equality check
const r3 = defaultTaskVerificationEngine.verifyTask(makeTask('output.success === true'), { success: true });
assert.strictEqual(r3.isVerified, true, 'output.success === true should pass');

// 4. Malicious: process.exit(1)
const r4 = defaultTaskVerificationEngine.verifyTask(makeTask('process.exit(1)'), { success: true });
assert.strictEqual(r4.isVerified, false, 'process.exit(1) must be rejected');

// 5. Malicious: require('fs')
const r5 = defaultTaskVerificationEngine.verifyTask(makeTask("require('fs')"), { success: true });
assert.strictEqual(r5.isVerified, false, 'require must be rejected');

// 6. Malicious: output.constructor
const r6 = defaultTaskVerificationEngine.verifyTask(makeTask('output.constructor'), { success: true });
assert.strictEqual(r6.isVerified, false, 'constructor must be rejected');

// 7. Malicious: output.__proto__
const r7 = defaultTaskVerificationEngine.verifyTask(makeTask('output.__proto__'), { success: true });
assert.strictEqual(r7.isVerified, false, '__proto__ must be rejected');

// 8. Malicious: global.process
const r8 = defaultTaskVerificationEngine.verifyTask(makeTask('global.process'), { success: true });
assert.strictEqual(r8.isVerified, false, 'global must be rejected');

// 9. Malicious: Function call attempt
const r9 = defaultTaskVerificationEngine.verifyTask(makeTask('output.run()'), { success: true });
assert.strictEqual(r9.isVerified, false, 'Function call must be rejected');

// 10. Long expression rejection (>256 chars)
const longExpr = 'output.a > ' + '9'.repeat(300);
const r10 = defaultTaskVerificationEngine.verifyTask(makeTask(longExpr), { a: 1 });
assert.strictEqual(r10.isVerified, false, 'Long expression must be rejected');

console.log('ALL PREDICATE SECURITY TESTS PASSED PERFECTLY (Zero eval, Zero new Function)!');
