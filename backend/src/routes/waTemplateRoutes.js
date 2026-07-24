import { Router } from 'express';
import { getWaTemplatesHandler, saveWaTemplateHandler } from '../controllers/waTemplateController.js';

const router = Router();

router.get('/:trustId', getWaTemplatesHandler);
router.post('/', saveWaTemplateHandler);

export default router;
