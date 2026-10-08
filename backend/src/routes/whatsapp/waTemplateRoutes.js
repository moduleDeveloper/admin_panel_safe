import { Router } from 'express';
import { getWaTemplatesHandler, saveWaTemplateHandler } from '../../controllers/whatsapp/waTemplateController.js';

const router = Router();

router.get('/:trustId', getWaTemplatesHandler);
router.post('/', saveWaTemplateHandler);

export default router;
