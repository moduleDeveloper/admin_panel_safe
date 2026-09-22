import { Router } from 'express';
import {
  getChatHistoryHandler,
  getLeadsHandler,
  getMemberMatchHandler,
  manageMktDataHandler,
  getTrustOwnerDetailsHandler,
  getTrustMemberMatchHandler,
  searchMktDataHandler,
} from '../controllers/leadsController.js';

const router = Router();

router.get('/:trustId/member-match', getMemberMatchHandler);
router.get('/:trustId/trust-member-match', getTrustMemberMatchHandler);
router.get('/:trustId/trust-owner-details', getTrustOwnerDetailsHandler);
router.get('/:trustId/chat-history', getChatHistoryHandler);
router.post('/mkt-data/search', searchMktDataHandler);
router.post('/mkt-data/manage', manageMktDataHandler);
router.get('/:trustId', getLeadsHandler);

export default router;
