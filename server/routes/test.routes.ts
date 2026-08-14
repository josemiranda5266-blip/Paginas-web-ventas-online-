/**
 * Automated Test Runner API Route
 * Expone endpoint /api/tests/run para ejecutar las 36 pruebas automatizadas con reporte JSON detallado.
 */

import { Router, Request, Response } from 'express';
import { runCompleteTestSuite } from '../tests/suite.ts';

export const testRouter = Router();

testRouter.get('/run', async (_req: Request, res: Response): Promise<void> => {
  try {
    const report = await runCompleteTestSuite();
    res.json({
      success: true,
      data: report,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error ejecutando suite de pruebas';
    res.status(500).json({ success: false, error: { code: 'TEST_SUITE_ERROR', message } });
  }
});
