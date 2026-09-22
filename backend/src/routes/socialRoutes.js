import { Router } from 'express';
import { getSocialAccountsHandler, postToSocialHandler } from '../controllers/socialController.js';

const router = Router();

router.get('/accounts/:trustId', getSocialAccountsHandler);
router.post('/post', postToSocialHandler);

export default router;
