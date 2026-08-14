/**
 * Test Runner CLI Execution
 */

import { runCompleteTestSuite } from './suite.ts';

async function main() {
  console.log('\n=============================================================');
  console.log('  PAGINAS WEB VENTAS ONLINE - AUTOMATED TEST SUITE (36 TESTS)');
  console.log('=============================================================\n');

  try {
    const summary = await runCompleteTestSuite();

    for (const r of summary.results) {
      const statusIcon = r.passed ? '✅ PASSED' : '❌ FAILED';
      const duration = `(${r.durationMs}ms)`;
      console.log(`[Test #${String(r.id).padStart(2, '0')}] ${statusIcon} [${r.category}] ${r.name} ${duration}`);
      if (!r.passed && r.error) {
        console.error(`       ↳ Error: ${r.error}`);
      }
    }

    console.log('\n-------------------------------------------------------------');
    console.log(`  RESUMEN: Total: ${summary.total} | Pasaron: ${summary.passed} | Fallaron: ${summary.failed}`);
    console.log('=============================================================\n');

    if (summary.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (e) {
    console.error('Fallo ejecutando la suite de tests:', e);
    process.exit(1);
  }
}

main();
